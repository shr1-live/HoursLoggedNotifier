using HoursCompletionNotifier.Models;

namespace HoursCompletionNotifier.Services;

public static class ShiftCalculationService
{
    public static ShiftRecord Calculate(string date, TimeOnly shiftStart, TimeOnly shiftEnd, TimeOnly entryTime, string? location = null)
    {
        var shiftDuration = shiftEnd - shiftStart;
        if (shiftDuration < TimeSpan.Zero)
            shiftDuration += TimeSpan.FromHours(24);

        var duration95 = TimeSpan.FromTicks((long)(shiftDuration.Ticks * 0.95));

        return new ShiftRecord
        {
            Date = date,
            FullDate = DateOnly.FromDateTime(DateTime.Now),
            ShiftStart = shiftStart,
            ShiftEnd = shiftEnd,
            EntryTime = entryTime,
            Exit95 = entryTime.Add(duration95),
            Exit100 = entryTime.Add(shiftDuration),
            Location = location
        };
    }

    public static string GetEntryStatus(ShiftRecord shift)
    {
        var diff = shift.EntryTime.ToTimeSpan() - shift.ShiftStart.ToTimeSpan();
        if (diff.Duration() < TimeSpan.FromSeconds(1))
            return "ON TIME";

        var label = diff < TimeSpan.Zero ? "EARLY" : "LATE";
        var abs = diff.Duration();
        return $"{abs.Hours}h {abs.Minutes}m {abs.Seconds}s {label}";
    }

    public static TimeSpan GetTimeSpent(ShiftRecord shift)
    {
        var now = TimeOnly.FromDateTime(DateTime.Now);
        return now.ToTimeSpan() - shift.EntryTime.ToTimeSpan();
    }

    public static TimeSpan GetTimeLeft(ShiftRecord shift, TimeOnly target)
    {
        var now = TimeOnly.FromDateTime(DateTime.Now);
        return target.ToTimeSpan() - now.ToTimeSpan();
    }

    public static string FormatDuration(TimeSpan span)
    {
        span = span.Duration();
        return $"{(int)span.TotalHours}h {span.Minutes}m";
    }
}
