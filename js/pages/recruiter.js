import { podOf, POD_OPTIONS, isSalesPod, capacityOf, currentQuarter, qKey } from '../recruiter-pods.js';
import { scoreForRole } from '../score-model.js';
import { TIS_STAGES, poolHists, tisCell, periodQuarters, hasQuarterTis, tisHist, APP_REVIEW_LIVE_NOTE } from '../stage-time.js';

const POD_ORDER = [...POD_OPTIONS, 'Unassigned'];

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

// Collapse/expand a 3-level Pod -> Recruiter -> Stage tree (Submission Velocity).
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

let recVelChart = null, recScreenChart = null, recJoinChart = null, recFulfilChart = null, recSourceChart = null;

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
    <p class="sub-note" style="margin-top:-8px;">Grouped by <strong>pod</strong> (set in <strong>Admin → Metric Configuration</strong>, per quarter). Click a pod to expand its recruiters. Year/Quarter drives pod grouping + capacity; From/To drives <strong>Submission Velocity</strong>.</p>
    <div class="rec-filters">
      <div class="fchip"><span class="lbl">POD</span><div class="ms" id="msPod"></div></div>
      <div class="fchip"><span class="lbl">Recruiter</span><div class="ms" id="msRec"></div></div>
      <div class="fchip"><span class="lbl">Job</span><div class="ms" id="msJob"></div></div>
      <div class="fchip"><label class="opt"><input type="checkbox" id="recHideZero" checked> Hide zero-app</label></div>
      <div class="fchip"><label class="opt"><input type="checkbox" id="recInclInactive"> Include inactive</label></div>
      <div class="fchip"><label class="opt"><input type="checkbox" id="recExpandAll"> Expand all branches</label></div>
      <span class="fdiv"></span>
      <div class="fchip"><span class="lbl">From</span><input type="date" id="recVelFrom"></div>
      <div class="fchip"><span class="lbl">To</span><input type="date" id="recVelTo"></div>
      <div class="fchip"><span class="lbl">Year</span><select id="recVelYear"><option value="">All</option>${years.map(y => `<option value="${y}">${y}</option>`).join('')}</select></div>
      <div class="fchip"><span class="lbl">Quarter</span><select id="recVelQuarter"><option value="">All</option><option value="Q1">Q1</option><option value="Q2">Q2</option><option value="Q3">Q3</option><option value="Q4">Q4</option></select></div>
    </div>

    <div class="rec-subtabs">
      <button class="rec-subtab active" data-tab="fulfilment">Fulfilment</button>
      <button class="rec-subtab" data-tab="velocity">Submission Velocity</button>
      <button class="rec-subtab" data-tab="screening">Screening Efficiency</button>
      <button class="rec-subtab" data-tab="joining">Joining Conversion</button>
      <button class="rec-subtab" data-tab="sourcing">Sourcing Mix</button>
      <button class="rec-subtab" data-tab="timeinprocess">Time in Process</button>
      <button class="rec-subtab" data-tab="hygiene">Data Hygiene</button>
    </div>

    <!-- PANEL: Submission Velocity (LIVE — per-stage/day cells from recruiters[].daily) -->
    <div class="rec-panel" data-panel="velocity" style="display:none">
      <p class="sub-note">Pod → Recruiter → Stage (OA / HM Screening / R1) across the last 30 days of the selected range. Cells count candidates who <strong>entered</strong> each stage per day, from real stage history (no bulk-update spikes).</p>
      <div class="chart-wrap" id="recVelChartWrap" style="height:300px"><canvas id="recVelChart"></canvas></div>
      <div class="scroll-table"><table class="vel-table">
        <thead id="recVelHead"></thead>
        <tbody id="recVelBody"></tbody>
      </table></div>
    </div>

    <!-- PANEL: Screening Efficiency -->
    <div class="rec-panel" data-panel="screening" style="display:none">
      <p class="sub-note">Added = reached the stage, Cleared = transitioned <em>out</em> (reached the next stage) — from real stage history, scoped to the selected quarter. Click a pod to see its recruiters, and a recruiter to see the jobs behind their numbers.</p>
      <div class="chart-wrap" style="height:280px"><canvas id="recScreenChart"></canvas></div>
      <div class="scroll-table"><table>
        <thead>
          <tr><th rowspan="2" style="min-width:220px">Pod / Recruiter</th><th colspan="3" class="stage-hdr">HM Screening</th><th colspan="3" class="stage-hdr">Online Assessment</th><th colspan="3" class="stage-hdr">R1</th></tr>
          <tr><th class="stage-sub">Added</th><th class="stage-sub">Cleared</th><th class="stage-sub">%</th><th class="stage-sub">Added</th><th class="stage-sub">Cleared</th><th class="stage-sub">%</th><th class="stage-sub">Added</th><th class="stage-sub">Cleared</th><th class="stage-sub">%</th></tr>
        </thead>
        <tbody id="recScreenBody"></tbody>
      </table></div>
    </div>

    <!-- PANEL: Joining Conversion -->
    <div class="rec-panel" data-panel="joining" style="display:none">
      <p class="sub-note">Offered → Hired, by pod.</p>
      <div class="chart-wrap" style="height:280px"><canvas id="recJoinChart"></canvas></div>
      <div class="scroll-table"><table>
        <thead><tr><th style="min-width:220px">Pod / Recruiter</th><th>Offered</th><th>Hired</th><th>Conversion %</th></tr></thead>
        <tbody id="recJoinBody"></tbody>
      </table></div>
    </div>

    <!-- PANEL: Position Fulfilment -->
    <div class="rec-panel" data-panel="fulfilment">
      <p class="sub-note"><strong>Non-Sales</strong> pods are measured on <strong>Offers</strong>; the <strong>Sales</strong> pod on <strong>Hires</strong>. <strong>Target Score = min(Capacity, Assigned Score)</strong> — Capacity is set in <strong>Metric Configuration</strong> (per quarter).</p>
      <div class="chart-wrap" style="height:280px"><canvas id="recFulfilChart"></canvas></div>

      <p class="sub-note"><strong>HC</strong> = headcount, <strong>Score</strong> = Σ role scores (Family+Level+Complexity → grid, per <strong>Admin → Metric Configuration</strong>). Assigned / Offered / Hired HC &amp; Score are <strong>live</strong>. <strong>Target = min(Capacity, Assigned Score)</strong> and <strong>Gap</strong> populate once you set per-recruiter <strong>Capacities</strong> for the quarter (0 until then). Joining Pending is a recruiter-level count from offers (per-job Score unattributable → <span class="zero">—</span>).</p>

      <h4 style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.04em;margin:14px 0 6px">Fulfilment — Non-Sales (Offers)</h4>
      <div class="scroll-table"><table>
        <thead>
          <tr><th rowspan="2" style="min-width:240px">Pod / Recruiter / Job</th><th colspan="2" class="stage-hdr">Assigned</th><th rowspan="2" class="stage-hdr">Target<br><span style="font-weight:400;text-transform:none">Score</span></th><th colspan="2" class="stage-hdr">Offered</th><th colspan="2" class="stage-hdr">Joining Pending</th><th rowspan="2" class="stage-hdr">Gap<br><span style="font-weight:400;text-transform:none">Score</span></th></tr>
          <tr><th class="stage-sub">HC</th><th class="stage-sub">Score</th><th class="stage-sub">HC</th><th class="stage-sub">Score</th><th class="stage-sub">HC</th><th class="stage-sub">Score</th></tr>
        </thead>
        <tbody id="recFulfilOfferBody"></tbody>
      </table></div>

      <h4 style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.04em;margin:18px 0 6px">Fulfilment — Sales (Hires)</h4>
      <div class="scroll-table"><table>
        <thead>
          <tr><th rowspan="2" style="min-width:240px">Pod / Recruiter / Job</th><th colspan="2" class="stage-hdr">Assigned</th><th rowspan="2" class="stage-hdr">Target<br><span style="font-weight:400;text-transform:none">Score</span></th><th colspan="2" class="stage-hdr">Offered</th><th colspan="2" class="stage-hdr">Joining Pending</th><th colspan="2" class="stage-hdr">Hired</th><th rowspan="2" class="stage-hdr">Gap<br><span style="font-weight:400;text-transform:none">Score</span></th></tr>
          <tr><th class="stage-sub">HC</th><th class="stage-sub">Score</th><th class="stage-sub">HC</th><th class="stage-sub">Score</th><th class="stage-sub">HC</th><th class="stage-sub">Score</th><th class="stage-sub">HC</th><th class="stage-sub">Score</th></tr>
        </thead>
        <tbody id="recFulfilHireBody"></tbody>
      </table></div>
    </div>

    <!-- PANEL: Sourcing Mix -->
    <div class="rec-panel" data-panel="sourcing" style="display:none">
      <p class="sub-note"><strong>Pod → Recruiter → Source type → Source name.</strong> Expand a source type to see the specific <code>source</code> (e.g. <em>Indeed Listing</em>, <em>LinkedIn</em>, <em>Employee Referral</em>). Count = candidates credited; % = share within the parent. Org-wide totals live in <strong>Overall Efficiency</strong>.</p>
      <div class="chart-wrap" style="height:320px"><canvas id="recSourceChart"></canvas></div>
      <div class="scroll-table"><table>
        <thead><tr><th style="min-width:320px">Pod / Recruiter / Source type / Source name</th><th>Count</th><th>%</th></tr></thead>
        <tbody id="recSourceBody"></tbody>
      </table></div>
    </div>

    <!-- PANEL: Time in Process (Pod → Recruiter → Job; median days parked per stage, red > 5) -->
    <div class="rec-panel" data-panel="timeinprocess" style="display:none">
      <p class="sub-note" id="recTisNote" style="display:none"></p>
      <p class="sub-note"><strong>Median days a candidate is parked in each stage</strong>, <strong>Pod → Recruiter → Job</strong>. Cells <span style="color:var(--red);font-weight:600">turn red above 5 days</span>. Hover a cell for mean &amp; sample size. <strong>App Review</strong> counts everyone currently parked (today − applied date, full coverage); <strong>TA Screen → Offer</strong> from real stage history. Job rows are job-level (all recruiters on the job). Median (not mean) so App-Review outliers don't skew a stage.</p>
      <div class="scroll-table"><table class="vel-table">
        <thead id="recTisHead"></thead>
        <tbody id="recTisBody"></tbody>
      </table></div>
    </div>

    <!-- PANEL: Data Hygiene (LIVE — surfaces data.dataQuality from the attribution pass) -->
    <div class="rec-panel" data-panel="hygiene" style="display:none">
      <p class="sub-note"><strong>Compliance view.</strong> These are candidates &amp; applications the pipeline could not attribute cleanly. The team fixes them <strong>in Ashby</strong> (tag a Recruiter on the hiring team, or remove duplicate Recruiter/Sourcer tags); the next refresh clears the fixed rows. 2026-onward only.</p>
      <div class="cards" id="hygCards" style="margin-bottom:18px"></div>

      <div class="hyg-tabs" id="hygTabs">
        <button class="hyg-tab active" data-h="unassigned">Unassigned<span class="n" id="hygNUnassigned"></span></button>
        <button class="hyg-tab" data-h="multirec">Multiple Recruiters<span class="n" id="hygNMultiRec"></span></button>
        <button class="hyg-tab" data-h="multisrc">Multiple Sourcers<span class="n" id="hygNMultiSrc"></span></button>
        <button class="hyg-tab" data-h="roster">Recruiter Roster<span class="n" id="hygNRoster"></span></button>
        <button class="hyg-tab" data-h="offergap">Offers Missing Opening Link<span class="n" id="hygNOfferGap"></span></button>
        <button class="hyg-tab" data-h="hiredgap">Hired Missing Opening Link<span class="n" id="hygNHiredGap"></span></button>
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
  // Inactive = Ashby account disabled (isActive===false) OR manually marked inactive in Admin (the manual
  // override handles "lost the recruiter role", which has no clean Ashby signal). Historical offers still score.
  const manualInactive = (() => { try { return JSON.parse(localStorage.getItem('ik_recruiter_inactive') || '{}'); } catch (e) { return {}; } })();
  const isRecInactive = (r) => !!(r && (r.isActive === false || manualInactive[r.name]));
  const inactiveTag = (r) => isRecInactive(r) ? ' <span style="font-size:10px;color:var(--red);font-weight:600">· inactive</span>' : '';
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
  // Pulls one stage's {reached,cleared} for the selected quarter. throughputByRecruiterQ is
  // keyed stage -> quarter; when it's absent (older rollups) we fall back to the lifetime
  // figure so nothing breaks, but then the number genuinely IS lifetime.
  const ZERO = () => ({ reached: 0, cleared: 0 });
  const stageForQuarter = (byStageQ, byStageLifetime, stage, q) => {
    if (byStageQ) { const s = byStageQ[stage]; return (s && s[q]) ? s[q] : ZERO(); }
    const t = byStageLifetime && byStageLifetime[stage];
    return t || ZERO();
  };
  const screenTriple = (r) => {
    const sr = data.stageRollups || {};
    const q = selQuarter();
    const perQ = sr.throughputByRecruiterQ && sr.throughputByRecruiterQ[r.name];
    const life = sr.throughputByRecruiter && sr.throughputByRecruiter[r.name];
    if (perQ || life) {
      return {
        hm: stageForQuarter(perQ, life, 'hmReview', q),
        oa: stageForQuarter(perQ, life, 'oa', q),
        r1: stageForQuarter(perQ, life, 'r1', q)
      };
    }
    return { hm: { reached: r.hm || 0, cleared: Math.min(r.hm || 0, r.oa || 0) }, oa: { reached: r.oa || 0, cleared: Math.min(r.oa || 0, r.r1 || 0) }, r1: { reached: r.r1 || 0, cleared: null } };
  };
  // Per-job screening for one recruiter — the branch that used to render as em-dashes with
  // "needs per-recruiter×job stage history". Quarter-keyed like the recruiter row above it,
  // so an expanded recruiter's job rows add up to the recruiter's own numbers instead of
  // mixing a quarter total with all-time children.
  const screenTripleByJob = (recName, job8) => {
    const rj = data.stageRollups && data.stageRollups.throughputByRecruiterJob;
    const t = (rj && rj[recName] && rj[recName][job8]) || null;
    if (!t) return null;
    const q = selQuarter();
    const pick = (stage) => {
      const s = t[stage];
      if (!s) return ZERO();
      // quarter-keyed shape {stage:{quarter:{reached,cleared}}}; older rollups were flat
      if (typeof s.reached === 'number') return s;
      return s[q] || ZERO();
    };
    return { hm: pick('hmReview'), oa: pick('oa'), r1: pick('r1') };
  };
  const jobsForRecruiter = (recName) => {
    const rj = data.stageRollups && data.stageRollups.throughputByRecruiterJob;
    return (rj && rj[recName]) ? Object.keys(rj[recName]) : [];
  };
  let lastGroups = [], lastRecs = [], activeTab = 'fulfilment';

  let msPod = null, msRec = null, msJob = null;

  // Quarter selected in the global filter (Year+Quarter) — drives pod grouping + capacity lookups.
  function selQuarter() {
    const y = document.getElementById('recVelYear')?.value;
    const q = document.getElementById('recVelQuarter')?.value;
    return (y && q) ? qKey(y, q) : currentQuarter();
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

  function getFilteredRecs() {
    const q = selQuarter();
    const hideZero = document.getElementById('recHideZero')?.checked;
    const pods = msPod ? msPod.getSelected() : [];
    const names = msRec ? msRec.getSelected() : [];
    // Job multi-select now works off throughputByRecruiterJob: a recruiter stays in the list
    // only if they have stage history on one of the selected jobs. Until that data existed
    // this filter was wired but inert — it looked functional and changed nothing.
    const jobSel = msJob ? msJob.getSelected() : [];
    const jobIdsSelected = jobSel.length
      ? new Set((data.jobs || []).filter(j => jobSel.includes(j.title)).map(j => j.id))
      : null;
    const recWorkedSelectedJob = (name) => {
      if (!jobIdsSelected) return true;
      const rj = data.stageRollups && data.stageRollups.throughputByRecruiterJob;
      const mine = rj && rj[name];
      if (!mine) return false;
      return Object.keys(mine).some(j8 => jobIdsSelected.has(j8));
    };
    // Departed recruiters are hidden by default — their historical numbers are still in the
    // data (and still score), they just clutter the working view. The Data Hygiene roster
    // deliberately ignores this and always lists everyone; that tab exists to show the split.
    const inclInactive = document.getElementById('recInclInactive')?.checked;
    return allRecs.filter(r => {
      if (hideZero && (r.total || 0) === 0) return false;
      if (!inclInactive && isRecInactive(r)) return false;
      if (names.length && !names.includes(r.name)) return false;
      if (pods.length && !pods.includes(podOf(r.name, q))) return false;
      if (!recWorkedSelectedJob(r.name)) return false;
      return true;
    });
  }

  function renderAll() {
    const recs = getFilteredRecs();
    const groups = groupByPod(recs, selQuarter());

    // ===== Submission Velocity (scaffold — own POD/date filters; values pending pipeline) =====
    renderVelocity();

    // ===== Screening Efficiency — Added = reached the stage, Cleared = left it (reached next stage) =====
    const cell3 = (s) => { const a = s.reached, c = s.cleared; return `<td>${a}</td><td>${c == null ? DASH : c}</td><td class="${c == null ? 'zero' : pctClass(pct(c, a))}">${c == null ? DASH : pct(c, a) + '%'}</td>`; };
    const screenCells = (t) => cell3(t.hm) + cell3(t.oa) + cell3(t.r1);
    const hasTp = !!(data.stageRollups && data.stageRollups.throughputByRecruiter);
    const sumTriple = (list) => {
      const acc = { hm: { reached: 0, cleared: 0 }, oa: { reached: 0, cleared: 0 }, r1: { reached: 0, cleared: hasTp ? 0 : null } };
      list.forEach(r => { const t = screenTriple(r); ['hm', 'oa', 'r1'].forEach(k => { acc[k].reached += t[k].reached; if (t[k].cleared != null && acc[k].cleared != null) acc[k].cleared += t[k].cleared; }); });
      return acc;
    };
    const dashScreen = `<td>${DASH}</td>`.repeat(9);
    const screenBody = document.getElementById('recScreenBody');
    if (screenBody) {
      let html = '';
      groups.forEach((G, pi) => {
        html += `<tr class="lvl-pod" data-pod="${pi}" data-exp="0" style="cursor:pointer;background:var(--border-light)">
          <td style="font-weight:600">${CARET}${G.pod}<span style="color:var(--muted);font-weight:400;font-size:11px;margin-left:6px">${G.recs.length}</span></td>${screenCells(sumTriple(G.recs))}</tr>`;
        G.recs.forEach((r, ri) => {
          const rk = `s${pi}-${ri}`;
          html += `<tr class="lvl-rec" data-pod="${pi}" data-rec="${rk}" data-exp="0" style="display:none;cursor:pointer">
            <td style="padding-left:26px;font-weight:500">${CARET}${r.name}${inactiveTag(r)}</td>${screenCells(screenTriple(r))}</tr>`;
          // Per-job breakdown, now backed by throughputByRecruiterJob. Sorted by volume so the
          // jobs a recruiter actually worked come first.
          const jobRows = jobsForRecruiter(r.name)
            .map(j8 => ({ j8, t: screenTripleByJob(r.name, j8) }))
            .filter(x => x.t)
            .sort((a, b) => (b.t.hm.reached + b.t.oa.reached + b.t.r1.reached) - (a.t.hm.reached + a.t.oa.reached + a.t.r1.reached));
          if (jobRows.length) {
            jobRows.forEach(({ j8, t }) => {
              const jm = jobById[j8];
              html += `<tr class="lvl-stage" data-pod="${pi}" data-parent-rec="${rk}" style="display:none">
                <td style="padding-left:52px;color:var(--muted)">${(jm && jm.title) || j8}</td>${screenCells(t)}</tr>`;
            });
          } else {
            html += `<tr class="lvl-stage" data-pod="${pi}" data-parent-rec="${rk}" style="display:none">
              <td style="padding-left:52px;color:var(--muted);font-style:italic">No stage history for this recruiter</td>${dashScreen}</tr>`;
          }
        });
      });
      screenBody.innerHTML = html || `<tr><td colspan="10" style="text-align:center;color:var(--muted);padding:16px">No recruiters match the filter.</td></tr>`;
      wireVelTree(screenBody);
    }

    // ===== Joining Conversion =====
    const joinBody = document.getElementById('recJoinBody');
    if (joinBody) {
      let html = '';
      groups.forEach((G, gi) => {
        const po = G.recs.reduce((s, r) => s + (r.offer || 0), 0);
        const ph = G.recs.reduce((s, r) => s + (r.hired || 0), 0);
        html += `<tr class="pod-header" data-g="j${gi}" data-exp="0" style="cursor:pointer;background:var(--border-light)">
          <td style="font-weight:600">${CARET}${G.pod}<span style="color:var(--muted);font-weight:400;font-size:11px;margin-left:6px">${G.recs.length}</span></td>
          <td style="font-weight:600">${po}</td><td class="${ph > 0 ? 'good' : 'zero'}" style="font-weight:600">${ph}</td><td class="${pctClass(pct(ph, po))}">${pct(ph, po)}%</td></tr>`;
        G.recs.forEach(r => {
          html += `<tr class="leaf" data-g="j${gi}" style="display:none"><td style="padding-left:30px;font-weight:500">${r.name}${inactiveTag(r)}</td>
            <td>${r.offer || 0}</td><td class="${(r.hired || 0) > 0 ? 'good' : 'zero'}">${r.hired || 0}</td><td class="${pctClass(pct(r.hired || 0, r.offer || 0))}">${pct(r.hired || 0, r.offer || 0)}%</td></tr>`;
        });
      });
      joinBody.innerHTML = html || `<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:16px">No recruiters match the filter.</td></tr>`;
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
    function fulfilRows(gs, mode) {
      const q = selQuarter();
      const isSales = mode === 'hire';
      const ncol = isSales ? 11 : 9;
      const c = x => (x == null ? DASH : x);
      // v = {aHC,aSc,tSc,oHC,oSc,jpHC,jpSc,hHC,hSc,gSc}; null → dash
      const cells = (v, bold) => {
        const w = bold ? ' style="font-weight:600"' : '';
        let s = `<td${w}>${c(v.aHC)}</td><td>${c(v.aSc)}</td>`   // Assigned HC/Score
          + `<td>${c(v.tSc)}</td>`                                // Target Score
          + `<td${w}>${c(v.oHC)}</td><td>${c(v.oSc)}</td>`        // Offered HC/Score
          + `<td>${c(v.jpHC)}</td><td>${c(v.jpSc)}</td>`;         // Joining Pending HC/Score
        if (isSales) s += `<td${w}>${c(v.hHC)}</td><td>${c(v.hSc)}</td>`; // Hired HC/Score
        s += `<td>${c(v.gSc)}</td>`;                              // Gap Score
        return s;
      };
      const recFulfil = (r) => {
        let aHC = 0, aSc = 0, oHC = 0, oSc = 0, hHC = 0, hSc = 0;
        (r.byJob || []).forEach(bj => { const sc = scoreForRole(jobMeta(bj), q); aHC += 1; aSc += sc; oHC += (bj.offer || 0); oSc += (bj.offer || 0) * sc; hHC += (bj.hired || 0); hSc += (bj.hired || 0) * sc; });
        const tSc = Math.min(capacityOf(r.name, q) || 0, aSc);
        const gSc = Math.max(0, tSc - (isSales ? hSc : oSc));
        return { aHC, aSc, tSc, oHC, oSc, jpHC: (r.joiningPending || 0), jpSc: null, hHC, hSc, gSc };
      };
      let html = '';
      gs.forEach((G, pi) => {
        const podAgg = { aHC: 0, aSc: 0, tSc: 0, oHC: 0, oSc: 0, hHC: 0, hSc: 0, jpHC: 0, jpSc: null, gSc: 0 };
        const recVals = G.recs.map(r => { const a = recFulfil(r); ['aHC', 'aSc', 'tSc', 'oHC', 'oSc', 'hHC', 'hSc', 'jpHC', 'gSc'].forEach(k => podAgg[k] += a[k]); return a; });
        html += `<tr class="lvl-pod" data-pod="${pi}" data-exp="0" style="cursor:pointer;background:var(--border-light)">
          <td style="font-weight:600">${CARET}${G.pod}<span style="color:var(--muted);font-weight:400;font-size:11px;margin-left:6px">${G.recs.length}</span></td>${cells(podAgg, true)}</tr>`;
        G.recs.forEach((r, ri) => {
          const rk = `${mode}${pi}-${ri}`;
          html += `<tr class="lvl-rec" data-pod="${pi}" data-rec="${rk}" data-exp="0" style="display:none;cursor:pointer">
            <td style="padding-left:26px;font-weight:500">${CARET}${r.name}${inactiveTag(r)}</td>${cells(recVals[ri], false)}</tr>`;
          const jobs = (r.byJob || []).slice().sort((a, b) => (b[isSales ? 'hired' : 'offer'] || 0) - (a[isSales ? 'hired' : 'offer'] || 0) || (b.total || 0) - (a.total || 0));
          if (jobs.length) {
            jobs.forEach(bj => {
              const m = jobMeta(bj), sc = scoreForRole(m, q);
              const jv = { aHC: 1, aSc: sc, tSc: null, oHC: (bj.offer || 0), oSc: (bj.offer || 0) * sc, jpHC: null, jpSc: null, hHC: (bj.hired || 0), hSc: (bj.hired || 0) * sc, gSc: null };
              html += `<tr class="lvl-stage" data-pod="${pi}" data-parent-rec="${rk}" style="display:none">
                <td style="padding-left:52px;color:var(--muted)">${m.title || '(untitled)'}<span style="font-size:10px;margin-left:6px;color:var(--muted)">${m.level || ''}${m.complexity ? ' · ' + m.complexity : ''} · ${sc}pt</span></td>${cells(jv, false)}</tr>`;
            });
          } else {
            html += `<tr class="lvl-stage" data-pod="${pi}" data-parent-rec="${rk}" style="display:none">
              <td style="padding-left:52px;color:var(--muted);font-style:italic">No jobs attributed</td>${`<td>${DASH}</td>`.repeat(ncol - 1)}</tr>`;
          }
        });
      });
      return html || `<tr><td colspan="${ncol}" style="text-align:center;color:var(--muted);padding:16px">No recruiters in this group.</td></tr>`;
    }

    const offerBody = document.getElementById('recFulfilOfferBody');
    const hireBody = document.getElementById('recFulfilHireBody');
    if (offerBody) { offerBody.innerHTML = fulfilRows(nonSalesGroups, 'offer'); wireVelTree(offerBody); }
    if (hireBody) { hireBody.innerHTML = fulfilRows(salesGroups, 'hire'); wireVelTree(hireBody); }

    // ===== Sourcing Mix — Pod → Recruiter → Source type → Source name (LIVE) =====
    // recruiters[].sources = { sourceType: count }; recruiters[].srcNested = { sourceType: { sourceName: count } }
    // (the finer Ashby `source` name). % = share within the parent. Org-wide totals live in Overall Efficiency.
    const srcBody = document.getElementById('recSourceBody');
    if (srcBody) {
      const recSrcTotal = r => Object.values(r.sources || {}).reduce((s, v) => s + v, 0);
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
          const nst = r.srcNested || {};
          let types = Object.entries(nst).map(([t, names]) => [t, Object.values(names).reduce((a, v) => a + v, 0), names]).sort((a, b) => b[1] - a[1]);
          if (!types.length) types = Object.entries(r.sources || {}).sort((a, b) => b[1] - a[1]).map(([t, cnt]) => [t, cnt, null]);
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
              <td style="padding-left:52px;color:var(--muted);font-style:italic">No sourced applications</td><td>${DASH}</td><td>${DASH}</td></tr>`;
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
  function tisPeriod() {
    const ySel = document.getElementById('recVelYear');
    const yrs = ySel ? [...ySel.options].map(o => o.value).filter(Boolean) : [];
    return periodQuarters(ySel?.value || '', document.getElementById('recVelQuarter')?.value || '', yrs);
  }

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
        const active = !isRecInactive(r);
        return `<tr><td style="font-weight:500">${esc(r.name)}</td>
          <td><span style="font-size:11px;font-weight:600;color:${active ? 'var(--green)' : 'var(--red)'}">${active ? 'Active' : 'Inactive'}</span></td>
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

    // --- Other anomalies ---
    const anomList = [];
    (dq.excludedAsRecruiter || []).forEach(n => anomList.push({
      what: 'Excluded interviewer credited as a Recruiter',
      detail: n,
      fix: 'Correct the recruiter attribution in Ashby — this person is a dedicated interviewer, not a recruiter.'
    }));
    const anBody = document.getElementById('hygAnomBody');
    if (anBody) {
      anBody.innerHTML = anomList.map(a => `<tr><td style="font-weight:500">${esc(a.what)}</td><td>${esc(a.detail)}</td><td style="color:var(--muted)">${esc(a.fix)}</td></tr>`).join('')
        || `<tr><td colspan="3" style="text-align:center;color:var(--green);padding:16px">No anomalies. ✓</td></tr>`;
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
    setN('hygNAnom', anomList.length, true);

    // --- CSV export per tab (client-side; no backend) ---
    hygCsv = {
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

  // ===== Submission Velocity render (Pod -> Recruiter -> Stage; last 30 days of range, descending) =====
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
  // recruiters[].daily is keyed by pipeline stage-key ({stageKey:{'YYYY-MM-DD':count}}), bucketed by
  // last-activity day. Map the 3 displayed stages to those keys.
  const VEL_STAGES = [['oa', 'Online Assessment'], ['hmReview', 'HM Screening'], ['r1', 'R1']];
  function dkey(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function renderVelocity() {
    const head = document.getElementById('recVelHead');
    const body = document.getElementById('recVelBody');
    if (!body) return;
    const recs = getFilteredRecs();
    const groups = groupByPod(recs, selQuarter());
    const dates = velDates();
    const dkeys = dates.map(dkey);

    if (head) {
      let h = `<tr><th style="min-width:240px">Pod / Recruiter / Stage</th><th>Total · ${dates.length}d</th>`;
      dates.forEach(d => { h += `<th>${MON[d.getMonth()]} ${d.getDate()}</th>`; });
      h += '</tr>';
      head.innerHTML = h;
    }
    const ncol = dates.length + 2;
    // Prefer the stage-history rollups (bucketed by true enteredStageAt → no bulk-update spike); fall back to
    // the snapshot `daily` only if the rollups file isn't present yet.
    const roll = data.stageRollups && data.stageRollups.velocityByRecruiter;
    const stageDay = (r, sk) => roll ? ((roll[r.name] && roll[r.name][sk]) || {}) : ((r.daily && r.daily[sk]) || {});
    // number row: total cell + one cell per date. zero → faint dot to keep 30 cols readable.
    const numRow = (total, perDay, boldTotal) =>
      `<td${boldTotal ? ' style="font-weight:600"' : ''}>${total > 0 ? total : '<span class="zero">0</span>'}</td>`
      + perDay.map(v => `<td>${v > 0 ? v : '<span class="zero">·</span>'}</td>`).join('');
    // sum a recruiter's displayed stages into a per-day array (+ total)
    const recDaily = (r) => {
      const arr = new Array(dkeys.length).fill(0); let total = 0;
      VEL_STAGES.forEach(([sk]) => { const m = stageDay(r, sk); dkeys.forEach((dk, i) => { const v = m[dk] || 0; arr[i] += v; total += v; }); });
      return { arr, total };
    };

    let html = '';
    groups.forEach((G, pi) => {
      const podArr = new Array(dkeys.length).fill(0); let podTotal = 0;
      const recCache = G.recs.map(r => { const d = recDaily(r); d.arr.forEach((v, i) => podArr[i] += v); podTotal += d.total; return d; });
      html += `<tr class="lvl-pod" data-pod="${pi}" data-exp="0" style="cursor:pointer;background:var(--border-light)">
        <td style="font-weight:600">${CARET}${G.pod}<span style="color:var(--muted);font-weight:400;font-size:11px;margin-left:6px">${G.recs.length}</span></td>${numRow(podTotal, podArr, true)}</tr>`;
      G.recs.forEach((r, ri) => {
        const rk = `${pi}-${ri}`;
        html += `<tr class="lvl-rec" data-pod="${pi}" data-rec="${rk}" data-exp="0" style="display:none;cursor:pointer">
          <td style="padding-left:26px;font-weight:500">${CARET}${r.name}${inactiveTag(r)}</td>${numRow(recCache[ri].total, recCache[ri].arr, false)}</tr>`;
        VEL_STAGES.forEach(([sk, label]) => {
          const m = stageDay(r, sk); let t = 0; const per = dkeys.map(dk => { const v = m[dk] || 0; t += v; return v; });
          html += `<tr class="lvl-stage" data-pod="${pi}" data-parent-rec="${rk}" style="display:none">
            <td style="padding-left:52px;color:var(--muted)">${label}</td>${numRow(t, per, false)}</tr>`;
        });
      });
    });
    body.innerHTML = html || `<tr><td colspan="${ncol}" style="text-align:center;color:var(--muted);padding:16px">No recruiters match the filter.</td></tr>`;
    wireVelTree(body);
  }

  // ===== charts (standard palette + square legends) =====
  const C = { blue: '#4E6BA6', green: '#398AA2', cyan: '#1E7590', amber: '#D8B5BE', slate: '#938FB8' };
  const legendSquare = () => ({ position: 'top', align: 'center', labels: { usePointStyle: true, pointStyle: 'rect', boxWidth: 11, boxHeight: 11, padding: 16, font: { size: 12 } } });
  const gridY = { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 11 } } };
  const gridX = { grid: { display: false }, ticks: { font: { size: 11 } } };
  const podLabels = () => lastGroups.map(G => G.pod);
  const sumBy = (G, key) => G.recs.reduce((s, r) => s + (r[key] || 0), 0);

  function buildVelChart() {
    const ctx = document.getElementById('recVelChart'); if (!ctx) return;
    if (recVelChart) recVelChart.destroy();
    const recs = [...getFilteredRecs()].sort((a, b) => (b.total || 0) - (a.total || 0));
    const h = Math.max(220, recs.length * 30 + 70);
    const wrap = document.getElementById('recVelChartWrap');
    if (wrap) wrap.style.height = h + 'px';
    ctx.style.maxHeight = h + 'px';   // override .chart-wrap canvas { max-height:300px }
    recVelChart = new Chart(ctx, { type: 'bar',
      data: { labels: recs.map(r => r.name), datasets: [{ label: 'Submissions', data: recs.map(r => r.total || 0), backgroundColor: C.blue, borderRadius: 4, barPercentage: 0.7 }] },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: legendSquare() },
        scales: { x: { ...gridY, title: { display: true, text: 'Count of Submissions', font: { size: 11 }, color: '#64748b' } }, y: { grid: { display: false }, ticks: { font: { size: 11, weight: '500' } } } } } });
  }
  function buildScreenChart() {
    const ctx = document.getElementById('recScreenChart'); if (!ctx) return;
    if (recScreenChart) recScreenChart.destroy();
    // Y = recruiter, X = candidate count. One bar per stage (HM / OA / R1): full length = Added (reached),
    // dark segment = Cleared (left the stage), light remainder = still there. Real reached/cleared from the
    // stage-history rollups (falls back to the current-stage approximation with unknown R1-cleared).
    const T = r => screenTriple(r);
    const sumR = r => T(r).hm.reached + T(r).oa.reached + T(r).r1.reached;
    const recs = [...lastRecs].sort((a, b) => sumR(b) - sumR(a));
    const A = { hm: recs.map(r => T(r).hm.reached), oa: recs.map(r => T(r).oa.reached), r1: recs.map(r => T(r).r1.reached) };
    const clHM = recs.map(r => T(r).hm.cleared || 0);
    const remHM = recs.map((r, i) => Math.max(0, A.hm[i] - clHM[i]));
    const clOA = recs.map(r => T(r).oa.cleared || 0);
    const remOA = recs.map((r, i) => Math.max(0, A.oa[i] - clOA[i]));
    const h = Math.max(240, recs.length * 48 + 80);
    if (ctx.parentElement) ctx.parentElement.style.height = h + 'px';
    ctx.style.maxHeight = h + 'px';
    const seg = (label, data, color, stack) => ({ label, data, backgroundColor: color, stack, borderRadius: 2, barPercentage: 0.9, categoryPercentage: 0.78 });
    // labels: full-bar total (added) at the end of each stack; Cleared value centered on the dark segment
    const labelPlugin = {
      id: 'screenLabels',
      afterDatasetsDraw(chart) {
        const { ctx: c } = chart;
        c.save();
        c.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
        c.textBaseline = 'middle';
        const stages = [
          { added: A.hm, cleared: clHM, clIdx: 0, endIdx: 1 },
          { added: A.oa, cleared: clOA, clIdx: 2, endIdx: 3 },
          { added: A.r1, cleared: null, clIdx: 4, endIdx: 4 },
        ];
        stages.forEach(st => {
          const clMeta = chart.getDatasetMeta(st.clIdx);
          const endMeta = chart.getDatasetMeta(st.endIdx);
          clMeta.data.forEach((bar, i) => {
            if (st.cleared && st.cleared[i] > 0 && (bar.x - bar.base) > 16) {
              c.fillStyle = '#fff'; c.textAlign = 'center';
              c.fillText(String(st.cleared[i]), (bar.base + bar.x) / 2, bar.y);
            }
            if (st.added[i] > 0) {
              c.fillStyle = '#334155'; c.textAlign = 'left';
              c.fillText(String(st.added[i]), endMeta.data[i].x + 4, endMeta.data[i].y);
            }
          });
        });
        c.restore();
      }
    };
    recScreenChart = new Chart(ctx, { type: 'bar',
      data: { labels: recs.map(r => r.name), datasets: [
        seg('HM Screening', clHM, C.blue, 'HM'), seg('_hmRem', remHM, '#C5CFE5', 'HM'),
        seg('Online Assessment', clOA, C.cyan, 'OA'), seg('_oaRem', remOA, '#A9CAD6', 'OA'),
        seg('R1 (reached)', A.r1, C.green, 'R1')] },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, layout: { padding: { right: 28 } },
        plugins: { legend: { position: 'top', align: 'center', labels: { usePointStyle: true, pointStyle: 'rect', boxWidth: 11, boxHeight: 11, padding: 14, font: { size: 12 }, filter: (item, data) => !(data.datasets[item.datasetIndex].label || '').startsWith('_') } } },
        scales: { x: { ...gridY, stacked: true, title: { display: true, text: 'Count of Candidates', font: { size: 11 }, color: '#64748b' } }, y: { stacked: true, grid: { display: false }, ticks: { font: { size: 11, weight: '500' } } } } },
      plugins: [labelPlugin] });
  }
  function buildJoinChart() {
    const ctx = document.getElementById('recJoinChart'); if (!ctx) return;
    if (recJoinChart) recJoinChart.destroy();
    // Y = recruiter. Full bar = Offered; dark segment = Hired. Labels: Offered at bar end,
    // Hired (with conversion %) on the dark segment.
    const recs = [...lastRecs].sort((a, b) => (b.offer || 0) - (a.offer || 0));
    const hired = recs.map(r => r.hired || 0);
    const offered = recs.map(r => r.offer || 0);
    const rem = recs.map((r, i) => Math.max(0, offered[i] - hired[i]));
    const h = Math.max(240, recs.length * 34 + 80);
    if (ctx.parentElement) ctx.parentElement.style.height = h + 'px';
    ctx.style.maxHeight = h + 'px';
    const labelPlugin = {
      id: 'joinLabels',
      afterDatasetsDraw(chart) {
        const c = chart.ctx; c.save();
        c.font = '10px -apple-system, BlinkMacSystemFont, sans-serif'; c.textBaseline = 'middle';
        const hMeta = chart.getDatasetMeta(0), rMeta = chart.getDatasetMeta(1);
        hMeta.data.forEach((bar, i) => {
          if (hired[i] > 0 && (bar.x - bar.base) > 26) {
            const p = offered[i] ? Math.round((hired[i] / offered[i]) * 100) : 0;
            c.fillStyle = '#fff'; c.textAlign = 'center';
            c.fillText(`${hired[i]} (${p}%)`, (bar.base + bar.x) / 2, bar.y);
          }
          if (offered[i] > 0) {
            c.fillStyle = '#334155'; c.textAlign = 'left';
            c.fillText(String(offered[i]), rMeta.data[i].x + 4, rMeta.data[i].y);
          }
        });
        c.restore();
      }
    };
    recJoinChart = new Chart(ctx, { type: 'bar',
      data: { labels: recs.map(r => r.name), datasets: [
        { label: 'Hired', data: hired, backgroundColor: C.green, stack: 'j', borderRadius: 2, barPercentage: 0.72 },
        { label: '_rem', data: rem, backgroundColor: '#B4D3DC', stack: 'j', borderRadius: 2, barPercentage: 0.72 }] },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, layout: { padding: { right: 34 } },
        plugins: { legend: { position: 'top', align: 'center', labels: { usePointStyle: true, pointStyle: 'rect', boxWidth: 11, boxHeight: 11, padding: 14, font: { size: 12 }, generateLabels: () => [{ text: 'Hired', fillStyle: C.green, strokeStyle: C.green, pointStyle: 'rect' }, { text: 'Offered (full bar)', fillStyle: '#B4D3DC', strokeStyle: '#B4D3DC', pointStyle: 'rect' }] } } },
        scales: { x: { ...gridY, stacked: true, title: { display: true, text: 'Candidates', font: { size: 11 }, color: '#64748b' } }, y: { stacked: true, grid: { display: false }, ticks: { font: { size: 11, weight: '500' } } } } },
      plugins: [labelPlugin] });
  }
  function buildFulfilChart() {
    const ctx = document.getElementById('recFulfilChart'); if (!ctx) return;
    if (recFulfilChart) recFulfilChart.destroy();
    // Y = recruiter, X = Score. Target = Capacity (interim, until Assigned Score lands → then min(Cap,Assigned)).
    // Bar = Target; the Gap (shortfall to target) is the dark segment, Achieved the light. Labels on all.
    const q = selQuarter();
    const recs = lastRecs.map(r => {
      const sales = isSalesPod(podOf(r.name, q));
      let oSc = 0, hSc = 0;
      (r.byJob || []).forEach(bj => { const sc = scoreForRole(jobMeta(bj), q); oSc += (bj.offer || 0) * sc; hSc += (bj.hired || 0) * sc; });
      const achieved = sales ? hSc : oSc;
      const target = capacityOf(r.name, q);
      return { name: r.name, target, achieved, gap: Math.max(0, target - achieved) };
    }).filter(r => r.target > 0).sort((a, b) => b.target - a.target);
    const wrap = ctx.parentElement;
    let emptyMsg = wrap && wrap.querySelector('.chart-empty');
    if (recs.length === 0) {
      if (recFulfilChart) { recFulfilChart.destroy(); recFulfilChart = null; }
      ctx.style.display = 'none';
      if (wrap && !emptyMsg) { emptyMsg = document.createElement('div'); emptyMsg.className = 'chart-empty'; emptyMsg.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100%;min-height:120px;color:var(--muted);font-size:13px;text-align:center;padding:20px'; wrap.appendChild(emptyMsg); }
      if (emptyMsg) { emptyMsg.textContent = `No capacities set for ${q.replace('-', ' ')} — set them in Metric Configuration to populate this chart.`; emptyMsg.style.display = 'flex'; }
      return;
    }
    ctx.style.display = '';
    if (emptyMsg) emptyMsg.style.display = 'none';
    const h = Math.max(220, recs.length * 30 + 80);
    if (ctx.parentElement) ctx.parentElement.style.height = h + 'px';
    ctx.style.maxHeight = h + 'px';
    const labelPlugin = {
      id: 'fulfilLabels',
      afterDatasetsDraw(chart) {
        const c = chart.ctx; c.save();
        c.font = '10px -apple-system, BlinkMacSystemFont, sans-serif'; c.textBaseline = 'middle';
        const aMeta = chart.getDatasetMeta(0), gMeta = chart.getDatasetMeta(1);
        recs.forEach((r, i) => {
          if (r.achieved > 0 && (aMeta.data[i].x - aMeta.data[i].base) > 18) { c.fillStyle = '#334155'; c.textAlign = 'center'; c.fillText(String(r.achieved), (aMeta.data[i].base + aMeta.data[i].x) / 2, aMeta.data[i].y); }
          if (r.gap > 0 && (gMeta.data[i].x - gMeta.data[i].base) > 18) { c.fillStyle = '#fff'; c.textAlign = 'center'; c.fillText(String(r.gap), (gMeta.data[i].base + gMeta.data[i].x) / 2, gMeta.data[i].y); }
          if (r.target > 0) { c.fillStyle = '#334155'; c.textAlign = 'left'; c.fillText('Target ' + r.target, gMeta.data[i].x + 4, gMeta.data[i].y); }
        });
        c.restore();
      }
    };
    recFulfilChart = new Chart(ctx, { type: 'bar',
      data: { labels: recs.map(r => r.name), datasets: [
        { label: 'Achieved (Score)', data: recs.map(r => r.achieved), backgroundColor: '#B4D3DC', stack: 'f', borderRadius: 2, barPercentage: 0.72 },
        { label: 'Gap to Target (Score)', data: recs.map(r => r.gap), backgroundColor: C.green, stack: 'f', borderRadius: 2, barPercentage: 0.72 }] },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, layout: { padding: { right: 60 } },
        plugins: { legend: { position: 'top', align: 'center', labels: { usePointStyle: true, pointStyle: 'rect', boxWidth: 11, boxHeight: 11, padding: 14, font: { size: 12 } } } },
        scales: { x: { ...gridY, stacked: true, title: { display: true, text: 'Score', font: { size: 11 }, color: '#64748b' } }, y: { stacked: true, grid: { display: false }, ticks: { font: { size: 11, weight: '500' } } } } },
      plugins: [labelPlugin] });
  }
  function buildSourceChart() {
    const ctx = document.getElementById('recSourceChart'); if (!ctx) return;
    if (recSourceChart) { recSourceChart.destroy(); recSourceChart = null; }
    const wrap = ctx.parentElement;
    let emptyMsg = wrap && wrap.querySelector('.chart-empty');
    // Recruiter-centric stacked bar: Y = recruiter (top 20 by sourced volume), stacked by source_type.
    const srcTotal = r => Object.values(r.sources || {}).reduce((s, v) => s + v, 0);
    const withSrc = [...lastRecs].filter(r => srcTotal(r) > 0).sort((a, b) => srcTotal(b) - srcTotal(a)).slice(0, 20);
    if (withSrc.length === 0) {
      ctx.style.display = 'none';
      if (wrap && !emptyMsg) { emptyMsg = document.createElement('div'); emptyMsg.className = 'chart-empty'; emptyMsg.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100%;min-height:120px;color:var(--muted);font-size:13px;text-align:center;padding:20px'; wrap.appendChild(emptyMsg); }
      if (emptyMsg) { emptyMsg.textContent = 'No sourced applications for the current filter.'; emptyMsg.style.display = 'flex'; }
      return;
    }
    ctx.style.display = ''; if (emptyMsg) emptyMsg.style.display = 'none';
    // aggregate source_types by volume; keep top 6 + roll the rest into "Other"
    const agg = {}; withSrc.forEach(r => Object.entries(r.sources).forEach(([s, v]) => agg[s] = (agg[s] || 0) + v));
    const ordered = Object.entries(agg).sort((a, b) => b[1] - a[1]).map(e => e[0]);
    const topTypes = ordered.slice(0, 6); const rest = ordered.slice(6);
    const cats = rest.length ? [...topTypes, 'Other'] : topTypes;
    const palette = [C.blue, C.green, C.cyan, C.slate, C.amber, '#C5CFE5', '#94a3b8'];
    const datasets = cats.map((cat, ci) => ({
      label: cat, backgroundColor: palette[ci % palette.length], stack: 's', borderRadius: 2, barPercentage: 0.8,
      data: withSrc.map(r => cat === 'Other' ? rest.reduce((s, t) => s + (r.sources[t] || 0), 0) : (r.sources[cat] || 0))
    }));
    const h = Math.max(240, withSrc.length * 30 + 90);
    if (wrap) wrap.style.height = h + 'px'; ctx.style.maxHeight = h + 'px';
    recSourceChart = new Chart(ctx, { type: 'bar',
      data: { labels: withSrc.map(r => r.name), datasets },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top', align: 'center', labels: { usePointStyle: true, pointStyle: 'rect', boxWidth: 11, boxHeight: 11, padding: 12, font: { size: 11 } } } },
        scales: { x: { ...gridY, stacked: true, title: { display: true, text: 'Candidates', font: { size: 11 }, color: '#64748b' } }, y: { stacked: true, grid: { display: false }, ticks: { font: { size: 11, weight: '500' } } } } } });
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
  msPod = makeMultiSelect(document.getElementById('msPod'), 'Pod', POD_ORDER, renderAll);
  msRec = makeMultiSelect(document.getElementById('msRec'), 'Recruiter', allRecs.map(r => r.name).sort((a, b) => a.localeCompare(b)), renderAll);
  const jobNames = [...new Set((data.jobs || []).map(j => j.title || j.name || j.job).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  msJob = makeMultiSelect(document.getElementById('msJob'), 'Job', jobNames, renderAll);
  document.addEventListener('click', () => document.querySelectorAll('.ms-panel').forEach(p => p.style.display = 'none'));
  document.getElementById('recHideZero')?.addEventListener('change', renderAll);
  document.getElementById('recInclInactive')?.addEventListener('change', renderAll);
  document.getElementById('recExpandAll')?.addEventListener('change', renderAll);

  // Date filter — drives Submission Velocity's 30-day window
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
