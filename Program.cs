using System.Globalization;
using HoursLoggedNotifier.Models;
using HoursLoggedNotifier.Services;

var storage = new ShiftStorageService();
var emailService = new EmailService();
var notifier = new NotificationService();

PrintHeader();

Console.WriteLine(emailService.IsConfigured
    ? $"Email reminders: ON (every {emailService.ReminderIntervalMinutes} min)"
    : "Email reminders: OFF - add your Outlook app password to appsettings.json to enable later.");
Console.WriteLine($"Desktop notifications: ON (every {emailService.ReminderIntervalMinutes} min)");
Console.WriteLine($"Office attendance target: {emailService.RequiredOfficeDaysPerWeek} day(s)/week\n");

StartReminderLoop(storage, emailService, notifier);

var running = true;
while (running)
{
    Console.WriteLine("Paste your shift + biometric block below (or type: today / history / week / wfh / testemail / testnotify / exit)");
    Console.Write("> ");
    var firstLine = Console.ReadLine();
    if (firstLine is null) break;

    var command = firstLine.Trim().ToLowerInvariant();
    switch (command)
    {
        case "":
            continue;
        case "today":
        case "2":
            ViewToday(storage, emailService);
            continue;
        case "history":
        case "3":
            ViewHistory(storage);
            continue;
        case "week":
        case "attendance":
            ViewWeek(storage, emailService);
            continue;
        case "wfh":
            LogWfhDay(storage, emailService);
            continue;
        case "testemail":
            SendTestEmail(emailService);
            continue;
        case "testnotify":
            SendTestNotify(storage, emailService, notifier);
            continue;
        case "exit":
        case "4":
        case "quit":
            running = false;
            continue;
    }

    ProcessPastedShift(storage, emailService, firstLine);
}

notifier.Dispose();
Console.WriteLine("Goodbye!");
return;

static void StartReminderLoop(ShiftStorageService storage, EmailService emailService, NotificationService notifier)
{
    _ = Task.Run(async () =>
    {
        while (true)
        {
            await Task.Delay(TimeSpan.FromMinutes(emailService.ReminderIntervalMinutes));
            SendReminderIfDue(storage, emailService, notifier);
        }
    });
}

static void SendReminderIfDue(ShiftStorageService storage, EmailService emailService, NotificationService notifier)
{
    var today = DateTime.Now.ToString("d MMM", CultureInfo.InvariantCulture);
    var shift = storage.GetByDate(today);
    if (shift is null || shift.IsWfh) return;

    var now = TimeOnly.FromDateTime(DateTime.Now);
    if (now.ToTimeSpan() >= shift.Exit100.ToTimeSpan()) return;

    var body = BuildReminderBody(shift, storage, emailService);
    notifier.Show($"Exit Time Reminder - {shift.Date}", body);
    Console.WriteLine($"\n[Desktop notification sent at {DateTime.Now:h:mm:ss tt}]");

    if (emailService.IsConfigured)
    {
        try
        {
            emailService.Send($"Exit Time Reminder - {shift.Date}", body);
            Console.WriteLine($"[Reminder email sent at {DateTime.Now:h:mm:ss tt}]");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[Failed to send reminder email: {ex.Message}]");
        }
    }
}

static string BuildReminderBody(ShiftRecord shift, ShiftStorageService storage, EmailService emailService)
{
    var spent = ShiftCalculationService.GetTimeSpent(shift);
    var left95 = ShiftCalculationService.GetTimeLeft(shift, shift.Exit95);
    var left100 = ShiftCalculationService.GetTimeLeft(shift, shift.Exit100);

    var lines = new List<string> { $"Time spent so far: {ShiftCalculationService.FormatDuration(spent)}" };

    lines.Add(left95 > TimeSpan.Zero
        ? $"Time left (95%): {ShiftCalculationService.FormatDuration(left95)} (exit at {shift.Exit95:h:mm:ss tt})"
        : "95% exit time has passed.");

    lines.Add(left100 > TimeSpan.Zero
        ? $"Time left (100%): {ShiftCalculationService.FormatDuration(left100)} (exit at {shift.Exit100:h:mm:ss tt})"
        : "100% exit time has passed.");

    lines.Add(AttendanceReportService.FormatWeekSummary(storage.LoadAll(), emailService.RequiredOfficeDaysPerWeek));
    lines.Add(AttendanceReportService.FormatWeeklyHoursSummary(storage.LoadAll(), emailService.DailyHourGoal));

    return string.Join("\n", lines);
}

static void SendTestNotify(ShiftStorageService storage, EmailService emailService, NotificationService notifier)
{
    var today = DateTime.Now.ToString("d MMM", CultureInfo.InvariantCulture);
    var shift = storage.GetByDate(today);

    if (shift is null || shift.IsWfh)
    {
        notifier.Show("Test Notification - Hours Logged Notifier", "This is a test notification. Setup is working.\n(No office shift recorded today, so this is placeholder text.)");
        Console.WriteLine("\nTest notification sent (no office shift recorded today).\n");
        return;
    }

    var body = BuildReminderBody(shift, storage, emailService);
    notifier.Show($"Exit Time Reminder - {shift.Date}", body);
    Console.WriteLine("\nTest notification sent with today's real shift data:");
    Console.WriteLine(body + "\n");
}

static void SendTestEmail(EmailService emailService)
{
    if (!emailService.IsConfigured)
    {
        Console.WriteLine("\nEmail is not configured. Add your Outlook app password to appsettings.json first.\n");
        return;
    }

    try
    {
        emailService.Send("Test Email - Hours Logged Notifier", "This is a test email from Hours Logged Notifier. Setup is working.");
        Console.WriteLine("\nTest email sent successfully.\n");
    }
    catch (Exception ex)
    {
        Console.WriteLine($"\nFailed to send test email: {ex.Message}\n");
    }
}

static void PrintHeader()
{
    Console.WriteLine("==========================================");
    Console.WriteLine("  HOURS LOGGED NOTIFIER - STARTING...");
    Console.WriteLine("==========================================\n");
}

static void ProcessPastedShift(ShiftStorageService storage, EmailService emailService, string firstLine)
{
    var lines = ReadPasteBlock(firstLine);

    if (!AttendanceParser.TryParse(lines, out var parsed, out var error))
    {
        Console.WriteLine($"\n{error}\n");
        return;
    }

    var shift = ShiftCalculationService.Calculate(parsed.Date, parsed.ShiftStart, parsed.ShiftEnd, parsed.EntryTime, parsed.Location, parsed.ActualExitTime);
    shift.IsWfh = parsed.IsWfh;
    storage.Save(shift);

    PrintShiftSummary(shift, storage, emailService);
    if (!string.IsNullOrEmpty(parsed.Status))
        Console.WriteLine($"(Portal status: {parsed.Status})\n");
}

static List<string> ReadPasteBlock(string firstLine)
{
    var lines = new List<string>();

    if (firstLine.Trim().Length > 0)
    {
        lines.Add(firstLine);
        if (AttendanceParser.HasRequiredFields(lines) && AttendanceParser.IsLikelyStatusLine(firstLine))
            return lines;
    }

    var blankStreak = 0;
    while (lines.Count < 25)
    {
        var line = Console.ReadLine();
        if (line is null) break;

        if (line.Trim().Length == 0)
        {
            blankStreak++;
            if (AttendanceParser.HasRequiredFields(lines) || blankStreak >= 2) break;
            continue;
        }

        blankStreak = 0;
        lines.Add(line);

        if (AttendanceParser.HasRequiredFields(lines) && AttendanceParser.IsLikelyStatusLine(line))
            break;
    }

    return lines;
}

static void LogWfhDay(ShiftStorageService storage, EmailService emailService)
{
    var todayDisplay = DateTime.Now.ToString("d MMM", CultureInfo.InvariantCulture);
    var existing = storage.GetByDate(todayDisplay);

    if (existing is not null)
    {
        Console.WriteLine($"\n{todayDisplay} is already logged as {(existing.IsWfh ? "WFH" : "an office day")}.\n");
        return;
    }

    storage.Save(new ShiftRecord
    {
        Date = todayDisplay,
        FullDate = DateOnly.FromDateTime(DateTime.Now),
        IsWfh = true
    });

    Console.WriteLine($"\n{todayDisplay} logged as WFH.");
    Console.WriteLine(AttendanceReportService.FormatWeekSummary(storage.LoadAll(), emailService.RequiredOfficeDaysPerWeek));
    Console.WriteLine(AttendanceReportService.FormatWeeklyHoursSummary(storage.LoadAll(), emailService.DailyHourGoal));
    Console.WriteLine();
}

static void ViewWeek(ShiftStorageService storage, EmailService emailService)
{
    var all = storage.LoadAll();
    Console.WriteLine();
    Console.WriteLine(AttendanceReportService.FormatDayWiseLog(all));
    Console.WriteLine(AttendanceReportService.FormatWeekSummary(all, emailService.RequiredOfficeDaysPerWeek));
    Console.WriteLine(AttendanceReportService.FormatWeeklyHoursSummary(all, emailService.DailyHourGoal));
    Console.WriteLine();
}

static void ViewToday(ShiftStorageService storage, EmailService emailService)
{
    var today = DateTime.Now.ToString("d MMM", CultureInfo.InvariantCulture);
    var shift = storage.GetByDate(today);

    Console.WriteLine();
    if (shift is null)
    {
        Console.WriteLine($"No shift recorded yet for today ({today}).\n");
        return;
    }

    if (shift.IsWfh)
    {
        Console.WriteLine($"{shift.Date}: logged as WFH.");
        Console.WriteLine(AttendanceReportService.FormatWeekSummary(storage.LoadAll(), emailService.RequiredOfficeDaysPerWeek));
        Console.WriteLine(AttendanceReportService.FormatWeeklyHoursSummary(storage.LoadAll(), emailService.DailyHourGoal));
        Console.WriteLine();
        return;
    }

    PrintShiftSummary(shift, storage, emailService);
}

static void ViewHistory(ShiftStorageService storage)
{
    var all = storage.LoadAll();
    Console.WriteLine();

    if (all.Count == 0)
    {
        Console.WriteLine("No shift history yet.\n");
        return;
    }

    foreach (var shift in all.TakeLast(10))
    {
        if (shift.IsWfh)
        {
            Console.WriteLine($"{shift.Date}: WFH");
            continue;
        }

        var loc = string.IsNullOrEmpty(shift.Location) ? "" : $" [{shift.Location}]";
        Console.WriteLine($"{shift.Date}{loc}: Entry {shift.EntryTime:h:mm:ss tt} -> 95% {shift.Exit95:h:mm:ss tt} / 100% {shift.Exit100:h:mm:ss tt}");
    }
    Console.WriteLine();
}

static void PrintShiftSummary(ShiftRecord shift, ShiftStorageService storage, EmailService emailService)
{
    var spent = ShiftCalculationService.GetTimeSpent(shift);
    var left95 = ShiftCalculationService.GetTimeLeft(shift, shift.Exit95);
    var left100 = ShiftCalculationService.GetTimeLeft(shift, shift.Exit100);

    Console.WriteLine();
    Console.WriteLine("========================================");
    Console.WriteLine($"      SHIFT SUMMARY - {shift.Date}");
    Console.WriteLine("========================================");
    if (!string.IsNullOrEmpty(shift.Location))
        Console.WriteLine($"Location:        {shift.Location}");
    Console.WriteLine($"Entry Time:      {shift.EntryTime:h:mm:ss tt}");
    Console.WriteLine($"Exit (95%):      {shift.Exit95:h:mm:ss tt}");
    Console.WriteLine($"Exit (100%):     {shift.Exit100:h:mm:ss tt}");
    Console.WriteLine($"Status:          {ShiftCalculationService.GetEntryStatus(shift)}");
    Console.WriteLine("----------------------------------------");
    Console.WriteLine($"Time Spent So Far:  {ShiftCalculationService.FormatDuration(spent)}");
    Console.WriteLine(left95 > TimeSpan.Zero
        ? $"Time Left (95%):    {ShiftCalculationService.FormatDuration(left95)}"
        : "Time Left (95%):    reached");
    Console.WriteLine(left100 > TimeSpan.Zero
        ? $"Time Left (100%):   {ShiftCalculationService.FormatDuration(left100)}"
        : "Time Left (100%):   reached");
    Console.WriteLine("----------------------------------------");
    Console.WriteLine(AttendanceReportService.FormatWeekSummary(storage.LoadAll(), emailService.RequiredOfficeDaysPerWeek));
    Console.WriteLine(AttendanceReportService.FormatWeeklyHoursSummary(storage.LoadAll(), emailService.DailyHourGoal));
    Console.WriteLine("========================================\n");
}
