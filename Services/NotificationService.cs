using System.Drawing;
using System.Windows.Forms;

namespace HoursCompletionNotifier.Services;

public class NotificationService : IDisposable
{
    private readonly ManualResetEventSlim _ready = new(false);
    private Form? _pumpForm;
    private NotifyIcon? _icon;

    public NotificationService()
    {
        var uiThread = new Thread(RunMessagePump) { IsBackground = true };
        uiThread.SetApartmentState(ApartmentState.STA);
        uiThread.Start();
        _ready.Wait();
    }

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
                Text = "Hours Completion Notifier",
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
