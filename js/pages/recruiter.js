import { podOf, POD_OPTIONS, isSalesPod, capacityOf, currentQuarter, qKey } from '../recruiter-pods.js';
import { defsBlock } from '../definitions.js';
import { scoreForRole } from '../score-model.js';
import { TIS_STAGES, poolHists, tisCell, periodQuarters, hasQuarterTis, tisHist, APP_REVIEW_LIVE_NOTE } from '../stage-time.js';
import { HBAR, hbarHeight, CONV_PAD, drawConvColumn, roleBandDatasets, roleBandOverlay, metricLegend,
         darken, SEP_DARKEN } from '../chart-style.js';

const POD_ORDER = [...POD_OPTIONS, 'Unassigned'];

// ===== DROP (unified, 2026-08-26) =====
// Jerin's definition: moved to Ref Check / Documentation / Offer in a quarter (earliest of the three) and
// was then archived. The pipeline emits `dropEvents` already DEDUPED BY APPLICATION with one date each, so
// a candidate who bounced into the Offer stage three times counts once.
// It merges two sources: archived offer records, and archived applications that reached those stages with
// NO offer ever raised - 17 people who were invisible before (Q2 alone went from 20 drops to 30).
// ⚠ Falls back to the old offer-only filter when `dropEvents` is absent, so the tab still works against a
// data file written before this shipped. The fallback UNDERCOUNTS; it is a bridge, not an equivalent.
function dropRows(data) {
  if (data.dropEvents && data.dropEvents.length) return data.dropEvents;
  return (data.offerEvents || [])
    .filter(e => e.appStatus === 'Archived')
    .map(e => ({ jobId8: e.jobId8, jobTitle: e.jobTitle, department: e.department, recruiter: e.recruiter,
                 level: e.level, complexity: e.complexity, quarter: e.attrQuarter, source: 'offer' }));
}


function pct(num, den) {
  if (!den) return '0.0';
  return ((num / den) * 100).toFixed(1);
}
function pctClass(val) {
  const n = parseFloat(val);
  if (n >= 50) return 'good';
  if (n >= 20) return 'pct';
  if (n > 0) return 'warn';
  return 'zero';
}
const CARET = '<span class="caret" style="display:inline-block;width:14px;color:var(--muted)">▸</span>';
const DASH = '<span class="zero">—</span>';
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function last7Dates() {
  const out = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) { const x = new Date(today); x.setDate(today.getDate() - i); out.push(x); }
  return out;
}

// Collapse/expand a 2-level Pod -> recruiter tree.
function wirePodTree(tbody) {
  tbody.querySelectorAll('tr.pod-header').forEach(h => {
    h.addEventListener('click', () => {
      const g = h.dataset.g;
      const exp = h.dataset.exp === '1';
      h.dataset.exp = exp ? '0' : '1';
      const c = h.querySelector('.caret'); if (c) c.textContent = exp ? '▸' : '▾';
      tbody.querySelectorAll(`tr.leaf[data-g="${g}"]`).forEach(r => { r.style.display = exp ? 'none' : ''; });
    });
  });
  if (document.getElementById('recExpandAll')?.checked) {
    tbody.querySelectorAll('tr.pod-header').forEach(h => {
      h.dataset.exp = '1';
      const c = h.querySelector('.caret'); if (c) c.textContent = '▾';
      tbody.querySelectorAll(`tr.leaf[data-g="${h.dataset.g}"]`).forEach(r => { r.style.display = ''; });
    });
  }
}

// Collapse/expand a 3-level Pod -> Recruiter -> Job tree (Screening Efficiency, Time in Process).
// Momentum used to use it too; it moved to the generic wireTreePath when it stopped having stage rows.
function wireVelTree(tbody) {
  tbody.querySelectorAll('tr.lvl-pod').forEach(h => {
    h.addEventListener('click', () => {
      const pi = h.dataset.pod;
      const exp = h.dataset.exp === '1';
      h.dataset.exp = exp ? '0' : '1';
      const c = h.querySelector('.caret'); if (c) c.textContent = exp ? '▸' : '▾';
      tbody.querySelectorAll(`tr.lvl-rec[data-pod="${pi}"]`).forEach(r => {
        r.style.display = exp ? 'none' : '';
        if (exp) { r.dataset.exp = '0'; const rc = r.querySelector('.caret'); if (rc) rc.textContent = '▸'; }
      });
      if (exp) tbody.querySelectorAll(`tr.lvl-stage[data-pod="${pi}"]`).forEach(s => { s.style.display = 'none'; });
    });
  });
  tbody.querySelectorAll('tr.lvl-rec').forEach(h => {
    h.addEventListener('click', () => {
      const rk = h.dataset.rec;
      const exp = h.dataset.exp === '1';
      h.dataset.exp = exp ? '0' : '1';
      const c = h.querySelector('.caret'); if (c) c.textContent = exp ? '▸' : '▾';
      tbody.querySelectorAll(`tr.lvl-stage[data-parent-rec="${rk}"]`).forEach(s => { s.style.display = exp ? 'none' : ''; });
    });
  });
  if (document.getElementById('recExpandAll')?.checked) {
    tbody.querySelectorAll('tr.lvl-pod').forEach(h => { h.dataset.exp = '1'; const c = h.querySelector('.caret'); if (c) c.textContent = '▾'; });
    tbody.querySelectorAll('tr.lvl-rec').forEach(r => { r.style.display = ''; r.dataset.exp = '1'; const c = r.querySelector('.caret'); if (c) c.textContent = '▾'; });
    tbody.querySelectorAll('tr.lvl-stage').forEach(s => { s.style.display = ''; });
  }
}

function groupByPod(recs, quarter) {
  const g = {};
  recs.forEach(r => { const p = podOf(r.name, quarter); (g[p] || (g[p] = [])).push(r); });
  return POD_ORDER.filter(p => g[p] && g[p].length).map(p => ({ pod: p, recs: g[p] }));
}

// Generic N-level collapsible tree. Each row: data-path ("0", "0-1", "0-1-2"…), data-haschild for
// expandable rows. Clicking shows only direct children; collapsing hides + resets all descendants.
function wireTreePath(tbody) {
  tbody.querySelectorAll('tr[data-haschild]').forEach(row => {
    row.addEventListener('click', () => {
      const path = row.dataset.path, depth = path.split('-').length;
      const exp = row.dataset.exp === '1';
      row.dataset.exp = exp ? '0' : '1';
      const c = row.querySelector('.caret'); if (c) c.textContent = exp ? '▸' : '▾';
      tbody.querySelectorAll('tr[data-path]').forEach(r => {
        const p = r.dataset.path;
        if (!p || p === path || !p.startsWith(path + '-')) return;
        const d = p.split('-').length;
        if (exp) { r.style.display = 'none'; if (d > depth) { r.dataset.exp = '0'; const rc = r.querySelector('.caret'); if (rc) rc.textContent = '▸'; } }
        else if (d === depth + 1) { r.style.display = ''; }
      });
    });
  });
  if (document.getElementById('recExpandAll')?.checked) {
    tbody.querySelectorAll('tr[data-path]').forEach(r => { r.style.display = ''; if (r.dataset.haschild) { r.dataset.exp = '1'; const c = r.querySelector('.caret'); if (c) c.textContent = '▾'; } });
  }
}

// ===== manual targets (Position Fulfilment) persisted per browser =====
const T_KEY = 'ik_recruiter_targets';
function loadTargets() { try { return JSON.parse(localStorage.getItem(T_KEY) || '{}'); } catch (e) { return {}; } }
function targetOf(name, type) { const t = loadTargets(); return (t[name] && t[name][type] != null) ? t[name][type] : 0; }
function saveTarget(name, type, val) {
  const t = loadTargets();
  if (!t[name]) t[name] = {};
  t[name][type] = val;
  localStorage.setItem(T_KEY, JSON.stringify(t));
}

let recScreenChart = null, recJoinChart = null, recFulfilChart = null, recSourceChart = null;

// Metric Configuration (pods/capacity/score grid/dept-family) now lives in Admin → Metric Configuration
// (admin.js). This tab only READS pods + capacity via recruiter-pods.js.

export function renderRecruiter(data) {
  if (!data || !data.recruiters || data.recruiters.length === 0) {
    return `
      <h2 class="section-title">Recruiter Efficiency</h2>
      <div class="card" style="text-align:center;padding:2rem;">
        <p style="color:var(--muted);font-size:13px;">Recruiter data not yet available.</p>
      </div>`;
  }

  const cy = new Date().getFullYear();
  const years = [];
  for (let y = Math.max(cy, 2026); y >= 2026; y--) years.push(y);

  return `
    <style>
      .rec-subtabs { display:flex; gap:2px; flex-wrap:wrap; border-bottom:1px solid var(--border); margin-bottom:20px; }
      .rec-subtab { appearance:none; background:none; border:none; padding:9px 16px; font-size:13px; font-weight:500;
        color:var(--muted); cursor:pointer; border-bottom:2px solid transparent; margin-bottom:-1px; }
      .rec-subtab:hover { color:var(--text); }
      .rec-subtab.active { color:var(--accent); border-bottom-color:var(--accent); font-weight:600; }

      /* ===== Momentum heatmap (2026-08-30) — recruiter x day, one cell per day =====
         Deliberately HTML rather than a canvas chart: the cell grid IS a table of counts, and the hover
         needs to list every role behind a cell, which a canvas tooltip renders badly. */
      .tofu-heat-wrap { position:relative; margin:0 0 22px; overflow-x:auto; }
      .tofu-heat { display:inline-block; min-width:100%; }
      .heat-row { display:flex; align-items:center; gap:2px; margin-bottom:3px; }
      .heat-name { width:190px; min-width:190px; font-size:12.5px; color:var(--text); text-align:right;
        padding-right:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .heat-cell { width:26px; height:26px; border-radius:3px; background:#f4f6f8; font-size:11px; font-weight:500;
        display:flex; align-items:center; justify-content:center; color:#334155; flex:0 0 auto; }
      .heat-cell.has { cursor:default; }
      .heat-cell.wknd { background:#eef1f4; }
      .heat-tot { width:44px; min-width:44px; text-align:center; font-size:13px; font-weight:600; color:var(--text); }
      .heat-hd { font-size:10.5px; color:var(--muted); height:16px; }
      .heat-hd.wknd { color:#C08497; }
      .heat-foot .heat-cell { background:none; color:var(--muted); font-weight:400; height:20px; }
      .heat-foot .heat-name { font-size:11.5px; color:var(--muted); }
      .heat-scale { display:flex; align-items:center; gap:4px; font-size:11px; color:var(--muted); margin-top:10px; padding-left:190px; }
      .heat-scale i { width:18px; height:18px; border-radius:3px; display:inline-block; }
      .heat-tip { position:absolute; z-index:40; pointer-events:none; display:none; background:#fff;
        border:1px solid var(--border); border-radius:6px; box-shadow:0 6px 18px rgba(15,23,42,0.13);
        padding:9px 11px; font-size:11.5px; color:var(--text); max-width:320px; }
      .heat-tip b { font-weight:600; }
      .heat-tip .tip-hd { font-size:11px; color:var(--muted); margin-bottom:5px; }
      .heat-tip .tip-row { display:flex; justify-content:space-between; gap:14px; line-height:1.6; }
      .heat-tip .tip-row span:last-child { font-weight:600; }

      /* nested tab strip INSIDE Data Hygiene — pill style, deliberately distinct from the
         outer underline tabs so two levels of tabs don't read as one row */
      .hyg-tabs { display:flex; gap:6px; flex-wrap:wrap; margin:4px 0 16px; }
      .hyg-tab { appearance:none; background:var(--card); border:1px solid var(--border); border-radius:999px;
        padding:6px 14px; font-size:12px; font-weight:500; color:var(--muted); cursor:pointer; }
      .hyg-tab:hover { color:var(--text); border-color:#cbd5e1; }
      .hyg-tab.active { background:var(--accent); border-color:var(--accent); color:#fff; font-weight:600; }
      .hyg-tab .n { font-weight:700; margin-left:6px; }
      .hyg-head { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; margin:0 0 6px; }
      .hyg-dl { appearance:none; background:var(--card); border:1px solid var(--border); border-radius:6px;
        padding:5px 12px; font-size:11px; font-weight:600; color:var(--muted); cursor:pointer; white-space:nowrap; }
      .hyg-dl:hover { color:var(--text); border-color:#cbd5e1; }

      /* consolidated filter block (matches HM) */
      .rec-filters { background:#e4eaf4; border:1px solid #c3d0e8; border-radius:12px; padding:14px 18px; margin-bottom:18px;
        display:flex; flex-wrap:wrap; align-items:center; gap:14px; box-shadow:0 1px 2px rgba(15,23,42,0.06); }
      .rec-filters select, .rec-filters input[type=date], .rec-filters input[type=text] {
        appearance:none; -webkit-appearance:none; height:34px; padding:0 11px; border:1px solid var(--border);
        border-radius:8px; font-size:12px; font-weight:500; background:var(--card); color:var(--text); }
      .rec-filters select { padding-right:28px; cursor:pointer;
        background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%2364748b' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
        background-repeat:no-repeat; background-position:right 10px center; }
      .rec-filters select:hover, .rec-filters input:hover { border-color:var(--muted); }
      .rec-filters select:focus, .rec-filters input:focus { outline:none; border-color:var(--accent); box-shadow:0 0 0 3px rgba(78,107,166,0.16); }
      .rec-filters .fchip { display:flex; align-items:center; gap:7px; }
      .rec-filters .fchip > span.lbl { font-size:11px; font-weight:700; color:var(--accent); text-transform:uppercase; letter-spacing:0.04em; }
      .rec-filters .fchip > label.opt { font-size:12px; font-weight:500; display:flex; align-items:center; gap:4px; cursor:pointer; color:var(--text) }
      .rec-filters .fdiv { width:1px; align-self:stretch; background:#cdddf7; margin:2px 2px; }

      /* Velocity table — freeze the first two columns (Pod/Recruiter/Stage + Total-15) */
      .vel-table { width:auto; min-width:100%; border-collapse:separate; border-spacing:0; overflow:visible; }
      .vel-table th, .vel-table td { white-space:nowrap; }
      /* ===== Momentum grid, design pass 2026-08-29 (look only — no columns, rows or figures changed) ===== */
      /* Tighter rhythm: 30 day-columns at the global 8px/12px padding pushed the grid wider than it needed
         to be and made the sparse cells feel emptier than they are. */
      .vel-table th { padding:8px 9px; letter-spacing:0.02em; }
      .vel-table td { padding:6px 9px; }
      /* A real number should read louder than an empty cell. Dots stay faint; values get their weight back. */
      .vel-table tbody td { color:var(--text-secondary); }
      .vel-table tbody td:not(:first-child) { font-weight:500; font-variant-numeric:tabular-nums; }
      .vel-table tbody td .zero { font-weight:400; }
      /* Depth by weight and colour rather than indent alone: pod > recruiter > role. */
      .vel-table tbody tr.lvl-pod td { font-size:12.5px; }
      .vel-table tbody tr.lvl-job td:first-child { color:var(--muted); font-weight:400; white-space:normal; line-height:1.35; }
      /* Someone with nothing in the window is still worth seeing, just not worth reading first. */
      .vel-table tbody tr.lvl-quiet td { color:var(--muted); }
      .vel-table tbody tr.lvl-quiet td:not(:first-child) { font-weight:400; }
      /* Saturdays and Sundays: a soft maroon underline on the date, so a quiet weekend is not mistaken for
         a quiet week (Jerin, 2026-08-29). Deliberately an underline and not a fill — the column is context,
         not an alert. */
      .vel-table th.wknd { box-shadow:inset 0 -2px 0 rgba(163,50,83,0.38); }
      .vel-table th:not(:first-child), .vel-table td:not(:first-child) { text-align:right; }
      .vel-table th:nth-child(n+3), .vel-table td:nth-child(n+3) { min-width:56px; }
      .vel-table th:nth-child(1), .vel-table td:nth-child(1) { position:sticky; left:0; z-index:2; width:250px; min-width:250px; max-width:250px; text-align:left; white-space:normal; }
      .vel-table th:nth-child(2), .vel-table td:nth-child(2) { position:sticky; left:250px; z-index:2; min-width:96px; border-right:2px solid var(--border); }
      .vel-table thead th:nth-child(1), .vel-table thead th:nth-child(2) { z-index:3; background:var(--bg); }
      .vel-table tbody td:nth-child(1), .vel-table tbody td:nth-child(2) { background:var(--card); }
      .vel-table tbody tr.lvl-pod td:nth-child(1), .vel-table tbody tr.lvl-pod td:nth-child(2) { background:var(--border-light); }

      /* multi-select checkbox dropdown */
      .ms { position:relative; display:inline-block; }
      .ms-btn { appearance:none; height:34px; padding:0 11px; border:1px solid var(--border); border-radius:8px; font-size:12px; font-weight:500;
        background:var(--card); color:var(--text); cursor:pointer; min-width:120px; text-align:left; white-space:nowrap; }
      .ms-btn:hover { border-color:var(--muted); }
      .ms-panel { position:absolute; top:38px; left:0; z-index:20; background:var(--card); border:1px solid var(--border); border-radius:8px;
        padding:6px; min-width:180px; max-height:260px; overflow:auto; box-shadow:0 6px 20px rgba(15,23,42,0.12); }
      .ms-opt { display:flex; align-items:center; gap:7px; padding:5px 8px; font-size:12px; font-weight:500; border-radius:6px; cursor:pointer; white-space:nowrap; }
      .ms-opt:hover { background:var(--border-light); }


      /* Metric Configuration */
      .cfg-card { border:1px solid var(--border); border-radius:12px; padding:16px 18px; margin-bottom:18px; background:var(--card); }
      .cfg-head { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
      .cfg-card .fchip { display:flex; align-items:center; gap:7px; }
      .cfg-card .fchip > span.lbl { font-size:11px; font-weight:700; color:var(--accent); text-transform:uppercase; letter-spacing:0.04em; }
      .cfg-card select, .cfg-card input[type=date], .cfg-card input[type=number] {
        appearance:none; -webkit-appearance:none; height:32px; padding:0 10px; border:1px solid var(--border);
        border-radius:8px; font-size:12px; font-weight:500; background:var(--bg); color:var(--text); }
      .btn-secondary { background:var(--bg); border:1px solid var(--border); border-radius:8px; cursor:pointer; font-weight:600; color:var(--text); }
      .btn-secondary:hover { border-color:var(--muted); }
      .cfg-grid td, .cfg-grid th { text-align:center; white-space:nowrap; }
      .cfg-grid th:first-child, .cfg-grid td:first-child { text-align:left; min-width:210px; white-space:normal; }
      .cfg-grid tbody tr.fam-sep td { background:var(--border-light); font-weight:700; font-size:11px; text-transform:uppercase; letter-spacing:0.03em; color:var(--muted); text-align:left; }
      .cfg-grid .tier-pts { width:46px; text-align:center; padding:2px; font-size:11px; }
      .cfg-ref { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:16px; }
      .cfg-ref table { width:100%; font-size:12px; }
      .cfg-ref th { text-align:left; color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:0.03em; }
    </style>

    <h2 class="section-title">Recruiter Efficiency</h2>
    <p class="sub-note" style="margin-top:-8px;">Grouped by <strong>pod</strong> (set in <strong>Admin → Metric Configuration</strong>, per quarter). Click a pod to expand its recruiters. Year/Quarter drives pod grouping + capacity; From/To drives the <strong>Momentum</strong> window.<br>Recruiters with <strong>no pod set</strong> for the selected quarter are excluded from every row and every total here — they are listed in <strong>Data Hygiene → Pod Not Set</strong>.</p>
    <div class="rec-filters">
      <div class="fchip"><span class="lbl">POD</span><div class="ms" id="msPod"></div></div>
      <div class="fchip"><span class="lbl">Recruiter</span><div class="ms" id="msRec"></div></div>
      <div class="fchip"><span class="lbl">Job</span><div class="ms" id="msJob"></div></div>
      <div class="fchip"><label class="opt"><input type="checkbox" id="recHideZero" checked> Hide zero-app</label></div>
      <div class="fchip"><label class="opt" title="Past recruiter = no longer holds an elevated recruiter seat in Ashby. Their offers and hires still count toward history; tick this to bring them back into the view."><input type="checkbox" id="recInclInactive"> Include past recruiters</label></div>
      <div class="fchip"><label class="opt"><input type="checkbox" id="recExpandAll" checked> Expand all branches</label></div>
      <span class="fdiv"></span>
      <div class="fchip"><span class="lbl">From</span><input type="date" id="recVelFrom"></div>
      <div class="fchip"><span class="lbl">To</span><input type="date" id="recVelTo"></div>
      <div class="fchip"><span class="lbl">Year</span><select id="recVelYear"><option value="">All</option>${years.map(y => `<option value="${y}">${y}</option>`).join('')}</select></div>
      <div class="fchip"><span class="lbl">Quarter</span><select id="recVelQuarter"><option value="">All</option><option value="Q1">Q1</option><option value="Q2">Q2</option><option value="Q3">Q3</option><option value="Q4">Q4</option></select></div>
      <p class="sub-note" id="recQtrNote" style="display:none;color:var(--orange);flex-basis:100%;margin:2px 0 0"></p>
    </div>

    <div class="rec-subtabs">
      <button class="rec-subtab active" data-tab="fulfilment">Fulfilment</button>
      <button class="rec-subtab" data-tab="velocity">Momentum</button>
      <button class="rec-subtab" data-tab="screening">Screening Efficiency</button>
      <button class="rec-subtab" data-tab="joining">Joining Conversion</button>
      <button class="rec-subtab" data-tab="sourcing">Sourcing Mix</button>
      <button class="rec-subtab" data-tab="timeinprocess">Time in Process</button>
      <button class="rec-subtab" data-tab="hygiene">Data Hygiene</button>
    </div>

    <!-- PANEL: Momentum — candidates added to ToFU, one column per day.
         🚨 The day columns were replaced with summary columns (Total / Last 7d / Prev 7d / Trend / Active
         days / sparkline) on 2026-08-29 and Jerin reverted it the same day: "why would you change the
         columns? I never asked for it." He asked for the CLUTTER to be fixed, not for the table to measure
         something else — and the per-day grid is the thing he specified when he defined this panel. Fix the
         look here if it needs fixing; do not swap the day columns for derived metrics again. -->
    <div class="rec-panel" data-panel="velocity" style="display:none">
      ${defsBlock('rec-momentum')}
      <div class="tofu-heat-wrap" id="recVelHeatWrap"><div id="recVelHeat" class="tofu-heat"></div><div id="recVelHeatTip" class="heat-tip"></div></div>
      <div class="scroll-table"><table class="vel-table">
        <thead id="recVelHead"></thead>
        <tbody id="recVelBody"></tbody>
      </table></div>
    </div>

    <!-- PANEL: Screening Efficiency — ONE R1 column set since 2026-08-29 (Jerin). HM Screening and Online
         Assessment columns were removed on purpose: this panel is about R1 only, and both still count on
         Momentum through ToFU. See the definitions block for what Added and Cleared mean. -->
    <div class="rec-panel" data-panel="screening" style="display:none">
      ${defsBlock('rec-screening')}
      <p class="sub-note" id="recScreenPeriod" style="font-weight:600"></p>
      <div class="chart-wrap" style="height:300px"><canvas id="recScreenChart"></canvas></div>
      <div class="scroll-table"><table class="metrics">
        <thead>
          <tr>
            <th style="min-width:260px">Pod / Recruiter / Job</th>
            <th title="An interview scheduled at R1, or an assignment triggered at R1. One per candidate per role per quarter; cancellations excluded.">Added at R1</th>
            <th title="Of those, the ones who reached R2 or beyond.">Progressed</th>
            <th title="Progressed ÷ Added at R1.">%</th>
          </tr>
        </thead>
        <tbody id="recScreenBody"></tbody>
      </table></div>
    </div>

    <!-- PANEL: Joining Conversion -->
    <div class="rec-panel" data-panel="joining" style="display:none">
      ${defsBlock('rec-joining')}
      <div class="chart-wrap" style="height:280px"><canvas id="recJoinChart"></canvas></div>
      <div class="scroll-table"><table class="metrics join-table">
        <thead><tr><th>Pod / Recruiter</th><th title="Joined + Joining Pending + Dropped.">Offered</th><th title="Started in the quarter, minus anyone linked to an earlier quarter's opening.">Joined</th><th title="Everyone in Ref Check, Documentation or Offer, minus earlier-quarter openings. Live — the same people appear in every quarter.">Joining Pending</th><th title="Reached Ref Check, Documentation or Offer and was then archived.">Dropped</th><th>Joining Conversion</th></tr></thead>
        <tbody id="recJoinBody"></tbody>
      </table></div>
    </div>

    <!-- PANEL: Position Fulfilment -->
    <div class="rec-panel" data-panel="fulfilment">
      ${defsBlock('rec-fulfilment')}
      <div class="chart-wrap" style="height:280px"><canvas id="recFulfilChart"></canvas></div>


      <h4 style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.04em;margin:14px 0 6px">Fulfilment — Non-Sales</h4>
      <div class="scroll-table"><table class="metrics">
        <thead>
          <tr><th rowspan="2" style="min-width:240px">Pod / Recruiter / Job</th><th colspan="2" class="stage-hdr">Goal — Joiners</th><th rowspan="2" class="stage-hdr" style="text-align:right" title="Capacity. Set per quarter in Metric Configuration.">Capacity<br><span style="font-weight:400;text-transform:none">Score</span></th><th colspan="2" class="stage-hdr">Joined</th><th rowspan="2" class="stage-hdr" title="Everyone currently in Ref Check, Documentation or Offer.">JP<br>Total</th><th colspan="2" class="stage-hdr" title="Everyone in closing, minus anyone linked to an opening from an earlier quarter, minus anyone joining next quarter.">JP — Current Qtr</th><th colspan="2" class="stage-hdr" title="Linked to an opening raised this quarter, but starting next quarter. Needs the offer to carry an opening link, which only began on 2026-07-25.">JP — Upcoming Qtr</th><th colspan="2" class="stage-hdr">Drop</th><th colspan="2" class="stage-hdr" title="Goal minus what was achieved — the shortfall. The bar fills with it.">Delta</th><th rowspan="2" class="stage-hdr">Capacity<br>Utilisation</th></tr>
          <tr><th class="stage-sub">HC</th><th class="stage-sub">Score</th><th class="stage-sub">HC</th><th class="stage-sub">Score</th><th class="stage-sub">HC</th><th class="stage-sub">Score</th><th class="stage-sub">HC</th><th class="stage-sub">Score</th><th class="stage-sub">HC</th><th class="stage-sub">Score</th><th class="stage-sub">HC</th><th class="stage-sub">Score</th></tr>
        </thead>
        <tbody id="recFulfilOfferBody"></tbody>
      </table></div>

      <h4 style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.04em;margin:18px 0 6px">Fulfilment — Sales (Hires)</h4>
      <div class="scroll-table"><table class="metrics">
        <thead>
          <tr><th rowspan="2" style="min-width:240px">Pod / Recruiter / Job</th><th colspan="2" class="stage-hdr">Goal — Joiners</th><th rowspan="2" class="stage-hdr" style="text-align:right" title="Capacity — Joiners. Set per quarter in Metric Configuration.">Capacity<br><span style="font-weight:400;text-transform:none">Score</span></th><th colspan="2" class="stage-hdr">Joined</th><th rowspan="2" class="stage-hdr" title="Everyone currently in Ref Check, Documentation or Offer.">JP<br>Total</th><th colspan="2" class="stage-hdr" title="Linked to an opening raised last quarter, starting this quarter. Needs the offer to carry an opening link, which only began on 2026-07-25.">JP — Prev Qtr Openings</th><th colspan="2" class="stage-hdr" title="Everyone in closing, minus the JP — Prev Qtr Openings column beside it. The two always add up to JP Total.">JP — Current Qtr Openings</th><th colspan="2" class="stage-hdr">Drop</th><th colspan="2" class="stage-hdr" title="Goal minus what was achieved — the shortfall. The bar fills with it.">Delta</th><th rowspan="2" class="stage-hdr">Capacity<br>Utilisation</th></tr>
          <tr><th class="stage-sub">HC</th><th class="stage-sub">Score</th><th class="stage-sub">HC</th><th class="stage-sub">Score</th><th class="stage-sub">HC</th><th class="stage-sub">Score</th><th class="stage-sub">HC</th><th class="stage-sub">Score</th><th class="stage-sub">HC</th><th class="stage-sub">Score</th><th class="stage-sub">HC</th><th class="stage-sub">Score</th></tr>
        </thead>
        <tbody id="recFulfilHireBody"></tbody>
      </table></div>

      <h4 style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.04em;margin:22px 0 6px">Joining Pending — Cases</h4>
      <p class="sub-note" id="recJPCaption" style="margin-bottom:8px"></p>
      <div class="scroll-table"><table class="metrics">
        <thead><tr>
          <th style="min-width:240px">Pod / Recruiter / Candidate</th>
          <th>Opening Quarter</th><th>Month</th><th>DOJ</th><th>Department</th><th>Job</th><th>Sub-Stage</th>
        </tr></thead>
        <tbody id="recJPBody"></tbody>
      </table></div>
    </div>

    <!-- PANEL: Sourcing Mix -->
    <div class="rec-panel" data-panel="sourcing" style="display:none">
      ${defsBlock('rec-sourcing')}
      <p class="sub-note" id="recSourcePeriod" style="font-weight:600"></p>
      <p class="sub-note" id="recSourceNote" style="display:none;color:var(--orange)"></p>
      <div class="chart-wrap" style="height:320px"><canvas id="recSourceChart"></canvas></div>
      <div class="scroll-table"><table class="metrics">
        <thead><tr><th style="min-width:320px">Pod / Recruiter / Source type / Source name</th><th>Joiners</th><th>%</th></tr></thead>
        <tbody id="recSourceBody"></tbody>
      </table></div>
    </div>

    <!-- PANEL: Time in Process (Pod → Recruiter → Job; median days parked per stage, red > 5) -->
    <div class="rec-panel" data-panel="timeinprocess" style="display:none">
      ${defsBlock('rec-tis')}
      <p class="sub-note" id="recTisNote" style="display:none"></p>
      <div class="scroll-table"><table class="vel-table">
        <thead id="recTisHead"></thead>
        <tbody id="recTisBody"></tbody>
      </table></div>
    </div>

    <!-- PANEL: Data Hygiene (LIVE — surfaces data.dataQuality from the attribution pass) -->
    <div class="rec-panel" data-panel="hygiene" style="display:none">
      ${defsBlock('rec-hygiene')}
      <div class="cards" id="hygCards" style="margin-bottom:18px"></div>

      <div class="hyg-tabs" id="hygTabs">
        <button class="hyg-tab active" data-h="unassigned">Unassigned<span class="n" id="hygNUnassigned"></span></button>
        <button class="hyg-tab" data-h="multirec">Multiple Recruiters<span class="n" id="hygNMultiRec"></span></button>
        <button class="hyg-tab" data-h="multisrc">Multiple Sourcers<span class="n" id="hygNMultiSrc"></span></button>
        <button class="hyg-tab" data-h="roster">Recruiter Roster<span class="n" id="hygNRoster"></span></button>
        <button class="hyg-tab" data-h="nopod">Pod Not Set<span class="n" id="hygNNoPod"></span></button>
        <button class="hyg-tab" data-h="offergap">Offers Missing Opening Link<span class="n" id="hygNOfferGap"></span></button>
        <button class="hyg-tab" data-h="hiredgap">Hired Missing Opening Link<span class="n" id="hygNHiredGap"></span></button>
        <button class="hyg-tab" data-h="unscored">Roles Missing Score Inputs<span class="n" id="hygNUnscored"></span></button>
        <button class="hyg-tab" data-h="nocap">Capacity Not Set<span class="n" id="hygNNoCap"></span></button>
        <button class="hyg-tab" data-h="anomalies">Other Anomalies<span class="n" id="hygNAnom"></span></button>
      </div>

      <div class="hyg-panel" data-h="unassigned">
        <div class="hyg-head">
          <div><h4 style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.04em;margin:0 0 4px">Unassigned — reached TA Screen or later, no Recruiter tagged</h4>
          <p class="sub-note" style="margin:0">The actionable backlog: these candidates are in active screening but nobody is credited. Grouped by job. (Applications still in App Review are excluded — those aren't worked yet.)</p></div>
          <button class="hyg-dl" data-dl="unassigned">Download CSV</button>
        </div>
        <div class="scroll-table"><table>
          <thead><tr><th style="min-width:280px">Job / Candidate</th><th>Stage</th><th>Applied</th><th>Application ID</th></tr></thead>
          <tbody id="hygUnassignedBody"></tbody>
        </table></div>
      </div>

      <div class="hyg-panel" data-h="multirec" style="display:none">
        <div class="hyg-head">
          <div><h4 style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.04em;margin:0 0 4px">Multiple Recruiters on one application</h4>
          <p class="sub-note" style="margin:0">More than one hiring-team member tagged <strong>Recruiter</strong>. Scoring currently credits the first — the team should leave a single Recruiter of record (the one who ran the transition).</p></div>
          <button class="hyg-dl" data-dl="multirec">Download CSV</button>
        </div>
        <div class="scroll-table"><table>
          <thead><tr><th style="min-width:200px">Job</th><th style="min-width:320px">Recruiters tagged</th><th>Application ID</th></tr></thead>
          <tbody id="hygMultiRecBody"></tbody>
        </table></div>
      </div>

      <div class="hyg-panel" data-h="multisrc" style="display:none">
        <div class="hyg-head">
          <div><h4 style="font-size:11px;font-weight:600;color:var(--red);text-transform:uppercase;letter-spacing:0.04em;margin:0 0 4px">Multiple Sourcers on one application — data error</h4>
          <p class="sub-note" style="margin:0">A single application should never have more than one <strong>Sourcer</strong>. Any row here is a data anomaly to correct in Ashby.</p></div>
          <button class="hyg-dl" data-dl="multisrc">Download CSV</button>
        </div>
        <div class="scroll-table"><table>
          <thead><tr><th style="min-width:200px">Job</th><th style="min-width:320px">Sourcers tagged</th><th>Application ID</th></tr></thead>
          <tbody id="hygMultiSrcBody"></tbody>
        </table></div>
      </div>

      <div class="hyg-panel" data-h="roster" style="display:none">
        <div class="hyg-head">
          <div><h4 style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.04em;margin:0 0 4px">Recruiter roster — Active / Inactive</h4>
          <p class="sub-note" style="margin:0"><strong>Active</strong> = current Ashby account enabled. <strong>Inactive</strong> = account disabled (departed) but retained so their historical offers/hires still score. Derived from Ashby <code>user.list</code> <code>isEnabled</code>.</p></div>
          <button class="hyg-dl" data-dl="roster">Download CSV</button>
        </div>
        <div class="scroll-table"><table>
          <thead><tr><th style="min-width:240px">Recruiter</th><th>Status</th><th>Pod (this quarter)</th><th>Offers</th><th>Hired</th></tr></thead>
          <tbody id="hygRosterBody"></tbody>
        </table></div>
      </div>

      <div class="hyg-panel" data-h="nopod" style="display:none">
        <div class="hyg-head">
          <div><h4 style="font-size:11px;font-weight:600;color:var(--orange);text-transform:uppercase;letter-spacing:0.04em;margin:0 0 4px">Pod not set — excluded from every table on this tab</h4>
          <p class="sub-note" style="margin:0">These are <strong>real recruiters with real numbers</strong> who have no pod assigned for the selected quarter. Everything below is <strong>left out</strong> of the pod rows, the pod totals and the charts on Fulfilment, Momentum, Screening, Joining Conversion and Sourcing — because a row labelled "Unassigned" reads like a team, and its totals silently inflate the tab. Fix it in <strong>Admin → Metric Configuration</strong> (Recruiter → Pod, per quarter); the numbers rejoin their pod on the next render.</p></div>
          <button class="hyg-dl" data-dl="nopod">Download CSV</button>
        </div>
        <div class="scroll-table"><table>
          <thead><tr><th style="min-width:240px">Recruiter</th><th>Status</th><th>Applications</th><th>Offers</th><th>Hired</th><th>Joining pending</th><th>Capacity</th></tr></thead>
          <tbody id="hygNoPodBody"></tbody>
        </table></div>
      </div>

      <div class="hyg-panel" data-h="offergap" style="display:none">
        <div class="hyg-head">
          <div><h4 style="font-size:11px;font-weight:600;color:var(--orange);text-transform:uppercase;letter-spacing:0.04em;margin:0 0 4px">Offers missing an opening link — still in play</h4>
          <p class="sub-note" style="margin:0">These candidates have a live offer but no opening attached, so they are missing from Joining Pending. <strong>This is the list to fix</strong> — attach the opening in Ashby and the next refresh clears the row.</p></div>
          <button class="hyg-dl" data-dl="offergap">Download CSV</button>
        </div>
        <div class="scroll-table"><table>
          <thead><tr><th style="min-width:180px">Candidate</th><th style="min-width:200px">Job</th><th>Department</th><th>Stage</th><th>DOJ</th><th>Recruiter</th></tr></thead>
          <tbody id="hygOfferGapBody"></tbody>
        </table></div>
      </div>

      <div class="hyg-panel" data-h="hiredgap" style="display:none">
        <div class="hyg-head">
          <div><h4 style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.04em;margin:0 0 4px">Hired / closed, missing an opening link</h4>
          <p class="sub-note" style="margin:0">Offers with no opening attached where the candidate has already joined or the application is closed. <strong>Reference only</strong> — fixing these changes no number on this site, because joins are counted from the opening being closed as hired, not from this link.</p></div>
          <button class="hyg-dl" data-dl="hiredgap">Download CSV</button>
        </div>
        <div class="scroll-table"><table>
          <thead><tr><th style="min-width:180px">Candidate</th><th style="min-width:200px">Job</th><th>Department</th><th>Stage</th><th>Status</th><th>DOJ</th><th>Recruiter</th></tr></thead>
          <tbody id="hygHiredGapBody"></tbody>
        </table></div>
      </div>

      <div class="hyg-panel" data-h="unscored" style="display:none">
        <div class="hyg-head">
          <div><h4 style="font-size:11px;font-weight:600;color:var(--red);text-transform:uppercase;letter-spacing:0.04em;margin:0 0 4px">Roles missing score inputs</h4>
          <p class="sub-note" style="margin:0">A role's Score needs <strong>Level</strong> and <strong>Complexity</strong> from Ashby. Without both, the role scores nothing — so it contributes nothing to its department's Fulfilment target, and the target reads lower than the real workload. Fill these in on the job in Ashby.</p></div>
          <button class="hyg-dl" data-dl="unscored">Download CSV</button>
        </div>
        <div class="scroll-table"><table>
          <thead><tr><th style="min-width:300px">Job</th><th style="min-width:150px">Department</th><th>Level</th><th>Complexity</th><th>Missing</th><th>Applications</th></tr></thead>
          <tbody id="hygUnscoredBody"></tbody>
        </table></div>
      </div>

      <div class="hyg-panel" data-h="nocap" style="display:none">
        <div class="hyg-head">
          <div><h4 style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.04em;margin:0 0 4px">Capacity not set — but candidates attributed</h4>
          <p class="sub-note" style="margin:0">Recruiters with a <strong>Capacity of 0</strong> for the selected quarter who nevertheless have offers, hires or joining-pending candidates against their name. Either the capacity belongs in <strong>Admin → Metric Configuration</strong>, or those candidates are attributed to the wrong person. Until it is settled they have no Target and no Capacity Utilisation, so their work is invisible in Fulfilment.</p></div>
          <button class="hyg-dl" data-dl="nocap">Download CSV</button>
        </div>
        <div class="scroll-table"><table>
          <thead><tr><th style="min-width:240px">Recruiter</th><th>Status</th><th>Pod (this quarter)</th><th>Capacity</th><th>Offers</th><th>Hired</th><th>Joining pending</th></tr></thead>
          <tbody id="hygNoCapBody"></tbody>
        </table></div>
      </div>

      <div class="hyg-panel" data-h="anomalies" style="display:none">
        <div class="hyg-head">
          <div><h4 style="font-size:11px;font-weight:600;color:var(--red);text-transform:uppercase;letter-spacing:0.04em;margin:0 0 4px">Other anomalies</h4>
          <p class="sub-note" style="margin:0">One-off attribution problems that need correcting at source in Ashby.</p></div>
          <button class="hyg-dl" data-dl="anomalies">Download CSV</button>
        </div>
        <div class="scroll-table"><table>
          <thead><tr><th style="min-width:280px">Anomaly</th><th style="min-width:240px">Detail</th><th>What to do</th></tr></thead>
          <tbody id="hygAnomBody"></tbody>
        </table></div>
      </div>
    </div>
  `;
}

export function initRecruiterFilters(data) {
  if (!data || !data.recruiters) return;
  const allRecs = data.recruiters;
  const nDate = 7;
  // Inactive = the person no longer holds an elevated recruiter seat in Ashby (UI roles Recruiter /
  // Recruiter Admin). Identity is the Ashby USER RECORD (recruiters[].userId), so this is a direct lookup
  // rather than a name match, and the manual Admin override was retired 2026-08-22.
  // 🚨 Do NOT go back to isEnabled: it is true for all 446 Ashby users because IK never disables accounts,
  // so it marked every departed recruiter as Active. The seat is the signal.
  // activeKnown === false means NO Ashby user could be matched at all - the status is genuinely UNKNOWN.
  // It must never render as "Active": a departed recruiter hiding behind a default is exactly the kind of
  // plausible-looking wrong answer this dashboard has been bitten by before.
  const isRecInactive = (r) => !!(r && r.isActive === false);
  const isStatusUnknown = (r) => !!(r && r.activeKnown === false);
  const inactiveTag = (r) => isRecInactive(r)
    ? ' <span style="font-size:10px;color:var(--red);font-weight:600">· inactive</span>'
    : (isStatusUnknown(r) ? ' <span title="No Ashby user record matched this name, so active/inactive is unknown" style="font-size:10px;color:var(--orange);font-weight:600">· status unknown</span>' : '');
  // Time-in-stage histograms (days:count). App Review from the main pull; TA Screen → Offer from stage history.
  const _sr = data.stageRollups || {};
  const tisRec = _sr.timeInStageByRecruiter || null, tisJob = _sr.timeInStageByJob || null;
  // Per-quarter dwell (bucketed by the quarter the candidate ENTERED the stage), added 2026-08-21.
  const tisRecQ = _sr.timeInStageByRecruiterQ || null, tisJobQ = _sr.timeInStageByJobQ || null;
  const tisHasQ = hasQuarterTis(_sr);
  const arDwellRec = data.appReviewDwellByRecruiter || null, arDwellJob = data.appReviewDwellByJob || null;

  // jobs[] is keyed by an 8-char id; recruiters[].byJob[].jobId is the full uuid → join on the prefix.
  // jobMeta() yields {department,title,level,complexity} for the scoring engine (falls back to byJob's own
  // title/department when the job isn't in jobs[] — e.g. archived with no current apps).
  const jobById = {}; (data.jobs || []).forEach(j => { jobById[j.id] = j; });
  const jobMeta = (bj) => { const j = jobById[(bj.jobId || '').slice(0, 8)]; return { department: (j && j.department) || bj.department, title: (j && j.title) || bj.title, level: j && j.level, complexity: j && j.complexity }; };

  // Screening reached/cleared per recruiter for HM/OA/R1 — real from stage-history rollups when present,
  // else the current-stage approximation (R1-cleared unknown → null).
  // The per-stage throughput helpers (screenTriple / screenTripleByJob / jobsForRecruiter /
  // stageForPeriod) were removed on 2026-08-29: Screening Efficiency moved to a single R1 set computed in
  // the pipeline, and nothing else read them. throughputBy*Q is still emitted and still used by the HM and
  // Overall Efficiency tabs.

  let lastGroups = [], lastRecs = [], activeTab = 'fulfilment';
  // Per-recruiter Fulfilment aggregates, written by the table render and read by its chart.
  let lastFulfil = {};

  let msPod = null, msRec = null, msJob = null;

  // Quarter selected in the global filter (Year+Quarter) — drives pod grouping + capacity lookups.
  // The year the selector is on. "All" resolves to the first real year in the list (2026 today) — the same
  // year periodQuarters() resolves to, so two panels can never read different periods from one selection.
  function selYear() {
    const sel = document.getElementById('recVelYear');
    if (sel && sel.value) return sel.value;
    const first = sel ? [...sel.options].map(o => o.value).filter(Boolean)[0] : '';
    return first || String(new Date().getFullYear());
  }
  // ONE quarter — for the things that only exist per quarter: pod membership, capacity, the Fulfilment goal.
  // 🚨 This used to fall through to TODAY's quarter whenever EITHER dropdown read "All", so picking Q1 with
  // Year on All showed Q3 numbers under a Q1 heading. Resolve the year instead, and fall back to the current
  // quarter only when no quarter is picked at all.
  function selQuarter() {
    const q = document.getElementById('recVelQuarter')?.value;
    return q ? qKey(selYear(), q) : currentQuarter();
  }
  // EVERY quarter the selector covers; null = nothing picked (= all time). Panels whose data carries a date
  // read THIS, not selQuarter(): one quarter under a "Quarter: All" filter silently hides the rest of the
  // year — Sourcing Mix was showing 3,223 of 54,501 applications that way.
  function selQuarters() {
    const ySel = document.getElementById('recVelYear');
    const yrs = ySel ? [...ySel.options].map(o => o.value).filter(Boolean) : [];
    return periodQuarters(ySel?.value || '', document.getElementById('recVelQuarter')?.value || '', yrs);
  }
  // Plain-English name for a period, for the line printed above a table.
  function periodLabel(per) {
    if (!per || !per.length) return 'all time';
    if (per.length === 1) return per[0];
    return `${per[0].slice(0, 4)} — ${per[0].slice(5)} to ${per[per.length - 1].slice(5)}`;
  }

  // Styled multi-select checkbox dropdown. Returns { getSelected } ; empty selection = "All".
  // Multi-select dropdown with type-to-filter and a Clear (= back to "All") reset.
  // Kept identical across the HM / Recruiter / Overall-Efficiency tabs on purpose.
  function makeMultiSelect(container, label, options, onChange) {
    if (!container) return null;
    const selected = new Set();
    const labelText = () => selected.size === 0 ? `${label}: All` : (selected.size === 1 ? `${label}: ${[...selected][0]}` : `${label}: ${selected.size} selected`);
    const esc = s => String(s).replace(/"/g, '&quot;');
    container.classList.add('ms');
    container.innerHTML = `<button type="button" class="ms-btn"></button><div class="ms-panel" style="display:none">`
      + (options.length ? `<div class="ms-tools"><input type="text" class="ms-search" placeholder="Type to filter..."><button type="button" class="ms-clear">Clear</button></div>` : '')
      + `<div class="ms-list">`
      + (options.map(o => `<label class="ms-opt"><input type="checkbox" value="${esc(o)}"> ${o}</label>`).join('') || '<span style="font-size:11px;color:var(--muted);padding:4px 8px">No options yet</span>')
      + `</div><div class="ms-empty" style="display:none">No matches</div></div>`;
    const btn = container.querySelector('.ms-btn'), panel = container.querySelector('.ms-panel');
    const search = container.querySelector('.ms-search'), clearBtn = container.querySelector('.ms-clear');
    const opts = [...container.querySelectorAll('.ms-opt')];
    const emptyMsg = container.querySelector('.ms-empty');
    btn.textContent = labelText();
    function applyFilter(q) {
      const needle = q.trim().toLowerCase();
      let shown = 0;
      opts.forEach(o => {
        const hit = !needle || o.textContent.toLowerCase().indexOf(needle) >= 0;
        o.style.display = hit ? '' : 'none';
        if (hit) shown++;
      });
      if (emptyMsg) emptyMsg.style.display = shown ? 'none' : 'block';
    }
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = panel.style.display !== 'none';
      document.querySelectorAll('.ms-panel').forEach(p => p.style.display = 'none');
      panel.style.display = open ? 'none' : 'block';
      // Reopening always starts from the full list, so a stale filter can never hide options.
      if (!open && search) { search.value = ''; applyFilter(''); search.focus(); }
    });
    panel.addEventListener('click', e => e.stopPropagation());
    if (search) search.addEventListener('input', () => applyFilter(search.value));
    if (clearBtn) clearBtn.addEventListener('click', () => {
      if (selected.size === 0) return;
      selected.clear();
      container.querySelectorAll('input[type=checkbox]').forEach(cb => { cb.checked = false; });
      btn.textContent = labelText();
      onChange();
    });
    container.querySelectorAll('input[type=checkbox]').forEach(cb => cb.addEventListener('change', () => { if (cb.checked) selected.add(cb.value); else selected.delete(cb.value); btn.textContent = labelText(); onChange(); }));
    return { getSelected: () => [...selected] };
  }

  // Job multi-select works off throughputByRecruiterJob: a recruiter stays in the list only if they have
  // stage history on one of the selected jobs. Until that data existed this filter was wired but inert.
  function selectedJobIds() {
    const jobSel = msJob ? msJob.getSelected() : [];
    return jobSel.length
      ? new Set((data.jobs || []).filter(j => jobSel.includes(j.title)).map(j => j.id))
      : null;
  }
  function recWorkedSelectedJob(name, jobIdsSelected) {
    if (!jobIdsSelected) return true;
    const rj = data.stageRollups && data.stageRollups.throughputByRecruiterJob;
    const mine = rj && rj[name];
    if (!mine) return false;
    return Object.keys(mine).some(j8 => jobIdsSelected.has(j8));
  }

  // Recruiters the user has EXPLICITLY filtered out with the Pod / Recruiter / Job multi-selects — as
  // opposed to the ones this tab hides by DEFAULT (past recruiters, no pod set, zero applications).
  // The JP Cases table needs the difference: a default exclusion still has to be accounted for somewhere,
  // an explicit one must not be quietly re-added under an "unassigned" label.
  function explicitlyFiltered(name, q) {
    const pods = msPod ? msPod.getSelected() : [];
    const names = msRec ? msRec.getSelected() : [];
    if (names.length && !names.includes(name)) return true;
    if (pods.length && !pods.includes(podOf(name, q))) return true;
    if (!recWorkedSelectedJob(name, selectedJobIds())) return true;
    return false;
  }

  function getFilteredRecs() {
    const q = selQuarter();
    const hideZero = document.getElementById('recHideZero')?.checked;
    const pods = msPod ? msPod.getSelected() : [];
    const names = msRec ? msRec.getSelected() : [];
    const jobIdsSelected = selectedJobIds();
    // Departed recruiters are hidden by default — their historical numbers are still in the
    // data (and still score), they just clutter the working view. The Data Hygiene roster
    // deliberately ignores this and always lists everyone; that tab exists to show the split.
    const inclInactive = document.getElementById('recInclInactive')?.checked;
    return allRecs.filter(r => {
      // #18 (2026-08-23): "Unassigned" is not a recruiter — it is every candidate nobody is tagged on. It was
      // appearing as a row and a bar in every table and chart, where it reads like a person with a workload.
      // It already has its own Data Hygiene tab, which builds its own list and is untouched by this.
      if (r.name === 'Unassigned') return false;
      // #23 (2026-08-24): a recruiter with NO pod set for this quarter is excluded from every row AND every
      // total on this tab. An "Unassigned" pod row reads like a real team with a real workload, which it is
      // not. Nobody is lost — Data Hygiene → Pod Not Set carries their numbers, and the note under the
      // heading says the exclusion is happening.
      if (podOf(r.name, q) === 'Unassigned') return false;
      if (hideZero && (r.total || 0) === 0) return false;
      // #14 (2026-08-23): default is now OFF. Past recruiters keep their history in the data and still score;
      // they just don't clutter the working view unless asked for.
      if (!inclInactive && isRecInactive(r)) return false;
      if (names.length && !names.includes(r.name)) return false;
      if (pods.length && !pods.includes(podOf(r.name, q))) return false;
      if (!recWorkedSelectedJob(r.name, jobIdsSelected)) return false;
      return true;
    });
  }

  function renderAll() {
    const recs = getFilteredRecs();
    const groups = groupByPod(recs, selQuarter());

    // fulfilRows() runs once per table (Non-Sales, then Sales) and both write into lastFulfil, so it is
    // cleared HERE — once per render — not inside fulfilRows, which would wipe the first table's rows.
    lastFulfil = {};

    // Which period each panel is actually on. Two of them CANNOT follow a multi-quarter selection —
    // pods, capacity and the Fulfilment goal are set quarter by quarter — so say which quarter they used
    // rather than letting a "Quarter: All" filter sit over one quarter's numbers.
    const per = selQuarters();
    const perTxt = periodLabel(per);
    const qNote = document.getElementById('recQtrNote');
    if (qNote) {
      const oneQuarter = !!document.getElementById('recVelQuarter')?.value;
      qNote.style.display = oneQuarter ? 'none' : '';
      if (!oneQuarter) qNote.innerHTML = `<strong>Quarter: All.</strong> Screening Efficiency, Sourcing Mix and Time in Process cover <strong>${perTxt}</strong>. Fulfilment and Joining Conversion exist only per quarter, so they show <strong>${selQuarter()}</strong> — and because pods and capacity are set quarter by quarter, <strong>every</strong> table here groups by ${selQuarter()} pod membership. Momentum always shows the last 30 days of the From/To range.`;
    }
    const spEl = document.getElementById('recScreenPeriod');
    if (spEl) spEl.textContent = `Showing ${perTxt}.`;

    // ===== Momentum (own POD/date filters) =====
    renderVelocity();

    // ===== Screening Efficiency — ONE R1 set (Jerin, 2026-08-29) =====
    //   Added at R1 = the candidate was ACTIONED at R1: an interview scheduled there, OR an assignment
    //                 triggered while they sat there. Either counts; both together still count once.
    //                 Cancellations excluded. One per candidate per role per quarter.
    //   Progressed  = of those, the ones who reached R2 or beyond.
    // 🚨 Computed in the PIPELINE (Tofu.gs), because it needs candidate identity — the rollups this file
    // reads are only totals. HM Screening and Online Assessment columns were removed here deliberately:
    // this panel is R1 only, and both still count on Momentum through ToFU.
    // ⚠ It will NOT match the old per-stage 'Added', which counted stage ENTRIES and re-counted anyone who
    // came back round, and it is not Momentum's R1 either — Momentum only credits R1 when it was the
    // candidate's FIRST signal, so its R1 is a subset of this one.
    const r1Store = (data.stageRollups && data.stageRollups.r1ByRecruiter) || null;
    const r1JobStore = (data.stageRollups && data.stageRollups.r1ByRecruiterJob) || null;
    const r1Sum = (byQ) => {
      const acc = { added: 0, cleared: 0 };
      if (!byQ) return acc;
      if (per && per.length) per.forEach(qq => { const c = byQ[qq]; if (c) { acc.added += c.added || 0; acc.cleared += c.cleared || 0; } });
      else Object.keys(byQ).forEach(qq => { const c = byQ[qq]; acc.added += c.added || 0; acc.cleared += c.cleared || 0; });
      return acc;
    };
    const r1Of = (name) => r1Sum(r1Store && r1Store[name]);
    const r1OfJob = (name, j8) => r1Sum(r1JobStore && r1JobStore[name] && r1JobStore[name][j8]);
    const r1Cells = (v, bold) => {
      const w = bold ? ' style="font-weight:600"' : '';
      return `<td${w}>${v.added > 0 ? v.added : '<span class="zero">0</span>'}</td>`
        + `<td${w}>${v.cleared > 0 ? v.cleared : '<span class="zero">0</span>'}</td>`
        + `<td class="${v.added ? pctClass(pct(v.cleared, v.added)) : 'zero'}">${v.added ? pct(v.cleared, v.added) + '%' : DASH}</td>`;
    };
    const screenBody = document.getElementById('recScreenBody');
    if (screenBody) {
      if (!r1Store) {
        // No R1 field yet. Say so rather than falling back to the per-stage counts, which answer a
        // different question and would sit under this heading as a lie.
        screenBody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:16px">R1 screening figures appear after the next stage-history refresh.</td></tr>`;
      } else {
        let html = '';
        groups.forEach((G, pi) => {
          const podAgg = { added: 0, cleared: 0 };
          const recVals = G.recs.map(r => { const v = r1Of(r.name); podAgg.added += v.added; podAgg.cleared += v.cleared; return v; });
          html += `<tr class="lvl-pod" data-pod="${pi}" data-exp="0" style="cursor:pointer;background:var(--border-light)">
            <td style="font-weight:600">${CARET}${G.pod}<span style="color:var(--muted);font-weight:400;font-size:11px;margin-left:6px">${G.recs.length}</span></td>${r1Cells(podAgg, true)}</tr>`;
          G.recs.forEach((r, ri) => {
            const rk = `s${pi}-${ri}`;
            html += `<tr class="lvl-rec" data-pod="${pi}" data-rec="${rk}" data-exp="0" style="display:none;cursor:pointer">
              <td style="padding-left:26px;font-weight:500">${CARET}${r.name}${inactiveTag(r)}</td>${r1Cells(recVals[ri], false)}</tr>`;
            // Only roles that actually saw R1 activity in the period — a recruiter's older roles are not
            // listed as a column of zeros (Jerin, 2026-08-26: "I don't think Oshin has these many roles").
            const mine = (r1JobStore && r1JobStore[r.name]) || {};
            const jobRows = Object.keys(mine).map(j8 => ({ j8, v: r1OfJob(r.name, j8) }))
              .filter(x => x.v.added > 0 || x.v.cleared > 0)
              .sort((a, b) => b.v.added - a.v.added);
            if (jobRows.length) {
              jobRows.forEach(({ j8, v }) => {
                const jm = jobById[j8];
                html += `<tr class="lvl-stage" data-pod="${pi}" data-parent-rec="${rk}" style="display:none">
                  <td style="padding-left:52px;color:var(--muted)">${(jm && jm.title) || j8}</td>${r1Cells(v, false)}</tr>`;
              });
            } else {
              html += `<tr class="lvl-stage" data-pod="${pi}" data-parent-rec="${rk}" style="display:none">
                <td style="padding-left:52px;color:var(--muted);font-style:italic">No R1 activity in this period</td>${'<td>' + DASH + '</td>'.repeat(3)}</tr>`;
            }
          });
        });
        screenBody.innerHTML = html || `<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:16px">No recruiters match the filter.</td></tr>`;
        wireVelTree(screenBody);
      }
    }

    // ===== Joining Conversion =====
    const joinBody = document.getElementById('recJoinBody');
    if (joinBody) {
      const CM = convMaps(selQuarter());
      const cOf = (name) => CM.byRec[name] || { o: 0, j: 0, p: 0, dr: 0 };
      const convCell = (v) => {
        if (!v.o) return `<td class="gapcell"><span class="zero">—</span></td>`;
        const pct = Math.round(((v.j + v.p) / v.o) * 100);
        const band = pct >= 50 ? '' : (pct >= 20 ? ' mid' : ' low');
        return `<td class="gapcell"><span class="deltacell"><span class="track"><i class="conv${band}" style="width:${pct}%"></i></span>`
          + `<span class="dnum">${pct}%</span></span>`
          + `<span class="sublab">${v.j + v.p} of ${v.o}</span></td>`;
      };
      const cells = (v, bold) => {
        const w = bold ? ' style="font-weight:600"' : '';
        return `<td${w}>${v.o || '<span class="zero">0</span>'}</td>`
          + `<td${w} class="${v.j > 0 ? 'good' : 'zero'}">${v.j}</td>`
          + `<td style="color:var(--orange)">${v.p || '<span class="zero">0</span>'}</td>`
          + `<td class="${v.dr > 0 ? 'bad' : ''}">${v.dr || '<span class="zero">0</span>'}</td>`
          + convCell(v);
      };
      const add = (a, b) => ({ o: a.o + b.o, j: a.j + b.j, p: a.p + b.p, dr: a.dr + b.dr });
      let html = '';
      groups.forEach((G, gi) => {
        const shown = G.recs.filter(r => cOf(r.name).o > 0);
        if (!shown.length) return;
        const tot = shown.reduce((a, r) => add(a, cOf(r.name)), { o: 0, j: 0, p: 0, dr: 0 });
        html += `<tr class="pod-header" data-g="j${gi}" data-exp="0" style="cursor:pointer;background:var(--border-light)">
          <td style="font-weight:600">${CARET}${G.pod}<span style="color:var(--muted);font-weight:400;font-size:11px;margin-left:6px">${shown.length}</span></td>${cells(tot, true)}</tr>`;
        shown.forEach(r => {
          html += `<tr class="leaf" data-g="j${gi}" style="display:none"><td style="padding-left:30px;font-weight:500">${r.name}${inactiveTag(r)}</td>${cells(cOf(r.name), false)}</tr>`;
        });
      });
      joinBody.innerHTML = html || `<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:16px">Nothing in play this quarter for the recruiters shown.</td></tr>`;
      wirePodTree(joinBody);
    }

    // ===== Position Fulfilment (Non-Sales offers / Sales hires) =====
    const salesGroups = groups.filter(G => isSalesPod(G.pod));
    const nonSalesGroups = groups.filter(G => !isSalesPod(G.pod)); // includes Unassigned

    // Funnel columns. Non-Sales (mode 'offer'): Assigned(HC|Score) · Target Score · Offered(HC|Score) ·
    // Joining Pending(HC|Score) · Gap Score. Sales (mode 'hire') adds Hired(HC|Score) before Gap.
    // Assigned/Offered/Hired HC+Score are LIVE from recruiters[].byJob × the score engine. Target = min(Capacity,
    // Assigned Score) (Capacity per quarter from Metric Config; 0 until set). Gap = max(0, Target − Achieved),
    // Achieved = Offered Score (Non-Sales) / Hired Score (Sales). Joining Pending is recruiter-level only (offer
    // pass gives a count, not per-job) → HC at recruiter/pod rows, Score unattributable (—). Tree = Pod → Recruiter → Job.
    // ===== Fulfilment v2 (2026-08-22) =====
    // Goal replaces Assigned; Capacity is the RAW configured capacity (the old Target capped it at the
    // assigned work, which would make utilisation read 100% for everyone). Gap is measured against Goal,
    // and Capacity Utilisation is OUTPUT over capacity - what was delivered against what could have been.
    // ⚠ The colour sense is the opposite of a load metric: past 100% is over-delivery (good); under 70% is
    // under-use, which is the thing worth acting on.
    function fulfilRows(gs, mode) {
      const q = selQuarter();
      const isSales = mode === 'hire';
      // 1 label + Goal(2) + Capacity(1) + Joined(2) + JP total(1) + JP A(2) + JP B(2) + Drop(2) + Gap(2)
      // + Utilisation(1). Both tables are the same shape now that Offered is gone from Non-Sales (#24).
      const ncol = 16;

      // 🚨 THE OUTCOME IS DATED FROM offerEvents, NOT FROM byJob (fixed 2026-08-22).
      // recruiters[].byJob carries {jobId,title,department,total,offer,hired} and NO date of any kind, so
      // reading Joined/Offered from it showed every 2026 hire under whichever quarter was selected — the Sales
      // pod read 162 joiners for Q3 when the true figure is 11. offerEvents has a real date per candidate:
      //   Sales     → accepted offers whose START DATE falls in the quarter (they actually joined)
      //   Non-Sales → offers whose DECIDED date falls in the quarter (the offer was made)
      // Score comes from the event's own department/title/level/complexity, same grid as everywhere else.
      const qOf = (ds) => (ds && ds.length >= 7) ? `${ds.slice(0, 4)}-Q${Math.floor((+ds.slice(5, 7) - 1) / 3) + 1}` : null;
      const OM = outcomeMaps(q);
      const JP = jpMaps(q, isSales);
      const Z = { hc: 0, sc: 0 };
      const jpOf = (rec) => ({ t: JP.total[rec] || Z, a: JP.bucketA[rec] || Z, b: JP.bucketB[rec] || Z });
      const jpOfJob = (rec, title) => { const k = rec + '|' + (title || '');
        return { t: JP.totalJ[k] || Z, a: JP.bucketAJ[k] || Z, b: JP.bucketBJ[k] || Z }; };
      const outByRec = isSales ? OM.sales : OM.nonSales;
      const outByRecJob = isSales ? OM.salesJob : OM.nonSalesJob;
      const outOf = (rec) => outByRec[rec] || { hc: 0, sc: 0 };
      const outOfJob = (rec, jid) => outByRecJob[rec + '|' + (jid || '').slice(0, 8)] || { hc: 0, sc: 0 };

      // Non-Sales also shows Joined · total — actual joiners, dated by START date, the same basis Sales uses.
      // Its two sub-columns (this-quarter vs later-quarter opening) split THIS number once offers carry an
      // opening; until then the total stands on its own rather than the column sitting empty.
      const joinByRec = {}, joinByRecJob = {};
      // NON-SALES ONLY: minus anyone linked to an EARLIER quarter's opening — the same subtraction the
      // Joining Pending column uses, so both columns describe THIS quarter's work.
      // ⚠ SALES deliberately takes NO subtraction: its goal is joiners regardless of when the opening was
      // raised (Jerin, 2026-08-26). Same word, two rules, on purpose — do not "fix" it.
      if (!isSales) (data.offerEvents || []).forEach(e => {
        const rec = e.recruiter; if (!rec || !e.accepted) return;
        if (qOf(e.startDate) !== q) return;
        if (e.openingQuarter && e.openingQuarter < q) return;
        const sc = scoreForRole({ department: e.department, title: e.jobTitle, level: e.level, complexity: e.complexity }, q);
        const a = joinByRec[rec] || (joinByRec[rec] = { hc: 0, sc: 0 }); a.hc += 1; a.sc += sc;
        const jk = rec + '|' + (e.jobId8 || '');
        const b = joinByRecJob[jk] || (joinByRecJob[jk] = { hc: 0, sc: 0 }); b.hc += 1; b.sc += sc;
      });
      // Seats actually opened on a job in the SELECTED quarter, from openingBuckets — the only
      // quarter-scoped source of demand we have — SPLIT EQUALLY across the recruiters who work that job.
      // Without the split, evergreen roles blew the totals apart: Program Advisor - US (AI Programs) has 15
      // Q3 seats and 12 recruiters on it, so the Sales pod counted 146 seats where the true figure is 19.
      // An equal share is a convention, not a measurement — the data cannot say who owns which seat — but it
      // keeps a pod's Goal close to the seats it is actually carrying.
      const obk = data.openingBuckets || {};
      const sharers = {};
      recs.forEach(r => (r.byJob || []).forEach(bj => {
        const k = (bj.jobId || '').slice(0, 8); if (!k) return;
        (sharers[k] || (sharers[k] = new Set())).add(r.name);
      }));
      const seatsOf = (jid) => {
        const k = (jid || '').slice(0, 8);
        const b = obk[k];
        const qq = b && b.quarters && b.quarters[q];
        const total = qq ? (qq.total || 0) : 0;
        if (!total) return 0;
        const n = (sharers[k] && sharers[k].size) || 1;
        return total / n;
      };
      // Shared seats produce fractions; show at most one decimal and never a trailing '.0'.
      const seatFmt = (v) => (v == null ? null : (Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1)));
      // DROP = they reached an offer and then LEFT — BOTH SIDES, as asked: the candidate turning us down
      // AND the ones we withdrew, or who were archived while the offer was still open.
      // The test is the APPLICATION being archived, not the offer's own status. Of 92 archived offers,
      // 77 read CandidateRejected (candidate declined) and 15 were still sitting at
      // WaitingOnCandidateResponse/WaitingOnApprovalStart when the application was archived. Both count.
      //
      // 🚨 ATTRIBUTED BY attrQuarter — the quarter the WORK was live, not the quarter the record was closed.
      // attrQuarter is built in the pipeline, best source first:
      //   1. the offer's REAL opening, when it has one (9% of offers; 0% of drops today)
      //   2. else the quarter the candidate first ENTERED Ref Check / Documentation / Offer, read from the
      //      real stage transitions in application.listHistory
      //   3. else the archive date, so no row is ever silently unplaceable
      // Only (1) is a measurement. (2) is a CONVENTION agreed with Jerin: openings are meant to be closed
      // off each quarter, so the quarter a candidate reached the late stages is the quarter of the seat
      // they were filling. It is not a recovery of the true opening — say so on screen.
      //
      // ⚠ Do NOT go looking for the real opening again. Three routes were tested and every one returns zero
      // for archived applications: the live application.opening link, offer.latestVersion.openingId, and the
      // full offer.info version history (92 calls, 144 versions, 0 links). And only 58 of 644 offers carry an
      // opening at all — 1% in Business - India, where 41 of the 92 drops sit — so the link could never have
      // carried this metric even if archiving preserved it. That is a process gap, not a code problem.
      // ⚠ Attribution reaches back into 2025 for some drops. Those 2025 buckets are PARTIAL, because the
      // pipeline only pulls offers decided in the current year. Accepted deliberately (Jerin, 2026-08-22).
      //
      // ⚠ Do NOT match offerStatus against 'Declined'. Per the offer.list reference, offerStatus is
      // WaitingOnApprovalStart|WaitingOnOfferApproval|WaitingOnApprovalDefinition|WaitingOnCandidateResponse|
      // CandidateRejected|CandidateAccepted|OfferCancelled. 'Declined' belongs to the SEPARATE
      // acceptanceStatus field (Accepted|Declined|Pending|Created|Cancelled). Confusing the two is exactly
      // why this metric read zero three times.
      const dropByRec = {}, dropByRecJob = {};
      dropRows(data).forEach(e => {
        const rec = e.recruiter; if (!rec) return;
        if (e.quarter !== q) return;
        const sc = scoreForRole({ department: e.department, title: e.jobTitle, level: e.level, complexity: e.complexity }, q);
        const a = dropByRec[rec] || (dropByRec[rec] = { hc: 0, sc: 0 }); a.hc += 1; a.sc += sc;
        const jk = rec + '|' + (e.jobId8 || '');
        const b = dropByRecJob[jk] || (dropByRecJob[jk] = { hc: 0, sc: 0 }); b.hc += 1; b.sc += sc;
      });
      const dropOf = (rec) => dropByRec[rec] || { hc: 0, sc: 0 };
      const dropOfJob = (rec, jid) => dropByRecJob[rec + '|' + (jid || '').slice(0, 8)] || { hc: 0, sc: 0 };
      const joinOf = (rec) => joinByRec[rec] || { hc: 0, sc: 0 };
      const joinOfJob = (rec, jid) => joinByRecJob[rec + '|' + (jid || '').slice(0, 8)] || { hc: 0, sc: 0 };
      const c = x => (x == null ? DASH : x);
      const pctOf = (num, den) => (den > 0 ? Math.round((num / den) * 100) : null);

      // Gap bar: filled = (Goal - Gap) / Goal, so the bar can never disagree with the number beside it.
      const gapCell = (v) => {
        if (v.gSc == null) return `<td class="score">${DASH}</td>`;
        const fill = v.aSc > 0 ? Math.max(0, Math.min(100, Math.round(((v.aSc - v.gSc) / v.aSc) * 100))) : 0;
        const cls = v.gSc === 0 ? 'done' : (fill < 75 ? 'short' : '');
        // Caption is derived from Goal MINUS Gap, never from the raw outcome. At pod level Gap is the sum of
        // each recruiter's shortfall, so a pod whose total output exceeds its total goal can still carry a real
        // gap — quoting the raw outcome there produced "2252 of 1313 · 81%", three numbers that disagree.
        const done = Math.round(v.aSc - v.gSc);
        const cap = v.aSc > 0
          ? (v.gSc === 0 ? `${Math.round(v.aSc)} of ${Math.round(v.aSc)} · goal met` : `${done} of ${Math.round(v.aSc)} · ${fill}%`)
          : 'no goal set';
        // #19 (2026-08-23): same treatment as the HM Delta cell — a slim track that fills with the SHORTFALL,
        // number beside it, so the bar and the number can never point in opposite directions.
        const gapPct = v.aSc > 0 ? Math.max(0, Math.min(100, Math.round((v.gSc / v.aSc) * 100))) : 0;
        return `<td class="score gapcell"><span class="deltacell"><span class="track"><i style="width:${gapPct}%"></i></span>`
          + `<span class="dnum ${v.gSc === 0 ? 'none' : (gapPct >= 50 ? 'high' : '')}">${Math.round(v.gSc)}</span></span>`
          + `<span class="sublab">${cap}</span></td>`;
      };
      // Utilisation: never divide by zero - no capacity set renders as a dash, not Infinity.
      const utilCell = (v) => {
        const u = pctOf(v.uSc, v.capSc);
        if (u == null) return `<td title="No capacity set for this quarter, so utilisation cannot be worked out.">${DASH}</td>`;
        const cls = u >= 100 ? 'over' : (u >= 70 ? 'well' : 'under');
        return `<td><span class="util ${cls}">${u}%</span><span class="sublab">${v.uSc} of ${v.capSc}</span></td>`;
      };

      // Joining Pending: the total, then the two buckets defined relative to the selected quarter.
      const jpCells = (v) => {
        const j = v.jp || { t: { hc: 0, sc: 0 }, a: { hc: 0, sc: 0 }, b: { hc: 0, sc: 0 } };
        const pair = (x) => `<td>${x.hc || `<span class="zero">0</span>`}</td><td class="score">${x.sc ? Math.round(x.sc) : `<span class="zero">0</span>`}</td>`;
        return `<td style="font-weight:600">${j.t.hc || `<span class="zero">0</span>`}</td>` + pair(j.a) + pair(j.b);
      };
      // Drop carries its rate as a caption: of everything that reached a conclusion or is about to, what
      // share fell out. Denominator includes Drop itself, per Jerin 2026-08-22.
      const dropCells = (v) => {
        const j = v.jp || { t: { hc: 0 } };
        const den = (v.xHC || 0) + (j.t.hc || 0) + (v.dHC || 0);
        const pct = den > 0 ? Math.round(((v.dHC || 0) / den) * 100) : null;
        const sub = v.dHC > 0 && pct != null ? `<span class="sublab">${pct}% of outcomes</span>` : '';
        return `<td class="${v.dHC > 0 ? 'bad' : ''}">${v.dHC ? v.dHC : `<span class="zero">0</span>`}${sub}</td>`
          + `<td class="score">${v.dSc ? Math.round(v.dSc) : `<span class="zero">0</span>`}</td>`;
      };

      // #24 (Jerin, asked twice): the Offered column is GONE from Non-Sales. Both tables now show Joined as
      // the outcome. Do not put Offered back.
      const cells = (v, bold) => {
        const w = bold ? ' style="font-weight:600"' : '';
        return `<td${w}>${c(seatFmt(v.aHC))}</td><td class="score">${c(Math.round(v.aSc))}</td>`      // Goal HC / Score
          + `<td class="score">${c(v.capSc)}</td>`                               // Capacity Score
          + `<td${w}>${c(v.xHC)}</td><td class="score">${c(v.xSc)}</td>`         // Joined
          + jpCells(v)                                                          // Joining Pending: total + 2 buckets
          + dropCells(v)                                                        // Drop HC / Score + % subtext
          + `<td${w}>${c(seatFmt(v.gHC))}</td>` + gapCell(v)                     // Gap HC / Score + bar
          + utilCell(v);                                                          // Capacity Utilisation
      };

      const recFulfil = (r) => {
        // Goal = seats OPENED IN THE SELECTED QUARTER on the jobs this recruiter works, not one point per job
        // they have ever touched. Counting one per job made Goal a lifetime list under a quarter heading:
        // Deepti Leslie read a Goal of 19 for Q3 when only 3 of her 19 jobs had a Q3 opening at all.
        // ⚠ A job worked by two recruiters counts its seats for both — same attribution as before, but now
        // it is seats being duplicated rather than a flat 1, so pod totals overstate where jobs are shared.
        let aHC = 0, aSc = 0;
        (r.byJob || []).forEach(bj => {
          const seats = seatsOf(bj.jobId); if (!seats) return;
          const sc = scoreForRole(jobMeta(bj), q); aHC += seats; aSc += seats * sc;
        });
        const o = outOf(r.name), jn = joinOf(r.name), dr = dropOf(r.name), jp = jpOf(r.name);
        const capSc = capacityOf(r.name, q) || 0;
        // Outcome column = Joined on BOTH tables.
        const xHC = isSales ? o.hc : jn.hc, xSc = isSales ? o.sc : jn.sc;
        // What Gap and Capacity Utilisation are measured against (Jerin, 2026-08-24):
        //   Sales     → Joined
        //   Non-Sales → Joined + Joining Pending  (the work is delivered once the person is in closing)
        const uHC = isSales ? xHC : xHC + jp.t.hc, uSc = isSales ? xSc : xSc + jp.t.sc;
        return { aHC, aSc, capSc, xHC, xSc, uHC, uSc, dHC: dr.hc, dSc: dr.sc, jp,
                 gHC: Math.max(0, aHC - uHC), gSc: Math.max(0, aSc - uSc) };
      };
      // A recruiter with no capacity AND nothing attributed is noise; one with no capacity but real
      // offers/hires is a hygiene problem, not a row to hide - it surfaces in Data Hygiene instead.
      // dHC is in the test too: a recruiter whose only activity this quarter was people dropping out has
      // had a real (bad) quarter, and hiding that row would quietly delete the worst news in the table.
      const worthShowing = (v) => v.capSc > 0 || v.xHC > 0 || (v.jp && v.jp.t.hc > 0) || v.aHC > 0 || v.dHC > 0;

      let html = '';
      gs.forEach((G, pi) => {
        const podAgg = { aHC: 0, aSc: 0, capSc: 0, xHC: 0, xSc: 0, uHC: 0, uSc: 0, dHC: 0, dSc: 0, gHC: 0, gSc: 0,
                         jp: { t: { hc: 0, sc: 0 }, a: { hc: 0, sc: 0 }, b: { hc: 0, sc: 0 } } };
        const shown = [];
        G.recs.forEach(r => { const a = recFulfil(r); if (!worthShowing(a)) return;
          // ONE source for the chart and the table. The chart used to recompute its own target, which is how
          // it once ended up showing lifetime scores under a quarter heading. It now reads this.
          lastFulfil[r.name] = { goalSc: a.aSc, capSc: a.capSc, achievedSc: a.uSc, sales: isSales };
          ['aHC', 'aSc', 'capSc', 'xHC', 'xSc', 'uHC', 'uSc', 'dHC', 'dSc', 'gHC', 'gSc'].forEach(k => podAgg[k] += a[k]);
          // ⚠ Roll the JP buckets up too. The old key list carried a 'jpHC' that recFulfil never returned, so
          // every pod row read 0 in all three JP columns while its recruiters underneath showed real numbers.
          ['t', 'a', 'b'].forEach(k => { podAgg.jp[k].hc += a.jp[k].hc; podAgg.jp[k].sc += a.jp[k].sc; });
          shown.push({ r, a }); });
        if (!shown.length) return;
        html += `<tr class="lvl-pod" data-pod="${pi}" data-exp="0" style="cursor:pointer;background:var(--border-light)">
          <td style="font-weight:600">${CARET}${G.pod}<span style="color:var(--muted);font-weight:400;font-size:11px;margin-left:6px">${shown.length}</span></td>${cells(podAgg, true)}</tr>`;
        shown.forEach(({ r, a }, ri) => {
          const rk = `${mode}${pi}-${ri}`;
          html += `<tr class="lvl-rec" data-pod="${pi}" data-rec="${rk}" data-exp="0" style="display:none;cursor:pointer">
            <td style="padding-left:26px;font-weight:500">${CARET}${r.name}${inactiveTag(r)}</td>${cells(a, false)}</tr>`;
          const jobs = (r.byJob || []).slice().sort((x, y) => (y[isSales ? 'hired' : 'offer'] || 0) - (x[isSales ? 'hired' : 'offer'] || 0) || (y.total || 0) - (x.total || 0));
          // The role split the Fulfilment chart shades its Achieved band with (Jerin, 2026-08-29). Collected
          // HERE, from the very rows the table prints, so the chart cannot end up on a different basis —
          // this chart has been on the wrong basis twice before.
          const roleAch = [];
          if (jobs.length) {
            jobs.forEach(bj => {
              const m = jobMeta(bj), sc = scoreForRole(m, q);
              const jo = outOfJob(r.name, bj.jobId);   // dated, same basis as the recruiter row above
              const jj = joinOfJob(r.name, bj.jobId);
              const seats = seatsOf(bj.jobId);
              const jd2 = dropOfJob(r.name, bj.jobId);
              const jjp = jpOfJob(r.name, m.title);
              // A job with no seats this quarter and nothing delivered, in closing or dropped is not this
              // quarter's work.
              if (!seats && !jo.hc && !jj.hc && !jd2.hc && !jjp.t.hc) return;
              const jxHC = isSales ? jo.hc : jj.hc, jxSc = isSales ? jo.sc : jj.sc;
              const juHC = isSales ? jxHC : jxHC + jjp.t.hc, juSc = isSales ? jxSc : jxSc + jjp.t.sc;
              const jv = { aHC: seats, aSc: seats * sc, capSc: null, xHC: jxHC, xSc: jxSc, uHC: juHC, uSc: juSc,
                           dHC: jd2.hc, dSc: jd2.sc, jp: jjp,
                           gHC: Math.max(0, seats - juHC), gSc: Math.max(0, seats * sc - juSc) };
              roleAch.push({ title: m.title || '(untitled)', achievedSc: Math.round(juSc) });
              html += `<tr class="lvl-stage" data-pod="${pi}" data-parent-rec="${rk}" style="display:none">
                <td style="padding-left:52px;color:var(--muted)">${m.title || '(untitled)'}<span style="font-size:10px;margin-left:6px;color:var(--muted)">${m.level || ''}${m.complexity ? ' · ' + m.complexity : ''} · ${sc}pt</span></td>${cells(jv, false)}</tr>`;
            });
          } else {
            html += `<tr class="lvl-stage" data-pod="${pi}" data-parent-rec="${rk}" style="display:none">
              <td style="padding-left:52px;color:var(--muted);font-style:italic">No jobs attributed</td>${`<td>${DASH}</td>`.repeat(ncol - 1)}</tr>`;
          }
          if (lastFulfil[r.name]) lastFulfil[r.name].roles = roleAch;
        });
      });
      return html || `<tr><td colspan="${ncol}" style="text-align:center;color:var(--muted);padding:16px">No recruiters in this group.</td></tr>`;
    }

    const offerBody = document.getElementById('recFulfilOfferBody');
    const hireBody = document.getElementById('recFulfilHireBody');
    if (offerBody) { offerBody.innerHTML = fulfilRows(nonSalesGroups, 'offer'); wireVelTree(offerBody); }
    if (hireBody) { hireBody.innerHTML = fulfilRows(salesGroups, 'hire'); wireVelTree(hireBody); }

    // ===== #20 (2026-08-23): Joining Pending — Cases, Pod → Recruiter → Candidate =====
    // Same population and same columns as the Hiring Manager cases table, re-cut by who owns the candidate
    // rather than which department the role sits in. It is a LIVE list: everyone currently parked in Ref
    // Check, Documentation or Offer, so the quarter selector does not apply to it (the caption says so).
    // Only recruiters visible under the current filters appear, so it stays in step with the tables above.
    const jpBody = document.getElementById('recJPBody');
    if (jpBody) {
      const q2 = selQuarter();
      const byRec = {}, noRec = [];
      (data.joiningPendingCases || []).forEach(c => {
        const rec = c.recruiter;
        if (!rec || rec === 'Unassigned') { noRec.push(c); return; }
        (byRec[rec] || (byRec[rec] = [])).push(c);
      });
      const visible = new Set(recs.map(r => r.name));
      const roster = {}; allRecs.forEach(r => { if (r.name) roster[r.name] = r; });
      // ⚠ Do NOT call this group "Unassigned" — that is also a POD name, and naming it that made the table
      // read as though the no-pod exclusion had been reversed (Jerin, 2026-08-24).
      // #26 (2026-08-24): everyone in closing has to land somewhere, or this table quietly disagrees with the
      // JP figures in the tables above it. Two populations were falling off the bottom: cases with NO
      // recruiter tagged, and cases sitting with a PAST recruiter (hidden since "Include past recruiters"
      // defaults off). Both now sit in their own group so the list reconciles to the full case count.
      // ⚠ Cases hidden by an explicit Pod / Recruiter / Job selection are NOT swept in here — the user asked
      // for those to be filtered out, and re-adding them under an "unassigned" label would be a lie.
      const orphanBy = {};
      Object.entries(byRec).forEach(([rec, list]) => {
        if (visible.has(rec)) return;
        if (explicitlyFiltered(rec, q2)) return;   // the user asked for these to be filtered out
        orphanBy[rec] = list;
      });
      // Say WHY each one is here, so the group is a worklist rather than a dumping ground.
      const orphanWhy = (rec) => {
        const r = roster[rec];
        if (!r) return 'not on the recruiter roster';
        if (isRecInactive(r)) return 'past recruiter';
        if (isStatusUnknown(r)) return 'status unknown';
        if (podOf(rec, q2) === 'Unassigned') return 'no pod set';
        if (!(r.total || 0)) return 'no applications';
        return 'not shown above';
      };

      let html = '', shown = 0, unlinked = 0, orphanCount = 0;
      const byDoj = (a, b) => String(a.doj || '').localeCompare(String(b.doj || ''));
      const cnt = (n, extra) => `<span style="color:var(--muted);font-weight:400;font-size:11px;margin-left:6px">${extra ? extra + ' · ' : ''}${n}</span>`;
      const candRow = (c, path) => {
        shown++; if (!c.linked) unlinked++;
        const oq = c.openingQuarter
          ? c.openingQuarter
          : '<span style="color:var(--orange);font-size:11px">Not linked</span>';
        return `<tr data-path="${path}" style="display:none">
          <td style="padding-left:52px">${c.candidate || DASH}</td>
          <td>${oq}</td><td>${monthLabel(c.doj)}</td><td>${c.doj || DASH}</td>
          <td>${c.department || DASH}</td><td style="max-width:260px">${c.job || c.jobTitle || DASH}</td>
          <td>${c.subStage || DASH}</td></tr>`;
      };
      groups.forEach((G, pi) => {
        const mine = G.recs.filter(r => visible.has(r.name) && (byRec[r.name] || []).length);
        if (!mine.length) return;
        const podCount = mine.reduce((n, r) => n + byRec[r.name].length, 0);
        html += `<tr data-path="${pi}" data-haschild data-exp="0" style="cursor:pointer;background:var(--border-light)">
          <td style="font-weight:600">${CARET}${G.pod}${cnt(podCount)}</td>
          <td colspan="6" style="color:var(--muted)">${mine.length} recruiter${mine.length === 1 ? '' : 's'}</td></tr>`;
        mine.forEach((r, ri) => {
          const list = byRec[r.name].slice().sort(byDoj);
          html += `<tr data-path="${pi}-${ri}" data-haschild data-exp="0" style="display:none;cursor:pointer">
            <td style="padding-left:26px;font-weight:500">${CARET}${r.name}${cnt(list.length)}</td>
            <td colspan="6"></td></tr>`;
          list.forEach((c, ci) => { html += candRow(c, `${pi}-${ri}-${ci}`); });
        });
      });
      const oi = groups.length;
      const orphanNames = Object.keys(orphanBy).sort();
      orphanCount = noRec.length + orphanNames.reduce((n, k) => n + orphanBy[k].length, 0);
      if (orphanCount) {
        html += `<tr data-path="${oi}" data-haschild data-exp="0" style="cursor:pointer;background:var(--border-light)">
          <td style="font-weight:600">${CARET}No recruiter in this view${cnt(orphanCount)}</td>
          <td colspan="6" style="color:var(--muted)">Nobody in the view above owns these — kept here so the list reconciles to every case in closing.</td></tr>`;
        let ri = 0;
        if (noRec.length) {
          html += `<tr data-path="${oi}-${ri}" data-haschild data-exp="0" style="display:none;cursor:pointer">
            <td style="padding-left:26px;font-weight:500">${CARET}No recruiter tagged${cnt(noRec.length)}</td><td colspan="6" style="color:var(--orange);font-size:11px">Fix in Ashby: tag a Recruiter on the hiring team.</td></tr>`;
          noRec.slice().sort(byDoj).forEach((c, ci) => { html += candRow(c, `${oi}-${ri}-${ci}`); });
          ri++;
        }
        orphanNames.forEach(nm => {
          const list = orphanBy[nm].slice().sort(byDoj);
          html += `<tr data-path="${oi}-${ri}" data-haschild data-exp="0" style="display:none;cursor:pointer">
            <td style="padding-left:26px;font-weight:500">${CARET}${nm}${cnt(list.length, orphanWhy(nm))}</td><td colspan="6"></td></tr>`;
          list.forEach((c, ci) => { html += candRow(c, `${oi}-${ri}-${ci}`); });
          ri++;
        });
      }
      jpBody.innerHTML = html || `<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:16px">Nobody in closing under these filters.</td></tr>`;
      // ⚠ This table is a data-path tree, so it needs wireTreePath. It was wired with wireVelTree, which only
      // knows about .lvl-pod / .lvl-rec rows — so nothing here expanded at all and only the pod headers showed.
      wireTreePath(jpBody);
      const cap = document.getElementById('recJPCaption');
      if (cap) cap.innerHTML = shown
        ? `<strong>${shown}</strong> currently in Ref Check, Documentation or Offer.`
          + (orphanCount ? ` <strong>${orphanCount}</strong> of them sit in the last group — no recruiter tagged, or a recruiter this tab hides by default (past recruiter, no pod set, no applications). Everyone in closing is listed, so this table reconciles.` : '')
          + (unlinked ? ` <strong>${unlinked}</strong> have no opening attached.` : '')
          + ` This list is <strong>live</strong> — the quarter selector does not apply to it.`
        : '';
    }

    // ===== Sourcing Mix — Pod → Recruiter → Source type → Source name =====
    // Counts JOINERS (see joinerSources above), not applications. % = share within the parent row.
    // Org-wide totals live in Overall Efficiency.
    const srcBody = document.getElementById('recSourceBody');
    if (srcBody) {
      const perSrc = selQuarters();
      const nestOf = (r) => srcNestedFor(r, perSrc);
      const recSrcTotal = r => Object.values(nestOf(r)).reduce((s, names) => s + Object.values(names).reduce((a, v) => a + v, 0), 0);
      const sn = document.getElementById('recSourceNote');
      if (sn) {
        // The joiner cut needs the source ON THE OFFER RECORD, which the pipeline only started carrying on
        // 2026-08-29. Against an older data file every joiner would silently land in "(source not
        // recorded)", so say it plainly instead.
        const anySrc = (data.offerEvents || []).some(e => e.srcType);
        sn.style.display = anySrc ? 'none' : '';
        sn.innerHTML = 'Heads up: this data file predates sources being carried onto offer records, so no joiner can be attributed to a source yet. It fills in at the next refresh.';
      }
      const spSrc = document.getElementById('recSourcePeriod');
      if (spSrc) spSrc.textContent = perSrc && perSrc.length
        ? `Showing where the people who joined in ${periodLabel(perSrc)} came from.`
        : `Showing where everyone who has joined came from (all time).`;
      const grand = recs.reduce((s, r) => s + recSrcTotal(r), 0) || 1;
      let html = '';
      groups.forEach((G, pi) => {
        const podTotal = G.recs.reduce((s, r) => s + recSrcTotal(r), 0);
        html += `<tr data-path="${pi}" data-haschild data-exp="0" style="cursor:pointer;background:var(--border-light)">
          <td style="font-weight:600">${CARET}${G.pod}<span style="color:var(--muted);font-weight:400;font-size:11px;margin-left:6px">${G.recs.length}</span></td>
          <td style="font-weight:600">${podTotal || '<span class="zero">0</span>'}</td><td>${pct(podTotal, grand)}%</td></tr>`;
        G.recs.forEach((r, ri) => {
          const rt = recSrcTotal(r);
          html += `<tr data-path="${pi}-${ri}" data-haschild data-exp="0" style="display:none;cursor:pointer">
            <td style="padding-left:26px;font-weight:500">${CARET}${r.name}${inactiveTag(r)}</td>
            <td>${rt || '<span class="zero">0</span>'}</td><td>${rt ? pct(rt, podTotal) + '%' : DASH}</td></tr>`;
          // Source type → source name (from srcNested). Falls back to type-only (r.sources) until the refresh
          // that emits srcNested has run.
          const nst = nestOf(r);
          const types = Object.entries(nst).map(([t, names]) => [t, Object.values(names).reduce((a, v) => a + v, 0), names]).sort((a, b) => b[1] - a[1]);
          if (types.length) {
            types.forEach(([t, tcnt, names], ti) => {
              const hasNames = names && Object.keys(names).length;
              html += `<tr data-path="${pi}-${ri}-${ti}"${hasNames ? ' data-haschild data-exp="0"' : ''} style="display:none${hasNames ? ';cursor:pointer' : ''}">
                <td style="padding-left:52px;font-weight:500">${hasNames ? CARET : ''}${t}</td>
                <td>${tcnt}</td><td class="${pctClass(pct(tcnt, rt))}">${pct(tcnt, rt)}%</td></tr>`;
              if (hasNames) Object.entries(names).sort((a, b) => b[1] - a[1]).forEach(([nm, cnt], ni) => {
                html += `<tr data-path="${pi}-${ri}-${ti}-${ni}" style="display:none">
                  <td style="padding-left:78px;color:var(--muted)">${nm}</td>
                  <td>${cnt}</td><td class="${pctClass(pct(cnt, tcnt))}">${pct(cnt, tcnt)}%</td></tr>`;
              });
            });
          } else {
            html += `<tr data-path="${pi}-${ri}-0" style="display:none">
              <td style="padding-left:52px;color:var(--muted);font-style:italic">Nobody joined in this period</td><td>${DASH}</td><td>${DASH}</td></tr>`;
          }
        });
      });
      srcBody.innerHTML = html || `<tr><td colspan="3" style="text-align:center;color:var(--muted);padding:16px">No recruiters match the filter.</td></tr>`;
      wireTreePath(srcBody);
    }

    // ===== Time in Process — Pod → Recruiter → Job, median days parked per stage =====
    renderTimeInProcess();

    // ===== Data Hygiene — org-wide compliance (independent of Pod/Recruiter filters) =====
    renderHygiene();

    lastGroups = groups; lastRecs = recs;
    renderActiveChart();
  }

  // Quarter keys the Year/Quarter selector covers; null = all-time. Distinct from selQuarter(), which always
  // resolves to ONE quarter for pod grouping and capacity even when the selector reads "All".
  // ===== ONE definition of "outcome", used by the tables AND the chart (#22, 2026-08-23) =====
  // The chart used to compute achieved from recruiters[].byJob, which carries NO date, so it showed a
  // LIFETIME score under a quarter heading and disagreed with the table right beside it — Mahima Agarwal
  // read 531 on the chart against her real Q3 figure. The tables were moved off byJob on 2026-08-22 for
  // exactly this reason; the chart was missed. Both now call this, so they cannot drift apart again.
  //   Sales     → accepted offers whose START DATE falls in the quarter (they actually joined)
  //   Non-Sales → offers whose DECIDED date falls in the quarter (the offer was made)
  // Quarter arithmetic: "2026-Q3" +/- n. Used by the Joining-Pending split, which is defined relative to the
  // selected quarter (previous / current / upcoming).
  const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function monthLabel(ds) {
    if (!ds || ds.length < 7) return DASH;
    const m = parseInt(ds.slice(5, 7), 10);
    return m ? `${MONTH_ABBR[m - 1]} ${ds.slice(0, 4)}` : DASH;
  }

  function qShift(q, n) {
    const y = +q.slice(0, 4), i = +q.slice(6);
    const t = y * 4 + (i - 1) + n;
    return `${Math.floor(t / 4)}-Q${(t % 4) + 1}`;
  }

  // ===== Joining Pending, per recruiter, split into two buckets (#19/#21, Jerin 2026-08-23) =====
  // Source is joiningPendingCases: every candidate currently parked in Ref Check, Documentation or Offer.
  // Scores come from the job's Level/Complexity, looked up by title (the cases carry no score inputs).
  //   Non-Sales  A = Current Qtr   : everyone MINUS those linked to an opening from an earlier quarter
  //              B = Upcoming Qtr  : linked to a CURRENT-quarter opening, but starting NEXT quarter
  //   Sales      A = Prev Qtr Openings    : linked to a PREVIOUS-quarter opening, starting THIS quarter
  //              B = Current Qtr Openings : everyone MINUS those whose start date fell in the previous quarter
  // 🚨 Only 25 of 166 cases carry an opening link at all, so every rule that needs one can only judge those
  // 25; the other 141 fall through to the "everyone minus..." bucket. Openings were first attached on
  // 2026-07-25, so these splits fill in as that process matures rather than being wrong today.
  function jpMaps(q, isSales) {
    const qOf = (ds) => (ds && ds.length >= 7) ? `${ds.slice(0, 4)}-Q${Math.floor((+ds.slice(5, 7) - 1) / 3) + 1}` : null;
    const prevQ = qShift(q, -1), nextQ = qShift(q, 1);
    const meta = {};
    (data.jobs || []).forEach(j => { if (j.title && !meta[j.title]) meta[j.title] = j; });
    const bucketA = {}, bucketB = {};
    // Job-level too, keyed recruiter|job title. Job rows used to print a hard 0 in every JP column, which
    // reads as "nobody in closing on this role" when the real answer was "not worked out per job".
    const bucketAJ = {}, bucketBJ = {};
    const add = (m, rec, sc) => { const a = m[rec] || (m[rec] = { hc: 0, sc: 0 }); a.hc += 1; a.sc += sc; };
    (data.joiningPendingCases || []).forEach(c => {
      const rec = c.recruiter; if (!rec || rec === 'Unassigned') return;
      const j = meta[c.job || c.jobTitle || ''] || {};
      const sc = scoreForRole({ department: c.department, title: c.job || c.jobTitle, level: j.level, complexity: j.complexity }, q);
      const oq = c.openingQuarter || null, dq = qOf(c.doj || c.startDate);
      const jk = rec + '|' + (c.job || c.jobTitle || '');
      // #27 (Jerin, 2026-08-24) — the settled definitions, one line each. Do not re-derive them.
      if (isSales) {
        // A: the opening was raised LAST quarter and the candidate joins THIS quarter (carried over).
        // B: everyone else in closing — i.e. the whole population MINUS A, so A + B is the total.
        // ⚠ B used to test `dq !== prevQ`, which is a different question entirely and read 85 of 153.
        if (oq === prevQ && dq === q) { add(bucketA, rec, sc); add(bucketAJ, jk, sc); }
        else { add(bucketB, rec, sc); add(bucketBJ, jk, sc); }
      } else {
        // A: everyone except those sitting on an EARLIER quarter's opening (the HM card rule), MINUS anyone
        //    whose joining date falls in the NEXT quarter.
        // B: the opening was raised THIS quarter but the candidate joins NEXT quarter.
        // That last clause on A is what makes the two DISJOINT (Jerin, 2026-08-24). Without it everyone in B
        // was also in A — their opening is this quarter, so nothing excluded them — and Total = A + B counted
        // them twice. It reads 0 today only because no offer carried an opening link before 2026-07-25.
        if (!(oq && oq < q) && dq !== nextQ) { add(bucketA, rec, sc); add(bucketAJ, jk, sc); }
        if (oq === q && dq === nextQ) { add(bucketB, rec, sc); add(bucketBJ, jk, sc); }
      }
    });
    // Total is the two sub-columns ADDED, never a separate count — that is what stops the three JP figures
    // on this tab from drifting apart again. It is why Non-Sales and Sales totals differ by the carried-over
    // person: Non-Sales is measured on offers, so last quarter's opening should not count toward it.
    const sum = (...ms) => { const out = {}; ms.forEach(m => Object.entries(m).forEach(([k, v]) => {
      const t = out[k] || (out[k] = { hc: 0, sc: 0 }); t.hc += v.hc; t.sc += v.sc; })); return out; };
    return { total: sum(bucketA, bucketB), bucketA, bucketB,
             totalJ: sum(bucketAJ, bucketBJ), bucketAJ, bucketBJ };
  }

  // Offered -> Hired for ONE quarter, per recruiter and per (recruiter, job).
  // ⚠ This panel used to read recruiters[].offer / .hired, which carry NO date — so the Year/Quarter
  // selector regrouped the pods and changed not a single number. Same family as the three panels fixed on
  // 2026-08-21: a lifetime figure under a quarter heading is impossible to spot by looking at it.
  // Basis: an offer belongs to the quarter its outcome was DECIDED in (decidedAt), so every offer in the
  // denominator has actually been answered — a conversion rate whose denominator still contains undecided
  // offers reads low for reasons that have nothing to do with the recruiter.
  // ===== Sourcing Mix, quarter-scoped (2026-08-25) =====
  // The source counts carried NO date, so this panel's Year/Quarter selector regrouped pods and changed
  // nothing else. The pipeline now emits recruiters[].srcQ {quarter:{type:{name:count}}}, bucketed by the
  // quarter the candidate APPLIED. Falls back to the undated srcNested when running against older data —
  // and says so on screen rather than passing lifetime numbers off as the quarter's.
  // ===== Sourcing Mix counts JOINERS, not applications (Jerin, 2026-08-29) =====
  // "Need this to be only for Hired folks." A source that brings 25,810 applications and 2 joiners was
  // reading as the biggest channel on the tab; this asks the question worth asking — which sources produce
  // people who actually start.
  // Joiner = accepted offer whose START DATE falls in the selected period. The same rule "Joined" means
  // everywhere else on the site, so this panel and Fulfilment count the same people.
  // The source comes off the offer record (srcType / srcName), which the pipeline started carrying on
  // 2026-08-29 — it was always on the application, it just was not travelling as far as the offer.
  // ⚠ A joiner whose application has no source is kept under "(source not recorded)" rather than dropped,
  // so the panel totals still reconcile with Joined. About 5% today.
  const NO_SRC = '(source not recorded)';
  let _jsQ = null, _js = null;
  function joinerSources(per) {
    const key = (per && per.length) ? per.join(',') : 'ALL';
    if (_jsQ === key && _js) return _js;
    const qOf = (ds) => (ds && ds.length >= 7) ? `${ds.slice(0, 4)}-Q${Math.floor((+ds.slice(5, 7) - 1) / 3) + 1}` : null;
    const inPeriod = (q) => !per || !per.length ? !!q : per.indexOf(q) >= 0;
    const byRec = {};
    (data.offerEvents || []).forEach(e => {
      if (!e.accepted) return;
      const q = qOf(e.startDate);
      if (!q || !inPeriod(q)) return;
      const rec = e.recruiter; if (!rec) return;
      const t = e.srcType || NO_SRC;
      const n = e.srcType ? (e.srcName || '(unspecified)') : NO_SRC;
      const a = byRec[rec] || (byRec[rec] = {});
      const b = a[t] || (a[t] = {});
      b[n] = (b[n] || 0) + 1;
    });
    _jsQ = key; _js = byRec;
    return byRec;
  }
  function srcNestedFor(r, per) { return joinerSources(per)[r.name] || {}; }

  // ===== Joining Conversion (spec settled with Jerin, 2026-08-26) =====
  //   Offered           = Joined + Joining Pending + Dropped
  //   Joined            = started in the quarter, MINUS anyone linked to an EARLIER quarter's opening
  //   Joining Pending   = the HM Positions card rule - in Ref Check / Documentation / Offer, minus
  //                       earlier-quarter openings. LIVE, so the same people sit in every quarter.
  //   Dropped           = the unified dropEvents list (reached a late stage, then archived)
  //   Joining Conversion = (Joined + Joining Pending) / Offered
  //
  // ⚠ TWO THINGS TO KNOW BEFORE "FIXING" THIS PANEL:
  // 1. The conversion is algebraically 1 - Dropped/Offered, because Joined and JP appear on BOTH sides of
  //    the fraction and cancel. It therefore sits near 96% and moves only with drops. Jerin chose this
  //    knowing that: it answers "what share of everyone who reached an offer has not fallen out".
  // 2. Joining Pending is LIVE while Joined and Dropped are quarterly, so the same ~165 people are inside
  //    every quarter's Offered. Deliberate - it keeps this column identical to the HM card rather than
  //    inventing a fifth definition of Joining Pending. The definitions block says both of these on screen.
  function convMaps(q) {
    const qOf = (ds) => (ds && ds.length >= 7) ? `${ds.slice(0, 4)}-Q${Math.floor((+ds.slice(5, 7) - 1) / 3) + 1}` : null;
    const byRec = {}, byRecJob = {};
    // byRecJob carries the same three counts one level down, per ROLE, so the chart can shade each band by
    // role (Jerin, 2026-08-29) without recomputing anything the table did not.
    const bump = (rec, key, title) => {
      const a = byRec[rec] || (byRec[rec] = { o: 0, j: 0, p: 0, dr: 0 });
      a[key] += 1;
      const t = title || '(no role recorded)';
      const m = byRecJob[rec] || (byRecJob[rec] = {});
      const b = m[t] || (m[t] = { o: 0, j: 0, p: 0, dr: 0 });
      b[key] += 1;
    };
    // Joined - people, by start date, minus last quarter's carry-over.
    (data.offerEvents || []).forEach(e => {
      const rec = e.recruiter; if (!rec) return;
      if (!e.accepted || qOf(e.startDate) !== q) return;
      if (e.openingQuarter && e.openingQuarter < q) return;
      bump(rec, 'j', e.jobTitle);
    });
    // Joining Pending - identical rule to the HM Positions card, and LIVE.
    (data.joiningPendingCases || []).forEach(c => {
      const rec = c.recruiter; if (!rec || rec === 'Unassigned') return;
      if (c.openingQuarter && c.openingQuarter < q) return;
      bump(rec, 'p', c.job || c.jobTitle);
    });
    // Dropped - the one unified list, shared with HM and both Fulfilment tables.
    dropRows(data).forEach(e => {
      const rec = e.recruiter; if (!rec) return;
      if (e.quarter !== q) return;
      bump(rec, 'dr', e.job || e.jobTitle);
    });
    Object.values(byRec).forEach(a => { a.o = a.j + a.p + a.dr; });
    Object.values(byRecJob).forEach(m => Object.values(m).forEach(a => { a.o = a.j + a.p + a.dr; }));
    return { byRec, byRecJob };
  }

  function outcomeMaps(q) {
    const qOf = (ds) => (ds && ds.length >= 7) ? `${ds.slice(0, 4)}-Q${Math.floor((+ds.slice(5, 7) - 1) / 3) + 1}` : null;
    const sales = {}, nonSales = {}, salesJob = {}, nonSalesJob = {};
    (data.offerEvents || []).forEach(e => {
      const rec = e.recruiter; if (!rec) return;
      const sc = scoreForRole({ department: e.department, title: e.jobTitle, level: e.level, complexity: e.complexity }, q);
      const jk = rec + '|' + (e.jobId8 || '');
      if (e.accepted && qOf(e.startDate) === q) {
        const a = sales[rec] || (sales[rec] = { hc: 0, sc: 0 }); a.hc += 1; a.sc += sc;
        const aj = salesJob[jk] || (salesJob[jk] = { hc: 0, sc: 0 }); aj.hc += 1; aj.sc += sc;
      }
      if (qOf(e.decidedAt) === q) {
        const b = nonSales[rec] || (nonSales[rec] = { hc: 0, sc: 0 }); b.hc += 1; b.sc += sc;
        const bj = nonSalesJob[jk] || (nonSalesJob[jk] = { hc: 0, sc: 0 }); bj.hc += 1; bj.sc += sc;
      }
    });
    return { sales, nonSales, salesJob, nonSalesJob };
  }

  function tisPeriod() { return selQuarters(); }

  // Spells out which stages actually follow the period, so quarter-scoped columns never sit unlabelled
  // next to the live App Review one.
  function tisNote(per) {
    const el = document.getElementById('recTisNote'); if (!el) return;
    if (!per) { el.style.display = 'none'; return; }
    const label = per.length === 1 ? per[0] : per[0].slice(0, 4);
    el.style.display = '';
    el.style.color = tisHasQ ? 'var(--muted)' : 'var(--orange)';
    el.innerHTML = tisHasQ
      ? `Showing <strong>${label}</strong> — candidates who <strong>entered</strong> each stage in that period. <span style="color:var(--orange)">*</span> ${APP_REVIEW_LIVE_NOTE}`
      : `Heads up: these medians are <strong>all-time</strong>, not ${label}. The stage-history file predates the per-quarter breakdown — it appears here after the next stage-history refresh.`;
  }

  // Pod → Recruiter → Job, median days a candidate is parked per stage (red > 5). App Review = still-parked
  // dwell (main pull); TA Screen → Offer from stage history. Job rows are job-level (all recruiters on the job).
  function renderTimeInProcess() {
    const body = document.getElementById('recTisBody'); if (!body) return;
    const head = document.getElementById('recTisHead');
    const per = tisPeriod();
    if (head) {
      let h = '<tr><th style="min-width:230px">Pod / Recruiter / Job</th>';
      TIS_STAGES.forEach(([sk, lbl]) => {
        const live = per && sk === 'appReview';
        h += `<th${live ? ` title="${APP_REVIEW_LIVE_NOTE}"` : ''}>${lbl}${live ? '<span style="color:var(--orange)">*</span>' : ''}</th>`;
      });
      head.innerHTML = h + '</tr>';
    }
    if (!tisRec && !arDwellRec) { body.innerHTML = `<tr><td colspan="${TIS_STAGES.length + 1}" style="text-align:center;color:var(--muted);padding:16px">Time-in-stage data pending the next stage-history refresh.</td></tr>`; return; }
    const q = selQuarter();
    const groups = groupByPod(getFilteredRecs(), q);
    // App Review is a live snapshot with no historical dimension, so it never takes the period; the rest do.
    const recHists = (r) => TIS_STAGES.map(([sk]) => sk === 'appReview' ? ((arDwellRec && arDwellRec[r.name]) || {}) : tisHist(tisRec, tisRecQ, r.name, sk, per));
    const jobHists = (j8) => TIS_STAGES.map(([sk]) => sk === 'appReview' ? ((arDwellJob && arDwellJob[j8]) || {}) : tisHist(tisJob, tisJobQ, j8, sk, per));
    const rowCells = (arr) => arr.map(hh => tisCell(hh, 5)).join('');
    const poolCells = (arrs) => TIS_STAGES.map((_, i) => tisCell(poolHists(arrs.map(a => a[i])), 5)).join('');
    let html = '';
    groups.forEach((G, pi) => {
      html += `<tr class="lvl-pod" data-pod="${pi}" data-exp="0" style="cursor:pointer;background:var(--border-light)"><td style="font-weight:600">${CARET}${G.pod}<span style="color:var(--muted);font-weight:400;font-size:11px;margin-left:6px">${G.recs.length}</span></td>${poolCells(G.recs.map(recHists))}</tr>`;
      G.recs.forEach((r, ri) => {
        const rk = `t${pi}-${ri}`;
        html += `<tr class="lvl-rec" data-pod="${pi}" data-rec="${rk}" data-exp="0" style="display:none;cursor:pointer"><td style="padding-left:26px;font-weight:500">${CARET}${r.name}${inactiveTag(r)}</td>${rowCells(recHists(r))}</tr>`;
        const jobs = (r.byJob || []).slice().sort((a, b) => (b.total || 0) - (a.total || 0));
        if (jobs.length) jobs.forEach(bj => {
          html += `<tr class="lvl-stage" data-pod="${pi}" data-parent-rec="${rk}" style="display:none"><td style="padding-left:52px;color:var(--muted)">${bj.title || '(untitled)'}</td>${rowCells(jobHists((bj.jobId || '').slice(0, 8)))}</tr>`;
        });
        else html += `<tr class="lvl-stage" data-pod="${pi}" data-parent-rec="${rk}" style="display:none"><td style="padding-left:52px;color:var(--muted);font-style:italic">No jobs attributed</td>${'<td class="zero" style="text-align:right">·</td>'.repeat(TIS_STAGES.length)}</tr>`;
      });
    });
    body.innerHTML = html || `<tr><td colspan="${TIS_STAGES.length + 1}" style="text-align:center;color:var(--muted);padding:16px">No recruiters match the filter.</td></tr>`;
    wireVelTree(body);
    tisNote(per);
  }

  // Surfaces data.dataQuality (the attribution pass's compliance payload) + the Active/Inactive roster.
  function renderHygiene() {
    const dq = data.dataQuality || {};
    const q = selQuarter();
    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const mono = s => `<span style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:var(--muted)">${esc(s)}</span>`;
    const unassigned = dq.unassigned || [];
    const multiRec = dq.multiRecruiter || [];
    const multiSrc = dq.multiSourcer || [];
    const inactiveCount = allRecs.filter(r => isRecInactive(r)).length;

    // --- summary cards ---
    const cards = document.getElementById('hygCards');
    if (cards) {
      cards.style.cssText = 'display:grid;grid-template-columns:repeat(5,1fr);gap:12px';
      const card = (label, value, sub, color) => `<div class="card"><div class="label">${label}</div><div class="value"${color ? ` style="color:${color}"` : ''}>${value}</div><div class="sub">${sub}</div></div>`;
      cards.innerHTML =
        card('Unassigned (screening+)', unassigned.length, 'need a Recruiter tag', unassigned.length ? 'var(--orange)' : 'var(--green)') +
        card('Unassigned (all funnel)', (dq.unassignedTotal || 0).toLocaleString(), 'incl. App Review — not yet worked', 'var(--muted)') +
        card('Multi-Recruiter apps', multiRec.length, 'first is credited', multiRec.length ? 'var(--orange)' : 'var(--green)') +
        card('Multi-Sourcer apps', multiSrc.length, 'should be zero', multiSrc.length ? 'var(--red)' : 'var(--green)') +
        card('Inactive recruiters', inactiveCount, 'departed, retained for history', 'var(--muted)');
    }

    // --- Unassigned: group by job, candidate rows ---
    const uBody = document.getElementById('hygUnassignedBody');
    if (uBody) {
      const byJob = {};
      unassigned.forEach(u => { const k = u.jobTitle || u.job8 || '(unknown job)'; (byJob[k] || (byJob[k] = [])).push(u); });
      const jobs = Object.keys(byJob).sort((a, b) => byJob[b].length - byJob[a].length);
      let html = '';
      jobs.forEach((jt, ji) => {
        const rows = byJob[jt];
        html += `<tr class="pod-header" data-g="u${ji}" data-exp="0" style="cursor:pointer;background:var(--border-light)">
          <td style="font-weight:600">${CARET}${esc(jt)}<span style="color:var(--muted);font-weight:400;font-size:11px;margin-left:6px">${rows.length}</span></td>
          <td colspan="3" style="color:var(--muted);font-size:11px">${rows.length} candidate${rows.length === 1 ? '' : 's'} awaiting recruiter tag</td></tr>`;
        rows.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '')).forEach(u => {
          html += `<tr class="leaf" data-g="u${ji}" style="display:none">
            <td style="padding-left:30px">${esc(u.candidate || '(candidate name not captured)')}</td>
            <td>${esc(u.stage || '')}</td><td>${esc(u.createdAt || '')}</td><td>${mono(u.applicationId)}</td></tr>`;
        });
      });
      uBody.innerHTML = html || `<tr><td colspan="4" style="text-align:center;color:var(--green);padding:16px">No unassigned candidates in active screening — the roster is clean. ✓</td></tr>`;
      wirePodTree(uBody);
    }

    // --- Multi-Recruiter / Multi-Sourcer anomaly tables ---
    const jobTitleBy8 = {}; (data.jobs || []).forEach(j => { jobTitleBy8[j.id] = j.title; });
    const anomalyRows = (list) => list.map(m =>
      `<tr><td>${esc(jobTitleBy8[m.job8] || m.job8 || '')}</td>
        <td>${(m.names || []).map(esc).join(', ')}</td><td>${mono(m.app)}</td></tr>`).join('');
    const mrBody = document.getElementById('hygMultiRecBody');
    if (mrBody) mrBody.innerHTML = anomalyRows(multiRec) || `<tr><td colspan="3" style="text-align:center;color:var(--green);padding:16px">No multi-recruiter applications. ✓</td></tr>`;
    const msBody = document.getElementById('hygMultiSrcBody');
    if (msBody) msBody.innerHTML = anomalyRows(multiSrc) || `<tr><td colspan="3" style="text-align:center;color:var(--green);padding:16px">No multi-sourcer applications. ✓</td></tr>`;

    // --- Active / Inactive roster ---
    const rBody = document.getElementById('hygRosterBody');
    if (rBody) {
      const sorted = [...allRecs].filter(r => r.name && r.name !== 'Unassigned')
        .sort((a, b) => (isRecInactive(a) - isRecInactive(b)) || a.name.localeCompare(b.name));
      rBody.innerHTML = sorted.map(r => {
        const unknown = isStatusUnknown(r), active = !isRecInactive(r);
        const label = unknown ? 'Unknown' : (active ? 'Active' : 'Inactive');
        const colour = unknown ? 'var(--orange)' : (active ? 'var(--green)' : 'var(--red)');
        const tip = unknown ? ' title="No Ashby user record matched this name, so the status is unknown rather than Active."' : (active ? ' title="Holds an elevated recruiter seat in Ashby."' : ' title="No longer holds an elevated recruiter seat in Ashby."');
        return `<tr><td style="font-weight:500">${esc(r.name)}</td>
          <td><span${tip} style="font-size:11px;font-weight:600;color:${colour}">${label}</span></td>
          <td>${esc(podOf(r.name, q))}</td><td>${r.offer || 0}</td><td class="${(r.hired || 0) > 0 ? 'good' : 'zero'}">${r.hired || 0}</td></tr>`;
      }).join('') || `<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:16px">No recruiters.</td></tr>`;
    }

    // --- Opening-link gaps: one array from the pipeline, split by whether it is still
    // actionable. Both tabs read the same rows so the tab counts can never disagree. ---
    const gaps = data.offerLinkGaps || [];
    const gapLive = gaps.filter(g => g.needsFix);
    const gapDone = gaps.filter(g => !g.needsFix);

    const ogBody = document.getElementById('hygOfferGapBody');
    if (ogBody) {
      ogBody.innerHTML = gapLive.map(g => `<tr>
        <td style="font-weight:500">${esc(g.candidate)}</td><td>${esc(g.job)}</td><td>${esc(g.department)}</td>
        <td>${esc(g.subStage)}</td><td>${esc(g.doj || '—')}</td><td>${esc(g.recruiter || '—')}</td></tr>`).join('')
        || `<tr><td colspan="6" style="text-align:center;color:var(--green);padding:16px">Every live offer has an opening attached. ✓</td></tr>`;
    }
    const hgBody = document.getElementById('hygHiredGapBody');
    if (hgBody) {
      hgBody.innerHTML = gapDone.map(g => `<tr>
        <td style="font-weight:500">${esc(g.candidate)}</td><td>${esc(g.job)}</td><td>${esc(g.department)}</td>
        <td>${esc(g.subStage)}</td><td>${esc(g.appStatus || '')}</td><td>${esc(g.doj || '—')}</td><td>${esc(g.recruiter || '—')}</td></tr>`).join('')
        || `<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:16px">Nothing here.</td></tr>`;
    }

    // --- Roles missing score inputs (Level and/or Complexity) ---
    // Both fields come from Ashby job custom fields and are needed for the role Score. A role missing
    // either scores nothing, which silently deflates its department's Fulfilment target — surfaced here
    // rather than left to be discovered as a number that looks low for no visible reason.
    const unscored = (data.jobs || [])
      .map(j => ({ j, missing: [!j.level || j.level === 'NA' ? 'Level' : null, !j.complexity ? 'Complexity' : null].filter(Boolean) }))
      .filter(x => x.missing.length)
      .sort((a, b) => (b.j.total || 0) - (a.j.total || 0));
    const usBody = document.getElementById('hygUnscoredBody');
    if (usBody) {
      usBody.innerHTML = unscored.map(({ j, missing }) => `<tr>
        <td style="font-weight:500">${esc(j.title || '(untitled)')}</td>
        <td>${esc(j.department || '—')}</td>
        <td class="${!j.level || j.level === 'NA' ? 'zero' : ''}">${esc(j.level || '—')}</td>
        <td class="${!j.complexity ? 'zero' : ''}">${esc(j.complexity || '—')}</td>
        <td style="color:var(--orange);font-weight:500">${missing.join(' + ')}</td>
        <td>${j.total || 0}</td></tr>`).join('')
        || `<tr><td colspan="6" style="text-align:center;color:var(--green);padding:16px">Every role has both Level and Complexity. ✓</td></tr>`;
    }

    // --- Other anomalies ---
    const anomList = [];
    (dq.excludedAsRecruiter || []).forEach(n => anomList.push({
      what: 'Excluded interviewer credited as a Recruiter',
      detail: n,
      fix: 'Correct the recruiter attribution in Ashby — this person is a dedicated interviewer, not a recruiter.'
    }));
    // A stage title Ashby uses that the pipeline has no mapping for is dropped from EVERY count, silently.
    // That is how "Online Assessment" reported zero for months while candidates sat in it — the map only
    // knew the literal string 'OA'. Surfacing it here means the next stage rename shows up as a row instead
    // of as a column that quietly stops counting.
    // Two titles are unmapped BY DESIGN and must not be raised as anomalies: 'Hired' is counted from the
    // application's status rather than its stage, and 'Archived' means rejected/withdrawn, correctly absent
    // from live pipeline counts. They are also the two biggest (14,023 + 309) — left in, they would bury the
    // real signal and train everyone to ignore this list.
    const EXPECTED_UNMAPPED = { Hired: 'counted from application status, not stage', Archived: 'rejected/withdrawn — deliberately outside the live pipeline' };
    const unmapped = Object.entries(dq.unmappedStages || {}).sort((a, b) => b[1] - a[1]);
    unmapped.filter(([stage]) => !EXPECTED_UNMAPPED[stage]).forEach(([stage, n]) => anomList.push({
      what: 'Ashby stage not recognised by the dashboard',
      detail: `"${stage}" — ${n} application${n === 1 ? '' : 's'} currently in it, counted nowhere`,
      fix: 'Either rename the stage in Ashby to match the pipeline, or add it to STAGE_KEY_MAP in DataRefresh.gs. Until then these candidates are invisible to every metric.'
    }));
    const expectedSeen = unmapped.filter(([stage]) => EXPECTED_UNMAPPED[stage]);
    const anBody = document.getElementById('hygAnomBody');
    if (anBody) {
      let ah = anomList.map(a => `<tr><td style="font-weight:500">${esc(a.what)}</td><td>${esc(a.detail)}</td><td style="color:var(--muted)">${esc(a.fix)}</td></tr>`).join('')
        || `<tr><td colspan="3" style="text-align:center;color:var(--green);padding:16px">No anomalies. ✓</td></tr>`;
      // Shown, but as a muted footnote rather than an alert — so it is on the record that these were seen
      // and consciously excluded, not that the check missed them.
      if (expectedSeen.length) {
        ah += `<tr><td colspan="3" style="color:var(--muted);font-size:11px;padding-top:10px;border-top:1px solid var(--border-light)">`
          + `Also outside the stage map, as expected: `
          + expectedSeen.map(([st, n]) => `<strong>${esc(st)}</strong> (${n.toLocaleString()} — ${esc(EXPECTED_UNMAPPED[st])})`).join(' · ')
          + `. No action needed.</td></tr>`;
      }
      anBody.innerHTML = ah;
    }

    // --- Capacity not set, but candidates attributed ---
    // Capacity 0 is legitimate for people who carry no req load (admins, coordinators). It is only a problem
    // when candidates ARE attributed to them, because Fulfilment then shows work with no target to measure it
    // against — and the Fulfilment row-hiding rule deliberately keeps them visible rather than dropping the work.
    const noCap = allRecs
      .filter(r => r.name && r.name !== 'Unassigned')
      .map(r => ({ r, cap: capacityOf(r.name, q) || 0,
                   offers: r.offer || 0, hired: r.hired || 0, jp: r.joiningPending || 0 }))
      .filter(x => x.cap === 0 && (x.offers > 0 || x.hired > 0 || x.jp > 0))
      .sort((a, b) => (b.offers + b.hired) - (a.offers + a.hired));
    const noCapBody = document.getElementById('hygNoCapBody');
    if (noCapBody) {
      noCapBody.innerHTML = noCap.map(({ r, cap, offers, hired, jp }) => {
        const unknown = isStatusUnknown(r), active = !isRecInactive(r);
        const label = unknown ? 'Unknown' : (active ? 'Active' : 'Inactive');
        const colour = unknown ? 'var(--orange)' : (active ? 'var(--green)' : 'var(--red)');
        return `<tr><td style="font-weight:500">${esc(r.name)}</td>
          <td><span style="font-size:11px;font-weight:600;color:${colour}">${label}</span></td>
          <td>${esc(podOf(r.name, q))}</td>
          <td><span style="color:var(--red);font-weight:600">${cap}</span></td>
          <td>${offers}</td><td class="${hired > 0 ? 'good' : 'zero'}">${hired}</td>
          <td class="${jp > 0 ? 'warn' : 'zero'}">${jp}</td></tr>`;
      }).join('') || `<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:16px">Nobody with candidates attributed is missing a capacity for this quarter.</td></tr>`;
    }

    // --- #23: pod not set — the numbers this tab is deliberately leaving out ---
    // getFilteredRecs() drops anyone whose pod resolves to "Unassigned", from rows AND totals. That is only
    // honest if the excluded work is visible somewhere, which is here. Data Hygiene ignores the tab filters
    // by design, so past recruiters are listed too.
    const noPod = allRecs
      .filter(r => r.name && r.name !== 'Unassigned' && podOf(r.name, q) === 'Unassigned')
      .map(r => ({ r, cap: capacityOf(r.name, q) || 0, total: r.total || 0,
                   offers: r.offer || 0, hired: r.hired || 0, jp: r.joiningPending || 0 }))
      .sort((a, b) => (b.offers + b.hired) - (a.offers + a.hired) || a.r.name.localeCompare(b.r.name));
    const noPodBody = document.getElementById('hygNoPodBody');
    if (noPodBody) {
      noPodBody.innerHTML = noPod.map(({ r, cap, total, offers, hired, jp }) => {
        const unknown = isStatusUnknown(r), active = !isRecInactive(r);
        const label = unknown ? 'Unknown' : (active ? 'Active' : 'Past recruiter');
        const colour = unknown ? 'var(--orange)' : (active ? 'var(--green)' : 'var(--red)');
        return `<tr><td style="font-weight:500">${esc(r.name)}</td>
          <td><span style="font-size:11px;font-weight:600;color:${colour}">${label}</span></td>
          <td>${total.toLocaleString()}</td>
          <td>${offers}</td><td class="${hired > 0 ? 'good' : 'zero'}">${hired}</td>
          <td class="${jp > 0 ? 'warn' : 'zero'}">${jp}</td>
          <td class="${cap > 0 ? '' : 'zero'}">${cap}</td></tr>`;
      }).join('') || `<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:16px">Every recruiter has a pod set for this quarter — nothing is being excluded.</td></tr>`;
    }

    // --- tab counts ---
    const setN = (id, n, warn) => {
      const el = document.getElementById(id);
      if (el) { el.textContent = n; el.style.color = el.closest('.hyg-tab').classList.contains('active') ? '' : (warn && n > 0 ? 'var(--red)' : ''); }
    };
    setN('hygNUnassigned', unassigned.length, true);
    setN('hygNMultiRec', multiRec.length, true);
    setN('hygNMultiSrc', multiSrc.length, true);
    setN('hygNRoster', allRecs.filter(r => r.name && r.name !== 'Unassigned').length, false);
    setN('hygNOfferGap', gapLive.length, true);
    setN('hygNHiredGap', gapDone.length, false);
    setN('hygNUnscored', unscored.length, true);
    setN('hygNNoPod', noPod.length, true);
    setN('hygNNoCap', noCap.length, true);
    setN('hygNAnom', anomList.length, true);

    // --- CSV export per tab (client-side; no backend) ---
    hygCsv = {
      nopod: () => [['Recruiter', 'Status', 'Applications', 'Offers', 'Hired', 'Joining pending', 'Capacity'],
        ...noPod.map(({ r, cap, total, offers, hired, jp }) => [r.name,
          (isStatusUnknown(r) ? 'Unknown' : (isRecInactive(r) ? 'Past recruiter' : 'Active')),
          total, offers, hired, jp, cap])],
      nocap: () => [['Recruiter', 'Status', 'Pod', 'Capacity', 'Offers', 'Hired', 'Joining pending'],
        ...noCap.map(({ r, cap, offers, hired, jp }) => [r.name,
          (r.activeKnown === false ? 'Unknown' : (r.isActive === false ? 'Inactive' : 'Active')),
          podOf(r.name, q), cap, offers, hired, jp])],
      unassigned: () => [['Job', 'Candidate', 'Stage', 'Applied', 'Application ID'],
        ...unassigned.map(u => [u.jobTitle || u.job8 || '', u.candidate || '', u.stage || '', u.createdAt || '', u.applicationId || ''])],
      multirec: () => [['Job', 'Recruiters tagged', 'Application ID'],
        ...multiRec.map(m => [jobTitleBy8[m.job8] || m.job8 || '', (m.names || []).join(' | '), m.app || ''])],
      multisrc: () => [['Job', 'Sourcers tagged', 'Application ID'],
        ...multiSrc.map(m => [jobTitleBy8[m.job8] || m.job8 || '', (m.names || []).join(' | '), m.app || ''])],
      roster: () => [['Recruiter', 'Status', 'Pod', 'Offers', 'Hired'],
        ...[...allRecs].filter(r => r.name && r.name !== 'Unassigned')
          .sort((a, b) => (isRecInactive(a) - isRecInactive(b)) || a.name.localeCompare(b.name))
          .map(r => [r.name, isRecInactive(r) ? 'Inactive' : 'Active', podOf(r.name, q), r.offer || 0, r.hired || 0])],
      offergap: () => [['Candidate', 'Job', 'Department', 'Stage', 'DOJ', 'Recruiter'],
        ...gapLive.map(g => [g.candidate || '', g.job || '', g.department || '', g.subStage || '', g.doj || '', g.recruiter || ''])],
      hiredgap: () => [['Candidate', 'Job', 'Department', 'Stage', 'Status', 'DOJ', 'Recruiter'],
        ...gapDone.map(g => [g.candidate || '', g.job || '', g.department || '', g.subStage || '', g.appStatus || '', g.doj || '', g.recruiter || ''])],
      unscored: () => [['Job', 'Department', 'Level', 'Complexity', 'Missing', 'Applications'],
        ...unscored.map(({ j, missing }) => [j.title || '', j.department || '', j.level || '', j.complexity || '', missing.join(' + '), j.total || 0])],
      anomalies: () => [['Anomaly', 'Detail', 'What to do'], ...anomList.map(a => [a.what, a.detail, a.fix])]
    };
  }

  // Turns a row array into a downloaded CSV. Quotes every field so commas, quotes and
  // newlines in job titles or candidate names can't break the columns.
  let hygCsv = {};
  function downloadCsv(rows, filename) {
    const body = rows.map(r => r.map(v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ===== Momentum render (Pod -> Recruiter -> Stage; last 30 days of range, descending) =====
  function velDates() {
    const toV = document.getElementById('recVelTo')?.value;
    const fromV = document.getElementById('recVelFrom')?.value;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let end = toV ? new Date(toV + 'T00:00:00') : today;
    if (end > today) end = today; // never show future dates — cap the window at today
    const start = fromV ? new Date(fromV + 'T00:00:00') : null;
    const out = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(end); d.setDate(end.getDate() - i);
      if (start && d < start) break;
      out.push(d);
    }
    return out; // most recent first
  }
  function applyVelYearQuarter() {
    const y = document.getElementById('recVelYear')?.value || '';
    const q = document.getElementById('recVelQuarter')?.value || '';
    const fromEl = document.getElementById('recVelFrom'), toEl = document.getElementById('recVelTo');
    if (!fromEl || !toEl || (!y && !q)) return;
    const yr = y || String(new Date().getFullYear());
    if (q) {
      const qi = parseInt(q.slice(1), 10); const sm = (qi - 1) * 3 + 1; const em = sm + 2;
      const last = new Date(parseInt(yr, 10), em, 0).getDate();
      fromEl.value = `${yr}-${String(sm).padStart(2, '0')}-01`;
      toEl.value = `${yr}-${String(em).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
    } else { fromEl.value = `${yr}-01-01`; toEl.value = `${yr}-12-31`; }
  }
  // ===== ToFU (top of funnel) — rebuilt 2026-08-26 to Jerin's spec =====
  // "How many candidates got added to ToFU on a particular day. ToFU is HM or OA or R1, whichever comes
  //  first. Once a candidate is logged as added to ToFU they shouldn't be repeated in the same job."
  // So this is ONE row per candidate, not three rows of stages. The three signals are HM Screening entry,
  // an assessment TRIGGERED while the candidate sat in the Online Assessment stage, and an R1 interview
  // being BOOKED (dated the day it was booked). Cancelled bookings and cancelled assessments do not count.
  // The deduplication happens in the PIPELINE — candidate identity exists nowhere in this file — and it
  // resets each quarter, so quarters do not add up to a year.
  // ⚠ Deliberately NOT Screening Efficiency's "Added", which counts arrivals at each stage separately and
  // counts a person again every time they re-enter one. Two questions, two numbers. Do not reconcile them.
  function dkey(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function tofuStores() {
    const sr = data.stageRollups || {};
    return { rec: sr.tofuByRecruiter || null, recJob: sr.tofuByRecruiterJob || null };
  }
  // Pod colours, shared by the Momentum chart and the pod hairline in its table.
  const POD_COLORS = ['#4E6BA6', '#398AA2', '#1E7590', '#938FB8', '#B5859A'];
  function renderVelocity() {
    const head = document.getElementById('recVelHead');
    const body = document.getElementById('recVelBody');
    if (!body) return;
    const { rec: tRec, recJob: tRecJob } = tofuStores();
    const recs = getFilteredRecs();
    const groups = groupByPod(recs, selQuarter());
    const dates = velDates();
    const dkeys = dates.map(dkey);

    if (head) {
      let h = `<tr><th style="min-width:240px">Pod / Recruiter / Job</th><th>Total · ${dates.length}d</th>`;
      dates.forEach(d => {
        const wknd = d.getDay() === 0 || d.getDay() === 6;
        h += `<th class="${wknd ? 'wknd' : ''}"${wknd ? ' title="Weekend"' : ''}>${MON[d.getMonth()]} ${d.getDate()}</th>`;
      });
      head.innerHTML = h + '</tr>';
    }
    const ncol = dates.length + 2;
    // No ToFU field yet (rollups file written before 2026-08-26). Say so rather than falling back to the
    // old per-stage counts: those answer a different question and would sit under this heading as a lie.
    if (!tRec) {
      body.innerHTML = `<tr><td colspan="${ncol}" style="text-align:center;color:var(--muted);padding:16px">ToFU arrivals appear after the next stage-history refresh.</td></tr>`;
      return;
    }
    const numRow = (total, perDay, boldTotal) =>
      `<td${boldTotal ? ' style="font-weight:600"' : ''}>${total > 0 ? total : '<span class="zero">0</span>'}</td>`
      + perDay.map(v => `<td>${v > 0 ? v : '<span class="zero">·</span>'}</td>`).join('');
    const series = (m) => { let t = 0; const per = dkeys.map(dk => { const v = (m && m[dk]) || 0; t += v; return v; }); return { per, t }; };
    const addInto = (dst, src) => { src.forEach((v, i) => dst[i] += v); };
    const jobTitleOf = {}; (data.jobs || []).forEach(j => { jobTitleOf[j.id] = j.title; });
    const spanN = (n) => `<span style="color:var(--muted);font-weight:400;font-size:11px;margin-left:6px">${n}</span>`;

    let html = '';
    groups.forEach((G, pi) => {
      const podArr = new Array(dkeys.length).fill(0); let podTotal = 0;
      const recSeries = G.recs.map(r => { const sres = series(tRec[r.name]); addInto(podArr, sres.per); podTotal += sres.t; return sres; });
      // The pod's own colour from the chart, as a hairline down its row — the table and the chart are
      // reading the same pods, and this is the cheapest way to say so without adding a column.
      const podColor = POD_COLORS[pi % POD_COLORS.length];
      html += `<tr class="lvl-pod" data-path="${pi}" data-haschild data-exp="0" style="cursor:pointer;background:var(--border-light)">
        <td style="font-weight:600;box-shadow:inset 3px 0 0 ${podColor}">${CARET}${G.pod}${spanN(G.recs.length)}</td>${numRow(podTotal, podArr, true)}</tr>`;
      G.recs.forEach((r, ri) => {
        const rp = `${pi}-${ri}`;
        const jobs = [];
        const mine = tRecJob && tRecJob[r.name];
        if (mine) {
          Object.keys(mine).forEach(j8 => {
            const sres = series(mine[j8]);
            if (sres.t) jobs.push({ j8, title: jobTitleOf[j8] || j8, per: sres.per, t: sres.t });
          });
          jobs.sort((a, b) => b.t - a.t);
        }
        const quiet = recSeries[ri].t === 0 ? ' lvl-quiet' : '';
        html += `<tr class="lvl-rec${quiet}" data-path="${rp}"${jobs.length ? ' data-haschild data-exp="0"' : ''} style="display:none${jobs.length ? ';cursor:pointer' : ''}">
          <td style="padding-left:26px;font-weight:500">${jobs.length ? CARET : ''}${r.name}${inactiveTag(r)}${jobs.length ? spanN(jobs.length) : ''}</td>${numRow(recSeries[ri].t, recSeries[ri].per, false)}</tr>`;
        jobs.forEach((J, ji) => {
          html += `<tr class="lvl-job" data-path="${rp}-${ji}" style="display:none">
            <td style="padding-left:52px">${J.title}</td>${numRow(J.t, J.per, false)}</tr>`;
        });
      });
    });
    body.innerHTML = html || `<tr><td colspan="${ncol}" style="text-align:center;color:var(--muted);padding:16px">No recruiters match the filter.</td></tr>`;
    wireTreePath(body);
  }

  // ===== charts (standard palette + square legends) =====
  // Pastel palette, applied site-wide 2026-08-09. blue=True Blue, green=Blue Munsell (positive/achieved),
  // cyan=Cerulean, amber=Fairy Tale (used for shortfall/gap), slate=Cool Gray. Do not hardcode off-palette hexes.
  const C = { blue: '#4E6BA6', green: '#398AA2', cyan: '#1E7590', amber: '#D8B5BE', slate: '#938FB8' };
  const legendSquare = () => ({ position: 'top', align: 'center', labels: { usePointStyle: true, pointStyle: 'rect', boxWidth: 11, boxHeight: 11, padding: 16, font: { size: 12 } } });
  const gridY = { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 11 } } };
  const gridX = { grid: { display: false }, ticks: { font: { size: 11 } } };
  const podLabels = () => lastGroups.map(G => G.pod);
  const sumBy = (G, key) => G.recs.reduce((s, r) => s + (r[key] || 0), 0);

  // ===== Momentum heatmap — recruiter × day (2026-08-30) =====
  // Was a stacked column per day. Jerin asked for a heatmap, on the condition that hovering a square lists
  // the ROLES behind it with a count against each — which is exactly what the column chart could not do
  // without a legend of twenty entries.
  // Built as HTML, not canvas, on purpose: the grid IS a table of counts, and a multi-line role list renders
  // badly in a canvas tooltip.
  // Reads the same tofuByRecruiter / tofuByRecruiterJob as the table below it, over the same days, so the
  // per-day and per-recruiter totals here are the table's own numbers.
  const HEAT_LO = [238, 244, 246], HEAT_HI = [30, 117, 144];
  function heatShade(v, mx) {
    const t = 0.16 + 0.84 * (mx > 0 ? v / mx : 0);
    const m = (i) => Math.round(HEAT_LO[i] + (HEAT_HI[i] - HEAT_LO[i]) * t);
    return `rgb(${m(0)},${m(1)},${m(2)})`;
  }
  function buildVelChart() {
    const host = document.getElementById('recVelHeat');
    const tip = document.getElementById('recVelHeatTip');
    if (!host) return;
    const { rec: tRec, recJob: tRecJob } = tofuStores();
    if (!tRec) { host.innerHTML = ''; return; }
    const chrono = [...velDates()].reverse();
    const keys = chrono.map(dkey);
    const isWknd = chrono.map(d => d.getDay() === 0 || d.getDay() === 6);
    const jobTitleOf8 = {}; (data.jobs || []).forEach(j => { jobTitleOf8[String(j.id).slice(0, 8)] = j.title; });

    // Only the recruiters this tab shows, busiest first — same population as the table.
    const rows = [];
    groupByPod(getFilteredRecs(), selQuarter()).forEach(G => G.recs.forEach(r => {
      const per = keys.map(k => (tRec[r.name] || {})[k] || 0);
      const total = per.reduce((a, v) => a + v, 0);
      if (total > 0) rows.push({ name: r.name, pod: G.pod, per, total });
    }));
    rows.sort((a, b) => b.total - a.total);
    if (!rows.length) {
      host.innerHTML = '<p class="sub-note" style="margin:6px 0 0">Nobody was added to ToFU in this window for the recruiters shown.</p>';
      return;
    }

    // Roles behind each (recruiter, day) — what the hover lists.
    const roleAt = {};
    rows.forEach(r => {
      const mine = (tRecJob && tRecJob[r.name]) || {};
      Object.keys(mine).forEach(j8 => {
        keys.forEach((k, i) => {
          const v = (mine[j8] || {})[k] || 0;
          if (!v) return;
          const cell = roleAt[`${r.name}|${i}`] || (roleAt[`${r.name}|${i}`] = []);
          cell.push({ title: jobTitleOf8[j8] || j8, n: v });
        });
      });
    });

    const mx = Math.max(...rows.map(r => Math.max(...r.per)));
    const dayTot = keys.map((_, i) => rows.reduce((a, r) => a + r.per[i], 0));
    const grand = dayTot.reduce((a, v) => a + v, 0);
    const MONS = MON;
    const esc = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    let html = '<div class="heat-row"><div class="heat-name heat-hd">' + MONS[chrono[0].getMonth()] + '</div>'
      + chrono.map((d, i) => `<div class="heat-cell heat-hd${isWknd[i] ? ' wknd' : ''}" style="background:none">${d.getDate()}</div>`).join('')
      + '<div class="heat-tot heat-hd">30d</div></div>';
    rows.forEach((r, ri) => {
      html += `<div class="heat-row"><div class="heat-name" title="${esc(r.pod)}">${esc(r.name)}</div>`;
      r.per.forEach((v, i) => {
        const cls = 'heat-cell' + (v ? ' has' : (isWknd[i] ? ' wknd' : ''));
        const st = v ? ` style="background:${heatShade(v, mx)};color:${v / mx > 0.45 ? '#fff' : '#334155'}"` : '';
        html += `<div class="${cls}"${st} data-r="${ri}" data-d="${i}">${v || ''}</div>`;
      });
      html += `<div class="heat-tot">${r.total}</div></div>`;
    });
    html += '<div class="heat-row heat-foot"><div class="heat-name">total</div>'
      + dayTot.map(t => `<div class="heat-cell">${t || '·'}</div>`).join('')
      + `<div class="heat-tot">${grand}</div></div>`;
    html += '<div class="heat-scale">fewer'
      + [1, 2, 3, 4, 5].map(k => `<i style="background:${heatShade(mx * k / 5, mx)}"></i>`).join('')
      + `more<span style="margin-left:14px">darkest = ${mx} in a day</span></div>`;
    host.innerHTML = html;

    // Hover: the roles behind that square, with a count against each.
    const wrap = document.getElementById('recVelHeatWrap');
    host.onmouseover = (e) => {
      const cell = e.target.closest('.heat-cell.has');
      if (!cell || !tip) return;
      const r = rows[+cell.dataset.r], i = +cell.dataset.d, d = chrono[i];
      const list = (roleAt[`${r.name}|${i}`] || []).slice().sort((a, b) => b.n - a.n);
      const named = list.reduce((a, x) => a + x.n, 0);
      const rest = r.per[i] - named;
      const wk = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
      tip.innerHTML = `<div class="tip-hd">${wk} ${d.getDate()} ${MONS[d.getMonth()]} · <b>${esc(r.name)}</b> · ${r.per[i]} added</div>`
        + list.map(x => `<div class="tip-row"><span>${esc(x.title)}</span><span>${x.n}</span></div>`).join('')
        + (rest > 0 ? `<div class="tip-row" style="color:var(--muted)"><span>role not recorded</span><span>${rest}</span></div>` : '')
        + (!list.length && rest <= 0 ? '<div class="tip-row" style="color:var(--muted)"><span>no role recorded</span><span></span></div>' : '');
      tip.style.display = 'block';
      const wb = wrap.getBoundingClientRect(), cb = cell.getBoundingClientRect();
      const tw = tip.offsetWidth;
      let left = cb.left - wb.left + cell.offsetWidth / 2 - tw / 2;
      left = Math.max(0, Math.min(left, wrap.clientWidth - tw));
      tip.style.left = left + 'px';
      const top = cb.top - wb.top + wrap.scrollTop - tip.offsetHeight - 8;
      tip.style.top = (top < 0 ? cb.top - wb.top + cell.offsetHeight + 8 : top) + 'px';
    };
    host.onmouseout = (e) => {
      if (tip && !e.relatedTarget?.closest?.('.heat-cell.has')) tip.style.display = 'none';
    };
  }

  const SCREEN_SOLID = '#4E6BA6', SCREEN_PALE = '#C5CFE5';
  function buildScreenChart() {
    const ctx = document.getElementById('recScreenChart'); if (!ctx) return;
    if (recScreenChart) recScreenChart.destroy();
    const store = (data.stageRollups && data.stageRollups.r1ByRecruiter) || null;
    const wrap = ctx.parentElement;
    let emptyMsg = wrap && wrap.querySelector('.chart-empty');
    const per = selQuarters();
    const sumFor = (name) => {
      const byQ = store && store[name]; const acc = { added: 0, cleared: 0 };
      if (!byQ) return acc;
      const keys = (per && per.length) ? per : Object.keys(byQ);
      keys.forEach(qq => { const c = byQ[qq]; if (c) { acc.added += c.added || 0; acc.cleared += c.cleared || 0; } });
      return acc;
    };
    // Per-JOB detail for the role gradient inside each band (Jerin, 2026-08-29). Same store the table reads.
    const jobStore = (data.stageRollups && data.stageRollups.r1ByRecruiterJob) || null;
    const jobTitleOfR1 = {}; (data.jobs || []).forEach(j => { jobTitleOfR1[String(j.id).slice(0, 8)] = j.title; });
    const jobsFor = (name) => {
      const mine = jobStore && jobStore[name]; if (!mine) return [];
      return Object.keys(mine).map(j8 => {
        const byQ = mine[j8]; const acc = { added: 0, cleared: 0 };
        const keys = (per && per.length) ? per : Object.keys(byQ || {});
        keys.forEach(qq => { const c = byQ && byQ[qq]; if (c) { acc.added += c.added || 0; acc.cleared += c.cleared || 0; } });
        return { title: jobTitleOfR1[j8] || j8, v: acc };
      }).filter(x => x.v.added > 0);
    };
    const recs = store ? [...lastRecs].map(r => ({ name: r.name, ...sumFor(r.name), per: jobsFor(r.name) }))
      .filter(r => r.added > 0).sort((a, b) => b.added - a.added) : [];
    if (!recs.length) {
      ctx.style.display = 'none';
      if (wrap && !emptyMsg) { emptyMsg = document.createElement('div'); emptyMsg.className = 'chart-empty'; emptyMsg.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100%;min-height:120px;color:var(--muted);font-size:13px;text-align:center;padding:20px'; wrap.appendChild(emptyMsg); }
      if (emptyMsg) { emptyMsg.textContent = store ? 'Nobody was added at R1 in this period.' : 'R1 screening figures appear after the next stage-history refresh.'; emptyMsg.style.display = 'flex'; }
      return;
    }
    ctx.style.display = ''; if (emptyMsg) emptyMsg.style.display = 'none';
    const SCREEN_METRICS = [
      { key: 'moved', label: 'Progressed past R1', color: SCREEN_SOLID },
      { key: 'still', label: 'Still at R1', color: SCREEN_PALE }
    ];
    const screenRows = recs.map(r => ({
      label: r.name,
      sum: { moved: r.cleared, still: Math.max(0, r.added - r.cleared) },
      jobs: (r.per || []).map(x => ({ title: x.title, v: { moved: x.v.cleared, still: Math.max(0, x.v.added - x.v.cleared) } }))
    }));
    // Bar thickness matches the Fulfilment chart (Jerin, 2026-08-29) — 46px a row, same bar/category split.
    const h = hbarHeight(recs.length);
    if (wrap) wrap.style.height = h + 'px';
    ctx.style.maxHeight = h + 'px';

    const labelPlugin = {
      id: 'screenLabels',
      afterDatasetsDraw(chart) {
        const c = chart.ctx; c.save();
        c.font = '10px -apple-system, BlinkMacSystemFont, sans-serif'; c.textBaseline = 'middle';
        const eMeta = chart.getDatasetMeta(chart.data.datasets.length - 1);
        // The percentage sits in its own column at the far right of the plot area — square under a heading,
        // rather than floating wherever each bar happens to end (Jerin, 2026-08-29). The count stays with
        // the bar, because that one belongs to the bar's length.
        const colX = chart.chartArea.right + 46;
        c.textAlign = 'center';
        c.fillStyle = '#64748b';
        c.font = '600 9px -apple-system, BlinkMacSystemFont, sans-serif';
        c.fillText('PROGRESSED', colX, chart.chartArea.top - 10);
        c.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
        recs.forEach((r, i) => {
          const end = eMeta.data[i]; if (!end) return;
          if (r.added > 0) { c.fillStyle = '#334155'; c.textAlign = 'left'; c.fillText(String(r.added), end.x + 5, end.y); }
          if (r.added > 0) {
            const v = pct(r.cleared, r.added);
            c.textAlign = 'center';
            c.fillStyle = v >= 50 ? '#0F6B62' : (v >= 20 ? '#A16207' : '#A15568');
            c.font = '600 11px -apple-system, BlinkMacSystemFont, sans-serif';
            c.fillText(v + '%', colX, end.y);
            c.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
          }
        });
        c.restore();
      }
    };

    recScreenChart = new Chart(ctx, {
      type: 'bar',
      data: { labels: recs.map(r => r.name), datasets: roleBandDatasets(screenRows, SCREEN_METRICS, { borderRadius: 2 }) },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false, layout: { padding: { right: 96, top: 14 } },
        plugins: {
          valueLabels: false, stackTotals: false,
          legend: metricLegend(SCREEN_METRICS, { align: 'center', labels: { boxWidth: 11, boxHeight: 11, padding: 14, font: { size: 12 } } }),
          tooltip: { filter: (it) => (it.parsed.x || 0) > 0, callbacks: {
            label: (it) => `${it.dataset._titles[it.dataIndex] || 'role not recorded'} \u2014 ${it.dataset.label}: ${it.parsed.x}`,
            footer: (items) => {
              if (!items.length) return '';
              const r = recs[items[0].dataIndex];
              return `Added at R1: ${r.added} \u00b7 progressed ${pct(r.cleared, r.added)}%`;
            }
          } }
        },
        scales: {
          x: { ...gridY, stacked: true, title: { display: true, text: 'Candidates added at R1', font: { size: 11 }, color: '#64748b' } },
          y: { stacked: true, grid: { display: false }, ticks: { font: { size: 11, weight: '500' } } }
        }
      },
      plugins: [labelPlugin, roleBandOverlay(SCREEN_METRICS)]
    });
  }
  function buildJoinChart() {
    const ctx = document.getElementById('recJoinChart'); if (!ctx) return;
    if (recJoinChart) recJoinChart.destroy();
    // Joined / Joining Pending / Dropped stacked, with OFFERED - the sum of the three - printed at the end.
    // Reads the same convMaps call as the table, so the two can never disagree.
    const CMc = convMaps(selQuarter());
    const cOfC = (n) => CMc.byRec[n] || { o: 0, j: 0, p: 0, dr: 0 };
    const recs = [...lastRecs].filter(r => cOfC(r.name).o > 0).sort((a, b) => cOfC(b.name).o - cOfC(a.name).o);
    const wrap = ctx.parentElement;
    let emptyMsg = wrap && wrap.querySelector('.chart-empty');
    if (!recs.length) {
      if (recJoinChart) { recJoinChart.destroy(); recJoinChart = null; }
      ctx.style.display = 'none';
      if (wrap && !emptyMsg) { emptyMsg = document.createElement('div'); emptyMsg.className = 'chart-empty'; emptyMsg.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100%;min-height:120px;color:var(--muted);font-size:13px;text-align:center;padding:20px'; wrap.appendChild(emptyMsg); }
      if (emptyMsg) { emptyMsg.textContent = 'Nothing in play this quarter for the recruiters shown.'; emptyMsg.style.display = 'flex'; }
      return;
    }
    ctx.style.display = ''; if (emptyMsg) emptyMsg.style.display = 'none';
    const joined = recs.map(r => cOfC(r.name).j);
    const pending = recs.map(r => cOfC(r.name).p);
    const dropped = recs.map(r => cOfC(r.name).dr);
    const offered = recs.map(r => cOfC(r.name).o);
    const h = hbarHeight(recs.length);
    if (wrap) wrap.style.height = h + 'px';
    ctx.style.maxHeight = h + 'px';
    // Each of Joined / Joining Pending / Dropped is split into the ROLES behind it, in shades of its colour
    // (Jerin, 2026-08-29). The metric's own number is kept, drawn once across its bands rather than on
    // every band; the role name is in the tooltip.
    const JC_METRICS = [
      { key: 'j', label: 'Joined', color: C.green },
      { key: 'p', label: 'Joining Pending', color: '#C9A227' },
      { key: 'dr', label: 'Dropped', color: '#b45a72' }
    ];
    const jcRows = recs.map(r => {
      const per = CMc.byRecJob && CMc.byRecJob[r.name] ? CMc.byRecJob[r.name] : {};
      const v = cOfC(r.name);
      return {
        label: r.name,
        sum: { j: v.j, p: v.p, dr: v.dr },
        jobs: Object.keys(per).map(title => ({ title, v: per[title] }))
      };
    });
    const endLabels = {
      id: 'joinLabels',
      afterDatasetsDraw(chart) {
        const c = chart.ctx; c.save();
        c.font = '10px -apple-system, BlinkMacSystemFont, sans-serif'; c.textBaseline = 'middle';
        // Offered sits at the end of the bar; the Joining Conversion is its own labelled column at the
        // right edge (Jerin, 2026-08-29), so it reads straight down like a table column instead of as a
        // suffix on each bar. Same arithmetic as the table's column — (Joined + Joining Pending) / Offered
        // — read off the same convMaps.
        const last = chart.getDatasetMeta(chart.data.datasets.length - 1);
        last.data.forEach((bar, i) => {
          c.textAlign = 'left';
          c.fillStyle = '#334155';
          c.fillText(String(offered[i]), bar.x + 6, bar.y);
        });
        c.restore();
        drawConvColumn(chart, offered.map((o, i) => o > 0 ? Math.round(((joined[i] + pending[i]) / o) * 100) : null), 'Joining conversion');
      }
    };
    recJoinChart = new Chart(ctx, { type: 'bar',
      data: { labels: recs.map(r => r.name), datasets: roleBandDatasets(jcRows, JC_METRICS, { borderRadius: 2 }) },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, layout: { padding: { right: CONV_PAD + 34, top: 20 } },
        plugins: { valueLabels: false, stackTotals: false,
          tooltip: { filter: (it) => (it.parsed.x || 0) > 0, callbacks: {
            label: (it) => `${it.dataset._titles[it.dataIndex] || 'role not recorded'} \u2014 ${it.dataset.label}: ${it.parsed.x}`,
            footer: (items) => { const i = items[0].dataIndex; const conv = offered[i] > 0 ? Math.round(((joined[i] + pending[i]) / offered[i]) * 100) : null; return conv == null ? `Offered: ${offered[i]}` : `Offered: ${offered[i]} \u00b7 Joining Conversion ${conv}%`; } } },
          legend: metricLegend(JC_METRICS, { align: 'center', labels: { boxWidth: 11, boxHeight: 11, padding: 14, font: { size: 12 } } }) },
        scales: { x: { ...gridY, stacked: true, title: { display: true, text: 'People', font: { size: 11 }, color: '#64748b' } }, y: { stacked: true, grid: { display: false }, ticks: { font: { size: 11, weight: '500' } } } } },
      plugins: [endLabels, roleBandOverlay(JC_METRICS)] });
  }
  // Fulfilment chart, rebuilt 2026-08-29 to Jerin's spec: "let target be the Goal, instead of capacity...
  // let capacity be a marker on the bar, like a finishing line of sorts. Even when Target is less than
  // capacity, it will show that the person is meeting numbers but far from capacity utilization."
  //   bar        = Achieved (Joined for Sales, Joined + Joining Pending for Non-Sales)
  //   pink       = the shortfall to GOAL, when there is one
  //   Goal line  = the demand they are accountable for this quarter
  //   Cap line   = the finishing line: what they could carry
  // 🚨 Every figure comes from lastFulfil, which the TABLE fills in as it renders. The chart must never
  // recompute a target of its own — it did once, and showed lifetime scores under a quarter heading.
  function buildFulfilChart() {
    const ctx = document.getElementById('recFulfilChart'); if (!ctx) return;
    if (recFulfilChart) recFulfilChart.destroy();
    const q = selQuarter();
    const recs = lastRecs.map(r => {
      const f = lastFulfil[r.name];
      if (!f) return null;
      const goal = Math.round(f.goalSc || 0), cap = Math.round(f.capSc || 0), achieved = Math.round(f.achievedSc || 0);
      return { name: r.name, goal, cap, achieved, short: Math.max(0, goal - achieved), roles: f.roles || [] };
    }).filter(r => r && (r.goal > 0 || r.cap > 0 || r.achieved > 0))
      .sort((a, b) => b.achieved - a.achieved);
    const wrap = ctx.parentElement;
    let emptyMsg = wrap && wrap.querySelector('.chart-empty');
    if (!recs.length) {
      if (recFulfilChart) { recFulfilChart.destroy(); recFulfilChart = null; }
      ctx.style.display = 'none';
      if (wrap && !emptyMsg) { emptyMsg = document.createElement('div'); emptyMsg.className = 'chart-empty'; emptyMsg.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100%;min-height:120px;color:var(--muted);font-size:13px;text-align:center;padding:20px'; wrap.appendChild(emptyMsg); }
      if (emptyMsg) { emptyMsg.textContent = `Nothing to show for ${q.replace('-', ' ')} — no goal, capacity or joiners on any recruiter in this view.`; emptyMsg.style.display = 'flex'; }
      return;
    }
    ctx.style.display = '';
    if (emptyMsg) emptyMsg.style.display = 'none';
    // Wider bars (Jerin): 46px a row rather than 30, and the bar filling most of its slot.
    const h = hbarHeight(recs.length);
    if (wrap) wrap.style.height = h + 'px';
    ctx.style.maxHeight = h + 'px';
    const axisMax = Math.max(...recs.map(r => Math.max(r.achieved, r.goal, r.cap))) * 1.1;

    const markers = {
      id: 'fulfilMarkers',
      afterDatasetsDraw(chart) {
        const c = chart.ctx, meta = chart.getDatasetMeta(0), x = chart.scales.x;
        c.save();
        c.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
        c.textBaseline = 'middle';
        recs.forEach((r, i) => {
          const bar = meta.data[i]; if (!bar) return;
          const half = (bar.height || 18) / 2;
          const y0 = bar.y - half, y1 = bar.y + half;
          // The Achieved number is drawn by roleBandOverlay now — once across all of its role bands,
          // rather than inside the first band only.
          // GOAL — the target. Solid slate line, labelled above the bar.
          if (r.goal > 0) {
            const gx = x.getPixelForValue(r.goal);
            c.strokeStyle = '#41506B'; c.lineWidth = 2; c.setLineDash([]);
            c.beginPath(); c.moveTo(gx, y0 - 3); c.lineTo(gx, y1 + 3); c.stroke();
            c.fillStyle = '#41506B'; c.textAlign = 'center';
            c.fillText('Goal ' + r.goal, gx, y0 - 9);
          }
          // CAPACITY — the finishing line. Dashed, so it never reads as another target.
          if (r.cap > 0) {
            const cx = x.getPixelForValue(r.cap);
            c.strokeStyle = '#A15568'; c.lineWidth = 2; c.setLineDash([3, 3]);
            c.beginPath(); c.moveTo(cx, y0 - 3); c.lineTo(cx, y1 + 3); c.stroke();
            c.setLineDash([]);
            c.fillStyle = '#A15568'; c.textAlign = 'center';
            c.fillText('Cap ' + r.cap, cx, y1 + 10);
          }
        });
        c.restore();
      }
    };

    // Achieved is split into the ROLES behind it, in shades of the metric colour (Jerin, 2026-08-29), read
    // from the role scores the TABLE recorded. Short-of-Goal is deliberately NOT split: it is a residual
    // against the goal, not something any single role owns — the same reason Delta stays whole elsewhere.
    const FUL_METRICS = [
      { key: 'achieved', label: 'Achieved (Score)', color: C.green },
      { key: 'short', label: 'Short of Goal (Score)', color: C.amber, split: false }
    ];
    const fulRows = recs.map(r => ({
      label: r.name,
      sum: { achieved: r.achieved, short: r.short },
      jobs: (r.roles || []).filter(x => x.achievedSc > 0).map(x => ({ title: x.title, v: { achieved: x.achievedSc } }))
    }));
    recFulfilChart = new Chart(ctx, {
      type: 'bar',
      data: { labels: recs.map(r => r.name), datasets: roleBandDatasets(fulRows, FUL_METRICS, { borderRadius: 2 }) },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false, layout: { padding: { right: 40, top: 20, bottom: 8 } },
        plugins: {
          valueLabels: false, stackTotals: false,
          legend: metricLegend(FUL_METRICS, { align: 'center', labels: { boxWidth: 11, boxHeight: 11, padding: 14, font: { size: 12 } } }),
          tooltip: {
            filter: (it) => (it.parsed.x || 0) > 0,
            callbacks: {
              label: (it) => `${it.dataset._titles[it.dataIndex] || 'across the quarter'} \u2014 ${it.dataset.label}: ${it.parsed.x}`,
              afterBody: (items) => {
                if (!items.length) return '';
                const r = recs[items[0].dataIndex];
                const util = r.cap > 0 ? Math.round((r.achieved / r.cap) * 100) + '% of capacity' : 'no capacity set';
                const vs = r.goal > 0 ? (r.achieved >= r.goal ? `${r.achieved - r.goal} past goal` : `${r.goal - r.achieved} short of goal`) : 'no goal this quarter';
                return [`Goal ${r.goal} \u00b7 Capacity ${r.cap}`, vs, util];
              }
            }
          }
        },
        scales: {
          x: { ...gridY, stacked: true, suggestedMax: axisMax, title: { display: true, text: 'Score', font: { size: 11 }, color: '#64748b' } },
          y: { stacked: true, grid: { display: false }, ticks: { font: { size: 11, weight: '500' } } }
        }
      },
      plugins: [markers, roleBandOverlay(FUL_METRICS)]
    });
  }
  function buildSourceChart() {
    const ctx = document.getElementById('recSourceChart'); if (!ctx) return;
    if (recSourceChart) { recSourceChart.destroy(); recSourceChart = null; }
    const wrap = ctx.parentElement;
    let emptyMsg = wrap && wrap.querySelector('.chart-empty');
    // Recruiter-centric stacked bar: Y = recruiter (top 20 by joiners), stacked by source_type.
    // Reads the SAME joiner map as the table below it — one source of truth, no recomputation.
    const perS = selQuarters();
    const typeTotals = (r) => { const out = {}; Object.entries(srcNestedFor(r, perS)).forEach(([t, names]) => { out[t] = Object.values(names).reduce((a, v) => a + v, 0); }); return out; };
    const srcTotal = r => Object.values(typeTotals(r)).reduce((s, v) => s + v, 0);
    const withSrc = [...lastRecs].filter(r => srcTotal(r) > 0).sort((a, b) => srcTotal(b) - srcTotal(a)).slice(0, 20);
    if (withSrc.length === 0) {
      ctx.style.display = 'none';
      if (wrap && !emptyMsg) { emptyMsg = document.createElement('div'); emptyMsg.className = 'chart-empty'; emptyMsg.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100%;min-height:120px;color:var(--muted);font-size:13px;text-align:center;padding:20px'; wrap.appendChild(emptyMsg); }
      if (emptyMsg) { emptyMsg.textContent = 'Nobody joined under the current filter, so there is no source mix to show.'; emptyMsg.style.display = 'flex'; }
      return;
    }
    ctx.style.display = ''; if (emptyMsg) emptyMsg.style.display = 'none';
    // aggregate source_types by volume; keep top 6 + roll the rest into "Other"
    const tt = {}; withSrc.forEach(r => { tt[r.name] = typeTotals(r); });
    const agg = {}; withSrc.forEach(r => Object.entries(tt[r.name]).forEach(([s, v]) => agg[s] = (agg[s] || 0) + v));
    const ordered = Object.entries(agg).sort((a, b) => b[1] - a[1]).map(e => e[0]);
    const topTypes = ordered.slice(0, 6); const rest = ordered.slice(6);
    // 🚨 The roll-up bucket must NOT be keyed on the string "Other": Ashby has a real source type called
    // exactly that, and when it landed in the top 6 the bucket's data replaced it — the chart read 7,799
    // against the table's 7,810 for Q1 (2026-08-26). Key the bucket on a sentinel and label it distinctly.
    const REST = '\u0000rest';
    const cats = rest.length ? [...topTypes, REST] : topTypes;
    const palette = [C.blue, C.green, C.cyan, C.slate, C.amber, '#C5CFE5', '#94a3b8'];
    const datasets = cats.map((cat, ci) => ({
      label: cat === REST ? 'All other types' : cat, backgroundColor: palette[ci % palette.length], stack: 's', borderRadius: 2, ...HBAR,
      data: withSrc.map(r => cat === REST ? rest.reduce((s, t) => s + (tt[r.name][t] || 0), 0) : (tt[r.name][cat] || 0))
    }));
    const h = hbarHeight(withSrc.length);
    if (wrap) wrap.style.height = h + 'px'; ctx.style.maxHeight = h + 'px';
    recSourceChart = new Chart(ctx, { type: 'bar',
      data: { labels: withSrc.map(r => r.name), datasets },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top', align: 'center', labels: { usePointStyle: true, pointStyle: 'rect', boxWidth: 11, boxHeight: 11, padding: 12, font: { size: 11 } } } },
        scales: { x: { ...gridY, stacked: true, title: { display: true, text: 'Joiners', font: { size: 11 }, color: '#64748b' } }, y: { stacked: true, grid: { display: false }, ticks: { font: { size: 11, weight: '500' } } } } } });
  }
  function renderActiveChart() {
    if (activeTab === 'velocity') buildVelChart();
    else if (activeTab === 'screening') buildScreenChart();
    else if (activeTab === 'joining') buildJoinChart();
    else if (activeTab === 'fulfilment') buildFulfilChart();
    else if (activeTab === 'sourcing') buildSourceChart();
  }

  function showTab(name) {
    activeTab = name;
    document.querySelectorAll('.rec-subtab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.rec-panel').forEach(p => { p.style.display = p.dataset.panel === name ? '' : 'none'; });
    renderActiveChart();
  }
  document.querySelectorAll('.rec-subtab').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));

  // Nested tabs inside Data Hygiene — one data point per tab, each with its own export.
  document.querySelectorAll('.hyg-tab').forEach(b => b.addEventListener('click', () => {
    const h = b.dataset.h;
    document.querySelectorAll('.hyg-tab').forEach(t => t.classList.toggle('active', t.dataset.h === h));
    document.querySelectorAll('.hyg-panel').forEach(p => { p.style.display = p.dataset.h === h ? '' : 'none'; });
  }));
  document.querySelectorAll('.hyg-dl').forEach(b => b.addEventListener('click', () => {
    const key = b.dataset.dl;
    const build = hygCsv[key];
    if (!build) return;
    const rows = build();
    if (rows.length <= 1) { b.textContent = 'Nothing to export'; setTimeout(() => { b.textContent = 'Download CSV'; }, 1600); return; }
    downloadCsv(rows, `data-hygiene-${key}-${new Date().toISOString().slice(0, 10)}.csv`);
  }));

  // Global filters (apply to all sub-tabs) — Pod / Recruiter / Job are multi-select
  msPod = makeMultiSelect(document.getElementById('msPod'), 'Pod', POD_OPTIONS, renderAll);
  msRec = makeMultiSelect(document.getElementById('msRec'), 'Recruiter', allRecs.map(r => r.name).sort((a, b) => a.localeCompare(b)), renderAll);
  const jobNames = [...new Set((data.jobs || []).map(j => j.title || j.name || j.job).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  msJob = makeMultiSelect(document.getElementById('msJob'), 'Job', jobNames, renderAll);
  document.addEventListener('click', () => document.querySelectorAll('.ms-panel').forEach(p => p.style.display = 'none'));
  document.getElementById('recHideZero')?.addEventListener('change', renderAll);
  document.getElementById('recInclInactive')?.addEventListener('change', renderAll);
  document.getElementById('recExpandAll')?.addEventListener('change', renderAll);

  // Date filter — drives Momentum's 30-day window
  ['recVelFrom', 'recVelTo'].forEach(id =>
    document.getElementById(id)?.addEventListener('change', () => { renderVelocity(); renderActiveChart(); }));
  // Year/Quarter also picks the quarter for pod grouping + capacity, so re-render everything
  ['recVelYear', 'recVelQuarter'].forEach(id =>
    document.getElementById(id)?.addEventListener('change', () => { applyVelYearQuarter(); renderAll(); }));
  // default the velocity date filter to current year + current quarter
  const vy = document.getElementById('recVelYear'), vq = document.getElementById('recVelQuarter');
  if (vy) { const nowY = String(new Date().getFullYear()); vy.value = [...vy.options].some(o => o.value === nowY) ? nowY : (vy.options[1] ? vy.options[1].value : ''); }
  if (vq) vq.value = 'Q' + (Math.floor(new Date().getMonth() / 3) + 1);
  applyVelYearQuarter();

  renderAll();
  showTab('fulfilment');
}
