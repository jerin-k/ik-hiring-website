import { adoptStageLists } from './stage-lists.js';   // #240b: the stage lists come from the pipeline
const LIVE_DATA_URL = 'https://raw.githubusercontent.com/jerin-k/ik-hiring-website/main/data/dashboard.json';
const LOCAL_DATA_URL = '/data/dashboard.json';
const LIVE_ROLLUPS_URL = 'https://raw.githubusercontent.com/jerin-k/ik-hiring-website/main/data/stage_rollups.json';
const LOCAL_ROLLUPS_URL = '/data/stage_rollups.json';
const LIVE_HIRE_LINKS_URL = 'https://raw.githubusercontent.com/jerin-k/ik-hiring-website/main/data/hire_links.json';   // #131
const LOCAL_HIRE_LINKS_URL = '/data/hire_links.json';
const LIVE_TRACTION_URL = 'https://raw.githubusercontent.com/jerin-k/ik-hiring-website/main/data/interview_traction.json';   // #206
const LOCAL_TRACTION_URL = '/data/interview_traction.json';

let dashboardData = null;

export async function loadDashboardData() {
  try {
    const res = await fetch(LIVE_DATA_URL);
    if (res.ok) dashboardData = await res.json();
  } catch (e) {
    console.warn('Live data fetch failed, using local fallback:', e.message);
  }
  if (!dashboardData) {
    const res = await fetch(LOCAL_DATA_URL + '?t=' + Date.now());
    dashboardData = await res.json();
  }
  // #120b: the pipeline keys panelist rows by JOB, and two jobs can share a title. Every page shows one row per
  // department + job title + panelist, so same-title rows are merged here; the per-job rows stay on panelistRows,
  // which is what a department scope narrows.
  dashboardData.panelistRows = dashboardData.panelists || [];
  dashboardData.panelists = mergePanelists(dashboardData.panelistRows);
  // #131 / #241: before anything reads offerEvents, make sure every record names the opening the person
  // really filled. Since #241 the PIPELINE has already done it and we just take its answer; an older
  // dashboard.json has not, and the browser merge below is what it gets.
  adoptHireLinks(dashboardData, await loadHireLinks_());
  // Stage-history rollups (true daily velocity + reached/cleared throughput). Best-effort — the UI
  // degrades gracefully to the snapshot approximation if this file isn't present yet.
  dashboardData.stageRollups = await loadStageRollups_();
  // #206 Interview Traction. Its own small file, written by the stage-history job rather than the main
  // refresh, which is already at the 30-minute ceiling (#204). Optional, like the two above: the panel
  // says so plainly if it is missing rather than drawing an empty chart.
  dashboardData.interviewTraction = await loadInterviewTraction_();
  // #240b: take the stage lists the pipeline published, BEFORE any page module renders. It lives here
  // rather than in app.js so every entry point gets it — opening-requests.js also loads data this way.
  // An older dashboard.json carries none and the built-in fallback stands; a malformed one is refused.
  adoptStageLists(dashboardData);
  return dashboardData;
}

async function loadStageRollups_() {
  try { const r = await fetch(LIVE_ROLLUPS_URL); if (r.ok) return await r.json(); } catch (e) { /* optional */ }
  try { const r = await fetch(LOCAL_ROLLUPS_URL + '?t=' + Date.now()); if (r.ok) return await r.json(); } catch (e) { /* optional */ }
  return null;
}

async function loadInterviewTraction_() {
  try { const r = await fetch(LIVE_TRACTION_URL); if (r.ok) return await r.json(); } catch (e) { /* optional */ }
  try { const r = await fetch(LOCAL_TRACTION_URL + '?t=' + Date.now()); if (r.ok) return await r.json(); } catch (e) { /* optional */ }
  return null;
}

async function loadHireLinks_() {
  try { const r = await fetch(LIVE_HIRE_LINKS_URL); if (r.ok) return await r.json(); } catch (e) { /* optional */ }
  try { const r = await fetch(LOCAL_HIRE_LINKS_URL + '?t=' + Date.now()); if (r.ok) return await r.json(); } catch (e) { /* optional */ }
  return null;
}

// ===== #241 (19 Oct 2026): ONE ANSWER FOR WHICH OPENING A PERSON FILLED =====
// Until #241 the browser did the merge below on every page load. The screen was right; the FILE was not —
// dashboard.json on its own said "no opening" for 40 joiners who all had one, and the first thing to read it
// without knowing that (the Q3 leadership pack, 18 Oct) produced a confident, wrong number. So the pipeline
// now resolves it once and publishes the answer on the records themselves, with `openingSource` saying where
// each one came from: 'offer' · 'hireLink' · 'none'.
//
// 🔑 THE PIPELINE RESOLVES, THE SITE READS — the same division as #240b's stage lists and CLAUDE.md rule 3
// ("the table computes, the chart reads"). Nothing below re-derives anything when the answer is published.
// ⚠ THE FALLBACK IS A REAL CODE PATH, not decoration: it is what any dashboard.json written before #241
// gets, and what everyone gets if the pipeline cannot read hire_links.json on a given run. The two must give
// the same answer, which is why applyHireLinks() now stamps `openingSource` too and writes the same 8-char
// opening id onto a Joining Pipeline case that HireLinks.gs does.

let hireLinksSrc = 'fallback';
/** 'published' once the pipeline's own resolution has been adopted, otherwise 'fallback'. For tests. */
export function hireLinksSource() { return hireLinksSrc; }

// 🚨 VALIDATE, DO NOT TRUST. A half-written resolution would not throw — it would quietly leave some people
// with no opening and look like a data outage. So it is adopted whole or not at all, and a refusal says why.
// The last test is the one that matters: the summary block can only be believed if the RECORDS actually
// carry the marker, which is the thing the summary claims was done.
function resolutionProblem(data) {
  const r = data && data.hireLinkResolution;
  if (!r || typeof r !== 'object') return 'no hireLinkResolution in dashboard.json';
  if (!(r.schema >= 1)) return 'schema is ' + JSON.stringify(r.schema);
  if (!Number.isFinite(r.applied) || r.applied < 0) return 'applied is ' + JSON.stringify(r.applied);
  if (!Number.isFinite(r.fromOffer) || !Number.isFinite(r.fromLink)) return 'fromOffer/fromLink missing';
  if (!Array.isArray(r.unusedLinks)) return 'unusedLinks is not a list';
  const OK = { offer: 1, hireLink: 1, none: 1 };
  const events = data.offerEvents || [];
  for (let i = 0; i < events.length; i++) {
    if (!OK[events[i].openingSource]) return 'offerEvents[' + i + '] has openingSource '
      + JSON.stringify(events[i].openingSource) + ' — the pipeline did not resolve every record';
  }
  const seen = events.filter(e => e.openingSource === 'hireLink').length;
  if (seen !== r.fromLink) return 'the summary says ' + r.fromLink + ' records came from hire_links.json but '
    + seen + ' are marked that way';
  return null;
}

/**
 * Take the pipeline's resolution if it is sound, otherwise merge the two sources here as before.
 * Called once by loadDashboardData() before any page renders. Returns 'published' or 'fallback'.
 */
export function adoptHireLinks(data, file) {
  const problem = resolutionProblem(data);
  if (problem) {
    // Silent on the ordinary case — a dashboard.json from before #241 simply has no resolution and the
    // browser merge is correct for it. Loud only when something IS there and is wrong: that is a pipeline
    // fault, and the screen is still right, so it must not pass unnoticed.
    if (data && data.hireLinkResolution) console.warn('#241: ignoring the published opening resolution and merging in the browser — ' + problem);
    applyHireLinks(data, file);
    hireLinksSrc = 'fallback';
    return hireLinksSrc;
  }
  const r = data.hireLinkResolution;
  data.hireLinks = { generatedAt: r.fileGeneratedAt || null, applied: r.applied,
                     unused: r.unusedLinks.slice(), source: 'published' };
  hireLinksSrc = 'published';
  return hireLinksSrc;
}

// ===== #131 / #132 (Jerin, 15 Sep 2026): the opening a person is really tied to =====
// The opening named on the OFFER is what the API gives the pipeline (offerEvents.openingId). Two more links are not in the API at all
// (#84): the opening picked at the Hired step — when it is picked there, the offer's box stays empty — and a person tied to an opening
// before they are hired. Ashby's own Openings screen shows both (hiredApplications / lockedApplications), so data/hire_links.json is read
// from it in the browser (recipe: reference_ashby-ui-automation, #131). On 15 Sep all 40 Q3 joiners reading "Not linked" were hired into
// a Filled opening (#131), and one Joining Pending person was tied to an Open one (#132).
// 🔑 A link fills ONLY a record that names no opening — an offer's own opening is never overwritten:
//    kind 'hire' → Hired offers, matched on candidate + job + start date; their Hired Missing Opening Link rows go.
//    kind 'lock' → Joining Pending cases, and a live offer for the same person if there is one, matched on candidate + job; a matching
//                  live offer leaves Offers Missing Opening Link.
// Every panel reading openingQuarter / linked then sees the real opening. A link that matches nothing is kept on data.hireLinks.unused,
// never guessed onto someone else.
export function applyHireLinks(data, file) {
  const links = (file && file.links) || [];
  data.hireLinks = { generatedAt: (file && file.generatedAt) || null, applied: 0, unused: [], source: 'fallback' };
  const person = (name, j8) => `${String(name || '').trim().toLowerCase()}|${j8 || ''}`;
  const hires = new Map(), locks = new Map();
  links.forEach(l => {
    if ((l.kind || 'hire') === 'lock') locks.set(person(l.candidate, l.jobId8), l);
    else hires.set(person(l.candidate, l.jobId8) + '|' + (l.startDate || ''), l);
  });
  const used = new Set(), cleared = new Set();
  (data.offerEvents || []).forEach(e => {
    if (e.openingId) { e.openingSource = 'offer'; return; }
    const p = person(e.candidate, e.jobId8);
    const l = e.appStatus === 'Hired' ? hires.get(p + '|' + (e.startDate || '')) : (e.appStatus === 'Active' ? locks.get(p) : null);
    if (!l) { e.openingSource = 'none'; return; }
    e.openingId = l.openingId;
    e.openingQuarter = l.openingQuarter;
    if (!e.openingIdAny) { e.openingIdAny = l.openingId; e.openingQuarterAny = l.openingQuarter; }
    e.openingVia = e.appStatus === 'Hired' ? 'hire' : 'lock';
    e.openingSource = 'hireLink';
    cleared.add(e.appStatus + '|' + p + '|' + (e.appStatus === 'Hired' ? (e.startDate || '') : ''));
    used.add(l);
    data.hireLinks.applied++;
  });
  (data.joiningPendingCases || []).forEach(c => {
    if (c.linked) { c.openingSource = 'offer'; return; }
    const l = locks.get(person(c.candidate, c.jobId8));
    if (!l) { c.openingSource = 'none'; return; }
    c.linked = true;
    // 8 characters, which is what this field carries everywhere else on a Joining Pipeline case (#161) and
    // what openingRows is keyed by. This wrote the full uuid until #241, which would have matched nothing on
    // the SME level; no live row has ever taken this branch, and HireLinks.gs in the pipeline agrees — the
    // published path and this fallback must never give different answers.
    c.openingId = String(l.openingId || '').substring(0, 8);
    c.openingQuarter = l.openingQuarter;
    c.openingVia = 'lock';
    c.openingSource = 'hireLink';
    used.add(l);
    data.hireLinks.applied++;
  });
  if (data.offerLinkGaps) data.offerLinkGaps = data.offerLinkGaps.filter(g =>
    !cleared.has(g.appStatus + '|' + person(g.candidate, g.jobId8) + '|' + (g.appStatus === 'Hired' ? (g.doj || '') : '')));
  data.hireLinks.unused = links.filter(l => !used.has(l)).map(l => l.candidate);
}

// One row per department + job title + panelist. A key held by a single row keeps that exact row object, so data that
// was already one row per title comes back unchanged. Turnaround re-averages from the summed hours when rows merge.
export function mergePanelists(rows) {
  const byKey = new Map();
  rows.forEach(p => {
    const k = [p.dept, p.jobTitle, p.userId || p.name].join('|');
    const list = byKey.get(k);
    if (list) list.push(p); else byKey.set(k, [p]);
  });
  const addMap = (into, from) => Object.keys(from || {}).forEach(x => { into[x] = (into[x] || 0) + from[x]; });
  return [...byKey.values()].map(list => {
    if (list.length === 1) return list[0];
    const m = { ...list[0], jobId8: null, jobIds8: list.map(p => p.jobId8).filter(Boolean),
      interviews: 0, feedbackSubmitted: 0, feedbackOnScheduled: 0, pendingFeedback: 0, turnN: 0, turnSumHrs: 0, byQuarter: {}, byMonth: {}, byDay: {} };
    list.forEach(p => {
      ['interviews', 'feedbackSubmitted', 'feedbackOnScheduled', 'pendingFeedback', 'turnN', 'turnSumHrs'].forEach(f => { m[f] += p[f] || 0; });
      addMap(m.byQuarter, p.byQuarter); addMap(m.byMonth, p.byMonth); addMap(m.byDay, p.byDay);   // byDay: #129
    });
    m.avgTurnaroundHrs = m.turnN ? Math.round(m.turnSumHrs / m.turnN * 10) / 10 : null;
    return m;
  });
}

// ===== #183c (Jerin, 27 Sep 2026): an OFFER DROP is someone who RECEIVED AN OFFER and then dropped out =====
// 🗣 "Both head & points should carry the same drop logic; else its a gap that will stay forever" — then "A, it is ...
//    everywhere". A position is recorded only on an OFFER, so only an offer drop can ever be priced; counting people who
//    left at Ref Check / Documentation before any offer (dropEvents source 'stage') made heads and points count different
//    people for good. So they are no longer drops ANYWHERE. This is the ONE home for the rule: the Hiring Manager, Recruiter
//    and Overall Efficiency tabs all read it (their old dropRows copies now delegate here), so the tabs cannot drift.
// The opening-request tool's "dropped out after an offer on this job" reminder (#110) reads it too. It briefly kept ALL late-stage
//    drops on the claim that someone who left at Ref Check frees a position; 🗣 Jerin: "How though?" - they never held one.
// ===== #273a (Jerin, 20 Oct 2026) — a dropped person HAS a planned joining date =====
// 🗣 *"someone who dropped can have a planned doj. Let tgat be included"* — and he is right: they had an offer,
// and an offer carries a start date. `dropEvents` does not emit one, but the offer record does, so it is
// attached HERE, in the one place the drop rule lives, rather than in three page modules that would drift.
// 📏 MEASURED 20 Oct 2026: all 112 offer drops reach an offer record on candidate + job, and ALL 112 carry a
//    start date. So this is not a best-effort enrichment — it resolves for every row.
// ⚠ FOUR of the 112 match more than one offer: the same person re-offered on the same job. The tie-break is
//    deliberate and ordered — the ARCHIVED offer first (that is the one that became the drop), then the most
//    recent offer, then the highest version. Never the first one found.
// 🚨 This joins on NAME + job, which this codebase normally forbids. It is safe ONLY because both arrays come
//    out of the SAME pipeline build, so the candidate string is identical by construction — it is not the
//    cross-system match that CLAUDE.md says to do on email. If dropEvents ever carries its own application id
//    or start date, use that and delete this.
function attachPlannedDoj_(drops, offers) {
  if (!drops.length || !offers || !offers.length) return drops;
  const by = new Map();
  offers.forEach(o => {
    const k = `${o.candidate || ''}|${o.jobId8 || ''}`;
    const l = by.get(k); if (l) l.push(o); else by.set(k, [o]);
  });
  const pick = (list) => {
    if (list.length === 1) return list[0];
    const arch = list.filter(o => o.appStatus === 'Archived');
    const pool = arch.length ? arch : list;
    return pool.slice().sort((a, b) =>
      String(b.offerCreatedAt || '').localeCompare(String(a.offerCreatedAt || '')) || ((b.verN || 0) - (a.verN || 0))
    )[0];
  };
  return drops.map(e => {
    if (e.doj) return e;   // the pipeline's own field wins the day it ever emits one
    const list = by.get(`${e.candidate || ''}|${e.jobId8 || ''}`);
    const o = list && list.length ? pick(list) : null;
    if (!o) return e;
    // #274: the OPENING QUARTER comes off the same offer record. dropEvents does not carry one, so the
    // "Opening quarter" column on the drops tables rendered a dash on EVERY row from #273 until this was
    // added — and the #274 Quarter filter has nothing to read without it. Measured: reachable for 9 of the
    // 14 shown, which is exactly the 9 that carry an openingId at all.
    var oq = o.openingQuarter || o.openingQuarterAny || null;
    return (o.startDate || oq)
      ? { ...e, doj: e.doj || o.startDate || null, dojFrom: 'offer',
          openingQuarter: e.openingQuarter || oq }
      : e;
  });
}

export function offerDropRows(data) {
  if (data.dropEvents && data.dropEvents.length) {
    return attachPlannedDoj_(data.dropEvents.filter(e => e.source === 'offer'), data.offerEvents);   // #273a
  }
  // Fallback for a data file older than the unified dropEvents list: the archived offers ARE the offer drops.
  return (data.offerEvents || [])
    .filter(e => e.appStatus === 'Archived')
    .map(e => ({ jobId8: e.jobId8, jobTitle: e.jobTitle, department: e.department, recruiter: e.recruiter,
                 level: e.level, complexity: e.complexity, quarter: e.attrQuarter, source: 'offer',
                 openingId: e.openingId || null, day: e.lateEntryAt || e.archivedAt || null,
                 doj: e.startDate || null, dojFrom: 'offer',
                 openingQuarter: e.openingQuarter || e.openingQuarterAny || null }));   // #273a doj · #274 opening quarter
}

// ===== #189f (28 Sep 2026): ONE definition of Joining Conversion =====
// (Joined + Joining pipeline) / Offered, as a whole percentage, or null when nobody reached an offer.
// It was written out SIX times - the table and two chart callbacks on each of Recruiter Efficiency and
// Overall Efficiency. Every copy agreed on the day the audit ran, which is exactly how this project has
// been bitten before: nothing fails when one of them is edited and the others are not (Rule 3).
// 🔑 Why it equals 1 - Offer drop / Offered: joinMaps define Offered as Joined + Joining pipeline + Offer
// drop, so the two forms are the same arithmetic. The definitions blocks say so, and this is where it is true.
export function joiningConversionPct(joined, pending, offered) {
  return offered > 0 ? Math.round(((joined + pending) / offered) * 100) : null;
}

export function getData() {
  return dashboardData;
}

// #120b (Jerin, 14 Sep 2026): a Restricted user is scoped by DEPARTMENT alone — "we moved away from the Team construct long
// back" — and every figure follows it, not only the openings and jobs lists. Overview never comes through here.
export function getFilteredData(access) {
  if (!dashboardData) return null;
  const f = (access && access.filters) || {};
  const depts = f.departments && f.departments.length ? f.departments : null;
  const jobs = f.jobs && f.jobs.length ? f.jobs : null;
  // #229: no roles picked ⇒ EXACTLY as before. Everyone scoped by department alone is untouched.
  if (!jobs) return scopeData(dashboardData, { departments: depts });
  return scopeData(dashboardData, { jobIds: resolveJobScope(dashboardData, depts, jobs) });
}

// #229 (Jerin, 13 Oct 2026): the rule is PER DEPARTMENT — 🗣 "no, shows all. / or, give me an all option.
// better". So: for every department the person may see, the roles picked IN THAT DEPARTMENT, or ALL of its
// roles when none are picked. With no department limit at all, the picked roles are the whole restriction.
// 🚨 Resolved to a flat job list HERE, on purpose, so scopeData keeps the single jobIds path that has been in
// production since #120a. Do NOT try to express this by handing scopeData both lists: it ANDs them, which
// blanks out any department that happens to have no picks — the wrong rule, and the one he corrected.
function resolveJobScope(data, depts, jobs) {
  const picked = new Set(jobs.map(j => String(j).slice(0, 8)));
  if (!depts) return [...picked];
  const deptOf = {};
  Object.keys(data.jobIndex || {}).forEach(j8 => { const d = (data.jobIndex[j8] || {}).department; if (d) deptOf[j8] = d; });
  (data.jobs || []).forEach(j => { const j8 = String(j.id || '').slice(0, 8); if (j8 && !deptOf[j8] && j.department) deptOf[j8] = j.department; });
  const allow = new Set();
  depts.forEach(d => {
    const inDept = Object.keys(deptOf).filter(j8 => deptOf[j8] === d);
    const mine = inDept.filter(j8 => picked.has(j8));
    (mine.length ? mine : inDept).forEach(j8 => allow.add(j8));
  });
  return [...allow];
}

// ===== #120a / #120b (14 Sep 2026): ONE function narrows the data to a set of jobs and/or departments =====
// The Recruiter tab's Job filter (120a) and a Restricted user's departments (120b) both come through here, so every figure on
// Hiring Manager, Recruiter Efficiency, Overall Efficiency and Panelists follows one rule.
// 🔑 No jobs and no departments ⇒ the SAME object back, so an unscoped view cannot change.
// 🔑 A per-recruiter or company-wide figure is REBUILT from its per-job version. If the file has no per-job version (it predates
//    the 14 Sep pipeline change) the figure becomes null and is named in scopeGaps — never the unscoped number.
// 🔑 A store present in the input stays present (possibly empty), because pages test for presence to pick their basis.
const scopeCache = new WeakMap();
export function scopeData(data, { jobIds = null, departments = null } = {}) {
  if (!data) return data;
  const jobSet = jobIds && [...jobIds].length ? new Set([...jobIds].map(j => String(j).slice(0, 8))) : null;
  const deptList = departments && departments.length ? [...departments] : null;
  if (!jobSet && !deptList) return data;
  const cacheKey = JSON.stringify([jobSet ? [...jobSet].sort() : null, deptList ? deptList.slice().sort() : null]);
  let cache = scopeCache.get(data);
  if (!cache) scopeCache.set(data, (cache = new Map()));
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  // Department and title of every job the file mentions. jobIndex (pipeline, 14 Sep) is complete; the rest fill in for older files.
  const deptOf = {}, titleOf = {};
  const note = (j, dept, title) => { const j8 = j ? String(j).slice(0, 8) : ''; if (!j8) return;
    if (dept && !deptOf[j8]) deptOf[j8] = dept; if (title && !titleOf[j8]) titleOf[j8] = title; };
  Object.keys(data.jobIndex || {}).forEach(j8 => note(j8, data.jobIndex[j8].department, data.jobIndex[j8].title));
  (data.jobs || []).forEach(j => note(j.id, j.department, j.title));
  Object.keys(data.openingBuckets || {}).forEach(j8 => note(j8, data.openingBuckets[j8].department, data.openingBuckets[j8].title));
  (data.openingsNoDate || []).forEach(o => note(o.jobId8, o.department, o.title));
  (data.recruiters || []).forEach(r => (r.byJob || []).forEach(b => note(b.jobId, b.department, b.title)));
  (data.offerEvents || []).concat(data.dropEvents || []).forEach(e => note(e.jobId8, e.department, e.jobTitle));

  const allow8 = (j) => { const j8 = j ? String(j).slice(0, 8) : '';
    return !!j8 && (!jobSet || jobSet.has(j8)) && (!deptList || deptList.includes(deptOf[j8])); };
  // A row with no job id (a file from before 14 Sep) falls back to its department and job title.
  const titles = jobSet ? new Set([...jobSet].map(j8 => titleOf[j8]).filter(Boolean)) : null;
  const allowRow = (j8, dept, title) => j8 ? allow8(j8) : ((!deptList || deptList.includes(dept)) && (!titles || titles.has(title)));
  const pickKeys = (o) => { if (!o) return o; const r = {}; for (const k in o) if (allow8(k)) r[k] = o[k]; return r; };
  const pickInner = (o) => { if (!o) return o; const r = {}; for (const k in o) r[k] = pickKeys(o[k]); return r; };
  const addNum = (into, from) => { for (const k in from) { const v = from[k];
    if (typeof v === 'number') into[k] = (into[k] || 0) + v;
    else if (v && typeof v === 'object') addNum(into[k] || (into[k] = {}), v); } return into; };
  // {name: {job8: X}} → {name: X summed over the allowed jobs}. dropQuarter folds away the quarter level under each stage,
  // which is how an all-time store is rebuilt from its per-quarter twin (the all-time figure is the sum of its quarters).
  const sumJobs = (twin, dropQuarter) => { const r = {};
    for (const name in twin) { let acc = null;
      for (const j8 in twin[name]) if (allow8(j8)) acc = addNum(acc || {}, twin[name][j8]);
      if (!acc) continue;
      if (dropQuarter) { const flat = {}; for (const st in acc) { flat[st] = {}; for (const q in acc[st]) addNum(flat[st], acc[st][q]); } acc = flat; }
      r[name] = acc; }
    return r; };
  const gaps = [];
  const out = { ...data };
  const filt = (k, fn) => { if (Array.isArray(data[k])) out[k] = data[k].filter(fn); };

  // ---- records that carry their own job ----
  if (data.jobIndex) out.jobIndex = pickKeys(data.jobIndex);
  filt('jobs', j => allow8(j.id));
  filt('openings', o => allowRow(o.jobId, o.department, o.title));
  filt('openingsNoDate', o => allowRow(o.jobId8, o.department, o.title));
  filt('offerEvents', e => allowRow(e.jobId8, e.department, e.jobTitle));
  filt('dropEvents', e => allowRow(e.jobId8, e.department, e.jobTitle));
  filt('joiningPendingCases', e => allowRow(e.jobId8, e.department, e.job));
  filt('offerLinkGaps', e => allowRow(e.jobId8, e.department, e.job));
  ['openingBuckets', 'openingPendingByJobQ', 'appReviewDwellByJob', 'interviewsByJobQ', 'interviewsByJobM', 'interviewsByJobD'].forEach(k => { if (data[k]) out[k] = pickKeys(data[k]); });
  ['ownedSeatsByRecruiterQ', 'ownedSeatsBySourcerQ'].forEach(k => { if (!data[k]) return; out[k] = {};
    for (const name in data[k]) { out[k][name] = {}; for (const q in data[k][name]) out[k][name][q] = pickKeys(data[k][name][q]); } });
  // ownedSeatsPairD (#129) is the same shape keyed by the day an opening opened instead of its quarter.
  ['ownedSeatsPairQ', 'ownedSeatsPairD'].forEach(k => { if (!data[k]) return; out[k] = {};
    for (const q in data[k]) out[k][q] = pickKeys(data[k][q]); });

  // ---- per-recruiter figures, rebuilt from their per-job rows ----
  if (data.recruiters) out.recruiters = data.recruiters.map(r => {
    const byJob = (r.byJob || []).filter(b => allow8(b.jobId));
    const sum = (f) => byJob.reduce((s, b) => s + (b[f] || 0), 0);
    return { ...r, byJob, total: sum('total'), offer: sum('offer'), hired: sum('hired'),
      srcByJob: pickKeys(r.srcByJob), srcByJobQ: pickKeys(r.srcByJobQ) };
  });
  if (data.dataQuality) {
    const dq = data.dataQuality, ua = (out.recruiters || []).find(r => r.name === 'Unassigned');
    out.dataQuality = { ...dq,
      unassigned: (dq.unassigned || []).filter(x => allow8(x.job8)),
      multiRecruiter: (dq.multiRecruiter || []).filter(x => allow8(x.job8)),
      multiSourcer: (dq.multiSourcer || []).filter(x => allow8(x.job8)),
      // #241: joiners whose opening is in neither place. Carries its own job, so it narrows like any other row.
      joinersNoOpening: (dq.joinersNoOpening || []).filter(x => allowRow(x.jobId8, x.department, x.job)),
      unassignedTotal: ua ? ua.total : 0,
      unmappedStages: {} };   // a stage name Ashby sends that we do not recognise carries no job, so it cannot be placed
  }
  if ('appReviewDwellByRecruiter' in data) {
    if (data.appReviewDwellByRecruiterJob) {
      out.appReviewDwellByRecruiterJob = pickInner(data.appReviewDwellByRecruiterJob);
      out.appReviewDwellByRecruiter = sumJobs(data.appReviewDwellByRecruiterJob);
    } else { out.appReviewDwellByRecruiter = null; gaps.push('appReviewDwellByRecruiter'); }
  }

  // ---- panelists: the per-job rows narrow; each person's totals are added back up from what is left ----
  const allRows = data.panelistRows || data.panelists || [];
  const pRows = allRows.filter(p => allowRow(p.jobId8, p.dept, p.jobTitle));
  out.panelistRows = pRows;
  out.panelists = mergePanelists(pRows);
  if (data.interviewers) {
    const perJob = allRows.some(p => 'pendingFeedback' in p);   // feedback and turnaround per job exist from 14 Sep
    const byUser = new Map();
    pRows.forEach(p => { const k = p.userId || p.name; let u = byUser.get(k);
      if (!u) byUser.set(k, (u = { name: p.name, userId: p.userId, interviews: 0, feedbackSubmitted: 0, feedbackOnScheduled: 0, pendingFeedback: 0, turnN: 0, turnSumHrs: 0, byQuarter: {}, byMonth: {}, byDay: {} }));
      ['interviews', 'feedbackSubmitted', 'feedbackOnScheduled', 'pendingFeedback', 'turnN', 'turnSumHrs'].forEach(f => { u[f] += p[f] || 0; });
      addNum(u.byQuarter, p.byQuarter || {}); addNum(u.byMonth, p.byMonth || {}); addNum(u.byDay, p.byDay || {}); });
    out.interviewers = [...byUser.values()].map(u => ({ ...u,
        pendingFeedback: perJob ? u.pendingFeedback : null,
        avgTurnaroundHrs: perJob && u.turnN ? Math.round(u.turnSumHrs / u.turnN * 10) / 10 : null }))
      .sort((a, b) => b.interviews - a.interviews);
    if (!perJob) gaps.push('interviewers');
  }
  if ('interviewsByQuarter' in data) {
    if (data.interviewsByJobQ) {
      const q = {}, m = {};
      for (const j8 in data.interviewsByJobQ) if (allow8(j8)) addNum(q, data.interviewsByJobQ[j8]);
      for (const j8 in (data.interviewsByJobM || {})) if (allow8(j8)) addNum(m, data.interviewsByJobM[j8]);
      out.interviewsByQuarter = q; out.interviewsByMonth = m;
      out.totalInterviews = Object.values(q).reduce((s, n) => s + n, 0);
    } else { out.interviewsByQuarter = null; out.interviewsByMonth = null; out.totalInterviews = null; gaps.push('interviewsByQuarter'); }
  }
  // #129: the company-wide interviews per DAY, rebuilt the same way from its per-job twin.
  if ('interviewsByDay' in data) {
    if (data.interviewsByJobD) {
      const d = {};
      for (const j8 in data.interviewsByJobD) if (allow8(j8)) addNum(d, data.interviewsByJobD[j8]);
      out.interviewsByDay = d;
    } else { out.interviewsByDay = null; gaps.push('interviewsByDay'); }
  }

  // ---- stage-history rollups ----
  // #129: the DAY twins (…ByJobD, …ByRecruiterJobD) narrow exactly like the quarter stores.
  const sr = data.stageRollups;
  if (sr) {
    const s = { ...sr };
    for (const k in sr) {
      if (/ByRecruiterJob[QD]?$/.test(k)) s[k] = pickInner(sr[k]);
      else if (/ByJob[QD]?$/.test(k)) s[k] = pickKeys(sr[k]);
    }
    const rebuild = (target, twin, dropQuarter) => { if (!(target in sr)) return;
      if (sr[twin]) s[target] = sumJobs(sr[twin], dropQuarter); else { s[target] = null; gaps.push(target); } };
    rebuild('tofuByRecruiter', 'tofuByRecruiterJob');
    rebuild('r1ByRecruiter', 'r1ByRecruiterJob');
    rebuild('velocityByRecruiter', 'velocityByRecruiterJob');
    rebuild('throughputByRecruiterQ', 'throughputByRecruiterJob');
    rebuild('throughputByRecruiter', 'throughputByRecruiterJob', true);
    rebuild('timeInStageByRecruiterQ', 'timeInStageByRecruiterJobQ');
    rebuild('timeInStageByRecruiter', 'timeInStageByRecruiterJobQ', true);
    rebuild('waitingByRecruiterQ', 'waitingByRecruiterJobQ');
    rebuild('waitingByRecruiter', 'waitingByRecruiterJobQ', true);
    rebuild('r1ByRecruiterD', 'r1ByRecruiterJobD');                   // #129 day twins
    rebuild('timeInStageByRecruiterD', 'timeInStageByRecruiterJobD');
    rebuild('waitingByRecruiterD', 'waitingByRecruiterJobD');
    out.stageRollups = s;
  }

  // A scope on top of a scope (a Restricted user's departments, then the Job filter) keeps both.
  const prev = data._scope || {};
  out._scope = { jobIds: jobSet ? [...jobSet] : (prev.jobIds || null), departments: deptList || prev.departments || null };
  out.scopeGaps = [...new Set([...(data.scopeGaps || []), ...gaps])];
  cache.set(cacheKey, out);
  return out;
}

// ===== #125 (Jerin, 15 Sep 2026): "we dont work on any job with an opening open date in the previous quarter" =====
// Momentum, Screening Efficiency, Throughput, Time in Process and Panelists list only jobs with an opening OPENED in the period; a
// previous-quarter opening still counts in Joining Pending and Joining Conversion. quarterOk('YYYY-QN') says whether a quarter is inside
// the period. An opening with no opened date is not in openingBuckets, so it never qualifies (Data Hygiene lists it).
export function jobsWithOpeningIn(data, quarterOk) {
  const out = new Set();
  const ob = (data && data.openingBuckets) || {};
  for (const j8 in ob) {
    const qs = ob[j8].quarters || {};
    for (const q in qs) if ((qs[q].total || 0) > 0 && quarterOk(q)) { out.add(String(j8).slice(0, 8)); break; }
  }
  return out;
}
// The same set as a data scope. No quarterOk (no period) ⇒ the data unchanged. A period with no openings ⇒ no jobs at all — never
// "every job", which is what an empty set means to scopeData (the #120 lesson).
export function scopeToOpenings(data, quarterOk) {
  if (!data || !quarterOk) return data;
  const ids = jobsWithOpeningIn(data, quarterOk);
  return scopeData(data, { jobIds: ids.size ? ids : ['#noopen#'] });
}

export function getLastUpdated() {
  return dashboardData?.lastUpdated || null;
}

// #233 (Jerin, 14 Oct 2026) — THE SECOND CLOCK THE HEADER NEEDS.
// `dashboard.json` and the stage-history files are written by TWO DIFFERENT JOBS on their own schedules
// (`refreshDashboardData` ~6 AM / 1 PM / 6 PM IST, `refreshStageHistory` 07:30 / 14:30 / 19:30 IST), so one
// timestamp cannot speak for both. He read the header at 1:35pm, saw it fresh, and reasonably concluded
// Momentum had moved when it had not — measured that afternoon at 13:35 against 00:27, nearly 13 hours apart.
// Returns the OLDER of the two stage-history files so the figure can never OVERSTATE how fresh they are. They
// are minutes apart in practice (one run writes both), and null when neither loaded, so the caller stays silent.
// ⚠ EITHER FILE CAN BE THE NEWER ONE — a stage run lands on both sides of the main refresh through the day,
// so nothing built on this may say "behind" or "ahead".
export function getStageDataTime() {
  const a = dashboardData?.stageRollups?.generatedAt || null;
  const b = dashboardData?.interviewTraction?.generatedAt || null;
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;        // ISO-8601 strings compare correctly as strings
}

// ===== #182f (Jerin, 27 Sep 2026): ONE Joining Pending rule, read by the Hiring Manager tab AND the Overview =====
// 🗣 "use the HM logic for Overview. Thats what was always supposed to be done."
// 🚨 WHY THIS EXISTS: `dashboard.json` carries TWO Joining Pending figures on purpose, and the pipeline says so
//    itself — `joiningPendingCases[]` is every PERSON in Ref Check / Documentation / Offer, while
//    `openingPendingByJobQ` is POSITIONS with a live linked offer. They are different UNITS (CLAUDE.md Rule 1),
//    so they disagree three ways: a person whose offer names no opening cannot appear in the positions count at
//    all; one position holding two people in closing counts ONCE; and a position can carry a live offer while
//    nobody sits in those three stages. On 27 Sep that read 14 people against 12 positions.
// 🚨 The Overview showed the POSITIONS number under the words "joining pending" for a few hours on 27 Sep
//    (#182e). That was wrong — the label reads as people, and its Delta subtracts it exactly as the Hiring
//    Manager tab does. Both tabs now come through here, so the two can never drift again.
// 🔑 THE RULE ITSELF: every case counts, MINUS anyone whose opening belongs to an EARLIER quarter than the
//    period being shown (Jerin, 22 Aug 2026) — their offer is last quarter's demand still in flight, and
//    counting it again would inflate every quarter. A case with NO opening stays in: there is nothing to judge
//    it by, and most cases have no opening.
export function jpCaseInPeriod(c, fromQuarter, toQuarter) {
  if (!c) return false;
  // No opening attached: nothing to judge them by, so they stay. That was the Aug 2026 call and it still holds -
  // 8 of the 21 people in closing have no opening (15 Oct 2026), and filing them by quarter would hide them.
  if (!c.openingQuarter) return true;
  // An EARLIER opening is last quarter's demand still in flight. Real, but not this quarter's, so it is excluded.
  if (fromQuarter && fromQuarter !== '—' && c.openingQuarter < fromQuarter) return false;
  // #237 (Jerin, 15 Oct 2026) - THE OTHER HALF, WHICH WAS NEVER WRITTEN.
  // 🗣 "Q3 cannot have someone who was closed in an opening from a future quarter. That will be time
  // traveling - hence illogical." · "any quarter cannot have that."
  // 🔑 The asymmetry is deliberate and is NOT a bug: an older position filled late is an ordinary thing, so it
  // is excluded only to keep it off this quarter's demand. A LATER position filled early is IMPOSSIBLE - nothing
  // can fill a position before it is opened. Hence one rule each way, for different reasons.
  if (toQuarter && toQuarter !== '—' && c.openingQuarter > toQuarter) return false;
  return true;
}

// The people in closing for a period, counted once each and grouped by DEPARTMENT.
// `fromQuarter` is the first quarter of the period on screen ('2026-Q3', or '2026-Q1' for a whole year).
// ⚠ Department comes straight off the case, which is already the PARENT department — see CLAUDE.md
//   "Read `job.department` directly"; dept-map.js is a no-op and must not be reintroduced here.
export function joiningPendingByDept(data, fromQuarter, toQuarter) {
  const byDept = {};
  let total = 0;
  ((data && data.joiningPendingCases) || []).forEach(c => {
    if (!jpCaseInPeriod(c, fromQuarter, toQuarter)) return;   // #237
    const dept = c.department || 'Unknown';
    byDept[dept] = (byDept[dept] || 0) + 1;
    total += 1;
  });
  return { total, byDept };
}
