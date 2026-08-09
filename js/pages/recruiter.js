import { podOf, POD_OPTIONS, isSalesPod, setPod, capacityOf, setCapacity, currentQuarter, qKey } from '../recruiter-pods.js';

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

// ===== Metric Configuration model (see project_recruiter-score-model in memory) =====
const SCORE_TIERS = [['Vanilla', 6], ['Regular', 12], ['Semi-Niche', 15], ['Niche', 20], ['Super Niche', 40], ['Leadership', 60], ['Senior Leadership', 120]];
// Classification → default complexity tier. Grouped for display via the leading family label.
const CLASSIFICATIONS = [
  ['India SME', 'India SME - Normal', 'Vanilla'], ['India SME', 'India SME - Complex', 'Regular'], ['India SME', 'India SME - Uber Complex', 'Semi-Niche'],
  ['US SME', 'US SME - Normal', 'Regular'], ['US SME', 'US SME - Complex', 'Semi-Niche'], ['US SME', 'US SME - Uber Complex', 'Niche'],
  ['PA', 'India PA Junior', 'Vanilla'], ['PA', 'India PA', 'Regular'], ['PA', 'US PA Junior', 'Vanilla'], ['PA', 'US PA', 'Semi-Niche'],
  ['NonTech', 'NonTech - Intern - Normal', 'Vanilla'], ['NonTech', 'NonTech - Intern - Complex', 'Regular'], ['NonTech', 'NonTech L1 to L3 - Normal', 'Semi-Niche'], ['NonTech', 'NonTech L1 to L3 - Complex', 'Niche'], ['NonTech', 'NonTech L4 to L6 - Normal', 'Niche'], ['NonTech', 'NonTech L4 to L6 - Complex', 'Super Niche'],
  ['Tech', 'Tech - Intern - Normal', 'Regular'], ['Tech', 'Tech - Intern - Complex', 'Semi-Niche'], ['Tech', 'Tech L1 to L3 - Normal', 'Niche'], ['Tech', 'Tech L1 to L3 - Complex', 'Super Niche'], ['Tech', 'Tech L4 to L6 - Normal', 'Super Niche'], ['Tech', 'Tech L4 to L6 - Complex', 'Leadership'],
  ['Leadership', 'L7 - L8', 'Leadership'], ['Leadership', 'L9 & above', 'Senior Leadership'],
];
const FAMILY_OPTIONS = ['India SME', 'US SME', 'India PA', 'US PA', 'NonTech', 'Tech', 'Leadership', 'Exclude'];
const DEPT_FAMILY_DEFAULT = [
  ['SME - India', 'India SME', ''], ['SME - US', 'US SME', ''], ['Engineering', 'Tech', 'Tech = Engineering only'],
  ['IT', 'NonTech', ''], ['Curriculum', 'NonTech', ''],
  ['Business - India', 'India PA', 'PA if title = Program Advisor, else NonTech'], ['US Business', 'US PA', 'PA if title = Program Advisor, else NonTech'],
  ['Marketing', 'NonTech', ''], ['Operations', 'NonTech', ''], ['Finance', 'NonTech', ''], ['Human Resource', 'NonTech', ''],
  ['Talent Acquisition', 'NonTech', ''], ['New Programs', 'NonTech', ''], ["Founder's Office", 'NonTech', ''], ['B2B', 'NonTech', ''], ['Test', 'Exclude', ''],
];
const LEVEL_BANDS = [['Intern', 'L0'], ['Junior (PA/Sales only)', 'L1'], ['L1–L3', 'L1, L2, L3'], ['L4–L6', 'L4, L5, L6'], ['L7–L8', 'L7, L8'], ['L9 & above', 'L9–L12']];

const GRID_LS = 'ik_score_grid_q';   // { "2026-Q3": { tierPoints:{}, rowTier:{} } } — per quarter, copy-forward
const DEPT_FAM_LS = 'ik_dept_family';
function defaultGrid() {
  const tierPoints = {}; SCORE_TIERS.forEach(([n, p]) => { tierPoints[n] = p; });
  const rowTier = {}; CLASSIFICATIONS.forEach(([, cls, tier]) => { rowTier[cls] = tier; });
  return { tierPoints, rowTier };
}
function loadGridStore() { try { return JSON.parse(localStorage.getItem(GRID_LS) || '{}'); } catch (e) { return {}; } }
function saveGridStore(o) { localStorage.setItem(GRID_LS, JSON.stringify(o)); }
function gridQRank(k) { const m = /^(\d{4})-Q([1-4])$/.exec(k || ''); return m ? parseInt(m[1], 10) * 10 + parseInt(m[2], 10) : 0; }
// Grid for a quarter: explicit, else latest earlier quarter (copy-forward), else default.
function gridForQuarter(quarter) {
  const store = loadGridStore();
  if (store[quarter]) return store[quarter];
  const target = gridQRank(quarter); let best = null, br = -1;
  for (const k of Object.keys(store)) { const r = gridQRank(k); if (r <= target && r > br) { br = r; best = store[k]; } }
  return best ? JSON.parse(JSON.stringify(best)) : defaultGrid();
}
// Materialise the quarter (copy inherited grid) before an edit so prior quarters aren't touched.
function materialiseGrid(quarter) { const s = loadGridStore(); if (!s[quarter]) { s[quarter] = gridForQuarter(quarter); saveGridStore(s); } return s; }
function setGridTier(quarter, cls, tier) { const s = materialiseGrid(quarter); s[quarter].rowTier[cls] = tier; saveGridStore(s); }
function setGridPoints(quarter, tier, pts) { const s = materialiseGrid(quarter); s[quarter].tierPoints[tier] = pts; saveGridStore(s); }
function loadDeptFamily() { try { return JSON.parse(localStorage.getItem(DEPT_FAM_LS) || '{}'); } catch (e) { return {}; } }
function saveDeptFamily(o) { localStorage.setItem(DEPT_FAM_LS, JSON.stringify(o)); }
function familyOf(dept) { const o = loadDeptFamily(); const d = DEPT_FAMILY_DEFAULT.find(x => x[0] === dept); return o[dept] || (d ? d[1] : ''); }

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
  for (let y = Math.max(cy, 2026); y >= 2024; y--) years.push(y);

  return `
    <style>
      .rec-subtabs { display:flex; gap:2px; flex-wrap:wrap; border-bottom:1px solid var(--border); margin-bottom:20px; }
      .rec-subtab { appearance:none; background:none; border:none; padding:9px 16px; font-size:13px; font-weight:500;
        color:var(--muted); cursor:pointer; border-bottom:2px solid transparent; margin-bottom:-1px; }
      .rec-subtab:hover { color:var(--text); }
      .rec-subtab.active { color:var(--accent); border-bottom-color:var(--accent); font-weight:600; }

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
    <p class="sub-note" style="margin-top:-8px;">Grouped by <strong>pod</strong> (set in the <strong>Metric Configuration</strong> tab, per quarter). Click a pod to expand its recruiters. Year/Quarter drives pod grouping + capacity; From/To drives <strong>Submission Velocity</strong>.</p>
    <div class="rec-filters">
      <div class="fchip"><span class="lbl">POD</span><div class="ms" id="msPod"></div></div>
      <div class="fchip"><span class="lbl">Recruiter</span><div class="ms" id="msRec"></div></div>
      <div class="fchip"><span class="lbl">Job</span><div class="ms" id="msJob"></div></div>
      <div class="fchip"><label class="opt"><input type="checkbox" id="recHideZero" checked> Hide zero-app</label></div>
      <div class="fchip"><label class="opt"><input type="checkbox" id="recExpandAll"> Expand all branches</label></div>
      <span class="fdiv"></span>
      <div class="fchip"><span class="lbl">From</span><input type="date" id="recVelFrom"></div>
      <div class="fchip"><span class="lbl">To</span><input type="date" id="recVelTo"></div>
      <div class="fchip"><span class="lbl">Year</span><select id="recVelYear"><option value="">All</option>${years.map(y => `<option value="${y}">${y}</option>`).join('')}</select></div>
      <div class="fchip"><span class="lbl">Quarter</span><select id="recVelQuarter"><option value="">All</option><option value="Q1">Q1</option><option value="Q2">Q2</option><option value="Q3">Q3</option><option value="Q4">Q4</option></select></div>
    </div>

    <div class="rec-subtabs">
      <button class="rec-subtab active" data-tab="velocity">Submission Velocity</button>
      <button class="rec-subtab" data-tab="screening">Screening Efficiency</button>
      <button class="rec-subtab" data-tab="joining">Joining Conversion</button>
      <button class="rec-subtab" data-tab="fulfilment">Fulfilment</button>
      <button class="rec-subtab" data-tab="sourcing">Sourcing Mix</button>
      <button class="rec-subtab" data-tab="config">Metric Configuration</button>
    </div>

    <!-- PANEL: Submission Velocity (scaffold — filters/chart live, per-day/stage cells pending pipeline) -->
    <div class="rec-panel" data-panel="velocity">
      <p class="sub-note" style="color:var(--orange)">Structure preview — Pod → Recruiter → Stage (OA / HM Screening / R1) across the last 30 days of the selected range. Filters, layout, and the chart's submission totals are live; the per-day / per-stage cells need the recruiter×job×stage×date rollup (pipeline redesign).</p>
      <div class="chart-wrap" id="recVelChartWrap" style="height:300px"><canvas id="recVelChart"></canvas></div>
      <div class="scroll-table"><table class="vel-table">
        <thead id="recVelHead"></thead>
        <tbody id="recVelBody"></tbody>
      </table></div>
    </div>

    <!-- PANEL: Screening Efficiency -->
    <div class="rec-panel" data-panel="screening" style="display:none">
      <p class="sub-note">Added = reached the stage. Cleared = transitioned <em>out</em> (reached the next stage). HM &amp; OA are live from the aggregate; <strong>R1 cleared = reached R2</strong> and the Job-level branch need the recruiter×job×stage rollup (pipeline redesign).</p>
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
    <div class="rec-panel" data-panel="fulfilment" style="display:none">
      <p class="sub-note"><strong>Non-Sales</strong> pods are measured on <strong>Offers</strong>; the <strong>Sales</strong> pod on <strong>Hires</strong>. <strong>Target Score = min(Capacity, Assigned Score)</strong> — Capacity is set in <strong>Metric Configuration</strong> (per quarter).</p>
      <div class="chart-wrap" style="height:280px"><canvas id="recFulfilChart"></canvas></div>

      <p class="sub-note"><strong>HC</strong> = headcount, <strong>Score</strong> = sum of role scores. Offered/Hired <strong>HC is live</strong>; Assigned, Score, Target and Gap need the recruiter×job rollup + score engine (pipeline) — shown as <span class="zero">—</span> for now.</p>

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
      <p class="sub-note"><strong>Pod → Recruiter → Source Category → Source Name.</strong> Category = Ashby <code>source_type</code> (Sourced / Referral / Inbound / Internal). Per-recruiter values need the pipeline (recruiter×source rollup) — shown as <span class="zero">—</span> until then. Org-wide / pod totals will live in <strong>Overall Efficiency</strong>.</p>
      <div class="chart-wrap" style="height:320px"><canvas id="recSourceChart"></canvas></div>
      <div class="scroll-table"><table>
        <thead><tr><th style="min-width:320px">Pod / Recruiter / Category / Source</th><th>Count</th><th>%</th></tr></thead>
        <tbody id="recSourceBody"></tbody>
      </table></div>
    </div>

    <!-- PANEL: Metric Configuration -->
    <div class="rec-panel" data-panel="config" style="display:none">
      <p class="sub-note">The whole scoring &amp; capacity model lives here — the pipeline just reads it. Everything is saved to this browser (export to bake into the committed files).</p>

      <div class="cfg-card" style="display:flex;align-items:center;gap:12px;background:#e4eaf4;border-color:#c3d0e8">
        <span class="lbl" style="font-size:11px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:0.04em">Quarter</span>
        <select id="cfgQuarter"></select>
        <span style="font-size:11px;color:var(--muted)">Drives Pod, Capacity &amp; Score Grid below — each stored per quarter, inheriting the previous quarter (copy-forward); edit to override.</span>
      </div>

      <!-- Section 1: Recruiter → Pod & Capacity (per quarter) -->
      <div class="cfg-card">
        <h3 class="subsection-title" style="margin:0 0 8px">Recruiter → Pod &amp; Capacity</h3>
        <p class="sub-note" style="margin:0 0 10px">Pod feeds grouping across the tab; Capacity (a Score) is the ideal Fulfilment target.</p>
        <div class="scroll-table"><table>
          <thead><tr><th style="min-width:220px">Recruiter</th><th style="width:160px">Pod</th><th style="width:140px">Capacity (Score)</th></tr></thead>
          <tbody id="cfgPodBody"></tbody>
        </table></div>
        <div style="margin-top:10px;font-size:11px;color:var(--muted)">
          <span id="cfgPodSummary"></span>
          <span style="margin-left:6px">· edits auto-save to this browser (team-wide sync is pending the pipeline).</span>
        </div>
      </div>

      <!-- Section 2: Role Score Grid (per quarter) -->
      <div class="cfg-card">
        <h3 class="subsection-title" style="margin:0 0 6px">Role Score Grid <span id="cfgGridNote" style="font-weight:400;font-size:11px;color:var(--muted);text-transform:none;letter-spacing:0"></span></h3>
        <p class="sub-note" style="margin:0 0 10px">Each role classification maps to one complexity tier → its point value. Stored <strong>per quarter</strong> (copy-forward); a candidate scores off the grid for the quarter of its offer/hire date. Points editable in the header; one tier per row.</p>
        <div class="scroll-table" style="margin-top:4px"><table class="cfg-grid">
          <thead id="cfgGridHead"></thead>
          <tbody id="cfgGridBody"></tbody>
        </table></div>
      </div>

      <!-- Section 3: Department → Family -->
      <div class="cfg-card">
        <h3 class="subsection-title" style="margin:0 0 6px">Department → Family</h3>
        <p class="sub-note" style="margin:0 0 10px">Maps each Ashby department to a scoring family. Business departments resolve to <strong>PA</strong> only when the job title is <em>Program Advisor</em> (incl. Sr PA → PA Regular); otherwise NonTech.</p>
        <div class="scroll-table"><table>
          <thead><tr><th style="min-width:200px">Ashby Department</th><th style="width:150px">Family</th><th>Note</th></tr></thead>
          <tbody id="cfgDeptBody"></tbody>
        </table></div>
      </div>

      <!-- Section 4: Level / Complexity / Leadership -->
      <div class="cfg-card">
        <h3 class="subsection-title" style="margin:0 0 6px">Level → Band · Complexity · Leadership override</h3>
        <div id="cfgRefBlock"></div>
      </div>
    </div>
  `;
}

export function initRecruiterFilters(data) {
  if (!data || !data.recruiters) return;
  const allRecs = data.recruiters;
  const nDate = 7;
  let lastGroups = [], lastRecs = [], activeTab = 'velocity';

  let msPod = null, msRec = null, msJob = null;

  // Quarter selected in the global filter (Year+Quarter) — drives pod grouping + capacity lookups.
  function selQuarter() {
    const y = document.getElementById('recVelYear')?.value;
    const q = document.getElementById('recVelQuarter')?.value;
    return (y && q) ? qKey(y, q) : currentQuarter();
  }

  // Styled multi-select checkbox dropdown. Returns { getSelected } ; empty selection = "All".
  function makeMultiSelect(container, label, options, onChange) {
    if (!container) return null;
    const selected = new Set();
    const labelText = () => selected.size === 0 ? `${label}: All` : (selected.size === 1 ? `${label}: ${[...selected][0]}` : `${label}: ${selected.size} selected`);
    container.classList.add('ms');
    container.innerHTML = `<button type="button" class="ms-btn"></button><div class="ms-panel" style="display:none">${options.map(o => `<label class="ms-opt"><input type="checkbox" value="${String(o).replace(/"/g, '&quot;')}"> ${o}</label>`).join('') || '<span style="font-size:11px;color:var(--muted);padding:4px 8px">No options yet</span>'}</div>`;
    const btn = container.querySelector('.ms-btn'), panel = container.querySelector('.ms-panel');
    btn.textContent = labelText();
    btn.addEventListener('click', (e) => { e.stopPropagation(); const open = panel.style.display !== 'none'; document.querySelectorAll('.ms-panel').forEach(p => p.style.display = 'none'); panel.style.display = open ? 'none' : 'block'; });
    panel.addEventListener('click', e => e.stopPropagation());
    container.querySelectorAll('input[type=checkbox]').forEach(cb => cb.addEventListener('change', () => { if (cb.checked) selected.add(cb.value); else selected.delete(cb.value); btn.textContent = labelText(); onChange(); }));
    return { getSelected: () => [...selected] };
  }

  function getFilteredRecs() {
    const q = selQuarter();
    const hideZero = document.getElementById('recHideZero')?.checked;
    const pods = msPod ? msPod.getSelected() : [];
    const names = msRec ? msRec.getSelected() : [];
    // Job multi-select (msJob) is present but pending — recruiter×job attribution needs the pipeline,
    // so it can't scope the recruiter list yet; wired for when that data lands.
    return allRecs.filter(r => {
      if (hideZero && (r.total || 0) === 0) return false;
      if (names.length && !names.includes(r.name)) return false;
      if (pods.length && !pods.includes(podOf(r.name, q))) return false;
      return true;
    });
  }

  function renderAll() {
    const recs = getFilteredRecs();
    const groups = groupByPod(recs, selQuarter());

    // ===== Submission Velocity (scaffold — own POD/date filters; values pending pipeline) =====
    renderVelocity();

    // ===== Screening Efficiency =====
    // Added = reached stage; Cleared = reached next stage. HM->OA, OA->R1 live; R1->R2 pending (no r2 per recruiter).
    const screenCells = (o) => {
      const hmA = o.hm || 0, hmC = o.oa || 0, oaA = o.oa || 0, oaC = o.r1 || 0, r1A = o.r1 || 0;
      return `<td>${hmA}</td><td>${hmC}</td><td class="${pctClass(pct(hmC, hmA))}">${pct(hmC, hmA)}%</td>
        <td>${oaA}</td><td>${oaC}</td><td class="${pctClass(pct(oaC, oaA))}">${pct(oaC, oaA)}%</td>
        <td>${r1A}</td><td>${DASH}</td><td>${DASH}</td>`;
    };
    const sumStages = (list) => list.reduce((a, r) => ({ hm: a.hm + (r.hm || 0), oa: a.oa + (r.oa || 0), r1: a.r1 + (r.r1 || 0) }), { hm: 0, oa: 0, r1: 0 });
    const dashScreen = `<td>${DASH}</td>`.repeat(9);
    const screenBody = document.getElementById('recScreenBody');
    if (screenBody) {
      let html = '';
      groups.forEach((G, pi) => {
        html += `<tr class="lvl-pod" data-pod="${pi}" data-exp="0" style="cursor:pointer;background:var(--border-light)">
          <td style="font-weight:600">${CARET}${G.pod}<span style="color:var(--muted);font-weight:400;font-size:11px;margin-left:6px">${G.recs.length}</span></td>${screenCells(sumStages(G.recs))}</tr>`;
        G.recs.forEach((r, ri) => {
          const rk = `s${pi}-${ri}`;
          html += `<tr class="lvl-rec" data-pod="${pi}" data-rec="${rk}" data-exp="0" style="display:none;cursor:pointer">
            <td style="padding-left:26px;font-weight:500">${CARET}${r.name}</td>${screenCells(r)}</tr>`;
          html += `<tr class="lvl-stage" data-pod="${pi}" data-parent-rec="${rk}" style="display:none">
            <td style="padding-left:52px;color:var(--muted);font-style:italic">Per-job breakdown — pending recruiter×job rollup</td>${dashScreen}</tr>`;
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
          html += `<tr class="leaf" data-g="j${gi}" style="display:none"><td style="padding-left:30px;font-weight:500">${r.name}</td>
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
    // Offered HC (both) and Hired HC (Sales) are LIVE; Assigned / all Score / Target / Joining Pending / Gap
    // need the recruiter×job rollup + score engine + stage detail (pipeline). Tree = Pod → Recruiter → Job.
    function fulfilRows(gs, mode) {
      const isSales = mode === 'hire';
      const ncol = isSales ? 11 : 9;
      const jobDash = `<td>${DASH}</td>`.repeat(ncol - 1);
      // metric cells for a row given live Offered HC + (Sales) Hired HC; everything else pending.
      const cells = (offHC, hireHC, bold) => {
        const w = bold ? ' style="font-weight:600"' : '';
        let c = `<td>${DASH}</td><td>${DASH}</td>`      // Assigned HC/Score
          + `<td>${DASH}</td>`                          // Target Score
          + `<td${w}>${offHC}</td><td>${DASH}</td>`      // Offered HC/Score (HC live)
          + `<td>${DASH}</td><td>${DASH}</td>`;          // Joining Pending HC/Score (pending)
        if (isSales) c += `<td${w}>${hireHC}</td><td>${DASH}</td>`; // Hired HC/Score (HC live)
        c += `<td>${DASH}</td>`;                         // Gap Score
        return c;
      };
      let html = '';
      gs.forEach((G, pi) => {
        const offSum = G.recs.reduce((s, r) => s + (r.offer || 0), 0);
        const hireSum = G.recs.reduce((s, r) => s + (r.hired || 0), 0);
        html += `<tr class="lvl-pod" data-pod="${pi}" data-exp="0" style="cursor:pointer;background:var(--border-light)">
          <td style="font-weight:600">${CARET}${G.pod}<span style="color:var(--muted);font-weight:400;font-size:11px;margin-left:6px">${G.recs.length}</span></td>${cells(offSum, hireSum, true)}</tr>`;
        G.recs.forEach((r, ri) => {
          const rk = `${mode}${pi}-${ri}`;
          html += `<tr class="lvl-rec" data-pod="${pi}" data-rec="${rk}" data-exp="0" style="display:none;cursor:pointer">
            <td style="padding-left:26px;font-weight:500">${CARET}${r.name}</td>${cells(r.offer || 0, r.hired || 0, false)}</tr>`;
          html += `<tr class="lvl-stage" data-pod="${pi}" data-parent-rec="${rk}" style="display:none">
            <td style="padding-left:52px;color:var(--muted);font-style:italic">Per-job breakdown — pending recruiter×job rollup</td>${jobDash}</tr>`;
        });
      });
      return html || `<tr><td colspan="${ncol}" style="text-align:center;color:var(--muted);padding:16px">No recruiters in this group.</td></tr>`;
    }

    const offerBody = document.getElementById('recFulfilOfferBody');
    const hireBody = document.getElementById('recFulfilHireBody');
    if (offerBody) { offerBody.innerHTML = fulfilRows(nonSalesGroups, 'offer'); wireVelTree(offerBody); }
    if (hireBody) { hireBody.innerHTML = fulfilRows(salesGroups, 'hire'); wireVelTree(hireBody); }

    // ===== Sourcing Mix — Pod → Recruiter → Category → Source (per-recruiter; pending pipeline) =====
    // Totals (grand + pod) intentionally dropped — those live in Overall Efficiency. Category = Ashby
    // source_type (Sourced/Referral/Inbound/Internal); values need the recruiter×source rollup.
    const srcBody = document.getElementById('recSourceBody');
    if (srcBody) {
      const CATS = ['Sourced', 'Referral', 'Inbound', 'Internal'];
      let html = '';
      groups.forEach((G, pi) => {
        html += `<tr data-path="${pi}" data-haschild data-exp="0" style="cursor:pointer;background:var(--border-light)">
          <td style="font-weight:600">${CARET}${G.pod}<span style="color:var(--muted);font-weight:400;font-size:11px;margin-left:6px">${G.recs.length}</span></td><td>${DASH}</td><td>${DASH}</td></tr>`;
        G.recs.forEach((r, ri) => {
          html += `<tr data-path="${pi}-${ri}" data-haschild data-exp="0" style="display:none;cursor:pointer">
            <td style="padding-left:26px;font-weight:500">${CARET}${r.name}</td><td>${DASH}</td><td>${DASH}</td></tr>`;
          CATS.forEach((cat, ci) => {
            html += `<tr data-path="${pi}-${ri}-${ci}" data-haschild data-exp="0" style="display:none;cursor:pointer">
              <td style="padding-left:52px;color:var(--muted)">${CARET}${cat}</td><td>${DASH}</td><td>${DASH}</td></tr>`;
            html += `<tr data-path="${pi}-${ri}-${ci}-0" style="display:none">
              <td style="padding-left:82px;color:var(--muted);font-style:italic">Source names — pending recruiter×source rollup</td><td>${DASH}</td><td>${DASH}</td></tr>`;
          });
        });
      });
      srcBody.innerHTML = html || `<tr><td colspan="3" style="text-align:center;color:var(--muted);padding:16px">No recruiters match the filter.</td></tr>`;
      wireTreePath(srcBody);
    }

    lastGroups = groups; lastRecs = recs;
    renderActiveChart();
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
  function renderVelocity() {
    const head = document.getElementById('recVelHead');
    const body = document.getElementById('recVelBody');
    if (!body) return;
    const recs = getFilteredRecs();
    const groups = groupByPod(recs, selQuarter());
    const dates = velDates();
    const STAGES = [['oa', 'Online Assessment'], ['hm', 'HM Screening'], ['r1', 'R1']];

    if (head) {
      let h = '<tr><th style="min-width:240px">Pod / Recruiter / Stage</th><th>Total - 30 days</th>';
      dates.forEach(d => { h += `<th>${MON[d.getMonth()]} ${d.getDate()}</th>`; });
      h += '</tr>';
      head.innerHTML = h;
    }
    const dashCells = `<td>${DASH}</td>`.repeat(dates.length + 1); // Total-30 + dates
    const ncol = dates.length + 2;
    let html = '';
    groups.forEach((G, pi) => {
      html += `<tr class="lvl-pod" data-pod="${pi}" data-exp="0" style="cursor:pointer;background:var(--border-light)">
        <td style="font-weight:600">${CARET}${G.pod}<span style="color:var(--muted);font-weight:400;font-size:11px;margin-left:6px">${G.recs.length}</span></td>${dashCells}</tr>`;
      G.recs.forEach((r, ri) => {
        const rk = `${pi}-${ri}`;
        html += `<tr class="lvl-rec" data-pod="${pi}" data-rec="${rk}" data-exp="0" style="display:none;cursor:pointer">
          <td style="padding-left:26px;font-weight:500">${CARET}${r.name}</td>${dashCells}</tr>`;
        STAGES.forEach(([k, label]) => {
          html += `<tr class="lvl-stage" data-pod="${pi}" data-parent-rec="${rk}" style="display:none">
            <td style="padding-left:52px;color:var(--muted)">${label}</td>${dashCells}</tr>`;
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
    // Y = recruiter, X = candidate count. One bar per stage (HM / OA / R1): full length = Added (in),
    // dark segment = Cleared (out), light remainder = didn't clear. Roles enter at different first
    // stages, so Added is a real reached-count; Cleared uses the interim approximation and R1-Cleared
    // is pending until the recruiter×job×stage rollup. Data labels: total at bar end, Cleared on the dark part.
    const recs = [...lastRecs].sort((a, b) => ((b.hm || 0) + (b.oa || 0) + (b.r1 || 0)) - ((a.hm || 0) + (a.oa || 0) + (a.r1 || 0)));
    const A = { hm: recs.map(r => r.hm || 0), oa: recs.map(r => r.oa || 0), r1: recs.map(r => r.r1 || 0) };
    const clHM = recs.map(r => Math.min(r.hm || 0, r.oa || 0));           // cleared HM ≈ reached OA (clamped)
    const remHM = recs.map((r, i) => Math.max(0, (r.hm || 0) - clHM[i]));
    const clOA = recs.map(r => Math.min(r.oa || 0, r.r1 || 0));           // cleared OA ≈ reached R1 (clamped)
    const remOA = recs.map((r, i) => Math.max(0, (r.oa || 0) - clOA[i]));
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
    const recs = lastRecs.map(r => { const target = capacityOf(r.name, q); const achieved = 0; return { name: r.name, target, achieved, gap: Math.max(0, target - achieved) }; })
      .filter(r => r.target > 0).sort((a, b) => b.target - a.target);
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
    // Recruiter-centric: Y = recruiter names, one bar per source category, each bar split by source name.
    // Needs recruiter×source + source_type from the pipeline — empty-state until then (org-wide totals move
    // to Overall Efficiency).
    if (recSourceChart) { recSourceChart.destroy(); recSourceChart = null; }
    const wrap = ctx.parentElement;
    let emptyMsg = wrap && wrap.querySelector('.chart-empty');
    ctx.style.display = 'none';
    if (wrap && !emptyMsg) { emptyMsg = document.createElement('div'); emptyMsg.className = 'chart-empty'; emptyMsg.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100%;min-height:120px;color:var(--muted);font-size:13px;text-align:center;padding:20px'; wrap.appendChild(emptyMsg); }
    if (emptyMsg) { emptyMsg.innerHTML = 'Recruiter-centric source mix — one bar per recruiter, grouped by <strong>source category</strong> with the <strong>source-name split</strong> inside — pending the recruiter×source rollup + <code>source_type</code> from the pipeline.'; emptyMsg.style.display = 'flex'; }
  }
  function renderActiveChart() {
    if (activeTab === 'velocity') buildVelChart();
    else if (activeTab === 'screening') buildScreenChart();
    else if (activeTab === 'joining') buildJoinChart();
    else if (activeTab === 'fulfilment') buildFulfilChart();
    else if (activeTab === 'sourcing') buildSourceChart();
  }

  // ===== Metric Configuration =====
  let cfgInited = false;
  function cfgQ() { return document.getElementById('cfgQuarter')?.value || currentQuarter(); }
  function updatePodSummary() {
    const el = document.getElementById('cfgPodSummary'); if (!el) return;
    const q = cfgQ(); const counts = {};
    allRecs.forEach(r => { const p = podOf(r.name, q); counts[p] = (counts[p] || 0) + 1; });
    el.textContent = Object.entries(counts).map(([p, c]) => `${p}: ${c}`).join('  ·  ');
  }
  function renderPodCapacity() {
    const body = document.getElementById('cfgPodBody'); if (!body) return;
    const q = cfgQ();
    const names = allRecs.map(r => r.name).sort((a, b) => a.localeCompare(b));
    const podOpts = [...POD_OPTIONS, 'Unassigned'];
    body.innerHTML = names.map(name => `<tr>
      <td style="font-weight:500">${name}</td>
      <td><select class="cfg-pod" data-name="${name}">${podOpts.map(p => `<option value="${p}"${p === podOf(name, q) ? ' selected' : ''}>${p}</option>`).join('')}</select></td>
      <td><input type="number" min="0" class="cfg-cap" data-name="${name}" value="${capacityOf(name, q)}" style="width:90px"></td></tr>`).join('');
    body.querySelectorAll('.cfg-pod').forEach(sel => sel.addEventListener('change', () => { setPod(sel.dataset.name, sel.value, cfgQ()); updatePodSummary(); }));
    body.querySelectorAll('.cfg-cap').forEach(inp => inp.addEventListener('input', () => setCapacity(inp.dataset.name, inp.value, cfgQ())));
    updatePodSummary();
  }
  function renderScoreGrid() {
    const head = document.getElementById('cfgGridHead'); if (!head) return;
    const q = cfgQ();
    const grid = gridForQuarter(q);
    head.innerHTML = `<tr><th>Role Classification</th>${SCORE_TIERS.map(([n]) => `<th>${n}<br><input type="number" class="tier-pts" data-tier="${n}" value="${grid.tierPoints[n]}"></th>`).join('')}</tr>`;
    let html = '', lastFam = null;
    CLASSIFICATIONS.forEach(([fam, cls]) => {
      if (fam !== lastFam) { html += `<tr class="fam-sep"><td colspan="${SCORE_TIERS.length + 1}">${fam}</td></tr>`; lastFam = fam; }
      const rname = 'grid_' + cls.replace(/[^a-z0-9]/gi, '_');
      html += `<tr><td>${cls}</td>${SCORE_TIERS.map(([n]) => `<td><input type="radio" name="${rname}" class="grid-radio" data-cls="${cls}" data-tier="${n}"${n === grid.rowTier[cls] ? ' checked' : ''}></td>`).join('')}</tr>`;
    });
    document.getElementById('cfgGridBody').innerHTML = html;
    document.querySelectorAll('#cfgGridBody .grid-radio').forEach(r => r.addEventListener('change', () => { if (r.checked) setGridTier(cfgQ(), r.dataset.cls, r.dataset.tier); }));
    document.querySelectorAll('#cfgGridHead .tier-pts').forEach(inp => inp.addEventListener('input', () => setGridPoints(cfgQ(), inp.dataset.tier, parseInt(inp.value, 10) || 0)));
    const note = document.getElementById('cfgGridNote');
    if (note) note.textContent = ` — ${loadGridStore()[q] ? 'edited for ' + q.replace('-', ' ') : 'inherited (copy-forward)'}`;
  }
  function renderDeptFamily() {
    const body = document.getElementById('cfgDeptBody'); if (!body) return;
    body.innerHTML = DEPT_FAMILY_DEFAULT.map(([dept, , note]) => `<tr>
      <td style="font-weight:500">${dept}</td>
      <td><select class="cfg-fam" data-dept="${dept}">${FAMILY_OPTIONS.map(f => `<option value="${f}"${f === familyOf(dept) ? ' selected' : ''}>${f}</option>`).join('')}</select></td>
      <td style="color:var(--muted);font-size:11px">${note || ''}</td></tr>`).join('');
    body.querySelectorAll('.cfg-fam').forEach(s => s.addEventListener('change', () => { const o = loadDeptFamily(); o[s.dataset.dept] = s.value; saveDeptFamily(o); }));
  }
  function renderRefBlock() {
    const el = document.getElementById('cfgRefBlock'); if (!el) return;
    el.innerHTML = `<div class="cfg-ref">
      <table><thead><tr><th>Level band</th><th>Ashby L-scale</th></tr></thead><tbody>${LEVEL_BANDS.map(([b, l]) => `<tr><td>${b}</td><td style="color:var(--muted)">${l}</td></tr>`).join('')}</tbody></table>
      <table><thead><tr><th>Complexity (Ashby)</th></tr></thead><tbody><tr><td>Normal</td></tr><tr><td>Complex</td></tr><tr><td>Uber Complex</td></tr></tbody></table>
      <table><thead><tr><th>Leadership override</th></tr></thead><tbody><tr><td>L7–L8 → Leadership (60)</td></tr><tr><td>L9 &amp; above → Senior Leadership (120)</td></tr><tr><td style="color:var(--muted);font-size:11px">Any family; overrides Family/Complexity by level.</td></tr></tbody></table>
    </div>`;
  }
  function renderMetricConfig() {
    if (!cfgInited) {
      cfgInited = true;
      const qSel = document.getElementById('cfgQuarter');
      if (qSel) {
        const cy = new Date().getFullYear(); const qs = [];
        for (let y = cy; y >= cy - 1; y--) for (let q = 4; q >= 1; q--) qs.push(qKey(y, q));
        qSel.innerHTML = qs.map(q => `<option value="${q}">${q.replace('-', ' ')}</option>`).join('');
        qSel.value = currentQuarter();
        qSel.addEventListener('change', () => { renderPodCapacity(); renderScoreGrid(); });
      }
    }
    renderPodCapacity(); renderScoreGrid(); renderDeptFamily(); renderRefBlock();
  }

  function showTab(name) {
    activeTab = name;
    document.querySelectorAll('.rec-subtab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.rec-panel').forEach(p => { p.style.display = p.dataset.panel === name ? '' : 'none'; });
    if (name === 'config') renderMetricConfig();
    renderActiveChart();
  }
  document.querySelectorAll('.rec-subtab').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));

  // Global filters (apply to all sub-tabs) — Pod / Recruiter / Job are multi-select
  msPod = makeMultiSelect(document.getElementById('msPod'), 'Pod', POD_ORDER, renderAll);
  msRec = makeMultiSelect(document.getElementById('msRec'), 'Recruiter', allRecs.map(r => r.name).sort((a, b) => a.localeCompare(b)), renderAll);
  const jobNames = [...new Set((data.jobs || []).map(j => j.title || j.name || j.job).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  msJob = makeMultiSelect(document.getElementById('msJob'), 'Job', jobNames, renderAll);
  document.addEventListener('click', () => document.querySelectorAll('.ms-panel').forEach(p => p.style.display = 'none'));
  document.getElementById('recHideZero')?.addEventListener('change', renderAll);
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
  showTab('velocity');
}
