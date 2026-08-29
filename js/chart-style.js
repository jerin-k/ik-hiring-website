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

// ===== Role bands: one solid colour, bevelled, roles marked by a chiselled groove (2026-08-29) =====
// First built as a gradient — every role a different tint. Jerin: "the gradient is making it confusing;
// can you change it to self coloured line separators?" So each metric is now ONE flat colour and the roles
// inside it are divided by a thin line 12% darker than the bar.
// Four designs were mocked up (flat 8%, flat 12%, a bevelled bar with chiselled grooves, and extruded
// blocks). The bevel was chosen from the mock-up, built, and then dropped on sight of the real charts —
// "that's looking ugly dude". The flat 12% line is what shipped. Do not reintroduce the bevel.
//
// 🔑 One implementation, used by every chart that does this, so they cannot drift apart. Callers pass the
// rows they ALREADY rendered into their table; nothing here recomputes a metric.
//
// ⚠ A metric that can be NEGATIVE must be passed with split:false. The tables clamp such a metric at the
// row level; splitting it lets a −5 role and a +5 role cancel in the table while both count in the chart,
// which is exactly how the Overall Efficiency bar read 53 against its table's 48.

export const ROLE_SLOTS = 10;         // roles drawn individually; the rest pool into one final band
export const ROLE_MIN_SHARE = 0.03;   // a role under 3% of the row pools too — see below
export const SEP_MIN_PX = 7;          // no separator closer than this to the last one — see roleBandOverlay
export const SEP_DARKEN = 0.12;       // the separator, one shade darker than the bar (Jerin's pick)

// One shade darker than the bar, for the separator line.
export function darken(hex, f) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  const d = (c) => Math.round(c * (1 - f));
  return `rgb(${d(r)},${d(g)},${d(b)})`;
}

// rows:    [{ label, jobs: [{ title, v: {metricKey: number} }], sum: {metricKey: number} }]
// metrics: [{ key, label, color, split }]   split defaults to true
// Returns Chart.js datasets, each tagged _m (metric key) and _titles (role name per row) for the tooltip.
export function roleBandDatasets(rows, metrics, extra = {}) {
  const splitKeys = metrics.filter(m => m.split !== false).map(m => m.key);
  const size = (v) => splitKeys.reduce((s, k) => s + Math.max(0, v[k] || 0), 0);
  const perRow = rows.map(r => {
    const js = (r.jobs || []).filter(x => size(x.v) > 0).sort((a, b) => size(b.v) - size(a.v));
    // ⚠ Roles too thin to see are POOLED, not dropped (Jerin, 2026-08-29). Without this the tail of a long
    // bar turns into hatching — SME - US had four roles of 2, 1, 1, 1 inside a section of 62. The pooled
    // band keeps every person in the bar, so the totals are untouched and only the grooves get simpler.
    const rowTotal = js.reduce((a, x) => a + size(x.v), 0);
    const floor = rowTotal * ROLE_MIN_SHARE;
    const head = js.filter((x, i) => i < ROLE_SLOTS && size(x.v) >= floor);
    const tail = js.filter(x => head.indexOf(x) < 0);
    const slots = head.map(x => ({ title: x.title, v: x.v }));
    if (tail.length) {
      const v = {};
      splitKeys.forEach(k => { v[k] = tail.reduce((a, x) => a + Math.max(0, x.v[k] || 0), 0); });
      slots.push({ title: `${tail.length} smaller role${tail.length > 1 ? 's' : ''}`, v });
    }
    return slots;
  });
  const nSlots = Math.max(1, ...perRow.map(x => x.length));

  const datasets = [];
  metrics.forEach(M => {
    if (M.split === false) {
      const data = rows.map(r => Math.max(0, r.sum[M.key] || 0));
      if (data.some(v => v > 0)) datasets.push({
        label: M.label, _m: M.key, _c: M.color, _titles: rows.map(() => 'across the whole row'),
        data, backgroundColor: M.color, stack: 'p', borderWidth: 0, ...HBAR, ...extra
      });
      return;
    }
    for (let k = 0; k < nSlots; k++) {
      const data = perRow.map(slots => slots[k] ? Math.max(0, slots[k].v[M.key] || 0) : 0);
      if (!data.some(v => v > 0)) continue;
      datasets.push({
        label: M.label, _m: M.key, _slot: k, _c: M.color,
        _titles: perRow.map(slots => slots[k] ? slots[k].title : ''),
        data, backgroundColor: M.color, stack: 'p', borderWidth: 0, ...HBAR, ...extra
      });
    }
  });
  return datasets;
}

// Drawn on top of the bars:
//   · a SEPARATOR at every internal role boundary, 12% darker than the bar itself;
//   · the metric's NUMBER, once across all of that metric's bands rather than on each one.
//
// The number is kept per metric, not per band: "the data label for joined, open etc should be retained"
// (Jerin, 2026-08-29), and one number per band is unreadable at this width. The role name is in the
// tooltip.
export function roleBandOverlay(metrics) {
  return {
    id: 'roleBandOverlay',
    afterDatasetsDraw(chart) {
      const c = chart.ctx;
      c.save();
      c.textBaseline = 'middle';
      const n = chart.data.labels.length;
      for (let i = 0; i < n; i++) {
        metrics.forEach(M => {
          let lo = Infinity, hi = -Infinity, total = 0, y = 0, h = 0;
          const edges = [];
          chart.data.datasets.forEach((d, di) => {
            if (d._m !== M.key || !chart.isDatasetVisible(di)) return;
            const bar = chart.getDatasetMeta(di).data[i];
            if (!bar) return;
            lo = Math.min(lo, bar.base); hi = Math.max(hi, bar.x); y = bar.y; h = bar.height || 18;
            total += d.data[i] || 0;
            if ((d.data[i] || 0) > 0) edges.push(bar.x);
          });
          if (!total || hi <= lo) return;
          const top = y - h / 2, bot = y + h / 2;

          // ⚠ Guarded on PIXELS, not on the numbers. The 3% pooling above keeps a long bar's tail readable,
          // but it is proportional — on a SHORT bar (Operations, 11 people against an axis of 100) five
          // roles land 2px apart and the separators close up into hatching. A boundary is only drawn when
          // there is real room since the last one; the roles are all still there, and the tooltip still
          // names them. Found on the live chart, not in the mock-up.
          let prev = lo;
          c.lineWidth = 1.5;
          c.strokeStyle = darken(M.color, SEP_DARKEN);
          edges.sort((a, b) => a - b).slice(0, -1).forEach(x => {
            if (x - prev < SEP_MIN_PX) return;
            prev = x;
            c.beginPath(); c.moveTo(x, top + 1); c.lineTo(x, bot - 1); c.stroke();
          });

          if (hi - lo < 22) return;
          c.font = '600 11px -apple-system, BlinkMacSystemFont, sans-serif';
          c.textAlign = 'center';
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
