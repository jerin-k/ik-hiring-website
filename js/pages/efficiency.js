import { podOf, POD_OPTIONS, isSalesPod, capacityOf, currentQuarter, qKey } from '../recruiter-pods.js';
import { resolveDeptTeam } from '../dept-map.js';
import { TIS_STAGES, poolHists, tisCell } from '../stage-time.js';
import { scoreForRole } from '../score-model.js';

// Overall Efficiency = everything Recruiter Efficiency has, but the Recruiter dimension is replaced by
// Department. Trees are Pod → Department → Job; charts are one-per-pod with Y = Job. Pods map to
// recruiters (not jobs), so attributing a Job/Department to a Pod needs the recruiter×job rollup from the
// pipeline redesign — until then every metric cell is a placeholder (—), same honesty as the Recruiter tab.
// The only live values here: Fulfilment pod Target = summed pod capacities, and the org-wide Sourcing chart.

const POD_ORDER = [...POD_OPTIONS, 'Unassigned'];
const CARET = '<span class="caret" style="display:inline-block;width:14px;color:var(--muted)">▸</span>';
const DASH = '<span class="zero">—</span>';
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Throughput stages (mirrors the HM tab)
const TP_KEYS = ['app','ta','hm','oa','r1','r2','r3','r4','r5','rc','ds','offer'];
const TP_LABELS = { app:'Application', ta:'TA Screen', hm:'HM Review', oa:'OA', r1:'R1', r2:'R2', r3:'R3', r4:'R4', r5:'R5', rc:'Ref Check', ds:'Doc Sub', offer:'Offer' };
const TP_TO_SK = { app:'appReview', ta:'taScreen', hm:'hmReview', oa:'oa', r1:'r1', r2:'r2', r3:'r3', r4:'r4', r5:'r5', rc:'refCheck', ds:'docSub', offer:'offer' };

function dashTds(n) { return `<td>${DASH}</td>`.repeat(n); }

// Generic N-level collapsible tree. Rows carry data-path ("0", "0-1", "0-1-2"…) + data-haschild for
// expandable rows. Clicking shows only direct children; collapsing hides + resets all descendants.
function wireTreePath(tbody, expandAll) {
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
  if (expandAll) {
    tbody.querySelectorAll('tr[data-path]').forEach(r => { r.style.display = ''; if (r.dataset.haschild) { r.dataset.exp = '1'; const c = r.querySelector('.caret'); if (c) c.textContent = '▾'; } });
  }
}

let effFulfilCombined = null, effSourceChart = null;

export function renderEfficiency(data) {
  if (!data || !data.funnel) return '<p>No data available.</p>';

  const cy = new Date().getFullYear();
  const years = [];
  for (let y = Math.max(cy, 2026); y >= 2026; y--) years.push(y);

  return `
    <style>
      .eff-subtabs { display:flex; gap:2px; flex-wrap:wrap; border-bottom:1px solid var(--border); margin-bottom:20px; }
      .eff-subtab { appearance:none; background:none; border:none; padding:9px 16px; font-size:13px; font-weight:500;
        color:var(--muted); cursor:pointer; border-bottom:2px solid transparent; margin-bottom:-1px; }
      .eff-subtab:hover { color:var(--text); }
      .eff-subtab.active { color:var(--accent); border-bottom-color:var(--accent); font-weight:600; }

      .eff-filters { background:#e4eaf4; border:1px solid #c3d0e8; border-radius:12px; padding:14px 18px; margin-bottom:18px;
        display:flex; flex-wrap:wrap; align-items:center; gap:14px; box-shadow:0 1px 2px rgba(15,23,42,0.06); }
      .eff-filters select, .eff-filters input[type=date] {
        appearance:none; -webkit-appearance:none; height:34px; padding:0 11px; border:1px solid var(--border);
        border-radius:8px; font-size:12px; font-weight:500; background:var(--card); color:var(--text); }
      .eff-filters select { padding-right:28px; cursor:pointer;
        background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%2364748b' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
        background-repeat:no-repeat; background-position:right 10px center; }
      .eff-filters select:hover, .eff-filters input:hover { border-color:var(--muted); }
      .eff-filters select:focus, .eff-filters input:focus { outline:none; border-color:var(--accent); box-shadow:0 0 0 3px rgba(78,107,166,0.16); }
      .eff-filters .fchip { display:flex; align-items:center; gap:7px; }
      .eff-filters .fchip > span.lbl { font-size:11px; font-weight:700; color:var(--accent); text-transform:uppercase; letter-spacing:0.04em; }
      .eff-filters .fchip > label.opt { font-size:12px; font-weight:500; display:flex; align-items:center; gap:4px; cursor:pointer; color:var(--text) }
      .eff-filters .fdiv { width:1px; align-self:stretch; background:#cdddf7; margin:2px 2px; }

      /* Velocity table — freeze the first two columns */
      .evel-table { width:auto; min-width:100%; border-collapse:separate; border-spacing:0; overflow:visible; }
      .evel-table th, .evel-table td { white-space:nowrap; }
      .evel-table th:not(:first-child), .evel-table td:not(:first-child) { text-align:right; }
      .evel-table th:nth-child(n+3), .evel-table td:nth-child(n+3) { min-width:56px; }
      .evel-table th:nth-child(1), .evel-table td:nth-child(1) { position:sticky; left:0; z-index:2; width:260px; min-width:260px; max-width:260px; text-align:left; white-space:normal; }
      .evel-table th:nth-child(2), .evel-table td:nth-child(2) { position:sticky; left:260px; z-index:2; min-width:96px; border-right:2px solid var(--border); }
      .evel-table thead th:nth-child(1), .evel-table thead th:nth-child(2) { z-index:3; background:var(--bg); }
      .evel-table tbody td:nth-child(1), .evel-table tbody td:nth-child(2) { background:var(--card); }

      /* per-pod chart placeholder cards */
      .eff-podcharts { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:12px; margin-bottom:18px; }
      .eff-podchart { border:1px solid var(--border); border-radius:10px; padding:14px 16px; background:var(--card); min-height:110px;
        display:flex; flex-direction:column; gap:6px; }
      .eff-podchart h5 { font-size:12px; font-weight:600; color:var(--text); margin:0; }
      .eff-podchart p { font-size:11px; color:var(--muted); margin:0; line-height:1.5; }
    </style>

    <h2 class="section-title">Overall Efficiency</h2>
    <p class="sub-note" style="margin-top:-8px;">The Recruiter Efficiency views, aggregated <strong>without the recruiter</strong> — trees are <strong>Pod → Department → Job</strong>. Jobs are attributed to a pod via the recruiters who worked them. <strong>Fulfilment</strong>, <strong>Joining Conversion</strong>, <strong>Velocity</strong> (Dept→Job→Stage) and <strong>Throughput</strong> are live to the job level (velocity/throughput from real stage history); <strong>Screening / Sourcing</strong> are pod-level. Year/Quarter drives pod grouping + capacity.</p>

    <div class="eff-filters">
      <div class="fchip"><span class="lbl">Pod</span><div class="ms" id="effMsPod"></div></div>
      <div class="fchip"><span class="lbl">Department</span><div class="ms" id="effMsDept"></div></div>
      <div class="fchip"><span class="lbl">Job</span><div class="ms" id="effMsJob"></div></div>
      <div class="fchip"><label class="opt"><input type="checkbox" id="effExpandAll"> Expand all branches</label></div>
      <span class="fdiv"></span>
      <div class="fchip"><span class="lbl">From</span><input type="date" id="effVelFrom"></div>
      <div class="fchip"><span class="lbl">To</span><input type="date" id="effVelTo"></div>
      <div class="fchip"><span class="lbl">Year</span><select id="effYear"><option value="">All</option>${years.map(y => `<option value="${y}">${y}</option>`).join('')}</select></div>
      <div class="fchip"><span class="lbl">Quarter</span><select id="effQuarter"><option value="">All</option><option value="Q1">Q1</option><option value="Q2">Q2</option><option value="Q3">Q3</option><option value="Q4">Q4</option></select></div>
    </div>

    <div class="eff-subtabs">
      <button class="eff-subtab active" data-tab="fulfilment">Fulfilment</button>
      <button class="eff-subtab" data-tab="velocity">Submission Velocity</button>
      <button class="eff-subtab" data-tab="screening">Screening Efficiency</button>
      <button class="eff-subtab" data-tab="throughput">Throughput</button>
      <button class="eff-subtab" data-tab="timeinprocess">Time in Process</button>
      <button class="eff-subtab" data-tab="joining">Joining Conversion</button>
      <button class="eff-subtab" data-tab="sourcing">Sourcing Mix</button>
    </div>

    <!-- PANEL: Fulfilment -->
    <div class="eff-panel" data-panel="fulfilment">
      <p class="sub-note"><strong>Non-Sales</strong> pods are measured on <strong>Offers</strong>, the <strong>Sales</strong> pod on <strong>Hires</strong>. Assigned / Offered / Hired HC &amp; <strong>Score</strong> are live to the job level (attributed via the recruiters who worked each job). <strong>Target = summed pod capacity</strong> (per quarter, Metric Config); <strong>Gap = max(0, Target − Achieved)</strong> — 0 until capacities are set. Joining Pending is a pod-level count.</p>
      <div class="eff-podcharts" id="effFulfilPodCharts"></div>
      <div class="chart-wrap" style="max-width:520px;margin:0 0 18px"><canvas id="effFulfilCombined"></canvas></div>

      <h4 style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.04em;margin:14px 0 6px">Fulfilment — Non-Sales (Offers)</h4>
      <div class="scroll-table"><table>
        <thead>
          <tr><th rowspan="2" style="min-width:260px">Pod / Department / Job</th><th colspan="2" class="stage-hdr">Assigned</th><th rowspan="2" class="stage-hdr">Target<br><span style="font-weight:400;text-transform:none">Score</span></th><th colspan="2" class="stage-hdr">Offered</th><th colspan="2" class="stage-hdr">Joining Pending</th><th rowspan="2" class="stage-hdr">Gap<br><span style="font-weight:400;text-transform:none">Score</span></th></tr>
          <tr><th class="stage-sub">HC</th><th class="stage-sub">Score</th><th class="stage-sub">HC</th><th class="stage-sub">Score</th><th class="stage-sub">HC</th><th class="stage-sub">Score</th></tr>
        </thead>
        <tbody id="effFulfilOfferBody"></tbody>
      </table></div>

      <h4 style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.04em;margin:18px 0 6px">Fulfilment — Sales (Hires)</h4>
      <div class="scroll-table"><table>
        <thead>
          <tr><th rowspan="2" style="min-width:260px">Pod / Department / Job</th><th colspan="2" class="stage-hdr">Assigned</th><th rowspan="2" class="stage-hdr">Target<br><span style="font-weight:400;text-transform:none">Score</span></th><th colspan="2" class="stage-hdr">Offered</th><th colspan="2" class="stage-hdr">Joining Pending</th><th colspan="2" class="stage-hdr">Hired</th><th rowspan="2" class="stage-hdr">Gap<br><span style="font-weight:400;text-transform:none">Score</span></th></tr>
          <tr><th class="stage-sub">HC</th><th class="stage-sub">Score</th><th class="stage-sub">HC</th><th class="stage-sub">Score</th><th class="stage-sub">HC</th><th class="stage-sub">Score</th><th class="stage-sub">HC</th><th class="stage-sub">Score</th></tr>
        </thead>
        <tbody id="effFulfilHireBody"></tbody>
      </table></div>
    </div>

    <!-- PANEL: Submission Velocity -->
    <div class="eff-panel" data-panel="velocity" style="display:none">
      <p class="sub-note"><strong>Pod → Department → Job → Stage</strong> (OA / HM Screening / R1), daily over the last 30 days of the range — counted by true <strong>stage-entry date</strong> from stage history (no bulk-update spikes). Falls back to a pod-level snapshot until the history accumulator has run.</p>
      <div class="eff-podcharts" id="effVelPodCharts"></div>
      <div class="scroll-table"><table class="evel-table">
        <thead id="effVelHead"></thead>
        <tbody id="effVelBody"></tbody>
      </table></div>
    </div>

    <!-- PANEL: Screening Efficiency -->
    <div class="eff-panel" data-panel="screening" style="display:none">
      <p class="sub-note">Added = reached the stage, Cleared = transitioned out (reached the next stage), from real stage history — live at <strong>Pod → Department → Job</strong> for HM / OA / R1. Falls back to a pod-level snapshot until the accumulator has run.</p>
      <div class="eff-podcharts" id="effScreenPodCharts"></div>
      <div class="scroll-table"><table>
        <thead>
          <tr><th rowspan="2" style="min-width:260px">Pod / Department / Job</th><th colspan="3" class="stage-hdr">HM Screening</th><th colspan="3" class="stage-hdr">Online Assessment</th><th colspan="3" class="stage-hdr">R1</th></tr>
          <tr><th class="stage-sub">Added</th><th class="stage-sub">Cleared</th><th class="stage-sub">%</th><th class="stage-sub">Added</th><th class="stage-sub">Cleared</th><th class="stage-sub">%</th><th class="stage-sub">Added</th><th class="stage-sub">Cleared</th><th class="stage-sub">%</th></tr>
        </thead>
        <tbody id="effScreenBody"></tbody>
      </table></div>
    </div>

    <!-- PANEL: Throughput (mirrors HM) -->
    <div class="eff-panel" data-panel="throughput" style="display:none">
      <p class="sub-note"><strong>In</strong> = candidates who entered the stage, <strong>Out</strong> = candidates who moved past it, Throughput = Out/In % — from real stage history, live at <strong>Pod → Department → Job</strong>. Falls back to pending until the history accumulator has run.</p>
      <div style="display:flex;flex-wrap:wrap;gap:12px 16px;margin-bottom:12px;font-size:12px;align-items:center">
        <span style="font-weight:600;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:0.04em">Stages</span>
        ${TP_KEYS.map(k => `<label style="display:flex;align-items:center;gap:5px;cursor:pointer"><input type="checkbox" class="eff-tpStage" value="${k}" checked> ${TP_LABELS[k]}</label>`).join('')}
      </div>
      <div class="eff-podcharts" id="effTpPodCharts"></div>
      <div class="scroll-table"><table>
        <thead id="effTpHead"></thead>
        <tbody id="effTpBody"></tbody>
      </table></div>
    </div>

    <!-- PANEL: Time in Process -->
    <div class="eff-panel" data-panel="timeinprocess" style="display:none">
      <p class="sub-note"><strong>Median days a candidate is parked in each stage</strong>, <strong>Pod → Department → Job</strong>. Cells <span style="color:var(--red);font-weight:600">turn red above 5 days</span>. Hover a cell for mean &amp; sample size. <strong>App Review</strong> counts everyone currently parked there (today − applied date, full coverage); <strong>TA Screen → Offer</strong> come from real stage-transition history. Median is used (not mean) so a few candidates stuck 150+ days in App Review don't skew the stage.</p>
      <div class="scroll-table"><table>
        <thead id="effTisHead"></thead>
        <tbody id="effTisBody"></tbody>
      </table></div>
    </div>

    <!-- PANEL: Joining Conversion -->
    <div class="eff-panel" data-panel="joining" style="display:none">
      <p class="sub-note"><strong>Offered → Hired</strong>, live to the job level (Pod → Department → Job), attributed via the recruiters who worked each job.</p>
      <div class="eff-podcharts" id="effJoinPodCharts"></div>
      <div class="scroll-table"><table>
        <thead><tr><th style="min-width:260px">Pod / Department / Job</th><th>Offered</th><th>Hired</th><th>Conversion %</th></tr></thead>
        <tbody id="effJoinBody"></tbody>
      </table></div>
    </div>

    <!-- PANEL: Sourcing Mix -->
    <div class="eff-panel" data-panel="sourcing" style="display:none">
      <p class="sub-note"><strong>Pod → Source type → Source name</strong> (Ashby <code>source_type</code> → the specific <code>source</code>, e.g. <em>Indeed Listing</em>, <em>LinkedIn</em>), summed across pod members. Sources are a recruiter attribute, so the org-wide chart plus this pod tree are the honest grain; a department split needs per-job source from the pipeline.</p>
      <h3 class="subsection-title">Org-wide Channel Mix</h3>
      <div class="chart-wrap" style="max-width:400px;margin:0 auto 20px"><canvas id="effSourceChart"></canvas></div>
      <div class="scroll-table"><table>
        <thead><tr><th style="min-width:340px">Pod / Source type / Source name</th><th>Count</th><th>%</th></tr></thead>
        <tbody id="effSourceBody"></tbody>
      </table></div>
    </div>
  `;
}

export function initEfficiencyFilters(data) {
  if (!data || !data.funnel) return;
  const jobs = data.jobs || [];
  const recruiters = data.recruiters || [];
  // Stage-history rollups (true daily velocity by enteredStageAt + reached/cleared throughput). null until
  // the accumulator has run — the velocity/throughput panels fall back to pod-level snapshots when absent.
  const rollups = data.stageRollups || {};
  const velByJob = rollups.velocityByJob || null;
  const tpByJob = rollups.throughputByJob || null;
  const tisByJob = rollups.timeInStageByJob || null;         // {job8:{stage:{days:count}}} — TA Screen → Offer dwell
  const arDwellJob = data.appReviewDwellByJob || null;       // {job8:{days:count}} — App Review dwell (still-parked candidates)
  let activeTab = 'fulfilment';
  let msPod = null, msDept = null, msJob = null;

  const expandAll = () => !!document.getElementById('effExpandAll')?.checked;

  function selQuarter() {
    const y = document.getElementById('effYear')?.value;
    const q = document.getElementById('effQuarter')?.value;
    return (y && q) ? qKey(y, q) : currentQuarter();
  }

  // Recruiters mapped to a pod for the selected quarter — used only for the live capacity sums.
  function podMembers(pod, q) { return recruiters.filter(r => podOf(r.name, q) === pod); }
  function podCapacity(pod, q) { return podMembers(pod, q).reduce((s, r) => s + (capacityOf(r.name, q) || 0), 0); }

  // jobs[] keyed by 8-char id; recruiters[].byJob[].jobId is the full uuid → join on the prefix.
  const jobById = {}; jobs.forEach(j => { jobById[j.id] = j; });
  const jobMeta = (bj) => { const j = jobById[(bj.jobId || '').slice(0, 8)]; return { department: (j && j.department) || bj.department, title: (j && j.title) || bj.title, level: j && j.level, complexity: j && j.complexity }; };

  // Attribute every recruiter's byJob activity to their Pod → (parent) Department → Job for the quarter.
  // A job worked by recruiters across pods is split by each recruiter's own contribution (their offers/hires
  // land in their pod). Memoised per quarter. This is the backbone that makes the pod→dept→job cells real.
  let _treeQ = null, _tree = null;
  function getTree(q) {
    if (_treeQ === q && _tree) return _tree;
    const tree = {};
    recruiters.forEach(r => {
      const pod = podOf(r.name, q);
      (r.byJob || []).forEach(bj => {
        const m = jobMeta(bj);
        const dept = resolveDeptTeam(m.department || '').dept || (m.department || 'Unknown');
        const jid = ((bj.jobId || '').slice(0, 8)) || (m.title || '?');
        const P = tree[pod] || (tree[pod] = { depts: {} });
        const D = P.depts[dept] || (P.depts[dept] = { jobs: {} });
        const J = D.jobs[jid] || (D.jobs[jid] = { jid: jid, title: m.title || '(untitled)', level: m.level, complexity: m.complexity, dept, total: 0, offer: 0, hired: 0, score: scoreForRole(m, q) });
        J.total += bj.total || 0; J.offer += bj.offer || 0; J.hired += bj.hired || 0;
      });
    });
    _treeQ = q; _tree = tree;
    return tree;
  }
  const selDepts = () => (msDept ? msDept.getSelected() : []);
  const selJobs = () => (msJob ? msJob.getSelected() : []);
  // Filtered [{dept, jobs:[...]}] for a pod (honours Department/Job multi-selects), sorted.
  function podDeptJobs(pod, q) {
    const P = getTree(q)[pod]; if (!P) return [];
    const dsel = selDepts(), jsel = selJobs(); const out = [];
    Object.keys(P.depts).sort((a, b) => a.localeCompare(b)).forEach(dept => {
      if (dsel.length && !dsel.includes(dept)) return;
      const arr = Object.values(P.depts[dept].jobs).filter(j => !jsel.length || jsel.includes(j.title)).sort((a, b) => (b.total || 0) - (a.total || 0));
      if (arr.length) out.push({ dept, jobs: arr });
    });
    return out;
  }

  // Which pods are visible given the Pod multi-select ([] = all).
  function visiblePods() {
    const sel = msPod ? msPod.getSelected() : [];
    return POD_ORDER.filter(p => sel.length === 0 || sel.includes(p));
  }

  // Styled multi-select checkbox dropdown. Returns { getSelected }; empty selection = "All".
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

  const PENDING = 'Department → Job — pending job→pod attribution (pipeline)';

  // Skeleton body: Pod header rows + one pending child per pod. cellsFn(pod, q, isPodRow) returns the
  // metric <td>s for the pod row; the pending child fills metric columns with —.
  function podSkeletonBody(tbodyId, metricCols, cellsFn, grandRow) {
    const body = document.getElementById(tbodyId);
    if (!body) return;
    const pods = visiblePods();
    let html = '';
    pods.forEach((pod, pi) => {
      html += `<tr data-path="${pi}" data-haschild data-exp="0" style="cursor:pointer;background:var(--border-light)">
        <td style="font-weight:600">${CARET}${pod}</td>${cellsFn(pod)}</tr>`;
      html += `<tr data-path="${pi}-0" style="display:none">
        <td style="padding-left:32px;color:var(--muted);font-style:italic">${PENDING}</td>${dashTds(metricCols)}</tr>`;
    });
    if (grandRow) html += grandRow;
    body.innerHTML = html || `<tr><td colspan="${metricCols + 1}" style="text-align:center;color:var(--muted);padding:16px">No pods match the filter.</td></tr>`;
    wireTreePath(body, expandAll());
  }

  function renderFulfilment() {
    const q = selQuarter();
    const pods = visiblePods();
    fulfilTree(pods.filter(p => !isSalesPod(p)), 'offer');
    fulfilTree(pods.filter(p => isSalesPod(p)), 'hire');
    renderFulfilCharts(pods, q);
  }

  // Pod → Department → Job fulfilment table (LIVE). Assigned/Offered/Hired HC+Score from the attribution tree
  // × the score engine; Target = summed pod capacity (per quarter, Metric Config); Gap = max(0, Target −
  // Achieved), Achieved = Offered Score (Non-Sales) / Hired Score (Sales). Joining Pending is a pod-level count
  // (from the offer pass, per pod member) — per-dept/job Score is unattributable → —.
  function fulfilTree(podList, mode) {
    const q = selQuarter();
    const isSales = mode === 'hire';
    const ncol = isSales ? 10 : 8;
    const c = x => (x == null ? DASH : x);
    const cells = (v, bold) => {
      const w = bold ? ' style="font-weight:600"' : '';
      let s = `<td${w}>${c(v.aHC)}</td><td>${c(v.aSc)}</td><td>${c(v.tSc)}</td><td${w}>${c(v.oHC)}</td><td>${c(v.oSc)}</td><td>${c(v.jpHC)}</td><td>${c(v.jpSc)}</td>`;
      if (isSales) s += `<td${w}>${c(v.hHC)}</td><td>${c(v.hSc)}</td>`;
      s += `<td>${c(v.gSc)}</td>`;
      return s;
    };
    const agg = (jobs) => jobs.reduce((a, j) => { a.aHC += 1; a.aSc += j.score; a.oHC += j.offer; a.oSc += j.offer * j.score; a.hHC += j.hired; a.hSc += j.hired * j.score; return a; }, { aHC: 0, aSc: 0, oHC: 0, oSc: 0, hHC: 0, hSc: 0 });
    let html = '', grandTarget = 0;
    podList.forEach((pod, pi) => {
      const djs = podDeptJobs(pod, q);
      const pa = agg(djs.flatMap(d => d.jobs));
      const cap = podCapacity(pod, q); grandTarget += cap;
      const jp = podMembers(pod, q).reduce((s, r) => s + (r.joiningPending || 0), 0);
      const ach = isSales ? pa.hSc : pa.oSc;
      const podRow = { aHC: pa.aHC, aSc: pa.aSc, tSc: cap, oHC: pa.oHC, oSc: pa.oSc, jpHC: jp, jpSc: null, hHC: pa.hHC, hSc: pa.hSc, gSc: Math.max(0, cap - ach) };
      html += `<tr data-path="${pi}" data-haschild data-exp="0" style="cursor:pointer;background:var(--border-light)">
        <td style="font-weight:600">${CARET}${pod}<span style="color:var(--muted);font-weight:400;font-size:11px;margin-left:6px">Total of Pod</span></td>${cells(podRow, true)}</tr>`;
      djs.forEach(({ dept, jobs }, di) => {
        const da = agg(jobs);
        const deptRow = { aHC: da.aHC, aSc: da.aSc, tSc: null, oHC: da.oHC, oSc: da.oSc, jpHC: null, jpSc: null, hHC: da.hHC, hSc: da.hSc, gSc: null };
        html += `<tr data-path="${pi}-${di}" data-haschild data-exp="0" style="display:none;cursor:pointer">
          <td style="padding-left:30px;font-weight:500">${CARET}${dept}<span style="color:var(--muted);font-weight:400;font-size:11px;margin-left:6px">${jobs.length}</span></td>${cells(deptRow, false)}</tr>`;
        jobs.forEach((j, ji) => {
          const jv = { aHC: 1, aSc: j.score, tSc: null, oHC: j.offer, oSc: j.offer * j.score, jpHC: null, jpSc: null, hHC: j.hired, hSc: j.hired * j.score, gSc: null };
          html += `<tr data-path="${pi}-${di}-${ji}" style="display:none">
            <td style="padding-left:56px;color:var(--muted)">${j.title}<span style="font-size:10px;margin-left:6px;color:var(--muted)">${j.level || ''}${j.complexity ? ' · ' + j.complexity : ''} · ${j.score}pt</span></td>${cells(jv, false)}</tr>`;
        });
      });
    });
    html += `<tr style="background:var(--accent-light);font-weight:700"><td>Overall Total needed</td>${dashTds(2)}<td>${grandTarget || DASH}</td>${dashTds(ncol - 3)}</tr>`;
    const body = document.getElementById(isSales ? 'effFulfilHireBody' : 'effFulfilOfferBody');
    if (body) { body.innerHTML = html || `<tr><td colspan="${ncol + 1}" style="text-align:center;color:var(--muted);padding:16px">No pods in this group.</td></tr>`; wireTreePath(body, expandAll()); }
  }

  // Screening Added(reached)/Cleared(left)/% for HM / OA / R1. LIVE Pod→Dept→Job from throughputByJob when
  // present; else pod-level current-stage approximation (R1-cleared unknown).
  function renderScreening() {
    const q = selQuarter();
    const pods = visiblePods();
    const body = document.getElementById('effScreenBody'); if (!body) return;
    const pc = (n, d) => d ? ((n / d) * 100).toFixed(1) : '0.0';
    const cls = v => { const n = parseFloat(v); return n >= 50 ? 'good' : n >= 20 ? 'pct' : n > 0 ? 'warn' : 'zero'; };
    const SK = ['hmReview', 'oa', 'r1'];
    let html = '';
    if (tpByJob) {
      const jobTriple = (jid) => { const t = tpByJob[jid] || {}; return SK.map(k => { const c = t[k] || { reached: 0, cleared: 0 }; return { r: c.reached, c: c.cleared }; }); };
      const cells = (tr) => tr.map(s => `<td>${s.r}</td><td>${s.c}</td><td class="${cls(pc(s.c, s.r))}">${pc(s.c, s.r)}%</td>`).join('');
      const sumTr = (arrs) => SK.map((_, i) => arrs.reduce((a, t) => ({ r: a.r + t[i].r, c: a.c + t[i].c }), { r: 0, c: 0 }));
      pods.forEach((pod, pi) => {
        const podArrs = [];
        const deptRows = podDeptJobs(pod, q).map(({ dept, jobs: js }) => { const jtr = js.map(j => jobTriple(j.jid)); jtr.forEach(a => podArrs.push(a)); return { dept, js, jtr, deptSum: sumTr(jtr) }; });
        html += `<tr data-path="${pi}" data-haschild data-exp="0" style="cursor:pointer;background:var(--border-light)"><td style="font-weight:600">${CARET}${pod}</td>${cells(sumTr(podArrs))}</tr>`;
        deptRows.forEach(({ dept, js, jtr, deptSum }, di) => {
          html += `<tr data-path="${pi}-${di}" data-haschild data-exp="0" style="display:none;cursor:pointer"><td style="padding-left:30px;font-weight:500">${CARET}${dept}<span style="color:var(--muted);font-weight:400;font-size:11px;margin-left:6px">${js.length}</span></td>${cells(deptSum)}</tr>`;
          js.forEach((j, ji) => { html += `<tr data-path="${pi}-${di}-${ji}" style="display:none"><td style="padding-left:56px;color:var(--muted)">${j.title}</td>${cells(jtr[ji])}</tr>`; });
        });
      });
    } else {
      const scells = (hm, oa, r1) => { const hmC = Math.min(hm, oa), oaC = Math.min(oa, r1); return `<td>${hm}</td><td>${hmC}</td><td class="${cls(pc(hmC, hm))}">${pc(hmC, hm)}%</td><td>${oa}</td><td>${oaC}</td><td class="${cls(pc(oaC, oa))}">${pc(oaC, oa)}%</td><td>${r1}</td><td>${DASH}</td><td>${DASH}</td>`; };
      pods.forEach((pod, pi) => {
        const mem = podMembers(pod, q);
        const hm = mem.reduce((s, r) => s + (r.hm || 0), 0), oa = mem.reduce((s, r) => s + (r.oa || 0), 0), r1 = mem.reduce((s, r) => s + (r.r1 || 0), 0);
        html += `<tr data-path="${pi}" data-haschild data-exp="0" style="cursor:pointer;background:var(--border-light)"><td style="font-weight:600">${CARET}${pod}</td>${scells(hm, oa, r1)}</tr>`;
        html += `<tr data-path="${pi}-0" style="display:none"><td style="padding-left:32px;color:var(--muted);font-style:italic">Department → Job — awaiting the stage-history accumulator</td>${dashTds(9)}</tr>`;
      });
    }
    body.innerHTML = html || `<tr><td colspan="10" style="text-align:center;color:var(--muted);padding:16px">No pods match the filter.</td></tr>`;
    wireTreePath(body, expandAll());
  }

  function renderJoining() {
    const q = selQuarter();
    const pods = visiblePods();
    const body = document.getElementById('effJoinBody'); if (!body) return;
    const pc = (n, d) => d ? ((n / d) * 100).toFixed(1) : '0.0';
    let html = '';
    pods.forEach((pod, pi) => {
      const djs = podDeptJobs(pod, q);
      const po = djs.reduce((s, d) => s + d.jobs.reduce((a, j) => a + j.offer, 0), 0);
      const ph = djs.reduce((s, d) => s + d.jobs.reduce((a, j) => a + j.hired, 0), 0);
      html += `<tr data-path="${pi}" data-haschild data-exp="0" style="cursor:pointer;background:var(--border-light)">
        <td style="font-weight:600">${CARET}${pod}</td><td style="font-weight:600">${po || '<span class="zero">0</span>'}</td><td class="${ph > 0 ? 'good' : 'zero'}" style="font-weight:600">${ph}</td><td>${pc(ph, po)}%</td></tr>`;
      djs.forEach(({ dept, jobs }, di) => {
        const dpo = jobs.reduce((a, j) => a + j.offer, 0), dph = jobs.reduce((a, j) => a + j.hired, 0);
        html += `<tr data-path="${pi}-${di}" data-haschild data-exp="0" style="display:none;cursor:pointer">
          <td style="padding-left:30px;font-weight:500">${CARET}${dept}</td><td>${dpo}</td><td class="${dph > 0 ? 'good' : 'zero'}">${dph}</td><td>${pc(dph, dpo)}%</td></tr>`;
        jobs.forEach((j, ji) => {
          html += `<tr data-path="${pi}-${di}-${ji}" style="display:none">
            <td style="padding-left:56px;color:var(--muted)">${j.title}</td><td>${j.offer}</td><td class="${j.hired > 0 ? 'good' : 'zero'}">${j.hired}</td><td>${pc(j.hired, j.offer)}%</td></tr>`;
        });
      });
    });
    body.innerHTML = html || `<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:16px">No pods match the filter.</td></tr>`;
    wireTreePath(body, expandAll());
  }

  function renderThroughput() {
    const vis = TP_KEYS.filter(k => { const cb = document.querySelector(`.eff-tpStage[value="${k}"]`); return !cb || cb.checked; });
    const head = document.getElementById('effTpHead');
    if (head) {
      let r1 = '<tr><th rowspan="2" style="min-width:260px">Pod / Department / Job</th>';
      vis.forEach(k => { r1 += `<th colspan="3" class="stage-hdr">${TP_LABELS[k]}</th>`; });
      r1 += '</tr><tr>';
      vis.forEach(() => { r1 += '<th class="stage-sub">In</th><th class="stage-sub">Out</th><th class="stage-sub">%</th>'; });
      head.innerHTML = r1 + '</tr>';
    }
    const body = document.getElementById('effTpBody'); if (!body) return;
    if (!tpByJob) { podSkeletonBody('effTpBody', vis.length * 3, () => dashTds(vis.length * 3)); return; }
    // LIVE: In = reached (entered the stage), Out = cleared (left it) — from stage history, Pod → Dept → Job.
    const q = selQuarter(), pods = visiblePods();
    const pc = (n, d) => d ? ((n / d) * 100).toFixed(1) : '0.0';
    const cls = v => { const n = parseFloat(v); return n >= 50 ? 'good' : n >= 20 ? 'pct' : n > 0 ? 'warn' : 'zero'; };
    const jobRC = (jid) => { const t = tpByJob[jid] || {}; return vis.map(k => { const c = t[TP_TO_SK[k]] || { reached: 0, cleared: 0 }; return { r: c.reached, c: c.cleared }; }); };
    const cells = (rc) => rc.map(x => `<td>${x.r}</td><td>${x.c}</td><td class="${cls(pc(x.c, x.r))}">${pc(x.c, x.r)}%</td>`).join('');
    const sumRC = (arrs) => vis.map((_, i) => arrs.reduce((a, rc) => ({ r: a.r + rc[i].r, c: a.c + rc[i].c }), { r: 0, c: 0 }));
    let html = '';
    pods.forEach((pod, pi) => {
      const podArrs = [];
      const deptRows = podDeptJobs(pod, q).map(({ dept, jobs: js }) => {
        const jrc = js.map(j => jobRC(j.jid)); jrc.forEach(a => podArrs.push(a));
        return { dept, js, jrc, deptSum: sumRC(jrc) };
      });
      html += `<tr data-path="${pi}" data-haschild data-exp="0" style="cursor:pointer;background:var(--border-light)"><td style="font-weight:600">${CARET}${pod}</td>${cells(sumRC(podArrs))}</tr>`;
      deptRows.forEach(({ dept, js, jrc, deptSum }, di) => {
        html += `<tr data-path="${pi}-${di}" data-haschild data-exp="0" style="display:none;cursor:pointer"><td style="padding-left:30px;font-weight:500">${CARET}${dept}<span style="color:var(--muted);font-weight:400;font-size:11px;margin-left:6px">${js.length}</span></td>${cells(deptSum)}</tr>`;
        js.forEach((j, ji) => { html += `<tr data-path="${pi}-${di}-${ji}" style="display:none"><td style="padding-left:56px;color:var(--muted)">${j.title}</td>${cells(jrc[ji])}</tr>`; });
      });
    });
    body.innerHTML = html || `<tr><td colspan="${vis.length * 3 + 1}" style="text-align:center;color:var(--muted);padding:16px">No pods match the filter.</td></tr>`;
    wireTreePath(body, expandAll());
  }

  // ===== Time in Process (Pod → Department → Job; median days parked per stage, red > 5) =====
  function renderTimeInProcess() {
    const head = document.getElementById('effTisHead');
    if (head) {
      let h = '<tr><th style="min-width:260px">Pod / Department / Job</th>';
      TIS_STAGES.forEach(([, lbl]) => { h += `<th class="stage-sub" style="min-width:48px">${lbl}</th>`; });
      head.innerHTML = h + '</tr>';
    }
    const body = document.getElementById('effTisBody'); if (!body) return;
    if (!tisByJob && !arDwellJob) { podSkeletonBody('effTisBody', TIS_STAGES.length, () => dashTds(TIS_STAGES.length)); return; }
    const q = selQuarter(), pods = visiblePods();
    // Per job: one histogram per stage column. App Review from the main-pull dwell, other stages from stage history.
    const jobHists = (jid) => TIS_STAGES.map(([sk]) => sk === 'appReview'
      ? ((arDwellJob && arDwellJob[jid]) || {})
      : ((tisByJob && tisByJob[jid] && tisByJob[jid][sk]) || {}));
    const rowCells = (histArr) => histArr.map(hh => tisCell(hh, 5)).join('');
    const poolCells = (arrs) => TIS_STAGES.map((_, i) => tisCell(poolHists(arrs.map(a => a[i])), 5)).join('');
    let html = '';
    pods.forEach((pod, pi) => {
      const podArrs = [];
      const deptRows = podDeptJobs(pod, q).map(({ dept, jobs: js }) => {
        const jh = js.map(j => jobHists(j.jid)); jh.forEach(a => podArrs.push(a));
        return { dept, js, jh };
      });
      html += `<tr data-path="${pi}" data-haschild data-exp="0" style="cursor:pointer;background:var(--border-light)"><td style="font-weight:600">${CARET}${pod}</td>${poolCells(podArrs)}</tr>`;
      deptRows.forEach(({ dept, js, jh }, di) => {
        html += `<tr data-path="${pi}-${di}" data-haschild data-exp="0" style="display:none;cursor:pointer"><td style="padding-left:30px;font-weight:500">${CARET}${dept}<span style="color:var(--muted);font-weight:400;font-size:11px;margin-left:6px">${js.length}</span></td>${poolCells(jh)}</tr>`;
        js.forEach((j, ji) => { html += `<tr data-path="${pi}-${di}-${ji}" style="display:none"><td style="padding-left:56px;color:var(--muted)">${j.title}</td>${rowCells(jh[ji])}</tr>`; });
      });
    });
    body.innerHTML = html || `<tr><td colspan="${TIS_STAGES.length + 1}" style="text-align:center;color:var(--muted);padding:16px">No pods match the filter.</td></tr>`;
    wireTreePath(body, expandAll());
  }

  // ===== Submission Velocity (Pod → Department → Job → Stage; last 30 days of range, descending) =====
  function velDates() {
    const toV = document.getElementById('effVelTo')?.value;
    const fromV = document.getElementById('effVelFrom')?.value;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let end = toV ? new Date(toV + 'T00:00:00') : today;
    if (end > today) end = today;
    const start = fromV ? new Date(fromV + 'T00:00:00') : null;
    const out = [];
    for (let i = 0; i < 30; i++) { const d = new Date(end); d.setDate(end.getDate() - i); if (start && d < start) break; out.push(d); }
    return out;
  }
  function applyVelYearQuarter() {
    const y = document.getElementById('effYear')?.value || '';
    const q = document.getElementById('effQuarter')?.value || '';
    const fromEl = document.getElementById('effVelFrom'), toEl = document.getElementById('effVelTo');
    if (!fromEl || !toEl || (!y && !q)) return;
    const yr = y || String(new Date().getFullYear());
    if (q) {
      const qi = parseInt(q.slice(1), 10); const sm = (qi - 1) * 3 + 1; const em = sm + 2;
      const last = new Date(parseInt(yr, 10), em, 0).getDate();
      fromEl.value = `${yr}-${String(sm).padStart(2, '0')}-01`;
      toEl.value = `${yr}-${String(em).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
    } else { fromEl.value = `${yr}-01-01`; toEl.value = `${yr}-12-31`; }
  }
  function dkeyEff(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  // Pod-level daily submissions (OA/HM/R1), summed across pod members from recruiters[].daily. Dept/Job
  // per-day detail needs a job×stage×date rollup the pipeline doesn't emit → pending child row.
  function renderVelocity() {
    const head = document.getElementById('effVelHead');
    const body = document.getElementById('effVelBody');
    if (!body) return;
    const q = selQuarter();
    const pods = visiblePods();
    const dates = velDates();
    const dkeys = dates.map(dkeyEff);
    if (head) {
      let h = `<tr><th style="min-width:260px">Pod / Department / Job / Stage</th><th>Total · ${dates.length}d</th>`;
      dates.forEach(d => { h += `<th>${MON[d.getMonth()]} ${d.getDate()}</th>`; });
      head.innerHTML = h + '</tr>';
    }
    const VELS = [['oa', 'OA'], ['hmReview', 'HM Screening'], ['r1', 'R1']];
    const numRow = (t, pd, bold) => `<td${bold ? ' style="font-weight:600"' : ''}>${t > 0 ? t : '<span class="zero">0</span>'}</td>` + pd.map(v => `<td>${v > 0 ? v : '<span class="zero">·</span>'}</td>`).join('');
    const add = (dst, src) => { for (let i = 0; i < dst.length; i++) dst[i] += src[i]; };
    let html = '';
    if (velByJob) {
      // Full Pod → Department → Job → Stage from true stage-entry rollups (velocityByJob[job][stage][day]).
      pods.forEach((pod, pi) => {
        const podArr = new Array(dkeys.length).fill(0); let podTot = 0;
        const depts = podDeptJobs(pod, q).map(({ dept, jobs: js }) => {
          const dArr = new Array(dkeys.length).fill(0); let dTot = 0;
          const jd = js.map(j => {
            const jm = velByJob[j.jid] || {}; const jArr = new Array(dkeys.length).fill(0); let jTot = 0;
            const sd = VELS.map(([sk, label]) => { const m = jm[sk] || {}; let sTot = 0; const sArr = dkeys.map(dk => { const v = m[dk] || 0; sTot += v; return v; }); add(jArr, sArr); jTot += sTot; return { label, sArr, sTot }; });
            add(dArr, jArr); dTot += jTot; return { j, jArr, jTot, sd };
          });
          add(podArr, dArr); podTot += dTot; return { dept, jd, dArr, dTot };
        });
        html += `<tr data-path="${pi}" data-haschild data-exp="0" style="cursor:pointer;background:var(--border-light)"><td style="font-weight:600">${CARET}${pod}</td>${numRow(podTot, podArr, true)}</tr>`;
        depts.forEach(({ dept, jd, dArr, dTot }, di) => {
          html += `<tr data-path="${pi}-${di}" data-haschild data-exp="0" style="display:none;cursor:pointer"><td style="padding-left:30px;font-weight:500">${CARET}${dept}<span style="color:var(--muted);font-weight:400;font-size:11px;margin-left:6px">${jd.length}</span></td>${numRow(dTot, dArr, false)}</tr>`;
          jd.forEach(({ j, jArr, jTot, sd }, ji) => {
            html += `<tr data-path="${pi}-${di}-${ji}" data-haschild data-exp="0" style="display:none;cursor:pointer"><td style="padding-left:56px;color:var(--text)">${CARET}${j.title}</td>${numRow(jTot, jArr, false)}</tr>`;
            sd.forEach(({ label, sArr, sTot }, si) => {
              html += `<tr data-path="${pi}-${di}-${ji}-${si}" style="display:none"><td style="padding-left:82px;color:var(--muted)">${label}</td>${numRow(sTot, sArr, false)}</tr>`;
            });
          });
        });
      });
    } else {
      // fallback: pod-level from recruiters[].daily (snapshot) until the accumulator has run
      pods.forEach((pod, pi) => {
        const mem = podMembers(pod, q); const arr = new Array(dkeys.length).fill(0); let tot = 0;
        mem.forEach(r => VELS.forEach(([sk]) => { const m = (r.daily && r.daily[sk]) || {}; dkeys.forEach((dk, i) => { const v = m[dk] || 0; arr[i] += v; tot += v; }); }));
        html += `<tr data-path="${pi}" data-haschild data-exp="0" style="cursor:pointer;background:var(--border-light)"><td style="font-weight:600">${CARET}${pod}</td>${numRow(tot, arr, true)}</tr>`;
        html += `<tr data-path="${pi}-0" style="display:none"><td style="padding-left:32px;color:var(--muted);font-style:italic">Department → Job → Stage — awaiting the stage-history accumulator</td>${`<td>${DASH}</td>`.repeat(dkeys.length + 1)}</tr>`;
      });
    }
    body.innerHTML = html || `<tr><td colspan="${dkeys.length + 2}" style="text-align:center;color:var(--muted);padding:16px">No pods match the filter.</td></tr>`;
    wireTreePath(body, expandAll());
    renderPodCharts('effVelPodCharts', pods, velPodCfg, 'No submissions in range.');
  }

  // ===== Sourcing Mix — Pod → Department → Category → Source; org-wide chart is live =====
  // Pod → Source (source_type), summed across pod members from recruiters[].sources. Sources are a recruiter
  // attribute (not per-job), so the department split isn't available — Pod → Source is the honest grain here.
  function renderSourcing() {
    const q = selQuarter();
    const pods = visiblePods();
    const body = document.getElementById('effSourceBody');
    if (body) {
      const pc = (n, d) => d ? ((n / d) * 100).toFixed(1) : '0.0';
      // Pod → Source type → Source name, from recruiters[].srcNested { type: { name: count } }.
      const podNested = (pod) => { const agg = {}; podMembers(pod, q).forEach(r => {
        const sn = (r.srcNested && Object.keys(r.srcNested).length) ? r.srcNested : null;
        if (sn) { for (const t in sn) { const at = agg[t] || (agg[t] = {}); for (const nm in sn[t]) at[nm] = (at[nm] || 0) + sn[t][nm]; } }
        else { for (const [t, v] of Object.entries(r.sources || {})) { const at = agg[t] || (agg[t] = {}); at['(unspecified)'] = (at['(unspecified)'] || 0) + v; } }   // fallback until srcNested refresh
      }); return agg; };
      const sumNames = (names) => Object.values(names).reduce((a, v) => a + v, 0);
      const sumNested = (nst) => Object.values(nst).reduce((s, names) => s + sumNames(names), 0);
      const grand = pods.reduce((s, p) => s + sumNested(podNested(p)), 0) || 1;
      let html = '';
      pods.forEach((pod, pi) => {
        const nst = podNested(pod); const ptot = sumNested(nst);
        html += `<tr data-path="${pi}" data-haschild data-exp="0" style="cursor:pointer;background:var(--border-light)">
          <td style="font-weight:600">${CARET}${pod}</td><td style="font-weight:600">${ptot || '<span class="zero">0</span>'}</td><td>${pc(ptot, grand)}%</td></tr>`;
        const types = Object.entries(nst).map(([t, names]) => [t, sumNames(names), names]).sort((a, b) => b[1] - a[1]);
        if (types.length) {
          types.forEach(([t, tcnt, names], ti) => {
            html += `<tr data-path="${pi}-${ti}" data-haschild data-exp="0" style="display:none;cursor:pointer"><td style="padding-left:32px;font-weight:500">${CARET}${t}</td><td>${tcnt}</td><td>${pc(tcnt, ptot)}%</td></tr>`;
            Object.entries(names).sort((a, b) => b[1] - a[1]).forEach(([nm, cnt], ni) => {
              html += `<tr data-path="${pi}-${ti}-${ni}" style="display:none"><td style="padding-left:58px;color:var(--muted)">${nm}</td><td>${cnt}</td><td>${pc(cnt, tcnt)}%</td></tr>`;
            });
          });
        } else {
          html += `<tr data-path="${pi}-0" style="display:none"><td style="padding-left:32px;color:var(--muted);font-style:italic">No sourced applications</td><td>${DASH}</td><td>${DASH}</td></tr>`;
        }
      });
      body.innerHTML = html || `<tr><td colspan="3" style="text-align:center;color:var(--muted);padding:16px">No pods match the filter.</td></tr>`;
      wireTreePath(body, expandAll());
    }
    buildSourceChart();
  }

  // ===== charts =====
  const C = { blue: '#4E6BA6', green: '#398AA2', cyan: '#1E7590', amber: '#D8B5BE', slate: '#938FB8' };
  const gridY = { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 11 } } };

  // Per-pod chart placeholders (Y=Job lights up with the pipeline).
  let podCharts = {};
  const hbarOpts = (stacked, xtitle) => ({ indexAxis: 'y', responsive: true, maintainAspectRatio: false,
    plugins: { legend: stacked ? { position: 'top', align: 'end', labels: { usePointStyle: true, pointStyle: 'rect', boxWidth: 9, boxHeight: 9, font: { size: 9 }, padding: 6 } } : { display: false } },
    scales: { x: { ...gridY, stacked, ticks: { font: { size: 10 } }, title: xtitle ? { display: true, text: xtitle, font: { size: 10 }, color: '#64748b' } : undefined }, y: { stacked, grid: { display: false }, ticks: { font: { size: 10 } } } } });

  // One small chart per pod. buildCfg(pod) → a Chart.js config (optional _h = fixed height px) or null (empty).
  function renderPodCharts(containerId, pods, buildCfg, emptyText) {
    const el = document.getElementById(containerId); if (!el) return;
    (podCharts[containerId] || []).forEach(c => { try { c.destroy(); } catch (e) {} }); podCharts[containerId] = [];
    el.innerHTML = pods.map((p, i) => `<div class="eff-podchart"><h5>${p}</h5><div class="eff-podchart-body" id="${containerId}_b${i}" style="position:relative"><canvas id="${containerId}_${i}"></canvas></div></div>`).join('');
    pods.forEach((p, i) => {
      const cfg = buildCfg(p);
      const body = document.getElementById(`${containerId}_b${i}`), ctx = document.getElementById(`${containerId}_${i}`);
      if (!body || !ctx) return;
      if (!cfg) { body.innerHTML = `<p style="font-size:11px;color:var(--muted);margin:6px 0 0;line-height:1.5">${emptyText}</p>`; return; }
      body.style.height = (cfg._h || Math.max(90, cfg.data.labels.length * 22 + 34)) + 'px';
      delete cfg._h;
      podCharts[containerId].push(new Chart(ctx, cfg));
    });
  }

  // Per-tab per-pod chart builders (Y = Job where a job grain exists; else pod-level).
  const fulfilPodCfg = (pod) => {
    const q = selQuarter(), isSales = isSalesPod(pod);
    const jobs = podDeptJobs(pod, q).flatMap(d => d.jobs).map(j => ({ t: j.title, v: isSales ? j.hired * j.score : j.offer * j.score })).filter(x => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 10);
    if (!jobs.length) return null;
    return { type: 'bar', data: { labels: jobs.map(j => j.t), datasets: [{ label: isSales ? 'Hired Score' : 'Offered Score', data: jobs.map(j => j.v), backgroundColor: C.blue, borderRadius: 3, barPercentage: 0.75 }] }, options: hbarOpts(false, isSales ? 'Hired Score' : 'Offered Score') };
  };
  const joinPodCfg = (pod) => {
    const jobs = podDeptJobs(pod, selQuarter()).flatMap(d => d.jobs).filter(j => j.offer > 0).sort((a, b) => b.offer - a.offer).slice(0, 10);
    if (!jobs.length) return null;
    return { type: 'bar', data: { labels: jobs.map(j => j.title), datasets: [
      { label: 'Hired', data: jobs.map(j => j.hired), backgroundColor: C.green, stack: 'j', borderRadius: 2 },
      { label: 'Offered', data: jobs.map(j => Math.max(0, j.offer - j.hired)), backgroundColor: '#B4D3DC', stack: 'j', borderRadius: 2 }] }, options: hbarOpts(true, 'Candidates') };
  };
  const velPodCfg = (pod) => {
    const q = selQuarter(), dates = velDates(), dk = dates.map(dkeyEff);
    let per;
    if (velByJob) {
      const jids = podDeptJobs(pod, q).flatMap(d => d.jobs).map(j => j.jid);
      per = dk.map(k => jids.reduce((s, jid) => { const jm = velByJob[jid] || {}; return ['oa', 'hmReview', 'r1'].reduce((ss, sk) => ss + (((jm[sk] || {})[k]) || 0), s); }, 0));
    } else {
      const mem = podMembers(pod, q);
      per = dk.map(k => mem.reduce((s, r) => ['oa', 'hmReview', 'r1'].reduce((ss, sk) => ss + ((((r.daily && r.daily[sk]) || {})[k]) || 0), s), 0));
    }
    if (per.every(v => v === 0)) return null;
    const labels = dates.map(d => `${MON[d.getMonth()]} ${d.getDate()}`).reverse();
    return { _h: 140, type: 'bar', data: { labels, datasets: [{ label: 'Submissions', data: per.slice().reverse(), backgroundColor: C.blue, borderRadius: 2, barPercentage: 0.9 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { font: { size: 9 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } }, y: { ...gridY } } } };
  };
  const screenPodCfg = (pod) => {
    const q = selQuarter();
    let hmR, hmC, oaR, oaC, r1R, r1C;
    if (tpByJob) {
      const jids = podDeptJobs(pod, q).flatMap(d => d.jobs).map(j => j.jid);
      const agg = (k) => jids.reduce((a, jid) => { const c = (tpByJob[jid] || {})[k] || { reached: 0, cleared: 0 }; return { r: a.r + c.reached, c: a.c + c.cleared }; }, { r: 0, c: 0 });
      const hm = agg('hmReview'), oa = agg('oa'), r1 = agg('r1');
      hmR = hm.r; hmC = hm.c; oaR = oa.r; oaC = oa.c; r1R = r1.r; r1C = r1.c;
    } else {
      const mem = podMembers(pod, q);
      hmR = mem.reduce((s, r) => s + (r.hm || 0), 0); oaR = mem.reduce((s, r) => s + (r.oa || 0), 0); r1R = mem.reduce((s, r) => s + (r.r1 || 0), 0);
      hmC = Math.min(hmR, oaR); oaC = Math.min(oaR, r1R); r1C = 0;
    }
    if (hmR + oaR + r1R === 0) return null;
    return { _h: 150, type: 'bar', data: { labels: ['HM', 'OA', 'R1'], datasets: [
      { label: 'Added', data: [hmR, oaR, r1R], backgroundColor: C.blue, borderRadius: 2 },
      { label: 'Cleared', data: [hmC, oaC, r1C], backgroundColor: C.green, borderRadius: 2 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', align: 'end', labels: { usePointStyle: true, pointStyle: 'rect', boxWidth: 9, boxHeight: 9, font: { size: 9 }, padding: 6 } } }, scales: { x: { grid: { display: false }, ticks: { font: { size: 10 } } }, y: { ...gridY } } } };
  };

  function renderFulfilCharts(pods, q) {
    // Per-pod chart (Y=Job, Offered/Hired Score) + a combined chart of pod Target (summed capacity).
    renderPodCharts('effFulfilPodCharts', pods, fulfilPodCfg, 'No offers/hires yet for this pod.');
    const ctx = document.getElementById('effFulfilCombined'); if (!ctx) return;
    if (effFulfilCombined) effFulfilCombined.destroy();
    const rows = pods.map(p => ({ pod: p, cap: podCapacity(p, q) })).filter(r => r.cap > 0);
    const wrap = ctx.parentElement;
    let emptyMsg = wrap && wrap.querySelector('.chart-empty');
    if (rows.length === 0) {
      ctx.style.display = 'none';
      if (wrap && !emptyMsg) { emptyMsg = document.createElement('div'); emptyMsg.className = 'chart-empty'; emptyMsg.style.cssText = 'display:flex;align-items:center;justify-content:center;min-height:120px;color:var(--muted);font-size:13px;text-align:center;padding:20px'; wrap.appendChild(emptyMsg); }
      if (emptyMsg) { emptyMsg.textContent = `No pod capacities set for ${q.replace('-', ' ')} — set them in Admin → Metric Configuration.`; emptyMsg.style.display = 'flex'; }
      return;
    }
    ctx.style.display = ''; if (emptyMsg) emptyMsg.style.display = 'none';
    effFulfilCombined = new Chart(ctx, { type: 'bar',
      data: { labels: rows.map(r => r.pod), datasets: [{ label: 'Target (summed capacity)', data: rows.map(r => r.cap), backgroundColor: C.blue, borderRadius: 4, barPercentage: 0.6 }] },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', align: 'center', labels: { usePointStyle: true, pointStyle: 'rect', boxWidth: 11, boxHeight: 11, font: { size: 12 } } } },
        scales: { x: { ...gridY, title: { display: true, text: 'Target Score', font: { size: 11 }, color: '#64748b' } }, y: { grid: { display: false }, ticks: { font: { size: 11, weight: '500' } } } } } });
  }

  function buildSourceChart() {
    const ctx = document.getElementById('effSourceChart'); if (!ctx) return;
    if (effSourceChart) effSourceChart.destroy();
    const sources = (data.sources || []).filter(s => (s.candidates || 0) > 0);
    const wrap = ctx.parentElement;
    let emptyMsg = wrap && wrap.querySelector('.chart-empty');
    if (sources.length === 0) {
      ctx.style.display = 'none';
      if (wrap && !emptyMsg) { emptyMsg = document.createElement('div'); emptyMsg.className = 'chart-empty'; emptyMsg.style.cssText = 'display:flex;align-items:center;justify-content:center;min-height:120px;color:var(--muted);font-size:13px;text-align:center;padding:20px'; wrap.appendChild(emptyMsg); }
      if (emptyMsg) { emptyMsg.textContent = 'No source data available yet.'; emptyMsg.style.display = 'flex'; }
      return;
    }
    ctx.style.display = ''; if (emptyMsg) emptyMsg.style.display = 'none';
    const colorMap = { Referral: '#4E6BA6', Inbound: '#398AA2', Sourced: '#D8B5BE', Internal: '#938FB8' };
    effSourceChart = new Chart(ctx, { type: 'doughnut',
      data: { labels: sources.map(s => s.name), datasets: [{ data: sources.map(s => s.candidates), backgroundColor: sources.map(s => colorMap[s.name] || '#A9CAD6') }] },
      options: { responsive: true, plugins: { legend: { position: 'bottom' } } } });
  }

  function renderActive() {
    if (activeTab === 'fulfilment') renderFulfilment();
    else if (activeTab === 'velocity') renderVelocity();
    else if (activeTab === 'screening') { renderScreening(); renderPodCharts('effScreenPodCharts', visiblePods(), screenPodCfg, 'No stage activity.'); }
    else if (activeTab === 'throughput') { renderThroughput(); renderPodCharts('effTpPodCharts', visiblePods(), () => null, 'Per-stage throughput chart — pending job×stage rollup (pipeline).'); }
    else if (activeTab === 'timeinprocess') renderTimeInProcess();
    else if (activeTab === 'joining') { renderJoining(); renderPodCharts('effJoinPodCharts', visiblePods(), joinPodCfg, 'No offers yet.'); }
    else if (activeTab === 'sourcing') renderSourcing();
  }

  function renderAll() {
    // Re-render every panel so switching tabs shows current filters immediately.
    renderFulfilment();
    renderVelocity();
    renderScreening(); renderPodCharts('effScreenPodCharts', visiblePods(), screenPodCfg, 'No stage activity.');
    renderThroughput(); renderPodCharts('effTpPodCharts', visiblePods(), () => null, 'Per-stage throughput chart — pending job×stage rollup (pipeline).');
    renderJoining(); renderPodCharts('effJoinPodCharts', visiblePods(), joinPodCfg, 'No offers yet.');
    renderSourcing();
  }

  function showTab(name) {
    activeTab = name;
    document.querySelectorAll('.eff-subtab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.eff-panel').forEach(p => { p.style.display = p.dataset.panel === name ? '' : 'none'; });
    renderActive();
  }
  document.querySelectorAll('.eff-subtab').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));

  // Filters
  const deptNames = [...new Set(jobs.map(j => resolveDeptTeam(j.department).dept).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const jobNames = [...new Set(jobs.map(j => j.title || j.name || j.job).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  msPod = makeMultiSelect(document.getElementById('effMsPod'), 'Pod', POD_ORDER, renderAll);
  msDept = makeMultiSelect(document.getElementById('effMsDept'), 'Department', deptNames, renderAll);
  msJob = makeMultiSelect(document.getElementById('effMsJob'), 'Job', jobNames, renderAll);
  document.addEventListener('click', () => document.querySelectorAll('.ms-panel').forEach(p => p.style.display = 'none'));
  document.getElementById('effExpandAll')?.addEventListener('change', renderAll);
  document.querySelectorAll('.eff-tpStage').forEach(cb => cb.addEventListener('change', renderThroughput));

  ['effVelFrom', 'effVelTo'].forEach(id => document.getElementById(id)?.addEventListener('change', renderVelocity));
  ['effYear', 'effQuarter'].forEach(id => document.getElementById(id)?.addEventListener('change', () => { applyVelYearQuarter(); renderAll(); }));

  // Default Year+Quarter to current
  const vy = document.getElementById('effYear'), vq = document.getElementById('effQuarter');
  if (vy) { const nowY = String(new Date().getFullYear()); vy.value = [...vy.options].some(o => o.value === nowY) ? nowY : (vy.options[1] ? vy.options[1].value : ''); }
  if (vq) vq.value = 'Q' + (Math.floor(new Date().getMonth() / 3) + 1);
  applyVelYearQuarter();

  renderAll();
  showTab('fulfilment');
}
