using System.Drawing;
using System.Windows.Forms;

namespace HoursLoggedNotifier.Services.Notifications;

/// <summary>
/// Windows notifications through a tray icon balloon tip. Needs a WinForms
/// message pump, so it runs one on a dedicated STA thread. Compiled only on
/// Windows builds (see the csproj).
/// </summary>
public class WindowsTrayNotifier : IPlatformNotifier
{
    private readonly ManualResetEventSlim _ready = new(false);
    private Form? _pumpForm;
    private NotifyIcon? _icon;

    public WindowsTrayNotifier()
    {
        var uiThread = new Thread(RunMessagePump) { IsBackground = true };
        uiThread.SetApartmentState(ApartmentState.STA);
        uiThread.Start();
        _ready.Wait();
    }

    public string Description => "tray balloon";

    public bool IsDesktopNotification => _pumpForm is not null && _icon is not null;

    private void RunMessagePump()
    {
        try
        {
            _pumpForm = new Form { ShowInTaskbar = false, Opacity = 0, WindowState = FormWindowState.Minimized };
            _ = _pumpForm.Handle; // force native window creation so Invoke works immediately
            _pumpForm.Load += (_, _) => _pumpForm.Hide();

            _icon = new NotifyIcon
            {
                Icon = SystemIcons.Information,
                Text = "Hours Logged Notifier",
                Visible = true
            };
        }
        catch
        {
            _pumpForm = null;
            _icon = null;
        }
        finally
        {
            _ready.Set();
        }

        if (_pumpForm is not null)
            Application.Run();
    }

    public void Show(string title, string message)
    {
        if (_pumpForm is null || _icon is null) return;
        _pumpForm.Invoke(new Action(() => _icon.ShowBalloonTip(10000, title, message, ToolTipIcon.Info)));
    }

    public void Dispose()
    {
        if (_pumpForm is null || _icon is null) return;
        _pumpForm.Invoke(new Action(() =>
        {
            _icon.Visible = false;
            _icon.Dispose();
            Application.ExitThread();
        }));
    }
}
