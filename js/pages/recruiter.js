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

// A Momentum stage with no events ANYWHERE in the dataset is not "a quiet week" — it means the stage is
// not used in this Ashby workspace at all, and a permanently blank row reads as "nobody did any". OA is
// exactly that today: 0 in the pipeline snapshot, 0 lifetime in stage history, 0 on every recruiter.
// Checked against the whole store rather than the visible 30-day window so a genuinely quiet week is
// never mislabelled as untracked.
function untrackedStages(store, stages) {
  if (!store) return [];
  return stages.filter(([sk]) => {
    for (const key in store) {
      const days = store[key] && store[key][sk];
      if (days) { for (const d in days) { if (days[d] > 0) return false; } }
    }
    return true;
  }).map(([, label]) => label);
}

// Collapse/expand a 3-level Pod -> Recruiter -> Stage tree (Momentum).
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
    <p class="sub-note" style="margin-top:-8px;">Grouped by <strong>pod</strong> (set in <strong>Admin → Metric Configuration</strong>, per quarter). Click a pod to expand its recruiters. Year/Quarter drives pod grouping + capacity; From/To drives <strong>Momentum</strong>.</p>
    <div class="rec-filters">
      <div class="fchip"><span class="lbl">POD</span><div class="ms" id="msPod"></div></div>
      <div class="fchip"><span class="lbl">Recruiter</span><div class="ms" id="msRec"></div></div>
      <div class="fchip"><span class="lbl">Job</span><div class="ms" id="msJob"></div></div>
      <div class="fchip"><label class="opt"><input type="checkbox" id="recHideZero" checked> Hide zero-app</label></div>
      <div class="fchip"><label class="opt" title="Inactive = no longer holds an elevated recruiter seat in Ashby. Their past offers and hires still count, so this stays ON by default - untick it to see only current recruiters."><input type="checkbox" id="recInclInactive" checked> Include past recruiters</label></div>
      <div class="fchip"><label class="opt"><input type="checkbox" id="recExpandAll" checked> Expand all branches</label></div>
      <span class="fdiv"></span>
      <div class="fchip"><span class="lbl">From</span><input type="date" id="recVelFrom"></div>
      <div class="fchip"><span class="lbl">To</span><input type="date" id="recVelTo"></div>
      <div class="fchip"><span class="lbl">Year</span><select id="recVelYear"><option value="">All</option>${years.map(y => `<option value="${y}">${y}</option>`).join('')}</select></div>
      <div class="fchip"><span class="lbl">Quarter</span><select id="recVelQuarter"><option value="">All</option><option value="Q1">Q1</option><option value="Q2">Q2</option><option value="Q3">Q3</option><option value="Q4">Q4</option></select></div>
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

    <!-- PANEL: Momentum (ex-"Submission Velocity", renamed 2026-08-21) — per-stage/day stage-entry counts -->
    <div class="rec-panel" data-panel="velocity" style="display:none">
      <p class="sub-note" id="recVelUntracked" style="display:none;color:var(--orange)"></p>
      <p class="sub-note">Momentum is the <strong>pace of work</strong> — how many candidates were pushed into each of the three stages that recruiters actually drive, day by day. Counted by true <strong>stage-entry date</strong> from stage history, so a bulk update does not show up as a spike. <strong>Pod → Recruiter → Stage</strong> (HM Screening / OA / R1) across the last 30 days of the selected range.</p>
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

      <p class="sub-note"><strong>HC</strong> = headcount, <strong>Score</strong> = Σ role scores (Family+Level+Complexity → grid, per <strong>Admin → Metric Configuration</strong>).
      <strong>Capacity</strong> is the figure set for the selected quarter. <strong>Joined</strong> (Sales) counts candidates whose <strong>start date</strong> falls in the quarter; <strong>Offered</strong> (Non-Sales) counts offers <strong>decided</strong> in the quarter — both from per-candidate offer records, so they follow the quarter selector.
      <strong>Goal</strong> counts the seats <strong>opened in the selected quarter</strong> on that recruiter's jobs (from the openings model), so it follows the quarter like everything else — a job they work that had no opening this quarter contributes nothing. <strong>Gap</strong> = Goal − outcome, and <strong>Capacity Utilisation</strong> = outcome ÷ Capacity; all three sides are now quarter-scoped. Where several recruiters work the same job, its seats are <strong>split equally</strong> between them, so shared evergreen roles do not multiply across the pod — which is why some Goal figures show a decimal.
      Joining Pending is a recruiter-level count from offers (per-job Score unattributable → <span class="zero">—</span>).</p>

      <h4 style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.04em;margin:14px 0 6px">Fulfilment — Non-Sales (Offers)</h4>
      <div class="scroll-table"><table class="metrics">
        <thead>
          <tr><th rowspan="2" style="min-width:240px">Pod / Recruiter / Job</th><th colspan="2" class="stage-hdr">Goal — Offers</th><th rowspan="2" class="stage-hdr">Capacity — Offers<br><span style="font-weight:400;text-transform:none">Score</span></th><th colspan="2" class="stage-hdr">Offered</th><th colspan="2" class="stage-hdr">Joined — Total</th><th colspan="2" class="stage-hdr">Joining Pending</th><th colspan="2" class="stage-hdr">Gap</th><th rowspan="2" class="stage-hdr">Capacity<br>Utilisation</th></tr>
          <tr><th class="stage-sub">HC</th><th class="stage-sub">Score</th><th class="stage-sub">HC</th><th class="stage-sub">Score</th><th class="stage-sub">HC</th><th class="stage-sub">Score</th><th class="stage-sub">HC</th><th class="stage-sub">Score</th><th class="stage-sub">HC</th><th class="stage-sub">Score</th></tr>
        </thead>
        <tbody id="recFulfilOfferBody"></tbody>
      </table></div>

      <h4 style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.04em;margin:18px 0 6px">Fulfilment — Sales (Hires)</h4>
      <div class="scroll-table"><table class="metrics">
        <thead>
          <tr><th rowspan="2" style="min-width:240px">Pod / Recruiter / Job</th><th colspan="2" class="stage-hdr">Goal — Joiners</th><th rowspan="2" class="stage-hdr">Capacity — Joiners<br><span style="font-weight:400;text-transform:none">Score</span></th><th colspan="2" class="stage-hdr">Joined</th><th colspan="2" class="stage-hdr">Joining Pending</th><th colspan="2" class="stage-hdr">Gap</th><th rowspan="2" class="stage-hdr">Capacity<br>Utilisation</th></tr>
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
        <button class="hyg-tab" data-h="unscored">Roles Missing Score Inputs<span class="n" id="hygNUnscored"></span></button>
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
      // Default is ON: 15 of 27 recruiters lost their Ashby seat, and hiding them would wipe most of the
      // Q1/Q2 history from every sub-tab. Their past offers and hires are still real work that happened.
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

    // ===== Momentum (own POD/date filters) =====
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
    // ===== Fulfilment v2 (2026-08-22) =====
    // Goal replaces Assigned; Capacity is the RAW configured capacity (the old Target capped it at the
    // assigned work, which would make utilisation read 100% for everyone). Gap is measured against Goal,
    // and Capacity Utilisation is OUTPUT over capacity - what was delivered against what could have been.
    // ⚠ The colour sense is the opposite of a load metric: past 100% is over-delivery (good); under 70% is
    // under-use, which is the thing worth acting on.
    function fulfilRows(gs, mode) {
      const q = selQuarter();
      const isSales = mode === 'hire';
      const ncol = isSales ? 11 : 13;

      // 🚨 THE OUTCOME IS DATED FROM offerEvents, NOT FROM byJob (fixed 2026-08-22).
      // recruiters[].byJob carries {jobId,title,department,total,offer,hired} and NO date of any kind, so
      // reading Joined/Offered from it showed every 2026 hire under whichever quarter was selected — the Sales
      // pod read 162 joiners for Q3 when the true figure is 11. offerEvents has a real date per candidate:
      //   Sales     → accepted offers whose START DATE falls in the quarter (they actually joined)
      //   Non-Sales → offers whose DECIDED date falls in the quarter (the offer was made)
      // Score comes from the event's own department/title/level/complexity, same grid as everywhere else.
      const qOf = (ds) => (ds && ds.length >= 7) ? `${ds.slice(0, 4)}-Q${Math.floor((+ds.slice(5, 7) - 1) / 3) + 1}` : null;
      const outByRec = {}, outByRecJob = {};
      (data.offerEvents || []).forEach(e => {
        const rec = e.recruiter; if (!rec) return;
        if (isSales && !e.accepted) return;
        if (qOf(isSales ? e.startDate : e.decidedAt) !== q) return;
        const sc = scoreForRole({ department: e.department, title: e.jobTitle, level: e.level, complexity: e.complexity }, q);
        const a = outByRec[rec] || (outByRec[rec] = { hc: 0, sc: 0 });
        a.hc += 1; a.sc += sc;
        const jk = rec + '|' + (e.jobId8 || '');
        const b = outByRecJob[jk] || (outByRecJob[jk] = { hc: 0, sc: 0 });
        b.hc += 1; b.sc += sc;
      });
      const outOf = (rec) => outByRec[rec] || { hc: 0, sc: 0 };
      const outOfJob = (rec, jid) => outByRecJob[rec + '|' + (jid || '').slice(0, 8)] || { hc: 0, sc: 0 };

      // Non-Sales also shows Joined · total — actual joiners, dated by START date, the same basis Sales uses.
      // Its two sub-columns (this-quarter vs later-quarter opening) split THIS number once offers carry an
      // opening; until then the total stands on its own rather than the column sitting empty.
      const joinByRec = {}, joinByRecJob = {};
      if (!isSales) (data.offerEvents || []).forEach(e => {
        const rec = e.recruiter; if (!rec || !e.accepted) return;
        if (qOf(e.startDate) !== q) return;
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
        return `<td class="score gapcell"><span class="gapwrap"><i class="${cls}" style="width:${fill}%"></i>`
          + `<span class="${v.gSc === 0 ? 'zero' : ''}">${Math.round(v.gSc)}</span></span>`
          + `<span class="sublab">${cap}</span></td>`;
      };
      // Utilisation: never divide by zero - no capacity set renders as a dash, not Infinity.
      const utilCell = (v) => {
        const u = pctOf(v.xSc, v.capSc);
        if (u == null) return `<td title="No capacity set for this quarter, so utilisation cannot be worked out.">${DASH}</td>`;
        const cls = u >= 100 ? 'over' : (u >= 70 ? 'well' : 'under');
        return `<td><span class="util ${cls}">${u}%</span><span class="sublab">${v.xSc} of ${v.capSc}</span></td>`;
      };

      const cells = (v, bold) => {
        const w = bold ? ' style="font-weight:600"' : '';
        return `<td${w}>${c(seatFmt(v.aHC))}</td><td class="score">${c(Math.round(v.aSc))}</td>`      // Goal HC / Score
          + `<td class="score">${c(v.capSc)}</td>`                               // Capacity Score
          + `<td${w}>${c(v.xHC)}</td><td class="score">${c(v.xSc)}</td>`         // Joined (Sales) / Offered (Non-Sales)
          + (isSales ? '' : `<td${w}>${c(v.jHC)}</td><td class="score">${c(v.jSc)}</td>`)  // Non-Sales: Joined total
          + `<td>${c(v.jpHC)}</td><td class="score">${c(v.jpSc)}</td>`           // Joining Pending
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
        const o = outOf(r.name), jn = joinOf(r.name);
        const capSc = capacityOf(r.name, q) || 0;
        return { aHC, aSc, capSc, xHC: o.hc, xSc: o.sc, jHC: jn.hc, jSc: jn.sc,
                 jpHC: (r.joiningPending || 0), jpSc: null,
                 gHC: Math.max(0, aHC - o.hc), gSc: Math.max(0, aSc - o.sc) };
      };
      // A recruiter with no capacity AND nothing attributed is noise; one with no capacity but real
      // offers/hires is a hygiene problem, not a row to hide - it surfaces in Data Hygiene instead.
      const worthShowing = (v) => v.capSc > 0 || v.xHC > 0 || v.jpHC > 0 || v.aHC > 0;

      let html = '';
      gs.forEach((G, pi) => {
        const podAgg = { aHC: 0, aSc: 0, capSc: 0, xHC: 0, xSc: 0, jHC: 0, jSc: 0, jpHC: 0, jpSc: null, gHC: 0, gSc: 0 };
        const shown = [];
        G.recs.forEach(r => { const a = recFulfil(r); if (!worthShowing(a)) return;
          ['aHC', 'aSc', 'capSc', 'xHC', 'xSc', 'jHC', 'jSc', 'jpHC', 'gHC', 'gSc'].forEach(k => podAgg[k] += a[k]);
          shown.push({ r, a }); });
        if (!shown.length) return;
        html += `<tr class="lvl-pod" data-pod="${pi}" data-exp="0" style="cursor:pointer;background:var(--border-light)">
          <td style="font-weight:600">${CARET}${G.pod}<span style="color:var(--muted);font-weight:400;font-size:11px;margin-left:6px">${shown.length}</span></td>${cells(podAgg, true)}</tr>`;
        shown.forEach(({ r, a }, ri) => {
          const rk = `${mode}${pi}-${ri}`;
          html += `<tr class="lvl-rec" data-pod="${pi}" data-rec="${rk}" data-exp="0" style="display:none;cursor:pointer">
            <td style="padding-left:26px;font-weight:500">${CARET}${r.name}${inactiveTag(r)}</td>${cells(a, false)}</tr>`;
          const jobs = (r.byJob || []).slice().sort((x, y) => (y[isSales ? 'hired' : 'offer'] || 0) - (x[isSales ? 'hired' : 'offer'] || 0) || (y.total || 0) - (x.total || 0));
          if (jobs.length) {
            jobs.forEach(bj => {
              const m = jobMeta(bj), sc = scoreForRole(m, q);
              const jo = outOfJob(r.name, bj.jobId);   // dated, same basis as the recruiter row above
              const jj = joinOfJob(r.name, bj.jobId);
              const seats = seatsOf(bj.jobId);
              // A job with no seats this quarter and nothing delivered on it is not this quarter's work.
              if (!seats && !jo.hc && !jj.hc) return;
              const jv = { aHC: seats, aSc: seats * sc, capSc: null, xHC: jo.hc, xSc: jo.sc, jHC: jj.hc, jSc: jj.sc, jpHC: null, jpSc: null,
                           gHC: Math.max(0, seats - jo.hc), gSc: Math.max(0, seats * sc - jo.sc) };
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
  // recruiters[].daily is keyed by pipeline stage-key ({stageKey:{'YYYY-MM-DD':count}}), bucketed by
  // last-activity day. Map the 3 displayed stages to those keys.
  // Stage order is HM Screening -> OA -> R1 everywhere: it is the order the work actually happens in,
  // so a row reads left-to-right as a candidate's progression rather than jumping backwards.
  const VEL_STAGES = [['hmReview', 'HM Screening'], ['oa', 'OA'], ['r1', 'R1']];
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
      const hasJob = !!(data.stageRollups && data.stageRollups.velocityByRecruiterJob);
      let h = `<tr><th style="min-width:240px">Pod / Recruiter${hasJob ? ' / Job' : ''} / Stage</th><th>Total · ${dates.length}d</th>`;
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

    // Pod -> Recruiter -> [Job ->] Stage. The Job level appears only when the pipeline has emitted the
    // recruiter x job x day cross (velocityByRecruiterJob); without it the tree stays 3 deep exactly as before.
    // Uses the generic data-path tree (arbitrary depth) rather than wireVelTree, which only wires 3 levels.
    const velRJ = data.stageRollups && data.stageRollups.velocityByRecruiterJob;
    const jobTitleOf = {}; (data.jobs || []).forEach(j => { jobTitleOf[j.id] = j.title; });
    const spanN = (n) => `<span style="color:var(--muted);font-weight:400;font-size:11px;margin-left:6px">${n}</span>`;
    // days array + total for one {day:count} map
    const series = (m) => { let t = 0; const per = dkeys.map(dk => { const v = (m && m[dk]) || 0; t += v; return v; }); return { per, t }; };
    const addInto = (dst, src) => { src.forEach((v, i) => dst[i] += v); };

    let html = '';
    groups.forEach((G, pi) => {
      const podArr = new Array(dkeys.length).fill(0); let podTotal = 0;
      const recCache = G.recs.map(r => { const d = recDaily(r); addInto(podArr, d.arr); podTotal += d.total; return d; });
      html += `<tr data-path="${pi}" data-haschild data-exp="0" style="cursor:pointer;background:var(--border-light)">
        <td style="font-weight:600">${CARET}${G.pod}${spanN(G.recs.length)}</td>${numRow(podTotal, podArr, true)}</tr>`;
      G.recs.forEach((r, ri) => {
        const rp = `${pi}-${ri}`;
        // Jobs this recruiter actually moved someone through, in the window, for the displayed stages.
        const jobs = [];
        if (velRJ && velRJ[r.name]) {
          Object.keys(velRJ[r.name]).forEach(j8 => {
            const byStage = velRJ[r.name][j8] || {};
            const arr = new Array(dkeys.length).fill(0); let tot = 0;
            const stages = VEL_STAGES.map(([sk, label]) => {
              const sres = series(byStage[sk]); addInto(arr, sres.per); tot += sres.t;
              return { label, per: sres.per, t: sres.t };
            });
            if (tot) jobs.push({ j8, title: jobTitleOf[j8] || j8, arr, tot, stages });
          });
          jobs.sort((a, b) => b.tot - a.tot);
        }
        html += `<tr data-path="${rp}" data-haschild data-exp="0" style="display:none;cursor:pointer">
          <td style="padding-left:26px;font-weight:500">${CARET}${r.name}${inactiveTag(r)}${jobs.length ? spanN(jobs.length) : ''}</td>${numRow(recCache[ri].total, recCache[ri].arr, false)}</tr>`;
        if (jobs.length) {
          jobs.forEach((J, ji) => {
            const jp = `${rp}-${ji}`;
            html += `<tr data-path="${jp}" data-haschild data-exp="0" style="display:none;cursor:pointer">
              <td style="padding-left:52px">${CARET}${J.title}</td>${numRow(J.tot, J.arr, false)}</tr>`;
            J.stages.forEach((st, si) => {
              html += `<tr data-path="${jp}-${si}" style="display:none">
                <td style="padding-left:78px;color:var(--muted)">${st.label}</td>${numRow(st.t, st.per, false)}</tr>`;
            });
          });
        } else {
          // No job cross available (or no job activity): keep the original Stage level directly under the recruiter.
          VEL_STAGES.forEach(([sk, label], si) => {
            const sres = series(stageDay(r, sk));
            html += `<tr data-path="${rp}-${si}" style="display:none">
              <td style="padding-left:52px;color:var(--muted)">${label}</td>${numRow(sres.t, sres.per, false)}</tr>`;
          });
        }
      });
    });
    body.innerHTML = html || `<tr><td colspan="${ncol}" style="text-align:center;color:var(--muted);padding:16px">No recruiters match the filter.</td></tr>`;
    wireTreePath(body);
    const untracked = untrackedStages(roll, VEL_STAGES);
    const un = document.getElementById('recVelUntracked');
    if (un) {
      un.style.display = untracked.length ? '' : 'none';
      if (untracked.length) un.innerHTML = `<strong>${untracked.join(' and ')}</strong> ${untracked.length > 1 ? 'are' : 'is'} not tracked in this Ashby workspace — no candidate has ever been recorded entering ${untracked.length > 1 ? 'those stages' : 'that stage'}, so the row${untracked.length > 1 ? 's read' : ' reads'} zero for every day. That is a missing signal, not a lack of activity.`;
    }
  }

  // ===== charts (standard palette + square legends) =====
  const C = { blue: '#4E6BA6', green: '#398AA2', cyan: '#1E7590', amber: '#D8B5BE', slate: '#938FB8' };
  const legendSquare = () => ({ position: 'top', align: 'center', labels: { usePointStyle: true, pointStyle: 'rect', boxWidth: 11, boxHeight: 11, padding: 16, font: { size: 12 } } });
  const gridY = { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 11 } } };
  const gridX = { grid: { display: false }, ticks: { font: { size: 11 } } };
  const podLabels = () => lastGroups.map(G => G.pod);
  const sumBy = (G, key) => G.recs.reduce((s, r) => s + (r[key] || 0), 0);

  // Momentum chart: THREE bars per recruiter (HM Screening / OA / R1), each bar stacked BY WEEK.
  // Grouped-and-stacked in Chart.js comes from the `stack` property: datasets sharing a stack id pile up,
  // different ids sit side by side. So stage = stack id, week = dataset within it. Hue carries the stage,
  // lightness carries the week (older = paler), which keeps ~15 datasets readable as 3 colour families.
  // Day-level stacking was tried and rejected as unreadable — 30 slivers per bar.
  const VEL_HUE = { hmReview: [78, 107, 166], oa: [57, 138, 162], r1: [30, 117, 144] };
  function buildVelChart() {
    const ctx = document.getElementById('recVelChart'); if (!ctx) return;
    if (recVelChart) { recVelChart.destroy(); recVelChart = null; }
    const recs = [...getFilteredRecs()].sort((a, b) => (b.total || 0) - (a.total || 0));
    const wrap = document.getElementById('recVelChartWrap');
    if (!recs.length) { if (wrap) wrap.style.height = '160px'; return; }

    // velDates() returns up to 30 days, most recent first. Chunk into 7-day weeks from the most recent
    // day backwards, then reverse so the OLDEST week is the innermost stack segment and the bar reads
    // left-to-right in time order.
    const days = velDates();
    const weeks = [];
    for (let i = 0; i < days.length; i += 7) {
      const chunk = days.slice(i, i + 7);
      weeks.push({ keys: chunk.map(dkey), end: chunk[0], start: chunk[chunk.length - 1] });
    }
    weeks.reverse();
    const fmtD = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const roll = data.stageRollups && data.stageRollups.velocityByRecruiter;
    const cell = (r, sk) => roll ? ((roll[r.name] && roll[r.name][sk]) || {}) : ((r.daily && r.daily[sk]) || {});

    const datasets = [];
    VEL_STAGES.forEach(([sk, label]) => {
      const [rr, gg, bb] = VEL_HUE[sk] || [100, 116, 139];
      weeks.forEach((w, wi) => {
        // oldest week palest; mix toward white by up to ~55%
        const t = weeks.length > 1 ? 0.55 * (1 - wi / (weeks.length - 1)) : 0;
        const mix = (c) => Math.round(c + (255 - c) * t);
        datasets.push({
          label: `${label} · ${fmtD(w.start)}–${fmtD(w.end)}`,
          stack: sk,
          _stage: sk, _stageLabel: label,
          data: recs.map(r => { const m = cell(r, sk); return w.keys.reduce((a, k) => a + (m[k] || 0), 0); }),
          backgroundColor: `rgb(${mix(rr)},${mix(gg)},${mix(bb)})`,
          borderWidth: 0, barPercentage: 0.92, categoryPercentage: 0.8
        });
      });
    });

    // 3 bars per recruiter, so the row needs roughly triple the height of a single-bar chart.
    const h = Math.max(260, recs.length * 3 * 16 + 90);
    if (wrap) wrap.style.height = h + 'px';
    ctx.style.maxHeight = h + 'px';   // override .chart-wrap canvas { max-height:300px }

    recVelChart = new Chart(ctx, {
      type: 'bar',
      data: { labels: recs.map(r => r.name), datasets },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: {
          valueLabels: false,   // ~15 datasets: per-segment labels would be unreadable
          legend: {
            position: 'top', align: 'center',
            labels: {
              usePointStyle: true, pointStyle: 'rect', boxWidth: 11, boxHeight: 11, padding: 16, font: { size: 12 },
              // One entry per STAGE, not one per dataset — 15 legend entries would be noise. Each swatch
              // uses that stage's strongest (most recent) shade.
              generateLabels: (chart) => VEL_STAGES.map(([sk, label]) => {
                const idx = chart.data.datasets.findIndex(d => d._stage === sk);
                const last = chart.data.datasets.map((d, i) => [d, i]).filter(([d]) => d._stage === sk).pop();
                return {
                  text: label,
                  fillStyle: last ? last[0].backgroundColor : '#94a3b8',
                  strokeStyle: 'transparent',
                  hidden: idx >= 0 ? !chart.isDatasetVisible(idx) : false,
                  datasetIndex: idx
                };
              })
            },
            // Clicking a stage toggles every week-segment in that stack together.
            onClick: (e, item, legend) => {
              const chart = legend.chart;
              const sk = chart.data.datasets[item.datasetIndex]?._stage;
              if (!sk) return;
              const show = !chart.isDatasetVisible(item.datasetIndex);
              chart.data.datasets.forEach((d, i) => { if (d._stage === sk) chart.setDatasetVisibility(i, show); });
              chart.update();
            }
          },
          tooltip: {
            callbacks: {
              title: (items) => items.length ? items[0].label : '',
              label: (c) => `${c.dataset.label}: ${c.parsed.x}`,
              // A stacked bar's total is the number people actually want; Chart.js won't show it by default.
              footer: (items) => {
                if (!items.length) return '';
                const sk = items[0].dataset._stage, i = items[0].dataIndex;
                const tot = items[0].chart.data.datasets.filter(d => d._stage === sk).reduce((a, d) => a + (d.data[i] || 0), 0);
                return `${items[0].dataset._stageLabel} total: ${tot}`;
              }
            }
          }
        },
        scales: {
          x: { ...gridY, stacked: true, title: { display: true, text: 'Candidates entering the stage', font: { size: 11 }, color: '#64748b' } },
          y: { stacked: true, grid: { display: false }, ticks: { font: { size: 11, weight: '500' } } }
        }
      }
    });
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
