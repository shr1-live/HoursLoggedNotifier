namespace HoursLoggedNotifier.Models;

public class ShiftRecord
{
    public string Date { get; set; } = "";
    public DateOnly FullDate { get; set; }
    public TimeOnly ShiftStart { get; set; }
    public TimeOnly ShiftEnd { get; set; }
    public TimeOnly EntryTime { get; set; }
    public TimeOnly Exit95 { get; set; }
    public TimeOnly Exit100 { get; set; }
    public TimeOnly? ActualExitTime { get; set; }
    public string? Location { get; set; }
    public bool IsWfh { get; set; }

    /// <summary>
    /// Hours credited for a WFH day. Null means "use the daily goal", so an
    /// untouched WFH day counts as a full day without anyone typing a number.
    /// </summary>
    public double? WfhHours { get; set; }
}
