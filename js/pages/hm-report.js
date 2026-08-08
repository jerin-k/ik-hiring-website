import { getData } from '../data.js';
import { resolveDeptTeam as splitDT } from '../dept-map.js';

const STAGES_ORDER = ['appReview','taScreen','hmReview','oa','r1','r2','r3','r4','r5','refCheck','docSub','offer','hired'];
const STAGE_LABELS = {
  appReview:'App Review', taScreen:'TA Screen', hmReview:'HM Review', oa:'OA',
  r1:'R1', r2:'R2', r3:'R3', r4:'R4', r5:'R5',
  refCheck:'Ref Check', docSub:'Doc Sub', offer:'Offer', hired:'Hired'
};
const TP_KEYS = ['app','ta','hm','oa','r1','r2','r3','r4','r5','rc','ds','offer'];
const TP_LABELS = {
  app:'Application', ta:'TA Screen', hm:'HM Review', oa:'OA',
  r1:'R1', r2:'R2', r3:'R3', r4:'R4', r5:'R5',
  rc:'Ref Check', ds:'Doc Sub', offer:'Offer'
};
const FUNNEL_ORDER = ['taScreen','hmReview','oa','r1','r2','r3','r4','r5','refCheck','docSub','offer','hired'];
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// The HM tab uses Department only (team is intentionally not a dimension here).
// resolveDeptTeam (imported as splitDT) comes from the authoritative Ashby dump in dept-map.js.
const deptOf = v => splitDT(v).dept;
const byDept = (a, b) => a._dept.localeCompare(b._dept) || ((b.total || 0) - (a.total || 0)) || String(a.title || '').localeCompare(String(b.title || ''));

const CARET = '<span class="caret" style="display:inline-block;width:14px;color:var(--muted)">▸</span>';

// YYYY-MM-DD -> "YYYY-QN" (Position Opened Quarter)
function quarterOf(dateStr) {
  if (!dateStr || dateStr.length < 7) return '—';
  const y = dateStr.slice(0, 4), m = parseInt(dateStr.slice(5, 7), 10);
  if (!m) return '—';
  return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
}
// YYYY-MM-DD -> "Mon YYYY" (joining month)
function monthOf(dateStr) {
  if (!dateStr || dateStr.length < 7) return '—';
  const y = dateStr.slice(0, 4), m = parseInt(dateStr.slice(5, 7), 10);
  if (!m) return '—';
  return `${MON[m - 1]} ${y}`;
}

function pctClass(val) {
  const n = parseFloat(val);
  if (isNaN(n)) return '';
  return n >= 70 ? 'good' : n >= 40 ? 'pct' : n >= 20 ? 'warn' : 'bad';
}
function pctCell(num, den) {
  const p = den > 0 ? ((num / den) * 100).toFixed(1) : '—';
  return `<span class="${pctClass(p)}">${p}${p !== '—' ? '%' : ''}</span>`;
}
function zv(v) { return v > 0 ? v : '<span class="zero">0</span>'; }
function cnt(n) { return `<span style="color:var(--muted);font-weight:400;font-size:11px;margin-left:6px">${n}</span>`; }

function computeThroughput(p, total) {
  const stages = ['taScreen','hmReview','oa','r1','r2','r3','r4','r5','refCheck','docSub','offer','hired'];
  const cum = {};
  let running = 0;
  for (let i = stages.length - 1; i >= 0; i--) { running += (p[stages[i]] || 0); cum[stages[i]] = running; }
  return {
    app:   { i: total,              o: cum.taScreen || 0 },
    ta:    { i: cum.taScreen || 0,  o: cum.hmReview || 0 },
    hm:    { i: cum.hmReview || 0,  o: cum.oa || 0 },
    oa:    { i: cum.oa || 0,        o: cum.r1 || 0 },
    r1:    { i: cum.r1 || 0,        o: cum.r2 || 0 },
    r2:    { i: cum.r2 || 0,        o: cum.r3 || 0 },
    r3:    { i: cum.r3 || 0,        o: cum.r4 || 0 },
    r4:    { i: cum.r4 || 0,        o: cum.r5 || 0 },
    r5:    { i: cum.r5 || 0,        o: cum.refCheck || 0 },
    rc:    { i: cum.refCheck || 0,  o: cum.docSub || 0 },
    ds:    { i: cum.docSub || 0,    o: cum.offer || 0 },
    offer: { i: cum.offer || 0,     o: cum.hired || 0 },
    overall: (cum.r1 || 0) > 0 ? (cum.docSub || 0) / (cum.r1 || 1) : null
  };
}

function reachedFunnel(agg) {
  const reached = {};
  let running = 0;
  for (let i = FUNNEL_ORDER.length - 1; i >= 0; i--) { running += (agg[FUNNEL_ORDER[i]] || 0); reached[FUNNEL_ORDER[i]] = running; }
  return FUNNEL_ORDER.map(s => ({ key: s, label: STAGE_LABELS[s], value: reached[s] }));
}

// Draws the numeric value on each bar segment (skips segments too small to fit).
const valueLabels = {
  id: 'valueLabels',
  afterDatasetsDraw(chart) {
    const ctx = chart.ctx;
    ctx.save();
    ctx.font = "600 10px -apple-system, system-ui, sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    chart.data.datasets.forEach((ds, di) => {
      const meta = chart.getDatasetMeta(di);
      if (meta.hidden) return;
      meta.data.forEach((el, i) => {
        const raw = ds.data[i];
        const val = Array.isArray(raw) ? Math.round(raw[1] - raw[0]) : raw;
        if (!val) return;
        const props = el.getProps(['x', 'y', 'base', 'horizontal'], true);
        let cx, cy, segLen;
        if (props.horizontal) {
          cx = (el.x + props.base) / 2; cy = el.y;
          segLen = Math.abs(el.x - props.base);
          if (segLen < String(val).length * 7 + 4) return;
        } else {
          cx = el.x; cy = (el.y + props.base) / 2;
          segLen = Math.abs(el.y - props.base);
          if (segLen < 13) return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillText(val, cx, cy);
      });
    });
    ctx.restore();
  }
};

// Collapse/expand a 2-level Department -> leaf tree. dept-header rows have data-g; leaf rows have data-g.
function wireTree(tbody) {
  const expandAll = document.getElementById('hmExpandAll')?.checked;
  tbody.querySelectorAll('tr.dept-header').forEach(h => {
    if (expandAll) {
      h.dataset.exp = '1';
      const c = h.querySelector('.caret'); if (c) c.textContent = '▾';
      tbody.querySelectorAll(`tr.leaf[data-g="${h.dataset.g}"]`).forEach(r => { r.style.display = ''; });
    }
    h.addEventListener('click', () => {
      const gi = h.dataset.g;
      const exp = h.dataset.exp === '1';
      h.dataset.exp = exp ? '0' : '1';
      const c = h.querySelector('.caret'); if (c) c.textContent = exp ? '▸' : '▾';
      tbody.querySelectorAll(`tr.leaf[data-g="${gi}"]`).forEach(r => { r.style.display = exp ? 'none' : ''; });
    });
  });
}

export function renderHmReport(data) {
  if (!data || !data.jobs) return '<p>No data available.</p>';

  const allDepts = [...new Set([...(data.openings || []), ...(data.jobs || [])].map(x => deptOf(x.department)))].filter(Boolean).sort();
  const years = [...new Set((data.openings || []).map(o => (o.openedAt || '').slice(0, 4)).filter(Boolean))].sort().reverse();
  const jpMonths = [...new Set((data.joiningPendingCases || []).map(c => monthOf(c.doj)).filter(m => m && m !== '—'))];

  return `
    <style>
      .hm-filters select, .hm-filters input[type=date] {
        appearance:none; -webkit-appearance:none;
        height:34px; padding:0 30px 0 11px; border:1px solid var(--border); border-radius:8px;
        font-size:12px; font-weight:500; background:var(--card); color:var(--text); cursor:pointer;
      }
      .hm-filters input[type=date] { padding-right:11px; }
      .hm-filters select {
        background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%2364748b' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
        background-repeat:no-repeat; background-position:right 11px center;
      }
      .hm-filters select:hover, .hm-filters input[type=date]:hover { border-color:var(--muted); }
      .hm-filters select:focus, .hm-filters input[type=date]:focus { outline:none; border-color:var(--accent); box-shadow:0 0 0 3px rgba(37,99,235,0.12); }
      .hm-filters .fchip { display:flex; align-items:center; gap:7px; }
      .hm-filters .fchip > span.lbl { font-size:11px; font-weight:700; color:var(--accent); text-transform:uppercase; letter-spacing:0.04em; }
      .hm-filters .fchip > label.opt { font-size:12px; font-weight:500; display:flex; align-items:center; gap:4px; cursor:pointer; }
      .hm-filters .fdiv { width:1px; align-self:stretch; background:#cdddf7; margin:2px 2px; }
      .hm-report table td, .hm-report table th { vertical-align:middle; }

      /* sub-tabs */
      .hm-subtabs { display:flex; gap:2px; border-bottom:1px solid var(--border); margin-bottom:22px; }
      .hm-subtab { appearance:none; background:none; border:none; padding:9px 16px; font-size:13px; font-weight:500;
        color:var(--muted); cursor:pointer; border-bottom:2px solid transparent; margin-bottom:-1px; }
      .hm-subtab:hover { color:var(--text); }
      .hm-subtab.active { color:var(--accent); border-bottom-color:var(--accent); font-weight:600; }

      /* even, compact numeric columns for the Department Summary table */
      .hm-report .hm-summary { width:auto; min-width:min(100%,720px); }
      .hm-report .hm-summary th:first-child, .hm-report .hm-summary td:first-child { text-align:left; width:340px; }
      .hm-report .hm-summary th:not(:first-child), .hm-report .hm-summary td:not(:first-child) {
        text-align:right; width:96px; white-space:nowrap; font-variant-numeric:tabular-nums; }

      /* tidy, evenly spaced stage checkbox strip */
      .hm-stages { display:flex; flex-wrap:wrap; align-items:center; gap:8px 16px; margin:2px 0 14px; }
      .hm-stages > span.lbl { font-size:11px; color:var(--muted); }
      .hm-stages label { font-size:11px; display:flex; align-items:center; gap:5px; cursor:pointer; }
    </style>

    <div class="hm-report">
    <!-- ===== GLOBAL PAGE FILTERS ===== -->
    <div class="hm-filters" style="position:sticky;top:0;z-index:5;background:#d7e5fb;border:1px solid #b0ccf2;border-radius:12px;padding:14px 18px;margin-bottom:16px;display:flex;flex-wrap:wrap;align-items:center;gap:14px;box-shadow:0 1px 2px rgba(15,23,42,0.06)">
      <div class="fchip"><span class="lbl">Department</span><select id="hmDept" style="min-width:170px"><option value="">All Departments</option>${allDepts.map(d => `<option value="${d}">${d}</option>`).join('')}</select></div>
      <span class="fdiv"></span>
      <div class="fchip"><span class="lbl">Status</span>
        <label class="opt"><input type="checkbox" class="hm1Status" value="Open" checked> Open</label>
        <label class="opt"><input type="checkbox" class="hm1Status" value="Closed" checked> Closed</label>
      </div>
      <span class="fdiv"></span>
      <div class="fchip"><span class="lbl">From</span><input type="date" id="hmDateFrom"></div>
      <div class="fchip"><span class="lbl">To</span><input type="date" id="hmDateTo"></div>
      <div class="fchip"><span class="lbl">Year</span><select id="hmYear"><option value="">All</option>${years.map(y => `<option value="${y}">${y}</option>`).join('')}</select></div>
      <div class="fchip"><span class="lbl">Quarter</span><select id="hmQuarter"><option value="">All</option><option value="Q1">Q1</option><option value="Q2">Q2</option><option value="Q3">Q3</option><option value="Q4">Q4</option></select></div>
      <label class="opt" style="margin-left:auto;font-size:12px;font-weight:500;display:flex;align-items:center;gap:5px;cursor:pointer;color:var(--accent)"><input type="checkbox" id="hmExpandAll"> Expand all branches</label>
    </div>

    <!-- ===== SUB-TAB STRIP ===== -->
    <div class="hm-subtabs">
      <button class="hm-subtab active" data-tab="positions">Positions</button>
      <button class="hm-subtab" data-tab="throughput">Throughput</button>
      <button class="hm-subtab" data-tab="pipeline">Pipeline</button>
      <button class="hm-subtab" data-tab="panelists">Panelists</button>
    </div>

    <!-- ===== PANEL: POSITIONS ===== -->
    <div class="hm-panel" data-panel="positions">
      <div class="cards" id="hm1Cards"></div>

      <h3 class="subsection-title">Department Summary</h3>
      <p class="sub-note">Click a department to see its roles.</p>
      <div class="filter-bar" style="margin-bottom:10px">
        <div class="ms" id="msHm1Job"></div>
      </div>
      <div class="scroll-table"><table class="hm-summary">
        <thead><tr><th>Department</th><th>Total Positions</th><th>Joined</th><th>Joining Pending</th><th>Open</th></tr></thead>
        <tbody id="hm1Body"></tbody>
      </table></div>

      <div class="chart-wrap" id="hm1ChartWrap" style="height:340px"><canvas id="hm1Chart"></canvas></div>

      <h3 class="subsection-title">Joining Pending — Cases</h3>
      <p class="sub-note">Individual candidates in Ref Check, Documentation, or Offer stage. This table lists everyone currently pending joining — the page date/quarter filter does not apply here.</p>
      <div class="filter-bar">
        <div class="ms" id="msHmJP"></div>
        <select id="hmJPMonth"><option value="">All DOJ Months</option>${jpMonths.map(m => `<option value="${m}">${m}</option>`).join('')}</select>
        <span style="font-size:11px;color:var(--muted)">DOJ</span>
        <input type="date" id="hmJPFrom" title="DOJ from">
        <span style="font-size:11px;color:var(--muted)">to</span>
        <input type="date" id="hmJPTo" title="DOJ to">
      </div>
      <div class="scroll-table"><table>
        <thead><tr><th>Position Opened Quarter</th><th>Department</th><th>Job</th><th>Candidate</th><th>Month</th><th>DOJ</th></tr></thead>
        <tbody id="hmJPBody"></tbody>
      </table></div>
    </div>

    <!-- ===== PANEL: THROUGHPUT ===== -->
    <div class="hm-panel" data-panel="throughput" style="display:none">
      <p class="sub-note" style="color:var(--orange)">Live snapshot — the <strong>Department</strong> filter applies here; the date/quarter filter does not (no per-stage dates in the data yet). Click a department to drill in.</p>
      <p class="sub-note">In = candidates who entered stage (cumulative). Out = candidates who moved past it. Throughput = Out/In %. Overall = R1 In → Doc Submission In.</p>
      <div class="filter-bar">
        <div class="ms" id="msHm2Job"></div>
        <label style="font-size:12px;color:var(--muted);display:flex;align-items:center;gap:4px"><input type="checkbox" id="hm2HideEmpty" checked> Hide zero-pipeline</label>
      </div>
      <div class="hm-stages">
        <span class="lbl">Stages:</span>
        ${TP_KEYS.map(k => `<label><input type="checkbox" class="hm2Stage" value="${k}" checked> ${TP_LABELS[k]}</label>`).join('\n        ')}
      </div>
      <div class="scroll-table"><table id="hm2Table">
        <thead id="hm2Head"></thead>
        <tbody id="hm2Body"></tbody>
      </table></div>

      <h3 class="subsection-title">Stage Throughput (In vs Out)</h3>
      <div class="chart-wrap" style="height:300px"><canvas id="hm2Chart"></canvas></div>

      <h3 class="subsection-title">Pipeline Funnel — Total</h3>
      <p class="sub-note">Candidates who reached each stage, aggregated across the jobs matching the filters above.</p>
      <div class="chart-wrap" id="hm2FunnelWrap" style="height:360px"><canvas id="hm2Funnel"></canvas></div>
    </div>

    <!-- ===== PANEL: PIPELINE ===== -->
    <div class="hm-panel" data-panel="pipeline" style="display:none">
      <p class="sub-note" style="color:var(--orange)">Live snapshot — the <strong>Department</strong> filter applies here; the date/quarter filter does not. Click a department to drill in.</p>
      <div class="filter-bar">
        <div class="ms" id="msHm3Job"></div>
        <label style="font-size:12px;color:var(--muted);display:flex;align-items:center;gap:4px"><input type="checkbox" id="hm3HideEmpty" checked> Hide zero-pipeline</label>
      </div>
      <div class="hm-stages">
        <span class="lbl">Stages:</span>
        ${STAGES_ORDER.map(k => `<label><input type="checkbox" class="hm3Stage" value="${k}" checked> ${STAGE_LABELS[k]}</label>`).join('\n        ')}
      </div>
      <div class="scroll-table"><table id="hm3Table">
        <thead id="hm3Head"></thead>
        <tbody id="hm3Body"></tbody>
      </table></div>
    </div>

    <!-- ===== PANEL: PANELISTS ===== -->
    <div class="hm-panel" data-panel="panelists" style="display:none">
      <p class="sub-note">Interview load and feedback turnaround per panelist. Click a department to expand.</p>
      <div class="scroll-table"><table>
        <thead><tr><th>Department</th><th>Job</th><th>Interview Count</th><th>Avg Time for Feedback</th></tr></thead>
        <tbody id="hmPanelBody"></tbody>
      </table></div>
    </div>
    </div>
  `;
}

let hm1ChartInstance = null;
let hm2ChartInstance = null;
let hm2FunnelInstance = null;

export function initHmFilters(data) {
  if (!data) return;
  const openings = data.openings || [];
  const jobs = data.jobs || [];
  const jobById = {};
  jobs.forEach(j => { jobById[j.id] = j; });

  openings.forEach(o => { o._dept = deptOf(o.department); });
  jobs.forEach(j => { j._dept = deptOf(j.department); });

  // Job-title multi-selects (Positions / Joining Pending / Throughput / Pipeline)
  let msHm1Job = null, msHm2Job = null, msHm3Job = null, msHmJP = null;
  const jobTitles = [...new Set([...openings.map(o => o.title), ...jobs.map(j => j.title), ...((data.joiningPendingCases || []).map(c => c.job))].filter(Boolean))].sort((a, b) => a.localeCompare(b));
  function makeMultiSelect(container, label, options, onChange) {
    if (!container) return null;
    const selected = new Set();
    const labelText = () => selected.size === 0 ? `${label}: All` : (selected.size === 1 ? `${label}: ${[...selected][0]}` : `${label}: ${selected.size} selected`);
    container.classList.add('ms');
    container.innerHTML = `<button type="button" class="ms-btn"></button><div class="ms-panel" style="display:none">${options.map(o => `<label class="ms-opt"><input type="checkbox" value="${String(o).replace(/"/g, '&quot;')}"> ${o}</label>`).join('') || '<span style="font-size:11px;color:var(--muted);padding:4px 8px">No jobs yet</span>'}</div>`;
    const btn = container.querySelector('.ms-btn'), panel = container.querySelector('.ms-panel');
    btn.textContent = labelText();
    btn.addEventListener('click', (e) => { e.stopPropagation(); const open = panel.style.display !== 'none'; document.querySelectorAll('.ms-panel').forEach(p => p.style.display = 'none'); panel.style.display = open ? 'none' : 'block'; });
    panel.addEventListener('click', e => e.stopPropagation());
    container.querySelectorAll('input[type=checkbox]').forEach(cb => cb.addEventListener('change', () => { if (cb.checked) selected.add(cb.value); else selected.delete(cb.value); btn.textContent = labelText(); onChange(); }));
    return { getSelected: () => [...selected] };
  }

  // Joining Pending = Ref Check + Doc Submission + Offer (from the linked job pipeline)
  function jpOf(o) {
    const j = jobById[o.jobId];
    if (j && j.pipeline) { const p = j.pipeline; return (p.refCheck || 0) + (p.docSub || 0) + (p.offer || 0); }
    return o.joiningPending || 0;
  }

  function gDept() { return document.getElementById('hmDept')?.value || ''; }
  function gFrom() { return document.getElementById('hmDateFrom')?.value || ''; }
  function gTo() { return document.getElementById('hmDateTo')?.value || ''; }

  function applyYearQuarter() {
    const y = document.getElementById('hmYear')?.value || '';
    const q = document.getElementById('hmQuarter')?.value || '';
    const fromEl = document.getElementById('hmDateFrom');
    const toEl = document.getElementById('hmDateTo');
    if (!y && !q) return;
    const years = [...new Set(openings.map(o => (o.openedAt || '').slice(0, 4)).filter(Boolean))].sort().reverse();
    const yr = y || years[0] || String(new Date().getFullYear());
    if (q) {
      const qi = parseInt(q.slice(1), 10);
      const sm = (qi - 1) * 3 + 1;
      const em = sm + 2;
      const lastDay = new Date(parseInt(yr, 10), em, 0).getDate();
      fromEl.value = `${yr}-${String(sm).padStart(2, '0')}-01`;
      toEl.value = `${yr}-${String(em).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    } else {
      fromEl.value = `${yr}-01-01`;
      toEl.value = `${yr}-12-31`;
    }
  }

  // ===== Section 1: Positions (Department -> Job tree) =====
  function getSelectedStatuses() {
    const checked = [];
    document.querySelectorAll('.hm1Status').forEach(cb => { if (cb.checked) checked.push(cb.value); });
    return checked;
  }

  function renderSection1() {
    const dateFrom = gFrom(), dateTo = gTo(), deptG = gDept();
    const statuses = getSelectedStatuses();
    const jobSel = msHm1Job ? msHm1Job.getSelected() : [];

    const filtered = openings.filter(o => {
      if (dateFrom && (o.openedAt || '') < dateFrom) return false;
      if (dateTo && (o.openedAt || '') > dateTo) return false;
      if (statuses.length > 0 && statuses.indexOf(o.status || 'Open') === -1) return false;
      if (deptG && o._dept !== deptG) return false;
      if (jobSel.length && !jobSel.includes(o.title)) return false;
      return true;
    });

    const groups = {};
    filtered.forEach(o => {
      if (!groups[o._dept]) groups[o._dept] = { dept: o._dept, total: 0, filled: 0, open: 0, jp: 0, jobs: [] };
      const G = groups[o._dept];
      const jp = jpOf(o);
      G.total += o.total; G.filled += o.filled; G.open += o.open; G.jp += jp;
      G.jobs.push(o);
    });
    const deptArr = Object.values(groups).sort((a, b) => a.dept.localeCompare(b.dept));

    const totals = { total: 0, filled: 0, open: 0, jp: 0 };
    deptArr.forEach(t => { totals.total += t.total; totals.filled += t.filled; totals.open += t.open; totals.jp += t.jp; });

    document.getElementById('hm1Cards').innerHTML = `
      <div class="card"><div class="label">Total Positions</div><div class="value">${totals.total}</div></div>
      <div class="card"><div class="label">Joined</div><div class="value" style="color:var(--green)">${totals.filled}</div></div>
      <div class="card"><div class="label">Joining Pending</div><div class="value" style="color:var(--orange)">${totals.jp}</div><div class="sub">Ref Check + Doc + Offer</div></div>
      <div class="card"><div class="label">Open</div><div class="value" style="color:var(--blue)">${totals.open}</div></div>
    `;

    const metrics = (t, f, jp, op) => `<td style="font-weight:600">${t}</td><td class="good">${f}</td><td style="color:var(--orange)">${jp}</td><td style="color:var(--blue)">${op}</td>`;
    let html = '';
    deptArr.forEach((D, gi) => {
      const jobs2 = [...D.jobs].sort(byDept);
      html += `<tr class="dept-header" data-g="${gi}" data-exp="0" style="cursor:pointer;background:var(--border-light)">
        <td style="font-weight:600">${CARET}${D.dept}${cnt(jobs2.length)}</td>${metrics(D.total, D.filled, D.jp, D.open)}</tr>`;
      jobs2.forEach(o => {
        html += `<tr class="leaf" data-g="${gi}" style="display:none">
          <td style="padding-left:30px;font-weight:500;max-width:360px">${o.title}</td>${metrics(o.total, o.filled, jpOf(o), o.open)}</tr>`;
      });
    });
    html += `<tr class="totals-row"><td>Total</td>${metrics(totals.total, totals.filled, totals.jp, totals.open)}</tr>`;
    const body = document.getElementById('hm1Body');
    body.innerHTML = html;
    wireTree(body);

    // Chart: department-wise stacked bar with value labels
    const cDepts = deptArr.map(t => t.dept).slice().reverse();
    if (hm1ChartInstance) hm1ChartInstance.destroy();
    const ctx1 = document.getElementById('hm1Chart');
    if (ctx1) {
      const h = Math.max(220, cDepts.length * 38 + 60);
      const wrap = document.getElementById('hm1ChartWrap');
      if (wrap) wrap.style.height = h + 'px';
      ctx1.style.maxHeight = h + 'px';   // override .chart-wrap canvas { max-height:300px } so the canvas fills the wrap
      hm1ChartInstance = new Chart(ctx1, {
        type: 'bar',
        data: {
          labels: cDepts,
          datasets: [
            { label: 'Joined', data: cDepts.map(d => groups[d].filled), backgroundColor: '#0f766e', borderRadius: 4, barPercentage: 0.7 },
            { label: 'Joining Pending', data: cDepts.map(d => groups[d].jp), backgroundColor: '#0891b2', borderRadius: 4, barPercentage: 0.7 },
            { label: 'Open', data: cDepts.map(d => groups[d].open), backgroundColor: '#2563eb', borderRadius: 4, barPercentage: 0.7 }
          ]
        },
        options: {
          indexAxis: 'y', responsive: true, maintainAspectRatio: false,
          layout: { padding: { top: 4 } },
          plugins: { legend: { position: 'top', align: 'center', labels: { usePointStyle: true, pointStyle: 'rect', boxWidth: 11, boxHeight: 11, padding: 18, font: { size: 12 } } } },
          scales: {
            x: { stacked: true, beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 11 } }, title: { display: true, text: 'Positions / Candidates', font: { size: 11 }, color: '#64748b' } },
            y: { stacked: true, grid: { display: false }, ticks: { font: { size: 12, weight: '500' }, padding: 6 } }
          }
        },
        plugins: [valueLabels]
      });
    }
  }

  // ===== Section 2: Throughput (Department -> Job tree) =====
  function renderThroughput() {
    const deptG = gDept();
    const jobSel = msHm2Job ? msHm2Job.getSelected() : [];
    const hideEmpty = document.getElementById('hm2HideEmpty')?.checked;
    const visStages = [];
    document.querySelectorAll('.hm2Stage').forEach(cb => { if (cb.checked) visStages.push(cb.value); });

    const filtered = jobs.filter(j => {
      if (deptG && j._dept !== deptG) return false;
      if (jobSel.length && !jobSel.includes(j.title)) return false;
      if (hideEmpty && j.total === 0) return false;
      if (!j.pipeline) return false;
      return true;
    }).sort(byDept);

    let row1 = '<tr><th rowspan="2">Department</th>';
    let row2 = '<tr>';
    visStages.forEach(s => {
      row1 += `<th colspan="3" class="stage-hdr">${TP_LABELS[s]}</th>`;
      row2 += '<th class="stage-sub">In</th><th class="stage-sub">Out</th><th class="stage-sub">%</th>';
    });
    row1 += '<th rowspan="2" style="background:#e0e7ff;text-align:center">Overall<br>R1→Doc</th></tr>';
    row2 += '</tr>';
    document.getElementById('hm2Head').innerHTML = row1 + row2;

    const tpTotals = {};
    TP_KEYS.forEach(k => { tpTotals[k] = { i: 0, o: 0 }; });
    const groups = {};
    filtered.forEach(j => {
      const t = computeThroughput(j.pipeline, j.total);
      TP_KEYS.forEach(k => { tpTotals[k].i += t[k].i; tpTotals[k].o += t[k].o; });
      if (!groups[j._dept]) groups[j._dept] = [];
      groups[j._dept].push({ job: j, t });
    });

    function aggTP(list) {
      const acc = {}; TP_KEYS.forEach(k => acc[k] = { i: 0, o: 0 });
      list.forEach(({ t }) => TP_KEYS.forEach(k => { acc[k].i += t[k].i; acc[k].o += t[k].o; }));
      acc.overall = acc.r1.i > 0 ? acc.ds.i / acc.r1.i : null;
      return acc;
    }
    function tpCells(per) {
      let s = '';
      visStages.forEach(sk => {
        const c = per[sk]; const cls = c.i === 0 ? 'zero' : '';
        s += `<td class="stage-cell stage-first ${cls}">${zv(c.i)}</td><td class="stage-cell ${cls}">${zv(c.o)}</td><td class="stage-cell">${pctCell(c.o, c.i)}</td>`;
      });
      const ov = per.overall != null ? (per.overall * 100).toFixed(1) + '%' : '—';
      s += `<td class="stage-cell" style="background:#f0f0ff;font-weight:600"><span class="${pctClass(ov)}">${ov}</span></td>`;
      return s;
    }

    let html = '';
    Object.keys(groups).sort().forEach((deptName, gi) => {
      const list = groups[deptName];
      html += `<tr class="dept-header" data-g="${gi}" data-exp="0" style="cursor:pointer;background:var(--border-light)">
        <td style="font-weight:600">${CARET}${deptName}${cnt(list.length)}</td>${tpCells(aggTP(list))}</tr>`;
      list.forEach(({ job, t }) => {
        html += `<tr class="leaf" data-g="${gi}" style="display:none">
          <td style="font-weight:500;max-width:300px;padding-left:30px">${job.title}</td>${tpCells(t)}</tr>`;
      });
    });
    const allList = [];
    Object.values(groups).forEach(l => allList.push(...l));
    html += `<tr class="totals-row"><td>Total</td>${tpCells(aggTP(allList))}</tr>`;
    const hm2Body = document.getElementById('hm2Body');
    hm2Body.innerHTML = html;
    wireTree(hm2Body);

    // Chart 1: In vs Out by stage (Application excluded, labelled)
    const chartLabels = [], chartIn = [], chartOut = [];
    visStages.filter(sk => sk !== 'app').forEach(sk => {
      chartLabels.push(TP_LABELS[sk]); chartIn.push(tpTotals[sk].i); chartOut.push(tpTotals[sk].o);
    });
    if (hm2ChartInstance) hm2ChartInstance.destroy();
    const ctx2 = document.getElementById('hm2Chart');
    if (ctx2) {
      hm2ChartInstance = new Chart(ctx2, {
        type: 'bar',
        data: { labels: chartLabels, datasets: [
          { label: 'In', data: chartIn, backgroundColor: '#2563eb', borderRadius: 4, barPercentage: 0.75 },
          { label: 'Out', data: chartOut, backgroundColor: '#0f766e', borderRadius: 4, barPercentage: 0.75 }
        ] },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: 'top', align: 'center', labels: { usePointStyle: true, pointStyle: 'rect', boxWidth: 11, boxHeight: 11, padding: 18, font: { size: 12 } } } },
          scales: { y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 11 } } }, x: { grid: { display: false }, ticks: { font: { size: 11 } } } }
        },
        plugins: [valueLabels]
      });
    }

    // Chart 2: aggregate reached-stage funnel
    const agg = {};
    filtered.forEach(j => { Object.keys(j.pipeline).forEach(k => { agg[k] = (agg[k] || 0) + (j.pipeline[k] || 0); }); });
    const funnel = reachedFunnel(agg);
    if (hm2FunnelInstance) hm2FunnelInstance.destroy();
    const ctxF = document.getElementById('hm2Funnel');
    if (ctxF) {
      hm2FunnelInstance = new Chart(ctxF, {
        type: 'bar',
        data: { labels: funnel.map(f => f.label), datasets: [{
          label: 'Reached', data: funnel.map(f => [-f.value / 2, f.value / 2]),
          backgroundColor: '#0f766e', borderRadius: 3, barPercentage: 0.85
        }] },
        options: {
          indexAxis: 'y', responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => 'Reached: ' + Math.round(c.raw[1] - c.raw[0]) } } },
          scales: { x: { display: false, grid: { display: false } }, y: { grid: { display: false }, ticks: { font: { size: 12, weight: '500' }, padding: 6 } } }
        },
        plugins: [valueLabels]
      });
    }
  }

  // ===== Panelist Dashboard (Department -> Panelist; pending pipeline data) =====
  function renderPanelist() {
    const body = document.getElementById('hmPanelBody');
    if (!body) return;
    const deptG = gDept();
    let list = (data.panelists || []).map(p => ({ ...p, _dept: deptOf(p.department || '') }));
    list = list.filter(p => !deptG || p._dept === deptG);
    if (!list.length) {
      body.innerHTML = `<tr><td colspan="4" style="padding:24px;text-align:center;color:var(--muted);font-size:12px">Data not yet available — needs per-interview panelist data (interview counts + feedback turnaround) from the pipeline redesign.</td></tr>`;
      return;
    }
    const groups = {};
    list.forEach(p => { if (!groups[p._dept]) groups[p._dept] = []; groups[p._dept].push(p); });
    let html = '';
    Object.keys(groups).sort().forEach((dept, gi) => {
      const arr = groups[dept];
      const deptCount = arr.reduce((a, p) => a + (p.interviewCount || 0), 0);
      html += `<tr class="dept-header" data-g="${gi}" data-exp="0" style="cursor:pointer;background:var(--border-light)">
        <td style="font-weight:600">${CARET}${dept}${cnt(arr.length)}</td><td></td><td style="font-weight:600">${deptCount}</td><td></td></tr>`;
      arr.forEach(p => {
        html += `<tr class="leaf" data-g="${gi}" style="display:none">
          <td style="padding-left:30px;font-weight:500">${p.panelist || p.name || ''}</td>
          <td style="max-width:300px">${p.job || ''}</td><td>${p.interviewCount || 0}</td><td>${p.avgFeedbackTime || p.avgFeedback || '—'}</td></tr>`;
      });
    });
    body.innerHTML = html;
    wireTree(body);
  }

  // ===== Joining Pending — Cases (candidate-level; pending pipeline data) =====
  // Global date/quarter filter intentionally NOT applied here (always show all pending joiners).
  // Local filters: Job title, DOJ Month, DOJ date range. Department still cascades.
  function renderJoiningPending() {
    const body = document.getElementById('hmJPBody');
    if (!body) return;
    const deptG = gDept();
    const jobSel = msHmJP ? msHmJP.getSelected() : [];
    const monthF = document.getElementById('hmJPMonth')?.value || '';
    const dojFrom = document.getElementById('hmJPFrom')?.value || '';
    const dojTo = document.getElementById('hmJPTo')?.value || '';

    let list = (data.joiningPendingCases || []).map(c => ({ ...c, _dept: deptOf(c.department || '') }));
    list = list.filter(c => {
      if (deptG && c._dept !== deptG) return false;
      if (jobSel.length && !jobSel.includes(c.job)) return false;
      if (monthF && monthOf(c.doj) !== monthF) return false;
      if (dojFrom && (c.doj || '') < dojFrom) return false;
      if (dojTo && (c.doj || '') > dojTo) return false;
      return true;
    });
    if (!list.length) {
      body.innerHTML = `<tr><td colspan="6" style="padding:24px;text-align:center;color:var(--muted);font-size:12px">Data not yet available — needs candidate-level joining data (Name + DOJ) from the pipeline redesign.</td></tr>`;
      return;
    }
    list.sort((a, b) => (a._dept || '').localeCompare(b._dept || '') || (a.doj || '').localeCompare(b.doj || ''));
    body.innerHTML = list.map(c => `<tr>
      <td>${quarterOf(c.openedAt || c.positionOpenedAt || '')}</td>
      <td style="font-weight:500">${c._dept || ''}</td>
      <td style="max-width:300px">${c.job || ''}</td>
      <td style="font-weight:500">${c.name || ''}</td>
      <td>${monthOf(c.doj)}</td><td>${c.doj || '—'}</td>
    </tr>`).join('');
  }

  // ===== Section 3: Current Pipeline (Department -> Job tree) =====
  function renderPipeline() {
    const deptG = gDept();
    const jobSel = msHm3Job ? msHm3Job.getSelected() : [];
    const hideEmpty = document.getElementById('hm3HideEmpty')?.checked;
    const visStages = [];
    document.querySelectorAll('.hm3Stage').forEach(cb => { if (cb.checked) visStages.push(cb.value); });

    const filtered = jobs.filter(j => {
      if (deptG && j._dept !== deptG) return false;
      if (jobSel.length && !jobSel.includes(j.title)) return false;
      if (hideEmpty && j.total === 0) return false;
      if (!j.pipeline) return false;
      return true;
    }).sort(byDept);

    let hdr = '<tr><th>Department</th><th>Total</th>';
    visStages.forEach(s => { hdr += `<th>${STAGE_LABELS[s]}</th>`; });
    hdr += '</tr>';
    document.getElementById('hm3Head').innerHTML = hdr;

    const stageTotalsAll = {}; visStages.forEach(s => { stageTotalsAll[s] = 0; });
    let grandTotal = 0;
    const groups = {};
    filtered.forEach(j => {
      grandTotal += j.total;
      visStages.forEach(k => { stageTotalsAll[k] += (j.pipeline[k] || 0); });
      if (!groups[j._dept]) groups[j._dept] = { total: 0, stages: {}, jobs: [] };
      const G = groups[j._dept]; G.total += j.total;
      visStages.forEach(k => { G.stages[k] = (G.stages[k] || 0) + (j.pipeline[k] || 0); });
      G.jobs.push(j);
    });

    function pipeCells(total, stages) {
      let s = `<td style="font-weight:600">${total}</td>`;
      visStages.forEach(k => {
        const v = stages[k] || 0; let style = '';
        if (k === 'hired' && v > 0) style = ' class="good"';
        else if (k === 'offer' && v > 0) style = ' style="color:var(--blue);font-weight:600"';
        else if (v === 0) style = ' class="zero"';
        s += `<td${style}>${v}</td>`;
      });
      return s;
    }

    let html = '';
    Object.keys(groups).sort().forEach((deptName, gi) => {
      const G = groups[deptName];
      html += `<tr class="dept-header" data-g="${gi}" data-exp="0" style="cursor:pointer;background:var(--border-light)">
        <td style="font-weight:600">${CARET}${deptName}${cnt(G.jobs.length)}</td>${pipeCells(G.total, G.stages)}</tr>`;
      G.jobs.forEach(j => {
        html += `<tr class="leaf" data-g="${gi}" style="display:none">
          <td style="font-weight:500;max-width:300px;padding-left:30px">${j.title}</td>${pipeCells(j.total, j.pipeline)}</tr>`;
      });
    });
    html += `<tr class="totals-row"><td>Total</td>${pipeCells(grandTotal, stageTotalsAll)}</tr>`;
    const hm3Body = document.getElementById('hm3Body');
    hm3Body.innerHTML = html;
    wireTree(hm3Body);
  }

  // ===== Sub-tab switching =====
  // Charts are built only when their panel is visible (Chart.js needs real dimensions),
  // so we (re)render the active panel on tab switch and on any global filter change.
  let activeTab = 'positions';
  function renderActive() {
    if (activeTab === 'positions') { renderSection1(); renderJoiningPending(); }
    else if (activeTab === 'throughput') renderThroughput();
    else if (activeTab === 'pipeline') renderPipeline();
    else if (activeTab === 'panelists') renderPanelist();
  }
  function showTab(name) {
    activeTab = name;
    document.querySelectorAll('.hm-subtab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.hm-panel').forEach(p => { p.style.display = p.dataset.panel === name ? '' : 'none'; });
    renderActive();
  }
  document.querySelectorAll('.hm-subtab').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));

  // Global filter listeners — re-render the active panel (others refresh when next shown)
  document.getElementById('hmDept')?.addEventListener('change', renderActive);
  document.getElementById('hmDateFrom')?.addEventListener('change', renderActive);
  document.getElementById('hmDateTo')?.addEventListener('change', renderActive);
  document.getElementById('hmYear')?.addEventListener('change', () => { applyYearQuarter(); renderActive(); });
  document.getElementById('hmQuarter')?.addEventListener('change', () => { applyYearQuarter(); renderActive(); });
  document.querySelectorAll('.hm1Status').forEach(cb => cb.addEventListener('change', renderActive));
  document.getElementById('hmExpandAll')?.addEventListener('change', renderActive);

  // Job-title multi-selects (build + wire) — one per section
  msHm1Job = makeMultiSelect(document.getElementById('msHm1Job'), 'Job', jobTitles, renderSection1);
  msHmJP = makeMultiSelect(document.getElementById('msHmJP'), 'Job', jobTitles, renderJoiningPending);
  msHm2Job = makeMultiSelect(document.getElementById('msHm2Job'), 'Job', jobTitles, renderThroughput);
  msHm3Job = makeMultiSelect(document.getElementById('msHm3Job'), 'Job', jobTitles, renderPipeline);
  document.addEventListener('click', () => document.querySelectorAll('.ms-panel').forEach(p => p.style.display = 'none'));
  // Joining Pending local listeners
  document.getElementById('hmJPMonth')?.addEventListener('change', renderJoiningPending);
  document.getElementById('hmJPFrom')?.addEventListener('change', renderJoiningPending);
  document.getElementById('hmJPTo')?.addEventListener('change', renderJoiningPending);
  // Throughput-local listeners
  document.getElementById('hm2HideEmpty')?.addEventListener('change', renderThroughput);
  document.querySelectorAll('.hm2Stage').forEach(cb => cb.addEventListener('change', renderThroughput));
  // Pipeline-local listeners
  document.getElementById('hm3HideEmpty')?.addEventListener('change', renderPipeline);
  document.querySelectorAll('.hm3Stage').forEach(cb => cb.addEventListener('change', renderPipeline));

  // Default the period filter to the current year + current quarter
  const nowY = String(new Date().getFullYear());
  const nowQ = 'Q' + (Math.floor(new Date().getMonth() / 3) + 1);
  const yearSel = document.getElementById('hmYear');
  const qSel = document.getElementById('hmQuarter');
  if (yearSel) {
    const hasNow = [...yearSel.options].some(o => o.value === nowY);
    yearSel.value = hasNow ? nowY : (yearSel.options[1] ? yearSel.options[1].value : '');
  }
  if (qSel) qSel.value = nowQ;
  applyYearQuarter();

  showTab('positions');
}
