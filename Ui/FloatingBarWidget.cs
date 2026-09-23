using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using HoursLoggedNotifier.Models;

namespace HoursLoggedNotifier.Ui;

public enum BarOrientation
{
    Vertical,
    Horizontal
}

/// <summary>
/// A thin progress line that floats above other windows. Unlike a browser
/// picture-in-picture window, which the browser will not shrink below a few
/// hundred pixels, this really is only a line wide.
/// </summary>
public sealed class FloatingBarWidget : LayeredWindow
{
    private const int Thickness = 16;   // the line plus a little breathing room
    private const int Length = 420;
    private const int LabelSpace = 34;  // room for the percentage at one end

    private readonly Func<DashboardSnapshot?> _nextFrame;
    private readonly System.Windows.Forms.Timer _timer;
    private readonly BarOrientation _orientation;

    private double _shown;
    private double _target;
    // The share of the shift at which the day is done - the gauge turns
    // green here rather than at a full 100%.
    private double _targetFraction = 0.95;
    private double _pulse;

    public FloatingBarWidget(Func<DashboardSnapshot?> nextFrame, BarOrientation orientation)
    {
        _nextFrame = nextFrame;
        _orientation = orientation;

        Size = orientation == BarOrientation.Vertical
            ? new Size(Thickness + 26, Length + LabelSpace)
            : new Size(Length + LabelSpace + 26, Thickness + 14);

        var screen = Screen.PrimaryScreen?.WorkingArea ?? new Rectangle(0, 0, 1280, 720);
        Location = orientation == BarOrientation.Vertical
            ? new Point(screen.Right - Width - 12, screen.Top + (screen.Height - Height) / 2)
            : new Point(screen.Left + (screen.Width - Width) / 2, screen.Bottom - Height - 12);

        _timer = new System.Windows.Forms.Timer { Interval = 33 };
        _timer.Tick += (_, _) => Step();
        _timer.Start();

        MouseDown += OnMouseDown;
        DoubleClick += (_, _) => Close();

        Step();
    }

    private void Step()
    {
        var frame = _nextFrame();
        _target = frame?.Fraction ?? 0;
        _targetFraction = frame?.TargetFraction ?? 0.95;

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

            var colour = ColourFor(_shown, _targetFraction);
            var track = TrackBounds();

            using (var trackBrush = new SolidBrush(Color.FromArgb(120, 90, 96, 110)))
                FillRounded(g, trackBrush, track);

            if (_shown > 0.001)
            {
                var fill = FillBounds(track);

                // A breathing glow while the shift is running, so the line
                // reads as live rather than as a static decoration.
                if (_target < _targetFraction)
                {
                    var glow = (int)(40 + 24 * Math.Sin(_pulse));
                    using var halo = new SolidBrush(Color.FromArgb(glow, colour));
                    FillRounded(g, halo, RectangleF.Inflate(fill, 3f, 3f));
                }

                using var fillBrush = new SolidBrush(colour);
                FillRounded(g, fillBrush, fill);
            }
            DrawLabel(g, frame);
        }

        SetBitmap(bitmap);
    }

    private RectangleF TrackBounds() => _orientation == BarOrientation.Vertical
        ? new RectangleF((Width - 10) / 2f, LabelSpace, 10, Length)
        : new RectangleF(LabelSpace, (Height - 10) / 2f, Length, 10);

    /// <summary>Vertical fills from the bottom up; horizontal from the left.</summary>
    private RectangleF FillBounds(RectangleF track)
    {
        if (_orientation == BarOrientation.Vertical)
        {
            var height = (float)(_shown * track.Height);
            return new RectangleF(track.X, track.Bottom - height, track.Width, height);
        }

        return new RectangleF(track.X, track.Y, (float)(_shown * track.Width), track.Height);
    }

        private void DrawLabel(Graphics g, DashboardSnapshot? frame)
    {
        using var font = new Font("Segoe UI", 9f, FontStyle.Bold);
        using var brush = new SolidBrush(frame is null
            ? Color.FromArgb(190, 210, 214, 220)
            : ColourFor(_shown, _targetFraction));

        var centred = new StringFormat
        {
            Alignment = StringAlignment.Center,
            LineAlignment = StringAlignment.Center
        };

        var text = frame is null ? "--" : $"{(int)Math.Round(_shown * 100)}%";

        var area = _orientation == BarOrientation.Vertical
            ? new RectangleF(0, 0, Width, LabelSpace)
            : new RectangleF(0, 0, LabelSpace, Height);

        g.DrawString(text, font, brush, area, centred);
    }

    private static Color ColourFor(double fraction, double target) => fraction >= target
        ? Color.FromArgb(76, 201, 132)
        : fraction >= target * 0.8
            ? Color.FromArgb(232, 178, 70)
            : Color.FromArgb(220, 96, 96);

    /// <summary>Rounded ends, so the line reads as a bar rather than a rectangle.</summary>
    private static void FillRounded(Graphics g, Brush brush, RectangleF rect)
    {
        var radius = Math.Min(rect.Width, rect.Height) / 2f;
        if (radius <= 0.5f)
        {
            if (rect.Width > 0 && rect.Height > 0) g.FillRectangle(brush, rect);
            return;
        }

        using var path = new GraphicsPath();
        var diameter = radius * 2;
        path.AddArc(rect.X, rect.Y, diameter, diameter, 180, 90);
        path.AddArc(rect.Right - diameter, rect.Y, diameter, diameter, 270, 90);
        path.AddArc(rect.Right - diameter, rect.Bottom - diameter, diameter, diameter, 0, 90);
        path.AddArc(rect.X, rect.Bottom - diameter, diameter, diameter, 90, 90);
        path.CloseFigure();
        g.FillPath(brush, path);
    }

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
