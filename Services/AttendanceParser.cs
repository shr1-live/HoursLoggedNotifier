using System.Globalization;
using System.Text.RegularExpressions;

namespace HoursLoggedNotifier.Services;

public class ParsedAttendance
{
    public string Date { get; set; } = "";
    public TimeOnly ShiftStart { get; set; }
    public TimeOnly ShiftEnd { get; set; }
    public TimeOnly EntryTime { get; set; }
    public string? Status { get; set; }
    public string? Location { get; set; }
}

public static class AttendanceParser
{
    private static readonly Regex DateRegex = new(@"\((\d{1,2}\s+[A-Za-z]{3,})\)", RegexOptions.Compiled);
    private static readonly Regex RangeRegex = new(@"(\d{1,2}:\d{2}\s*[AaPp][Mm])\s*-\s*(\d{1,2}:\d{2}\s*[AaPp][Mm])", RegexOptions.Compiled);
    private static readonly Regex EntryRegex = new(@"\b(\d{1,2}:\d{2}:\d{2}\s*[AaPp][Mm])\b", RegexOptions.Compiled);

    public const string ExpectedFormatHint =
        "Expected something like:\n" +
        "General Shift\n(18 Aug)\nGeneral Shift\n10:00 AM - 7:00 PM\n\nGurgaon Biometric\n9:38:14 AM\nMISSING";

    public static bool HasRequiredFields(IEnumerable<string> lines)
    {
        bool hasDate = false, hasRange = false, hasEntry = false;
        foreach (var raw in lines)
        {
            var line = raw.Trim();
            if (DateRegex.IsMatch(line)) hasDate = true;
            if (RangeRegex.IsMatch(line)) hasRange = true;
            if (EntryRegex.IsMatch(line)) hasEntry = true;
        }
        return hasDate && hasRange && hasEntry;
    }

    public static bool IsLikelyStatusLine(string line)
    {
        var trimmed = line.Trim();
        if (trimmed.Length == 0 || trimmed.Contains(':')) return false;
        return trimmed.Any(char.IsLetter) && trimmed == trimmed.ToUpperInvariant();
    }

    public static bool TryParse(IEnumerable<string> lines, out ParsedAttendance result, out string error)
    {
        var lineList = lines.Select(l => l.Trim()).Where(l => l.Length > 0).ToList();

        string? date = null;
        TimeOnly? start = null, end = null, entry = null;
        string? status = null;
        string? location = null;

        for (var i = 0; i < lineList.Count; i++)
        {
            var line = lineList[i];

            var dateMatch = DateRegex.Match(line);
            if (dateMatch.Success) date ??= dateMatch.Groups[1].Value;

            var rangeMatch = RangeRegex.Match(line);
            if (rangeMatch.Success && start is null)
            {
                start = ParseTime(rangeMatch.Groups[1].Value);
                end = ParseTime(rangeMatch.Groups[2].Value);
            }

            var entryMatch = EntryRegex.Match(line);
            if (entryMatch.Success && entry is null)
            {
                entry = ParseTime(entryMatch.Groups[1].Value);

                if (i > 0 && location is null)
                {
                    var previous = lineList[i - 1];
                    if (!DateRegex.IsMatch(previous) && !RangeRegex.IsMatch(previous) && !IsLikelyStatusLine(previous))
                        location = previous;
                }
            }

            if (!dateMatch.Success && !rangeMatch.Success && !entryMatch.Success && IsLikelyStatusLine(line))
                status ??= line;
        }

        if (date is null || start is null || end is null || entry is null)
        {
            result = new ParsedAttendance();
            error = $"Couldn't find date / shift range / entry time in the pasted text.\n{ExpectedFormatHint}";
            return false;
        }

        result = new ParsedAttendance
        {
            Date = date,
            ShiftStart = start.Value,
            ShiftEnd = end.Value,
            EntryTime = entry.Value,
            Status = status,
            Location = location
        };
        error = "";
        return true;
    }

    private static TimeOnly ParseTime(string text) => TimeOnly.Parse(text.Trim(), CultureInfo.InvariantCulture);
}
