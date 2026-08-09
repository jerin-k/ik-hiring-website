import { podOf, POD_OPTIONS, isSalesPod, capacityOf, currentQuarter, qKey } from '../recruiter-pods.js';
import { scoreForRole } from '../score-model.js';

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
    <p class="sub-note" style="margin-top:-8px;">Grouped by <strong>pod</strong> (set in <strong>Admin → Metric Configuration</strong>, per quarter). Click a pod to expand its recruiters. Year/Quarter drives pod grouping + capacity; From/To drives <strong>Submission Velocity</strong>.</p>
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
    </div>

    <!-- PANEL: Submission Velocity (LIVE — per-stage/day cells from recruiters[].daily) -->
    <div class="rec-panel" data-panel="velocity">
      <p class="sub-note">Pod → Recruiter → Stage (OA / HM Screening / R1) across the last 30 days of the selected range. Cells count candidates active at each stage per day. <span style="color:var(--muted)">Bucketed by last-activity date (a snapshot approximation); a bulk stage-sync can spike a single day.</span></p>
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
      <p class="sub-note"><strong>Pod → Recruiter → Source.</strong> Source = Ashby <code>source_type</code> (the finest grain Ashby exposes here). Count = candidates credited to that source; % = share within the parent. Org-wide totals live in <strong>Overall Efficiency</strong>.</p>
      <div class="chart-wrap" style="height:320px"><canvas id="recSourceChart"></canvas></div>
      <div class="scroll-table"><table>
        <thead><tr><th style="min-width:320px">Pod / Recruiter / Source</th><th>Count</th><th>%</th></tr></thead>
        <tbody id="recSourceBody"></tbody>
      </table></div>
    </div>
  `;
}

export function initRecruiterFilters(data) {
  if (!data || !data.recruiters) return;
  const allRecs = data.recruiters;
  const nDate = 7;

  // jobs[] is keyed by an 8-char id; recruiters[].byJob[].jobId is the full uuid → join on the prefix.
  // jobMeta() yields {department,title,level,complexity} for the scoring engine (falls back to byJob's own
  // title/department when the job isn't in jobs[] — e.g. archived with no current apps).
  const jobById = {}; (data.jobs || []).forEach(j => { jobById[j.id] = j; });
  const jobMeta = (bj) => { const j = jobById[(bj.jobId || '').slice(0, 8)]; return { department: (j && j.department) || bj.department, title: (j && j.title) || bj.title, level: j && j.level, complexity: j && j.complexity }; };
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
            <td style="padding-left:26px;font-weight:500">${CARET}${r.name}</td>${cells(recVals[ri], false)}</tr>`;
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

    // ===== Sourcing Mix — Pod → Recruiter → Source (LIVE from recruiters[].sources) =====
    // recruiters[].sources = { sourceType: count }. Ashby only exposes source_type here (no finer
    // source-name), so that's the leaf. % = share within the parent. Org-wide totals live in Overall Efficiency.
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
            <td style="padding-left:26px;font-weight:500">${CARET}${r.name}</td>
            <td>${rt || '<span class="zero">0</span>'}</td><td>${rt ? pct(rt, podTotal) + '%' : DASH}</td></tr>`;
          const entries = Object.entries(r.sources || {}).sort((a, b) => b[1] - a[1]);
          if (entries.length) {
            entries.forEach(([src, cnt], si) => {
              html += `<tr data-path="${pi}-${ri}-${si}" style="display:none">
                <td style="padding-left:52px;color:var(--muted)">${src}</td>
                <td>${cnt}</td><td class="${pctClass(pct(cnt, rt))}">${pct(cnt, rt)}%</td></tr>`;
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
    const stageDay = (r, sk) => (r.daily && r.daily[sk]) || {};
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
          <td style="padding-left:26px;font-weight:500">${CARET}${r.name}</td>${numRow(recCache[ri].total, recCache[ri].arr, false)}</tr>`;
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
