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
var SCOPE_YEAR = Math.max(new Date().getFullYear(), 2026);
var SCOPE_FROM_MS = new Date(SCOPE_YEAR + '-01-01T00:00:00.000Z').getTime();   // createdAfter value (Unix ms)
var VELOCITY_DAYS = 35;
var TIMEOUT_MS = 1500000;                            // 25-min safety cutoff (trigger allows 30)
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

// ===== APP PASS — createdAfter=SCOPE_FROM_MS returns only current-year apps =====

function fetchAndProcessApps_(startTime, jobLookup) {
  var cursor = null, pageNum = 0, totalApps = 0, scopedApps = 0;
  var funnel = { applied: 0, screened: 0, interviewed: 0, offered: 0, hired: 0 };
  var recruiterCounts = {}, sourceCounts = {}, weekCounts = {}, qData = {}, appMap = {}, histApps = [];
  var recruiterUserId = {};   // recruiter name -> userId (for user.list isEnabled -> Active/Inactive)
  var anomalies = { multiRecruiter: [], multiSourcer: [] };
  // Stage titles Ashby returned that STAGE_KEY_MAP has no entry for. An unmapped stage is dropped
  // from every count, which is exactly how 'Online Assessment' went unnoticed - so surface it.
  var unmappedStages = {};
  var unassignedCases = [];   // reached-screening+ apps with NO recruiter (dashboard compliance list), capped
  // Time-in-App-Review dwell histograms {days:count} for candidates CURRENTLY parked in App Review (now - createdAt).
  // The stage-history accumulator can't see these (they never reached screening), so we capture them here — full coverage.
  var arDwellJob = {}, arDwellRec = {};

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
      scopedApps++;
      var jobId = app.job && app.job.id;
      var htr = getHiringTeamRoles_(app);
      var recruiter = htr.recruiters.length ? htr.recruiters[0].name : null;
      var sourcer = htr.sourcers.length ? htr.sourcers[0].name : null;
      var recName = recruiter || 'Unassigned';   // attribute null-recruiter apps to a visible "Unassigned" bucket
      if (recruiter && htr.recruiters[0].userId && !recruiterUserId[recruiter]) recruiterUserId[recruiter] = htr.recruiters[0].userId;
      if (htr.recruiters.length > 1) anomalies.multiRecruiter.push({ app: app.id, job8: (jobId || '').substring(0, 8), names: htr.recruiters.map(function (r) { return r.name; }) });
      if (htr.sourcers.length > 1) anomalies.multiSourcer.push({ app: app.id, job8: (jobId || '').substring(0, 8), names: htr.sourcers.map(function (r) { return r.name; }) });
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

      // Tag apps that reached screening+ (or hired) — the stage-history accumulator pulls listHistory for these.
      var reachedScreening = ((stageKey && stageKey !== 'appReview') || isHired);
      // s = application status ('Active' | 'Archived' | 'Hired'). The stage-history pass needs it because
      // application.listHistory records an 'Archived' TRANSITION for almost nobody — 30 of 2,134 apps in the
      // 2026-08-22 run — so a drop cannot be detected from the history feed alone. History supplies "did they
      // reach a late stage", status supplies "did they end archived"; a drop needs both.
      if (app.id && reachedScreening) histApps.push({ id: app.id, r: recruiter, j: jobId, s: app.status || null });
      if (!recruiter && reachedScreening && unassignedCases.length < 800) unassignedCases.push({ applicationId: app.id, job8: (jobId || '').substring(0, 8), jobTitle: jd ? jd.title : '', candidate: candName, stage: stageName || (isHired ? 'Hired' : ''), createdAt: (app.createdAt || '').substring(0, 10) });

      // App Review dwell: candidates sitting in App Review right now → days = today - createdAt (capped 0..365).
      if (stageKey === 'appReview' && createdMs) {
        var arDays = Math.floor((Date.now() - createdMs) / 86400000); if (arDays < 0) arDays = 0; if (arDays > 365) arDays = 365;
        var arj8 = (jobId || '').substring(0, 8);
        if (arj8) { var ahj = arDwellJob[arj8] || (arDwellJob[arj8] = {}); ahj[arDays] = (ahj[arDays] || 0) + 1; }
        var ahr = arDwellRec[recName] || (arDwellRec[recName] = {}); ahr[arDays] = (ahr[arDays] || 0) + 1;
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
        if (jobId) { var bj = rc.byJob[jobId] || (rc.byJob[jobId] = { jobId: jobId, title: jd ? jd.title : '', department: jd ? jd.department : '', total: 0, offer: 0, hired: 0 }); bj.total++; if (stageName === 'Offer' || isHired) bj.offer++; if (isHired) bj.hired++; }
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

  return { total: totalApps, scoped: scopedApps, funnel: funnel, recruiterCounts: recruiterCounts, sourceCounts: sourceCounts, weekCounts: weekCounts, qData: qData, appMap: appMap, histApps: histApps,
    recruiterUserId: recruiterUserId, anomalies: anomalies, unassignedCases: unassignedCases, unmappedStages: unmappedStages, appReviewDwellByJob: arDwellJob, appReviewDwellByRecruiter: arDwellRec };
}

// ===== OFFER PASS =====

function fetchAndProcessOffers_(startTime, appMap) {
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
              appMap[o.applicationId] = am;
            recovered++;
          }
        } catch (e2) { }
      }
      am = am || {};
      var jobId = am.jobId, rec = am.recruiter, src = am.sourcer;
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
  // DISTINCT CANDIDATES per quarter, not interview events. interviewsByQuarter counts EVENTS - one candidate
  // doing R1, R2 and R3 is three of those and one of these. The Overview tile asks 'how many people did we
  // interview', which is this. Keyed quarter -> {applicationId: 1}; only the counts ever leave the server.
  var intAppsByQ = {};        // userId totals / dept->title->userId
  var evEndByAppUser = {};            // (appId '|' userId) -> [event endMs, ...] — for feedback turnaround matching
  function eu(uid) { if (!byUser[uid]) byUser[uid] = { interviews: 0, feedbackCount: 0, turnSum: 0, turnN: 0, byQuarter: {}, byMonth: {}, pending: 0 }; return byUser[uid]; }
  function edju(dept, title, uid) { var d = byDJU[dept] || (byDJU[dept] = {}); var t = d[title] || (d[title] = {}); return t[uid] || (t[uid] = { interviews: 0, feedbackCount: 0, turnSum: 0, turnN: 0, byQuarter: {}, byMonth: {} }); }
  function jobCtx(appId) { var am = appId ? appMap[appId] : null; var jd = (am && am.jobId) ? jobLookup[am.jobId] : null; return { dept: jd ? jd.department : 'Unknown', title: jd ? jd.title : 'Unknown' }; }

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
        var _uu = ev.interviewerUserIds || [], _hasReal = false; for (var _z = 0; _z < _uu.length; _z++) { if (_uu[_z] && _uu[_z] !== EXCLUDED_INTERVIEWER_ID) { _hasReal = true; break; } } if (!_hasReal) continue; evCount++; if (st) { var _qd = new Date(st); var _qk = _qd.getUTCFullYear() + '-Q' + (Math.floor(_qd.getUTCMonth() / 3) + 1); interviewsByQuarter[_qk] = (interviewsByQuarter[_qk] || 0) + 1; if (appId) { (intAppsByQ[_qk] || (intAppsByQ[_qk] = {}))[appId] = 1; } var _mk = _qd.getUTCFullYear() + '-' + ('0' + (_qd.getUTCMonth() + 1)).slice(-2); interviewsByMonth[_mk] = (interviewsByMonth[_mk] || 0) + 1; }
        var endMs = ev.endTime ? new Date(ev.endTime).getTime() : 0;
        var uids = ev.interviewerUserIds || [];
        for (var k = 0; k < uids.length; k++) {
          var uid = uids[k]; if (!uid || uid === EXCLUDED_INTERVIEWER_ID) continue;
          eu(uid).interviews++; if (!ev.hasSubmittedFeedback) byUser[uid].pending++;
          edju(ctx1.dept, ctx1.title, uid).interviews++;
          if (st) {
            var _pq = new Date(st);
            var _pqk = _pq.getUTCFullYear() + '-Q' + (Math.floor(_pq.getUTCMonth() / 3) + 1);
            var _pmk = _pq.getUTCFullYear() + '-' + ('0' + (_pq.getUTCMonth() + 1)).slice(-2);
            var _euq = eu(uid); _euq.byQuarter[_pqk] = (_euq.byQuarter[_pqk] || 0) + 1; _euq.byMonth[_pmk] = (_euq.byMonth[_pmk] || 0) + 1;
            var _djq = edju(ctx1.dept, ctx1.title, uid); _djq.byQuarter[_pqk] = (_djq.byQuarter[_pqk] || 0) + 1; _djq.byMonth[_pmk] = (_djq.byMonth[_pmk] || 0) + 1;
          }
          if (endMs && appId) { var key = appId + '|' + uid; (evEndByAppUser[key] || (evEndByAppUser[key] = [])).push(endMs); }
        }
      }
    }
    cursor = (resp.moreDataAvailable && resp.nextCursor) ? resp.nextCursor : null; pages++;
    if (cursor) Utilities.sleep(30);
  } while (cursor);
  Logger.log('interviewSchedule.list: ' + evCount + ' scoped events, ' + pages + ' pages');

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
      eu(uid2).feedbackCount++;
      var ctx2 = jobCtx(fb.applicationId); var dju = edju(ctx2.dept, ctx2.title, uid2); dju.feedbackCount++;
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
    interviewers.push({ name: nameOf(u), userId: u, interviews: b.interviews, feedbackSubmitted: b.feedbackCount, feedbackOnScheduled: b.fbOnSched || 0, pendingFeedback: b.pending, byQuarter: b.byQuarter, byMonth: b.byMonth, avgTurnaroundHrs: b.turnN ? Math.round(b.turnSum / b.turnN * 10) / 10 : null }); }
  interviewers.sort(function (a, b) { return b.interviews - a.interviews; });
  var panelists = [];
  for (var dp in byDJU) for (var tt in byDJU[dp]) for (var uu in byDJU[dp][tt]) { var x = byDJU[dp][tt][uu];
    panelists.push({ dept: dp, jobTitle: tt, name: nameOf(uu), userId: uu, interviews: x.interviews, byQuarter: x.byQuarter, byMonth: x.byMonth, feedbackSubmitted: x.feedbackCount, feedbackOnScheduled: x.fbOnSched || 0, avgTurnaroundHrs: x.turnN ? Math.round(x.turnSum / x.turnN * 10) / 10 : null }); }
  return { interviewers: interviewers, panelists: panelists, totalInterviews: evCount, totalFeedback: fbCount, interviewsByQuarter: interviewsByQuarter, interviewsByMonth: interviewsByMonth, intAppsByQ: intAppsByQ };
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

  var jobLookup = {};
  allJobs.forEach(function(j) {
    var leaf = deptMap[j.departmentId] ? deptMap[j.departmentId].name : '';
    jobLookup[j.id] = { id: j.id, title: j.title, department: topDept(j.departmentId) || leaf, team: leaf, status: j.status,
      level: jobCustomField_(j, LEVEL_CF_ID), complexity: jobCustomField_(j, COMPLEXITY_CF_ID),
      employmentType: jobCustomFieldByTitle_(j, /employ/i),
      applied: 0, screen: 0, interview: 0, offer: 0, hired: 0, pipeline: emptyPipeline_(), recruiterSet: [] };
  });

  var allOpenings = fetchOpenings_();
  var openingsByJob = {};
  var openingsNoOpenedAt = 0;
  allOpenings.forEach(function(o) { var ids = (o.latestVersion && o.latestVersion.jobIds) || []; ids.forEach(function(jid) { (openingsByJob[jid] || (openingsByJob[jid] = [])).push(o); }); });
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
    var cr = o.closeReasonId;
    if (cr === CR_ONHOLD || cr === CR_SHELVED) return;
    // An opening with no openedAt was never actually opened. Do NOT fall back to
    // latestVersion.createdAt — that dumps never-opened/migrated openings into whatever
    // quarter the record was last touched, inflating the current quarter's target.
    var iso = o.openedAt || null;
    if (!iso) { openingsNoOpenedAt++; return; }
    var dt = new Date(iso); if (isNaN(dt.getTime())) return;
    var q = dt.getUTCFullYear() + '-Q' + (Math.floor(dt.getUTCMonth() / 3) + 1);
    var cls; if (!o.closedAt) cls = 'open'; else if (cr === CR_HIRED) cls = 'joined'; else if (cr === CR_CARRYFWD) cls = 'missed'; else return; // closed w/ null/other reason (migration junk) = excluded from Total
    var jobIds = (o.latestVersion && o.latestVersion.jobIds) || [];
    jobIds.forEach(function (jid) {
      var jd = jobLookup[jid] || {}; var j8 = jid.substring(0, 8);
      var b = openingBuckets[j8] || (openingBuckets[j8] = { jobId8: j8, title: jd.title || '', department: jd.department || '', team: jd.team || '', status: jd.status || '', quarters: {} });
      var qq = b.quarters[q] || (b.quarters[q] = { total: 0, joined: 0, open: 0, missed: 0 });
      qq.total++; qq[cls]++;
    });
  });

  var appResult = fetchAndProcessApps_(startTime, jobLookup);
  Logger.log('Apps: ' + appResult.total + ' fetched, ' + appResult.scoped + ' scoped, ' + Math.round((Date.now() - startTime) / 1000) + 's');
  // Hand the reached-screening+ apps to the stage-history accumulator (runs as its own trigger).
  saveDriveJson_('scoped_apps.json', { generatedAt: new Date().toISOString(), apps: appResult.histApps });
  Logger.log('scoped_apps (reached screening+): ' + appResult.histApps.length);
  var offerResult = fetchAndProcessOffers_(startTime, appResult.appMap);

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
  offerResult.events.forEach(function (e) {
    if (!e.offerOpeningId) { if (!(e.offerStatus && /declin|reject|cancel/i.test(e.offerStatus))) offerMissingLink++; return; }
    if (e.offerStatus && /declin|reject|cancel/i.test(e.offerStatus)) return;
    var o = openingById_[e.offerOpeningId];
    if (!o || o.closedAt) return;
    if (o.closeReasonId === CR_ONHOLD || o.closeReasonId === CR_SHELVED) return;
    pendingOpeningSet_[e.offerOpeningId] = true;
    if (e.recruiter) jpByRecruiter[e.recruiter] = (jpByRecruiter[e.recruiter] || 0) + 1;
  });
  var openingPendingByJobQ = {};
  for (var opid_ in pendingOpeningSet_) {
    var o2 = openingById_[opid_]; if (!o2) continue;
    var iso2 = o2.openedAt || (o2.latestVersion && o2.latestVersion.createdAt) || o2.createdAt; if (!iso2) continue;
    var dt2 = new Date(iso2); if (isNaN(dt2.getTime())) continue;
    var q2 = dt2.getUTCFullYear() + '-Q' + (Math.floor(dt2.getUTCMonth() / 3) + 1);
    ((o2.latestVersion && o2.latestVersion.jobIds) || []).forEach(function (jid2) {
      var j82 = jid2.substring(0, 8);
      var bb = openingPendingByJobQ[j82] || (openingPendingByJobQ[j82] = {});
      bb[q2] = (bb[q2] || 0) + 1;
    });
  }
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
    quarterly[qk] = { funnel: q.funnel, topJobs: qJobs.slice(0, 10), sources: qSrc }; }

  if (appResult.funnel.applied === 0) { Logger.log('WARNING: 0 scoped apps — keeping existing.'); return existing; }

  // Offer events enriched with job score-inputs (dept/level/complexity) — frontend does the 50/50 split-scoring.
  var jobBy8 = {}; for (var jk in jobLookup) jobBy8[jobLookup[jk].id.substring(0, 8)] = jobLookup[jk];
  var offerEvents = (offerResult.events || []).map(function (e) { var jd = jobBy8[e.jobId8] || null;
    var amE = appResult.appMap[e.applicationId] || null;
    return { jobId8: e.jobId8, jobTitle: jd ? jd.title : '', department: jd ? jd.department : '', level: jd ? jd.level : null, complexity: jd ? jd.complexity : null,
      employmentType: jd ? jd.employmentType : null,
      recruiter: e.recruiter, sourcer: e.sourcer, candidate: e.candidate, decidedAt: e.decidedAt, startDate: e.startDate, accepted: e.accepted,
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
    var dd = new Date(iso); if (isNaN(dd.getTime())) return null;
    return dd.getUTCFullYear() + '-Q' + (Math.floor(dd.getUTCMonth() / 3) + 1);
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
      linked: e.offerOpeningId ? true : false
    };
  });
  for (var aid3 in appResult.appMap) {
    var am4 = appResult.appMap[aid3]; if (!am4) continue;
    if (jpCaseByApp_[aid3]) continue;
    var sub4 = am4.stage ? (PRE_OFFER_SUBSTAGE_[am4.stage] || null) : null;
    if (!sub4) continue;
    if (am4.status === 'Hired' || am4.status === 'Archived') continue;
    var jd4 = am4.jobId ? jobLookup[am4.jobId] : null;
    jpCaseByApp_[aid3] = { openingQuarter: null, month: null, doj: null, department: jd4 ? jd4.department : '', job: jd4 ? jd4.title : '', candidate: am4.candidate || null, subStage: sub4, recruiter: am4.recruiter || null, linked: false };
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
      department: jdg ? jdg.department : '',
      recruiter: e.recruiter || null,
      doj: e.startDate || null,
      subStage: OFFER_SUBSTAGE_[e.offerStatus || ''] || 'Offer',
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
  var dataQuality = { recruitersWithoutUserId: recruitersWithoutUserId, unassigned: appResult.unassignedCases, unassignedTotal: uaRow ? uaRow.total : 0, offerMissingLink: offerMissingLink, openingsNoOpenedAt: openingsNoOpenedAt, excludedAsRecruiter: recruitersList.filter(function (r) { return r.name === 'G Darshan' && (r.total || 0) > 0; }).map(function (r) { return r.name; }),
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
  try {
    var _se = loadDriveJson_('stage_events.json') || {};
    var _qk2 = function (ds) { if (!ds || ds.length < 7) return null; return ds.substring(0, 4) + '-Q' + (Math.floor((parseInt(ds.substring(5, 7), 10) - 1) / 3) + 1); };
    for (var _aid in _se) {
      var _evs = (_se[_aid] && _se[_aid].ev) || [];
      for (var _n = 0; _n < _evs.length; _n++) {
        if (_evs[_n].k !== 'oa' || !_evs[_n].e) continue;
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
  Logger.log('Candidates interviewed by quarter: ' + JSON.stringify(candidatesInterviewedByQuarter) + ' (panel ' + JSON.stringify(panelByQ) + ', assessed ' + JSON.stringify(assessedByQ) + ')');

  var dashboard = {
    lastUpdated: new Date().toISOString(), schemaVersion: 4, scopeYear: SCOPE_YEAR, velocityDays: VELOCITY_DAYS,
    funnel: appResult.funnel,
    openingBuckets: openingBuckets,
    openingPendingByJobQ: openingPendingByJobQ,
    openings: openingsList.length > 0 ? openingsList : (existing.openings || []),
    jobs: jobsList, recruiters: recruitersList, sources: sourcesList,
    weeklyVelocity: velocity, quarterly: quarterly, avgTimeToHire: 0,
    offerEvents: offerEvents, joiningPendingCases: joiningPendingCases, offerLinkGaps: offerLinkGaps, dataQuality: dataQuality,
    appReviewDwellByJob: appResult.appReviewDwellByJob, appReviewDwellByRecruiter: appResult.appReviewDwellByRecruiter,
    interviewers: ivResult.interviewers, panelists: ivResult.panelists, totalInterviews: ivResult.totalInterviews, interviewsByQuarter: ivResult.interviewsByQuarter, interviewsByMonth: ivResult.interviewsByMonth || {},
    candidatesInterviewedByQuarter: candidatesInterviewedByQuarter, panelInterviewedByQuarter: panelByQ, assessedByQuarter: assessedByQ
  };
  saveDashboardJson_(dashboard);
  Logger.log('=== Refresh v4 done: ' + appResult.funnel.applied + ' apps, ' + jobsList.length + ' jobs, ' + recruitersList.length + ' recruiters, ' + offerResult.count + ' offers, ' + Math.round((Date.now() - startTime) / 1000) + 's ===');
  // Mirror this project into the repo so the checked-in copy tracks what is actually running.
  // Wrapped: a sync failure must never take down the data refresh.
  try { pushSourceToGitHub(); } catch (e) { Logger.log("source sync error: " + e.message); }
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
  saveDriveJson_('stage_rollups.json', rollups);
  pushFileToGitHub_('data/stage_rollups.json', JSON.stringify(rollups), 'Update stage rollups');
  saveDriveJson_('stage_history_state.json', { cursor: 0, scopedCount: scoped.length });   // reset -> re-pull next cycle
  Logger.log('=== stage-history done: ' + Object.keys(events).length + ' apps, ' + Math.round((Date.now() - startTime) / 1000) + 's ===');
  return rollups;
}

function computeStageRollups_(events) {
  var minDay = dayKey_(Date.now() - ROLLUP_WINDOW_DAYS * 86400000), todayKey = dayKey_(Date.now());
  var velByRec = {}, velByJob = {}, velByRecJob = {}, tpByJob = {}, tpByRec = {}, tisJob = {}, tisRec = {}, tisJobQ = {}, tisRecQ = {};
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
        if (j8) tis(tisJob, j8, k, dw);
        if (rec) tis(tisRec, rec, k, dw);
        if (j8 && qk) tisQ(tisJobQ, j8, k, qk, dw);
        if (rec && qk) tisQ(tisRecQ, rec, k, qk, dw);
      }
    }
  }
  return { schemaVersion: 1, generatedAt: new Date().toISOString(), windowDays: ROLLUP_WINDOW_DAYS,
    velocityByRecruiter: velByRec, velocityByJob: velByJob, velocityByRecruiterJob: velByRecJob, throughputByJob: tpByJob, throughputByRecruiter: tpByRec, throughputByJobQ: tpByJobQ, throughputByRecruiterQ: tpByRecQ, throughputByRecruiterJob: tpByRecJob,
    timeInStageByJob: tisJob, timeInStageByRecruiter: tisRec, timeInStageByJobQ: tisJobQ, timeInStageByRecruiterQ: tisRecQ };
}

function triggerStageHistoryNow() {
  ScriptApp.newTrigger('refreshStageHistory').timeBased().after(1000).create();
  Logger.log('refreshStageHistory scheduled in ~1s (30-min budget)');
}
function setupStageHistoryTriggers() {
  ScriptApp.getProjectTriggers().forEach(function(t) { if (t.getHandlerFunction() === 'refreshStageHistory') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('refreshStageHistory').timeBased().atHour(7).everyDays(1).inTimezone('Asia/Kolkata').create();
  ScriptApp.newTrigger('refreshStageHistory').timeBased().atHour(19).everyDays(1).inTimezone('Asia/Kolkata').create();
  Logger.log('Stage-history triggers set: 7 AM and 7 PM IST (1h after main refresh)');
}

// ===== TRIGGERS / MANUAL =====

function manualRefresh_() { refreshDashboardData(); ScriptApp.getProjectTriggers().forEach(function(t) { if (t.getHandlerFunction() === 'manualRefresh_') ScriptApp.deleteTrigger(t); }); }
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
