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

// The popup for a role-banded chart. Hovering ANY part of a coloured section lists EVERY role behind that
// whole section with a count against each — not just the band under the cursor (Jerin, 2026-08-30: "same
// pop while hovering over any gradient of the color").
// The separator lines stay: they are the at-a-glance hint that a section is made of several roles, and this
// is the detail behind that hint. Jerin asked for both.
//
// metrics: the same array passed to roleBandDatasets. Returns a Chart.js tooltip config.
export function roleSectionTooltip(metrics, opts = {}) {
  const { totalLabel = 'Total', extra = null } = opts;
  return {
    // One entry per hovered ROW, not per band — otherwise a bar of twelve bands produces twelve lines.
    filter: (it, i) => i === 0,
    callbacks: {
      title: (items) => items[0].chart.data.labels[items[0].dataIndex],
      label: () => '',
      afterBody: (items) => {
        const chart = items[0].chart, i = items[0].dataIndex;
        const out = [];
        metrics.forEach(M => {
          const bands = chart.data.datasets
            .map((d, di) => ({ d, di }))
            .filter(({ d, di }) => d._m === M.key && chart.isDatasetVisible(di) && (d.data[i] || 0) > 0);
          const total = bands.reduce((a, { d }) => a + (d.data[i] || 0), 0);
          if (!total) return;
          out.push(`${M.label}: ${total}`);
          bands
            .map(({ d }) => ({ t: d._titles[i] || 'role not recorded', n: d.data[i] }))
            .sort((a, b) => b.n - a.n)
            .forEach(x => out.push(`   ${x.t} — ${x.n}`));
        });
        const ex = typeof extra === 'function' ? extra(i, chart) : null;
        if (ex) out.push('', ex);
        return out;
      },
      footer: (items) => {
        const chart = items[0].chart, i = items[0].dataIndex;
        const t = chart.data.datasets.reduce((a, d, di) => a + (chart.isDatasetVisible(di) ? (d.data[i] || 0) : 0), 0);
        return `${totalLabel}: ${t}`;
      }
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
        text: M.label, fillStyle: M.color, strokeStyle: M.color, lineWidth: 0, pointStyle: 'rect',
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

// ===== A colour per category, for charts stacked by recruiter (2026-08-30) =====
// Jerin asked for Momentum to stack by RECRUITER rather than pod — "that many colours possible? :)"
// Yes: 7 recruiters carry arrivals in a typical 30-day window and 12 across a quarter, which is inside what
// stays tellable apart. Beyond that the eye gives up, so the caller names the top CATEGORY_MAX by volume and
// pools the rest into CATEGORY_REST.
// Muted on purpose — these sit beside the site's own palette, not on top of it.
export const CATEGORY_COLORS = [
  '#4E6BA6', '#398AA2', '#938FB8', '#C9A227', '#B45A72', '#5E8C6A',
  '#1E7590', '#A97C50', '#7B79A8', '#C08457', '#6E8FA8', '#8FA65B'
];
export const CATEGORY_MAX = 12;
export const CATEGORY_REST = '#94a3b8';

// ===== Dumbbell: two dots and the distance between them (2026-08-30) =====
// Screening Efficiency was a stacked bar, which showed the split but hid the DROP. A dumbbell draws the
// distance from "added" to "progressed" as a line, so a weak conversion reads as a long bar.
//
// 🚨 The x-axis is REVERSED on purpose (Jerin, 2026-08-30, confirmed): counts run DOWN left→right, which
// puts *added* on the left and *progressed* on the right — funnel order, the way the stage actually runs.
// Do not "fix" the axis to ascending.
//
// rows: [{ label, sub, added, progressed, roles: [{ title, added, progressed }] }]
// One implementation, used by Recruiter Efficiency and Overall Efficiency, so the two cannot drift.
export function buildDumbbell(ctx, rows, opts = {}) {
  const {
    solid = '#4E6BA6', pale = '#C5CFE5', link = '#dbe3ea',
    xTitle = 'Candidates', colHeader = 'PROGRESSED',
    fromLabel = 'added', toLabel = 'progressed'
  } = opts;
  const max = Math.max(1, ...rows.map(r => r.added));
  const rate = (r) => r.added > 0 ? Math.round((r.progressed / r.added) * 100) : null;
  // The connecting line is coloured by the conversion band, so the bar itself says how the stage went
  // rather than being neutral grey (Jerin, 2026-08-30: "a lil more colourful, though with pastels itself").
  // Pastel on purpose — these sit next to the site's own muted palette, they do not compete with it.
  const BAND = { good: '#8FBDB4', watch: '#E3C79A', act: '#E0AAB6', none: '#dbe3ea' };
  const bandOf = (r) => { const v = rate(r); return v == null ? BAND.none : (v >= 50 ? BAND.good : (v >= 20 ? BAND.watch : BAND.act)); };
  const DOT_FROM = '#938FB8';   // added — the muted violet from the site palette
  const DOT_TO = '#398AA2';     // progressed — Blue Munsell, the same green the tables use for a good outcome

  const marks = {
    id: 'dumbbellMarks',
    afterDatasetsDraw(chart) {
      const meta = chart.getDatasetMeta(0), x = chart.scales.x, c = chart.ctx;
      if (!meta || !x) return;
      c.save();
      c.textBaseline = 'middle';
      const colX = chart.chartArea.right + 46;
      c.textAlign = 'center';
      c.fillStyle = '#94a3b8';
      c.font = '600 9px -apple-system, BlinkMacSystemFont, sans-serif';
      c.fillText(colHeader, colX, chart.chartArea.top - 12);
      rows.forEach((r, i) => {
        const bar = meta.data[i]; if (!bar) return;
        const y = bar.y, xa = x.getPixelForValue(r.added), xp = x.getPixelForValue(r.progressed);
        // progressed: solid, with its number inside when the dot is big enough to hold it
        c.beginPath(); c.arc(xp, y, 8, 0, Math.PI * 2); c.fillStyle = DOT_TO; c.fill();
        c.font = '600 10px -apple-system, BlinkMacSystemFont, sans-serif';
        c.fillStyle = '#fff';
        if (r.progressed > 0) c.fillText(String(r.progressed), xp, y);
        // added: hollow, its number outside on the axis side
        c.beginPath(); c.arc(xa, y, 8, 0, Math.PI * 2);
        c.fillStyle = '#fff'; c.fill();
        c.lineWidth = 2.5; c.strokeStyle = DOT_FROM; c.stroke();
        c.font = '600 11px -apple-system, BlinkMacSystemFont, sans-serif';
        c.fillStyle = '#334155'; c.textAlign = 'right';
        c.fillText(String(r.added), xa - 13, y);
        // the rate, in its own labelled column at the right edge
        const v = rate(r);
        if (v != null) {
          c.textAlign = 'center';
          c.fillStyle = v >= 50 ? '#0F6B62' : (v >= 20 ? '#A16207' : '#A15568');
          c.font = '600 12px -apple-system, BlinkMacSystemFont, sans-serif';
          c.fillText(v + '%', colX, y);
        }
      });
      c.restore();
    }
  };

  return new Chart(ctx, {
    type: 'bar',
    data: {
      labels: rows.map(r => r.label),
      datasets: [{
        label: `${fromLabel} → ${toLabel}`,
        data: rows.map(r => [Math.min(r.added, r.progressed), Math.max(r.added, r.progressed)]),
        backgroundColor: rows.map(bandOf), borderWidth: 0, borderRadius: 3,
        barPercentage: 0.16, categoryPercentage: HBAR.categoryPercentage
      }]
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      layout: { padding: { right: 96, left: 26, top: 16 } },
      // Hover anywhere on the row, not just on the thin connector — the dots are drawn by the plugin and
      // are not hit-testable.
      interaction: { axis: 'y', mode: 'index', intersect: false },
      plugins: {
        valueLabels: false, stackTotals: false,
        // ⚠ A dumbbell has one dataset, so Chart.js would draw one meaningless legend entry. These two are
        // synthetic and describe the DOTS — hollow and solid — which is the thing a reader needs the key
        // for. Circles here rather than the site's usual squares because the marks themselves are circles;
        // a square key next to a round dot is worse than the inconsistency.
        legend: {
          position: 'top', align: 'center',
          labels: {
            usePointStyle: true, boxWidth: 10, boxHeight: 10, padding: 16, font: { size: 12 },
            generateLabels: () => [
              { text: fromLabel, pointStyle: 'circle', fillStyle: '#fff', strokeStyle: DOT_FROM, lineWidth: 2.5, hidden: false },
              { text: toLabel, pointStyle: 'circle', fillStyle: DOT_TO, strokeStyle: DOT_TO, lineWidth: 0, hidden: false }
            ]
          },
          onClick: () => {}   // nothing to toggle — both marks come from the same dataset
        },
        tooltip: {
          callbacks: {
            title: (items) => rows[items[0].dataIndex].label,
            label: (it) => {
              const r = rows[it.dataIndex], v = rate(r);
              return `${r.added} ${fromLabel} · ${r.progressed} ${toLabel}${v == null ? '' : ` · ${v}%`}`;
            },
            afterBody: (items) => {
              const r = rows[items[0].dataIndex];
              const list = (r.roles || []).filter(x => x.added > 0).sort((a, b) => b.added - a.added);
              if (!list.length) return '';
              return ['', ...list.map(x => `${x.title}: ${x.added} → ${x.progressed}`)];
            }
          }
        }
      },
      scales: {
        // ⚠ reverse — see the note at the top of this function
        x: { reverse: true, beginAtZero: true, suggestedMax: max, grid: { color: '#f1f5f9' },
             ticks: { font: { size: 11 }, precision: 0 },
             title: { display: true, text: xTitle, font: { size: 11 }, color: '#64748b' } },
        y: { grid: { display: false }, ticks: { font: { size: 11, weight: '500' } } }
      }
    },
    plugins: [marks]
  });
}

// ===== Stage throughput heatmap (2026-08-30) =====
// Jerin, on the single R1→Documentation dumbbell: "not enough dude — need stage wise throughput visualised
// too." So the chart carries BOTH dimensions: department down the side, stage across the top, the
// throughput percentage in each cell and the same figure in the shade. The final column is the overall
// R1 → Documentation span, which is the one number that can be compared across departments without
// double-counting.
//
// 🚨 The stage cells must never be added up. One person passing R1, R2 and R3 appears in all three; each
// cell is only comparable to its own In. That is what the Overall column is for.
//
// rows: [{ label, cells: [{ inN, outN } | null], overall: number|null }]
// cols: [stage label, ...]  - same length as each row's cells
export function buildStageHeat(host, tip, rows, cols, opts = {}) {
  const { overallLabel = 'R1 → DOC' } = opts;
  // The hover words follow the measure. Under the rebuilt definition a cell is "assessed → progressed";
  // under the old reached/cleared it was "entered → left", and calling that "moved past it" is exactly what
  // made a rejection read as a pass. Callers pass the pair that matches the data they handed in.
  const labels = Object.assign(
    { inN: 'assessed at this stage', outN: 'progressed to a later stage', none: 'nobody was assessed here',
      terminal: 'last stage \u2014 nothing after it to progress to' },
    opts.labels || {});
  if (!host) return;
  const esc = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // Offer is the last stage in the ladder, so "progressed" has nowhere to point — it would read 13 → 0 = 0%,
  // which looks like a total collapse rather than the end of the road. Such a cell carries its count and no
  // rate (Jerin's rule: an unmeasurable figure is better left blank than filled with a misleading zero).
  const pctOf = (c) => (c && !c.noRate && c.inN > 0) ? Math.round((c.outN / c.inN) * 100) : null;
  // Pale at nothing, deep at everything — the same teal ramp the Momentum heatmap uses.
  const shade = (v) => {
    if (v == null) return { bg: '#f4f6f8', fg: '#cbd5e1' };
    const t = 0.14 + 0.86 * Math.min(1, v / 100);
    const mix = (a, b) => Math.round(a + (b - a) * t);
    return { bg: `rgb(${mix(238, 30)},${mix(244, 117)},${mix(246, 144)})`, fg: t > 0.55 ? '#fff' : '#334155' };
  };
  const band = (v) => v == null ? '#94a3b8' : (v >= 50 ? '#0F6B62' : (v >= 20 ? '#A16207' : '#A15568'));

  let html = '<div class="sheat-row"><div class="sheat-name sheat-hd"></div>'
    + cols.map(c => `<div class="sheat-cell sheat-hd">${esc(c)}</div>`).join('')
    + `<div class="sheat-ov sheat-hd">${esc(overallLabel)}</div></div>`;
  rows.forEach((r, ri) => {
    html += `<div class="sheat-row"><div class="sheat-name">${esc(r.label)}</div>`;
    r.cells.forEach((c, ci) => {
      const v = pctOf(c);
      const term = !!(c && c.noRate && c.inN > 0);
      // A terminal stage is not an empty one — give it a flat slate fill so it reads as "no rate here",
      // not as "nobody got this far".
      const s = term ? { bg: '#e6ebf0', fg: '#475569' } : shade(v);
      // Each square carries the flow and the rate — "161 → 59" over "37%" (Jerin, 2026-08-30). The two
      // raw numbers are what make the percentage trustworthy; a bare 37% hides whether it came from 161
      // people or from 3.
      html += `<div class="sheat-cell${v == null && !term ? ' none' : ''}" style="background:${s.bg};color:${s.fg}"`
        + ` data-r="${ri}" data-c="${ci}">`
        + (c && c.noRate && c.inN > 0
          ? `<span class="sh-flow">${c.inN} assessed</span><span class="sh-pct">\u2014</span>`
          : v == null ? '\u00b7' : `<span class="sh-flow">${c.inN} \u2192 ${c.outN}</span><span class="sh-pct">${v}%</span>`)
        + '</div>';
    });
    const ov = r.overall;
    // The last square carries the same two lines as the rest — the flow, then the rate (Jerin, 2026-08-30:
    // "in the square, can we have X -> Y & the throughput % below it"). Older callers that pass only a
    // percentage still render, just without the flow line.
    html += `<div class="sheat-ov" style="color:${band(ov)}">`
      + (ov == null ? '—'
        : (r.ovIn != null ? `<span class="sh-flow">${r.ovIn} \u2192 ${r.ovOut}</span>` : '')
          + `<span class="sh-pct">${ov}%</span>`)
      + '</div></div>';
  });
  host.innerHTML = html;

  if (!tip) return;
  host.onmouseover = (e) => {
    const cell = e.target.closest('.sheat-cell');
    if (!cell || cell.classList.contains('sheat-hd') || cell.dataset.r == null) return;
    const r = rows[+cell.dataset.r], c = r.cells[+cell.dataset.c];
    const v = pctOf(c);
    tip.innerHTML = `<div class="tip-hd">${esc(r.label)} · <b>${esc(cols[+cell.dataset.c])}</b></div>`
      + (c && c.noRate && c.inN > 0
        ? `<div class="tip-row"><span>${esc(labels.inN)}</span><span>${c.inN}</span></div>`
          + `<div class="tip-row"><span>${esc(labels.terminal)}</span><span></span></div>`
        : c && c.inN > 0
        ? `<div class="tip-row"><span>${esc(labels.inN)}</span><span>${c.inN}</span></div>`
          + `<div class="tip-row"><span>${esc(labels.outN)}</span><span>${c.outN}</span></div>`
          + `<div class="tip-row"><span>throughput</span><span>${v}%</span></div>`
        : `<div class="tip-row"><span>${esc(labels.none)}</span><span></span></div>`);
    tip.style.display = 'block';
    const wrap = host.parentElement;
    const wb = wrap.getBoundingClientRect(), cb = cell.getBoundingClientRect();
    let left = cb.left - wb.left + cell.offsetWidth / 2 - tip.offsetWidth / 2;
    left = Math.max(0, Math.min(left, wrap.clientWidth - tip.offsetWidth));
    tip.style.left = left + 'px';
    const top = cb.top - wb.top + wrap.scrollTop - tip.offsetHeight - 8;
    tip.style.top = (top < 0 ? cb.top - wb.top + cell.offsetHeight + 8 : top) + 'px';
  };
  host.onmouseout = (e) => {
    if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest('.sheat-cell')) tip.style.display = 'none';
  };
}
