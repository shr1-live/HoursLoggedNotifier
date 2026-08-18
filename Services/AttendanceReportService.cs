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
            if (r.ActualExitTime.HasValue)
            {
                logged += r.ActualExitTime.Value.ToTimeSpan() - r.EntryTime.ToTimeSpan();
                accountedDays++;
            }
            else if (r.IsWfh)
            {
                logged += dailyGoal;
                accountedDays++;
            }
            else if (r.FullDate == today)
            {
                var spent = TimeOnly.FromDateTime(now).ToTimeSpan() - r.EntryTime.ToTimeSpan();
                if (spent > TimeSpan.Zero) logged += spent;
            }
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
