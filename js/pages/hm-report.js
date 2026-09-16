import { getData, jobsWithOpeningIn } from '../data.js';
import { renderInterviewer, initInterviewer } from './interviewer.js';
import { defsBlock } from '../definitions.js';
import { tdCandidate, tdDept, tdJob, tdQuarter, tdMonth, tdDoj, tdStage, tdRecruiter } from '../people-cells.js';   // #137
import { shadePipeline } from '../grid-shade.js';   // #137c
import { reportingYears, selectionQuarters, fillQuarterSelect, selectCurrentQuarter, setDateBounds, keepDatesInBounds,
         rangeOf, inRange, rangeText, rangeTouchesQuarter, coversQuarters, sumDayFields, hasDayData,
         dojFilterHtml, dojFilterOf, inDojFilter, dojFilterText, toggleJpFilters, showControl } from '../period.js';   // #127 · #129 · #130 · #133
import { resolveDeptTeam as splitDT } from '../dept-map.js';
import { HBAR, hbarHeight, roleBandDatasets, roleBandOverlay, roleSectionTooltip, metricLegend,
         buildStageHeat } from '../chart-style.js';

// 'Hello Christy' is a bot-driven ALTERNATIVE to TA Screen (not a step before it) — candidates take one
// route or the other. It sits immediately to the LEFT of TA Screen everywhere, per the user 2026-08-21.
const STAGES_ORDER = ['appReview','helloChristy','taScreen','hmReview','oa','r1','r2','r3','r4','r5','refCheck','docSub','offer','hired'];
const STAGE_LABELS = {
  appReview:'App Review', helloChristy:'Hello Christy', taScreen:'TA Screen', hmReview:'HM Review', oa:'OA',
  r1:'R1', r2:'R2', r3:'R3', r4:'R4', r5:'R5',
  refCheck:'Ref Check', docSub:'Doc Sub', offer:'Offer', hired:'Hired'
};
const TP_KEYS = ['app','hc','ta','hm','oa','r1','r2','r3','r4','r5','rc','ds','offer'];
const TP_LABELS = {
  app:'App Review', hc:'Hello Christy', ta:'TA Screen', hm:'HM Review', oa:'OA',
  r1:'R1', r2:'R2', r3:'R3', r4:'R4', r5:'R5',
  rc:'Ref Check', ds:'Doc Sub', offer:'Offer'
};
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// The HM tab uses Department only (team is intentionally not a dimension here).
// resolveDeptTeam (imported as splitDT) comes from the authoritative Ashby dump in dept-map.js.
const deptOf = v => splitDT(v).dept;
const byDept = (a, b) => a._dept.localeCompare(b._dept) || ((b.total || 0) - (a.total || 0)) || String(a.title || '').localeCompare(String(b.title || ''));

const CARET = '<span class="caret" style="display:inline-block;width:0.875rem;color:var(--muted)">▸</span>';

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

// Administrative stages: candidates ADDED, not assessed (Jerin, 2026-08-31).
const TP_ADDED = { rc: 1, ds: 1, offer: 1 };   // keyed like TP_KEYS — as refCheck/docSub they never matched, so the Ref Check and Doc Sub hovers said "assessed" (fixed in #122, 15 Sep 2026)

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
function cnt(n) { return `<span style="color:var(--muted);font-weight:400;font-size:0.6875rem;margin-left:0.375rem">${n}</span>`; }

function computeThroughput(p, total) {
  const stages = ['helloChristy','taScreen','hmReview','oa','r1','r2','r3','r4','r5','refCheck','docSub','offer','hired'];
  const cum = {};
  let running = 0;
  for (let i = stages.length - 1; i >= 0; i--) { running += (p[stages[i]] || 0); cum[stages[i]] = running; }
  return {
    // 'Out of App Review' means reached EITHER screening route, so it reads from the combined tier.
    app:   { i: total,                    o: cum.helloChristy || 0 },
    // Hello Christy and TA Screen are ALTERNATIVE routes at the same tier, so hc -> ta is not a real
    // conversion — a bot-screened candidate advances to HM Review, not to TA Screen. `o` is therefore the
    // count that went on to HM Review or beyond, the same denominator TA Screen uses, rather than a
    // hc-to-ta step that would render as phantom drop-off.
    hc:    { i: p.helloChristy || 0,      o: cum.hmReview || 0, altRoute: true },
    ta:    { i: cum.taScreen || 0,        o: cum.hmReview || 0 },
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

// #6 (2026-08-22): the local `valueLabels` plugin that used to live here was a DUPLICATE of the global one
// in chart-datalabels.js — both were registered under the same id and both drew, so every grouped bar
// carried its number twice: once inside the bar in white, once above it in slate. The global plugin
// already handles grouped vs stacked correctly, so this file just uses it.

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
  const years = reportingYears();   // #127c: nothing before Q3 2026 is offered — it was never cleaned up

  return `
    <style>
      .hm-filters select, .hm-filters input[type=date] {
        appearance:none; -webkit-appearance:none;
        height:1.75rem; padding:0 1.875rem 0 0.6875rem; border:1px solid var(--border); border-radius:0.5rem;
        font-size:0.75rem; font-weight:500; background:var(--card); color:var(--text); cursor:pointer;
      }
      .hm-filters input[type=date] { padding-right:0.6875rem; }
      .hm-filters select {
        background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%2364748b' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
        background-repeat:no-repeat; background-position:right 0.6875rem center;
      }
      .hm-filters select:hover, .hm-filters input[type=date]:hover { border-color:var(--muted); }
      .hm-filters select:focus, .hm-filters input[type=date]:focus { outline:none; border-color:var(--accent); box-shadow:0 0 0 0.1875rem rgba(78,107,166,0.16); }
      .hm-filters .fchip { display:flex; align-items:center; gap:0.4375rem; }
      /* .hm-filters label styling lives in style.css — quiet, sentence case */
      .hm-filters .fchip > label.opt { font-size:0.75rem; font-weight:500; display:flex; align-items:center; gap:0.25rem; cursor:pointer; }
      .hm-filters .fdiv { width:1px; align-self:stretch; background:#cdddf7; margin:2px 2px; }
      .hm-report table td, .hm-report table th { vertical-align:middle; }

      /* sub-tabs */
      /* .hm-subtabs is the recessed .subtab-band — see style.css */
      /* .hm-subtab now inherits .subtab-chip from style.css — one chip for every level below the page */

      /* Department Summary: run edge to edge like every other table.
         width:auto used to size the table to its content, which left a wide dead strip on the right of the
         card. The name column takes the slack; the numeric columns stay compact and right-aligned so the
         digits still line up. */
      /* #13 (2026-08-23): min-width was 720px while the six numeric columns alone need 840, so the table grew
         past it and the ROLE NAME column was squeezed to 0px — that is the 'weird spacing'. The name column
         now has a real width and min-width covers the whole row. */
      .hm-report .hm-summary { width:100%; min-width:68.75rem; table-layout:fixed; }
      .hm-report .hm-summary th:first-child, .hm-report .hm-summary td:first-child { text-align:left; width:16.25rem; }
      .hm-report .hm-summary th:not(:first-child), .hm-report .hm-summary td:not(:first-child) {
        text-align:right; width:8.125rem; white-space:nowrap; font-variant-numeric:tabular-nums; }
      /* Delta is the 5th column and holds the progress bar, so it needs more room than a bare number. */
      .hm-report .hm-summary th:nth-child(5), .hm-report .hm-summary td:nth-child(5) { width:9.375rem; }   /* Dropped + % caption */
      .hm-report .hm-summary th:nth-child(6), .hm-report .hm-summary td:nth-child(6) { width:11.25rem; }   /* Delta: track + number + caption */

    </style>

    <div class="hm-report">
    <!-- ===== GLOBAL PAGE FILTERS ===== -->
    <div class="hm-subtabs subtab-band">
      <!-- #130 (Jerin, 15 Sep 2026): one name on every tab, and the two people lists on their own sub-tabs. Tab keys unchanged, so saved links still open. -->
      <button class="hm-subtab subtab-chip active" data-tab="positions">Position Fulfilment</button>
      <button class="hm-subtab subtab-chip" data-tab="joiningpending">Joining Pending</button>
      <button class="hm-subtab subtab-chip" data-tab="joiners">Joiners</button>
      <button class="hm-subtab subtab-chip" data-tab="throughput">Throughput</button>
      <button class="hm-subtab subtab-chip" data-tab="pipeline">Pipeline</button>
      <button class="hm-subtab subtab-chip" data-tab="panelists">Panelists</button>
    </div>

    <!-- ===== SUB-TAB STRIP ===== -->
    <div class="hm-filters">
      <div class="fchip"><span class="lbl">Department</span><select id="hmDept" style="min-width:10.625rem"><option value="">All Departments</option>${allDepts.map(d => `<option value="${d}">${d}</option>`).join('')}</select></div>
      <span class="fdiv"></span>
      <div class="fchip"><div class="ms" id="msHmJob"></div></div>
      
      
      <label class="opt" id="hmExpandWrap" style="margin-left:auto;font-size:0.75rem;font-weight:500;display:flex;align-items:center;gap:0.3125rem;cursor:pointer;color:var(--accent)"><input type="checkbox" id="hmExpandAll" checked> Expand all</label>
    <span class="period" id="hmPeriod"><div class="fchip"><span class="lbl">Year</span><select id="hmYear"><option value="">All</option>${years.map(y => `<option value="${y}">${y}</option>`).join('')}</select></div><div class="fchip"><span class="lbl">Quarter</span><select id="hmQuarter"><option value="">All</option></select></div><div class="fchip"><span class="lbl">From</span><input type="date" id="hmDateFrom"></div><div class="fchip"><span class="lbl">To</span><input type="date" id="hmDateTo"></div></span>${dojFilterHtml('hm', data.joiningPendingCases, 'margin-left:auto')}</div>

    <!-- ===== PANEL: POSITION FULFILMENT ===== -->
    <div class="hm-panel" data-panel="positions">
      <div class="cards" id="hm1Cards"></div>

      <h3 class="subsection-title">Positions by department</h3>
      <div class="chart-wrap" id="hm1ChartWrap" style="height:21.25rem"><canvas id="hm1Chart"></canvas></div>

      <h3 class="subsection-title">Department Summary</h3>
      <p class="sub-note">Click a department to see its roles.</p>
      <div class="scroll-table"><table class="hm-summary">
        <thead><tr><th>Department</th><th>Total Openings</th><th>Joined</th><th>Joining Pending</th><th>Dropped</th><th>Delta</th><th>Missed</th></tr></thead>
        <tbody id="hm1Body"></tbody>
      </table></div>
      ${defsBlock('hm-positions')}
    </div>

    <!-- ===== PANEL: JOINING PENDING (#130b — was the Cases list under Position Fulfilment) ===== -->
    <div class="hm-panel" data-panel="joiningpending" style="display:none">
      <p class="sub-note" id="hmJPCaption" style="margin-bottom:0.5rem"></p>
      <div class="scroll-table"><table class="pl-list">
        <thead><tr><th>Opening Quarter</th><th>Month</th><th>DOJ</th><th>Department</th><th>Job</th><th>Candidate</th><th>Sub-Stage</th><th>Recruiter</th></tr></thead>
        <tbody id="hmJPBody"></tbody>
      </table></div>
      ${defsBlock('hm-joiningpending')}
    </div>

    <!-- ===== PANEL: JOINERS (#130c) — the Joining Pending columns minus Sub-Stage: Hired is one stage ===== -->
    <div class="hm-panel" data-panel="joiners" style="display:none">
      <p class="sub-note" id="hmJoinCaption" style="margin-bottom:0.5rem"></p>
      <div class="scroll-table"><table class="pl-list">
        <thead><tr><th>Opening Quarter</th><th>Month</th><th>DOJ</th><th>Department</th><th>Job</th><th>Candidate</th><th>Recruiter</th></tr></thead>
        <tbody id="hmJoinBody"></tbody>
      </table></div>
      ${defsBlock('hm-joiners')}
    </div>

    <!-- ===== PANEL: THROUGHPUT ===== -->
    <div class="hm-panel" data-panel="throughput" style="display:none">
      <div class="tp-controls">
        <div class="ms" id="msHmTpStage"></div>
        <label><input type="checkbox" id="hm2HideEmpty" checked> Hide zero-pipeline</label>
      </div>
      <!-- #122 (Jerin, 15 Sep 2026 — option C1): ONE section. The stage squares and the Department/Job table under them
           showed the same figures twice, in two colour codes; departments now open into their jobs inside the squares. -->
      <div class="sheat-wrap">
        <div class="sheat-head"><h3 class="subsection-title">Throughput — by stage</h3><span class="sheat-hint" id="hm2Hint"></span></div>
        <div id="hm2Heat" class="sheat"></div><div id="hm2HeatTip" class="sheat-tip"></div>
      </div>
      ${defsBlock('hm-throughput')}
    </div>

    <!-- ===== PANEL: PIPELINE ===== -->
    <div class="hm-panel" data-panel="pipeline" style="display:none">
      <p class="sub-note" style="color:var(--orange)"><strong>Live</strong> — counts show where candidates stand today, not in the selected period. Click a department to drill in.</p>
      <!-- #128 (Jerin, 15 Sep 2026): the same Stages dropdown + Hide zero-pipeline as Throughput (#122), replacing the row of stage tick-boxes. -->
      <div class="tp-controls">
        <div class="ms" id="msHmPipeStage"></div>
        <label><input type="checkbox" id="hm3HideEmpty" checked> Hide zero-pipeline</label>
      </div>
      <div class="scroll-table"><table id="hm3Table">
        <thead id="hm3Head"></thead>
        <tbody id="hm3Body"></tbody>
      </table></div>
      ${defsBlock('hm-pipeline')}
    </div>

    <!-- ===== PANEL: PANELISTS ===== -->
    <div class="hm-panel" data-panel="panelists" style="display:none">
      <div class="filter-bar"><div class="ms" id="msHmPanel"></div></div>
      <div id="hmPanelHost"></div>
    </div>
    </div>
  `;
}


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
  return e.day ? inRange(e.day, rg) : (coversQuarters(rg, qs) && qs.includes(e.quarter));
}

let hm1ChartInstance = null;
// One shared function, so revisiting the tab does not stack another document listener each time (#120, 14 Sep 2026).
const closeMsPanels = () => document.querySelectorAll('.ms-panel').forEach(p => p.style.display = 'none');

export function initHmFilters(data) {
  if (!data) return;
  const openings = data.openings || [];
  const jobs = data.jobs || [];
  const jobById = {};
  jobs.forEach(j => { jobById[j.id] = j; });

  openings.forEach(o => { o._dept = deptOf(o.department); });
  jobs.forEach(j => { j._dept = deptOf(j.department); });

  // Job-title multi-selects (Positions / Joining Pending / Throughput / Pipeline)
  // #7 (2026-08-22): there used to be FOUR separate Job multi-selects, one per sub-tab, each filtering only
  // its own table. Now a single control in the main filter bar drives every panel and every chart on the tab.
  let msHmJob = null, msHmPanel = null, msHmTpStage = null, msHmPipeStage = null;
  const selJobs = () => (msHmJob ? msHmJob.getSelected() : []);
  const jobTitles = [...new Set([...openings.map(o => o.title), ...jobs.map(j => j.title), ...((data.joiningPendingCases || []).map(c => c.job || c.jobTitle))].filter(Boolean))].sort((a, b) => a.localeCompare(b));
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
      + (options.map(o => `<label class="ms-opt"><input type="checkbox" value="${esc(o)}"> ${o}</label>`).join('') || '<span style="font-size:0.6875rem;color:var(--muted);padding:0.25rem 0.5rem">No options yet</span>')
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

  function gDept() { return document.getElementById('hmDept')?.value || ''; }
  function gFrom() { return document.getElementById('hmDateFrom')?.value || ''; }
  function gTo() { return document.getElementById('hmDateTo')?.value || ''; }

  // #127c (Jerin, 15 Sep 2026): the dates always cover the whole selection and never start before Q3 2026 — nothing earlier was cleaned
  // up. Year and Quarter both on All run from 1 Jul 2026 to the end of the quarter today falls in.
  function applyYearQuarter() {
    const y = document.getElementById('hmYear')?.value || '';
    const q = document.getElementById('hmQuarter')?.value || '';
    // #127b: and the pickers cannot leave it — other days are greyed out, and a date typed outside it snaps back.
    setDateBounds(document.getElementById('hmDateFrom'), document.getElementById('hmDateTo'), selectionQuarters(y, q), true);
  }

  // ===== #129 (Jerin, 15 Sep 2026): every panel follows the From / To dates to the DAY =====
  // "If there is a filter applied, data needs to change as well." hmRange() is the two dates, kept inside the Year/Quarter period (#127b).
  // A window covering whole quarters reads the quarter figures exactly as before; a narrower one reads the pipeline's day fields, whose
  // days add up to those quarter figures. Pipeline counts and Joining Pending stay live.
  function hmQuarters() { return selectionQuarters(document.getElementById('hmYear')?.value || '', document.getElementById('hmQuarter')?.value || ''); }
  function hmRange() { return rangeOf(document.getElementById('hmDateFrom'), document.getElementById('hmDateTo'), hmQuarters()); }
  // A quarter is inside the window when ANY of its days is. The old rule needed the quarter's FIRST day inside, so moving From to
  // 15 Aug dropped Q3 — every job list emptied and every count read zero.
  function quarterInRange(q) { return /^\d{4}-Q[1-4]$/.test(q || '') && rangeTouchesQuarter(q, hmRange()); }
  function windowQuarters() { return hmQuarters().filter(quarterInRange); }
  // #125 (Jerin, 15 Sep 2026): "we dont work on any job with an opening open date in the previous quarter". Throughput and Panelists list
  // only jobs with an opening OPENED in a quarter the window touches — Pipeline has done the same since #8. No dates ⇒ null ⇒ every job.
  function openJobIds() {
    return (gFrom() || gTo()) ? jobsWithOpeningIn(data, quarterInRange) : null;
  }

  // ===== Section 1: Positions (Department -> Job tree) =====
  // #127g (Jerin, 15 Sep 2026): the Open / Closed job Status tick-boxes are gone — they make no sense with the opening-first approach.
  // Both boxes ticked was the default and meant no filter, so no default number moves.

  function renderSection1() {
    const dateFrom = gFrom(), dateTo = gTo(), deptG = gDept();
    const jobSel = selJobs();
    const ob = data.openingBuckets || {};
    // #129: the window, the quarters it touches, and whether it covers them whole.
    const rg = hmRange(), winQs = windowQuarters(), wholeWin = coversQuarters(rg, winQs), dayOK = hasDayData(data);

    // Each DISTINCT opening is counted once, in the quarter it was opened, and
    // Total = Joined + Open + Missed. A role opened in Q2 therefore still counts
    // toward Q2 while it stays open — the old filter dropped it the moment the
    // report window moved past its opened date.
    const groups = {};
    Object.entries(ob).forEach(([job8, rec]) => {
      const dept = deptOf(rec.department || '') || 'Unknown';
      if (deptG && dept !== deptG) return;
      if (jobSel.length && !jobSel.includes(rec.title)) return;
      let t = 0, jn = 0, op = 0, ms = 0;
      const add = (b) => { t += b.total || 0; jn += b.joined || 0; op += b.open || 0; ms += b.missed || 0; };
      // #129: a window covering whole quarters adds those quarters; a narrower one adds the positions opened on its days (openingBuckets
      // .days, India time, the clock the quarters are cut from). A data file from before 15 Sep has no days, so a narrow window reads empty.
      if (wholeWin) Object.entries(rec.quarters || {}).forEach(([q, b]) => { if (winQs.includes(q)) add(b); });
      else if (dayOK) Object.entries(rec.days || {}).forEach(([d, b]) => { if (inRange(d, rg)) add(b); });
      if (!t && !jn && !op && !ms) return;
      if (!groups[dept]) groups[dept] = { dept, total: 0, joined: 0, open: 0, missed: 0, jpP: 0, drop: 0, jobs: [] };
      const G = groups[dept];
      G.total += t; G.joined += jn; G.open += op; G.missed += ms;
      G.jobs.push({ title: rec.title, total: t, joined: jn, open: op, missed: ms, jpP: 0, drop: 0 });
    });
    // ===== CANDIDATE-SIDE COLUMNS (people, not openings) — definition set by Jerin 2026-08-22 =====
    // Joining Pending = every candidate currently parked in Ref Check, Documentation or Offer.
    // ⚠ It is a LIVE count and CANNOT be quarter-scoped: openingQuarter is absent on 141 of the 166 cases,
    // so filing them by quarter would silently drop 85% of the people. Dropped CAN be scoped (attrQuarter
    // covers 92/92) and is, so these two columns sit on different time bases — the caption says so.
    // Rows are added for jobs that have people in closing but NO opening in the period: restricting to
    // openings showed 88 of 166 pending people and hid 45 of SME - India's 46.
    const inScope = (dept, title) => !(deptG && dept !== deptG) && !(jobSel.length && !jobSel.includes(title));
    function bump(dept, title, field) {
      if (!groups[dept]) groups[dept] = { dept, total: 0, joined: 0, open: 0, missed: 0, jpP: 0, drop: 0, jobs: [] };
      const G = groups[dept];
      G[field] += 1;
      let row = G.jobs.find(j => j.title === title);
      if (!row) { row = { title, total: 0, joined: 0, open: 0, missed: 0, jpP: 0, drop: 0 }; G.jobs.push(row); }
      row[field] += 1;
    }
    // ...MINUS anyone whose opening belongs to an EARLIER quarter (Jerin, 2026-08-22): their offer is last
    // quarter's demand still in flight, and counting it here would inflate the current quarter every time.
    // Only 25 of 166 cases carry an opening at all, so this can only judge those; the 141 unlinked stay in
    // because there is nothing to judge them by. Under Q3 2026 it removes the 2 sitting on Q2 openings.
    const fromQ = dateFrom ? quarterOf(dateFrom) : null;
    (data.joiningPendingCases || []).forEach(c => {
      const dept = deptOf(c.department || '') || 'Unknown', title = c.job || c.jobTitle || '(no job)';
      if (!inScope(dept, title)) return;
      if (c.openingQuarter && fromQ && fromQ !== '\u2014' && c.openingQuarter < fromQ) return;
      bump(dept, title, 'jpP');
    });
    dropRows(data).forEach(e => {
      if (!dropIn(e, rg, winQs)) return;   // #129: by the day they first reached Ref Check / Documentation / Offer
      const dept = deptOf(e.department || '') || 'Unknown', title = e.jobTitle || '(no job)';
      if (!inScope(dept, title)) return;
      bump(dept, title, 'drop');
    });

    const deptArr = Object.values(groups).sort((a, b) => a.dept.localeCompare(b.dept));

    const totals = { total: 0, joined: 0, open: 0, missed: 0, jpP: 0, drop: 0 };
    deptArr.forEach(t => { totals.total += t.total; totals.joined += t.joined; totals.open += t.open; totals.missed += t.missed; totals.jpP += t.jpP; totals.drop += t.drop; });

    document.getElementById('hm1Cards').innerHTML = `
      <div class="card"><div class="label">Total Positions</div><div class="value">${totals.total}</div><div class="sub">opened in this period</div></div>
      <div class="card"><div class="label">Joined</div><div class="value" style="color:var(--green)">${totals.joined}</div><div class="sub">moved to Hired</div></div>
      <div class="card"><div class="label">Open</div><div class="value" style="color:var(--blue)">${totals.open}</div><div class="sub">still to fill</div></div>
      <div class="card"><div class="label">Missed</div><div class="value" style="color:var(--red)">${totals.missed}</div><div class="sub">carried to next quarter</div></div>
      <div class="card"><div class="label">Joining Pending</div><div class="value" style="color:var(--orange)">${totals.jpP}</div><div class="sub">in Ref Check, Documentation or Offer \u00b7 live</div></div>
      <div class="card"><div class="label">Dropped</div><div class="value" style="color:var(--red)">${totals.drop}</div><div class="sub">${(totals.joined + totals.jpP + totals.drop) > 0 ? Math.round((totals.drop / (totals.joined + totals.jpP + totals.drop)) * 100) + '% of outcomes' : 'no outcomes yet'}</div></div>
    `;

    // #28 (Jerin, 2026-08-24): Delta = Total Openings − Joined − Joining Pending, and a NEGATIVE result
    // STANDS — the Math.max(0, …) clamp is gone deliberately, do not put it back.
    // ⚠ Total Openings counts POSITIONS; Joining Pending counts PEOPLE. Subtracting them mixes units on purpose:
    // ⚠ Say POSITIONS, never "seats", in anything the user reads (Jerin, 2026-08-24).
    // more people can be in closing than there are positions (US Business Q3: 19 positions, 6 joined, 23 in
    // closing → −10). That is a true signal about missing opening links, and it corrects itself as they
    // are fixed. The old formula (Open − seats-with-an-offer-out) gave the right number but its arithmetic
    // was invisible on screen, which is what made three JP figures disagree all week.
    const metrics = (v) => {
      const delta = v.total - v.joined - v.jpP;
      // #1 Option A (2026-08-22): the bar used to fill with COVERAGE while the bold number counted the GAP,
      // so a nearly-full-looking cell could sit beside a 7. Both now measure the same thing — the shortfall.
      const gapPct = v.total > 0 ? Math.max(0, Math.min(100, Math.round((delta / v.total) * 100))) : 0;
      const cap = delta > 0
        ? `${delta} of ${v.total} still to fill`
        : (delta < 0
          ? `${-delta} more people in closing than positions opened`
          : (v.total > 0 ? 'nothing outstanding' : '\u2014'));
      // Drop % denominator INCLUDES Dropped itself (Jerin, 2026-08-22): of everything that reached a
      // conclusion or is about to, what share fell out.
      const den = v.joined + v.jpP + v.drop;
      const dpct = den > 0 ? Math.round((v.drop / den) * 100) : null;
      const dropCell = v.drop
        ? `<span style="color:var(--red);font-weight:600">${v.drop}</span>`
          + (dpct !== null ? `<span class="sublab">${dpct}% of outcomes</span>` : '')
        : `<span class="zero">0</span>`;
      return `<td style="font-weight:600">${v.total}</td><td class="good">${v.joined}</td>`
        + `<td style="color:var(--orange)">${v.jpP || `<span class="zero">0</span>`}</td>`
        + `<td class="gapcell">${dropCell}</td>`
        + `<td class="gapcell"><span class="deltacell"><span class="track"><i style="width:${gapPct}%"></i></span>`
        + `<span class="dnum ${delta === 0 ? 'none' : (gapPct >= 50 ? 'high' : '')}">${delta}</span></span>`
        + `<span class="sublab">${cap}</span></td>`
        + `<td style="color:var(--red)">${v.missed}</td>`;
    };
    let html = '';
    deptArr.forEach((D, gi) => {
      const jobs2 = [...D.jobs].sort((a, b) => a.title.localeCompare(b.title));
      html += `<tr class="dept-header" data-g="${gi}" data-exp="0" style="cursor:pointer;background:var(--border-light)">
        <td style="font-weight:600">${CARET}${D.dept}${cnt(jobs2.length)}</td>${metrics(D)}</tr>`;
      jobs2.forEach(o => {
        html += `<tr class="leaf" data-g="${gi}" style="display:none">
          <td style="padding-left:1.875rem;font-weight:500;max-width:22.5rem">${o.title}</td>${metrics(o)}</tr>`;
      });
    });
    html += `<tr class="totals-row"><td>Total</td>${metrics(totals)}</tr>`;
    const body = document.getElementById('hm1Body');
    body.innerHTML = html;
    wireTree(body);

    // Chart: one bar per department, stacked Joined / Open / Missed — and each of those split again into
    // the ROLES inside the department, in shades of the metric colour (Jerin, 2026-08-29). Darkest band is
    // the department's biggest role for that metric, palest the smallest; past ten roles the tail is pooled
    // so nothing drops out of the bar.
    // The number for Joined / Open / Missed is kept, drawn ONCE PER METRIC across its bands rather than on
    // every band ("the data label for joined, open etc should be retained"). The role name is in the
    // tooltip. Every figure comes from deptArr, the same rows the table above renders.
    const cDepts = deptArr.map(t => t.dept).slice().reverse();
    if (hm1ChartInstance) hm1ChartInstance.destroy();
    const ctx1 = document.getElementById('hm1Chart');
    if (ctx1) {
      const h = hbarHeight(cDepts.length, 60, 220);
      const wrap = document.getElementById('hm1ChartWrap');
      if (wrap) wrap.style.height = h + 'px';
      ctx1.style.maxHeight = h + 'px';   // override .chart-wrap canvas { max-height:300px } so the canvas fills the wrap
      const METRICS = [
        { key: 'joined', label: 'Joined', color: '#398AA2' },
        { key: 'open', label: 'Open', color: '#4E6BA6' },
        { key: 'missed', label: 'Missed', color: '#b45a72' }   // pastel --red, not the pre-2026-08-09 crimson
      ];
      const byDept = {}; deptArr.forEach(D => { byDept[D.dept] = D; });
      const chartRows = cDepts.map(d => {
        const D = byDept[d] || { jobs: [] };
        const g = groups[d] || { joined: 0, open: 0, missed: 0 };
        return {
          label: d,
          sum: { joined: g.joined, open: g.open, missed: g.missed },
          jobs: (D.jobs || []).map(o => ({ title: o.title, v: { joined: o.joined, open: o.open, missed: o.missed } }))
        };
      });
      hm1ChartInstance = new Chart(ctx1, {
        type: 'bar',
        data: { labels: cDepts, datasets: roleBandDatasets(chartRows, METRICS) },
        options: {
          indexAxis: 'y', responsive: true, maintainAspectRatio: false,
          layout: { padding: { top: 4, right: 40 } },
          plugins: {
            valueLabels: false,   // the per-metric label below replaces it; one number per band would be noise
            legend: metricLegend(METRICS, { align: 'center', labels: { boxWidth: 11, boxHeight: 11, padding: 18, font: { size: 12 } } }),
            // Hovering any part of a section lists every role behind that whole section (Jerin, 2026-08-30).
            tooltip: roleSectionTooltip(METRICS, { totalLabel: 'Total positions' })
          },
          scales: {
            x: { stacked: true, beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 11 } }, title: { display: true, text: 'Positions', font: { size: 11 }, color: '#64748b' } },
            y: { stacked: true, grid: { display: false }, ticks: { font: { size: 12, weight: '500' }, padding: 6 } }
          }
        },
        plugins: [roleBandOverlay(METRICS)]
      });
    }
  }

  // ===== Section 2: Throughput (Department -> Job tree) =====
  // TP column keys -> stage keys used by the stage-history rollups.
  const TP_TO_STAGE = { app: 'appReview', hc: 'helloChristy', ta: 'taScreen', hm: 'hmReview', oa: 'oa', r1: 'r1', r2: 'r2', r3: 'r3', r4: 'r4', r5: 'r5', rc: 'refCheck', ds: 'docSub', offer: 'offer' };

  // Which quarters the current From/To window covers, taken from whatever the rollups hold.
  function quartersInWindow(from, to) {
    const byQ = (data.stageRollups && data.stageRollups.throughputByJobQ) || {};
    const seen = {};
    Object.keys(byQ).forEach(j => Object.keys(byQ[j] || {}).forEach(st => Object.keys(byQ[j][st] || {}).forEach(q => { seen[q] = 1; })));
    return Object.keys(seen).filter(q => quarterInRange(q, from, to));
  }

  // In/Out per stage for one job, summed over the quarters in the report window. Uses real
  // stage transitions (reached / cleared) instead of the lifetime pipeline snapshot, which
  // is what made this table ignore the period filter entirely.
  // ===== THE THROUGHPUT MEASURE (rebuilt 2026-08-30) =====
  // Prefers `assessedByJobQ` — A = someone actually looked at the candidate at that stage (an interview held
  // there, an assignment triggered there, or a feedback form with no interview behind it), B = of those, the
  // ones who then entered a LATER stage.
  // It replaces reached/cleared, where `cleared` only meant "no longer sitting in this stage" and so counted
  // a rejection exactly like a promotion — App Review read 99 → 99 = 100%. Falls back to the old fields when
  // the data file predates the rebuild, so an older cached file still renders rather than going blank.
  const assessedByJobQ = () => (data.stageRollups && data.stageRollups.assessedByJobQ) || null;
  const hasAssessed = () => !!assessedByJobQ();

  function throughputFor(j, quarters, periodSet) {
    // 🚨 #120 (14 Sep 2026): a period with NO rollup quarters (a future quarter, a range with no data) has no
    // throughput and must read empty. It fell through to the LIFETIME snapshot at the bottom, the bug #5 removed for
    // the older data shape, so Q4 2026 showed full all-time figures.
    if (periodSet && !quarters.length) {
      const out = {}; TP_KEYS.forEach(k => { out[k] = { i: 0, o: 0 }; });
      out.span = { i: 0, o: 0 }; out.overall = null;
      return out;
    }
    // #129: a window narrower than the quarters it touches adds up the DAY twins instead — assessed / progressed on the day of the
    // assessment, the span on the day of the first R1 or OA assessment. A rollups file from before 15 Sep has no days: the row reads empty.
    if (quarters.length && !coversQuarters(hmRange(), windowQuarters())) {
      const sr = data.stageRollups || {}, rg = hmRange();
      const asD = sr.assessedByJobD || null, spD = sr.assessedSpanByJobD || null;
      const out = {};
      TP_KEYS.forEach(k => { const s = asD ? sumDayFields((asD[j.id] || {})[TP_TO_STAGE[k]], rg) : {}; out[k] = { i: s.a || 0, o: s.b || 0 }; });
      const sp = spD ? sumDayFields(spD[j.id], rg) : {};
      out.span = { i: sp.a || 0, o: sp.b || 0 };
      out.overall = out.span.i > 0 ? out.span.o / out.span.i : null;
      return out;
    }
    const asJ = assessedByJobQ();
    if (asJ && quarters.length) {
      const st0 = asJ[j.id] || {};
      const out = {};
      TP_KEYS.forEach(k => {
        const st = st0[TP_TO_STAGE[k]] || {};
        let i = 0, o = 0;
        quarters.forEach(q => { const v = st[q]; if (v) { i += v.a || 0; o += v.b || 0; } });
        out[k] = { i: i, o: o };
      });
      // The headline span is its own per-candidate figure — assessed at R1 or OA, whichever came first,
      // through to Ref Check / Documentation / Offer, whichever they reached first. Never a ratio of two
      // stage counts: one person sits in several stages, so dividing one column by another double-counts.
      const sp = (data.stageRollups.assessedSpanByJobQ || {})[j.id] || {};
      let sa = 0, sb = 0;
      quarters.forEach(q => { const v = sp[q]; if (v) { sa += v.a || 0; sb += v.b || 0; } });
      out.span = { i: sa, o: sb };
      out.overall = sa > 0 ? sb / sa : null;
      return out;
    }
    const byQ = data.stageRollups && data.stageRollups.throughputByJobQ && data.stageRollups.throughputByJobQ[j.id];
    // 🚨 #5 (2026-08-22): when a PERIOD is selected, a job with no rollup entry for those quarters has NO
    // throughput in the period and must read zero. It used to fall back to computeThroughput(j.pipeline,
    // j.total) — the LIFETIME snapshot — which quietly poured all-time numbers into a quarter-scoped table:
    // Senior Manager, SEO showed 255 applications at 0% under a Q3 filter, and long-closed roles looked busy.
    // The lifetime fallback is only correct when no period is set at all.
    if (quarters.length) {
      const out = {};
      TP_KEYS.forEach(k => {
        const st = (byQ && byQ[TP_TO_STAGE[k]]) || {};
        let i = 0, o = 0;
        quarters.forEach(q => { const v = st[q]; if (v) { i += v.reached || 0; o += v.cleared || 0; } });
        out[k] = { i: i, o: o };
      });
      out.overall = out.r1.i > 0 ? out.ds.i / out.r1.i : null;
      return out;
    }
    return computeThroughput(j.pipeline, j.total);
  }

  function renderThroughput() {
    const deptG = gDept();
    const jobSel = selJobs();
    const hideEmpty = document.getElementById('hm2HideEmpty')?.checked;
    // #122 (15 Sep 2026): the Stages dropdown replaced a row of 13 tick-boxes. Nothing picked = every stage.
    const stSel = msHmTpStage ? msHmTpStage.getSelected() : [];
    const visStages = TP_KEYS.filter(k => !stSel.length || stSel.includes(TP_LABELS[k]));

    const quarters = quartersInWindow(gFrom(), gTo());
    const openIds = openJobIds();   // #125

    const filtered = jobs.filter(j => {
      if (deptG && j._dept !== deptG) return false;
      if (jobSel.length && !jobSel.includes(j.title)) return false;
      if (!j.pipeline) return false;
      if (openIds && !openIds.has(String(j.id).slice(0, 8))) return false;   // #125: an opening opened in From–To
      return true;
    }).sort(byDept);

    // #5 (2026-08-22): "Hide zero-pipeline" used to test j.total — the job's LIFETIME application count — so a
    // job with 308 applications ever and no activity at all in the selected quarter still rendered a full row
    // of zeros, and the department's job count was inflated to match. It now tests throughput IN THE SELECTED
    // PERIOD, which is what the checkbox claims and what the quarter selector implies.
    const withT = filtered.map(j => ({ j, t: throughputFor(j, quarters, !!(gFrom() || gTo())) }));
    const shown = hideEmpty
      ? withT.filter(({ t }) => TP_KEYS.some(k => (t[k].i > 0 || t[k].o > 0)))
      : withT;

    const groups = {};
    shown.forEach(({ j, t }) => {
      if (!groups[j._dept]) groups[j._dept] = [];
      groups[j._dept].push({ job: j, t });
    });

    function aggTP(list) {
      const acc = {}; TP_KEYS.forEach(k => acc[k] = { i: 0, o: 0 });
      acc.span = { i: 0, o: 0 };
      list.forEach(({ t }) => {
        TP_KEYS.forEach(k => { acc[k].i += t[k].i; acc[k].o += t[k].o; });
        if (t.span) { acc.span.i += t.span.i; acc.span.o += t.span.o; }
      });
      // 🚨 The overall figure is its OWN per-candidate span, summed across roles — never r1.i ÷ ds.i.
      // One person sits in several stages, so dividing one stage column by another counts them twice and
      // can read over 100%. Falls back to the old ratio only for a data file that predates the rebuild.
      acc.overall = acc.span.i > 0 ? acc.span.o / acc.span.i
        : (hasAssessed() ? null : (acc.r1.i > 0 ? acc.ds.i / acc.r1.i : null));
      return acc;
    }

    // ===== ONE section, both dimensions (#122, Jerin 15 Sep 2026 — option C1) =====
    // Department down the side, stage across the top, and each department opens into its JOB rows, drawn in their own colour (apricot since #136).
    // It replaces the squares-plus-table pair: the table repeated the squares' figures in a second colour code (shaded
    // by % passed where the squares shade by people lost), with its own key and no heading of its own.
    // 🚨 The stage cells must NEVER be added up. One person passing R1, R2 and R3 appears in all three, so a
    // total counts them three times. Each cell is comparable only to its own In, which is why the Overall
    // column exists and why it is a single span.
    // App Review stays in: under the old reached/cleared measure it read 100% and was dropped from the grid, and that
    // exclusion outlived the 30-Aug rebuild that made it a real figure (Rule 11).
    const heatHost = document.getElementById('hm2Heat');
    if (!heatHost) return;
    const A = hasAssessed();
    const toRow = (label, per) => ({
      label,
      cells: visStages.map(sk => (per[sk] && per[sk].i > 0) ? { inN: per[sk].i, outN: per[sk].o } : null),
      overall: per.span && per.span.i > 0 ? Math.round((per.span.o / per.span.i) * 100)
        : (A ? null : (per.r1.i > 0 ? Math.round((per.ds.i / per.r1.i) * 100) : null)),
      ovIn: per.span && per.span.i > 0 ? per.span.i : null,
      ovOut: per.span && per.span.i > 0 ? per.span.o : null,
      _vol: (per.span && per.span.i) || per.r1.i
    });
    const heatRows = Object.keys(groups).map(d => Object.assign(toRow(d, aggTP(groups[d])),
      { children: groups[d].map(({ job, t }) => toRow(job.title, aggTP([{ t }]))) }))
      .sort((x, y) => y._vol - x._vol);
    const allList = [];
    Object.values(groups).forEach(l => allList.push(...l));
    const hint = document.getElementById('hm2Hint');
    if (hint) hint.textContent = heatRows.length === 1
      ? `${heatRows[0].label} · ${heatRows[0].children.length} ${heatRows[0].children.length === 1 ? 'job' : 'jobs'}`
      : (heatRows.length ? 'Click a department to open its jobs' : '');
    // Ref Check / Documentation / Offer count candidates ADDED, not assessed — administrative stages
    // where nobody is interviewed. The pipeline marks them from stage entry; these are the columns.
    const addedCols = new Set();
    visStages.forEach((sk, i) => { if (TP_ADDED[sk]) addedCols.add(i); });
    const hiredCol = visStages.indexOf('offer');
    buildStageHeat(heatHost, document.getElementById('hm2HeatTip'), heatRows,
      visStages.map(sk => TP_LABELS[sk]), {
        addedCols, hiredCol,
        total: toRow('Total', aggTP(allList)),
        expandAll: !!document.getElementById('hmExpandAll')?.checked,
        overallLabel: A ? 'R1/OA → late' : 'R1 → Doc',
        labels: A ? undefined
          : { inN: 'entered the stage', outN: 'left the stage (any reason)', none: 'nobody entered this stage' }
      });
  }

  // ===== Panelists — the full Interviewer Efficiency panel, driven by THIS tab's filters =====
  // It used to be a two-column subset of the same panelists[] data, and one of those columns
  // (Avg Time for Feedback) is an ALL-TIME figure that sat unlabelled under a date filter.
  let ivRefresh = null;
  function renderPanelist() {
    const host = document.getElementById('hmPanelHost');
    if (!host) return;
    if (!ivRefresh) {
      host.innerHTML = renderInterviewer(data, { embedded: true });
      ivRefresh = initInterviewer(data, {
        filters: {
          year: () => document.getElementById('hmYear')?.value || '',
          quarter: () => document.getElementById('hmQuarter')?.value || '',
          depts: () => { const d = gDept(); return d ? [d] : []; },
          jobs: () => selJobs(),
          panelists: () => (msHmPanel ? msHmPanel.getSelected() : []),
          jobIds: () => openJobIds(),   // #125: only jobs with an opening opened in From–To
          range: () => ({ from: gFrom(), to: gTo() }),   // #120: Panelists follow From/To like every other panel here
          expandAll: () => !!document.getElementById('hmExpandAll')?.checked
        }
      }) || null;
    } else {
      ivRefresh();
    }
  }

  // ===== Joining Pending — Cases (candidate-level; pending pipeline data) =====
  // Global date/quarter filter intentionally NOT applied here (always show all pending joiners).
  // Local filters: Job title, DOJ Month, DOJ date range. Department still cascades.
  function renderJoiningPending() {
    const body = document.getElementById('hmJPBody');
    if (!body) return;
    const deptG = gDept();
    const jobSel = selJobs();
    const dojF = dojFilterOf('hm');   // #133: DOJ Month + DOJ From / To, in the filter row on this sub-tab

    // Deliberately BROAD: everyone currently in closing (Ref Check / Documentation / Offer),
    // with or without an opening linked. The unlinked ones show with a blank Opening Quarter
    // so they are easy to spot and fix — that is the point of the list.
    // Note this is a wider population than the "Joining Pending" metric, which counts only
    // the linked ones. The caption spells the difference out.
    // BROAD AGAIN (2026-08-22, Jerin's definition): Joining Pending is EVERY candidate parked in Ref Check,
    // Documentation or Offer, linked or not. It was narrowed to linked-only earlier that same day to make it
    // agree with the card above; the card has now been redefined to this same population instead, so the two
    // still match — but at 166 rather than 25. The Linked column marks the ones missing an opening.
    let list = (data.joiningPendingCases || []).map(c => ({
      ...c,
      // job/doj were renamed from jobTitle/startDate when the cases table went broad
      job: c.job || c.jobTitle || '',
      doj: c.doj || c.startDate || '',
      _dept: deptOf(c.department || '')
    }));
    list = list.filter(c => {
      if (deptG && c._dept !== deptG) return false;
      if (jobSel.length && !jobSel.includes(c.job)) return false;
      if (!inDojFilter(c.doj, dojF)) return false;
      return true;
    });

    const capEl = document.getElementById('hmJPCaption');
    if (capEl) {
      // Now the BROAD population, so the caption reports the whole count and calls out how many are
      // missing an opening link — that is a hygiene problem sitting inside a real joining number.
      const unlinkedShown = list.filter(c => !c.linked).length;
      capEl.innerHTML = list.length
        ? `<strong>${list.length}</strong> in closing${dojFilterText(dojF) ? ' ' + dojFilterText(dojF) : ''}, <strong>live</strong>.`
          + (unlinkedShown ? ` <strong>${unlinkedShown}</strong> have no opening attached.` : '')
        : '';
    }

    if (!list.length) {
      body.innerHTML = `<tr><td colspan="8" style="padding:1.5rem;text-align:center;color:var(--muted);font-size:0.75rem">Nobody is in Ref Check, Documentation or Offer for this filter.</td></tr>`;
      return;
    }
    // Newest opening quarter first, unlinked rows last (they have no quarter to sort on).
    list.sort((a, b) => {
      const qa = a.openingQuarter || '', qb = b.openingQuarter || '';
      if (qa !== qb) { if (!qa) return 1; if (!qb) return -1; return qa > qb ? -1 : 1; }
      return (a.candidate || '').localeCompare(b.candidate || '');
    });
    // #137: the cells come from people-cells.js — badges, dates and chips; the columns and the order above are unchanged.
    body.innerHTML = list.map(c => `<tr>${tdQuarter(c.openingQuarter)}${tdMonth(c.doj)}${tdDoj(c.doj, { live: true })}${tdDept(c._dept)}`
      + `${tdJob(c.job)}${tdCandidate(c.candidate)}${tdStage(c.subStage)}${tdRecruiter(c.recruiter)}</tr>`).join('');
  }

  // ===== #130c (Jerin, 15 Sep 2026): Joiners — one row per PERSON moved to Hired =====
  // The same test as every people-based Joined on the site (accepted offer AND moved to Hired), dated by START date inside From / To.
  // No earlier-quarter subtraction — like the Joining Pending list, it shows everyone and the Opening Quarter column says which is which.
  // 🚨 People, not positions: it will not equal the Joined column on Position Fulfilment, which counts positions filled (Rule 1).
  function renderJoiners() {
    const body = document.getElementById('hmJoinBody');
    if (!body) return;
    const deptG = gDept(), jobSel = selJobs(), rg = hmRange();
    const list = (data.offerEvents || [])
      .filter(e => e.accepted && e.appStatus === 'Hired' && inRange(e.startDate, rg))
      .map(e => ({ ...e, _dept: deptOf(e.department || '') }))
      .filter(e => !(deptG && e._dept !== deptG) && !(jobSel.length && !jobSel.includes(e.jobTitle)));
    const capEl = document.getElementById('hmJoinCaption');
    if (capEl) {
      const unlinked = list.filter(e => !e.openingQuarter).length;
      capEl.innerHTML = list.length
        ? `<strong>${list.length}</strong> joined, ${rangeText(rg, hmQuarters())}.` + (unlinked ? ` <strong>${unlinked}</strong> have no opening attached.` : '')
        : '';
    }
    if (!list.length) {
      body.innerHTML = `<tr><td colspan="7" style="padding:1.5rem;text-align:center;color:var(--muted);font-size:0.75rem">Nobody joined between these dates for this filter.</td></tr>`;
      return;
    }
    // Most recent joining date first.
    list.sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)) || String(a.candidate || '').localeCompare(String(b.candidate || '')));
    // #137: the cells come from people-cells.js; the pod colour and the earlier-quarter check use each person's own start date.
    body.innerHTML = list.map(e => `<tr>${tdQuarter(e.openingQuarter, e.startDate)}${tdMonth(e.startDate)}${tdDoj(e.startDate)}${tdDept(e._dept)}`
      + `${tdJob(e.jobTitle)}${tdCandidate(e.candidate)}${tdRecruiter(e.recruiter, e.startDate)}</tr>`).join('');
  }

  // ===== Section 3: Current Pipeline (Department -> Job tree) =====
  function renderPipeline() {
    const deptG = gDept();
    const jobSel = selJobs();
    const hideEmpty = document.getElementById('hm3HideEmpty')?.checked;
    // #128: nothing picked in the Stages dropdown = every stage, as on Throughput.
    const stPick = msHmPipeStage ? msHmPipeStage.getSelected() : [];
    const visStages = STAGES_ORDER.filter(k => !stPick.length || stPick.includes(STAGE_LABELS[k]));

    // #8 (2026-08-22): the row list was every job that had ever existed, so roles whose opening closed
    // quarters ago kept appearing. The COUNTS here stay live — this panel is a snapshot of where people stand
    // today and must not be date-filtered — but the JOB LIST is now limited to roles with an opening in the
    // selected period. #9: "Hide zero-pipeline" also tested j.total (LIFETIME applications) rather than who is
    // actually standing in the visible stages right now, which is what this table shows.
    const openTitles = new Set();
    Object.values(data.openingBuckets || {}).forEach(rec => {
      Object.keys(rec.quarters || {}).forEach(q => {
        if (quarterInRange(q, gFrom(), gTo())) openTitles.add(rec.title);
      });
    });
    const filtered = jobs.filter(j => {
      if (deptG && j._dept !== deptG) return false;
      if (jobSel.length && !jobSel.includes(j.title)) return false;
      if (!j.pipeline) return false;
      // #120: with a period set, a job needs an opening in it. An EMPTY set used to mean "list every job".
      if ((gFrom() || gTo()) && !openTitles.has(j.title)) return false;
      if (hideEmpty && !visStages.some(k => (j.pipeline[k] || 0) > 0)) return false;
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
          <td style="font-weight:500;max-width:18.75rem;padding-left:1.875rem">${j.title}</td>${pipeCells(j.total, j.pipeline)}</tr>`;
      });
    });
    html += `<tr class="totals-row"><td>Total</td>${pipeCells(grandTotal, stageTotalsAll)}</tr>`;
    const hm3Body = document.getElementById('hm3Body');
    hm3Body.innerHTML = html;
    wireTree(hm3Body);
    shadePipeline(hm3Body);   // #137c
  }

  // ===== Sub-tab switching =====
  // Charts are built only when their panel is visible (Chart.js needs real dimensions),
  // so we (re)render the active panel on tab switch and on any global filter change.
  let activeTab = 'positions';
  function renderActive() {
    if (activeTab === 'positions') renderSection1();
    else if (activeTab === 'joiningpending') renderJoiningPending();   // #130b
    else if (activeTab === 'joiners') renderJoiners();                 // #130c
    else if (activeTab === 'throughput') renderThroughput();
    else if (activeTab === 'pipeline') renderPipeline();
    else if (activeTab === 'panelists') renderPanelist();
  }
  function showTab(name) {
    activeTab = name;
    // #133: Joining Pending is live, so the period boxes give way to the DOJ boxes there. Expand all opens department trees, so it hides over
    // the two flat people lists, where it would move nothing (Rule 13).
    toggleJpFilters('hm', document.getElementById('hmPeriod'), name === 'joiningpending');
    showControl(document.getElementById('hmExpandWrap'), name !== 'joiningpending' && name !== 'joiners');
    document.querySelectorAll('.hm-subtab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.hm-panel').forEach(p => { p.style.display = p.dataset.panel === name ? '' : 'none'; });
    renderActive();
  }
  document.querySelectorAll('.hm-subtab').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));

  // Global filter listeners — re-render the active panel (others refresh when next shown)
  document.getElementById('hmDept')?.addEventListener('change', renderActive);
  document.getElementById('hmDateFrom')?.addEventListener('change', renderActive);
  document.getElementById('hmDateTo')?.addEventListener('change', renderActive);
  document.getElementById('hmYear')?.addEventListener('change', () => { fillQuarterSelect(document.getElementById('hmQuarter'), document.getElementById('hmYear').value, true); applyYearQuarter(); renderActive(); });   // #127c: only the year's quarters on offer
  document.getElementById('hmQuarter')?.addEventListener('change', () => { applyYearQuarter(); renderActive(); });
  document.getElementById('hmExpandAll')?.addEventListener('change', renderActive);

  // ONE Job multi-select in the main filter bar, wired to renderActive so it reaches every sub-tab.
  msHmJob = makeMultiSelect(document.getElementById('msHmJob'), 'Job', jobTitles, renderActive);
  // Panelist names are the long tail here (hundreds of rows) — the shared multi-select gives
  // type-to-filter so nobody has to scroll to find a person.
  const panelistNames = [...new Set((data.panelists || []).map(p => p.name || p.panelist).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  msHmPanel = makeMultiSelect(document.getElementById('msHmPanel'), 'Panelist', panelistNames, renderPanelist);
  document.addEventListener('click', closeMsPanels);
  // #133: the DOJ boxes in the filter row (shown on the Joining Pending sub-tab only)
  ['hmDojMonth', 'hmDojFrom', 'hmDojTo'].forEach(id => document.getElementById(id)?.addEventListener('change', renderJoiningPending));
  // Throughput-local listeners — #122: a Stages dropdown (nothing picked = all 13) replaced the row of tick-boxes.
  msHmTpStage = makeMultiSelect(document.getElementById('msHmTpStage'), 'Stages', TP_KEYS.map(k => TP_LABELS[k]), renderThroughput);
  document.getElementById('hm2HideEmpty')?.addEventListener('change', renderThroughput);
  // Pipeline-local listeners
  document.getElementById('hm3HideEmpty')?.addEventListener('change', renderPipeline);
  msHmPipeStage = makeMultiSelect(document.getElementById('msHmPipeStage'), 'Stages', STAGES_ORDER.map(k => STAGE_LABELS[k]), renderPipeline);   // #128

  // Default the period to the CURRENT year + quarter — #127d: the newest on offer, so Q4 is picked by itself from 1 Oct.
  keepDatesInBounds(document.getElementById('hmDateFrom'), document.getElementById('hmDateTo'));   // #127b
  selectCurrentQuarter(document.getElementById('hmYear'), document.getElementById('hmQuarter'), true);
  applyYearQuarter();

  showTab('positions');
}
