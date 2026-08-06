import { podOf, POD_OPTIONS, isSalesPod } from '../recruiter-pods.js';

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
}

function groupByPod(recs) {
  const g = {};
  recs.forEach(r => { const p = podOf(r.name); (g[p] || (g[p] = [])).push(r); });
  return POD_ORDER.filter(p => g[p] && g[p].length).map(p => ({ pod: p, recs: g[p] }));
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
      .rec-filters { background:#d7e5fb; border:1px solid #b0ccf2; border-radius:12px; padding:14px 18px; margin-bottom:18px;
        display:flex; flex-wrap:wrap; align-items:center; gap:14px; box-shadow:0 1px 2px rgba(15,23,42,0.06); }
      .rec-filters select, .rec-filters input[type=date], .rec-filters input[type=text] {
        appearance:none; -webkit-appearance:none; height:34px; padding:0 11px; border:1px solid var(--border);
        border-radius:8px; font-size:12px; font-weight:500; background:var(--card); color:var(--text); }
      .rec-filters select { padding-right:28px; cursor:pointer;
        background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%2364748b' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
        background-repeat:no-repeat; background-position:right 10px center; }
      .rec-filters select:hover, .rec-filters input:hover { border-color:var(--muted); }
      .rec-filters select:focus, .rec-filters input:focus { outline:none; border-color:var(--accent); box-shadow:0 0 0 3px rgba(37,99,235,0.12); }
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
    </style>

    <h2 class="section-title">Recruiter Efficiency</h2>
    <p class="sub-note" style="margin-top:-8px;">Grouped by <strong>pod</strong> (set in Admin → Recruiter → Pod Mapping). Click a pod to expand its recruiters. Date filter drives <strong>Submission Velocity</strong>.</p>
    <div class="rec-filters">
      <div class="fchip"><span class="lbl">POD</span><select id="recPod"><option value="">All</option>${POD_ORDER.map(p => `<option value="${p}">${p}</option>`).join('')}</select></div>
      <div class="fchip"><span class="lbl">Recruiter</span><input type="text" id="recNameFilter" placeholder="Name…" style="width:150px"></div>
      <div class="fchip"><label class="opt"><input type="checkbox" id="recHideZero" checked> Hide zero-app</label></div>
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
      <button class="rec-subtab" data-tab="fulfilment">Position Fulfilment</button>
      <button class="rec-subtab" data-tab="sourcing">Sourcing Mix</button>
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
      <p class="sub-note">Targets are manual (saved to this browser). <strong>Non-Sales</strong> pods are measured on <strong>Offers</strong>; the <strong>Sales</strong> pod on <strong>Hires</strong>.</p>
      <div class="chart-wrap" style="height:280px"><canvas id="recFulfilChart"></canvas></div>

      <h4 style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.04em;margin:14px 0 6px">Non-Sales — Offer Fulfilment</h4>
      <div class="scroll-table"><table>
        <thead><tr><th style="min-width:220px">Pod / Recruiter</th><th>Offer Target</th><th>Offered</th><th>Gap</th></tr></thead>
        <tbody id="recFulfilOfferBody"></tbody>
      </table></div>

      <h4 style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.04em;margin:18px 0 6px">Sales — Hire Fulfilment</h4>
      <div class="scroll-table"><table>
        <thead><tr><th style="min-width:220px">Pod / Recruiter</th><th>Hire Target</th><th>Hired</th><th>Gap</th></tr></thead>
        <tbody id="recFulfilHireBody"></tbody>
      </table></div>
    </div>

    <!-- PANEL: Sourcing Mix (skeleton — needs recruiter×source data) -->
    <div class="rec-panel" data-panel="sourcing" style="display:none">
      <p class="sub-note" style="color:var(--orange)">Structure preview — <strong>Pod → Recruiter → Source Category → Source Name → Count</strong> needs the recruiter×source rollup from the pipeline redesign. The chart below shows the current <strong>org-wide</strong> source mix; the per-recruiter breakdown is pending.</p>
      <div class="chart-wrap" style="height:320px"><canvas id="recSourceChart"></canvas></div>
      <div class="scroll-table"><table>
        <thead><tr><th style="min-width:220px">Pod / Recruiter</th><th>Source Category</th><th>Source Name</th><th>Count</th></tr></thead>
        <tbody id="recSourceBody"></tbody>
      </table></div>
    </div>
  `;
}

export function initRecruiterFilters(data) {
  if (!data || !data.recruiters) return;
  const allRecs = data.recruiters;
  const nDate = 7;
  let lastGroups = [], lastRecs = [], activeTab = 'velocity';

  function getFilteredRecs() {
    const nameF = (document.getElementById('recNameFilter')?.value || '').toLowerCase();
    const hideZero = document.getElementById('recHideZero')?.checked;
    const podF = document.getElementById('recPod')?.value || '';
    return allRecs.filter(r => {
      if (hideZero && (r.total || 0) === 0) return false;
      if (nameF && !r.name.toLowerCase().includes(nameF)) return false;
      if (podF && podOf(r.name) !== podF) return false;
      return true;
    });
  }

  function renderAll() {
    const recs = getFilteredRecs();
    const groups = groupByPod(recs);

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
    const screenBody = document.getElementById('recScreenBody');
    if (screenBody) {
      let html = '';
      groups.forEach((G, gi) => {
        html += `<tr class="pod-header" data-g="s${gi}" data-exp="0" style="cursor:pointer;background:var(--border-light)">
          <td style="font-weight:600">${CARET}${G.pod}<span style="color:var(--muted);font-weight:400;font-size:11px;margin-left:6px">${G.recs.length}</span></td>${screenCells(sumStages(G.recs))}</tr>`;
        G.recs.forEach(r => {
          html += `<tr class="leaf" data-g="s${gi}" style="display:none"><td style="padding-left:30px;font-weight:500">${r.name}</td>${screenCells(r)}</tr>`;
        });
      });
      screenBody.innerHTML = html || `<tr><td colspan="10" style="text-align:center;color:var(--muted);padding:16px">No recruiters match the filter.</td></tr>`;
      wirePodTree(screenBody);
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

    function fulfilRows(gs, type, actualKey) {
      let html = '';
      gs.forEach((G, gi) => {
        const target = G.recs.reduce((s, r) => s + targetOf(r.name, type), 0);
        const actual = G.recs.reduce((s, r) => s + (r[actualKey] || 0), 0);
        const gap = actual - target;
        html += `<tr class="pod-header" data-g="${type}${gi}" data-exp="0" style="cursor:pointer;background:var(--border-light)">
          <td style="font-weight:600">${CARET}${G.pod}<span style="color:var(--muted);font-weight:400;font-size:11px;margin-left:6px">${G.recs.length}</span></td>
          <td style="font-weight:600">${target}</td><td>${actual}</td><td class="pod-gap ${gap >= 0 ? 'good' : 'bad'}" data-g="${type}${gi}">${gap}</td></tr>`;
        G.recs.forEach(r => {
          const tv = targetOf(r.name, type);
          const av = r[actualKey] || 0;
          const g = av - tv;
          html += `<tr class="leaf" data-g="${type}${gi}" style="display:none"><td style="padding-left:30px;font-weight:500">${r.name}</td>
            <td><input type="number" min="0" class="rec-target" data-rec="${r.name}" data-type="${type}" data-g="${type}${gi}" value="${tv}" style="width:64px;padding:3px 6px;border:1px solid var(--border);border-radius:4px;font-size:12px"></td>
            <td>${av}</td><td class="rec-gap ${g >= 0 ? 'good' : 'bad'}" data-rec="${r.name}" data-type="${type}">${g}</td></tr>`;
        });
      });
      return html || `<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:16px">No recruiters in this group.</td></tr>`;
    }

    const offerBody = document.getElementById('recFulfilOfferBody');
    const hireBody = document.getElementById('recFulfilHireBody');
    if (offerBody) { offerBody.innerHTML = fulfilRows(nonSalesGroups, 'offer', 'offer'); wirePodTree(offerBody); }
    if (hireBody) { hireBody.innerHTML = fulfilRows(salesGroups, 'hire', 'hired'); wirePodTree(hireBody); }

    // Wire manual target inputs — persist + recompute row gap + pod-header gap.
    document.querySelectorAll('.rec-target').forEach(inp => {
      inp.addEventListener('input', () => {
        const name = inp.dataset.rec, type = inp.dataset.type;
        const val = parseInt(inp.value, 10) || 0;
        saveTarget(name, type, val);
        const r = allRecs.find(x => x.name === name);
        const actual = (type === 'hire' ? (r?.hired || 0) : (r?.offer || 0));
        const gap = actual - val;
        const cell = document.querySelector(`.rec-gap[data-rec="${CSS.escape(name)}"][data-type="${type}"]`);
        if (cell) { cell.textContent = gap; cell.className = 'rec-gap ' + (gap >= 0 ? 'good' : 'bad'); }
        // recompute the pod-header target/gap for this group
        const gid = inp.dataset.g;
        const bodyEl = inp.closest('tbody');
        const leafInputs = [...bodyEl.querySelectorAll(`.rec-target[data-g="${gid}"]`)];
        let tSum = 0, aSum = 0;
        leafInputs.forEach(li => {
          tSum += parseInt(li.value, 10) || 0;
          const rr = allRecs.find(x => x.name === li.dataset.rec);
          aSum += (type === 'hire' ? (rr?.hired || 0) : (rr?.offer || 0));
        });
        const header = bodyEl.querySelector(`tr.pod-header[data-g="${gid}"]`);
        if (header) {
          const tds = header.querySelectorAll('td');
          if (tds[1]) tds[1].textContent = tSum;
          const gcell = header.querySelector('.pod-gap');
          if (gcell) { gcell.textContent = aSum - tSum; gcell.className = 'pod-gap ' + ((aSum - tSum) >= 0 ? 'good' : 'bad'); }
        }
      });
    });

    // ===== Sourcing Mix (skeleton — needs recruiter×source data) =====
    const srcBody = document.getElementById('recSourceBody');
    if (srcBody) {
      let html = '';
      groups.forEach((G, gi) => {
        html += `<tr class="pod-header" data-g="src${gi}" data-exp="0" style="cursor:pointer;background:var(--border-light)">
          <td style="font-weight:600">${CARET}${G.pod}<span style="color:var(--muted);font-weight:400;font-size:11px;margin-left:6px">${G.recs.length}</span></td><td>${DASH}</td><td>${DASH}</td><td>${DASH}</td></tr>`;
        G.recs.forEach(r => {
          html += `<tr class="leaf" data-g="src${gi}" style="display:none"><td style="padding-left:30px;font-weight:500">${r.name}</td><td>${DASH}</td><td>${DASH}</td><td>${DASH}</td></tr>`;
        });
      });
      srcBody.innerHTML = html || `<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:16px">No recruiters match the filter.</td></tr>`;
      wirePodTree(srcBody);
    }

    lastGroups = groups; lastRecs = recs;
    renderActiveChart();
  }

  // ===== Submission Velocity render (Pod -> Recruiter -> Stage; last 30 days of range, descending) =====
  function velDates() {
    const toV = document.getElementById('recVelTo')?.value;
    const fromV = document.getElementById('recVelFrom')?.value;
    const end = toV ? new Date(toV + 'T00:00:00') : new Date();
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
    const groups = groupByPod(recs);
    const dates = velDates();
    const STAGES = [['oa', 'Online Assessment'], ['hm', 'HM Screening'], ['r1', 'R1']];

    if (head) {
      let h = '<tr><th style="min-width:240px">Pod / Recruiter / Stage</th><th>Total - 15 days</th>';
      dates.forEach(d => { h += `<th>${MON[d.getMonth()]} ${d.getDate()}</th>`; });
      h += '<th>Total - 30 days</th></tr>';
      head.innerHTML = h;
    }
    const dashCells = `<td>${DASH}</td>`.repeat(dates.length + 2); // Total-15 + dates + Total-30
    const ncol = dates.length + 3;
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
  const C = { blue: '#2563eb', green: '#0f766e', cyan: '#0891b2', amber: '#b45309', slate: '#64748b' };
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
    const s = lastRecs.reduce((a, r) => ({ hm: a.hm + (r.hm || 0), oa: a.oa + (r.oa || 0), r1: a.r1 + (r.r1 || 0) }), { hm: 0, oa: 0, r1: 0 });
    recScreenChart = new Chart(ctx, { type: 'bar',
      data: { labels: ['HM Screening', 'Online Assessment', 'R1'], datasets: [
        { label: 'Added', data: [s.hm, s.oa, s.r1], backgroundColor: C.blue, borderRadius: 4, barPercentage: 0.7 },
        { label: 'Cleared', data: [s.oa, s.r1, 0], backgroundColor: C.green, borderRadius: 4, barPercentage: 0.7 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: legendSquare() }, scales: { y: gridY, x: gridX } } });
  }
  function buildJoinChart() {
    const ctx = document.getElementById('recJoinChart'); if (!ctx) return;
    if (recJoinChart) recJoinChart.destroy();
    recJoinChart = new Chart(ctx, { type: 'bar',
      data: { labels: podLabels(), datasets: [
        { label: 'Offered', data: lastGroups.map(G => sumBy(G, 'offer')), backgroundColor: C.cyan, borderRadius: 4, barPercentage: 0.7 },
        { label: 'Hired', data: lastGroups.map(G => sumBy(G, 'hired')), backgroundColor: C.green, borderRadius: 4, barPercentage: 0.7 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: legendSquare() }, scales: { y: gridY, x: gridX } } });
  }
  function buildFulfilChart() {
    const ctx = document.getElementById('recFulfilChart'); if (!ctx) return;
    if (recFulfilChart) recFulfilChart.destroy();
    const tgt = lastGroups.map(G => { const type = isSalesPod(G.pod) ? 'hire' : 'offer'; return G.recs.reduce((s, r) => s + targetOf(r.name, type), 0); });
    const act = lastGroups.map(G => sumBy(G, isSalesPod(G.pod) ? 'hired' : 'offer'));
    recFulfilChart = new Chart(ctx, { type: 'bar',
      data: { labels: podLabels(), datasets: [
        { label: 'Target', data: tgt, backgroundColor: C.blue, borderRadius: 4, barPercentage: 0.7 },
        { label: 'Actual', data: act, backgroundColor: C.green, borderRadius: 4, barPercentage: 0.7 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: legendSquare() }, scales: { y: gridY, x: gridX } } });
  }
  function buildSourceChart() {
    const ctx = document.getElementById('recSourceChart'); if (!ctx) return;
    if (recSourceChart) recSourceChart.destroy();
    const srcs = (data.sources || []).filter(s => (s.candidates || 0) > 0);
    const palette = [C.blue, C.green, C.cyan, C.amber, C.slate, '#7c3aed', '#0369a1'];
    recSourceChart = new Chart(ctx, { type: 'doughnut',
      data: { labels: srcs.map(s => s.name), datasets: [{ data: srcs.map(s => s.candidates || 0), backgroundColor: srcs.map((_, i) => palette[i % palette.length]), borderWidth: 2, borderColor: '#fff' }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { position: 'right', labels: { usePointStyle: true, pointStyle: 'rect', boxWidth: 11, boxHeight: 11, padding: 12, font: { size: 12 } } } } } });
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

  // Global filters (apply to all sub-tabs)
  document.getElementById('recNameFilter')?.addEventListener('input', renderAll);
  document.getElementById('recHideZero')?.addEventListener('change', renderAll);
  document.getElementById('recPod')?.addEventListener('change', renderAll);

  // Date filter — drives Submission Velocity's 30-day window
  ['recVelFrom', 'recVelTo'].forEach(id =>
    document.getElementById(id)?.addEventListener('change', () => { renderVelocity(); renderActiveChart(); }));
  ['recVelYear', 'recVelQuarter'].forEach(id =>
    document.getElementById(id)?.addEventListener('change', () => { applyVelYearQuarter(); renderVelocity(); renderActiveChart(); }));
  // default the velocity date filter to current year + current quarter
  const vy = document.getElementById('recVelYear'), vq = document.getElementById('recVelQuarter');
  if (vy) { const nowY = String(new Date().getFullYear()); vy.value = [...vy.options].some(o => o.value === nowY) ? nowY : (vy.options[1] ? vy.options[1].value : ''); }
  if (vq) vq.value = 'Q' + (Math.floor(new Date().getMonth() / 3) + 1);
  applyVelYearQuarter();

  renderAll();
  showTab('velocity');
}
