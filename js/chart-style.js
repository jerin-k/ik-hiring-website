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
