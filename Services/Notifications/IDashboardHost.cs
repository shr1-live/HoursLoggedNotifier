using HoursLoggedNotifier.Models;

namespace HoursLoggedNotifier.Services.Notifications;

/// <summary>
/// Implemented by notifiers that can also put a real window on screen.
/// Platforms without one simply don't implement it, and the caller falls back
/// to the console panel.
/// </summary>
public interface IDashboardHost
{
    /// <summary>
    /// Opens (or re-focuses) the dashboard window. The callback is invoked on a
    /// timer to produce each frame, so the window never holds stale data and the
    /// caller keeps ownership of the calculations.
    /// Returns false when a window could not be shown.
    /// </summary>
    bool TryShowDashboard(Func<DashboardSnapshot?> nextFrame);

    /// <summary>
    /// Opens the small always-on-top ring that floats over other windows.
    /// Returns false when this platform has no such thing.
    /// </summary>
    bool TryShowFloatingWidget(Func<DashboardSnapshot?> nextFrame);

    /// <summary>Opens the thin floating progress line, vertical or horizontal.</summary>
    bool TryShowFloatingBar(Func<DashboardSnapshot?> nextFrame, bool vertical);
}
