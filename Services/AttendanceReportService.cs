using HoursCompletionNotifier.Models;

namespace HoursCompletionNotifier.Services;

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
