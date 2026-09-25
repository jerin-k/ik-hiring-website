import { podOf, POD_OPTIONS, isSalesPod, capacityOf, currentQuarter, qKey } from '../recruiter-pods.js';
import { uiPx } from '../ui-scale.js';   // #140: canvas text + pixel constants
import { defsBlock } from '../definitions.js';
import { jobFilterOptions, matchesJob, matchesJobRow } from '../job-filter.js';   // #172c
import { tdCandidate, tdDept, tdJob, tdDoj, tdStage, tdRecruiter, tdLinked } from '../people-cells.js';   // #137
import { tdTopic, tdOpening, topicLookup } from '../people-cells.js';   // #168/#169: the opening and the topic
import { monthTreeRows, pinMonthHeadings, stageSplit } from '../people-tree.js';   // #149: month ➔ date ➔ people
import { shadeMomentum, shadeTis, shadePipeline, shareBars, colorShareBars } from '../grid-shade.js';   // #137c · #145a
import { renderInterviewer, initInterviewer } from './interviewer.js';
// #145a (Jerin, 19 Sep 2026): the Pipeline panel moves here as it stands on the Hiring Manager tab, so it reads
// that tab's stage list — one list for both tables.
import { STAGES_ORDER as PIPE_KEYS, STAGE_LABELS as PIPE_LABELS } from './hm-report.js';
import { resolveDeptTeam } from '../dept-map.js';
import { TIS_STAGES, poolHists, tisCell, periodQuarters, hasQuarterTis, tisHist, APP_REVIEW_LIVE_NOTE,
         hasWaitSplit, tisPair, tisPairRange, poolPairs, tisCellSplit } from '../stage-time.js';
import { REPORTING_START, reportingYears, selectionQuarters, periodText, fillQuarterSelect, selectCurrentQuarter, setDateBounds, keepDatesInBounds,
         rangeOf, inRange, rangeText, coversQuarters, quarterOfDay, sumDayFields, hasDayData,
         dojFilterHtml, dojFilterOf, inDojFilter, dojFilterText, toggleJpFilters, showControl } from '../period.js';   // #127 · #129 · #133
import { scoreForRole } from '../score-model.js';
import { openingScores, scoreOfOpening, jobScoreSpread, jobScoreCaption } from '../opening-score.js';   // #165 · #176a
import { topicIndex, hasTopicLevel } from '../opening-topics.js';   // #157
import { jobsWithOpeningIn } from '../data.js';   // #125
import { HBAR, hbarHeight, CONV_PAD, drawConvColumn, roleBandDatasets, roleBandOverlay, roleSectionTooltip, metricLegend,
         buildDumbbell, buildStageHeat, buildDayHeat } from '../chart-style.js';

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
                 level: e.level, complexity: e.complexity, quarter: e.attrQuarter, source: 'offer',
                 day: e.lateEntryAt || e.archivedAt || null }));   // #129: the pipeline's rule for dropEvents.day
}
// #129 (15 Sep 2026): is this drop inside the From / To range? A drop is dated by the day the candidate first reached Ref Check,
// Documentation or Offer (dropEvents.day). A row from a data file older than 15 Sep has no day, so it can only answer for whole quarters.
function dropIn(e, rg, qs) {
  return e.day ? inRange(e.day, rg) : (!!qs && coversQuarters(rg, qs) && qs.includes(e.quarter));
}

const CARET = '<span class="caret" style="display:inline-block;width:0.875rem;color:var(--muted)">▸</span>';
const DASH = '<span class="zero">—</span>';
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Throughput stages (mirrors the HM tab)
const TP_KEYS = ['app','hc','ta','hm','oa','r1','r2','r3','r4','r5','rc','ds','offer'];   // Hello Christy added #120 (14 Sep 2026): the HM tab had it, this mirror did not
const TP_LABELS = { app:'App Review', hc:'Hello Christy', ta:'TA Screen', hm:'HM Review', oa:'OA', r1:'R1', r2:'R2', r3:'R3', r4:'R4', r5:'R5', rc:'Ref Check', ds:'Doc Sub', offer:'Offer' };
const TP_TO_SK = { app:'appReview', hc:'helloChristy', ta:'taScreen', hm:'hmReview', oa:'oa', r1:'r1', r2:'r2', r3:'r3', r4:'r4', r5:'r5', rc:'refCheck', ds:'docSub', offer:'offer' };

function dashTds(n) { return `<td>${DASH}</td>`.repeat(n); }

// Generic N-level collapsible tree. Rows carry data-path ("0", "0-1", "0-1-2"…) + data-haschild for
// expandable rows. Clicking shows only direct children; collapsing hides + resets all descendants.

// ===== #157: the Specialization/Topic level on Overall Efficiency =====
// B1 (Jerin, 20 Sep): a topic row fills only the columns that are TRUE per topic - Total positions, Joined and
// Missed, in BOTH halves (heads and score). #161 (Jerin, 22 Sep): Joining pending splits too, for the people whose
// OFFER names an opening under the topic (or who are locked on one) - the mirror of the Hiring Manager tab. Drop and
// Delta stay dashed: a drop can never be tied to an opening (Rule 8), and Delta would mix in the untied people.
// 🚨 Never put a number in a dashed cell: a wrong one here looks right and nobody will question it.
const EFF_DASH = '<td class="nosplit"><span class="zero">\u2014</span></td><td class="score nosplit"><span class="zero">\u2014</span></td>';
const topicCells = (x) =>
  `<td style="font-weight:600">${x.total}</td><td class="score">${x.tS}</td>`
  + `<td class="${x.joined ? 'good' : 'zero'}">${x.joined}</td><td class="score">${x.jS}</td>`
  + `<td>${x.pending > 0 ? `<span style="color:var(--orange);font-weight:600">${x.pending}</span>` : '<span class="zero">0</span>'}</td>`
  + `<td class="score">${x.pS > 0 ? x.pS : '<span class="zero">0</span>'}</td>`
  + EFF_DASH + EFF_DASH
  + `<td${x.missed ? ' style="color:var(--red)"' : ' class="zero"'}>${x.missed}</td><td class="score">${x.mS}</td>`;

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
    tbody.querySelectorAll('tr[data-path]').forEach(r => { r.style.display = ''; if (r.hasAttribute('data-haschild')) { r.dataset.exp = '1'; const c = r.querySelector('.caret'); if (c) c.textContent = '▾'; } });
  }
}

// Module-level so a return visit destroys the previous instance instead of leaking it (#120, 14 Sep 2026).
let effFulfilCombined = null, effSourceChart = null, effScreenChart = null, effJoinChart = null;
// One shared function, so revisiting the tab does not stack another document listener each time (#120).
const closeMsPanels = () => document.querySelectorAll('.ms-panel').forEach(p => p.style.display = 'none');

export function renderEfficiency(data) {
  if (!data || !data.funnel) return '<p>No data available.</p>';

  const years = reportingYears();   // #127c: 2026 onwards; a new year appears on its first day

  return `
    <style>
      /* .eff-subtabs is the recessed .subtab-band — see style.css */
      /* .eff-subtab now inherits .subtab-chip from style.css — one chip for every level below the page */

      /* .eff-filters look now lives in style.css — one quiet row, defined once */
      .eff-filters select, .eff-filters input[type=date] {
        appearance:none; -webkit-appearance:none; height:1.75rem; padding:0 0.6875rem; border:1px solid var(--border);
        border-radius:0.5rem; font-size:0.75rem; font-weight:500; background:var(--card); color:var(--text); }
      .eff-filters select { padding-right:1.75rem; cursor:pointer;
        background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%2364748b' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
        background-repeat:no-repeat; background-position:right 0.625rem center; }
      .eff-filters select:hover, .eff-filters input:hover { border-color:var(--muted); }
      .eff-filters select:focus, .eff-filters input:focus { outline:none; border-color:var(--accent); box-shadow:0 0 0 0.1875rem rgba(78,107,166,0.16); }
      .eff-filters .fchip { display:flex; align-items:center; gap:0.4375rem; }
      /* .eff-filters label styling lives in style.css — quiet, sentence case */
      .eff-filters .fchip > label.opt { font-size:0.75rem; font-weight:500; display:flex; align-items:center; gap:0.25rem; cursor:pointer; color:var(--text) }
      .eff-filters .fdiv { width:1px; align-self:stretch; background:#cdddf7; margin:2px 2px; }

      /* Velocity table — freeze the first two columns */
      .evel-table { width:auto; min-width:100%; border-collapse:separate; border-spacing:0; overflow:visible; }
      .evel-table th, .evel-table td { white-space:nowrap; }
      /* Design pass 2026-08-29, mirroring the Recruiter grid: tighter rhythm, values louder than the dots,
         weekends underlined in a soft maroon, departments with nothing in the window muted. */
      .evel-table th { padding:0.5rem 0.5625rem; letter-spacing:0.02em; }
      .evel-table td { padding:0.375rem 0.5625rem; }
      .evel-table tbody td:not(:first-child) { font-weight:500; font-variant-numeric:tabular-nums; }
      .evel-table tbody td .zero { font-weight:400; }
      .evel-table tbody tr.lvl-quiet td { color:var(--muted); }
      .evel-table tbody tr.lvl-quiet td:not(:first-child) { font-weight:400; }
      .evel-table th.wknd { box-shadow:inset 0 -2px 0 rgba(163,50,83,0.38); }
      /* #151b option B: centred, like every other number. The day columns already hold 3.5rem below — that
         existing width is what the site-wide number width was measured against. */
      .evel-table th:not(:first-child), .evel-table td:not(:first-child) { text-align:center; }
      .evel-table th:nth-child(n+3), .evel-table td:nth-child(n+3) { min-width:3.5rem; }
      .evel-table th:nth-child(1), .evel-table td:nth-child(1) { position:sticky; left:0; z-index:2; width:16.25rem; min-width:16.25rem; max-width:16.25rem; white-space:normal; }
      .evel-table td:nth-child(1) { text-align:left; }   /* #151b: the heading above it centres like every other */
      .evel-table th:nth-child(2), .evel-table td:nth-child(2) { position:sticky; left:16.25rem; z-index:2; min-width:6rem; border-right:2px solid var(--border); }
      /* #151b: the heading band, not the page ground — these two are sticky, so they must be opaque (147a). */
      .evel-table thead th:nth-child(1), .evel-table thead th:nth-child(2) { z-index:3; background:#eef2f8; }
      .evel-table tbody td:nth-child(1), .evel-table tbody td:nth-child(2) { background:var(--card); }

      /* per-department chart cards */
      .eff-podcharts { display:grid; grid-template-columns:repeat(auto-fit,minmax(15rem,1fr)); gap:0.75rem; margin-bottom:1.125rem; }
      /* Fulfilment: two per row — five across made every bar unreadable. */
      .eff-podcharts.eff-2col { grid-template-columns:repeat(2,minmax(0,1fr)); }
      @media (max-width:50.625rem) { .eff-podcharts.eff-2col { grid-template-columns:1fr; } }
      .eff-podchart { border:1px solid var(--border); border-radius:0.625rem; padding:0.875rem 1rem; background:var(--card); min-height:6.875rem;
        display:flex; flex-direction:column; gap:0.375rem; }
      .eff-podchart h5 { font-size:0.75rem; font-weight:600; color:var(--text); margin:0; }
      .eff-podchart p { font-size:0.6875rem; color:var(--muted); margin:0; line-height:1.5; }
    </style>


    <div class="eff-subtabs subtab-band">
      <!-- #130 (Jerin, 15 Sep 2026): one name on every tab, and the two people lists on their own sub-tabs. Tab keys unchanged, so saved links still open. -->
      <button class="eff-subtab subtab-chip active" data-tab="fulfilment">Position Fulfilment</button>
      <button class="eff-subtab subtab-chip" data-tab="joiningpending">Joining Pending</button>
      <button class="eff-subtab subtab-chip" data-tab="joiners">Joiners</button>
      <button class="eff-subtab subtab-chip" data-tab="velocity">Momentum</button>
      <button class="eff-subtab subtab-chip" data-tab="screening">Screening Efficiency</button>
      <button class="eff-subtab subtab-chip" data-tab="throughput">Throughput</button>
      <button class="eff-subtab subtab-chip" data-tab="pipeline">Pipeline</button>
      <button class="eff-subtab subtab-chip" data-tab="timeinprocess">Time in Process</button>
      <button class="eff-subtab subtab-chip" data-tab="joining">Joining Conversion</button>
      <button class="eff-subtab subtab-chip" data-tab="sourcing">Sourcing Mix</button>
      <button class="eff-subtab subtab-chip" data-tab="panelists">Panelists</button>
    </div>

    <div class="eff-filters">
      <div class="fchip"><div class="ms" id="effMsDept"></div></div>
      <div class="fchip"><div class="ms" id="effMsJob"></div></div>
      <div class="fchip" id="effExpandWrap"><label class="opt"><input type="checkbox" id="effExpandAll" checked> Expand all</label></div>
      <span class="fdiv"></span>
      
      
    <span class="period" id="effPeriod"><div class="fchip"><span class="lbl">Year</span><select id="effYear"><option value="">All</option>${years.map(y => `<option value="${y}">${y}</option>`).join('')}</select></div><div class="fchip"><span class="lbl">Quarter</span><select id="effQuarter"><option value="">All</option></select></div><div class="fchip vel-dates"><span class="lbl">From</span><input type="date" id="effVelFrom"></div><div class="fchip vel-dates"><span class="lbl">To</span><input type="date" id="effVelTo"></div></span>${dojFilterHtml('eff', data.joiningPendingCases)}
      </div>

    <!-- PANEL: Position Fulfilment -->
    <div class="eff-panel" data-panel="fulfilment">
      <h4 id="effFulfilCombinedHdr" style="font-size:0.6875rem;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.04em;margin:0.875rem 0 0.375rem">Positions by department</h4>
      <div class="chart-wrap" id="effFulfilCombinedWrap" style="margin:0 0 1.125rem"><canvas id="effFulfilCombined"></canvas></div>

      <div class="scroll-table"><table class="metrics">
        <thead>
          <tr><th rowspan="2" style="min-width:17.5rem">Department / Job</th><th colspan="2" class="stage-hdr">Total positions</th><th colspan="2" class="stage-hdr">Joined</th><th colspan="2" class="stage-hdr">Joining pending</th><th colspan="2" class="stage-hdr">Drop</th><th colspan="2" class="stage-hdr">Delta</th><th colspan="2" class="stage-hdr">Missed</th></tr>
          <tr><th class="stage-sub">HC</th><th class="stage-sub">Score</th><th class="stage-sub">HC</th><th class="stage-sub">Score</th><th class="stage-sub">HC</th><th class="stage-sub">Score</th><th class="stage-sub">HC</th><th class="stage-sub">Score</th><th class="stage-sub">HC</th><th class="stage-sub">Score</th><th class="stage-sub">HC</th><th class="stage-sub">Score</th></tr>
        </thead>
        <tbody id="effFulfilBody"></tbody>
      </table></div>
      ${defsBlock('eff-fulfilment')}
    </div>

    <!-- PANEL: Joining Pending (#130b — was the Cases list under Position Fulfilment) -->
    <div class="eff-panel" data-panel="joiningpending" style="display:none">
      <p class="sub-note" id="effJPCaption" style="margin-bottom:0.5rem"></p>
      <div class="scroll-table"><table class="pl-list">
        <thead><tr><th style="min-width:13rem">Joining date / person</th><th class="c-stage">Sub-stage</th><th class="c-rec">Recruiter</th><th class="c-dept">Department</th><th class="c-job">Job</th><th class="c-open-name">Opening</th><th class="c-topic">Topic</th><th class="c-open">Linked</th></tr></thead>
        <tbody id="effFulfilJPBody"></tbody>
      </table></div>
      ${defsBlock('eff-joiningpending')}
    </div>

    <!-- PANEL: Joiners (#130c) — the Joining Pending columns minus Sub-stage: Hired is one stage -->
    <div class="eff-panel" data-panel="joiners" style="display:none">
      <p class="sub-note" id="effJoinersCaption" style="margin-bottom:0.5rem"></p>
      <div class="scroll-table"><table class="pl-list">
        <thead><tr><th style="min-width:13rem">Joining date / person</th><th class="c-rec">Recruiter</th><th class="c-dept">Department</th><th class="c-job">Job</th><th class="c-open-name">Opening</th><th class="c-topic">Topic</th><th class="c-open">Linked</th></tr></thead>
        <tbody id="effJoinersBody"></tbody>
      </table></div>
      ${defsBlock('eff-joiners')}
    </div>

    <!-- PANEL: Momentum — candidates added to ToFU, one column per day. Chart and grid mirror the Recruiter
         tab since 2026-08-29: one bar per DAY stacked by department and shaded by role, every date on the
         axis, weekends in maroon, a small mark on any weekday with nothing on it. -->
    <div class="eff-panel" data-panel="velocity" style="display:none">
      <div class="tofu-heat-wrap" id="effVelHeatWrap"><div id="effVelHeat" class="tofu-heat"></div><div id="effVelHeatTip" class="heat-tip"></div></div>
      <div class="scroll-table"><table class="evel-table">
        <thead id="effVelHead"></thead>
        <tbody id="effVelBody"></tbody>
      </table></div>
      ${defsBlock('eff-momentum')}
    </div>

    <!-- PANEL: Screening Efficiency — ONE R1 column set since 2026-08-29, mirroring the Recruiter tab.
         HM Review and Online Assessment columns were removed on purpose: this panel is about R1, and
         both still count on Momentum through ToFU. -->
    <div class="eff-panel" data-panel="screening" style="display:none">
      <div class="chart-wrap" id="effScreenChartWrap" style="height:18.75rem"><canvas id="effScreenChart"></canvas></div>
      <div class="scroll-table"><table class="metrics">
        <thead><tr>
          <th style="min-width:17.5rem">Department / Job</th>
          <th class="c-num">Added at R1</th>
          <th class="c-num">Progressed</th>
          <th class="c-pct">%</th>
        </tr></thead>
        <tbody id="effScreenBody"></tbody>
      </table></div>
      ${defsBlock('eff-screening')}
    </div>

    <!-- PANEL: Throughput (mirrors HM) -->
    <div class="eff-panel" data-panel="throughput" style="display:none">
      <div class="tp-controls">
        <div class="ms" id="effMsTpStage"></div>
        <label><input type="checkbox" id="effTpHideEmpty" checked> Hide zero-pipeline</label>
      </div>
      <!-- #122 (Jerin, 15 Sep 2026 — option C1): ONE section, as on the Hiring Manager tab. Departments open into their jobs
           inside the squares; the Department / Job table that repeated them underneath is gone. -->
      <div class="sheat-wrap">
        <div class="sheat-head"><h3 class="subsection-title">Throughput — by stage</h3><span class="sheat-hint" id="effTpHint"></span></div>
        <div id="effTpHeat" class="sheat"></div><div id="effTpHeatTip" class="sheat-tip"></div>
      </div>
      ${defsBlock('eff-throughput')}
    </div>

    <!-- PANEL: Pipeline (#145a, Jerin 19 Sep 2026) — the Hiring Manager tab's live snapshot, on this tab's Department / Job filters -->
    <div class="eff-panel" data-panel="pipeline" style="display:none">
      <p class="sub-note" style="color:var(--orange)"><strong>Live</strong> — counts show where candidates stand today, not in the selected period. Click a department to drill in.</p>
      <div class="tp-controls">
        <div class="ms" id="effMsPipeStage"></div>
        <label><input type="checkbox" id="effPipeHideEmpty" checked> Hide zero-pipeline</label>
      </div>
      <div class="scroll-table"><table id="effPipeTable">
        <thead id="effPipeHead"></thead>
        <tbody id="effPipeBody"></tbody>
      </table></div>
      ${defsBlock('eff-pipeline')}
    </div>

    <!-- PANEL: Time in Process -->
    <div class="eff-panel" data-panel="timeinprocess" style="display:none">
      <p class="sub-note" id="effTisNote" style="display:none"></p>
      <div class="scroll-table"><table>
        <thead id="effTisHead"></thead>
        <tbody id="effTisBody"></tbody>
      </table></div>
      ${defsBlock('eff-tis')}
    </div>

    <!-- PANEL: Joining Conversion — brought onto the settled definition 2026-08-29, mirroring the Recruiter
         tab: Offered = Joined + Joining Pending + Dropped, so the row always closes, and the conversion is
         (Joined + Joining Pending) / Offered. It used to read Offered / Hired / Conversion %, which was the
         pre-26-August metric and disagreed with the same-named panel on the Recruiter tab. -->
    <div class="eff-panel" data-panel="joining" style="display:none">
      <div class="chart-wrap" id="effJoinChartWrap" style="height:18.75rem"><canvas id="effJoinChart"></canvas></div>
      <div class="scroll-table"><table class="metrics join-table">
        <thead><tr>
          <th>Department / Job</th>
          <th class="c-num">Offered</th>
          <th class="c-num">Joined</th>
          <th class="c-num">Joining pending</th>
          <th class="c-cap">Dropped</th>
          <th class="c-bar">Joining conversion</th>
        </tr></thead>
        <tbody id="effJoinBody"></tbody>
      </table></div>
      ${defsBlock('eff-joining')}
    </div>

    <!-- PANEL: Sourcing Mix -->
    <div class="eff-panel" data-panel="sourcing" style="display:none">
      <p class="sub-note" id="effSourceNote"></p>
      <p class="sub-note" id="effSourceWarn" style="display:none;color:var(--orange);margin-top:-0.375rem"></p>
      <h3 class="subsection-title">Channel mix — where joiners came from</h3>
      <div class="chart-wrap" style="margin:0 0 1.25rem;height:28.75rem;position:relative"><canvas id="effSourceChart"></canvas></div>
      <div class="scroll-table"><table>
        <thead><tr><th style="min-width:21.25rem" id="effSourceTh">Department / Job / Source type / Source name</th><th class="c-num">Joiners</th><th class="c-bar">%</th></tr></thead>
        <tbody id="effSourceBody"></tbody>
      </table></div>
      ${defsBlock('eff-sourcing')}
    </div>

    <div class="eff-panel" data-panel="panelists" style="display:none">
      <div id="effPanelHost"></div>
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
  // Candidates still sitting in the stage, kept apart from completed stays (see stage-time.js).
  const waitByJob = rollups.waitingByJob || null;            // {job8:{stage:{days:count}}} — still parked
  const waitByJobQ = rollups.waitingByJobQ || null;          // same, per quarter entered
  const tisSplit = hasWaitSplit(rollups);
  const arDwellJob = data.appReviewDwellByJob || null;       // {job8:{days:count}} — App Review dwell (still-parked candidates)
  let activeTab = 'fulfilment';
  let msPod = null, msDept = null, msJob = null, msEffTpStage = null, msEffPipeStage = null;   // #145a

  const expandAll = () => !!document.getElementById('effExpandAll')?.checked;

  // ONE quarter, for the job trees the activity panels hang their period data off.
  // 🚨 #120 (14 Sep 2026): this fell through to TODAY's quarter whenever EITHER dropdown read "All", so Year: All with
  // Q1 showed Q3 figures under a Q1 filter (the Recruiter tab was fixed the same way earlier). Resolve the year
  // instead, and fall back to the current quarter only when no quarter is picked at all.
  function selYear() {
    const sel = document.getElementById('effYear');
    if (sel && sel.value) return sel.value;
    const first = sel ? [...sel.options].map(o => o.value).filter(Boolean)[0] : '';
    return first || String(new Date().getFullYear());
  }
  function selQuarter() {
    const q = document.getElementById('effQuarter')?.value;
    return q ? qKey(selYear(), q) : currentQuarter();
  }
  // #126 (Jerin, 15 Sep 2026): Fulfilment and Joining Conversion follow the WHOLE period (tisPeriod), the way the Hiring Manager tab
  // does — with Quarter on All they add up every quarter of the selected year, and with Year and Quarter both on All every quarter on
  // record (period null). "An earlier quarter's opening" means one raised before the period starts, and each quarter's positions score
  // at that quarter's points. This is the one quarter a period's job rows are scored at — the points shown beside a role, and Joining
  // Pending, which is live: the current quarter when the period holds it, otherwise the period's last quarter.
  function scoreQOf(per) {
    const cur = currentQuarter();
    return !per || per.includes(cur) ? cur : per[per.length - 1];
  }

  // Recruiters mapped to a pod for the selected quarter — used only for the live capacity sums.
  function podMembers(pod, q) { return recruiters.filter(r => podOf(r.name, q) === pod); }
  function podCapacity(pod, q) { return podMembers(pod, q).reduce((s, r) => s + (capacityOf(r.name, q) || 0), 0); }

  // jobs[] keyed by 8-char id; recruiters[].byJob[].jobId is the full uuid → join on the prefix.
  const jobById = {}; jobs.forEach(j => { jobById[j.id] = j; });
  // #173 (Jerin, 24 Sep 2026: "Loki has an orphan job at the bottom"): fall back to `jobIndex` for the name.
  // 🚨 The cause is NOT that the job is archived — archived jobs ARE in `data.jobs`. The pipeline drops a job from
  //    that list when it has **no applications in the current-year slice** (`if (j2.applied === 0) continue`), which is
  //    what happens to an older role long after its candidates fall outside the window. `jobIndex` is the pipeline's
  //    COMPLETE title/department map (334 jobs vs 124 in `data.jobs`), so the name is always there to be had.
  // ⚠ Level and Complexity are in NEITHER fallback, so such a row still cannot be scored — that is #165's job, and
  //   until then the row says "not scored" rather than printing a 0 that looks like a real answer.
  const jobMeta = (bj) => { const j8 = (bj.jobId || '').slice(0, 8), j = jobById[j8], ix = (data.jobIndex || {})[j8];
    return { department: (j && j.department) || bj.department || (ix && ix.department), title: (j && j.title) || bj.title || (ix && ix.title), level: j && j.level, complexity: j && j.complexity }; };

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
        const J = D.jobs[jid] || (D.jobs[jid] = { jid: jid, title: m.title || '(untitled)', level: m.level, complexity: m.complexity, dept, total: 0, offer: 0, hired: 0, score: scoreForRole(m, q),
          rawDept: m.department, rawTitle: m.title });   // #126: what scoreOf() needs to price the role in another quarter
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
      const arr = Object.values(P.depts[dept].jobs).filter(j => matchesJobRow(jsel, data, j.jid, dept, j.title)).sort((a, b) => (b.total || 0) - (a.total || 0));   // #172c
      if (arr.length) out.push({ dept, jobs: arr });
    });
    return out;
  }

  // ===== #18: Department → Job, pods removed =====
  // Overall Efficiency used to hang everything off Pod, which forced a fudge: getTree attributes each job to
  // a pod via the recruiters who worked it, so a job worked from two pods was SPLIT across them. Every job
  // belongs to exactly one department, so flattening pods away removes the split entirely — department
  // totals become clean sums over jobs. Pods live on in Recruiter Efficiency, where they mean something.
  // #126: seedPer = the quarters whose opening-only jobs are seeded below (undefined = just q; null = every quarter on record), so a
  // whole-period Fulfilment gets a row for a role whose only positions were opened in another quarter of the period.
  let _dtKey = null, _dt = null;
  function deptTree(q, seedPer) {
    const seeds = seedPer === undefined ? [q] : seedPer;
    const cacheKey = q + '|' + (seeds ? seeds.join(',') : '*');
    if (_dtKey === cacheKey && _dt) return _dt;
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
        const e = T[j.jid] || (T[j.jid] = { jid: j.jid, title, unknown: !known, dept, level: j.level, complexity: j.complexity, score: j.score, rawDept: j.rawDept, rawTitle: j.rawTitle, total: 0, offer: 0, hired: 0 });
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
      const bq = b.quarters || {};
      if (!(seeds || Object.keys(bq)).some(qq => bq[qq] && bq[qq].total > 0)) return;
      const raw = b.department || '';
      const dept = (raw && resolveDeptTeam(raw).dept) || 'Unknown';
      const known = !!b.title;
      const T = byDept[dept] || (byDept[dept] = {});
      T[jid] = {
        jid, dept, openingOnly: true, unknown: !known,
        title: known ? b.title : `Unknown job (${jid}) — not in Ashby's job list`,
        level: undefined, complexity: undefined,
        score: scoreForRole({ department: raw, title: b.title }, q), rawDept: raw, rawTitle: b.title,
        total: 0, offer: 0, hired: 0
      };
    });
    _dtKey = cacheKey; _dt = byDept;
    return byDept;
  }

  // Openings for a job in the selected quarter — the seat count the role score is multiplied by.
  const openBuckets = data.openingBuckets || {};
  function openingsOf(jid, q) {
    const b = openBuckets[jid]; if (!b || !b.quarters) return 0;
    const qq = b.quarters[q]; return qq ? (qq.total || 0) : 0;
  }
  // A role is "unscored" when the REAL scorer gives it 0, the same test Data Hygiene → Roles Missing Score Inputs uses.
  // 🚨 #120 (14 Sep 2026): this used to demand BOTH Level and Complexity, but SME roles score on Complexity alone and
  // Program Advisor roles by title, so SME roles showed Score 0 here while the Recruiter tab scored them.
  // Headcount counts either way.
  const isScoreable = (j) => (j.score || 0) > 0;

  // [{dept, jobs:[...]}] honouring the Department/Job multi-selects, sorted by department load.
  // withOpeningOnly adds the jobs that exist only as openings (no candidate activity in scope). Fulfilment
  // needs them to reach its true position count; every other sub-tab would just gain permanently empty rows.
  function deptJobs(q, withOpeningOnly, openedInPeriod, seedPer) {
    const dsel = selDepts(), jsel = selJobs();
    // #125 (Jerin, 15 Sep 2026): "we dont work on any job with an opening open date in the previous quarter". Momentum, Screening
    // Efficiency, Throughput and Time in Process pass openedInPeriod: only jobs with an opening OPENED in the Year/Quarter period.
    // Fulfilment, Joining Conversion and Sourcing Mix do not. Year and Quarter both on All ⇒ every job.
    const perO = openedInPeriod ? tisPeriod() : null;
    const openIds = perO ? jobsWithOpeningIn(data, qq => perO.includes(qq)) : null;
    const t = deptTree(q, seedPer);
    const out = [];
    Object.keys(t).forEach(dept => {
      if (dsel.length && !dsel.includes(dept)) return;
      const arr = Object.values(t[dept])
        .filter(j => withOpeningOnly || !j.openingOnly)
        .filter(j => matchesJobRow(jsel, data, j.jid, j.dept || j.rawDept, j.title))   // #172c
        .filter(j => !openIds || openIds.has(String(j.jid).slice(0, 8)))
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
    // #172c (25 Sep 2026): an option is either a plain string (unchanged, what every other dropdown passes)
    // or { v, t } — `v` is the VALUE kept in `selected`, `t` is what the user reads. The Job dropdowns pass a
    // JOB ID as `v`, so two jobs sharing a name stay distinct; everything else still passes strings.
    const norm = (options || []).map(o => (o && typeof o === 'object')
      ? { v: String(o.v), t: String(o.t) } : { v: String(o), t: String(o) });
    const textOf = {}; norm.forEach(o => { textOf[o.v] = o.t; });
    const labelText = () => selected.size === 0 ? `${label}: All`
      : (selected.size === 1 ? `${label}: ${textOf[[...selected][0]] || [...selected][0]}` : `${label}: ${selected.size} selected`);
    const esc = s => String(s).replace(/"/g, '&quot;');
    container.classList.add('ms');
    container.innerHTML = `<button type="button" class="ms-btn"></button><div class="ms-panel" style="display:none">`
      + (norm.length ? `<div class="ms-tools"><input type="text" class="ms-search" placeholder="Type to filter..."><button type="button" class="ms-clear">Clear</button></div>` : '')
      + `<div class="ms-list">`
      + (norm.map(o => `<label class="ms-opt"><input type="checkbox" value="${esc(o.v)}"> ${o.t}</label>`).join('') || '<span style="font-size:0.6875rem;color:var(--muted);padding:0.25rem 0.5rem">No options yet</span>')
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
        <td style="padding-left:2rem;color:var(--muted);font-style:italic">${PENDING}</td>${dashTds(metricCols)}</tr>`;
    });
    if (grandRow) html += grandRow;
    body.innerHTML = html || `<tr><td colspan="${metricCols + 1}" style="text-align:center;color:var(--muted);padding:1rem">No pods match the filter.</td></tr>`;
    wireTreePath(body, expandAll());
  }

  function renderFulfilment() {
    const per = tisPeriod();   // #126: the whole period, like the Hiring Manager tab (null = every quarter on record)
    fulfilTable(per);
    renderFulfilCharts(per);
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
  // #126: per = the period's quarters (null = every quarter on record). Joining Pending leaves out openings from before the period
  // STARTS — the Hiring Manager card's rule — and each drop keeps its quarter so its Score is priced at that quarter's points.
  function peopleMaps(per) {
    const startQ = per ? per[0] : null;
    const jp = {}, jpc = {}, drop = {};
    (data.joiningPendingCases || []).forEach(c => {
      if (c.openingQuarter && startQ && c.openingQuarter < startQ) return;
      const k = dkey(c.department) + '|' + (c.job || c.jobTitle || '');
      jp[k] = (jp[k] || 0) + 1;
      (jpc[k] || (jpc[k] = [])).push(c);   // #161: the same people, kept, so a topic row can count the ones tied to its openings
    });
    // #129: the From / To range, and whether it covers the whole period. A drop counts when the day they first reached Ref Check /
    // Documentation / Offer is inside the range, and is priced at that day's quarter (a row from before 15 Sep has no day: whole periods only).
    const rg = effRange(), whole = per ? coversQuarters(rg, per) : true, dayOK = hasDayData(data);
    dropRows(data).forEach(e => {
      if (e.day ? !inRange(e.day, rg) : (!e.quarter || (per && !per.includes(e.quarter)) || !whole)) return;
      const k = dkey(e.department) + '|' + (e.jobTitle || '');
      (drop[k] || (drop[k] = [])).push(e.day ? quarterOfDay(e.day) : e.quarter);
    });
    return { jp, jpc, drop, atQ: scoreQOf(per), memo: {}, rg, whole, dayOK };
  }
  // A role's points in one quarter. The job tree prices every role at PM.atQ; any other quarter of the period is priced here, once.
  function scoreOf(j, qq, PM) {
    if (qq === PM.atQ) return j.score || 0;
    const k = (j.jid || (j.dept + '|' + j.title)) + '|' + qq;
    if (!(k in PM.memo)) PM.memo[k] = scoreForRole({ department: j.rawDept, title: j.rawTitle, level: j.level, complexity: j.complexity }, qq);
    return PM.memo[k];
  }
  function jobSplit(j, per, dept, PM) {
    const ob = openBuckets[j.jid] || {}, bq = ob.quarters || {};
    let total = 0, joined = 0, missed = 0, tS = 0, jS = 0, mS = 0;
    const add = (b, qq) => {
      const s = scoreOf(j, qq, PM);
      total += b.total || 0; joined += b.joined || 0; missed += b.missed || 0;
      tS += (b.total || 0) * s; jS += (b.joined || 0) * s; mS += (b.missed || 0) * s;
    };
    // #129: a range covering the whole period adds its quarters, as before; a narrower one adds the positions opened on its days
    // (openingBuckets .days, India time), each priced at its own quarter's points. A data file from before 15 Sep has no days.
    if (PM.whole) (per || Object.keys(bq)).forEach(qq => { if (bq[qq]) add(bq[qq], qq); });
    else if (PM.dayOK) Object.entries(ob.days || {}).forEach(([d, b]) => { if (inRange(d, PM.rg)) add(b, quarterOfDay(d)); });
    const key = dept + '|' + (j.title || '');
    const pending = (PM.jp[key] || 0);
    const dropQs = PM.drop[key] || [];
    const drop = dropQs.length;
    // SIGNED on purpose — the clamp is gone here for the same reason it is gone from HM Delta: more people
    // can be in closing than there are positions when an offer carries no opening link. Hiding that behind a
    // zero makes the row's arithmetic impossible to check by eye.
    const gap = total - joined - pending;
    let pS = pending * scoreOf(j, PM.atQ, PM);
    let dS = dropQs.reduce((s, qq) => s + scoreOf(j, qq, PM), 0);
    // ===== #165 (Jerin, 24 Sep 2026: "Yes, total the score from openings.") =====
    // 🔑 COUNTS ARE UNTOUCHED. Only the Score half of each pair is recomputed, by SUMMING the openings behind it
    //    rather than multiplying a count by one rate — which is what two openings of different complexity makes
    //    meaningless. Heads never move (Rule 1), so the columns still add up the way anyone reading them expects.
    // ⚠ The first attempt did this by changing what j.score MEANS and left the multipliers alone, so a job's total
    //    got multiplied by its own opening count again (780 ➔ 40,560). Reverted. The multiplication has to GO, and
    //    that is why this sums row by row.
    // 🚦 GATE: until the pipeline carries each opening's complexity, everything above stands.
    const oIdx = openingScores(data);
    if (oIdx.ready) {
      const oMeta = { department: j.rawDept, title: j.rawTitle, level: j.level };
      const inScope = (r) => PM.whole ? (!per || per.includes(r.quarter))
                                      : (PM.dayOK && r.day && inRange(r.day, PM.rg));
      let t2 = 0, j2 = 0, m2 = 0;
      ((data.openingRows) || []).forEach(r => {
        if (r.jobId8 !== j.jid || !inScope(r)) return;
        const s = scoreOfOpening(r.openingId, oMeta, r.quarter, oIdx);
        t2 += s;
        if (r.state === 'joined') j2 += s; else if (r.state === 'missed') m2 += s;
      });
      tS = t2; jS = j2; mS = m2;
      // A person in closing scores from THEIR OWN opening; one whose offer names no opening scores nothing.
      pS = (PM.jpc[key] || []).reduce((sum, c) => sum + scoreOfOpening(c.openingId, oMeta, PM.atQ, oIdx), 0);
      // A drop can NEVER be tied to an opening, so it scores nothing - heads only. Jerin, 24 Sep:
      // "Drop can be based on heads, not score - that works!" This is the rule, not a gap.
      dS = 0;
    }
    return { total, joined, pending, drop, missed, gap, sc: j.score || 0, scoreable: j.scoreable,
      tS, jS, pS, dS, mS, gS: tS - jS - pS };
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
  function fulfilRows(per) {
    const PM = peopleMaps(per);
    const q = PM.atQ;   // #126: the quarter the job rows are scored at; the figures add up every quarter in `per`
    const dsel = selDepts(), jsel = selJobs();
    const seen = {};
    const out = deptJobs(q, true, false, per)
      .map(({ dept, jobs }) => {
        // A role belongs on this table if it had positions in the quarter OR has people against it — the
        // same rule the Hiring Manager tab uses. Restricting to roles with openings hid most of the people
        // in closing there (45 of SME - India's 46), and would hide them here too.
        const js = jobs.map(j => { seen[dept + '|' + (j.title || '')] = 1; return { j, sp: jobSplit(j, per, dept, PM) }; })
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
    // #172: same defect as the Recruiter tab's jpMaps, and the MIRROR-TAB check is what found it here —
    // a title map takes the FIRST job of that name, and two can share one ("Manager, CRM" = L3 Marketing /
    // L4 Business - India, either side of the grid's L1-L3 | L4-L6 boundary). `metaById` is exact.
    // ⚠ The leftover rows themselves stay keyed `dept|title` on purpose — that is what stops a person whose
    // role has no job-tree row vanishing (it once read 165 against the HM tab's 167). Only the LEVEL and
    // COMPLEXITY lookup moves to the id, resolved from the cases that row is built from.
    const metaByTitle = {}, metaById = {};
    (data.jobs || []).forEach(j => {
      if (j.title && !metaByTitle[j.title]) metaByTitle[j.title] = j;
      const id8 = String(j.id || '').slice(0, 8);
      if (id8 && !metaById[id8]) metaById[id8] = j;
    });
    const extra = {};
    const addLeftover = (key) => {
      if (seen[key]) return;
      const i = key.indexOf('|'); const dept = key.slice(0, i), title = key.slice(i + 1);
      if (dsel.length && !dsel.includes(dept)) return;
      // #172c: a leftover row has no job id — match the selection on department + title, which IS its identity.
      if (!matchesJobRow(jsel, data, null, dept, title)) return;
      (extra[dept] || (extra[dept] = {}))[title] = 1;
    };
    Object.keys(PM.jp).forEach(addLeftover);
    Object.keys(PM.drop).forEach(addLeftover);
    Object.entries(extra).forEach(([dept, titles]) => {
      let grp = out.find(g => g.dept === dept);
      if (!grp) { grp = { dept, jobs: [], sum: null }; out.push(grp); }
      Object.keys(titles).forEach(title => {
        // #172: prefer the job the CASES on this row actually point at; fall back to the title map.
        const jpCases = (PM.jpc && PM.jpc[dept + '|' + title]) || [];
        let m = null;
        for (let i = 0; i < jpCases.length && !m; i++) {
          const id8 = jpCases[i] && jpCases[i].jobId8;
          if (id8 && metaById[id8]) m = metaById[id8];
        }
        m = m || metaByTitle[title] || {};
        const j = { jid: null, title, dept, level: m.level, complexity: m.complexity,
                    score: scoreForRole({ department: dept, title, level: m.level, complexity: m.complexity }, q),
                    rawDept: dept, rawTitle: title, scoreable: false };
        j.scoreable = isScoreable(j);
        grp.jobs.push({ j, sp: jobSplit(j, per, dept, PM) });
      });
      grp.jobs.sort((a, b) => (b.sp.total - a.sp.total) || (b.sp.pending - a.sp.pending));
      grp.sum = sumSplits(grp.jobs.map(x => x.sp));
    });
    return out.filter(d => d.jobs.length).sort((a, b) => b.sum.total - a.sum.total);
  }

  function fulfilTable(per) {
    const body = document.getElementById('effFulfilBody'); if (!body) return;
    const z = (n) => n > 0 ? n : '<span class="zero">0</span>';
    // Gap cell borrowed wholesale from Recruiter → Fulfilment: a slim track that fills with the SHORTFALL,
    // the number beside it, so the bar and the number can never point in opposite directions.
    // A NEGATIVE gap draws an empty track and says why in words — more people are in closing than there are
    // positions, which is real and shrinks as offers get linked to openings.
    // #153 (Jerin, 19 Sep 2026): the caption under this number is GONE — it read "56 of 58 · 97%", "covered",
    // or "1 more in closing than opened" when Delta went negative. 🚨 A NEGATIVE Delta is still real and still
    // allowed (Rule 1) — it now says so through the rose number alone, and the definitions block under the
    // panel explains it in words.
    const gapCell = (x) => {
      const pct = x.total > 0 ? Math.max(0, Math.min(100, Math.round((x.gap / x.total) * 100))) : 0;
      return `<td class="gapcell"><span class="deltacell"><span class="track"><i style="width:${pct}%"></i></span>`
        + `<span class="dnum ${x.gap === 0 ? 'none' : (pct >= 50 ? 'high' : '')}">${x.gap}</span></span></td>`;
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
        + `${x.drop > 0 && dropPct != null ? `<span class="sublab">${dropPct}%</span>` : ''}</td><td class="score">${z(x.dS)}</td>`
        + gapCell(x) + `<td class="score">${x.gS}</td>`
        + `<td style="color:var(--red)">${z(x.missed)}</td><td class="score">${z(x.mS)}</td>`;
    };
    const rows = fulfilRows(per);
    // #157: same window as the job rows above - whole quarters when the range covers them, India-time days
    // otherwise - so the topic rows close the job row instead of being a second, drifting calculation.
    const PM = peopleMaps(per);
    const tIdx = topicIndex(data, { wholeWin: PM.whole, winQs: per, dayOK: PM.dayOK, inDay: (d) => inRange(d, PM.rg) });
    let html = '';
    rows.forEach(({ dept, jobs, sum }, di) => {
      const flag = sum.unscored ? `<span style="color:var(--orange);font-weight:400;font-size:0.6875rem;margin-left:0.375rem">${sum.unscored} unscored</span>` : '';
      html += `<tr data-path="${di}" data-haschild data-exp="0" style="cursor:pointer;background:var(--border-light)">
        <td style="font-weight:600">${CARET}${dept}<span style="color:var(--muted);font-weight:400;font-size:0.6875rem;margin-left:0.375rem">${jobs.length}</span>${flag}</td>${cells(sum, true)}</tr>`;
      jobs.forEach(({ j, sp }, ji) => {
        const meta = sp.scoreable
          // #176a: the caption reads the OPENINGS, and shows a RANGE when they differ. Same helper as the
          // Recruiter tab so the two tabs cannot word it differently (Rule 3).
          ? `<span style="font-size:0.625rem;margin-left:0.375rem;color:var(--muted)">${jobScoreCaption(jobScoreSpread((j.jid || '').slice(0, 8), { department: j.rawDept || j.dept, title: j.rawTitle || j.title, level: j.level }, scoreQOf(per), openingScores(data)), j.level, `${j.level || ''}${j.complexity ? ' · ' + j.complexity : ''} · ${j.score}pt`)}</span>`
          : `<span style="font-size:0.625rem;margin-left:0.375rem;color:var(--orange)">unscored</span>`;
        // #157: only the two SME departments open past the job. A job with no topics stays a plain row with
        // no caret - it must not look clickable when there is nothing under it.
        const tops = hasTopicLevel(tIdx, dept, (j.jid || '').slice(0, 8)) ? tIdx[(j.jid || '').slice(0, 8)] : null;
        html += `<tr data-path="${di}-${ji}"${tops ? ' data-haschild data-exp="0" style="display:none;cursor:pointer"' : ' style="display:none"'}>`
          + `<td style="padding-left:1.875rem;color:var(--muted)">${tops ? CARET : ''}${j.title}${meta}`
          + `${tops && tops.length > 1 ? `<span style="color:var(--muted);font-weight:400;font-size:0.6875rem;margin-left:0.375rem">${tops.length} topics</span>` : ''}</td>${cells(sp, false)}</tr>`;
        if (!tops) return;
        // Each opening is priced at the points of ITS OWN quarter, exactly as jobSplit() prices the buckets -
        // so the topic rows close the job row in BOTH halves, heads and score (Rule 3).
        // #161: the job's people in closing, by the opening they are tied to - priced at the job's points, exactly as
        // jobSplit() prices the job's own Joining pending, so a topic's pS is a share of the job's pS.
        const ids8 = (t) => new Set(t.openings.map(o => String(o.id).slice(0, 8)));
        const jobPeople = PM.jpc[dept + '|' + (j.title || '')] || [];
        tops.forEach((t, ti) => {
          const pt = (qq) => scoreOf(j, qq, PM);
          let tS = 0, jS = 0, mS = 0;
          t.openings.forEach(o => { const s1 = pt(o.quarter || PM.atQ);
            tS += s1; if (o.state === 'joined') jS += s1; if (o.state === 'missed') mS += s1; });
          const mine = ids8(t), pending = jobPeople.filter(c => c.openingId && mine.has(String(c.openingId).slice(0, 8))).length;
          const pS = pending * pt(PM.atQ);
          // #157c (Jerin, 21 Sep): the topic is the bottom of the tree - no caret, no opening rows under it.
          html += `<tr data-path="${di}-${ji}-${ti}" style="display:none">`
            + `<td style="padding-left:3.25rem"><span class="${t.topic === '(topic not set)' ? 'topic-unset' : 'topic-name'}">${t.topic}</span>`
            + `<span style="color:var(--muted);font-weight:400;font-size:0.6875rem;margin-left:0.375rem">${t.total} opening${t.total === 1 ? '' : 's'}</span></td>`
            + topicCells({ total: t.total, joined: t.joined, missed: t.missed, tS, jS, mS, pending, pS }) + `</tr>`;
        });
      });
    });
    const g = sumSplits(rows.flatMap(r => r.jobs.map(x => x.sp)));
    html += `<tr style="background:var(--accent-light);font-weight:700"><td>All departments</td>${cells(g, true)}</tr>`;
    body.innerHTML = html || `<tr><td colspan="13" style="text-align:center;color:var(--muted);padding:1rem">No openings in this period.</td></tr>`;
    wireTreePath(body, expandAll());
  }

  // Candidate-level joining-pending list, same source as the Hiring Manager tab (joiningPendingCases),
  // scoped to the Department/Job filters. Unlinked rows carry no opening, so they are invisible to the
  // position counts above — surfaced here rather than silently missing.
  function renderFulfilJP() {
    const body = document.getElementById('effFulfilJPBody'); if (!body) return;
    const dsel = selDepts(), jsel = selJobs(), dojF = dojFilterOf('eff');   // #133: the DOJ boxes replace the period on this sub-tab
    const rows = (data.joiningPendingCases || [])
      .filter(c => !dsel.length || dsel.includes(resolveDeptTeam(c.department || '').dept || c.department))
      .filter(c => matchesJob(jsel, c.jobId8))   // #172c
      .filter(c => inDojFilter(c.doj, dojF));
    // #149 option A: month ➡ date ➡ people, soonest first — the twin of Hiring Manager's list, and Rule 3
    // says the two move together.
    body.innerHTML = rows.length ? monthTreeRows(rows, {
      dayOf: c => c.doj,
      nameOf: c => c.candidate,
      cells: c => `${tdStage(c.subStage)}${tdRecruiter(c.recruiter)}${tdDept(c.department)}${tdJob(c.job)}${tdOpening(c.openingId, topicLookup(data))}${tdTopic(c.openingId, c.jobId8, topicLookup(data))}${tdLinked(c.linked)}`,
      cols: 8, order: 'soonest', live: true,   // #168/#169: Opening + Topic
      split: items => stageSplit(items, c => c.subStage),
    }) : `<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:1rem">No offers in play under these filters.</td></tr>`;
    pinMonthHeadings(body);
    // #130b: on its own sub-tab now, so it says it is live — the dates above it do not apply.
    const cap = document.getElementById('effJPCaption');
    if (cap) {
      const unlinked = rows.filter(c => !c.linked).length;
      cap.innerHTML = rows.length
        ? `<strong>${rows.length}</strong> in closing${dojFilterText(dojF) ? ' ' + dojFilterText(dojF) : ''}, <strong>live</strong>.` + (unlinked ? ` <strong>${unlinked}</strong> have no opening attached.` : '')
        : '';
    }
  }

  // #130c (Jerin, 15 Sep 2026): Joiners — one row per PERSON moved to Hired (an accepted offer alone does not count), dated by START date
  // inside From / To. No earlier-quarter subtraction, so it matches Sourcing Mix's joiner count; the Opening column shows who is unlinked.
  // 🚨 People, not positions: it will not equal Joined on Position Fulfilment, which counts positions filled (Rule 1).
  function renderJoiners() {
    const body = document.getElementById('effJoinersBody'); if (!body) return;   // ⚠ not effJoinBody — Joining Conversion owns that id
    const dsel = selDepts(), jsel = selJobs(), rg = effRange();
    const rows = (data.offerEvents || [])
      .filter(e => e.accepted && e.appStatus === 'Hired' && inRange(e.startDate, rg))
      .filter(e => !dsel.length || dsel.includes(resolveDeptTeam(e.department || '').dept || e.department))
      .filter(e => matchesJob(jsel, e.jobId8))   // #172c
      .sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)) || String(a.candidate || '').localeCompare(String(b.candidate || '')));
    // #149 option A: newest month first here — this list looks back. No sub-stage: everyone is Hired.
    body.innerHTML = rows.length ? monthTreeRows(rows, {
      dayOf: e => e.startDate,
      nameOf: e => e.candidate,
      cells: e => `${tdRecruiter(e.recruiter, e.startDate)}${tdDept(e.department)}${tdJob(e.jobTitle)}${tdOpening(e.openingId, topicLookup(data))}${tdTopic(e.openingId, e.jobId8, topicLookup(data))}${tdLinked(!!e.openingId)}`,
      cols: 7, order: 'newest',   // #168/#169: Opening + Topic
    }) : `<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:1rem">Nobody joined between these dates under these filters.</td></tr>`;
    pinMonthHeadings(body);
    const cap = document.getElementById('effJoinersCaption');
    if (cap) {
      const unlinked = rows.filter(e => !e.openingId).length;
      cap.innerHTML = rows.length
        ? `<strong>${rows.length}</strong> joined, ${rangeText(rg, tisPeriod())}.` + (unlinked ? ` <strong>${unlinked}</strong> have no opening attached.` : '')
        : '';
    }
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
    const sumFor = r1For;   // #129: the same helper the chart reads
    const pcv = (n, d) => d ? Math.round((n / d) * 100) : 0;
    const cls = (v) => v >= 50 ? 'good' : v >= 20 ? 'pct' : v > 0 ? 'warn' : 'zero';
    const cells = (v, bold) => {
      const w = bold ? ' style="font-weight:600"' : '';
      return `<td${w}>${v.added > 0 ? v.added : '<span class="zero">0</span>'}</td>`
        + `<td${w}>${v.cleared > 0 ? v.cleared : '<span class="zero">0</span>'}</td>`
        + `<td class="${v.added ? cls(pcv(v.cleared, v.added)) : 'zero'}">${v.added ? pcv(v.cleared, v.added) + '%' : DASH}</td>`;
    };
    if (!store) {
      body.innerHTML = `<tr><td colspan="4" style="color:var(--muted);font-style:italic;padding:1rem">R1 screening figures appear after the next stage-history refresh.</td></tr>`;
      buildScreenChartEff();
      return;
    }
    let html = '';
    deptJobs(selQuarter(), false, true).forEach(({ dept, jobs }, di) => {   // #125
      const js = jobs.map(j => ({ j, v: sumFor(j.jid) })).filter(x => x.v.added > 0 || x.v.cleared > 0)
        .sort((a, b) => b.v.added - a.v.added);
      if (!js.length) return;
      const agg = js.reduce((a, x) => ({ added: a.added + x.v.added, cleared: a.cleared + x.v.cleared }), { added: 0, cleared: 0 });
      html += `<tr data-path="${di}" data-haschild data-exp="0" style="cursor:pointer;background:var(--border-light)"><td style="font-weight:600">${CARET}${dept}<span style="color:var(--muted);font-weight:400;font-size:0.6875rem;margin-left:0.375rem">${js.length}</span></td>${cells(agg, true)}</tr>`;
      js.forEach(({ j, v }, ji) => {
        html += `<tr data-path="${di}-${ji}" style="display:none"><td style="padding-left:1.875rem;color:var(--muted)">${j.title}</td>${cells(v, false)}</tr>`;
      });
    });
    body.innerHTML = html || `<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:1rem">No R1 activity under these filters.</td></tr>`;
    wireTreePath(body, expandAll());
    buildScreenChartEff();
  }

  // One bar per DEPARTMENT: solid progressed past R1, pale still at R1, together the number added.
  // Same store as the table.
  // ===== ONE chart, both dimensions (Jerin, 2026-08-30) — the mirror of the Hiring Manager tab =====
  // The 13 per-department small multiples are gone. Department down the side, stage across the top, the
  // throughput percentage in every cell, and the R1 -> Documentation span as the final column.
  // 🚨 The stage cells must NEVER be added up: one person passing R1, R2 and R3 sits in all three. Each cell
  // is comparable only to its own In, which is what the Overall column is for.
  function buildTpChartEff(q, vis) {
    const host = document.getElementById('effTpHeat'); if (!host) return;
    const hint = document.getElementById('effTpHint');
    // #129: this used to demand the all-time throughputByJob just to draw, although the squares read assessedByJobQ. Only a file with
    // neither is empty now.
    if (!tpByJob && !(rollups && rollups.assessedByJobQ)) { host.innerHTML = '<p class="sheat-empty">Stage history is not in this data file yet.</p>'; if (hint) hint.textContent = ''; return; }
    // App Review is kept — see the note on the same line in hm-report.js. It was excluded while throughput
    // meant reached/cleared, which made the stage read 100% and worthless; it is a real figure now.
    const stageCols = vis.slice();
    const per = tisPeriod();   // #120: the squares follow the whole period, like Screening and Time in Process
    const asJ2 = (rollups && rollups.assessedByJobQ) || null;
    const spanQ = (rollups && rollups.assessedSpanByJobQ) || null;
    // #129: inside a narrower From / To range the squares add up the day twins (assessedByJobD / assessedSpanByJobD) instead. A rollups
    // file from before 15 Sep has none, so a narrow range then reads empty rather than the quarter.
    const rg = effRange(), dayTp = !coversQuarters(rg, per);
    const asD2 = (rollups && rollups.assessedByJobD) || {}, spanD = (rollups && rollups.assessedSpanByJobD) || {};
    const abOf = (byQ, byD) => { if (!dayTp) return sumInPeriod(byQ, per); const s = sumDayFields(byD, rg); return { a: s.a || 0, b: s.b || 0 }; };
    const cellOf = (jids, k) => jids.reduce((a, jid) => {
      if (asJ2) {
        const c = abOf((asJ2[jid] || {})[TP_TO_SK[k]], (asD2[jid] || {})[TP_TO_SK[k]]);
        return { inN: a.inN + c.a, outN: a.outN + c.b };
      }
      const c = (tpByJob[jid] || {})[TP_TO_SK[k]] || { reached: 0, cleared: 0 };
      return { inN: a.inN + c.reached, outN: a.outN + c.cleared };
    }, { inN: 0, outN: 0 });
    // 🚨 The overall column is its OWN per-candidate span from the pipeline — assessed at R1 or OA
    // (whichever first) through to Ref Check / Documentation / Offer (whichever first). Never one stage
    // column divided by another: a person sits in several stages, so that double-counts and can exceed 100%.
    const spanOf = (jids) => jids.reduce((acc, jid) => {
      if (!spanQ) return acc;
      const v = abOf(spanQ[jid], spanD[jid]);   // #129
      return { a: acc.a + v.a, b: acc.b + v.b };
    }, { a: 0, b: 0 });
    // #122 (Jerin, 15 Sep 2026 — option C1): each department row carries its JOB rows, drawn in their own colour (apricot since #136), and the
    // Department / Job table that repeated these figures underneath is gone. Hide zero-pipeline drops jobs and
    // departments with no movement in the period (the squares always dropped empty departments).
    const hideEmpty = !!document.getElementById('effTpHideEmpty')?.checked;
    const toRow = (label, jids) => {
      const r1 = cellOf(jids, 'r1'), ds = cellOf(jids, 'ds');
      const sp = spanQ ? spanOf(jids) : null;
      return {
        label,
        // Offer is the last stage — its "progressed" is being hired (hiredCol below).
        cells: stageCols.map(k => { const c = cellOf(jids, k); return c.inN > 0 ? c : null; }),
        overall: sp ? (sp.a > 0 ? Math.round((sp.b / sp.a) * 100) : null)
          : (r1.inN > 0 ? Math.round((ds.inN / r1.inN) * 100) : null),
        ovIn: sp && sp.a > 0 ? sp.a : null,
        ovOut: sp && sp.a > 0 ? sp.b : null,
        _vol: r1.inN
      };
    };
    const moved = (r) => r.cells.some(Boolean);
    const rows = deptJobs(q, false, true).map(({ dept, jobs: js }) => {   // #125
      const jids = js.map(j => j.jid);
      return Object.assign(toRow(dept, jids), {
        _jids: jids,
        children: js.map(j => toRow(j.title, [j.jid])).filter(r => !hideEmpty || moved(r))
      });
    }).filter(r => !hideEmpty || moved(r)).sort((a, b) => b._vol - a._vol);
    const allJids = [];
    rows.forEach(r => allJids.push(...r._jids));
    if (hint) hint.textContent = rows.length === 1
      ? `${rows[0].label} · ${rows[0].children.length} ${rows[0].children.length === 1 ? 'job' : 'jobs'}`
      : (rows.length ? 'Click a department to open its jobs' : '');
    const addedCols = new Set();
    stageCols.forEach((k, i) => { if (TP_ADDED[k]) addedCols.add(i); });
    const hiredCol = stageCols.indexOf('offer');
    buildStageHeat(host, document.getElementById('effTpHeatTip'), rows,
      stageCols.map(k => TP_LABELS[k]), {
        addedCols, hiredCol,
        total: toRow('Total', allJids),
        expandAll: expandAll(),
        overallLabel: spanQ ? 'R1/OA \u2192 late' : 'R1 \u2192 Doc',
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
    const sumFor = r1For;   // #129: the same helper as the table
    const rows = deptJobs(selQuarter(), false, true).map(({ dept, jobs }) => {   // #125
      const per = jobs.map(j => ({ title: j.title, v: sumFor(j.jid) })).filter(x => x.v.added > 0);
      const agg = per.reduce((a, x) => ({ added: a.added + x.v.added, cleared: a.cleared + x.v.cleared }), { added: 0, cleared: 0 });
      return { dept, ...agg, per };
    }).filter(r => r.added > 0).sort((a, b) => b.added - a.added);
    if (!rows.length) { if (wrap) wrap.style.height = '7.5rem'; return; }
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
    })), { xTitle: 'Candidates added at R1', colHeader: '% progressed',
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
  // #126 (Jerin, 15 Sep 2026): `period` is the whole Year/Quarter period, as on Fulfilment (null = every quarter on record). Joined and
  // Dropped count every quarter inside it; an "earlier quarter's opening" is one raised before the period STARTS.
  let _jcKey = null, _jc = null;
  function joinMapsEff(period) {
    const rg = effRange();   // #129: Joined and Dropped follow From / To, so the cache is keyed by the range as well as the period
    const cacheKey = (period ? period.join(',') : '*') + '|' + rg.from + '|' + rg.to;
    if (_jcKey === cacheKey && _jc) return _jc;
    const qOf = (ds) => (ds && ds.length >= 7) ? `${ds.slice(0, 4)}-Q${Math.floor((+ds.slice(5, 7) - 1) / 3) + 1}` : null;
    const startQ = period ? period[0] : null;
    const inPeriod = (qq) => !!qq && (!period || period.includes(qq));
    const earlier = (oq) => !!(oq && startQ && oq < startQ);
    const byKey = {};
    const bump = (key, field) => { const a = byKey[key] || (byKey[key] = { o: 0, j: 0, p: 0, dr: 0 }); a[field] += 1; };
    (data.offerEvents || []).forEach(e => {
      if (!e.accepted || e.appStatus !== 'Hired' || !inPeriod(qOf(e.startDate)) || !inRange(e.startDate, rg)) return; // Joined = moved to Hired, not just an accepted offer · #129: inside From / To
      if (earlier(e.openingQuarter)) return;
      bump(dkey(e.department) + '|' + (e.jobTitle || ''), 'j');
    });
    (data.joiningPendingCases || []).forEach(c => {
      if (earlier(c.openingQuarter)) return;
      bump(dkey(c.department) + '|' + (c.job || c.jobTitle || ''), 'p');
    });
    dropRows(data).forEach(e => {
      if (!dropIn(e, rg, period)) return;   // #129: by the day they first reached Ref Check / Documentation / Offer
      bump(dkey(e.department) + '|' + (e.jobTitle || ''), 'dr');
    });
    Object.values(byKey).forEach(a => { a.o = a.j + a.p + a.dr; });
    _jcKey = cacheKey; _jc = byKey;
    return byKey;
  }
  const ZJC = { o: 0, j: 0, p: 0, dr: 0 };
  const jcOf = (period, dept, title) => joinMapsEff(period)[dept + '|' + (title || '')] || ZJC;

  // ONE list for the table AND the chart (Rule 3: the table computes, the chart reads).
  // 🚨 #120 (14 Sep 2026): both used to walk only the job tree, so people whose role has no row there (no job title, or
  // a role Ashby's job list never returned) were dropped: Joining Pending read 42 here against 44 on Fulfilment, which
  // already adds those rows. Same leftover rule as fulfilRows.
  function joinRows(period) {
    const dsel = selDepts(), jsel = selJobs();
    const seen = {};
    const out = deptJobs(scoreQOf(period)).map(({ dept, jobs }) => ({ dept, per: jobs
      .map(j => { seen[dept + '|' + (j.title || '')] = 1; return { title: j.title, c: jcOf(period, dept, j.title) }; })
      .filter(x => x.c.o > 0) }));
    Object.entries(joinMapsEff(period)).forEach(([key, c]) => {
      if (seen[key] || !(c.o > 0)) return;
      const i = key.indexOf('|'), dept = key.slice(0, i), title = key.slice(i + 1);
      if (dsel.length && !dsel.includes(dept)) return;
      if (!matchesJobRow(jsel, data, null, dept, title)) return;   // #172c
      let g = out.find(x => x.dept === dept);
      if (!g) { g = { dept, per: [] }; out.push(g); }
      g.per.push({ title: title || '(no job recorded)', c });
    });
    return out.map(({ dept, per }) => {
      per.sort((a, b) => b.c.o - a.c.o);
      const agg = per.reduce((a, x) => ({ o: a.o + x.c.o, j: a.j + x.c.j, p: a.p + x.c.p, dr: a.dr + x.c.dr }), { o: 0, j: 0, p: 0, dr: 0 });
      return { dept, ...agg, per };
    }).filter(r => r.o > 0);
  }

  function renderJoining() {
    const period = tisPeriod();   // #126: the whole period, like Fulfilment
    const body = document.getElementById('effJoinBody'); if (!body) return;
    const convCell = (v) => {
      if (!v.o) return `<td class="gapcell"><span class="zero">—</span></td>`;
      const p = Math.round(((v.j + v.p) / v.o) * 100);
      const band = p >= 50 ? '' : (p >= 20 ? ' mid' : ' low');
      return `<td class="gapcell"><span class="deltacell"><span class="track"><i class="conv${band}" style="width:${p}%"></i></span>`
        + `<span class="dnum">${p}%</span></span></td>`;   // #153: the "N of N" caption is gone — Offered, Joined and Joining pending are columns on this same row
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
    joinRows(period).forEach(({ dept, per: js, ...agg }, di) => {
      html += `<tr data-path="${di}" data-haschild data-exp="0" style="cursor:pointer;background:var(--border-light)">
        <td style="font-weight:600">${CARET}${dept}<span style="color:var(--muted);font-weight:400;font-size:0.6875rem;margin-left:0.375rem">${js.length}</span></td>${cells(agg, true)}</tr>`;
      js.forEach(({ title, c }, ji) => {
        html += `<tr data-path="${di}-${ji}" style="display:none">
          <td style="padding-left:1.875rem;color:var(--muted)">${title}</td>${cells(c, false)}</tr>`;
      });
    });
    body.innerHTML = html || `<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:1rem">Nobody reached an offer under these filters.</td></tr>`;
    wireTreePath(body, expandAll());
    buildJoinChartEff();
  }

  // One bar per DEPARTMENT — the department-centric mirror of the Recruiter tab's bar per recruiter.
  // Joined / Joining Pending / Dropped stacked, with Offered and the Joining Conversion printed at the end,
  // read off the same joinMapsEff the table uses.
  function buildJoinChartEff() {
    const ctx = document.getElementById('effJoinChart'); if (!ctx) return;
    if (effJoinChart) { effJoinChart.destroy(); effJoinChart = null; }
    const rows = joinRows(tisPeriod()).sort((a, b) => b.o - a.o);   // the table's own rows (#120)
    const wrap = document.getElementById('effJoinChartWrap');
    if (!rows.length) { if (wrap) wrap.style.height = '7.5rem'; return; }
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
        c.font = `${uiPx(10)}px -apple-system, BlinkMacSystemFont, sans-serif`; c.textBaseline = 'middle';
        // Offered at the end of the bar; the Joining Conversion is its own labelled column at the right
        // edge (Jerin, 2026-08-29) — same treatment as the Recruiter Efficiency version, same helper.
        const last = chart.getDatasetMeta(chart.data.datasets.length - 1);
        last.data.forEach((bar, i) => {
          c.textAlign = 'left'; c.fillStyle = '#334155';
          c.fillText(String(offered[i]), bar.x + uiPx(6), bar.y);
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

  // Administrative stages: candidates ADDED, not assessed (Jerin, 2026-08-31).
  const TP_ADDED = { rc: 1, ds: 1, offer: 1 };   // keyed like TP_KEYS — as refCheck/docSub they never matched, so the Ref Check and Doc Sub hovers said "assessed" (fixed in #122, 15 Sep 2026)

  function renderThroughput() {
    // #122 (15 Sep 2026): a Stages dropdown (nothing picked = every stage) replaced the row of stage tick-boxes, and the
    // Department / Job table under the squares is gone — the squares open into jobs themselves (buildTpChartEff).
    const stSel = msEffTpStage ? msEffTpStage.getSelected() : [];
    const vis = TP_KEYS.filter(k => !stSel.length || stSel.includes(TP_LABELS[k]));
    buildTpChartEff(selQuarter(), vis);
  }

  // ===== Pipeline — the live snapshot (#145a, Jerin 19 Sep 2026) =====
  // The same table the Hiring Manager tab shows, on this tab's Department / Job filters. The COUNTS are where
  // candidates stand today and no period narrows them (which is why From / To hide on this sub-tab, Rule 13);
  // Year and Quarter decide which ROLES are listed — only those with an opening opened in the period (#125).
  function renderPipeline() {
    const head = document.getElementById('effPipeHead'), body = document.getElementById('effPipeBody');
    if (!head || !body) return;
    const stPick = msEffPipeStage ? msEffPipeStage.getSelected() : [];
    const visStages = PIPE_KEYS.filter(k => !stPick.length || stPick.includes(PIPE_LABELS[k]));
    const dsel = msDept ? msDept.getSelected() : [], jsel = msJob ? msJob.getSelected() : [];
    const hideEmpty = !!document.getElementById('effPipeHideEmpty')?.checked;
    const per = tisPeriod();
    const openIds = per ? jobsWithOpeningIn(data, qq => per.includes(qq)) : null;   // #125
    const deptOfJob = (j) => resolveDeptTeam(j.department).dept || j.department || 'Unknown';

    head.innerHTML = '<tr><th style="min-width:17.5rem">Department / Job</th><th class="c-num">Total</th>'
      + visStages.map(s => `<th class="c-num">${PIPE_LABELS[s]}</th>`).join('') + '</tr>';

    const groups = {};
    (data.jobs || []).forEach(j => {
      if (!j.pipeline) return;
      const dept = deptOfJob(j);
      if (dsel.length && !dsel.includes(dept)) return;
      if (!matchesJobRow(jsel, data, j.jid, j.dept || j.rawDept, j.title)) return;   // #172c
      if (openIds && !openIds.has(String(j.id || '').slice(0, 8))) return;
      if (hideEmpty && !visStages.some(k => (j.pipeline[k] || 0) > 0)) return;
      const G = groups[dept] || (groups[dept] = { total: 0, stages: {}, jobs: [] });
      G.total += (j.total || 0);
      visStages.forEach(k => { G.stages[k] = (G.stages[k] || 0) + (j.pipeline[k] || 0); });
      G.jobs.push(j);
    });

    // Hired stays green and Offer blue, exactly as on the Hiring Manager tab.
    const cells = (total, stages) => `<td style="font-weight:600">${total}</td>` + visStages.map(k => {
      const v = stages[k] || 0;
      if (k === 'hired' && v > 0) return `<td class="good">${v}</td>`;
      if (k === 'offer' && v > 0) return `<td style="color:var(--blue);font-weight:600">${v}</td>`;
      return `<td${v === 0 ? ' class="zero"' : ''}>${v}</td>`;
    }).join('');

    const totalsAll = {}; visStages.forEach(k => { totalsAll[k] = 0; });
    let grand = 0, html = '';
    Object.keys(groups).sort((a, b) => a.localeCompare(b)).forEach((dept, di) => {
      const G = groups[dept];
      grand += G.total; visStages.forEach(k => { totalsAll[k] += (G.stages[k] || 0); });
      G.jobs.sort((a, b) => (b.total || 0) - (a.total || 0) || String(a.title || '').localeCompare(String(b.title || '')));
      html += `<tr data-path="${di}" data-haschild data-exp="0" style="cursor:pointer;background:var(--border-light)">
        <td style="font-weight:600">${CARET}${dept}<span style="color:var(--muted);font-weight:400;font-size:0.6875rem;margin-left:0.375rem">${G.jobs.length}</span></td>${cells(G.total, G.stages)}</tr>`;
      G.jobs.forEach((j, ji) => {
        html += `<tr data-path="${di}-${ji}" style="display:none"><td style="padding-left:1.875rem;color:var(--muted)">${j.title}</td>${cells(j.total, j.pipeline)}</tr>`;
      });
    });
    body.innerHTML = html
      ? html + `<tr class="totals-row"><td>Total</td>${cells(grand, totalsAll)}</tr>`
      : `<tr><td colspan="${visStages.length + 2}" style="text-align:center;color:var(--muted);padding:1rem">No roles match the filter.</td></tr>`;
    wireTreePath(body, expandAll());
    shadePipeline(body);   // #137c
  }

  // Quarter keys the Year/Quarter selector covers; null = all-time. Separate from selQuarter(), which
  // always resolves to ONE quarter for pod grouping and capacity even when the selector reads "All".
  // Adds up {quarter: {a, b}} over a period (an array of quarter keys; null = every quarter present).
  function sumInPeriod(byQ, per) {
    const src = byQ || {};
    return (per || Object.keys(src)).reduce((acc, qq) => { const v = src[qq]; return v ? { a: acc.a + (v.a || 0), b: acc.b + (v.b || 0) } : acc; }, { a: 0, b: 0 });
  }
  function tisPeriod() {
    return periodQuarters(document.getElementById('effYear')?.value || '', document.getElementById('effQuarter')?.value || '');   // #127c: never before Q3 2026
  }
  // #129 (Jerin, 15 Sep 2026): the From / To boxes narrow every panel on this tab. effRange() is the two dates kept inside the Year/Quarter
  // period (#127b). A range covering the whole period reads the quarter figures exactly as before; a narrower one reads the pipeline's day
  // fields, whose days add up to those quarter figures. Job lists stay on the period (#125) and Joining Pending stays live.
  function effRange() { return rangeOf(document.getElementById('effVelFrom'), document.getElementById('effVelTo'), tisPeriod()); }
  const effWhole = () => coversQuarters(effRange(), tisPeriod());
  // Added at R1 / Progressed for one job — over the period's quarters, or inside a narrower range over its days (r1ByJobD). The Screening
  // table and its chart both read this, so they cannot disagree.
  function r1For(jid) {
    const j8 = (jid || '').slice(0, 8), acc = { added: 0, cleared: 0 }, per = tisPeriod(), rg = effRange();
    if (!coversQuarters(rg, per)) {
      const s = sumDayFields(((rollups && rollups.r1ByJobD) || {})[j8], rg);
      acc.added = s.added || 0; acc.cleared = s.cleared || 0;
      return acc;
    }
    const byQ = rollups && rollups.r1ByJob && rollups.r1ByJob[j8];
    if (!byQ) return acc;
    (per && per.length ? per : Object.keys(byQ)).forEach(qq => { const c = byQ[qq]; if (c) { acc.added += c.added || 0; acc.cleared += c.cleared || 0; } });
    return acc;
  }

  // Says which stages actually follow the period. Without this the panel would repeat the original bug in a
  // new form — quarter-scoped columns sitting unlabelled next to a live one.
  function tisNote(per) {
    const el = document.getElementById('effTisNote'); if (!el) return;
    if (!per) { el.style.display = 'none'; return; }
    const label = rangeText(effRange(), per);   // #129: the dates, when From / To is narrower than the period
    el.style.display = '';
    el.style.color = (tisHasQ && tisSplit) ? 'var(--muted)' : 'var(--orange)';
    el.innerHTML = !tisHasQ
      ? `Heads up: these medians are <strong>all-time</strong>, not ${label}. The stage-history file predates the per-quarter breakdown — it appears here after the next stage-history refresh.`
      : !tisSplit
      ? `Heads up: these medians still <strong>include candidates who have not left the stage yet</strong>, measured to today, so older quarters read higher for that reason alone. The split into finished vs still-waiting appears here after the next stage-history refresh.`
      : `Showing <strong>${label}</strong>. <span style="color:var(--orange)">*</span> ${APP_REVIEW_LIVE_NOTE}`;
  }

  // ===== Time in Process (Department → Job; median days parked per stage, red > 5) =====
  function renderTimeInProcess() {
    const head = document.getElementById('effTisHead');
    if (head) {
      const perH = tisPeriod();
      let h = '<tr><th style="min-width:16.25rem">Department / Job</th>';
      TIS_STAGES.forEach(([sk, lbl]) => {
        const live = perH && sk === 'appReview';
        h += `<th class="stage-sub" style="min-width:3rem"${live ? ` title="${APP_REVIEW_LIVE_NOTE}"` : ''}>${lbl}${live ? '<span style="color:var(--orange)">*</span>' : ''}</th>`;
      });
      head.innerHTML = h + '</tr>';
    }
    const body = document.getElementById('effTisBody'); if (!body) return;
    if (!tisByJob && !arDwellJob) { podSkeletonBody('effTisBody', TIS_STAGES.length, () => dashTds(TIS_STAGES.length)); return; }
    const q = selQuarter();
    const per = tisPeriod();
    // Per job: one histogram per stage column. App Review from the main-pull dwell (live, never period-scoped),
    // other stages from stage history, scoped to the selected period when the rollups carry the quarter dimension.
    // App Review is 100% still-waiting by construction (today − applied, for everyone parked there), so it
    // has no completed-stay median at all — the cell reads "—" over its waiting pile. That is the honest
    // shape of that column and always was; pooling simply disguised it as a processing time.
    const arPair = (dw) => ({ fin: {}, wait: dw || {}, live: true });
    // #129: inside a narrower From / To range the stays come from the day twins, by the day the candidate entered the stage.
    const rgT = effRange(), dayTis = !coversQuarters(rgT, per);
    const tisD = rollups.timeInStageByJobD || null, waitD = rollups.waitingByJobD || null;
    const jobHists = (jid) => TIS_STAGES.map(([sk]) => sk === 'appReview'
      ? arPair(arDwellJob && arDwellJob[jid])
      : (dayTis ? tisPairRange(tisD, waitD, jid, sk, rgT, tisSplit) : tisPair(tisByJob, tisByJobQ, waitByJob, waitByJobQ, jid, sk, per, tisSplit)));
    // On an older data file there is no split to show, so fall back to exactly the previous single-number
    // cell rather than passing a pooled median off as a completed-stay time. tisNote says so on screen.
    const cell = (p) => tisSplit ? tisCellSplit(p, 5) : tisCell(p.live ? p.wait : p.fin, 5);
    const rowCells = (histArr) => histArr.map(cell).join('');
    const poolCells = (arrs) => TIS_STAGES.map((_, i) => cell(poolPairs(arrs.map(a => a[i])))).join('');
    let html = '';
    // #125: only jobs with an opening opened in the period, and no empty rows — a job with nobody finished or waiting at any stage is
    // left out, and so is a department left with none. The department row pools exactly the jobs listed under it.
    const hasAny = (h) => !!h && Object.values(h).some(v => v > 0);
    deptJobs(q, false, true).forEach(({ dept, jobs: jsAll }, di) => {
      const kept = jsAll.map(j => ({ j, h: jobHists(j.jid) })).filter(x => x.h.some(p => hasAny(p.fin) || hasAny(p.wait)));
      if (!kept.length) return;
      const js = kept.map(x => x.j), jh = kept.map(x => x.h);
      html += `<tr data-path="${di}" data-haschild data-exp="0" style="cursor:pointer;background:var(--border-light)"><td style="font-weight:600">${CARET}${dept}<span style="color:var(--muted);font-weight:400;font-size:0.6875rem;margin-left:0.375rem">${js.length}</span></td>${poolCells(jh)}</tr>`;
      js.forEach((j, ji) => { html += `<tr data-path="${di}-${ji}" style="display:none"><td style="padding-left:1.875rem;color:var(--muted)">${j.title}</td>${rowCells(jh[ji])}</tr>`; });
    });
    body.innerHTML = html || `<tr><td colspan="${TIS_STAGES.length + 1}" style="text-align:center;color:var(--muted);padding:1rem">No departments match the filter.</td></tr>`;
    wireTreePath(body, expandAll());
    shadeTis(body);   // #137c
    tisNote(per);
  }

  // ===== Momentum (Department → Job → Stage; every day of the range, descending) =====
  function velDates() {
    const toV = document.getElementById('effVelTo')?.value;
    const fromV = document.getElementById('effVelFrom')?.value;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let end = toV ? new Date(toV + 'T00:00:00') : today;
    if (end > today) end = today;
    const start = fromV ? new Date(fromV + 'T00:00:00') : null;
    const out = [];
    // #141c (Jerin, 17 Sep): every day From → To, newest first — the same as Recruiter Efficiency (was the last 30 days only).
    const days = start ? Math.floor((end - start) / 86400000) + 1 : 30;
    for (let i = 0; i < days; i++) { const d = new Date(end); d.setDate(end.getDate() - i); if (start && d < start) break; out.push(d); }
    return out;
  }
  function applyVelYearQuarter() {
    const fromEl = document.getElementById('effVelFrom'), toEl = document.getElementById('effVelTo');
    if (!fromEl || !toEl) return;
    // #127c: the whole selection, never before Q3 2026 (Year and Quarter both on All = every quarter on offer).
    // #127b: and the pickers cannot leave it — other days are greyed out, and a date typed outside it snaps back.
    setDateBounds(fromEl, toEl, selectionQuarters(document.getElementById('effYear')?.value || '', document.getElementById('effQuarter')?.value || ''), true);
  }
  function dkeyEff(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  // Pod-level daily submissions (OA/HM/R1), summed across pod members from recruiters[].daily. Dept/Job
  // per-day detail needs a job×stage×date rollup the pipeline doesn't emit → pending child row.
  // ===== ToFU (top of funnel) — rebuilt 2026-08-26, same definition as Recruiter → Momentum =====
  // A candidate is added the first time they hit HM Review, an assessment triggered while they sat in
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
      let h = `<tr><th style="min-width:16.25rem">Department / Job</th><th>Total · ${dates.length}d</th>`;
      dates.forEach(d => {
        const wknd = d.getDay() === 0 || d.getDay() === 6;
        h += `<th class="${wknd ? 'wknd' : ''}"${wknd ? ' title="Weekend"' : ''}>${MON[d.getMonth()]} ${d.getDate()}</th>`;
      });
      head.innerHTML = h + '</tr>';
    }
    const numRow = (t, pd, bold) => `<td${bold ? ' style="font-weight:600"' : ''}>${t > 0 ? t : '<span class="zero">0</span>'}</td>` + pd.map(v => `<td>${v > 0 ? v : '<span class="zero">·</span>'}</td>`).join('');
    const add = (dst, src) => { for (let i = 0; i < dst.length; i++) dst[i] += src[i]; };
    let html = '';
    const rows = deptJobs(q, false, true);   // #125: only jobs with an opening opened in the Year/Quarter period
    if (tofuByJob) {
      rows.forEach(({ dept, jobs: js }, di) => {
        const dArr = new Array(dkeys.length).fill(0); let dTot = 0;
        // #125: no empty rows — a job with nobody added in the days shown is left out, and so is a department left with none.
        const jd = js.map(j => {
          const jm = tofuByJob[j.jid] || {};
          let jTot = 0;
          const jArr = dkeys.map(dk => { const v = jm[dk] || 0; jTot += v; return v; });
          return { j, jArr, jTot };
        }).filter(x => x.jTot > 0);
        if (!jd.length) return;
        jd.forEach(x => { add(dArr, x.jArr); dTot += x.jTot; });
        const dc = DEPT_COLORS[di % DEPT_COLORS.length];
        html += `<tr class="lvl-dept${dTot ? '' : ' lvl-quiet'}" data-path="${di}" data-haschild data-exp="0" style="cursor:pointer;background:var(--border-light)"><td style="font-weight:600;box-shadow:inset 0.1875rem 0 0 ${dc}">${CARET}${dept}<span style="color:var(--muted);font-weight:400;font-size:0.6875rem;margin-left:0.375rem">${jd.length}</span></td>${numRow(dTot, dArr, true)}</tr>`;
        jd.forEach(({ j, jArr, jTot }, ji) => {
          html += `<tr class="lvl-job${jTot ? '' : ' lvl-quiet'}" data-path="${di}-${ji}" style="display:none"><td style="padding-left:1.875rem;color:var(--text)">${j.title}</td>${numRow(jTot, jArr, false)}</tr>`;
        });
      });
    } else {
      // No ToFU field yet. Say so rather than falling back to the old per-stage counts, which answer a
      // different question and would sit under this heading as a lie.
      html += `<tr><td colspan="${dkeys.length + 2}" style="color:var(--muted);font-style:italic;padding:1rem">Arrivals appear after the next stage-history refresh.</td></tr>`;
    }
    body.innerHTML = html || `<tr><td colspan="${dkeys.length + 2}" style="text-align:center;color:var(--muted);padding:1rem">Nobody was added in these days on jobs with an opening in the period.</td></tr>`;
    wireTreePath(body, expandAll());
    shadeMomentum(body, dates);   // #137c
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
  // { job8: { sourceType: { sourceName: joiners } } } for a PERIOD: an array of quarter keys, null = all time.
  // #120 (14 Sep 2026): it took ONE quarter, so "Quarter: All" showed the current quarter only.
  function joinerSourcesByJob(per) {
    const rg = effRange();   // #129: joiners whose start date is inside From / To; the cache is keyed by the range too
    const ck = (per ? per.join(',') : 'ALL') + '|' + rg.from + '|' + rg.to;
    if (_jsQ === ck && _jsMap) return _jsMap;
    const out = {};
    (data.offerEvents || []).forEach(e => {
      if (!e.accepted || e.appStatus !== 'Hired' || !e.jobId8) return; // Joined = moved to Hired, not just an accepted offer
      const eq = qOfDate(e.startDate);
      if (!eq) return;
      if (per && !per.includes(eq)) return;
      if (!inRange(e.startDate, rg)) return;
      const t = e.srcType || NO_SRC;
      const nm = e.srcType ? (e.srcName || '(unspecified)') : NO_SRC;
      const j = out[e.jobId8] || (out[e.jobId8] = {});
      const bt = j[t] || (j[t] = {});
      bt[nm] = (bt[nm] || 0) + 1;
    });
    _jsQ = ck; _jsMap = out;
    return out;
  }

  const mergeNested = (dst, src) => { for (const t in src) { const at = dst[t] || (dst[t] = {}); for (const nm in src[t]) at[nm] = (at[nm] || 0) + src[t][nm]; } return dst; };
  const sumNames = (names) => Object.values(names).reduce((a, v) => a + v, 0);
  const sumNested = (nst) => Object.values(nst).reduce((s, names) => s + sumNames(names), 0);

  // Department → Job, each carrying its merged {type:{name:count}}. Honours the Department + Job filters.
  function sourceTree(q, per) {
    const byJob = joinerSourcesByJob(per);
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
  function visibleSourceAgg(q, per) {
    const agg = {};
    sourceTree(q, per).forEach(d => mergeNested(agg, d.nst));
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
    const per = tisPeriod();   // #120: the whole period, not one quarter
    if (note) note.textContent = per
      ? `Showing where the people who joined in ${rangeText(effRange(), per)} came from.`
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
          out += `<tr data-path="${path}-${ti}" data-haschild data-exp="0" style="display:none;cursor:pointer"><td style="padding-left:${uiPx(pad)}px;font-weight:500">${CARET}${t}</td><td>${tcnt}</td><td>${pc(tcnt, parentTot)}%</td></tr>`;
          Object.entries(names).sort((a, b) => b[1] - a[1]).forEach(([nm, cnt], ni) => {
            out += `<tr data-path="${path}-${ti}-${ni}" style="display:none"><td style="padding-left:${uiPx(pad + 26)}px;color:var(--muted)">${nm}</td><td>${cnt}</td><td>${pc(cnt, tcnt)}%</td></tr>`;
          });
        });
      return out;
    };

    let html = '';
    const tree = sourceTree(q, per);
    const grand = tree.reduce((s, d) => s + d.tot, 0) || 1;
    tree.forEach((D, di) => {
      html += `<tr data-path="${di}" data-haschild data-exp="0" style="cursor:pointer;background:var(--border-light)">
        <td style="font-weight:600">${CARET}${D.dept}<span style="color:var(--muted);font-weight:400;font-size:0.6875rem;margin-left:0.375rem">${D.jobs.length}</span></td><td style="font-weight:600">${D.tot || '<span class="zero">0</span>'}</td><td>${pc(D.tot, grand)}%</td></tr>`;
      D.jobs.forEach((J, ji) => {
        html += `<tr data-path="${di}-${ji}" data-haschild data-exp="0" style="display:none;cursor:pointer"><td style="padding-left:1.875rem">${CARET}${J.title}</td><td>${J.tot}</td><td>${pc(J.tot, D.tot)}%</td></tr>`;
        html += typeRows(J.nst, J.tot, `${di}-${ji}`, 56);
      });
    });

    body.innerHTML = html || `<tr><td colspan="3" style="text-align:center;color:var(--muted);padding:1rem">Nobody joined under these filters, so there is no source mix to show.</td></tr>`;
    wireTreePath(body, expandAll());
    shareBars(body, effSrcColorOf);   // #137c: the colours come from buildSourceChart
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
      if (!cfg) { body.innerHTML = `<p style="font-size:0.6875rem;color:var(--muted);margin:0.375rem 0 0;line-height:1.5">${emptyText}</p>`; return; }
      body.style.height = uiPx(cfg._h || Math.max(90, cfg.data.labels.length * 22 + 34)) + 'px';
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
  // Momentum is the SAME heatmap as Recruiter Efficiency (Jerin, 2026-08-31) - one implementation in
  // chart-style.js, two callers. Rows here are DEPARTMENTS; on the Recruiter tab they are recruiters.
  // It replaced a stacked bar chart, which could not answer "which roles are behind this square" without
  // a twenty-entry legend - the whole reason the Recruiter tab moved to a heatmap on 2026-08-30.
  function buildVelChartEff() {
    const host = document.getElementById('effVelHeat');
    const tip = document.getElementById('effVelHeatTip');
    const wrap = document.getElementById('effVelHeatWrap');
    if (!host) return;
    if (!tofuByJob) { host.innerHTML = ''; return; }
    // Newest first, the same order the table below it uses (Jerin, 2026-08-31).
    const chrono = [...velDates()];
    const keys = chrono.map(dkeyEff);

    const rows = [], roleAt = {};
    deptJobs(selQuarter(), false, true).forEach(({ dept, jobs }) => {   // #125: the same jobs as the table
      const per = keys.map(() => 0);
      jobs.forEach(j => {
        const m = tofuByJob[(j.jid || '').slice(0, 8)] || tofuByJob[j.jid] || {};
        keys.forEach((k, i) => {
          const v = m[k] || 0;
          if (!v) return;
          per[i] += v;
          const cell = roleAt[`${dept}|${i}`] || (roleAt[`${dept}|${i}`] = []);
          cell.push({ title: j.title, n: v });
        });
      });
      const total = per.reduce((a, v) => a + v, 0);
      if (total > 0) rows.push({ name: dept, sub: dept, per, total });
    });
    rows.sort((a, b) => b.total - a.total);

    buildDayHeat(host, tip, wrap, rows, chrono, roleAt, {
      alignSel: '.eff-panel[data-panel="velocity"] .evel-table thead th',
      emptyMsg: 'Nobody was added in this window for the departments shown.'
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
  // ⚠ Delta is NOT split: a −5 role and a +5 role cancel in the table, and splitting let both count in the chart
  // (SME - India read 53 against the table's 48).
  // 🚨 #120 (14 Sep 2026): Delta is SIGNED in the table (Rule 1) and a bar cannot draw a negative band, so a department
  // with more people in closing than positions drew no Delta band, and the end label and tooltip then added Joined +
  // Joining Pending and called it "Total positions" (Unknown read 3 against the table's 1). Both now READ the table's
  // Total, and the tooltip names a negative Delta.
  function renderFulfilCharts(per) {
    const rows = fulfilRows(per);

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
      if (wrap && !emptyMsg) { emptyMsg = document.createElement('div'); emptyMsg.className = 'chart-empty'; emptyMsg.style.cssText = 'display:flex;align-items:center;justify-content:center;min-height:7.5rem;color:var(--muted);font-size:0.8125rem;text-align:center;padding:1.25rem'; wrap.appendChild(emptyMsg); }
      if (emptyMsg) { emptyMsg.textContent = per && per.length === 1 ? `No openings in ${per[0].replace('-', ' ')}.` : 'No openings in this period.'; emptyMsg.style.display = 'flex'; }
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
    opts.plugins.stackTotals = false;   // the global plugin adds up the bars; this label must be the table's Total
    opts.plugins.tooltip = roleSectionTooltip(METRICS, { totalLabel: 'Total positions',
      total: (i) => rows[i].sum.total,
      extra: (i) => rows[i].sum.gap < 0 ? `Delta ${rows[i].sum.gap}: ${-rows[i].sum.gap} more in closing than positions opened` : '' });
    const totalLabels = {
      id: 'effFulfilTotals',
      afterDatasetsDraw(chart) {
        const c = chart.ctx; c.save();
        c.font = `600 ${uiPx(11)}px -apple-system, BlinkMacSystemFont, sans-serif`;
        c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillStyle = '#334155';
        rows.forEach((r, i) => {
          let x = null, y = null;
          chart.data.datasets.forEach((d, di) => {
            if (!chart.isDatasetVisible(di) || !(d.data[i] > 0)) return;
            const bar = chart.getDatasetMeta(di).data[i]; if (!bar) return;
            x = x == null ? bar.x : Math.max(x, bar.x); y = bar.y;
          });
          if (x != null) c.fillText(String(r.sum.total), x + uiPx(6), y);
        });
        c.restore();
      }
    };
    effFulfilCombined = new Chart(ctx, {
      type: 'bar',
      data: { labels: rows.map(r => r.dept), datasets: roleBandDatasets(chartRows, METRICS) },
      options: opts,
      plugins: [roleBandOverlay(METRICS), totalLabels]
    });
  }

  // Per-department chart: Y = job, bars = Offered / Hired score for that job.
  // One small chart per department (mirror of the old renderPodCharts, keyed on department).

  // Horizontal STACKED bar: one bar per source TYPE, segmented by the source NAMES within it (top ~12 names
  // globally + "Other"). Each source name belongs to one type, so the legend of real names maps cleanly and each
  // type-bar shows only its own sources. Aggregated over exactly the same scope as the table
  // below (visibleSourceAgg), so the chart and the tree can never disagree under a filter.
  const SRC_PALETTE = ['#4E6BA6', '#398AA2', '#1E7590', '#D8B5BE', '#938FB8', '#7BA7C7', '#A9CAD6', '#C4A6B8', '#6B8E9F', '#B5C8D8', '#8FB0A8', '#D0B8A0'];
  // #137c: the source-name colours the chart used last, read by the Sourcing Mix share bars (var, so it exists before the chart runs).
  var effSrcColorOf;
  function buildSourceChart() {
    const ctx = document.getElementById('effSourceChart'); if (!ctx) return;
    if (effSourceChart) effSourceChart.destroy();
    const q = selQuarter();
    const agg = visibleSourceAgg(q, tisPeriod());   // type -> { name: count }, same scope as the table
    const types = Object.keys(agg);
    const totalAll = types.reduce((s, t) => s + Object.values(agg[t]).reduce((a, v) => a + v, 0), 0);
    const wrap = ctx.parentElement; let emptyMsg = wrap && wrap.querySelector('.chart-empty');
    if (!types.length || !totalAll) {
      ctx.style.display = 'none';
      if (wrap && !emptyMsg) { emptyMsg = document.createElement('div'); emptyMsg.className = 'chart-empty'; emptyMsg.style.cssText = 'display:flex;align-items:center;justify-content:center;min-height:7.5rem;color:var(--muted);font-size:0.8125rem;text-align:center;padding:1.25rem'; wrap.appendChild(emptyMsg); }
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
    // #137c: this chart colours by SOURCE NAME, so the share bars do the same — a name's bar is its colour here, everything else stays slate.
    effSrcColorOf = (t, nm, kind) => (kind === 'name' && topNames.includes(nm) ? SRC_PALETTE[topNames.indexOf(nm) % SRC_PALETTE.length] : null);
    colorShareBars(document.getElementById('effSourceBody'), effSrcColorOf);
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
    else if (activeTab === 'joiningpending') renderFulfilJP();   // #130b
    else if (activeTab === 'joiners') renderJoiners();           // #130c
    else if (activeTab === 'velocity') renderVelocity();
    else if (activeTab === 'screening') renderScreening();   // its chart is built inside renderScreening
    else if (activeTab === 'throughput') renderThroughput();   // its chart is built inside renderThroughput
    else if (activeTab === 'pipeline') renderPipeline();   // #145a
    else if (activeTab === 'timeinprocess') renderTimeInProcess();
    else if (activeTab === 'joining') renderJoining();   // its chart is built inside renderJoining
    else if (activeTab === 'sourcing') renderSourcing();
    else if (activeTab === 'panelists') renderPanelists();
  }

  // Only the visible panel is rendered. This used to rebuild all seven, which was tolerable at 5 pod charts
  // and is not at 13 department charts (~91 Chart.js instances per filter change). showTab() re-renders on
  // switch, so nothing goes stale.
  // ===== Panelists — the same Interviewer Efficiency panel Hiring Manager hosts, driven by THIS tab's
  // filters. One implementation, two mounts; the standalone Interviewer tab is gone.
  let ivRefresh = null;
  function renderPanelists() {
    const host = document.getElementById('effPanelHost');
    if (!host) return;
    if (!ivRefresh) {
      host.innerHTML = renderInterviewer(data, { embedded: true });
      ivRefresh = initInterviewer(data, {
        filters: {
          year: () => document.getElementById('effYear')?.value || '',
          quarter: () => document.getElementById('effQuarter')?.value || '',
          depts: () => (msDept ? msDept.getSelected() : []),
          jobs: () => (msJob ? msJob.getSelected() : []),
          jobIds: () => { const per = tisPeriod(); return per ? jobsWithOpeningIn(data, qq => per.includes(qq)) : null; },   // #125
          range: () => effRange(),       // #129: interviews counted by day inside From / To, as on Hiring Manager
          panelists: () => [],           // this tab has no panelist dimension
          expandAll: () => expandAll()   // #120: Expand all reaches the Panelists tree too
        }
      }) || null;
    } else {
      ivRefresh();
    }
  }

  function renderAll() { renderActive(); }

  function showTab(name) {
    activeTab = name;
    // #133: Joining Pending is live, so the period boxes give way to the DOJ boxes there. Expand all opens department trees, so it hides over
    // the two flat people lists, where it would move nothing (Rule 13).
    toggleJpFilters('eff', document.getElementById('effPeriod'), name === 'joiningpending');
    showControl(document.getElementById('effExpandWrap'), name !== 'joiningpending' && name !== 'joiners');
    // #145a: Pipeline counts are live, and its roles follow Year and Quarter, so From and To would move nothing
    // there — they hide, exactly as on the Hiring Manager tab (#141d, Rule 13).
    ['effVelFrom', 'effVelTo'].forEach(id => showControl(document.getElementById(id)?.closest('.fchip'), name !== 'pipeline'));
    // #129: From / To show on every sub-tab again — they now narrow every panel (#127e had shown them on Momentum only).
    document.querySelectorAll('.eff-subtab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.eff-panel').forEach(p => { p.style.display = p.dataset.panel === name ? '' : 'none'; });
    renderActive();
  }
  document.querySelectorAll('.eff-subtab').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));

  // Filters
  const deptNames = [...new Set(jobs.map(j => resolveDeptTeam(j.department).dept).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  // #172c: ids, not names — same source set, labelled by job-filter.js (department only where it repeats).
  const jobOptions = jobFilterOptions(data, new Set(jobs.map(j => j.id || j.jid).filter(Boolean)));
  // Pod filter removed (#18) — Overall Efficiency is Department → Job now. visiblePods() still returns
  // every pod for the sub-tabs not yet converted, so nothing else changes until they are.
  msPod = null;
  msDept = makeMultiSelect(document.getElementById('effMsDept'), 'Department', deptNames, renderAll);
  msJob = makeMultiSelect(document.getElementById('effMsJob'), 'Job', jobOptions, renderAll);   // #172c
  document.addEventListener('click', closeMsPanels);
  document.getElementById('effExpandAll')?.addEventListener('change', renderAll);
  // #122: the Stages dropdown + Hide zero-pipeline above the Throughput squares.
  msEffTpStage = makeMultiSelect(document.getElementById('effMsTpStage'), 'Stages', TP_KEYS.map(k => TP_LABELS[k]), renderThroughput);
  document.getElementById('effTpHideEmpty')?.addEventListener('change', renderThroughput);
  // #145a: the same two controls over the Pipeline table.
  msEffPipeStage = makeMultiSelect(document.getElementById('effMsPipeStage'), 'Stages', PIPE_KEYS.map(k => PIPE_LABELS[k]), renderPipeline);
  document.getElementById('effPipeHideEmpty')?.addEventListener('change', renderPipeline);

  // #129: the dates narrow every panel, so a change re-renders whichever is showing (they used to redraw Momentum only).
  ['effVelFrom', 'effVelTo'].forEach(id => document.getElementById(id)?.addEventListener('change', renderAll));
  ['effDojMonth', 'effDojFrom', 'effDojTo'].forEach(id => document.getElementById(id)?.addEventListener('change', renderAll));   // #133
  document.getElementById('effYear')?.addEventListener('change', () => {
    fillQuarterSelect(document.getElementById('effQuarter'), document.getElementById('effYear').value, true);   // #127c: only the year's quarters on offer
    applyVelYearQuarter(); renderAll();
  });
  document.getElementById('effQuarter')?.addEventListener('change', () => { applyVelYearQuarter(); renderAll(); });
  // Default to the current year + quarter — #127d: the newest on offer, so Q4 is picked by itself from 1 Oct.
  keepDatesInBounds(document.getElementById('effVelFrom'), document.getElementById('effVelTo'));   // #127b
  selectCurrentQuarter(document.getElementById('effYear'), document.getElementById('effQuarter'), true);
  applyVelYearQuarter();

  renderAll();
  showTab('fulfilment');
}
