using HoursLoggedNotifier.Models;
using HoursLoggedNotifier.Services;

var storage = new ShiftStorageService();
var emailService = new EmailService();
var notifier = new NotificationService();

PrintHeader();

Console.WriteLine(emailService.IsConfigured
    ? $"Email reminders: ON (every {emailService.ReminderIntervalMinutes} min)"
    : "Email reminders: OFF - add your Outlook app password to appsettings.json to enable later.");
Console.WriteLine(notifier.IsDesktopNotification
    ? $"Desktop notifications: ON via {notifier.Description} (every {emailService.ReminderIntervalMinutes} min)"
    : $"Desktop notifications: {notifier.Description} (every {emailService.ReminderIntervalMinutes} min)");
Console.WriteLine($"Office attendance target: {emailService.RequiredOfficeDaysPerWeek} day(s)/week\n");

StartReminderLoop(storage, emailService, notifier);

var running = true;
while (running)
{
    Console.WriteLine("Paste your shift + biometric block below (or type: ui / logout / edit / widget / bar / vbar / today / history / week / wfh / interval / testemail / testnotify / exit)");
    Console.Write("> ");
    var firstLine = Console.ReadLine();
    if (firstLine is null) break;

    var trimmed = firstLine.Trim();
    // Commands may carry one argument, e.g. "wfh 7.5".
    var spaceAt = trimmed.IndexOf(' ');
    var command = (spaceAt < 0 ? trimmed : trimmed[..spaceAt]).ToLowerInvariant();
    var argument = spaceAt < 0 ? null : trimmed[(spaceAt + 1)..].Trim();

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
            LogWfhDay(storage, emailService, argument);
            continue;
        case "interval":
        case "settime":
            SetReminderInterval(emailService);
            continue;
        case "testemail":
            SendTestEmail(emailService);
            continue;
        case "testnotify":
            SendTestNotify(storage, emailService, notifier);
            continue;
        case "ui":
        case "dashboard":
        case "live":
            ShowDashboard(storage, emailService, notifier);
            continue;
        case "widget":
        case "ring":
        case "float":
            ShowFloatingWidget(storage, emailService, notifier);
            continue;
        case "logout":
        case "out":
        case "signoff":
            LogOut(storage, emailService, argument);
            continue;
        case "edit":
        case "correct":
        case "fix":
            EditDay(storage, emailService, argument);
            continue;
        case "bar":
            ShowFloatingBar(storage, emailService, notifier, vertical: false);
            continue;
        case "vbar":
        case "line":
            ShowFloatingBar(storage, emailService, notifier, vertical: true);
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
    var shift = storage.GetToday();
    if (shift is null) return;

    // A day at home has no clock running down, so it used to be skipped
    // entirely and every WFH day passed in silence. It gets one confirmation
    // instead - the credit and where the week stands - rather than a countdown
    // repeated all afternoon.
    if (shift.IsWfh)
    {
        AnnounceWfhIfDue(shift, storage, emailService, notifier);
        return;
    }

    // Signed off for the day - nothing left to remind about.
    if (ShiftCalculationService.IsClockedOut(shift)) return;

    var spent = ShiftCalculationService.GetTimeSpent(shift);

    // The "you're done" notice takes this slot, so the two never fire together.
    if (AnnounceCompletionIfDue(shift, spent, emailService, notifier)) return;

    var now = TimeOnly.FromDateTime(DateTime.Now);
    if (now.ToTimeSpan() >= shift.Exit100.ToTimeSpan()) return;

    var body = BuildReminderBody(shift, storage, emailService);
    notifier.Show($"Time Logged Update - {shift.Date}", body);
    // The live dashboard owns the screen while it's open, so don't scribble over it.
    if (!Dashboard.IsActive)
        Console.WriteLine($"\n[Desktop notification sent at {DateTime.Now:h:mm:ss tt}] - {ShiftCalculationService.FormatDuration(spent)} logged");

    if (emailService.IsConfigured)
    {
        try
        {
            emailService.Send($"Time Logged Update - {shift.Date}", body);
            Console.WriteLine($"[Reminder email sent at {DateTime.Now:h:mm:ss tt}]");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[Failed to send reminder email: {ex.Message}]");
        }
    }
}

/// <summary>
/// One notice per day that a home day is recorded and what it credits. There is
/// no entry time to count from, so repeating it every interval would be noise.
/// </summary>
static void AnnounceWfhIfDue(ShiftRecord shift, ShiftStorageService storage, EmailService emailService, NotificationService notifier)
{
    if (WfhNotice.AnnouncedFor == shift.FullDate) return;
    WfhNotice.AnnouncedFor = shift.FullDate;

    var credited = AttendanceReportService.GetWfhCredit(shift, emailService.DailyHourGoal);
    var all = storage.LoadAll();

    var body = string.Join("\n", new[]
    {
        $"Working from home - {ShiftCalculationService.FormatDuration(credited)} credited" +
            (shift.WfhHours.HasValue ? "." : " (default - change it with e.g. 'wfh 7.5')."),
        AttendanceReportService.FormatOfficeTargetSummary(all, emailService.RequiredOfficeDaysPerWeek, emailService.DailyHourGoal),
        AttendanceReportService.FormatWeeklyHoursSummary(all, emailService.DailyHourGoal)
    });

    notifier.Show($"Working From Home - {shift.Date}", body);
    if (!Dashboard.IsActive)
        Console.WriteLine($"\n[WFH notification sent at {DateTime.Now:h:mm:ss tt}] - {ShiftCalculationService.FormatDuration(credited)} credited");

    if (emailService.IsConfigured)
    {
        try
        {
            emailService.Send($"Working From Home - {shift.Date}", body);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[WFH email failed: {ex.Message}]");
        }
    }
}

/// <summary>
/// Fires once a day, the first time the 95% exit time or the daily hour goal is reached.
/// Returns true when it sent something, so the caller skips the ordinary reminder.
/// </summary>
static bool AnnounceCompletionIfDue(ShiftRecord shift, TimeSpan spent, EmailService emailService, NotificationService notifier)
{
    if (CompletionNotice.AnnouncedFor == shift.FullDate) return false;

    var now = TimeOnly.FromDateTime(DateTime.Now);
    var reached95 = now.ToTimeSpan() >= shift.Exit95.ToTimeSpan();
    var reachedGoal = spent >= emailService.DailyHourGoal;

    if (!reached95 && !reachedGoal) return false;

    CompletionNotice.AnnouncedFor = shift.FullDate;

    var reason = reached95
        ? $"95% of your shift is done (exit time {shift.Exit95:h:mm:ss tt})."
        : $"You've hit the {ShiftCalculationService.FormatDuration(emailService.DailyHourGoal)} daily goal.";

    var body = string.Join("\n", new[]
    {
        $"Hours completed: {ShiftCalculationService.FormatDuration(spent)}",
        reason,
        $"Full 100% exit time is {shift.Exit100:h:mm:ss tt}."
    });

    notifier.Show($"Hours Completed - {shift.Date}", body);
    Console.WriteLine($"\n[Completion notification sent at {DateTime.Now:h:mm:ss tt}] - {ShiftCalculationService.FormatDuration(spent)} completed");
    Console.WriteLine(reason);

    if (emailService.IsConfigured)
    {
        try
        {
            emailService.Send($"Hours Completed - {shift.Date}", body);
            Console.WriteLine($"[Completion email sent at {DateTime.Now:h:mm:ss tt}]");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[Failed to send completion email: {ex.Message}]");
        }
    }

    return true;
}

static string BuildReminderBody(ShiftRecord shift, ShiftStorageService storage, EmailService emailService)
{
    var spent = ShiftCalculationService.GetTimeSpent(shift);
    var left95 = ShiftCalculationService.GetTimeLeft(shift, shift.Exit95);
    var left100 = ShiftCalculationService.GetTimeLeft(shift, shift.Exit100);

    var lines = new List<string> { $"Time spent so far: {ShiftCalculationService.FormatDuration(spent)}" };

    // The reminder knew whether the morning ran late and never said so.
    var late = shift.EntryTime.ToTimeSpan() - shift.ShiftStart.ToTimeSpan();
    lines.Add(late > TimeSpan.FromMinutes(1)
        ? $"Logged in {ShiftCalculationService.FormatDuration(late)} late ({shift.EntryTime:h:mm:ss tt} against {shift.ShiftStart:h:mm tt})."
        : $"Logged in on time at {shift.EntryTime:h:mm:ss tt}.");

    lines.Add(left95 > TimeSpan.Zero
        ? $"Time left (95%): {ShiftCalculationService.FormatDuration(left95)} (exit at {shift.Exit95:h:mm:ss tt})"
        : "95% exit time has passed.");

    lines.Add(left100 > TimeSpan.Zero
        ? $"Time left (100%): {ShiftCalculationService.FormatDuration(left100)} (exit at {shift.Exit100:h:mm:ss tt})"
        : "100% exit time has passed.");

    var all = storage.LoadAll();
    lines.Add(AttendanceReportService.FormatOfficeHoursSummary(all));
    lines.Add(AttendanceReportService.FormatOfficeTargetSummary(all, emailService.RequiredOfficeDaysPerWeek, emailService.DailyHourGoal));
    lines.Add(AttendanceReportService.FormatWeekSummary(all, emailService.RequiredOfficeDaysPerWeek));
    lines.Add(AttendanceReportService.FormatWeeklyHoursSummary(all, emailService.DailyHourGoal));

    return string.Join("\n", lines);
}

static void SetReminderInterval(EmailService emailService)
{
    Console.WriteLine($"\nCurrent reminder interval: {emailService.ReminderIntervalMinutes} min");
    Console.WriteLine("Choose a new interval:");
    Console.WriteLine("1) 5 minutes");
    Console.WriteLine("2) 15 minutes");
    Console.WriteLine("3) 30 minutes");
    Console.WriteLine("4) 60 minutes");
    Console.WriteLine("5) Custom");
    Console.Write("> ");

    var choice = Console.ReadLine()?.Trim();
    int? minutes = choice switch
    {
        "1" => 5,
        "2" => 15,
        "3" => 30,
        "4" => 60,
        "5" => PromptCustomIntervalMinutes(),
        _ => null
    };

    if (minutes is null || minutes <= 0)
    {
        Console.WriteLine("Invalid choice - interval unchanged.\n");
        return;
    }

    emailService.UpdateReminderInterval(minutes.Value);
    Console.WriteLine($"Reminder interval set to {minutes} minute(s). Takes effect from the next reminder check and is saved for next time you run the app.\n");
}

static int? PromptCustomIntervalMinutes()
{
    Console.Write("Enter custom interval in minutes: ");
    var input = Console.ReadLine();
    return int.TryParse(input, out var minutes) && minutes > 0 ? minutes : null;
}

static void SendTestNotify(ShiftStorageService storage, EmailService emailService, NotificationService notifier)
{
    var shift = storage.GetToday();

    if (shift is null || shift.IsWfh)
    {
        notifier.Show("Test Notification - Hours Logged Notifier", "This is a test notification. Setup is working.\n(No office shift recorded today, so this is placeholder text.)");
        Console.WriteLine("\nTest notification sent (no office shift recorded today).\n");
        return;
    }

    var body = BuildReminderBody(shift, storage, emailService);
    notifier.Show($"Time Logged Update - {shift.Date}", body);
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

/// <summary>
/// Logs today as WFH, or changes the hours on a WFH day already logged.
/// "wfh" credits the daily goal; "wfh 7.5" credits 7.5 hours.
/// </summary>
static void LogWfhDay(ShiftStorageService storage, EmailService emailService, string? hoursArgument)
{
    var todayDate = ShiftCalculationService.Today;
    var todayDisplay = ShiftCalculationService.FormatDisplayDate(todayDate);
    var existing = storage.GetToday();

    double? hours = null;
    if (!string.IsNullOrWhiteSpace(hoursArgument))
    {
        if (!double.TryParse(hoursArgument, System.Globalization.NumberStyles.Float,
                System.Globalization.CultureInfo.InvariantCulture, out var parsed) || parsed <= 0 || parsed > 24)
        {
            Console.WriteLine($"\n'{hoursArgument}' isn't a number of hours between 0 and 24. Try: wfh 7.5\n");
            return;
        }
        hours = parsed;
    }

    if (existing is not null && !existing.IsWfh)
    {
        Console.WriteLine($"\n{todayDisplay} is already logged as an office day.\n");
        return;
    }

    var record = existing ?? new ShiftRecord
    {
        Date = todayDisplay,
        FullDate = todayDate,
        IsWfh = true
    };

    // Typing "wfh" again without a number leaves existing hours alone.
    if (hours.HasValue) record.WfhHours = hours;

    storage.Save(record);

    var credited = AttendanceReportService.GetWfhCredit(record, emailService.DailyHourGoal);
    var suffix = record.WfhHours.HasValue ? "" : " (default - change it with e.g. 'wfh 7.5')";

    Console.WriteLine(existing is null
        ? $"\n{todayDisplay} logged as WFH - {ShiftCalculationService.FormatDuration(credited)} credited.{suffix}"
        : $"\n{todayDisplay} updated - {ShiftCalculationService.FormatDuration(credited)} credited.{suffix}");

    var all = storage.LoadAll();
    Console.WriteLine(AttendanceReportService.FormatWeekSummary(all, emailService.RequiredOfficeDaysPerWeek));
    Console.WriteLine(AttendanceReportService.FormatOfficeTargetSummary(all, emailService.RequiredOfficeDaysPerWeek, emailService.DailyHourGoal));
    Console.WriteLine(AttendanceReportService.FormatWeeklyHoursSummary(all, emailService.DailyHourGoal));
    Console.WriteLine();
}

static void ViewWeek(ShiftStorageService storage, EmailService emailService)
{
    var all = storage.LoadAll();
    Console.WriteLine();
    Console.WriteLine(AttendanceReportService.FormatDayWiseLog(all, emailService.DailyHourGoal));
    Console.WriteLine(AttendanceReportService.FormatOfficeHoursSummary(all));
    Console.WriteLine(AttendanceReportService.FormatOfficeTargetSummary(all, emailService.RequiredOfficeDaysPerWeek, emailService.DailyHourGoal));
    Console.WriteLine(AttendanceReportService.FormatWeekSummary(all, emailService.RequiredOfficeDaysPerWeek));
    Console.WriteLine(AttendanceReportService.FormatWeeklyHoursSummary(all, emailService.DailyHourGoal));
    Console.WriteLine();
}

static void ViewToday(ShiftStorageService storage, EmailService emailService)
{
    var shift = storage.GetToday();

    Console.WriteLine();
    if (shift is null)
    {
        Console.WriteLine($"No shift recorded yet for today ({ShiftCalculationService.FormatDisplayDate(ShiftCalculationService.Today)}).\n");
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

    if (ShiftCalculationService.IsToday(shift))
    {
        var spent = ShiftCalculationService.GetTimeSpent(shift);
        var left95 = ShiftCalculationService.GetTimeLeft(shift, shift.Exit95);
        var left100 = ShiftCalculationService.GetTimeLeft(shift, shift.Exit100);

        Console.WriteLine($"Time Spent So Far:  {ShiftCalculationService.FormatDuration(spent)}");
        Console.WriteLine(left95 > TimeSpan.Zero
            ? $"Time Left (95%):    {ShiftCalculationService.FormatDuration(left95)}"
            : "Time Left (95%):    reached");
        Console.WriteLine(left100 > TimeSpan.Zero
            ? $"Time Left (100%):   {ShiftCalculationService.FormatDuration(left100)}"
            : "Time Left (100%):   reached");
    }
    else if (shift.ActualExitTime.HasValue)
    {
        var worked = ShiftCalculationService.GetActualHoursWorked(shift);
        Console.WriteLine($"Actual Exit Time:   {shift.ActualExitTime:h:mm:ss tt}");
        Console.WriteLine($"Hours Worked:       {ShiftCalculationService.FormatDuration(worked)} (day complete)");
    }
    else
    {
        Console.WriteLine("Day complete - no actual exit time was recorded.");
    }

    Console.WriteLine("----------------------------------------");
    var all = storage.LoadAll();
    Console.WriteLine(AttendanceReportService.FormatOfficeHoursSummary(all));
    Console.WriteLine(AttendanceReportService.FormatOfficeTargetSummary(all, emailService.RequiredOfficeDaysPerWeek, emailService.DailyHourGoal));
    Console.WriteLine(AttendanceReportService.FormatWeekSummary(all, emailService.RequiredOfficeDaysPerWeek));
    Console.WriteLine(AttendanceReportService.FormatWeeklyHoursSummary(all, emailService.DailyHourGoal));
    Console.WriteLine("========================================\n");
}

/// <summary>
/// A live status panel drawn in the existing console window - no extra process,
/// no new dependency, and nothing retained between redraws.
/// Repaints once a second until any key is pressed.
/// </summary>
static void ShowDashboard(ShiftStorageService storage, EmailService emailService, NotificationService notifier)
{
    // Prefer a real window where the platform has one. It reads its own frames,
    // so it keeps updating after this method returns and the prompt stays usable.
    if (notifier.TryShowDashboard(() => BuildSnapshot(storage, emailService)))
    {
        Console.WriteLine("\nDashboard window opened - it updates every second. Double-click the tray icon to bring it back.\n");
        return;
    }

    var shift = storage.GetToday();

    if (shift is null)
    {
        Console.WriteLine($"\nNo shift recorded yet for today ({ShiftCalculationService.FormatDisplayDate(ShiftCalculationService.Today)}) - paste your block first.\n");
        return;
    }

    if (shift.IsWfh)
    {
        Console.WriteLine($"\n{shift.Date} is logged as WFH, so there is no running clock to show.\n");
        return;
    }

    // A redirected console has no cursor to move and no key to read, so the
    // panel would scroll forever. Print one snapshot instead.
    if (Console.IsOutputRedirected || Console.IsInputRedirected)
    {
        foreach (var line in BuildDashboardLines(shift, storage, emailService))
            Console.WriteLine(line);
        return;
    }

    Dashboard.IsActive = true;
    var previousCursor = true;
    try
    {
        previousCursor = Console.CursorVisible;
        Console.CursorVisible = false;
    }
    catch (PlatformNotSupportedException) { /* not all terminals report this */ }

    try
    {
        Console.Clear();
        var painted = 0;

        while (true)
        {
            var lines = BuildDashboardLines(shift, storage, emailService);
            Console.SetCursorPosition(0, 0);

            var width = Math.Max(Console.WindowWidth - 1, 20);
            foreach (var line in lines)
            {
                var text = line.Length > width ? line[..width] : line;
                Console.WriteLine(text.PadRight(width));
            }

            // Wipe anything left over from a taller previous frame.
            for (var i = lines.Count; i < painted; i++)
                Console.WriteLine(new string(' ', width));

            painted = lines.Count;

            if (Console.KeyAvailable)
            {
                Console.ReadKey(intercept: true);
                break;
            }

            Thread.Sleep(1000);
        }
    }
    finally
    {
        Dashboard.IsActive = false;
        try { Console.CursorVisible = previousCursor; }
        catch (PlatformNotSupportedException) { }
        Console.Clear();
    }
}

/// <summary>
/// Opens the small always-on-top ring that floats over other windows.
/// Falls back to the console panel where the platform has no such widget.
/// </summary>
static void ShowFloatingWidget(ShiftStorageService storage, EmailService emailService, NotificationService notifier)
{
    if (notifier.TryShowFloatingWidget(() => BuildSnapshot(storage, emailService)))
    {
        Console.WriteLine("\nFloating ring opened - drag it anywhere, double-click it to close.\n");
        return;
    }

    Console.WriteLine("\nThis platform has no floating widget. Showing the console panel instead.");
    ShowDashboard(storage, emailService, notifier);
}

/// <summary>
/// Signs the day off. "logout" records the current time; "logout 7:05 PM"
/// records a specific one, for when you remember afterwards.
/// </summary>
static void LogOut(ShiftStorageService storage, EmailService emailService, string? timeArgument)
{
    var shift = storage.GetToday();

    if (shift is null)
    {
        Console.WriteLine("\nNo shift recorded today, so there is nothing to sign off.\n");
        return;
    }

    if (shift.IsWfh)
    {
        Console.WriteLine($"\n{shift.Date} is a WFH day - set its hours with 'wfh 8.5' instead.\n");
        return;
    }

    TimeOnly exit;
    if (string.IsNullOrWhiteSpace(timeArgument))
    {
        exit = TimeOnly.FromDateTime(DateTime.Now);
    }
    else if (!TimeOnly.TryParse(timeArgument, out exit))
    {
        Console.WriteLine($"\nCouldn't read '{timeArgument}' as a time. Try: logout 7:05 PM\n");
        return;
    }

    if (exit.ToTimeSpan() < shift.EntryTime.ToTimeSpan())
    {
        Console.WriteLine($"\nThat is before your entry at {shift.EntryTime:h:mm:ss tt}.\n");
        return;
    }

    var reopening = shift.ActualExitTime.HasValue;
    shift.ActualExitTime = exit;
    storage.Save(shift);

    var worked = ShiftCalculationService.GetActualHoursWorked(shift);
    Console.WriteLine(reopening
        ? $"\nExit time changed to {exit:h:mm:ss tt} - {ShiftCalculationService.FormatDuration(worked)} worked."
        : $"\nSigned off at {exit:h:mm:ss tt} - {ShiftCalculationService.FormatDuration(worked)} worked.");

    if (worked < emailService.DailyHourGoal)
    {
        var shortBy = emailService.DailyHourGoal - worked;
        Console.WriteLine($"That is {ShiftCalculationService.FormatDuration(shortBy)} under the {ShiftCalculationService.FormatDuration(emailService.DailyHourGoal)} goal.");
    }

    var all = storage.LoadAll();
    Console.WriteLine(AttendanceReportService.FormatOfficeTargetSummary(all, emailService.RequiredOfficeDaysPerWeek, emailService.DailyHourGoal));
    Console.WriteLine(AttendanceReportService.FormatWeeklyHoursSummary(all, emailService.DailyHourGoal));
    Console.WriteLine("Reminders for today have stopped.\n");
}

/// <summary>
/// Corrects a recorded day. Usage:
///   edit entry 10:15 AM        - today's entry time
///   edit exit 7:05 PM          - today's exit time ("edit exit -" clears it)
///   edit 20 Sep entry 10:15 AM - a specific day
/// </summary>
static void EditDay(ShiftStorageService storage, EmailService emailService, string? argument)
{
    if (string.IsNullOrWhiteSpace(argument))
    {
        Console.WriteLine("\nCorrect a day:");
        Console.WriteLine("  edit entry 10:15 AM          today's entry time");
        Console.WriteLine("  edit exit 7:05 PM            today's exit time");
        Console.WriteLine("  edit exit -                  clear the exit, reopening the day");
        Console.WriteLine("  edit hours 8:30              a WFH day's hours");
        Console.WriteLine("  edit 20 Sep entry 10:15 AM   a specific day\n");
        return;
    }

    var words = argument.Split(' ', StringSplitOptions.RemoveEmptyEntries);

    // A leading "20 Sep" selects a day; otherwise today is assumed.
    var target = ShiftCalculationService.Today;
    var index = 0;
    if (words.Length >= 2 && ShiftCalculationService.TryResolveFullDate($"{words[0]} {words[1]}", out var parsedDate))
    {
        target = parsedDate;
        index = 2;
    }

    if (words.Length < index + 2)
    {
        Console.WriteLine("\nTell me what to change, e.g. 'edit entry 10:15 AM'.\n");
        return;
    }

    var field = words[index].ToLowerInvariant();
    var value = string.Join(' ', words.Skip(index + 1));

    var shift = storage.GetByDate(target);
    if (shift is null)
    {
        Console.WriteLine($"\nNothing recorded for {ShiftCalculationService.FormatDisplayDate(target)}.\n");
        return;
    }

    switch (field)
    {
        case "entry":
            if (!TimeOnly.TryParse(value, out var entry))
            {
                Console.WriteLine($"\nCouldn't read '{value}' as a time.\n");
                return;
            }
            // The exit times are derived from entry, so they move with it.
            var span = shift.Exit100.ToTimeSpan() - shift.EntryTime.ToTimeSpan();
            shift.EntryTime = entry;
            shift.Exit95 = entry.Add(TimeSpan.FromTicks((long)(span.Ticks * 0.95)));
            shift.Exit100 = entry.Add(span);
            break;

        case "exit":
            if (value == "-" || value.Equals("none", StringComparison.OrdinalIgnoreCase))
            {
                shift.ActualExitTime = null;
                break;
            }
            if (!TimeOnly.TryParse(value, out var exit))
            {
                Console.WriteLine($"\nCouldn't read '{value}' as a time.\n");
                return;
            }
            if (exit.ToTimeSpan() < shift.EntryTime.ToTimeSpan())
            {
                Console.WriteLine($"\nThat is before the entry at {shift.EntryTime:h:mm:ss tt}.\n");
                return;
            }
            shift.ActualExitTime = exit;
            break;

        case "hours":
            if (!shift.IsWfh)
            {
                Console.WriteLine("\n'hours' only applies to a WFH day - correct an office day with 'edit exit'.\n");
                return;
            }
            if (!TryParseHours(value, out var hours))
            {
                Console.WriteLine($"\nCouldn't read '{value}' as hours. Try 8.5 or 8:30.\n");
                return;
            }
            shift.WfhHours = hours;
            break;

        default:
            Console.WriteLine($"\nDon't know how to change '{field}'. Use entry, exit or hours.\n");
            return;
    }

    storage.Save(shift);

    Console.WriteLine($"\n{shift.Date} corrected.");
    if (shift.IsWfh)
    {
        Console.WriteLine($"WFH hours: {ShiftCalculationService.FormatDuration(AttendanceReportService.GetWfhCredit(shift, emailService.DailyHourGoal))}");
    }
    else
    {
        Console.WriteLine($"Entry {shift.EntryTime:h:mm:ss tt}, 95% exit {shift.Exit95:h:mm:ss tt}"
            + (shift.ActualExitTime.HasValue ? $", signed off {shift.ActualExitTime:h:mm:ss tt}" : ", still running"));
        Console.WriteLine($"Hours: {ShiftCalculationService.FormatDuration(ShiftCalculationService.GetTimeSpent(shift))}");
    }

    var all = storage.LoadAll();
    Console.WriteLine(AttendanceReportService.FormatOfficeTargetSummary(all, emailService.RequiredOfficeDaysPerWeek, emailService.DailyHourGoal));
    Console.WriteLine(AttendanceReportService.FormatWeeklyHoursSummary(all, emailService.DailyHourGoal));
    Console.WriteLine();
}

/// <summary>Accepts "8.5" or "8:30" as a number of hours.</summary>
static bool TryParseHours(string text, out double hours)
{
    hours = 0;

    if (text.Contains(':'))
    {
        var parts = text.Split(':');
        if (parts.Length == 2
            && int.TryParse(parts[0], out var h)
            && int.TryParse(parts[1], out var m)
            && m is >= 0 and < 60)
        {
            hours = h + m / 60d;
            return hours is > 0 and <= 24;
        }
        return false;
    }

    return double.TryParse(text, System.Globalization.NumberStyles.Float,
               System.Globalization.CultureInfo.InvariantCulture, out hours)
           && hours is > 0 and <= 24;
}

/// <summary>Opens the thin always-on-top progress line.</summary>
static void ShowFloatingBar(ShiftStorageService storage, EmailService emailService, NotificationService notifier, bool vertical)
{
    if (notifier.TryShowFloatingBar(() => BuildSnapshot(storage, emailService), vertical))
    {
        var shape = vertical ? "Vertical" : "Horizontal";
        Console.WriteLine($"\n{shape} line opened - drag it anywhere, double-click it to close.\n");
        return;
    }

    Console.WriteLine("\nThis platform has no floating line.\n");
}

/// <summary>
/// One frame of live status, or null when there is nothing to show today.
/// Called on the UI thread's timer, so it stays cheap and allocates nothing it
/// does not hand straight back.
/// </summary>
static DashboardSnapshot? BuildSnapshot(ShiftStorageService storage, EmailService emailService)
{
    var shift = storage.GetToday();
    if (shift is null || shift.IsWfh) return null;

    var spent = ShiftCalculationService.GetTimeSpent(shift);
    var left95 = ShiftCalculationService.GetTimeLeft(shift, shift.Exit95);
    var left100 = ShiftCalculationService.GetTimeLeft(shift, shift.Exit100);

    // The percentage is of the whole shift, so the 95% exit genuinely reads as
    // 95%. Measuring to the 95% exit instead - as this did - makes the gauge
    // show 100% at 6:57pm and means the number 95 can never appear at all.
    var total = shift.Exit100.ToTimeSpan() - shift.EntryTime.ToTimeSpan();
    if (total <= TimeSpan.Zero) total = TimeSpan.FromHours(9);
    // Where the day is done, as a share of that shift - the gauges turn green
    // here rather than at a full 100%.
    var targetFraction = Math.Clamp(
        (shift.Exit95.ToTimeSpan() - shift.EntryTime.ToTimeSpan()) / total, 0d, 1d);

    var all = storage.LoadAll();
    var officeLogged = AttendanceReportService.GetOfficeHoursThisWeek(all);
    var officeTarget = AttendanceReportService.GetOfficeHoursTarget(emailService.RequiredOfficeDaysPerWeek, emailService.DailyHourGoal);

    var days = AttendanceReportService
        .GetWeekBreakdown(all, emailService.DailyHourGoal)
        .Select(d => new DayBar(d.Label, d.Hours.TotalHours, d.IsWfh, d.IsToday))
        .ToList();

    return new DashboardSnapshot(
        Date: shift.Date,
        Clock: DateTime.Now.ToString("dddd, d MMM  h:mm:ss tt"),
        Logged: ShiftCalculationService.FormatDuration(spent),
        Fraction: Math.Clamp(spent.TotalSeconds / total.TotalSeconds, 0d, 1d),
        TargetFraction: targetFraction,
        Entry: shift.EntryTime.ToString("h:mm:ss tt"),
        Location: shift.Location ?? "",
        Exit95: shift.Exit95.ToString("h:mm:ss tt"),
        Exit100: shift.Exit100.ToString("h:mm:ss tt"),
        Left95: left95 > TimeSpan.Zero ? $"in {ShiftCalculationService.FormatDuration(left95)}" : "reached",
        Left100: left100 > TimeSpan.Zero ? $"in {ShiftCalculationService.FormatDuration(left100)}" : "reached",
        Status: ShiftCalculationService.GetEntryStatus(shift),
        OfficeHours: AttendanceReportService.FormatOfficeHoursSummary(all),
        WeekSummary: AttendanceReportService.FormatWeekSummary(all, emailService.RequiredOfficeDaysPerWeek),
        WeeklyHours: AttendanceReportService.FormatWeeklyHoursSummary(all, emailService.DailyHourGoal),
        OfficeLoggedHours: officeLogged.TotalHours,
        OfficeTargetHours: officeTarget.TotalHours,
        OfficeTargetText: AttendanceReportService.FormatOfficeTargetSummary(all, emailService.RequiredOfficeDaysPerWeek, emailService.DailyHourGoal),
        Days: days,
        DailyGoalHours: emailService.DailyHourGoal.TotalHours);
}

/// <summary>Builds the panel as plain text so it can be painted or printed once.</summary>
static List<string> BuildDashboardLines(ShiftRecord shift, ShiftStorageService storage, EmailService emailService)
{
    var spent = ShiftCalculationService.GetTimeSpent(shift);
    var left95 = ShiftCalculationService.GetTimeLeft(shift, shift.Exit95);
    var left100 = ShiftCalculationService.GetTimeLeft(shift, shift.Exit100);

    // The percentage is of the whole shift, so the 95% exit genuinely reads as
    // 95%. Measuring to the 95% exit instead - as this did - makes the gauge
    // show 100% at 6:57pm and means the number 95 can never appear at all.
    var total = shift.Exit100.ToTimeSpan() - shift.EntryTime.ToTimeSpan();
    if (total <= TimeSpan.Zero) total = TimeSpan.FromHours(9);
    // Where the day is done, as a share of that shift - the gauges turn green
    // here rather than at a full 100%.
    var targetFraction = Math.Clamp(
        (shift.Exit95.ToTimeSpan() - shift.EntryTime.ToTimeSpan()) / total, 0d, 1d);

    var fraction = Math.Clamp(spent.TotalSeconds / total.TotalSeconds, 0d, 1d);
    var all = storage.LoadAll();

    return new List<string>
    {
        "============================================",
        $"   HOURS LOGGED - {shift.Date}   {DateTime.Now:h:mm:ss tt}",
        "============================================",
        $" Logged so far   {ShiftCalculationService.FormatDuration(spent)}",
        $" {ProgressBar(fraction)} {fraction * 100:0}%",
        "",
        $" Entry           {shift.EntryTime:h:mm:ss tt}" + (string.IsNullOrEmpty(shift.Location) ? "" : $"  ({shift.Location})"),
        $" Exit (95%)      {shift.Exit95:h:mm:ss tt}   " + (left95 > TimeSpan.Zero ? $"in {ShiftCalculationService.FormatDuration(left95)}" : "reached"),
        $" Exit (100%)     {shift.Exit100:h:mm:ss tt}   " + (left100 > TimeSpan.Zero ? $"in {ShiftCalculationService.FormatDuration(left100)}" : "reached"),
        $" Entry status    {ShiftCalculationService.GetEntryStatus(shift)}",
        "--------------------------------------------",
        " " + AttendanceReportService.FormatOfficeHoursSummary(all),
        " " + AttendanceReportService.FormatWeekSummary(all, emailService.RequiredOfficeDaysPerWeek),
        " " + AttendanceReportService.FormatWeeklyHoursSummary(all, emailService.DailyHourGoal),
        "============================================",
        " Press any key to return to the prompt."
    };
}

static string ProgressBar(double fraction, int width = 30)
{
    var filled = (int)Math.Round(fraction * width);
    return "[" + new string('#', filled) + new string('.', width - filled) + "]";
}

/// <summary>Lets the reminder loop know the dashboard owns the screen.</summary>
static class Dashboard
{
    public static volatile bool IsActive;
}

/// <summary>Remembers the day the completion notice went out, so it only fires once.</summary>
static class CompletionNotice
{
    public static DateOnly? AnnouncedFor { get; set; }
}

static class WfhNotice
{
    public static DateOnly? AnnouncedFor { get; set; }
}
