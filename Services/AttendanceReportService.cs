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

    /// <summary>The office-hours bar that matters: required office days x the daily goal.</summary>
    public static TimeSpan GetOfficeHoursTarget(int requiredOfficeDays, TimeSpan dailyGoal) =>
        TimeSpan.FromTicks(dailyGoal.Ticks * requiredOfficeDays);

    /// <summary>Hours credited for a WFH day - the stored override, or the daily goal.</summary>
    public static TimeSpan GetWfhCredit(ShiftRecord record, TimeSpan dailyGoal) =>
        record.WfhHours.HasValue ? TimeSpan.FromHours(record.WfhHours.Value) : dailyGoal;

    /// <summary>Time actually spent in the office this week, today included.</summary>
    public static TimeSpan GetOfficeHoursThisWeek(List<ShiftRecord> all)
    {
        var now = DateTime.Now;
        return GetThisWeeksRecords(all)
            .Where(r => !r.IsWfh)
            .Aggregate(TimeSpan.Zero, (sum, r) => sum + GetLoggedDuration(r, now));
    }

    /// <summary>
    /// Office hours against the weekly office target, with the 95% mark called
    /// out - that threshold is what actually gets checked, not the raw total.
    /// </summary>
    public static string FormatOfficeTargetSummary(List<ShiftRecord> all, int requiredOfficeDays, TimeSpan dailyGoal)
    {
        var logged = GetOfficeHoursThisWeek(all);
        var target = GetOfficeHoursTarget(requiredOfficeDays, dailyGoal);
        if (target <= TimeSpan.Zero) return "Office target: not configured.";

        var mark95 = TimeSpan.FromTicks((long)(target.Ticks * 0.95));
        var percent = logged.TotalSeconds / target.TotalSeconds * 100;

        var line = $"Office target: {ShiftCalculationService.FormatDuration(logged)} / {ShiftCalculationService.FormatDuration(target)} ({percent:0}%)";

        if (logged >= target)
            return line + " - full target met.";

        if (logged >= mark95)
            return line + $" - past the 95% mark ({ShiftCalculationService.FormatDuration(mark95)}).";

        var to95 = mark95 - logged;
        return line + $" - {ShiftCalculationService.FormatDuration(to95)} to the 95% mark ({ShiftCalculationService.FormatDuration(mark95)}).";
    }

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
                logged += GetWfhCredit(r, dailyGoal);
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

    public static string FormatDayWiseLog(List<ShiftRecord> all, TimeSpan dailyGoal)
    {
        var weekRecords = GetThisWeeksRecords(all);
        if (weekRecords.Count == 0)
            return "No attendance logged yet this week.";

        var lines = weekRecords.Select(r => r.IsWfh
            ? $"{r.Date}: WFH - {ShiftCalculationService.FormatDuration(GetWfhCredit(r, dailyGoal))}{(r.WfhHours.HasValue ? "" : " (default)")}"
            : $"{r.Date}: Office ({r.Location ?? "location unknown"}) - Entry {r.EntryTime:h:mm:ss tt}, {ShiftCalculationService.FormatDuration(GetLoggedDuration(r, DateTime.Now))}");

        return string.Join("\n", lines);
    }

    /// <summary>One bar's worth of data for the week - used by the day comparison chart.</summary>
    public sealed record DayLog(DateOnly Date, string Label, bool IsWfh, bool IsLogged, TimeSpan Hours, bool IsToday);

    /// <summary>
    /// Monday to Friday with hours per day, including days with nothing logged,
    /// so the comparison always shows the shape of the whole week.
    /// </summary>
    public static List<DayLog> GetWeekBreakdown(List<ShiftRecord> all, TimeSpan dailyGoal)
    {
        var now = DateTime.Now;
        var today = DateOnly.FromDateTime(now);
        var (monday, _) = GetCurrentWorkWeek();
        var week = GetThisWeeksRecords(all);

        var days = new List<DayLog>(WorkdaysPerWeek);
        for (var i = 0; i < WorkdaysPerWeek; i++)
        {
            var date = monday.AddDays(i);
            var record = week.FirstOrDefault(r => r.FullDate == date);
            var label = date.ToString("ddd");

            if (record is null)
                days.Add(new DayLog(date, label, false, false, TimeSpan.Zero, date == today));
            else if (record.IsWfh)
                days.Add(new DayLog(date, label, true, true, GetWfhCredit(record, dailyGoal), date == today));
            else
                days.Add(new DayLog(date, label, false, true, GetLoggedDuration(record, now), date == today));
        }

        return days;
    }
}
