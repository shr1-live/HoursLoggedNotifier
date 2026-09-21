namespace HoursLoggedNotifier.Models;

public class AppConfig
{
    public EmailConfig Email { get; set; } = new();
    public int ReminderIntervalMinutes { get; set; } = 60;
    public int RequiredOfficeDaysPerWeek { get; set; } = 3;
    public double DailyHourGoalHours { get; set; } = 9;
}

public class EmailConfig
{
    public string SmtpServer { get; set; } = "smtp.office365.com";
    public int SmtpPort { get; set; } = 587;
    public string Address { get; set; } = "";
    public string AppPassword { get; set; } = "";
    public string DisplayName { get; set; } = "Hours Logged Notifier";
}
