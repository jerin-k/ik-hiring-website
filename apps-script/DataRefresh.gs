// ===== ASHBY API DATA PIPELINE (v4, 2026-08-09) =====
// v4 (recon v5): pull the CURRENT-YEAR slice directly via createdAfter — one stateless pass, no bootstrap/cursor/syncToken.
//   KEY: application.list accepts createdAfter as a UNIX-MILLISECOND timestamp (ISO string -> invalid_input; seconds -> ignored).
//   So application.list?createdAfter=<Jan-1-<year> ms> returns only this year's apps (~52K for 2026), oldest-first, 100/page.
// Emits the rich grain the redesigned UI needs:
//   - recruiter × job × stage (byJob) + per-stage counts + sources. (Daily velocity dropped 2026-08-11 — superseded by stage_rollups.json's true enteredStageAt buckets; frontend reads velocityByRecruiter/velocityByJob.)
//   - job Level/Complexity from customFields; frontend Metric Config derives family/score
//   - offer.list pass -> offered/hired/joiningPending (Accepted + future startDate), joined via appId->{job,recruiter}
//   - department parent-fix (department.list hierarchy) so department != team
// Future speed-up (only if a run ever exceeds ~25min as the year fills): layer syncToken deltas or a rolling window.

var ASHBY_API_BASE = 'https://api.ashbyhq.com';
var DASHBOARD_FOLDER_ID = '1z6tU6QhZQ_50V7oyqlprwpl8kpS4LHmI';  // restored 5 Sep: deployed copy had lost it -> pipeline crashed in saveDriveJson_
var SCOPE_YEAR = Math.max(new Date().getFullYear(), 2026);
var SCOPE_FROM_MS = new Date(SCOPE_YEAR + '-01-01T00:00:00.000Z').getTime();   // createdAfter value (Unix ms)
var VELOCITY_DAYS = 35;
var TIMEOUT_MS = 1500000;                            // 25-min safety cutoff (trigger allows 30)
// #13 (Jerin, 14 Sep 2026): Data Hygiene's Unassigned / Multiple Recruiters / Multiple Sourcers lists keep only applications
// ADDED, INTERVIEWED or ASSESSED on or after this day. FIXED on purpose, not the quarter picker - Jerin: Q3 misses must stay
// visible after Q4 starts. Midnight India time, like every other date the team works in.
var HYGIENE_FLOOR = '2026-07-01';
var HYGIENE_FLOOR_MS = new Date(HYGIENE_FLOOR + 'T00:00:00+05:30').getTime();
var LEVEL_CF_ID = '4d1ff143-8066-4601-9492-9c8ac126e7ff';
var COMPLEXITY_CF_ID = '883e744b-30c9-400d-9ec6-85adf401d3e0';

var STAGE_KEY_MAP = {
  'App Review': 'appReview', 'Application Review': 'appReview',
  // 'Hello Christy' is a bot-driven ALTERNATIVE to TA Screen, not a test stage (confirmed by the user
  // 2026-08-21). It gets its own key rather than being folded into taScreen, so bot-screened and
  // human-screened volume stay separable. It sits immediately BEFORE taScreen everywhere.
  'Hello Christy': 'helloChristy',
  'TA Screen': 'taScreen', 'HM Review': 'hmReview',
  // Ashby's stage is titled 'Online Assessment' (verified against the Global Shared Interview Plan,
  // which every job in every department uses). The map previously had ONLY 'OA', so every Online
  // Assessment record fell through and the dashboard reported 0 assessments for months while real
  // candidates sat in the stage. 'OA' is kept as an alias in case the stage is ever renamed back.
  'Online Assessment': 'oa', 'OA': 'oa',
  'R1': 'r1', 'R2': 'r2', 'R3': 'r3', 'R4': 'r4', 'R5': 'r5',
  'Reference Check': 'refCheck', 'Document Submission': 'docSub', 'Offer': 'offer'
};
// The three late stages. A candidate's FIRST entry into any of them marks the quarter whose opening they
// were working against - the convention Drop is attributed by, since Ashby cannot supply the opening.
var LATE_STAGES_ = { 'Reference Check': 1, 'Document Submission': 1, 'Offer': 1 };
// Everything that counts as having moved PAST R1, for Screening Efficiency's Cleared column.
var BEYOND_R1_ = { 'R2': 1, 'R3': 1, 'R4': 1, 'R5': 1, 'Reference Check': 1, 'Document Submission': 1, 'Offer': 1 };
var PIPELINE_KEYS = ['appReview','helloChristy','taScreen','hmReview','oa','r1','r2','r3','r4','r5','refCheck','docSub','offer','hired'];
var RECRUITER_STAGES = ['hc','ta','hm','oa','r1','r2','r3','r4','r5','offer','hired'];
var STAGEKEY_TO_RECKEY = { helloChristy:'hc', taScreen:'ta', hmReview:'hm', oa:'oa', r1:'r1', r2:'r2', r3:'r3', r4:'r4', r5:'r5', offer:'offer' };
// Keyed by the raw Ashby stage TITLE (not the internal key), which is why the 'OA' vs 'Online Assessment'
// mismatch bit here too: OA candidates were in the pipeline counts but missing from funnel.screened.
var SCREENED_STAGES = { 'Hello Christy':1,'TA Screen':1,'HM Review':1,'Online Assessment':1,'OA':1,'R1':1,'R2':1,'R3':1,'R4':1,'R5':1,'Reference Check':1,'Document Submission':1,'Offer':1 };
var INTERVIEWED_STAGES = { 'R1':1,'R2':1,'R3':1,'R4':1,'R5':1,'Reference Check':1,'Document Submission':1,'Offer':1 };

// ===== API HELPERS =====

function getAshbyApiKey_() {
  var key = PropertiesService.getScriptProperties().getProperty('ASHBY_API_KEY');
  if (!key) throw new Error('Set ASHBY_API_KEY in Project Settings > Script Properties');
  return key;
}
function ashbyPost_(endpoint, body) {
  var options = { method: 'post', contentType: 'application/json',
    headers: { 'Authorization': 'Basic ' + Utilities.base64Encode(getAshbyApiKey_() + ':') },
    payload: JSON.stringify(body), muteHttpExceptions: true };
  var lastErr = null;
  for (var attempt = 1; attempt <= 5; attempt++) {
    try {
      var resp = UrlFetchApp.fetch(ASHBY_API_BASE + endpoint, options);
      var code = resp.getResponseCode();
      if (code === 429) { Logger.log('Rate limited, waiting 5s...'); Utilities.sleep(5000); continue; }
      if (code >= 500 && attempt < 5) { Utilities.sleep(attempt * 5000); continue; }
      if (code !== 200) { Logger.log('Ashby API ' + code + ': ' + resp.getContentText().substring(0, 300)); throw new Error('Ashby API ' + code); }
      return JSON.parse(resp.getContentText());
    } catch (e) {
      // Network-level failures (e.g. "Address unavailable", DNS, connection reset) throw from UrlFetchApp.fetch
      // rather than returning a code — retry with backoff so one transient blip mid-run doesn't abort the whole
      // 20-min refresh (root cause of the 2026-08 recurring-trigger failures). Re-raise real non-retryable HTTP errors.
      lastErr = e;
      var msg = String((e && e.message) || e);
      if (/^Ashby API \d/.test(msg)) throw e;   // 4xx we raised above — non-retryable (bad request/auth)
      if (attempt < 5) { Logger.log('Transient fetch error (attempt ' + attempt + '/5): ' + msg + ' — retrying...'); Utilities.sleep(attempt * 5000); continue; }
    }
  }
  throw new Error('Ashby API failed after 5 retries: ' + ((lastErr && lastErr.message) || lastErr));
}
function ashbyListAll_(endpoint, extraParams) {
  var results = [], cursor = null;
  do {
    var body = { limit: 100 };
    if (extraParams) for (var k in extraParams) body[k] = extraParams[k];
    if (cursor) body.cursor = cursor;
    var resp = ashbyPost_(endpoint, body);
    results = results.concat(resp.results || []);
    cursor = (resp.moreDataAvailable && resp.nextCursor) ? resp.nextCursor : null;
    if (cursor) Utilities.sleep(30);
  } while (cursor);
  return results;
}

// ===== REFERENCE FETCHERS =====

function fetchDepartmentMap_() {
  var depts = ashbyListAll_('/department.list');
  var map = {};
  depts.forEach(function(d) { map[d.id] = { name: d.name, parentId: d.parentId || null }; });
  return map;
}
function fetchJobs_() { return ashbyListAll_('/job.list'); }
function fetchOpenings_() { return ashbyListAll_('/opening.list'); }

// #115 (14 Sep 2026): Ashby opening dates are set in India time and stored as UTC, so an opening opened on 1 Jul is
// stored as 30 Jun 18:30Z. Reading the quarter with getUTCMonth() filed it in the PREVIOUS quarter (IK-Opening-202).
// Every opening quarter is read through this one helper, in Asia/Kolkata. Returns null for a missing/bad date.
function quarterIST_(iso) {
  if (!iso) return null; var d = new Date(iso); if (isNaN(d.getTime())) return null;
  var ym = Utilities.formatDate(d, 'Asia/Kolkata', 'yyyy-MM');
  return ym.substring(0, 4) + '-Q' + (Math.floor((parseInt(ym.substring(5, 7), 10) - 1) / 3) + 1);
}

// #129 (15 Sep 2026): the From / To boxes filter every panel, so each quarter store gets a DAY twin. Day keys are kept
// from this date on only (no page shows anything before Q3 2026 - #127). A function, not a top-level var: a top-level var
// once vanished from the deployed Code.gs.
function reportFloorDay_() { return '2026-07-01'; }
// The India-time day of an ISO timestamp - the clock quarterIST_ reads, so one quarter's days add up to that quarter.
function dayIST_(iso) {
  if (!iso) return null; var d = new Date(iso); if (isNaN(d.getTime())) return null;
  return Utilities.formatDate(d, 'Asia/Kolkata', 'yyyy-MM-dd');
}

// ===== HELPERS =====

function emptyPipeline_() { var p = {}; PIPELINE_KEYS.forEach(function(k) { p[k] = 0; }); return p; }
// Attribution (2026-08-11): hiring-team members by role. Recruiter/Sourcer are the ONLY signals —
// Credited-To is DROPPED (it's sourcing/referral credit, not recruiting ownership; also not carried over
// from the Greenhouse migration). Names = firstName+lastName (matches recruiter-pods RECRUITER_POD).
function memberName_(m) { return (m && (m.name || ((m.firstName || '') + ' ' + (m.lastName || '')).trim())) || null; }
function getHiringTeamRoles_(app) {
  var recruiters = [], sourcers = [], ht = app.hiringTeam || [];
  for (var i = 0; i < ht.length; i++) {
    var m = ht[i], nm = memberName_(m); if (!nm) continue;
    if (m.role === 'Recruiter') recruiters.push({ name: nm, userId: m.userId || null });
    else if (m.role === 'Sourcer') sourcers.push({ name: nm, userId: m.userId || null });
  }
  return { recruiters: recruiters, sourcers: sourcers };
}
function getRecruiterFromApp_(app) { var r = getHiringTeamRoles_(app).recruiters; return r.length ? r[0].name : null; }
function jobCustomField_(job, cfId) {
  var cfs = job.customFields || [];
  for (var i = 0; i < cfs.length; i++) {
    if (cfs[i].id === cfId) { var v = cfs[i].valueLabel != null ? cfs[i].valueLabel : cfs[i].value; if (v && v.length === 1) v = v[0]; return (v === '' || v == null) ? null : v; }
  }
  return null;
}
// Employment Type (PTC / FTC / ...) is matched on the field TITLE rather than a hardcoded id: unlike Level and
// Complexity we never captured its uuid, and a title match survives the field being recreated in Ashby.
// #157: the same idea for an OPENING's own custom field. opening.list already returns
// latestVersion.customFields, so reading the Specialization/Topic here costs NO extra API call
// (measured 16 Sep). Read valueLabel, never value - value is the option id, not the words.
function openingCustomFieldByTitle_(o, re) {
  var cfs = (o.latestVersion && o.latestVersion.customFields) || [];
  for (var i = 0; i < cfs.length; i++) {
    var t = cfs[i].title || cfs[i].name || '';
    if (!re.test(t)) continue;
    var v = cfs[i].valueLabel != null ? cfs[i].valueLabel : cfs[i].value;
    if (v && typeof v !== 'string' && v.length === 1) v = v[0];
    return (v === '' || v == null) ? null : String(v);
  }
  return null;
}
function jobCustomFieldByTitle_(job, re) {
  var cfs = job.customFields || [];
  for (var i = 0; i < cfs.length; i++) {
    var t = cfs[i].title || cfs[i].name || '';
    if (!re.test(t)) continue;
    var v = cfs[i].valueLabel != null ? cfs[i].valueLabel : cfs[i].value;
    if (v && v.length === 1 && typeof v !== 'string') v = v[0];
    return (v === '' || v == null) ? null : String(v);
  }
  return null;
}
function getQuarter_(dateStr) { var d = new Date(dateStr); return d.getFullYear() + '-Q' + (Math.floor(d.getMonth() / 3) + 1); }
function dayKey_(ms) { var d = new Date(ms); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
// Whole-days between two 'YYYY-MM-DD' day keys (toKey - fromKey). Used for time-in-stage dwell.
function daysBetween_(fromKey, toKey) { return Math.round((new Date(toKey + 'T00:00:00Z').getTime() - new Date(fromKey + 'T00:00:00Z').getTime()) / 86400000); }
function getWeekLabel_(dateStr) {
  var d = new Date(dateStr), day = d.getDay(), mon = new Date(d);
  mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  var sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  var M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return M[mon.getMonth()] + ' ' + mon.getDate() + '-' + sun.getDate();
}

// #13: one Data Hygiene row for an application (Multiple Recruiters / Multiple Sourcers). department rides along so the
// lists can group by it; createdAt is the 'added' day of the date floor above.
function hygRow_(appId, jobId, jd, candName, createdAt) {
  return { app: appId, job8: (jobId || '').substring(0, 8), candidate: candName, createdAt: (createdAt || '').substring(0, 10), department: jd ? jd.department : '' };
}
// #13: remember the LATEST day an application was interviewed or assessed ('YYYY-MM-DD' strings compare as dates).
function hygAct_(map, appId, day) { if (appId && day && (!map[appId] || day > map[appId])) map[appId] = day; }

// ===== APP PASS — createdAfter=SCOPE_FROM_MS returns only current-year apps =====

function fetchAndProcessApps_(startTime, jobLookup, excludedJobIds_) {
  excludedJobIds_ = excludedJobIds_ || {};   // #37: sandbox job ids to skip (see EXCLUDED_DEPTS)
  var cursor = null, pageNum = 0, totalApps = 0, scopedApps = 0;
  var funnel = { applied: 0, screened: 0, interviewed: 0, offered: 0, hired: 0 };
  var recruiterCounts = {}, sourceCounts = {}, weekCounts = {}, qData = {}, appMap = {}, histApps = [];
  // Every ARCHIVED application, for the drop backfill. An archived candidate's current stage reads
  // 'Archived', so the stage map cannot tell us whether they ever reached a late stage - only their
  // history can, and that needs one call each. Collecting the ids here costs nothing: this pass already
  // walks every application. The backfill job consumes this list on its own trigger.
  var archivedApps = [];
  var recruiterUserId = {};   // recruiter name -> userId (for user.list isEnabled -> Active/Inactive)
  var anomalies = { multiRecruiter: [], multiSourcer: [] };
  // Stage titles Ashby returned that STAGE_KEY_MAP has no entry for. An unmapped stage is dropped
  // from every count, which is exactly how 'Online Assessment' went unnoticed - so surface it.
  var unmappedStages = {};
  var unassignedCases = [];   // reached-screening+ apps with NO recruiter (dashboard compliance list); #13: only apps touched since HYGIENE_FLOOR
  // Time-in-App-Review dwell histograms {days:count} for candidates CURRENTLY parked in App Review (now - createdAt).
  // The stage-history accumulator can't see these (they never reached screening), so we capture them here — full coverage.
  var arDwellJob = {}, arDwellRec = {};
  // #120a/#120b: the same dwell per RECRUITER x JOB, so a Job filter or a department scope can narrow the recruiter
  // rows. Summed over jobs it equals appReviewDwellByRecruiter for every parked candidate that has a job.
  var arDwellRecJob = {};

  function ensureRec(name) {
    if (!recruiterCounts[name]) { var r = { name: name, total: 0, byJob: {}, sources: {}, srcNested: {}, srcByJob: {}, srcQ: {}, srcByJobQ: {} }; RECRUITER_STAGES.forEach(function(s) { r[s] = 0; }); recruiterCounts[name] = r; }
    return recruiterCounts[name];
  }
  function ensureQ(qk) { if (!qData[qk]) qData[qk] = { funnel: { applied:0,screened:0,interviewed:0,offered:0,hired:0 }, jobCounts: {}, sourceCounts: {} }; return qData[qk]; }

  do {
    if (Date.now() - startTime > TIMEOUT_MS) { Logger.log('TIME CUTOFF at ' + totalApps + ' apps, ' + pageNum + ' pages'); break; }
    var body = { limit: 100, createdAfter: SCOPE_FROM_MS };   // <-- year slice directly (Unix ms)
    if (cursor) body.cursor = cursor;
    var resp = ashbyPost_('/application.list', body);
    var batch = resp.results || [];
    totalApps += batch.length; pageNum++;

    for (var i = 0; i < batch.length; i++) {
      var app = batch[i];
      var createdMs = app.createdAt ? new Date(app.createdAt).getTime() : 0;
      if (createdMs < SCOPE_FROM_MS) continue;   // defensive (createdAfter already scopes)
      var jobId = app.job && app.job.id;
      // #37: sandbox department - skip BEFORE any counter. funnel / sourceCounts / recruiterCounts / appMap
      // below all increment whether or not the job resolves, so filtering the job list alone leaves these in.
      if (jobId && excludedJobIds_[jobId]) continue;
      scopedApps++;
      var htr = getHiringTeamRoles_(app);
      var recruiter = htr.recruiters.length ? htr.recruiters[0].name : null;
      var sourcer = htr.sourcers.length ? htr.sourcers[0].name : null;
      var recName = recruiter || 'Unassigned';   // attribute null-recruiter apps to a visible "Unassigned" bucket
      if (recruiter && htr.recruiters[0].userId && !recruiterUserId[recruiter]) recruiterUserId[recruiter] = htr.recruiters[0].userId;
      var candName = (app.candidate && (app.candidate.name || ((app.candidate.firstName || '') + ' ' + (app.candidate.lastName || '')).trim())) || null;
      // primaryEmailAddress is already in the application.list payload (confirmed against the reference
      // 2026-08-22). It is the ONLY reliable join key to the Hiring Tracker - names disagree constantly.
      // 🚨 It must never reach dashboard.json; see the offer_contacts.json comment below.
      var candEmail = (app.candidate && app.candidate.primaryEmailAddress && app.candidate.primaryEmailAddress.value) || null;
      if (app.id) appMap[app.id] = { jobId: jobId, recruiter: recruiter, sourcer: sourcer, candidate: candName, email: candEmail };
      var jd = jobLookup[jobId];
      var stageName = app.currentInterviewStage ? app.currentInterviewStage.title : null;
      var stageKey = stageName ? (STAGE_KEY_MAP[stageName] || null) : null;
      if (stageName && !stageKey) unmappedStages[stageName] = (unmappedStages[stageName] || 0) + 1;
      var isHired = (app.status === 'Hired');
      if (app.id && appMap[app.id]) { appMap[app.id].stage = stageName; appMap[app.id].status = app.status || null; appMap[app.id].archivedAt = app.archivedAt || null; appMap[app.id].archiveReason = (app.archiveReason && app.archiveReason.text) || null; appMap[app.id].archiveReasonType = (app.archiveReason && app.archiveReason.reasonType) || null; }
      var updatedMs = app.updatedAt ? new Date(app.updatedAt).getTime() : createdMs;
      // #13: an interview or an assessment on or after HYGIENE_FLOOR also moves updatedAt, so this is a cheap SUPERSET of the
      // floor. The exact test (added, interviewed or assessed since the floor) runs after the interview pass.
      var hygMaybe = createdMs >= HYGIENE_FLOOR_MS || updatedMs >= HYGIENE_FLOOR_MS;
      if (hygMaybe && htr.recruiters.length > 1) { var hygMr = hygRow_(app.id, jobId, jd, candName, app.createdAt); hygMr.names = htr.recruiters.map(function (r) { return r.name; }); anomalies.multiRecruiter.push(hygMr); }
      if (hygMaybe && htr.sourcers.length > 1) { var hygMs = hygRow_(app.id, jobId, jd, candName, app.createdAt); hygMs.names = htr.sourcers.map(function (r) { return r.name; }); anomalies.multiSourcer.push(hygMs); }

      // Tag apps that reached screening+ (or hired) — the stage-history accumulator pulls listHistory for these.
      var reachedScreening = ((stageKey && stageKey !== 'appReview') || isHired);
      // s = application status ('Active' | 'Archived' | 'Hired'). The stage-history pass needs it because
      // application.listHistory records an 'Archived' TRANSITION for almost nobody — 30 of 2,134 apps in the
      // 2026-08-22 run — so a drop cannot be detected from the history feed alone. History supplies "did they
      // reach a late stage", status supplies "did they end archived"; a drop needs both.
      if (app.id && reachedScreening) histApps.push({ id: app.id, r: recruiter, j: jobId, s: app.status || null });
      if (app.id && app.status === 'Archived') archivedApps.push({ id: app.id, r: recruiter, j: jobId });
      if (!recruiter && reachedScreening && hygMaybe) unassignedCases.push({ applicationId: app.id, job8: (jobId || '').substring(0, 8), jobTitle: jd ? jd.title : '', department: jd ? jd.department : '', candidate: candName, stage: stageName || (isHired ? 'Hired' : ''), createdAt: (app.createdAt || '').substring(0, 10) });

      // App Review dwell: candidates sitting in App Review right now → days = today - createdAt (capped 0..365).
      if (stageKey === 'appReview' && createdMs) {
        var arDays = Math.floor((Date.now() - createdMs) / 86400000); if (arDays < 0) arDays = 0; if (arDays > 365) arDays = 365;
        var arj8 = (jobId || '').substring(0, 8);
        if (arj8) { var ahj = arDwellJob[arj8] || (arDwellJob[arj8] = {}); ahj[arDays] = (ahj[arDays] || 0) + 1; }
        var ahr = arDwellRec[recName] || (arDwellRec[recName] = {}); ahr[arDays] = (ahr[arDays] || 0) + 1;
        if (arj8) { var arrj = arDwellRecJob[recName] || (arDwellRecJob[recName] = {}); var ahrj = arrj[arj8] || (arrj[arj8] = {}); ahrj[arDays] = (ahrj[arDays] || 0) + 1; }
      }

      funnel.applied++;
      if (SCREENED_STAGES[stageName] || isHired) funnel.screened++;
      if (INTERVIEWED_STAGES[stageName] || isHired) funnel.interviewed++;
      if (stageName === 'Offer' || isHired) funnel.offered++;
      if (isHired) funnel.hired++;

      if (jd) {
        jd.applied++;
        if (isHired) { jd.pipeline.hired++; jd.hired++; }
        else if (stageKey && jd.pipeline.hasOwnProperty(stageKey)) jd.pipeline[stageKey]++;
        if (stageName === 'TA Screen' || stageName === 'Hello Christy') jd.screen++;
        if (stageName === 'R1') jd.interview++;
        if (stageName === 'Offer' || isHired) jd.offer++;
        if (recruiter && jd.recruiterSet.indexOf(recruiter) < 0) jd.recruiterSet.push(recruiter);
      }
      {
        var rc = ensureRec(recName); rc.total++;
        var recKey = isHired ? 'hired' : (stageKey && STAGEKEY_TO_RECKEY[stageKey]);
        if (recKey) rc[recKey]++;
        if (isHired) rc.offer++;
        if (jobId) { var bj = rc.byJob[jobId] || (rc.byJob[jobId] = { jobId: jobId, title: jd ? jd.title : '', department: jd ? jd.department : '', total: 0, offer: 0, hired: 0, pipeline: {} }); bj.total++; if (stageName === 'Offer' || isHired) bj.offer++; if (isHired) bj.hired++;
        // #145b (2026-09-19): the recruiter's OWN live pipeline, per job, for the Recruiter Efficiency
        // Pipeline sub-tab. Built from the same isHired / stageKey pair that fills jd.pipeline a few lines
        // above, in the same iteration over the same application - so the recruiter rows sum to the job row
        // exactly, by construction rather than by anyone remembering to keep the two in step (Rule 3).
        // jobs[].pipeline CANNOT be split by a job's recruiter list instead: 48 of 100 live jobs have more
        // than one recruiter and 39% of everyone in a pipeline sits on a shared job, so that split would
        // either double-count them or lose them. Recruiter attribution is per CANDIDATE, not per job, which
        // is why the tally belongs here. Only non-zero stages are written: about 1% of dashboard.json.
        var bpk = isHired ? 'hired' : stageKey;
        if (bpk && PIPELINE_KEYS.indexOf(bpk) > -1) bj.pipeline[bpk] = (bj.pipeline[bpk] || 0) + 1; }
      }
      var srcType = app.source && app.source.sourceType ? (app.source.sourceType.title || app.source.sourceType) : null;
      if (typeof srcType === 'object') srcType = null;
      if (srcType) {
        if (!sourceCounts[srcType]) sourceCounts[srcType] = { name: srcType, type: srcType, candidates: 0, hires: 0 };
        sourceCounts[srcType].candidates++; if (isHired) sourceCounts[srcType].hires++;
        { var rs = recruiterCounts[recName].sources; rs[srcType] = (rs[srcType] || 0) + 1; }
        // finer source NAME (e.g. "Indeed Listing", "LinkedIn"), nested under the source_type, per recruiter
        var srcName = (app.source && typeof app.source.title === 'string' && app.source.title) ? app.source.title : '(unspecified)';
        var nst = recruiterCounts[recName].srcNested; var nt = nst[srcType] || (nst[srcType] = {}); nt[srcName] = (nt[srcName] || 0) + 1;
        // Carry the source on appMap so an OFFER can say where that candidate came from. Sourcing Mix
        // counts applications by source; Jerin asked (2026-08-29) for the same cut restricted to people
        // who actually joined, and an offer record had no source on it until now.
        if (app.id && appMap[app.id]) { appMap[app.id].srcType = srcType; appMap[app.id].srcName = srcName; }
        // same source, bucketed per JOB as well: srcByJob {job8:{type:{name:count}}}. Sources were only ever
        // stored per recruiter, which left Overall Efficiency > Sourcing Mix unable to honour its Department
        // and Job filters. Keying by (recruiter x job) fixes that: pod attribution follows the recruiter,
        // the dept/job scope follows the job. job8 matches the 8-char job ids used everywhere else.
        if (jobId) { var sbj = recruiterCounts[recName].srcByJob; var j8 = jobId.slice(0, 8); var sjb = sbj[j8] || (sbj[j8] = {}); var stb = sjb[srcType] || (sjb[srcType] = {}); stb[srcName] = (stb[srcName] || 0) + 1; }
        // Same counts again, split by the QUARTER THE CANDIDATE APPLIED (2026-08-25). Sourcing Mix carried no
        // date at all, so its Year/Quarter selector regrouped pods and changed nothing else - a quarter
        // heading over lifetime numbers, the same shape as the bugs found on 2026-08-21. srcQ drives the
        // Recruiter tab, srcByJobQ the Overall Efficiency tab (which needs the job to honour dept/job filters).
        // Emitted ALONGSIDE the undated fields so a frontend running against older data still works.
        var _sq = app.createdAt ? getQuarter_(app.createdAt) : null;
        if (_sq) {
          var _rq = recruiterCounts[recName].srcQ || (recruiterCounts[recName].srcQ = {});
          var _rqq = _rq[_sq] || (_rq[_sq] = {}); var _rqt = _rqq[srcType] || (_rqq[srcType] = {});
          _rqt[srcName] = (_rqt[srcName] || 0) + 1;
          if (jobId) {
            var _bq = recruiterCounts[recName].srcByJobQ || (recruiterCounts[recName].srcByJobQ = {});
            var _j8q = jobId.slice(0, 8); var _bj = _bq[_j8q] || (_bq[_j8q] = {});
            var _bjq = _bj[_sq] || (_bj[_sq] = {}); var _bjt = _bjq[srcType] || (_bjq[srcType] = {});
            _bjt[srcName] = (_bjt[srcName] || 0) + 1;
          }
        }
      }
      if (app.createdAt) { var wk = getWeekLabel_(app.createdAt); weekCounts[wk] = (weekCounts[wk] || 0) + 1; }
      if (app.createdAt) {
        var q = ensureQ(getQuarter_(app.createdAt));
        q.funnel.applied++;
        if (SCREENED_STAGES[stageName] || isHired) q.funnel.screened++;
        if (INTERVIEWED_STAGES[stageName] || isHired) q.funnel.interviewed++;
        if (stageName === 'Offer' || isHired) q.funnel.offered++;
        if (isHired) q.funnel.hired++;
        if (jd) { var jt = jd.title; if (!q.jobCounts[jt]) q.jobCounts[jt] = { title: jt, department: jd.department, applied: 0, hired: 0 }; q.jobCounts[jt].applied++; if (isHired) q.jobCounts[jt].hired++; }
        if (srcType) { if (!q.sourceCounts[srcType]) q.sourceCounts[srcType] = { name: srcType, candidates: 0, hires: 0 }; q.sourceCounts[srcType].candidates++; if (isHired) q.sourceCounts[srcType].hires++; }
      }
    }
    cursor = (resp.moreDataAvailable && resp.nextCursor) ? resp.nextCursor : null;
    if (pageNum % 50 === 0 || !cursor) Logger.log('/application.list(createdAfter): ' + totalApps + ' fetched, ' + scopedApps + ' scoped, ' + pageNum + ' pages, ' + Math.round((Date.now() - startTime) / 1000) + 's' + (cursor ? ' (more)' : ' DONE'));
  } while (cursor);

  return { total: totalApps, scoped: scopedApps, funnel: funnel, recruiterCounts: recruiterCounts, sourceCounts: sourceCounts, weekCounts: weekCounts, qData: qData, appMap: appMap, histApps: histApps, archivedApps: archivedApps,
    recruiterUserId: recruiterUserId, anomalies: anomalies, unassignedCases: unassignedCases, unmappedStages: unmappedStages, appReviewDwellByJob: arDwellJob, appReviewDwellByRecruiter: arDwellRec, appReviewDwellByRecruiterJob: arDwellRecJob };
}

// ===== OFFER PASS =====

function fetchAndProcessOffers_(startTime, appMap, excludedJobIds_) {
  excludedJobIds_ = excludedJobIds_ || {};   // #37: sandbox job ids to skip
  var cursor = null, count = 0, byJob = {}, byRecruiter = {}, nowMs = Date.now(), events = [], recovered = 0;
  var lhCalls = 0, lhFound = 0, lhErr = 0;
  do {
    if (Date.now() - startTime > TIMEOUT_MS) { Logger.log('OFFER cutoff at ' + count); break; }
    var body = { limit: 100 }; if (cursor) body.cursor = cursor;
    var resp = ashbyPost_('/offer.list', body);
    var batch = resp.results || [];
    for (var i = 0; i < batch.length; i++) {
      var o = batch[i];
      var decided = o.decidedAt ? new Date(o.decidedAt).getTime() : (o.latestVersion && o.latestVersion.createdAt ? new Date(o.latestVersion.createdAt).getTime() : 0);
      if (decided < SCOPE_FROM_MS) continue;               // scope offers to current year by decision date
      count++;
      var am = appMap[o.applicationId] || null;
      if (!am && o.applicationId) {
        // Offer for a candidate who APPLIED before the scope year (app not in appMap). Attribution keys off the
        // OFFER date, not the app date — so fetch the application directly to recover recruiter/sourcer/job.
        try {
          var ai = ashbyPost_('/application.info', { applicationId: o.applicationId });
          var a = ai && ai.results;
          if (a) {
            var htr2 = getHiringTeamRoles_(a);
            am = { jobId: a.job && a.job.id, recruiter: htr2.recruiters.length ? htr2.recruiters[0].name : null,
              sourcer: htr2.sourcers.length ? htr2.sourcers[0].name : null,
              candidate: (a.candidate && (a.candidate.name || ((a.candidate.firstName || '') + ' ' + (a.candidate.lastName || '')).trim())) || null };
              am.stage = (a.currentInterviewStage && a.currentInterviewStage.title) || null;
              am.status = a.status || null;
              am.archivedAt = a.archivedAt || null;
              // The free-text reason actually chosen when the application was archived, plus its type
              // (RejectedByCandidate | RejectedByOrg | Other). Verified present on 25/25 archived rows of
              // application.list on 2026-08-22, so it costs no extra API call. This is the ONLY field that
              // says WHY a drop happened - offerStatus only says CandidateRejected, and the two disagree.
              am.archiveReason = (a.archiveReason && a.archiveReason.text) || null;
              am.archiveReasonType = (a.archiveReason && a.archiveReason.reasonType) || null;
              am.email = (a.candidate && a.candidate.primaryEmailAddress && a.candidate.primaryEmailAddress.value) || null;
              // #116 (13 Sep 2026): carry the application's SOURCE here too. Offers on applications created before the
              // scope year come through this branch, and without this they reached offerEvents with no source - so Sourcing
              // Mix's "(source not recorded)" and Data Hygiene's Selected Candidates Missing Source over-counted.
              var st2 = a.source && a.source.sourceType ? (a.source.sourceType.title || a.source.sourceType) : null;
              if (typeof st2 === 'object') st2 = null;
              if (st2) { am.srcType = st2; am.srcName = (a.source && typeof a.source.title === 'string' && a.source.title) ? a.source.title : '(unspecified)'; }
              appMap[o.applicationId] = am;
            recovered++;
          }
        } catch (e2) { }
      }
      am = am || {};
      var jobId = am.jobId, rec = am.recruiter, src = am.sourcer;
      // #37: sandbox department. The application loop already skipped these, which is exactly why the
      // recovery branch above re-fetched them from application.info and put them BACK into appMap - the
      // exclusion defeated itself. Drop the offer HERE, after both paths have resolved a jobId, and undo
      // the re-insert so nothing downstream of appMap sees it either.
      if (jobId && excludedJobIds_[jobId]) { if (o.applicationId && appMap[o.applicationId]) delete appMap[o.applicationId]; continue; }
      var accepted = (o.acceptanceStatus === 'Accepted');
      var startDateStr = (o.latestVersion && o.latestVersion.startDate) ? o.latestVersion.startDate : null;
      var startMs = startDateStr ? new Date(startDateStr).getTime() : 0;
      var pending = accepted && startMs > nowMs;
      if (jobId) { var bj = byJob[jobId] || (byJob[jobId] = { offered:0, accepted:0 }); bj.offered++; if (accepted) bj.accepted++; }
      if (rec)   { var br = byRecruiter[rec] || (byRecruiter[rec] = { offered:0, accepted:0 }); br.offered++; if (accepted) br.accepted++; }
      // Offer VERSION history. offer.list returns a `versions` array (confirmed against the offer.list
      // reference 2026-08-22), each version carrying its own createdAt and openingId. Two uses:
      //  (a) the EARLIEST version's createdAt is when the offer was FIRST created - the proxy for "entered
      //      the Offer stage". That is the anchor for attributing a drop to the quarter the work happened
      //      in, rather than the quarter somebody got round to archiving the record.
      //  (b) an earlier version may still carry the openingId the latest one lost. If it does, we recover
      //      the TRUE opening instead of a proxy. verN is emitted so an EMPTY versions array can be told
      //      apart from an ABSENT one - without it, "0 recovered" would be unreadable.
      var vers = (o.versions && o.versions.length) ? o.versions : (o.latestVersion ? [o.latestVersion] : []);
      var firstCreated = null, anyOpening = null;
      for (var vi = 0; vi < vers.length; vi++) {
        var vv = vers[vi]; if (!vv) continue;
        if (vv.createdAt && (!firstCreated || String(vv.createdAt) < String(firstCreated))) firstCreated = vv.createdAt;
        if (vv.openingId && !anyOpening) anyOpening = vv.openingId;
      }
      // ---- LATE-STAGE ENTRY DATE: which quarter's opening was this drop working against? ----
      // Ashby cannot tell us the opening for a drop. Three routes were tested and all return zero for
      // archived applications: the live application.opening link, offer.latestVersion.openingId, and the
      // full offer.info version history (92 calls, 144 versions inspected, 0 links). Separately, only 58 of
      // 644 offers carry an opening AT ALL - 1% in Business - India, where 41 of the 92 drops sit - so the
      // link was never going to carry this metric even if archiving preserved it.
      //
      // Convention (Jerin, 2026-08-22): the quarter a candidate ENTERED the late stages is the quarter of
      // the opening they were working against, because openings are meant to be closed off each quarter.
      // The EARLIEST of Reference Check / Document Submission / Offer is used - the first two sit before
      // Offer but only 34 and 231 candidates ever pass through them, so most rows resolve to Offer entry.
      //
      // ⚠ This is the real stage TRANSITION date from application.listHistory, NOT the offer's creation
      // date. The offer is often raised well after the candidate is moved to the stage, and it is the
      // move that marks the work starting. Only ARCHIVED offers are looked up (~92 calls per run).
      var lateEntry = null;
      if (am.status === 'Archived' && o.applicationId && (Date.now() - startTime) < TIMEOUT_MS) {
        lhCalls++;
        try {
          var hres = ashbyPost_('/application.listHistory', { applicationId: o.applicationId });
          var hist2 = (hres && (hres.results || hres.history)) || [];
          for (var hi = 0; hi < hist2.length; hi++) {
            var ht = hist2[hi]; if (!ht || !ht.enteredStageAt) continue;
            if (!LATE_STAGES_[ht.title]) continue;
            if (!lateEntry || String(ht.enteredStageAt) < String(lateEntry)) lateEntry = ht.enteredStageAt;
          }
          if (lateEntry) lhFound++;
        } catch (e5) { lhErr++; }
      }

      // per-offer event for split-scoring (recruiter+sourcer) + the HM joining-pending table (startDate)
      events.push({ applicationId: o.applicationId, jobId8: (jobId || '').substring(0, 8), candidate: am.candidate || null,
        recruiter: rec || null, sourcer: src || null, decidedAt: (o.decidedAt || '').substring(0, 10),
        startDate: startDateStr ? startDateStr.substring(0, 10) : null, accepted: accepted, joiningPending: pending, offerOpeningId: (o.latestVersion && o.latestVersion.openingId) || null, offerStatus: o.offerStatus || null, acceptanceStatus: o.acceptanceStatus || null,
        offerCreatedAt: firstCreated ? String(firstCreated).substring(0, 10) : null,
        offerOpeningIdAny: anyOpening || null, verN: vers.length,
        lateEntryAt: lateEntry ? String(lateEntry).substring(0, 10) : null });
    }
    cursor = (resp.moreDataAvailable && resp.nextCursor) ? resp.nextCursor : null;
    if (cursor) Utilities.sleep(30);
  } while (cursor);
  Logger.log('offers processed (scoped): ' + count + ' | recovered via application.info (pre-scope-year apps): ' + recovered);
  Logger.log('late-stage entry lookups (archived offers): ' + lhCalls + ' calls | resolved: ' + lhFound + ' | errors: ' + lhErr);
  return { byJob: byJob, byRecruiter: byRecruiter, count: count, events: events };
}

// ===== MAIN REFRESH =====

// ===== INTERVIEWER / PANELIST PASS =====
// interviewSchedule.list → per-event interviewers + end times (job/dept via appMap); applicationFeedback.list →
// per-panelist feedback count + turnaround (submittedAt − event endTime). Scoped to the current year by createdAt
// (createdAfter) with a client-side date guard, plus the shared TIMEOUT_MS cutoff. Emits interviewers[] (org-wide
// per-panelist totals) + panelists[] (per Dept→Job→panelist rows for the HM Panelists tab).
function fetchAndProcessInterviews_(startTime, appMap, jobLookup, userNameById) {
  var byUser = {}, byDJU = {}; var EXCLUDED_INTERVIEWER_ID = '924ff493-7411-49a4-ba4b-e083d78dc0b9', interviewsByQuarter = {}, interviewsByMonth = {};
  // #120a/#120b: interview EVENTS per job (by quarter and month), so the Panelists Interviews card can follow a scope.
  var interviewsByJobQ = {}, interviewsByJobM = {}, evNoJob = 0;
  // #129: interview EVENTS per job and in total per UTC DAY (the clock byQuarter / byMonth are cut from), from
  // reportFloorDay_() on, so the From / To boxes can narrow the Panelists panel. A quarter's days add up to that quarter.
  var interviewsByJobD = {}, interviewsByDay = {}, _floorD = reportFloorDay_();
  // DISTINCT CANDIDATES per quarter, not interview events. interviewsByQuarter counts EVENTS - one candidate
  // doing R1, R2 and R3 is three of those and one of these. The Overview tile asks 'how many people did we
  // interview', which is this. Keyed quarter -> {applicationId: 1}; only the counts ever leave the server.
  var intAppsByQ = {};        // userId totals / dept->title->userId
  var evEndByAppUser = {};            // (appId '|' userId) -> [event endMs, ...] — for feedback turnaround matching
  var actByApp = {};                  // #13: appId -> latest day interviewed (a held interview) or given feedback
  function eu(uid) { if (!byUser[uid]) byUser[uid] = { interviews: 0, feedbackCount: 0, turnSum: 0, turnN: 0, byQuarter: {}, byMonth: {}, byDay: {}, pending: 0 }; return byUser[uid]; }
  // #120b: rows are keyed dept -> JOB -> panelist. They were dept -> job TITLE -> panelist, which merged two jobs sharing a
  // title and could not be narrowed to one job. The title stays on the row; the site merges same-title rows for display.
  function edju(ctx, uid) { var d = byDJU[ctx.dept] || (byDJU[ctx.dept] = {}); var tk = ctx.j8 + '|' + ctx.title; var t = d[tk] || (d[tk] = {}); return t[uid] || (t[uid] = { title: ctx.title, j8: ctx.j8, interviews: 0, feedbackCount: 0, turnSum: 0, turnN: 0, pending: 0, byQuarter: {}, byMonth: {}, byDay: {} }); }
  function jobCtx(appId) { var am = appId ? appMap[appId] : null; var jd = (am && am.jobId) ? jobLookup[am.jobId] : null; return { dept: jd ? jd.department : 'Unknown', title: jd ? jd.title : 'Unknown', j8: (am && am.jobId) ? String(am.jobId).substring(0, 8) : '' }; }

  // Pass 1 — interview schedules → events. Interviewers are in ev.interviewerUserIds (array of ids); ev.interviewers[].userId is null.
  var cursor = null, evCount = 0, pages = 0;
  do {
    if (Date.now() - startTime > TIMEOUT_MS) { Logger.log('INTERVIEW schedules cutoff at ' + evCount); break; }
    var body = { limit: 100, createdAfter: SCOPE_FROM_MS }; if (cursor) body.cursor = cursor;
    var resp = ashbyPost_('/interviewSchedule.list', body);
    var batch = resp.results || [];
    for (var i = 0; i < batch.length; i++) {
      var s = batch[i]; var appId = s.applicationId; var ctx1 = jobCtx(appId);
      var evs = s.interviewEvents || [];
      for (var e = 0; e < evs.length; e++) {
        var ev = evs[e];
        var st = ev.startTime ? new Date(ev.startTime).getTime() : 0;
        if (st && st < SCOPE_FROM_MS) continue;
        var _uu = ev.interviewerUserIds || [], _hasReal = false; for (var _z = 0; _z < _uu.length; _z++) { if (_uu[_z] && _uu[_z] !== EXCLUDED_INTERVIEWER_ID) { _hasReal = true; break; } } if (!_hasReal) continue; evCount++; if (st) { var _qd = new Date(st); var _qk = _qd.getUTCFullYear() + '-Q' + (Math.floor(_qd.getUTCMonth() / 3) + 1); interviewsByQuarter[_qk] = (interviewsByQuarter[_qk] || 0) + 1; if (appId) { (intAppsByQ[_qk] || (intAppsByQ[_qk] = {}))[appId] = 1; } var _mk = _qd.getUTCFullYear() + '-' + ('0' + (_qd.getUTCMonth() + 1)).slice(-2); interviewsByMonth[_mk] = (interviewsByMonth[_mk] || 0) + 1; var _dk = _qd.toISOString().substring(0, 10); if (_dk >= _floorD) interviewsByDay[_dk] = (interviewsByDay[_dk] || 0) + 1; }
        if (st && appId && st <= Date.now()) hygAct_(actByApp, appId, String(ev.startTime).substring(0, 10));   // #13: interviewed
        if (st) { if (ctx1.j8) { var _ijq = interviewsByJobQ[ctx1.j8] || (interviewsByJobQ[ctx1.j8] = {}); _ijq[_qk] = (_ijq[_qk] || 0) + 1; var _ijm = interviewsByJobM[ctx1.j8] || (interviewsByJobM[ctx1.j8] = {}); _ijm[_mk] = (_ijm[_mk] || 0) + 1; if (_dk >= _floorD) { var _ijd = interviewsByJobD[ctx1.j8] || (interviewsByJobD[ctx1.j8] = {}); _ijd[_dk] = (_ijd[_dk] || 0) + 1; } } else evNoJob++; }
        var endMs = ev.endTime ? new Date(ev.endTime).getTime() : 0;
        var uids = ev.interviewerUserIds || [];
        for (var k = 0; k < uids.length; k++) {
          var uid = uids[k]; if (!uid || uid === EXCLUDED_INTERVIEWER_ID) continue;
          eu(uid).interviews++; if (!ev.hasSubmittedFeedback) byUser[uid].pending++;
          var _dj1 = edju(ctx1, uid); _dj1.interviews++; if (!ev.hasSubmittedFeedback) _dj1.pending++;
          if (st) {
            var _pq = new Date(st);
            var _pqk = _pq.getUTCFullYear() + '-Q' + (Math.floor(_pq.getUTCMonth() / 3) + 1);
            var _pmk = _pq.getUTCFullYear() + '-' + ('0' + (_pq.getUTCMonth() + 1)).slice(-2);
            var _euq = eu(uid); _euq.byQuarter[_pqk] = (_euq.byQuarter[_pqk] || 0) + 1; _euq.byMonth[_pmk] = (_euq.byMonth[_pmk] || 0) + 1;
            var _djq = edju(ctx1, uid); _djq.byQuarter[_pqk] = (_djq.byQuarter[_pqk] || 0) + 1; _djq.byMonth[_pmk] = (_djq.byMonth[_pmk] || 0) + 1;
            var _pdk = _pq.toISOString().substring(0, 10);   // #129: the same UTC clock as _pqk / _pmk
            if (_pdk >= _floorD) { _euq.byDay[_pdk] = (_euq.byDay[_pdk] || 0) + 1; _djq.byDay[_pdk] = (_djq.byDay[_pdk] || 0) + 1; }
          }
          if (endMs && appId) { var key = appId + '|' + uid; (evEndByAppUser[key] || (evEndByAppUser[key] = [])).push(endMs); }
        }
      }
    }
    cursor = (resp.moreDataAvailable && resp.nextCursor) ? resp.nextCursor : null; pages++;
    if (cursor) Utilities.sleep(30);
  } while (cursor);
  Logger.log('interviewSchedule.list: ' + evCount + ' scoped events, ' + pages + ' pages, ' + evNoJob + ' with no job');

  // Pass 2 — feedback → per-panelist count + turnaround. Feedback has NO interviewEventId, so turnaround is matched
  // by (applicationId + submitter) to the nearest earlier interview-event endTime; job/dept via appMap[applicationId].
  cursor = null; var fbCount = 0; pages = 0;
  do {
    if (Date.now() - startTime > TIMEOUT_MS) { Logger.log('INTERVIEW feedback cutoff at ' + fbCount); break; }
    var body2 = { limit: 100, createdAfter: SCOPE_FROM_MS }; if (cursor) body2.cursor = cursor;
    var resp2 = ashbyPost_('/applicationFeedback.list', body2);
    var batch2 = resp2.results || [];
    for (var f = 0; f < batch2.length; f++) {
      var fb = batch2[f];
      var su = fb.submittedByUser || fb.creditedToUser; var uid2 = su && su.id;
      if (!uid2 || uid2 === EXCLUDED_INTERVIEWER_ID) continue;
      if (!userNameById[uid2] && su) { var nm = ((su.firstName || '') + ' ' + (su.lastName || '')).trim(); if (nm) userNameById[uid2] = nm; }
      var subMs = fb.submittedAt ? new Date(fb.submittedAt).getTime() : 0;
      if (subMs && subMs < SCOPE_FROM_MS) continue;
      fbCount++;
      if (fb.submittedAt) hygAct_(actByApp, fb.applicationId, String(fb.submittedAt).substring(0, 10));   // #13: assessed
      eu(uid2).feedbackCount++;
      var ctx2 = jobCtx(fb.applicationId); var dju = edju(ctx2, uid2); dju.feedbackCount++;
      var ends = fb.applicationId ? evEndByAppUser[fb.applicationId + '|' + uid2] : null;
      if (ends && subMs) { var best = 0; for (var z = 0; z < ends.length; z++) { if (ends[z] <= subMs && ends[z] > best) best = ends[z]; }
        if (best) { var t = (subMs - best) / 3600000; byUser[uid2].turnSum += t; byUser[uid2].turnN++; dju.turnSum += t; dju.turnN++;
          // Matched a real scheduled interview -> this form IS interview feedback. Everything else is
          // application-review/screening feedback and must never be divided by the interview count.
          byUser[uid2].fbOnSched = (byUser[uid2].fbOnSched || 0) + 1; dju.fbOnSched = (dju.fbOnSched || 0) + 1; } }
    }
    cursor = (resp2.moreDataAvailable && resp2.nextCursor) ? resp2.nextCursor : null; pages++;
    if (cursor) Utilities.sleep(30);
  } while (cursor);
  Logger.log('applicationFeedback.list: ' + fbCount + ' scoped feedback, ' + pages + ' pages');

  var nameOf = function (uid) { return userNameById[uid] || ('User ' + uid.substring(0, 8)); };
  var interviewers = [];
  for (var u in byUser) { var b = byUser[u]; if (!b.interviews && !b.feedbackCount) continue;
    interviewers.push({ name: nameOf(u), userId: u, interviews: b.interviews, feedbackSubmitted: b.feedbackCount, feedbackOnScheduled: b.fbOnSched || 0, pendingFeedback: b.pending, byQuarter: b.byQuarter, byMonth: b.byMonth, byDay: b.byDay, avgTurnaroundHrs: b.turnN ? Math.round(b.turnSum / b.turnN * 10) / 10 : null }); }
  interviewers.sort(function (a, b) { return b.interviews - a.interviews; });
  var panelists = [];
  for (var dp in byDJU) for (var tt in byDJU[dp]) for (var uu in byDJU[dp][tt]) { var x = byDJU[dp][tt][uu];
    panelists.push({ dept: dp, jobTitle: x.title, jobId8: x.j8 || null, name: nameOf(uu), userId: uu, interviews: x.interviews, byQuarter: x.byQuarter, byMonth: x.byMonth, byDay: x.byDay, feedbackSubmitted: x.feedbackCount, feedbackOnScheduled: x.fbOnSched || 0, pendingFeedback: x.pending, turnN: x.turnN, turnSumHrs: Math.round(x.turnSum * 10000) / 10000, avgTurnaroundHrs: x.turnN ? Math.round(x.turnSum / x.turnN * 10) / 10 : null }); }
  return { interviewers: interviewers, panelists: panelists, totalInterviews: evCount, totalFeedback: fbCount, interviewsByQuarter: interviewsByQuarter, interviewsByMonth: interviewsByMonth, intAppsByQ: intAppsByQ, interviewsByJobQ: interviewsByJobQ, interviewsByJobM: interviewsByJobM, interviewsByJobD: interviewsByJobD, interviewsByDay: interviewsByDay, evNoJob: evNoJob, activityByApp: actByApp };
}

// Fast recon: verify createdAfter scoping + volume + shape on the two endpoints (run once before a full refresh).
function reconInterviews() {
  var r = ashbyPost_('/interviewSchedule.list', { limit: 5, createdAfter: SCOPE_FROM_MS });
  var s0 = (r.results || [])[0] || {};
  Logger.log('interviewSchedule.list: got=' + (r.results || []).length + ' more=' + r.moreDataAvailable + ' firstCreatedAt=' + s0.createdAt + ' events=' + ((s0.interviewEvents || []).length) + ' appId=' + s0.applicationId);
  var e0 = (s0.interviewEvents || [])[0] || {};
  Logger.log('  event: start=' + e0.startTime + ' end=' + e0.endTime + ' hasFb=' + e0.hasSubmittedFeedback + ' interviewers=' + JSON.stringify((e0.interviewers || []).map(function (x) { return x.userId; })));
  var f = ashbyPost_('/applicationFeedback.list', { limit: 5, createdAfter: SCOPE_FROM_MS });
  var f0 = (f.results || [])[0] || {};
  Logger.log('applicationFeedback.list: got=' + (f.results || []).length + ' more=' + f.moreDataAvailable + ' submittedAt=' + f0.submittedAt + ' evId=' + f0.interviewEventId + ' by=' + (f0.submittedByUser ? (f0.submittedByUser.firstName + ' ' + f0.submittedByUser.lastName) : null));
}

function refreshDashboardData() {
  var startTime = Date.now();
  Logger.log('=== Dashboard refresh (v4, createdAfter) scope=' + SCOPE_YEAR + ' ===');
  var existing = loadExistingDashboard_() || {};

  var deptMap = fetchDepartmentMap_();
  Logger.log('Departments: ' + Object.keys(deptMap).length);
  var allJobs = fetchJobs_();
  Logger.log('Jobs: ' + allJobs.length);

  function topDept(depId) { var d = deptMap[depId], g = 0; while (d && d.parentId && deptMap[d.parentId] && g++ < 8) d = deptMap[d.parentId]; return d ? d.name : ''; }

  // ===== #37 (Jerin, 7 Sep 2026): the "Test" department is a SANDBOX, not real hiring =====
  // It holds 'Test - Project Hello Christy - Sales PA' (43 candidates, 12 offer events, 2 'joiners') and a
  // stray closed 'Program Advisor' (3). Left in, they inflate Total Openings, Sourcing Mix, the org-wide
  // funnel and one recruiter's volume - most of what made Gopu Nair V look high-volume.
  // 🚨 They must be dropped HERE, at ingestion, for two reasons a frontend filter cannot cover:
  //   1. funnel / sourceCounts / recruiterCounts increment BEFORE the job lookup in the application loop,
  //      so dropping the JOBS alone would leave their applications counted with no job attached.
  //   2. sources / funnel / quarterly ship as PRE-COMPUTED totals - the frontend cannot un-count them.
  // Every excluded job id is collected so stores that do not flow through the application loop (the
  // archived-drop hits) can skip them too. Openings are filtered separately, just below.
  var EXCLUDED_DEPTS = { 'Test': 1 };
  var excludedJobIds = {};
  var jobsBeforeExcl_ = allJobs.length;
  allJobs = allJobs.filter(function (j) {
    var lf = deptMap[j.departmentId] ? deptMap[j.departmentId].name : '';
    if (EXCLUDED_DEPTS[topDept(j.departmentId) || lf] || EXCLUDED_DEPTS[lf]) { excludedJobIds[j.id] = 1; return false; }
    return true;
  });
  Logger.log('#37 excluded department(s) [' + Object.keys(EXCLUDED_DEPTS).join(', ') + ']: ' + (jobsBeforeExcl_ - allJobs.length) + ' job(s) dropped, ' + allJobs.length + ' kept');

  var jobLookup = {};
  allJobs.forEach(function(j) {
    var leaf = deptMap[j.departmentId] ? deptMap[j.departmentId].name : '';
    jobLookup[j.id] = { id: j.id, title: j.title, department: topDept(j.departmentId) || leaf, team: leaf, status: j.status,
      level: jobCustomField_(j, LEVEL_CF_ID), complexity: jobCustomField_(j, COMPLEXITY_CF_ID),
      employmentType: jobCustomFieldByTitle_(j, /employ/i),
      applied: 0, screen: 0, interview: 0, offer: 0, hired: 0, pipeline: emptyPipeline_(), recruiterSet: [] };
  });

  var allOpenings = fetchOpenings_();
  // #37: drop openings that belong ONLY to an excluded (sandbox) job. Every openings consumer below reads
  // this one array - openingBuckets, openingsNoDate, openingById_ (-> openingPendingByJobQ) and
  // computeOwnedSeatsByRecruiterQ_ - so filtering here is the single choke point for all of them.
  var openingsBeforeExcl_ = allOpenings.length;
  allOpenings = allOpenings.filter(function (o) {
    var ids = (o.latestVersion && o.latestVersion.jobIds) || [];
    if (!ids.length) return true;
    for (var z = 0; z < ids.length; z++) if (!excludedJobIds[ids[z]]) return true;
    return false;
  });
  Logger.log('#37 openings dropped: ' + (openingsBeforeExcl_ - allOpenings.length) + ', ' + allOpenings.length + ' kept');
  var openingsByJob = {};
  var openingsNoOpenedAt = 0;
  var openingsNoDate = [];
  // ===== #157 - the wiring for Specialization/Topic (SME Specific) =====
  // ONE ROW PER OPENING x JOB, pushed from inside the openingBuckets loop below, so every row here is an
  // opening that loop COUNTED - the rows reconcile with Total / Joined / Missed by construction rather than
  // by a second calculation (Rule 3). Scoped from 2026-Q3 because the dashboard shows nothing earlier (#127).
  // 🚨 Same grain as the buckets: an opening on two jobs yields two rows, exactly as it counts twice in Total.
  var OPENING_ROWS_FROM = '2026-Q3';
  var openingRows = [];
  var openingTopicStats = { scoped: 0, withTopic: 0, sme: 0, smeWithTopic: 0, jpTied: 0 };
  allOpenings.forEach(function(o) { if (o.isArchived) return; var ids = (o.latestVersion && o.latestVersion.jobIds) || []; ids.forEach(function(jid) { (openingsByJob[jid] || (openingsByJob[jid] = [])).push(o); }); });
  var openingsList = [];
  allJobs.forEach(function(j) {
    if (j.status !== 'Open') return;
    var jo = openingsByJob[j.id] || []; if (jo.length === 0) return;
    var filled = 0; jo.forEach(function(o) { if (o.closedAt) filled++; });
    var leaf = deptMap[j.departmentId] ? deptMap[j.departmentId].name : '';
    openingsList.push({ title: j.title, department: topDept(j.departmentId) || leaf, team: leaf, total: jo.length, filled: filled, open: jo.length - filled, openedAt: (j.openedAt || j.createdAt || '').substring(0, 10), jobId: j.id.substring(0, 8), status: 'Open' });
  });
  openingsList.sort(function(a, b) { return b.total - a.total; });
  // ===== openings quarter buckets (openings-quarter-model, 2026-08-20) — per DISTINCT opening x job x quarter =====
  var CR_HIRED = '2777221e-d3a7-40e6-95a3-6988ad60494d', CR_ONHOLD = '05105d39-d5f6-442c-b7bf-f6b055a50a43',
      CR_SHELVED = '63d32633-3047-458b-a9a2-fbf2d04738f2', CR_CARRYFWD = '249988e6-c53c-4d6e-b60d-dc78e145520d';
  var openingBuckets = {};
  allOpenings.forEach(function (o) {
    if (o.isArchived) return; // archived = gone: exclude from Total Openings, undated list & counts (Jerin 2026-09-06)
    var cr = o.closeReasonId;
    if (cr === CR_ONHOLD || cr === CR_SHELVED) return;
    // An opening with no openedAt was never actually opened. Do NOT fall back to
    // latestVersion.createdAt — that dumps never-opened/migrated openings into whatever
    // quarter the record was last touched, inflating the current quarter's target.
    var iso = o.openedAt || null;
    if (!iso) {
      // An opening with no openedAt is not merely undated - the bucket loop skips it, so it never reaches
      // Total Openings on HM Positions or Overall Efficiency Fulfilment. It is INVISIBLE, not late. Emit the
      // rows so Data Hygiene can list them for fixing in Ashby. ONE ROW PER OPENING (not per opening x job)
      // so the list length reconciles exactly with openingsNoOpenedAt.
      openingsNoOpenedAt++;
      var ndIds = (o.latestVersion && o.latestVersion.jobIds) || [];
      var ndJob = jobLookup[ndIds[0]] || {};
      openingsNoDate.push({ openingId: String(o.id || '').substring(0, 8),
        jobId8: ndIds[0] ? String(ndIds[0]).substring(0, 8) : '',
        title: ndJob.title || '', department: ndJob.department || '', team: ndJob.team || '',
        status: ndJob.status || '', jobs: ndIds.length, closed: !!o.closedAt });
      return;
    }
    var q = quarterIST_(iso); if (!q) return;   // #115: India time
    // #114 (14 Sep 2026): Ashby's own hire step marks the opening FILLED and stamps closedAt but leaves the close reason
    // BLANK - only Greenhouse-synced openings carry reason Hired. Testing the reason alone threw 133 Q3 positions that
    // people were hired into out of Total as 'migration junk'. Filled is the hire; the reason is only a fallback.
    var cls; if (o.openingState === 'Filled' || (o.closedAt && cr === CR_HIRED)) cls = 'joined'; else if (!o.closedAt) cls = 'open'; else if (cr === CR_CARRYFWD) cls = 'missed'; else return; // closed, not Filled, null/other reason = excluded from Total
    var jobIds = (o.latestVersion && o.latestVersion.jobIds) || [];
    // #129: the same count keyed by the India-time DAY the opening opened (the clock quarterIST_ reads), from
    // reportFloorDay_() on, so the From / To boxes can narrow Positions. A quarter's days add up to that quarter.
    var dOpen = dayIST_(iso); if (dOpen && dOpen < reportFloorDay_()) dOpen = null;
    // #157: the opening's own topic, and the fill-rate counters. Computed once per OPENING (not per
    // opening x job) so the stats count openings, while openingRows below keeps the bucket grain.
    var oTopic = openingCustomFieldByTitle_(o, /specializ|specialis/i);
    var oOwnerIds = [];
    ((o.latestVersion && o.latestVersion.hiringTeam) || []).forEach(function (mem) {
      if (mem.role === 'Recruiter' || mem.roleId === '22db8dc8-83f4-40de-8376-87efff4a6eb6') {
        if (mem.userId) oOwnerIds.push(mem.userId);
      }
    });
    var oInScope = (q >= OPENING_ROWS_FROM);
    if (oInScope) {
      openingTopicStats.scoped++;
      if (oTopic) openingTopicStats.withTopic++;
      var oDept0 = (jobLookup[jobIds[0]] || {}).department || '';
      if (oDept0 === 'SME - US' || oDept0 === 'SME - India') {
        openingTopicStats.sme++;
        if (oTopic) openingTopicStats.smeWithTopic++;
      }
    }
    jobIds.forEach(function (jid) {
      var jd = jobLookup[jid] || {}; var j8 = jid.substring(0, 8);
      var b = openingBuckets[j8] || (openingBuckets[j8] = { jobId8: j8, title: jd.title || '', department: jd.department || '', team: jd.team || '', status: jd.status || '', quarters: {} });
      var qq = b.quarters[q] || (b.quarters[q] = { total: 0, joined: 0, open: 0, missed: 0 });
      qq.total++; qq[cls]++;
      if (dOpen) { var bd = b.days || (b.days = {}); var dd = bd[dOpen] || (bd[dOpen] = { total: 0, joined: 0, open: 0, missed: 0 }); dd.total++; dd[cls]++; }
      // #157: emitted HERE, immediately after the bucket it belongs to, so a row can never exist for an
      // opening the buckets did not count, nor the reverse. jpTied is filled in after the offer overlay.
      // #157: the opening's own Recruiter role - the SAME source the Goal uses
      // (computeOwnedSeatsByRoleQ_ reads latestVersion.hiringTeam off this very object). Ids now, names
      // later: user.list has not been fetched at this point in the run.
      // 🚨 Carry the 1/n share too. The Goal splits an opening's credit between co-recruiters, so a topic
      // row that counted a whole opening per owner would NOT sum back to the Goal.
      // #169 (Jerin, 23 Sep 2026): "Opnings full name is needed in the opening column". The dashboard has only
      // ever carried the opening's 8-character id, which is no use to a person - the openings are NAMED
      // "IK-403 - <recruiter> - <Role Type> - <topic or NA>" (#159) and that name is what the team recognises.
      // 🚨 Read defensively across the shapes the opening object can take, because which one Ashby fills is not
      //    documented. The 'named' count in the log line below is the proof: if it comes back 0, the field is
      //    somewhere else and NOTHING on the dashboard is wrong - the column simply stays empty until it is fixed.
      if (oInScope) openingRows.push({ openingId: String(o.id || '').substring(0, 8), jobId8: j8,
        quarter: q, day: dOpen || null, state: cls, topic: oTopic, jpTied: 0,
        name: String(o.identifier || (o.latestVersion && (o.latestVersion.identifier || o.latestVersion.name)) || o.name || '').trim(),
        ownerIds: oOwnerIds, share: oOwnerIds.length ? Math.round((1 / oOwnerIds.length) * 10000) / 10000 : 0 });
    });
  });

  var appResult = fetchAndProcessApps_(startTime, jobLookup, excludedJobIds);
  Logger.log('Apps: ' + appResult.total + ' fetched, ' + appResult.scoped + ' scoped, ' + Math.round((Date.now() - startTime) / 1000) + 's');
  // Hand the reached-screening+ apps to the stage-history accumulator (runs as its own trigger).
  saveDriveJson_('scoped_apps.json', { generatedAt: new Date().toISOString(), apps: appResult.histApps });
  saveDriveJson_('archived_apps.json', { generatedAt: new Date().toISOString(), apps: appResult.archivedApps });
  Logger.log('archived_apps (for drop backfill): ' + appResult.archivedApps.length);
  // #167 (Jerin, 23 Sep 2026): pick up people archived SINCE the one-time backfill, so a drop stops vanishing.
  // Runs here, before dropEvents is built below, so anyone collected shows up in THIS run's numbers.
  try { collectNewArchivedLateStage_(appResult.archivedApps, startTime); }
  catch (e) { Logger.log('#167 collector failed (not fatal): ' + e); }
  Logger.log('scoped_apps (reached screening+): ' + appResult.histApps.length);
  var offerResult = fetchAndProcessOffers_(startTime, appResult.appMap, excludedJobIds);

  for (var jid in jobLookup) { var oj = offerResult.byJob[jid]; if (oj) { jobLookup[jid].offeredReal = oj.offered; jobLookup[jid].accepted = oj.accepted; } }

  // #25 (2026-08-24, approved by Jerin): openings[].joiningPending, jobs[].joiningPending and
  // offerEvents[].joiningPending are GONE. They were a THIRD definition of Joining Pending (an accepted
  // offer whose start date is still ahead) sitting in the data file beside the real one, with nothing
  // marking which was which - which is how three disagreeing JP numbers reached the screen.
  // The live definitions are joiningPendingCases[] (every PERSON in Ref Check / Documentation / Offer)
  // and openingPendingByJobQ (SEATS with a live linked offer). Do not add a fourth.
  // ===== openings pending overlay (JP #52, 2026-08-20) — open opening + live linked offer =====
  var openingById_ = {}; allOpenings.forEach(function (o) { openingById_[o.id] = o; });
  var pendingOpeningSet_ = {}, jpByRecruiter = {}, offerMissingLink = 0;
  var jpTiedByOpening8_ = {};   // #157: how many people in closing name THIS opening on their offer
  offerResult.events.forEach(function (e) {
    if (!e.offerOpeningId) { if (!(e.offerStatus && /declin|reject|cancel/i.test(e.offerStatus))) offerMissingLink++; return; }
    if (e.offerStatus && /declin|reject|cancel/i.test(e.offerStatus)) return;
    var o = openingById_[e.offerOpeningId];
    if (!o || o.closedAt) return;
    if (o.closeReasonId === CR_ONHOLD || o.closeReasonId === CR_SHELVED) return;
    pendingOpeningSet_[e.offerOpeningId] = true;
    // #157: the set above loses the count (one opening, many offers); this keeps it. Keyed on the same
    // 8-char id the rows use. This is the ONLY person-to-opening link the public API exposes - it stays 0
    // until whoever creates the offer picks an opening, which is the team habit, not a gap in the code.
    var op8_ = String(e.offerOpeningId).substring(0, 8);
    jpTiedByOpening8_[op8_] = (jpTiedByOpening8_[op8_] || 0) + 1;
    if (e.recruiter) jpByRecruiter[e.recruiter] = (jpByRecruiter[e.recruiter] || 0) + 1;
  });
  var openingPendingByJobQ = {};
  for (var opid_ in pendingOpeningSet_) {
    var o2 = openingById_[opid_]; if (!o2) continue;
    var iso2 = o2.openedAt || (o2.latestVersion && o2.latestVersion.createdAt) || o2.createdAt; if (!iso2) continue;
    var q2 = quarterIST_(iso2); if (!q2) continue;   // #115: India time
    ((o2.latestVersion && o2.latestVersion.jobIds) || []).forEach(function (jid2) {
      var j82 = jid2.substring(0, 8);
      var bb = openingPendingByJobQ[j82] || (openingPendingByJobQ[j82] = {});
      bb[q2] = (bb[q2] || 0) + 1;
    });
  }
  // #157: stamp the person-to-opening count onto the rows. It happens HERE, after the offer overlay, because
  // that is where offer -> opening is resolved; the rows themselves were built in the buckets loop above.
  // 🚨 A row is per opening x job, so summing jpTied across rows double-counts an opening that spans two
  // jobs - exactly as Total does. Sum it per job, never across the whole array.
  openingRows.forEach(function (r) { r.jpTied = jpTiedByOpening8_[r.openingId] || 0; });
  openingTopicStats.jpTied = Object.keys(jpTiedByOpening8_).length;
  Logger.log('#157 openings from ' + OPENING_ROWS_FROM + ': ' + openingTopicStats.scoped + ' scoped, '
    + openingTopicStats.withTopic + ' with a topic | SME ' + openingTopicStats.sme + ' of which '
    + openingTopicStats.smeWithTopic + ' with a topic | openings carrying a live linked offer: '
    + openingTopicStats.jpTied + ' | rows emitted: ' + openingRows.length
    + ' | named: ' + openingRows.filter(function (r) { return !!r.name; }).length);   // #169

  // user.list -> isEnabled (Active/Inactive) + userId -> name (panelist / interviewer display names)
  // 🚨 isEnabled is USELESS as an offboarding signal here: it is true for all 446 Ashby users (verified
  // 2026-08-22) because IK never disables accounts. The real signal is the SEAT: an active recruiter holds
  // an elevated seat - UI roles 'Recruiter' / 'Recruiter Admin', which the API reports as globalRole
  // 'Elevated Access' / 'Organization Admin'. Everyone else sits on 'Limited Access'.
  // Corroborated against activity: 12 of the 15 roster recruiters WITHOUT an elevated seat had ZERO
  // 2026-Q3 throughput while active in Q1/Q2 - the signature of having left.
  var RECRUITER_SEAT_ROLES = { 'Elevated Access': 1, 'Organization Admin': 1 };
  var enabledById = {}, userNameById = {}, roleById = {};
  try { ashbyListAll_('/user.list').forEach(function (u) { enabledById[u.id] = (u.isEnabled !== false); roleById[u.id] = u.globalRole || null; var nm = ((u.firstName || '') + ' ' + (u.lastName || '')).trim(); if (nm) userNameById[u.id] = nm; }); Logger.log('user.list: ' + Object.keys(enabledById).length + ' users'); } catch (e) { Logger.log('user.list failed: ' + e.message); }

  // #157: now that user.list has been read, turn the owner ids into names. Done here and not in the
  // buckets loop because userNameById does not exist yet at that point in the run.
  openingRows.forEach(function (r) {
    var nm = [];
    (r.ownerIds || []).forEach(function (uid) { if (userNameById[uid]) nm.push(userNameById[uid]); });
    r.owners = nm;
    delete r.ownerIds;   // ids are of no use to the frontend and only bloat a PUBLIC file
  });
  Logger.log('#157 opening owners resolved: ' + openingRows.filter(function (r) { return r.owners.length; }).length
    + ' of ' + openingRows.length + ' rows carry a recruiter');

  var jobsList = [];
  for (var jid2 in jobLookup) { var j2 = jobLookup[jid2]; if (j2.applied === 0) continue;
    jobsList.push({ id: j2.id.substring(0, 8), title: j2.title, department: j2.department, team: j2.team, level: j2.level, complexity: j2.complexity, status: j2.status, total: j2.applied, applied: j2.applied, screen: j2.screen, interview: j2.interview, offer: j2.offer, hired: j2.hired, pipeline: j2.pipeline, recruiters: j2.recruiterSet }); }
  jobsList.sort(function(a, b) { return b.applied - a.applied; });

  var recruitersList = [];
  var recruitersWithoutUserId = [], nameDrift = [];
  for (var rn in appResult.recruiterCounts) { var rc = appResult.recruiterCounts[rn]; if (rc.total <= 0) continue;
    var oR = offerResult.byRecruiter[rn]; if (oR) { rc.offeredReal = oR.offered; rc.joiningPending = jpByRecruiter[rn] || 0; rc.accepted = oR.accepted; }
    var bjArr = []; for (var bjid in rc.byJob) bjArr.push(rc.byJob[bjid]); rc.byJob = bjArr;
    // Identity is the Ashby USER RECORD, not the name string: isActive is a direct lookup of that user's
    // isEnabled flag. When no Ashby user resolves we must NOT quietly report 'Active' - that hides a
    // departed recruiter behind a guess, which is the same failure shape as the OA/feedback bugs. Record
    // the gap (dataQuality.recruitersWithoutUserId) and set activeKnown false so the UI shows 'unknown'.
    var rUid = appResult.recruiterUserId[rn] || null;
    rc.userId = rUid;
    rc.activeKnown = (rn === 'Unassigned') ? true : !!rUid;
    rc.seatRole = rUid ? (roleById[rUid] || null) : null;
    rc.isActive = (rn === 'Unassigned') ? true : (rUid ? !!RECRUITER_SEAT_ROLES[roleById[rUid]] : true);
    if (rn !== 'Unassigned' && !rUid) recruitersWithoutUserId.push(rn);
    if (rUid && userNameById[rUid] && userNameById[rUid] !== rn) nameDrift.push(rn + ' -> ' + userNameById[rUid]);
    recruitersList.push(rc); }
  recruitersList.sort(function(a, b) { return b.total - a.total; });
  if (nameDrift.length) Logger.log('WARN recruiter name differs from Ashby user record: ' + nameDrift.join(' | '));
  if (recruitersWithoutUserId.length) Logger.log('WARN recruiters with no Ashby user resolved (status shown as unknown): ' + recruitersWithoutUserId.join(', '));

  var sourcesList = [];
  for (var sn in appResult.sourceCounts) if (appResult.sourceCounts[sn].candidates > 0) sourcesList.push(appResult.sourceCounts[sn]);
  sourcesList.sort(function(a, b) { return b.candidates - a.candidates; });

  var weekKeys = Object.keys(appResult.weekCounts).sort();
  var velocity = weekKeys.slice(-8).map(function(w) { return { week: w, count: appResult.weekCounts[w] }; });

  var quarterly = {};
  for (var qk in appResult.qData) { var q = appResult.qData[qk];
    var qJobs = []; for (var jt in q.jobCounts) qJobs.push(q.jobCounts[jt]); qJobs.sort(function(a, b) { return b.applied - a.applied; });
    var qSrc = []; for (var st in q.sourceCounts) qSrc.push(q.sourceCounts[st]); qSrc.sort(function(a, b) { return b.candidates - a.candidates; });
    var qJobsH = qJobs.slice(); qJobsH.sort(function(a, b) { return b.hired - a.hired; });
        quarterly[qk] = { funnel: q.funnel, topJobs: qJobs.slice(0, 10), topJobsByHired: qJobsH.slice(0, 10), sources: qSrc }; }

  if (appResult.funnel.applied === 0) { Logger.log('WARNING: 0 scoped apps — keeping existing.'); return existing; }

  // Offer events enriched with job score-inputs (dept/level/complexity) — frontend does the 50/50 split-scoring.
  var jobBy8 = {}; for (var jk in jobLookup) jobBy8[jobLookup[jk].id.substring(0, 8)] = jobLookup[jk];
  var offerEvents = (offerResult.events || []).map(function (e) { var jd = jobBy8[e.jobId8] || null;
    var amE = appResult.appMap[e.applicationId] || null;
    return { jobId8: e.jobId8, jobTitle: jd ? jd.title : '', department: jd ? jd.department : '', level: jd ? jd.level : null, complexity: jd ? jd.complexity : null,
      employmentType: jd ? jd.employmentType : null,
      recruiter: e.recruiter, sourcer: e.sourcer, candidate: e.candidate, decidedAt: e.decidedAt, startDate: e.startDate, accepted: e.accepted,
      // Where this candidate came from, copied off the application. Lets Sourcing Mix count JOINERS by
      // source rather than applications by source.
      srcType: amE ? (amE.srcType || null) : null, srcName: amE ? (amE.srcName || null) : null,
      // DROP needs three things the events did not carry: the application's own status (a drop is an ARCHIVED
      // application), the opening the offer was made against, and that opening's quarter.
      // ⚠ The opening link here comes from the OFFER VERSION (o.latestVersion.openingId), which is a historical
      // snapshot and survives archiving. Do NOT try to read it off the application: Ashby CLEARS
      // application.opening the moment an application is archived (measured: Hired 1879 / Active 25 /
      // Archived 0 across all six opening statuses), so an application-side link is empty for every drop.
      appStatus: amE ? (amE.status || null) : null,
      // When they LEFT. A drop that was never decided has no decidedAt (14 offers sat at
      // WaitingOnCandidateResponse and 1 at WaitingOnApprovalStart while the application was archived),
      // so archivedAt is the only date that covers every drop. Confirmed against the application.list
      // reference 2026-08-22: archivedAt is ISO 8601 and null for anything not archived.
      archivedAt: (amE && amE.archivedAt) ? String(amE.archivedAt).substring(0, 10) : null,
      // WHY the application was archived. offerStatus alone is not enough: it reads CandidateRejected
      // for people the archive reason records as RejectedByOrg (e.g. "Lacking skill(s)/qualification(s)"),
      // so a drop labelled "candidate declined" is not evidence the candidate declined.
      archiveReason: (amE && amE.archiveReason) || null,
      archiveReasonType: (amE && amE.archiveReasonType) || null,
      openingId: e.offerOpeningId || null,
      openingQuarter: null,   // stamped below, once openQuarterOf_ exists
      // ⚠ An earlier note here called Created|Extended|Accepted|Declined|Cancelled the offerStatus enum.
      // It is actually the acceptanceStatus enum - see the corrected pair below. `accepted` cannot carry the
      // drop signal either, being just (status === 'Accepted'), so it lumps DECLINED together with
      // NOT-YET-DECIDED. ⚠ Drop is NOT computable from stage history: archived candidates never enter
      // scoped_apps.json, because that list is gated on reachedScreening and an archived candidate's current
      // stage title is 'Archived', which STAGE_KEY_MAP does not map. dropByRecruiterJobQ in the rollups is a
      // dead end from that attempt and always emits {} - ignore it.
      // Two DIFFERENT Ashby fields, confirmed against the offer.list reference 2026-08-22:
      //   offerStatus      (offerProcessStatus)    = WaitingOnApprovalStart | WaitingOnOfferApproval |
      //                    WaitingOnApprovalDefinition | WaitingOnCandidateResponse | CandidateRejected |
      //                    CandidateAccepted | OfferCancelled
      //   acceptanceStatus (offerAcceptanceStatus) = Accepted | Declined | Pending | Created | Cancelled
      // 'Declined' belongs to acceptanceStatus, NOT offerStatus — that mix-up is why matching offerStatus
      // against 'Declined' returned zero. Both are emitted so a drop can be split into candidate-declined
      // vs company-cancelled without another pipeline run.
      offerStatus: e.offerStatus || null, acceptanceStatus: e.acceptanceStatus || null,
      offerCreatedAt: e.offerCreatedAt || null, verN: e.verN || 0,
      openingIdAny: e.offerOpeningIdAny || null, openingQuarterAny: null,
      lateEntryAt: e.lateEntryAt || null, attrQuarter: null }; });
  // ---- #53 BROAD Joining-Pending cases: Ref Check / Documentation / Offer ----
  var OFFER_SUBSTAGE_ = { 'WaitingOnApprovalStart':'Offer Created', 'WaitingOnApprovalDefinition':'Offer Created', 'WaitingOnOfferApproval':'Offer Created', 'WaitingOnCandidateResponse':'Offer Sent', 'CandidateAccepted':'Offer Accepted' };
  var PRE_OFFER_SUBSTAGE_ = { 'Reference Check':'Ref Check', 'Document Submission':'Documentation' };
  var openQuarterOf_ = function(opid) {
    var oo = opid ? openingById_[opid] : null; if (!oo) return null;
    var iso = oo.openedAt || (oo.latestVersion && oo.latestVersion.createdAt) || oo.createdAt; if (!iso) return null;
    return quarterIST_(iso);   // #115: India time
  };
  // offerEvents is a 1:1 map of offerResult.events, so index i lines up. Stamped here rather than inside the
  // map above because openQuarterOf_ is a var-assigned function and is not defined yet at that point.
  // attrQuarter = the quarter this offer's work belongs to, best source first:
  //   1. the REAL opening, when the offer actually carries one (only 9% of offers today, 0% of drops)
  //   2. else the quarter the candidate first entered Ref Check / Documentation / Offer
  //   3. else the archive date, so a row is never silently unplaceable
  // ⚠ Only (1) is a measurement. (2) is a convention and (3) is a fallback - label them as such on screen.
  var qOfDate_ = function (ds) {
    if (!ds || String(ds).length < 7) return null;
    var y = String(ds).substring(0, 4), mo = parseInt(String(ds).substring(5, 7), 10);
    if (!mo) return null;
    return y + '-Q' + (Math.floor((mo - 1) / 3) + 1);
  };
  offerEvents.forEach(function (ev, i) { var se = offerResult.events[i];
    ev.openingQuarter = openQuarterOf_(se.offerOpeningId);
    ev.openingQuarterAny = openQuarterOf_(se.offerOpeningIdAny);
    ev.attrQuarter = ev.openingQuarter || qOfDate_(ev.lateEntryAt) || qOfDate_(ev.archivedAt) || null; });
  // ---- PRIVATE, DRIVE-ONLY: candidate contact details, for reconciling against the Hiring Tracker ----
  // 🚨 NEVER put email into dashboard.json. That file is pushed to a PUBLIC GitHub repo, so an email in it
  // becomes contactable personal data published on the open internet, permanently and indexably. This file
  // is written to DRIVE ONLY - the same restricted place scoped_apps.json and stage_events.json already
  // live - and is never pushed. Email is the only dependable join key to the tracker: candidate names
  // disagree constantly (middle names, order flips), whereas the tracker has an email on 100% of the rows
  // in scope. If a future change starts pushing this file, that is a personal-data incident, not a bug.
  saveDriveJson_('offer_contacts.json', { generatedAt: new Date().toISOString(),
    note: 'PRIVATE - contains candidate email addresses. Drive only. Never push to GitHub.',
    rows: offerEvents.map(function (ev, oi2) {
      var se2 = offerResult.events[oi2], am5 = appResult.appMap[se2.applicationId] || null;
      return { applicationId: se2.applicationId, email: (am5 && am5.email) || null, candidate: ev.candidate,
        jobTitle: ev.jobTitle, department: ev.department, decidedAt: ev.decidedAt, startDate: ev.startDate,
        appStatus: ev.appStatus, archivedAt: ev.archivedAt, attrQuarter: ev.attrQuarter,
        archiveReason: ev.archiveReason, archiveReasonType: ev.archiveReasonType,
        recruiter: ev.recruiter, level: ev.level, complexity: ev.complexity, employmentType: ev.employmentType,
        offerCreatedAt: ev.offerCreatedAt,   // when the offer was MADE - decidedAt is when the candidate answered
        openingQuarter: ev.openingQuarter, offerStatus: ev.offerStatus, accepted: ev.accepted,
        // #47 (V6): the audit could see an offer's opening QUARTER but not WHICH opening, so it could not
        // follow the link and fell back to guessing an opening by job x quarter count. That manufactured
        // 'no opening' rows for candidates that were correctly linked. Carry the id and the job id.
        openingId: ev.openingId || null, openingIdAny: ev.openingIdAny || null, jobId8: ev.jobId8 || null,
        // Drive-only audit field, read by buildAuditSheet(): an accepted offer whose start date is still
        // ahead. This is NOT the dashboard's Joining Pending and never leaves Drive.
        joiningPending: se2.joiningPending };
    }) });
  var jpCaseByApp_ = {};
  offerResult.events.forEach(function(e) {
    var sub3 = OFFER_SUBSTAGE_[e.offerStatus || ''] || null;
    if (!sub3) return;
    var am3 = appResult.appMap[e.applicationId] || null;
    if (am3 && (am3.status === 'Hired' || am3.status === 'Archived')) return;
    var jd3 = jobBy8[e.jobId8] || null;
    jpCaseByApp_[e.applicationId] = {
      openingQuarter: openQuarterOf_(e.offerOpeningId),
      month: e.startDate ? e.startDate.substring(0, 7) : null,
      doj: e.startDate || null,
      department: jd3 ? jd3.department : '',
      job: jd3 ? jd3.title : '',
      candidate: e.candidate || null,
      subStage: sub3,
      recruiter: e.recruiter || null,
      sourcer: e.sourcer || null,   // #11 sourcer - the credit split needs it on JP too
      jobId8: e.jobId8 || null,     // #120a: the job itself - a title alone matches two jobs for some titles
      linked: e.offerOpeningId ? true : false,
      // #161 (Jerin, 22 Sep): WHICH opening the offer names, 8 chars as openingRows carries it, so the person sits under that
      // opening's topic on the SME level. Null when the offer names none - the window then shows them on the job row.
      openingId: e.offerOpeningId ? String(e.offerOpeningId).substring(0, 8) : null
    };
  });
  for (var aid3 in appResult.appMap) {
    var am4 = appResult.appMap[aid3]; if (!am4) continue;
    if (jpCaseByApp_[aid3]) continue;
    var sub4 = am4.stage ? (PRE_OFFER_SUBSTAGE_[am4.stage] || null) : null;
    if (!sub4) continue;
    if (am4.status === 'Hired' || am4.status === 'Archived') continue;
    var jd4 = am4.jobId ? jobLookup[am4.jobId] : null;
    jpCaseByApp_[aid3] = { openingQuarter: null, month: null, doj: null, department: jd4 ? jd4.department : '', job: jd4 ? jd4.title : '', jobId8: am4.jobId ? String(am4.jobId).substring(0, 8) : null, candidate: am4.candidate || null, subStage: sub4, recruiter: am4.recruiter || null, sourcer: am4.sourcer || null, linked: false, openingId: null };
  }
  var joiningPendingCases = Object.keys(jpCaseByApp_).map(function(k) { return jpCaseByApp_[k]; });
  joiningPendingCases.sort(function(a, b) {
    var qa = a.openingQuarter || '', qb = b.openingQuarter || '';
    if (qa !== qb) { if (!qa) return 1; if (!qb) return -1; return qa > qb ? -1 : 1; }
    return (a.candidate || '') > (b.candidate || '') ? 1 : -1;
  });
  Logger.log('JP cases (broad): ' + joiningPendingCases.length);

  // ---- #58 unlinked-offer register: row-level data for the two Data Hygiene sub-tabs ----
  // ONE array; each row flagged needsFix so the tab counts can never disagree with the rows.
  // needsFix = still in play (it is in the broad cases list) | false = already Hired/Archived.
  var offerLinkGaps = [];
  offerResult.events.forEach(function(e) {
    if (e.offerOpeningId) return;
    if (/declin|reject|cancel/i.test(e.offerStatus || '')) return;
    var jdg = jobBy8[e.jobId8] || null;
    var amg = appResult.appMap[e.applicationId] || null;
    offerLinkGaps.push({
      candidate: e.candidate || null,
      job: jdg ? jdg.title : '',
      jobId8: e.jobId8 || null,   // #120b
      department: jdg ? jdg.department : '',
      recruiter: e.recruiter || null,
      doj: e.startDate || null,
      subStage: OFFER_SUBSTAGE_[e.offerStatus || ''] || 'Offer',
      offerCreatedAt: e.offerCreatedAt || null,   // #13: the date floor on the two opening-link lists (offer made OR DOJ)
      appStatus: (amg && amg.status) ? amg.status : 'Unknown',
      needsFix: jpCaseByApp_[e.applicationId] ? true : false
    });
  });
  offerLinkGaps.sort(function(a, b) {
    if (a.needsFix !== b.needsFix) return a.needsFix ? -1 : 1;
    return (a.recruiter || 'zzz') > (b.recruiter || 'zzz') ? 1 : -1;
  });
  Logger.log('offer link gaps: ' + offerLinkGaps.length + ' | needs fix: ' + offerLinkGaps.filter(function(r) { return r.needsFix; }).length);
  var uaRow = appResult.recruiterCounts['Unassigned'];
  var dataQuality = { recruitersWithoutUserId: recruitersWithoutUserId, unassigned: appResult.unassignedCases.slice(0, 800), unassignedTotal: uaRow ? uaRow.total : 0, offerMissingLink: offerMissingLink, openingsNoOpenedAt: openingsNoOpenedAt, excludedAsRecruiter: recruitersList.filter(function (r) { return r.name === 'G Darshan' && (r.total || 0) > 0; }).map(function (r) { return r.name; }),
    multiRecruiter: appResult.anomalies.multiRecruiter.slice(0, 200), multiSourcer: appResult.anomalies.multiSourcer.slice(0, 200),
    unmappedStages: appResult.unmappedStages || {} };
  Logger.log('ATTRIBUTION: recruiters(incl Unassigned)=' + recruitersList.length + ' | Unassigned total=' + dataQuality.unassignedTotal +
    ' | unassigned reached-screening+ list=' + dataQuality.unassigned.length + ' | multi-recruiter=' + appResult.anomalies.multiRecruiter.length +
    ' | multi-sourcer=' + appResult.anomalies.multiSourcer.length + ' | offerEvents=' + offerEvents.length + ' | joiningPendingCases=' + joiningPendingCases.length);

  // Interviewer / panelist pass (interviewSchedule.list + applicationFeedback.list). Runs LAST so a timeout here
  // never blocks the core dashboard; degrades to empty on failure.
  var ivResult = { interviewers: [], panelists: [], totalInterviews: 0, totalFeedback: 0 };
  try { ivResult = fetchAndProcessInterviews_(startTime, appResult.appMap, jobLookup, userNameById);
    Logger.log('Interviews: ' + ivResult.totalInterviews + ' events, ' + ivResult.totalFeedback + ' feedback, ' + ivResult.interviewers.length + ' interviewers, ' + ivResult.panelists.length + ' panelist rows'); }
  catch (e) { Logger.log('interview pass failed: ' + e.message); }

  // ===== Candidates Interviewed (Overview tile, 2026-08-25) =====
  // A candidate counts if they sat a PANEL INTERVIEW or took an ONLINE ASSESSMENT in the quarter.
  // The assessments run in external tools (HeyMilo, Trifle, HackerEarth); in Ashby they are the
  // 'Online Assessment' STAGE, not interview events, so interviewSchedule.list cannot see them.
  // The assessment side comes from stage_events.json (Drive-only, written by the stage-history job):
  // each app's stage timeline, so an entry with k === 'oa' is that candidate reaching the assessment.
  // The two sets are UNIONED by applicationId, never added - plenty of candidates do both in one quarter
  // and adding would count them twice. Only counts are emitted; no ids leave the server.
  var oaAppsByQ = {}, panelByQ = {}, assessedByQ = {}, candidatesInterviewedByQuarter = {};
  var hygActivity = ivResult.activityByApp || {};   // #13: reaching Online Assessment counts as assessed too (below)
  try {
    var _se = loadDriveJson_('stage_events.json') || {};
    var _qk2 = function (ds) { if (!ds || ds.length < 7) return null; return ds.substring(0, 4) + '-Q' + (Math.floor((parseInt(ds.substring(5, 7), 10) - 1) / 3) + 1); };
    for (var _aid in _se) {
      var _evs = (_se[_aid] && _se[_aid].ev) || [];
      for (var _n = 0; _n < _evs.length; _n++) {
        if (_evs[_n].k !== 'oa' || !_evs[_n].e) continue;
        hygAct_(hygActivity, _aid, _evs[_n].e);   // #13: assessed
        var _q = _qk2(_evs[_n].e); if (!_q) continue;
        (oaAppsByQ[_q] || (oaAppsByQ[_q] = {}))[_aid] = 1;
      }
    }
  } catch (e) { Logger.log('stage_events read for assessments failed: ' + e.message); }
  var _intByQ = ivResult.intAppsByQ || {}, _allQ = {};
  for (var _q1 in _intByQ) _allQ[_q1] = 1;
  for (var _q2 in oaAppsByQ) _allQ[_q2] = 1;
  for (var _q3 in _allQ) {
    var _u = {}, _n1 = 0, _n2 = 0, _c = 0, _k;
    var _a1 = _intByQ[_q3] || {}; for (_k in _a1) { _u[_k] = 1; _n1++; }
    var _a2 = oaAppsByQ[_q3] || {}; for (_k in _a2) { _u[_k] = 1; _n2++; }
    for (_k in _u) _c++;
    panelByQ[_q3] = _n1; assessedByQ[_q3] = _n2; candidatesInterviewedByQuarter[_q3] = _c;
  }
  // Year-level DISTINCT counts. The per-quarter maps above dedupe WITHIN a quarter, so the frontend adding
  // four quarters counted anyone assessed in two of them twice, under a card promising distinct people.
  // Defensive: the three maps are declared outside the try so a failure costs the year figure, not the run.
  var candidatesInterviewedByYear = {}, panelInterviewedByYear = {}, assessedByYear = {};
  try {
    var _yAcc = {};
    for (var _qy in _allQ) {
      var _yr = _qy.substring(0, 4);
      var _acc = _yAcc[_yr] || (_yAcc[_yr] = { i: {}, o: {} });
      var _si = _intByQ[_qy] || {}; for (var _k4 in _si) _acc.i[_k4] = 1;
      var _so = oaAppsByQ[_qy] || {}; for (var _k5 in _so) _acc.o[_k5] = 1;
    }
    for (var _yr2 in _yAcc) {
      var _uu = {}, _p = 0, _a = 0, _cc = 0, _k6;
      for (_k6 in _yAcc[_yr2].i) { _uu[_k6] = 1; _p++; }
      for (_k6 in _yAcc[_yr2].o) { _uu[_k6] = 1; _a++; }
      for (_k6 in _uu) _cc++;
      panelInterviewedByYear[_yr2] = _p; assessedByYear[_yr2] = _a; candidatesInterviewedByYear[_yr2] = _cc;
    }
    Logger.log('Candidates interviewed by YEAR (distinct across the year): ' + JSON.stringify(candidatesInterviewedByYear));
  } catch (e) { Logger.log('year-level interviewed rollup failed: ' + e.message); }
  // ===== #13 Data Hygiene date floor (Jerin, 14 Sep 2026) =====
  // Unassigned / Multiple Recruiters / Multiple Sourcers keep only applications ADDED (createdAt), INTERVIEWED (a held interview)
  // or ASSESSED (feedback submitted, or the Online Assessment stage entered) on or after HYGIENE_FLOOR. Each kept row carries
  // lastActivity = the latest of those days; newest first. dataQuality above already holds capped fallbacks, so a failure here
  // costs the floor (the site then says so) rather than the run.
  try {
    var hygKeep_ = function (rows, idKey, cap) {
      var kept = [];
      (rows || []).forEach(function (r) {
        var last = r.createdAt || '', act = hygActivity[r[idKey]];
        if (act && act > last) last = act;
        if (last >= HYGIENE_FLOOR) { r.lastActivity = last; kept.push(r); }
      });
      kept.sort(function (a, b) { return a.lastActivity < b.lastActivity ? 1 : (a.lastActivity > b.lastActivity ? -1 : 0); });
      return { rows: kept.slice(0, cap), total: kept.length };
    };
    var hygU = hygKeep_(appResult.unassignedCases, 'applicationId', 1500);
    var hygR = hygKeep_(appResult.anomalies.multiRecruiter, 'app', 500);
    var hygS = hygKeep_(appResult.anomalies.multiSourcer, 'app', 500);
    dataQuality.unassigned = hygU.rows; dataQuality.unassignedSinceFloor = hygU.total;
    dataQuality.multiRecruiter = hygR.rows; dataQuality.multiRecruiterSinceFloor = hygR.total;
    dataQuality.multiSourcer = hygS.rows; dataQuality.multiSourcerSinceFloor = hygS.total;
    dataQuality.hygieneFloor = HYGIENE_FLOOR;
    Logger.log('#13 hygiene floor ' + HYGIENE_FLOOR + ': unassigned ' + hygU.total + ' | multi-recruiter ' + hygR.total + ' | multi-sourcer ' + hygS.total);
  } catch (eHyg) { Logger.log('#13 hygiene floor failed: ' + eHyg.message); }

  Logger.log('Candidates interviewed by quarter: ' + JSON.stringify(candidatesInterviewedByQuarter) + ' (panel ' + JSON.stringify(panelByQ) + ', assessed ' + JSON.stringify(assessedByQ) + ')');

  // ===== DROP, unified (2026-08-26) =====
  // Jerin's definition: anyone who moved to Ref Check / Documentation / Offer in a quarter (earliest of the
  // three) and was then archived. Two sources, because neither alone covers everyone:
  //   1. archived OFFER records - the only source that reaches people whose application predates 2026
  //   2. archived_late_stage.json - applications that reached those stages with NO offer ever raised.
  //      Measured 2026-08-26: 63 such applications, 46 already had an offer record, 17 were invisible.
  //      Q2 alone gained 10 against a previous 20.
  // 🚨 DEDUPED BY APPLICATION, and each application carries ONE date - the EARLIEST late-stage entry. So a
  // candidate who bounced into the Offer stage three times is one row, not three. That double-counting is
  // what made a stage-entry count read 337 for Q2 when the truth was 178 people.
  // ⚠ One row per APPLICATION, not per person: somebody who applied to two roles and was archived from both
  // is two drops, because they are two separate hiring efforts.
  var dropEvents = [], seenDrop = {};
  offerEvents.forEach(function (ev, di) {
    if (ev.appStatus !== 'Archived') return;
    var se = offerResult.events[di];
    var aid = se && se.applicationId;
    if (aid) { if (seenDrop[aid]) return; seenDrop[aid] = 1; }
    dropEvents.push({ jobId8: ev.jobId8, jobTitle: ev.jobTitle, department: ev.department,
      recruiter: ev.recruiter || null, sourcer: ev.sourcer || null, level: ev.level, complexity: ev.complexity,
      quarter: ev.attrQuarter || null, source: 'offer',
      // #129: the DAY behind the date - the first Ref Check / Documentation / Offer arrival, else the archive date.
      day: ev.lateEntryAt || ev.archivedAt || null });
  });
  try {
    var lateStore = loadDriveJson_('archived_late_stage.json') || { hits: {} };
    var lateHits = lateStore.hits || {}, added = 0;
    for (var laid in lateHits) {
      if (seenDrop[laid]) continue;
      seenDrop[laid] = 1;
      var hit = lateHits[laid];
      if (hit && hit.j && excludedJobIds[hit.j]) continue;   // #37: sandbox department
      var jd3 = hit.j ? jobLookup[hit.j] : null;
      dropEvents.push({ jobId8: hit.j ? String(hit.j).substring(0, 8) : '', jobTitle: jd3 ? jd3.title : '',
        department: jd3 ? jd3.department : '', recruiter: hit.r || null,
        // #11 sourcer: archived_late_stage.json stores only {r,j,e} and re-running that 14k-id backfill to add
        // one field is not worth it - recover it from appMap, which carries every in-scope application.
        sourcer: (appResult.appMap[laid] && appResult.appMap[laid].sourcer) || null,
        level: jd3 ? jd3.level : null, complexity: jd3 ? jd3.complexity : null,
        quarter: qOfDate_(hit.e), source: 'stage', day: hit.e || null });   // #129: the day the quarter is cut from
      added++;
    }
    Logger.log('dropEvents: ' + dropEvents.length + ' total (' + (dropEvents.length - added) + ' from offers, ' + added + ' from late-stage archived apps with no offer)');
  } catch (eD) { Logger.log('late-stage drop merge skipped: ' + eD.message); }

  // #120b: title + department of EVERY in-scope job (jobs[] lists only some), so a department scope can place an
  // event, a rollup key or an owned opening whose job is not in jobs[]. Job titles and departments only - no people.
  var jobIndex_ = {};
  for (var _jx in jobLookup) { var _jl = jobLookup[_jx]; if (!_jl || excludedJobIds[_jx]) continue; jobIndex_[String(_jx).substring(0, 8)] = { title: _jl.title || '', department: _jl.department || '' }; }
  var dashboard = {
    lastUpdated: new Date().toISOString(), schemaVersion: 5, openingRows: openingRows, openingRowsFrom: OPENING_ROWS_FROM, openingTopicStats: openingTopicStats, ownedSeatsByRecruiterQ: computeOwnedSeatsByRecruiterQ_(allOpenings, (function(){var m={};recruitersList.forEach(function(r){if(r.userId)m[r.userId]=r.name;});return m;})()), ownedSeatsBySourcerQ: computeOwnedSeatsBySourcerQ_(allOpenings, userNameById), ownedSeatsPairQ: computeOwnedSeatsPairQ_(allOpenings, (function(){var m={};recruitersList.forEach(function(r){if(r.userId)m[r.userId]=r.name;});return m;})(), userNameById), externalUsers: (function(){ var o=[]; for (var _u in roleById) if (roleById[_u] === 'External Recruiter' && userNameById[_u]) o.push(userNameById[_u]); return o.sort(); })(), scopeYear: SCOPE_YEAR, velocityDays: VELOCITY_DAYS,
    funnel: appResult.funnel,
    openingBuckets: openingBuckets,
    openingPendingByJobQ: openingPendingByJobQ,
    openings: openingsList.length > 0 ? openingsList : (existing.openings || []),
    jobs: jobsList, recruiters: recruitersList, sources: sourcesList,
    weeklyVelocity: velocity, quarterly: quarterly, avgTimeToHire: 0,
    offerEvents: offerEvents, joiningPendingCases: joiningPendingCases, offerLinkGaps: offerLinkGaps, openingsNoDate: openingsNoDate, dataQuality: dataQuality,
    appReviewDwellByJob: appResult.appReviewDwellByJob, appReviewDwellByRecruiter: appResult.appReviewDwellByRecruiter, appReviewDwellByRecruiterJob: appResult.appReviewDwellByRecruiterJob || {},
    interviewers: ivResult.interviewers, panelists: ivResult.panelists, totalInterviews: ivResult.totalInterviews, interviewsByQuarter: ivResult.interviewsByQuarter, interviewsByMonth: ivResult.interviewsByMonth || {},
    candidatesInterviewedByQuarter: candidatesInterviewedByQuarter, panelInterviewedByQuarter: panelByQ, assessedByQuarter: assessedByQ,
    candidatesInterviewedByYear: candidatesInterviewedByYear, panelInterviewedByYear: panelInterviewedByYear, assessedByYear: assessedByYear,
    dropEvents: dropEvents,
    interviewsByJobQ: ivResult.interviewsByJobQ || {}, interviewsByJobM: ivResult.interviewsByJobM || {},
    // #129: day twins (keys from reportDayFloor on) so the From / To boxes can narrow every panel.
    reportDayFloor: reportFloorDay_(),
    interviewsByJobD: ivResult.interviewsByJobD || {}, interviewsByDay: ivResult.interviewsByDay || {},
    ownedSeatsPairD: computeOwnedSeatsPairQ_(allOpenings, (function(){var m={};recruitersList.forEach(function(r){if(r.userId)m[r.userId]=r.name;});return m;})(), userNameById, true),
    jobIndex: jobIndex_
  };
  assertDashboardComplete_(dashboard, existing);
  saveDashboardJson_(dashboard);
  Logger.log('=== Refresh v4 done: ' + appResult.funnel.applied + ' apps, ' + jobsList.length + ' jobs, ' + recruitersList.length + ' recruiters, ' + offerResult.count + ' offers, ' + Math.round((Date.now() - startTime) / 1000) + 's ===');
  // Mirror this project into the repo so the checked-in copy tracks what is actually running.
  // Wrapped: a sync failure must never take down the data refresh.
  try { pushSourceToGitHub(); } catch (e) { Logger.log("source sync error: " + e.message); }
  // #163b (Jerin, 23 Sep 2026: "Email still didnt land for the 6pm refersg"). It did not, and that was my
  // mistake: the email hung off manualRefresh_, but the 6 AM / 6 PM triggers call THIS function directly and
  // never go through that wrapper. Sending from here covers every refresh there is, which is what he asked for.
  try { notifyAdminsRefreshDone_(new Date(startTime), true, '', REFRESH_KIND_); }
  catch (e) { Logger.log('163 notify failed: ' + e); }
  return dashboard;
}

// ===== DRIVE I/O =====

function loadExistingDashboard_() {
  try { var folder = DriveApp.getFolderById(DASHBOARD_FOLDER_ID); var files = folder.getFilesByName('dashboard.json'); if (files.hasNext()) return JSON.parse(files.next().getBlob().getDataAsString()); }
  catch (e) { Logger.log('No existing dashboard.json: ' + e.message); }
  return null;
}
function saveDashboardJson_(data) {
  var folder = DriveApp.getFolderById(DASHBOARD_FOLDER_ID);
  var jsonStr = JSON.stringify(data, null, 2);
  var files = folder.getFilesByName('dashboard.json');
  if (files.hasNext()) files.next().setContent(jsonStr); else folder.createFile('dashboard.json', jsonStr, 'application/json');
  pushToGitHub_(jsonStr);
}

// ===== WIPE (clean rebuild) — deletes any residual state + the Drive dashboard.json =====

function wipeData() {
  var folder = DriveApp.getFolderById(DASHBOARD_FOLDER_ID);
  ['pipeline_state.json', 'dashboard.json'].forEach(function(name) {
    var f = folder.getFilesByName(name);
    while (f.hasNext()) { f.next().setTrashed(true); Logger.log('trashed ' + name); }
  });
  Logger.log('wipeData done — residual state + Drive dashboard.json cleared. Run refreshDashboardData to rebuild fresh (it overwrites GitHub too).');
}

// ===== GITHUB PUSH =====

function pushToGitHub_(jsonStr) { pushFileToGitHub_('data/dashboard.json', jsonStr, 'Update dashboard data'); }
function pushFileToGitHub_(repoPath, jsonStr, msg) {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('GITHUB_TOKEN'), repo = props.getProperty('GITHUB_REPO');
  if (!token || !repo) { Logger.log('GitHub push skipped: token/repo not set'); return; }
  var url = 'https://api.github.com/repos/' + repo + '/contents/' + repoPath;
  var sha = null;
  try { var g = UrlFetchApp.fetch(url, { headers: { 'Authorization': 'token ' + token, 'User-Agent': 'IK-Dashboard' }, muteHttpExceptions: true }); if (g.getResponseCode() === 200) sha = JSON.parse(g.getContentText()).sha; } catch (e) { Logger.log('GitHub SHA: ' + e.message); }
  var payload = { message: (msg || 'Update') + ' ' + new Date().toISOString(), content: Utilities.base64Encode(jsonStr, Utilities.Charset.UTF_8) };
  if (sha) payload.sha = sha;
  try { var p = UrlFetchApp.fetch(url, { method: 'put', headers: { 'Authorization': 'token ' + token, 'Content-Type': 'application/json', 'User-Agent': 'IK-Dashboard' }, payload: JSON.stringify(payload), muteHttpExceptions: true }); Logger.log('GitHub push ' + repoPath + ': ' + p.getResponseCode()); } catch (e) { Logger.log('GitHub push failed: ' + e.message); }
}
function pushCurrentDataToGitHub() { var d = loadExistingDashboard_(); if (!d) { Logger.log('No dashboard.json'); return; } pushToGitHub_(JSON.stringify(d, null, 2)); }

// ===== DRIVE JSON HELPERS =====

function saveDriveJson_(name, obj) {
  var folder = DriveApp.getFolderById(DASHBOARD_FOLDER_ID);
  var str = JSON.stringify(obj);
  var f = folder.getFilesByName(name);
  if (f.hasNext()) f.next().setContent(str); else folder.createFile(name, str, 'application/json');
}
function loadDriveJson_(name) {
  try { var folder = DriveApp.getFolderById(DASHBOARD_FOLDER_ID); var f = folder.getFilesByName(name); if (f.hasNext()) return JSON.parse(f.next().getBlob().getDataAsString()); } catch (e) { Logger.log('loadDriveJson ' + name + ': ' + e.message); }
  return null;
}

// ===== DROP BACKFILL: archived applications that reached a late stage =====
// WHY. Drop used to require an OFFER RECORD, because that was the only source covering archived people.
// That is a silent filter: someone archived out of Ref Check before anyone raised the offer is a real drop
// and was invisible. Their history is the only evidence, and an archived candidate's CURRENT stage reads
// 'Archived', so nothing but application.listHistory can answer 'did they ever reach a late stage'.
//
// SHAPE. One call per archived application (~14k, ~0.29s each => ~68 min), resumable on a cursor, on its own
// trigger. An archived application's history is FROZEN, so every id is pulled ONCE and never again - `done`
// is the permanent record of that. Only applications that actually reached Ref Check / Documentation / Offer
// are KEPT (`hits`); the rest are marked done and discarded, which is what keeps the store small.
//
// ⚠ This data feeds DROP ONLY. It is deliberately NOT fed into the velocity / throughput / time-in-stage
// rollups - doing so would move Momentum, Screening Efficiency, Throughput and Time in Process, tabs that
// have already been reviewed and signed off.
// ===== #167 (Jerin, 23 Sep 2026): drops were going MISSING =====
// Evan W. Carr reached Offer, sat 14 days, was archived "Withdrew from Process" - and appeared nowhere. He is
// a Drop by the agreed definition, and the dashboard could not see him.
// 🚨 WHY. dropEvents is built two ways: from an archived OFFER RECORD, and from archived_late_stage.json -
//    which was a ONE-TIME backfill of 14,064 ids on 26 Aug and was never added to again. Someone archived
//    after that date who never had an offer RECORD created fires NEITHER path. Reaching the Offer STAGE is not
//    the same as having an offer RECORD. The shape of the data agreed: 9 drops in July, 4 in August, 2 in Sept.
// 🔑 THE FIX IS NOT A NEW BACKFILL. archived_apps.json is rewritten on EVERY refresh, and the store already
//    marks what it has seen - so all that was ever missing was something to collect the NEW ones. This walks
//    the current archived list, skips everything already collected, and fetches only the remainder.
// ⚠ Rule 8b still holds: the 14k historical ids are NEVER re-collected. store.done/hits is exactly what makes
//   that true here - an id already in either map is skipped without a call.
// Bounded hard, because it runs inside the refresh: at most NEW_ARCH_CAP_ history calls and 90 seconds. If a
// backlog is bigger than that it drains over the next few runs rather than risking the refresh's own budget.
// The log line reports the REMAINING backlog, so it says plainly whether it is keeping up.
// #167b (23 Sep 2026, same night): the first run carrying this collector went from 825s to 1500s+ and was
// heading for the 30-minute ceiling. I do NOT yet know that the collector is the cause - the sweep's own log
// line will say - but the 6 AM run inherits this code, and a refresh that times out leaves the whole team on
// stale numbers overnight. So the budget comes down now as insurance, and the diagnosis follows the evidence.
// Cheaper per run simply means the backlog drains over more runs; nothing is lost either way.
var NEW_ARCH_CAP_ = 40;
var NEW_ARCH_MS_ = 45000;
var NEW_ARCH_SKIP_AFTER_MS_ = 8 * 60 * 1000;   // if the refresh has already used this long, do not start at all

function collectNewArchivedLateStage_(archivedApps, refreshStartedAt) {
  // The refresh comes FIRST. If it has already spent most of its budget, this stands down entirely rather
  // than risk the publish - the backlog will still be there next run.
  if (refreshStartedAt && (Date.now() - refreshStartedAt) > NEW_ARCH_SKIP_AFTER_MS_) {
    Logger.log('#167 sweep SKIPPED: the refresh has already run '
      + Math.round((Date.now() - refreshStartedAt) / 1000) + 's, leaving its budget alone');
    return 0;
  }
  var list = archivedApps || (loadDriveJson_('archived_apps.json') || {}).apps || [];
  if (!list.length) { Logger.log('#167: no archived apps to check'); return 0; }
  var store = loadDriveJson_('archived_late_stage.json') || { done: {}, hits: {} };
  if (!store.done) store.done = {};
  if (!store.hits) store.hits = {};

  // 🚨 #167c (23 Sep 2026): WALK IT BACKWARDS. The first run of this collector fetched its whole budget and
  // returned ZERO new drops - because application.list is OLDEST-FIRST, so archivedApps is too, and starting at
  // index 0 spends the entire budget on the oldest uncollected records while the person somebody is actually
  // asking about - archived today - sits at the far end and is never reached.
  // 🔑 Newest first is the only order that makes a capped backfill useful: every run collects the most recent
  //    archives, so today's drop appears on the very next run and the old backlog fills in behind it.
  var t0 = Date.now(), seen = 0, fetched = 0, kept = 0, errs = 0, undone = 0;
  for (var i = list.length - 1; i >= 0; i--) {
    var a = list[i];
    if (!a || !a.id) continue;
    seen++;
    if (store.done[a.id] || store.hits[a.id]) continue;   // collected already - never re-read (Rule 8b)
    undone++;
    if (fetched >= NEW_ARCH_CAP_ || Date.now() - t0 > NEW_ARCH_MS_) continue;   // count the rest, fetch none
    fetched++;
    try {
      var res = ashbyPost_('/application.listHistory', { applicationId: a.id });
      var hist = (res && (res.results || res.history)) || [];
      var earliest = null;
      for (var h = 0; h < hist.length; h++) {
        var ht = hist[h];
        if (!ht || !ht.enteredStageAt) continue;
        if (LATE_STAGES_[ht.title] && (!earliest || String(ht.enteredStageAt) < String(earliest))) earliest = ht.enteredStageAt;
      }
      store.done[a.id] = 1;
      // Only a LATE-stage arrival is a drop. Everyone else is marked done so they are never fetched again.
      if (earliest) { store.hits[a.id] = { r: a.r || null, j: a.j || null, e: String(earliest).substring(0, 10) }; kept++; }
    } catch (e) { errs++; }
  }
  if (fetched) saveDriveJson_('archived_late_stage.json', store);
  Logger.log('#167 new-archive sweep took ' + Math.round((Date.now() - t0) / 1000) + 's: ' + seen + ' archived, ' + undone + ' not yet collected, '
    + fetched + ' fetched this run, ' + kept + ' were late-stage (= new drops), ' + errs + ' errors, '
    + Math.max(0, undone - fetched) + ' left for the next run');
  return kept;
}

function backfillArchivedLateStage() {
  var startTime = Date.now();
  var list = (loadDriveJson_('archived_apps.json') || {}).apps || [];
  if (!list.length) { Logger.log('no archived_apps.json yet - run refreshDashboardData first'); return; }
  var store = loadDriveJson_('archived_late_stage.json') || { done: {}, hits: {} };
  if (!store.done) store.done = {}; if (!store.hits) store.hits = {};
  var state = loadDriveJson_('archived_backfill_state.json') || { cursor: 0 };
  var i = state.cursor, pulled = 0, kept = 0, errs = 0;
  for (; i < list.length; i++) {
    if (Date.now() - startTime > HIST_TIMEOUT_MS) {
      saveDriveJson_('archived_late_stage.json', store);
      saveDriveJson_('archived_backfill_state.json', { cursor: i, total: list.length });
      // SELF-CHAIN so a ~68-minute job does not need to be re-launched by hand three times.
      // delete-then-recreate, never a bare create: one-time triggers that accumulate are what hit the
      // per-script cap and would silently stop the 6AM/6PM refresh from scheduling.
      // Only the CUTOFF path re-arms. Completion does not, and neither does an error, so this cannot spin.
      try {
        ScriptApp.getProjectTriggers().forEach(function (tr) {
          if (tr.getHandlerFunction() === 'backfillArchivedLateStage') ScriptApp.deleteTrigger(tr);
        });
        ScriptApp.newTrigger('backfillArchivedLateStage').timeBased().after(1000).create();
        Logger.log('CUTOFF at ' + i + '/' + list.length + ' (pulled ' + pulled + ', kept ' + kept + ', errors ' + errs + ') - re-armed, continuing automatically');
      } catch (eT) {
        Logger.log('CUTOFF at ' + i + '/' + list.length + ' but could NOT re-arm: ' + eT.message + ' - run runDropBackfillOnce() again by hand');
      }
      return;
    }
    var a = list[i];
    if (!a || !a.id) continue;
    // done  = the original drop pass (late-stage arrivals). v2 = the same application re-read for its
    // HM Screening arrival, which ToFU needs and the first pass threw away. An application is skipped
    // only once BOTH passes have seen it, so adding v2 costs one more sweep and then nothing.
    if (store.done[a.id] && store.v2 && store.v2[a.id] && store.v3 && store.v3[a.id] && store.v4 && store.v4[a.id]) continue;
    try {
      var res = ashbyPost_('/application.listHistory', { applicationId: a.id });
      var hist = (res && (res.results || res.history)) || [];
      var earliest = null, hmEarliest = null, beyondR1 = null;
      // v4 (2026-08-30): the whole stage timeline, not just the three dates the earlier passes
      // kept. Throughput needs to know which stage an archived candidate was sitting in when a
      // feedback form was submitted, and applicationFeedback carries no stage of its own.
      var wins = [];
      for (var h = 0; h < hist.length; h++) {
        var ht = hist[h];
        if (!ht || !ht.enteredStageAt) continue;
        if (LATE_STAGES_[ht.title] && (!earliest || String(ht.enteredStageAt) < String(earliest))) earliest = ht.enteredStageAt;
        // ToFU needs the HM arrival of people who have since been archived. Without it a July ToFU
        // number shrinks every time somebody from July is rejected in August - the past quietly
        // rewriting itself, which is the one thing this metric must not do.
        if (STAGE_KEY_MAP[ht.title] === 'hmReview' && (!hmEarliest || String(ht.enteredStageAt) < String(hmEarliest))) hmEarliest = ht.enteredStageAt;
        // Screening Efficiency asks whether a candidate got PAST R1. For someone since archived the live
        // stage store holds nothing, so without this the answer defaults to 'no' — and 1,029 of 1,787 R1
        // bookings are archived, so the rate would read about 23% when the truth is higher. Record the
        // earliest stage beyond R1 here, on the same sweep that already has the history open.
        if (BEYOND_R1_[ht.title] && (!beyondR1 || String(ht.enteredStageAt) < String(beyondR1))) beyondR1 = ht.enteredStageAt;
        var wk = STAGE_KEY_MAP[ht.title];
        if (wk) wins.push({ k: wk, e: String(ht.enteredStageAt).substring(0, 10),
                            l: ht.leftStageAt ? String(ht.leftStageAt).substring(0, 10) : null });
      }
      store.done[a.id] = 1;
      if (!store.v2) store.v2 = {};
      store.v2[a.id] = 1;
      if (!store.v3) store.v3 = {};
      store.v3[a.id] = 1;
      if (!store.v4) store.v4 = {};
      store.v4[a.id] = 1;
      if (wins.length) { if (!store.win) store.win = {}; store.win[a.id] = wins; }
      if (hmEarliest) { if (!store.tofuHm) store.tofuHm = {}; store.tofuHm[a.id] = String(hmEarliest).substring(0, 10); }
      if (beyondR1) { if (!store.beyondR1) store.beyondR1 = {}; store.beyondR1[a.id] = String(beyondR1).substring(0, 10); }
      pulled++;
      // ONE record per application, so a candidate who bounced into Offer three times is counted once.
      if (earliest) { store.hits[a.id] = { r: a.r || null, j: a.j || null, e: String(earliest).substring(0, 10) }; kept++; }
    } catch (e) { errs++; }
    if (i > 0 && i % 500 === 0) Logger.log('  ' + i + '/' + list.length + ' (' + Math.round((Date.now() - startTime) / 1000) + 's, kept ' + kept + ')');
  }
  saveDriveJson_('archived_late_stage.json', store);
  saveDriveJson_('archived_backfill_state.json', { cursor: 0, total: list.length });
  try {
    ScriptApp.getProjectTriggers().forEach(function (tr) {
      if (tr.getHandlerFunction() === 'backfillArchivedLateStage') ScriptApp.deleteTrigger(tr);
    });
  } catch (eT2) { Logger.log('could not clear backfill trigger: ' + eT2.message); }
  Logger.log('=== drop backfill COMPLETE: ' + Object.keys(store.done).length + ' applications checked, ' +
    Object.keys(store.hits).length + ' reached a late stage (this run: pulled ' + pulled + ', kept ' + kept + ', errors ' + errs + ') ===');
}

// ===== STAGE-HISTORY ACCUMULATOR =====
// Pulls application.listHistory for the reached-screening+ apps (scoped_apps.json from the main run), builds a
// per-app stage timeline (stage_events.json), and emits stage_rollups.json — TRUE daily velocity bucketed by
// enteredStageAt (no bulk-update spike) + exact reached/cleared per job & recruiter for Throughput. Runs on its
// own trigger (full 30-min budget). Resumes via a cursor if it times out; emits rollups only when a full pass
// completes, then resets so the next cycle re-pulls (keeping stage changes current).

var HIST_TIMEOUT_MS = 1500000;    // 25-min safety cutoff
var ROLLUP_WINDOW_DAYS = 120;     // velocity days kept in the rollup (frontend shows <=30)

function refreshStageHistory() {
  var startTime = Date.now();
  Logger.log('=== stage-history accumulator ===');
  var scopedDoc = loadDriveJson_('scoped_apps.json');
  var scoped = (scopedDoc && scopedDoc.apps) || [];
  if (!scoped.length) { Logger.log('no scoped_apps.json yet — run refreshDashboardData first'); return; }

  var state = loadDriveJson_('stage_history_state.json') || { cursor: 0 };
  var events = state.cursor > 0 ? (loadDriveJson_('stage_events.json') || {}) : {};   // fresh at cycle start
  var pulled = 0, i = state.cursor;
  // Stage titles in the history feed that STAGE_KEY_MAP has no entry for. Logged at the end of the run:
  // an unmapped title is skipped outright, so without this a renamed stage just quietly stops counting.
  var unmappedHist = {};
  for (; i < scoped.length; i++) {
    if (Date.now() - startTime > HIST_TIMEOUT_MS) {
      saveDriveJson_('stage_events.json', events);
      saveDriveJson_('stage_history_state.json', { cursor: i, scopedCount: scoped.length });
      Logger.log('TIME CUTOFF at ' + i + '/' + scoped.length + ' — resume next run (' + pulled + ' pulled this run)');
      return;
    }
    var a = scoped[i];
    try {
      var resp = ashbyPost_('/application.listHistory', { applicationId: a.id });
      var hist = resp.results || resp.history || [];
      var ev = [], arch = null;
      for (var h = 0; h < hist.length; h++) {
        // 'Archived' is not a pipeline stage so it has no STAGE_KEY_MAP entry, but it is the ONLY record that a
        // candidate dropped out - Ashby moves them off their stage when archiving, so the main pull cannot see it.
        // Capture the day it happened before the unmapped-title skip throws it away, or Drop counts nothing.
        if (hist[h].title === 'Archived' && hist[h].enteredStageAt) { arch = dayKey_(new Date(hist[h].enteredStageAt).getTime()); }
        var k = STAGE_KEY_MAP[hist[h].title];
        if (!k) { if (hist[h].title) unmappedHist[hist[h].title] = (unmappedHist[hist[h].title] || 0) + 1; continue; }
        ev.push({ k: k, e: hist[h].enteredStageAt ? dayKey_(new Date(hist[h].enteredStageAt).getTime()) : null, l: hist[h].leftStageAt ? dayKey_(new Date(hist[h].leftStageAt).getTime()) : null });
      }
      events[a.id] = { r: a.r || null, j: a.j || null, ev: ev, x: arch, s: a.s || null };
      pulled++;
    } catch (e) { Logger.log('listHistory ' + a.id + ': ' + e.message); }
    if (i > 0 && i % 250 === 0) Logger.log('  ' + i + '/' + scoped.length + ' (' + Math.round((Date.now() - startTime) / 1000) + 's)');
  }
  saveDriveJson_('stage_events.json', events);
  var un = Object.keys(unmappedHist);
  if (un.length) Logger.log('STAGE HISTORY: ' + un.length + ' UNMAPPED stage title(s) skipped - ' + un.map(function (t) { return t + ' x' + unmappedHist[t]; }).join(', ') + '. Add them to STAGE_KEY_MAP or they count for nothing.');
  var rollups = computeStageRollups_(events);
  // ToFU (top of funnel), added 2026-08-26. Lives in Tofu.gs; merged in here so it travels in the same
  // rollups file the frontend already fetches. Wrapped because it makes its own API calls: if Ashby is
  // having a bad day the stage rollups still ship, one field lighter, rather than the whole run failing.
  try {
    var tofu = computeTofuRollups_(events);
    for (var tk in tofu) rollups[tk] = tofu[tk];
  } catch (eT) { Logger.log('ToFU pass FAILED (rollups still written without it): ' + eT.message); }
  // ASSESSED / PROGRESSED (2026-08-30) — the throughput measure that replaces reached/cleared, which
  // counted a rejection exactly like a promotion. Lives in Assess.gs; merged here so it travels in the
  // same rollups file the frontend already fetches. Same try/catch reasoning as ToFU: it makes its own
  // API calls, and a bad Ashby day should cost this field rather than the whole run.
  try {
    var assessed = computeAssessedRollups_(events);
    for (var ak in assessed) rollups[ak] = assessed[ak];
  } catch (eA) { Logger.log('ASSESSED pass FAILED (rollups still written without it): ' + eA.message); }
  saveDriveJson_('stage_rollups.json', rollups);
  pushFileToGitHub_('data/stage_rollups.json', JSON.stringify(rollups), 'Update stage rollups');
  saveDriveJson_('stage_history_state.json', { cursor: 0, scopedCount: scoped.length });   // reset -> re-pull next cycle
  Logger.log('=== stage-history done: ' + Object.keys(events).length + ' apps, ' + Math.round((Date.now() - startTime) / 1000) + 's ===');
  return rollups;
}

function computeStageRollups_(events) {
  var minDay = dayKey_(Date.now() - ROLLUP_WINDOW_DAYS * 86400000), todayKey = dayKey_(Date.now());
  var velByRec = {}, velByJob = {}, velByRecJob = {}, tpByJob = {}, tpByRec = {}, tisJob = {}, tisRec = {}, tisJobQ = {}, tisRecQ = {};
  var waitJob = {}, waitRec = {}, waitJobQ = {}, waitRecQ = {};
  // #120a/#120b: dwell per RECRUITER x JOB x quarter (finished and still-waiting kept apart, as below), so the Time in
  // Process recruiter rows can follow a Job filter or a department scope. No all-time twin: it is the sum of the quarters.
  var tisRecJobQ = {}, waitRecJobQ = {};
  // #129: the same dwell histograms keyed by the DAY the candidate entered the stage (e - the string qk is cut from),
  // from reportFloorDay_() on, so Time in Process can follow the From / To boxes. A quarter's days add up to that quarter.
  var tisJobD = {}, tisRecD = {}, tisRecJobD = {}, waitJobD = {}, waitRecD = {}, waitRecJobD = {}, floorD = reportFloorDay_();
  // Added 2026-08-21 after the filter audit: the quarter selector was only regrouping
  // pods (stage numbers were lifetime), and per-job rows under Screening had no source.
  var tpByJobQ = {}, tpByRecQ = {}, tpByRecJob = {};
  // ⚠ DROP IS NOT COMPUTED HERE, AND CANNOT BE — do not try this path again. Archived candidates never
  // reach this population: scoped_apps.json is gated on reachedScreening, and an archived candidate's
  // CURRENT stage title is 'Archived', which STAGE_KEY_MAP has no entry for, so they are filtered out
  // before the history job sees them. Including them would mean pulling listHistory for ~14,000 more
  // applications — roughly seven times the volume — which blows the run's time budget. Two attempts died
  // here: the 'Archived' TRANSITION (present for 30 of 2,134 apps) and application STATUS (never present,
  // per the gate above). Drop comes from offerEvents[].offerStatus === 'Declined' instead.
  function bump(o, day) { o[day] = (o[day] || 0) + 1; }
  // add one dwell sample (in days) to a {stage:{days:count}} histogram store
  function tis(store, key, stage, dw) { var s = store[key] || (store[key] = {}); var h = s[stage] || (s[stage] = {}); h[dw] = (h[dw] || 0) + 1; }
  // Same dwell histogram, split by the quarter the candidate ENTERED the stage — so "median days in
  // HM Review" can be read for one quarter instead of for all time. Added 2026-08-21: the Year/Quarter
  // selector was only regrouping pods on the three Time-in-Process panels, so Q1 and Q2 rendered the
  // same lifetime numbers under different headings. Bucketing on entry matches throughputBy*Q above.
  function tisQ(store, key, stage, qk, dw) { var s = store[key] || (store[key] = {}); var h = s[stage] || (s[stage] = {}); var q = h[qk] || (h[qk] = {}); q[dw] = (q[dw] || 0) + 1; }
  function tisRJQ(store, rec, j8, stage, qk, dw) { tisQ(store[rec] || (store[rec] = {}), j8, stage, qk, dw); }
  for (var id in events) {
    var d = events[id], rec = d.r, j8 = d.j ? String(d.j).substring(0, 8) : null;
    for (var n = 0; n < d.ev.length; n++) {
      var k = d.ev[n].k, e = d.ev[n].e, l = d.ev[n].l;
      if (j8) { var tj = tpByJob[j8] || (tpByJob[j8] = {}); var tjk = tj[k] || (tj[k] = { reached: 0, cleared: 0 }); tjk.reached++; if (l) tjk.cleared++; }
      if (rec) { var tr = tpByRec[rec] || (tpByRec[rec] = {}); var trk = tr[k] || (tr[k] = { reached: 0, cleared: 0 }); trk.reached++; if (l) trk.cleared++; }
      var qk = e ? (e.substring(0, 4) + '-Q' + (Math.floor((parseInt(e.substring(5, 7), 10) - 1) / 3) + 1)) : null;
      if (j8 && qk) { var qj = tpByJobQ[j8] || (tpByJobQ[j8] = {}); var qjk = qj[k] || (qj[k] = {}); var qjq = qjk[qk] || (qjk[qk] = { reached: 0, cleared: 0 }); qjq.reached++; if (l) qjq.cleared++; }
      if (rec && qk) { var qr = tpByRecQ[rec] || (tpByRecQ[rec] = {}); var qrk = qr[k] || (qr[k] = {}); var qrq = qrk[qk] || (qrk[qk] = { reached: 0, cleared: 0 }); qrq.reached++; if (l) qrq.cleared++; }
      if (rec && j8 && qk) { var rj = tpByRecJob[rec] || (tpByRecJob[rec] = {}); var rjj = rj[j8] || (rj[j8] = {}); var rjk = rjj[k] || (rjj[k] = {}); var rjq = rjk[qk] || (rjk[qk] = { reached: 0, cleared: 0 }); rjq.reached++; if (l) rjq.cleared++; }
      if (e && e >= minDay) {
        if (rec) { var vr = velByRec[rec] || (velByRec[rec] = {}); var vrk = vr[k] || (vr[k] = {}); bump(vrk, e); }
        if (j8) { var vj = velByJob[j8] || (velByJob[j8] = {}); var vjk = vj[k] || (vj[k] = {}); bump(vjk, e); }
        // recruiter x job x day — the grain Momentum's Job branch needs. Sits inside the same
        // ROLLUP_WINDOW_DAYS gate as the other velocity stores, so it stays bounded.
        if (rec && j8) { var rj = velByRecJob[rec] || (velByRecJob[rec] = {}); var rjj = rj[j8] || (rj[j8] = {}); var rjk = rjj[k] || (rjj[k] = {}); bump(rjk, e); }
      }
      // Time-in-stage dwell (days) — skip appReview (the main pull covers all still-parked App Review candidates).
      if (e && k !== 'appReview') {
        var dw = daysBetween_(e, l || todayKey); if (dw < 0) dw = 0; if (dw > 365) dw = 365;
        // FINISHED vs STILL-WAITING ARE KEPT APART (2026-08-30). Pooling them made the median measure the
        // CALENDAR, not the process: 250 of Q1's 265 TA Screen candidates never left the stage, so each one
        // contributed 'today minus entered' and the column read 192 days - one more every day, and impossible
        // to compare across quarters (Q1 192d / Q2 109d tracked 'days since that quarter', not any speed change).
        // timeInStageBy* is COMPLETED stays only. waitingBy* is how long the still-parked have been waiting.
        var finished = !!l;
        var sJob = finished ? tisJob : waitJob, sRec = finished ? tisRec : waitRec;
        var sJobQ = finished ? tisJobQ : waitJobQ, sRecQ = finished ? tisRecQ : waitRecQ;
        if (j8) tis(sJob, j8, k, dw);
        if (rec) tis(sRec, rec, k, dw);
        if (j8 && qk) tisQ(sJobQ, j8, k, qk, dw);
        if (rec && qk) tisQ(sRecQ, rec, k, qk, dw);
        if (rec && j8 && qk) tisRJQ(finished ? tisRecJobQ : waitRecJobQ, rec, j8, k, qk, dw);
        if (e >= floorD) {
          if (j8) tisQ(finished ? tisJobD : waitJobD, j8, k, e, dw);
          if (rec) tisQ(finished ? tisRecD : waitRecD, rec, k, e, dw);
          if (rec && j8) tisRJQ(finished ? tisRecJobD : waitRecJobD, rec, j8, k, e, dw);
        }
      }
    }
  }
  return { schemaVersion: 1, generatedAt: new Date().toISOString(), windowDays: ROLLUP_WINDOW_DAYS,
    velocityByRecruiter: velByRec, velocityByJob: velByJob, velocityByRecruiterJob: velByRecJob, throughputByJob: tpByJob, throughputByRecruiter: tpByRec, throughputByJobQ: tpByJobQ, throughputByRecruiterQ: tpByRecQ, throughputByRecruiterJob: tpByRecJob,
    timeInStageByJob: tisJob, timeInStageByRecruiter: tisRec, timeInStageByJobQ: tisJobQ, timeInStageByRecruiterQ: tisRecQ,
    tisSchema: 2, waitingByJob: waitJob, waitingByRecruiter: waitRec, waitingByJobQ: waitJobQ, waitingByRecruiterQ: waitRecQ,
    timeInStageByRecruiterJobQ: tisRecJobQ, waitingByRecruiterJobQ: waitRecJobQ,
    dayFloor: floorD, timeInStageByJobD: tisJobD, timeInStageByRecruiterD: tisRecD, timeInStageByRecruiterJobD: tisRecJobD,
    waitingByJobD: waitJobD, waitingByRecruiterD: waitRecD, waitingByRecruiterJobD: waitRecJobD };
}

function triggerStageHistoryNow() {
  ScriptApp.newTrigger('refreshStageHistory').timeBased().after(1000).create();
  Logger.log('refreshStageHistory scheduled in ~1s (30-min budget)');
}
// #129 (15 Sep 2026): rebuild stage_rollups.json from the STORED stage history, without re-pulling it - the tail of
// refreshStageHistory. Refuses while a history cycle is part-way (stage_events.json then holds only part of the new
// cycle), and publishes nothing if the ToFU or assessed pass fails. Run it from a time trigger: those two passes make
// their own API calls and can outlast the editor's 6 minutes.
function rebuildStageRollupsNow() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'rebuildStageRollupsNow') ScriptApp.deleteTrigger(t); });
  var state = loadDriveJson_('stage_history_state.json') || { cursor: 0 };
  if (state.cursor > 0) { Logger.log('rebuildStageRollupsNow REFUSED: a history cycle is part-way (' + state.cursor + '/' + state.scopedCount + ')'); return; }
  var events = loadDriveJson_('stage_events.json') || {};
  if (!Object.keys(events).length) { Logger.log('rebuildStageRollupsNow REFUSED: stage_events.json is empty'); return; }
  var rollups = computeStageRollups_(events);
  try { var tofu = computeTofuRollups_(events); for (var tk in tofu) rollups[tk] = tofu[tk]; }
  catch (eT) { Logger.log('rebuildStageRollupsNow STOPPED, nothing published - ToFU pass failed: ' + eT.message); return; }
  try { var assessed = computeAssessedRollups_(events); for (var ak in assessed) rollups[ak] = assessed[ak]; }
  catch (eA) { Logger.log('rebuildStageRollupsNow STOPPED, nothing published - assessed pass failed: ' + eA.message); return; }
  saveDriveJson_('stage_rollups.json', rollups);
  pushFileToGitHub_('data/stage_rollups.json', JSON.stringify(rollups), 'Update stage rollups');
  Logger.log('=== rollups rebuilt from ' + Object.keys(events).length + ' stored applications ===');
}
function setupStageHistoryTriggers() {
  ScriptApp.getProjectTriggers().forEach(function(t) { if (t.getHandlerFunction() === 'refreshStageHistory') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('refreshStageHistory').timeBased().atHour(7).everyDays(1).inTimezone('Asia/Kolkata').create();
  ScriptApp.newTrigger('refreshStageHistory').timeBased().atHour(19).everyDays(1).inTimezone('Asia/Kolkata').create();
  Logger.log('Stage-history triggers set: 7 AM and 7 PM IST (1h after main refresh)');
}

// ===== TRIGGERS / MANUAL =====

// #163 (Jerin, 23 Sep 2026): every Admin is told when a MANUAL refresh has FINISHED. The Refresh button only
// ever said "scheduled", which is the moment nobody needs - the useful one is when the new numbers are actually
// there. The 6 AM / 6 PM runs do not come through here, so they stay silent as before.
// The refresh itself is unchanged: it still runs first, and its trigger is still cleaned up even when it throws.
// #163b: which KIND of refresh this execution is. A global is enough - manualRefresh_ and
// refreshDashboardData run inside the SAME execution, and a scheduled run never touches it.
var REFRESH_KIND_ = 'scheduled';

function manualRefresh_() {
  REFRESH_KIND_ = 'manual';
  var startedAt = new Date();
  var ok = true, err = '';
  try { refreshDashboardData(); } catch (e) { ok = false; err = String((e && e.message) || e); }
  ScriptApp.getProjectTriggers().forEach(function(t) { if (t.getHandlerFunction() === 'manualRefresh_') ScriptApp.deleteTrigger(t); });
  // Success is emailed from the END of refreshDashboardData now, so only a FAILURE is reported here -
  // otherwise a manual refresh would send twice.
  if (!ok) {
    try { notifyAdminsRefreshDone_(startedAt, false, err, 'manual'); } catch (e2) { Logger.log('163 notify failed: ' + e2); }
    throw new Error(err);
  }
}

// #163. Admins come from the PUBLISHED access.json - the same list #124 made the authority for who may publish -
// so adding or removing an admin there changes who is told, and there is no second list to keep in step.
// MailApp is already consented (added for #118 Send invite, 14 Sep), so this adds no new OAuth scope and cannot
// break the installable triggers. Never lets a mail problem fail the refresh: the caller swallows what this throws.
function notifyAdminsRefreshDone_(startedAt, ok, err, kind) {
  // #163c (Jerin, 23 Sep 2026: "No email received"). It ran and said NOTHING, because I wrote two silent
  // returns and no logging - "never let a mail problem fail the refresh" turned into "never let anyone find out
  // why". Every exit now names itself in the log, so ONE more run explains it instead of another guess.
  var access = null;
  try { access = loadDriveJson_('access.json'); }
  catch (e) { Logger.log('#163 NO EMAIL: access.json could not be read: ' + e); return; }
  if (!access) { Logger.log('#163 NO EMAIL: access.json read as empty'); return; }
  var admins = ((access && access.users) || []).filter(function (u) {
    return u && u.email && String(u.role || '').toLowerCase() === 'admin';
  }).map(function (u) { return u.email; });
  Logger.log('#163 admins found: ' + admins.length);
  if (!admins.length) { Logger.log('#163 NO EMAIL: no user in access.json has role=admin'); return; }

  var tz = 'Asia/Calcutta';
  var finished = Utilities.formatDate(new Date(), tz, 'd MMM yyyy, h:mm a');
  var mins = Math.max(1, Math.round((new Date().getTime() - startedAt.getTime()) / 60000));
  var site = 'https://hiring.interviewkickstart.com';
  var which = (kind === 'manual') ? 'manual refresh' : 'scheduled refresh';
  var subject = ok ? 'Hiring Dashboard: ' + which + ' finished' : 'Hiring Dashboard: ' + which + ' FAILED';
  var lead = ok
    ? 'The ' + which + ' has finished. The dashboard is showing the new numbers.'
    : 'The ' + which + ' did not finish. The dashboard is still showing the previous numbers, which is the safe outcome - nothing was overwritten.';
  var body = '<div style="font:14px/1.55 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a">'
    + '<p style="margin:0 0 12px">' + lead + '</p>'
    + '<p style="margin:0 0 12px;color:#6b7391">Finished ' + finished + ' IST, about ' + mins + ' minute' + (mins === 1 ? '' : 's') + ' after it was started.</p>'
    + (ok ? '' : '<p style="margin:0 0 12px;color:#b45a72">' + String(err || 'no message').replace(/[<>]/g, '') + '</p>')
    + '<p style="margin:0 0 12px;color:#6b7391">If you already had the dashboard open, that tab will offer you a Reload.</p>'
    + '<p style="margin:0"><a href="' + site + '" style="color:#4E6BA6">Open the Hiring Dashboard</a></p></div>';
  // Its own try, so a send failure is reported as a SEND failure and not mistaken for anything else.
  // getRemainingDailyQuota is logged too: a quota wall is silent otherwise and looks identical to success.
  try {
    Logger.log('#163 sending to ' + admins.length + ' admin(s); MailApp quota left: ' + MailApp.getRemainingDailyQuota());
    MailApp.sendEmail({ to: admins.join(','), subject: subject, htmlBody: body, name: 'IK Hiring Dashboard' });
    Logger.log('#163 EMAIL SENT (' + which + ')');
  } catch (eSend) {
    Logger.log('#163 NO EMAIL: MailApp.sendEmail threw: ' + eSend);
    throw eSend;   // let the caller log it too - this must never be swallowed in silence again
  }
}
function serveJsonData() { var d = loadExistingDashboard_(); return ContentService.createTextOutput(JSON.stringify(d || { error: 'No data' })).setMimeType(ContentService.MimeType.JSON); }
function setupTwiceDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) { if (t.getHandlerFunction() === 'refreshDashboardData') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('refreshDashboardData').timeBased().atHour(6).everyDays(1).inTimezone('Asia/Kolkata').create();
  ScriptApp.newTrigger('refreshDashboardData').timeBased().atHour(18).everyDays(1).inTimezone('Asia/Kolkata').create();
  Logger.log('Triggers set: 6 AM and 6 PM IST');
}
function triggerRefreshNow() {
  ScriptApp.getProjectTriggers().forEach(function(t) { if (t.getHandlerFunction() === 'refreshDashboardData' && t.getTriggerSource() === ScriptApp.TriggerSource.CLOCK) ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('refreshDashboardData').timeBased().after(1000).create();
  Logger.log('refreshDashboardData scheduled in ~1s (30-min timeout)');
}

// ===== TEST =====

function testApiConnection() {
  try { Logger.log('key ' + getAshbyApiKey_().substring(0, 8) + '...'); Logger.log('job.list: ' + ((ashbyPost_('/job.list', { limit: 1 }).results || []).length)); Logger.log('application.list createdAfter: ' + ((ashbyPost_('/application.list', { limit: 3, createdAfter: SCOPE_FROM_MS }).results || []).length) + ' (first=' + ((ashbyPost_('/application.list', { limit: 1, createdAfter: SCOPE_FROM_MS }).results || [{}])[0].createdAt) + ')'); Logger.log('OK'); }
  catch (e) { Logger.log('FAIL: ' + e.message); }
}


// #1 opening-first reporting (2026-09): per recruiter x quarter x job8 count of the openings a recruiter
// OWNS (the opening's native-Roles 'Recruiter'). The Recruiter tab derives Goal from this instead of the
// equal-split-of-seats convention. Scope = open + filled + missed openings opened in the quarter (mirrors
// openingBuckets Total). Shared openings (2+ Recruiter owners) split 1/n. Keyed by recruiter NAME resolved
// via userId so it matches recruiters[].name (avoids Ashby display-name drift).
// #11 (Jerin, 7 Sep 2026) - the agency/sourcer credit split needs the opening's SOURCER as well as its
// Recruiter. No sourcer-ownership data existed at all, so the GOAL half of the split could not be computed
// and shipping the achievement half alone would have halved Achieved while Goal stayed full - a fake
// collapse in Delta and Capacity Utilisation. Both roles count by identical rules: same quarter bucketing,
// same close-reason filter, same equal split if an opening somehow carries two people in one role.
// ⚠ Pass the FULL user map (userNameById) for the sourcer, NOT the recruiter roster - an agency is not a
// recruiter, so a roster-only lookup would silently drop exactly the rows this rule exists to score.
function computeOwnedSeatsByRecruiterQ_(allOpenings, uidToName) {
  return computeOwnedSeatsByRoleQ_(allOpenings, uidToName, 'Recruiter', '22db8dc8-83f4-40de-8376-87efff4a6eb6');
}
function computeOwnedSeatsBySourcerQ_(allOpenings, uidToName) {
  return computeOwnedSeatsByRoleQ_(allOpenings, uidToName, 'Sourcer', '952a945b-4f74-44cd-be85-2acba0248822');
}
function computeOwnedSeatsByRoleQ_(allOpenings, uidToName, roleName, RID) {
  var CR_HIRED = '2777221e-d3a7-40e6-95a3-6988ad60494d', CR_ONHOLD = '05105d39-d5f6-442c-b7bf-f6b055a50a43',
      CR_SHELVED = '63d32633-3047-458b-a9a2-fbf2d04738f2', CR_CARRYFWD = '249988e6-c53c-4d6e-b60d-dc78e145520d';
  var owned = {};
  (allOpenings || []).forEach(function (o) {
    var lv = o.latestVersion || {}, cr = o.closeReasonId;
    if (o.isArchived) return;   // #114 (14 Sep 2026): archived = gone, exactly as openingBuckets (Jerin 6 Sep). This was missing, so 44 archived Q3 openings sat in the Goal.
    if (cr === CR_ONHOLD || cr === CR_SHELVED) return;
    var iso = o.openedAt; if (!iso) return;
    var q = quarterIST_(iso); if (!q) return;   // #115: India time
    if (o.closedAt && o.openingState !== 'Filled' && cr !== CR_HIRED && cr !== CR_CARRYFWD) return;   // #114: Filled = hired, reason or not (same rule as openingBuckets)
    var ht = lv.hiringTeam || [], owners = [];
    ht.forEach(function (m) { if (m.role === roleName || m.roleId === RID) { var nm = uidToName[m.userId]; if (nm) owners.push(nm); } });
    if (!owners.length) return;
    var n = owners.length, jobIds = lv.jobIds || [];
    jobIds.forEach(function (jid) {
      var j8 = String(jid).substring(0, 8);
      owners.forEach(function (nm) { var bq = owned[nm] || (owned[nm] = {}); var bj = bq[q] || (bq[q] = {}); bj[j8] = Math.round(((bj[j8] || 0) + 1 / n) * 10000) / 10000; });
    });
  });
  return owned;
}

// ===== #100 (10 Sep 2026): the recruiter AND the sourcer, read off the SAME opening =====
// computeOwnedSeatsByRoleQ_ answers 'how many openings of this job does this person hold this role on' - it
// never says WHICH openings. The Recruiter tab's Goal needs the pairing, because a sourcer who worked SOME of
// a job's openings had their split applied to ALL of them: the recruiter handed over every opening on the job
// while the sourcer was credited only for theirs, and the difference vanished. Measured on 2026-Q3: Oshin
// owned 6 openings on 7c1706f1 and Sangha sourced 4 - all 6 left Oshin, 4 reached Sangha, 2 disappeared.
//
// Shape: ownedSeatsPairQ[quarter][job8] = [ { r: recruiterName, s: sourcerName, n: openings } ]
// #129: with byDay = true the outer key is the India-time DAY the opening opened instead (ownedSeatsPairD, from reportFloorDay_()).
// Every opening lands in exactly ONE bucket, so the two shares always add back to the whole.
//
// WARNING: IDENTICAL scoping rules to computeOwnedSeatsByRoleQ_ on purpose - same close-reason filter, same
//   quarter bucketing from openedAt, same 1/n share when a role is held by more than one person. Change one,
//   change both, or the Goal will stop reconciling with openingBuckets.
// WARNING: recById is the RECRUITER ROSTER; allById is the FULL user map. An agency is not a recruiter, so
//   looking the sourcer up in the roster would silently drop exactly the rows the credit split exists to score.
// WARNING: '' is a real, meaningful key: { s: '' } means 'no sourcer, the recruiter keeps it all'; { r: '' }
//   means an opening carrying a sourcer but no recruiter.
function computeOwnedSeatsPairQ_(allOpenings, recById, allById, byDay) {
  var CR_HIRED = '2777221e-d3a7-40e6-95a3-6988ad60494d', CR_ONHOLD = '05105d39-d5f6-442c-b7bf-f6b055a50a43',
      CR_SHELVED = '63d32633-3047-458b-a9a2-fbf2d04738f2', CR_CARRYFWD = '249988e6-c53c-4d6e-b60d-dc78e145520d';
  var RID_REC = '22db8dc8-83f4-40de-8376-87efff4a6eb6', RID_SRC = '952a945b-4f74-44cd-be85-2acba0248822';
  var out = {};
  (allOpenings || []).forEach(function (o) {
    var lv = o.latestVersion || {}, cr = o.closeReasonId;
    if (o.isArchived) return;   // #114 (14 Sep 2026): archived = gone, exactly as openingBuckets (Jerin 6 Sep). This was missing, so 44 archived Q3 openings sat in the Goal.
    if (cr === CR_ONHOLD || cr === CR_SHELVED) return;
    var iso = o.openedAt; if (!iso) return;
    var q = quarterIST_(iso); if (!q) return;   // #115: India time
    if (o.closedAt && o.openingState !== 'Filled' && cr !== CR_HIRED && cr !== CR_CARRYFWD) return;   // #114: Filled = hired, reason or not (same rule as openingBuckets)
    if (byDay) { q = dayIST_(iso); if (!q || q < reportFloorDay_()) return; }   // #129
    var ht = lv.hiringTeam || [], recs = [], srcs = [];
    ht.forEach(function (mm) {
      if (mm.role === 'Recruiter' || mm.roleId === RID_REC) { var a = recById[mm.userId]; if (a) recs.push(a); }
      if (mm.role === 'Sourcer'   || mm.roleId === RID_SRC) { var b = allById[mm.userId]; if (b) srcs.push(b); }
    });
    if (!recs.length && !srcs.length) return;
    if (!recs.length) recs = [''];
    if (!srcs.length) srcs = [''];
    var n = recs.length * srcs.length, jobIds = lv.jobIds || [];
    jobIds.forEach(function (jid) {
      var j8 = String(jid).substring(0, 8);
      var bq = out[q] || (out[q] = {}), arr = bq[j8] || (bq[j8] = []);
      recs.forEach(function (rn) {
        srcs.forEach(function (sn) {
          var hit = null;
          for (var i = 0; i < arr.length; i++) if (arr[i].r === rn && arr[i].s === sn) { hit = arr[i]; break; }
          if (!hit) { hit = { r: rn, s: sn, n: 0 }; arr.push(hit); }
          hit.n = Math.round((hit.n + 1 / n) * 10000) / 10000;
        });
      });
    });
  });
  return out;
}



// ===== PUBLISH GUARD — refuse to overwrite good data with a partial build (added 2026-09-06) =====
var GUARD_REQUIRED_KEYS = ['openingBuckets','ownedSeatsByRecruiterQ','openingPendingByJobQ','jobs','recruiters','sources','offerEvents','funnel','panelists','interviewers','dropEvents'];
function _guardCount_(v){ return Array.isArray(v) ? v.length : (v && typeof v === 'object') ? Object.keys(v).length : 0; }
function assertDashboardComplete_(next, prev){
  var errs = [];
  GUARD_REQUIRED_KEYS.forEach(function(k){ if (_guardCount_(next[k]) === 0) errs.push('missing/empty: ' + k); });
  if (prev && Object.keys(prev).length){
    [['jobs',0.5],['recruiters',0.5],['offerEvents',0.5],['openingBuckets',0.5]].forEach(function(p){
      var was = _guardCount_(prev[p[0]]), now = _guardCount_(next[p[0]]);
      if (was > 0 && now < was * p[1]) errs.push(p[0] + ' shrank ' + was + '->' + now);
    });
  }
  if (errs.length){
    var msg = 'PUBLISH GUARD BLOCKED (kept existing dashboard.json): ' + errs.join('; ');
    Logger.log('GUARD ' + msg);
    throw new Error(msg);
  }
  Logger.log('publish guard OK: all core sections present, no drastic shrink');
}
