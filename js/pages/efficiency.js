import { podOf, POD_OPTIONS, isSalesPod, capacityOf, currentQuarter, qKey } from '../recruiter-pods.js';
import { defsBlock } from '../definitions.js';
import { resolveDeptTeam } from '../dept-map.js';
import { TIS_STAGES, poolHists, tisCell, periodQuarters, hasQuarterTis, tisHist, APP_REVIEW_LIVE_NOTE } from '../stage-time.js';
import { scoreForRole } from '../score-model.js';
import { HBAR, hbarHeight, CONV_PAD, drawConvColumn, roleBandDatasets, roleBandOverlay, roleSectionTooltip, metricLegend,
         buildDumbbell, buildStageHeat } from '../chart-style.js';

// Overall Efficiency = everything Recruiter Efficiency has, but the Recruiter dimension is replaced by
// Department. Trees are Department → Job; charts are one-per-department with Y = Job, plus an overall. (Pods were dropped 2026-08-21 — see #18.) Formerly pods mapped to
// recruiters (not jobs), so attributing a Job/Department to a Pod needs the recruiter×job rollup from the
// pipeline redesign — until then every metric cell is a placeholder (—), same honesty as the Recruiter tab.
// The only live values here: Fulfilment pod Target = summed pod capacities, and the org-wide Sourcing chart.

const POD_ORDER = [...POD_OPTIONS, 'Unassigned'];

// ===== DROP (unified, 2026-08-26) =====
// Jerin's definition: moved to Ref Check / Documentation / Offer in a quarter (earliest of the three) and
// was then archived. The pipeline emits `dropEvents` already DEDUPED BY APPLICATION with one date each, so
// a candidate who bounced into the Offer stage three times counts once.
// It merges two sources: archived offer records, and archived applications that reached those stages with
// NO offer ever raised - 17 people who were invisible before (Q2 alone went from 20 drops to 30).
// ⚠ Falls back to the old offer-only filter when `dropEvents` is absent, so the tab still works against a
// data file written before this shipped. The fallback UNDERCOUNTS; it is a bridge, not an equivalent.
function dropRows(data) {
  if (data.dropEvents && data.dropEvents.length) return data.dropEvents;
  return (data.offerEvents || [])
    .filter(e => e.appStatus === 'Archived')
    .map(e => ({ jobId8: e.jobId8, jobTitle: e.jobTitle, department: e.department, recruiter: e.recruiter,
                 level: e.level, complexity: e.complexity, quarter: e.attrQuarter, source: 'offer' }));
}

const CARET = '<span class="caret" style="display:inline-block;width:14px;color:var(--muted)">▸</span>';
const DASH = '<span class="zero">—</span>';
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Throughput stages (mirrors the HM tab)
const TP_KEYS = ['app','ta','hm','oa','r1','r2','r3','r4','r5','rc','ds','offer'];
const TP_LABELS = { app:'Application', ta:'TA Screen', hm:'HM Review', oa:'OA', r1:'R1', r2:'R2', r3:'R3', r4:'R4', r5:'R5', rc:'Ref Check', ds:'Doc Sub', offer:'Offer' };
const TP_TO_SK = { app:'appReview', hc:'helloChristy', ta:'taScreen', hm:'hmReview', oa:'oa', r1:'r1', r2:'r2', r3:'r3', r4:'r4', r5:'r5', rc:'refCheck', ds:'docSub', offer:'offer' };

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
      /* Design pass 2026-08-29, mirroring the Recruiter grid: tighter rhythm, values louder than the dots,
         weekends underlined in a soft maroon, departments with nothing in the window muted. */
      .evel-table th { padding:8px 9px; letter-spacing:0.02em; }
      .evel-table td { padding:6px 9px; }
      .evel-table tbody td:not(:first-child) { font-weight:500; font-variant-numeric:tabular-nums; }
      .evel-table tbody td .zero { font-weight:400; }
      .evel-table tbody tr.lvl-quiet td { color:var(--muted); }
      .evel-table tbody tr.lvl-quiet td:not(:first-child) { font-weight:400; }
      .evel-table th.wknd { box-shadow:inset 0 -2px 0 rgba(163,50,83,0.38); }
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
    <p class="sub-note" style="margin-top:-8px;">The same measures as Recruiter Efficiency, asked of the <strong>department</strong> instead of the recruiter. Every tree is <strong>Department → Job</strong>; there is no pod dimension on this tab. Each panel explains itself in the amber line above it.</p>

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
      ${defsBlock('eff-fulfilment')}
      <h4 id="effFulfilCombinedHdr" style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.04em;margin:14px 0 6px">Positions by department — each band is a role</h4>
      <div class="chart-wrap" id="effFulfilCombinedWrap" style="margin:0 0 18px"><canvas id="effFulfilCombined"></canvas></div>

      <div class="scroll-table"><table class="metrics">
        <thead>
          <tr><th rowspan="2" style="min-width:280px">Department / Job</th><th colspan="2" class="stage-hdr">Total Positions</th><th colspan="2" class="stage-hdr">Joined</th><th colspan="2" class="stage-hdr" title="Everyone parked in Ref Check, Documentation or Offer, minus anyone whose opening belongs to an earlier quarter. Counts PEOPLE. Live — the quarter selector does not change it.">Joining Pending</th><th colspan="2" class="stage-hdr" title="Reached an offer and then left — declined, withdrew, or archived with the offer still open. Counted in the quarter the work was live.">Drop</th><th colspan="2" class="stage-hdr" title="Total Positions − Joined − Joining Pending. Can be negative when more people are in closing than positions were opened.">Delta</th><th colspan="2" class="stage-hdr" title="Positions closed as carry forward to the next quarter.">Missed</th></tr>
          <tr><th class="stage-sub">HC</th><th class="stage-sub">Score</th><th class="stage-sub">HC</th><th class="stage-sub">Score</th><th class="stage-sub">HC</th><th class="stage-sub">Score</th><th class="stage-sub">HC</th><th class="stage-sub">Score</th><th class="stage-sub">HC</th><th class="stage-sub">Score</th><th class="stage-sub">HC</th><th class="stage-sub">Score</th></tr>
        </thead>
        <tbody id="effFulfilBody"></tbody>
      </table></div>

      <h4 style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.04em;margin:22px 0 6px">Joining Pending — Cases</h4>
      <p class="sub-note" style="margin-top:0"><strong>Live</strong> — everyone with an offer in play right now, scoped to the Department/Job filters above. The quarter selector does not apply to it.</p>
      <div class="scroll-table"><table>
        <thead><tr><th>DOJ</th><th style="min-width:160px">Candidate</th><th style="min-width:150px">Department</th><th style="min-width:200px">Job</th><th>Sub-stage</th><th>Recruiter</th><th>Opening</th></tr></thead>
        <tbody id="effFulfilJPBody"></tbody>
      </table></div>
    </div>

    <!-- PANEL: Momentum — candidates added to ToFU, one column per day. Chart and grid mirror the Recruiter
         tab since 2026-08-29: one bar per DAY stacked by department and shaded by role, every date on the
         axis, weekends in maroon, a small mark on any weekday with nothing on it. -->
    <div class="eff-panel" data-panel="velocity" style="display:none">
      ${defsBlock('eff-momentum')}
      <div class="chart-wrap" id="effVelChartWrap" style="height:420px"><canvas id="effVelChart"></canvas></div>
      <div class="scroll-table"><table class="evel-table">
        <thead id="effVelHead"></thead>
        <tbody id="effVelBody"></tbody>
      </table></div>
    </div>

    <!-- PANEL: Screening Efficiency — ONE R1 column set since 2026-08-29, mirroring the Recruiter tab.
         HM Screening and Online Assessment columns were removed on purpose: this panel is about R1, and
         both still count on Momentum through ToFU. -->
    <div class="eff-panel" data-panel="screening" style="display:none">
      ${defsBlock('eff-screening')}
      <div class="chart-wrap" id="effScreenChartWrap" style="height:300px"><canvas id="effScreenChart"></canvas></div>
      <div class="scroll-table"><table class="metrics">
        <thead><tr>
          <th style="min-width:280px">Department / Job</th>
          <th title="An interview scheduled at R1, or an assignment triggered at R1. One per candidate per role per quarter; cancellations excluded.">Added at R1</th>
          <th title="Of those, the ones who reached R2 or beyond.">Progressed</th>
          <th title="Progressed ÷ Added at R1.">%</th>
        </tr></thead>
        <tbody id="effScreenBody"></tbody>
      </table></div>
    </div>

    <!-- PANEL: Throughput (mirrors HM) -->
    <div class="eff-panel" data-panel="throughput" style="display:none">
      ${defsBlock('eff-throughput')}
      <div style="display:flex;flex-wrap:wrap;gap:12px 16px;margin-bottom:12px;font-size:12px;align-items:center">
        <span style="font-weight:600;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:0.04em">Stages</span>
        ${TP_KEYS.map(k => `<label style="display:flex;align-items:center;gap:5px;cursor:pointer"><input type="checkbox" class="eff-tpStage" value="${k}" checked> ${TP_LABELS[k]}</label>`).join('')}
      </div>
      <h3 class="subsection-title">Throughput — department by stage</h3>
      <div class="sheat-wrap"><div id="effTpHeat" class="sheat"></div><div id="effTpHeatTip" class="sheat-tip"></div></div>
      <div class="scroll-table"><table>
        <thead id="effTpHead"></thead>
        <tbody id="effTpBody"></tbody>
      </table></div>
    </div>

    <!-- PANEL: Time in Process -->
    <div class="eff-panel" data-panel="timeinprocess" style="display:none">
      ${defsBlock('eff-tis')}
      <p class="sub-note" id="effTisNote" style="display:none"></p>
      <div class="scroll-table"><table>
        <thead id="effTisHead"></thead>
        <tbody id="effTisBody"></tbody>
      </table></div>
    </div>

    <!-- PANEL: Joining Conversion — brought onto the settled definition 2026-08-29, mirroring the Recruiter
         tab: Offered = Joined + Joining Pending + Dropped, so the row always closes, and the conversion is
         (Joined + Joining Pending) / Offered. It used to read Offered / Hired / Conversion %, which was the
         pre-26-August metric and disagreed with the same-named panel on the Recruiter tab. -->
    <div class="eff-panel" data-panel="joining" style="display:none">
      ${defsBlock('eff-joining')}
      <div class="chart-wrap" id="effJoinChartWrap" style="height:300px"><canvas id="effJoinChart"></canvas></div>
      <div class="scroll-table"><table class="metrics join-table">
        <thead><tr>
          <th>Department / Job</th>
          <th title="Joined + Joining Pending + Dropped.">Offered</th>
          <th title="Started in the quarter, minus anyone linked to an earlier quarter's opening.">Joined</th>
          <th title="Everyone in Ref Check, Documentation or Offer, minus earlier-quarter openings. Live — the same people appear in every quarter.">Joining Pending</th>
          <th title="Reached Ref Check, Documentation or Offer and was then archived.">Dropped</th>
          <th>Joining Conversion</th>
        </tr></thead>
        <tbody id="effJoinBody"></tbody>
      </table></div>
    </div>

    <!-- PANEL: Sourcing Mix -->
    <div class="eff-panel" data-panel="sourcing" style="display:none">
      ${defsBlock('eff-sourcing')}
      <p class="sub-note" id="effSourceNote"></p>
      <p class="sub-note" id="effSourceWarn" style="display:none;color:var(--orange);margin-top:-6px"></p>
      <h3 class="subsection-title">Channel mix — where joiners came from</h3>
      <div class="chart-wrap" style="max-width:840px;margin:0 auto 20px;height:460px;position:relative"><canvas id="effSourceChart"></canvas></div>
      <div class="scroll-table"><table>
        <thead><tr><th style="min-width:340px" id="effSourceTh">Department / Job / Source type / Source name</th><th>Joiners</th><th>%</th></tr></thead>
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
  const tofuByJob = rollups.tofuByJob || null;
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
  // ===== Joining Pending and Drop are PEOPLE here now (2026-08-25, Jerin) =====
  // JP means exactly what it means on the Hiring Manager and Recruiter tabs: every PERSON parked in
  // Ref Check, Documentation or Offer, MINUS anyone whose opening belongs to an EARLIER quarter.
  // It used to count POSITIONS with a live linked offer, which is why this tab never reconciled with the
  // other two. Drop follows the Recruiter tab: the APPLICATION was archived, attributed to attrQuarter —
  // the quarter the work was live, not the quarter the record was closed.
  // 🚨 Total Positions, Joined and Missed count POSITIONS. Joining Pending and Drop count PEOPLE. They are
  // shown side by side because that is what was asked for, but they are NOT the same unit — which is why
  // Gap below is allowed to come out negative.
  const qOfDate = (ds) => (ds && ds.length >= 7) ? `${ds.slice(0, 4)}-Q${Math.floor((+ds.slice(5, 7) - 1) / 3) + 1}` : null;
  const dkey = (d) => resolveDeptTeam(d || '').dept || d || 'Unknown';
  function peopleMaps(q) {
    const jp = {}, drop = {};
    const add = (m, k) => { m[k] = (m[k] || 0) + 1; };
    (data.joiningPendingCases || []).forEach(c => {
      if (c.openingQuarter && c.openingQuarter < q) return;
      add(jp, dkey(c.department) + '|' + (c.job || c.jobTitle || ''));
    });
    dropRows(data).forEach(e => {
      if (e.quarter !== q) return;
      add(drop, dkey(e.department) + '|' + (e.jobTitle || ''));
    });
    return { jp, drop };
  }
  function jobSplit(j, q, dept, PM) {
    const b = openBuckets[j.jid], qq = b && b.quarters && b.quarters[q];
    const total = qq ? (qq.total || 0) : 0;
    const joined = qq ? (qq.joined || 0) : 0;
    const missed = qq ? (qq.missed || 0) : 0;
    const key = dept + '|' + (j.title || '');
    const pending = (PM.jp[key] || 0);
    const drop = (PM.drop[key] || 0);
    // SIGNED on purpose — the clamp is gone here for the same reason it is gone from HM Delta: more people
    // can be in closing than there are positions when an offer carries no opening link. Hiding that behind a
    // zero makes the row's arithmetic impossible to check by eye.
    const gap = total - joined - pending;
    const sc = j.scoreable ? j.score : 0;
    return { total, joined, pending, drop, missed, gap, sc, scoreable: j.scoreable,
      tS: total * sc, jS: joined * sc, pS: pending * sc, dS: drop * sc, mS: missed * sc, gS: gap * sc };
  }
  const sumSplits = (arr) => arr.reduce((a, x) => ({
    total: a.total + x.total, joined: a.joined + x.joined, pending: a.pending + x.pending,
    drop: a.drop + x.drop, missed: a.missed + x.missed, gap: a.gap + x.gap,
    tS: a.tS + x.tS, jS: a.jS + x.jS, pS: a.pS + x.pS, dS: a.dS + x.dS, mS: a.mS + x.mS, gS: a.gS + x.gS,
    unscored: a.unscored + (x.scoreable ? 0 : (x.total > 0 ? 1 : 0))
  }), { total: 0, joined: 0, pending: 0, drop: 0, missed: 0, gap: 0,
        tS: 0, jS: 0, pS: 0, dS: 0, mS: 0, gS: 0, unscored: 0 });

  // Departments with any positions this quarter. "Unknown" is NO LONGER excluded: it holds the jobs Ashby's
  // job list never returned (DRAFT status — see the pipeline note in Data Hygiene), and two of those carry
  // real openings, one of them already filled. The sp.total > 0 filter below is what keeps candidate-only
  // rows out of this table, so admitting Unknown leaks nothing that has no positions.
  function fulfilRows(q) {
    const PM = peopleMaps(q);
    const dsel = selDepts(), jsel = selJobs();
    const seen = {};
    const out = deptJobs(q, true)
      .map(({ dept, jobs }) => {
        // A role belongs on this table if it had positions in the quarter OR has people against it — the
        // same rule the Hiring Manager tab uses. Restricting to roles with openings hid most of the people
        // in closing there (45 of SME - India's 46), and would hide them here too.
        const js = jobs.map(j => { seen[dept + '|' + (j.title || '')] = 1; return { j, sp: jobSplit(j, q, dept, PM) }; })
          .filter(x => x.sp.total > 0 || x.sp.pending > 0 || x.sp.drop > 0 || x.sp.missed > 0);
        js.sort((a, b) => (b.sp.total - a.sp.total) || (b.sp.pending - a.sp.pending));
        return { dept, jobs: js, sum: sumSplits(js.map(x => x.sp)) };
      })
      .filter(d => d.jobs.length);

    // ⚠ People whose department/role has NO row in the job tree at all. Without this they were silently
    // dropped: the table read 165 in closing against the Hiring Manager tab's 167. Two missing people is
    // exactly the kind of quiet shortfall that is impossible to spot by looking at the number, so every
    // (department, role) carrying people gets a row whether or not the tree knows the job — the same thing
    // the HM tab does when it builds its rows straight from the cases.
    const metaByTitle = {};
    (data.jobs || []).forEach(j => { if (j.title && !metaByTitle[j.title]) metaByTitle[j.title] = j; });
    const extra = {};
    const addLeftover = (key) => {
      if (seen[key]) return;
      const i = key.indexOf('|'); const dept = key.slice(0, i), title = key.slice(i + 1);
      if (dsel.length && !dsel.includes(dept)) return;
      if (jsel.length && !jsel.includes(title)) return;
      (extra[dept] || (extra[dept] = {}))[title] = 1;
    };
    Object.keys(PM.jp).forEach(addLeftover);
    Object.keys(PM.drop).forEach(addLeftover);
    Object.entries(extra).forEach(([dept, titles]) => {
      let grp = out.find(g => g.dept === dept);
      if (!grp) { grp = { dept, jobs: [], sum: null }; out.push(grp); }
      Object.keys(titles).forEach(title => {
        const m = metaByTitle[title] || {};
        const j = { jid: null, title, dept, level: m.level, complexity: m.complexity,
                    score: scoreForRole({ department: dept, title, level: m.level, complexity: m.complexity }, q),
                    scoreable: isScoreable(m) };
        grp.jobs.push({ j, sp: jobSplit(j, q, dept, PM) });
      });
      grp.jobs.sort((a, b) => (b.sp.total - a.sp.total) || (b.sp.pending - a.sp.pending));
      grp.sum = sumSplits(grp.jobs.map(x => x.sp));
    });
    return out.filter(d => d.jobs.length).sort((a, b) => b.sum.total - a.sum.total);
  }

  function fulfilTable(q) {
    const body = document.getElementById('effFulfilBody'); if (!body) return;
    const z = (n) => n > 0 ? n : '<span class="zero">0</span>';
    // Gap cell borrowed wholesale from Recruiter → Fulfilment: a slim track that fills with the SHORTFALL,
    // the number beside it, so the bar and the number can never point in opposite directions.
    // A NEGATIVE gap draws an empty track and says why in words — more people are in closing than there are
    // positions, which is real and shrinks as offers get linked to openings.
    const gapCell = (x) => {
      const pct = x.total > 0 ? Math.max(0, Math.min(100, Math.round((x.gap / x.total) * 100))) : 0;
      const cap = x.gap < 0
        ? `${-x.gap} more in closing than opened`
        : (x.total > 0
          ? (x.gap === 0 ? `${x.total} of ${x.total} · covered` : `${x.total - x.gap} of ${x.total} · ${100 - pct}%`)
          : '\u2014');
      return `<td class="gapcell"><span class="deltacell"><span class="track"><i style="width:${pct}%"></i></span>`
        + `<span class="dnum ${x.gap === 0 ? 'none' : (pct >= 50 ? 'high' : '')}">${x.gap}</span></span>`
        + `<span class="sublab">${cap}</span></td>`;
    };
    // Column order mirrors HM → Department Summary exactly:
    // Total Positions · Joined · Joining Pending · Drop · Gap · Missed. Each carries its Score alongside.
    const cells = (x, bold) => {
      const w = bold ? ' style="font-weight:600"' : '';
      // .score marks the secondary half of each HC/Score pair so headcount reads first.
      const dropPct = (() => { const den = x.joined + x.pending + x.drop; return den > 0 ? Math.round((x.drop / den) * 100) : null; })();
      return `<td${w}>${z(x.total)}</td><td class="score">${z(x.tS)}</td>`
        + `<td${w} class="${x.joined > 0 ? 'good' : ''}">${z(x.joined)}</td><td class="score">${z(x.jS)}</td>`
        + `<td>${x.pending > 0 ? `<span style="color:var(--orange);font-weight:600">${x.pending}</span>` : '<span class="zero">0</span>'}</td><td class="score">${z(x.pS)}</td>`
        + `<td class="${x.drop > 0 ? 'bad' : ''}">${x.drop > 0 ? x.drop : '<span class="zero">0</span>'}`
        + `${x.drop > 0 && dropPct != null ? `<span class="sublab">${dropPct}% of outcomes</span>` : ''}</td><td class="score">${z(x.dS)}</td>`
        + gapCell(x) + `<td class="score">${x.gS}</td>`
        + `<td style="color:var(--red)">${z(x.missed)}</td><td class="score">${z(x.mS)}</td>`;
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
    body.innerHTML = html || `<tr><td colspan="13" style="text-align:center;color:var(--muted);padding:16px">No openings in this period.</td></tr>`;
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
  // ===== Screening Efficiency — ONE R1 set (mirrors Recruiter Efficiency, 2026-08-29) =====
  //   Added at R1 = the candidate was ACTIONED at R1: an interview scheduled there, or an assignment
  //                 triggered while they sat there. Either counts; both together count once. Cancellations
  //                 excluded. One per candidate per role per quarter.
  //   Progressed  = of those, the ones who reached R2 or beyond.
  // Computed in the pipeline (Tofu.gs → r1ByJob), because it needs candidate identity.
  function renderScreening() {
    const per = tisPeriod();                       // the same period helper Time in Process uses
    const body = document.getElementById('effScreenBody'); if (!body) return;
    const store = (rollups && rollups.r1ByJob) || null;
    const sumFor = (jid) => {
      const byQ = store && store[(jid || '').slice(0, 8)]; const acc = { added: 0, cleared: 0 };
      if (!byQ) return acc;
      const keys = (per && per.length) ? per : Object.keys(byQ);
      keys.forEach(qq => { const c = byQ[qq]; if (c) { acc.added += c.added || 0; acc.cleared += c.cleared || 0; } });
      return acc;
    };
    const pcv = (n, d) => d ? Math.round((n / d) * 100) : 0;
    const cls = (v) => v >= 50 ? 'good' : v >= 20 ? 'pct' : v > 0 ? 'warn' : 'zero';
    const cells = (v, bold) => {
      const w = bold ? ' style="font-weight:600"' : '';
      return `<td${w}>${v.added > 0 ? v.added : '<span class="zero">0</span>'}</td>`
        + `<td${w}>${v.cleared > 0 ? v.cleared : '<span class="zero">0</span>'}</td>`
        + `<td class="${v.added ? cls(pcv(v.cleared, v.added)) : 'zero'}">${v.added ? pcv(v.cleared, v.added) + '%' : DASH}</td>`;
    };
    if (!store) {
      body.innerHTML = `<tr><td colspan="4" style="color:var(--muted);font-style:italic;padding:16px">R1 screening figures appear after the next stage-history refresh.</td></tr>`;
      buildScreenChartEff();
      return;
    }
    let html = '';
    deptJobs(selQuarter()).forEach(({ dept, jobs }, di) => {
      const js = jobs.map(j => ({ j, v: sumFor(j.jid) })).filter(x => x.v.added > 0 || x.v.cleared > 0)
        .sort((a, b) => b.v.added - a.v.added);
      if (!js.length) return;
      const agg = js.reduce((a, x) => ({ added: a.added + x.v.added, cleared: a.cleared + x.v.cleared }), { added: 0, cleared: 0 });
      html += `<tr data-path="${di}" data-haschild data-exp="0" style="cursor:pointer;background:var(--border-light)"><td style="font-weight:600">${CARET}${dept}<span style="color:var(--muted);font-weight:400;font-size:11px;margin-left:6px">${js.length}</span></td>${cells(agg, true)}</tr>`;
      js.forEach(({ j, v }, ji) => {
        html += `<tr data-path="${di}-${ji}" style="display:none"><td style="padding-left:30px;color:var(--muted)">${j.title}</td>${cells(v, false)}</tr>`;
      });
    });
    body.innerHTML = html || `<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:16px">No R1 activity under these filters.</td></tr>`;
    wireTreePath(body, expandAll());
    buildScreenChartEff();
  }

  // One bar per DEPARTMENT: solid progressed past R1, pale still at R1, together the number added.
  // Same store as the table.
  let effScreenChart = null;
  // ===== ONE chart, both dimensions (Jerin, 2026-08-30) — the mirror of the Hiring Manager tab =====
  // The 13 per-department small multiples are gone. Department down the side, stage across the top, the
  // throughput percentage in every cell, and the R1 -> Documentation span as the final column.
  // 🚨 The stage cells must NEVER be added up: one person passing R1, R2 and R3 sits in all three. Each cell
  // is comparable only to its own In, which is what the Overall column is for.
  function buildTpChartEff(q, vis) {
    const host = document.getElementById('effTpHeat'); if (!host) return;
    if (!tpByJob) { host.innerHTML = ''; return; }
    const stageCols = vis.filter(k => k !== 'app');
    const asJ2 = (rollups && rollups.assessedByJobQ) || null;
    const spanQ = (rollups && rollups.assessedSpanByJobQ) || null;
    const cellOf = (jids, k) => jids.reduce((a, jid) => {
      if (asJ2) {
        const c = ((asJ2[jid] || {})[TP_TO_SK[k]] || {})[q] || {};
        return { inN: a.inN + (c.a || 0), outN: a.outN + (c.b || 0) };
      }
      const c = (tpByJob[jid] || {})[TP_TO_SK[k]] || { reached: 0, cleared: 0 };
      return { inN: a.inN + c.reached, outN: a.outN + c.cleared };
    }, { inN: 0, outN: 0 });
    // 🚨 The overall column is its OWN per-candidate span from the pipeline — assessed at R1 or OA
    // (whichever first) through to Ref Check / Documentation / Offer (whichever first). Never one stage
    // column divided by another: a person sits in several stages, so that double-counts and can exceed 100%.
    const spanOf = (jids) => jids.reduce((acc, jid) => {
      const v = (spanQ ? (spanQ[jid] || {})[q] : null) || null;
      if (v) return { a: acc.a + (v.a || 0), b: acc.b + (v.b || 0) };
      return acc;
    }, { a: 0, b: 0 });
    const rows = deptJobs(q).map(({ dept, jobs: js }) => {
      const jids = js.map(j => j.jid);
      const r1 = cellOf(jids, 'r1'), ds = cellOf(jids, 'ds');
      const sp = spanQ ? spanOf(jids) : null;
      return {
        label: dept,
        cells: stageCols.map(k => { const c = cellOf(jids, k);
          if (!(c.inN > 0)) return null;
          // Offer is the last stage — a rate there would always read 0%.
          if (asJ2 && k === 'offer') c.noRate = true;
          return c; }),
        overall: sp ? (sp.a > 0 ? Math.round((sp.b / sp.a) * 100) : null)
          : (r1.inN > 0 ? Math.round((ds.inN / r1.inN) * 100) : null),
        ovIn: sp && sp.a > 0 ? sp.a : null,
        ovOut: sp && sp.a > 0 ? sp.b : null,
        _vol: r1.inN
      };
    }).filter(r => r.cells.some(Boolean)).sort((a, b) => b._vol - a._vol);
    buildStageHeat(host, document.getElementById('effTpHeatTip'), rows,
      stageCols.map(k => TP_LABELS[k]), {
        overallLabel: spanQ ? 'R1/OA \u2192 LATE' : 'R1 \u2192 DOC',
        labels: asJ2 ? undefined
          : { inN: 'entered the stage', outN: 'left the stage (any reason)', none: 'nobody entered this stage' }
      });
  }

  function buildScreenChartEff() {
    const ctx = document.getElementById('effScreenChart'); if (!ctx) return;
    if (effScreenChart) { effScreenChart.destroy(); effScreenChart = null; }
    const store = (rollups && rollups.r1ByJob) || null;
    const wrap = document.getElementById('effScreenChartWrap');
    if (!store) { if (wrap) wrap.style.height = '0px'; return; }
    const per = tisPeriod();
    const sumFor = (jid) => {
      const byQ = store[(jid || '').slice(0, 8)]; const acc = { added: 0, cleared: 0 };
      if (!byQ) return acc;
      const keys = (per && per.length) ? per : Object.keys(byQ);
      keys.forEach(qq => { const c = byQ[qq]; if (c) { acc.added += c.added || 0; acc.cleared += c.cleared || 0; } });
      return acc;
    };
    const rows = deptJobs(selQuarter()).map(({ dept, jobs }) => {
      const per = jobs.map(j => ({ title: j.title, v: sumFor(j.jid) })).filter(x => x.v.added > 0);
      const agg = per.reduce((a, x) => ({ added: a.added + x.v.added, cleared: a.cleared + x.v.cleared }), { added: 0, cleared: 0 });
      return { dept, ...agg, per };
    }).filter(r => r.added > 0).sort((a, b) => b.added - a.added);
    if (!rows.length) { if (wrap) wrap.style.height = '120px'; return; }
    // Bar thickness matches the Fulfilment chart and the Recruiter tab's version of this panel.
    const h = hbarHeight(rows.length);
    if (wrap) wrap.style.height = h + 'px';
    ctx.style.maxHeight = h + 'px';
    // ===== Dumbbell, not a stacked bar (Jerin, 2026-08-30) — the mirror of the Recruiter tab's version.
    // The line between the dots IS the drop-off. Axis reversed so it reads added -> progressed, in funnel
    // order. Hovering a row lists the roles behind it.
    effScreenChart = buildDumbbell(ctx, rows.map(r => ({
      label: r.dept,
      added: r.added,
      progressed: r.cleared,
      roles: (r.per || []).map(x => ({ title: x.title, added: x.v.added, progressed: x.v.cleared }))
    })), { xTitle: 'Candidates added at R1', colHeader: 'PROGRESSED',
           fromLabel: 'added at R1', toLabel: 'progressed past R1' });
  }

  // convByJob / convOf (Offered -> Hired) were removed on 2026-08-29 with the old definition.

  // ===== Joining Conversion, settled definition (mirrors Recruiter Efficiency, 2026-08-29) =====
  //   Joined          = people whose START DATE falls in the quarter, minus anyone whose offer is linked to
  //                     an EARLIER quarter's opening
  //   Joining Pending = everyone in Ref Check / Documentation / Offer, minus earlier-quarter openings. LIVE,
  //                     so the same people sit inside every quarter's Offered
  //   Dropped         = the unified dropEvents list
  //   Offered         = the three added, so the row always closes
  // ⚠ The Recruiter tab applies a SALES exception — no earlier-quarter subtraction on Joined — because Sales
  // is measured on joiners whenever the opening was raised. Sales is a POD, and pods do not exist on this
  // tab, so the subtraction is applied uniformly here. That is the only deliberate difference between the
  // two panels, and the definitions block says so.
  let _jcQ = null, _jc = null;
  function joinMapsEff(q) {
    if (_jcQ === q && _jc) return _jc;
    const qOf = (ds) => (ds && ds.length >= 7) ? `${ds.slice(0, 4)}-Q${Math.floor((+ds.slice(5, 7) - 1) / 3) + 1}` : null;
    const byKey = {};
    const bump = (key, field) => { const a = byKey[key] || (byKey[key] = { o: 0, j: 0, p: 0, dr: 0 }); a[field] += 1; };
    (data.offerEvents || []).forEach(e => {
      if (!e.accepted || qOf(e.startDate) !== q) return;
      if (e.openingQuarter && e.openingQuarter < q) return;
      bump(dkey(e.department) + '|' + (e.jobTitle || ''), 'j');
    });
    (data.joiningPendingCases || []).forEach(c => {
      if (c.openingQuarter && c.openingQuarter < q) return;
      bump(dkey(c.department) + '|' + (c.job || c.jobTitle || ''), 'p');
    });
    dropRows(data).forEach(e => {
      if (e.quarter !== q) return;
      bump(dkey(e.department) + '|' + (e.jobTitle || ''), 'dr');
    });
    Object.values(byKey).forEach(a => { a.o = a.j + a.p + a.dr; });
    _jcQ = q; _jc = byKey;
    return byKey;
  }
  const ZJC = { o: 0, j: 0, p: 0, dr: 0 };
  const jcOf = (q, dept, title) => joinMapsEff(q)[dept + '|' + (title || '')] || ZJC;

  function renderJoining() {
    const q = selQuarter();
    const body = document.getElementById('effJoinBody'); if (!body) return;
    const convCell = (v) => {
      if (!v.o) return `<td class="gapcell"><span class="zero">—</span></td>`;
      const p = Math.round(((v.j + v.p) / v.o) * 100);
      const band = p >= 50 ? '' : (p >= 20 ? ' mid' : ' low');
      return `<td class="gapcell"><span class="deltacell"><span class="track"><i class="conv${band}" style="width:${p}%"></i></span>`
        + `<span class="dnum">${p}%</span></span><span class="sublab">${v.j + v.p} of ${v.o}</span></td>`;
    };
    const cells = (v, bold) => {
      const w = bold ? ' style="font-weight:600"' : '';
      return `<td${w}>${v.o || '<span class="zero">0</span>'}</td>`
        + `<td${w} class="${v.j > 0 ? 'good' : 'zero'}">${v.j}</td>`
        + `<td style="color:var(--orange)">${v.p || '<span class="zero">0</span>'}</td>`
        + `<td class="${v.dr > 0 ? 'bad' : ''}">${v.dr || '<span class="zero">0</span>'}</td>`
        + convCell(v);
    };
    const add = (a, b) => ({ o: a.o + b.o, j: a.j + b.j, p: a.p + b.p, dr: a.dr + b.dr });
    let html = '';
    deptJobs(q).forEach(({ dept, jobs }, di) => {
      const js = jobs.map(j => ({ j, c: jcOf(q, dept, j.title) })).filter(x => x.c.o > 0)
        .sort((a, b) => b.c.o - a.c.o);
      if (!js.length) return;
      const agg = js.reduce((a, x) => add(a, x.c), { o: 0, j: 0, p: 0, dr: 0 });
      html += `<tr data-path="${di}" data-haschild data-exp="0" style="cursor:pointer;background:var(--border-light)">
        <td style="font-weight:600">${CARET}${dept}<span style="color:var(--muted);font-weight:400;font-size:11px;margin-left:6px">${js.length}</span></td>${cells(agg, true)}</tr>`;
      js.forEach(({ j, c }, ji) => {
        html += `<tr data-path="${di}-${ji}" style="display:none">
          <td style="padding-left:30px;color:var(--muted)">${j.title}</td>${cells(c, false)}</tr>`;
      });
    });
    body.innerHTML = html || `<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:16px">Nobody reached an offer under these filters.</td></tr>`;
    wireTreePath(body, expandAll());
    buildJoinChartEff();
  }

  // One bar per DEPARTMENT — the department-centric mirror of the Recruiter tab's bar per recruiter.
  // Joined / Joining Pending / Dropped stacked, with Offered and the Joining Conversion printed at the end,
  // read off the same joinMapsEff the table uses.
  let effJoinChart = null;
  function buildJoinChartEff() {
    const ctx = document.getElementById('effJoinChart'); if (!ctx) return;
    if (effJoinChart) { effJoinChart.destroy(); effJoinChart = null; }
    const q = selQuarter();
    const rows = deptJobs(q).map(({ dept, jobs }) => {
      const per = jobs.map(j => ({ title: j.title, c: jcOf(q, dept, j.title) })).filter(x => x.c.o > 0);
      const agg = per.reduce((a, x) => ({ o: a.o + x.c.o, j: a.j + x.c.j, p: a.p + x.c.p, dr: a.dr + x.c.dr }), { o: 0, j: 0, p: 0, dr: 0 });
      return { dept, ...agg, per };
    }).filter(r => r.o > 0).sort((a, b) => b.o - a.o);
    const wrap = document.getElementById('effJoinChartWrap');
    if (!rows.length) { if (wrap) wrap.style.height = '120px'; return; }
    const h = hbarHeight(rows.length);
    if (wrap) wrap.style.height = h + 'px';
    ctx.style.maxHeight = h + 'px';
    const joined = rows.map(r => r.j), pending = rows.map(r => r.p), dropped = rows.map(r => r.dr), offered = rows.map(r => r.o);
    // Each of Joined / Joining Pending / Dropped is split into the ROLES inside the department, in shades of
    // its colour (Jerin, 2026-08-29). The number for each metric is kept, drawn once across its bands.
    const METRICS = [
      { key: 'j', label: 'Joined', color: C.green },
      { key: 'p', label: 'Joining Pending', color: '#C9A227' },
      { key: 'dr', label: 'Dropped', color: '#A33253' }
    ];
    const chartRows = rows.map(r => ({
      label: r.dept,
      sum: { j: r.j, p: r.p, dr: r.dr },
      jobs: (r.per || []).map(x => ({ title: x.title, v: { j: x.c.j, p: x.c.p, dr: x.c.dr } }))
    }));
    const endLabels = {
      id: 'effJoinEndLabels',
      afterDatasetsDraw(chart) {
        const c = chart.ctx; c.save();
        c.font = '10px -apple-system, BlinkMacSystemFont, sans-serif'; c.textBaseline = 'middle';
        // Offered at the end of the bar; the Joining Conversion is its own labelled column at the right
        // edge (Jerin, 2026-08-29) — same treatment as the Recruiter Efficiency version, same helper.
        const last = chart.getDatasetMeta(chart.data.datasets.length - 1);
        last.data.forEach((bar, i) => {
          c.textAlign = 'left'; c.fillStyle = '#334155';
          c.fillText(String(offered[i]), bar.x + 6, bar.y);
        });
        c.restore();
        drawConvColumn(chart, offered.map((o, i) => o > 0 ? Math.round(((joined[i] + pending[i]) / o) * 100) : null), 'Joining conversion');
      }
    };
    effJoinChart = new Chart(ctx, {
      type: 'bar',
      data: { labels: rows.map(r => r.dept), datasets: roleBandDatasets(chartRows, METRICS, { borderRadius: 2 }) },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false, layout: { padding: { right: CONV_PAD + 34, top: 20 } },
        plugins: {
          valueLabels: false, stackTotals: false,
          legend: metricLegend(METRICS, { align: 'center', labels: { boxWidth: 11, boxHeight: 11, padding: 14, font: { size: 12 } } }),
          tooltip: roleSectionTooltip(METRICS, { totalLabel: 'Offered',
            extra: (i) => { const conv = offered[i] > 0 ? Math.round(((joined[i] + pending[i]) / offered[i]) * 100) : null;
              return conv == null ? '' : `Joining Conversion ${conv}%`; } })
        },
        scales: {
          x: { ...gridY, stacked: true, title: { display: true, text: 'People', font: { size: 11 }, color: '#64748b' } },
          y: { stacked: true, grid: { display: false }, ticks: { font: { size: 11, weight: '500' } } }
        }
      },
      plugins: [endLabels, roleBandOverlay(METRICS)]
    });
  }

  function renderThroughput() {
    const vis = TP_KEYS.filter(k => { const cb = document.querySelector(`.eff-tpStage[value="${k}"]`); return !cb || cb.checked; });
    const head = document.getElementById('effTpHead');
    if (head) {
      let r1 = '<tr><th rowspan="2" style="min-width:260px">Department / Job</th>';
      vis.forEach(k => { r1 += `<th colspan="3" class="stage-hdr">${TP_LABELS[k]}</th>`; });
      r1 += '</tr><tr>';
      // The sub-headers name the measure. Under the rebuild they are "assessed" and "progressed"; the old
      // In/Out wording described entering and leaving a stage, which counted a rejection as a pass.
      const hasA = !!(rollups && rollups.assessedByJobQ);
      const subIn = hasA ? 'Assessed' : 'In', subOut = hasA ? 'Progressed' : 'Out';
      vis.forEach(() => { r1 += `<th class="stage-sub">${subIn}</th><th class="stage-sub">${subOut}</th><th class="stage-sub">%</th>`; });
      head.innerHTML = r1 + '</tr>';
    }
    const body = document.getElementById('effTpBody'); if (!body) return;
    if (!tpByJob) { podSkeletonBody('effTpBody', vis.length * 3, () => dashTds(vis.length * 3)); return; }
    // Department → Job, from the stage-history rollups.
    const q = selQuarter();
    const pc = (n, d) => d ? ((n / d) * 100).toFixed(1) : '0.0';
    const cls = v => { const n = parseFloat(v); return n >= 50 ? 'good' : n >= 20 ? 'pct' : n > 0 ? 'warn' : 'zero'; };
    // Prefers the rebuilt measure — A = assessed at the stage (an interview held there, an assignment
    // triggered there, or a feedback form with no interview behind it), B = of those, the ones who then
    // entered a LATER stage. The old reached/cleared counted a rejection exactly like a promotion, which is
    // why App Review read 100%. The fallback only fires for a data file that predates the rebuild.
    const asJ = (rollups && rollups.assessedByJobQ) || null;
    const jobRC = (jid) => {
      if (asJ) {
        const t = asJ[jid] || {};
        return vis.map(k => { const c = (t[TP_TO_SK[k]] || {})[q] || {}; return { r: c.a || 0, c: c.b || 0 }; });
      }
      const t = tpByJob[jid] || {};
      return vis.map(k => { const c = t[TP_TO_SK[k]] || { reached: 0, cleared: 0 }; return { r: c.reached, c: c.cleared }; });
    };
    const cells = (rc) => rc.map((x, i) => (asJ && vis[i] === 'offer')
      ? `<td>${x.r}</td><td class="zero">—</td><td class="zero" title="Offer is the last stage — nothing after it to progress to">—</td>`
      : `<td>${x.r}</td><td>${x.c}</td><td class="${cls(pc(x.c, x.r))}">${pc(x.c, x.r)}%</td>`).join('');
    const sumRC = (arrs) => vis.map((_, i) => arrs.reduce((a, rc) => ({ r: a.r + rc[i].r, c: a.c + rc[i].c }), { r: 0, c: 0 }));
    let html = '';
    deptJobs(q).forEach(({ dept, jobs: js }, di) => {
      const jrc = js.map(j => jobRC(j.jid));
      html += `<tr data-path="${di}" data-haschild data-exp="0" style="cursor:pointer;background:var(--border-light)"><td style="font-weight:600">${CARET}${dept}<span style="color:var(--muted);font-weight:400;font-size:11px;margin-left:6px">${js.length}</span></td>${cells(sumRC(jrc))}</tr>`;
      js.forEach((j, ji) => { html += `<tr data-path="${di}-${ji}" style="display:none"><td style="padding-left:30px;color:var(--muted)">${j.title}</td>${cells(jrc[ji])}</tr>`; });
    });
    body.innerHTML = html || `<tr><td colspan="${vis.length * 3 + 1}" style="text-align:center;color:var(--muted);padding:16px">No departments match the filter.</td></tr>`;
    wireTreePath(body, expandAll());
    buildTpChartEff(q, vis);
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
  // ===== ToFU (top of funnel) — rebuilt 2026-08-26, same definition as Recruiter → Momentum =====
  // A candidate is added the first time they hit HM Screening, an assessment triggered while they sat in
  // the Online Assessment stage, or an R1 interview being booked — whichever came first — and is not
  // counted again for that role in the same quarter. The pipeline does the deduplication and emits
  // tofuByJob; there is no candidate identity in this file to do it with.
  // ⚠ Not the same as Screening Efficiency's "Added". Different question. Do not reconcile them.
  function renderVelocity() {
    const head = document.getElementById('effVelHead');
    const body = document.getElementById('effVelBody');
    if (!body) return;
    const q = selQuarter();
    const dates = velDates();
    const dkeys = dates.map(dkeyEff);
    if (head) {
      let h = `<tr><th style="min-width:260px">Department / Job</th><th>Total · ${dates.length}d</th>`;
      dates.forEach(d => {
        const wknd = d.getDay() === 0 || d.getDay() === 6;
        h += `<th class="${wknd ? 'wknd' : ''}"${wknd ? ' title="Weekend"' : ''}>${MON[d.getMonth()]} ${d.getDate()}</th>`;
      });
      head.innerHTML = h + '</tr>';
    }
    const numRow = (t, pd, bold) => `<td${bold ? ' style="font-weight:600"' : ''}>${t > 0 ? t : '<span class="zero">0</span>'}</td>` + pd.map(v => `<td>${v > 0 ? v : '<span class="zero">·</span>'}</td>`).join('');
    const add = (dst, src) => { for (let i = 0; i < dst.length; i++) dst[i] += src[i]; };
    let html = '';
    const rows = deptJobs(q);
    if (tofuByJob) {
      rows.forEach(({ dept, jobs: js }, di) => {
        const dArr = new Array(dkeys.length).fill(0); let dTot = 0;
        const jd = js.map(j => {
          const jm = tofuByJob[j.jid] || {};
          let jTot = 0;
          const jArr = dkeys.map(dk => { const v = jm[dk] || 0; jTot += v; return v; });
          add(dArr, jArr); dTot += jTot; return { j, jArr, jTot };
        });
        const dc = DEPT_COLORS[di % DEPT_COLORS.length];
        html += `<tr class="lvl-dept${dTot ? '' : ' lvl-quiet'}" data-path="${di}" data-haschild data-exp="0" style="cursor:pointer;background:var(--border-light)"><td style="font-weight:600;box-shadow:inset 3px 0 0 ${dc}">${CARET}${dept}<span style="color:var(--muted);font-weight:400;font-size:11px;margin-left:6px">${jd.length}</span></td>${numRow(dTot, dArr, true)}</tr>`;
        jd.forEach(({ j, jArr, jTot }, ji) => {
          html += `<tr class="lvl-job${jTot ? '' : ' lvl-quiet'}" data-path="${di}-${ji}" style="display:none"><td style="padding-left:30px;color:var(--text)">${j.title}</td>${numRow(jTot, jArr, false)}</tr>`;
        });
      });
    } else {
      // No ToFU field yet. Say so rather than falling back to the old per-stage counts, which answer a
      // different question and would sit under this heading as a lie.
      html += `<tr><td colspan="${dkeys.length + 2}" style="color:var(--muted);font-style:italic;padding:16px">ToFU arrivals appear after the next stage-history refresh.</td></tr>`;
    }
    body.innerHTML = html || `<tr><td colspan="${dkeys.length + 2}" style="text-align:center;color:var(--muted);padding:16px">No departments match the filter.</td></tr>`;
    wireTreePath(body, expandAll());
    buildVelChartEff();
  }

  // ===== Sourcing Mix — Department → Job → Source type → Source name =====
  // Counts JOINERS, not applications (Jerin, 2026-08-29 — mirrored from Recruiter Efficiency).
  // "Need this to be only for Hired folks." A channel can bring 25,810 applications and produce 2 people who
  // actually start; the application view made the loudest channel look like the best one.
  //
  // Joiner = accepted offer whose START DATE falls in the selected quarter — the same rule "Joined" means
  // everywhere else. The source comes off the offer record (srcType / srcName), which the pipeline started
  // carrying on 2026-08-29; it was always on the application, it just was not travelling as far as the offer.
  // ⚠ A joiner with no source on their application is kept under "(source not recorded)" rather than dropped,
  // so this panel still adds up to the number of joiners. About 1 in 20 today.
  //
  // Department/Job scope comes off the offer's own job, so both filters are real here.
  const NO_SRC = '(source not recorded)';
  const hasJoinerSrc = (data.offerEvents || []).some(e => e.srcType);

  let _jsQ = null, _jsMap = null;
  // { job8: { sourceType: { sourceName: joiners } } } for the given quarter (null/'' = all time).
  function joinerSourcesByJob(q) {
    if (_jsQ === (q || 'ALL') && _jsMap) return _jsMap;
    const out = {};
    (data.offerEvents || []).forEach(e => {
      if (!e.accepted || !e.jobId8) return;
      const eq = qOfDate(e.startDate);
      if (!eq) return;
      if (q && eq !== q) return;
      const t = e.srcType || NO_SRC;
      const nm = e.srcType ? (e.srcName || '(unspecified)') : NO_SRC;
      const j = out[e.jobId8] || (out[e.jobId8] = {});
      const bt = j[t] || (j[t] = {});
      bt[nm] = (bt[nm] || 0) + 1;
    });
    _jsQ = (q || 'ALL'); _jsMap = out;
    return out;
  }

  const mergeNested = (dst, src) => { for (const t in src) { const at = dst[t] || (dst[t] = {}); for (const nm in src[t]) at[nm] = (at[nm] || 0) + src[t][nm]; } return dst; };
  const sumNames = (names) => Object.values(names).reduce((a, v) => a + v, 0);
  const sumNested = (nst) => Object.values(nst).reduce((s, names) => s + sumNames(names), 0);

  // Department → Job, each carrying its merged {type:{name:count}}. Honours the Department + Job filters.
  function sourceTree(q) {
    const byJob = joinerSourcesByJob(q);
    return deptJobs(q).map(({ dept, jobs }) => {
      const jarr = [];
      jobs.forEach(j => {
        const nst = mergeNested({}, byJob[j.jid] || {});
        const tot = sumNested(nst);
        if (tot) jarr.push({ title: j.title, nst, tot });
      });
      jarr.sort((a, b) => b.tot - a.tot);
      const dn = jarr.reduce((d, j) => mergeNested(d, j.nst), {});
      return { dept, jobs: jarr, nst: dn, tot: sumNested(dn) };
    }).filter(d => d.tot > 0).sort((a, b) => b.tot - a.tot);
  }

  // The {type:{name:count}} the chart draws — same scope as the table, so the two can never disagree.
  function visibleSourceAgg(q) {
    const agg = {};
    sourceTree(q).forEach(d => mergeNested(agg, d.nst));
    return agg;
  }

  function renderSourcing() {
    const q = selQuarter();
    const body = document.getElementById('effSourceBody');
    const note = document.getElementById('effSourceNote');
    const warn = document.getElementById('effSourceWarn');
    const th = document.getElementById('effSourceTh');

    // Live state only — what the panel is showing right now. The definitions live in the collapsible block
    // above (Jerin, 2026-08-29: "don't we have the collapsible section to give the definition").
    if (note) note.textContent = q
      ? `Showing where the people who joined in ${q} came from.`
      : 'Showing where everyone who has joined came from (all time).';
    if (th) th.textContent = 'Department / Job / Source type / Source name';
    if (warn) {
      // The joiner cut needs the source ON THE OFFER RECORD, which the pipeline only started carrying on
      // 2026-08-29. Against an older data file every joiner lands in "(source not recorded)" — say so.
      warn.style.display = hasJoinerSrc ? 'none' : '';
      warn.innerHTML = 'Heads up: this data file predates sources being carried onto offer records, so no joiner can be attributed to a source yet. It fills in at the next refresh.';
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

    body.innerHTML = html || `<tr><td colspan="3" style="text-align:center;color:var(--muted);padding:16px">Nobody joined under these filters, so there is no source mix to show.</td></tr>`;
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
  // Same quarter-scoped basis as the table — a chart on a different basis from the table under it is the
  // single most repeated bug on this dashboard.
  // joinDeptCfg (the old per-department Offered/Hired chart) went with the definition change on
  // 2026-08-29 — the panel now has ONE chart, a bar per department, built in renderJoining.

  // Momentum per department: candidates ADDED to ToFU per day. One series now, because the metric is one
  // number per candidate rather than three stage counts — see renderVelocity above for the definition.
  // Reads tofuByJob, the same field the table reads, so the chart cannot drift from the table beneath it.
  // ===== Momentum chart (mirrors Recruiter Efficiency, 2026-08-29) =====
  // ONE BAR PER DAY — the question the panel answers — stacked by DEPARTMENT and, within a department,
  // shaded by ROLE: darkest block is that department's busiest role in the window. The legend stays at
  // department level; the role is in the tooltip. Reads tofuByJob, the same field the table reads.
  const DEPT_COLORS = ['#4E6BA6', '#398AA2', '#1E7590', '#938FB8', '#B5859A', '#5C8A6B', '#8A7B4E',
                       '#6E6EA8', '#41506B', '#2F7F86', '#9A6A8B', '#4F7C9E', '#7A8C5A'];
  function deptShade(hex, i, n) {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    const t = n > 1 ? 0.62 * (i / (n - 1)) : 0;
    const mix = (c) => Math.round(c + (255 - c) * t);
    return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
  }
  let effVelChart = null;
  function buildVelChartEff() {
    const ctx = document.getElementById('effVelChart'); if (!ctx) return;
    if (effVelChart) { effVelChart.destroy(); effVelChart = null; }
    const wrap = document.getElementById('effVelChartWrap');
    if (!tofuByJob) { if (wrap) wrap.style.height = '0px'; return; }
    const chrono = [...velDates()].reverse();
    const keys = chrono.map(dkeyEff);
    const datasets = [];
    deptJobs(selQuarter()).forEach(({ dept, jobs }, di) => {
      const base = DEPT_COLORS[di % DEPT_COLORS.length];
      const withData = jobs.map(j => {
        const m = tofuByJob[(j.jid || '').slice(0, 8)] || tofuByJob[j.jid] || {};
        const per = keys.map(k => m[k] || 0);
        return { title: j.title, per, t: per.reduce((a, v) => a + v, 0) };
      }).filter(x => x.t > 0).sort((a, b) => b.t - a.t);
      withData.forEach((J, ji) => datasets.push({
        label: J.title, _dept: dept, data: J.per, backgroundColor: deptShade(base, ji, withData.length),
        stack: 'd', borderWidth: 0, barPercentage: 0.95, categoryPercentage: 0.92
      }));
    });
    if (!datasets.length) { if (wrap) wrap.style.height = '120px'; return; }
    if (wrap) wrap.style.height = '420px';
    ctx.style.maxHeight = '420px';

    const isWknd = chrono.map(d => d.getDay() === 0 || d.getDay() === 6);
    const tickLabels = chrono.map((d, i) => {
      const showMonth = i === 0 || d.getMonth() !== chrono[i - 1].getMonth();
      return showMonth ? [String(d.getDate()), MON[d.getMonth()]] : [String(d.getDate()), ''];
    });
    const dayTotals = chrono.map((_, i) => datasets.reduce((a, ds) => a + (ds.data[i] || 0), 0));
    const emptyWeekdayMarks = {
      id: 'effEmptyWeekdayMarks',
      afterDatasetsDraw(chart) {
        const x = chart.scales.x, y = chart.scales.y; if (!x || !y) return;
        const base = y.getPixelForValue(0), c = chart.ctx;
        c.save(); c.fillStyle = 'rgba(163,50,83,0.55)';
        dayTotals.forEach((t, i) => {
          if (t > 0 || isWknd[i]) return;
          const px = x.getPixelForTick(i);
          c.beginPath();
          const w = 11, hh = 3;
          if (c.roundRect) c.roundRect(px - w / 2, base - hh, w, hh, 1.5); else c.rect(px - w / 2, base - hh, w, hh);
          c.fill();
        });
        c.restore();
      }
    };

    effVelChart = new Chart(ctx, {
      type: 'bar',
      data: { labels: tickLabels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          // In-bar numbers (Jerin, 2026-08-30). The global plugin skips segments too thin to hold one, so a
          // day with a single arrival in a department still reads cleanly.
          valueLabels: true,
          legend: {
            position: 'top', align: 'center',
            labels: {
              usePointStyle: true, pointStyle: 'rect', boxWidth: 11, boxHeight: 11, padding: 14, font: { size: 11 },
              generateLabels: (chart) => {
                const seen = [];
                chart.data.datasets.forEach((d, i) => { if (!seen.some(x => x.dept === d._dept)) seen.push({ dept: d._dept, i }); });
                // ⚠ pointStyle must be set on the LABEL — a custom generateLabels ignores labels.pointStyle
                // and falls back to a circle.
                return seen.map(({ dept, i }) => ({ text: dept, fillStyle: chart.data.datasets[i].backgroundColor,
                  strokeStyle: 'transparent', pointStyle: 'rect', hidden: !chart.isDatasetVisible(i), datasetIndex: i }));
              }
            },
            onClick: (e, item, legend) => {
              const chart = legend.chart, dept = chart.data.datasets[item.datasetIndex]?._dept;
              if (!dept) return;
              const show = !chart.isDatasetVisible(item.datasetIndex);
              chart.data.datasets.forEach((d, i) => { if (d._dept === dept) chart.setDatasetVisibility(i, show); });
              chart.update();
            }
          },
          tooltip: {
            itemSort: (a, b) => b.parsed.y - a.parsed.y,
            callbacks: {
              title: (items) => { const d = chrono[items[0].dataIndex];
                return `${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`; },
              label: (c2) => `${c2.dataset._dept} · ${c2.dataset.label}: ${c2.parsed.y}`,
              footer: (items) => `Added that day: ${items[0].chart.data.datasets.reduce((a, d) => a + (d.data[items[0].dataIndex] || 0), 0)}`
            }
          }
        },
        scales: {
          x: { stacked: true, grid: { display: false },
               ticks: { font: { size: 10 }, maxRotation: 0, minRotation: 0, autoSkip: false, padding: 2,
                        color: (c) => (isWknd[c.index] ? '#A15568' : '#64748b') } },
          y: { ...gridY, stacked: true, ticks: { ...TICKS, precision: 0 },
               title: { display: true, text: 'Candidates added to ToFU', font: { size: 11 }, color: '#64748b' } }
        }
      },
      plugins: [emptyWeekdayMarks]
    });
  }

  // screenDeptCfg (the old per-department Added/Cleared-per-stage chart) went with the single R1 set on
  // 2026-08-29 — the panel now has ONE chart, a bar per department, built in renderScreening.
  // Per-pod Throughput chart: Added (reached) vs Cleared per stage, from throughputByJob over the pod's jobs.
  // Respects the stage toggle; shows only stages with any activity. Horizontal grouped bars. Null → placeholder.

  // Fulfilment charts: bars are STACKED Joined / Joining Pending / Gap, which add up to Total Positions —
  // so the bar and the table carry the same three numbers. A label at the end of each bar gives the total,
  // because a stacked bar hides it otherwise and the total is the number people are looking for.
  // NOTE: the stack total at the end of each bar is now drawn by the GLOBAL stackTotalsPlugin
  // (chart-datalabels.js, registered in app.js), so every stacked chart in the app gets it, not just
  // these two. Opt a chart out with options.plugins.stackTotals = false.
  const FULFIL_COLORS = { joined: '#398AA2', pending: '#4E6BA6', gap: '#D8B5BE' };   // palette: Blue Munsell / True Blue / Fairy Tale
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

  // One bar per department, stacked Joined / Joining Pending / Delta — and Joined and Joining Pending split
  // again into the ROLES inside the department, in shades of the metric colour (Jerin, 2026-08-29: "don't
  // need department-wise charts, the overall chart is enough — but bring in the gradient to the department,
  // each gradient being a job"). The shared helper in chart-style.js does the banding, so this chart, HM
  // Positions and the two panels below it cannot drift apart.
  // ⚠ Delta is NOT split — it can be negative and the table clamps it at DEPARTMENT level. Splitting it let
  // a −5 role and a +5 role cancel in the table while both counted in the chart (SME - India read 53
  // against the table's 48).
  function renderFulfilCharts(q) {
    const rows = fulfilRows(q);

    const ctx = document.getElementById('effFulfilCombined'); if (!ctx) return;
    if (effFulfilCombined) effFulfilCombined.destroy();
    effFulfilCombined = null;
    const wrap = document.getElementById('effFulfilCombinedWrap');
    const hdr = document.getElementById('effFulfilCombinedHdr');
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
    if (wrap) wrap.style.height = hbarHeight(rows.length, 80, 220) + 'px';
    ctx.style.maxHeight = 'none';

    const METRICS = [
      { key: 'joined', label: 'Joined', color: FULFIL_COLORS.joined },
      { key: 'pending', label: 'Joining Pending', color: FULFIL_COLORS.pending },
      { key: 'gap', label: 'Delta', color: FULFIL_COLORS.gap, split: false }
    ];
    const chartRows = rows.map(r => ({
      label: r.dept,
      sum: { joined: r.sum.joined, pending: r.sum.pending, gap: r.sum.gap },
      jobs: (r.jobs || []).map(x => ({ title: x.j.title, v: { joined: x.sp.joined, pending: x.sp.pending } }))
    }));

    const opts = fulfilStackOpts('Positions');
    opts.plugins.legend = metricLegend(METRICS);
    opts.plugins.tooltip = roleSectionTooltip(METRICS, { totalLabel: 'Total positions' });
    effFulfilCombined = new Chart(ctx, {
      type: 'bar',
      data: { labels: rows.map(r => r.dept), datasets: roleBandDatasets(chartRows, METRICS) },
      options: opts,
      plugins: [roleBandOverlay(METRICS)]
    });
  }

  // Per-department chart: Y = job, bars = Offered / Hired score for that job.
  // One small chart per department (mirror of the old renderPodCharts, keyed on department).

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
      if (emptyMsg) { emptyMsg.textContent = 'Nobody joined under the current filter, so there is no source mix to show.'; emptyMsg.style.display = 'flex'; }
      return;
    }
    ctx.style.display = ''; if (emptyMsg) emptyMsg.style.display = 'none';
    // types sorted by total (desc); global top-12 names + Other
    const typeLabels = types.map(t => [t, Object.values(agg[t]).reduce((a, v) => a + v, 0)]).sort((a, b) => b[1] - a[1]).map(x => x[0]);
    const nameTotals = {}; types.forEach(t => { for (const nm in agg[t]) nameTotals[nm] = (nameTotals[nm] || 0) + agg[t][nm]; });
    const topNames = Object.entries(nameTotals).sort((a, b) => b[1] - a[1]).slice(0, 12).map(x => x[0]);
    const topSet = new Set(topNames);
    const datasets = topNames.map((nm, i) => ({ label: nm, data: typeLabels.map(t => (agg[t] && agg[t][nm]) || 0), backgroundColor: SRC_PALETTE[i % SRC_PALETTE.length], stack: 's', borderWidth: 0, ...HBAR }));
    const otherData = typeLabels.map(t => Object.entries(agg[t]).reduce((s, [nm, c]) => s + (topSet.has(nm) ? 0 : c), 0));
    // ⚠ Not keyed on the string 'Other': Ashby has a real source NAME of its own that could collide. This
    // bucket is the leftover names beyond the top 12, and is labelled so.
    if (otherData.some(v => v > 0)) datasets.push({ label: 'All other sources', data: otherData, backgroundColor: '#cbd5e1', stack: 's', borderWidth: 0, ...HBAR });
    const hSrc = hbarHeight(typeLabels.length, 130);
    if (wrap) wrap.style.height = hSrc + 'px'; ctx.style.maxHeight = hSrc + 'px';
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
          x: { stacked: true, beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 10 } }, title: { display: true, text: 'Joiners', font: { size: 11 }, color: '#64748b' } },
          y: { stacked: true, grid: { display: false }, ticks: { font: { size: 11 } } }
        }
      }
    });
  }

  function renderActive() {
    if (activeTab === 'fulfilment') renderFulfilment();
    else if (activeTab === 'velocity') renderVelocity();
    else if (activeTab === 'screening') renderScreening();   // its chart is built inside renderScreening
    else if (activeTab === 'throughput') renderThroughput();   // its chart is built inside renderThroughput
    else if (activeTab === 'timeinprocess') renderTimeInProcess();
    else if (activeTab === 'joining') renderJoining();   // its chart is built inside renderJoining
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
