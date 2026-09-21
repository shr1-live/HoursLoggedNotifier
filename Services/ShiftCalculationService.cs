using System.Globalization;
using System.Text.RegularExpressions;
using HoursLoggedNotifier.Models;

namespace HoursLoggedNotifier.Services;

public static class ShiftCalculationService
{
    private const string DisplayDateFormat = "dd MMM";

    private static readonly Regex DayMonthRegex = new(@"^\s*(\d{1,2})\s+([A-Za-z]{3,})\.?\s*$", RegexOptions.Compiled);

    public static ShiftRecord Calculate(string date, TimeOnly shiftStart, TimeOnly shiftEnd, TimeOnly entryTime, string? location = null, TimeOnly? actualExitTime = null)
    {
        var shiftDuration = shiftEnd - shiftStart;
        if (shiftDuration < TimeSpan.Zero)
            shiftDuration += TimeSpan.FromHours(24);

        var duration95 = TimeSpan.FromTicks((long)(shiftDuration.Ticks * 0.95));

        if (!TryResolveFullDate(date, out var fullDate))
            throw new FormatException($"Couldn't understand the date '{date}'.");

        return new ShiftRecord
        {
            Date = FormatDisplayDate(fullDate),
            FullDate = fullDate,
            ShiftStart = shiftStart,
            ShiftEnd = shiftEnd,
            EntryTime = entryTime,
            Exit95 = entryTime.Add(duration95),
            Exit100 = entryTime.Add(shiftDuration),
            ActualExitTime = actualExitTime,
            Location = location
        };
    }

    public static string FormatDisplayDate(DateOnly date) => date.ToString(DisplayDateFormat, CultureInfo.InvariantCulture);

    public static DateOnly Today => DateOnly.FromDateTime(DateTime.Now);

    /// <summary>
    /// Turns a day + month label such as "8 Sep", "08 Sept" or "8 September" into a full date,
    /// assuming the most recent occurrence of that day.
    /// </summary>
    public static bool TryResolveFullDate(string? date, out DateOnly result)
    {
        result = default;

        var match = DayMonthRegex.Match(date ?? "");
        if (!match.Success)
            return false;

        var day = int.Parse(match.Groups[1].Value, CultureInfo.InvariantCulture);
        if (!TryResolveMonth(match.Groups[2].Value, out var month))
            return false;

        var today = Today;

        // A day that doesn't exist this year (29 Feb) may still be valid in the previous one.
        if (!TryMakeDate(today.Year, month, day, out result))
            return TryMakeDate(today.Year - 1, month, day, out result);

        if (result > today.AddDays(1) && TryMakeDate(today.Year - 1, month, day, out var lastYear))
            result = lastYear;

        return true;
    }

    private static bool TryResolveMonth(string token, out int month)
    {
        var names = CultureInfo.InvariantCulture.DateTimeFormat.MonthNames;
        for (var i = 0; i < 12; i++)
        {
            if (names[i].StartsWith(token, StringComparison.OrdinalIgnoreCase))
            {
                month = i + 1;
                return true;
            }
        }

        month = 0;
        return false;
    }

    private static bool TryMakeDate(int year, int month, int day, out DateOnly result)
    {
        if (day < 1 || day > DateTime.DaysInMonth(year, month))
        {
            result = default;
            return false;
        }

        result = new DateOnly(year, month, day);
        return true;
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

    public static bool IsToday(ShiftRecord shift) => shift.FullDate == Today;

    /// <summary>
    /// Time on the clock. Once an exit is recorded the day is finished, so the
    /// total freezes there rather than carrying on counting.
    /// </summary>
    public static TimeSpan GetTimeSpent(ShiftRecord shift)
    {
        var upTo = shift.ActualExitTime ?? TimeOnly.FromDateTime(DateTime.Now);
        return upTo.ToTimeSpan() - shift.EntryTime.ToTimeSpan();
    }

    public static TimeSpan GetTimeLeft(ShiftRecord shift, TimeOnly target)
    {
        var from = shift.ActualExitTime ?? TimeOnly.FromDateTime(DateTime.Now);
        return target.ToTimeSpan() - from.ToTimeSpan();
    }

    /// <summary>True once the day has been signed off with an exit time.</summary>
    public static bool IsClockedOut(ShiftRecord shift) => shift.ActualExitTime.HasValue;

    public static TimeSpan GetActualHoursWorked(ShiftRecord shift) =>
        shift.ActualExitTime.HasValue
            ? shift.ActualExitTime.Value.ToTimeSpan() - shift.EntryTime.ToTimeSpan()
            : TimeSpan.Zero;

    public static string FormatDuration(TimeSpan span)
    {
        span = span.Duration();
        return $"{(int)span.TotalHours}h {span.Minutes}m";
    }
}
