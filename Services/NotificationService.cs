using HoursLoggedNotifier.Services.Notifications;

namespace HoursLoggedNotifier.Services;

/// <summary>
/// Picks whichever notifier suits the current OS and forwards to it, so callers
/// never have to care which platform they're on.
/// </summary>
public class NotificationService : IDisposable
{
    private readonly IPlatformNotifier _notifier;

    public NotificationService()
    {
        _notifier = CreateNotifier();
    }

    /// <summary>Short label for the startup banner, e.g. "tray balloon".</summary>
    public string Description => _notifier.Description;

    /// <summary>False when reminders can only be printed to the console.</summary>
    public bool IsDesktopNotification => _notifier.IsDesktopNotification;

    private static IPlatformNotifier CreateNotifier()
    {
#if WINDOWS_TRAY
        if (OperatingSystem.IsWindows())
        {
            var tray = new WindowsTrayNotifier();
            if (tray.IsDesktopNotification) return tray;
            tray.Dispose();
            return new ConsoleNotifier("console output - the Windows tray icon could not be created");
        }
#endif

        if (OperatingSystem.IsLinux())
        {
            if (LinuxNotifier.IsAvailable()) return new LinuxNotifier();
            return new ConsoleNotifier("console output - install libnotify (notify-send) for desktop popups");
        }

        return new ConsoleNotifier($"console output - no desktop popups on {(OperatingSystem.IsMacOS() ? "macOS" : "this OS")} yet");
    }

    public void Show(string title, string message) => _notifier.Show(title, message);

    public void Dispose() => _notifier.Dispose();
}
