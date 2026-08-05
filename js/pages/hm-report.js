import { getData } from '../data.js';

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

function pctFmt(num, den) { return den > 0 ? ((num / den) * 100).toFixed(1) + '%' : '—'; }
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

export function renderHmReport(data) {
  if (!data || !data.jobs) return '<p>No data available.</p>';

  const openings = data.openings || [];
  const jobs = data.jobs || [];
  const openingDepts = [...new Set(openings.map(o => o.department))].sort();
  const jobDepts = [...new Set(jobs.map(j => j.department))].sort();

  return `
    <!-- ===== SECTION 1: JOB OPENINGS ===== -->
    <h2 class="section-title">Job Openings</h2>
    <div class="filter-bar">
      <label style="font-size:11px;color:var(--muted)">From <input type="date" id="hm1DateFrom" style="padding:5px 8px;border:1px solid var(--border);border-radius:6px;font-size:12px"></label>
      <label style="font-size:11px;color:var(--muted)">To <input type="date" id="hm1DateTo" style="padding:5px 8px;border:1px solid var(--border);border-radius:6px;font-size:12px"></label>
      <span style="border-left:1px solid var(--border);height:24px;margin:0 4px"></span>
      <span style="font-size:11px;color:var(--muted);margin-right:2px">Job Status:</span>
      <label style="font-size:12px;display:flex;align-items:center;gap:3px"><input type="checkbox" class="hm1Status" value="Open" checked> Open</label>
      <label style="font-size:12px;display:flex;align-items:center;gap:3px"><input type="checkbox" class="hm1Status" value="Closed" checked> Closed</label>
      <span style="border-left:1px solid var(--border);height:24px;margin:0 4px"></span>
      <select id="hm1DeptFilter"><option value="">All Departments</option>${openingDepts.map(d => `<option value="${d}">${d}</option>`).join('')}</select>
    </div>

    <div class="cards" id="hm1Cards"></div>

    <h3 class="subsection-title">Department &amp; Team Summary</h3>
    <div class="scroll-table"><table>
      <thead><tr><th>Department</th><th>Team</th><th>#Openings</th><th>Joined (Filled)</th><th>Joining Pending</th><th>Open</th></tr></thead>
      <tbody id="hm1TeamBody"></tbody>
    </table></div>

    <div class="chart-wrap" style="height:300px"><canvas id="hm1Chart"></canvas></div>

    <h3 class="subsection-title">Job-wise Detail</h3>
    <div class="filter-bar">
      <select id="hm1DeptFilter2"><option value="">All Departments</option>${openingDepts.map(d => `<option value="${d}">${d}</option>`).join('')}</select>
      <input type="text" id="hm1JobFilter" placeholder="Filter by job title..." style="width:220px">
    </div>
    <div class="scroll-table"><table>
      <thead><tr><th>Department</th><th>Team</th><th>Job Title</th><th>#Openings</th><th>Joined</th><th>Joining Pending</th><th>Open</th></tr></thead>
      <tbody id="hm1JobBody"></tbody>
    </table></div>

    <hr class="section-divider">

    <!-- ===== SECTION 2: THROUGHPUT ===== -->
    <h2 class="section-title">Job-wise Throughput Report</h2>
    <p class="sub-note">In = candidates who entered stage (cumulative). Out = candidates who moved past it. Throughput = Out/In %. Overall = R1 In → Doc Submission In.</p>
    <div class="filter-bar">
      <select id="hm2StatusFilter"><option value="">All Job Statuses</option><option value="Open">Open</option><option value="Closed">Closed</option></select>
      <select id="hm2TeamFilter"><option value="">All Departments</option>${jobDepts.map(d => `<option value="${d}">${d}</option>`).join('')}</select>
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

    <div class="chart-wrap" style="height:300px"><canvas id="hm2Chart"></canvas></div>

    <hr class="section-divider">

    <!-- ===== SECTION 3: CURRENT PIPELINE ===== -->
    <h2 class="section-title">Current Stage-wise Pipeline</h2>
    <div class="filter-bar">
      <select id="hm3StatusFilter"><option value="">All Job Statuses</option><option value="Open">Open</option><option value="Closed">Closed</option></select>
      <select id="hm3TeamFilter"><option value="">All Departments</option>${jobDepts.map(d => `<option value="${d}">${d}</option>`).join('')}</select>
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

    <div class="chart-wrap" style="height:300px"><canvas id="hm3Chart"></canvas></div>
  `;
}

let hm1ChartInstance = null;
let hm2ChartInstance = null;
let hm3ChartInstance = null;

export function initHmFilters(data) {
  if (!data) return;
  const openings = data.openings || [];
  const jobs = data.jobs || [];

  // ===== Section 1: Job Openings =====
  function getSelectedStatuses() {
    const checked = [];
    document.querySelectorAll('.hm1Status').forEach(cb => { if (cb.checked) checked.push(cb.value); });
    return checked;
  }

  function renderSection1() {
    const dateFrom = document.getElementById('hm1DateFrom')?.value || '';
    const dateTo = document.getElementById('hm1DateTo')?.value || '';
    const statuses = getSelectedStatuses();
    const deptF = document.getElementById('hm1DeptFilter')?.value || '';
    const deptF2 = document.getElementById('hm1DeptFilter2')?.value || '';
    const jobF = (document.getElementById('hm1JobFilter')?.value || '').toLowerCase();

    const statusFiltered = openings.filter(o => {
      if (dateFrom && (o.openedAt || '') < dateFrom) return false;
      if (dateTo && (o.openedAt || '') > dateTo) return false;
      if (statuses.length > 0 && statuses.indexOf(o.status || 'Open') === -1) return false;
      return true;
    });

    const deptFiltered = deptF ? statusFiltered.filter(o => o.department === deptF) : statusFiltered;

    const teamMap = {};
    deptFiltered.forEach(o => {
      const key = o.department + '|||' + o.team;
      if (!teamMap[key]) teamMap[key] = { dept: o.department, tm: o.team, total: 0, filled: 0, open: 0, jp: 0 };
      teamMap[key].total += o.total;
      teamMap[key].filled += o.filled;
      teamMap[key].open += o.open;
      teamMap[key].jp += o.joiningPending || 0;
    });
    const teamArr = Object.values(teamMap).sort((a, b) => b.total - a.total);

    const totals = { total: 0, filled: 0, open: 0, jp: 0 };
    teamArr.forEach(t => { totals.total += t.total; totals.filled += t.filled; totals.open += t.open; totals.jp += t.jp; });

    document.getElementById('hm1Cards').innerHTML = `
      <div class="card"><div class="label">Total Openings</div><div class="value">${totals.total}</div></div>
      <div class="card"><div class="label">Joined (Filled)</div><div class="value" style="color:var(--green)">${totals.filled}</div></div>
      <div class="card"><div class="label">Joining Pending</div><div class="value" style="color:var(--orange)">${totals.jp}</div><div class="sub">Offer + Doc Submission</div></div>
      <div class="card"><div class="label">Open</div><div class="value" style="color:var(--blue)">${totals.open}</div></div>
    `;

    let html = '';
    teamArr.forEach(t => {
      html += `<tr>
        <td style="font-weight:500">${t.dept}</td><td style="color:var(--muted)">${t.tm}</td>
        <td style="font-weight:600">${t.total}</td>
        <td class="good">${t.filled}</td><td style="color:var(--orange)">${t.jp}</td>
        <td style="color:var(--blue)">${t.open}</td>
      </tr>`;
    });
    html += `<tr class="totals-row"><td>Total</td><td></td><td>${totals.total}</td><td>${totals.filled}</td><td>${totals.jp}</td><td>${totals.open}</td></tr>`;
    document.getElementById('hm1TeamBody').innerHTML = html;

    let jobFiltered = deptF2 ? statusFiltered.filter(o => o.department === deptF2) : [...statusFiltered];
    if (jobF) jobFiltered = jobFiltered.filter(o => o.title.toLowerCase().includes(jobF));
    jobFiltered.sort((a, b) => b.total - a.total);

    html = '';
    jobFiltered.forEach(o => {
      html += `<tr>
        <td style="font-weight:500">${o.department}</td><td style="color:var(--muted)">${o.team}</td>
        <td style="font-weight:500">${o.title}</td>
        <td style="font-weight:600">${o.total}</td>
        <td class="good">${o.filled}</td><td style="color:var(--orange)">${o.joiningPending || 0}</td>
        <td style="color:var(--blue)">${o.open}</td>
      </tr>`;
    });
    document.getElementById('hm1JobBody').innerHTML = html;

    // Chart: dept breakdown horizontal stacked bar
    const chartMap = {};
    deptFiltered.forEach(o => {
      if (!chartMap[o.department]) chartMap[o.department] = { filled: 0, jp: 0, open: 0 };
      chartMap[o.department].filled += o.filled;
      chartMap[o.department].open += o.open;
      chartMap[o.department].jp += o.joiningPending || 0;
    });
    const cDepts = Object.keys(chartMap).sort((a, b) => {
      const ta = chartMap[a].filled + chartMap[a].jp + chartMap[a].open;
      const tb = chartMap[b].filled + chartMap[b].jp + chartMap[b].open;
      return ta - tb;
    });
    if (hm1ChartInstance) hm1ChartInstance.destroy();
    const ctx1 = document.getElementById('hm1Chart');
    if (ctx1) {
      hm1ChartInstance = new Chart(ctx1, {
        type: 'bar',
        data: {
          labels: cDepts,
          datasets: [
            { label: 'Joined (Filled)', data: cDepts.map(d => chartMap[d].filled), backgroundColor: '#22c55e', borderRadius: 4, barPercentage: 0.65 },
            { label: 'Joining Pending', data: cDepts.map(d => chartMap[d].jp), backgroundColor: '#f97316', borderRadius: 4, barPercentage: 0.65 },
            { label: 'Open', data: cDepts.map(d => chartMap[d].open), backgroundColor: '#3b82f6', borderRadius: 4, barPercentage: 0.65 }
          ]
        },
        options: {
          indexAxis: 'y', responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: 'top', align: 'start', labels: { usePointStyle: true, pointStyle: 'circle', padding: 16, font: { size: 12 } } } },
          scales: {
            x: { stacked: true, beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 11 } }, title: { display: true, text: 'Number of Openings', font: { size: 11 }, color: '#64748b' } },
            y: { stacked: true, grid: { display: false }, ticks: { font: { size: 12, weight: '500' }, padding: 6 } }
          }
        }
      });
    }
  }

  document.getElementById('hm1DateFrom')?.addEventListener('change', renderSection1);
  document.getElementById('hm1DateTo')?.addEventListener('change', renderSection1);
  document.querySelectorAll('.hm1Status').forEach(cb => cb.addEventListener('change', renderSection1));
  document.getElementById('hm1DeptFilter')?.addEventListener('change', renderSection1);
  document.getElementById('hm1DeptFilter2')?.addEventListener('change', renderSection1);
  document.getElementById('hm1JobFilter')?.addEventListener('input', renderSection1);
  renderSection1();

  // ===== Section 2: Throughput =====
  function renderThroughput() {
    const statusF = document.getElementById('hm2StatusFilter')?.value || '';
    const teamF = document.getElementById('hm2TeamFilter')?.value || '';
    const jobF = (document.getElementById('hm2JobFilter')?.value || '').toLowerCase();
    const hideEmpty = document.getElementById('hm2HideEmpty')?.checked;
    const visStages = [];
    document.querySelectorAll('.hm2Stage').forEach(cb => { if (cb.checked) visStages.push(cb.value); });

    const filtered = jobs.filter(j => {
      if (statusF && j.status !== statusF) return false;
      if (teamF && j.department !== teamF) return false;
      if (jobF && !j.title.toLowerCase().includes(jobF)) return false;
      if (hideEmpty && j.total === 0) return false;
      if (!j.pipeline) return false;
      return true;
    });

    let row1 = '<tr><th rowspan="2">Department</th><th rowspan="2">Job</th>';
    let row2 = '<tr>';
    visStages.forEach(s => {
      row1 += `<th colspan="3" class="stage-hdr">${TP_LABELS[s]}</th>`;
      row2 += '<th class="stage-sub">In</th><th class="stage-sub">Out</th><th class="stage-sub">%</th>';
    });
    row1 += '<th rowspan="2" style="background:#e0e7ff;text-align:center">Overall<br>R1→Doc</th></tr>';
    row2 += '</tr>';
    document.getElementById('hm2Head').innerHTML = row1 + row2;

    let html = '';
    const tpTotals = {};
    TP_KEYS.forEach(k => { tpTotals[k] = { i: 0, o: 0 }; });
    let overallSum = 0, overallCount = 0;

    filtered.forEach(j => {
      const t = computeThroughput(j.pipeline, j.total);
      TP_KEYS.forEach(k => { tpTotals[k].i += t[k].i; tpTotals[k].o += t[k].o; });
      if (t.overall !== null) { overallSum += t.overall; overallCount++; }

      html += `<tr><td style="color:var(--muted);font-size:11px;max-width:120px">${j.department}</td>`;
      html += `<td style="font-weight:500;max-width:200px;white-space:nowrap">${j.title}</td>`;
      visStages.forEach(sk => {
        const s = t[sk];
        const cls = s.i === 0 ? 'zero' : '';
        html += `<td class="stage-cell stage-first ${cls}">${zv(s.i)}</td><td class="stage-cell ${cls}">${zv(s.o)}</td><td class="stage-cell">${pctCell(s.o, s.i)}</td>`;
      });
      const ov = t.overall !== null ? (t.overall * 100).toFixed(1) + '%' : '—';
      const ovc = pctClass(ov);
      html += `<td class="stage-cell" style="background:#f0f0ff;font-weight:600"><span class="${ovc}">${ov}</span></td></tr>`;
    });

    // Totals row
    html += '<tr class="totals-row"><td>Total</td><td></td>';
    visStages.forEach(sk => {
      const s = tpTotals[sk];
      html += `<td class="stage-cell stage-first">${s.i}</td><td class="stage-cell">${s.o}</td><td class="stage-cell">${pctCell(s.o, s.i)}</td>`;
    });
    const avgOv = overallCount > 0 ? ((overallSum / overallCount) * 100).toFixed(1) + '%' : '—';
    html += `<td class="stage-cell" style="background:#f0f0ff;font-weight:600">${avgOv}</td></tr>`;

    document.getElementById('hm2Body').innerHTML = html;

    // Chart: throughput In vs Out by stage
    const chartLabels = [];
    const chartIn = [];
    const chartOut = [];
    visStages.forEach(sk => {
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
            { label: 'In', data: chartIn, backgroundColor: '#4f46e5cc', borderRadius: 4, barPercentage: 0.7 },
            { label: 'Out', data: chartOut, backgroundColor: '#22c55ecc', borderRadius: 4, barPercentage: 0.7 }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: 'top', align: 'start', labels: { usePointStyle: true, pointStyle: 'circle', padding: 16, font: { size: 12 } } } },
          scales: { y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 11 } } }, x: { grid: { display: false }, ticks: { font: { size: 11 } } } }
        }
      });
    }
  }

  document.getElementById('hm2StatusFilter')?.addEventListener('change', renderThroughput);
  document.getElementById('hm2TeamFilter')?.addEventListener('change', renderThroughput);
  document.getElementById('hm2JobFilter')?.addEventListener('input', renderThroughput);
  document.getElementById('hm2HideEmpty')?.addEventListener('change', renderThroughput);
  document.querySelectorAll('.hm2Stage').forEach(cb => cb.addEventListener('change', renderThroughput));
  renderThroughput();

  // ===== Section 3: Current Pipeline =====
  function renderPipeline() {
    const statusF = document.getElementById('hm3StatusFilter')?.value || '';
    const teamF = document.getElementById('hm3TeamFilter')?.value || '';
    const jobF = (document.getElementById('hm3JobFilter')?.value || '').toLowerCase();
    const hideEmpty = document.getElementById('hm3HideEmpty')?.checked;
    const visStages = [];
    document.querySelectorAll('.hm3Stage').forEach(cb => { if (cb.checked) visStages.push(cb.value); });

    const filtered = jobs.filter(j => {
      if (statusF && j.status !== statusF) return false;
      if (teamF && j.department !== teamF) return false;
      if (jobF && !j.title.toLowerCase().includes(jobF)) return false;
      if (hideEmpty && j.total === 0) return false;
      if (!j.pipeline) return false;
      return true;
    });

    let hdr = '<tr><th>Department</th><th>Job</th><th>Total</th>';
    visStages.forEach(s => { hdr += `<th>${STAGE_LABELS[s]}</th>`; });
    hdr += '</tr>';
    document.getElementById('hm3Head').innerHTML = hdr;

    const stageTotals = {};
    visStages.forEach(s => { stageTotals[s] = 0; });
    let grandTotal = 0;

    let html = '';
    filtered.forEach(j => {
      const p = j.pipeline;
      grandTotal += j.total;
      html += `<tr><td style="color:var(--muted);font-size:11px">${j.department}</td>`;
      html += `<td style="font-weight:500;max-width:200px;white-space:nowrap">${j.title}</td><td style="font-weight:600">${j.total}</td>`;
      visStages.forEach(k => {
        const v = p[k] || 0;
        stageTotals[k] += v;
        let style = '';
        if (k === 'hired' && v > 0) style = ' class="good"';
        else if (k === 'offer' && v > 0) style = ' style="color:var(--blue);font-weight:600"';
        else if (v === 0) style = ' class="zero"';
        html += `<td${style}>${v}</td>`;
      });
      html += '</tr>';
    });

    // Totals row
    html += `<tr class="totals-row"><td>Total</td><td></td><td>${grandTotal}</td>`;
    visStages.forEach(k => { html += `<td>${stageTotals[k]}</td>`; });
    html += '</tr>';

    document.getElementById('hm3Body').innerHTML = html;

    // Chart: pipeline by dept horizontal stacked bar
    const stageColors = { appReview:'#94a3b8', taScreen:'#4f46e5', hmReview:'#7c3aed', oa:'#0891b2', r1:'#2563eb', r2:'#0ea5e9', r3:'#06b6d4', r4:'#14b8a6', r5:'#10b981', refCheck:'#f59e0b', docSub:'#ea580c', offer:'#3b82f6', hired:'#16a34a' };
    const deptPipeline = {};
    filtered.forEach(j => {
      if (!deptPipeline[j.department]) { deptPipeline[j.department] = {}; visStages.forEach(s => { deptPipeline[j.department][s] = 0; }); }
      visStages.forEach(s => { deptPipeline[j.department][s] += (j.pipeline[s] || 0); });
    });
    const chartDepts = Object.keys(deptPipeline).sort((a, b) => {
      let sa = 0, sb = 0;
      visStages.forEach(s => { sa += deptPipeline[a][s]; sb += deptPipeline[b][s]; });
      return sa - sb;
    });
    const datasets = visStages.map(s => ({
      label: STAGE_LABELS[s],
      data: chartDepts.map(d => deptPipeline[d][s]),
      backgroundColor: (stageColors[s] || '#94a3b8') + 'cc',
      borderRadius: 2, barPercentage: 0.7
    }));
    if (hm3ChartInstance) hm3ChartInstance.destroy();
    const ctx3 = document.getElementById('hm3Chart');
    if (ctx3) {
      hm3ChartInstance = new Chart(ctx3, {
        type: 'bar',
        data: { labels: chartDepts, datasets },
        options: {
          indexAxis: 'y', responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom', labels: { font: { size: 10 }, usePointStyle: true, pointStyle: 'circle', padding: 10 } } },
          scales: { x: { stacked: true, beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 11 } } }, y: { stacked: true, grid: { display: false }, ticks: { font: { size: 11, weight: '500' }, padding: 6 } } }
        }
      });
    }
  }

  document.getElementById('hm3StatusFilter')?.addEventListener('change', renderPipeline);
  document.getElementById('hm3TeamFilter')?.addEventListener('change', renderPipeline);
  document.getElementById('hm3JobFilter')?.addEventListener('input', renderPipeline);
  document.getElementById('hm3HideEmpty')?.addEventListener('change', renderPipeline);
  document.querySelectorAll('.hm3Stage').forEach(cb => cb.addEventListener('change', renderPipeline));
  renderPipeline();
}
