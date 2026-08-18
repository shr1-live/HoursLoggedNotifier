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
    public string? Location { get; set; }
    public bool IsWfh { get; set; }
}
