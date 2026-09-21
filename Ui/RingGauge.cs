using System.ComponentModel;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

namespace HoursLoggedNotifier.Ui;

/// <summary>
/// A donut showing how far through something you are. Colour carries the same
/// message as the number, so the state is readable at a glance: red early,
/// amber approaching, green once the 95% mark is passed.
/// </summary>
public sealed class RingGauge : Control
{
    private double _fraction;
    private string _caption = "";
    private string _value = "";

    public RingGauge()
    {
        // Painted entirely by hand, so let the framework skip erasing first.
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint, true);
        Size = new Size(126, 126);
    }

    /// <summary>0 to 1. Values above 1 are clamped so the ring never over-draws.</summary>
    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public double Fraction
    {
        get => _fraction;
        set { _fraction = Math.Clamp(value, 0d, 1d); Invalidate(); }
    }

    /// <summary>Big text in the middle, e.g. "7h 36m".</summary>
    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public string Value
    {
        get => _value;
        set { _value = value; Invalidate(); }
    }

    /// <summary>Small text under the value, e.g. "of 9h 0m".</summary>
    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public string Caption
    {
        get => _caption;
        set { _caption = value; Invalidate(); }
    }

    /// <summary>Fraction at which the ring turns green. Defaults to the 95% rule.</summary>
    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public double GoodThreshold { get; set; } = 0.95;

    private Color ProgressColour => _fraction >= GoodThreshold
        ? Color.FromArgb(76, 201, 132)      // met
        : _fraction >= 0.6
            ? Color.FromArgb(232, 178, 70)  // close
            : Color.FromArgb(220, 96, 96);  // early

    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;

        var thickness = 12f;
        var pad = thickness / 2f + 2f;
        var size = Math.Min(Width, Height) - pad * 2;
        var box = new RectangleF(pad, pad, size, size);

        using (var track = new Pen(Color.FromArgb(48, 52, 62), thickness))
            g.DrawArc(track, box, 0, 360);

        if (_fraction > 0)
        {
            using var arc = new Pen(ProgressColour, thickness) { StartCap = LineCap.Round, EndCap = LineCap.Round };
            g.DrawArc(arc, box, -90f, (float)(_fraction * 360));
        }

        // The 95% marker, so the threshold is visible even when not yet reached.
        if (GoodThreshold is > 0 and < 1)
        {
            var angle = -90f + (float)(GoodThreshold * 360);
            using var tick = new Pen(Color.FromArgb(120, 255, 255, 255), 2f);
            g.DrawArc(tick, box, angle, 1.5f);
        }

        using var valueFont = new Font("Segoe UI", 15f, FontStyle.Bold);
        using var captionFont = new Font("Segoe UI", 8f);
        using var valueBrush = new SolidBrush(Color.White);
        using var captionBrush = new SolidBrush(Color.FromArgb(150, 155, 165));

        var centred = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
        var middle = new RectangleF(0, 0, Width, Height);

        if (string.IsNullOrEmpty(_caption))
        {
            g.DrawString(_value, valueFont, valueBrush, middle, centred);
        }
        else
        {
            g.DrawString(_value, valueFont, valueBrush,
                new RectangleF(0, Height / 2f - 20, Width, 26), centred);
            g.DrawString(_caption, captionFont, captionBrush,
                new RectangleF(0, Height / 2f + 6, Width, 18), centred);
        }
    }
}
