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
// Reached-stage funnel order (excludes raw Application intake)
const FUNNEL_ORDER = ['taScreen','hmReview','oa','r1','r2','r3','r4','r5','refCheck','docSub','offer','hired'];

// Department/Team resolution lives in ../dept-map.js (the authoritative Ashby dump),
// imported above as splitDT.
const byDeptTeam = (a, b) =>
  a._dept.localeCompare(b._dept) || a._team.localeCompare(b._team) ||
  ((b.total || 0) - (a.total || 0)) || String(a.title || '').localeCompare(String(b.title || ''));

function pctClass(val) {
  const n = parseFloat(val);
  if (isNaN(n)) return '';
  return n >= 70 ? 'good' : n >= 40 ? 'pct' : n >= 20 ? 'warn' : 'bad';
}
function pctCell(num, den) {
  const p = den > 0 ? ((num / den) * 100).toFixed(1) : '—';
  const c = pctClass(p);
  return `<span class="${c}">${p}${p !== '—' ? '%' : ''}</span>`;
}
function zv(v) { return v > 0 ? v : '<span class="zero">0</span>'; }

function computeThroughput(p, total) {
  const stages = ['taScreen','hmReview','oa','r1','r2','r3','r4','r5','refCheck','docSub','offer','hired'];
  const cum = {};
  let running = 0;
  for (let i = stages.length - 1; i >= 0; i--) {
    running += (p[stages[i]] || 0);
    cum[stages[i]] = running;
  }

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

// Reached count per stage = cumulative reverse-sum of an aggregated pipeline object
function reachedFunnel(agg) {
  const reached = {};
  let running = 0;
  for (let i = FUNNEL_ORDER.length - 1; i >= 0; i--) {
    running += (agg[FUNNEL_ORDER[i]] || 0);
    reached[FUNNEL_ORDER[i]] = running;
  }
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

// Wires collapse/expand for a dept -> team -> leaf tree table body.
// Rows use: class dept-header|team-header|leaf, data-g (dept index), data-tg (team key), data-exp.
function wireTree(tbody) {
  tbody.querySelectorAll('tr.dept-header').forEach(h => {
    h.addEventListener('click', () => {
      const gi = h.dataset.g;
      const exp = h.dataset.exp === '1';
      h.dataset.exp = exp ? '0' : '1';
      const c = h.querySelector('.caret'); if (c) c.textContent = exp ? '▸' : '▾';
      tbody.querySelectorAll(`tr[data-g="${gi}"]`).forEach(r => {
        if (r === h) return;
        r.style.display = exp ? 'none' : '';
      });
      if (!exp) {
        tbody.querySelectorAll(`tr.team-header[data-g="${gi}"]`).forEach(t => {
          t.dataset.exp = '1';
          const tc = t.querySelector('.caret'); if (tc) tc.textContent = '▾';
        });
      }
    });
  });
  tbody.querySelectorAll('tr.team-header').forEach(h => {
    h.addEventListener('click', (e) => {
      e.stopPropagation();
      const tg = h.dataset.tg;
      const exp = h.dataset.exp === '1';
      h.dataset.exp = exp ? '0' : '1';
      const c = h.querySelector('.caret'); if (c) c.textContent = exp ? '▸' : '▾';
      tbody.querySelectorAll(`tr.leaf[data-tg="${tg}"]`).forEach(r => { r.style.display = exp ? 'none' : ''; });
    });
  });
}

export function renderHmReport(data) {
  if (!data || !data.jobs) return '<p>No data available.</p>';

  const openings = (data.openings || []).map(o => { const dt = splitDT(o.department); return { d: dt.dept, t: dt.team }; });
  const jobs = (data.jobs || []).map(j => { const dt = splitDT(j.department); return { d: dt.dept, t: dt.team }; });
  const allDepts = [...new Set([...openings, ...jobs].map(x => x.d))].filter(Boolean).sort();
  const allTeams = [...new Set([...openings, ...jobs].map(x => x.t))].filter(Boolean).sort();
  const years = [...new Set((data.openings || []).map(o => (o.openedAt || '').slice(0, 4)).filter(Boolean))].sort().reverse();

  return `
    <!-- ===== GLOBAL PAGE FILTERS ===== -->
    <div class="hm-global-filters" style="position:sticky;top:0;z-index:5;background:var(--card);border:1px solid var(--border);border-radius:8px;padding:12px 14px;margin-bottom:20px;display:flex;flex-wrap:wrap;align-items:center;gap:10px;">
      <span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:var(--muted);margin-right:2px">Filters</span>
      <select id="hmDept"><option value="">All Departments</option>${allDepts.map(d => `<option value="${d}">${d}</option>`).join('')}</select>
      <select id="hmTeam"><option value="">All Teams</option>${allTeams.map(t => `<option value="${t}">${t}</option>`).join('')}</select>
      <span style="border-left:1px solid var(--border);height:24px;margin:0 2px"></span>
      <label style="font-size:11px;color:var(--muted)">From <input type="date" id="hmDateFrom" style="padding:5px 8px;border:1px solid var(--border);border-radius:6px;font-size:12px"></label>
      <label style="font-size:11px;color:var(--muted)">To <input type="date" id="hmDateTo" style="padding:5px 8px;border:1px solid var(--border);border-radius:6px;font-size:12px"></label>
      <span style="border-left:1px solid var(--border);height:24px;margin:0 2px"></span>
      <label style="font-size:11px;color:var(--muted)">Year <select id="hmYear"><option value="">All</option>${years.map(y => `<option value="${y}">${y}</option>`).join('')}</select></label>
      <label style="font-size:11px;color:var(--muted)">Quarter <select id="hmQuarter"><option value="">All</option><option value="Q1">Q1</option><option value="Q2">Q2</option><option value="Q3">Q3</option><option value="Q4">Q4</option></select></label>
      <span id="hmDateScopeNote" style="font-size:10px;color:var(--muted);margin-left:auto">Date/Year/Quarter apply to Positions only (pipeline sections are a live snapshot)</span>
    </div>

    <!-- ===== SECTION 1: POSITIONS ===== -->
    <h2 class="section-title">Positions</h2>
    <div class="filter-bar">
      <span style="font-size:11px;color:var(--muted);margin-right:2px">Status:</span>
      <label style="font-size:12px;display:flex;align-items:center;gap:3px"><input type="checkbox" class="hm1Status" value="Open" checked> Open</label>
      <label style="font-size:12px;display:flex;align-items:center;gap:3px"><input type="checkbox" class="hm1Status" value="Closed" checked> Closed</label>
    </div>

    <div class="cards" id="hm1Cards"></div>

    <h3 class="subsection-title">Department Summary</h3>
    <p class="sub-note">Click a department row to expand or collapse its teams.</p>
    <div class="scroll-table"><table>
      <thead><tr><th>Department</th><th>Team</th><th>Total Positions</th><th>Joined</th><th>Joining Pending</th><th>Open</th></tr></thead>
      <tbody id="hm1DeptBody"></tbody>
    </table></div>

    <div class="chart-wrap" id="hm1ChartWrap" style="height:340px"><canvas id="hm1Chart"></canvas></div>

    <h3 class="subsection-title">Job-wise Detail</h3>
    <div class="filter-bar">
      <input type="text" id="hm1JobFilter" placeholder="Filter by job title..." style="width:220px">
    </div>
    <div class="scroll-table"><table>
      <thead><tr><th>Department</th><th>Team</th><th>Job Title</th><th>Total Positions</th><th>Joined</th><th>Joining Pending</th><th>Open</th></tr></thead>
      <tbody id="hm1JobBody"></tbody>
    </table></div>

    <h3 class="subsection-title">Joining Pending — Cases</h3>
    <p class="sub-note">Individual candidates in Ref Check, Documentation, or Offer stage, by expected date of joining.</p>
    <div class="scroll-table"><table>
      <thead><tr><th>Department</th><th>Team</th><th>DOJ</th><th>Job</th><th>Name</th></tr></thead>
      <tbody id="hmJPBody"></tbody>
    </table></div>

    <hr class="section-divider">

    <!-- ===== SECTION 2: THROUGHPUT ===== -->
    <h2 class="section-title">Job-wise Throughput Report</h2>
    <p class="sub-note">In = candidates who entered stage (cumulative). Out = candidates who moved past it. Throughput = Out/In %. Overall = R1 In → Doc Submission In.</p>
    <div class="filter-bar">
      <input type="text" id="hm2JobFilter" placeholder="Filter by job title..." style="width:220px">
      <label style="font-size:12px;color:var(--muted);display:flex;align-items:center;gap:4px"><input type="checkbox" id="hm2HideEmpty" checked> Hide zero-pipeline</label>
    </div>
    <div class="filter-bar" style="margin-top:-6px">
      <span style="font-size:11px;color:var(--muted);margin-right:2px">Stages:</span>
      ${TP_KEYS.map(k => `<label style="font-size:11px;display:flex;align-items:center;gap:2px"><input type="checkbox" class="hm2Stage" value="${k}" checked> ${TP_LABELS[k]}</label>`).join('\n      ')}
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

    <hr class="section-divider">

    <!-- ===== PANELIST DASHBOARD ===== -->
    <h2 class="section-title">Panelist Dashboard</h2>
    <p class="sub-note">Interview load and feedback turnaround per panelist. Click a department or team row to expand.</p>
    <div class="scroll-table"><table>
      <thead><tr><th>Department</th><th>Team</th><th>Panelist</th><th>Job</th><th>Interview Count</th><th>Avg Time for Feedback</th></tr></thead>
      <tbody id="hmPanelBody"></tbody>
    </table></div>

    <hr class="section-divider">

    <!-- ===== SECTION 3: CURRENT PIPELINE ===== -->
    <h2 class="section-title">Current Stage-wise Pipeline</h2>
    <div class="filter-bar">
      <input type="text" id="hm3JobFilter" placeholder="Filter by job title..." style="width:220px">
      <label style="font-size:12px;color:var(--muted);display:flex;align-items:center;gap:4px"><input type="checkbox" id="hm3HideEmpty" checked> Hide zero-pipeline</label>
    </div>
    <div class="filter-bar" style="margin-top:-6px">
      <span style="font-size:11px;color:var(--muted);margin-right:2px">Stages:</span>
      ${STAGES_ORDER.map(k => `<label style="font-size:11px;display:flex;align-items:center;gap:2px"><input type="checkbox" class="hm3Stage" value="${k}" checked> ${STAGE_LABELS[k]}</label>`).join('\n      ')}
    </div>
    <div class="scroll-table"><table id="hm3Table">
      <thead id="hm3Head"></thead>
      <tbody id="hm3Body"></tbody>
    </table></div>
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

  // Derive real Department / Team from the combined field
  openings.forEach(o => { const dt = splitDT(o.department); o._dept = dt.dept; o._team = dt.team; });
  jobs.forEach(j => { const dt = splitDT(j.department); j._dept = dt.dept; j._team = dt.team; });

  // Joining Pending = Ref Check + Doc Submission + Offer (from the linked job pipeline)
  function jpOf(o) {
    const j = jobById[o.jobId];
    if (j && j.pipeline) {
      const p = j.pipeline;
      return (p.refCheck || 0) + (p.docSub || 0) + (p.offer || 0);
    }
    return o.joiningPending || 0;
  }

  // ---- Global filter accessors ----
  function gDept() { return document.getElementById('hmDept')?.value || ''; }
  function gTeam() { return document.getElementById('hmTeam')?.value || ''; }
  function gFrom() { return document.getElementById('hmDateFrom')?.value || ''; }
  function gTo() { return document.getElementById('hmDateTo')?.value || ''; }

  function applyYearQuarter() {
    const y = document.getElementById('hmYear')?.value || '';
    const q = document.getElementById('hmQuarter')?.value || '';
    const fromEl = document.getElementById('hmDateFrom');
    const toEl = document.getElementById('hmDateTo');
    if (!y && !q) { return; }
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

  // Rebuild Team options to the teams within the selected department
  function repopulateTeams() {
    const dept = gDept();
    const teamSel = document.getElementById('hmTeam');
    if (!teamSel) return;
    const prev = teamSel.value;
    const src = [...openings, ...jobs].filter(x => !dept || x._dept === dept);
    const teams = [...new Set(src.map(x => x._team).filter(Boolean))].sort();
    teamSel.innerHTML = `<option value="">All Teams</option>` + teams.map(t => `<option value="${t}">${t}</option>`).join('');
    if (teams.indexOf(prev) !== -1) teamSel.value = prev;
  }

  // ===== Section 1: Positions =====
  function getSelectedStatuses() {
    const checked = [];
    document.querySelectorAll('.hm1Status').forEach(cb => { if (cb.checked) checked.push(cb.value); });
    return checked;
  }

  function renderSection1() {
    const dateFrom = gFrom(), dateTo = gTo(), deptG = gDept(), teamG = gTeam();
    const statuses = getSelectedStatuses();
    const jobF = (document.getElementById('hm1JobFilter')?.value || '').toLowerCase();

    const filtered = openings.filter(o => {
      if (dateFrom && (o.openedAt || '') < dateFrom) return false;
      if (dateTo && (o.openedAt || '') > dateTo) return false;
      if (statuses.length > 0 && statuses.indexOf(o.status || 'Open') === -1) return false;
      if (deptG && o._dept !== deptG) return false;
      if (teamG && o._team !== teamG) return false;
      return true;
    });

    // Department -> Team rollup
    const deptMap = {}; // dept -> { total, filled, open, jp, teams: {team -> {...}} }
    filtered.forEach(o => {
      if (!deptMap[o._dept]) deptMap[o._dept] = { dept: o._dept, total: 0, filled: 0, open: 0, jp: 0, teams: {} };
      const D = deptMap[o._dept];
      const jp = jpOf(o);
      D.total += o.total; D.filled += o.filled; D.open += o.open; D.jp += jp;
      if (!D.teams[o._team]) D.teams[o._team] = { team: o._team, total: 0, filled: 0, open: 0, jp: 0 };
      const T = D.teams[o._team];
      T.total += o.total; T.filled += o.filled; T.open += o.open; T.jp += jp;
    });
    const deptArr = Object.values(deptMap).sort((a, b) => a.dept.localeCompare(b.dept));

    const totals = { total: 0, filled: 0, open: 0, jp: 0 };
    deptArr.forEach(t => { totals.total += t.total; totals.filled += t.filled; totals.open += t.open; totals.jp += t.jp; });

    document.getElementById('hm1Cards').innerHTML = `
      <div class="card"><div class="label">Total Positions</div><div class="value">${totals.total}</div></div>
      <div class="card"><div class="label">Joined</div><div class="value" style="color:var(--green)">${totals.filled}</div></div>
      <div class="card"><div class="label">Joining Pending</div><div class="value" style="color:var(--orange)">${totals.jp}</div><div class="sub">Ref Check + Doc + Offer</div></div>
      <div class="card"><div class="label">Open</div><div class="value" style="color:var(--blue)">${totals.open}</div></div>
    `;

    // Expandable Department -> Team tree
    let html = '';
    deptArr.forEach((D, gi) => {
      const teams = Object.values(D.teams).sort((a, b) => a.team.localeCompare(b.team));
      const single = teams.length === 1 && teams[0].team === D.dept;
      html += `<tr class="dept-header" data-group="${gi}" data-exp="1" style="cursor:pointer;background:var(--border-light)">
        <td style="font-weight:600"><span class="caret" style="display:inline-block;width:12px;color:var(--muted)">${single ? '' : '▾'}</span>${D.dept}</td>
        <td style="color:var(--muted)">${single ? teams[0].team : teams.length + ' teams'}</td>
        <td style="font-weight:600">${D.total}</td>
        <td class="good">${D.filled}</td><td style="color:var(--orange)">${D.jp}</td>
        <td style="color:var(--blue)">${D.open}</td>
      </tr>`;
      if (!single) {
        teams.forEach(T => {
          html += `<tr data-group="${gi}" class="team-row">
            <td></td>
            <td style="padding-left:20px;color:var(--muted)">${T.team}</td>
            <td style="font-weight:500">${T.total}</td>
            <td class="good">${T.filled}</td><td style="color:var(--orange)">${T.jp}</td>
            <td style="color:var(--blue)">${T.open}</td>
          </tr>`;
        });
      }
    });
    html += `<tr class="totals-row"><td>Total</td><td></td><td>${totals.total}</td><td>${totals.filled}</td><td>${totals.jp}</td><td>${totals.open}</td></tr>`;
    const deptBody = document.getElementById('hm1DeptBody');
    deptBody.innerHTML = html;
    deptBody.querySelectorAll('.dept-header').forEach(h => {
      h.addEventListener('click', () => {
        const gi = h.getAttribute('data-group');
        const exp = h.getAttribute('data-exp') === '1';
        h.setAttribute('data-exp', exp ? '0' : '1');
        const caret = h.querySelector('.caret');
        if (caret && caret.textContent) caret.textContent = exp ? '▸' : '▾';
        deptBody.querySelectorAll(`tr.team-row[data-group="${gi}"]`).forEach(r => { r.style.display = exp ? 'none' : ''; });
      });
    });

    // Job-wise detail (sorted Dept -> Team -> title)
    let jobFiltered = [...filtered];
    if (jobF) jobFiltered = jobFiltered.filter(o => o.title.toLowerCase().includes(jobF));
    jobFiltered.sort(byDeptTeam);

    html = '';
    jobFiltered.forEach(o => {
      html += `<tr>
        <td style="font-weight:500">${o._dept}</td><td style="color:var(--muted)">${o._team}</td>
        <td style="font-weight:500">${o.title}</td>
        <td style="font-weight:600">${o.total}</td>
        <td class="good">${o.filled}</td><td style="color:var(--orange)">${jpOf(o)}</td>
        <td style="color:var(--blue)">${o.open}</td>
      </tr>`;
    });
    document.getElementById('hm1JobBody').innerHTML = html;

    // Chart: department-wise stacked bar with value labels
    const cDepts = deptArr.map(t => t.dept).slice().reverse();
    if (hm1ChartInstance) hm1ChartInstance.destroy();
    const ctx1 = document.getElementById('hm1Chart');
    if (ctx1) {
      const wrap = document.getElementById('hm1ChartWrap');
      if (wrap) wrap.style.height = Math.max(300, cDepts.length * 48 + 80) + 'px';
      hm1ChartInstance = new Chart(ctx1, {
        type: 'bar',
        data: {
          labels: cDepts,
          datasets: [
            { label: 'Joined', data: cDepts.map(d => deptMap[d].filled), backgroundColor: '#22c55e', borderRadius: 4, barPercentage: 0.7 },
            { label: 'Joining Pending', data: cDepts.map(d => deptMap[d].jp), backgroundColor: '#f97316', borderRadius: 4, barPercentage: 0.7 },
            { label: 'Open', data: cDepts.map(d => deptMap[d].open), backgroundColor: '#3b82f6', borderRadius: 4, barPercentage: 0.7 }
          ]
        },
        options: {
          indexAxis: 'y', responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: 'top', align: 'start', labels: { usePointStyle: true, pointStyle: 'circle', padding: 16, font: { size: 12 } } } },
          scales: {
            x: { stacked: true, beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 11 } }, title: { display: true, text: 'Positions / Candidates', font: { size: 11 }, color: '#64748b' } },
            y: { stacked: true, grid: { display: false }, ticks: { font: { size: 12, weight: '500' }, padding: 6 } }
          }
        },
        plugins: [valueLabels]
      });
    }
  }

  // ===== Section 2: Throughput =====
  function renderThroughput() {
    const deptG = gDept(), teamG = gTeam();
    const jobF = (document.getElementById('hm2JobFilter')?.value || '').toLowerCase();
    const hideEmpty = document.getElementById('hm2HideEmpty')?.checked;
    const visStages = [];
    document.querySelectorAll('.hm2Stage').forEach(cb => { if (cb.checked) visStages.push(cb.value); });

    const filtered = jobs.filter(j => {
      if (deptG && j._dept !== deptG) return false;
      if (teamG && j._team !== teamG) return false;
      if (jobF && !j.title.toLowerCase().includes(jobF)) return false;
      if (hideEmpty && j.total === 0) return false;
      if (!j.pipeline) return false;
      return true;
    }).sort(byDeptTeam);

    let row1 = '<tr><th rowspan="2">Department</th><th rowspan="2">Team</th><th rowspan="2">Job</th>';
    let row2 = '<tr>';
    visStages.forEach(s => {
      row1 += `<th colspan="3" class="stage-hdr">${TP_LABELS[s]}</th>`;
      row2 += '<th class="stage-sub">In</th><th class="stage-sub">Out</th><th class="stage-sub">%</th>';
    });
    row1 += '<th rowspan="2" style="background:#e0e7ff;text-align:center">Overall<br>R1→Doc</th></tr>';
    row2 += '</tr>';
    document.getElementById('hm2Head').innerHTML = row1 + row2;

    // Per-job throughput, grouped Department -> Team -> Job
    const tpTotals = {};
    TP_KEYS.forEach(k => { tpTotals[k] = { i: 0, o: 0 }; });
    const groups = {};
    filtered.forEach(j => {
      const t = computeThroughput(j.pipeline, j.total);
      TP_KEYS.forEach(k => { tpTotals[k].i += t[k].i; tpTotals[k].o += t[k].o; });
      if (!groups[j._dept]) groups[j._dept] = { all: [], teams: {} };
      groups[j._dept].all.push({ job: j, t });
      if (!groups[j._dept].teams[j._team]) groups[j._dept].teams[j._team] = [];
      groups[j._dept].teams[j._team].push({ job: j, t });
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
    const caret = '<span class="caret" style="display:inline-block;width:12px;color:var(--muted)">▾</span>';

    let html = '';
    Object.keys(groups).sort().forEach((deptName, gi) => {
      const G = groups[deptName];
      const teamNames = Object.keys(G.teams).sort();
      html += `<tr class="dept-header" data-g="${gi}" data-exp="1" style="cursor:pointer;background:var(--border-light)">
        <td style="font-weight:600">${caret}${deptName}</td>
        <td style="color:var(--muted)">${teamNames.length} team${teamNames.length > 1 ? 's' : ''}</td>
        <td style="color:var(--muted);font-size:11px">${G.all.length} jobs</td>
        ${tpCells(aggTP(G.all))}</tr>`;
      teamNames.forEach((teamName, ti) => {
        const list = G.teams[teamName];
        const tg = gi + '-' + ti;
        html += `<tr class="team-header" data-g="${gi}" data-tg="${tg}" data-exp="1" style="cursor:pointer;background:#fafbfc">
          <td></td>
          <td style="padding-left:16px;font-weight:500">${caret}${teamName}</td>
          <td style="color:var(--muted);font-size:11px">${list.length} jobs</td>
          ${tpCells(aggTP(list))}</tr>`;
        list.forEach(({ job, t }) => {
          html += `<tr class="leaf" data-g="${gi}" data-tg="${tg}">
            <td></td><td></td>
            <td style="font-weight:500;max-width:220px;white-space:nowrap;padding-left:28px">${job.title}</td>
            ${tpCells(t)}</tr>`;
        });
      });
    });
    const allList = [];
    Object.values(groups).forEach(G => allList.push(...G.all));
    html += `<tr class="totals-row"><td>Total</td><td></td><td></td>${tpCells(aggTP(allList))}</tr>`;
    const hm2Body = document.getElementById('hm2Body');
    hm2Body.innerHTML = html;
    wireTree(hm2Body);

    // Chart 1: In vs Out by stage — Application stage excluded, values labeled
    const chartLabels = [], chartIn = [], chartOut = [];
    visStages.filter(sk => sk !== 'app').forEach(sk => {
      chartLabels.push(TP_LABELS[sk]);
      chartIn.push(tpTotals[sk].i);
      chartOut.push(tpTotals[sk].o);
    });
    if (hm2ChartInstance) hm2ChartInstance.destroy();
    const ctx2 = document.getElementById('hm2Chart');
    if (ctx2) {
      hm2ChartInstance = new Chart(ctx2, {
        type: 'bar',
        data: {
          labels: chartLabels,
          datasets: [
            { label: 'In', data: chartIn, backgroundColor: '#4f46e5', borderRadius: 4, barPercentage: 0.75 },
            { label: 'Out', data: chartOut, backgroundColor: '#22c55e', borderRadius: 4, barPercentage: 0.75 }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: 'top', align: 'start', labels: { usePointStyle: true, pointStyle: 'circle', padding: 16, font: { size: 12 } } } },
          scales: { y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 11 } } }, x: { grid: { display: false }, ticks: { font: { size: 11 } } } }
        },
        plugins: [valueLabels]
      });
    }

    // Chart 2: aggregate reached-stage funnel (total across filtered jobs)
    const agg = {};
    filtered.forEach(j => { Object.keys(j.pipeline).forEach(k => { agg[k] = (agg[k] || 0) + (j.pipeline[k] || 0); }); });
    const funnel = reachedFunnel(agg);
    if (hm2FunnelInstance) hm2FunnelInstance.destroy();
    const ctxF = document.getElementById('hm2Funnel');
    if (ctxF) {
      hm2FunnelInstance = new Chart(ctxF, {
        type: 'bar',
        data: {
          labels: funnel.map(f => f.label),
          datasets: [{
            label: 'Reached',
            data: funnel.map(f => [-f.value / 2, f.value / 2]),
            backgroundColor: '#0d9488',
            borderRadius: 3,
            barPercentage: 0.85
          }]
        },
        options: {
          indexAxis: 'y', responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => 'Reached: ' + Math.round(c.raw[1] - c.raw[0]) } } },
          scales: {
            x: { display: false, grid: { display: false } },
            y: { grid: { display: false }, ticks: { font: { size: 12, weight: '500' }, padding: 6 } }
          }
        },
        plugins: [valueLabels]
      });
    }
  }

  // ===== Section 3: Current Pipeline =====
  function renderPipeline() {
    const deptG = gDept(), teamG = gTeam();
    const jobF = (document.getElementById('hm3JobFilter')?.value || '').toLowerCase();
    const hideEmpty = document.getElementById('hm3HideEmpty')?.checked;
    const visStages = [];
    document.querySelectorAll('.hm3Stage').forEach(cb => { if (cb.checked) visStages.push(cb.value); });

    const filtered = jobs.filter(j => {
      if (deptG && j._dept !== deptG) return false;
      if (teamG && j._team !== teamG) return false;
      if (jobF && !j.title.toLowerCase().includes(jobF)) return false;
      if (hideEmpty && j.total === 0) return false;
      if (!j.pipeline) return false;
      return true;
    }).sort(byDeptTeam);

    let hdr = '<tr><th>Department</th><th>Team</th><th>Job</th><th>Total</th>';
    visStages.forEach(s => { hdr += `<th>${STAGE_LABELS[s]}</th>`; });
    hdr += '</tr>';
    document.getElementById('hm3Head').innerHTML = hdr;

    // Group Department -> Team -> Job
    const stageTotalsAll = {}; visStages.forEach(s => { stageTotalsAll[s] = 0; });
    let grandTotal = 0;
    const groups = {};
    filtered.forEach(j => {
      grandTotal += j.total;
      visStages.forEach(k => { stageTotalsAll[k] += (j.pipeline[k] || 0); });
      if (!groups[j._dept]) groups[j._dept] = { total: 0, stages: {}, teams: {} };
      const G = groups[j._dept]; G.total += j.total;
      visStages.forEach(k => { G.stages[k] = (G.stages[k] || 0) + (j.pipeline[k] || 0); });
      if (!G.teams[j._team]) G.teams[j._team] = { total: 0, stages: {}, jobs: [] };
      const T = G.teams[j._team]; T.total += j.total;
      visStages.forEach(k => { T.stages[k] = (T.stages[k] || 0) + (j.pipeline[k] || 0); });
      T.jobs.push(j);
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
    const caret = '<span class="caret" style="display:inline-block;width:12px;color:var(--muted)">▾</span>';

    let html = '';
    Object.keys(groups).sort().forEach((deptName, gi) => {
      const G = groups[deptName];
      const teamNames = Object.keys(G.teams).sort();
      const deptJobs = teamNames.reduce((s, tn) => s + G.teams[tn].jobs.length, 0);
      html += `<tr class="dept-header" data-g="${gi}" data-exp="1" style="cursor:pointer;background:var(--border-light)">
        <td style="font-weight:600">${caret}${deptName}</td>
        <td style="color:var(--muted)">${teamNames.length} team${teamNames.length > 1 ? 's' : ''}</td>
        <td style="color:var(--muted);font-size:11px">${deptJobs} jobs</td>
        ${pipeCells(G.total, G.stages)}</tr>`;
      teamNames.forEach((teamName, ti) => {
        const T = G.teams[teamName];
        const tg = gi + '-' + ti;
        html += `<tr class="team-header" data-g="${gi}" data-tg="${tg}" data-exp="1" style="cursor:pointer;background:#fafbfc">
          <td></td>
          <td style="padding-left:16px;font-weight:500">${caret}${teamName}</td>
          <td style="color:var(--muted);font-size:11px">${T.jobs.length} jobs</td>
          ${pipeCells(T.total, T.stages)}</tr>`;
        T.jobs.forEach(j => {
          html += `<tr class="leaf" data-g="${gi}" data-tg="${tg}">
            <td></td><td></td>
            <td style="font-weight:500;max-width:220px;white-space:nowrap;padding-left:28px">${j.title}</td>
            ${pipeCells(j.total, j.pipeline)}</tr>`;
        });
      });
    });
    html += `<tr class="totals-row"><td>Total</td><td></td><td></td>${pipeCells(grandTotal, stageTotalsAll)}</tr>`;
    const hm3Body = document.getElementById('hm3Body');
    hm3Body.innerHTML = html;
    wireTree(hm3Body);
  }

  // ===== Joining Pending — Cases (candidate-level; pending pipeline data) =====
  function renderJoiningPending() {
    const body = document.getElementById('hmJPBody');
    if (!body) return;
    const deptG = gDept(), teamG = gTeam();
    let list = (data.joiningPendingCases || []);
    list = list.filter(c => (!deptG || (c.department || c._dept) === deptG) && (!teamG || (c.team || c._team) === teamG));
    if (!list.length) {
      body.innerHTML = `<tr><td colspan="5" style="padding:24px;text-align:center;color:var(--muted);font-size:12px">Data not yet available — needs candidate-level joining data (Name + DOJ) from the pipeline redesign.</td></tr>`;
      return;
    }
    list.sort((a, b) => (a.department || '').localeCompare(b.department || '') || (a.team || '').localeCompare(b.team || '') || (a.doj || '').localeCompare(b.doj || ''));
    body.innerHTML = list.map(c => `<tr>
      <td style="font-weight:500">${c.department || ''}</td><td style="color:var(--muted)">${c.team || ''}</td>
      <td>${c.doj || '—'}</td><td>${c.job || ''}</td><td style="font-weight:500">${c.name || ''}</td>
    </tr>`).join('');
  }

  // ===== Panelist Dashboard (interviewer-level; pending pipeline data) =====
  function renderPanelist() {
    const body = document.getElementById('hmPanelBody');
    if (!body) return;
    const deptG = gDept(), teamG = gTeam();
    let list = (data.panelists || []);
    list = list.filter(p => (!deptG || (p.department || p._dept) === deptG) && (!teamG || (p.team || p._team) === teamG));
    if (!list.length) {
      body.innerHTML = `<tr><td colspan="6" style="padding:24px;text-align:center;color:var(--muted);font-size:12px">Data not yet available — needs per-interview panelist data (interview counts + feedback turnaround) from the pipeline redesign.</td></tr>`;
      return;
    }
    // Department -> Team -> Panelist tree
    const groups = {};
    list.forEach(p => {
      const dept = p.department || '—', team = p.team || '—';
      if (!groups[dept]) groups[dept] = {};
      if (!groups[dept][team]) groups[dept][team] = [];
      groups[dept][team].push(p);
    });
    const caret = '<span class="caret" style="display:inline-block;width:12px;color:var(--muted)">▾</span>';
    let html = '';
    Object.keys(groups).sort().forEach((dept, gi) => {
      const teams = Object.keys(groups[dept]).sort();
      const deptCount = teams.reduce((s, t) => s + groups[dept][t].reduce((a, p) => a + (p.interviewCount || 0), 0), 0);
      html += `<tr class="dept-header" data-g="${gi}" data-exp="1" style="cursor:pointer;background:var(--border-light)">
        <td style="font-weight:600">${caret}${dept}</td><td style="color:var(--muted)">${teams.length} team${teams.length > 1 ? 's' : ''}</td>
        <td></td><td></td><td style="font-weight:600">${deptCount}</td><td></td></tr>`;
      teams.forEach((team, ti) => {
        const arr = groups[dept][team]; const tg = gi + '-' + ti;
        const teamCount = arr.reduce((a, p) => a + (p.interviewCount || 0), 0);
        html += `<tr class="team-header" data-g="${gi}" data-tg="${tg}" data-exp="1" style="cursor:pointer;background:#fafbfc">
          <td></td><td style="padding-left:16px;font-weight:500">${caret}${team}</td>
          <td></td><td></td><td style="font-weight:600">${teamCount}</td><td></td></tr>`;
        arr.forEach(p => {
          html += `<tr class="leaf" data-g="${gi}" data-tg="${tg}">
            <td></td><td></td><td style="font-weight:500">${p.panelist || p.name || ''}</td>
            <td>${p.job || ''}</td><td>${p.interviewCount || 0}</td><td>${p.avgFeedbackTime || p.avgFeedback || '—'}</td></tr>`;
        });
      });
    });
    body.innerHTML = html;
    wireTree(body);
  }

  // ---- Master re-render for global filters ----
  function renderAll() { renderSection1(); renderJoiningPending(); renderThroughput(); renderPanelist(); renderPipeline(); }

  // Global filter listeners
  document.getElementById('hmDept')?.addEventListener('change', () => { repopulateTeams(); renderAll(); });
  document.getElementById('hmTeam')?.addEventListener('change', renderAll);
  document.getElementById('hmDateFrom')?.addEventListener('change', renderSection1);
  document.getElementById('hmDateTo')?.addEventListener('change', renderSection1);
  document.getElementById('hmYear')?.addEventListener('change', () => { applyYearQuarter(); renderSection1(); });
  document.getElementById('hmQuarter')?.addEventListener('change', () => { applyYearQuarter(); renderSection1(); });

  // Section-local listeners
  document.querySelectorAll('.hm1Status').forEach(cb => cb.addEventListener('change', renderSection1));
  document.getElementById('hm1JobFilter')?.addEventListener('input', renderSection1);
  document.getElementById('hm2JobFilter')?.addEventListener('input', renderThroughput);
  document.getElementById('hm2HideEmpty')?.addEventListener('change', renderThroughput);
  document.querySelectorAll('.hm2Stage').forEach(cb => cb.addEventListener('change', renderThroughput));
  document.getElementById('hm3JobFilter')?.addEventListener('input', renderPipeline);
  document.getElementById('hm3HideEmpty')?.addEventListener('change', renderPipeline);
  document.querySelectorAll('.hm3Stage').forEach(cb => cb.addEventListener('change', renderPipeline));

  // Default the period filter to the current year + current quarter (falls back to the
  // latest year present in the data if the current year has no openings yet).
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

  renderAll();
}
