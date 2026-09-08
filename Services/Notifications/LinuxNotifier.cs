using System.Diagnostics;

namespace HoursLoggedNotifier.Services.Notifications;

/// <summary>
/// Linux desktop notifications via notify-send (libnotify), which every major
/// desktop environment honours.
/// </summary>
public class LinuxNotifier : IPlatformNotifier
{
    private const string Command = "notify-send";

    public string Description => "notify-send";

    public bool IsDesktopNotification => true;

    /// <summary>True when notify-send is on PATH, i.e. this notifier can work.</summary>
    public static bool IsAvailable()
    {
        try
        {
            using var probe = Process.Start(new ProcessStartInfo("which", Command)
            {
                RedirectStandardOutput = true,
                RedirectStandardError = true
            });

            if (probe is null) return false;

            probe.WaitForExit(3000);
            return probe.HasExited && probe.ExitCode == 0;
        }
        catch
        {
            return false;
        }
    }

    public void Show(string title, string message)
    {
        var info = new ProcessStartInfo(Command)
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true
        };

        info.ArgumentList.Add("--app-name=Hours Logged Notifier");
        info.ArgumentList.Add("--expire-time=10000");
        info.ArgumentList.Add("--icon=appointment-soon");
        info.ArgumentList.Add(title);
        info.ArgumentList.Add(message);

        try
        {
            using var process = Process.Start(info);
            process?.WaitForExit(5000);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[Desktop notification failed: {ex.Message}]");
        }
    }

    public void Dispose()
    {
    }
}
