namespace HoursLoggedNotifier.Services.Notifications;

/// <summary>
/// One way of getting a notification in front of the user. Implementations are
/// picked per OS by <see cref="NotificationService"/>.
/// </summary>
public interface IPlatformNotifier : IDisposable
{
    /// <summary>Short label for the startup banner, e.g. "tray balloon".</summary>
    string Description { get; }

    /// <summary>True when this notifier actually reaches the desktop.</summary>
    bool IsDesktopNotification { get; }

    void Show(string title, string message);
}
