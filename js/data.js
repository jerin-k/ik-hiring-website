const LIVE_DATA_URL = 'https://raw.githubusercontent.com/jerin-k/ik-hiring-website/main/data/dashboard.json';
const LOCAL_DATA_URL = '/data/dashboard.json';
const LIVE_ROLLUPS_URL = 'https://raw.githubusercontent.com/jerin-k/ik-hiring-website/main/data/stage_rollups.json';
const LOCAL_ROLLUPS_URL = '/data/stage_rollups.json';

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
  // Stage-history rollups (true daily velocity + reached/cleared throughput). Best-effort — the UI
  // degrades gracefully to the snapshot approximation if this file isn't present yet.
  dashboardData.stageRollups = await loadStageRollups_();
  return dashboardData;
}

async function loadStageRollups_() {
  try { const r = await fetch(LIVE_ROLLUPS_URL); if (r.ok) return await r.json(); } catch (e) { /* optional */ }
  try { const r = await fetch(LOCAL_ROLLUPS_URL + '?t=' + Date.now()); if (r.ok) return await r.json(); } catch (e) { /* optional */ }
  return null;
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
      interviews: 0, feedbackSubmitted: 0, feedbackOnScheduled: 0, pendingFeedback: 0, turnN: 0, turnSumHrs: 0, byQuarter: {}, byMonth: {} };
    list.forEach(p => {
      ['interviews', 'feedbackSubmitted', 'feedbackOnScheduled', 'pendingFeedback', 'turnN', 'turnSumHrs'].forEach(f => { m[f] += p[f] || 0; });
      addMap(m.byQuarter, p.byQuarter); addMap(m.byMonth, p.byMonth);
    });
    m.avgTurnaroundHrs = m.turnN ? Math.round(m.turnSumHrs / m.turnN * 10) / 10 : null;
    return m;
  });
}

export function getData() {
  return dashboardData;
}

// #120b (Jerin, 14 Sep 2026): a Restricted user is scoped by DEPARTMENT alone — "we moved away from the Team construct long
// back" — and every figure follows it, not only the openings and jobs lists. Overview never comes through here.
export function getFilteredData(access) {
  if (!dashboardData) return null;
  const depts = access && access.filters && access.filters.departments;
  return scopeData(dashboardData, { departments: depts && depts.length ? depts : null });
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
  ['openingBuckets', 'openingPendingByJobQ', 'appReviewDwellByJob', 'interviewsByJobQ', 'interviewsByJobM'].forEach(k => { if (data[k]) out[k] = pickKeys(data[k]); });
  ['ownedSeatsByRecruiterQ', 'ownedSeatsBySourcerQ'].forEach(k => { if (!data[k]) return; out[k] = {};
    for (const name in data[k]) { out[k][name] = {}; for (const q in data[k][name]) out[k][name][q] = pickKeys(data[k][name][q]); } });
  if (data.ownedSeatsPairQ) { out.ownedSeatsPairQ = {}; for (const q in data.ownedSeatsPairQ) out.ownedSeatsPairQ[q] = pickKeys(data.ownedSeatsPairQ[q]); }

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
      if (!u) byUser.set(k, (u = { name: p.name, userId: p.userId, interviews: 0, feedbackSubmitted: 0, feedbackOnScheduled: 0, pendingFeedback: 0, turnN: 0, turnSumHrs: 0, byQuarter: {}, byMonth: {} }));
      ['interviews', 'feedbackSubmitted', 'feedbackOnScheduled', 'pendingFeedback', 'turnN', 'turnSumHrs'].forEach(f => { u[f] += p[f] || 0; });
      addNum(u.byQuarter, p.byQuarter || {}); addNum(u.byMonth, p.byMonth || {}); });
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

  // ---- stage-history rollups ----
  const sr = data.stageRollups;
  if (sr) {
    const s = { ...sr };
    for (const k in sr) {
      if (/ByRecruiterJobQ?$/.test(k)) s[k] = pickInner(sr[k]);
      else if (/ByJobQ?$/.test(k)) s[k] = pickKeys(sr[k]);
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
    out.stageRollups = s;
  }

  // A scope on top of a scope (a Restricted user's departments, then the Job filter) keeps both.
  const prev = data._scope || {};
  out._scope = { jobIds: jobSet ? [...jobSet] : (prev.jobIds || null), departments: deptList || prev.departments || null };
  out.scopeGaps = [...new Set([...(data.scopeGaps || []), ...gaps])];
  cache.set(cacheKey, out);
  return out;
}

export function getLastUpdated() {
  return dashboardData?.lastUpdated || null;
}
