namespace HoursLoggedNotifier.Services.Notifications;

/// <summary>
/// Last-resort notifier: prints the reminder to the console. Used when the OS
/// has no supported popup mechanism (or notify-send isn't installed), so the
/// reminder is still visible in the window the user left running.
/// </summary>
public class ConsoleNotifier : IPlatformNotifier
{
    private readonly string _description;

    public ConsoleNotifier(string description = "console output")
    {
        _description = description;
    }

    public string Description => _description;

    public bool IsDesktopNotification => false;

    public void Show(string title, string message)
    {
        Console.WriteLine();
        Console.WriteLine($"--- {title} ---");
        Console.WriteLine(message);
        Console.WriteLine();
    }

    public void Dispose()
    {
    }
}
