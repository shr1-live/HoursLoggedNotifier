using System.Drawing;
using System.Windows.Forms;
using HoursLoggedNotifier.Models;
using HoursLoggedNotifier.Ui;

namespace HoursLoggedNotifier.Services.Notifications;

/// <summary>
/// Windows notifications through a tray icon balloon tip. Needs a WinForms
/// message pump, so it runs one on a dedicated STA thread. Compiled only on
/// Windows builds (see the csproj).
/// </summary>
public class WindowsTrayNotifier : IPlatformNotifier, IDashboardHost
{
    private readonly ManualResetEventSlim _ready = new(false);
    private Form? _pumpForm;
    private NotifyIcon? _icon;
    private DashboardForm? _dashboard;
    private FloatingRingWidget? _widget;
    private Func<DashboardSnapshot?>? _nextFrame;

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

            // Double-clicking the tray icon is the quickest way back to the window.
            _icon.DoubleClick += (_, _) => OpenDashboard();
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

    public bool TryShowDashboard(Func<DashboardSnapshot?> nextFrame)
    {
        if (_pumpForm is null) return false;

        _nextFrame = nextFrame;
        // Marshal onto the pump thread: WinForms controls may only be touched there.
        _pumpForm.Invoke(new Action(OpenDashboard));
        return true;
    }

    public bool TryShowFloatingWidget(Func<DashboardSnapshot?> nextFrame)
    {
        if (_pumpForm is null) return false;

        _nextFrame = nextFrame;
        _pumpForm.Invoke(new Action(() =>
        {
            if (_widget is null || _widget.IsDisposed)
            {
                _widget = new FloatingRingWidget(nextFrame);
                _widget.FormClosed += (_, _) => _widget = null;
                _widget.Show();
            }

            _widget.BringToFront();
        }));

        return true;
    }

    /// <summary>Opens the window, or brings the existing one forward. Pump thread only.</summary>
    private void OpenDashboard()
    {
        if (_nextFrame is null) return;

        if (_dashboard is null || _dashboard.IsDisposed)
        {
            _dashboard = new DashboardForm(_nextFrame);
            _dashboard.FormClosed += (_, _) => _dashboard = null;
            _dashboard.Show();
        }

        _dashboard.WindowState = FormWindowState.Normal;
        _dashboard.Activate();
    }

    public void Dispose()
    {
        if (_pumpForm is null || _icon is null) return;
        _pumpForm.Invoke(new Action(() =>
        {
            _widget?.Close();
            _dashboard?.Close();
            _icon.Visible = false;
            _icon.Dispose();
            Application.ExitThread();
        }));
    }
}
