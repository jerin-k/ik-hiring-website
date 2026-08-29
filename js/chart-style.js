// ===== Shared chart geometry (2026-08-29) =====
// Jerin: "bar width of all horizontal charts to be made similar to chart in fulfilment tab."
// The Fulfilment chart is the reference, and this is the only place those numbers live. Every horizontal
// bar chart on the site reads them from here.
//
// 🔑 Do NOT paste these values into a chart builder. A dozen builders each carrying their own barPercentage
// is exactly how the charts drifted apart in the first place — the same class of problem as a chart that
// recomputes what its table already worked out.

export const HBAR = {
  barPercentage: 0.62,
  categoryPercentage: 0.9,
  rowPx: 46        // vertical space per bar, before chrome
};

// Canvas height for a horizontal bar chart with `rows` bars. `extra` is room for the legend, the axis and
// any heading a chart draws above its plot area.
export function hbarHeight(rows, extra = 90, min = 260) {
  return Math.max(min, rows * HBAR.rowPx + extra);
}

// Spread into a dataset: { ...hbarDataset(), label, data, backgroundColor, ... }
export function hbarDataset() {
  return { barPercentage: HBAR.barPercentage, categoryPercentage: HBAR.categoryPercentage };
}

// ===== The conversion column (2026-08-29) =====
// Jerin: "Joining Conversion % to be at the absolute end of the rectangular box, as in perpendicular to the
// bar. Maybe label it too, at the top of the perpendicular."
// So the percentage stops being a suffix on the bar and becomes its own labelled column at the right edge,
// read straight down like a table column. One implementation, used by the Joining Conversion chart on both
// Recruiter Efficiency and Overall Efficiency, so the two cannot drift apart.
//
// Reserve the room with `layout: { padding: { right: CONV_PAD, top: 20 } }` — the column is drawn in that
// padding, outside the plot area, which is what keeps it clear of the bars at every width.

export const CONV_PAD = 104;

// pcts: one entry per bar, in bar order. null/undefined = nothing to show on that row.
export function drawConvColumn(chart, pcts, header = 'Conversion') {
  const meta = chart.getDatasetMeta(chart.data.datasets.length - 1);
  if (!meta || !meta.data.length) return;
  const c = chart.ctx;
  const right = chart.chartArea.right + CONV_PAD - 12;   // right edge of the column's text
  c.save();
  c.textAlign = 'right';
  c.textBaseline = 'middle';
  c.fillStyle = '#94a3b8';
  c.font = '600 9px -apple-system, BlinkMacSystemFont, sans-serif';
  c.fillText(header.toUpperCase(), right, chart.chartArea.top - 10);
  c.font = '600 11px -apple-system, BlinkMacSystemFont, sans-serif';
  meta.data.forEach((bar, i) => {
    const v = pcts[i];
    if (v == null) return;
    // Same three bands the tables use: healthy, watch, act.
    c.fillStyle = v >= 90 ? '#0F6B62' : (v >= 70 ? '#A16207' : '#A15568');
    c.fillText(v + '%', right, bar.y);
  });
  c.restore();
}
