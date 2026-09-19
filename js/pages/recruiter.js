import { podOf, POD_OPTIONS, isSalesPod, capacityOf, capacityIsSet, currentQuarter, qKey } from '../recruiter-pods.js';
import { uiPx } from '../ui-scale.js';   // #140: canvas text + pixel constants
import { defsBlock, HYGIENE_LISTS } from '../definitions.js';
import { tdCandidate, tdDept, tdJob, tdQuarter, tdMonth, tdDoj, tdStage, avatar, countTag } from '../people-cells.js';   // #137
import { shadeMomentum, shadeTis, shareBars, colorShareBars } from '../grid-shade.js';   // #137c
import { scoreForRole, familyForJob, creditSplit } from '../score-model.js';
import { userTypeOf, sourcerOnlyNames, recruiterInQuarter, getRecruiterDates } from '../metric-config.js';   // #111: dates
import { scopeData, scopeToOpenings, jobsWithOpeningIn } from '../data.js';   // #120a: the Job filter narrows every number · #125
import { TIS_STAGES, poolHists, tisCell, periodQuarters, hasQuarterTis, tisHist, APP_REVIEW_LIVE_NOTE,
         hasWaitSplit, tisPair, tisPairRange, poolPairs, tisCellSplit } from '../stage-time.js';
import { REPORTING_START, reportingYears, selectionQuarters, periodText, fillQuarterSelect, selectCurrentQuarter, setDateBounds, keepDatesInBounds,
         rangeOf, inRange, rangeText, coversQuarters, quarterDays, quarterDaysIn, quarterOfDay, sumDayFields, hasDayData,
         dojFilterHtml, dojFilterOf, inDojFilter, dojFilterText, toggleJpFilters, showControl } from '../period.js';   // #127 · #129 · #133
import { HBAR, hbarHeight, CONV_PAD, drawConvColumn, roleBandDatasets, roleBandOverlay, metricLegend,
         darken, SEP_DARKEN, buildDumbbell, roleSectionTooltip, buildDayHeat } from '../chart-style.js';

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
  return e.day ? inRange(e.day, rg) : (coversQuarters(rg, qs) && qs.includes(e.quarter));
}


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
const CARET = '<span class="caret" style="display:inline-block;width:0.875rem;color:var(--muted)">▸</span>';
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
  if (document.getElementById('recExpandAll')?.checked) {
    tbody.querySelectorAll('tr.pod-header').forEach(h => {
      h.dataset.exp = '1';
      const c = h.querySelector('.caret'); if (c) c.textContent = '▾';
      tbody.querySelectorAll(`tr.leaf[data-g="${h.dataset.g}"]`).forEach(r => { r.style.display = ''; });
    });
  }
}

// Collapse/expand a 3-level Pod -> Recruiter -> Job tree (Screening Efficiency, Time in Process).
// Momentum used to use it too; it moved to the generic wireTreePath when it stopped having stage rows.
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
  if (document.getElementById('recExpandAll')?.checked) {
    tbody.querySelectorAll('tr.lvl-pod').forEach(h => { h.dataset.exp = '1'; const c = h.querySelector('.caret'); if (c) c.textContent = '▾'; });
    tbody.querySelectorAll('tr.lvl-rec').forEach(r => { r.style.display = ''; r.dataset.exp = '1'; const c = r.querySelector('.caret'); if (c) c.textContent = '▾'; });
    tbody.querySelectorAll('tr.lvl-stage').forEach(s => { s.style.display = ''; });
  }
}

// #11: the pod a row actually RENDERS under. Agencies, freelancers and other sourcer-only people have no pod
// until one is set for them in Metric Configuration; Jerin (7 Sep) put them under "Others" meanwhile.
// 🚨 Everything that filters or groups by pod must use THIS, not podOf directly — otherwise a row is grouped
// into Others but filtered out as 'Unassigned', and the credit that moved to them lands nowhere.
export function effectivePod(r, quarter) {
  const p = podOf(r.name, quarter);
  return (r.sourcerOnly && (!p || p === 'Unassigned')) ? 'Others' : p;
}

function groupByPod(recs, quarter) {
  const g = {};
  recs.forEach(r => { const p = effectivePod(r, quarter); (g[p] || (g[p] = [])).push(r); });
  return POD_ORDER.filter(p => g[p] && g[p].length).map(p => ({ pod: p, recs: g[p] }));
}

// Generic N-level collapsible tree. Each row: data-path ("0", "0-1", "0-1-2"…), data-haschild for
// expandable rows. Clicking shows only direct children; collapsing hides + resets all descendants.
function wireTreePath(tbody) {
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
  if (document.getElementById('recExpandAll')?.checked) {
    tbody.querySelectorAll('tr[data-path]').forEach(r => { r.style.display = ''; if (r.dataset.haschild) { r.dataset.exp = '1'; const c = r.querySelector('.caret'); if (c) c.textContent = '▾'; } });
  }
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

let recScreenChart = null, recJoinChart = null, recFulfilChart = null, recSourceChart = null;
// One shared function, so revisiting the tab does not stack another document listener each time (#120, 14 Sep 2026).
const closeMsPanels = () => document.querySelectorAll('.ms-panel').forEach(p => p.style.display = 'none');

// Metric Configuration (pods/capacity/score grid/dept-family) now lives in Admin → Metric Configuration
// (admin.js). This tab only READS pods + capacity via recruiter-pods.js.

export function renderRecruiter(data) {
  if (!data || !data.recruiters || data.recruiters.length === 0) {
    return `
      <div class="card" style="text-align:center;padding:2rem;">
        <p style="color:var(--muted);font-size:0.8125rem;">Recruiter data not yet available.</p>
      </div>`;
  }

  const years = reportingYears();   // #127c: 2026 onwards; a new year appears on its first day

  return `
    <style>
      /* .rec-subtabs is the recessed .subtab-band — see style.css */
      /* .rec-subtab now inherits .subtab-chip from style.css — one chip for every level below the page */

      /* ===== Momentum heatmap (2026-08-30) — recruiter x day, one cell per day =====
         Deliberately HTML rather than a canvas chart: the cell grid IS a table of counts, and the hover
         needs to list every role behind a cell, which a canvas tooltip renders badly. */
      /* Full content width — the cells stretch to fill, so the grid lines up with the table below it
         (Jerin, 2026-08-30: "enlarge the chart to align with the rest of the content"). Cells keep a
         minimum width, so on a narrow screen the wrap scrolls rather than crushing them. */

      /* ===== Data Hygiene side list (#13, Jerin 14 Sep 2026 — mock-up B1) =====
         The list of lists sits on the left and the chosen list on the right. State lives in form, not only in numbers: a dot and a
         count badge per list (rose = needs a fix, slate = for the record, teal = nothing to fix) and a bar that sums the three. */
      .hy-split { display:grid; grid-template-columns:18.75rem minmax(0,1fr); border:1px solid var(--border); border-radius:0.75rem;
        background:var(--card); overflow:hidden; margin-top:0.25rem; }
      .hy-rail { background:#f7f9fc; border-right:1px solid var(--border); display:flex; flex-direction:column; }
      .hy-rail-head { padding:0.875rem 0.875rem 0.75rem; border-bottom:1px solid var(--border); background:var(--card); display:grid; gap:0.5rem; }
      .hy-rail-title { display:flex; align-items:baseline; justify-content:space-between; gap:0.625rem; }
      .hy-rail-title strong { font-size:0.8125rem; font-weight:700; color:var(--text); }
      .hy-rail-title span { font-size:0.75rem; color:var(--muted); font-variant-numeric:tabular-nums; }
      .hy-statebar { display:flex; gap:2px; height:0.375rem; border-radius:62.4375rem; overflow:hidden; }
      .hy-statebar i { display:block; height:100%; }
      .hy-statebar .s-fix { background:var(--red); }
      .hy-statebar .s-record { background:#b5bccf; }
      .hy-statebar .s-clear { background:var(--green); }
      .hy-statebar .s-wait { background:var(--border); }
      .hy-legend { display:flex; flex-wrap:wrap; gap:0.25rem 0.75rem; font-size:0.71875rem; color:var(--muted); }
      .hy-legend span { display:inline-flex; align-items:center; gap:0.3125rem; }
      .hy-legend b { color:var(--text-secondary); font-weight:600; font-variant-numeric:tabular-nums; }
      .hy-rail-body { padding:0.375rem 0.5rem 0.75rem; display:grid; gap:2px; align-content:start; }
      .hy-grp { display:flex; align-items:center; justify-content:space-between; padding:0.75rem 0.5rem 0.3125rem; }
      .hy-grp:first-child { padding-top:0.375rem; }
      .hy-grp span { font-size:0.65625rem; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:#9aa3bd; }
      .hy-grp em { font-style:normal; font-size:0.6875rem; color:#9aa3bd; font-variant-numeric:tabular-nums; }
      .hy-row { appearance:none; width:100%; text-align:left; cursor:pointer; background:transparent; font-family:inherit;
        border:1px solid transparent; border-radius:0.5625rem; padding:0.5rem 0.625rem; color:var(--text-secondary);
        display:grid; grid-template-columns:0.625rem minmax(0,1fr) auto; column-gap:0.625rem; align-items:center;
        transition:background-color .14s, border-color .14s, box-shadow .14s; }
      .hy-row:hover { background:#eef2f8; }
      .hy-row[aria-selected="true"] { background:var(--card); border-color:var(--border);
        box-shadow:0 1px 2px rgba(15,23,42,.06), 0 0.25rem 0.75rem -0.375rem rgba(34,52,79,.18); }
      .hy-row:focus-visible { outline:2px solid var(--accent); outline-offset:1px; }
      .hy-dot { width:0.5rem; height:0.5rem; border-radius:50%; justify-self:center; }
      .hy-dot.fix { background:var(--red); box-shadow:0 0 0 0.1875rem var(--red-light); }
      .hy-dot.record { background:#b5bccf; box-shadow:0 0 0 0.1875rem #eef0f5; }
      .hy-dot.clear { background:var(--green); box-shadow:0 0 0 0.1875rem var(--green-light); }
      .hy-dot.wait { background:var(--border); box-shadow:0 0 0 0.1875rem var(--border-light); }
      .hy-name { font-size:0.8125rem; font-weight:550; line-height:1.3; }
      .hy-row[aria-selected="true"] .hy-name { color:var(--navy); font-weight:650; }
      .hy-sub { grid-column:2 / 4; font-size:0.71875rem; line-height:1.35; color:var(--muted); margin-top:2px; }
      .hy-n { font-variant-numeric:tabular-nums; font-size:0.6875rem; font-weight:700; line-height:1; padding:0.25rem 0.5rem; border-radius:62.4375rem;
        white-space:nowrap; border:1px solid transparent; }
      .hy-n.fix { background:var(--red-light); color:var(--red); border-color:#ecd3db; }
      .hy-n.record { background:#eef0f5; color:var(--muted); border-color:#dde1ea; }
      .hy-n.clear { background:var(--green-light); color:var(--green); border-color:#cfe3e9; display:inline-flex; align-items:center; gap:0.1875rem; }
      .hy-n.wait { background:var(--border-light); color:var(--muted); }
      .hy-n svg { width:0.625rem; height:0.625rem; }
      .hy-main { padding:1.25rem 1.375rem 1.375rem; min-width:0; display:grid; gap:1rem; align-content:start; }
      .hy-top { display:flex; justify-content:space-between; align-items:flex-start; gap:1.125rem; flex-wrap:wrap; }
      .hy-title { display:grid; gap:0.375rem; min-width:0; }
      .hy-crumb { font-size:0.6875rem; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:#9aa3bd; }
      .hy-title h3 { margin:0; font-size:1.1875rem; line-height:1.2; letter-spacing:-.01em; color:var(--navy); font-weight:700; text-transform:none; }
      .hy-pills { display:flex; flex-wrap:wrap; gap:0.375rem; }
      .hy-pill { display:inline-flex; align-items:center; gap:0.375rem; font-size:0.71875rem; font-weight:600; padding:0.1875rem 0.5625rem; border-radius:62.4375rem;
        border:1px solid var(--border); color:var(--text-secondary); background:var(--card); white-space:nowrap; }
      .hy-pill.fix { background:var(--red-light); border-color:#ecd3db; color:var(--red); }
      .hy-pill.record { background:#eef0f5; border-color:#dde1ea; color:var(--muted); }
      .hy-pill.clear { background:var(--green-light); border-color:#cfe3e9; color:var(--green); }
      .hy-pill svg { width:0.75rem; height:0.75rem; }
      .hy-side { display:flex; align-items:center; gap:0.875rem; }
      .hy-big { display:grid; justify-items:end; line-height:1; }
      .hy-big b { font-size:1.75rem; font-weight:700; letter-spacing:-.02em; font-variant-numeric:tabular-nums; color:var(--navy); }
      .hy-big span { font-size:0.65625rem; color:var(--muted); margin-top:0.3125rem; text-transform:uppercase; letter-spacing:.05em; }
      .hyg-dl { appearance:none; display:inline-flex; align-items:center; gap:0.4375rem; background:var(--card); border:1px solid var(--border);
        border-radius:0.5rem; padding:0.4375rem 0.75rem; font-size:0.75rem; font-weight:600; color:var(--text-secondary); cursor:pointer; white-space:nowrap; font-family:inherit; }
      .hyg-dl:hover { color:var(--text); border-color:#b9c4d8; }
      .hyg-dl svg { width:0.8125rem; height:0.8125rem; }
      .hy-facts { display:grid; grid-template-columns:minmax(0,1.3fr) minmax(0,1fr); gap:0.75rem; }
      .hy-fact { border:1px solid var(--border-light); background:#f7f9fc; border-radius:0.625rem; padding:0.6875rem 0.875rem; display:grid; gap:0.375rem; align-content:start; }
      .hy-fact h4 { margin:0; font-size:0.65625rem; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:#9aa3bd; }
      .hy-fact p { margin:0; font-size:0.8125rem; color:var(--text-secondary); }
      .hy-path { display:flex; flex-wrap:wrap; align-items:center; gap:0.25rem; }
      .hy-path span { font-size:0.75rem; font-weight:600; color:var(--accent-deep); background:var(--card); border:1px solid var(--border);
        border-radius:0.375rem; padding:2px 0.4375rem; white-space:nowrap; }
      .hy-path svg { width:0.625rem; height:0.625rem; color:#9aa3bd; flex:none; }
      .hy-main .scroll-table { margin-bottom:0; }
      @media (max-width: 50.625rem) {
        .hy-split { grid-template-columns:1fr; }
        .hy-rail { border-right:0; border-bottom:1px solid var(--border); }
        .hy-sub { display:none; }
        .hy-facts { grid-template-columns:1fr; }
      }
      @media (prefers-reduced-motion: reduce) { .hy-row { transition:none; } }

      /* consolidated filter block (matches HM) */
      /* .rec-filters look now lives in style.css — one quiet row, defined once */
      .rec-filters select, .rec-filters input[type=date], .rec-filters input[type=text] {
        appearance:none; -webkit-appearance:none; height:1.75rem; padding:0 0.6875rem; border:1px solid var(--border);
        border-radius:0.5rem; font-size:0.75rem; font-weight:500; background:var(--card); color:var(--text); }
      .rec-filters select { padding-right:1.75rem; cursor:pointer;
        background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%2364748b' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
        background-repeat:no-repeat; background-position:right 0.625rem center; }
      .rec-filters select:hover, .rec-filters input:hover { border-color:var(--muted); }
      .rec-filters select:focus, .rec-filters input:focus { outline:none; border-color:var(--accent); box-shadow:0 0 0 0.1875rem rgba(78,107,166,0.16); }
      .rec-filters .fchip { display:flex; align-items:center; gap:0.4375rem; }
      /* .rec-filters label styling lives in style.css — quiet, sentence case */
      .rec-filters .fchip > label.opt { font-size:0.75rem; font-weight:500; display:flex; align-items:center; gap:0.25rem; cursor:pointer; color:var(--text) }
      .rec-filters .fdiv { width:1px; align-self:stretch; background:#cdddf7; margin:2px 2px; }

      /* Velocity table — freeze the first two columns (Pod/Recruiter/Stage + Total-15) */
      .vel-table { width:auto; min-width:100%; border-collapse:separate; border-spacing:0; overflow:visible; }
      .vel-table th, .vel-table td { white-space:nowrap; }
      /* ===== Momentum grid, design pass 2026-08-29 (look only — no columns, rows or figures changed) ===== */
      /* Tighter rhythm: 30 day-columns at the global 8px/12px padding pushed the grid wider than it needed
         to be and made the sparse cells feel emptier than they are. */
      .vel-table th { padding:0.5rem 0.5625rem; letter-spacing:0.02em; }
      .vel-table td { padding:0.375rem 0.5625rem; }
      /* A real number should read louder than an empty cell. Dots stay faint; values get their weight back. */
      .vel-table tbody td { color:var(--text-secondary); }
      .vel-table tbody td:not(:first-child) { font-weight:500; font-variant-numeric:tabular-nums; }
      .vel-table tbody td .zero { font-weight:400; }
      /* Depth by weight and colour rather than indent alone: pod > recruiter > role. */
      .vel-table tbody tr.lvl-pod td { font-size:0.78125rem; }
      .vel-table tbody tr.lvl-job td:first-child { color:var(--muted); font-weight:400; white-space:normal; line-height:1.35; }
      /* Someone with nothing in the window is still worth seeing, just not worth reading first. */
      .vel-table tbody tr.lvl-quiet td { color:var(--muted); }
      .vel-table tbody tr.lvl-quiet td:not(:first-child) { font-weight:400; }
      /* Saturdays and Sundays: a soft maroon underline on the date, so a quiet weekend is not mistaken for
         a quiet week (Jerin, 2026-08-29). Deliberately an underline and not a fill — the column is context,
         not an alert. */
      .vel-table th.wknd { box-shadow:inset 0 -2px 0 rgba(163,50,83,0.38); }
      /* #151b option B: centred, like every other number (the day columns keep their 3.5rem width). */
      .vel-table th:not(:first-child), .vel-table td:not(:first-child) { text-align:center; }
      .vel-table th:nth-child(n+3), .vel-table td:nth-child(n+3) { min-width:3.5rem; }
      .vel-table th:nth-child(1), .vel-table td:nth-child(1) { position:sticky; left:0; z-index:2; width:15.625rem; min-width:15.625rem; max-width:15.625rem; white-space:normal; }
      .vel-table td:nth-child(1) { text-align:left; }   /* #151b: the heading above it centres like every other */
      .vel-table th:nth-child(2), .vel-table td:nth-child(2) { position:sticky; left:15.625rem; z-index:2; min-width:6rem; border-right:2px solid var(--border); }
      /* #151b: the heading band, not the page ground — these two are sticky, so they must be opaque (147a). */
      .vel-table thead th:nth-child(1), .vel-table thead th:nth-child(2) { z-index:3; background:#eef2f8; }
      .vel-table tbody td:nth-child(1), .vel-table tbody td:nth-child(2) { background:var(--card); }
      .vel-table tbody tr.lvl-pod td:nth-child(1), .vel-table tbody tr.lvl-pod td:nth-child(2) { background:var(--border-light); }

      /* multi-select checkbox dropdown */
      .ms { position:relative; display:inline-block; }
      .ms-btn { appearance:none; height:1.75rem; padding:0 0.6875rem; border:1px solid var(--border); border-radius:0.5rem; font-size:0.75rem; font-weight:500;
        background:var(--card); color:var(--text); cursor:pointer; min-width:7.5rem; text-align:left; white-space:nowrap; }
      .ms-btn:hover { border-color:var(--muted); }
      .ms-opt { display:flex; align-items:center; gap:0.4375rem; padding:0.3125rem 0.5rem; font-size:0.75rem; font-weight:500; border-radius:0.375rem; cursor:pointer; white-space:nowrap; }
      .ms-opt:hover { background:var(--border-light); }


      /* Metric Configuration */
      .cfg-card { border:1px solid var(--border); border-radius:0.75rem; padding:1rem 1.125rem; margin-bottom:1.125rem; background:var(--card); }
      .cfg-head { display:flex; align-items:center; justify-content:space-between; gap:0.75rem; flex-wrap:wrap; }
      .cfg-card .fchip { display:flex; align-items:center; gap:0.4375rem; }
      .cfg-card .fchip > span.lbl { font-size:0.6875rem; font-weight:700; color:var(--accent); text-transform:uppercase; letter-spacing:0.04em; }
      .cfg-card select, .cfg-card input[type=date], .cfg-card input[type=number] {
        appearance:none; -webkit-appearance:none; height:2rem; padding:0 0.625rem; border:1px solid var(--border);
        border-radius:0.5rem; font-size:0.75rem; font-weight:500; background:var(--bg); color:var(--text); }
      .btn-secondary { background:var(--bg); border:1px solid var(--border); border-radius:0.5rem; cursor:pointer; font-weight:600; color:var(--text); }
      .btn-secondary:hover { border-color:var(--muted); }
      .cfg-grid td, .cfg-grid th { text-align:center; white-space:nowrap; }
      .cfg-grid th:first-child, .cfg-grid td:first-child { text-align:left; min-width:13.125rem; white-space:normal; }
      .cfg-grid tbody tr.fam-sep td { background:var(--border-light); font-weight:700; font-size:0.6875rem; text-transform:uppercase; letter-spacing:0.03em; color:var(--muted); text-align:left; }
      .cfg-grid .tier-pts { width:2.875rem; text-align:center; padding:2px; font-size:0.6875rem; }
      .cfg-ref { display:grid; grid-template-columns:repeat(auto-fit,minmax(13.75rem,1fr)); gap:1rem; }
      .cfg-ref table { width:100%; font-size:0.75rem; }
      /* #151b: house heading style, kept identical to admin.js's copy so the two cannot drift. */
      .cfg-ref th { text-align:center; color:var(--accent-deep); font-size:0.6875rem; text-transform:none; letter-spacing:0; }
    </style>

    <div class="rec-subtabs subtab-band">
      <!-- #130 (Jerin, 15 Sep 2026): one name on every tab, and the two people lists on their own sub-tabs. Tab keys unchanged, so saved links still open. -->
      <button class="rec-subtab subtab-chip active" data-tab="fulfilment">Position Fulfilment</button>
      <button class="rec-subtab subtab-chip" data-tab="joiningpending">Joining Pending</button>
      <button class="rec-subtab subtab-chip" data-tab="joiners">Joiners</button>
      <button class="rec-subtab subtab-chip" data-tab="velocity">Momentum</button>
      <button class="rec-subtab subtab-chip" data-tab="screening">Screening Efficiency</button>
      <button class="rec-subtab subtab-chip" data-tab="joining">Joining Conversion</button>
      <button class="rec-subtab subtab-chip" data-tab="sourcing">Sourcing Mix</button>
      <button class="rec-subtab subtab-chip" data-tab="timeinprocess">Time in Process</button>
      <button class="rec-subtab subtab-chip" data-tab="hygiene">Data Hygiene</button>
    </div>

    <div class="rec-filters">
      <div class="fchip"><div class="ms" id="msPod"></div></div>
      <div class="fchip"><div class="ms" id="msRec"></div></div>
      <div class="fchip"><div class="ms" id="msJob"></div></div>
      <div class="fchip"><label class="opt"><input type="checkbox" id="recExpandAll" checked> Expand all</label></div>
      <span class="fdiv"></span>
      
      
    <span class="period" id="recPeriod"><div class="fchip"><span class="lbl">Year</span><select id="recVelYear">${years.map(y => `<option value="${y}">${y}</option>`).join('')}</select></div><div class="fchip"><span class="lbl">Quarter</span><select id="recVelQuarter"></select></div><div class="fchip vel-dates"><span class="lbl">From</span><input type="date" id="recVelFrom"></div><div class="fchip vel-dates"><span class="lbl">To</span><input type="date" id="recVelTo"></div></span>${dojFilterHtml('rec', data.joiningPendingCases)}</div>

    <!-- PANEL: Momentum — candidates added to ToFU, one column per day.
         🚨 The day columns were replaced with summary columns (Total / Last 7d / Prev 7d / Trend / Active
         days / sparkline) on 2026-08-29 and Jerin reverted it the same day: "why would you change the
         columns? I never asked for it." He asked for the CLUTTER to be fixed, not for the table to measure
         something else — and the per-day grid is the thing he specified when he defined this panel. Fix the
         look here if it needs fixing; do not swap the day columns for derived metrics again. -->
    <div class="rec-panel" data-panel="velocity" style="display:none">
      <div class="tofu-heat-wrap" id="recVelHeatWrap"><div id="recVelHeat" class="tofu-heat"></div><div id="recVelHeatTip" class="heat-tip"></div></div>
      <div class="scroll-table"><table class="vel-table">
        <thead id="recVelHead"></thead>
        <tbody id="recVelBody"></tbody>
      </table></div>
      ${defsBlock('rec-momentum')}
    </div>

    <!-- PANEL: Screening Efficiency — ONE R1 column set since 2026-08-29 (Jerin). HM Review and Online
         Assessment columns were removed on purpose: this panel is about R1 only, and both still count on
         Momentum through ToFU. See the definitions block for what Added and Cleared mean. -->
    <div class="rec-panel" data-panel="screening" style="display:none">
      <p class="sub-note" id="recScreenPeriod" style="font-weight:600"></p>
      <div class="chart-wrap" style="height:18.75rem"><canvas id="recScreenChart"></canvas></div>
      <div class="scroll-table"><table class="metrics">
        <thead>
          <tr>
            <th style="min-width:16.25rem">Pod / Recruiter / Job</th>
            <th class="c-num">Added at R1</th>
            <th class="c-num">Progressed</th>
            <th class="c-pct">%</th>
          </tr>
        </thead>
        <tbody id="recScreenBody"></tbody>
      </table></div>
      ${defsBlock('rec-screening')}
    </div>

    <!-- PANEL: Joining Conversion -->
    <div class="rec-panel" data-panel="joining" style="display:none">
      <div class="chart-wrap" style="height:17.5rem"><canvas id="recJoinChart"></canvas></div>
      <div class="scroll-table"><table class="metrics join-table">
        <thead><tr><th>Pod / Recruiter</th><th class="c-num">Offered</th><th class="c-num">Joined</th><th class="c-num">Joining pending</th><th class="c-cap">Dropped</th><th class="c-bar">Joining conversion</th></tr></thead>
        <tbody id="recJoinBody"></tbody>
      </table></div>
      ${defsBlock('rec-joining')}
    </div>

    <!-- PANEL: Position Fulfilment -->
    <div class="rec-panel" data-panel="fulfilment">
      <div class="chart-wrap" style="height:17.5rem"><canvas id="recFulfilChart"></canvas></div>


      <h4 style="font-size:0.6875rem;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.04em;margin:0.875rem 0 0.375rem">Position Fulfilment — Non-Sales</h4>
      <div class="scroll-table"><table class="metrics">
        <thead>
          <tr><th rowspan="2" style="min-width:15rem">Pod / Recruiter / Job</th><th rowspan="2" class="stage-hdr">Capacity</th><th rowspan="2" class="stage-hdr">Capacity used</th><th colspan="2" class="stage-hdr">Goal</th><th colspan="2" class="stage-hdr">Joined</th><th rowspan="2" class="stage-hdr">JP total</th><th colspan="2" class="stage-hdr">JP — current qtr</th><th colspan="2" class="stage-hdr">JP — upcoming qtr</th><th colspan="2" class="stage-hdr">Drop</th><th colspan="2" class="stage-hdr">Delta</th></tr>
          <tr><th class="stage-sub grp-open">Heads</th><th class="stage-sub">Score</th><th class="stage-sub grp-open">Heads</th><th class="stage-sub">Score</th><th class="stage-sub grp-open">Heads</th><th class="stage-sub">Score</th><th class="stage-sub grp-open">Heads</th><th class="stage-sub">Score</th><th class="stage-sub grp-open">Heads</th><th class="stage-sub">Score</th><th class="stage-sub grp-open">Heads</th><th class="stage-sub">Score</th></tr>
        </thead>
        <tbody id="recFulfilOfferBody"></tbody>
      </table></div>

      <h4 style="font-size:0.6875rem;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.04em;margin:1.125rem 0 0.375rem">Position Fulfilment — Sales (Hires)</h4>
      <div class="scroll-table"><table class="metrics wide-fulfil">
        <thead>
          <tr><th rowspan="2" style="min-width:12.5rem">Pod / Recruiter / Job</th><th rowspan="2" class="stage-hdr">Capacity</th><th rowspan="2" class="stage-hdr">Capacity used</th><th colspan="2" class="stage-hdr">Goal</th><th rowspan="2" class="stage-hdr">Joined total</th><th colspan="2" class="stage-hdr">Joined — prev qtr openings</th><th colspan="2" class="stage-hdr">Joined — current qtr openings</th><th rowspan="2" class="stage-hdr">JP total</th><th colspan="2" class="stage-hdr">JP — prev qtr openings</th><th colspan="2" class="stage-hdr">JP — current qtr openings</th><th colspan="2" class="stage-hdr">Drop</th><th colspan="2" class="stage-hdr">Delta</th></tr>
          <tr><th class="stage-sub grp-open">Heads</th><th class="stage-sub">Score</th><th class="stage-sub grp-open">Heads</th><th class="stage-sub">Score</th><th class="stage-sub grp-open">Heads</th><th class="stage-sub">Score</th><th class="stage-sub grp-open">Heads</th><th class="stage-sub">Score</th><th class="stage-sub grp-open">Heads</th><th class="stage-sub">Score</th><th class="stage-sub grp-open">Heads</th><th class="stage-sub">Score</th><th class="stage-sub grp-open">Heads</th><th class="stage-sub">Score</th></tr>
        </thead>
        <tbody id="recFulfilHireBody"></tbody>
      </table></div>

      <h4 style="font-size:0.6875rem;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.04em;margin:1.125rem 0 0.375rem">Position Fulfilment — Others (Hires)</h4>
      <div class="scroll-table"><table class="metrics wide-fulfil">
        <thead>
          <tr><th rowspan="2" style="min-width:12.5rem">Pod / Recruiter / Job</th><th rowspan="2" class="stage-hdr">Capacity</th><th rowspan="2" class="stage-hdr">Capacity used</th><th colspan="2" class="stage-hdr">Goal</th><th rowspan="2" class="stage-hdr">Joined total</th><th colspan="2" class="stage-hdr">Joined — prev qtr openings</th><th colspan="2" class="stage-hdr">Joined — current qtr openings</th><th rowspan="2" class="stage-hdr">JP total</th><th colspan="2" class="stage-hdr">JP — prev qtr openings</th><th colspan="2" class="stage-hdr">JP — current qtr openings</th><th colspan="2" class="stage-hdr">Drop</th><th colspan="2" class="stage-hdr">Delta</th></tr>
          <tr><th class="stage-sub grp-open">Heads</th><th class="stage-sub">Score</th><th class="stage-sub grp-open">Heads</th><th class="stage-sub">Score</th><th class="stage-sub grp-open">Heads</th><th class="stage-sub">Score</th><th class="stage-sub grp-open">Heads</th><th class="stage-sub">Score</th><th class="stage-sub grp-open">Heads</th><th class="stage-sub">Score</th><th class="stage-sub grp-open">Heads</th><th class="stage-sub">Score</th><th class="stage-sub grp-open">Heads</th><th class="stage-sub">Score</th></tr>
        </thead>
        <tbody id="recFulfilOthersBody"></tbody>
      </table></div>

      ${defsBlock('rec-fulfilment')}
    </div>

    <!-- PANEL: Joining Pending (#130b — was the Cases list under Position Fulfilment) -->
    <div class="rec-panel" data-panel="joiningpending" style="display:none">
      <p class="sub-note" id="recJPCaption" style="margin-bottom:0.5rem"></p>
      <div class="scroll-table"><table class="metrics pl-list">
        <thead><tr>
          <th style="min-width:15rem">Pod / Recruiter / Candidate</th>
          <th>Month</th><th class="c-date">DOJ</th><th class="c-dept">Department</th><th class="c-job">Job</th><th class="c-stage">Sub-stage</th><th class="c-open">Opening quarter</th>
        </tr></thead>
        <tbody id="recJPBody"></tbody>
      </table></div>
      ${defsBlock('rec-joiningpending')}
    </div>

    <!-- PANEL: Joiners (#130c) — the Joining Pending columns minus Sub-Stage: Hired is one stage -->
    <div class="rec-panel" data-panel="joiners" style="display:none">
      <p class="sub-note" id="recJoinersCaption" style="margin-bottom:0.5rem"></p>
      <div class="scroll-table"><table class="metrics pl-list">
        <thead><tr>
          <th style="min-width:15rem">Pod / Recruiter / Candidate</th>
          <th>Month</th><th class="c-date">DOJ</th><th class="c-dept">Department</th><th class="c-job">Job</th><th class="c-open">Opening quarter</th>
        </tr></thead>
        <tbody id="recJoinersBody"></tbody>
      </table></div>
      ${defsBlock('rec-joiners')}
    </div>

    <!-- PANEL: Sourcing Mix -->
    <div class="rec-panel" data-panel="sourcing" style="display:none">
      <p class="sub-note" id="recSourcePeriod" style="font-weight:600"></p>
      <p class="sub-note" id="recSourceNote" style="display:none;color:var(--orange)"></p>
      <div class="chart-wrap" style="height:20rem"><canvas id="recSourceChart"></canvas></div>
      <div class="scroll-table"><table class="metrics">
        <thead><tr><th style="min-width:20rem">Pod / Recruiter / Source type / Source name</th><th class="c-num">Joiners</th><th class="c-bar">%</th></tr></thead>
        <tbody id="recSourceBody"></tbody>
      </table></div>
      ${defsBlock('rec-sourcing')}
    </div>

    <!-- PANEL: Time in Process (Pod → Recruiter → Job; median days parked per stage, red > 5) -->
    <div class="rec-panel" data-panel="timeinprocess" style="display:none">
      <p class="sub-note" id="recTisNote" style="display:none"></p>
      <div class="scroll-table"><table class="vel-table">
        <thead id="recTisHead"></thead>
        <tbody id="recTisBody"></tbody>
      </table></div>
      ${defsBlock('rec-tis')}
    </div>

    <!-- PANEL: Data Hygiene (LIVE — surfaces data.dataQuality from the attribution pass).
         #13 (Jerin, 14 Sep 2026): a side list (mock-up B1). The five summary boxes and Recruiter Roster were removed; the list
         names, reminders, "why" and "where to fix" live as data in definitions.js (HYGIENE_LISTS). -->
    <div class="rec-panel" data-panel="hygiene" style="display:none">
      <div class="hy-split" id="hySplit">
        <aside class="hy-rail">
          <div class="hy-rail-head">
            <div class="hy-rail-title"><strong>Data Hygiene</strong><span id="hyRailCount"></span></div>
            <div class="hy-statebar" id="hyStateBar" aria-hidden="true"></div>
            <div class="hy-legend" id="hyLegend"></div>
          </div>
          <div class="hy-rail-body" id="hyRail" role="listbox" aria-label="Data Hygiene lists"></div>
        </aside>
        <div class="hy-main">
          <div id="hyHead"></div>

          <div class="hyg-panel" data-h="unassigned">
            <div class="scroll-table"><table>
              <thead><tr><th style="min-width:18.75rem">Department / Job / Candidate</th><th class="c-stage">Stage</th><th class="c-date">Applied</th><th class="c-date">Last activity</th><th class="c-txt">Application ID</th></tr></thead>
              <tbody id="hygUnassignedBody"></tbody>
            </table></div>
          </div>

          <div class="hyg-panel" data-h="multirec" style="display:none">
            <div class="scroll-table"><table>
              <thead><tr><th class="c-job">Job</th><th class="c-cand">Candidate</th><th style="min-width:15rem">Recruiters tagged</th><th class="c-date">Last activity</th><th class="c-txt">Application ID</th></tr></thead>
              <tbody id="hygMultiRecBody"></tbody>
            </table></div>
          </div>

          <div class="hyg-panel" data-h="multisrc" style="display:none">
            <div class="scroll-table"><table>
              <thead><tr><th class="c-job">Job</th><th class="c-cand">Candidate</th><th style="min-width:15rem">Sourcers tagged</th><th class="c-date">Last activity</th><th class="c-txt">Application ID</th></tr></thead>
              <tbody id="hygMultiSrcBody"></tbody>
            </table></div>
          </div>

          <div class="hyg-panel" data-h="nosrc" style="display:none">
            <div class="scroll-table"><table>
              <thead><tr><th class="c-cand">Candidate</th><th class="c-job">Job</th><th class="c-dept">Department</th><th>Outcome</th><th class="c-date">Start date</th><th class="c-rec">Recruiter</th></tr></thead>
              <tbody id="hygNoSrcBody"></tbody>
            </table></div>
          </div>

          <div class="hyg-panel" data-h="dates" style="display:none">
            <h5 style="font-size:0.75rem;font-weight:600;color:var(--text);margin:0 0 0.375rem">Work credited outside their dates <span id="hygDatesOutN" style="color:var(--muted);font-weight:400"></span></h5>
            <div class="scroll-table"><table>
              <thead><tr><th class="c-rec">Recruiter</th><th>Quarter</th><th class="c-num">Work found</th><th class="c-date">Started on</th><th class="c-date">Left on</th></tr></thead>
              <tbody id="hygDatesOutBody"></tbody>
            </table></div>
            <h5 style="font-size:0.75rem;font-weight:600;color:var(--text);margin:0.875rem 0 0.375rem">Ashby account disabled, no Left on date <span id="hygDatesNoEndN" style="color:var(--muted);font-weight:400"></span></h5>
            <div class="scroll-table"><table>
              <thead><tr><th class="c-rec">Recruiter</th><th class="c-date">Started on</th><th>Last quarter with work</th></tr></thead>
              <tbody id="hygDatesNoEndBody"></tbody>
            </table></div>
            <h5 style="font-size:0.75rem;font-weight:600;color:var(--text);margin:0.875rem 0 0.375rem">No Started on date</h5>
            <p class="sub-note" id="hygDatesNoStart" style="margin:0"></p>
          </div>

          <div class="hyg-panel" data-h="nopod" style="display:none">
            <div class="scroll-table"><table>
              <thead><tr><th class="c-rec">Recruiter</th><th class="c-num">Applications (all-time)</th><th class="c-num">Offers (all-time)</th><th class="c-num">Hired (all-time)</th><th class="c-num">Joining pending</th></tr></thead>
              <tbody id="hygNoPodBody"></tbody>
            </table></div>
          </div>

          <div class="hyg-panel" data-h="nocap" style="display:none">
            <div class="scroll-table"><table>
              <thead><tr><th class="c-rec">Recruiter</th><th>Pod</th><th class="c-num">Offers (all-time)</th><th class="c-num">Hired (all-time)</th><th class="c-num">Joining pending</th></tr></thead>
              <tbody id="hygNoCapBody"></tbody>
            </table></div>
          </div>

          <div class="hyg-panel" data-h="offergap" style="display:none">
            <div class="scroll-table"><table>
              <thead><tr><th class="c-cand">Candidate</th><th class="c-job">Job</th><th class="c-dept">Department</th><th class="c-stage">Stage</th><th class="c-date">Offer made</th><th class="c-date">DOJ</th><th class="c-rec">Recruiter</th></tr></thead>
              <tbody id="hygOfferGapBody"></tbody>
            </table></div>
          </div>

          <div class="hyg-panel" data-h="hiredgap" style="display:none">
            <div class="scroll-table"><table>
              <thead><tr><th class="c-cand">Candidate</th><th class="c-job">Job</th><th class="c-dept">Department</th><th class="c-stage">Stage</th><th>Status</th><th class="c-date">Offer made</th><th class="c-date">DOJ</th><th class="c-rec">Recruiter</th></tr></thead>
              <tbody id="hygHiredGapBody"></tbody>
            </table></div>
          </div>

          <div class="hyg-panel" data-h="nodate" style="display:none">
            <div class="scroll-table"><table>
              <thead><tr><th style="min-width:18.75rem">Job</th><th class="c-dept">Department</th><th>Job status</th><th class="c-txt">Opening ID</th></tr></thead>
              <tbody id="hygNoDateBody"></tbody>
            </table></div>
          </div>

          <div class="hyg-panel" data-h="noopening" style="display:none">
            <div class="scroll-table"><table>
              <thead><tr><th style="min-width:16.25rem">Job</th><th class="c-dept">Department</th><th class="c-num">New candidates</th><th class="c-num">R1 screened</th><th class="c-num">Assessed</th><th class="c-num">Finished stays</th><th class="c-num">Interviews</th><th style="min-width:13.75rem">Openings in Ashby</th></tr></thead>
              <tbody id="hygNoOpeningBody"></tbody>
            </table></div>
          </div>

          <div class="hyg-panel" data-h="unscored" style="display:none">
            <div class="scroll-table"><table>
              <thead><tr><th style="min-width:18.75rem">Job</th><th class="c-dept">Department</th><th>Level</th><th>Complexity</th><th>Missing</th><th class="c-num">Applications</th></tr></thead>
              <tbody id="hygUnscoredBody"></tbody>
            </table></div>
          </div>

          <div class="hyg-panel" data-h="anomalies" style="display:none">
            <div class="scroll-table"><table>
              <thead><tr><th style="min-width:17.5rem">Anomaly</th><th style="min-width:15rem">Detail</th><th>What to do</th></tr></thead>
              <tbody id="hygAnomBody"></tbody>
            </table></div>
          </div>
        </div>
      </div>
      ${defsBlock('rec-hygiene')}
    </div>
  `;
}

export function initRecruiterFilters(baseData) {
  if (!baseData || !baseData.recruiters) return;
  // #120a (Jerin, 14 Sep 2026): the Job filter narrows EVERY number, not just the list of recruiters. `baseData` is what the
  // page was given (already narrowed to a Restricted user's departments); `data` is baseData narrowed again to the chosen jobs
  // by scopeData(), and every panel reads `data`. Data Hygiene alone keeps reading baseData — the Job filter never applies there.
  let data = baseData;
  // #11 (Jerin, 7 Sep 2026): the roster is no longer just data.recruiters. That list is built from people
  // tagged as RECRUITER on an application, so an agency or freelancer tagged only as a SOURCER never appears —
  // and with no row they have no pod, which means excluded from every row, total and chart, so their credit
  // would silently vanish. Jerin: they surface "once we either assign an opening to them or attribute a
  // closure to them". So: anyone who owns an opening as Sourcer, or is the sourcer on an outcome, joins the
  // roster. They also appear in Admin → Metric Configuration, which is where a pod and capacity get set.
  const rosterOf = (d) => (d.recruiters || []).concat(
    sourcerOnlyNames(d).map(name => ({ name, userId: null, byJob: [], total: 0, offer: 0, hired: 0, sourcerOnly: true })));
  let allRecs = rosterOf(data);
  const nDate = 7;
  // Inactive = the person no longer holds an elevated recruiter seat in Ashby (UI roles Recruiter /
  // Recruiter Admin). Identity is the Ashby USER RECORD (recruiters[].userId), so this is a direct lookup
  // rather than a name match, and the manual Admin override was retired 2026-08-22.
  // 🚨 Do NOT go back to isEnabled: it is true for all 446 Ashby users because IK never disables accounts,
  // so it marked every departed recruiter as Active. The seat is the signal.
  // activeKnown === false means NO Ashby user could be matched at all - the status is genuinely UNKNOWN.
  // It must never render as "Active": a departed recruiter hiding behind a default is exactly the kind of
  // plausible-looking wrong answer this dashboard has been bitten by before.
  const isRecInactive = (r) => !!(r && r.isActive === false);
  const isStatusUnknown = (r) => !!(r && r.activeKnown === false);
  // #111 (Jerin, 13 Sep 2026): who counts in a quarter follows the recruiter's Started on / Left on dates from Admin →
  //   Metric Configuration. With NO dates set, today's Ashby account decides exactly as before, so nothing moves for
  //   anyone until their dates are entered. Sourcer-only people hold no recruiter seat and no dates, so they always count.
  const presentIn = (r, q) => !!(r && (r.sourcerOnly || recruiterInQuarter(r.name, q, r.isActive).in));
  const inactiveTag = (r) => {
    if (!r || r.sourcerOnly) return '';
    const s = recruiterInQuarter(r.name, selQuarter(), r.isActive);
    if (!s.in) return ` <span title="Not here in the selected quarter${s.note ? ' (' + s.note + ')' : ''}" style="font-size:0.625rem;color:var(--red);font-weight:600">· not here this quarter</span>`;
    if (s.basis === 'dates' && /left|joined/.test(s.note)) return ` <span style="font-size:0.625rem;color:var(--muted);font-weight:600">· ${s.note}</span>`;
    return isStatusUnknown(r) ? ' <span title="No Ashby user record matched this name, so active/inactive is unknown" style="font-size:0.625rem;color:var(--orange);font-weight:600">· status unknown</span>' : '';
  };
  // Time-in-stage histograms (days:count). App Review from the main pull; TA Screen → Offer from stage history.
  const _sr = data.stageRollups || {};
  let tisRec = _sr.timeInStageByRecruiter || null, tisJob = _sr.timeInStageByJob || null;
  // Per-quarter dwell (bucketed by the quarter the candidate ENTERED the stage), added 2026-08-21.
  let tisRecQ = _sr.timeInStageByRecruiterQ || null, tisJobQ = _sr.timeInStageByJobQ || null;
  // #120a: the same stays per RECRUITER x JOB x quarter (pipeline, 14 Sep) — the Time in Process job rows under a recruiter.
  let tisRecJobQ = _sr.timeInStageByRecruiterJobQ || null, waitRecJobQ = _sr.waitingByRecruiterJobQ || null;
  const tisHasQ = hasQuarterTis(_sr);
  // Candidates still sitting in the stage, kept apart from completed stays (see stage-time.js).
  let waitRec = _sr.waitingByRecruiter || null, waitJob = _sr.waitingByJob || null;
  let waitRecQ = _sr.waitingByRecruiterQ || null, waitJobQ = _sr.waitingByJobQ || null;
  const tisSplit = hasWaitSplit(_sr);
  let arDwellRec = data.appReviewDwellByRecruiter || null, arDwellJob = data.appReviewDwellByJob || null;
  let arDwellRecJob = data.appReviewDwellByRecruiterJob || null;   // #120a: App Review dwell per recruiter x job

  // jobs[] is keyed by an 8-char id; recruiters[].byJob[].jobId is the full uuid → join on the prefix.
  // jobMeta() yields {department,title,level,complexity} for the scoring engine (falls back to byJob's own
  // title/department when the job isn't in jobs[] — e.g. archived with no current apps).
  const jobById = {}; (data.jobs || []).forEach(j => { jobById[j.id] = j; });
  const jobMeta = (bj) => { const j = jobById[(bj.jobId || '').slice(0, 8)]; return { department: (j && j.department) || bj.department, title: (j && j.title) || bj.title, level: j && j.level, complexity: j && j.complexity }; };
  const jobMetaById = (j8) => { const j = jobById[j8]; return j ? { department: j.department, title: j.title, level: j.level, complexity: j.complexity } : null; };

  // #1 opening-first reporting (2026-09-06): the Fulfilment GOAL now derives from the openings a recruiter
  // OWNS in Ashby — the opening's native-Roles "Recruiter" — emitted by the pipeline as
  // ownedSeatsByRecruiterQ[name][quarter][jobId8] = count. This replaces the equal-split-of-seats convention
  // (seatsOf, in fulfilRows). Ownership is exact, so a role two recruiters work no longer double-counts its
  // positions. When the field is absent — an older refresh still on schema v4 — we fall back to the
  // equal-split estimate so the tab still renders; useOwnedGoal says which basis is live.
  let ownedByRecQ = data.ownedSeatsByRecruiterQ || null;
  const useOwnedGoal = !!ownedByRecQ;

  // ===== #108 (Jerin, 13 Sep 2026): the recruiter / sourcer credit rule — replaces #11 of 7 Sep =====
  // The rule itself lives in score-model.js (creditSplit) so there is a single place it can be wrong; this is only
  // the accumulation. addCredit feeds Joined, Joining Pending and Drop; goalOf computes the Goal, which is NOT split.
  // 🚨 Score divides by the fractions. The HEAD always goes to the RECRUITER, so Σ HC still equals the real number of
  //    people. What a person sourced for someone else is counted on `so` and shown as the "+N sourced" second line.
  // ⚠ externalUsers comes from the pipeline (globalRole === 'External Recruiter'); userTypeOf() turns it into
  //   Agency | Freelancer | Internal using the Admin toggle, defaulting an unreviewed external to Freelancer.
  const externalSet = new Set(data.externalUsers || []);
  let ownedBySrcQ = data.ownedSeatsBySourcerQ || null;
  const splitOf = (dept, sourcer) => creditSplit(dept, sourcer, userTypeOf(sourcer, externalSet));
  // ===== #100 (10 Sep 2026): the Goal must join the sourcer at the OPENING grain, not the JOB grain =====
  // The two maps above say "this person holds this role on N openings of this job" — they never say WHICH
  // openings. So when a sourcer worked only SOME of a job's openings, the old per-job sourcer lookup applied their split to ALL of
  // them: the recruiter handed over every opening on the job while the sourcer was credited for only theirs,
  // and the difference fell on the floor. Measured on 2026-Q3: Oshin owned 6 openings on `7c1706f1` and
  // Sangha sourced 4 — all 6 left Oshin, 4 reached Sangha, 2 vanished. In points the three shared SME roles
  // are worth 102 but rendered 90 as Freelancer (live) and 78 as Agency.
  // ownedSeatsPairQ[quarter][job8] = [{ r: recruiter, s: sourcer, n: openings }] reads BOTH roles off the SAME
  // opening, so every opening sits in exactly one bucket whose two shares add to 1 and nothing can leak.
  // ⚠ Absent until the pipeline has run once — pairFallback keeps the old behaviour so the tab still renders.
  let pairsQ = data.ownedSeatsPairQ || null;
  const usePairs = !!pairsQ;
  // #120a: the stores above were read from the data once, at start-up. When the Job filter narrows `data`, read them again.
  // The presence flags (tisHasQ, tisSplit, useOwnedGoal, usePairs) stay as baseData set them: a narrowed store can be empty,
  // but it is never a different basis.
  function bindData(d) {
    data = d;
    allRecs = rosterOf(d);
    const sr = d.stageRollups || {};
    tisRec = sr.timeInStageByRecruiter || null; tisJob = sr.timeInStageByJob || null;
    tisRecQ = sr.timeInStageByRecruiterQ || null; tisJobQ = sr.timeInStageByJobQ || null;
    tisRecJobQ = sr.timeInStageByRecruiterJobQ || null; waitRecJobQ = sr.waitingByRecruiterJobQ || null;
    waitRec = sr.waitingByRecruiter || null; waitJob = sr.waitingByJob || null;
    waitRecQ = sr.waitingByRecruiterQ || null; waitJobQ = sr.waitingByJobQ || null;
    arDwellRec = d.appReviewDwellByRecruiter || null; arDwellJob = d.appReviewDwellByJob || null;
    arDwellRecJob = d.appReviewDwellByRecruiterJob || null;
    ownedByRecQ = d.ownedSeatsByRecruiterQ || null; ownedBySrcQ = d.ownedSeatsBySourcerQ || null;
    pairsQ = d.ownedSeatsPairQ || null;
    _jsQ = null; _js = null;   // the joiner-source cache is keyed by period only
  }
  // True while the Job filter or a department restriction narrows the numbers. The Pod and Recruiter filters narrow none.
  const narrowed = () => !!data._scope;
  // #125 (Jerin, 15 Sep 2026): "we dont work on any job with an opening open date in the previous quarter". Momentum, Screening Efficiency
  // and Time in Process read the data narrowed to jobs with an opening OPENED in the Year/Quarter period, so every figure — job rows,
  // recruiter and pod rows, charts — covers the same jobs. Fulfilment, Joining Conversion, Sourcing Mix and Data Hygiene read `data`:
  // a previous-quarter opening still counts there. Year and Quarter both on All ⇒ every job.
  const actData = () => { const per = selQuarters(); return per ? scopeToOpenings(data, qq => per.includes(qq)) : data; };
  // ===== #129 (Jerin, 15 Sep 2026): the From / To boxes narrow every panel on this tab =====
  // "If there is a filter applied, data needs to change as well." The range always sits inside the one quarter picked (#127b). A range
  // covering the whole quarter reads the quarter figures exactly as before; a narrower one reads the pipeline's day fields, whose days
  // add up to those quarter figures. Job lists stay on the quarter (#125), Joining Pending stays live, Data Hygiene is unchanged.
  function selRange() { return rangeOf(document.getElementById('recVelFrom'), document.getElementById('recVelTo'), [selQuarter()]); }
  const wholeQuarter = () => coversQuarters(selRange(), [selQuarter()]);
  // Capacity is set for a whole quarter, so a range covering part of it gets that share of the days (Jerin: 1A).
  const capacityFor = (name, qq) => {
    const cap = capacityOf(name, qq) || 0, rg = selRange();
    return coversQuarters(rg, [qq]) ? cap : Math.round(cap * quarterDaysIn(qq, rg) / quarterDays(qq));
  };
  // The openings each person owns or sources inside the range, shaped like ownedSeatsPairQ[qq]: ownedSeatsPairD added up over the days
  // in the range, the same (recruiter, sourcer) pair merged. A data file from before 15 Sep has no days, so it answers whole quarters only.
  let _pairsKey = null, _pairsData = null, _pairsVal = null;
  function pairsFor(qq) {
    const rg = selRange();
    if (coversQuarters(rg, [qq])) return (pairsQ && pairsQ[qq]) || {};
    const key = qq + '|' + rg.from + '|' + rg.to;
    if (_pairsData === data && _pairsKey === key) return _pairsVal;
    const out = {}, pd = hasDayData(data) ? (data.ownedSeatsPairD || {}) : {};
    for (const d in pd) {
      if (!inRange(d, rg) || quarterOfDay(d) !== qq) continue;
      for (const j8 in pd[d]) {
        const arr = out[j8] || (out[j8] = []);
        pd[d][j8].forEach(p => {
          let hit = arr.find(x => x.r === p.r && x.s === p.s);
          if (!hit) arr.push(hit = { r: p.r, s: p.s, n: 0 });
          hit.n += p.n || 0;
        });
      }
    }
    Object.values(out).forEach(arr => arr.forEach(x => { x.n = Math.round(x.n * 10000) / 10000; }));
    _pairsKey = key; _pairsData = data; _pairsVal = out;
    return out;
  }
  const NARROW_CAP_NOTE = 'Capacity is set per person for the whole quarter, not per job or department, so it is blank while a filter narrows the numbers.';
  // {job8: {stage: {quarter: hist}}} → {job8: {stage: hist}}: the all-time view of one recruiter's per-job stays.
  const _allTime = new WeakMap();
  const allTimeOf = (byJobQ) => {
    if (!byJobQ) return null;
    let o = _allTime.get(byJobQ); if (o) return o;
    o = {};
    for (const j8 in byJobQ) { o[j8] = {}; for (const st in byJobQ[j8]) o[j8][st] = poolHists(Object.values(byJobQ[j8][st])); }
    _allTime.set(byJobQ, o); return o;
  };
  // #100: THE one place a Goal is computed. `only8` restricts it to a single job, which is how the per-job
  // drill-down rows are produced — same function, same split, so the sub-rows always sum to the row above.
  // Returns { hc, sc, so } — `so` = openings this person is tagged on as SOURCER (#108). Three bases, best first:
  //   1. usePairs   — recruiter+sourcer read off the SAME opening. Exact; cannot leak.
  //   2. useOwnedGoal — the old per-JOB maps. Still leaks (#100a) but now at least applies the split to the
  //      per-job rows too, so #100b is fixed even before the pipeline has run.
  //   3. neither    — no Goal (a data file older than 6 Sep; the pre-#1 equal split was removed in #129).
  const goalOf = (r, qq, only8) => {
    let hc = 0, sc = 0, so = 0;
    if (usePairs) {
      const byJob = pairsFor(qq);
      const keys = only8 ? (byJob[only8] ? [only8] : []) : Object.keys(byJob);
      keys.forEach(j8 => {
        const m = jobMetaById(j8) || jobMeta({ jobId: j8 });
        const pts = scoreForRole(m, qq);
        (byJob[j8] || []).forEach(pr => {
          const n = pr.n || 0; if (!n) return;
          const isRec = pr.r === r.name, isSrc = pr.s === r.name;
          if (!isRec && !isSrc) return;
          // #108: the RECRUITER keeps the FULL Goal — every point and every head — whoever sourced the opening.
          //   A sourcer earns no Goal points; their openings go on `so`, the "+N sourced" line under Goal.
          // ⚠ Same person as Recruiter AND Sourcer: counted once, as the recruiter, with no "+N sourced" on themselves.
          // ⚠ An opening carrying a Sourcer but NO Recruiter: the sourcer is its only owner, so they carry its Goal —
          //   otherwise that opening's points would be credited to nobody. Never seen in live data (0 of 658).
          const orphan = !pr.r;
          if (isRec || orphan) { hc += n; sc += n * pts; }
          else so += n;
        });
      });
      return { hc, sc, so };
    }
    if (useOwnedGoal) {
      const pick = (map) => { const o = (map && map[r.name] && map[r.name][qq]) || {};
                              return only8 ? (o[only8] ? { [only8]: o[only8] } : {}) : o; };
      const owned = pick(ownedByRecQ);
      Object.keys(owned).forEach(j8 => {
        const cnt = owned[j8]; if (!cnt) return;
        const m = jobMetaById(j8) || jobMeta({ jobId: j8 });
        hc += cnt; sc += cnt * scoreForRole(m, qq);   // #108: the recruiter's Goal is never split
      });
      const ownedSrc = pick(ownedBySrcQ);
      Object.keys(ownedSrc).forEach(j8 => { so += ownedSrc[j8] || 0; });   // sourced openings: a count, no points
      return { hc, sc, so };
    }
    // #129: the third basis (the pre-#1 equal split of a role's positions) called seatsOf, which exists only inside fulfilRows, so it
    // could only ever throw. Every data file since 10 Sep carries ownedSeatsPairQ, so it is gone rather than repaired.
    return { hc, sc, so };
  };
  // Every job this person has a Goal on in a quarter — as Recruiter or as Sourcer. Feeds the drill-down rows,
  // which must list a role the person only SOURCED or its Goals would not sum to the row above.
  const goalJobsOf = (r, qq) => {
    const out = {};
    if (usePairs) {
      Object.entries(pairsFor(qq)).forEach(([j8, arr]) =>
        (arr || []).forEach(pr => { if (pr.n && (pr.r === r.name || pr.s === r.name)) out[j8] = 1; }));
    } else if (useOwnedGoal) {
      [ownedByRecQ, ownedBySrcQ].forEach(map =>
        Object.keys((map && map[r.name] && map[r.name][qq]) || {}).forEach(j8 => { out[j8] = 1; }));
    }
    return Object.keys(out);
  };
  // Post one outcome worth `sc` points into the per-name and per-name|job maps, divided between the two parties.
  // #108: the recruiter always takes the head; the sourcer takes their share of the points plus one on `so`, the
  // "+N sourced" count. The same person in both roles collects both halves and one head, and no sourced count.
  const addCredit = (mRec, mJob, job8, rec, srcr, dept, sc) => {
    const sp = splitOf(dept, srcr);
    const put = (name, f, head, sourced) => {
      if (!name || (!f && !head && !sourced)) return;
      const bump = (o) => { o.hc += head ? 1 : 0; o.sc += sc * f; o.so += sourced ? 1 : 0; };
      bump(mRec[name] || (mRec[name] = { hc: 0, sc: 0, so: 0 }));
      if (mJob) { const k = name + '|' + (job8 || ''); bump(mJob[k] || (mJob[k] = { hc: 0, sc: 0, so: 0 })); }
    };
    put(rec, sp.rec, sp.hcTo === 'rec', false);
    put(srcr, sp.src, sp.hcTo === 'src', !!srcr && srcr !== rec);
  };

  // Screening reached/cleared per recruiter for HM/OA/R1 — real from stage-history rollups when present,
  // else the current-stage approximation (R1-cleared unknown → null).
  // The per-stage throughput helpers (screenTriple / screenTripleByJob / jobsForRecruiter /
  // stageForPeriod) were removed on 2026-08-29: Screening Efficiency moved to a single R1 set computed in
  // the pipeline, and nothing else read them. throughputBy*Q is still emitted and still used by the HM and
  // Overall Efficiency tabs.

  let lastGroups = [], lastRecs = [], activeTab = 'fulfilment';
  // Per-recruiter Fulfilment aggregates, written by the table render and read by its chart.
  let lastFulfil = {};

  let msPod = null, msRec = null, msJob = null;

  // Quarter selected in the global filter (Year+Quarter) — drives pod grouping + capacity lookups.
  // The year the selector is on. "All" resolves to the first real year in the list (2026 today) — the same
  // year periodQuarters() resolves to, so two panels can never read different periods from one selection.
  function selYear() {
    const sel = document.getElementById('recVelYear');
    if (sel && sel.value) return sel.value;
    const first = sel ? [...sel.options].map(o => o.value).filter(Boolean)[0] : '';
    return first || String(new Date().getFullYear());
  }
  // ONE quarter — for the things that only exist per quarter: pod membership, capacity, the Fulfilment goal.
  // 🚨 This used to fall through to TODAY's quarter whenever EITHER dropdown read "All", so picking Q1 with
  // Year on All showed Q3 numbers under a Q1 heading. Resolve the year instead, and fall back to the current
  // quarter only when no quarter is picked at all.
  function selQuarter() {
    const q = document.getElementById('recVelQuarter')?.value;
    return q ? qKey(selYear(), q) : currentQuarter();
  }
  // EVERY quarter the selector covers; null = nothing picked (= all time). Panels whose data carries a date
  // read THIS, not selQuarter(): one quarter under a "Quarter: All" filter silently hides the rest of the
  // year — Sourcing Mix was showing 3,223 of 54,501 applications that way.
  function selQuarters() {
    return periodQuarters(document.getElementById('recVelYear')?.value || '', document.getElementById('recVelQuarter')?.value || '');
  }
  // Plain-English name for a period, for the line printed above a table.
  function periodLabel(per) { return periodText(per); }   // #127c

  // Styled multi-select checkbox dropdown. Returns { getSelected } ; empty selection = "All".
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

  // #120a: the Job filter narrows every number (bindData / onJobChange). A title shared by two jobs selects both.
  function selectedJobIds() {
    const jobSel = msJob ? msJob.getSelected() : [];
    return jobSel.length
      ? new Set((baseData.jobs || []).filter(j => jobSel.includes(j.title)).map(j => j.id))
      : null;
  }
  // While the numbers are narrowed (Job filter or department restriction), a recruiter stays listed when they have ANY figure
  // left in them — applications, an owned or sourced opening, stage history, an offer, a Joining Pending case or a drop, as
  // recruiter or sourcer. It used to test stage history alone, which dropped someone who owns an opening on the job.
  function namesWithFigures(d) {
    const s = new Set();
    const add = (n) => { if (n) s.add(n); };
    const nonEmpty = (o) => !!o && Object.keys(o).length > 0;
    (d.recruiters || []).forEach(r => { if ((r.byJob || []).length) add(r.name); });
    [d.ownedSeatsByRecruiterQ, d.ownedSeatsBySourcerQ].forEach(m => { for (const n in (m || {})) if (Object.values(m[n] || {}).some(nonEmpty)) add(n); });
    Object.values(d.ownedSeatsPairQ || {}).forEach(byJob => Object.values(byJob || {}).forEach(list => (list || []).forEach(p => { add(p.r); add(p.s); })));
    const sr = d.stageRollups || {};
    [sr.tofuByRecruiterJob, sr.r1ByRecruiterJob, sr.throughputByRecruiterJob, sr.timeInStageByRecruiterJobQ, sr.waitingByRecruiterJobQ, d.appReviewDwellByRecruiterJob]
      .forEach(m => { for (const n in (m || {})) if (nonEmpty(m[n])) add(n); });
    ['offerEvents', 'joiningPendingCases', 'dropEvents'].forEach(k => (d[k] || []).forEach(e => { add(e.recruiter); add(e.sourcer); }));
    return s;
  }
  let _inScope = null, _inScopeOf = null;
  function recWorkedSelectedJob(name) {
    if (!narrowed()) return true;
    if (_inScopeOf !== data) { _inScopeOf = data; _inScope = namesWithFigures(data); }
    return _inScope.has(name);
  }
  function onJobChange() {
    const ids = selectedJobIds();
    bindData(ids ? scopeData(baseData, { jobIds: ids }) : baseData);
    renderAll();
  }

  // Recruiters the user has EXPLICITLY filtered out with the Pod / Recruiter / Job multi-selects — as
  // opposed to the ones this tab ALWAYS hides (recruiters not here this quarter, no pod set).
  // The JP Cases table needs the difference: a default exclusion still has to be accounted for somewhere,
  // an explicit one must not be quietly re-added under an "unassigned" label.
  function explicitlyFiltered(name, q) {
    const pods = msPod ? msPod.getSelected() : [];
    const names = msRec ? msRec.getSelected() : [];
    if (names.length && !names.includes(name)) return true;
    if (pods.length && !pods.includes(podOf(name, q))) return true;
    if (!recWorkedSelectedJob(name)) return true;
    return false;
  }

  function getFilteredRecs(q = selQuarter()) {   // #133: the Joining Pending list asks for today's quarter
    const pods = msPod ? msPod.getSelected() : [];
    const names = msRec ? msRec.getSelected() : [];
    return allRecs.filter(r => {
      // #18 (2026-08-23): "Unassigned" is not a recruiter — it is every candidate nobody is tagged on. It was
      // appearing as a row and a bar in every table and chart, where it reads like a person with a workload.
      // It already has its own Data Hygiene tab, which builds its own list and is untouched by this.
      if (r.name === 'Unassigned') return false;
      // #23 (2026-08-24): a recruiter with NO pod set for this quarter is excluded from every row AND every
      // total on this tab. An "Unassigned" pod row reads like a real team with a real workload, which it is
      // not. Nobody is lost — Data Hygiene → Pod Not Set carries their numbers, and the note under the
      // heading says the exclusion is happening.
      // ⚠ #11 exception: a sourcer-only person (an agency, a freelancer) legitimately has no pod yet — they
      // only just entered the roster by earning credit. Excluding them here would take credit off the
      // recruiter and then drop it on the floor, so the pod totals would stop reconciling with the opening
      // totals. groupByPod puts them under "Others" until a pod is set for them in Metric Configuration.
      if (!r.sourcerOnly && podOf(r.name, q) === 'Unassigned') return false;
      // #121 (Jerin, 14 Sep 2026): the "Hide zero-app" and "Not here this quarter" tick-boxes are gone. A recruiter
      // who was not here in the selected quarter is ALWAYS left out (#111: by Started on / Left on dates, else today's
      // Ashby account); anyone in closing still tagged to them lands in the JP Cases "No recruiter in this view" group.
      // Zero-application recruiters are no longer hidden, so someone who owns openings before their first candidate
      // keeps their Goal on the tab.
      // ⚠ #11: a sourcer-only person holds no Ashby recruiter seat, so the account test would delete the very rows
      // the credit split just created — exempt them.
      if (!r.sourcerOnly && !presentIn(r, q)) return false;
      if (names.length && !names.includes(r.name)) return false;
      if (pods.length && !pods.includes(effectivePod(r, q))) return false;   // #11: match how the row is grouped
      if (!recWorkedSelectedJob(r.name)) return false;
      return true;
    });
  }

  function renderAll() {
    const recs = getFilteredRecs();
    const groups = groupByPod(recs, selQuarter());

    // fulfilRows() runs once per table (Non-Sales, then Sales) and both write into lastFulfil, so it is
    // cleared HERE — once per render — not inside fulfilRows, which would wipe the first table's rows.
    lastFulfil = {};

    // #127a (Jerin, 15 Sep 2026): this tab has no Quarter: All — goals, pods and capacity belong to a quarter and people move between Sales
    // and Non-Sales, so quarters are never added together. Every panel is on the one quarter picked (the old Quarter: All note is gone).
    const per = selQuarters();
    const rg = selRange(), whole = coversQuarters(rg, per);   // #129: the From / To range, and whether it is the whole quarter
    const perTxt = rangeText(rg, per);
    const spEl = document.getElementById('recScreenPeriod');
    if (spEl) spEl.textContent = `Showing ${perTxt}.`;

    // ===== Momentum (own POD/date filters) =====
    renderVelocity();

    // ===== Screening Efficiency — ONE R1 set (Jerin, 2026-08-29) =====
    //   Added at R1 = the candidate was ACTIONED at R1: an interview scheduled there, OR an assignment
    //                 triggered while they sat there. Either counts; both together still count once.
    //                 Cancellations excluded. One per candidate per role per quarter.
    //   Progressed  = of those, the ones who reached R2 or beyond.
    // 🚨 Computed in the PIPELINE (Tofu.gs), because it needs candidate identity — the rollups this file
    // reads are only totals. HM Review and Online Assessment columns were removed here deliberately:
    // this panel is R1 only, and both still count on Momentum through ToFU.
    // ⚠ It will NOT match the old per-stage 'Added', which counted stage ENTRIES and re-counted anyone who
    // came back round, and it is not Momentum's R1 either — Momentum only credits R1 when it was the
    // candidate's FIRST signal, so its R1 is a subset of this one.
    const r1Sr = actData().stageRollups || null;   // #125: only jobs with an opening opened in the period
    // #129: a narrower From / To range reads the day twins (r1By…D) — each candidate counted once per role per quarter, on the day of their
    // first R1 action, so the days add up to the quarter. A rollups file from before 15 Sep has none, and the panel then says so.
    const r1Day = !whole;
    const r1Store = (r1Sr && (r1Day ? r1Sr.r1ByRecruiterD : r1Sr.r1ByRecruiter)) || null;
    const r1JobStore = (r1Sr && (r1Day ? r1Sr.r1ByRecruiterJobD : r1Sr.r1ByRecruiterJob)) || null;
    const r1Sum = (byQ) => {
      const acc = { added: 0, cleared: 0 };
      if (!byQ) return acc;
      if (r1Day) { const s = sumDayFields(byQ, rg); acc.added = s.added || 0; acc.cleared = s.cleared || 0; return acc; }
      if (per && per.length) per.forEach(qq => { const c = byQ[qq]; if (c) { acc.added += c.added || 0; acc.cleared += c.cleared || 0; } });
      else Object.keys(byQ).forEach(qq => { const c = byQ[qq]; acc.added += c.added || 0; acc.cleared += c.cleared || 0; });
      return acc;
    };
    const r1Of = (name) => r1Sum(r1Store && r1Store[name]);
    const r1OfJob = (name, j8) => r1Sum(r1JobStore && r1JobStore[name] && r1JobStore[name][j8]);
    const r1Cells = (v, bold) => {
      const w = bold ? ' style="font-weight:600"' : '';
      return `<td${w}>${v.added > 0 ? v.added : '<span class="zero">0</span>'}</td>`
        + `<td${w}>${v.cleared > 0 ? v.cleared : '<span class="zero">0</span>'}</td>`
        + `<td class="${v.added ? pctClass(pct(v.cleared, v.added)) : 'zero'}">${v.added ? pct(v.cleared, v.added) + '%' : DASH}</td>`;
    };
    const screenBody = document.getElementById('recScreenBody');
    if (screenBody) {
      if (!r1Store) {
        // No R1 field yet. Say so rather than falling back to the per-stage counts, which answer a
        // different question and would sit under this heading as a lie.
        screenBody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:1rem">R1 screening figures appear after the next stage-history refresh.</td></tr>`;
      } else {
        let html = '';
        groups.forEach((G, pi) => {
          const podAgg = { added: 0, cleared: 0 };
          const recVals = G.recs.map(r => { const v = r1Of(r.name); podAgg.added += v.added; podAgg.cleared += v.cleared; return v; });
          html += `<tr class="lvl-pod" data-pod="${pi}" data-exp="0" style="cursor:pointer;background:var(--border-light)">
            <td style="font-weight:600">${CARET}${G.pod}<span style="color:var(--muted);font-weight:400;font-size:0.6875rem;margin-left:0.375rem">${G.recs.length}</span></td>${r1Cells(podAgg, true)}</tr>`;
          G.recs.forEach((r, ri) => {
            const rk = `s${pi}-${ri}`;
            html += `<tr class="lvl-rec" data-pod="${pi}" data-rec="${rk}" data-exp="0" style="display:none;cursor:pointer">
              <td style="padding-left:1.625rem;font-weight:500">${CARET}${r.name}${inactiveTag(r)}</td>${r1Cells(recVals[ri], false)}</tr>`;
            // Only roles that actually saw R1 activity in the period — a recruiter's older roles are not
            // listed as a column of zeros (Jerin, 2026-08-26: "I don't think Oshin has these many roles").
            const mine = (r1JobStore && r1JobStore[r.name]) || {};
            const jobRows = Object.keys(mine).map(j8 => ({ j8, v: r1OfJob(r.name, j8) }))
              .filter(x => x.v.added > 0 || x.v.cleared > 0)
              .sort((a, b) => b.v.added - a.v.added);
            if (jobRows.length) {
              jobRows.forEach(({ j8, v }) => {
                const jm = jobById[j8];
                html += `<tr class="lvl-stage" data-pod="${pi}" data-parent-rec="${rk}" style="display:none">
                  <td style="padding-left:3.25rem;color:var(--muted)">${(jm && jm.title) || j8}</td>${r1Cells(v, false)}</tr>`;
              });
            } else {
              html += `<tr class="lvl-stage" data-pod="${pi}" data-parent-rec="${rk}" style="display:none">
                <td style="padding-left:3.25rem;color:var(--muted);font-style:italic">No R1 activity in this period</td>${'<td>' + DASH + '</td>'.repeat(3)}</tr>`;
            }
          });
        });
        screenBody.innerHTML = html || `<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:1rem">No recruiters match the filter.</td></tr>`;
        wireVelTree(screenBody);
      }
    }

    // ===== Joining Conversion =====
    const joinBody = document.getElementById('recJoinBody');
    if (joinBody) {
      const CM = convMaps(selQuarter(), selRange());
      const cOf = (name) => CM.byRec[name] || { o: 0, j: 0, p: 0, dr: 0 };
      const convCell = (v) => {
        if (!v.o) return `<td class="gapcell"><span class="zero">—</span></td>`;
        const pct = Math.round(((v.j + v.p) / v.o) * 100);
        const band = pct >= 50 ? '' : (pct >= 20 ? ' mid' : ' low');
        return `<td class="gapcell"><span class="deltacell"><span class="track"><i class="conv${band}" style="width:${pct}%"></i></span>`
          + `<span class="dnum">${pct}%</span></span></td>`;   // #153: the "N of N" caption is gone — Offered, Joined and Joining pending are all columns on this same row
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
      groups.forEach((G, gi) => {
        const shown = G.recs.filter(r => cOf(r.name).o > 0);
        if (!shown.length) return;
        const tot = shown.reduce((a, r) => add(a, cOf(r.name)), { o: 0, j: 0, p: 0, dr: 0 });
        html += `<tr class="pod-header" data-g="j${gi}" data-exp="0" style="cursor:pointer;background:var(--border-light)">
          <td style="font-weight:600">${CARET}${G.pod}<span style="color:var(--muted);font-weight:400;font-size:0.6875rem;margin-left:0.375rem">${shown.length}</span></td>${cells(tot, true)}</tr>`;
        shown.forEach(r => {
          html += `<tr class="leaf" data-g="j${gi}" style="display:none"><td style="padding-left:1.875rem;font-weight:500">${r.name}${inactiveTag(r)}</td>${cells(cOf(r.name), false)}</tr>`;
        });
      });
      joinBody.innerHTML = html || `<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:1rem">Nothing in play this quarter for the recruiters shown.</td></tr>`;
      wirePodTree(joinBody);
    }

    // ===== Position Fulfilment (Non-Sales offers / Sales hires) =====
    // THREE sections (2026-09-07, Jerin). 'Others' is its own table using the SALES counting rule
    // (no earlier-quarter subtraction) because that work is billed per joiner. Each recruiter sits in
    // exactly ONE pod, so exactly one table — nothing is double-counted in any total or chart.
    const salesGroups    = groups.filter(G => G.pod === 'Sales');
    const othersGroups   = groups.filter(G => G.pod === 'Others');
    const nonSalesGroups = groups.filter(G => G.pod !== 'Sales' && G.pod !== 'Others');

    // Funnel columns. Non-Sales (mode 'offer'): Assigned(HC|Score) · Target Score · Offered(HC|Score) ·
    // Joining Pending(HC|Score) · Gap Score. Sales (mode 'hire') adds Hired(HC|Score) before Gap.
    // Assigned/Offered/Hired HC+Score are LIVE from recruiters[].byJob × the score engine. Target = min(Capacity,
    // Assigned Score) (Capacity per quarter from Metric Config; 0 until set). Gap = max(0, Target − Achieved),
    // Achieved = Offered Score (Non-Sales) / Hired Score (Sales). Joining Pending is recruiter-level only (offer
    // pass gives a count, not per-job) → HC at recruiter/pod rows, Score unattributable (—). Tree = Pod → Recruiter → Job.
    // ===== Fulfilment v2 (2026-08-22) =====
    // Goal replaces Assigned; Capacity is the RAW configured capacity (the old Target capped it at the
    // assigned work, which would make utilisation read 100% for everyone). Gap is measured against Goal,
    // and Capacity Utilisation is OUTPUT over capacity - what was delivered against what could have been.
    // ⚠ The colour sense is the opposite of a load metric: past 100% is over-delivery (good); under 70% is
    // under-use, which is the thing worth acting on.
    function fulfilRows(gs, mode) {
      const q = selQuarter();
      const isSales = mode === 'hire';
      // 1 label + Goal(2) + Capacity(1) + Joined(2) + JP total(1) + JP A(2) + JP B(2) + Drop(2) + Gap(2)
      // + Utilisation(1) = 16 on Non-Sales.
      // #39: the Sales/Others tables split Joined the way JP is split — Total(1) + A(2) + B(2) replaces the
      // old Joined(2) — so they carry 3 more columns. Keep this in step with the <thead> of those tables.
      const ncol = (mode === 'hire') ? 19 : 16;

      // 🚨 THE OUTCOME IS DATED FROM offerEvents, NOT FROM byJob (fixed 2026-08-22).
      // recruiters[].byJob carries {jobId,title,department,total,offer,hired} and NO date of any kind, so
      // reading Joined/Offered from it showed every 2026 hire under whichever quarter was selected — the Sales
      // pod read 162 joiners for Q3 when the true figure is 11. offerEvents has a real date per candidate:
      //   Sales     → accepted offers whose START DATE falls in the quarter (they actually joined)
      //   Non-Sales → offers whose DECIDED date falls in the quarter (the offer was made)
      // Score comes from the event's own department/title/level/complexity, same grid as everywhere else.
      const qOf = (ds) => (ds && ds.length >= 7) ? `${ds.slice(0, 4)}-Q${Math.floor((+ds.slice(5, 7) - 1) / 3) + 1}` : null;
      const rg = selRange();   // #129: Joined, Drop, Goal and Capacity below all follow the From / To range
      const OM = outcomeMaps(q, rg);
      const JP = jpMaps(q, isSales);
      const Z = { hc: 0, sc: 0, so: 0 };
      const jpOf = (rec) => ({ t: JP.total[rec] || Z, a: JP.bucketA[rec] || Z, b: JP.bucketB[rec] || Z });
      const jpOfJob = (rec, title) => { const k = rec + '|' + (title || '');
        return { t: JP.totalJ[k] || Z, a: JP.bucketAJ[k] || Z, b: JP.bucketBJ[k] || Z }; };
      // #129: Non-Sales reads its Joined from joinByRec below. These maps also used to carry Non-Sales offers by DECIDED date — Ashby's bulk
      // data-entry stamp (CLAUDE.md date trap 2) — and all that did was add empty job rows under Non-Sales recruiters.
      const outByRec = isSales ? OM.sales : {};
      const outByRecJob = isSales ? OM.salesJob : {};
      const outOf = (rec) => outByRec[rec] || { hc: 0, sc: 0, so: 0 };
      const outOfJob = (rec, jid) => outByRecJob[rec + '|' + (jid || '').slice(0, 8)] || { hc: 0, sc: 0, so: 0 };
      // #39: the Joined split, shaped exactly like jpOf/jpOfJob so the two blocks render through the same
      // helper. Sales/Others only — Non-Sales keeps a single Joined pair (its own split is a different
      // question entirely: it varies the START date, not the opening. See the header comments.)
      const jxOf = (rec) => ({ t: outByRec[rec] || Z, a: (OM.salesA || {})[rec] || Z,
                               b: (OM.salesB || {})[rec] || Z, u: (OM.salesU || {})[rec] || Z });
      const jxOfJob = (rec, jid) => { const k = rec + '|' + (jid || '').slice(0, 8);
        return { t: outByRecJob[k] || Z, a: (OM.salesAJob || {})[k] || Z,
                 b: (OM.salesBJob || {})[k] || Z, u: (OM.salesUJob || {})[k] || Z }; };

      // Non-Sales also shows Joined · total — actual joiners, dated by START date, the same basis Sales uses.
      // Its two sub-columns (this-quarter vs later-quarter opening) split THIS number once offers carry an
      // opening; until then the total stands on its own rather than the column sitting empty.
      const joinByRec = {}, joinByRecJob = {};
      // NON-SALES ONLY: minus anyone linked to an EARLIER quarter's opening — the same subtraction the
      // Joining Pending column uses, so both columns describe THIS quarter's work.
      // ⚠ SALES deliberately takes NO subtraction: its goal is joiners regardless of when the opening was
      // raised (Jerin, 2026-08-26). Same word, two rules, on purpose — do not "fix" it.
      if (!isSales) (data.offerEvents || []).forEach(e => {
        const rec = e.recruiter; if (!rec || !e.accepted || e.appStatus !== 'Hired') return; // Joined = moved to Hired, not just an accepted offer
        if (!inRange(e.startDate, rg)) return;   // #129: started inside the From / To range (which sits inside the quarter)
        if (e.openingQuarter && e.openingQuarter < q) return;
        const sc = scoreForRole({ department: e.department, title: e.jobTitle, level: e.level, complexity: e.complexity }, q);
        addCredit(joinByRec, joinByRecJob, e.jobId8, rec, e.sourcer, e.department, sc);   // #11
      });
      // Seats actually opened on a job in the SELECTED quarter, from openingBuckets — the only
      // quarter-scoped source of demand we have — SPLIT EQUALLY across the recruiters who work that job.
      // Without the split, evergreen roles blew the totals apart: Program Advisor - US (AI Programs) has 15
      // Q3 seats and 12 recruiters on it, so the Sales pod counted 146 seats where the true figure is 19.
      // An equal share is a convention, not a measurement — the data cannot say who owns which seat — but it
      // keeps a pod's Goal close to the seats it is actually carrying.
      const obk = data.openingBuckets || {};
      const sharers = {};
      recs.forEach(r => (r.byJob || []).forEach(bj => {
        const k = (bj.jobId || '').slice(0, 8); if (!k) return;
        (sharers[k] || (sharers[k] = new Set())).add(r.name);
      }));
      const seatsOf = (jid) => {
        const k = (jid || '').slice(0, 8);
        const b = obk[k];
        const qq = b && b.quarters && b.quarters[q];
        const total = qq ? (qq.total || 0) : 0;
        if (!total) return 0;
        const n = (sharers[k] && sharers[k].size) || 1;
        return total / n;
      };
      // Shared seats produce fractions; show at most one decimal and never a trailing '.0'.
      const seatFmt = (v) => (v == null ? null : (Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1)));
      // DROP = they reached an offer and then LEFT — BOTH SIDES, as asked: the candidate turning us down
      // AND the ones we withdrew, or who were archived while the offer was still open.
      // The test is the APPLICATION being archived, not the offer's own status. Of 92 archived offers,
      // 77 read CandidateRejected (candidate declined) and 15 were still sitting at
      // WaitingOnCandidateResponse/WaitingOnApprovalStart when the application was archived. Both count.
      //
      // 🚨 ATTRIBUTED BY attrQuarter — the quarter the WORK was live, not the quarter the record was closed.
      // attrQuarter is built in the pipeline, best source first:
      //   1. the offer's REAL opening, when it has one (9% of offers; 0% of drops today)
      //   2. else the quarter the candidate first ENTERED Ref Check / Documentation / Offer, read from the
      //      real stage transitions in application.listHistory
      //   3. else the archive date, so no row is ever silently unplaceable
      // Only (1) is a measurement. (2) is a CONVENTION agreed with Jerin: openings are meant to be closed
      // off each quarter, so the quarter a candidate reached the late stages is the quarter of the seat
      // they were filling. It is not a recovery of the true opening — say so on screen.
      //
      // ⚠ Do NOT go looking for the real opening again. Three routes were tested and every one returns zero
      // for archived applications: the live application.opening link, offer.latestVersion.openingId, and the
      // full offer.info version history (92 calls, 144 versions, 0 links). And only 58 of 644 offers carry an
      // opening at all — 1% in Business - India, where 41 of the 92 drops sit — so the link could never have
      // carried this metric even if archiving preserved it. That is a process gap, not a code problem.
      // ⚠ Attribution reaches back into 2025 for some drops. Those 2025 buckets are PARTIAL, because the
      // pipeline only pulls offers decided in the current year. Accepted deliberately (Jerin, 2026-08-22).
      //
      // ⚠ Do NOT match offerStatus against 'Declined'. Per the offer.list reference, offerStatus is
      // WaitingOnApprovalStart|WaitingOnOfferApproval|WaitingOnApprovalDefinition|WaitingOnCandidateResponse|
      // CandidateRejected|CandidateAccepted|OfferCancelled. 'Declined' belongs to the SEPARATE
      // acceptanceStatus field (Accepted|Declined|Pending|Created|Cancelled). Confusing the two is exactly
      // why this metric read zero three times.
      const dropByRec = {}, dropByRecJob = {};
      dropRows(data).forEach(e => {
        const rec = e.recruiter; if (!rec) return;
        if (!dropIn(e, rg, [q])) return;   // #129: by the day they first reached Ref Check / Documentation / Offer
        const sc = scoreForRole({ department: e.department, title: e.jobTitle, level: e.level, complexity: e.complexity }, q);
        // #11: a sourcer carries their share of the bad news as well as the good ("split is everywhere").
        // ⚠ Drops found via stage history have their sourcer recovered from appMap in the pipeline, so a few
        // older archived rows can still be null — they then fall through as recruiter-only, which is correct.
        addCredit(dropByRec, dropByRecJob, e.jobId8, rec, e.sourcer, e.department, sc);
      });
      const dropOf = (rec) => dropByRec[rec] || { hc: 0, sc: 0, so: 0 };
      const dropOfJob = (rec, jid) => dropByRecJob[rec + '|' + (jid || '').slice(0, 8)] || { hc: 0, sc: 0, so: 0 };
      const joinOf = (rec) => joinByRec[rec] || { hc: 0, sc: 0, so: 0 };
      const joinOfJob = (rec, jid) => joinByRecJob[rec + '|' + (jid || '').slice(0, 8)] || { hc: 0, sc: 0, so: 0 };
      const c = x => (x == null ? DASH : x);
      const pctOf = (num, den) => (den > 0 ? Math.round((num / den) * 100) : null);

      // Gap bar: filled = (Goal - Gap) / Goal, so the bar can never disagree with the number beside it.
      const gapCell = (v) => {
        if (v.gSc == null) return `<td class="score">${DASH}</td>`;
        const fill = v.aSc > 0 ? Math.max(0, Math.min(100, Math.round(((v.aSc - v.gSc) / v.aSc) * 100))) : 0;
        const cls = v.gSc === 0 ? 'done' : (fill < 75 ? 'short' : '');
        // #153 (Jerin, 19 Sep 2026): the caption under this number is GONE — it read "219 of 441 · 50%",
        // "goal met" or "no goal set". The bar and the number carry the shortfall on their own.
        // ⚠ If it is ever brought back, derive it from Goal MINUS Gap and never from the raw outcome: at pod
        // level Gap is the SUM of each recruiter's shortfall, so a pod whose total output beats its total goal
        // still carries a real gap, and quoting the raw outcome there produced "2252 of 1313 · 81%" — three
        // numbers that disagreed with each other.
        // #19 (2026-08-23): same treatment as the HM Delta cell — a slim track that fills with the SHORTFALL,
        // number beside it, so the bar and the number can never point in opposite directions.
        const gapPct = v.aSc > 0 ? Math.max(0, Math.min(100, Math.round((v.gSc / v.aSc) * 100))) : 0;
        return `<td class="score gapcell"><span class="deltacell"><span class="track"><i style="width:${gapPct}%"></i></span>`
          + `<span class="dnum ${v.gSc === 0 ? 'none' : (gapPct >= 50 ? 'high' : '')}">${Math.round(v.gSc)}</span></span></td>`;
      };
      // Utilisation: never divide by zero - no capacity set renders as a dash, not Infinity.
      const utilCell = (v) => {
        if (narrowed()) return `<td title="${NARROW_CAP_NOTE}">${DASH}</td>`;   // #120a/#120b option C
        const u = pctOf(v.uSc, v.capSc);
        if (u == null) return `<td title="No capacity set for this quarter, so utilisation cannot be worked out.">${DASH}</td>`;
        const cls = u >= 100 ? 'over' : (u >= 70 ? 'well' : 'under');
        return `<td><span class="util ${cls}">${u}%</span><span class="sublab">${v.uSc} of ${v.capSc}</span></td>`;
      };

      // #108: the "+N sourced" second line — what this person SOURCED for someone else's row. Never added to the
      //   figure above it, so every HC column still adds up to real people. Blank when there is nothing.
      const srcSub = (n) => (n > 0 ? `<span class="sublab">+${seatFmt(n)} sourced</span>` : '');

      // #39: Joined, split the same way and rendered by the same shape as jpCells — Total, then the two buckets.
      // #153 (Jerin, 19 Sep 2026): the "<N> unlinked" caption under bucket B is GONE. The joiners it counted —
      // people with no opening on the offer and none found on the hire — are still listed in full on
      // Data Hygiene ➡ Hired Missing Opening Link, which is where they can actually be fixed.
      const joinedCells = (v) => {
        const j = v.jx || { t: { hc: 0, sc: 0 }, a: { hc: 0, sc: 0 }, b: { hc: 0, sc: 0 }, u: { hc: 0, sc: 0 } };
        const pair = (x) => `<td>${x.hc || `<span class="zero">0</span>`}</td><td class="score">${x.sc ? Math.round(x.sc) : `<span class="zero">0</span>`}</td>`;
        return `<td style="font-weight:600">${j.t.hc || `<span class="zero">0</span>`}${srcSub(j.t.so)}</td>` + pair(j.a) + pair(j.b);
      };

      // Joining Pending: the total, then the two buckets defined relative to the selected quarter.
      const jpCells = (v) => {
        const j = v.jp || { t: { hc: 0, sc: 0 }, a: { hc: 0, sc: 0 }, b: { hc: 0, sc: 0 } };
        const pair = (x) => `<td>${x.hc || `<span class="zero">0</span>`}</td><td class="score">${x.sc ? Math.round(x.sc) : `<span class="zero">0</span>`}</td>`;
        return `<td style="font-weight:600">${j.t.hc || `<span class="zero">0</span>`}${srcSub(j.t.so)}</td>` + pair(j.a) + pair(j.b);
      };
      // Drop carries its rate as a caption: of everything that reached a conclusion or is about to, what
      // share fell out. Denominator includes Drop itself, per Jerin 2026-08-22.
      const dropCells = (v) => {
        const j = v.jp || { t: { hc: 0 } };
        const den = (v.xHC || 0) + (j.t.hc || 0) + (v.dHC || 0);
        const pct = den > 0 ? Math.round(((v.dHC || 0) / den) * 100) : null;
        // #153 (Jerin, 19 Sep 2026): "of outcomes" is gone — the percentage on its own is enough. What it is a
        // percentage OF is spelled out in the definitions block under the panel.
        const sub = v.dHC > 0 && pct != null ? `<span class="sublab">${pct}%</span>` : '';
        return `<td class="${v.dHC > 0 ? 'bad' : ''}">${v.dHC ? v.dHC : `<span class="zero">0</span>`}${srcSub(v.dSo)}${sub}</td>`
          + `<td class="score">${v.dSc ? Math.round(v.dSc) : `<span class="zero">0</span>`}</td>`;
      };

      // #24 (Jerin, asked twice): the Offered column is GONE from Non-Sales. Both tables now show Joined as
      // the outcome. Do not put Offered back.
      const cells = (v, bold) => {
        const w = bold ? ' style="font-weight:600"' : '';
        // #148 option B (Jerin, 19 Sep 2026): Capacity and Capacity Utilisation now sit together at the front.
        // Capacity Utilisation used to be the 16th column and fell outside the panel; beside the capacity it
        // is measured against, it is both readable and in view. THE ORDER HERE MUST MATCH THE HEADER ROWS
        // ABOVE — they are written out by hand, so changing one without the other silently shifts every
        // number one column sideways.
        return (narrowed() ? `<td class="score" title="${NARROW_CAP_NOTE}">${DASH}</td>` : `<td class="score">${c(v.capSc)}</td>`)   // Capacity
          + utilCell(v)                                                           // Capacity used
          + `<td${w}>${c(seatFmt(v.aHC))}${srcSub(v.aSo)}</td><td class="score">${c(Math.round(v.aSc))}</td>`      // Goal heads / score
          + (isSales                                                          // #39: Sales/Others split Joined
              ? joinedCells(v)                                                  //   total + prev-qtr + current-qtr
              : `<td${w}>${c(v.xHC)}${srcSub(v.xSo)}</td><td class="score">${c(v.xSc)}</td>`)   //   Non-Sales keeps one pair
          + jpCells(v)                                                          // Joining Pending: total + 2 buckets
          + dropCells(v)                                                        // Drop HC / Score + % subtext
          + `<td${w}>${c(seatFmt(v.gHC))}${srcSub(v.gSo)}</td>` + gapCell(v);                    // Delta heads / score + bar
      };

      const recFulfil = (r) => {
        // #1 opening-first: Goal = Σ score of the openings this recruiter OWNS in the selected quarter (the
        // opening's native-Roles Recruiter in Ashby) — NOT one point per job they have ever touched, and no
        // longer an equal split of a role's seats. Ownership is exact, so a role two recruiters work counts
        // each opening once, for its owner only.
        // Fallback (no owned field yet): the old seats-OPENED-this-quarter figure, split equally across the
        // recruiters who work the role — a convention, not a measurement, which is why some Goals showed a
        // decimal. The owned basis removes both the split and the decimals.
        // #100: ONE helper computes the Goal for the recruiter row AND for each of its per-job rows, so the
        // rows can never disagree with the row above them (Rule 3 — the table computes, everything else reads).
        const g0 = goalOf(r, q, null); let aHC = g0.hc, aSc = g0.sc;
        const o = outOf(r.name), jn = joinOf(r.name), dr = dropOf(r.name), jp = jpOf(r.name);
        // #120a/#120b (Jerin, 14 Sep 2026 — option C): Capacity is one number per person per quarter and cannot be split by job
        // or department, so while the numbers are narrowed Capacity and Capacity Utilisation both read "—" rather than set part of
        // someone's work against all of their capacity. 0 also drops the chart's Capacity line (drawn only when cap > 0) and
        // stops capacity alone from holding a row open.
        const capSc = narrowed() ? 0 : capacityFor(r.name, q);   // #129 (Jerin 1A): scaled by the days of the quarter inside From / To
        // Outcome column = Joined on BOTH tables.
        const xHC = isSales ? o.hc : jn.hc, xSc = isSales ? o.sc : jn.sc;
        // What Gap and Capacity Utilisation are measured against (Jerin, 2026-08-24):
        //   Sales     → Joined
        //   Non-Sales → Joined + Joining Pending  (the work is delivered once the person is in closing)
        const uHC = isSales ? xHC : xHC + jp.t.hc, uSc = isSales ? xSc : xSc + jp.t.sc;
        // #108: the "+N sourced" counts, on the SAME basis as the figures they sit under — so the Delta line is sourced
        //   Goal minus sourced Achieved, exactly as Delta is Goal minus Achieved (Jerin: "Its the overall that matters -
        //   not opening to opening gap").
        const aSo = g0.so || 0, xSo = (isSales ? o.so : jn.so) || 0, uSo = isSales ? xSo : xSo + (jp.t.so || 0);
        return { aHC, aSc, capSc, xHC, xSc, uHC, uSc, dHC: dr.hc, dSc: dr.sc, jp,
                 jx: isSales ? jxOf(r.name) : null,   // #39
                 gHC: Math.max(0, aHC - uHC), gSc: Math.max(0, aSc - uSc),
                 aSo, xSo, uSo, dSo: dr.so || 0, gSo: Math.max(0, aSo - uSo) };
      };
      // A recruiter with no capacity AND nothing attributed is noise; one with no capacity but real
      // offers/hires is a hygiene problem, not a row to hide - it surfaces in Data Hygiene instead.
      // dHC is in the test too: a recruiter whose only activity this quarter was people dropping out has
      // had a real (bad) quarter, and hiding that row would quietly delete the worst news in the table.
      // ⚠ #11: this used to test HEADCOUNT only. Under the head rule a sourcer can earn real SCORE while the
      // head stays with the recruiter (every split, since #108), so a
      // headcount-only test hid exactly the rows the credit had just moved to — the credit left the recruiter
      // and appeared nowhere. Score counts as activity too.
      const worthShowing = (v) => v.capSc > 0 || v.xHC > 0 || v.xSc > 0 || (v.jp && (v.jp.t.hc > 0 || v.jp.t.sc > 0))
        || v.aHC > 0 || v.aSc > 0 || v.dHC > 0 || v.dSc > 0
        || v.aSo > 0 || v.xSo > 0 || v.dSo > 0 || (v.jp && v.jp.t.so > 0);   // #108: a sourcer-only row carries only these

      let html = '';
      gs.forEach((G, pi) => {
        const podAgg = { aHC: 0, aSc: 0, capSc: 0, xHC: 0, xSc: 0, uHC: 0, uSc: 0, dHC: 0, dSc: 0, gHC: 0, gSc: 0,
                         aSo: 0, xSo: 0, uSo: 0, dSo: 0, gSo: 0,   // #108
                         jp: { t: { hc: 0, sc: 0, so: 0 }, a: { hc: 0, sc: 0, so: 0 }, b: { hc: 0, sc: 0, so: 0 } },
                         // #39: roll the Joined split up the same way as the JP one, or every pod row would
                         // print 0 in three columns while its recruiters underneath show real numbers — the
                         // exact bug the JP roll-up comment below was written about.
                         jx: { t: { hc: 0, sc: 0, so: 0 }, a: { hc: 0, sc: 0, so: 0 }, b: { hc: 0, sc: 0, so: 0 }, u: { hc: 0, sc: 0, so: 0 } } };
        const shown = [];
        G.recs.forEach(r => { const a = recFulfil(r); if (!worthShowing(a)) return;
          // ONE source for the chart and the table. The chart used to recompute its own target, which is how
          // it once ended up showing lifetime scores under a quarter heading. It now reads this.
          lastFulfil[r.name] = { goalSc: a.aSc, capSc: a.capSc, achievedSc: a.uSc, shortSc: a.gSc, sales: isSales };
          ['aHC', 'aSc', 'capSc', 'xHC', 'xSc', 'uHC', 'uSc', 'dHC', 'dSc', 'gHC', 'gSc', 'aSo', 'xSo', 'uSo', 'dSo', 'gSo'].forEach(k => podAgg[k] += a[k]);
          // ⚠ Roll the JP buckets up too. The old key list carried a 'jpHC' that recFulfil never returned, so
          // every pod row read 0 in all three JP columns while its recruiters underneath showed real numbers.
          ['t', 'a', 'b'].forEach(k => { podAgg.jp[k].hc += a.jp[k].hc; podAgg.jp[k].sc += a.jp[k].sc; podAgg.jp[k].so += a.jp[k].so || 0; });
          if (a.jx) ['t', 'a', 'b', 'u'].forEach(k => { podAgg.jx[k].hc += a.jx[k].hc; podAgg.jx[k].sc += a.jx[k].sc; podAgg.jx[k].so += a.jx[k].so || 0; });   // #39
          shown.push({ r, a }); });
        if (!shown.length) return;
        html += `<tr class="lvl-pod" data-pod="${pi}" data-exp="0" style="cursor:pointer;background:var(--border-light)">
          <td style="font-weight:600">${CARET}${G.pod}<span style="color:var(--muted);font-weight:400;font-size:0.6875rem;margin-left:0.375rem">${shown.length}</span></td>${cells(podAgg, true)}</tr>`;
        shown.forEach(({ r, a }, ri) => {
          const rk = `${mode}${pi}-${ri}`;
          html += `<tr class="lvl-rec" data-pod="${pi}" data-rec="${rk}" data-exp="0" style="display:none;cursor:pointer">
            <td style="padding-left:1.625rem;font-weight:500">${CARET}${r.name}${inactiveTag(r)}</td>${cells(a, false)}</tr>`;
          // #1: the per-job rows must include roles the recruiter OWNS openings on even where they never
          // tagged an application, or the job Goals would not sum to the recruiter row above. Merge byJob
          // with the owned-opening jobs for this quarter, then sort.
          const bjByJ8 = {}; (r.byJob || []).forEach(bj => { const k = (bj.jobId || '').slice(0, 8); if (k) bjByJ8[k] = bj; });
          // #100: merge in every job this person has a Goal on — as Recruiter OR as Sourcer. Sourced-only
          // roles were missing before, so a sourcer's job rows could not add up to their row above.
          goalJobsOf(r, q).forEach(j8 => { if (!bjByJ8[j8]) bjByJ8[j8] = { jobId: j8 }; });
          // 🚨 #120 (14 Sep 2026): ...and every job they hold CREDIT on (a sourcer's half of a joiner, a person in closing,
          // a drop) even with no application tagged to them there. Without it V Pooja's split credit on Part Time
          // Instructor - Agentic AI (US) sat in her row and in no job row, so the rows did not add up and the chart,
          // banded from these rows, came out shorter than the table.
          const pre = r.name + '|';
          [outByRecJob, joinByRecJob, dropByRecJob].forEach(m => Object.keys(m).forEach(k => {
            const j8 = k.startsWith(pre) ? k.slice(pre.length) : '';
            if (j8 && j8 !== 'undefined' && j8 !== 'null' && !bjByJ8[j8]) bjByJ8[j8] = { jobId: j8 };
          }));
          const titled = new Set(Object.values(bjByJ8).map(bj => jobMeta(bj).title).filter(Boolean));
          Object.keys(JP.totalJ || {}).forEach(k => {
            if (!k.startsWith(pre)) return;
            const t = k.slice(pre.length); if (!t || titled.has(t)) return;
            const jj = (data.jobs || []).find(x => x.title === t);
            if (jj && !bjByJ8[jj.id]) { bjByJ8[jj.id] = { jobId: jj.id }; titled.add(t); }
          });
          const jobs = Object.values(bjByJ8).sort((x, y) => (y[isSales ? 'hired' : 'offer'] || 0) - (x[isSales ? 'hired' : 'offer'] || 0) || (y.total || 0) - (x.total || 0));
          // The role split the Fulfilment chart shades its Achieved band with (Jerin, 2026-08-29). Collected
          // HERE, from the very rows the table prints, so the chart cannot end up on a different basis —
          // this chart has been on the wrong basis twice before.
          const roleAch = [];
          if (jobs.length) {
            jobs.forEach(bj => {
              const m = jobMeta(bj), sc = scoreForRole(m, q);
              const jo = outOfJob(r.name, bj.jobId);   // dated, same basis as the recruiter row above
              const jj = joinOfJob(r.name, bj.jobId);
              // #100b: the SAME helper the recruiter row uses, restricted to this job — so the Goal here is
              // credit-split exactly as it is above and the rows sum. It used to read the raw owned count with
              // no split at all, printing 102 points across Oshin's three shared roles under a row saying 51,
              // while the Achieved beside it WAS split — which made this row's Delta wrong too.
              const jg = goalOf(r, q, (bj.jobId || '').slice(0, 8));
              const seats = jg.hc;
              const jd2 = dropOfJob(r.name, bj.jobId);
              const jjp = jpOfJob(r.name, m.title);
              // A job with no seats this quarter and nothing delivered, in closing or dropped is not this
              // quarter's work.
              // ⚠ #100/#108: test more than the head. A sourcer never holds the head — their roles carry only points
              //   and "+N sourced" counts — so testing heads alone would silently drop every sourced role here.
              const jx0 = isSales ? jo : jj;
              if (!seats && !jg.sc && !jg.so && !jo.hc && !jj.hc && !jd2.hc && !jjp.t.hc
                  && !jx0.sc && !jx0.so && !jd2.sc && !jd2.so && !jjp.t.sc && !jjp.t.so) return;
              const jxHC = isSales ? jo.hc : jj.hc, jxSc = isSales ? jo.sc : jj.sc;
              const juHC = isSales ? jxHC : jxHC + jjp.t.hc, juSc = isSales ? jxSc : jxSc + jjp.t.sc;
              const jaSo = jg.so || 0, jxSo = jx0.so || 0, juSo = isSales ? jxSo : jxSo + (jjp.t.so || 0);
              const jv = { aHC: jg.hc, aSc: jg.sc, capSc: null, xHC: jxHC, xSc: jxSc, uHC: juHC, uSc: juSc,
                           dHC: jd2.hc, dSc: jd2.sc, jp: jjp,
                           jx: isSales ? jxOfJob(r.name, bj.jobId) : null,   // #39
                           gHC: Math.max(0, jg.hc - juHC), gSc: Math.max(0, jg.sc - juSc),
                           aSo: jaSo, xSo: jxSo, uSo: juSo, dSo: jd2.so || 0, gSo: Math.max(0, jaSo - juSo) };   // #108
              roleAch.push({ title: m.title || '(untitled)', achievedSc: juSc });   // unrounded: the chart shares out the row's rounded total (#120)
              html += `<tr class="lvl-stage" data-pod="${pi}" data-parent-rec="${rk}" style="display:none">
                <td style="padding-left:3.25rem;color:var(--muted)">${m.title || '(untitled)'}<span style="font-size:0.625rem;margin-left:0.375rem;color:var(--muted)">${m.level || ''}${m.complexity ? ' · ' + m.complexity : ''} · ${sc}pt</span></td>${cells(jv, false)}</tr>`;
            });
          } else {
            html += `<tr class="lvl-stage" data-pod="${pi}" data-parent-rec="${rk}" style="display:none">
              <td style="padding-left:3.25rem;color:var(--muted);font-style:italic">No jobs attributed</td>${`<td>${DASH}</td>`.repeat(ncol - 1)}</tr>`;
          }
          if (lastFulfil[r.name]) lastFulfil[r.name].roles = roleAch;
        });
      });
      return html || `<tr><td colspan="${ncol}" style="text-align:center;color:var(--muted);padding:1rem">No recruiters in this group.</td></tr>`;
    }

    const offerBody = document.getElementById('recFulfilOfferBody');
    const hireBody = document.getElementById('recFulfilHireBody');
    if (offerBody) { offerBody.innerHTML = fulfilRows(nonSalesGroups, 'offer'); wireVelTree(offerBody); }
    if (hireBody) { hireBody.innerHTML = fulfilRows(salesGroups, 'hire'); wireVelTree(hireBody); }
    // 'hire' mode = Sales counting: joiners regardless of which quarter raised the opening.
    const othersBody = document.getElementById('recFulfilOthersBody');
    if (othersBody) { othersBody.innerHTML = fulfilRows(othersGroups, 'hire'); wireVelTree(othersBody); }

    // ===== #20 (2026-08-23): Joining Pending — Pod → Recruiter → Candidate =====
    // Same population and same columns as the Hiring Manager Joining Pending list, re-cut by who owns the candidate
    // rather than which department the role sits in. It is a LIVE list: everyone currently parked in Ref
    // Check, Documentation or Offer, so the quarter selector does not apply to it (the caption says so).
    // Only recruiters visible under the current filters appear, so it stays in step with the tables above.
    // #130 (Jerin, 15 Sep 2026): both people lists sit on their own sub-tabs now — Joining Pending and the new Joiners — and ONE tree
    // draws both, so they group, reconcile and explain their last group the same way. `rest` = the columns after the first.
    // #133: the quarter, the recruiters shown and their pod groups are arguments — Joining Pending passes TODAY's quarter, Joiners the selected one.
    function peopleTree(cases, { rest, cells, isLinked, sortBy, q2 = selQuarter(), inRecs = recs, inGroups = groups }) {
      const byRec = {}, noRec = [];
      cases.forEach(c => {
        const rec = c.recruiter;
        if (!rec || rec === 'Unassigned') { noRec.push(c); return; }
        (byRec[rec] || (byRec[rec] = [])).push(c);
      });
      const visible = new Set(inRecs.map(r => r.name));
      const roster = {}; allRecs.forEach(r => { if (r.name) roster[r.name] = r; });
      // ⚠ Do NOT call this group "Unassigned" — that is also a POD name, and naming it that made the table
      // read as though the no-pod exclusion had been reversed (Jerin, 2026-08-24).
      // #26 (2026-08-24): everyone in the list has to land somewhere, or it quietly disagrees with the
      // figures in the tables it explains. Two populations were falling off the bottom: people with NO
      // recruiter tagged, and people sitting with a recruiter who was not here this quarter (always hidden since
      // #121). Both now sit in their own group so the list reconciles to the full count.
      // ⚠ People hidden by an explicit Pod / Recruiter / Job selection are NOT swept in here — the user asked
      // for those to be filtered out, and re-adding them under an "unassigned" label would be a lie.
      const orphanBy = {};
      Object.entries(byRec).forEach(([rec, list]) => {
        if (visible.has(rec)) return;
        if (explicitlyFiltered(rec, q2)) return;   // the user asked for these to be filtered out
        orphanBy[rec] = list;
      });
      // Say WHY each one is here, so the group is a worklist rather than a dumping ground.
      const orphanWhy = (rec) => {
        const r = roster[rec];
        if (!r) return 'not on the recruiter roster';
        if (!presentIn(r, q2)) return 'not here this quarter';   // #111
        if (isStatusUnknown(r)) return 'status unknown';
        if (podOf(rec, q2) === 'Unassigned') return 'no pod set';
        return 'not shown above';
      };

      let html = '', shown = 0, unlinked = 0;
      // #137: the counts are small number tags, recruiters carry their initials in their pod's colour, and the cells come from people-cells.js.
      const cnt = (n, extra) => `${extra ? `<span style="color:var(--muted);font-weight:400;font-size:0.6875rem;margin-left:0.375rem">${extra}</span>` : ''}${countTag(n)}`;
      const recName = (name, pod) => `<span class="pl-rec">${avatar(name, pod)}${name}</span>`;
      const candRow = (c, path) => {
        shown++; if (!isLinked(c)) unlinked++;
        return `<tr data-path="${path}" style="display:none">${tdCandidate(c.candidate, 'padding-left:3.25rem')}${cells(c)}</tr>`;
      };
      inGroups.forEach((G, pi) => {
        const mine = G.recs.filter(r => visible.has(r.name) && (byRec[r.name] || []).length);
        if (!mine.length) return;
        const podCount = mine.reduce((n, r) => n + byRec[r.name].length, 0);
        html += `<tr data-path="${pi}" data-haschild data-exp="0" style="cursor:pointer;background:var(--border-light)">
          <td style="font-weight:600">${CARET}${G.pod}${cnt(podCount)}</td>
          <td colspan="${rest}" style="color:var(--muted)">${mine.length} recruiter${mine.length === 1 ? '' : 's'}</td></tr>`;
        mine.forEach((r, ri) => {
          const list = byRec[r.name].slice().sort(sortBy);
          html += `<tr data-path="${pi}-${ri}" data-haschild data-exp="0" style="display:none;cursor:pointer">
            <td style="padding-left:1.625rem;font-weight:500">${CARET}${recName(r.name, G.pod)}${cnt(list.length)}</td>
            <td colspan="${rest}"></td></tr>`;
          list.forEach((c, ci) => { html += candRow(c, `${pi}-${ri}-${ci}`); });
        });
      });
      const oi = inGroups.length;
      const orphanNames = Object.keys(orphanBy).sort();
      const orphanCount = noRec.length + orphanNames.reduce((n, k) => n + orphanBy[k].length, 0);
      if (orphanCount) {
        html += `<tr data-path="${oi}" data-haschild data-exp="0" style="cursor:pointer;background:var(--border-light)">
          <td style="font-weight:600">${CARET}No recruiter in this view${cnt(orphanCount)}</td>
          <td colspan="${rest}"></td></tr>`;
        let ri = 0;
        if (noRec.length) {
          html += `<tr data-path="${oi}-${ri}" data-haschild data-exp="0" style="display:none;cursor:pointer">
            <td style="padding-left:1.625rem;font-weight:500">${CARET}No recruiter tagged${cnt(noRec.length)}</td><td colspan="${rest}" style="color:var(--orange);font-size:0.6875rem">Fix in Ashby: tag a Recruiter on the hiring team.</td></tr>`;
          noRec.slice().sort(sortBy).forEach((c, ci) => { html += candRow(c, `${oi}-${ri}-${ci}`); });
          ri++;
        }
        orphanNames.forEach(nm => {
          const list = orphanBy[nm].slice().sort(sortBy);
          html += `<tr data-path="${oi}-${ri}" data-haschild data-exp="0" style="display:none;cursor:pointer">
            <td style="padding-left:1.625rem;font-weight:500">${CARET}${recName(nm)}${cnt(list.length, orphanWhy(nm))}</td><td colspan="${rest}"></td></tr>`;
          list.forEach((c, ci) => { html += candRow(c, `${oi}-${ri}-${ci}`); });
          ri++;
        });
      }
      return { html, shown, unlinked, orphanCount };
    }

    const jpBody = document.getElementById('recJPBody');
    if (jpBody) {
      // #133 (Jerin, 15 Sep 2026): a LIVE list, so it is grouped by the pods of the quarter we are in today — the Year / Quarter boxes are
      // hidden on this sub-tab, and a hidden box must not change what is shown — and narrowed by the DOJ boxes that take their place.
      const qNow = currentQuarter(), sameQ = qNow === selQuarter(), dojF = dojFilterOf('rec');
      const nowRecs = sameQ ? recs : getFilteredRecs(qNow);
      const jp = peopleTree((data.joiningPendingCases || []).filter(c => inDojFilter(c.doj, dojF)), {
        q2: qNow, inRecs: nowRecs, inGroups: sameQ ? groups : groupByPod(nowRecs, qNow),
        rest: 6,
        isLinked: c => c.linked,
        sortBy: (a, b) => String(a.doj || '').localeCompare(String(b.doj || '')),
        // #149 rule 6: only Opening Quarter moves, to the far right. Everything else stays as it was.
        cells: c => `${tdMonth(c.doj)}${tdDoj(c.doj, { live: true })}${tdDept(c.department)}`
          + `${tdJob(c.job || c.jobTitle)}${tdStage(c.subStage)}${tdQuarter(c.openingQuarter)}`
      });
      jpBody.innerHTML = jp.html || `<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:1rem">Nobody in closing under these filters.</td></tr>`;
      // ⚠ This table is a data-path tree, so it needs wireTreePath. It was wired with wireVelTree, which only
      // knows about .lvl-pod / .lvl-rec rows — so nothing here expanded at all and only the pod headers showed.
      wireTreePath(jpBody);
      const cap = document.getElementById('recJPCaption');
      if (cap) cap.innerHTML = jp.shown
        ? `<strong>${jp.shown}</strong> in closing${dojFilterText(dojF) ? ' ' + dojFilterText(dojF) : ''}, <strong>live</strong>.`
          + (jp.orphanCount ? ` <strong>${jp.orphanCount}</strong> sit in the last group.` : '')
          + (jp.unlinked ? ` <strong>${jp.unlinked}</strong> have no opening attached.` : '')
        : '';
    }

    // ===== #130c (Jerin, 15 Sep 2026): Joiners — everyone moved to Hired who started inside From / To =====
    // The same Joined test as every people-based figure on this tab (an accepted offer AND moved to Hired), with NO earlier-quarter
    // subtraction — like Sourcing Mix — so a recruiter can list more people here than Joined on the Non-Sales table; the Opening
    // Quarter column shows who. The head stays with the recruiter: a sourced joiner is listed once, under their Recruiter.
    const joinersBody = document.getElementById('recJoinersBody');
    if (joinersBody) {
      const rgJ = selRange();
      const jn = peopleTree((data.offerEvents || []).filter(e => e.accepted && e.appStatus === 'Hired' && inRange(e.startDate, rgJ)), {
        rest: 5,
        isLinked: e => !!e.openingId,
        sortBy: (a, b) => String(b.startDate || '').localeCompare(String(a.startDate || '')),   // most recent first
        // #149 rule 6: only Opening Quarter moves, to the far right.
        cells: e => `${tdMonth(e.startDate)}${tdDoj(e.startDate)}${tdDept(e.department)}${tdJob(e.jobTitle)}${tdQuarter(e.openingQuarter, e.startDate)}`
      });
      joinersBody.innerHTML = jn.html || `<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:1rem">Nobody joined between these dates under these filters.</td></tr>`;
      wireTreePath(joinersBody);
      const capJ = document.getElementById('recJoinersCaption');
      if (capJ) capJ.innerHTML = jn.shown
        ? `<strong>${jn.shown}</strong> joined, ${rangeText(rgJ, [selQuarter()])}.`
          + (jn.orphanCount ? ` <strong>${jn.orphanCount}</strong> sit in the last group.` : '')
          + (jn.unlinked ? ` <strong>${jn.unlinked}</strong> have no opening attached.` : '')
        : '';
    }

    // ===== Sourcing Mix — Pod → Recruiter → Source type → Source name =====
    // Counts JOINERS (see joinerSources above), not applications. % = share within the parent row.
    // Org-wide totals live in Overall Efficiency.
    const srcBody = document.getElementById('recSourceBody');
    if (srcBody) {
      const perSrc = selQuarters(), rgSrc = selRange();   // #129: joiners whose start date is inside From / To
      const nestOf = (r) => srcNestedFor(r, perSrc, rgSrc);
      const recSrcTotal = r => Object.values(nestOf(r)).reduce((s, names) => s + Object.values(names).reduce((a, v) => a + v, 0), 0);
      const sn = document.getElementById('recSourceNote');
      if (sn) {
        // The joiner cut needs the source ON THE OFFER RECORD, which the pipeline only started carrying on
        // 2026-08-29. Against an older data file every joiner would silently land in "(source not
        // recorded)", so say it plainly instead.
        const anySrc = (data.offerEvents || []).some(e => e.srcType);
        sn.style.display = anySrc ? 'none' : '';
        sn.innerHTML = 'Heads up: this data file predates sources being carried onto offer records, so no joiner can be attributed to a source yet. It fills in at the next refresh.';
      }
      const spSrc = document.getElementById('recSourcePeriod');
      if (spSrc) spSrc.textContent = perSrc && perSrc.length
        ? `Showing where the people who joined in ${rangeText(rgSrc, perSrc)} came from.`
        : `Showing where everyone who has joined came from (all time).`;
      const grand = recs.reduce((s, r) => s + recSrcTotal(r), 0) || 1;
      let html = '';
      groups.forEach((G, pi) => {
        const podTotal = G.recs.reduce((s, r) => s + recSrcTotal(r), 0);
        html += `<tr data-path="${pi}" data-haschild data-exp="0" style="cursor:pointer;background:var(--border-light)">
          <td style="font-weight:600">${CARET}${G.pod}<span style="color:var(--muted);font-weight:400;font-size:0.6875rem;margin-left:0.375rem">${G.recs.length}</span></td>
          <td style="font-weight:600">${podTotal || '<span class="zero">0</span>'}</td><td>${pct(podTotal, grand)}%</td></tr>`;
        G.recs.forEach((r, ri) => {
          const rt = recSrcTotal(r);
          html += `<tr data-path="${pi}-${ri}" data-haschild data-exp="0" style="display:none;cursor:pointer">
            <td style="padding-left:1.625rem;font-weight:500">${CARET}${r.name}${inactiveTag(r)}</td>
            <td>${rt || '<span class="zero">0</span>'}</td><td>${rt ? pct(rt, podTotal) + '%' : DASH}</td></tr>`;
          // Source type → source name (from srcNested). Falls back to type-only (r.sources) until the refresh
          // that emits srcNested has run.
          const nst = nestOf(r);
          const types = Object.entries(nst).map(([t, names]) => [t, Object.values(names).reduce((a, v) => a + v, 0), names]).sort((a, b) => b[1] - a[1]);
          if (types.length) {
            types.forEach(([t, tcnt, names], ti) => {
              const hasNames = names && Object.keys(names).length;
              html += `<tr data-path="${pi}-${ri}-${ti}"${hasNames ? ' data-haschild data-exp="0"' : ''} style="display:none${hasNames ? ';cursor:pointer' : ''}">
                <td style="padding-left:3.25rem;font-weight:500">${hasNames ? CARET : ''}${t}</td>
                <td>${tcnt}</td><td class="${pctClass(pct(tcnt, rt))}">${pct(tcnt, rt)}%</td></tr>`;
              if (hasNames) Object.entries(names).sort((a, b) => b[1] - a[1]).forEach(([nm, cnt], ni) => {
                html += `<tr data-path="${pi}-${ri}-${ti}-${ni}" style="display:none">
                  <td style="padding-left:4.875rem;color:var(--muted)">${nm}</td>
                  <td>${cnt}</td><td class="${pctClass(pct(cnt, tcnt))}">${pct(cnt, tcnt)}%</td></tr>`;
              });
            });
          } else {
            html += `<tr data-path="${pi}-${ri}-0" style="display:none">
              <td style="padding-left:3.25rem;color:var(--muted);font-style:italic">Nobody joined in this period</td><td>${DASH}</td><td>${DASH}</td></tr>`;
          }
        });
      });
      srcBody.innerHTML = html || `<tr><td colspan="3" style="text-align:center;color:var(--muted);padding:1rem">No recruiters match the filter.</td></tr>`;
      wireTreePath(srcBody);
      shareBars(srcBody, recSrcColorOf);   // #137c: the colours come from buildSourceChart
    }

    // ===== Time in Process — Pod → Recruiter → Job, median days parked per stage =====
    renderTimeInProcess();

    // ===== Data Hygiene — org-wide compliance (independent of Pod/Recruiter filters) =====
    renderHygiene();

    lastGroups = groups; lastRecs = recs;
    renderActiveChart();
  }

  // Quarter keys the Year/Quarter selector covers; null = all-time. Distinct from selQuarter(), which always
  // resolves to ONE quarter for pod grouping and capacity even when the selector reads "All".
  // ===== ONE definition of "outcome", used by the tables AND the chart (#22, 2026-08-23) =====
  // The chart used to compute achieved from recruiters[].byJob, which carries NO date, so it showed a
  // LIFETIME score under a quarter heading and disagreed with the table right beside it — Mahima Agarwal
  // read 531 on the chart against her real Q3 figure. The tables were moved off byJob on 2026-08-22 for
  // exactly this reason; the chart was missed. Both now call this, so they cannot drift apart again.
  //   Sales     → accepted offers whose START DATE falls in the quarter (they actually joined)
  //   Non-Sales → offers whose DECIDED date falls in the quarter (the offer was made)
  // Quarter arithmetic: "2026-Q3" +/- n. Used by the Joining-Pending split, which is defined relative to the
  // selected quarter (previous / current / upcoming).
  const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function monthLabel(ds) {
    if (!ds || ds.length < 7) return DASH;
    const m = parseInt(ds.slice(5, 7), 10);
    return m ? `${MONTH_ABBR[m - 1]} ${ds.slice(0, 4)}` : DASH;
  }

  function qShift(q, n) {
    const y = +q.slice(0, 4), i = +q.slice(6);
    const t = y * 4 + (i - 1) + n;
    return `${Math.floor(t / 4)}-Q${(t % 4) + 1}`;
  }

  // ===== Joining Pending, per recruiter, split into two buckets (#19/#21, Jerin 2026-08-23) =====
  // Source is joiningPendingCases: every candidate currently parked in Ref Check, Documentation or Offer.
  // Scores come from the job's Level/Complexity, looked up by title (the cases carry no score inputs).
  //   Non-Sales  A = Current Qtr   : everyone MINUS those linked to an opening from an earlier quarter
  //              B = Upcoming Qtr  : linked to a CURRENT-quarter opening, but starting NEXT quarter
  //   Sales      A = Prev Qtr Openings    : linked to an opening from an EARLIER quarter, whatever the joining date
  //              B = Current Qtr Openings : everyone MINUS A
  // 🚨 Only 25 of 166 cases carry an opening link at all, so every rule that needs one can only judge those
  // 25; the other 141 fall through to the "everyone minus..." bucket. Openings were first attached on
  // 2026-07-25, so these splits fill in as that process matures rather than being wrong today.
  function jpMaps(q, isSales) {
    const qOf = (ds) => (ds && ds.length >= 7) ? `${ds.slice(0, 4)}-Q${Math.floor((+ds.slice(5, 7) - 1) / 3) + 1}` : null;
    const nextQ = qShift(q, 1);
    const meta = {};
    (data.jobs || []).forEach(j => { if (j.title && !meta[j.title]) meta[j.title] = j; });
    const bucketA = {}, bucketB = {};
    // Job-level too, keyed recruiter|job title. Job rows used to print a hard 0 in every JP column, which
    // reads as "nobody in closing on this role" when the real answer was "not worked out per job".
    const bucketAJ = {}, bucketBJ = {};
    // #11: the same addCredit used by Joined and Drop, so Joining Pending divides credit identically.
    // ⚠ JP job keys are `name|JOB TITLE`, not `name|jobId8` — the cases carry no job id.
    (data.joiningPendingCases || []).forEach(c => {
      const rec = c.recruiter; if (!rec || rec === 'Unassigned') return;
      const j = meta[c.job || c.jobTitle || ''] || {};
      const sc = scoreForRole({ department: c.department, title: c.job || c.jobTitle, level: j.level, complexity: j.complexity }, q);
      const oq = c.openingQuarter || null, dq = qOf(c.doj || c.startDate);
      const jt = c.job || c.jobTitle || '';
      const bump = (mR, mJ) => addCredit(mR, mJ, jt, rec, c.sourcer, c.department, sc);
      // #27 (Jerin, 2026-08-24) — the settled definitions, one line each. Do not re-derive them.
      if (isSales) {
        // A: the opening was raised in an EARLIER quarter, whatever the joining date — the same test as Joined — Prev Qtr Openings.
        //    #126 (Jerin, 15 Sep 2026): it used to demand exactly LAST quarter AND a joining date THIS quarter, so a person on an older
        //    opening, or joining later, was filed under Current Qtr Openings.
        // B: everyone else in closing — i.e. the whole population MINUS A, so A + B is the total.
        // ⚠ B used to test `dq !== prevQ`, which is a different question entirely and read 85 of 153.
        if (oq && oq < q) bump(bucketA, bucketAJ);
        else bump(bucketB, bucketBJ);
      } else {
        // A: everyone except those sitting on an EARLIER quarter's opening (the HM card rule), MINUS anyone
        //    whose joining date falls in the NEXT quarter.
        // B: the opening was raised THIS quarter but the candidate joins NEXT quarter.
        // That last clause on A is what makes the two DISJOINT (Jerin, 2026-08-24). Without it everyone in B
        // was also in A — their opening is this quarter, so nothing excluded them — and Total = A + B counted
        // them twice. It reads 0 today only because no offer carried an opening link before 2026-07-25.
        if (!(oq && oq < q) && dq !== nextQ) bump(bucketA, bucketAJ);
        if (oq === q && dq === nextQ) bump(bucketB, bucketBJ);
      }
    });
    // Total is the two sub-columns ADDED, never a separate count — that is what stops the three JP figures
    // on this tab from drifting apart again. It is why Non-Sales and Sales totals differ by the carried-over
    // person: Non-Sales is measured on offers, so last quarter's opening should not count toward it.
    const sum = (...ms) => { const out = {}; ms.forEach(m => Object.entries(m).forEach(([k, v]) => {
      const t = out[k] || (out[k] = { hc: 0, sc: 0, so: 0 }); t.hc += v.hc; t.sc += v.sc; t.so += v.so || 0; })); return out; };
    return { total: sum(bucketA, bucketB), bucketA, bucketB,
             totalJ: sum(bucketAJ, bucketBJ), bucketAJ, bucketBJ };
  }

  // Offered -> Hired for ONE quarter, per recruiter and per (recruiter, job).
  // ⚠ This panel used to read recruiters[].offer / .hired, which carry NO date — so the Year/Quarter
  // selector regrouped the pods and changed not a single number. Same family as the three panels fixed on
  // 2026-08-21: a lifetime figure under a quarter heading is impossible to spot by looking at it.
  // Basis: an offer belongs to the quarter its outcome was DECIDED in (decidedAt), so every offer in the
  // denominator has actually been answered — a conversion rate whose denominator still contains undecided
  // offers reads low for reasons that have nothing to do with the recruiter.
  // ===== Sourcing Mix, quarter-scoped (2026-08-25) =====
  // The source counts carried NO date, so this panel's Year/Quarter selector regrouped pods and changed
  // nothing else. The pipeline now emits recruiters[].srcQ {quarter:{type:{name:count}}}, bucketed by the
  // quarter the candidate APPLIED. Falls back to the undated srcNested when running against older data —
  // and says so on screen rather than passing lifetime numbers off as the quarter's.
  // ===== Sourcing Mix counts JOINERS, not applications (Jerin, 2026-08-29) =====
  // "Need this to be only for Hired folks." A source that brings 25,810 applications and 2 joiners was
  // reading as the biggest channel on the tab; this asks the question worth asking — which sources produce
  // people who actually start.
  // Joiner = accepted offer whose START DATE falls in the selected period. The same rule "Joined" means
  // everywhere else on the site, so this panel and Fulfilment count the same people.
  // The source comes off the offer record (srcType / srcName), which the pipeline started carrying on
  // 2026-08-29 — it was always on the application, it just was not travelling as far as the offer.
  // ⚠ A joiner whose application has no source is kept under "(source not recorded)" rather than dropped,
  // so the panel totals still reconcile with Joined. About 5% today.
  const NO_SRC = '(source not recorded)';
  let _jsQ = null, _js = null;
  function joinerSources(per, rg) {
    // #129: keyed by the From / To range too — a cache keyed by the quarter alone would keep showing the whole quarter's joiners.
    const key = ((per && per.length) ? per.join(',') : 'ALL') + (rg ? '|' + rg.from + '|' + rg.to : '');
    if (_jsQ === key && _js) return _js;
    const qOf = (ds) => (ds && ds.length >= 7) ? `${ds.slice(0, 4)}-Q${Math.floor((+ds.slice(5, 7) - 1) / 3) + 1}` : null;
    const inPeriod = (q) => !per || !per.length ? !!q : per.indexOf(q) >= 0;
    const byRec = {};
    (data.offerEvents || []).forEach(e => {
      if (!e.accepted || e.appStatus !== 'Hired') return; // Joined = moved to Hired, not just an accepted offer
      const q = qOf(e.startDate);
      if (!q || !inPeriod(q)) return;
      if (rg && !inRange(e.startDate, rg)) return;   // #129: started inside From / To
      const rec = e.recruiter; if (!rec) return;
      const t = e.srcType || NO_SRC;
      const n = e.srcType ? (e.srcName || '(unspecified)') : NO_SRC;
      const a = byRec[rec] || (byRec[rec] = {});
      const b = a[t] || (a[t] = {});
      b[n] = (b[n] || 0) + 1;
    });
    _jsQ = key; _js = byRec;
    return byRec;
  }
  function srcNestedFor(r, per, rg) { return joinerSources(per, rg)[r.name] || {}; }

  // ===== Joining Conversion (spec settled with Jerin, 2026-08-26) =====
  //   Offered           = Joined + Joining Pending + Dropped
  //   Joined            = started in the quarter, MINUS anyone linked to an EARLIER quarter's opening
  //   Joining Pending   = the HM Positions card rule - in Ref Check / Documentation / Offer, minus
  //                       earlier-quarter openings. LIVE, so the same people sit in every quarter.
  //   Dropped           = the unified dropEvents list (reached a late stage, then archived)
  //   Joining Conversion = (Joined + Joining Pending) / Offered
  //
  // ⚠ TWO THINGS TO KNOW BEFORE "FIXING" THIS PANEL:
  // 1. The conversion is algebraically 1 - Dropped/Offered, because Joined and JP appear on BOTH sides of
  //    the fraction and cancel. It therefore sits near 96% and moves only with drops. Jerin chose this
  //    knowing that: it answers "what share of everyone who reached an offer has not fallen out".
  // 2. Joining Pending is LIVE while Joined and Dropped are quarterly, so the same ~165 people are inside
  //    every quarter's Offered. Deliberate - it keeps this column identical to the HM card rather than
  //    inventing a fifth definition of Joining Pending. The definitions block says both of these on screen.
  function convMaps(q, rg) {   // #129: rg = the From / To range inside quarter q
    const qOf = (ds) => (ds && ds.length >= 7) ? `${ds.slice(0, 4)}-Q${Math.floor((+ds.slice(5, 7) - 1) / 3) + 1}` : null;
    const byRec = {}, byRecJob = {};
    // byRecJob carries the same three counts one level down, per ROLE, so the chart can shade each band by
    // role (Jerin, 2026-08-29) without recomputing anything the table did not.
    const bump = (rec, key, title) => {
      const a = byRec[rec] || (byRec[rec] = { o: 0, j: 0, p: 0, dr: 0 });
      a[key] += 1;
      const t = title || '(no role recorded)';
      const m = byRecJob[rec] || (byRecJob[rec] = {});
      const b = m[t] || (m[t] = { o: 0, j: 0, p: 0, dr: 0 });
      b[key] += 1;
    };
    // ===== #43 (Jerin, 10 Sep 2026): this panel obeys the SAME credit rule as Fulfilment =====
    // 🚨 Every figure here — Offered, Joined, Joining Pending, Dropped — is a COUNT OF PEOPLE, so it follows
    //    creditSplit's HEAD rule (`hcTo`), NOT the score fractions. A person is never halved (Rule 1).
    // #108 (13 Sep 2026): the head now ALWAYS goes to the recruiter, whoever sourced the role, so this resolves to
    //    the recruiter every time. It still routes through creditSplit so the rule lives in one place and this panel
    //    can never disagree with the Fulfilment HC columns on the same tab.
    const headTo = (rec, srcr, dept) => {
      const sp = splitOf(dept, srcr);
      return (sp.hcTo === 'src' && srcr) ? srcr : rec;
    };
    // Joined - people, by start date, minus last quarter's carry-over.
    (data.offerEvents || []).forEach(e => {
      const rec = e.recruiter; if (!rec) return;
      if (!e.accepted || e.appStatus !== 'Hired' || !inRange(e.startDate, rg)) return; // Joined = moved to Hired, not just an accepted offer · #129: started inside From / To
      if (e.openingQuarter && e.openingQuarter < q) return;
      bump(headTo(rec, e.sourcer, e.department), 'j', e.jobTitle);   // #43
    });
    // Joining Pending - identical rule to the HM Positions card, and LIVE.
    (data.joiningPendingCases || []).forEach(c => {
      const rec = c.recruiter; if (!rec || rec === 'Unassigned') return;
      if (c.openingQuarter && c.openingQuarter < q) return;
      bump(headTo(rec, c.sourcer, c.department), 'p', c.job || c.jobTitle);   // #43
    });
    // Dropped - the one unified list, shared with HM and both Fulfilment tables.
    dropRows(data).forEach(e => {
      const rec = e.recruiter; if (!rec) return;
      if (!dropIn(e, rg, [q])) return;   // #129: by the day they first reached Ref Check / Documentation / Offer
      bump(headTo(rec, e.sourcer, e.department), 'dr', e.job || e.jobTitle);   // #43
    });
    Object.values(byRec).forEach(a => { a.o = a.j + a.p + a.dr; });
    Object.values(byRecJob).forEach(m => Object.values(m).forEach(a => { a.o = a.j + a.p + a.dr; }));
    return { byRec, byRecJob };
  }

  // #129 (15 Sep 2026): rg = the From / To range inside quarter q. The Non-Sales maps are gone: they filed offers by DECIDED date, which is
  // Ashby's bulk data-entry stamp and must never date a filtered figure — Non-Sales Joined comes from joinByRec in fulfilRows.
  function outcomeMaps(q, rg) {
    const sales = {}, salesJob = {};
    // #39 (Jerin, 7 Sep 2026): split Joined by the OPENING's quarter, mirroring the JP block beside it.
    //   A = the opening was raised in an EARLIER quarter  -> "Joined — Prev Qtr Openings" (carried-over demand)
    //   B = everyone else                                 -> "Joined — Current Qtr Openings"
    // A + B always equals Joined Total, exactly as the JP columns do.
    // 🚨 B therefore ABSORBS every joiner whose offer carries NO opening link. Coverage is thin and is NOT
    // going to improve (#28 and #19 are both killed): on 2026-Q3 only 26 of 57 Sales joiners are linked at
    // all. So B means "not known to be earlier", NOT "opened this quarter" — the column note on screen says
    // so, and the unlinked count is printed under B rather than hidden. Do not restate B as a certainty.
    const salesA = {}, salesB = {}, salesAJob = {}, salesBJob = {}, salesU = {}, salesUJob = {};
    (data.offerEvents || []).forEach(e => {
      const rec = e.recruiter; if (!rec) return;
      const sc = scoreForRole({ department: e.department, title: e.jobTitle, level: e.level, complexity: e.complexity }, q);
      // #11: every one of these goes through addCredit, so the recruiter/sourcer division is identical
      // across Joined and its two opening-quarter buckets — they can never drift apart.
      if (e.accepted && e.appStatus === 'Hired' && inRange(e.startDate, rg)) { // Joined = moved to Hired, not just an accepted offer · #129: inside From / To
        addCredit(sales, salesJob, e.jobId8, rec, e.sourcer, e.department, sc);
        // #39: bucket the same person by their opening's quarter. See the note above.
        const oq = e.openingQuarter || null, earlier = !!(oq && oq < q);
        addCredit(earlier ? salesA : salesB, earlier ? salesAJob : salesBJob, e.jobId8, rec, e.sourcer, e.department, sc);
        // How many of bucket B are there only because no opening is attached — printed under the column so
        // nobody reads B as measured demand.
        if (!oq) addCredit(salesU, salesUJob, e.jobId8, rec, e.sourcer, e.department, sc);
      }
    });
    return { sales, salesJob, salesA, salesB, salesAJob, salesBJob, salesU, salesUJob };
  }

  function tisPeriod() { return selQuarters(); }

  // Spells out which stages actually follow the period, so quarter-scoped columns never sit unlabelled
  // next to the live App Review one.
  function tisNote(per) {
    const el = document.getElementById('recTisNote'); if (!el) return;
    if (!per) { el.style.display = 'none'; return; }
    const label = rangeText(selRange(), per);   // #129: the dates, when From / To is narrower than the quarter
    el.style.display = '';
    el.style.color = (tisHasQ && tisSplit) ? 'var(--muted)' : 'var(--orange)';
    el.innerHTML = !tisHasQ
      ? `Heads up: these medians are <strong>all-time</strong>, not ${label}. The stage-history file predates the per-quarter breakdown — it appears here after the next stage-history refresh.`
      : !tisSplit
      ? `Heads up: these medians still <strong>include candidates who have not left the stage yet</strong>, measured to today, so older quarters read higher for that reason alone. The split into finished vs still-waiting appears here after the next stage-history refresh.`
      : `Showing <strong>${label}</strong>. <span style="color:var(--orange)">*</span> ${APP_REVIEW_LIVE_NOTE}`;
  }

  // Pod → Recruiter → Job, median days a candidate is parked per stage (red > 5). App Review = still-parked
  // dwell (main pull); TA Screen → Offer from stage history. Job rows are THAT recruiter's own candidates on the job (#120a).
  function renderTimeInProcess() {
    const body = document.getElementById('recTisBody'); if (!body) return;
    const head = document.getElementById('recTisHead');
    const per = tisPeriod();
    if (head) {
      let h = '<tr><th style="min-width:14.375rem">Pod / Recruiter / Job</th>';
      TIS_STAGES.forEach(([sk, lbl]) => {
        const live = per && sk === 'appReview';
        h += `<th${live ? ` title="${APP_REVIEW_LIVE_NOTE}"` : ''}>${lbl}${live ? '<span style="color:var(--orange)">*</span>' : ''}</th>`;
      });
      head.innerHTML = h + '</tr>';
    }
    if (!tisRec && !arDwellRec) { body.innerHTML = `<tr><td colspan="${TIS_STAGES.length + 1}" style="text-align:center;color:var(--muted);padding:1rem">Time-in-stage data pending the next stage-history refresh.</td></tr>`; return; }
    const q = selQuarter();
    const groups = groupByPod(getFilteredRecs(), q);
    // App Review is a live snapshot with no historical dimension, so it never takes the period; the rest do.
    // App Review is 100% still-waiting by construction (today − applied, for everyone parked there), so it
    // has no completed-stay median at all — the cell reads "—" over its waiting pile. That is the honest
    // shape of that column and always was; pooling simply disguised it as a processing time.
    const arPair = (dw) => ({ fin: {}, wait: dw || {}, live: true });
    // #125: every row reads the data narrowed to jobs with an opening opened in the period, so recruiter and pod rows add up the same
    // jobs their job rows list.
    const A = actData(), asr = A.stageRollups || {};
    const aTisRec = asr.timeInStageByRecruiter || null, aTisRecQ = asr.timeInStageByRecruiterQ || null;
    const aWaitRec = asr.waitingByRecruiter || null, aWaitRecQ = asr.waitingByRecruiterQ || null;
    const aTisRecJobQ = asr.timeInStageByRecruiterJobQ || null, aWaitRecJobQ = asr.waitingByRecruiterJobQ || null;
    const aArRec = A.appReviewDwellByRecruiter || null, aArRecJob = A.appReviewDwellByRecruiterJob || null;
    const aByJob = {}; (A.recruiters || []).forEach(x => { aByJob[x.name] = x.byJob || []; });
    // #129: inside a narrower From / To range the stays come from the day twins, by the day the candidate entered the stage. A rollups
    // file from before 15 Sep has none, so a narrow range then reads empty rather than the quarter.
    const rgT = selRange(), dayTis = !coversQuarters(rgT, per);
    const dTisRec = asr.timeInStageByRecruiterD || null, dWaitRec = asr.waitingByRecruiterD || null;
    const dTisRecJob = asr.timeInStageByRecruiterJobD || {}, dWaitRecJob = asr.waitingByRecruiterJobD || {};
    const recHists = (r) => TIS_STAGES.map(([sk]) => sk === 'appReview'
      ? arPair(aArRec && aArRec[r.name])
      : (dayTis ? tisPairRange(dTisRec, dWaitRec, r.name, sk, rgT, tisSplit)
                : tisPair(aTisRec, aTisRecQ, aWaitRec, aWaitRecQ, r.name, sk, per, tisSplit)));
    // #120a (Jerin, 14 Sep 2026): a job row under a recruiter shows THAT recruiter's own candidates on the role, so the job rows
    // add up to the recruiter row. They used to show everyone on the role. A file without the recruiter x job split leaves the
    // row empty rather than put the whole role's figure under one person's name.
    const recJobHists = (r, j8) => TIS_STAGES.map(([sk]) => {
      if (sk === 'appReview') return arPair(aArRecJob ? (aArRecJob[r.name] || {})[j8] : null);
      if (dayTis) return tisPairRange(dTisRecJob[r.name] || {}, dWaitRecJob[r.name] || {}, j8, sk, rgT, tisSplit);   // #129
      if (!aTisRecJobQ) return { fin: {}, wait: tisSplit ? {} : null };
      const fq = aTisRecJobQ[r.name] || {}, wq = (aWaitRecJobQ || {})[r.name] || {};
      return tisPair(allTimeOf(fq), fq, allTimeOf(wq), wq, j8, sk, per, tisSplit);
    });
    // On an older data file there is no split to show, so fall back to exactly the previous single-number
    // cell rather than passing a pooled median off as a completed-stay time. tisNote says so on screen.
    const cell = (p) => tisSplit ? tisCellSplit(p, 5) : tisCell(p.live ? p.wait : p.fin, 5);
    const rowCells = (arr) => arr.map(cell).join('');
    const poolCells = (arrs) => TIS_STAGES.map((_, i) => cell(poolPairs(arrs.map(a => a[i])))).join('');
    let html = '';
    groups.forEach((G, pi) => {
      html += `<tr class="lvl-pod" data-pod="${pi}" data-exp="0" style="cursor:pointer;background:var(--border-light)"><td style="font-weight:600">${CARET}${G.pod}<span style="color:var(--muted);font-weight:400;font-size:0.6875rem;margin-left:0.375rem">${G.recs.length}</span></td>${poolCells(G.recs.map(recHists))}</tr>`;
      G.recs.forEach((r, ri) => {
        const rk = `t${pi}-${ri}`;
        html += `<tr class="lvl-rec" data-pod="${pi}" data-rec="${rk}" data-exp="0" style="display:none;cursor:pointer"><td style="padding-left:1.625rem;font-weight:500">${CARET}${r.name}${inactiveTag(r)}</td>${rowCells(recHists(r))}</tr>`;
        // #125: only this recruiter's jobs with an opening opened in the period, and no empty rows (nobody finished or waiting).
        const hasAny = (h) => !!h && Object.values(h).some(v => v > 0);
        const jobs = (aByJob[r.name] || []).slice().sort((a, b) => (b.total || 0) - (a.total || 0))
          .map(bj => ({ bj, h: recJobHists(r, (bj.jobId || '').slice(0, 8)) }))
          .filter(x => x.h.some(p => hasAny(p.fin) || hasAny(p.wait)));
        if (jobs.length) jobs.forEach(({ bj, h }) => {
          html += `<tr class="lvl-stage" data-pod="${pi}" data-parent-rec="${rk}" style="display:none"><td style="padding-left:3.25rem;color:var(--muted)">${bj.title || '(untitled)'}</td>${rowCells(h)}</tr>`;
        });
        else html += `<tr class="lvl-stage" data-pod="${pi}" data-parent-rec="${rk}" style="display:none"><td style="padding-left:3.25rem;color:var(--muted);font-style:italic">No activity on jobs with an opening in this period</td>${'<td class="zero">·</td>'.repeat(TIS_STAGES.length)}</tr>`;
      });
    });
    body.innerHTML = html || `<tr><td colspan="${TIS_STAGES.length + 1}" style="text-align:center;color:var(--muted);padding:1rem">No recruiters match the filter.</td></tr>`;
    wireVelTree(body);
    shadeTis(body);   // #137c
    tisNote(per);
  }

  // Surfaces data.dataQuality (the attribution pass's compliance payload) + the Active/Inactive roster.
  // #120a: Data Hygiene never follows the Job filter (its definitions say so). It renders against baseData, with every store
  // re-read from it for the duration and put back afterwards; `data` and `allRecs` are pinned inside so its CSV exports,
  // which run later on a click, read baseData too.
  function renderHygiene() {
    if (data === baseData) return renderHygieneOn();
    const narrowedData = data;
    bindData(baseData);
    try { return renderHygieneOn(); } finally { bindData(narrowedData); }
  }
  // #13 (Jerin, 14 Sep 2026): Data Hygiene is a side list (mock-up B1). hygActive = the list on screen (kept across re-renders and
  // reloads); hygCounts is filled by renderHygieneOn() and drives the dots, badges and state bar. A null count means the data is from
  // before the pipeline change and that list waits for the next refresh.
  const HYG_IDS = HYGIENE_LISTS.map(l => l.id);
  let hygActive = (() => { try { const v = localStorage.getItem('ik_hyg_list'); return HYG_IDS.includes(v) ? v : HYG_IDS[0]; } catch (e) { return HYG_IDS[0]; } })();
  let hygCounts = {}, hygScopeLabel = {};
  const HY_TICK = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.4l2.3 2.3 4.7-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const HY_CHEV = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M3.5 1.8L6.7 5 3.5 8.2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const HY_CAL = '<svg viewBox="0 0 12 12" aria-hidden="true"><rect x="1.5" y="2.5" width="9" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M1.5 5h9M4 1.3v2.2M8 1.3v2.2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>';
  const HY_DL = '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M7 2v7M4 6.5L7 9.5l3-3M2.5 11.5h9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const HY_LABEL = { fix: 'Needs a fix', record: 'For the record', clear: 'Nothing to fix', wait: 'Next refresh' };
  const hyEsc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const hyState = l => { const n = hygCounts[l.id]; return n == null ? 'wait' : n === 0 ? 'clear' : (l.record ? 'record' : 'fix'); };
  const hyBadge = l => {
    const st = hyState(l), n = hygCounts[l.id];
    if (st === 'clear') return `<span class="hy-n clear">${HY_TICK}0</span>`;
    if (st === 'wait') return '<span class="hy-n wait">—</span>';
    return `<span class="hy-n ${st}">${n.toLocaleString()}</span>`;
  };
  function renderHygRail() {
    const rail = document.getElementById('hyRail'); if (!rail) return;
    const tally = { fix: 0, record: 0, clear: 0, wait: 0 };
    HYGIENE_LISTS.forEach(l => { tally[hyState(l)]++; });
    const setHtml = (id, h) => { const el = document.getElementById(id); if (el) el.innerHTML = h; };
    setHtml('hyRailCount', `${HYGIENE_LISTS.length} lists`);
    setHtml('hyStateBar', ['fix', 'record', 'clear', 'wait'].filter(k => tally[k]).map(k => `<i class="s-${k}" style="flex:${tally[k]}"></i>`).join(''));
    setHtml('hyLegend', ['fix', 'record', 'clear'].map(k => `<span><i class="hy-dot ${k}"></i><b>${tally[k]}</b> ${HY_LABEL[k].toLowerCase()}</span>`).join(''));
    const groups = [...new Set(HYGIENE_LISTS.map(l => l.group))];
    rail.innerHTML = groups.map(g => {
      const items = HYGIENE_LISTS.filter(l => l.group === g);
      const toFix = items.filter(l => hyState(l) === 'fix').length;
      return `<div class="hy-grp"><span>${hyEsc(g)}</span><em>${toFix ? toFix + ' to fix' : 'all clear'}</em></div>` +
        items.map(l => `<button type="button" class="hy-row" role="option" data-id="${l.id}" aria-selected="${l.id === hygActive}" tabindex="${l.id === hygActive ? 0 : -1}"><i class="hy-dot ${hyState(l)}"></i><span class="hy-name">${hyEsc(l.name)}</span>${hyBadge(l)}<span class="hy-sub">${hyEsc(l.sub)}</span></button>`).join('');
    }).join('');
  }
  function renderHygHead() {
    const head = document.getElementById('hyHead'); if (!head) return;
    const l = HYGIENE_LISTS.find(x => x.id === hygActive) || HYGIENE_LISTS[0];
    const st = hyState(l), n = hygCounts[l.id];
    head.innerHTML = `
      <div class="hy-top">
        <div class="hy-title">
          <div class="hy-crumb">${hyEsc(l.group)}</div>
          <h3>${hyEsc(l.name)}</h3>
          <div class="hy-pills"><span class="hy-pill ${st}">${st === 'clear' ? HY_TICK : ''}${HY_LABEL[st]}</span><span class="hy-pill">${HY_CAL}${hyEsc(hygScopeLabel[l.id] || '')}</span></div>
        </div>
        <div class="hy-side">
          <div class="hy-big"><b>${n == null ? '—' : n.toLocaleString()}</b><span>${hyEsc(l.unit)}</span></div>
          <button type="button" class="hyg-dl" data-dl="${l.id}">${HY_DL}<span>Download CSV</span></button>
        </div>
      </div>
      <div class="hy-facts">
        <div class="hy-fact"><h4>Why it matters</h4><p>${hyEsc(l.why)}</p></div>
        <div class="hy-fact"><h4>Where to fix it</h4><div class="hy-path">${l.fix.map(x => `<span>${hyEsc(x)}</span>`).join(HY_CHEV)}</div></div>
      </div>`;
    document.querySelectorAll('.hyg-panel').forEach(pn => { pn.style.display = pn.dataset.h === l.id ? '' : 'none'; });
  }
  function selectHyg(id, focus) {
    if (!HYG_IDS.includes(id)) return;
    hygActive = id;
    try { localStorage.setItem('ik_hyg_list', id); } catch (e) { /* a per-viewer convenience only */ }
    renderHygRail(); renderHygHead();
    const row = document.querySelector(`#hyRail .hy-row[data-id="${id}"]`);
    if (row && focus) row.focus();
  }

  function renderHygieneOn() {
    const data = baseData, allRecs = rosterOf(baseData);
    const dq = data.dataQuality || {};
    const q = selQuarter();
    const esc = hyEsc;
    const mono = s => `<span style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:0.6875rem;color:var(--muted)">${esc(s)}</span>`;
    // #13: Unassigned / Multiple Recruiters / Multiple Sourcers are cut to the date floor BY THE PIPELINE (added, interviewed or assessed
    // on or after it). Data from before that change carries no floor, so those three wait for the next refresh instead of showing the
    // old oldest-first rows under the new heading. The two opening-link lists are cut here, from the same floor.
    const floor = dq.hygieneFloor || null;
    const FLOOR = floor || '2026-07-01';
    const FLOOR_LONG = (() => { const [y, m, d] = FLOOR.split('-').map(Number); return `${d} ${MON[m - 1]} ${y}`; })();
    const waitRow = cols => `<tr><td colspan="${cols}" style="text-align:center;color:var(--muted);padding:1rem">This list starts on ${FLOOR_LONG} from the next data refresh.</td></tr>`;
    // #126 (Jerin, 15 Sep 2026): everyone in Joining Pending with no Recruiter tagged is listed too, whatever their dates — the Recruiter
    // tables cannot credit them, and nothing else puts them in front of the team. Anyone the pipeline already listed is not repeated.
    const listedU = new Set((dq.unassigned || []).map(u => (u.job8 || '') + '|' + String(u.candidate || '').trim().toLowerCase()));
    const jpNoRec = floor ? (data.joiningPendingCases || [])
      .filter(c => (!c.recruiter || c.recruiter === 'Unassigned')
        && !listedU.has((c.jobId8 || '') + '|' + String(c.candidate || '').trim().toLowerCase()))
      .map(c => ({ candidate: c.candidate, department: c.department, job8: c.jobId8, jobTitle: c.job || c.jobTitle,
                   stage: c.subStage ? `${c.subStage} · Joining Pending` : 'Joining Pending', createdAt: '', lastActivity: '', applicationId: '' }))
      : [];
    const unassigned = floor ? (dq.unassigned || []).concat(jpNoRec) : [];
    const unassignedTotal = floor ? (dq.unassignedSinceFloor != null ? dq.unassignedSinceFloor : (dq.unassigned || []).length) + jpNoRec.length : null;
    const multiRec = floor ? (dq.multiRecruiter || []) : [];
    const multiSrc = floor ? (dq.multiSourcer || []) : [];
    const byLast = (a, b) => String(b.lastActivity || '').localeCompare(String(a.lastActivity || ''));
    const jobBy8 = {}; (data.jobs || []).forEach(j => { jobBy8[j.id] = j; });

    // --- Unassigned: Department -> Job -> Candidate (Jerin: "listed department-wise") ---
    const uBody = document.getElementById('hygUnassignedBody');
    if (uBody) {
      if (!floor) uBody.innerHTML = waitRow(5);
      else {
        const byDept = {};
        unassigned.forEach(u => {
          const jd = jobBy8[u.job8] || {};
          const dept = u.department || jd.department || '(no department)';
          const job = u.jobTitle || jd.title || u.job8 || '(unknown job)';
          const d = byDept[dept] || (byDept[dept] = {});
          (d[job] || (d[job] = [])).push(u);
        });
        const sizeOf = o => Object.values(o).reduce((n, a) => n + a.length, 0);
        let html = '';
        Object.keys(byDept).sort((a, b) => sizeOf(byDept[b]) - sizeOf(byDept[a]) || a.localeCompare(b)).forEach((dn, di) => {
          const jobs = byDept[dn], nD = sizeOf(jobs), nJ = Object.keys(jobs).length;
          html += `<tr class="lvl-pod" data-pod="u${di}" data-exp="0" style="cursor:pointer;background:var(--border-light)"><td style="font-weight:600">${CARET}${esc(dn)}<span style="color:var(--muted);font-weight:400;font-size:0.6875rem;margin-left:0.375rem">${nD}</span></td><td colspan="4" style="color:var(--muted);font-size:0.6875rem">${nD} candidate${nD === 1 ? '' : 's'} across ${nJ} job${nJ === 1 ? '' : 's'}</td></tr>`;
          Object.keys(jobs).sort((a, b) => jobs[b].length - jobs[a].length || a.localeCompare(b)).forEach((jt, ji) => {
            const rk = `u${di}-${ji}`, rows = jobs[jt];
            html += `<tr class="lvl-rec" data-pod="u${di}" data-rec="${rk}" data-exp="0" style="display:none;cursor:pointer"><td style="padding-left:1.625rem;font-weight:500">${CARET}${esc(jt)}<span style="color:var(--muted);font-weight:400;font-size:0.6875rem;margin-left:0.375rem">${rows.length}</span></td><td colspan="4"></td></tr>`;
            rows.slice().sort(byLast).forEach(u => {
              html += `<tr class="lvl-stage" data-pod="u${di}" data-parent-rec="${rk}" style="display:none"><td style="padding-left:3.25rem">${esc(u.candidate || '(candidate name not captured)')}</td><td>${esc(u.stage || '')}</td><td>${esc(u.createdAt || '')}</td><td>${esc(u.lastActivity || '')}</td><td>${mono(u.applicationId)}</td></tr>`;
            });
          });
        });
        const total = unassignedTotal;
        if (html && total > unassigned.length) html += `<tr><td colspan="5" style="color:var(--muted);font-size:0.6875rem">Showing the ${unassigned.length.toLocaleString()} with the most recent activity, of ${total.toLocaleString()}. The CSV holds the same rows.</td></tr>`;
        uBody.innerHTML = html || `<tr><td colspan="5" style="text-align:center;color:var(--green);padding:1rem">Nobody unassigned since ${FLOOR_LONG}. ✓</td></tr>`;
        wireVelTree(uBody);
      }
    }

    // --- Multiple Recruiters / Multiple Sourcers ---
    const jobTitleBy8 = {}; (data.jobs || []).forEach(j => { jobTitleBy8[j.id] = j.title; });
    const anomalyRows = list => list.slice().sort(byLast).map(m =>
      `<tr><td>${esc(jobTitleBy8[m.job8] || m.job8 || '')}</td><td>${esc(m.candidate || '—')}</td><td>${(m.names || []).map(esc).join(', ')}</td><td>${esc(m.lastActivity || '')}</td><td>${mono(m.app)}</td></tr>`).join('');
    const mrBody = document.getElementById('hygMultiRecBody');
    if (mrBody) mrBody.innerHTML = !floor ? waitRow(5) : (anomalyRows(multiRec) || `<tr><td colspan="5" style="text-align:center;color:var(--green);padding:1rem">No application has more than one Recruiter since ${FLOOR_LONG}. ✓</td></tr>`);
    const msBody = document.getElementById('hygMultiSrcBody');
    if (msBody) msBody.innerHTML = !floor ? waitRow(5) : (anomalyRows(multiSrc) || `<tr><td colspan="5" style="text-align:center;color:var(--green);padding:1rem">No application has more than one Sourcer since ${FLOOR_LONG}. ✓</td></tr>`);

    // --- Opening-link gaps: one array from the pipeline, split by whether it is still actionable. #13: an offer counts when it was
    // MADE or the person JOINS on or after the floor (Jerin: "offers in Q3 or DOJ in Q3 - or later"). ---
    const onFloor = g => (g.offerCreatedAt && g.offerCreatedAt >= FLOOR) || (g.doj && g.doj >= FLOOR);
    const gaps = (data.offerLinkGaps || []).filter(onFloor);
    const gapLive = gaps.filter(g => g.needsFix);
    const gapDone = gaps.filter(g => !g.needsFix);
    const ogBody = document.getElementById('hygOfferGapBody');
    if (ogBody) {
      ogBody.innerHTML = gapLive.map(g => `<tr><td style="font-weight:500">${esc(g.candidate)}</td><td>${esc(g.job)}</td><td>${esc(g.department)}</td><td>${esc(g.subStage)}</td><td>${esc(g.offerCreatedAt || '—')}</td><td>${esc(g.doj || '—')}</td><td>${esc(g.recruiter || '—')}</td></tr>`).join('')
        || `<tr><td colspan="7" style="text-align:center;color:var(--green);padding:1rem">Every live offer since ${FLOOR_LONG} has an opening attached. ✓</td></tr>`;
    }
    const hgBody = document.getElementById('hygHiredGapBody');
    if (hgBody) {
      hgBody.innerHTML = gapDone.map(g => `<tr><td style="font-weight:500">${esc(g.candidate)}</td><td>${esc(g.job)}</td><td>${esc(g.department)}</td><td>${esc(g.subStage)}</td><td>${esc(g.appStatus || '')}</td><td>${esc(g.offerCreatedAt || '—')}</td><td>${esc(g.doj || '—')}</td><td>${esc(g.recruiter || '—')}</td></tr>`).join('')
        || `<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:1rem">Nothing here since ${FLOOR_LONG}.</td></tr>`;
    }

    // --- Roles that score zero for the selected quarter ---
    // Ask the REAL scorer, not a crude "is a field blank?" test. A role scores zero when it can't be
    // classified — for Tech/NonTech that means a missing Level; SME scores on Complexity alone (Level
    // irrelevant) and PA scores by title, so neither is flagged for a blank Level. A missing Complexity
    // defaults to Normal and does NOT zero a role. Exclude-dept roles (Test) score zero by design — skipped.
    const unscored = (data.jobs || [])
      .filter(j => scoreForRole(j, q) === 0 && familyForJob(j.department, j.title) !== 'Exclude')
      .map(j => {
        const fam = familyForJob(j.department, j.title);
        const reason = (fam === 'Tech' || fam === 'NonTech') && (!j.level || j.level === 'NA') ? 'Level'
          : !fam ? 'Department not mapped' : 'Not scored';
        return { j, reason };
      })
      .sort((a, b) => (b.j.total || 0) - (a.j.total || 0));
    // Openings with no opened date. The pipeline emits ONE row per opening (not per opening x job), so this list reconciles exactly
    // with dataQuality.openingsNoOpenedAt. An opening with no date is skipped by the bucket loop, so it never reaches Total Openings.
    const noDate = (data.openingsNoDate || []).slice()
      .sort((a, b) => (b.status === 'Open') - (a.status === 'Open')
        || (a.department || '').localeCompare(b.department || '')
        || (a.title || '').localeCompare(b.title || ''));
    const ndBody = document.getElementById('hygNoDateBody');
    if (ndBody) {
      ndBody.innerHTML = noDate.map(o => `<tr>
        <td style="font-weight:500">${esc(o.title || '(job not found)')}${o.jobs > 1 ? `<span style="color:var(--muted);font-weight:400;font-size:0.6875rem;margin-left:0.375rem">+${o.jobs - 1} more job${o.jobs > 2 ? 's' : ''}</span>` : ''}</td>
        <td>${esc(o.department || '—')}</td>
        <td class="${o.status === 'Open' ? 'warn' : 'zero'}">${esc(o.status || '—')}</td>
        <td>${mono(o.openingId || '')}</td></tr>`).join('')
        || `<tr><td colspan="4" style="text-align:center;color:var(--green);padding:1rem">Every opening has an opened date. ✓</td></tr>`;
    }
    // #125 (Jerin, 15 Sep 2026): Open jobs worked in the quarter with no opening OPENED in it. Momentum, Screening Efficiency, Throughput,
    // Time in Process and Panelists list only jobs with an opening opened in the period, so this work is hidden there until the job gets
    // one. Work = new candidates, R1 screened, stage assessments, finished stage stays or interviews in the quarter.
    const srH = data.stageRollups || {};
    const qY = String(q).slice(0, 4), qN = parseInt(String(q).slice(6), 10) || 1;
    const qFrom = `${qY}-${String((qN - 1) * 3 + 1).padStart(2, '0')}-01`, qTo = `${qY}-${String(qN * 3).padStart(2, '0')}-31`;
    const withOpening = jobsWithOpeningIn(data, qq => qq === q);
    const noDate8 = new Set((data.openingsNoDate || []).map(o => String(o.jobId8 || '').slice(0, 8)));
    const histSum = (h) => Object.values(h || {}).reduce((t, v) => t + (typeof v === 'number' ? v : 0), 0);
    const noOpening = (data.jobs || []).filter(j => j.status === 'Open' && !withOpening.has(String(j.id).slice(0, 8))).map(j => {
      const j8 = String(j.id).slice(0, 8);
      const tofu = Object.entries((srH.tofuByJob || {})[j8] || {}).reduce((t, [dk, v]) => t + (dk >= qFrom && dk <= qTo ? v : 0), 0);
      const r1 = ((((srH.r1ByJob || {})[j8]) || {})[q] || {}).added || 0;
      const assessed = Object.values((srH.assessedByJobQ || {})[j8] || {}).reduce((t, st) => t + ((st[q] || {}).a || 0), 0);
      const stays = Object.values((srH.timeInStageByJobQ || {})[j8] || {}).reduce((t, st) => t + histSum(st[q]), 0);
      const interviews = ((data.interviewsByJobQ || {})[j8] || {})[q] || 0;
      const older = Object.keys(((data.openingBuckets || {})[j8] || {}).quarters || {}).filter(qq => qq < q).sort();
      const openings = noDate8.has(j8) ? 'An opening with no opened date'
        : older.length ? `Earlier quarters only (${older.join(', ')})` : 'None';
      return { j, tofu, r1, assessed, stays, interviews, openings };
    }).filter(x => x.tofu || x.r1 || x.assessed || x.stays || x.interviews)
      .sort((a, b) => (b.assessed - a.assessed) || (b.tofu - a.tofu));
    const noOpBody = document.getElementById('hygNoOpeningBody');
    if (noOpBody) {
      noOpBody.innerHTML = noOpening.map(x => `<tr>
        <td style="font-weight:500">${esc(x.j.title || '(untitled)')}</td>
        <td>${esc(x.j.department || '—')}</td>
        <td>${x.tofu}</td><td>${x.r1}</td><td>${x.assessed}</td><td>${x.stays}</td><td>${x.interviews}</td>
        <td class="${x.openings === 'None' ? 'warn' : ''}">${esc(x.openings)}</td></tr>`).join('')
        || `<tr><td colspan="8" style="text-align:center;color:var(--green);padding:1rem">Every Open job worked this quarter has an opening opened in it. ✓</td></tr>`;
    }
    const usBody = document.getElementById('hygUnscoredBody');
    if (usBody) {
      usBody.innerHTML = unscored.map(({ j, reason }) => `<tr>
        <td style="font-weight:500">${esc(j.title || '(untitled)')}</td>
        <td>${esc(j.department || '—')}</td>
        <td class="${reason === 'Level' ? 'zero' : ''}">${esc(j.level || '—')}</td>
        <td>${esc(j.complexity || '—')}</td>
        <td style="color:var(--orange);font-weight:500">${reason}</td>
        <td>${j.total || 0}</td></tr>`).join('')
        || `<tr><td colspan="6" style="text-align:center;color:var(--green);padding:1rem">Every role scores for this quarter. ✓</td></tr>`;
    }

    // --- Other anomalies ---
    const anomList = [];
    (dq.excludedAsRecruiter || []).forEach(n => anomList.push({
      what: 'Excluded interviewer credited as a Recruiter',
      detail: n,
      fix: 'Correct the recruiter attribution in Ashby — this person is a dedicated interviewer, not a recruiter.'
    }));
    // A stage title Ashby uses that the pipeline has no mapping for is dropped from EVERY count, silently. That is how "Online
    // Assessment" reported zero for months while candidates sat in it. 'Hired' and 'Archived' are unmapped BY DESIGN (status, not
    // stage) and the two biggest, so they sit in a muted footnote rather than burying the real signal.
    const EXPECTED_UNMAPPED = { Hired: 'counted from application status, not stage', Archived: 'rejected/withdrawn — deliberately outside the live pipeline' };
    const unmapped = Object.entries(dq.unmappedStages || {}).sort((a, b) => b[1] - a[1]);
    unmapped.filter(([stage]) => !EXPECTED_UNMAPPED[stage]).forEach(([stage, n]) => anomList.push({
      what: 'Ashby stage not recognised by the dashboard',
      detail: `"${stage}" — ${n} application${n === 1 ? '' : 's'} currently in it, counted nowhere`,
      fix: 'Either rename the stage in Ashby to match the pipeline, or add it to STAGE_KEY_MAP in DataRefresh.gs. Until then these candidates are invisible to every metric.'
    }));
    const expectedSeen = unmapped.filter(([stage]) => EXPECTED_UNMAPPED[stage]);
    const anBody = document.getElementById('hygAnomBody');
    if (anBody) {
      let ah = anomList.map(a => `<tr><td style="font-weight:500">${esc(a.what)}</td><td>${esc(a.detail)}</td><td style="color:var(--muted)">${esc(a.fix)}</td></tr>`).join('')
        || `<tr><td colspan="3" style="text-align:center;color:var(--green);padding:1rem">No anomalies. ✓</td></tr>`;
      if (expectedSeen.length) {
        ah += `<tr><td colspan="3" style="color:var(--muted);font-size:0.6875rem;padding-top:0.625rem;border-top:1px solid var(--border-light)">Also outside the stage map, as expected: `
          + expectedSeen.map(([st, n]) => `<strong>${esc(st)}</strong> (${n.toLocaleString()})`).join(' · ') + `.</td></tr>`;
      }
      anBody.innerHTML = ah;
    }

    // People in closing per recruiter, from the live Joining Pending list.
    const jpCount = {}; (data.joiningPendingCases || []).forEach(c => { if (c.recruiter) jpCount[c.recruiter] = (jpCount[c.recruiter] || 0) + 1; });
    const jpCountOf = (name) => jpCount[name] || 0;

    // --- Capacity Not Set. #13 (Jerin, 14 Sep 2026): only people who count in the quarter AND sit in a real pod (no pod and Others are
    // left out) whose capacity was never ENTERED. An entered 0 is a decision, not a gap — capacityOf() cannot tell the two apart. ---
    const noCap = allRecs
      .filter(r => r.name && r.name !== 'Unassigned' && presentIn(r, q))
      .map(r => ({ r, pod: effectivePod(r, q), offers: r.offer || 0, hired: r.hired || 0, jp: jpCountOf(r.name) }))
      .filter(x => x.pod !== 'Unassigned' && x.pod !== 'Others' && !capacityIsSet(x.r.name, q))
      .sort((a, b) => a.pod.localeCompare(b.pod) || a.r.name.localeCompare(b.r.name));
    const noCapBody = document.getElementById('hygNoCapBody');
    if (noCapBody) {
      noCapBody.innerHTML = noCap.map(({ r, pod, offers, hired, jp }) => `<tr><td style="font-weight:500">${esc(r.name)}</td><td>${esc(pod)}</td><td>${offers}</td><td class="${hired > 0 ? 'good' : 'zero'}">${hired}</td><td class="${jp > 0 ? 'warn' : 'zero'}">${jp}</td></tr>`).join('')
        || `<tr><td colspan="5" style="text-align:center;color:var(--green);padding:1rem">Everyone in a pod has a capacity for this quarter. ✓</td></tr>`;
    }

    // --- #105i (Jerin, 13 Sep 2026): selected candidates with no source in Ashby ---
    // Selected = an offer that ended in Hired (Joined), is still live (Joining pending) or was archived after the offer (Dropped after
    // offer), dated by the offer's START DATE — the date Joined uses everywhere, so the Joined rows here are exactly Sourcing Mix's
    // "(source not recorded)" joiners for the quarter. A live or dropped offer with no start date falls back to the day it was created.
    const qOfNs = (ds) => (ds && ds.length >= 7) ? `${ds.slice(0, 4)}-Q${Math.floor((+ds.slice(5, 7) - 1) / 3) + 1}` : null;
    const NS_ORDER = { 'Joined': 0, 'Joining pending': 1, 'Dropped after offer': 2 };
    const nsBest = {};
    (data.offerEvents || []).forEach(e => {
      if (e.srcType) return;
      let outcome = null, when = null;
      if (e.appStatus === 'Hired' && e.accepted) { outcome = 'Joined'; when = qOfNs(e.startDate); }
      else if (e.appStatus === 'Active' && e.offerStatus !== 'CandidateRejected') { outcome = 'Joining pending'; when = qOfNs(e.startDate) || qOfNs(e.offerCreatedAt); }
      else if (e.appStatus === 'Archived') { outcome = 'Dropped after offer'; when = qOfNs(e.startDate) || qOfNs(e.offerCreatedAt); }
      if (!outcome || when !== q) return;
      const k = String(e.candidate || '').trim().toLowerCase() + '|' + (e.jobTitle || '');
      if (!nsBest[k] || NS_ORDER[outcome] < NS_ORDER[nsBest[k].outcome]) nsBest[k] = { e, outcome };
    });
    const noSrc = Object.values(nsBest).sort((a, b) => NS_ORDER[a.outcome] - NS_ORDER[b.outcome]
      || String(a.e.startDate || a.e.offerCreatedAt || '').localeCompare(String(b.e.startDate || b.e.offerCreatedAt || '')));
    const nsBody = document.getElementById('hygNoSrcBody');
    if (nsBody) {
      const nsColour = { 'Joined': 'var(--green)', 'Joining pending': 'var(--orange)', 'Dropped after offer': 'var(--muted)' };
      nsBody.innerHTML = noSrc.map(({ e, outcome }) => `<tr><td style="font-weight:500">${esc(String(e.candidate || '').trim())}</td><td>${esc(e.jobTitle)}</td><td>${esc(e.department)}</td><td><span style="font-size:0.6875rem;font-weight:600;color:${nsColour[outcome]}">${outcome}</span></td><td>${esc(e.startDate || '—')}</td><td>${esc(e.recruiter || '—')}</td></tr>`).join('')
        || `<tr><td colspan="6" style="text-align:center;color:var(--green);padding:1rem">Every selected candidate in ${esc(q)} has a source in Ashby. ✓</td></tr>`;
    }

    // --- Pod Not Set: the numbers this tab deliberately leaves out. getFilteredRecs() drops anyone whose pod resolves to "Unassigned"
    // from rows AND totals, which is only honest if their work shows here. #13 (Jerin, 14 Sep 2026): only people who count in the
    // quarter ("active folks") — a departed recruiter with no pod is not a gap. ---
    const noPod = allRecs
      .filter(r => r.name && r.name !== 'Unassigned' && presentIn(r, q) && podOf(r.name, q) === 'Unassigned')
      .map(r => ({ r, total: r.total || 0, offers: r.offer || 0, hired: r.hired || 0, jp: jpCountOf(r.name) }))
      .sort((a, b) => (b.offers + b.hired) - (a.offers + a.hired) || a.r.name.localeCompare(b.r.name));
    const noPodBody = document.getElementById('hygNoPodBody');
    if (noPodBody) {
      noPodBody.innerHTML = noPod.map(({ r, total, offers, hired, jp }) => `<tr><td style="font-weight:500">${esc(r.name)}</td><td>${total.toLocaleString()}</td><td>${offers}</td><td class="${hired > 0 ? 'good' : 'zero'}">${hired}</td><td class="${jp > 0 ? 'warn' : 'zero'}">${jp}</td></tr>`).join('')
        || `<tr><td colspan="5" style="text-align:center;color:var(--green);padding:1rem">Everyone who counts this quarter has a pod — nothing is being left out. ✓</td></tr>`;
    }

    // --- #111: recruiter Started on / Left on dates, checked against the work credited to them ---
    const qOfD = (ds) => (ds && ds.length >= 7) ? `${ds.slice(0, 4)}-Q${Math.floor((+ds.slice(5, 7) - 1) / 3) + 1}` : null;
    const yearQs = [1, 2, 3, 4].map(n => qKey(String(q).slice(0, 4), n)).filter(k => k >= REPORTING_START && k <= currentQuarter());   // #127c
    const work = {};   // name -> quarter -> { open, joined, drops }
    const addWork = (name, qq, k, n) => { if (!name || !qq || !n) return; const a = (work[name] = work[name] || {}); const b = (a[qq] = a[qq] || { open: 0, joined: 0, drops: 0 }); b[k] += n; };
    Object.entries(data.ownedSeatsByRecruiterQ || {}).forEach(([name, byQ]) => Object.entries(byQ || {}).forEach(([qq, byJob]) =>
      addWork(name, qq, 'open', Object.values(byJob || {}).reduce((sum, v) => sum + (+v || 0), 0))));
    (data.offerEvents || []).forEach(e => { if (e.accepted && e.appStatus === 'Hired') addWork(e.recruiter, qOfD(e.startDate), 'joined', 1); });
    dropRows(data).forEach(e => addWork(e.recruiter, e.quarter, 'drops', 1));
    const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
    const workTxt = (w) => [w.open ? (w.open % 1 ? 'a share of ' + plural(Math.ceil(w.open), 'opening') : plural(w.open, 'opening') + ' owned') : '', w.joined ? plural(w.joined, 'joiner') : '', w.drops ? plural(w.drops, 'drop') : ''].filter(Boolean).join(' · ');
    const datesMap = getRecruiterDates();
    const rosterRecs = allRecs.filter(r => r.name && r.name !== 'Unassigned' && !r.sourcerOnly);
    const datesOut = [];
    rosterRecs.forEach(r => { const d = datesMap[r.name]; if (!d || (!d.start && !d.end)) return;
      yearQs.forEach(qq => { const w = (work[r.name] || {})[qq]; if (!w) return;
        if (!recruiterInQuarter(r.name, qq, r.isActive).in) datesOut.push({ r, qq, w, d }); }); });
    const lastWorkQ = (name) => Object.keys(work[name] || {}).sort().pop() || '';
    const datesNoEnd = rosterRecs.filter(r => r.isActive === false && !(datesMap[r.name] || {}).end);
    const datesNoStart = rosterRecs.filter(r => r.isActive !== false && !(datesMap[r.name] || {}).start);
    const dOutBody = document.getElementById('hygDatesOutBody');
    if (dOutBody) dOutBody.innerHTML = datesOut.map(({ r, qq, w, d }) => `<tr><td style="font-weight:500">${esc(r.name)}</td><td>${esc(qq)}</td><td>${esc(workTxt(w))}</td><td>${esc(d.start || '—')}</td><td>${esc(d.end || '—')}</td></tr>`).join('')
      || `<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:1rem">No work is credited outside anyone's dates.</td></tr>`;
    const dNoEndBody = document.getElementById('hygDatesNoEndBody');
    if (dNoEndBody) dNoEndBody.innerHTML = datesNoEnd.map(r => `<tr><td style="font-weight:500">${esc(r.name)}</td><td>${esc((datesMap[r.name] || {}).start || '—')}</td><td>${esc(lastWorkQ(r.name) || '—')}</td></tr>`).join('')
      || `<tr><td colspan="3" style="text-align:center;color:var(--muted);padding:1rem">Every disabled Ashby account has a Left on date.</td></tr>`;
    const setTxt = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
    setTxt('hygDatesOutN', datesOut.length ? '· ' + datesOut.length : '');
    setTxt('hygDatesNoEndN', datesNoEnd.length ? '· ' + datesNoEnd.length : '');
    const dNoStart = document.getElementById('hygDatesNoStart');
    if (dNoStart) dNoStart.innerHTML = datesNoStart.length
      ? `<strong>${datesNoStart.length}</strong> current recruiter${datesNoStart.length === 1 ? '' : 's'} with no Started on date — they count from the first quarter on record: ${datesNoStart.map(r => esc(r.name)).join(' · ')}`
      : 'Every current recruiter has a Started on date.';

    // --- the side list: counts, date scopes, then draw ---
    const sinceFloor = (key, rows) => floor ? (dq[key] != null ? dq[key] : rows.length) : null;
    hygCounts = {
      unassigned: unassignedTotal,   // #126: includes Joining Pending people with no Recruiter
      multirec: sinceFloor('multiRecruiterSinceFloor', multiRec),
      multisrc: sinceFloor('multiSourcerSinceFloor', multiSrc),
      nosrc: noSrc.length,
      dates: datesOut.length + datesNoEnd.length,   // #111: the no-start list is informational
      nopod: noPod.length,
      nocap: noCap.length,
      offergap: gapLive.length,
      hiredgap: gapDone.length,
      nodate: noDate.length,
      noopening: noOpening.length,   // #125
      unscored: unscored.length,
      anomalies: anomList.length,
    };
    const qParts = String(q).split('-Q');
    const SCOPE_TXT = { floor: `Since ${FLOOR_LONG}`, quarter: `Q${qParts[1]} ${qParts[0]}`, year: `Year ${qParts[0]}`, all: 'All openings', live: 'Live' };
    hygScopeLabel = Object.fromEntries(HYGIENE_LISTS.map(l => [l.id, SCOPE_TXT[l.scope] || '']));
    renderHygRail();
    renderHygHead();

    // --- CSV export per list (client-side; no backend) ---
    hygCsv = {
      unassigned: () => [['Department', 'Job', 'Candidate', 'Stage', 'Applied', 'Last activity', 'Application ID'],
        ...unassigned.slice().sort(byLast).map(u => { const jd = jobBy8[u.job8] || {}; return [u.department || jd.department || '', u.jobTitle || jd.title || u.job8 || '', u.candidate || '', u.stage || '', u.createdAt || '', u.lastActivity || '', u.applicationId || '']; })],
      multirec: () => [['Job', 'Candidate', 'Recruiters tagged', 'Last activity', 'Application ID'],
        ...multiRec.slice().sort(byLast).map(m => [jobTitleBy8[m.job8] || m.job8 || '', m.candidate || '', (m.names || []).join(' | '), m.lastActivity || '', m.app || ''])],
      multisrc: () => [['Job', 'Candidate', 'Sourcers tagged', 'Last activity', 'Application ID'],
        ...multiSrc.slice().sort(byLast).map(m => [jobTitleBy8[m.job8] || m.job8 || '', m.candidate || '', (m.names || []).join(' | '), m.lastActivity || '', m.app || ''])],
      nosrc: () => [['Candidate', 'Job', 'Department', 'Outcome', 'Start date', 'Offer created', 'Recruiter', 'Quarter'],
        ...noSrc.map(({ e, outcome }) => [String(e.candidate || '').trim(), e.jobTitle || '', e.department || '', outcome, e.startDate || '', e.offerCreatedAt || '', e.recruiter || '', q])],
      dates: () => [['Check', 'Recruiter', 'Quarter', 'Work found', 'Started on', 'Left on'],
        ...datesOut.map(({ r, qq, w, d }) => ['Work credited outside their dates', r.name, qq, workTxt(w), d.start || '', d.end || '']),
        ...datesNoEnd.map(r => ['Ashby account disabled, no Left on date', r.name, lastWorkQ(r.name), '', (datesMap[r.name] || {}).start || '', '']),
        ...datesNoStart.map(r => ['No Started on date', r.name, '', '', '', (datesMap[r.name] || {}).end || ''])],
      nopod: () => [['Recruiter', 'Applications (all-time)', 'Offers (all-time)', 'Hired (all-time)', 'Joining pending'],
        ...noPod.map(({ r, total, offers, hired, jp }) => [r.name, total, offers, hired, jp])],
      nocap: () => [['Recruiter', 'Pod', 'Offers (all-time)', 'Hired (all-time)', 'Joining pending'],
        ...noCap.map(({ r, pod, offers, hired, jp }) => [r.name, pod, offers, hired, jp])],
      offergap: () => [['Candidate', 'Job', 'Department', 'Stage', 'Offer made', 'DOJ', 'Recruiter'],
        ...gapLive.map(g => [g.candidate || '', g.job || '', g.department || '', g.subStage || '', g.offerCreatedAt || '', g.doj || '', g.recruiter || ''])],
      hiredgap: () => [['Candidate', 'Job', 'Department', 'Stage', 'Status', 'Offer made', 'DOJ', 'Recruiter'],
        ...gapDone.map(g => [g.candidate || '', g.job || '', g.department || '', g.subStage || '', g.appStatus || '', g.offerCreatedAt || '', g.doj || '', g.recruiter || ''])],
      noopening: () => [['Job', 'Department', 'New candidates', 'R1 screened', 'Assessed', 'Finished stays', 'Interviews', 'Openings in Ashby'],
        ...noOpening.map(x => [x.j.title || '', x.j.department || '', x.tofu, x.r1, x.assessed, x.stays, x.interviews, x.openings])],
      nodate: () => [['Job', 'Department', 'Job status', 'Opening ID', 'Jobs on this opening'],
        ...noDate.map(o => [o.title || '', o.department || '', o.status || '', o.openingId || '', o.jobs || 1])],
      unscored: () => [['Job', 'Department', 'Level', 'Complexity', 'Reason', 'Applications'],
        ...unscored.map(({ j, reason }) => [j.title || '', j.department || '', j.level || '', j.complexity || '', reason || '', j.total || 0])],
      anomalies: () => [['Anomaly', 'Detail', 'What to do'], ...anomList.map(a => [a.what, a.detail, a.fix])]
    };
  }

  // Turns a row array into a downloaded CSV. Quotes every field so commas, quotes and
  // newlines in job titles or candidate names can't break the columns.
  let hygCsv = {};
  function downloadCsv(rows, filename) {
    const body = rows.map(r => r.map(v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ===== Momentum render (Pod -> Recruiter -> Stage; every day of the range, descending) =====
  function velDates() {
    const toV = document.getElementById('recVelTo')?.value;
    const fromV = document.getElementById('recVelFrom')?.value;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let end = toV ? new Date(toV + 'T00:00:00') : today;
    if (end > today) end = today; // never show future dates — cap the window at today
    const start = fromV ? new Date(fromV + 'T00:00:00') : null;
    const out = [];
    // #141c (Jerin, 17 Sep): every day From → To, newest first. It used to stop at 30 days, so a From earlier than that moved
    // nothing (Rule 13). A long range scrolls sideways (Jerin, 31 Aug: "let that lead to scrolling, its ok"). From is always set
    // from the period; without one the grid keeps the old 30 days, so it can never run away.
    const days = start ? Math.floor((end - start) / 86400000) + 1 : 30;
    for (let i = 0; i < days; i++) {
      const d = new Date(end); d.setDate(end.getDate() - i);
      if (start && d < start) break;
      out.push(d);
    }
    return out; // most recent first
  }
  function applyVelYearQuarter() {
    const fromEl = document.getElementById('recVelFrom'), toEl = document.getElementById('recVelTo');
    if (!fromEl || !toEl) return;
    // #127c: the whole selection, never before Q3 2026 (Year and Quarter both on All = every quarter on offer).
    // #127b: and the pickers cannot leave it — other days are greyed out, and a date typed outside it snaps back.
    setDateBounds(fromEl, toEl, selectionQuarters(document.getElementById('recVelYear')?.value || '', document.getElementById('recVelQuarter')?.value || ''), true);
  }
  // ===== ToFU (top of funnel) — rebuilt 2026-08-26 to Jerin's spec =====
  // "How many candidates got added to ToFU on a particular day. ToFU is HM or OA or R1, whichever comes
  //  first. Once a candidate is logged as added to ToFU they shouldn't be repeated in the same job."
  // So this is ONE row per candidate, not three rows of stages. The three signals are HM Review entry,
  // an assessment TRIGGERED while the candidate sat in the Online Assessment stage, and an R1 interview
  // being BOOKED (dated the day it was booked). Cancelled bookings and cancelled assessments do not count.
  // The deduplication happens in the PIPELINE — candidate identity exists nowhere in this file — and it
  // resets each quarter, so quarters do not add up to a year.
  // ⚠ Deliberately NOT Screening Efficiency's "Added", which counts arrivals at each stage separately and
  // counts a person again every time they re-enter one. Two questions, two numbers. Do not reconcile them.
  function dkey(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function tofuStores() {
    const sr = actData().stageRollups || {};   // #125
    return { rec: sr.tofuByRecruiter || null, recJob: sr.tofuByRecruiterJob || null };
  }
  // Pod colours, shared by the Momentum chart and the pod hairline in its table.
  const POD_COLORS = ['#4E6BA6', '#398AA2', '#1E7590', '#938FB8', '#B5859A'];
  function renderVelocity() {
    const head = document.getElementById('recVelHead');
    const body = document.getElementById('recVelBody');
    if (!body) return;
    const { rec: tRec, recJob: tRecJob } = tofuStores();
    const recs = getFilteredRecs();
    const groups = groupByPod(recs, selQuarter());
    const dates = velDates();
    const dkeys = dates.map(dkey);

    if (head) {
      let h = `<tr><th style="min-width:15rem">Pod / Recruiter / Job</th><th>Total · ${dates.length}d</th>`;
      dates.forEach(d => {
        const wknd = d.getDay() === 0 || d.getDay() === 6;
        h += `<th class="${wknd ? 'wknd' : ''}"${wknd ? ' title="Weekend"' : ''}>${MON[d.getMonth()]} ${d.getDate()}</th>`;
      });
      head.innerHTML = h + '</tr>';
    }
    const ncol = dates.length + 2;
    // No ToFU field yet (rollups file written before 2026-08-26). Say so rather than falling back to the
    // old per-stage counts: those answer a different question and would sit under this heading as a lie.
    if (!tRec) {
      body.innerHTML = `<tr><td colspan="${ncol}" style="text-align:center;color:var(--muted);padding:1rem">Arrivals appear after the next stage-history refresh.</td></tr>`;
      return;
    }
    const numRow = (total, perDay, boldTotal) =>
      `<td${boldTotal ? ' style="font-weight:600"' : ''}>${total > 0 ? total : '<span class="zero">0</span>'}</td>`
      + perDay.map(v => `<td>${v > 0 ? v : '<span class="zero">·</span>'}</td>`).join('');
    const series = (m) => { let t = 0; const per = dkeys.map(dk => { const v = (m && m[dk]) || 0; t += v; return v; }); return { per, t }; };
    const addInto = (dst, src) => { src.forEach((v, i) => dst[i] += v); };
    const jobTitleOf = {}; (data.jobs || []).forEach(j => { jobTitleOf[j.id] = j.title; });
    const spanN = (n) => `<span style="color:var(--muted);font-weight:400;font-size:0.6875rem;margin-left:0.375rem">${n}</span>`;

    let html = '';
    groups.forEach((G, pi) => {
      const podArr = new Array(dkeys.length).fill(0); let podTotal = 0;
      const recSeries = G.recs.map(r => { const sres = series(tRec[r.name]); addInto(podArr, sres.per); podTotal += sres.t; return sres; });
      // The pod's own colour from the chart, as a hairline down its row — the table and the chart are
      // reading the same pods, and this is the cheapest way to say so without adding a column.
      const podColor = POD_COLORS[pi % POD_COLORS.length];
      html += `<tr class="lvl-pod" data-path="${pi}" data-haschild data-exp="0" style="cursor:pointer;background:var(--border-light)">
        <td style="font-weight:600;box-shadow:inset 0.1875rem 0 0 ${podColor}">${CARET}${G.pod}${spanN(G.recs.length)}</td>${numRow(podTotal, podArr, true)}</tr>`;
      G.recs.forEach((r, ri) => {
        const rp = `${pi}-${ri}`;
        const jobs = [];
        const mine = tRecJob && tRecJob[r.name];
        if (mine) {
          Object.keys(mine).forEach(j8 => {
            const sres = series(mine[j8]);
            if (sres.t) jobs.push({ j8, title: jobTitleOf[j8] || j8, per: sres.per, t: sres.t });
          });
          jobs.sort((a, b) => b.t - a.t);
        }
        const quiet = recSeries[ri].t === 0 ? ' lvl-quiet' : '';
        html += `<tr class="lvl-rec${quiet}" data-path="${rp}"${jobs.length ? ' data-haschild data-exp="0"' : ''} style="display:none${jobs.length ? ';cursor:pointer' : ''}">
          <td style="padding-left:1.625rem;font-weight:500">${jobs.length ? CARET : ''}${r.name}${inactiveTag(r)}${jobs.length ? spanN(jobs.length) : ''}</td>${numRow(recSeries[ri].t, recSeries[ri].per, false)}</tr>`;
        jobs.forEach((J, ji) => {
          html += `<tr class="lvl-job" data-path="${rp}-${ji}" style="display:none">
            <td style="padding-left:3.25rem">${J.title}</td>${numRow(J.t, J.per, false)}</tr>`;
        });
      });
    });
    body.innerHTML = html || `<tr><td colspan="${ncol}" style="text-align:center;color:var(--muted);padding:1rem">No recruiters match the filter.</td></tr>`;
    wireTreePath(body);
    shadeMomentum(body, dates);   // #137c
  }

  // ===== charts (standard palette + square legends) =====
  // Pastel palette, applied site-wide 2026-08-09. blue=True Blue, green=Blue Munsell (positive/achieved),
  // cyan=Cerulean, amber=Fairy Tale (used for shortfall/gap), slate=Cool Gray. Do not hardcode off-palette hexes.
  const C = { blue: '#4E6BA6', green: '#398AA2', cyan: '#1E7590', amber: '#D8B5BE', slate: '#938FB8' };
  const legendSquare = () => ({ position: 'top', align: 'center', labels: { usePointStyle: true, pointStyle: 'rect', boxWidth: 11, boxHeight: 11, padding: 16, font: { size: 12 } } });
  const gridY = { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 11 } } };
  const gridX = { grid: { display: false }, ticks: { font: { size: 11 } } };
  const podLabels = () => lastGroups.map(G => G.pod);
  const sumBy = (G, key) => G.recs.reduce((s, r) => s + (r[key] || 0), 0);

  // ===== Momentum heatmap — recruiter × day (2026-08-30) =====
  // Was a stacked column per day. Jerin asked for a heatmap, on the condition that hovering a square lists
  // the ROLES behind it with a count against each — which is exactly what the column chart could not do
  // without a legend of twenty entries.
  // Built as HTML, not canvas, on purpose: the grid IS a table of counts, and a multi-line role list renders
  // badly in a canvas tooltip.
  // Reads the same tofuByRecruiter / tofuByRecruiterJob as the table below it, over the same days, so the
  // per-day and per-recruiter totals here are the table's own numbers.
  function buildVelChart() {
    const host = document.getElementById('recVelHeat');
    const tip = document.getElementById('recVelHeatTip');
    const wrap = document.getElementById('recVelHeatWrap');
    const wrapEl = wrap;
    if (!host) return;
    const { rec: tRec, recJob: tRecJob } = tofuStores();
    if (!tRec) { host.innerHTML = ''; return; }
    // Newest first, the same order the table below it uses (Jerin, 2026-08-31).
    const chrono = [...velDates()];
    const keys = chrono.map(dkey);
    const isWknd = chrono.map(d => d.getDay() === 0 || d.getDay() === 6);
    const jobTitleOf8 = {}; (data.jobs || []).forEach(j => { jobTitleOf8[String(j.id).slice(0, 8)] = j.title; });

    // Only the recruiters this tab shows, busiest first — same population as the table.
    const rows = [];
    groupByPod(getFilteredRecs(), selQuarter()).forEach(G => G.recs.forEach(r => {
      const per = keys.map(k => (tRec[r.name] || {})[k] || 0);
      const total = per.reduce((a, v) => a + v, 0);
      if (total > 0) rows.push({ name: r.name, pod: G.pod, per, total });
    }));
    rows.sort((a, b) => b.total - a.total);
    if (!rows.length) {
      host.innerHTML = '<p class="sub-note" style="margin:0.375rem 0 0">Nobody was added in this window for the recruiters shown.</p>';
      return;
    }

    // Roles behind each (recruiter, day) — what the hover lists.
    const roleAt = {};
    rows.forEach(r => {
      const mine = (tRecJob && tRecJob[r.name]) || {};
      Object.keys(mine).forEach(j8 => {
        keys.forEach((k, i) => {
          const v = (mine[j8] || {})[k] || 0;
          if (!v) return;
          const cell = roleAt[`${r.name}|${i}`] || (roleAt[`${r.name}|${i}`] = []);
          cell.push({ title: jobTitleOf8[j8] || j8, n: v });
        });
      });
    });

    // One shared implementation with Overall Efficiency's Momentum (chart-style.js). Rows here are
    // RECRUITERS; there they are DEPARTMENTS. Everything else - shading, totals, the role hover, the
    // column alignment against the table - is identical by construction.
    buildDayHeat(host, tip, wrapEl, rows, chrono, roleAt, {
      alignSel: '.rec-panel[data-panel="velocity"] .vel-table thead th',
      emptyMsg: 'Nobody was added in this window for the recruiters shown.'
    });
  }

  const SCREEN_SOLID = '#4E6BA6', SCREEN_PALE = '#C5CFE5';
  function buildScreenChart() {
    const ctx = document.getElementById('recScreenChart'); if (!ctx) return;
    if (recScreenChart) recScreenChart.destroy();
    const scSr = actData().stageRollups || null;   // #125: the same jobs as the table
    const per = selQuarters(), rg = selRange(), r1Day = !coversQuarters(rg, per);   // #129: the same basis as the table
    const store = (scSr && (r1Day ? scSr.r1ByRecruiterD : scSr.r1ByRecruiter)) || null;
    const wrap = ctx.parentElement;
    let emptyMsg = wrap && wrap.querySelector('.chart-empty');
    const sumIn = (byQ) => {
      const acc = { added: 0, cleared: 0 };
      if (!byQ) return acc;
      if (r1Day) { const s = sumDayFields(byQ, rg); acc.added = s.added || 0; acc.cleared = s.cleared || 0; return acc; }
      const keys = (per && per.length) ? per : Object.keys(byQ);
      keys.forEach(qq => { const c = byQ[qq]; if (c) { acc.added += c.added || 0; acc.cleared += c.cleared || 0; } });
      return acc;
    };
    const sumFor = (name) => sumIn(store && store[name]);
    // Per-JOB detail for the role gradient inside each band (Jerin, 2026-08-29). Same store the table reads.
    const jobStore = (scSr && (r1Day ? scSr.r1ByRecruiterJobD : scSr.r1ByRecruiterJob)) || null;
    const jobTitleOfR1 = {}; (data.jobs || []).forEach(j => { jobTitleOfR1[String(j.id).slice(0, 8)] = j.title; });
    const jobsFor = (name) => {
      const mine = jobStore && jobStore[name]; if (!mine) return [];
      return Object.keys(mine).map(j8 => ({ title: jobTitleOfR1[j8] || j8, v: sumIn(mine[j8]) })).filter(x => x.v.added > 0);
    };
    const recs = store ? [...lastRecs].map(r => ({ name: r.name, ...sumFor(r.name), per: jobsFor(r.name) }))
      .filter(r => r.added > 0).sort((a, b) => b.added - a.added) : [];
    if (!recs.length) {
      ctx.style.display = 'none';
      if (wrap && !emptyMsg) { emptyMsg = document.createElement('div'); emptyMsg.className = 'chart-empty'; emptyMsg.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100%;min-height:7.5rem;color:var(--muted);font-size:0.8125rem;text-align:center;padding:1.25rem'; wrap.appendChild(emptyMsg); }
      if (emptyMsg) { emptyMsg.textContent = store ? 'Nobody was added at R1 in this period.' : 'R1 screening figures appear after the next stage-history refresh.'; emptyMsg.style.display = 'flex'; }
      return;
    }
    ctx.style.display = ''; if (emptyMsg) emptyMsg.style.display = 'none';
    // ===== Dumbbell, not a stacked bar (Jerin, 2026-08-30) =====
    // The stacked bar showed the split but hid the DROP. Here the line between the two dots IS the
    // drop-off, so a weak conversion reads as a long bar. Axis reversed so it runs added → progressed
    // left to right, in funnel order. Hovering a row lists the roles behind it.
    const h = hbarHeight(recs.length);
    if (wrap) wrap.style.height = h + 'px';
    ctx.style.maxHeight = h + 'px';
    recScreenChart = buildDumbbell(ctx, recs.map(r => ({
      label: r.name,
      added: r.added,
      progressed: r.cleared,
      roles: (r.per || []).map(x => ({ title: x.title, added: x.v.added, progressed: x.v.cleared }))
    })), { solid: SCREEN_SOLID, pale: SCREEN_PALE, xTitle: 'Candidates added at R1', colHeader: '% progressed',
           fromLabel: 'added at R1', toLabel: 'progressed past R1' });
  }

  function buildJoinChart() {
    const ctx = document.getElementById('recJoinChart'); if (!ctx) return;
    if (recJoinChart) recJoinChart.destroy();
    // Joined / Joining Pending / Dropped stacked, with OFFERED - the sum of the three - printed at the end.
    // Reads the same convMaps call as the table, so the two can never disagree.
    const CMc = convMaps(selQuarter(), selRange());
    const cOfC = (n) => CMc.byRec[n] || { o: 0, j: 0, p: 0, dr: 0 };
    const recs = [...lastRecs].filter(r => cOfC(r.name).o > 0).sort((a, b) => cOfC(b.name).o - cOfC(a.name).o);
    const wrap = ctx.parentElement;
    let emptyMsg = wrap && wrap.querySelector('.chart-empty');
    if (!recs.length) {
      if (recJoinChart) { recJoinChart.destroy(); recJoinChart = null; }
      ctx.style.display = 'none';
      if (wrap && !emptyMsg) { emptyMsg = document.createElement('div'); emptyMsg.className = 'chart-empty'; emptyMsg.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100%;min-height:7.5rem;color:var(--muted);font-size:0.8125rem;text-align:center;padding:1.25rem'; wrap.appendChild(emptyMsg); }
      if (emptyMsg) { emptyMsg.textContent = 'Nothing in play this quarter for the recruiters shown.'; emptyMsg.style.display = 'flex'; }
      return;
    }
    ctx.style.display = ''; if (emptyMsg) emptyMsg.style.display = 'none';
    const joined = recs.map(r => cOfC(r.name).j);
    const pending = recs.map(r => cOfC(r.name).p);
    const dropped = recs.map(r => cOfC(r.name).dr);
    const offered = recs.map(r => cOfC(r.name).o);
    const h = hbarHeight(recs.length);
    if (wrap) wrap.style.height = h + 'px';
    ctx.style.maxHeight = h + 'px';
    // Each of Joined / Joining Pending / Dropped is split into the ROLES behind it, in shades of its colour
    // (Jerin, 2026-08-29). The metric's own number is kept, drawn once across its bands rather than on
    // every band; the role name is in the tooltip.
    const JC_METRICS = [
      { key: 'j', label: 'Joined', color: C.green },
      { key: 'p', label: 'Joining Pending', color: '#C9A227' },
      { key: 'dr', label: 'Dropped', color: '#b45a72' }
    ];
    const jcRows = recs.map(r => {
      const per = CMc.byRecJob && CMc.byRecJob[r.name] ? CMc.byRecJob[r.name] : {};
      const v = cOfC(r.name);
      return {
        label: r.name,
        sum: { j: v.j, p: v.p, dr: v.dr },
        jobs: Object.keys(per).map(title => ({ title, v: per[title] }))
      };
    });
    const endLabels = {
      id: 'joinLabels',
      afterDatasetsDraw(chart) {
        const c = chart.ctx; c.save();
        c.font = `${uiPx(10)}px -apple-system, BlinkMacSystemFont, sans-serif`; c.textBaseline = 'middle';
        // Offered sits at the end of the bar; the Joining Conversion is its own labelled column at the
        // right edge (Jerin, 2026-08-29), so it reads straight down like a table column instead of as a
        // suffix on each bar. Same arithmetic as the table's column — (Joined + Joining Pending) / Offered
        // — read off the same convMaps.
        const last = chart.getDatasetMeta(chart.data.datasets.length - 1);
        last.data.forEach((bar, i) => {
          c.textAlign = 'left';
          c.fillStyle = '#334155';
          c.fillText(String(offered[i]), bar.x + uiPx(6), bar.y);
        });
        c.restore();
        drawConvColumn(chart, offered.map((o, i) => o > 0 ? Math.round(((joined[i] + pending[i]) / o) * 100) : null), 'Joining conversion');
      }
    };
    recJoinChart = new Chart(ctx, { type: 'bar',
      data: { labels: recs.map(r => r.name), datasets: roleBandDatasets(jcRows, JC_METRICS, { borderRadius: 2 }) },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, layout: { padding: { right: CONV_PAD + 34, top: 20 } },
        plugins: { valueLabels: false, stackTotals: false,
          tooltip: roleSectionTooltip(JC_METRICS, { totalLabel: 'Offered',
            extra: (i) => { const conv = offered[i] > 0 ? Math.round(((joined[i] + pending[i]) / offered[i]) * 100) : null;
              return conv == null ? '' : `Joining Conversion ${conv}%`; } }),
          legend: metricLegend(JC_METRICS, { align: 'center', labels: { boxWidth: 11, boxHeight: 11, padding: 14, font: { size: 12 } } }) },
        scales: { x: { ...gridY, stacked: true, title: { display: true, text: 'People', font: { size: 11 }, color: '#64748b' } }, y: { stacked: true, grid: { display: false }, ticks: { font: { size: 11, weight: '500' } } } } },
      plugins: [endLabels, roleBandOverlay(JC_METRICS)] });
  }
  // Fulfilment chart, rebuilt 2026-08-29 to Jerin's spec: "let target be the Goal, instead of capacity...
  // let capacity be a marker on the bar, like a finishing line of sorts. Even when Target is less than
  // capacity, it will show that the person is meeting numbers but far from capacity utilization."
  //   bar        = Achieved (Joined for Sales, Joined + Joining Pending for Non-Sales)
  //   pink       = the shortfall to GOAL, when there is one
  //   Goal line  = the demand they are accountable for this quarter
  //   Cap line   = the finishing line: what they could carry
  // 🚨 Every figure comes from lastFulfil, which the TABLE fills in as it renders. The chart must never
  // recompute a target of its own — it did once, and showed lifetime scores under a quarter heading.
  function buildFulfilChart() {
    const ctx = document.getElementById('recFulfilChart'); if (!ctx) return;
    if (recFulfilChart) recFulfilChart.destroy();
    const q = selQuarter();
    const recs = lastRecs.map(r => {
      const f = lastFulfil[r.name];
      if (!f) return null;
      const goal = Math.round(f.goalSc || 0), cap = Math.round(f.capSc || 0), achieved = Math.round(f.achievedSc || 0);
      // Short of goal = the table's Delta, rounded once (#120). It was round(goal) - round(achieved), which can differ by 1.
      const short = Math.round(Math.max(0, f.shortSc != null ? f.shortSc : (f.goalSc || 0) - (f.achievedSc || 0)));
      return { name: r.name, goal, cap, achieved, short, roles: f.roles || [] };
    }).filter(r => r && (r.goal > 0 || r.cap > 0 || r.achieved > 0))
      .sort((a, b) => b.achieved - a.achieved);
    const wrap = ctx.parentElement;
    let emptyMsg = wrap && wrap.querySelector('.chart-empty');
    if (!recs.length) {
      if (recFulfilChart) { recFulfilChart.destroy(); recFulfilChart = null; }
      ctx.style.display = 'none';
      if (wrap && !emptyMsg) { emptyMsg = document.createElement('div'); emptyMsg.className = 'chart-empty'; emptyMsg.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100%;min-height:7.5rem;color:var(--muted);font-size:0.8125rem;text-align:center;padding:1.25rem'; wrap.appendChild(emptyMsg); }
      if (emptyMsg) { emptyMsg.textContent = `Nothing to show for ${q.replace('-', ' ')} — no goal, capacity or joiners on any recruiter in this view.`; emptyMsg.style.display = 'flex'; }
      return;
    }
    ctx.style.display = '';
    if (emptyMsg) emptyMsg.style.display = 'none';
    // Wider bars (Jerin): 46px a row rather than 30, and the bar filling most of its slot.
    const h = hbarHeight(recs.length);
    if (wrap) wrap.style.height = h + 'px';
    ctx.style.maxHeight = h + 'px';
    const axisMax = Math.max(...recs.map(r => Math.max(r.achieved, r.goal, r.cap))) * 1.1;

    const markers = {
      id: 'fulfilMarkers',
      afterDatasetsDraw(chart) {
        const c = chart.ctx, meta = chart.getDatasetMeta(0), x = chart.scales.x;
        c.save();
        c.font = `${uiPx(10)}px -apple-system, BlinkMacSystemFont, sans-serif`;
        c.textBaseline = 'middle';
        recs.forEach((r, i) => {
          const bar = meta.data[i]; if (!bar) return;
          const half = (bar.height || uiPx(18)) / 2;
          const y0 = bar.y - half, y1 = bar.y + half;
          // The Achieved number is drawn by roleBandOverlay now — once across all of its role bands,
          // rather than inside the first band only.
          // GOAL — the target. Solid slate line, labelled above the bar.
          if (r.goal > 0) {
            const gx = x.getPixelForValue(r.goal);
            c.strokeStyle = '#41506B'; c.lineWidth = 2; c.setLineDash([]);
            c.beginPath(); c.moveTo(gx, y0 - uiPx(3)); c.lineTo(gx, y1 + uiPx(3)); c.stroke();
            c.fillStyle = '#41506B'; c.textAlign = 'center';
            c.fillText('Goal ' + r.goal, gx, y0 - uiPx(9));
          }
          // CAPACITY — the finishing line. Dashed, so it never reads as another target.
          if (r.cap > 0) {
            const cx = x.getPixelForValue(r.cap);
            c.strokeStyle = '#A15568'; c.lineWidth = 2; c.setLineDash([uiPx(3), uiPx(3)]);
            c.beginPath(); c.moveTo(cx, y0 - uiPx(3)); c.lineTo(cx, y1 + uiPx(3)); c.stroke();
            c.setLineDash([]);
            c.fillStyle = '#A15568'; c.textAlign = 'center';
            c.fillText('Cap ' + r.cap, cx, y1 + uiPx(10));
          }
        });
        c.restore();
      }
    };

    // Achieved is split into the ROLES behind it, in shades of the metric colour (Jerin, 2026-08-29), read
    // from the role scores the TABLE recorded. Short-of-Goal is deliberately NOT split: it is a residual
    // against the goal, not something any single role owns — the same reason Delta stays whole elsewhere.
    const FUL_METRICS = [
      { key: 'achieved', label: 'Achieved (Score)', color: C.green },
      { key: 'short', label: 'Short of Goal (Score)', color: C.amber, split: false }
    ];
    // 🚨 #120 (14 Sep 2026): the bar's length is the TABLE's Achieved. It used to be the role bands added up, each rounded
    // on its own, so credit with no job row went missing and half-points drifted. The row's rounded total is now shared
    // out across its roles by largest remainder, and any credit no listed role carries gets its own band.
    const shareOut = (total, parts) => {
      const raw = parts.reduce((a, p) => a + p.raw, 0);
      if (!(raw > 0) || !(total > 0)) return [];
      const exact = parts.map(p => ({ ...p, x: (p.raw / raw) * total }));
      exact.forEach(p => { p.n = Math.floor(p.x); });
      let left = total - exact.reduce((a, p) => a + p.n, 0);
      exact.slice().sort((a, b) => (b.x - b.n) - (a.x - a.n)).forEach(p => { if (left > 0) { p.n += 1; left -= 1; } });
      return exact.filter(p => p.n > 0);
    };
    const fulRows = recs.map(r => {
      const parts = (r.roles || []).filter(x => x.achievedSc > 0).map(x => ({ title: x.title, raw: x.achievedSc }));
      const listed = parts.reduce((a, p) => a + p.raw, 0);
      const rest = ((lastFulfil[r.name] || {}).achievedSc || 0) - listed;
      if (rest > 0.01) parts.push({ title: 'credit not tied to a listed role', raw: rest });
      return { label: r.name, sum: { achieved: r.achieved, short: r.short },
               jobs: shareOut(r.achieved, parts).map(p => ({ title: p.title, v: { achieved: p.n } })) };
    });
    recFulfilChart = new Chart(ctx, {
      type: 'bar',
      data: { labels: recs.map(r => r.name), datasets: roleBandDatasets(fulRows, FUL_METRICS, { borderRadius: 2 }) },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false, layout: { padding: { right: 40, top: 20, bottom: 8 } },
        plugins: {
          valueLabels: false, stackTotals: false,
          legend: metricLegend(FUL_METRICS, { align: 'center', labels: { boxWidth: 11, boxHeight: 11, padding: 14, font: { size: 12 } } }),
          tooltip: roleSectionTooltip(FUL_METRICS, { totalLabel: 'Goal', total: (i) => recs[i].goal,   // #120: it added the bars, so past-goal rows showed Achieved as "Goal"
            extra: (i) => {
              const r = recs[i];
              const util = r.cap > 0 ? Math.round((r.achieved / r.cap) * 100) + '% of capacity' : 'no capacity set';
              const vs = r.goal > 0 ? (r.achieved >= r.goal ? `${r.achieved - r.goal} past goal` : `${r.goal - r.achieved} short of goal`) : 'no goal this quarter';
              return `Goal ${r.goal} \u00b7 Capacity ${r.cap} \u00b7 ${vs} \u00b7 ${util}`;
            } })
        },
        scales: {
          x: { ...gridY, stacked: true, suggestedMax: axisMax, title: { display: true, text: 'Score', font: { size: 11 }, color: '#64748b' } },
          y: { stacked: true, grid: { display: false }, ticks: { font: { size: 11, weight: '500' } } }
        }
      },
      plugins: [markers, roleBandOverlay(FUL_METRICS)]
    });
  }
  // #137c: the source-type colours the chart used last, read by the Sourcing Mix share bars (var, so it exists before the chart runs).
  var recSrcColorOf;
  function buildSourceChart() {
    const ctx = document.getElementById('recSourceChart'); if (!ctx) return;
    if (recSourceChart) { recSourceChart.destroy(); recSourceChart = null; }
    const wrap = ctx.parentElement;
    let emptyMsg = wrap && wrap.querySelector('.chart-empty');
    // Recruiter-centric stacked bar: Y = recruiter (top 20 by joiners), stacked by source_type.
    // Reads the SAME joiner map as the table below it — one source of truth, no recomputation.
    const perS = selQuarters(), rgS = selRange();   // #129: the same joiners as the table
    const typeTotals = (r) => { const out = {}; Object.entries(srcNestedFor(r, perS, rgS)).forEach(([t, names]) => { out[t] = Object.values(names).reduce((a, v) => a + v, 0); }); return out; };
    const srcTotal = r => Object.values(typeTotals(r)).reduce((s, v) => s + v, 0);
    const withSrc = [...lastRecs].filter(r => srcTotal(r) > 0).sort((a, b) => srcTotal(b) - srcTotal(a)).slice(0, 20);
    if (withSrc.length === 0) {
      ctx.style.display = 'none';
      if (wrap && !emptyMsg) { emptyMsg = document.createElement('div'); emptyMsg.className = 'chart-empty'; emptyMsg.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100%;min-height:7.5rem;color:var(--muted);font-size:0.8125rem;text-align:center;padding:1.25rem'; wrap.appendChild(emptyMsg); }
      if (emptyMsg) { emptyMsg.textContent = 'Nobody joined under the current filter, so there is no source mix to show.'; emptyMsg.style.display = 'flex'; }
      return;
    }
    ctx.style.display = ''; if (emptyMsg) emptyMsg.style.display = 'none';
    // aggregate source_types by volume; keep top 6 + roll the rest into "Other"
    const tt = {}; withSrc.forEach(r => { tt[r.name] = typeTotals(r); });
    const agg = {}; withSrc.forEach(r => Object.entries(tt[r.name]).forEach(([s, v]) => agg[s] = (agg[s] || 0) + v));
    const ordered = Object.entries(agg).sort((a, b) => b[1] - a[1]).map(e => e[0]);
    const topTypes = ordered.slice(0, 6); const rest = ordered.slice(6);
    // 🚨 The roll-up bucket must NOT be keyed on the string "Other": Ashby has a real source type called
    // exactly that, and when it landed in the top 6 the bucket's data replaced it — the chart read 7,799
    // against the table's 7,810 for Q1 (2026-08-26). Key the bucket on a sentinel and label it distinctly.
    const REST = '\u0000rest';
    const cats = rest.length ? [...topTypes, REST] : topTypes;
    const palette = [C.blue, C.green, C.cyan, C.slate, C.amber, '#C5CFE5', '#94a3b8'];
    recSrcColorOf = (t) => { const i = cats.indexOf(t); return i >= 0 ? palette[i % palette.length] : (rest.length ? palette[(cats.length - 1) % palette.length] : null); };
    colorShareBars(document.getElementById('recSourceBody'), recSrcColorOf);   // #137c
    const datasets = cats.map((cat, ci) => ({
      label: cat === REST ? 'All other types' : cat, backgroundColor: palette[ci % palette.length], stack: 's', borderRadius: 2, ...HBAR,
      data: withSrc.map(r => cat === REST ? rest.reduce((s, t) => s + (tt[r.name][t] || 0), 0) : (tt[r.name][cat] || 0))
    }));
    const h = hbarHeight(withSrc.length);
    if (wrap) wrap.style.height = h + 'px'; ctx.style.maxHeight = h + 'px';
    recSourceChart = new Chart(ctx, { type: 'bar',
      data: { labels: withSrc.map(r => r.name), datasets },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top', align: 'center', labels: { usePointStyle: true, pointStyle: 'rect', boxWidth: 11, boxHeight: 11, padding: 12, font: { size: 11 } } } },
        scales: { x: { ...gridY, stacked: true, title: { display: true, text: 'Joiners', font: { size: 11 }, color: '#64748b' } }, y: { stacked: true, grid: { display: false }, ticks: { font: { size: 11, weight: '500' } } } } } });
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
    // #133: Joining Pending is live, so the period boxes give way to the DOJ boxes there. Expand all stays: it opens the pod / recruiter tree.
    toggleJpFilters('rec', document.getElementById('recPeriod'), name === 'joiningpending');
    // #141b (Jerin, 17 Sep): Data Hygiene ignores Pod, Recruiter, Job, From and To on purpose, so they hide there — a filter shown
    // over a panel must move its numbers (Rule 13). Year and Quarter stay: they decide several of its lists.
    ['msPod', 'msRec', 'msJob', 'recVelFrom', 'recVelTo'].forEach(id => showControl(document.getElementById(id)?.closest('.fchip'), name !== 'hygiene'));
    // #129: From / To show on every sub-tab again — they now narrow every panel (#127e had shown them on Momentum only).
    document.querySelectorAll('.rec-subtab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.rec-panel').forEach(p => { p.style.display = p.dataset.panel === name ? '' : 'none'; });
    renderActiveChart();
  }
  document.querySelectorAll('.rec-subtab').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));

  // #13: the Data Hygiene side list — click a list (arrow keys move through it); the header's Download CSV exports the list on screen.
  const hySplit = document.getElementById('hySplit');
  if (hySplit) {
    hySplit.addEventListener('click', (e) => {
      const row = e.target.closest('.hy-row');
      if (row) { selectHyg(row.dataset.id, false); return; }
      const b = e.target.closest('.hyg-dl'); if (!b) return;
      const key = b.dataset.dl, build = hygCsv[key];
      if (!build) return;
      const rows = build();
      const label = b.querySelector('span');
      if (rows.length <= 1) { if (label) { label.textContent = 'Nothing to export'; setTimeout(() => { label.textContent = 'Download CSV'; }, 1600); } return; }
      downloadCsv(rows, `data-hygiene-${key}-${new Date().toISOString().slice(0, 10)}.csv`);
    });
    hySplit.addEventListener('keydown', (e) => {
      if ((e.key !== 'ArrowDown' && e.key !== 'ArrowUp') || !e.target.closest('.hy-row')) return;
      e.preventDefault();
      const i = HYG_IDS.indexOf(hygActive);
      selectHyg(HYG_IDS[(i + (e.key === 'ArrowDown' ? 1 : -1) + HYG_IDS.length) % HYG_IDS.length], true);
    });
  }

  // Global filters (apply to all sub-tabs) — Pod / Recruiter / Job are multi-select
  msPod = makeMultiSelect(document.getElementById('msPod'), 'Pod', POD_OPTIONS, renderAll);
  msRec = makeMultiSelect(document.getElementById('msRec'), 'Recruiter', allRecs.map(r => r.name).sort((a, b) => a.localeCompare(b)), renderAll);
  const jobNames = [...new Set((baseData.jobs || []).map(j => j.title || j.name || j.job).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  msJob = makeMultiSelect(document.getElementById('msJob'), 'Job', jobNames, onJobChange);
  document.addEventListener('click', closeMsPanels);
  document.getElementById('recExpandAll')?.addEventListener('change', renderAll);

  // Date filter — #129: narrows every panel (and sets Momentum's day columns), so a change re-renders the whole tab
  ['recVelFrom', 'recVelTo'].forEach(id =>
    document.getElementById(id)?.addEventListener('change', renderAll));
  ['recDojMonth', 'recDojFrom', 'recDojTo'].forEach(id => document.getElementById(id)?.addEventListener('change', renderAll));   // #133
  // Year/Quarter also picks the quarter for pod grouping + capacity, so re-render everything
  document.getElementById('recVelYear')?.addEventListener('change', () => {
    fillQuarterSelect(document.getElementById('recVelQuarter'), document.getElementById('recVelYear').value, false);   // #127a/c: the year's quarters on offer, no All
    applyVelYearQuarter(); renderAll();
  });
  document.getElementById('recVelQuarter')?.addEventListener('change', () => { applyVelYearQuarter(); renderAll(); });
  // Default to the current year + quarter — #127d: the newest on offer, so Q4 is picked by itself from 1 Oct.
  keepDatesInBounds(document.getElementById('recVelFrom'), document.getElementById('recVelTo'));   // #127b
  selectCurrentQuarter(document.getElementById('recVelYear'), document.getElementById('recVelQuarter'), false);
  applyVelYearQuarter();

  renderAll();
  showTab('fulfilment');
}
