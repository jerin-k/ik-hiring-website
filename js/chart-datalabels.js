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
        const v = (raw && typeof raw === 'object') ? (raw.v ?? raw.y ?? raw.x) : raw;
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
          if (stacked) {
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
          if (stacked) {
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
