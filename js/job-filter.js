import { inRange, REPORTING_START } from './period.js';   // #290d: peopleJobIds dates the people it admits
// ===== #172c (25 Sep 2026) — the Job filter, keyed by JOB ID =====
//
// 🚨 WHY THIS EXISTS. Every Job dropdown used to be a de-duplicated list of job NAMES, and every panel then
// filtered with `jobSel.includes(someRow.title)`. Two jobs can share a name: "Manager, CRM" is L3 in
// Marketing and L4 in Business - India. One entry therefore selected BOTH, and there was no way to pick one.
// The same name-matching cost us #172 (a person in closing priced a whole band low) and #173.
//
// 🔑 THE RULE (Jerin, 25 Sep 2026): *"Jobs shouldnt repeat unless it is in a different department. So, works."*
//    ➡ A repeated name is legitimate ONLY across departments, so the DEPARTMENT is what disambiguates it.
//    ➡ Option A, the one he picked: show the department ONLY where the name actually repeats. 119 of 125
//      entries read exactly as they did before; the six that need it gain a suffix.
//    ➡ The separator is a PIPE, not a dash (Jerin: *"can you use the pipe symbol instead of the hyphen?"*) —
//      several department names already contain a hyphen ("Business - India", "SME - India"), so a dash
//      separator put two different dashes in one label.
//
// ⚠ Two jobs sharing a name AND a department break his rule and are a DATA fault to fix in Ashby, not here.
//   They collapse to one entry that selects all of their ids, which is the honest rendering: the dashboard
//   cannot tell them apart because nothing distinguishes them. Known cases (all pre-2026, no live figures):
//   "Assistant Manager, Program Management" x2 in Business - India, "Sales Trainer" x3 in US Business.

const SEP = ' | ';

// Every job the dashboard knows, id ➡ { title, department }. `data.jobs` is the rich list but holds only
// jobs with applications in the current-year slice (124 of 334); `jobIndex` is the COMPLETE map and is what
// keeps a row named when its job has fallen out of the slice — the #173a fallback, already proven.
export function jobLookup(data) {
  const out = {};
  const ix = (data && data.jobIndex) || {};
  for (const id in ix) {
    const v = ix[id] || {};
    if (v.title) out[String(id).slice(0, 8)] = { title: v.title, dept: v.department || '' };
  }
  ((data && data.jobs) || []).forEach(j => {
    const id8 = String(j.id || '').slice(0, 8);
    if (id8 && j.title) out[id8] = { title: j.title, dept: j.department || '' };
  });
  return out;
}

// The label one job carries in a dropdown, given how many jobs share its name.
// `ambiguous` is the Set of titles that appear on more than one job id.
export function jobLabel(meta, ambiguous) {
  if (!meta || !meta.title) return '(untitled)';
  return (ambiguous && ambiguous.has(meta.title) && meta.dept)
    ? meta.title + SEP + meta.dept
    : meta.title;
}

// Build the options for a Job multi-select: [{ v: job8, t: label }], sorted by what the user reads.
// `ids` limits it to the jobs that panel can actually show — pass null for every job the dashboard knows.
// Ids with no entry in the lookup are dropped rather than rendered as "(untitled)": an option nobody can
// identify is worse than one fewer option, and `jobIndex` covers everything real.
export function jobFilterOptions(data, ids) {
  const look = jobLookup(data);
  const keys = ids ? [...ids].map(i => String(i).slice(0, 8)).filter(i => look[i]) : Object.keys(look);
  const byTitle = {};
  keys.forEach(i => { (byTitle[look[i].title] || (byTitle[look[i].title] = [])).push(i); });
  // A title is ambiguous when more than one job in THIS list carries it — not across the whole workspace,
  // or a panel showing one of the two "Manager, CRM" roles would tack on a department for no visible reason.
  const ambiguous = new Set(Object.keys(byTitle).filter(t => byTitle[t].length > 1));
  const seen = {};
  const opts = [];
  keys.forEach(i => {
    const t = jobLabel(look[i], ambiguous);
    // Same name AND same department — his rule broken. One entry, and it carries every id behind it so the
    // filter still selects all of them. `v` is a comma-joined list; matchesJob below understands it.
    if (seen[t] !== undefined) { opts[seen[t]].v += ',' + i; return; }
    seen[t] = opts.length;
    opts.push({ v: i, t });
  });
  return opts.sort((a, b) => a.t.localeCompare(b.t));
}

// Does a row belong to the current Job selection? `sel` is what getSelected() returns — job ids, possibly
// comma-joined where a name+department pair was genuinely indistinguishable. An empty selection means All.
// 🚨 Call this rather than `sel.includes(job8)`: the comma case would silently miss.
export function matchesJob(sel, job8) {
  if (!sel || !sel.length) return true;
  if (!job8) return false;
  const id = String(job8).slice(0, 8);
  for (let i = 0; i < sel.length; i++) {
    const s = sel[i];
    if (s === id) return true;
    if (s.indexOf(',') >= 0 && s.split(',').indexOf(id) >= 0) return true;
  }
  return false;
}

// A row that has no job id of its own — Overall Efficiency's "leftover" rows, which exist so that a person
// whose department+role has no entry in the job tree is never silently dropped (it once read 165 people
// against the Hiring Manager tab's 167). Those rows are identified by DEPARTMENT + TITLE and nothing else.
// Under Jerin's rule a job IS (title, department), so matching a selected id on both fields is exact rather
// than a fallback to bare name matching.
export function matchesJobDeptTitle(sel, data, dept, title) {
  if (!sel || !sel.length) return true;
  const look = jobLookup(data);
  const ids = [];
  sel.forEach(s => String(s).split(',').forEach(i => ids.push(i)));
  for (let i = 0; i < ids.length; i++) {
    const m = look[ids[i]];
    if (m && m.title === title && (m.dept || '') === (dept || '')) return true;
  }
  return false;
}

// The one call every panel should use for a job row: exact on the id when the row has one, and on
// department+title when it does not.
export function matchesJobRow(sel, data, jid, dept, title) {
  if (!sel || !sel.length) return true;
  if (jid) return matchesJob(sel, jid);
  return matchesJobDeptTitle(sel, data, dept, title);
}

// ===== #290d (Jerin, 3 Nov 2026) — THE JOBS A SUB-TAB CAN OFFER =====
//
// 🚨 WHY THIS EXISTS. Every Job dropdown was built ONCE, from every job with an application in the
// current-year slice, while the panels under it follow #125 and list only jobs with an opening OPENED in the
// period. Two rules over one control: on Q4 2026 the list offered 135 jobs where Momentum could draw 42, so
// long-closed roles crowded the search and the role you wanted was hard to find.
// 🗣 Jerin, 3 Nov 2026: "show anything with an active opening in th eperiod - regardless of whether there
//    is interview scheduled or now", on every sub-tab except Interview Traction and Joining Pipeline.
//
// ⚠ RULE 13'S MIRROR — A ROW NOBODY CAN FILTER TO. Withholding an option while the panel beside it still
//   DRAWS that job is the same defect the other way round, and three families of panel are deliberately NOT
//   #125-scoped. Each says so in its own words:
//     · Position Fulfilment ADDS a row for a role with people against it and no opening in the period —
//       "restricting to openings showed 88 of 166 pending people and hid 45 of SME - India's 46"
//       (hm-report.js, whose inScope() tests department and the Job pick, never the #125 set).
//     · Joiners and Joining Pipeline read offerEvents / joiningPendingCases straight, with no subtraction.
//     · Joining Conversion counts an earlier-quarter opening and Sourcing Mix counts EVERY joiner by settled
//       rule — both call deptJobs() WITHOUT its openedInPeriod flag, as that function's own comment records.
//   So those panels get the #125 set PLUS the jobs their own people bring inside the window.
//
// 🚨 AND THE PEOPLE MUST BE DATED. Measured on the live data, Q4 2026, 4 Nov 2026:
//      every job with an application this year ..... 135   ← what the dropdown used to offer
//      #125 openings in the period ................. 42    ← the activity panels
//      + people DATED to the window ................ 44    ← the position / people panels
//      + the same people with the dates taken out .. 113   ← hands the whole problem back
//   Two extra options, and both of them draw rows. An undated union is not a safer version of this rule: it
//   is the bug wearing the rule's clothes.
export function peopleJobIds(data, rg, per) {
  const out = new Set();
  const add = (id) => { if (id) out.add(String(id).slice(0, 8)); };
  const inQ = (q) => !!q && (!per || per.indexOf(q) >= 0);
  const day = (s) => (s ? String(s).slice(0, 10) : '');
  // An offer reaches a panel by the START date (Joiners, Sourcing Mix, the joiner list inside Fulfilment), by
  // the quarter it is attributed to (Joining Conversion's Offered) or by its OPENING's quarter (#203). Any one
  // of the three puts that job on screen, so any one of them has to keep its entry in the list.
  ((data && data.offerEvents) || []).forEach(e => {
    if (inRange(day(e.startDate), rg) || inRange(day(e.offerCreatedAt), rg)
      || inQ(e.attrQuarter) || inQ(e.openingQuarter)) add(e.jobId8);
  });
  // 🚨 Joining Pipeline is LIVE (#237) and ignores the date filter, so EVERY case counts whatever its DOJ.
  // openingQuarter is absent on most of them in any case, so there is nothing to date them by.
  ((data && data.joiningPendingCases) || []).forEach(c => add(c.jobId8));
  ((data && data.dropEvents) || []).forEach(e => { if (inRange(day(e.day), rg) || inQ(e.quarter)) add(e.jobId8); });
  return out;
}

// The sub-tabs whose panels can show a job with no opening in the period — the three families above. The tab
// KEYS differ by page (Hiring Manager calls its first tab `positions`, the other two `fulfilment`), so one set
// covers all three. Anything NOT in here gets the strict #125 set, which is the rule Jerin asked for.
export const PEOPLE_TABS = new Set(['positions', 'fulfilment', 'joiners', 'joiningpending', 'joining', 'sourcing']);

// ===== Joining Pipeline — HIS SECOND EXCEPTION, and the reason it needs one =====
// 🚨 BOTH of that sub-tab's tables are LIVE, so neither follows the period:
//   · the list above is everyone in closing whatever their DOJ (#237), and openingQuarter is absent on most
//     cases, so there is nothing to date them by even in principle;
//   · the drops table under it (#273) reads the DOJ boxes alone, floored at the reporting start (#127) —
//     `.filter(e => !e.quarter || e.quarter >= REPORTING_START)`, keeping a row with NO quarter rather than
//     cutting it. With those boxes empty it lists every offer drop since 2026-Q3.
// So this tab admits every job either table can name, UNDATED. Measured Q4 2026, 4 Nov: 42 strict ➔ 47 here
// (13 jobs with a case, 16 with a floored drop). This is what the dated union got wrong — it hid
// "Part Time Instructor - Data Analyst / Business Analyst", whose only records are Q2/Q3, while the drops
// table went on printing it.
export function livePeopleJobIds(data) {
  const out = new Set();
  const add = (id) => { if (id) out.add(String(id).slice(0, 8)); };
  ((data && data.joiningPendingCases) || []).forEach(c => add(c.jobId8));
  ((data && data.dropEvents) || []).forEach(e => { if (!e.quarter || e.quarter >= REPORTING_START) add(e.jobId8); });
  return out;
}
