using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using HoursLoggedNotifier.Models;

namespace HoursLoggedNotifier.Ui;

/// <summary>
/// A small translucent ring that floats above other windows - no title bar, no
/// background panel, genuinely see-through at the edges. Drag it anywhere;
/// double-click to close.
/// </summary>
public sealed class FloatingRingWidget : LayeredWindow
{
    private const int Diameter = 132;
    private const int Inset = 10;

    private readonly Func<DashboardSnapshot?> _nextFrame;
    private readonly System.Windows.Forms.Timer _timer;

    /// <summary>Eased towards the real value, so the ring sweeps rather than jumps.</summary>
    private double _shown;
    private double _target;
    // The share of the shift at which the day is done - the gauge turns
    // green here rather than at a full 100%.
    private double _targetFraction = 0.95;
    private double _pulse;
    private bool _hovered;

    public FloatingRingWidget(Func<DashboardSnapshot?> nextFrame)
    {
        _nextFrame = nextFrame;
        Size = new Size(Diameter + Inset * 2, Diameter + Inset * 2);

        // Bottom-right by default, clear of the taskbar.
        var screen = Screen.PrimaryScreen?.WorkingArea ?? new Rectangle(0, 0, 1280, 720);
        Location = new Point(screen.Right - Width - 24, screen.Bottom - Height - 24);

        // ~30fps: smooth enough for an eased sweep, cheap enough to ignore.
        _timer = new System.Windows.Forms.Timer { Interval = 33 };
        _timer.Tick += (_, _) => Step();
        _timer.Start();

        MouseDown += OnMouseDown;
        DoubleClick += (_, _) => Close();
        MouseEnter += (_, _) => _hovered = true;
        MouseLeave += (_, _) => _hovered = false;

        Step();
    }

    private void Step()
    {
        var frame = _nextFrame();
        _target = frame?.Fraction ?? 0;
        _targetFraction = frame?.TargetFraction ?? 0.95;

        // Exponential ease: fast while far, gentle as it settles.
        _shown += (_target - _shown) * 0.12;
        if (Math.Abs(_target - _shown) < 0.0005) _shown = _target;

        _pulse += 0.05;
        if (_pulse > Math.PI * 2) _pulse -= Math.PI * 2;

        Render(frame);
    }

    private void Render(DashboardSnapshot? frame)
    {
        using var bitmap = new Bitmap(Width, Height, PixelFormat.Format32bppArgb);
        using (var g = Graphics.FromImage(bitmap))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAlias;
            g.Clear(Color.Transparent);

            var box = new RectangleF(Inset, Inset, Diameter, Diameter);

            // A soft dark disc so the text stays readable over any wallpaper,
            // without being an opaque panel.
            using (var backdrop = new SolidBrush(Color.FromArgb(_hovered ? 190 : 150, 16, 18, 24)))
                g.FillEllipse(backdrop, box);

            const float thickness = 11f;
            var ring = RectangleF.Inflate(box, -thickness / 2 - 4, -thickness / 2 - 4);

            using (var track = new Pen(Color.FromArgb(90, 255, 255, 255), thickness))
                g.DrawArc(track, ring, 0, 360);

            if (_shown > 0.001)
            {
                var colour = ColourFor(_shown, _targetFraction);

                // A faint glow that breathes while the shift is still running,
                // so the widget reads as live at a glance.
                if (_target < _targetFraction)
                {
                    var glow = (int)(38 + 22 * Math.Sin(_pulse));
                    using var halo = new Pen(Color.FromArgb(glow, colour), thickness + 8);
                    g.DrawArc(halo, ring, -90f, (float)(_shown * 360));
                }

                using var arc = new Pen(colour, thickness)
                {
                    StartCap = LineCap.Round,
                    EndCap = LineCap.Round
                };
                g.DrawArc(arc, ring, -90f, (float)(_shown * 360));
            }

            // No 95% marker: the end of the ring is the 95% exit now.

            DrawText(g, frame);
        }

        SetBitmap(bitmap);
    }

    private void DrawText(Graphics g, DashboardSnapshot? frame)
    {
        var centred = new StringFormat
        {
            Alignment = StringAlignment.Center,
            LineAlignment = StringAlignment.Center
        };

        if (frame is null)
        {
            using var idleFont = new Font("Segoe UI", 9f);
            using var idleBrush = new SolidBrush(Color.FromArgb(190, 230, 232, 236));
            g.DrawString("no shift", idleFont, idleBrush,
                new RectangleF(0, 0, Width, Height), centred);
            return;
        }

        var percent = (int)Math.Round(_shown * 100);

        using var percentFont = new Font("Segoe UI", 21f, FontStyle.Bold);
        using var loggedFont = new Font("Segoe UI", 8.5f);
        using var white = new SolidBrush(Color.White);
        using var dim = new SolidBrush(Color.FromArgb(200, 175, 180, 190));

        g.DrawString($"{percent}%", percentFont, white,
            new RectangleF(0, Height / 2f - 26, Width, 34), centred);
        g.DrawString(frame.Logged, loggedFont, dim,
            new RectangleF(0, Height / 2f + 8, Width, 18), centred);
    }

    private static Color ColourFor(double fraction, double target) => fraction >= target
        ? Color.FromArgb(76, 201, 132)
        : fraction >= target * 0.8
            ? Color.FromArgb(232, 178, 70)
            : Color.FromArgb(220, 96, 96);

    /// <summary>Drag from anywhere, since there is no title bar to grab.</summary>
    private void OnMouseDown(object? sender, MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Left) return;
        ReleaseCapture();
        SendMessage(Handle, WM_NCLBUTTONDOWN, HTCAPTION, 0);
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        _timer.Stop();
        base.OnFormClosing(e);
    }

    private const int WM_NCLBUTTONDOWN = 0xA1;
    private const int HTCAPTION = 0x2;

    [DllImport("user32.dll")]
    private static extern bool ReleaseCapture();

    [DllImport("user32.dll")]
    private static extern IntPtr SendMessage(IntPtr hWnd, int msg, int wParam, int lParam);
}
