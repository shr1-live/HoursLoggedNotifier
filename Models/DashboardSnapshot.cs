namespace HoursLoggedNotifier.Models;

/// <summary>One weekday's bar in the comparison chart.</summary>
public sealed record DayBar(string Label, double Hours, bool IsWfh, bool IsToday);

/// <summary>
/// One frame of the live dashboard, already formatted for display. Keeping it
/// as plain data means the window and the console panel render the same values
/// and neither needs to know how they were calculated.
/// </summary>
public sealed record DashboardSnapshot(
    string Date,
    string Clock,
    string Logged,
    double Fraction,
    /// <summary>Share of the shift at which the day is done - 0.95 by default.</summary>
    double TargetFraction,
    string Entry,
    string Location,
    string Exit95,
    string Exit100,
    string Left95,
    string Left100,
    string Status,
    string OfficeHours,
    string WeekSummary,
    string WeeklyHours,
    // Office target - the 95% figure that actually matters.
    double OfficeLoggedHours,
    double OfficeTargetHours,
    string OfficeTargetText,
    // Week comparison.
    IReadOnlyList<DayBar> Days,
    double DailyGoalHours);
