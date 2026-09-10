using HoursLoggedNotifier.Models;

namespace HoursLoggedNotifier.Services;

public static class AttendanceReportService
{
    public static (DateOnly Monday, DateOnly Friday) GetCurrentWorkWeek()
    {
        var today = DateOnly.FromDateTime(DateTime.Now);
        var daysSinceMonday = ((int)today.DayOfWeek + 6) % 7;
        var monday = today.AddDays(-daysSinceMonday);
        return (monday, monday.AddDays(4));
    }

    public static List<ShiftRecord> GetThisWeeksRecords(List<ShiftRecord> all)
    {
        var (monday, friday) = GetCurrentWorkWeek();
        return all.Where(r => r.FullDate >= monday && r.FullDate <= friday)
                   .OrderBy(r => r.FullDate)
                   .ToList();
    }

    public static string FormatWeekSummary(List<ShiftRecord> all, int requiredOfficeDays)
    {
        var weekRecords = GetThisWeeksRecords(all);
        var officeDays = weekRecords.Count(r => !r.IsWfh);
        var wfhDays = weekRecords.Count(r => r.IsWfh);

        var status = officeDays >= requiredOfficeDays
            ? "target met"
            : $"{requiredOfficeDays - officeDays} more needed";

        return $"This week: {officeDays} office day(s), {wfhDays} WFH day(s) - target {requiredOfficeDays}/week ({status})";
    }

    private const int WorkdaysPerWeek = 5;

    /// <summary>
    /// Hours counted for one office day: the real span once an exit is logged,
    /// the time elapsed so far for today, and the full shift for a past day
    /// whose exit was never entered.
    /// </summary>
    private static TimeSpan GetLoggedDuration(ShiftRecord record, DateTime now)
    {
        if (record.ActualExitTime.HasValue)
            return record.ActualExitTime.Value.ToTimeSpan() - record.EntryTime.ToTimeSpan();

        if (record.FullDate == DateOnly.FromDateTime(now))
        {
            var spent = TimeOnly.FromDateTime(now).ToTimeSpan() - record.EntryTime.ToTimeSpan();
            return spent > TimeSpan.Zero ? spent : TimeSpan.Zero;
        }

        return record.Exit100.ToTimeSpan() - record.EntryTime.ToTimeSpan();
    }

    /// <summary>
    /// Running total of time actually spent in office this week, today included.
    /// Unlike the weekly hours line this counts office time only - WFH days are
    /// credited against the target there, but no office hours are logged on them.
    /// </summary>
    public static string FormatOfficeHoursSummary(List<ShiftRecord> all)
    {
        var now = DateTime.Now;
        var today = DateOnly.FromDateTime(now);
        var officeRecords = GetThisWeeksRecords(all).Where(r => !r.IsWfh).ToList();

        if (officeRecords.Count == 0)
            return "Office hours this week: none logged yet.";

        var total = TimeSpan.Zero;
        var todaySoFar = TimeSpan.Zero;

        foreach (var record in officeRecords)
        {
            var logged = GetLoggedDuration(record, now);
            total += logged;

            if (record.FullDate == today && !record.ActualExitTime.HasValue)
                todaySoFar = logged;
        }

        var line = $"Office hours this week: {ShiftCalculationService.FormatDuration(total)} across {officeRecords.Count} office day(s)";
        return todaySoFar > TimeSpan.Zero
            ? $"{line} (today {ShiftCalculationService.FormatDuration(todaySoFar)} so far)."
            : $"{line}.";
    }

    public static string FormatWeeklyHoursSummary(List<ShiftRecord> all, TimeSpan dailyGoal)
    {
        var weekRecords = GetThisWeeksRecords(all);
        var weeklyTarget = TimeSpan.FromTicks(dailyGoal.Ticks * WorkdaysPerWeek);

        var now = DateTime.Now;
        var today = DateOnly.FromDateTime(now);
        var logged = TimeSpan.Zero;
        var accountedDays = 0;

        foreach (var r in weekRecords)
        {
            if (r.IsWfh)
            {
                logged += dailyGoal;
                accountedDays++;
                continue;
            }

            // A past office day with no exit logged falls back to the day's target
            // duration (see GetLoggedDuration) so it isn't silently dropped here.
            logged += GetLoggedDuration(r, now);

            // Today is still running, so it doesn't count as an accounted-for day yet.
            if (r.ActualExitTime.HasValue || r.FullDate != today)
                accountedDays++;
        }

        var pending = weeklyTarget - logged;
        if (pending < TimeSpan.Zero) pending = TimeSpan.Zero;

        if (pending == TimeSpan.Zero)
            return $"Weekly hours: {ShiftCalculationService.FormatDuration(logged)} / {ShiftCalculationService.FormatDuration(weeklyTarget)} - target met.";

        var remainingDays = Math.Max(WorkdaysPerWeek - accountedDays, 0);
        var line = $"Weekly hours: {ShiftCalculationService.FormatDuration(logged)} / {ShiftCalculationService.FormatDuration(weeklyTarget)} logged - {ShiftCalculationService.FormatDuration(pending)} pending";

        if (remainingDays == 0)
            return line + " (no workdays left this week).";

        var perDay = TimeSpan.FromTicks(pending.Ticks / remainingDays);
        var wfhDaysNeeded = (int)Math.Ceiling(pending.Ticks / (double)dailyGoal.Ticks);
        return line + $" across {remainingDays} day(s) left (~{ShiftCalculationService.FormatDuration(perDay)}/day, or {wfhDaysNeeded} WFH day(s) at {ShiftCalculationService.FormatDuration(dailyGoal)} each).";
    }

    public static string FormatDayWiseLog(List<ShiftRecord> all)
    {
        var weekRecords = GetThisWeeksRecords(all);
        if (weekRecords.Count == 0)
            return "No attendance logged yet this week.";

        var lines = weekRecords.Select(r => r.IsWfh
            ? $"{r.Date}: WFH"
            : $"{r.Date}: Office ({r.Location ?? "location unknown"}) - Entry {r.EntryTime:h:mm:ss tt}");

        return string.Join("\n", lines);
    }
}
