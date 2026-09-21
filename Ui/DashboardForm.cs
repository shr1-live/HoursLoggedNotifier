using System.Drawing;
using System.Windows.Forms;
using HoursLoggedNotifier.Models;

namespace HoursLoggedNotifier.Ui;

/// <summary>
/// The live status window. Runs on the tray notifier's existing message pump,
/// so it costs no extra thread, and pulls a fresh frame once a second rather
/// than holding any state of its own. Windows-only (see the csproj).
/// </summary>
public sealed class DashboardForm : Form
{
    private static readonly Color Background = Color.FromArgb(24, 26, 32);
    private static readonly Color Panel = Color.FromArgb(32, 35, 43);
    private static readonly Color Dim = Color.FromArgb(150, 155, 165);

    private readonly Func<DashboardSnapshot?> _nextFrame;
    private readonly System.Windows.Forms.Timer _timer;

    private readonly Label _date = Heading();
    private readonly Label _clock = Muted();

    private readonly RingGauge _today = new() { Caption = "today" };
    private readonly RingGauge _office = new() { Caption = "office week" };

    private readonly WeekBarChart _chart = new();

    private readonly Label _officeTarget = Wrapped();
    private readonly Label _week = Wrapped();
    private readonly Label _weekly = Wrapped();
    private readonly Label _exits = Wrapped();

    public DashboardForm(Func<DashboardSnapshot?> nextFrame)
    {
        _nextFrame = nextFrame;

        Text = "Hours Logged";
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(520, 560);
        MinimumSize = new Size(500, 520);
        MaximizeBox = false;
        BackColor = Background;
        ForeColor = Color.Gainsboro;
        Font = new Font("Segoe UI", 9f);

        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(18, 14, 18, 14),
            ColumnCount = 1,
            BackColor = Color.Transparent,
            AutoScroll = true
        };
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

        Add(root, _date);
        Add(root, _clock);
        Add(root, Spacer(10));

        // The two rings: today's shift, and the office-hours week that matters.
        var rings = new TableLayoutPanel
        {
            ColumnCount = 2,
            Height = 150,
            Dock = DockStyle.Fill,
            BackColor = Color.Transparent
        };
        rings.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));
        rings.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));
        _today.Anchor = AnchorStyles.None;
        _office.Anchor = AnchorStyles.None;
        rings.Controls.Add(_today, 0, 0);
        rings.Controls.Add(_office, 1, 0);
        Add(root, rings);

        Add(root, _exits);
        Add(root, Spacer(8));

        Add(root, SectionLabel("This week"));
        _chart.Dock = DockStyle.Fill;
        _chart.BackColor = Panel;
        Add(root, _chart);
        Add(root, Spacer(8));

        Add(root, _officeTarget);
        Add(root, _week);
        Add(root, _weekly);

        Controls.Add(root);

        _timer = new System.Windows.Forms.Timer { Interval = 1000 };
        _timer.Tick += (_, _) => Render();
        _timer.Start();

        Render();
    }

    private void Render()
    {
        var frame = _nextFrame();

        if (frame is null)
        {
            _date.Text = "No shift today";
            _clock.Text = "Paste your shift block in the console, or log a WFH day.";
            _today.Fraction = 0;
            _today.Value = "--";
            _office.Fraction = 0;
            _office.Value = "--";
            _exits.Text = "";
            _officeTarget.Text = _week.Text = _weekly.Text = "";
            _chart.SetDays(Array.Empty<DayBar>(), 9);
            return;
        }

        _date.Text = frame.Date;
        _clock.Text = frame.Clock;

        _today.Fraction = frame.Fraction;
        _today.Value = frame.Logged;

        var officeFraction = frame.OfficeTargetHours > 0
            ? frame.OfficeLoggedHours / frame.OfficeTargetHours
            : 0;
        _office.Fraction = officeFraction;
        _office.Value = FormatHours(frame.OfficeLoggedHours);
        _office.Caption = $"of {FormatHours(frame.OfficeTargetHours)}";

        _exits.Text = $"Entry {frame.Entry}{(string.IsNullOrEmpty(frame.Location) ? "" : $"  ({frame.Location})")}"
                      + $"\n95% exit {frame.Exit95}  {frame.Left95}"
                      + $"\n100% exit {frame.Exit100}  {frame.Left100}"
                      + $"\n{frame.Status}";

        _chart.SetDays(frame.Days, frame.DailyGoalHours);

        _officeTarget.Text = frame.OfficeTargetText;
        _week.Text = frame.WeekSummary;
        _weekly.Text = frame.WeeklyHours;
    }

    private static string FormatHours(double hours)
    {
        var span = TimeSpan.FromHours(hours);
        return $"{(int)span.TotalHours}h {span.Minutes}m";
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        _timer.Stop();
        base.OnFormClosing(e);
    }

    // --- small layout helpers, so the constructor stays readable ---

    private static void Add(TableLayoutPanel layout, Control control)
    {
        var row = layout.RowCount++;
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        if (control is not TableLayoutPanel and not WeekBarChart)
            control.Dock = DockStyle.Fill;
        layout.Controls.Add(control, 0, row);
    }

    private static Label SectionLabel(string text) => new()
    {
        AutoSize = true,
        Text = text,
        ForeColor = Dim,
        Font = new Font("Segoe UI Semibold", 9f, FontStyle.Bold)
    };

    private static Label Heading() => new()
    {
        AutoSize = true,
        Font = new Font("Segoe UI Semibold", 16f, FontStyle.Bold),
        ForeColor = Color.White
    };

    private static Label Muted() => new() { AutoSize = true, ForeColor = Dim };

    private static Label Wrapped() => new()
    {
        AutoSize = true,
        MaximumSize = new Size(470, 0),
        ForeColor = Color.FromArgb(185, 190, 200)
    };

    private static Control Spacer(int height) => new Panel { Height = height, BackColor = Color.Transparent };
}
