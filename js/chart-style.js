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

// ===== Role bands: a gradient inside each stacked segment (2026-08-29) =====
// Jerin: "bring in the gradient to the department, each gradient being a job."
// A bar is a department (or a recruiter). It stacks two or three metrics. Each of those metrics is split
// again into the ROLES inside it, drawn in shades of that metric's colour — darkest = the biggest role,
// palest = the smallest — so one bar answers "how many, of what, on which roles".
//
// 🔑 One implementation, used by every chart that does this, so they cannot drift apart. Callers pass the
// rows they ALREADY rendered into their table; nothing here recomputes a metric.
//
// ⚠ A metric that can be NEGATIVE must be passed with split:false. The tables clamp such a metric at the
// department level; splitting it lets a −5 role and a +5 role cancel in the table while both count in the
// chart, which is exactly how the Overall Efficiency bar read 53 against its table's 48.

export const ROLE_SLOTS = 10;   // roles drawn individually; the tail is pooled into one band

export function shadeOf(hex, i, n) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  const t = n > 1 ? 0.6 * (i / (n - 1)) : 0;
  const mix = (c) => Math.round(c + (255 - c) * t);
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

// rows:    [{ label, jobs: [{ title, v: {metricKey: number} }], sum: {metricKey: number} }]
// metrics: [{ key, label, color, split }]   split defaults to true
// Returns Chart.js datasets, each tagged _m (metric key) and _titles (role name per row) for the tooltip.
export function roleBandDatasets(rows, metrics, extra = {}) {
  const splitKeys = metrics.filter(m => m.split !== false).map(m => m.key);
  const size = (v) => splitKeys.reduce((s, k) => s + Math.max(0, v[k] || 0), 0);
  const perRow = rows.map(r => {
    const js = (r.jobs || []).filter(x => size(x.v) > 0).sort((a, b) => size(b.v) - size(a.v));
    const head = js.slice(0, ROLE_SLOTS), tail = js.slice(ROLE_SLOTS);
    const slots = head.map(x => ({ title: x.title, v: x.v }));
    if (tail.length) {
      const v = {};
      splitKeys.forEach(k => { v[k] = tail.reduce((a, x) => a + Math.max(0, x.v[k] || 0), 0); });
      slots.push({ title: `${tail.length} other role${tail.length > 1 ? 's' : ''}`, v });
    }
    return slots;
  });
  const nSlots = Math.max(1, ...perRow.map(x => x.length));

  const datasets = [];
  metrics.forEach(M => {
    if (M.split === false) {
      const data = rows.map(r => Math.max(0, r.sum[M.key] || 0));
      if (data.some(v => v > 0)) datasets.push({
        label: M.label, _m: M.key, _titles: rows.map(() => 'across the department'),
        data, backgroundColor: M.color, stack: 'p', borderWidth: 0, ...HBAR, ...extra
      });
      return;
    }
    for (let k = 0; k < nSlots; k++) {
      const data = perRow.map(slots => slots[k] ? Math.max(0, slots[k].v[M.key] || 0) : 0);
      if (!data.some(v => v > 0)) continue;
      datasets.push({
        label: M.label, _m: M.key, _slot: k,
        _titles: perRow.map(slots => slots[k] ? slots[k].title : ''),
        data, backgroundColor: shadeOf(M.color, k, nSlots), stack: 'p', borderWidth: 0, ...HBAR, ...extra
      });
    }
  });
  return datasets;
}

// The number that used to sit inside each segment, kept — but drawn ONCE PER METRIC across all of that
// metric's role bands, not once per band. Jerin, 2026-08-29: "the data label for joined, open etc should be
// retained." Per-band labels would be unreadable at this width; the role name is in the tooltip.
export function metricGroupLabels(metrics) {
  return {
    id: 'metricGroupLabels',
    afterDatasetsDraw(chart) {
      const c = chart.ctx;
      c.save();
      c.font = '600 11px -apple-system, BlinkMacSystemFont, sans-serif';
      c.textBaseline = 'middle';
      c.textAlign = 'center';
      const n = chart.data.labels.length;
      for (let i = 0; i < n; i++) {
        metrics.forEach(M => {
          let lo = Infinity, hi = -Infinity, total = 0, y = 0;
          chart.data.datasets.forEach((d, di) => {
            if (d._m !== M.key || !chart.isDatasetVisible(di)) return;
            const bar = chart.getDatasetMeta(di).data[i];
            if (!bar) return;
            lo = Math.min(lo, bar.base); hi = Math.max(hi, bar.x); y = bar.y;
            total += d.data[i] || 0;
          });
          if (!total || hi - lo < 22) return;
          c.fillStyle = '#fff';
          c.fillText(String(total), (lo + hi) / 2, y);
        });
      }
      c.restore();
    }
  };
}

// Tooltip for a role-banded chart: only the bands that carry something, named by their role.
export function roleBandTooltip(rowTotalLabel = 'Total') {
  return {
    filter: (it) => (it.parsed.x || 0) > 0,
    callbacks: {
      label: (it) => `${it.dataset._titles[it.dataIndex] || 'role not recorded'} — ${it.dataset.label}: ${it.parsed.x}`,
      footer: (items) => items.length
        ? `${rowTotalLabel}: ${items[0].chart.data.datasets.reduce((a, d) => a + (d.data[items[0].dataIndex] || 0), 0)}`
        : ''
    }
  };
}

// A legend of METRICS, not of the dozens of role bands behind them. Clicking one toggles every band of that
// metric together.
export function metricLegend(metrics, base = {}) {
  return {
    position: 'top', align: 'end',
    ...base,
    labels: {
      usePointStyle: true, pointStyle: 'rect', boxWidth: 10, boxHeight: 10, font: { size: 11 }, padding: 10,
      ...(base.labels || {}),
      generateLabels: (chart) => metrics.map(M => ({
        text: M.label, fillStyle: M.color, strokeStyle: M.color, lineWidth: 0,
        hidden: !chart.data.datasets.some((d, i) => d._m === M.key && chart.isDatasetVisible(i)),
        _m: M.key
      }))
    },
    onClick: (e, item, legend) => {
      const chart = legend.chart;
      const on = chart.data.datasets.some((d, i) => d._m === item._m && chart.isDatasetVisible(i));
      chart.data.datasets.forEach((d, i) => { if (d._m === item._m) chart.setDatasetVisibility(i, !on); });
      chart.update();
    }
  };
}
