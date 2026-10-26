import { getData, jobsWithOpeningIn, jpCaseInPeriod, offerDropRows } from '../data.js';   // #182f: one Joining Pending rule
import { jnWhoCell, dayLabel, SHOW_FIRST, moreClick } from '../people-list-cell.js';   // #182c: ONE people-cell renderer for all three tabs
import { makeMultiSelect } from '../multi-select.js';   // #196: ONE multi-select, folded from four copies
import { uiPx } from '../ui-scale.js';   // #140: canvas text + pixel constants (#182e: the bar-end total label)
import { renderInterviewer, initInterviewer } from './interviewer.js';
import { defsBlock } from '../definitions.js';
import { tdCandidate, tdDept, tdJob, tdQuarter, tdMonth, tdDoj, tdStage, tdRecruiter, tdSourcer } from '../people-cells.js';   // #137 · #194: tdSourcer
import { tdTopic, tdOpening, topicLookup, realTopic } from '../people-cells.js';   // #168/#169: the opening and the topic · #213: realTopic
import { monthTreeRows, deptTreeRows, pinMonthHeadings, stageSplit } from '../people-tree.js';   // #149: month ➔ date ➔ people
import { shadePipeline } from '../grid-shade.js';   // #137c
import { loadNotes, noteOf } from '../job-notes.js';   // #150 · #252e: the writer and its guard moved to remark-cell.js
import { markRemarkOverflow } from '../people-list-cell.js';   // #252b: only a genuinely clipped remark gets a "more"
import { remarkCell, wireRemarks, priorityCell, wirePriority, byPriorityThen } from '../remark-cell.js';   // #252e remark cell + editor · #252f priority, both shared with Overall Efficiency
import { topicIndex, hasTopicLevel, deptHasTopics, NO_TOPIC } from '../opening-topics.js';   // #157
import { deltaPill } from '../delta-cell.js';   // #218: the Delta pill - one home, same on all three tabs
import { recruiterIndex, recruiterOfPerson, closeToJob, hasRecruiterLevel, NO_RECRUITER } from '../opening-recruiters.js';   // #187
import { levelChooser, levelsOn, wireLevels, syncLevels, mergeByRecruiter, expandAllOn, showLevels } from '../tree-levels.js';   // #188 · #189d: expandAllOn/showLevels
import { jobFilterOptions, matchesJob as matchesJobBase, jobLookup } from '../job-filter.js';   // #172c
import { reportingYears, reportingQuarters, selectionQuarters, fillQuarterSelect, selectCurrentQuarter, setDateBounds, keepDatesInBounds,
         rangeOf, inRange, rangeText, rangeTouchesQuarter, coversQuarters, sumDayFields, hasDayData,
         dojFilterHtml, dojFilterOf, inDojFilter, dojFilterText, toggleJpFilters, showControl, currentReportingQuarter,
         REPORTING_START, jpQuarterOptions, inJpQuarter} from '../period.js';   // #127 · #129 · #130 · #133 · #273: the reporting floor
import { mountInterviewTraction } from '../interview-traction.js';   // #206
import { mountTypeBudget } from '../type-budget.js';   // #269
import { resolveDeptTeam as splitDT } from '../dept-map.js';
import { STAGES_ORDER, STAGE_LABELS, TP_KEYS, TP_LABELS, TP_TO_STAGE, dropGoneEmpty } from '../stage-lists.js';   // #240b: published by the pipeline, one source
import { HBAR, hbarHeight, roleBandDatasets, roleBandOverlay, roleSectionTooltip, metricLegend,
         buildStageHeat, FULFIL_COLORS } from '../chart-style.js';   // #182e: the shared Joined/Pending/Delta colours

// 'Hello Christy' is a bot-driven ALTERNATIVE to TA Screen (not a step before it) — candidates take one
// route or the other. It sits immediately to the LEFT of TA Screen everywhere, per the user 2026-08-21.
// #145a (19 Sep 2026): exported so the Overall Efficiency Pipeline reads the SAME stage list and labels — one
// list, so the two tables can never drift apart (Rule 3).
// #240b (18 Oct 2026): and that one list is no longer typed out here — the PIPELINE publishes it in
// dashboard.json and stage-lists.js reads it, so the site and the pipeline cannot disagree about what
// the stages are. The re-export below keeps Overall Efficiency and Recruiter importing them from here.
export { STAGES_ORDER, STAGE_LABELS };
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// The HM tab uses Department only (team is intentionally not a dimension here).
// resolveDeptTeam (imported as splitDT) comes from the authoritative Ashby dump in dept-map.js.
const deptOf = v => splitDT(v).dept;
const byDept = (a, b) => a._dept.localeCompare(b._dept) || ((b.total || 0) - (a.total || 0)) || String(a.title || '').localeCompare(String(b.title || ''));

const CARET = '<span class="caret" style="display:inline-block;width:0.875rem;color:var(--muted)">▸</span>';
// ===== #157: the Specialization/Topic level (SME - US and SME - India only) =====
// A job that has topics gets its own caret; a job that does not stays a plain leaf (no caret, cursor:default),
// so a row never pretends to expand.
const TCARET = '<span class="caret caret-t" style="display:inline-block;width:0.875rem;color:var(--muted)">▸</span>';
// 🚨 B1 (Jerin, 20 Sep): a topic row fills only the columns that are TRUE per topic and puts an em dash in the
// rest. Total openings / Joined / Missed count POSITIONS and split by topic. #161 (Jerin, 22 Sep, option A): Joining
// pending splits too, for the people whose OFFER names an opening (or who are locked on one) - they sit under that
// opening's topic; everyone else stays on the job row with a small remark, so the topics plus the job row's list add
// up to the job's Joining pending. Dropped and Delta stay dashed: MOST drops carry no opening, so they cannot be
// placed under a topic. 🚨 Rule 8 as CORRECTED 27 Sep 2026: "never" was FALSE - some drops DO carry one. The dash
// stays because the split would be incomplete, not because it is unknowable.
// Do NOT "helpfully" put a number in a dashed cell - a wrong number here looks right and nobody will question it.
const DASH = '<td class="nosplit"><span class="zero">—</span></td>';
const topicMetrics = (t, jp) =>
  `<td style="font-weight:600">${t.total}</td>`
  + `<td class="${t.joined ? 'good' : 'zero'}">${t.joined}</td>`
  + `<td style="color:var(--orange)">${jp || '<span class="zero">0</span>'}</td>`
  // #270: THREE dashes now - Offer drop, Achieved, Delta. Achieved is a DASH here on purpose, matching the
  // Delta beside it: at topic depth the people are not fully split, so a number would invite "why don't
  // these subtract?" against a dashed Delta. A dash says "not worked out at this level", which is true.
  + DASH + DASH + DASH;

// #187: the five counting cells for a RECRUITER row. Positions come from the opening's owner, people from the
// recruiter who WORKED them (#192, 28 Sep 2026 - the position never decides who a person belongs to);
// Delta is the same formula every other row uses — Total − Joined − Joining pipeline —
// and is NEVER clamped (Rule 1: a negative Delta means more people in closing than positions opened here, which
// is true and worth seeing). A recruiter with no position of their own shows a dash rather than a 0, because
// there is nothing to count, not nothing happening.
const recMetrics = (r, rb, gap) =>
  `<td style="font-weight:600">${r.total || '<span class="zero">&mdash;</span>'}</td>`
  + `<td class="${r.joined ? 'good' : 'zero'}">${r.joined || '&mdash;'}</td>`
  + `<td style="color:var(--orange)">${rb.jpP || '<span class="zero">&mdash;</span>'}</td>`
  + `<td class="gapcell">${rb.drop ? `<span style="color:var(--red);font-weight:600">${rb.drop}</span>` : '<span class="zero">&mdash;</span>'}</td>`
  // #270: Achieved here too. 🚨 A recruiter row does NOT go through metrics(), which is exactly how #262
  // shipped a row two columns short of its own heading. Both builders move together or neither does.
  + `<td class="gapcell">${((r.joined || 0) + (rb.jpP || 0))
      ? `${(r.joined || 0) + (rb.jpP || 0)}${r.total ? `<span class="achpct">(${Math.round((((r.joined || 0) + (rb.jpP || 0)) / r.total) * 100)}%)</span>` : ''}`
      : '<span class="zero">&mdash;</span>'}</td>`
  + `<td class="gapcell">${deltaPill(gap)}</td>`;   // #218: the same pill as every other Delta on the site

// #187: the topics belonging to ONE recruiter's openings. Same rows, narrowed and re-counted from that
// recruiter's own openings, so a topic row under a recruiter closes THAT recruiter's row rather than the job's.
function topicsFor(topics, mine) {
  const out = [];
  topics.forEach(t => {
    const ops = t.openings.filter(o => mine.has(o.id));
    if (!ops.length) return;
    out.push({ topic: t.topic, openings: ops, total: ops.length,
               joined: ops.filter(o => o.state === 'joined').length,
               open: ops.filter(o => o.state === 'open').length, missed: ops.filter(o => o.state === 'missed').length });
  });
  return out;
}

// #161: the opening a person in closing is tied to (the pipeline's 8-char id, or a full id from a hire-link 'lock'),
// the topic rows they fall under, and - for the ones who fall under none - why, in the words Jerin asked for.
const op8 = (c) => (c && c.openingId ? String(c.openingId).slice(0, 8) : '');
function splitWho(who, topics) {
  const at = {};
  topics.forEach(t => t.openings.forEach(o => { at[String(o.id).slice(0, 8)] = t.topic; }));
  const by = {}, rest = [];
  (who || []).forEach(c => { const tp = at[op8(c)]; if (tp) (by[tp] || (by[tp] = [])).push(c); else rest.push(c); });
  return { by, rest };
}
const whyUntied = (c) => op8(c) ? 'opening not in this period'
  : c.linked ? 'offer names an opening'   // a data file from before 22 Sep knows THAT, not WHICH
  : /^Offer/.test(c.subStage || '') ? 'offer names no opening' : 'offer not initiated';

// ===== #150 (Jerin, 19 Sep 2026) — the two cells at the end of the job row =====
// "Who is joining" lists the people behind the Joining Pending number beside it — collected in the same loop,
// so the two can never disagree. It is LIVE, like that column: From / To do not narrow it.
// "Remarks" is free text the team writes against the JOB; it is saved by js/job-notes.js and survives until edited.
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// SHOW_FIRST and dayLabel now live in people-list-cell.js (#182c) - imported above, so the three tabs agree.

// #182a (Jerin, 26 Sep 2026): ONE helper draws BOTH people columns — *Who has joined* and *Who is joining*.
// 🚨 It was tempting to copy this for the new column. A second copy is how two columns that are meant to look
//    identical drift apart, so the list and its quiet meta line are ARGUMENTS instead:
//    `opt.list` (default the Joining Pending cases) and `opt.dateOf` (default the joining date).
// jnWhoCell moved to people-list-cell.js (#182c) - imported at the top. Do not re-add a local copy.
// #182a2: which joiners are NOT behind the Joined number beside them, and WHY — two different answers, so two
// different marks, saying the same thing `tdQuarter` says on the Joiners sub-tab.
//   • an EARLIER quarter's opening ➔ "Q2 opening" (they filled last quarter's demand)
//   • NO opening at all           ➔ "not linked" (nothing to count them against)
// 🚨 #182a3 (Jerin, 26 Sep 2026) — THESE WERE PILLS AND THE PILL SHOUTED: 🗣 "the chip shouts, and it shouldn't"
//    (my words, his agreement: "this is the only think i felt off"). A `pl-chip` works on the Joiners sub-tab,
//    where it sits alone in its own column with room around it. Dropped beside a name in a dense 14rem list it
//    became the loudest thing in the column while marking the RARE case — 8 people of 157. **An exception must
//    be the quietest mark on the row.** Now plain small text in a warm tone. Do not put a box back around it.
// Anyone on a this-quarter opening gets nothing: they are the normal case, and a mark on them would be noise.
// 🔑 The reference is the quarter the person STARTED in, exactly as tdQuarter uses their start date — not the
//    filter. It means the mark says the same thing wherever the table is filtered, and cannot flip on a row
//    just because someone changed the period selector.
function joinTag(c) {
  if (!c.openingQuarter) {
    return ` <span class="jn-q jn-q-miss" title="No opening is attached to this offer, so this person is not counted against any position.">not linked</span>`;
  }
  const ref = qOfDay_(c.startDate);
  if (ref && c.openingQuarter < ref) {
    const q = c.openingQuarter;
    return ` <span class="jn-q" title="Filled a position opened in ${q.slice(5)} ${q.slice(0, 4)}, before the quarter they started in — so they are not in the Joined figure beside this list.">${q.slice(5)} opening</span>`;
  }
  return '';
}
const qOfDay_ = (ds) => (ds && ds.length >= 7) ? `${ds.slice(0, 4)}-Q${Math.floor((+ds.slice(5, 7) - 1) / 3) + 1}` : null;
// ===== #252e (20 Oct 2026): the cell, the editor and the guard wording moved to js/remark-cell.js =====
// 🚨 They are SHARED with Overall Efficiency now, so this tab keeps only what is ITS OWN: the department
//    row's "N of M written" count. Do not re-add a local copy of the cell or the editor — two editors
//    writing to the same PUBLIC file is exactly what that module exists to prevent (Rule 9).
// The department row counts how many of its roles carry a remark; keep it honest after a save or a clear.
function refreshDeptWritten() {
  const body = document.getElementById('hm1Body');
  if (!body) return;
  body.querySelectorAll('tr.dept-header').forEach(h => {
    const g = h.dataset.g;
    const leaves = [...body.querySelectorAll(`tr.leaf[data-g="${g}"]`)];
    const written = leaves.filter(r => r.querySelector('.jn-text')).length;
    const c = h.cells[h.cells.length - 1];
    if (c) c.innerHTML = written ? `${written} of ${leaves.length} written` : '<span class="zero">—</span>';
  });
}

function wireJobNotes(body) {
  if (body.dataset.jnWired === '1') return;
  body.dataset.jnWired = '1';
  // 🚨 #193a: the people-list "+N more" toggle must be asked FIRST. This tbody owns the remark clicks too, and
  //    without this a click on "+N more" would fall through and open an editor underneath the names.
  body.addEventListener('click', (ev) => {
    if (moreClick(ev)) requestAnimationFrame(() => markRemarkOverflow(body));
  });
  wireRemarks(body, refreshDeptWritten);   // #252e: one editor, shared with Overall Efficiency
}

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
const TP_ADDED = { app: 1, hm: 1, rc: 1, ds: 1, offer: 1 };   // #210a (8 Oct 2026): App Review and HM Review joined these - nobody is interviewed there, so they count candidates ADDED. Keyed like TP_KEYS — as refCheck/docSub they never matched, so the Ref Check and Doc Sub hovers said "assessed" (fixed in #122, 15 Sep 2026)

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

// Collapse/expand the tree. Two levels until #157 added a third for SME:
//   Department (tr.dept-header, data-g) -> Job (tr.leaf, data-g) -> Topic (tr.lv-topic)
// 🚨 #157c (Jerin, 21 Sep): the tree STOPS at the topic - "i need the topic branch, not a topic to opening branch".
// The opening rows under a topic were removed; do not bring them back.
// 🔑 A child is visible only when EVERY ancestor is open, so collapsing a department has to hide the topic
// rows under it too - not just the job rows. Hiding one level and leaving a deeper one on screen was
// the obvious bug here; closing a parent therefore also RESETS its children's own open state, so reopening it
// shows the job rows and nothing deeper.
// #187: a recruiter's name goes into a CSS attribute selector, and real names carry brackets and apostrophes
// — `(recruiter not set)` most of all. CSS.escape where it exists, a quoted fallback where it does not.
const cssq = (v) => String(v).replace(/["\\]/g, '\\$&');

// #189d: `expandAll` is a PARAMETER again, not a constant. On Position Fulfilment it is always true, because the
// level chooser is the expand control there (#188). On the Interview Pipeline table it is the "Expand all" tick,
// which #188 had hard-coded to true - leaving that tree permanently open under a chooser that could not move it.
function wireTree(tbody, expandAll) {
  const setCaret = (row, sel, open) => { const c = row.querySelector(sel); if (c) c.textContent = open ? '▾' : '▸'; };
  const q = (sel) => tbody.querySelectorAll(sel);

  // #187: closing a job now hides BOTH levels beneath it and resets the recruiter rows' own open state, so
  // reopening a job shows its recruiters and nothing deeper. Hiding one level and leaving a deeper one on
  // screen was the obvious bug when the tree was three deep; it is the same bug at four.
  const closeJob = (job8) => {
    q(`tr.lv-rec[data-job8="${job8}"]`).forEach(r => { r.dataset.rexp = '0'; setCaret(r, '.caret-r', false); });
    q(`tr.lv-topic[data-job8="${job8}"]`).forEach(r => { r.style.display = 'none'; });
  };
  const closeRec = (key) => {
    q(`tr.lv-topic[data-rec="${cssq(key)}"]`).forEach(r => { r.style.display = 'none'; });
  };

  tbody.querySelectorAll('tr.dept-header').forEach(h => {
    const gi = h.dataset.g;
    const openDept = (on) => {
      h.dataset.exp = on ? '1' : '0';
      setCaret(h, '.caret', on);
      q(`tr.leaf[data-g="${gi}"]`).forEach(r => { r.style.display = on ? '' : 'none'; });
      // #188: with the Job level off, the department's children ARE the recruiter or topic rows
      q(`tr[data-nojob="1"][data-g="${gi}"]`).forEach(r => { r.style.display = on ? '' : 'none'; });
      if (!on) {
        // collapsing the department closes everything under it, at every depth
        q(`tr.leaf[data-g="${gi}"]`).forEach(r => { if (r.dataset.job8) { r.dataset.texp = '0'; setCaret(r, '.caret-t', false); closeJob(r.dataset.job8); } });
        q(`tr.lv-rec[data-g="${gi}"]`).forEach(r => { r.style.display = 'none'; });
      }
    };
    if (expandAll) openDept(true);
    h.addEventListener('click', () => openDept(h.dataset.exp !== '1'));
  });

  // Job -> its topic rows. Only jobs that HAVE topics carry data-job8, so plain leaves stay inert.
  tbody.querySelectorAll('tr.leaf[data-job8]').forEach(j => {
    j.addEventListener('click', (e) => {
      if (e.target.closest('.jn-cell')) return;   // #150: the Remarks cell owns its own clicks
      const job8 = j.dataset.job8;
      const on = j.dataset.texp !== '1';
      j.dataset.texp = on ? '1' : '0';
      setCaret(j, '.caret-t', on);
      if (on) {
        // #187: a job opens to its RECRUITERS when it has them, and straight to its topics when it does not.
        const recs = q(`tr.lv-rec[data-job8="${job8}"]`);
        if (recs.length) recs.forEach(r => { r.style.display = ''; });
        else q(`tr.lv-topic[data-job8="${job8}"]`).forEach(r => { r.style.display = ''; });
      } else closeJob(job8);
    });
  });

  // #187: Recruiter ➔ its own topic rows. Only a recruiter that HAS topics carries a caret.
  tbody.querySelectorAll('tr.lv-rec[data-rec]').forEach(rw => {
    const key = rw.dataset.rec;
    if (!tbody.querySelector(`tr.lv-topic[data-rec="${cssq(key)}"]`)) return;
    rw.style.cursor = 'pointer';
    const c = rw.querySelector('td'); if (c && !c.querySelector('.caret-r')) c.insertAdjacentHTML('afterbegin', '<span class="caret-r">\u25b8</span>');
    rw.addEventListener('click', (e) => {
      if (e.target.closest('.jn-cell')) return;
      const on = rw.dataset.rexp !== '1';
      rw.dataset.rexp = on ? '1' : '0';
      setCaret(rw, '.caret-r', on);
      if (on) q(`tr.lv-topic[data-rec="${cssq(key)}"]`).forEach(r => { r.style.display = ''; });
      else closeRec(key);
    });
  });

  // #160b (Jerin, 22 Sep: "the topic is not expanded when Expand is ticked"): Expand all reaches the bottom of the
  // tree - every job with topics opens as well, not just the departments.
  if (expandAll) {
    tbody.querySelectorAll('tr.leaf[data-job8]').forEach(j => {
      j.dataset.texp = '1';
      setCaret(j, '.caret-t', true);
      q(`tr.lv-rec[data-job8="${j.dataset.job8}"]`).forEach(r => { r.style.display = ''; });
      q(`tr.lv-topic[data-job8="${j.dataset.job8}"]`).forEach(r => { r.style.display = ''; });
    });
    // #187: and the recruiter rows open too, or Expand all stops one level short of the topics again (#160b).
    tbody.querySelectorAll('tr.lv-rec[data-rec]').forEach(rw => {
      rw.dataset.rexp = '1';
      setCaret(rw, '.caret-r', true);
    });
  }
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
      /* #150b (Jerin, 19 Sep — "its blahh. Data overlapping too."): the number columns held 8.125rem each for figures
         like "32", which left the two text columns 117px and pushed their contents into one another. Numbers are now
         4.75rem, and Who is joining / Remarks get real width. Widths live HERE because this block loads after
         style.css and wins at equal specificity. */
      /* ===== #182c/#182d (Jerin, 26 Sep 2026) — NINE COLUMNS, AND THE TABLE FITS ITS PANEL =====
         🗣 "can we get the table to fit inside the panel. Width can be reduced for Dropped, Delta, Who has
             joined, Who is joining." ... then 🗣 "Awesome - kill Missed column everywhere."
         COLUMNS NOW: 1 Department · 2 Total positions · 3 Joined · 4 Joining pending · 5 Dropped · 6 Delta ·
                      7 Who has joined · 8 Who is joining · 9 Remarks.
         🚨 MISSED WAS COLUMN 7, SO EVERY RULE BELOW MOVED DOWN ONE. If a column is ever added or removed again,
            re-derive this whole block rather than editing numbers in place - a half-shifted set silently puts a
            column in BOTH groups, which is exactly what a first attempt at this did.
         WIDTHS: 14 + 4.5x3 + 5 + 7 + 12.5 + 14 + 12.5 = 78.5rem against the 83.9rem the panel gives at 1440.
         Killing Missed freed 4.5rem, and it went straight back into the two people columns he had squeezed.
         🚨 #178's rule: these widths are FIXED, so padding is not a lever - only these numbers move the table. */
      .hm-report .hm-summary { width:100%; min-width:78rem; table-layout:fixed; }
      .hm-report .hm-summary th:first-child, .hm-report .hm-summary td:first-child { width:14rem; }
      .hm-report .hm-summary td:first-child { text-align:left; }
      .hm-report .hm-summary th:not(:first-child), .hm-report .hm-summary td:not(:first-child) {
        width:4.5rem; font-variant-numeric:tabular-nums; }
      .hm-report .hm-summary td:not(:first-child) { white-space:nowrap; text-align:center; }
      .hm-report .hm-summary td:nth-child(8),
      .hm-report .hm-summary td:nth-child(9),
      .hm-report .hm-summary td:nth-child(10),
      /* 🚨 #270 (20 Oct 2026): "Achieved" went in at 6, so EVERY position below moved one to the right. This
         whole block is RE-DERIVED rather than edited in place, exactly as the note here has asked twice —
         a half-shifted set silently puts a column in BOTH groups. Column 11 is Pri and is CENTRED, so it is
         deliberately not in this left-align list.
         COLUMNS NOW: 1 Department · 2 Total positions · 3 Joined · 4 Joining pipeline · 5 Offer drop ·
                      6 Achieved · 7 Delta · 8 Who has joined · 9 Who is joining · 10 Who dropped ·
                      11 Pri · 12 Remarks. */
      .hm-report .hm-summary td:nth-child(12) { text-align:left; white-space:normal; }
      /* 📏 #270 WIDTHS, and the table stays EXACTLY 87rem so it does not scroll any sooner than it did
         (Jerin: "no scrolling"). He asked for the room to come from the number columns; MEASURED, they can
         only spare 0.25rem — Delta's own floor below is 7rem and 4.5 is what a three-digit figure needs — so
         Offer drop gives 0.25 and the three people columns give 1.5 each.
         14 + 4.5×3 + 4.75 + 4.75 + 7 + 9.5×3 + 3.5 + 11 = 87rem, unchanged. */
      .hm-report .hm-summary th:nth-child(5), .hm-report .hm-summary td:nth-child(5) { width:4.75rem; }   /* Offer drop */
      .hm-report .hm-summary th:nth-child(6), .hm-report .hm-summary td:nth-child(6) { width:4.75rem; }   /* #270 Achieved */
      /* Delta floor is 7rem: bar 4 + gap 0.5 + number 1.125 = 5.6rem of content before the cell padding. */
      .hm-report .hm-summary th:nth-child(7), .hm-report .hm-summary td:nth-child(7) { width:7rem; }
      .hm-report .hm-summary th:nth-child(8), .hm-report .hm-summary td:nth-child(8) { width:9.5rem; }   /* Who has joined */
      .hm-report .hm-summary th:nth-child(9), .hm-report .hm-summary td:nth-child(9) { width:9.5rem; }   /* Who is joining */
      .hm-report .hm-summary th:nth-child(10), .hm-report .hm-summary td:nth-child(10) { width:9.5rem; }  /* Who dropped */
      .hm-report .hm-summary th:nth-child(11), .hm-report .hm-summary td:nth-child(11) { width:3.5rem; }  /* Pri */
      .hm-report .hm-summary th:nth-child(12), .hm-report .hm-summary td:nth-child(12) { width:11rem; }   /* Remarks */

      /* ===== #182b — BOTH HALVES PAINTED (option F), now class-based (#182c) =====
         🗣 "For the amt of content, i'd take F" · 🚫 no hard rule between them: "dont need this datk seperator".
         🚨 THE 40 HAND-NUMBERED SELECTORS THAT USED TO LIVE HERE ARE GONE. They were the ones a note wrongly
            claimed were "generated from two lists" (#182e), and removing the Missed column had already shifted
            every one of them by hand once. The split now comes from the CELL CLASS - '.jn-cell' is a people
            column, everything after the first cell is a counting column - so there are no numbers to shift.
         🔑 The rules live in style.css under '.painted-halves', shared with Recruiter and Overall Efficiency,
            and a row type sets its own pair with two variables. See that block for the full reasoning. */

</style>

    <div class="hm-report">
    <!-- ===== GLOBAL PAGE FILTERS ===== -->
    <div class="hm-subtabs subtab-band">
      <!-- #130 (Jerin, 15 Sep 2026): one name on every tab, and the two people lists on their own sub-tabs. Tab keys unchanged, so saved links still open. -->
      <button class="hm-subtab subtab-chip active" data-tab="positions">Position Fulfilment</button>
      <button class="hm-subtab subtab-chip" data-tab="joiners">Joiners</button>
      <button class="hm-subtab subtab-chip" data-tab="joiningpending">Joining Pipeline</button>
      <span class="subtab-sep" aria-hidden="true"></span>
      <button class="hm-subtab subtab-chip" data-tab="pipeline">Interview Pipeline</button>
      <button class="hm-subtab subtab-chip" data-tab="traction">Interview Traction</button>
      <span class="subtab-sep" aria-hidden="true"></span>
      <button class="hm-subtab subtab-chip" data-tab="throughput">Throughput</button>
      <span class="subtab-sep" aria-hidden="true"></span>
      <button class="hm-subtab subtab-chip" data-tab="panelists">Panelists</button>
      <span class="subtab-sep" aria-hidden="true"></span>
      <!-- #269 (Jerin, 20 Oct 2026): ONE chip; the three panels nest vertically inside it. -->
      <button class="hm-subtab subtab-chip" data-tab="typebudget">Type &amp; Budget</button>
    </div>

    <!-- ===== SUB-TAB STRIP ===== -->
    <div class="hm-filters">
      <!-- #196 option B (Jerin, 28 Sep 2026): Department was a 220px labelled <select> here while Overall
           Efficiency showed the SAME filter as a 96px chip. On the tightest strip on the site that difference
           was most of the room a new control needed. It is the chip now, so both tabs read alike and the
           Recruiter filter beside it fits with room to spare. It also gained multi-select, which the <select>
           could not do - picking two departments is now possible here as it always was on Overall Efficiency. -->
      <div class="fchip"><div class="ms" id="msHmDept"></div></div>
      <span class="fdiv"></span>
      <div class="fchip"><div class="ms" id="msHmJob"></div></div>
      <div class="fchip"><div class="ms" id="msHmTopic"></div></div>
      <div class="fchip"><div class="ms" id="msHmRec"></div></div>
      
      
      <span id="hmExpandWrap" style="margin-left:auto">${levelChooser('hmLevels')}</span>
    <span class="period" id="hmPeriod"><div class="fchip"><span class="lbl">Year</span><select id="hmYear"><option value="">All</option>${years.map(y => `<option value="${y}">${y}</option>`).join('')}</select></div><div class="fchip"><span class="lbl">Quarter</span><select id="hmQuarter"><option value="">All</option></select></div><div class="fchip" id="hmQuartersWrap"><div class="ms" id="msHmQuarter"></div></div><div class="fchip"><span class="lbl">From</span><input type="date" id="hmDateFrom"></div><div class="fchip"><span class="lbl">To</span><input type="date" id="hmDateTo"></div></span>${dojFilterHtml('hm', data.joiningPendingCases, 'margin-left:auto')}</div>

    <!-- ===== PANEL: POSITION FULFILMENT ===== -->
    <div class="hm-panel" data-panel="positions">
      <div class="cards" id="hm1Cards"></div>

      <h3 class="subsection-title">Positions by department</h3>
      <div class="chart-wrap" id="hm1ChartWrap" style="height:21.25rem"><canvas id="hm1Chart"></canvas></div>

      <h3 class="subsection-title">Department Summary</h3>
      <p class="sub-note">Click a department to see its roles.</p>
      <div class="scroll-table"><table class="hm-summary painted-halves">
        <thead><tr><th style="min-width:15rem">Department / Job / Recruiter / Topic</th><th>Total positions</th><th>Joined</th><th>Joining pipeline</th><th>Offer drop</th><th>Achieved</th><th>Delta</th><th class="jn-th">Who has joined</th><th class="jn-th">Who is joining</th><th class="jn-th">Who dropped</th><th class="pri-th">Pri</th><th class="jn-th">Remarks</th></tr></thead>
        <tbody id="hm1Body"></tbody>
      </table></div>
      ${defsBlock('hm-positions')}
    </div>

    <!-- ===== PANEL: JOINING PENDING (#130b — was the Cases list under Position Fulfilment) ===== -->
    <div class="hm-panel" data-panel="joiningpending" style="display:none">
      <p class="sub-note" id="hmJPCaption" style="margin-bottom:0.5rem"></p>
      <div class="scroll-table"><table class="pl-list jp">
        <thead><tr><th style="min-width:13rem">Joining date / person</th><th class="c-stage">Sub-stage</th><th class="c-rec">Recruiter</th><th class="c-src">Sourcer</th><th class="c-dept">Department</th><th class="c-job">Job</th><th class="c-open-name">Opening</th><th class="c-topic">Topic</th><th class="c-open">Opening quarter</th></tr></thead>
        <tbody id="hmJPBody"></tbody>
      </table></div>
      <hr class="section-divider">
      <h4 style="font-size:0.6875rem;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.04em;margin:0 0 0.5rem">Offer drops</h4>
      <p class="sub-note" id="hmDropCaption" style="margin-bottom:0.5rem"></p>
      <div class="scroll-table"><table class="pl-list jp">
        <thead><tr><th style="min-width:13rem">Joining date / person</th><th class="c-stage">Dropped on</th><th class="c-rec">Recruiter</th><th class="c-src">Sourcer</th><th class="c-dept">Department</th><th class="c-job">Job</th><th class="c-open-name">Opening</th><th class="c-topic">Topic</th><th class="c-open">Opening quarter</th></tr></thead>
        <tbody id="hmDropBody"></tbody>
      </table></div>
      ${defsBlock('hm-joiningpending')}
    </div>

    <!-- ===== PANEL: JOINERS (#130c) — the Joining Pending columns minus Sub-Stage: Hired is one stage ===== -->
    <div class="hm-panel" data-panel="joiners" style="display:none">
      <p class="sub-note" id="hmJoinCaption" style="margin-bottom:0.5rem"></p>
      <div class="scroll-table"><table class="pl-list jt">
        <thead><tr><th class="c-jname">Department / date / role / person</th><th class="c-rec">Recruiter</th><th class="c-src">Sourcer</th><th class="c-topic">Topic</th><th class="c-open">Opening quarter</th><th class="c-open-name">Opening</th></tr></thead>
        <tbody id="hmJoinBody" class="pt3 pt3c"></tbody>
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
        <p class="sub-note" id="hm2Waiting"></p>
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

    <!-- ===== PANEL: INTERVIEW TRACTION (#206) ===== -->
    <div class="hm-panel" data-panel="traction" style="display:none">
      <div id="hmTractionHost"></div>
    </div>

    <!-- ===== PANEL: TYPE & BUDGET (#269) — one host, the shared module owns what is inside ===== -->
    <div class="hm-panel" data-panel="typebudget" style="display:none">
      <div id="hmTypeBudgetHost"></div>
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
  return offerDropRows(data);   // #183c: OFFER drops only — the one rule lives in data.js (offerDropRows)
}
// #129 (15 Sep 2026): is this drop inside the From / To range? A drop is dated by the day the candidate first reached Ref Check,
// Documentation or Offer (dropEvents.day). A row from a data file older than 15 Sep has no day, so it can only answer for whole quarters.
function dropIn(e, rg, qs) {
  return e.day ? inRange(e.day, rg) : (coversQuarters(rg, qs) && qs.includes(e.quarter));
}

let renderTraction = null;   // #206: set once the page is in the DOM
let renderTypeBudget = null;   // #269: set once the page is in the DOM
// #207: the quarters ticked on the Interview Traction panel's OWN Quarter chip. Empty until it mounts,
// and read ONLY by that panel's scope - no other panel on this tab sees it.
let tractionQs = [];
let tractionBounds = false;   // #207: are the date boxes currently on the panel's span?
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
  let msHmJob = null, msHmDept = null, msHmRec = null, msHmPanel = null, msHmTpStage = null, msHmPipeStage = null;   // #196
  let msHmJpQ = null;   // #274: the Joining Pipeline Quarter filter
  const selJobs = () => (msHmJob ? msHmJob.getSelected() : []);

  // ===== #213 (Jerin, 8 Oct 2026): a TAB-WIDE Topic filter, sitting next to Job =====
  // 🗣 "give me an topic filter, after the job" — and he chose TAB-WIDE over Joiners-only, so it has to move
  // every panel's numbers, not just the list it was asked for (Rule 13).
  // 🔑 Topic lives on the OPENING (#157), so a topic selection is really a SET OF JOBS. That is why it folds
  // into matchesJob below instead of being threaded through a dozen panels one at a time — one chokepoint, so
  // no panel can quietly ignore the filter. Same reason openJobIds() is gated.
  let msHmTopic = null;
  const selTopics = () => (msHmTopic ? msHmTopic.getSelected() : []);
  const topicJobs = (() => {
    const m = new Map();
    ((data && data.openingRows) || []).forEach(r => {
      const t = realTopic(r.topic); if (!t || !r.jobId8) return;
      if (!m.has(t)) m.set(t, new Set());
      m.get(t).add(String(r.jobId8).slice(0, 8));
    });
    return m;
  })();
  const topicOptions = [...topicJobs.keys()].sort((a, b) => a.localeCompare(b));
  const topicOk = (job8) => {
    const sel = selTopics();
    if (!sel.length) return true;                     // nothing picked = All, exactly like Job
    const k = String(job8 || '').slice(0, 8);
    return sel.some(t => { const set = topicJobs.get(t); return !!set && set.has(k); });
  };
  // 🚨 EVERY existing matchesJob call picks the topic gate up from here. Do not call matchesJobBase directly.
  const matchesJob = (sel, job8) => matchesJobBase(sel, job8) && topicOk(job8);
  // #172c: the SAME sources as before — openings, jobs, people in closing — but gathered as JOB IDS, so two
  // jobs sharing a name stay two entries. Labels come from job-filter.js (department only where it repeats).
  const jobFilterIds = new Set([...openings.map(o => o.jobId), ...jobs.map(j => j.id),
    ...((data.joiningPendingCases || []).map(c => c.jobId8))].filter(Boolean).map(i => String(i).slice(0, 8)));
  const jobOptions = jobFilterOptions(data, jobFilterIds);
  const jobLook = jobLookup(data);
  // Multi-select dropdown with type-to-filter and a Clear (= back to "All") reset.
  // Kept identical across the HM / Recruiter / Overall-Efficiency tabs on purpose.

  // #196: Department is a multi-select now, so this returns a LIST. Empty = All, exactly like selJobs.
  const gDept = () => (msHmDept ? msHmDept.getSelected() : []);
  const selRecs = () => (msHmRec ? msHmRec.getSelected() : []);   // #196: the Recruiter filter
  // ONE test for both, so a panel cannot invent its own reading of 'no selection means everything'.
  const okDept = (d) => { const sel = gDept(); return !sel.length || sel.includes(d); };
  const okRec  = (r) => { const sel = selRecs(); return !sel.length || sel.includes(r); };
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
  // #227 (Jerin, 13 Oct 2026): several quarters at once. Everything downstream already took an ARRAY of
  // quarter keys, so this is a CONTROL change, not a maths change. Position Fulfilment stays on ONE
  // quarter: pods, capacity and the scoring grid are configured per quarter with copy-forward, so Goal
  // and Delta have no defined value across two of them. Ticking nothing falls back to Year/Quarter.
  let msHmQuarters = null;   // #227
  // ===== #243 (18 Oct 2026): the Quarters chip governs ONLY the sub-tabs it is SHOWN on =====
  // #227 hid it on Position Fulfilment deliberately (Goal and Delta come from a per-quarter configuration),
  // and #238 then SEEDED it with the current quarter - so hmQuarters() returned the chip's Q4 however the
  // visible Quarter box was set. Here the damage was WORSE than a wrong number: the Q3 dates were clamped
  // into Q4 and collapsed to the single day 30 Sep, windowQuarters() filtered that down to NO quarters, and
  // coversQuarters(range, []) THREW inside renderSection1 - so the render died half-way and the table kept
  // whatever was on it, showing Q4's 137 / 15 under a Q3 heading with nothing on screen to say so.
  // ⚠ Exactly Rule 4's lie: a quarter heading over another quarter's numbers. Measured 18 Oct 2026.
  // 🔑 ONE predicate decides both whether the chip is DRAWN and whether it is OBEYED.
  const chipGoverns = (name) => name !== 'positions' && name !== 'traction' && name !== 'joiningpending'
    && name !== 'typebudget';   // #269: this panel reads the same window Position Fulfilment does
  function hmQuarters() {
    const multi = (msHmQuarters && chipGoverns(activeTab)) ? msHmQuarters.getSelected() : [];   // #243: only where it is shown
    if (multi.length) return multi.slice().sort();
    return selectionQuarters(document.getElementById('hmYear')?.value || '', document.getElementById('hmQuarter')?.value || '');
  }
  function hmRange() { return rangeOf(document.getElementById('hmDateFrom'), document.getElementById('hmDateTo'), hmQuarters()); }
  // A quarter is inside the window when ANY of its days is. The old rule needed the quarter's FIRST day inside, so moving From to
  // 15 Aug dropped Q3 — every job list emptied and every count read zero.
  function quarterInRange(q) { return /^\d{4}-Q[1-4]$/.test(q || '') && rangeTouchesQuarter(q, hmRange()); }
  function windowQuarters() { return hmQuarters().filter(quarterInRange); }
  // #125 (Jerin, 15 Sep 2026): "we dont work on any job with an opening open date in the previous quarter". Throughput and Panelists list
  // only jobs with an opening OPENED in a quarter the window touches — Pipeline has done the same since #8. No dates ⇒ null ⇒ every job.
  function openJobIds() {
    const base = (gFrom() || gTo()) ? jobsWithOpeningIn(data, quarterInRange) : null;
    if (!selTopics().length) return base;             // #213: no topic picked, nothing to narrow
    // A topic IS a job scope, so it narrows this set too — otherwise the panels that lean on openJobIds
    // rather than matchesJob would ignore the filter, which is the bug Rule 13 exists to stop.
    const allowed = new Set();
    selTopics().forEach(t => (topicJobs.get(t) || new Set()).forEach(j => allowed.add(j)));
    return base ? new Set([...base].filter(j => allowed.has(j))) : allowed;
  }

  // ===== Section 1: Positions (Department -> Job tree) =====
  // #127g (Jerin, 15 Sep 2026): the Open / Closed job Status tick-boxes are gone — they make no sense with the opening-first approach.
  // Both boxes ticked was the default and meant no filter, so no default number moves.

  function renderSection1() {
    const dateFrom = gFrom(), dateTo = gTo();
    const jobSel = selJobs();
    const ob = data.openingBuckets || {};
    // #129: the window, the quarters it touches, and whether it covers them whole.
    const rg = hmRange(), winQs = windowQuarters(), wholeWin = coversQuarters(rg, winQs), dayOK = hasDayData(data);

    // Each DISTINCT opening is counted once, in the quarter it was opened, and
    // Total = Joined + Open + Missed. A role opened in Q2 therefore still counts
    // toward Q2 while it stays open — the old filter dropped it the moment the
    // report window moved past its opened date.
    // #157: the topic level, built from the SAME window the job rows below use - whole quarters when the
    // window covers them, otherwise the India-time days - so topics close the job row by construction (Rule 3).
    const tIdx = topicIndex(data, { wholeWin, winQs, dayOK, inDay: (d) => inRange(d, rg) });
    // #187: the recruiter level, from the SAME window, so its rows close the job row by construction.
    const rIdx = recruiterIndex(data, { wholeWin, winQs, dayOK, inDay: (d) => inRange(d, rg) });
    // ===== #196: narrow the INDEX, once, rather than each place that reads it =====
    // 🚨 The first build filtered only where the job row is formed, and left `byJob` whole — so a job read 22
    //    positions over recruiter rows summing to 52. Children stopped adding up to their parent the moment a
    //    recruiter was picked. Narrowing here means the job rebuild below, `closeToJob`, the recruiter rows and
    //    the topic rows under them ALL read the same filtered set, so the tree cannot disagree with itself.
    (() => {
      const sel = selRecs(); if (!sel.length) return;
      Object.keys(rIdx.byJob).forEach(j8 => {
        const kept = rIdx.byJob[j8].filter(r => sel.includes(r.recruiter));
        if (kept.length) rIdx.byJob[j8] = kept; else delete rIdx.byJob[j8];
      });
    })();
    const LV = levelsOn('hmLevels');   // #188: which branches this render is built from

    const groups = {};
    Object.entries(ob).forEach(([job8, rec]) => {
      const dept = deptOf(rec.department || '') || 'Unknown';
      if (!okDept(dept)) return;
      if (!matchesJob(jobSel, job8)) return;   // #172c: by id, not name
      let t = 0, jn = 0, op = 0, ms = 0;
      const add = (b) => { t += b.total || 0; jn += b.joined || 0; op += b.open || 0; ms += b.missed || 0; };
      // #129: a window covering whole quarters adds those quarters; a narrower one adds the positions opened on its days (openingBuckets
      // .days, India time, the clock the quarters are cut from). A data file from before 15 Sep has no days, so a narrow window reads empty.
      if (wholeWin) Object.entries(rec.quarters || {}).forEach(([q, b]) => { if (winQs.includes(q)) add(b); });
      else if (dayOK) Object.entries(rec.days || {}).forEach(([d, b]) => { if (inRange(d, rg)) add(b); });
      // ===== #196: the Recruiter filter, applied where the JOB ROW IS FORMED =====
      // 🚨 The four figures above come from `openingBuckets`, which knows nothing about recruiters; the
      //    recruiter split lives in `openingRows` (rIdx). So narrowing the recruiter rows alone would leave the
      //    job and department rows reading their unfiltered totals, and the children would stop summing to the
      //    parent - this project's favourite bug. With a recruiter picked, the job row is REBUILT from that
      //    recruiter's own positions, so the tree adds up by construction whatever is selected.
      // ⚠ `rIdx` only carries positions inside the period AND present in `openingRows`; an archived one is
      //    absent (see closeToJob). Filtered, the catch-all it would have topped up is not this recruiter's, so
      //    the difference correctly disappears with them rather than being attributed to whoever is left.
      const recSel = selRecs();
      if (recSel.length) {
        const mine = rIdx.byJob[job8.slice(0, 8)] || [];   // already narrowed above - one source, one answer
        t = mine.reduce((a, r) => a + (r.total || 0), 0);
        jn = mine.reduce((a, r) => a + (r.joined || 0), 0);
        op = mine.reduce((a, r) => a + (r.open || 0), 0);
        ms = mine.reduce((a, r) => a + (r.missed || 0), 0);
      }
      if (!t && !jn && !op && !ms) return;
      if (!groups[dept]) groups[dept] = { dept, total: 0, joined: 0, open: 0, missed: 0, jpP: 0, drop: 0, jobs: [] };
      const G = groups[dept];
      G.total += t; G.joined += jn; G.open += op; G.missed += ms;
      // #150: job8 rides on the row — the Remarks cell is filed by job id, never by title.
      G.jobs.push({ title: rec.title, job8: job8.slice(0, 8), total: t, joined: jn, open: op, missed: ms, jpP: 0, drop: 0, jpWho: [] });
    });
    // ===== CANDIDATE-SIDE COLUMNS (people, not openings) — definition set by Jerin 2026-08-22 =====
    // Joining Pending = every candidate currently parked in Ref Check, Documentation or Offer.
    // ⚠ It is a LIVE count and CANNOT be quarter-scoped: openingQuarter is absent on 141 of the 166 cases,
    // so filing them by quarter would silently drop 85% of the people. Dropped CAN be scoped (attrQuarter
    // covers 92/92) and is, so these two columns sit on different time bases — the caption says so.
    // Rows are added for jobs that have people in closing but NO opening in the period: restricting to
    // openings showed 88 of 166 pending people and hid 45 of SME - India's 46.
    // #172c: the job id decides the Job filter; the title is only still here for the department check.
    const inScope = (dept, title, job8) => okDept(dept) && matchesJob(jobSel, job8);
    // #150: `who` is the Joining Pending case behind this +1. The names in the cell are collected in the SAME
    // loop as the number beside them, so the cell and the column can never disagree (Rule 3).
    // #182a: the row lookup is its own function now, because TWO things need it — the counting bump below and
    // the joiner list, which must land on the SAME row or a name would show against a different job than its
    // number. Duplicating the lookup is exactly how #172c's by-name/by-id split happened.
    function rowFor(dept, title, job8, who) {
      if (!groups[dept]) groups[dept] = { dept, total: 0, joined: 0, open: 0, missed: 0, jpP: 0, drop: 0, jobs: [] };
      const G = groups[dept];
      // 🚨 #172c / 172b(a): find the row by JOB ID. The positions half of this table is built from
      // openingBuckets keyed by id, so matching people by NAME meant two same-named jobs in one department
      // would split their positions across two rows while every person piled onto the first. Title is the
      // fallback only for a record with no id — none today, measured 1,056 of 1,056.
      const j8 = String(job8 || (who && who.jobId8) || '').slice(0, 8);
      let row = j8 ? G.jobs.find(j => j.job8 === j8) : null;
      if (!row) row = G.jobs.find(j => j.title === title && (!j8 || !j.job8));
      // #187: `recs` is the per-recruiter split of the PEOPLE columns. It is created here, in the one place a
      // row is made, for the same reason rowFor() exists at all — a second lookup is how a name lands on a
      // different row than its number.
      if (!row) { row = { title, job8: j8, total: 0, joined: 0, open: 0, missed: 0, jpP: 0, drop: 0, jpWho: [], joWho: [], recs: {} }; G.jobs.push(row); }
      if (!row.recs) row.recs = {};
      if (!row.job8 && j8) row.job8 = j8;
      return { G, row };
    }
    // #187: the ONE place a person is filed under a recruiter. Both the counting bump and the joiner list go
    // through it, so a recruiter's names and its numbers can never describe different people (Rule 3).
    function recBucket(row, who) {
      const key = recruiterOfPerson(who);
      return row.recs[key] || (row.recs[key] = { recruiter: key, jpP: 0, drop: 0, jpWho: [], joWho: [] });
    }
    // 🚨 `attr` is SEPARATE from `who` on purpose. A Dropped bump passes who=null because that column lists no
    // names — but the drop event still names a recruiter, and without a second argument all 12 offer drops filed
    // themselves under `(recruiter not set)`. Measured on the page before the fix; it looked entirely plausible.
    function bump(dept, title, field, who, job8, attr) {
      // #196: the Recruiter filter, applied BEFORE anything is counted - the department roll-up, the job row,
      // the recruiter row and the name list all hang off this call, so one test here keeps them consistent.
      if (!okRec(recruiterOfPerson(attr || who))) return;
      const { G, row } = rowFor(dept, title, job8, who);
      G[field] += 1;
      row[field] += 1;
      const rb = recBucket(row, attr || who);
      rb[field] += 1;
      if (who) { (row.jpWho || (row.jpWho = [])).push(who); (G.jpWho || (G.jpWho = [])).push(who); rb.jpWho.push(who); }
      // #252c (Jerin, 19 Oct 2026): the dropped person's name, pushed in the SAME call that increments the
      // figure beside it, so the list and the count can never disagree (Rule 3: the table computes).
      // `attr` is the dropEvent itself; the pipeline puts `candidate` on it from the offer it was built from.
      // ⚠ Only the 112 offer-sourced drops reach here — `dropRows` filters to those (#183c) — and every
      //   one carries a name, so a MISSING name means the data predates the 20 Oct pipeline change.
      if (field === 'drop' && attr && attr.candidate) {
        const d = { candidate: attr.candidate, day: attr.day || null };
        (row.drWho || (row.drWho = [])).push(d);
        (G.drWho || (G.drWho = [])).push(d);
        (rb.drWho || (rb.drWho = [])).push(d);
      }
    }
    // ===== #182a (Jerin, 26 Sep 2026): "Left to Who is joining, add a 'Who has joined?'." =====
    // 🚨 IT COUNTS NOTHING. The Joined column beside it counts POSITIONS, from openingBuckets; this is a list of
    //    PEOPLE. Incrementing anything here would corrupt that number — so this only ever pushes a name.
    // 🚨 AND THAT IS WHY THE TWO CAN DIFFER: the same fact the Joiners sub-tab already carries in its own comment
    //    — "People, not positions: it will not equal the Joined column, which counts positions filled (Rule 1)."
    //    Said on screen in the definitions block, or the column reads as a fault.
    // The test is the SAME one every people-based Joined on this site uses, and the same one renderJoiners() uses,
    // so the names here and the names on the Joiners sub-tab are one population.
    // #252c: the fourth people column. ONE helper, because this tab draws its rows in six places and a
    // hand-written cell at each is how a column goes missing from one row type (#262's fault in miniature).
    const dropCell = (o) => jnWhoCell(o || {}, { list: (o && o.drWho) || [], dateOf: (c) => c.day });
    function addJoiner(dept, title, who, job8) {
      if (!okRec(recruiterOfPerson(who))) return;   // #196
      const { G, row } = rowFor(dept, title, job8, who);
      (row.joWho || (row.joWho = [])).push(who);
      (G.joWho || (G.joWho = [])).push(who);
      recBucket(row, who).joWho.push(who);   // #187: the same person, filed under the same recruiter
    }
    // ...MINUS anyone whose opening belongs to an EARLIER quarter (Jerin, 2026-08-22): their offer is last
    // quarter's demand still in flight, and counting it here would inflate the current quarter every time.
    // Only 25 of 166 cases carry an opening at all, so this can only judge those; the 141 unlinked stay in
    // because there is nothing to judge them by. Under Q3 2026 it removes the 2 sitting on Q2 openings.
    const fromQ = dateFrom ? quarterOf(dateFrom) : null;
    const toQ = dateTo ? quarterOf(dateTo) : null;   // #237: a position from a LATER quarter cannot be filled here
    (data.joiningPendingCases || []).forEach(c => {
      const dept = deptOf(c.department || '') || 'Unknown', title = c.job || c.jobTitle || '(no job)';
      if (!inScope(dept, title, c.jobId8)) return;
      // #182f: the ONE copy of this test now lives in data.js, so the Overview cannot drift from it.
      if (!jpCaseInPeriod(c, fromQ, toQ)) return;   // #237
      bump(dept, title, 'jpP', c, c.jobId8);   // #150: the case itself, for the "Who is joining" cell
    });
    dropRows(data).forEach(e => {
      if (!dropIn(e, rg, winQs)) return;   // #129: by the day they first reached Ref Check / Documentation / Offer
      const dept = deptOf(e.department || '') || 'Unknown', title = e.jobTitle || '(no job)';
      if (!inScope(dept, title, e.jobId8)) return;
      bump(dept, title, 'drop', null, e.jobId8, e);   // #187: the event carries the recruiter this drop belongs to
    });
    // #182a: the people behind "Who has joined" — accepted offer AND moved to Hired, dated by their START date
    // inside From / To. Identical to renderJoiners(), deliberately: one definition of "joiner" across the site.
    // ⚠ NO earlier-quarter subtraction, exactly as the Joiners sub-tab takes none — it shows everyone who
    //   actually started. That is the other reason this list can outnumber the Joined column beside it.
    (data.offerEvents || []).forEach(e => {
      if (!e.accepted || e.appStatus !== 'Hired') return;
      if (!inRange(e.startDate, rg)) return;
      const dept = deptOf(e.department || '') || 'Unknown', title = e.jobTitle || '(no job)';
      if (!inScope(dept, title, e.jobId8)) return;
      addJoiner(dept, title, e, e.jobId8);
    });

    const deptArr = Object.values(groups).sort((a, b) => a.dept.localeCompare(b.dept));

    const totals = { total: 0, joined: 0, open: 0, missed: 0, jpP: 0, drop: 0 };
    deptArr.forEach(t => { totals.total += t.total; totals.joined += t.joined; totals.open += t.open; totals.missed += t.missed; totals.jpP += t.jpP; totals.drop += t.drop; });

    document.getElementById('hm1Cards').innerHTML = `
      <div class="card"><div class="label">Total Positions</div><div class="value">${totals.total}</div><div class="sub">opened in this period</div></div>
      <div class="card"><div class="label">Joined</div><div class="value" style="color:var(--green)">${totals.joined}</div><div class="sub">moved to Hired</div></div>
      <div class="card"><div class="label">Open</div><div class="value" style="color:var(--blue)">${totals.open}</div><div class="sub">still to fill</div></div>
      <div class="card"><div class="label">Joining Pipeline</div><div class="value" style="color:var(--orange)">${totals.jpP}</div><div class="sub">in Ref Check, Documentation or Offer \u00b7 live</div></div>
      <div class="card"><div class="label">Offer Drop</div><div class="value" style="color:var(--red)">${totals.drop}</div><div class="sub">${(totals.joined + totals.jpP + totals.drop) > 0 ? Math.round((totals.drop / (totals.joined + totals.jpP + totals.drop)) * 100) + '% of outcomes' : 'no outcomes yet'}</div></div>
    `;

    // #28 (Jerin, 2026-08-24): Delta = Total Openings − Joined − Joining Pending, and a NEGATIVE result
    // STANDS — the Math.max(0, …) clamp is gone deliberately, do not put it back.
    // ⚠ Total Openings counts POSITIONS; Joining Pending counts PEOPLE. Subtracting them mixes units on purpose:
    // ⚠ Say POSITIONS, never "seats", in anything the user reads (Jerin, 2026-08-24).
    // more people can be in closing than there are positions (US Business Q3: 19 positions, 6 joined, 23 in
    // closing → −10). That is a true signal about missing opening links, and it corrects itself as they
    // are fixed. The old formula (Open − seats-with-an-offer-out) gave the right number but its arithmetic
    // was invisible on screen, which is what made three JP figures disagree all week.
    // #189f: ONE definition of Delta on this tab. It was written out four times - here, on the two recruiter
    // row types, and again inside the chart, which even carried a comment saying it was "worded exactly as
    // metrics() words it". Four copies of one sum is how a chart and its table drift apart (Rule 3); Overall
    // Efficiency already does it this way, computing `gap` once in fulfilRows and letting both read it.
    // #270 (Jerin, 20 Oct 2026): Achieved - what has already been landed against the target, so the row
    // reads Total - Achieved = Delta straight across instead of making the reader do the subtraction.
    // 🔑 Delta is DERIVED from it, so the pair is one calculation and cannot drift (Rule 3).
    // 🚨 Offer drops are NOT in it. PROVED on a live Q3 row: 17 total, 17 joined, 0 in pipeline, 2 drops,
    //    Delta 0 - subtracting the drops would have shown -2.
    const achievedOf = (v) => (v.joined || 0) + (v.jpP || 0);
    const deltaOf = (v) => (v.total || 0) - achievedOf(v);
    const metrics = (v) => {
      const delta = deltaOf(v);
      // #218 (9 Oct 2026): the bar is GONE from Delta — `deltaPill` is the one home for this cell now. The
      // old `gapPct` that filled it went with it: it measured the shortfall as a share of the department,
      // which drew nothing at all on the 79 rows of 112 where Delta is exactly zero, and nothing on a surplus
      // either, so the best row on the board looked like an average one.
      // #153 (Jerin, 19 Sep 2026): the caption under Delta is GONE — it read "13 of 32 still to fill",
      // "nothing outstanding", or "1 more in closing than opened" when Delta went negative. 🚨 Rule 1 still
      // holds: a NEGATIVE Delta is correct and is never clamped. The pill now says which of the three states
      // a row is in; the reason stays in the definitions block under the panel rather than on every row.
      // Drop % denominator INCLUDES Dropped itself (Jerin, 2026-08-22): of everything that reached a
      // conclusion or is about to, what share fell out.
      const den = v.joined + v.jpP + v.drop;
      const dpct = den > 0 ? Math.round((v.drop / den) * 100) : null;
      const dropCell = v.drop
        ? `<span style="color:var(--red);font-weight:600">${v.drop}</span>`
          + (dpct !== null ? `<span class="sublab">${dpct}%</span>` : '')   // #153: "of outcomes" dropped; the definitions block says what it is a share of
        : `<span class="zero">0</span>`;
      // #270: the % sits in BRACKETS on the same line, never underneath - on Overall Efficiency the slot
      // under every count is already the score (#266), so a sublab here would collide with it.
      const ach = achievedOf(v);
      const apct = v.total > 0 ? Math.round((ach / v.total) * 100) : null;
      return `<td style="font-weight:600">${v.total}</td><td class="good">${v.joined}</td>`
        + `<td style="color:var(--orange)">${v.jpP || `<span class="zero">0</span>`}</td>`
        + `<td class="gapcell">${dropCell}</td>`
        + `<td class="gapcell">${ach || `<span class="zero">0</span>`}`
          + `${apct !== null ? `<span class="achpct">(${apct}%)</span>` : ''}</td>`
        + `<td class="gapcell">${deltaPill(delta)}</td>`;
    };
    // #188: attach the PEOPLE to the position-derived recruiter splits, so the merged rows carry both halves.
    // A recruiter with people but no position of their own is added here too — the same rule as the job level.
    const withPeople = (o, recs, dept) => {
      const out = recs.map(r => Object.assign({}, r, { pending: 0, drop: 0, joWho: [], jpWho: [], topics: {} }));
      const find = (k) => {
        let t = out.find(x => x.recruiter === k);
        if (!t) { t = { recruiter: k, total: 0, joined: 0, open: 0, missed: 0, jpTied: 0, openings: [],
                        pending: 0, drop: 0, joWho: [], jpWho: [], topics: {} }; out.push(t); }
        return t;
      };
      Object.entries(o.recs || {}).forEach(([k, rb]) => {
        const t = find(k);
        t.pending += rb.jpP || 0; t.drop += rb.drop || 0;
        t.joWho = t.joWho.concat(rb.joWho || []);
        t.jpWho = t.jpWho.concat(rb.jpWho || []);
      });
      out.forEach(r => {
        const mine = new Set((r.openings || []).map(x => String(x.id).slice(0, 8)));
        (hasTopicLevel(tIdx, dept, o.job8) ? tIdx[o.job8] : []).forEach(t => {
          const ops = t.openings.filter(x => mine.has(String(x.id).slice(0, 8)));
          if (ops.length) r.topics[t.topic] = { total: ops.length, joined: ops.filter(x => x.state === 'joined').length };
        });
      });
      return out;
    };
    // #188: one topic-row writer, used at whatever depth the chosen levels put the topics.
    const emitTopics = (list, gi, job8, pad) => (list || []).map(t => {
      const unset = t.topic === NO_TOPIC;
      return `<tr class="lv-topic" data-lvl="4" data-g="${gi}"${job8 ? ` data-job8="${esc(job8)}"` : ' data-nojob="1"'} style="display:none">`
        + `<td style="padding-left:${pad}"><span class="${unset ? 'topic-unset' : 'topic-name'}">${esc(t.topic)}</span></td>`
        // 🚨 A DASH, NOT A ZERO. At this depth the people have not been split by topic (#182a's rule), and a 0
        // would read as "nobody", which is a different claim. Under a JOB the topic rows DO carry a real
        // Joining pipeline count, because splitWho() places those people — that path is untouched.
        + `<td style="font-weight:600">${t.total}</td><td class="${t.joined ? 'good' : 'zero'}">${t.joined}</td>`
        // #270: a FOURTH dash - Achieved. A topic row cannot claim one, because the people behind it are not
        // split by topic at this depth (#182a's rule), and a 0 would read as "nobody", a different claim.
        + DASH + DASH + DASH + DASH + `<td class="jn-cell"><span class="zero">&mdash;</span></td>`
        + `<td class="jn-cell"><span class="zero">&mdash;</span></td>`   // #252c: a topic cannot claim a drop
        + jnWhoCell({ jpWho: [] }) + dropCell(t) + `<td class="pri-cell"><span class="zero">&mdash;</span></td><td class="jn-cell"><span class="zero">&mdash;</span></td></tr>`;
    }).join('');

    let html = '';
    deptArr.forEach((D, gi) => {
      // #252f: P0 to the top WITHIN this department; title order is kept as the tie-break.
      const jobs2 = [...D.jobs].sort(byPriorityThen((a, b) => a.title.localeCompare(b.title)));
      const withNote = jobs2.filter(j => (noteOf(j.job8) || {}).text).length;
      // #188 / #157: a department only LOOKS clickable when the chosen levels actually give it children. With
      // Job and Recruiter both off, a department with no topic level has nothing under it — a caret there would
      // be a row pretending to expand, which is the thing #157 removed.
      const deptOpens = LV.job || LV.rec || (LV.top && deptHasTopics(D.dept));
      html += `<tr class="dept-header" data-lvl="1"${deptOpens ? ' data-hold="1"' : ''} data-g="${gi}" data-exp="0" style="${deptOpens ? 'cursor:pointer;' : ''}background:var(--border-light)">
        <td style="font-weight:600">${deptOpens ? CARET : ''}${D.dept}${cnt(jobs2.length)}</td>${metrics(D)}`
        + `<td class="jn-cell jn-sum">${(D.joWho || []).length ? `${D.joWho.length} joined` : '<span class="zero">—</span>'}</td>`
        + `<td class="jn-cell jn-sum">${D.jpP ? `${D.jpP} across ${jobs2.length} role${jobs2.length === 1 ? '' : 's'}` : '<span class="zero">—</span>'}</td>`
        // #252c: a department row carries a COUNT, not a list — naming them here would repeat every name
        // again on the job rows beneath it, which is the rule the two columns above already follow.
        + `<td class="jn-cell jn-sum">${D.drop ? `${D.drop} dropped` : '<span class="zero">—</span>'}</td>`
        + `<td class="pri-cell"><span class="zero">&mdash;</span></td>`
        + `<td class="jn-cell jn-sum">${withNote ? `${withNote} of ${jobs2.length} written` : '<span class="zero">—</span>'}</td></tr>`;
      // ===== #188: with Job switched OFF the department opens straight to its recruiters (or its topics),
      // and the per-job splits are merged so those rows still add up to the department above them. =====
      if (!LV.job) {
        const merged = LV.rec
          ? mergeByRecruiter(jobs2.map(o => withPeople(o, closeToJob(rIdx.byJob[o.job8] || [], o.total, o.joined), D.dept)), NO_RECRUITER)
          : [];
        if (LV.rec) {
          merged.forEach(r => {
            const unsetR = r.recruiter === NO_RECRUITER;
            const gapP = deltaOf({ total: r.total, joined: r.joined, jpP: r.pending });   // #189f
            html += `<tr class="lv-rec${unsetR ? ' norec' : ''}${r.total ? '' : ' noseat'}" data-lvl="3" data-g="${gi}" data-nojob="1" style="display:none">`
              + `<td style="padding-left:1.875rem"><span class="${unsetR ? 'rec-unset' : 'rec-name'}">${esc(r.recruiter)}</span>`
              + (r.total ? '' : `<span class="noseat-tag">no position of their own</span>`) + `</td>`
              + recMetrics(r, { jpP: r.pending, drop: r.drop }, gapP)
              + jnWhoCell(r, { list: r.joWho || [], dateOf: c => c.startDate, tagOf: joinTag, groupByDate: true })
              + jnWhoCell({ jpWho: r.jpWho || [] }) + dropCell(r)
              + `<td class="pri-cell"><span class="zero">&mdash;</span></td><td class="jn-cell"></td></tr>`;
            if (LV.top && deptHasTopics(D.dept)) html += emitTopics(Object.entries(r.topics || {}).map(([t, v]) => Object.assign({ topic: t }, v)), gi, null, '3.25rem');
          });
        } else if (LV.top && deptHasTopics(D.dept)) {
          // Department ➔ Topic: the same openings, grouped by topic across every job in the department
          const byTopic = {};
          jobs2.forEach(o => (tIdx[o.job8] || []).forEach(t => {
            const x = byTopic[t.topic] || (byTopic[t.topic] = { topic: t.topic, total: 0, joined: 0 });
            x.total += t.total; x.joined += t.joined;
          }));
          html += emitTopics(Object.values(byTopic).sort((a, b) => b.total - a.total), gi, null, '1.875rem');
        }
        return;
      }
      jobs2.forEach(o => {
        // #157: only the two SME departments open past the job. Everything else is a plain leaf with no
        // caret and cursor:default - a row that does not pretend to expand.
        const topics = (LV.top && hasTopicLevel(tIdx, D.dept, o.job8)) ? tIdx[o.job8] : null;   // #188
        // #187: the recruiter level sits BETWEEN the job and the topic, on every department. `closeToJob` tops up
        // the catch-all with anything openingRows could not see, so these rows always sum to the job row above.
        const recs = closeToJob(rIdx.byJob[o.job8] || [], o.total, o.joined);
        // a recruiter who worked people here but owns no position here still gets a row (Jerin, 27 Sep: option A,
        // "keep their own row"). Their names would otherwise hide behind the job row's "+N more" — measured: 5 of 8.
        Object.keys(o.recs || {}).forEach(k => {
          if (!recs.some(r => r.recruiter === k)) recs.push({ recruiter: k, total: 0, joined: 0, open: 0, missed: 0, jpTied: 0, openings: [], noSeat: true });
        });
        // #187: EVERY job opens to its recruiters, including a job owned by one person — naming the owner is
        // the point of the level, and the mock Jerin approved showed it that way.
        const hasRecs = LV.rec && recs.length > 0;   // #188
        // #161 (option A): the job's people split by the topic of the opening they are tied to; the job row keeps the rest.
        const split = topics ? splitWho(o.jpWho, topics) : null;
        const who = split ? jnWhoCell({ jpWho: split.rest }, { note: whyUntied, under: o.jpWho.length - split.rest.length }) : jnWhoCell(o);
        // #182a: the same helper, pointed at the joiners and dated by their START date.
        const joined = jnWhoCell(o, { list: o.joWho || [], dateOf: c => c.startDate, tagOf: joinTag, groupByDate: true });
        const opens = hasRecs || topics;
        html += `<tr class="leaf${topics ? ' has-topics' : ''}" data-lvl="2" data-g="${gi}"${opens ? ` data-job8="${esc(o.job8)}" data-texp="0" style="display:none;cursor:pointer"` : ' style="display:none"'}>
          <td style="padding-left:1.875rem;font-weight:500;max-width:22.5rem">${opens ? TCARET : ''}${o.title}${hasRecs ? cnt(`${recs.length} recruiter${recs.length === 1 ? '' : 's'}`) : (topics && topics.length > 1 ? cnt(`${topics.length} topics`) : '')}</td>${metrics(o)}${joined}${who}${dropCell(o)}${priorityCell({ ...o, roleRow: true })}${remarkCell(o)}</tr>`;
        if (!opens) return;
        // With no recruiter level the topics hang off the job exactly as they did before #187.
        const under = hasRecs ? recs : [{ recruiter: null, openings: null }];
        under.forEach(r => {
          const rb = (o.recs || {})[r.recruiter] || { jpP: 0, drop: 0, jpWho: [], joWho: [] };
          if (hasRecs) {
            const unsetR = r.recruiter === NO_RECRUITER;
            const gapP = deltaOf({ total: r.total, joined: r.joined, jpP: rb.jpP });   // #189f
            html += `<tr class="lv-rec${unsetR ? ' norec' : ''}${r.noSeat ? ' noseat' : ''}" data-lvl="3" data-g="${gi}" data-job8="${esc(o.job8)}" data-rec="${esc(`${o.job8}|${r.recruiter}`)}" data-rexp="0" style="display:none">`
              + `<td style="padding-left:3.25rem"><span class="${unsetR ? 'rec-unset' : 'rec-name'}">${esc(r.recruiter)}</span>`
              + (r.total ? '' : `<span class="noseat-tag">no position of their own</span>`) + `</td>`
              + recMetrics(r, rb, gapP)
              + jnWhoCell(rb, { list: rb.joWho || [], dateOf: c => c.startDate, tagOf: joinTag, groupByDate: true })
              + jnWhoCell({ jpWho: rb.jpWho || [] }) + dropCell(rb)
              + `<td class="pri-cell"><span class="zero">&mdash;</span></td><td class="jn-cell"></td></tr>`;
          }
          // the topic rows now hang off the RECRUITER when there is one, so the tree reads
          // Department ➔ Job ➔ Recruiter ➔ Specialisation.
          if (!topics) return;
          const mine = r.openings ? new Set(r.openings.map(x => x.id)) : null;
          const tops = mine ? topicsFor(topics, mine) : topics;
          tops.forEach(t => {
            const tw = (split.by[t.topic] || []).filter(c => !mine || !c.openingId || mine.has(c.openingId));
            const tk = `${o.job8}|${r.recruiter || ''}|${t.topic}`;
            const unset = t.topic === NO_TOPIC;
            // #157c: a topic row is the bottom of the tree - no caret, nothing to open under it.
            html += `<tr class="lv-topic" data-lvl="4" data-g="${gi}" data-job8="${esc(o.job8)}"${hasRecs ? ` data-rec="${esc(`${o.job8}|${r.recruiter}`)}"` : ''} data-topic="${esc(tk)}" style="display:none">`
              + `<td style="padding-left:${hasRecs ? '4.5rem' : '3.25rem'}"><span class="${unset ? 'topic-unset' : 'topic-name'}">${esc(t.topic)}</span></td>`
              // #182a: Who has joined DASHES at topic level for now — splitting joiners by topic is #166's job on the
              // Recruiter tab and has its own "(not tied to a topic)" remainder rule; a half-done split here would
              // silently under-count. A dash says "not worked out at this level", which is true. Never a number.
              + topicMetrics(t, tw.length) + `<td class="jn-cell"><span class="zero">&mdash;</span></td>`
              + jnWhoCell({ jpWho: tw }) + '<td class="jn-cell"><span class="zero">&mdash;</span></td>' + `<td class="pri-cell"><span class="zero">&mdash;</span></td><td class="jn-cell"><span class="zero">&mdash;</span></td></tr>`;
          });
        });
      });
    });
    // #182a: the totals row gained the Who-has-joined cell too, or every trailing cell shifts one left.
    const joinedAll = Object.values(groups).reduce((a, G) => a + ((G.joWho || []).length), 0);
    html += `<tr class="totals-row"><td>Total</td>${metrics(totals)}`
      + `<td class="jn-cell jn-sum">${joinedAll ? `${joinedAll} joined` : '<span class="zero">—</span>'}</td>`
      + `<td class="jn-cell jn-sum">${totals.jpP || '<span class="zero">—</span>'}</td>`
      + `<td class="jn-cell jn-sum">${totals.drop ? `${totals.drop} dropped` : '<span class="zero">—</span>'}</td><td class="pri-cell"><span class="zero">&mdash;</span></td><td class="jn-cell"></td></tr>`;
    const body = document.getElementById('hm1Body');
    body.innerHTML = html;
    wireTree(body, true);   // #189d: the level chooser IS the expand control on this table (#188)
    wireJobNotes(body);   // #150
    markRemarkOverflow(body);   // #252b: only a genuinely clipped remark gets a "more"
    wirePriority(body);         // #252f: the P0/P1/P2 select saves through the same store

    // Chart: one bar per department, stacked Joined / Joining Pending / Delta — and Joined and Joining Pending
    // split again into the ROLES inside the department, in shades of the metric colour (Jerin, 2026-08-29).
    // Darkest band is the department's biggest role for that metric, palest the smallest; past ten roles the
    // tail is pooled so nothing drops out of the bar. The role name is in the tooltip. Every figure comes from
    // deptArr and groups, the same rows the table above renders — the TABLE COMPUTES, THE CHART READS (Rule 3).
    // ===== #182e (Jerin, 26 Sep 2026): MISSED IS GONE FROM HERE, DELTA TOOK ITS PLACE =====
    // 🗣 "Remove missed from the chart too - we can show delta instead no? Total will be Joined/Joining Pending/Delta."
    // This is NOT a new design: Overall Efficiency has plotted these exact three bands since #120, and this chart
    // now shares its colours and its axis options from chart-style.js so the two cannot drift.
    // 🔑 Delta = Total − Joined − Joining Pending, the SAME expression metrics() uses for the table's Delta cell.
    //    It is NOT split into roles: a −5 role and a +5 role cancel in the table, and splitting let both count
    //    (SME - India once read 53 against the table's 48 on the Overall Efficiency chart).
    // 🚨 Delta is SIGNED (Rule 1, never clamped) and a bar CANNOT draw a negative band. So the total at the end
    //    of each bar is NOT the sum of the bands — stackTotals is off and the label prints the TABLE's total.
    //    Without that, a department with more people in closing than positions opened would silently show
    //    Joined + Joining Pending and call it the total.
    const cDepts = deptArr.map(t => t.dept).slice().reverse();
    if (hm1ChartInstance) hm1ChartInstance.destroy();
    const ctx1 = document.getElementById('hm1Chart');
    if (ctx1) {
      const h = hbarHeight(cDepts.length, 60, 220);
      const wrap = document.getElementById('hm1ChartWrap');
      if (wrap) wrap.style.height = h + 'px';
      ctx1.style.maxHeight = h + 'px';   // override .chart-wrap canvas { max-height:300px } so the canvas fills the wrap
      const METRICS = [
        { key: 'joined', label: 'Joined', color: FULFIL_COLORS.joined },
        { key: 'pending', label: 'Joining Pipeline', color: FULFIL_COLORS.pending },
        { key: 'gap', label: 'Delta', color: FULFIL_COLORS.gap, split: false }
      ];
      const byDept = {}; deptArr.forEach(D => { byDept[D.dept] = D; });
      const chartTotals = [];   // the TABLE's total per bar, in cDepts order — the end label reads this, not the bands
      const chartRows = cDepts.map(d => {
        const D = byDept[d] || { jobs: [] };
        const g = groups[d] || { total: 0, joined: 0, jpP: 0 };
        chartTotals.push(g.total || 0);
        return {
          label: d,
          sum: { joined: g.joined, pending: g.jpP, gap: deltaOf(g) },
          jobs: (D.jobs || []).map(o => ({ title: o.title, v: { joined: o.joined, pending: o.jpP } }))
        };
      });
      // Total at the end of each bar. The global stackTotals plugin adds the bands up, which is wrong here
      // whenever Delta is negative, so it is switched off below and this draws the table's figure instead.
      const hmTotalLabels = {
        id: 'hm1Totals',
        afterDatasetsDraw(chart) {
          const c = chart.ctx; c.save();
          c.font = `600 ${uiPx(11)}px -apple-system, BlinkMacSystemFont, sans-serif`;
          c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillStyle = '#334155';
          chartTotals.forEach((t, i) => {
            let x = null, y = null;
            chart.data.datasets.forEach((d, di) => {
              if (!chart.isDatasetVisible(di) || !(d.data[i] > 0)) return;
              const bar = chart.getDatasetMeta(di).data[i]; if (!bar) return;
              x = x == null ? bar.x : Math.max(x, bar.x); y = bar.y;
            });
            if (x != null) c.fillText(String(t), x + uiPx(6), y);
          });
          c.restore();
        }
      };
      hm1ChartInstance = new Chart(ctx1, {
        type: 'bar',
        data: { labels: cDepts, datasets: roleBandDatasets(chartRows, METRICS) },
        options: {
          indexAxis: 'y', responsive: true, maintainAspectRatio: false,
          layout: { padding: { top: 4, right: 40 } },
          plugins: {
            valueLabels: false,   // the per-metric label below replaces it; one number per band would be noise
            stackTotals: false,   // #182e: the end label must be the TABLE's total, not the sum of the bands
            legend: metricLegend(METRICS, { align: 'center', labels: { boxWidth: 11, boxHeight: 11, padding: 18, font: { size: 12 } } }),
            // Hovering any part of a section lists every role behind that whole section (Jerin, 2026-08-30).
            tooltip: roleSectionTooltip(METRICS, { totalLabel: 'Total positions',
              total: (i) => chartTotals[i],
              extra: (i) => {
                const g = groups[cDepts[i]]; if (!g) return '';
                const dl = deltaOf(g);
                return dl < 0 ? `Delta ${dl}: ${-dl} more in closing than positions opened` : '';
              } })
          },
          scales: {
            x: { stacked: true, beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 11 } }, title: { display: true, text: 'Positions', font: { size: 11 }, color: '#64748b' } },
            y: { stacked: true, grid: { display: false }, ticks: { font: { size: 12, weight: '500' }, padding: 6 } }
          }
        },
        plugins: [roleBandOverlay(METRICS), hmTotalLabels]
      });
    }
  }

  // ===== Section 2: Throughput (Department -> Job tree) =====
  // TP column keys -> stage keys used by the stage-history rollups. #240b: imported, not typed out.

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
      const out = {}; TP_KEYS.forEach(k => { out[k] = { i: 0, o: 0, w: 0 }; });
      out.span = { i: 0, o: 0 }; out.overall = null; out.waiting = 0;
      return out;
    }
    // #129: a window narrower than the quarters it touches adds up the DAY twins instead — assessed / progressed on the day of the
    // assessment, the span on the day of the first R1 or OA assessment. A rollups file from before 15 Sep has no days: the row reads empty.
    if (quarters.length && !coversQuarters(hmRange(), windowQuarters())) {
      const sr = data.stageRollups || {}, rg = hmRange();
      const asD = sr.assessedByJobD || null, spD = sr.assessedSpanByJobD || null;
      const out = {};
      TP_KEYS.forEach(k => { const s = asD ? sumDayFields((asD[j.id] || {})[TP_TO_STAGE[k]], rg) : {}; out[k] = { i: s.a || 0, o: s.b || 0, w: s.w || 0 }; });
      out.waiting = TP_KEYS.reduce((t, k) => t + out[k].w, 0);   // #210b
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
        let i = 0, o = 0, w = 0;
        quarters.forEach(q => { const v = st[q]; if (v) { i += v.a || 0; o += v.b || 0; w += v.w || 0; } });
        out[k] = { i: i, o: o, w: w };
      });
      out.waiting = TP_KEYS.reduce((t, k) => t + out[k].w, 0);   // #210b: assessed, no decision yet
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
    const jobSel = selJobs();
    const hideEmpty = document.getElementById('hm2HideEmpty')?.checked;

    const quarters = quartersInWindow(gFrom(), gTo());
    const openIds = openJobIds();   // #125

    const filtered = jobs.filter(j => {
      if (!okDept(j._dept)) return false;
      if (!matchesJob(jobSel, j.id)) return false;   // #172c
      if (!j.pipeline) return false;
      if (openIds && !openIds.has(String(j.id).slice(0, 8))) return false;   // #125: an opening opened in From–To
      return true;
    }).sort(byDept);

    // #5 (2026-08-22): "Hide zero-pipeline" used to test j.total — the job's LIFETIME application count — so a
    // job with 308 applications ever and no activity at all in the selected quarter still rendered a full row
    // of zeros, and the department's job count was inflated to match. It now tests throughput IN THE SELECTED
    // PERIOD, which is what the checkbox claims and what the quarter selector implies.
    const withT = filtered.map(j => ({ j, t: throughputFor(j, quarters, !!(gFrom() || gTo())) }));

    // #240d E: a stage Ashby no longer has keeps its column only where it holds something. A stage Ashby
    // STILL has always keeps its column, even at zero — that zero is a real fact about the period.
    // 🔑 Computed from withT, which is why this sits below it: only this table knows what it is counting.
    const goneDrop = dropGoneEmpty(TP_KEYS, k => TP_TO_STAGE[k],
      k => withT.some(({ t }) => t[k] && (t[k].i > 0 || t[k].o > 0 || t[k].w > 0)));
    // ...and it comes off the Stages dropdown too, so there is never a tick box that moves no number (#13).
    if (msHmTpStage) msHmTpStage.setHidden([...goneDrop].map(k => TP_LABELS[k]));
    // #122 (15 Sep 2026): the Stages dropdown replaced a row of 13 tick-boxes. Nothing picked = every stage.
    const stSel = msHmTpStage ? msHmTpStage.getSelected() : [];
    const visStages = TP_KEYS.filter(k => !goneDrop.has(k) && (!stSel.length || stSel.includes(TP_LABELS[k])));

    const shown = hideEmpty
      ? withT.filter(({ t }) => TP_KEYS.some(k => (t[k].i > 0 || t[k].o > 0)))
      : withT;

    const groups = {};
    shown.forEach(({ j, t }) => {
      if (!groups[j._dept]) groups[j._dept] = [];
      groups[j._dept].push({ job: j, t });
    });

    function aggTP(list) {
      const acc = {}; TP_KEYS.forEach(k => acc[k] = { i: 0, o: 0, w: 0 });
      acc.span = { i: 0, o: 0 }; acc.waiting = 0;
      list.forEach(({ t }) => {
        TP_KEYS.forEach(k => { acc[k].i += t[k].i; acc[k].o += t[k].o; acc[k].w += (t[k].w || 0); });
        acc.waiting += (t.waiting || 0);
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
        expandAll: expandAllOn('hmLevels'),   // #189d: was hard-coded true by #188

        overallLabel: A ? 'R1/OA → late' : 'R1 → Doc',
        labels: A ? undefined
          : { inN: 'entered the stage', outN: 'left the stage (any reason)', none: 'nobody entered this stage' }
      });
    // #210b (Jerin, 8 Oct 2026): people assessed in this period whose next step has not happened yet. They are
    // counted as assessed and NOT as progressed, so they pull every rate down. He chose to DISCLOSE them rather
    // than take them out of the sum - so this line states the number and the maths is untouched.
    const wEl = document.getElementById('hm2Waiting');
    if (wEl) {
      const nW = aggTP(allList).waiting || 0;
      wEl.textContent = nW
        ? `${nW.toLocaleString()} ${nW === 1 ? 'person' : 'people'} assessed in this period ${nW === 1 ? 'has' : 'have'} no decision yet. They count as assessed but not as moved on, so the rates above read slightly low.`
        : '';
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
          depts: () => gDept(),   // #196: already a list
          jobs: () => selJobs(),
          panelists: () => (msHmPanel ? msHmPanel.getSelected() : []),
          jobIds: () => openJobIds(),   // #125: only jobs with an opening opened in From–To
          range: () => ({ from: gFrom(), to: gTo() }),   // #120: Panelists follow From/To like every other panel here
          expandAll: () => expandAllOn('hmLevels')   // #189d: was hard-coded true by #188
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
    const jpQ = msHmJpQ ? msHmJpQ.getSelected() : [];   // #274: empty = All
    list = list.filter(c => {
      if (!okDept(c._dept)) return false;
      if (!okRec(c.recruiter)) return false;   // #196: a person's own recruiter (#192), not the position's owner
      if (!matchesJob(jobSel, c.jobId8)) return false;   // #172c
      if (!inDojFilter(c.doj, dojF)) return false;
      if (!inJpQuarter(c.openingQuarter, jpQ)) return false;   // #274: by the OPENING's quarter
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
      body.innerHTML = `<tr><td colspan="9" style="padding:1.5rem;text-align:center;color:var(--muted);font-size:0.75rem">Nobody is in Ref Check, Documentation or Offer for this filter.</td></tr>`;
      return;
    }
    // #149: the tree sorts itself — SOONEST first, because this list looks forward. Inside a date, by name.
    list.sort((a, b) => (a.candidate || '').localeCompare(b.candidate || ''));
    // #149 option A: month ➡ date ➡ people. Month and DOJ are headings now, so they come off the person rows;
    // Opening Quarter moves to the far right. `live` gives the date headings their "in 3 days / passed" line
    // and tags a month wholly in the past as Overdue in place (Jerin, 19 Sep — not moved to the bottom).
    body.innerHTML = monthTreeRows(list, {
      dayOf: c => c.doj,
      nameOf: c => c.candidate,
      cells: c => `${tdStage(c.subStage)}${tdRecruiter(c.recruiter)}${tdSourcer(c.sourcer)}${tdDept(c._dept)}${tdJob(c.job)}${tdOpening(c.openingId, topicLookup(data))}${tdTopic(c.openingId, c.jobId8, topicLookup(data))}${tdQuarter(c.openingQuarter)}`,
      cols: 9, order: 'soonest', live: true,   // #169 · #194: +Sourcer
      split: items => stageSplit(items, c => c.subStage),
    });
    pinMonthHeadings(body);
  }

  // ===== #273 (Jerin, 20 Oct 2026) — the drops table under the Joining Pipeline list =====
  // 🗣 *"the joining pending tabs to have a second table for drops at the botton, with the same columns"*
  // Same nine columns, same month tree, same cell renderers as the list above it — the two are read together,
  // so Rule 3 applies to them as a pair: a column added to one belongs on the other.
  // 🚨 "THE SAME COLUMNS" CANNOT BE LITERAL, and forcing it would break Rule 4. A drop has NO joining date and
  //    NO current stage, because the person left. So the first column is the DROP date — putting that date
  //    under a heading reading "Joining date" would be a date under the wrong label, which is the mistake that
  //    rule exists to stop — and Sub-stage reads a dash, with the reason on hover.
  // ⚠ ORDER: newest first. This list looks BACK, where the one above it looks forward (#149).
  // 🔑 The population is offerDropRows() — the 112 OFFER drops the site counts (#183c), never the 162 in the
  //    file. Same source as the Offer drop column on Position Fulfilment, so the two cannot disagree.
  function renderJPDrops() {
    const body = document.getElementById('hmDropBody');
    if (!body) return;
    const jobSel = selJobs();
    const dojF = dojFilterOf('hm');
    // ⚠ Rule 13: every control shown over this sub-tab has to move this table. The date boxes are the
    // sub-tab's only period control, so they are read against the DROP's own day — the date this table is
    // keyed by. A drop with no day at all (a pre-#129 data file) is kept rather than silently dropped.
      // 🚨 #127 / the Q3-only rule: the dashboard REPORTS FROM 2026-Q3 and nothing else on the site shows a
      // pre-Q3 figure, so this list is floored at REPORTING_START too. Without it the table opened on 112 rows
      // reaching back to 2025-Q2 — every one of them real, and every one of them outside the period the rest
      // of the page covers. The caption says where the list starts, so the number is never bare.
    const list = dropRows(data)
      .filter(e => !e.quarter || e.quarter >= REPORTING_START)
      .map(e => ({ ...e, job: e.jobTitle || '', _dept: deptOf(e.department || '') }))
      .filter(e => okDept(e._dept) && okRec(e.recruiter) && matchesJob(jobSel, e.jobId8))
      .filter(e => !e.doj || inDojFilter(e.doj, dojF))
      .filter(e => inJpQuarter(e.openingQuarter, msHmJpQ ? msHmJpQ.getSelected() : []));   // #274: the SAME control drives both tables   // #273a: the SAME field the list above filters on
    const capEl = document.getElementById('hmDropCaption');
    if (capEl) {
      const unlinked = list.filter(e => !e.openingId).length;
      capEl.innerHTML = list.length
        ? `<strong>${list.length}</strong> received an offer and then left${dojFilterText(dojF) ? ' ' + dojFilterText(dojF) : ''}, listed by the joining date they had been given. <strong>Dropped on</strong> is the day the drop is counted on. From ${REPORTING_START.replace('-', ' ')} onwards, like the rest of the dashboard.`
          + (unlinked ? ` <strong>${unlinked}</strong> have no opening attached.` : '')
        : '';
    }
    if (!list.length) {
      body.innerHTML = `<tr><td colspan="9" style="padding:1.5rem;text-align:center;color:var(--muted);font-size:0.75rem">Nobody with an offer has dropped out under these filters.</td></tr>`;
      return;
    }
    list.sort((a, b) => String(a.candidate || '').localeCompare(String(b.candidate || '')));
      // ===== #273a (Jerin, 20 Oct 2026) — the planned joining date is IN =====
      // 🗣 *"someone who dropped can have a planned doj. Let tgat be included"*
      // 🔑 That makes the table TRULY the same columns as the list above it: it is keyed by the PLANNED joining
      //    date, exactly as that list is, and the date boxes read against the same field on both. The column
      //    that cannot apply to a drop is Sub-stage — they left, so there is no stage — and THAT is the slot
      //    the drop date takes, as "Dropped on". Nothing got wider and nothing sits under the wrong heading.
      // 📏 All 112 drops carry a planned date (attachPlannedDoj_ in data.js), so the column is not sparse.
      // ⚠ The FLOOR stays on the drop's own quarter, not on the joining date: that is the quarter the Offer
      //    drop column counts it in, so the list and the number still reconcile.
    body.innerHTML = monthTreeRows(list, {
      dayOf: e => e.doj,
      nameOf: e => e.candidate,
      // `live: false` on purpose for BOTH dates: the countdown and the rose "date has passed, not moved to
      // Hired yet" signal are about someone still coming. Neither is true of a person who dropped out.
      cells: e => `${tdDoj(e.day, { live: false })}${tdRecruiter(e.recruiter)}${tdSourcer(e.sourcer)}${tdDept(e._dept)}${tdJob(e.job)}${tdOpening(e.openingId, topicLookup(data))}${tdTopic(e.openingId, e.jobId8, topicLookup(data))}${tdQuarter(e.openingQuarter || null)}`,
      cols: 9, order: 'soonest', live: false,
    });
    pinMonthHeadings(body);
  }

  // ===== #130c (Jerin, 15 Sep 2026): Joiners — one row per PERSON moved to Hired =====
  // The same test as every people-based Joined on the site (accepted offer AND moved to Hired), dated by START date inside From / To.
  // No earlier-quarter subtraction — like the Joining Pending list, it shows everyone and the Opening Quarter column says which is which.
  // 🚨 People, not positions: it will not equal the Joined column on Position Fulfilment, which counts positions filled (Rule 1).
  function renderJoiners() {
    const body = document.getElementById('hmJoinBody');
    if (!body) return;
    const jobSel = selJobs(), rg = hmRange();
    const list = (data.offerEvents || [])
      .filter(e => e.accepted && e.appStatus === 'Hired' && inRange(e.startDate, rg))
      .map(e => ({ ...e, _dept: deptOf(e.department || '') }))
      .filter(e => okDept(e._dept) && okRec(e.recruiter) && matchesJob(jobSel, e.jobId8));   // #172c · #196
    const capEl = document.getElementById('hmJoinCaption');
    if (capEl) {
      const unlinked = list.filter(e => !e.openingQuarter).length;
      capEl.innerHTML = list.length
        ? `<strong>${list.length}</strong> joined, ${rangeText(rg, hmQuarters())}.` + (unlinked ? ` <strong>${unlinked}</strong> have no opening attached.` : '')
        : '';
    }
    if (!list.length) {
      body.innerHTML = `<tr><td colspan="6" style="padding:1.5rem;text-align:center;color:var(--muted);font-size:0.75rem">Nobody joined between these dates for this filter.</td></tr>`;
      return;
    }
    // #149: NEWEST month first here — this list looks back, where Joining Pending looks forward.
    list.sort((a, b) => String(a.candidate || '').localeCompare(String(b.candidate || '')));
    // #149 option A. No sub-stage split: everyone on this list is Hired, which is one stage.
    // #213 (Jerin, 8 Oct 2026): Department > exact day > Role > the people. Department and Job are headings
    // now, so they come off the person rows — eight columns become six, the same trade #149 made.
    body.innerHTML = deptTreeRows(list, {
      deptOf: e => e._dept,
      dayOf: e => e.startDate,
      roleOf: e => e.jobTitle,
      dropLoneRole: true,   // #213 option B: a day with one role shows it on the date line instead of its own row
      nameOf: e => e.candidate,
      cells: e => `${tdRecruiter(e.recruiter, e.startDate)}${tdSourcer(e.sourcer)}${tdTopic(e.openingId, e.jobId8, topicLookup(data))}${tdQuarter(e.openingQuarter, e.startDate)}${tdOpening(e.openingId, topicLookup(data))}`,
      cols: 6, order: 'newest',   // #169 · #194: +Sourcer
    });
    pinMonthHeadings(body);
  }

  // ===== Section 3: Current Pipeline (Department -> Job tree) =====
  function renderPipeline() {
    const jobSel = selJobs();
    const hideEmpty = document.getElementById('hm3HideEmpty')?.checked;

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
    // Split in two (#240d E): everything that does not depend on which stages are shown, then the stage
    // test. The gone-stage decision has to be made from the rows in scope, so it cannot sit after a filter
    // that itself reads the stage list.
    const inScope = jobs.filter(j => {
      if (!okDept(j._dept)) return false;
      if (!matchesJob(jobSel, j.id)) return false;   // #172c
      if (!j.pipeline) return false;
      // #120: with a period set, a job needs an opening in it. An EMPTY set used to mean "list every job".
      if ((gFrom() || gTo()) && !openTitles.has(j.title)) return false;
      return true;
    });
    // #240d E: this panel is a LIVE snapshot, so "has data" means somebody is standing in the stage right
    // now — which, for a stage Ashby has deleted, is normally nobody, so it drops out here first.
    const goneDrop = dropGoneEmpty(STAGES_ORDER, k => k, k => inScope.some(j => (j.pipeline[k] || 0) > 0));
    if (msHmPipeStage) msHmPipeStage.setHidden([...goneDrop].map(k => STAGE_LABELS[k]));
    // #128: nothing picked in the Stages dropdown = every stage, as on Throughput.
    const stPick = msHmPipeStage ? msHmPipeStage.getSelected() : [];
    const visStages = STAGES_ORDER.filter(k => !goneDrop.has(k) && (!stPick.length || stPick.includes(STAGE_LABELS[k])));
    const filtered = inScope
      .filter(j => !(hideEmpty && !visStages.some(k => (j.pipeline[k] || 0) > 0)))
      .sort(byDept);

    let hdr = '<tr><th>Department / Job</th><th class="c-num">Total</th>';   /* first column = the dept ➡ job tree, no family */
    visStages.forEach(s => { hdr += `<th class="c-num">${STAGE_LABELS[s]}</th>`; });
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

    // #189f: thousands separators, as the same table already had on Recruiter Efficiency. One table printed
    // 33742 here and 7,628 there - the figures differ for a good reason (see the definitions), the formatting
    // did not.
    function pipeCells(total, stages) {
      const n = (v) => v.toLocaleString();
      let s = `<td style="font-weight:600">${n(total)}</td>`;
      visStages.forEach(k => {
        const v = stages[k] || 0; let style = '';
        if (k === 'hired' && v > 0) style = ' class="good"';
        else if (k === 'offer' && v > 0) style = ' style="color:var(--blue);font-weight:600"';
        else if (v === 0) style = ' class="zero"';
        s += `<td${style}>${n(v)}</td>`;
      });
      return s;
    }

    let html = '';
    Object.keys(groups).sort().forEach((deptName, gi) => {
      const G = groups[deptName];
      html += `<tr class="dept-header" data-hold="1" data-g="${gi}" data-exp="0" style="cursor:pointer;background:var(--border-light)">
        <td style="font-weight:600">${CARET}${deptName}${cnt(G.jobs.length)}</td>${pipeCells(G.total, G.stages)}</tr>`;
      G.jobs.forEach(j => {
        html += `<tr class="leaf" data-g="${gi}" style="display:none">
          <td style="font-weight:500;max-width:18.75rem;padding-left:1.875rem">${j.title}</td>${pipeCells(j.total, j.pipeline)}</tr>`;
      });
    });
    html += `<tr class="totals-row"><td>Total</td>${pipeCells(grandTotal, stageTotalsAll)}</tr>`;
    const hm3Body = document.getElementById('hm3Body');
    hm3Body.innerHTML = html;
    wireTree(hm3Body, expandAllOn('hmLevels'));   // #189d: this tree has no recruiter or topic level, so it gets the tick
    shadePipeline(hm3Body);   // #137c
  }

  // ===== Sub-tab switching =====
  // Charts are built only when their panel is visible (Chart.js needs real dimensions),
  // so we (re)render the active panel on tab switch and on any global filter change.
  let activeTab = 'positions';
  function renderActive() {
    if (activeTab === 'positions') renderSection1();
    else if (activeTab === 'joiningpending') { renderJoiningPending(); renderJPDrops(); }   // #130b · #273
    else if (activeTab === 'joiners') renderJoiners();                 // #130c
    else if (activeTab === 'throughput') renderThroughput();
    else if (activeTab === 'pipeline') renderPipeline();
    else if (activeTab === 'traction') { if (renderTraction) renderTraction(); }   // #206
    else if (activeTab === 'typebudget') { if (renderTypeBudget) renderTypeBudget(); }   // #269
    else if (activeTab === 'panelists') renderPanelist();
  }
  function showTab(name) {
    activeTab = name;
    // #133: Joining Pending is live, so the period boxes give way to the DOJ boxes there. Expand all opens department trees, so it hides over
    // the two flat people lists, where it would move nothing (Rule 13).
    toggleJpFilters('hm', document.getElementById('hmPeriod'), name === 'joiningpending');
    showControl(document.getElementById('hmExpandWrap'), name !== 'joiningpending' && name !== 'joiners' && name !== 'traction');   // #206: no tree here
    // #207: Interview Traction carries its own Quarter chip, which ticks several. The page's single-pick
    // Quarter box would be a second, contradictory control, so it steps aside on that sub-tab only.
    // #227: ONE period control at a time - see the note on hmQuarters().
    const multiQ = chipGoverns(name);   // #243: ONE predicate - shown exactly where it is obeyed
    showControl(document.getElementById('hmQuartersWrap'), multiQ);
    showControl(document.getElementById('hmYear')?.closest('.fchip'), name === 'positions' || name === 'typebudget');   // #269
    showControl(document.getElementById('hmQuarter')?.closest('.fchip'), !multiQ && name !== 'traction');
    // #226 (Jerin, 13 Oct 2026, raised by the team): Rule 13 - a control shown where it moves nothing is a
    // bug. MEASURED by ticking each filter on each panel and checking whether any rendered number moved,
    // not read off the code. The Recruiter filter (#196) was wired into three panels and SHOWN on all of
    // them. Topic reaches every panel but the two below. [[project_quarter-scoping-audit]]
    showControl(document.getElementById('msHmRec')?.closest('.fchip'),
      name === 'positions' || name === 'joiners' || name === 'joiningpending');
    showControl(document.getElementById('msHmTopic')?.closest('.fchip'), name !== 'traction');
    // #207: the page re-bounds From / To from its OWN single Quarter after this panel mounts, which would
    // leave the dates stuck inside one quarter again. So the panel's span is applied when its sub-tab is
    // ENTERED, once, and the page's own bounds are put back the moment you leave - otherwise every other
    // panel on this tab would inherit a widened period, which is exactly what must not happen.
    if (name === 'traction') {
      if (tractionQs.length && !tractionBounds) {
        setDateBounds(document.getElementById('hmDateFrom'), document.getElementById('hmDateTo'), tractionQs, true);
        tractionBounds = true;
      }
    } else if (tractionBounds) {
      tractionBounds = false;
      applyYearQuarter();
    }
    // #189d: only Position Fulfilment has the job/recruiter/topic levels, so only it gets the chooser. Throughput,
    // Interview Pipeline and Panelists get the plain Expand all tick back - the rule the date boxes already follow.
    // #280: Type & Budget has its own levels (Job, Type) and asks for them from inside the module, as its
    // internal rail switches — the Budget panel has no Type level, so it must not offer the tick.
    showLevels('hmLevels', name === 'positions' ? ['job', 'rec', 'top'] : false);
    // #141d (Jerin, 17 Sep): Pipeline counts are live (#129) and its roles follow Year and Quarter, so From and To would move
    // nothing there — they hide (Rule 13).
    ['hmDateFrom', 'hmDateTo'].forEach(id => showControl(document.getElementById(id)?.closest('.fchip'), name !== 'pipeline'));
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
  wireLevels('hmLevels', renderActive);   // #188

  // ONE Job multi-select in the main filter bar, wired to renderActive so it reaches every sub-tab.
  msHmJob = makeMultiSelect(document.getElementById('msHmJob'), 'Job', jobOptions, renderActive);   // #172c: ids, not names
  // #213: Topic, right after Job and wired to the same renderActive, so it reaches every sub-tab.
  msHmTopic = makeMultiSelect(document.getElementById('msHmTopic'), 'Topic', topicOptions, renderActive);
  // #196 option B: Department is the same kind of chip now, so it costs 96px instead of 220.
  // ⚠ `allDepts` in renderHmReport is a DIFFERENT function's local. Built here the same way rather than
  //   reached for - a wider scope would be the sort of quiet coupling that breaks when either moves.
  const deptNames = [...new Set([...(data.openings || []), ...(data.jobs || [])].map(x => deptOf(x.department)))].filter(Boolean).sort();
  msHmDept = makeMultiSelect(document.getElementById('msHmDept'), 'Department', deptNames, renderActive);
  // #196: the Recruiter filter. The roster is everyone who can APPEAR as a recruiter on this tab - the owners
  // of the period's positions AND the recruiters of its people - so a name can never be offered with nothing
  // behind it, nor a row exist with no way to filter to it. `(recruiter not set)` is offered on purpose: it is
  // a real row, and filtering to it is how the team finds the positions still missing a recruiter in Ashby.
  const recNames = (() => {
    const set = new Set();
    (data.openingRows || []).forEach(r => (r.owners || []).forEach(o => o && set.add(o)));
    ['offerEvents', 'joiningPendingCases', 'dropEvents'].forEach(k => (data[k] || []).forEach(e => { if (e.recruiter) set.add(e.recruiter); }));
    const out = [...set].sort((a, b) => a.localeCompare(b));
    out.push(NO_RECRUITER);
    return out;
  })();
  msHmRec = makeMultiSelect(document.getElementById('msHmRec'), 'Recruiter', recNames, renderActive);
  // #227: the Quarters chip. Absolute quarter keys, so Year never enters into it - which is why Year and the
  // single Quarter box hide wherever this one shows.
  msHmQuarters = makeMultiSelect(document.getElementById('msHmQuarter'), 'Quarters',
    reportingQuarters().map(q => ({ v: q, t: q.replace('-', ' ') })), () => {
      const qs = msHmQuarters.getSelected();
      setDateBounds(document.getElementById('hmDateFrom'), document.getElementById('hmDateTo'),
        qs.length ? qs.slice().sort() : selectionQuarters(document.getElementById('hmYear')?.value || '',
                                                          document.getElementById('hmQuarter')?.value || ''), true);
      renderActive();
    }, [currentReportingQuarter()]);
  // Panelist names are the long tail here (hundreds of rows) — the shared multi-select gives
  // type-to-filter so nobody has to scroll to find a person.
  const panelistNames = [...new Set((data.panelists || []).map(p => p.name || p.panelist).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  msHmPanel = makeMultiSelect(document.getElementById('msHmPanel'), 'Panelist', panelistNames, renderPanelist);

  // #269 Type & Budget. Same contract as Interview Traction below: the page owns the filters, the shared
  // module owns the metric, so Hiring Manager and Overall Efficiency cannot drift (Rule 3).
  // 🔑 The `sel` object is the SAME one Position Fulfilment builds, so these rows close that table by
  //    construction rather than by a second sum.
  renderTypeBudget = mountTypeBudget(document.getElementById('hmTypeBudgetHost'), data, () => {
    const rg = hmRange(), winQs = windowQuarters();
    const jsel = msHmJob ? msHmJob.getSelected() : [];
    const dsel = msHmDept ? msHmDept.getSelected() : [];
    const ji = data.jobIndex || {};
    return {
      sel: { wholeWin: coversQuarters(rg, winQs), winQs, dayOK: hasDayData(data), inDay: (d) => inRange(d, rg) },
      levelsId: 'hmLevels',   // #280: the module reads the Job / Type ticks off this tab's own control
      jobOk: (j8) => {
        if (jsel.length && !jsel.some(id => String(id).slice(0, 8) === j8)) return false;
        if (dsel.length) { const meta = ji[j8]; if (!meta || dsel.indexOf(meta.department) < 0) return false; }
        return true;
      }
    };
  });

  // #206 Interview Traction. The page owns the filters, the module owns the metric - so the SAME render
  // runs here and on Overall Efficiency and the two can never drift (Rule 3).
  renderTraction = mountInterviewTraction(document.getElementById('hmTractionHost'), data, () => {
    // #207: this panel's period comes from ITS OWN Quarter chip, falling back to the page's single
    // Quarter box only before the chip has mounted.
    const rg = rangeOf(document.getElementById('hmDateFrom'), document.getElementById('hmDateTo'),
                       tractionQs.length ? tractionQs : hmQuarters());
    const jsel = msHmJob ? msHmJob.getSelected() : [];
    const dsel = msHmDept ? msHmDept.getSelected() : [];
    const ji = data.jobIndex || {};
    return {
      from: rg.from, to: rg.to,
      jobOk: (j8) => {
        if (jsel.length && !jsel.some(id => String(id).slice(0, 8) === j8)) return false;
        if (dsel.length) { const meta = ji[j8]; if (!meta || dsel.indexOf(meta.department) < 0) return false; }
        return true;
      }
    };
  }, {
    // #207: every quarter on offer, newest last. The panel ticks the last two by default and hands them
    // back here, so the page can re-bound its From / To inputs - which is what frees the dates from being
    // stuck inside one quarter.
    quarters: reportingQuarters(),
    onQuarters: (qs) => {
      tractionQs = qs;
      setDateBounds(document.getElementById('hmDateFrom'), document.getElementById('hmDateTo'), qs, true);
    }
  });
  document.addEventListener('click', closeMsPanels);
  // #133: the DOJ boxes in the filter row (shown on the Joining Pending sub-tab only)
  ['hmDojMonth', 'hmDojFrom', 'hmDojTo'].forEach(id => document.getElementById(id)?.addEventListener('change', () => { renderJoiningPending(); renderJPDrops(); }));   // #273: the date boxes move both tables
  // #274 (Jerin, 21 Oct 2026): the Quarter multi-select on the Joining Pipeline sub-tab. Options come from
  // the opening quarters actually present in BOTH tables, so it can never offer a quarter that filters to
  // nothing, and an unlinked row is its own option rather than being dropped. Empty = All, which is
  // makeMultiSelect's own convention and exactly the default he asked for.
  msHmJpQ = makeMultiSelect(document.getElementById('hmJpQ'), 'Quarter',
    jpQuarterOptions([data.joiningPendingCases, dropRows(data)]),
    () => { renderJoiningPending(); renderJPDrops(); });   // #274: one control, BOTH tables
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
  // #150: the saved remarks arrive on their own clock — the table draws immediately and fills them in when they land.
  loadNotes().then(() => { if (activeTab === 'positions') renderSection1(); });
}
