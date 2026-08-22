// ===== Global Chart.js value-label plugin (no CDN; registered once in app.js) =====
// Draws each data point's value on bar/doughnut charts across every tab. Kept deliberately conservative so dense
// charts stay readable: skips zeros, skips bars too thin to label, and inside stacked/arc segments only labels
// pieces big enough to fit the text. Opt out per chart with options.plugins.valueLabels = false.

function fmtVal(v) {
  if (v == null || isNaN(v)) return '';
  const n = Number(v);
  if (Math.abs(n) >= 10000) return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + 'k';
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export const valueLabelsPlugin = {
  id: 'valueLabels',
  afterDatasetsDraw(chart) {
    if (chart.options?.plugins?.valueLabels === false) return;
    const ctx = chart.ctx;
    ctx.save();
    ctx.font = '600 10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    chart.data.datasets.forEach((ds, di) => {
      const meta = chart.getDatasetMeta(di);
      if (meta.hidden) return;
      const type = meta.type || chart.config.type;
      (meta.data || []).forEach((el, i) => {
        if (!el || typeof el.getProps !== 'function') return;
        const raw = ds.data[i];
        // FLOATING bars carry [start, end] — the HM pipeline funnel draws each stage as [-v/2, +v/2] so it
        // reads as a centred funnel. Its value is the SPAN, not either endpoint. Without this branch the
        // funnel silently loses every label (it did, briefly, on 2026-08-22).
        const floating = Array.isArray(raw);
        const v = floating ? (raw[1] - raw[0])
          : ((raw && typeof raw === 'object') ? (raw.v ?? raw.y ?? raw.x) : raw);
        if (v == null || v === 0 || isNaN(v)) return;
        const label = fmtVal(v);
        if (!label) return;

        if (type === 'doughnut' || type === 'pie') {
          const p = el.getProps(['x', 'y', 'startAngle', 'endAngle', 'innerRadius', 'outerRadius'], true);
          if ((p.endAngle - p.startAngle) < 0.28) return;            // skip slivers (~<4.5%)
          const ang = (p.startAngle + p.endAngle) / 2;
          const r = (p.innerRadius + p.outerRadius) / 2;
          ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(label, p.x + Math.cos(ang) * r, p.y + Math.sin(ang) * r);
          return;
        }

        // bar (vertical or horizontal, grouped or stacked)
        const p = el.getProps(['x', 'y', 'base', 'horizontal', 'width', 'height'], true);
        const horizontal = (p.horizontal != null) ? p.horizontal : (chart.options.indexAxis === 'y');
        const valScaleId = horizontal ? 'x' : 'y';
        const stacked = !!chart.options.scales?.[valScaleId]?.stacked;
        const w = ctx.measureText(label).width;

        if (horizontal) {
          if ((p.height || 0) < 8) return;                           // bar too thin to read
          const span = Math.abs(p.x - p.base);
          if (stacked || floating) {
            if (span < w + 6) return;                                // segment too small
            ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(label, (p.x + p.base) / 2, p.y);
          } else {
            ctx.fillStyle = '#475569'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
            ctx.fillText(label, p.x + 3, p.y);
          }
        } else {
          if ((p.width || 0) < 13) return;
          const span = Math.abs(p.base - p.y);
          if (stacked || floating) {
            if (span < 12) return;
            ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(label, p.x, (p.y + p.base) / 2);
          } else {
            ctx.fillStyle = '#475569'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
            ctx.fillText(label, p.x, p.y - 3);
          }
        }
      });
    });
    ctx.restore();
  }
};

// ===== Stack totals =====
// A stacked bar HIDES the number people actually came for: the total. Chart.js has no built-in for it, so this
// draws the sum of the visible segments just past the end of each stack (right edge when horizontal, above the
// column when vertical). It fires on ANY chart whose value axis is stacked, so a new stacked chart inherits it
// without being wired up — the previous version of this lived inside efficiency.js and reached only 2 of the
// ~16 stacked charts in the app, which is exactly the bug it is here to stop repeating.
// Respects legend toggles (hidden datasets drop out of the sum) and opts out via plugins.stackTotals = false.

function stackInfo(chart) {
  const horizontal = chart.options.indexAxis === 'y';
  const stacked = !!chart.options.scales?.[horizontal ? 'x' : 'y']?.stacked;
  return { stacked, horizontal };
}

export const stackTotalsPlugin = {
  id: 'stackTotals',
  // Reserve room so the label is not clipped by the canvas edge. Only ever grows existing padding.
  beforeLayout(chart) {
    if (chart.options?.plugins?.stackTotals === false) return;
    const { stacked, horizontal } = stackInfo(chart);
    if (!stacked) return;
    const lay = chart.options.layout || (chart.options.layout = {});
    let pad = lay.padding;
    if (pad == null) pad = {};
    else if (typeof pad === 'number') pad = { top: pad, right: pad, bottom: pad, left: pad };
    const side = horizontal ? 'right' : 'top';
    pad[side] = Math.max(pad[side] || 0, horizontal ? 34 : 18);
    lay.padding = pad;
  },
  afterDatasetsDraw(chart) {
    if (chart.options?.plugins?.stackTotals === false) return;
    const { stacked, horizontal } = stackInfo(chart);
    if (!stacked) return;
    const ds = chart.data.datasets || [];
    // The OUTER edge of each stack belongs to the last dataset still visible.
    let outer = -1;
    for (let i = 0; i < ds.length; i++) if (!chart.getDatasetMeta(i).hidden) outer = i;
    if (outer < 0) return;
    const meta = chart.getDatasetMeta(outer);
    const ctx = chart.ctx;
    ctx.save();
    ctx.font = '600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#334155';
    (meta.data || []).forEach((el, i) => {
      if (!el || typeof el.getProps !== 'function') return;
      const p = el.getProps(['x', 'y', 'width', 'height'], true);
      // Too cramped to label without colliding with the neighbouring stack.
      if (horizontal ? (p.height || 0) < 8 : (p.width || 0) < 18) return;
      let tot = 0;
      ds.forEach((d, di) => {
        if (chart.getDatasetMeta(di).hidden) return;
        const raw = d.data[i];
        const v = (raw && typeof raw === 'object') ? (raw.v ?? raw.y ?? raw.x) : raw;
        if (v != null && !isNaN(v)) tot += Number(v);
      });
      if (!tot) return;
      if (horizontal) { ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(fmtVal(tot), el.x + 6, el.y); }
      else { ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(fmtVal(tot), el.x, el.y - 4); }
    });
    ctx.restore();
  }
};
