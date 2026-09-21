using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;
using HoursLoggedNotifier.Models;

namespace HoursLoggedNotifier.Ui;

/// <summary>
/// Monday to Friday side by side, so the week's shape is obvious at a glance -
/// which days are short, which are WFH, and where today sits against the rest.
/// </summary>
public sealed class WeekBarChart : Control
{
    private IReadOnlyList<DayBar> _days = Array.Empty<DayBar>();
    private double _goalHours = 9;

    public WeekBarChart()
    {
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint, true);
        Height = 130;
    }

    /// <summary>One bar per weekday.</summary>
    public void SetDays(IReadOnlyList<DayBar> days, double goalHours)
    {
        _days = days;
        _goalHours = goalHours <= 0 ? 9 : goalHours;
        Invalidate();
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;

        if (_days.Count == 0) return;

        const int labelHeight = 30;
        var plotHeight = Height - labelHeight;
        if (plotHeight <= 10) return;

        // Scale to the goal, or to the tallest bar when someone has overshot.
        var max = Math.Max(_goalHours, _days.Max(d => d.Hours));
        if (max <= 0) max = _goalHours;

        var slot = (float)Width / _days.Count;
        var barWidth = Math.Min(slot * 0.5f, 34f);

        // The daily-goal line, so a short day is visible rather than inferred.
        var goalY = plotHeight - (float)(_goalHours / max) * (plotHeight - 8);
        using (var goalPen = new Pen(Color.FromArgb(70, 255, 255, 255), 1f) { DashStyle = DashStyle.Dash })
            g.DrawLine(goalPen, 0, goalY, Width, goalY);

        using var labelFont = new Font("Segoe UI", 8f);
        using var valueFont = new Font("Segoe UI", 7.5f);
        using var labelBrush = new SolidBrush(Color.FromArgb(150, 155, 165));
        using var todayBrush = new SolidBrush(Color.White);
        var centred = new StringFormat { Alignment = StringAlignment.Center };

        for (var i = 0; i < _days.Count; i++)
        {
            var day = _days[i];
            var centreX = slot * i + slot / 2f;
            var left = centreX - barWidth / 2f;

            if (day.Hours > 0)
            {
                var barHeight = Math.Max((float)(day.Hours / max) * (plotHeight - 8), 3f);
                var rect = new RectangleF(left, plotHeight - barHeight, barWidth, barHeight);

                using var brush = new SolidBrush(ColourFor(day));
                FillRounded(g, brush, rect, 4f);

                g.DrawString(FormatHours(day.Hours), valueFont, labelBrush,
                    new RectangleF(centreX - slot / 2f, plotHeight - barHeight - 15, slot, 14), centred);
            }
            else
            {
                // An empty slot still gets a stub, so the day is not simply missing.
                var rect = new RectangleF(left, plotHeight - 3f, barWidth, 3f);
                using var brush = new SolidBrush(Color.FromArgb(52, 56, 66));
                FillRounded(g, brush, rect, 1.5f);
            }

            g.DrawString(day.Label, labelFont, day.IsToday ? todayBrush : labelBrush,
                new RectangleF(centreX - slot / 2f, plotHeight + 5, slot, 16), centred);

            if (day.IsWfh)
                g.DrawString("WFH", valueFont, labelBrush,
                    new RectangleF(centreX - slot / 2f, plotHeight + 19, slot, 14), centred);
        }
    }

    private static Color ColourFor(DayBar day)
    {
        if (day.IsWfh) return Color.FromArgb(120, 140, 220);   // distinct from office
        return day.IsToday ? Color.FromArgb(120, 200, 255) : Color.FromArgb(76, 160, 210);
    }

    private static string FormatHours(double hours)
    {
        var span = TimeSpan.FromHours(hours);
        return span.Minutes == 0 ? $"{(int)span.TotalHours}h" : $"{(int)span.TotalHours}h{span.Minutes:00}";
    }

    private static void FillRounded(Graphics g, Brush brush, RectangleF rect, float radius)
    {
        if (rect.Height <= radius * 2)
        {
            g.FillRectangle(brush, rect);
            return;
        }

        using var path = new GraphicsPath();
        path.AddArc(rect.X, rect.Y, radius * 2, radius * 2, 180, 90);
        path.AddArc(rect.Right - radius * 2, rect.Y, radius * 2, radius * 2, 270, 90);
        path.AddLine(rect.Right, rect.Bottom, rect.X, rect.Bottom);
        path.CloseFigure();
        g.FillPath(brush, path);
    }
}
