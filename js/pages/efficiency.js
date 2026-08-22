import { podOf, POD_OPTIONS, isSalesPod, capacityOf, currentQuarter, qKey } from '../recruiter-pods.js';
import { resolveDeptTeam } from '../dept-map.js';
import { TIS_STAGES, poolHists, tisCell, periodQuarters, hasQuarterTis, tisHist, APP_REVIEW_LIVE_NOTE } from '../stage-time.js';
import { scoreForRole } from '../score-model.js';

// Overall Efficiency = everything Recruiter Efficiency has, but the Recruiter dimension is replaced by
// Department. Trees are Department → Job; charts are one-per-department with Y = Job, plus an overall. (Pods were dropped 2026-08-21 — see #18.) Formerly pods mapped to
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
// The three stages Momentum reports on, in work order. One definition for both the table and the chart.
const VEL_STAGES_EFF = [['hmReview', 'HM Screening'], ['oa', 'OA'], ['r1', 'R1']];
const TP_TO_SK = { app:'appReview', hc:'helloChristy', ta:'taScreen', hm:'hmReview', oa:'oa', r1:'r1', r2:'r2', r3:'r3', r4:'r4', r5:'r5', rc:'refCheck', ds:'docSub', offer:'offer' };

function dashTds(n) { return `<td>${DASH}</td>`.repeat(n); }

// Generic N-level collapsible tree. Rows carry data-path ("0", "0-1", "0-1-2"…) + data-haschild for
// expandable rows. Clicking shows only direct children; collapsing hides + resets all descendants.
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

      /* per-department chart cards */
      .eff-podcharts { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:12px; margin-bottom:18px; }
      /* Fulfilment: two per row — five across made every bar unreadable. */
      .eff-podcharts.eff-2col { grid-template-columns:repeat(2,minmax(0,1fr)); }
      @media (max-width:900px) { .eff-podcharts.eff-2col { grid-template-columns:1fr; } }
      .eff-podchart { border:1px solid var(--border); border-radius:10px; padding:14px 16px; background:var(--card); min-height:110px;
        display:flex; flex-direction:column; gap:6px; }
      .eff-podchart h5 { font-size:12px; font-weight:600; color:var(--text); margin:0; }
      .eff-podchart p { font-size:11px; color:var(--muted); margin:0; line-height:1.5; }
    </style>

    <h2 class="section-title">Overall Efficiency</h2>
    <p class="sub-note" style="margin-top:-8px;">The Recruiter Efficiency views, aggregated <strong>without the recruiter</strong> — trees are <strong>Department → Job</strong>. Jobs are attributed to a pod via the recruiters who worked them. <strong>Fulfilment</strong>, <strong>Joining Conversion</strong>, <strong>Momentum</strong> (Dept→Job→Stage) and <strong>Throughput</strong> are live to the job level (both from real stage history); <strong>Screening / Sourcing</strong> are pod-level. Year/Quarter drives pod grouping + capacity.</p>

    <div class="eff-filters">
      <div class="fchip"><span class="lbl">Department</span><div class="ms" id="effMsDept"></div></div>
      <div class="fchip"><span class="lbl">Job</span><div class="ms" id="effMsJob"></div></div>
      <div class="fchip"><label class="opt"><input type="checkbox" id="effExpandAll" checked> Expand all branches</label></div>
      <span class="fdiv"></span>
      <div class="fchip"><span class="lbl">From</span><input type="date" id="effVelFrom"></div>
      <div class="fchip"><span class="lbl">To</span><input type="date" id="effVelTo"></div>
      <div class="fchip"><span class="lbl">Year</span><select id="effYear"><option value="">All</option>${years.map(y => `<option value="${y}">${y}</option>`).join('')}</select></div>
      <div class="fchip"><span class="lbl">Quarter</span><select id="effQuarter"><option value="">All</option><option value="Q1">Q1</option><option value="Q2">Q2</option><option value="Q3">Q3</option><option value="Q4">Q4</option></select></div>
    </div>

    <div class="eff-subtabs">
      <button class="eff-subtab active" data-tab="fulfilment">Fulfilment</button>
      <button class="eff-subtab" data-tab="velocity">Momentum</button>
      <button class="eff-subtab" data-tab="screening">Screening Efficiency</button>
      <button class="eff-subtab" data-tab="throughput">Throughput</button>
      <button class="eff-subtab" data-tab="timeinprocess">Time in Process</button>
      <button class="eff-subtab" data-tab="joining">Joining Conversion</button>
      <button class="eff-subtab" data-tab="sourcing">Sourcing Mix</button>
    </div>

    <!-- PANEL: Fulfilment -->
    <div class="eff-panel" data-panel="fulfilment">
      <p class="sub-note"><strong>Total Positions</strong> = distinct openings opened in the quarter. It splits three ways —
        <strong>Joined</strong> (filled) + <strong>Joining Pending</strong> (offer out, start date ahead) + <strong>Gap</strong> (still to fill) —
        so the bar and the table say the same thing. <strong>Score</strong> is the position count × the role's score
        (Family + Level + Complexity → grid, per <strong>Admin → Metric Configuration</strong>). A role with no Level or
        Complexity in Ashby scores nothing and is marked <span style="color:var(--orange)">unscored</span>; its headcount still counts.
        See <strong>Recruiter Efficiency → Data Hygiene → Roles Missing Score Inputs</strong>.</p>
      <div class="eff-podcharts eff-2col" id="effFulfilPodCharts"></div>
      <h4 id="effFulfilCombinedHdr" style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.04em;margin:14px 0 6px">All departments</h4>
      <div class="chart-wrap" id="effFulfilCombinedWrap" style="margin:0 0 18px"><canvas id="effFulfilCombined"></canvas></div>

      <div class="scroll-table"><table class="metrics">
        <thead>
          <tr><th rowspan="2" style="min-width:280px">Department / Job</th><th colspan="2" class="stage-hdr">Total Positions</th><th colspan="2" class="stage-hdr">Joined</th><th colspan="2" class="stage-hdr">Joining Pending</th><th colspan="2" class="stage-hdr">Gap</th></tr>
          <tr><th class="stage-sub">HC</th><th class="stage-sub">Score</th><th class="stage-sub">HC</th><th class="stage-sub">Score</th><th class="stage-sub">HC</th><th class="stage-sub">Score</th><th class="stage-sub">HC</th><th class="stage-sub">Score</th></tr>
        </thead>
        <tbody id="effFulfilBody"></tbody>
      </table></div>

      <h4 style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.04em;margin:22px 0 6px">Joining Pending — Cases</h4>
      <p class="sub-note" style="margin-top:0">Everyone with an offer in play: Reference Check, Documentation or Offer. Same list as the Hiring Manager tab, scoped to the Department/Job filters above. <strong>Unlinked</strong> rows have no opening attached in Ashby, so they are invisible to the position counts — fix those first.</p>
      <div class="scroll-table"><table>
        <thead><tr><th>DOJ</th><th style="min-width:160px">Candidate</th><th style="min-width:150px">Department</th><th style="min-width:200px">Job</th><th>Sub-stage</th><th>Recruiter</th><th>Opening</th></tr></thead>
        <tbody id="effFulfilJPBody"></tbody>
      </table></div>
    </div>

    <!-- PANEL: Momentum (ex-"Submission Velocity", renamed 2026-08-21) -->
    <div class="eff-panel" data-panel="velocity" style="display:none">
      <p class="sub-note" id="effVelUntracked" style="display:none;color:var(--orange)"></p>
      <p class="sub-note">Momentum is the <strong>pace of work</strong> — how many candidates were pushed into each of the three stages that recruiters actually drive, day by day. Counted by true <strong>stage-entry date</strong> from stage history, so a bulk update does not show up as a spike. <strong>Department → Job → Stage</strong> (HM Screening / OA / R1), daily over the last 30 days of the range. Falls back to pending until the history accumulator has run.</p>
      <div class="eff-podcharts eff-2col" id="effVelPodCharts"></div>
      <div class="scroll-table"><table class="evel-table">
        <thead id="effVelHead"></thead>
        <tbody id="effVelBody"></tbody>
      </table></div>
    </div>

    <!-- PANEL: Screening Efficiency -->
    <div class="eff-panel" data-panel="screening" style="display:none">
      <p class="sub-note">Added = reached the stage, Cleared = transitioned out (reached the next stage), from real stage history — live at <strong>Department → Job</strong> across the funnel; the per-department charts show Added vs Cleared per stage. Falls back to pending until the accumulator has run.</p>
      <div class="eff-podcharts eff-2col" id="effScreenPodCharts"></div>
      <div class="scroll-table"><table>
        <thead>
          <tr><th rowspan="2" style="min-width:260px">Department / Job</th><th colspan="3" class="stage-hdr">HM Screening</th><th colspan="3" class="stage-hdr">Online Assessment</th><th colspan="3" class="stage-hdr">R1</th></tr>
          <tr><th class="stage-sub">Added</th><th class="stage-sub">Cleared</th><th class="stage-sub">%</th><th class="stage-sub">Added</th><th class="stage-sub">Cleared</th><th class="stage-sub">%</th><th class="stage-sub">Added</th><th class="stage-sub">Cleared</th><th class="stage-sub">%</th></tr>
        </thead>
        <tbody id="effScreenBody"></tbody>
      </table></div>
    </div>

    <!-- PANEL: Throughput (mirrors HM) -->
    <div class="eff-panel" data-panel="throughput" style="display:none">
      <p class="sub-note"><strong>In</strong> = candidates who entered the stage, <strong>Out</strong> = candidates who moved past it, Throughput = Out/In % — from real stage history, live at <strong>Department → Job</strong>. Falls back to pending until the history accumulator has run.</p>
      <div style="display:flex;flex-wrap:wrap;gap:12px 16px;margin-bottom:12px;font-size:12px;align-items:center">
        <span style="font-weight:600;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:0.04em">Stages</span>
        ${TP_KEYS.map(k => `<label style="display:flex;align-items:center;gap:5px;cursor:pointer"><input type="checkbox" class="eff-tpStage" value="${k}" checked> ${TP_LABELS[k]}</label>`).join('')}
      </div>
      <div class="eff-podcharts eff-2col" id="effTpPodCharts"></div>
      <div class="scroll-table"><table>
        <thead id="effTpHead"></thead>
        <tbody id="effTpBody"></tbody>
      </table></div>
    </div>

    <!-- PANEL: Time in Process -->
    <div class="eff-panel" data-panel="timeinprocess" style="display:none">
      <p class="sub-note" id="effTisNote" style="display:none"></p>
      <p class="sub-note"><strong>Median days a candidate is parked in each stage</strong>, <strong>Department → Job</strong>. Cells <span style="color:var(--red);font-weight:600">turn red above 5 days</span>. Hover a cell for mean &amp; sample size. <strong>App Review</strong> counts everyone currently parked there (today − applied date, full coverage); <strong>TA Screen → Offer</strong> come from real stage-transition history. Median is used (not mean) so a few candidates stuck 150+ days in App Review don't skew the stage.</p>
      <div class="scroll-table"><table>
        <thead id="effTisHead"></thead>
        <tbody id="effTisBody"></tbody>
      </table></div>
    </div>

    <!-- PANEL: Joining Conversion -->
    <div class="eff-panel" data-panel="joining" style="display:none">
      <p class="sub-note"><strong>Offered → Hired</strong>, live to the job level (Department → Job), attributed via the recruiters who worked each job.</p>
      <div class="eff-podcharts eff-2col" id="effJoinPodCharts"></div>
      <div class="scroll-table"><table>
        <thead><tr><th style="min-width:260px">Department / Job</th><th>Offered</th><th>Hired</th><th>Conversion %</th></tr></thead>
        <tbody id="effJoinBody"></tbody>
      </table></div>
    </div>

    <!-- PANEL: Sourcing Mix -->
    <div class="eff-panel" data-panel="sourcing" style="display:none">
      <p class="sub-note" id="effSourceNote"></p>
      <p class="sub-note" id="effSourceWarn" style="display:none;color:var(--orange);margin-top:-6px"></p>
      <h3 class="subsection-title">Channel Mix — source names within each type</h3>
      <div class="chart-wrap" style="max-width:840px;margin:0 auto 20px;height:460px;position:relative"><canvas id="effSourceChart"></canvas></div>
      <div class="scroll-table"><table>
        <thead><tr><th style="min-width:340px" id="effSourceTh">Pod / Source type / Source name</th><th>Count</th><th>%</th></tr></thead>
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
  const tisByJobQ = rollups.timeInStageByJobQ || null;       // {job8:{stage:{quarter:{days:count}}}} — same, per quarter entered
  const tisHasQ = hasQuarterTis(rollups);
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

  // ===== #18: Department → Job, pods removed =====
  // Overall Efficiency used to hang everything off Pod, which forced a fudge: getTree attributes each job to
  // a pod via the recruiters who worked it, so a job worked from two pods was SPLIT across them. Every job
  // belongs to exactly one department, so flattening pods away removes the split entirely — department
  // totals become clean sums over jobs. Pods live on in Recruiter Efficiency, where they mean something.
  let _dtQ = null, _dt = null;
  function deptTree(q) {
    if (_dtQ === q && _dt) return _dt;
    const tree = getTree(q);
    const byDept = {};
    Object.values(tree).forEach(P => Object.entries(P.depts).forEach(([dept, D]) => {
      const T = byDept[dept] || (byDept[dept] = {});
      Object.values(D.jobs).forEach(j => {
        // Merge the same job seen under several pods back into one row.
        // A job id that applications reference but /job.list never returned arrives with a blank title —
        // it was a DRAFT job (confirmed 2026-08-21). Name it explicitly so its candidates stay visible
        // instead of collapsing into an anonymous "(untitled)" row nobody can act on.
        const known = j.title && j.title !== '(untitled)';
        const title = known ? j.title : `Unknown job (${j.jid}) — not in Ashby's job list`;
        const e = T[j.jid] || (T[j.jid] = { jid: j.jid, title, unknown: !known, dept, level: j.level, complexity: j.complexity, score: j.score, total: 0, offer: 0, hired: 0 });
        e.total += j.total || 0; e.offer += j.offer || 0; e.hired += j.hired || 0;
      });
    }));
    // Openings are sourced all-time, but a job only enters the tree above if a recruiter worked it inside
    // the scoped year. So an opening raised this quarter on a role whose applications all predate the scope
    // got no row at all and its positions vanished from Fulfilment — while Overview and the HM tab, which
    // read openingBuckets directly, kept counting them. Measured 2026-08-22: 2026-Q1 read 191 positions /
    // 175 joined against a true 195 / 179, and 2026-Q2 read 112 against 118. Seed those jobs from the
    // buckets, flagged openingOnly so ONLY Fulfilment shows them — the activity sub-tabs have nothing to
    // say about a job with no candidates.
    const seen = new Set();
    Object.values(byDept).forEach(T => Object.keys(T).forEach(jid => seen.add(jid)));
    Object.entries(data.openingBuckets || {}).forEach(([jid, b]) => {
      if (seen.has(jid)) return;
      const qq = b.quarters && b.quarters[q];
      if (!qq || !(qq.total > 0)) return;
      const raw = b.department || '';
      const dept = (raw && resolveDeptTeam(raw).dept) || 'Unknown';
      const known = !!b.title;
      const T = byDept[dept] || (byDept[dept] = {});
      T[jid] = {
        jid, dept, openingOnly: true, unknown: !known,
        title: known ? b.title : `Unknown job (${jid}) — not in Ashby's job list`,
        level: undefined, complexity: undefined,
        score: scoreForRole({ department: raw, title: b.title }, q),
        total: 0, offer: 0, hired: 0
      };
    });
    _dtQ = q; _dt = byDept;
    return byDept;
  }

  // Openings for a job in the selected quarter — the seat count the role score is multiplied by.
  const openBuckets = data.openingBuckets || {};
  function openingsOf(jid, q) {
    const b = openBuckets[jid]; if (!b || !b.quarters) return 0;
    const qq = b.quarters[q]; return qq ? (qq.total || 0) : 0;
  }
  // A role scores only when Ashby has BOTH Level and Complexity. Missing either and it scores nothing, so it
  // is marked and excluded from Target rather than quietly contributing 0 — see Data Hygiene → Roles Missing
  // Score Inputs. Level 'NA' is how Ashby represents unset here, so it counts as missing.
  const isScoreable = (j) => !!(j.level && j.level !== 'NA' && j.complexity);

  // [{dept, jobs:[...]}] honouring the Department/Job multi-selects, sorted by department load.
  // withOpeningOnly adds the jobs that exist only as openings (no candidate activity in scope). Fulfilment
  // needs them to reach its true position count; every other sub-tab would just gain permanently empty rows.
  function deptJobs(q, withOpeningOnly) {
    const dsel = selDepts(), jsel = selJobs();
    const t = deptTree(q);
    const out = [];
    Object.keys(t).forEach(dept => {
      if (dsel.length && !dsel.includes(dept)) return;
      const arr = Object.values(t[dept])
        .filter(j => withOpeningOnly || !j.openingOnly)
        .filter(j => !jsel.length || jsel.includes(j.title))
        .map(j => ({ ...j, openings: openingsOf(j.jid, q), scoreable: isScoreable(j) }))
        .sort((a, b) => (b.total || 0) - (a.total || 0));
      if (arr.length) out.push({ dept, jobs: arr });
    });
    out.sort((a, b) => b.jobs.reduce((s, j) => s + j.total, 0) - a.jobs.reduce((s, j) => s + j.total, 0));
    return out;
  }

  // Which pods are visible given the Pod multi-select ([] = all).
  function visiblePods() {
    const sel = msPod ? msPod.getSelected() : [];
    return POD_ORDER.filter(p => sel.length === 0 || sel.includes(p));
  }

  // Styled multi-select checkbox dropdown. Returns { getSelected }; empty selection = "All".
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

  const PENDING = 'Department → Job — pending job→pod attribution (pipeline)';

  // Skeleton body: Department header rows + one pending child each, used while a data source is absent.
  function podSkeletonBody(tbodyId, metricCols, cellsFn, grandRow) {
    const body = document.getElementById(tbodyId);
    if (!body) return;
    const rows = deptJobs(selQuarter());
    let html = '';
    rows.forEach(({ dept }, pi) => {
      html += `<tr data-path="${pi}" data-haschild data-exp="0" style="cursor:pointer;background:var(--border-light)">
        <td style="font-weight:600">${CARET}${dept}</td>${cellsFn(dept)}</tr>`;
      html += `<tr data-path="${pi}-0" style="display:none">
        <td style="padding-left:32px;color:var(--muted);font-style:italic">${PENDING}</td>${dashTds(metricCols)}</tr>`;
    });
    if (grandRow) html += grandRow;
    body.innerHTML = html || `<tr><td colspan="${metricCols + 1}" style="text-align:center;color:var(--muted);padding:16px">No pods match the filter.</td></tr>`;
    wireTreePath(body, expandAll());
  }

  function renderFulfilment() {
    const q = selQuarter();
    fulfilTable(q);
    renderFulfilCharts(q);
    renderFulfilJP(q);
  }

  // Per-job position split for the quarter, from the openings model:
  //   Total = Joined + Open + Missed  (openingBuckets), and Open splits into Pending + still-vacant.
  //   Pending = open openings that already have a live linked offer (openingPendingByJobQ).
  //   Gap = Total − Joined − Pending, i.e. everything still genuinely to fill.
  // Score mirrors each headcount × the role score. A role with no Level/Complexity scores nothing but its
  // HEADCOUNT still counts — the position is real even when Ashby cannot price it.
  const pendByJobQ = data.openingPendingByJobQ || {};
  function jobSplit(j, q) {
    const b = openBuckets[j.jid], qq = b && b.quarters && b.quarters[q];
    const total = qq ? (qq.total || 0) : 0;
    const joined = qq ? (qq.joined || 0) : 0;
    const pending = Math.min(Math.max(0, total - joined), ((pendByJobQ[j.jid] || {})[q]) || 0);
    const gap = Math.max(0, total - joined - pending);
    const sc = j.scoreable ? j.score : 0;
    return { total, joined, pending, gap, sc, scoreable: j.scoreable,
      tS: total * sc, jS: joined * sc, pS: pending * sc, gS: gap * sc };
  }
  const sumSplits = (arr) => arr.reduce((a, x) => ({
    total: a.total + x.total, joined: a.joined + x.joined, pending: a.pending + x.pending, gap: a.gap + x.gap,
    tS: a.tS + x.tS, jS: a.jS + x.jS, pS: a.pS + x.pS, gS: a.gS + x.gS,
    unscored: a.unscored + (x.scoreable ? 0 : (x.total > 0 ? 1 : 0))
  }), { total: 0, joined: 0, pending: 0, gap: 0, tS: 0, jS: 0, pS: 0, gS: 0, unscored: 0 });

  // Departments with any positions this quarter. "Unknown" is NO LONGER excluded: it holds the jobs Ashby's
  // job list never returned (DRAFT status — see the pipeline note in Data Hygiene), and two of those carry
  // real openings, one of them already filled. The sp.total > 0 filter below is what keeps candidate-only
  // rows out of this table, so admitting Unknown leaks nothing that has no positions.
  function fulfilRows(q) {
    return deptJobs(q, true)
      .map(({ dept, jobs }) => {
        const js = jobs.map(j => ({ j, sp: jobSplit(j, q) })).filter(x => x.sp.total > 0);
        js.sort((a, b) => b.sp.total - a.sp.total);
        return { dept, jobs: js, sum: sumSplits(js.map(x => x.sp)) };
      })
      .filter(d => d.jobs.length)
      .sort((a, b) => b.sum.total - a.sum.total);
  }

  function fulfilTable(q) {
    const body = document.getElementById('effFulfilBody'); if (!body) return;
    const z = (n) => n > 0 ? n : '<span class="zero">0</span>';
    const cells = (x, bold) => {
      const w = bold ? ' style="font-weight:600"' : '';
      // .score marks the secondary half of each HC/Score pair so headcount reads first.
      return `<td${w}>${z(x.total)}</td><td class="score">${z(x.tS)}</td><td${w} class="${x.joined > 0 ? 'good' : ''}">${z(x.joined)}</td><td class="score">${z(x.jS)}</td>`
        + `<td>${x.pending > 0 ? `<span style="color:var(--blue);font-weight:600">${x.pending}</span>` : '<span class="zero">0</span>'}</td><td class="score">${z(x.pS)}</td>`
        + `<td${w} class="${x.gap > 0 ? 'warn' : ''}">${z(x.gap)}</td><td class="score">${z(x.gS)}</td>`;
    };
    const rows = fulfilRows(q);
    let html = '';
    rows.forEach(({ dept, jobs, sum }, di) => {
      const flag = sum.unscored ? `<span title="${sum.unscored} role(s) here have no Level/Complexity in Ashby, so they score nothing. Headcount still counts." style="color:var(--orange);font-weight:400;font-size:11px;margin-left:6px">${sum.unscored} unscored</span>` : '';
      html += `<tr data-path="${di}" data-haschild data-exp="0" style="cursor:pointer;background:var(--border-light)">
        <td style="font-weight:600">${CARET}${dept}<span style="color:var(--muted);font-weight:400;font-size:11px;margin-left:6px">${jobs.length}</span>${flag}</td>${cells(sum, true)}</tr>`;
      jobs.forEach(({ j, sp }, ji) => {
        const meta = sp.scoreable
          ? `<span style="font-size:10px;margin-left:6px;color:var(--muted)">${j.level || ''}${j.complexity ? ' · ' + j.complexity : ''} · ${j.score}pt</span>`
          : `<span style="font-size:10px;margin-left:6px;color:var(--orange)">unscored</span>`;
        html += `<tr data-path="${di}-${ji}" style="display:none"><td style="padding-left:30px;color:var(--muted)">${j.title}${meta}</td>${cells(sp, false)}</tr>`;
      });
    });
    const g = sumSplits(rows.flatMap(r => r.jobs.map(x => x.sp)));
    html += `<tr style="background:var(--accent-light);font-weight:700"><td>All departments</td>${cells(g, true)}</tr>`;
    body.innerHTML = html || `<tr><td colspan="9" style="text-align:center;color:var(--muted);padding:16px">No openings in this period.</td></tr>`;
    wireTreePath(body, expandAll());
  }

  // Candidate-level joining-pending list, same source as the Hiring Manager tab (joiningPendingCases),
  // scoped to the Department/Job filters. Unlinked rows carry no opening, so they are invisible to the
  // position counts above — surfaced here rather than silently missing.
  function renderFulfilJP(q) {
    const body = document.getElementById('effFulfilJPBody'); if (!body) return;
    const dsel = selDepts(), jsel = selJobs();
    const rows = (data.joiningPendingCases || [])
      .filter(c => !dsel.length || dsel.includes(resolveDeptTeam(c.department || '').dept || c.department))
      .filter(c => !jsel.length || jsel.includes(c.job));
    body.innerHTML = rows.length ? rows.map(c => `<tr>
      <td>${c.doj || DASH}</td><td style="font-weight:500">${c.candidate || DASH}</td><td>${c.department || DASH}</td>
      <td style="max-width:260px">${c.job || DASH}</td><td>${c.subStage || DASH}</td><td>${c.recruiter || DASH}</td>
      <td>${c.linked ? '<span style="color:var(--green)">Linked</span>' : '<span style="color:var(--orange);font-weight:600">Not linked</span>'}</td></tr>`).join('')
      : `<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:16px">No offers in play under these filters.</td></tr>`;
  }

  // Screening Added(reached)/Cleared(left)/% for HM / OA / R1. LIVE Pod→Dept→Job from throughputByJob when
  // present; else pod-level current-stage approximation (R1-cleared unknown).
  function renderScreening() {
    const q = selQuarter();
    const body = document.getElementById('effScreenBody'); if (!body) return;
    const pc = (n, d) => d ? ((n / d) * 100).toFixed(1) : '0.0';
    const cls = v => { const n = parseFloat(v); return n >= 50 ? 'good' : n >= 20 ? 'pct' : n > 0 ? 'warn' : 'zero'; };
    const SK = ['hmReview', 'oa', 'r1'];
    let html = '';
    if (tpByJob) {
      const jobTriple = (jid) => { const t = tpByJob[jid] || {}; return SK.map(k => { const c = t[k] || { reached: 0, cleared: 0 }; return { r: c.reached, c: c.cleared }; }); };
      const cells = (tr) => tr.map(s => `<td>${s.r}</td><td>${s.c}</td><td class="${cls(pc(s.c, s.r))}">${pc(s.c, s.r)}%</td>`).join('');
      const sumTr = (arrs) => SK.map((_, i) => arrs.reduce((a, t) => ({ r: a.r + t[i].r, c: a.c + t[i].c }), { r: 0, c: 0 }));
      deptJobs(q).forEach(({ dept, jobs: js }, di) => {
        const jtr = js.map(j => jobTriple(j.jid));
        html += `<tr data-path="${di}" data-haschild data-exp="0" style="cursor:pointer;background:var(--border-light)"><td style="font-weight:600">${CARET}${dept}<span style="color:var(--muted);font-weight:400;font-size:11px;margin-left:6px">${js.length}</span></td>${cells(sumTr(jtr))}</tr>`;
        js.forEach((j, ji) => { html += `<tr data-path="${di}-${ji}" style="display:none"><td style="padding-left:30px;color:var(--muted)">${j.title}</td>${cells(jtr[ji])}</tr>`; });
      });
    } else {
      html += `<tr><td colspan="10" style="color:var(--muted);font-style:italic;padding:16px">Department → Job — awaiting the stage-history accumulator.</td></tr>`;
    }
    body.innerHTML = html || `<tr><td colspan="10" style="text-align:center;color:var(--muted);padding:16px">No departments match the filter.</td></tr>`;
    wireTreePath(body, expandAll());
  }

  function renderJoining() {
    const q = selQuarter();
    const body = document.getElementById('effJoinBody'); if (!body) return;
    const pc = (n, d) => d ? ((n / d) * 100).toFixed(1) : '0.0';
    let html = '';
    deptJobs(q).forEach(({ dept, jobs }, di) => {
      const dpo = jobs.reduce((a, j) => a + j.offer, 0), dph = jobs.reduce((a, j) => a + j.hired, 0);
      html += `<tr data-path="${di}" data-haschild data-exp="0" style="cursor:pointer;background:var(--border-light)">
        <td style="font-weight:600">${CARET}${dept}<span style="color:var(--muted);font-weight:400;font-size:11px;margin-left:6px">${jobs.length}</span></td><td style="font-weight:600">${dpo || '<span class="zero">0</span>'}</td><td class="${dph > 0 ? 'good' : 'zero'}" style="font-weight:600">${dph}</td><td>${pc(dph, dpo)}%</td></tr>`;
      jobs.forEach((j, ji) => {
        html += `<tr data-path="${di}-${ji}" style="display:none">
          <td style="padding-left:30px;color:var(--muted)">${j.title}</td><td>${j.offer}</td><td class="${j.hired > 0 ? 'good' : 'zero'}">${j.hired}</td><td>${pc(j.hired, j.offer)}%</td></tr>`;
      });
    });
    body.innerHTML = html || `<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:16px">No departments match the filter.</td></tr>`;
    wireTreePath(body, expandAll());
  }

  function renderThroughput() {
    const vis = TP_KEYS.filter(k => { const cb = document.querySelector(`.eff-tpStage[value="${k}"]`); return !cb || cb.checked; });
    const head = document.getElementById('effTpHead');
    if (head) {
      let r1 = '<tr><th rowspan="2" style="min-width:260px">Department / Job</th>';
      vis.forEach(k => { r1 += `<th colspan="3" class="stage-hdr">${TP_LABELS[k]}</th>`; });
      r1 += '</tr><tr>';
      vis.forEach(() => { r1 += '<th class="stage-sub">In</th><th class="stage-sub">Out</th><th class="stage-sub">%</th>'; });
      head.innerHTML = r1 + '</tr>';
    }
    const body = document.getElementById('effTpBody'); if (!body) return;
    if (!tpByJob) { podSkeletonBody('effTpBody', vis.length * 3, () => dashTds(vis.length * 3)); return; }
    // LIVE: In = reached (entered the stage), Out = cleared (left it) — from stage history, Department → Job.
    const q = selQuarter();
    const pc = (n, d) => d ? ((n / d) * 100).toFixed(1) : '0.0';
    const cls = v => { const n = parseFloat(v); return n >= 50 ? 'good' : n >= 20 ? 'pct' : n > 0 ? 'warn' : 'zero'; };
    const jobRC = (jid) => { const t = tpByJob[jid] || {}; return vis.map(k => { const c = t[TP_TO_SK[k]] || { reached: 0, cleared: 0 }; return { r: c.reached, c: c.cleared }; }); };
    const cells = (rc) => rc.map(x => `<td>${x.r}</td><td>${x.c}</td><td class="${cls(pc(x.c, x.r))}">${pc(x.c, x.r)}%</td>`).join('');
    const sumRC = (arrs) => vis.map((_, i) => arrs.reduce((a, rc) => ({ r: a.r + rc[i].r, c: a.c + rc[i].c }), { r: 0, c: 0 }));
    let html = '';
    deptJobs(q).forEach(({ dept, jobs: js }, di) => {
      const jrc = js.map(j => jobRC(j.jid));
      html += `<tr data-path="${di}" data-haschild data-exp="0" style="cursor:pointer;background:var(--border-light)"><td style="font-weight:600">${CARET}${dept}<span style="color:var(--muted);font-weight:400;font-size:11px;margin-left:6px">${js.length}</span></td>${cells(sumRC(jrc))}</tr>`;
      js.forEach((j, ji) => { html += `<tr data-path="${di}-${ji}" style="display:none"><td style="padding-left:30px;color:var(--muted)">${j.title}</td>${cells(jrc[ji])}</tr>`; });
    });
    body.innerHTML = html || `<tr><td colspan="${vis.length * 3 + 1}" style="text-align:center;color:var(--muted);padding:16px">No departments match the filter.</td></tr>`;
    wireTreePath(body, expandAll());
  }

  // Quarter keys the Year/Quarter selector covers; null = all-time. Separate from selQuarter(), which
  // always resolves to ONE quarter for pod grouping and capacity even when the selector reads "All".
  function tisPeriod() {
    const ySel = document.getElementById('effYear');
    // `years` is local to renderEfficiency, so read the fallback year off the rendered select instead.
    const yrs = ySel ? [...ySel.options].map(o => o.value).filter(Boolean) : [];
    return periodQuarters(ySel?.value || '', document.getElementById('effQuarter')?.value || '', yrs);
  }

  // Says which stages actually follow the period. Without this the panel would repeat the original bug in a
  // new form — quarter-scoped columns sitting unlabelled next to a live one.
  function tisNote(per) {
    const el = document.getElementById('effTisNote'); if (!el) return;
    if (!per) { el.style.display = 'none'; return; }
    const label = per.length === 1 ? per[0] : per[0].slice(0, 4);
    el.style.display = '';
    el.style.color = tisHasQ ? 'var(--muted)' : 'var(--orange)';
    el.innerHTML = tisHasQ
      ? `Showing <strong>${label}</strong> — candidates who <strong>entered</strong> each stage in that period. <span style="color:var(--orange)">*</span> ${APP_REVIEW_LIVE_NOTE}`
      : `Heads up: these medians are <strong>all-time</strong>, not ${label}. The stage-history file predates the per-quarter breakdown — it appears here after the next stage-history refresh.`;
  }

  // ===== Time in Process (Department → Job; median days parked per stage, red > 5) =====
  function renderTimeInProcess() {
    const head = document.getElementById('effTisHead');
    if (head) {
      const perH = tisPeriod();
      let h = '<tr><th style="min-width:260px">Department / Job</th>';
      TIS_STAGES.forEach(([sk, lbl]) => {
        const live = perH && sk === 'appReview';
        h += `<th class="stage-sub" style="min-width:48px"${live ? ` title="${APP_REVIEW_LIVE_NOTE}"` : ''}>${lbl}${live ? '<span style="color:var(--orange)">*</span>' : ''}</th>`;
      });
      head.innerHTML = h + '</tr>';
    }
    const body = document.getElementById('effTisBody'); if (!body) return;
    if (!tisByJob && !arDwellJob) { podSkeletonBody('effTisBody', TIS_STAGES.length, () => dashTds(TIS_STAGES.length)); return; }
    const q = selQuarter();
    const per = tisPeriod();
    // Per job: one histogram per stage column. App Review from the main-pull dwell (live, never period-scoped),
    // other stages from stage history, scoped to the selected period when the rollups carry the quarter dimension.
    const jobHists = (jid) => TIS_STAGES.map(([sk]) => sk === 'appReview'
      ? ((arDwellJob && arDwellJob[jid]) || {})
      : tisHist(tisByJob, tisByJobQ, jid, sk, per));
    const rowCells = (histArr) => histArr.map(hh => tisCell(hh, 5)).join('');
    const poolCells = (arrs) => TIS_STAGES.map((_, i) => tisCell(poolHists(arrs.map(a => a[i])), 5)).join('');
    let html = '';
    deptJobs(q).forEach(({ dept, jobs: js }, di) => {
      const jh = js.map(j => jobHists(j.jid));
      html += `<tr data-path="${di}" data-haschild data-exp="0" style="cursor:pointer;background:var(--border-light)"><td style="font-weight:600">${CARET}${dept}<span style="color:var(--muted);font-weight:400;font-size:11px;margin-left:6px">${js.length}</span></td>${poolCells(jh)}</tr>`;
      js.forEach((j, ji) => { html += `<tr data-path="${di}-${ji}" style="display:none"><td style="padding-left:30px;color:var(--muted)">${j.title}</td>${rowCells(jh[ji])}</tr>`; });
    });
    body.innerHTML = html || `<tr><td colspan="${TIS_STAGES.length + 1}" style="text-align:center;color:var(--muted);padding:16px">No departments match the filter.</td></tr>`;
    wireTreePath(body, expandAll());
    tisNote(per);
  }

  // ===== Momentum (Department → Job → Stage; last 30 days of range, descending) =====
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
    const dates = velDates();
    const dkeys = dates.map(dkeyEff);
    if (head) {
      let h = `<tr><th style="min-width:260px">Department / Job / Stage</th><th>Total · ${dates.length}d</th>`;
      dates.forEach(d => { h += `<th>${MON[d.getMonth()]} ${d.getDate()}</th>`; });
      head.innerHTML = h + '</tr>';
    }
    const VELS = VEL_STAGES_EFF;
    const numRow = (t, pd, bold) => `<td${bold ? ' style="font-weight:600"' : ''}>${t > 0 ? t : '<span class="zero">0</span>'}</td>` + pd.map(v => `<td>${v > 0 ? v : '<span class="zero">·</span>'}</td>`).join('');
    const add = (dst, src) => { for (let i = 0; i < dst.length; i++) dst[i] += src[i]; };
    let html = '';
    const rows = deptJobs(q);
    if (velByJob) {
      // Department → Job → Stage from true stage-entry rollups (velocityByJob[job][stage][day]).
      rows.forEach(({ dept, jobs: js }, di) => {
        const dArr = new Array(dkeys.length).fill(0); let dTot = 0;
        const jd = js.map(j => {
          const jm = velByJob[j.jid] || {}; const jArr = new Array(dkeys.length).fill(0); let jTot = 0;
          const sd = VELS.map(([sk, label]) => { const m = jm[sk] || {}; let sTot = 0; const sArr = dkeys.map(dk => { const v = m[dk] || 0; sTot += v; return v; }); add(jArr, sArr); jTot += sTot; return { label, sArr, sTot }; });
          add(dArr, jArr); dTot += jTot; return { j, jArr, jTot, sd };
        });
        html += `<tr data-path="${di}" data-haschild data-exp="0" style="cursor:pointer;background:var(--border-light)"><td style="font-weight:600">${CARET}${dept}<span style="color:var(--muted);font-weight:400;font-size:11px;margin-left:6px">${jd.length}</span></td>${numRow(dTot, dArr, true)}</tr>`;
        jd.forEach(({ j, jArr, jTot, sd }, ji) => {
          html += `<tr data-path="${di}-${ji}" data-haschild data-exp="0" style="display:none;cursor:pointer"><td style="padding-left:30px;color:var(--text)">${CARET}${j.title}</td>${numRow(jTot, jArr, false)}</tr>`;
          sd.forEach(({ label, sArr, sTot }, si) => {
            html += `<tr data-path="${di}-${ji}-${si}" style="display:none"><td style="padding-left:56px;color:var(--muted)">${label}</td>${numRow(sTot, sArr, false)}</tr>`;
          });
        });
      });
    } else {
      html += `<tr><td colspan="${dkeys.length + 2}" style="color:var(--muted);font-style:italic;padding:16px">Department → Job → Stage — awaiting the stage-history accumulator.</td></tr>`;
    }
    body.innerHTML = html || `<tr><td colspan="${dkeys.length + 2}" style="text-align:center;color:var(--muted);padding:16px">No departments match the filter.</td></tr>`;
    wireTreePath(body, expandAll());
    renderDeptCharts('effVelPodCharts', rows, velDeptCfg, 'No stage activity in range.');
    const untracked = untrackedStages(velByJob, VELS);
    const un = document.getElementById('effVelUntracked');
    if (un) {
      un.style.display = untracked.length ? '' : 'none';
      if (untracked.length) un.innerHTML = `<strong>${untracked.join(' and ')}</strong> ${untracked.length > 1 ? 'are' : 'is'} not tracked in this Ashby workspace — no candidate has ever been recorded entering ${untracked.length > 1 ? 'those stages' : 'that stage'}, so the row${untracked.length > 1 ? 's read' : ' reads'} zero for every day. That is a missing signal, not a lack of activity.`;
    }
  }

  // ===== Sourcing Mix — Department → Job → Source type → Source name =====
  // Sources are recorded per application, so the honest tree needs a per-(recruiter × job) source bucket:
  // recruiters[].srcByJob { job8: { type: { name: count } } }. Pod attribution follows the recruiter, the
  // Department/Job scope follows the job — which is what makes those two filters real on this tab.
  // Until the pipeline emits srcByJob we fall back to the old recruiters[].srcNested tree (Pod → Type → Name),
  // which has NO job dimension. In that mode Department/Job genuinely cannot be applied, and the panel says so
  // instead of showing an unfiltered number under a filtered heading.
  const hasSrcByJob = recruiters.some(r => r.srcByJob && Object.keys(r.srcByJob).length);

  const mergeNested = (dst, src) => { for (const t in src) { const at = dst[t] || (dst[t] = {}); for (const nm in src[t]) at[nm] = (at[nm] || 0) + src[t][nm]; } return dst; };
  const sumNames = (names) => Object.values(names).reduce((a, v) => a + v, 0);
  const sumNested = (nst) => Object.values(nst).reduce((s, names) => s + sumNames(names), 0);

  // Pod → Dept → Job, each carrying its merged {type:{name:count}}. Honours Department + Job multi-selects.
  function sourceTree(q) {
    return deptJobs(q).map(({ dept, jobs }) => {
      const jarr = [];
      jobs.forEach(j => {
        const nst = {};
        recruiters.forEach(r => { const sj = r.srcByJob && r.srcByJob[j.jid]; if (sj) mergeNested(nst, sj); });
        const tot = sumNested(nst);
        if (tot) jarr.push({ title: j.title, nst, tot });
      });
      jarr.sort((a, b) => b.tot - a.tot);
      const dn = jarr.reduce((d, j) => mergeNested(d, j.nst), {});
      return { dept, jobs: jarr, nst: dn, tot: sumNested(dn) };
    }).filter(d => d.tot > 0).sort((a, b) => b.tot - a.tot);
  }

  // Fallback aggregate: pod → {type:{name:count}} from srcNested (or the coarse sources{} map). No job grain.
  function podNestedFlat(pod, q) {
    const agg = {};
    podMembers(pod, q).forEach(r => {
      const sn = (r.srcNested && Object.keys(r.srcNested).length) ? r.srcNested : null;
      if (sn) mergeNested(agg, sn);
      else for (const [t, v] of Object.entries(r.sources || {})) { const at = agg[t] || (agg[t] = {}); at['(unspecified)'] = (at['(unspecified)'] || 0) + v; }
    });
    return agg;
  }

  // The {type:{name:count}} the chart draws — same scope as the table, so the two can never disagree.
  function visibleSourceAgg(q) {
    const agg = {};
    if (hasSrcByJob) sourceTree(q).forEach(d => mergeNested(agg, d.nst));
    else recruiters.forEach(r => mergeNested(agg, (r.srcNested && Object.keys(r.srcNested).length) ? r.srcNested : {}));
    return agg;
  }

  function renderSourcing() {
    const q = selQuarter();
    const body = document.getElementById('effSourceBody');
    const note = document.getElementById('effSourceNote');
    const warn = document.getElementById('effSourceWarn');
    const th = document.getElementById('effSourceTh');
    const scoped = selDepts().length || selJobs().length;

    if (note) note.innerHTML = hasSrcByJob
      ? '<strong>Department → Job → Source type → Source name</strong> (Ashby <code>source_type</code> → the specific <code>source</code>, e.g. <em>Indeed Listing</em>, <em>LinkedIn</em>). Counts are applications, attributed to the pod of the recruiter who worked them.'
      : '<strong>Source type → Source name</strong> (Ashby <code>source_type</code> → the specific <code>source</code>, e.g. <em>Indeed Listing</em>, <em>LinkedIn</em>), summed across pod members.';
    if (th) th.textContent = hasSrcByJob ? 'Department / Job / Source type / Source name' : 'Source type / Source name';
    if (warn) {
      const show = !hasSrcByJob && scoped;
      warn.style.display = show ? '' : 'none';
      if (show) warn.textContent = 'Heads up: the Department and Job filters are NOT applied to these numbers. Sources are still stored per recruiter, not per job, in the current data file — the figures below are each pod\'s full book of work. They become filterable after the next pipeline refresh emits per-job sources.';
    }
    if (!body) { buildSourceChart(); return; }

    const pc = (n, d) => d ? ((n / d) * 100).toFixed(1) : '0.0';
    const typeRows = (nst, parentTot, path, pad) => {
      let out = '';
      Object.entries(nst).map(([t, names]) => [t, sumNames(names), names]).sort((a, b) => b[1] - a[1])
        .forEach(([t, tcnt, names], ti) => {
          out += `<tr data-path="${path}-${ti}" data-haschild data-exp="0" style="display:none;cursor:pointer"><td style="padding-left:${pad}px;font-weight:500">${CARET}${t}</td><td>${tcnt}</td><td>${pc(tcnt, parentTot)}%</td></tr>`;
          Object.entries(names).sort((a, b) => b[1] - a[1]).forEach(([nm, cnt], ni) => {
            out += `<tr data-path="${path}-${ti}-${ni}" style="display:none"><td style="padding-left:${pad + 26}px;color:var(--muted)">${nm}</td><td>${cnt}</td><td>${pc(cnt, tcnt)}%</td></tr>`;
          });
        });
      return out;
    };

    let html = '';
    if (hasSrcByJob) {
      const tree = sourceTree(q);
      const grand = tree.reduce((s, d) => s + d.tot, 0) || 1;
      tree.forEach((D, di) => {
        html += `<tr data-path="${di}" data-haschild data-exp="0" style="cursor:pointer;background:var(--border-light)">
          <td style="font-weight:600">${CARET}${D.dept}<span style="color:var(--muted);font-weight:400;font-size:11px;margin-left:6px">${D.jobs.length}</span></td><td style="font-weight:600">${D.tot || '<span class="zero">0</span>'}</td><td>${pc(D.tot, grand)}%</td></tr>`;
        D.jobs.forEach((J, ji) => {
          html += `<tr data-path="${di}-${ji}" data-haschild data-exp="0" style="display:none;cursor:pointer"><td style="padding-left:30px">${CARET}${J.title}</td><td>${J.tot}</td><td>${pc(J.tot, D.tot)}%</td></tr>`;
          html += typeRows(J.nst, J.tot, `${di}-${ji}`, 56);
        });
      });
    } else {
      // No per-job sources yet: org-wide Type → Name only. Department/Job cannot be applied, and the warning
      // above the table says so.
      const agg = {};
      recruiters.forEach(r => {
        const sn = (r.srcNested && Object.keys(r.srcNested).length) ? r.srcNested : null;
        if (sn) mergeNested(agg, sn);
        else for (const [t, v] of Object.entries(r.sources || {})) { const at = agg[t] || (agg[t] = {}); at['(unspecified)'] = (at['(unspecified)'] || 0) + v; }
      });
      const tot = sumNested(agg);
      html += `<tr data-path="0" data-haschild data-exp="0" style="cursor:pointer;background:var(--border-light)">
        <td style="font-weight:600">${CARET}All departments</td><td style="font-weight:600">${tot || '<span class="zero">0</span>'}</td><td>100.0%</td></tr>`;
      if (tot) html += typeRows(agg, tot, '0', 32);
    }

    body.innerHTML = html || `<tr><td colspan="3" style="text-align:center;color:var(--muted);padding:16px">No pods match the filter.</td></tr>`;
    wireTreePath(body, expandAll());
    buildSourceChart();
  }

  // ===== charts =====
  const C = { blue: '#4E6BA6', green: '#398AA2', cyan: '#1E7590', amber: '#D8B5BE', slate: '#938FB8' };
  const gridY = { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 11 } } };

  // Per-pod chart placeholders (Y=Job lights up with the pipeline).
  let podCharts = {};
  // Shared chart defaults (#18 chart audit). Every Overall Efficiency chart gets a legend, readable ticks and
  // data labels — several were rendering as unlabelled blocks of colour with the legend switched off, which
  // told the reader nothing. The global valueLabelsPlugin draws the numbers; it skips segments too thin to
  // fit, so it is left ON everywhere except where a custom total label does the job instead.
  const LEGEND = { position: 'top', align: 'end', labels: { usePointStyle: true, pointStyle: 'rect', boxWidth: 10, boxHeight: 10, font: { size: 11 }, padding: 10 } };
  const TICKS = { font: { size: 11 } };
  const hbarOpts = (stacked, xtitle) => ({ indexAxis: 'y', responsive: true, maintainAspectRatio: false,
    layout: { padding: { right: 26 } },
    plugins: { legend: LEGEND },
    scales: { x: { ...gridY, stacked, ticks: TICKS, title: xtitle ? { display: true, text: xtitle, font: { size: 11 }, color: '#64748b' } : undefined }, y: { stacked, grid: { display: false }, ticks: TICKS } } });

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

  // Per-tab per-DEPARTMENT chart builders (#18). Each receives {dept, jobs} straight from deptJobs(q), so
  // there is no pod lookup left — Y = Job in every one.
  const joinDeptCfg = ({ jobs }) => {
    const js = jobs.filter(j => j.offer > 0).sort((a, b) => b.offer - a.offer).slice(0, 10);
    if (!js.length) return null;
    return { type: 'bar', data: { labels: js.map(j => j.title), datasets: [
      { label: 'Hired', data: js.map(j => j.hired), backgroundColor: C.green, stack: 'j', borderRadius: 2 },
      { label: 'Offered', data: js.map(j => Math.max(0, j.offer - j.hired)), backgroundColor: '#B4D3DC', stack: 'j', borderRadius: 2 }] }, options: hbarOpts(true, 'Candidates') };
  };
  // Momentum per department: the three stages the tab is ABOUT, stacked per day. It used to merge all three
  // into one unlabelled "Submissions" series with the legend switched off — which hid exactly the breakdown
  // the tab exists to show.
  const VEL_STAGE_COLORS = { hmReview: '#4E6BA6', oa: '#398AA2', r1: '#1E7590' };
  const velDeptCfg = ({ jobs }) => {
    if (!velByJob) return null;
    const dates = velDates(), dk = dates.map(dkeyEff);
    const jids = jobs.map(j => j.jid);
    const series = VEL_STAGES_EFF.map(([sk, label]) => ({
      sk, label,
      data: dk.map(k => jids.reduce((s2, jid) => s2 + ((((velByJob[jid] || {})[sk] || {})[k]) || 0), 0)).reverse()
    }));
    if (series.every(x => x.data.every(v => v === 0))) return null;
    const labels = dates.map(d => `${MON[d.getMonth()]} ${d.getDate()}`).reverse();
    return {
      _h: 230,
      type: 'bar',
      data: { labels, datasets: series.map(x => ({ label: x.label, data: x.data, backgroundColor: VEL_STAGE_COLORS[x.sk], stack: 's', borderWidth: 0, barPercentage: 0.95, categoryPercentage: 0.9 })) },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: LEGEND,
          tooltip: { callbacks: { footer: (its) => its.length ? `Total: ${its[0].chart.data.datasets.reduce((a, d) => a + (d.data[its[0].dataIndex] || 0), 0)}` : '' } }
        },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
          y: { ...gridY, stacked: true, ticks: { ...TICKS, precision: 0 }, title: { display: true, text: 'Candidates entering', font: { size: 11 }, color: '#64748b' } }
        }
      }
    };
  };
  const screenDeptCfg = ({ jobs }) => {
    if (!tpByJob) return null;
    const jids = jobs.map(j => j.jid);
    const agg = (k) => jids.reduce((a, jid) => { const c = (tpByJob[jid] || {})[k] || { reached: 0, cleared: 0 }; return { r: a.r + c.reached, c: a.c + c.cleared }; }, { r: 0, c: 0 });
    const hm = agg('hmReview'), oa = agg('oa'), r1 = agg('r1');
    const hmR = hm.r, hmC = hm.c, oaR = oa.r, oaC = oa.c, r1R = r1.r, r1C = r1.c;
    if (hmR + oaR + r1R === 0) return null;
    return { _h: 220, type: 'bar', data: { labels: ['HM Screening', 'OA', 'R1'], datasets: [
      { label: 'Added', data: [hmR, oaR, r1R], backgroundColor: C.blue, borderRadius: 3 },
      { label: 'Cleared', data: [hmC, oaC, r1C], backgroundColor: C.green, borderRadius: 3 }] },
      options: { responsive: true, maintainAspectRatio: false,
        plugins: { legend: LEGEND },
        scales: { x: { grid: { display: false }, ticks: TICKS }, y: { ...gridY, ticks: { ...TICKS, precision: 0 }, title: { display: true, text: 'Candidates', font: { size: 11 }, color: '#64748b' } } } } };
  };

  // Per-pod Throughput chart: Added (reached) vs Cleared per stage, from throughputByJob over the pod's jobs.
  // Respects the stage toggle; shows only stages with any activity. Horizontal grouped bars. Null → placeholder.
  const tpDeptCfg = ({ jobs }) => {
    if (!tpByJob) return null;
    const jids = jobs.map(j => j.jid);
    if (!jids.length) return null;
    const visKeys = TP_KEYS.filter(k => { const cb = document.querySelector(`.eff-tpStage[value="${k}"]`); return !cb || cb.checked; });
    const rows = visKeys.map(k => {
      const t = jids.reduce((a, jid) => { const c = (tpByJob[jid] || {})[TP_TO_SK[k]] || { reached: 0, cleared: 0 }; return { r: a.r + c.reached, c: a.c + c.cleared }; }, { r: 0, c: 0 });
      return { label: TP_LABELS[k], r: t.r, c: t.c };
    }).filter(x => x.r || x.c);
    if (!rows.length) return null;
    return { _h: Math.max(170, rows.length * 34 + 70), type: 'bar',
      data: { labels: rows.map(x => x.label), datasets: [
        { label: 'Added', data: rows.map(x => x.r), backgroundColor: C.blue, borderRadius: 3 },
        { label: 'Cleared', data: rows.map(x => x.c), backgroundColor: C.green, borderRadius: 3 }] },
      options: hbarOpts(false, 'Candidates') };
  };

  // Fulfilment charts: bars are STACKED Joined / Joining Pending / Gap, which add up to Total Positions —
  // so the bar and the table carry the same three numbers. A label at the end of each bar gives the total,
  // because a stacked bar hides it otherwise and the total is the number people are looking for.
  // NOTE: the stack total at the end of each bar is now drawn by the GLOBAL stackTotalsPlugin
  // (chart-datalabels.js, registered in app.js), so every stacked chart in the app gets it, not just
  // these two. Opt a chart out with options.plugins.stackTotals = false.
  const FULFIL_COLORS = { joined: '#0f766e', pending: '#4E6BA6', gap: '#D8B5BE' };
  const fulfilStackOpts = (xTitle) => ({
    indexAxis: 'y', responsive: true, maintainAspectRatio: false,
    layout: { padding: { right: 34 } },   // room for the total label
    plugins: {
      valueLabels: false,
      legend: { position: 'top', align: 'end', labels: { usePointStyle: true, pointStyle: 'rect', boxWidth: 9, boxHeight: 9, font: { size: 10 }, padding: 8 } },
      tooltip: { callbacks: { footer: (items) => items.length ? `Total positions: ${items[0].chart.data.datasets.reduce((a, d) => a + (d.data[items[0].dataIndex] || 0), 0)}` : '' } }
    },
    scales: {
      x: { stacked: true, beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 10 }, precision: 0 }, title: { display: true, text: xTitle, font: { size: 10 }, color: '#64748b' } },
      y: { stacked: true, grid: { display: false }, ticks: { font: { size: 10 } } }
    }
  });

  function renderFulfilCharts(q) {
    const rows = fulfilRows(q);
    renderDeptCharts('effFulfilPodCharts', rows, fulfilDeptCfg, 'No openings in this department this period.');

    const ctx = document.getElementById('effFulfilCombined'); if (!ctx) return;
    if (effFulfilCombined) effFulfilCombined.destroy();
    effFulfilCombined = null;
    const wrap = document.getElementById('effFulfilCombinedWrap');
    // The "All departments" chart compares departments against each other. Filter down to ONE department and
    // it degenerates into a single bar restating the chart directly above it, so hide it (heading included).
    // Two or more departments selected still compare, so it stays.
    const hdr = document.getElementById('effFulfilCombinedHdr');
    if (selDepts().length === 1) {
      if (wrap) wrap.style.display = 'none';
      if (hdr) hdr.style.display = 'none';
      return;
    }
    if (wrap) wrap.style.display = '';
    if (hdr) hdr.style.display = '';
    let emptyMsg = wrap && wrap.querySelector('.chart-empty');
    if (!rows.length) {
      ctx.style.display = 'none';
      if (wrap && !emptyMsg) { emptyMsg = document.createElement('div'); emptyMsg.className = 'chart-empty'; emptyMsg.style.cssText = 'display:flex;align-items:center;justify-content:center;min-height:120px;color:var(--muted);font-size:13px;text-align:center;padding:20px'; wrap.appendChild(emptyMsg); }
      if (emptyMsg) { emptyMsg.textContent = `No openings in ${q.replace('-', ' ')}.`; emptyMsg.style.display = 'flex'; }
      return;
    }
    ctx.style.display = ''; if (emptyMsg) emptyMsg.style.display = 'none';
    if (wrap) wrap.style.height = Math.max(220, rows.length * 32 + 80) + 'px';
    ctx.style.maxHeight = 'none';
    effFulfilCombined = new Chart(ctx, {
      type: 'bar',
      data: { labels: rows.map(r => r.dept), datasets: [
        { label: 'Joined', data: rows.map(r => r.sum.joined), backgroundColor: FULFIL_COLORS.joined, stack: 'p', borderWidth: 0 },
        { label: 'Joining Pending', data: rows.map(r => r.sum.pending), backgroundColor: FULFIL_COLORS.pending, stack: 'p', borderWidth: 0 },
        { label: 'Gap', data: rows.map(r => r.sum.gap), backgroundColor: FULFIL_COLORS.gap, stack: 'p', borderWidth: 0 }
      ] },
      options: fulfilStackOpts('Positions')
    });
  }

  // Per-department chart: Y = job, each bar stacked Joined / Pending / Gap to Total Positions.
  function fulfilDeptCfg({ jobs }) {
    if (!jobs.length) return null;
    const js = jobs.slice(0, 12);
    return {
      _h: Math.max(130, js.length * 26 + 70),
      type: 'bar',
      data: { labels: js.map(x => x.j.title), datasets: [
        { label: 'Joined', data: js.map(x => x.sp.joined), backgroundColor: FULFIL_COLORS.joined, stack: 'p', borderWidth: 0 },
        { label: 'Joining Pending', data: js.map(x => x.sp.pending), backgroundColor: FULFIL_COLORS.pending, stack: 'p', borderWidth: 0 },
        { label: 'Gap', data: js.map(x => x.sp.gap), backgroundColor: FULFIL_COLORS.gap, stack: 'p', borderWidth: 0 }
      ] },
      options: fulfilStackOpts('Positions')
    };
  }

  // Per-department chart: Y = job, bars = Offered / Hired score for that job.
  // One small chart per department (mirror of the old renderPodCharts, keyed on department).
  function renderDeptCharts(containerId, rows, buildCfg, emptyText) {
    const el = document.getElementById(containerId); if (!el) return;
    (podCharts[containerId] || []).forEach(c => { try { c.destroy(); } catch (e) {} }); podCharts[containerId] = [];
    el.innerHTML = rows.map((r, i) => `<div class="eff-podchart"><h5>${r.dept}</h5><div class="eff-podchart-body" id="${containerId}_b${i}" style="position:relative"><canvas id="${containerId}_${i}"></canvas></div></div>`).join('');
    rows.forEach((r, i) => {
      const cfg = buildCfg(r);
      const host = document.getElementById(`${containerId}_b${i}`);
      const cv = document.getElementById(`${containerId}_${i}`);
      if (!cfg) { if (host) host.innerHTML = `<p style="font-size:11px;color:var(--muted);margin:0">${emptyText}</p>`; return; }
      if (host) host.style.height = (cfg._h || 160) + 'px';
      podCharts[containerId].push(new Chart(cv, { type: cfg.type, data: cfg.data, options: cfg.options, plugins: cfg.plugins || [] }));
    });
  }

  // Horizontal STACKED bar: one bar per source TYPE, segmented by the source NAMES within it (top ~12 names
  // globally + "Other"). Each source name belongs to one type, so the legend of real names maps cleanly and each
  // type-bar shows only its own sources. Aggregated over exactly the same scope as the table
  // below (visibleSourceAgg), so the chart and the tree can never disagree under a filter.
  const SRC_PALETTE = ['#4E6BA6', '#398AA2', '#1E7590', '#D8B5BE', '#938FB8', '#7BA7C7', '#A9CAD6', '#C4A6B8', '#6B8E9F', '#B5C8D8', '#8FB0A8', '#D0B8A0'];
  function buildSourceChart() {
    const ctx = document.getElementById('effSourceChart'); if (!ctx) return;
    if (effSourceChart) effSourceChart.destroy();
    const q = selQuarter();
    const agg = visibleSourceAgg(q);   // type -> { name: count }, same scope as the table
    const types = Object.keys(agg);
    const totalAll = types.reduce((s, t) => s + Object.values(agg[t]).reduce((a, v) => a + v, 0), 0);
    const wrap = ctx.parentElement; let emptyMsg = wrap && wrap.querySelector('.chart-empty');
    if (!types.length || !totalAll) {
      ctx.style.display = 'none';
      if (wrap && !emptyMsg) { emptyMsg = document.createElement('div'); emptyMsg.className = 'chart-empty'; emptyMsg.style.cssText = 'display:flex;align-items:center;justify-content:center;min-height:120px;color:var(--muted);font-size:13px;text-align:center;padding:20px'; wrap.appendChild(emptyMsg); }
      if (emptyMsg) { emptyMsg.textContent = 'No source data for the current filter.'; emptyMsg.style.display = 'flex'; }
      return;
    }
    ctx.style.display = ''; if (emptyMsg) emptyMsg.style.display = 'none';
    // types sorted by total (desc); global top-12 names + Other
    const typeLabels = types.map(t => [t, Object.values(agg[t]).reduce((a, v) => a + v, 0)]).sort((a, b) => b[1] - a[1]).map(x => x[0]);
    const nameTotals = {}; types.forEach(t => { for (const nm in agg[t]) nameTotals[nm] = (nameTotals[nm] || 0) + agg[t][nm]; });
    const topNames = Object.entries(nameTotals).sort((a, b) => b[1] - a[1]).slice(0, 12).map(x => x[0]);
    const topSet = new Set(topNames);
    const datasets = topNames.map((nm, i) => ({ label: nm, data: typeLabels.map(t => (agg[t] && agg[t][nm]) || 0), backgroundColor: SRC_PALETTE[i % SRC_PALETTE.length], stack: 's', borderWidth: 0 }));
    const otherData = typeLabels.map(t => Object.entries(agg[t]).reduce((s, [nm, c]) => s + (topSet.has(nm) ? 0 : c), 0));
    if (otherData.some(v => v > 0)) datasets.push({ label: 'Other', data: otherData, backgroundColor: '#cbd5e1', stack: 's', borderWidth: 0 });
    effSourceChart = new Chart(ctx, {
      type: 'bar',
      data: { labels: typeLabels, datasets },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'rect', boxWidth: 9, boxHeight: 9, font: { size: 10 }, padding: 6 } },
          tooltip: { callbacks: { label: (c) => (c.dataset.label || '') + ': ' + c.parsed.x } }
        },
        scales: {
          x: { stacked: true, beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 10 } } },
          y: { stacked: true, grid: { display: false }, ticks: { font: { size: 11 } } }
        }
      }
    });
  }

  function renderActive() {
    if (activeTab === 'fulfilment') renderFulfilment();
    else if (activeTab === 'velocity') renderVelocity();
    else if (activeTab === 'screening') { renderScreening(); renderDeptCharts('effScreenPodCharts', deptJobs(selQuarter()), screenDeptCfg, 'No stage activity in this department.'); }
    else if (activeTab === 'throughput') { renderThroughput(); renderDeptCharts('effTpPodCharts', deptJobs(selQuarter()), tpDeptCfg, 'No stage-transition activity in this department.'); }
    else if (activeTab === 'timeinprocess') renderTimeInProcess();
    else if (activeTab === 'joining') { renderJoining(); renderDeptCharts('effJoinPodCharts', deptJobs(selQuarter()), joinDeptCfg, 'No offers yet in this department.'); }
    else if (activeTab === 'sourcing') renderSourcing();
  }

  // Only the visible panel is rendered. This used to rebuild all seven, which was tolerable at 5 pod charts
  // and is not at 13 department charts (~91 Chart.js instances per filter change). showTab() re-renders on
  // switch, so nothing goes stale.
  function renderAll() { renderActive(); }

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
  // Pod filter removed (#18) — Overall Efficiency is Department → Job now. visiblePods() still returns
  // every pod for the sub-tabs not yet converted, so nothing else changes until they are.
  msPod = null;
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
