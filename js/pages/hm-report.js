import { getData } from '../data.js';
import { renderInterviewer, initInterviewer } from './interviewer.js';
import { defsBlock } from '../definitions.js';
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

// Administrative stages: candidates ADDED, not assessed (Jerin, 2026-08-31).
const TP_ADDED = { refCheck: 1, docSub: 1, offer: 1 };

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
  const years = [...new Set((data.openings || []).map(o => (o.openedAt || '').slice(0, 4)).filter(Boolean))].sort().reverse();
  // #12 (2026-08-23): built straight off case order, so the list came out unsorted — Sep, Aug, Jul, May, Jun,
  // Mar... Sort on the raw YYYY-MM (which sorts correctly as a string) and format only at the end; sorting the
  // formatted "Aug 2026" labels would order them alphabetically, which is worse.
  const jpMonths = [...new Set((data.joiningPendingCases || [])
    .map(c => String(c.doj || c.startDate || '').slice(0, 7))
    .filter(m => m.length === 7))]
    .sort().reverse()
    .map(m => monthOf(m));

  return `
    <style>
      .hm-filters select, .hm-filters input[type=date] {
        appearance:none; -webkit-appearance:none;
        height:28px; padding:0 30px 0 11px; border:1px solid var(--border); border-radius:8px;
        font-size:12px; font-weight:500; background:var(--card); color:var(--text); cursor:pointer;
      }
      .hm-filters input[type=date] { padding-right:11px; }
      .hm-filters select {
        background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%2364748b' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
        background-repeat:no-repeat; background-position:right 11px center;
      }
      .hm-filters select:hover, .hm-filters input[type=date]:hover { border-color:var(--muted); }
      .hm-filters select:focus, .hm-filters input[type=date]:focus { outline:none; border-color:var(--accent); box-shadow:0 0 0 3px rgba(78,107,166,0.16); }
      .hm-filters .fchip { display:flex; align-items:center; gap:7px; }
      /* .hm-filters label styling lives in style.css — quiet, sentence case */
      .hm-filters .fchip > label.opt { font-size:12px; font-weight:500; display:flex; align-items:center; gap:4px; cursor:pointer; }
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
      .hm-report .hm-summary { width:100%; min-width:1100px; table-layout:fixed; }
      .hm-report .hm-summary th:first-child, .hm-report .hm-summary td:first-child { text-align:left; width:260px; }
      .hm-report .hm-summary th:not(:first-child), .hm-report .hm-summary td:not(:first-child) {
        text-align:right; width:130px; white-space:nowrap; font-variant-numeric:tabular-nums; }
      /* Delta is the 5th column and holds the progress bar, so it needs more room than a bare number. */
      .hm-report .hm-summary th:nth-child(5), .hm-report .hm-summary td:nth-child(5) { width:150px; }   /* Dropped + % caption */
      .hm-report .hm-summary th:nth-child(6), .hm-report .hm-summary td:nth-child(6) { width:180px; }   /* Delta: track + number + caption */

      /* tidy, evenly spaced stage checkbox strip */
      .hm-stages { display:flex; flex-wrap:wrap; align-items:center; gap:8px 16px; margin:2px 0 14px; }
      .hm-stages > label.stage-toggle { margin-left:auto; color:var(--muted); }
      .hm-stages > span.lbl { font-size:11px; color:var(--muted); }
      .hm-stages label { font-size:11px; display:flex; align-items:center; gap:5px; cursor:pointer; }
    </style>

    <div class="hm-report">
    <!-- ===== GLOBAL PAGE FILTERS ===== -->
    <div class="hm-subtabs subtab-band">
      <button class="hm-subtab subtab-chip active" data-tab="positions">Positions</button>
      <button class="hm-subtab subtab-chip" data-tab="throughput">Throughput</button>
      <button class="hm-subtab subtab-chip" data-tab="pipeline">Pipeline</button>
      <button class="hm-subtab subtab-chip" data-tab="panelists">Panelists</button>
    </div>

    <!-- ===== SUB-TAB STRIP ===== -->
    <div class="hm-filters">
      <div class="fchip"><span class="lbl">Department</span><select id="hmDept" style="min-width:170px"><option value="">All Departments</option>${allDepts.map(d => `<option value="${d}">${d}</option>`).join('')}</select></div>
      <span class="fdiv"></span>
      <div class="fchip"><div class="ms" id="msHmJob"></div></div>
      <div class="fchip"><span class="lbl">Status</span>
        <label class="opt"><input type="checkbox" class="hm1Status" value="Open" checked> Open</label>
        <label class="opt"><input type="checkbox" class="hm1Status" value="Closed" checked> Closed</label>
      </div>
      <span class="fdiv"></span>
      <div class="fchip"><span class="lbl">From</span><input type="date" id="hmDateFrom"></div>
      <div class="fchip"><span class="lbl">To</span><input type="date" id="hmDateTo"></div>
      
      
      <label class="opt" style="margin-left:auto;font-size:12px;font-weight:500;display:flex;align-items:center;gap:5px;cursor:pointer;color:var(--accent)"><input type="checkbox" id="hmExpandAll" checked> Expand all</label>
    <span class="period"><div class="fchip"><span class="lbl">Year</span><select id="hmYear"><option value="">All</option>${years.map(y => `<option value="${y}">${y}</option>`).join('')}</select></div><div class="fchip"><span class="lbl">Quarter</span><select id="hmQuarter"><option value="">All</option><option value="Q1">Q1</option><option value="Q2">Q2</option><option value="Q3">Q3</option><option value="Q4">Q4</option></select></div></span></div>

    <!-- ===== PANEL: POSITIONS ===== -->
    <div class="hm-panel" data-panel="positions">
      ${defsBlock('hm-positions')}
      <div class="cards" id="hm1Cards"></div>

      <h3 class="subsection-title">Positions by department</h3>
      <div class="chart-wrap" id="hm1ChartWrap" style="height:340px"><canvas id="hm1Chart"></canvas></div>

      <h3 class="subsection-title">Department Summary</h3>
      <p class="sub-note">Click a department to see its roles.</p>
      <div class="scroll-table"><table class="hm-summary">
        <thead><tr><th>Department</th><th>Total Openings</th><th>Joined</th><th>Joining Pending</th><th>Dropped</th><th>Delta</th><th>Missed</th></tr></thead>
        <tbody id="hm1Body"></tbody>
      </table></div>

      <h3 class="subsection-title">Joining Pending — Cases</h3>
      <div class="filter-bar">
        <select id="hmJPMonth"><option value="">All DOJ Months</option>${jpMonths.map(m => `<option value="${m}">${m}</option>`).join('')}</select>
        <span style="font-size:11px;color:var(--muted)">DOJ</span>
        <input type="date" id="hmJPFrom" title="DOJ from">
        <span style="font-size:11px;color:var(--muted)">to</span>
        <input type="date" id="hmJPTo" title="DOJ to">
      </div>
      <p class="sub-note" id="hmJPCaption" style="margin-bottom:8px"></p>
      <div class="scroll-table"><table>
        <thead><tr><th>Opening Quarter</th><th>Month</th><th>DOJ</th><th>Department</th><th>Job</th><th>Candidate</th><th>Sub-Stage</th><th>Recruiter</th></tr></thead>
        <tbody id="hmJPBody"></tbody>
      </table></div>
    </div>

    <!-- ===== PANEL: THROUGHPUT ===== -->
    <div class="hm-panel" data-panel="throughput" style="display:none">
      ${defsBlock('hm-throughput')}
      <h3 class="subsection-title">Throughput — department by stage</h3>
      <div class="sheat-wrap"><div id="hm2Heat" class="sheat"></div><div id="hm2HeatTip" class="sheat-tip"></div></div>

      <p class="sub-note">Click a department to drill in.</p>
      <div class="hm-stages">
        <span class="lbl">Stages:</span>
        ${TP_KEYS.map(k => `<label><input type="checkbox" class="hm2Stage" value="${k}" checked> ${TP_LABELS[k]}</label>`).join('\n        ')}
        <label class="stage-toggle"><input type="checkbox" id="hm2HideEmpty" checked> Hide zero-pipeline</label>
      </div>
      <div class="scroll-table"><table id="hm2Table">
        <thead id="hm2Head"></thead>
        <tbody id="hm2Body"></tbody>
      </table></div>
      <div class="heat-legend" id="hm2Legend"></div>
    </div>

    <!-- ===== PANEL: PIPELINE ===== -->
    <div class="hm-panel" data-panel="pipeline" style="display:none">
      ${defsBlock('hm-pipeline')}
      <p class="sub-note" style="color:var(--orange)"><strong>Live</strong> — each job's counts show where candidates stand today, not in the selected period. The period decides which <em>jobs</em> are listed, so the department and total rows do move with it. Click a department to drill in.</p>
      <div class="hm-stages">
        <span class="lbl">Stages:</span>
        ${STAGES_ORDER.map(k => `<label><input type="checkbox" class="hm3Stage" value="${k}" checked> ${STAGE_LABELS[k]}</label>`).join('\n        ')}
        <label class="stage-toggle"><input type="checkbox" id="hm3HideEmpty" checked> Hide zero-pipeline</label>
      </div>
      <div class="scroll-table"><table id="hm3Table">
        <thead id="hm3Head"></thead>
        <tbody id="hm3Body"></tbody>
      </table></div>
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
                 level: e.level, complexity: e.complexity, quarter: e.attrQuarter, source: 'offer' }));
}

let hm1ChartInstance = null;

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
  let msHmJob = null, msHmPanel = null;
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

  // A quarter counts as inside the report window when the quarter itself starts inside it.
  // The Year/Quarter presets set From/To to exact quarter or year boundaries, so this picks
  // out precisely the quarters the user asked for.
  function quarterInRange(q, from, to) {
    if (!q) return false;
    const y = parseInt(q.slice(0, 4), 10);
    const qi = parseInt(q.slice(6), 10);
    if (!y || !qi) return false;
    const start = `${y}-${String((qi - 1) * 3 + 1).padStart(2, '0')}-01`;
    if (from && start < from) return false;
    if (to && start > to) return false;
    return true;
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
    const jobSel = selJobs();
    const ob = data.openingBuckets || {};

    // Each DISTINCT opening is counted once, in the quarter it was opened, and
    // Total = Joined + Open + Missed. A role opened in Q2 therefore still counts
    // toward Q2 while it stays open — the old filter dropped it the moment the
    // report window moved past its opened date.
    const groups = {};
    Object.entries(ob).forEach(([job8, rec]) => {
      const dept = deptOf(rec.department || '') || 'Unknown';
      if (deptG && dept !== deptG) return;
      if (statuses.length > 0 && statuses.indexOf(rec.status || 'Open') === -1) return;
      if (jobSel.length && !jobSel.includes(rec.title)) return;
      let t = 0, jn = 0, op = 0, ms = 0;
      Object.entries(rec.quarters || {}).forEach(([q, b]) => {
        if (!quarterInRange(q, dateFrom, dateTo)) return;
        t += b.total || 0; jn += b.joined || 0; op += b.open || 0; ms += b.missed || 0;
      });
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
      if (!quarterInRange(e.quarter, dateFrom, dateTo)) return;
      const dept = deptOf(e.department || '') || 'Unknown', title = e.jobTitle || '(no job)';
      if (!inScope(dept, title)) return;
      bump(dept, title, 'drop');
    });

    const deptArr = Object.values(groups).sort((a, b) => a.dept.localeCompare(b.dept));

    const totals = { total: 0, joined: 0, open: 0, missed: 0, jpP: 0, drop: 0 };
    deptArr.forEach(t => { totals.total += t.total; totals.joined += t.joined; totals.open += t.open; totals.missed += t.missed; totals.jpP += t.jpP; totals.drop += t.drop; });

    document.getElementById('hm1Cards').innerHTML = `
      <div class="card"><div class="label">Total Positions</div><div class="value">${totals.total}</div><div class="sub">opened in this period</div></div>
      <div class="card"><div class="label">Joined</div><div class="value" style="color:var(--green)">${totals.joined}</div><div class="sub">closed as hired</div></div>
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
          <td style="padding-left:30px;font-weight:500;max-width:360px">${o.title}</td>${metrics(o)}</tr>`;
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

  function throughputFor(j, quarters) {
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
    const visStages = [];
    document.querySelectorAll('.hm2Stage').forEach(cb => { if (cb.checked) visStages.push(cb.value); });

    const quarters = quartersInWindow(gFrom(), gTo());

    const filtered = jobs.filter(j => {
      if (deptG && j._dept !== deptG) return false;
      if (jobSel.length && !jobSel.includes(j.title)) return false;
      if (!j.pipeline) return false;
      return true;
    }).sort(byDept);

    // #5 (2026-08-22): "Hide zero-pipeline" used to test j.total — the job's LIFETIME application count — so a
    // job with 308 applications ever and no activity at all in the selected quarter still rendered a full row
    // of zeros, and the department's job count was inflated to match. It now tests throughput IN THE SELECTED
    // PERIOD, which is what the checkbox claims and what the quarter selector implies.
    const withT = filtered.map(j => ({ j, t: throughputFor(j, quarters) }));
    const shown = hideEmpty
      ? withT.filter(({ t }) => TP_KEYS.some(k => (t[k].i > 0 || t[k].o > 0)))
      : withT;

    // #10 Option A (2026-08-22): one cell per stage instead of an In / Out / % triple. Twelve stages used to
    // mean thirty-six numeric columns scrolling sideways, every one weighted the same, so nothing said where
    // the pipeline was actually leaking. Now the NUMBER is how many entered and the SHADE is how many got
    // through, which makes a weak stage visible without reading a digit.
    let row1 = '<tr><th>Department</th>';
    visStages.forEach(s => { row1 += `<th class="stage-hdr">${TP_LABELS[s]}</th>`; });
    row1 += '<th class="stage-hdr" style="background:#e0e7ff">Overall<br>' + (hasAssessed() ? 'R1/OA→Late' : 'R1→Doc') + '</th></tr>';
    document.getElementById('hm2Head').innerHTML = row1;

    const tpTotals = {};
    TP_KEYS.forEach(k => { tpTotals[k] = { i: 0, o: 0 }; });
    const groups = {};
    shown.forEach(({ j, t }) => {
      TP_KEYS.forEach(k => { tpTotals[k].i += t[k].i; tpTotals[k].o += t[k].o; });
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
    function tpCells(per) {
      let s = '';
      const A = hasAssessed();
      visStages.forEach(sk => {
        const c = per[sk];
        // A stage nobody reached is NOT a zero — Hello Christy and HM Review carry very little traffic, and
        // a role can skip a round entirely. Saying so beats printing 0 / 0 / — which reads as missing data.
        if (!c || c.i === 0) { s += `<td class="heat none" title="${TP_ADDED[sk] ? 'nobody was added to this stage' : (A ? 'nobody was assessed at this stage' : 'no candidates entered this stage')}">—</td>`; return; }
        // Offer is the end of the ladder — there is no later stage to progress to, so it carries a count
        // and no rate rather than a 0% that reads as everyone falling out.
        const pct = Math.round((c.o / c.i) * 100);
        const band = pct < 50 ? 'lo' : (pct < 70 ? 'mid' : 'hi');
        // The cell carries the SAME two figures as the grid square above it — "145 → 98" over "68%"
        // (Jerin, 2026-08-31). It used to print the assessed count alone, so the table and the grid
        // disagreed on what a cell was, and the table's own Overall column already showed the flow.
        const verb = TP_ADDED[sk] ? 'added' : (A ? 'assessed' : 'entered');
        s += `<td class="heat ${band}" title="${c.i} ${verb}, ${c.o} ${A ? 'progressed' : 'moved past'}">`
          + `<span class="hv">${c.i} \u2192 ${c.o}</span><span class="hp">${pct}%</span></td>`;
      });
      const ov = per.overall != null ? (per.overall * 100).toFixed(1) + '%' : '—';
      // The span column shows its own two numbers as well, so the rate is never a bare percentage.
      const ovFlow = (per.span && per.span.i > 0) ? `<span class="hv">${per.span.i} → ${per.span.o}</span>` : '';
      s += `<td class="stage-cell" style="background:#f0f0ff">${ovFlow}<span class="hp ${pctClass(ov)}">${ov}</span></td>`;
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
    const legEl = document.getElementById('hm2Legend');
    if (legEl) legEl.innerHTML =
      `<span><i class="sw lo"></i>under 50% ${hasAssessed() ? 'progressed' : 'moved past'}</span>`
      + '<span><i class="sw mid"></i>50–70%</span>'
      + '<span><i class="sw hi"></i>over 70%</span>'
      + `<span><i class="sw none"></i>${hasAssessed() ? 'nobody assessed here' : 'stage not used'}</span>`
      + `<span class="leg-note">Number = candidates ${hasAssessed() ? 'assessed at that stage' : 'who entered the stage'}.</span>`;

    // ===== ONE chart, both dimensions (Jerin, 2026-08-30) =====
    // Replaces two org-wide charts — a per-stage In/Out column chart and a pipeline funnel — neither of
    // which showed a department. First attempt was a single R1 → Documentation dumbbell; Jerin: "not enough
    // dude, need stage wise throughput visualised too". So: department down the side, stage across the top,
    // the throughput percentage in every cell, and the R1 → Documentation span as the final column.
    //
    // 🚨 The stage cells must NEVER be added up. One person passing R1, R2 and R3 appears in all three, so a
    // total counts them three times — the same units trap as the throughput dedupe. Each cell is comparable
    // only to its own In, which is why the Overall column exists and why it is a single span.
    // It reads the same aggregates the table below renders, so the two agree by construction.
    const heatHost = document.getElementById('hm2Heat');
    if (heatHost) {
      const A = hasAssessed();
      // App Review used to be excluded here: under the OLD reached/cleared measure it read 99 → 99 = 100%
      // (leaving a stage counted as passing it), so plotting it was noise. The 30-Aug rebuild made it a
      // real figure — 65 assessed → 51 progressed — and the TABLE below shows it, as does the Stages
      // checkbox. The exclusion survived the rebuild and silently dropped a ticked stage from the grid.
      const stageCols = visStages.slice();
      const heatRows = Object.keys(groups).map(d => {
        const per = aggTP(groups[d]);
        return {
          label: d,
          cells: stageCols.map(sk => (per[sk] && per[sk].i > 0)
            ? { inN: per[sk].i, outN: per[sk].o } : null),
          overall: per.span && per.span.i > 0 ? Math.round((per.span.o / per.span.i) * 100)
            : (hasAssessed() ? null : (per.r1.i > 0 ? Math.round((per.ds.i / per.r1.i) * 100) : null)),
          ovIn: per.span && per.span.i > 0 ? per.span.i : null,
          ovOut: per.span && per.span.i > 0 ? per.span.o : null,
          _vol: (per.span && per.span.i) || per.r1.i
        };
      }).sort((x, y) => y._vol - x._vol);
      // Ref Check / Documentation / Offer count candidates ADDED, not assessed — administrative stages
      // where nobody is interviewed. The pipeline marks them from stage entry; these are the columns.
      const addedCols = new Set();
      stageCols.forEach((sk, i) => { if (TP_ADDED[sk]) addedCols.add(i); });
    const hiredCol = stageCols.indexOf('offer');
      buildStageHeat(heatHost, document.getElementById('hm2HeatTip'), heatRows,
        stageCols.map(sk => TP_LABELS[sk]), {
          addedCols, hiredCol,
          overallLabel: hasAssessed() ? 'R1/OA → LATE' : 'R1 → DOC',
          labels: hasAssessed() ? undefined
            : { inN: 'entered the stage', outN: 'left the stage (any reason)', none: 'nobody entered this stage' }
        });
    }
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
          panelists: () => (msHmPanel ? msHmPanel.getSelected() : [])
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
    const monthF = document.getElementById('hmJPMonth')?.value || '';
    const dojFrom = document.getElementById('hmJPFrom')?.value || '';
    const dojTo = document.getElementById('hmJPTo')?.value || '';

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
      if (monthF && monthOf(c.doj) !== monthF) return false;
      if (dojFrom && (c.doj || '') < dojFrom) return false;
      if (dojTo && (c.doj || '') > dojTo) return false;
      return true;
    });

    const capEl = document.getElementById('hmJPCaption');
    if (capEl) {
      // Now the BROAD population, so the caption reports the whole count and calls out how many are
      // missing an opening link — that is a hygiene problem sitting inside a real joining number.
      const unlinkedShown = list.filter(c => !c.linked).length;
      capEl.innerHTML = list.length
        ? `<strong>${list.length}</strong> in closing, <strong>live</strong> \u2014 the page date filter does not apply.`
          + (unlinkedShown ? ` <strong>${unlinkedShown}</strong> have no opening attached (Data Hygiene \u2192 Offers Missing Opening Link).` : '')
        : '';
    }

    if (!list.length) {
      body.innerHTML = `<tr><td colspan="8" style="padding:24px;text-align:center;color:var(--muted);font-size:12px">Nobody with an opening attached is in Ref Check, Documentation or Offer for this filter. Unlinked cases appear in Data Hygiene.</td></tr>`;
      return;
    }
    // Newest opening quarter first, unlinked rows last (they have no quarter to sort on).
    list.sort((a, b) => {
      const qa = a.openingQuarter || '', qb = b.openingQuarter || '';
      if (qa !== qb) { if (!qa) return 1; if (!qb) return -1; return qa > qb ? -1 : 1; }
      return (a.candidate || '').localeCompare(b.candidate || '');
    });
    body.innerHTML = list.map(c => `<tr>
      <td>${c.openingQuarter || '<span style="color:var(--red);font-size:11px">Not linked</span>'}</td>
      <td>${monthOf(c.doj) !== '\u2014' ? monthOf(c.doj) : (c.month || '\u2014')}</td>
      <td>${c.doj || '—'}</td>
      <td style="font-weight:500">${c._dept || ''}</td>
      <td style="max-width:280px">${c.job || ''}</td>
      <td style="font-weight:500">${c.candidate || ''}</td>
      <td>${c.subStage || '—'}</td>
      <td>${c.recruiter || '—'}</td>
    </tr>`).join('');
  }

  // ===== Section 3: Current Pipeline (Department -> Job tree) =====
  function renderPipeline() {
    const deptG = gDept();
    const jobSel = selJobs();
    const hideEmpty = document.getElementById('hm3HideEmpty')?.checked;
    const visStages = [];
    document.querySelectorAll('.hm3Stage').forEach(cb => { if (cb.checked) visStages.push(cb.value); });

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
      if (openTitles.size && !openTitles.has(j.title)) return false;
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

  // ONE Job multi-select in the main filter bar, wired to renderActive so it reaches every sub-tab.
  msHmJob = makeMultiSelect(document.getElementById('msHmJob'), 'Job', jobTitles, renderActive);
  // Panelist names are the long tail here (hundreds of rows) — the shared multi-select gives
  // type-to-filter so nobody has to scroll to find a person.
  const panelistNames = [...new Set((data.panelists || []).map(p => p.name || p.panelist).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  msHmPanel = makeMultiSelect(document.getElementById('msHmPanel'), 'Panelist', panelistNames, renderPanelist);
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
  // Default the period to the CURRENT quarter, matching Recruiter and Overall Efficiency.
  // Landing on "All"/full-year mixed finished quarters with the one in progress, which is not the view
  // anyone actually wants first — the live quarter is what gets worked on.
  // applyYearQuarter() returns early when both are blank, so the dates would have stayed empty.
  const hmY = document.getElementById('hmYear'), hmQ = document.getElementById('hmQuarter');
  if (hmY) { const nowY = String(new Date().getFullYear()); if ([...hmY.options].some(o => o.value === nowY)) hmY.value = nowY; }
  if (hmQ) hmQ.value = 'Q' + (Math.floor(new Date().getMonth() / 3) + 1);
  applyYearQuarter();

  showTab('positions');
}
