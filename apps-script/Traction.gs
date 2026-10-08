// ===== INTERVIEW TRACTION (#206, 7 Oct 2026) =====
// Every interview BOOKING, placed on the India-time day it was scheduled for, split four ways:
//   sel  Select   - the candidate reached a LATER stage after that interview
//   rej  Reject   - the candidate was archived without going further
//   can  Cancelled- the booking's own status is Cancelled (a no-show is recorded the same way, Jerin 7 Oct)
//   pen  Awaiting - the interview happened and nothing has been decided yet
// Jerin chose this outcome rule ("b, it is", 7 Oct): what HAPPENED NEXT, never the feedback form, because
// feedback is often never submitted and scoring on it would leave silent holes.
//
// !! WHY THIS IS A SEPARATE FILE AND A SEPARATE JSON (#204): refreshDashboardData already runs 13-30 min
// against a 30-minute ceiling and timed out on 7 Oct. This hangs off refreshStageHistory instead, needs
// NO application.list walk, and writes its own small file. It must never be moved into the main refresh.
//
// !! ROUND NAMES ARE FREE: interviewSchedule.interviewStageId is the SAME id space as the stageId in
// application.listHistory, which carries the stage title (measured 7 Oct: 10 matched, 0 unmatched).
// The map is cached in Script Properties so a normal run resolves nothing.
//
// !! REJECTS ARE NOT IN stage_events.json. Measured 7 Oct: scoped_apps.json is Hired=475 / Active=1279 and
// ZERO Archived, because reachedScreening reads the CURRENT stage and an archived application has none.
// So job and recruiter for an archived candidate come from archived_apps.json, and an interviewed
// application missing from BOTH stores is treated as archived. Do not "fix" this by reading stage_events alone.

var TRACTION_SCHEMA = 1;
var TRACTION_ROUNDS = ['TA Screen', 'HM Review', 'Online Assessment', 'R1', 'R2', 'R3', 'R4', 'R5',
                       'Reference Check', 'Document Submission', 'Offer'];
// Pipeline order by stage TITLE (what interviewSchedule gives us) and by stage KEY (what stage_events stores).
var TRACTION_TORD = { 'App Review':1, 'Application Review':1, 'Hello Christy':2, 'TA Screen':3, 'HM Review':4,
  'Online Assessment':5, 'OA':5, 'R1':6, 'R2':7, 'R3':8, 'R4':9, 'R5':10, 'Reference Check':11,
  'Document Submission':12, 'Offer':13 };
var TRACTION_KORD = { appReview:1, helloChristy:2, taScreen:3, hmReview:4, oa:5, r1:6, r2:7, r3:8, r4:9,
  r5:10, refCheck:11, docSub:12, offer:13, hired:14 };
var TRACTION_STAGE_CACHE = 'TRACTION_STAGE_TITLES';

function refreshInterviewTraction() {
  var t0 = Date.now();
  var fromDay = reportFloorDay_();                                   // '2026-07-01'
  var fromMs = new Date(fromDay + 'T00:00:00+05:30').getTime();      // India time, like every other date here
  Logger.log('=== interview traction (#206) from ' + fromDay + ' ===');

  // --- who is where: job + recruiter + stage trail, for active/hired AND archived ---
  var SE = loadDriveJson_('stage_events.json') || {};
  var jobOf = {}, recOf = {}, archived = {};
  for (var id in SE) { jobOf[id] = SE[id].j || null; recOf[id] = SE[id].r || null;
    if (SE[id].x || SE[id].s === 'Archived') archived[id] = 1; }
  var AA = loadDriveJson_('archived_apps.json') || [];
  if (Object.prototype.toString.call(AA) !== '[object Array]') AA = AA.apps || [];
  for (var a = 0; a < AA.length; a++) { var r0 = AA[a]; if (!r0 || !r0.id) continue;
    archived[r0.id] = 1; if (!jobOf[r0.id]) jobOf[r0.id] = r0.j || null;
    if (!recOf[r0.id]) recOf[r0.id] = r0.r || null; }
  // #209: the progression test needs the stage trail of ARCHIVED candidates too. stage_events holds only
  // active + hired (measured: scoped_apps is Hired 475 / Active 1279, ZERO Archived), so without this it
  // cannot fire for anyone later rejected, and the 'booked a later round' rule ends up carrying the whole
  // measure - which is why this panel read 35% at R1 against Throughput's 22%.
  // archived_late_stage.json .win is the SAME {k,e,l} shape and is exactly what computeAssessedRollups_
  // merges. !! I once dismissed that file as 'processing flags' after reading only its top-level key
  // names; .win holds 14,103 applications. Look inside the big key before concluding anything.
  var winOf = {};
  for (var sid2 in SE) winOf[sid2] = SE[sid2].ev || [];
  var archWin = (loadDriveJson_('archived_late_stage.json') || {}).win || {};
  var archWinN = 0;
  for (var aw in archWin) { if (!winOf[aw]) { winOf[aw] = archWin[aw]; archWinN++; } }
  Logger.log('traction: stage_events ' + Object.keys(SE).length + ', archived ' + AA.length +
    ', archived stage windows ' + archWinN);

  // --- every booking since the floor ---
  var cursor = null, pages = 0, rows = [], stageIds = {}, appOfStage = {};
  do {
    var body = { limit: 100, createdAfter: fromMs };
    if (cursor) body.cursor = cursor;
    var resp = ashbyPost_('/interviewSchedule.list', body);
    var batch = resp.results || [];
    for (var i = 0; i < batch.length; i++) {
      var s = batch[i], evs = s.interviewEvents || [], start = null;
      for (var e = 0; e < evs.length; e++) { var st = evs[e].startTime; if (st && (!start || st < start)) start = st; }
      var canc = /cancel/i.test(String(s.status || ''));
      // A cancelled booking can have NO event left on it, so fall back to when it was raised - otherwise
      // every cancellation disappears and that bar reads zero for ever.
      if (!start) { if (canc && s.createdAt) start = s.createdAt; else continue; }
      var day = dayIST_(start);
      if (!day || day < fromDay) continue;
      if (s.interviewStageId) { stageIds[s.interviewStageId] = 1;
        if (!appOfStage[s.interviewStageId] && s.applicationId) appOfStage[s.interviewStageId] = s.applicationId; }
      rows.push({ sid: s.interviewStageId, app: s.applicationId, d: day, canc: canc });
    }
    cursor = (resp.moreDataAvailable && resp.nextCursor) ? resp.nextCursor : null;
    pages++;
    if (cursor) Utilities.sleep(30);
  } while (cursor);
  // #209 (Jerin, 8 Oct: "I hope you also mean assessment/THT triggered?" - yes, now it does). A take-home
  // needs no diary slot, so counting only BOOKINGS made Online Assessment read 2 where Throughput saw 21
  // assessed. Same endpoint assessAssignments_ uses, so the two panels count the same events.
  var asgN = 0;
  try {
    var asgRows = ashbyListAll_('/takeHomeAssignment.list');
    for (var ta = 0; ta < asgRows.length; ta++) {
      var T = asgRows[ta];
      if (!T.applicationId || !T.createdAt || !T.interviewStageId) continue;
      var tday = dayIST_(T.createdAt);
      if (!tday || tday < fromDay) continue;
      stageIds[T.interviewStageId] = 1;
      if (!appOfStage[T.interviewStageId]) appOfStage[T.interviewStageId] = T.applicationId;
      rows.push({ sid: T.interviewStageId, app: T.applicationId, d: tday,
                  canc: String(T.status || '') === 'Cancelled' });
      asgN++;
    }
  } catch (eA) { Logger.log('traction: takeHomeAssignment.list failed - ' + eA.message); }
  Logger.log('traction: ' + rows.length + ' events (' + asgN + ' take-home), ' + pages + ' pages, ' +
    Object.keys(stageIds).length + ' stages');

  // --- stage id -> round name, cached ---
  var props = PropertiesService.getScriptProperties();
  var nameOf = {};
  try { nameOf = JSON.parse(props.getProperty(TRACTION_STAGE_CACHE) || '{}'); } catch (eC) { nameOf = {}; }
  var resolved = 0;
  for (var sid in stageIds) {
    if (nameOf[sid]) continue;
    try {
      var h = ashbyPost_('/application.listHistory', { applicationId: appOfStage[sid] });
      var hr = h.results || h.history || [];
      for (var k = 0; k < hr.length; k++) if (hr[k].stageId === sid) { nameOf[sid] = hr[k].title; resolved++; break; }
    } catch (eH) { Logger.log('traction: stage lookup failed - ' + eH.message); }
  }
  if (resolved) props.setProperty(TRACTION_STAGE_CACHE, JSON.stringify(nameOf));
  Logger.log('traction: resolved ' + resolved + ' new stage name(s), ' + Object.keys(nameOf).length + ' cached');

  // --- every later booking the same candidate had, so "did they advance" works for ARCHIVED people too ---
  var laterByApp = {};
  for (var q = 0; q < rows.length; q++) {
    var R0 = rows[q]; if (R0.canc) continue;
    var ti0 = nameOf[R0.sid], o0 = ti0 ? TRACTION_TORD[ti0] : 0;
    if (!o0 || !R0.app) continue;
    (laterByApp[R0.app] || (laterByApp[R0.app] = [])).push([o0, R0.d]);
  }

  // --- classify and bucket: job8 -> round -> day -> [sel, rej, can, pen] ---
  var byJob = {}, tot = { sel: 0, rej: 0, can: 0, pen: 0 }, noJob = 0, unmapped = {};
  for (var z = 0; z < rows.length; z++) {
    var R = rows[z], title = nameOf[R.sid];
    if (!title) { unmapped['(unresolved stage)'] = (unmapped['(unresolved stage)'] || 0) + 1; continue; }
    var ord = TRACTION_TORD[title];
    if (!ord) { unmapped[title] = (unmapped[title] || 0) + 1; continue; }
    var j8 = (jobOf[R.app] || '').substring(0, 8);
    // !! #206b (Jerin, 7 Oct): a booking we cannot tie to a KNOWN role is NOT counted. Measured on the
    // 74 of them: 55 were the sandbox job 'Test - Project Hello Christy - Sales PA'. The pipeline drops
    // the Test department (#37), so those applications sit in no store - and counting them put TEST
    // INTERVIEWS into a business number. The rest were applications from before 2026, and ones so recent
    // the stage store has not caught up; those reappear on their own next run. Sheet: 'Interview Traction
    // - interviews with no role (#206, 7 Oct 2026)'.
    if (!j8) { noJob++; continue; }
    var slot = ((byJob[j8] || (byJob[j8] = {}))[title] || (byJob[j8][title] = {}));
    var cell = slot[R.d] || (slot[R.d] = [0, 0, 0, 0]);

    if (R.canc) { cell[2]++; tot.can++; continue; }
    var advanced = false, mine = laterByApp[R.app] || [];
    for (var m = 0; m < mine.length; m++) if (mine[m][0] > ord && mine[m][1] >= R.d) { advanced = true; break; }
    if (!advanced) {
      var ev = winOf[R.app] || [];
      for (var w = 0; w < ev.length; w++) { var oo = TRACTION_KORD[ev[w].k];
        if (oo && oo > ord && ev[w].e && ev[w].e >= R.d) { advanced = true; break; } }
    }
    if (advanced) { cell[0]++; tot.sel++; }
    // #209: archived is decided by the archived LIST now, not by 'missing from stage_events' - that
    // proxy was only ever right because the archived trail was absent. An application WITH a trail
    // that shows no later stage is still in flight; one with no trail anywhere is archived.
    else if (archived[R.app] || !winOf[R.app]) { cell[1]++; tot.rej++; }
    else { cell[3]++; tot.pen++; }
  }

  var un = Object.keys(unmapped);
  if (un.length) Logger.log('TRACTION: ' + un.length + ' stage title(s) outside the round list, skipped - ' +
    un.map(function (t) { return t + ' x' + unmapped[t]; }).join(', '));

  var out = {
    schema: TRACTION_SCHEMA,
    generatedAt: new Date().toISOString(),
    from: fromDay,
    rounds: TRACTION_ROUNDS,
    byJobRoundDay: byJob,
    totals: { select: tot.sel, reject: tot.rej, cancelled: tot.can, awaiting: tot.pen,
              bookings: tot.sel + tot.rej + tot.can + tot.pen, excludedNoRole: noJob },
    skippedStages: unmapped
  };
  saveDriveJson_('interview_traction.json', out);
  pushFileToGitHub_('data/interview_traction.json', JSON.stringify(out), 'Update interview traction');
  Logger.log('=== traction done: select ' + tot.sel + ', reject ' + tot.rej + ', cancelled ' + tot.can +
    ', awaiting ' + tot.pen + ' (' + out.totals.bookings + ' bookings, ' + noJob + ' with no job) in ' +
    Math.round((Date.now() - t0) / 1000) + 's ===');
  return out;
}

// ===== ONE-OFF (#206, 7 Oct 2026): the interviews Interview Traction could not tie to a role =====
// Jerin: "wondering how was there ever an interview that wasnt associated with a job; weird!" - so this
// asks Ashby directly, per application, and writes the answer to a Sheet for the team.
// It proves or disproves the hypothesis that these are applications created BEFORE this year, which the
// pipeline's stores (scoped to the current year) therefore never held.
function listTractionUnmatched() {
  var t0 = Date.now();
  var fromDay = reportFloorDay_(), fromMs = new Date(fromDay + 'T00:00:00+05:30').getTime();
  var SE = loadDriveJson_('stage_events.json') || {};
  var jobOf = {};
  for (var id in SE) jobOf[id] = SE[id].j || null;
  var AA = loadDriveJson_('archived_apps.json') || [];
  if (Object.prototype.toString.call(AA) !== '[object Array]') AA = AA.apps || [];
  for (var a = 0; a < AA.length; a++) { var r0 = AA[a]; if (r0 && r0.id && !jobOf[r0.id]) jobOf[r0.id] = r0.j || null; }

  var nameOf = {};
  try { nameOf = JSON.parse(PropertiesService.getScriptProperties().getProperty(TRACTION_STAGE_CACHE) || '{}'); } catch (e) {}

  var cursor = null, rows = [], seenApp = {};
  do {
    var body = { limit: 100, createdAfter: fromMs };
    if (cursor) body.cursor = cursor;
    var resp = ashbyPost_('/interviewSchedule.list', body);
    var batch = resp.results || [];
    for (var i = 0; i < batch.length; i++) {
      var s = batch[i], evs = s.interviewEvents || [], start = null;
      for (var e = 0; e < evs.length; e++) { var st = evs[e].startTime; if (st && (!start || st < start)) start = st; }
      var canc = /cancel/i.test(String(s.status || ''));
      if (!start) { if (canc && s.createdAt) start = s.createdAt; else continue; }
      var day = dayIST_(start);
      if (!day || day < fromDay) continue;
      var title = nameOf[s.interviewStageId];
      if (!title || !TRACTION_TORD[title]) continue;
      if (jobOf[s.applicationId]) continue;                 // resolved fine - not our problem case
      rows.push({ app: s.applicationId, round: title, day: day, canc: canc });
      seenApp[s.applicationId] = 1;
    }
    cursor = (resp.moreDataAvailable && resp.nextCursor) ? resp.nextCursor : null;
    if (cursor) Utilities.sleep(30);
  } while (cursor);
  Logger.log('U|rows=' + rows.length + ' distinctApps=' + Object.keys(seenApp).length);

  // Ask Ashby what these applications actually are.
  var info = {}, failed = 0, firstErr = '';
  var ids = Object.keys(seenApp);
  for (var k = 0; k < ids.length; k++) {
    if (Date.now() - t0 > 280000) { Logger.log('U|time cutoff at ' + k); break; }
    try {
      var res = ashbyPost_('/application.info', { applicationId: ids[k] });
      info[ids[k]] = res.results || res;
    } catch (eI) { failed++; if (!firstErr) firstErr = String(eI.message).substring(0, 120); }
  }
  Logger.log('U|info ok=' + Object.keys(info).length + ' failed=' + failed + (firstErr ? ' firstErr=' + firstErr : ''));

  // What the answer looks like, in aggregate - this is the bit that settles the WHY.
  var byYear = {}, withJob = 0, noJobInAshby = 0, statuses = {};
  for (var p in info) {
    var ap = info[p] || {};
    var created = ap.createdAt ? String(ap.createdAt).substring(0, 4) : '(none)';
    byYear[created] = (byYear[created] || 0) + 1;
    if (ap.job && ap.job.id) withJob++; else noJobInAshby++;
    var stt = ap.status || '(none)'; statuses[stt] = (statuses[stt] || 0) + 1;
  }
  function kv(o) { var out = []; for (var x in o) out.push(x + '=' + o[x]); return out.join(' | '); }
  Logger.log('U|APPLICATION CREATED IN YEAR: ' + kv(byYear));
  Logger.log('U|HAS A JOB IN ASHBY: yes=' + withJob + ' no=' + noJobInAshby);
  Logger.log('U|STATUS: ' + kv(statuses));

  // The sheet for the team.
  var out = [['Candidate', 'Email', 'Job in Ashby', 'Department', 'Round', 'Interview date (IST)',
              'Booking cancelled', 'Application created', 'Application status', 'Why we could not tie it to a role']];
  rows.sort(function (x, y) { return x.day < y.day ? -1 : (x.day > y.day ? 1 : 0); });
  for (var q = 0; q < rows.length; q++) {
    var R = rows[q], ap2 = info[R.app] || {};
    var cand = (ap2.candidate && (ap2.candidate.name ||
      ((ap2.candidate.firstName || '') + ' ' + (ap2.candidate.lastName || '')).trim())) || '(not returned)';
    var mail = (ap2.candidate && ap2.candidate.primaryEmailAddress && ap2.candidate.primaryEmailAddress.value) || '';
    var jt = (ap2.job && ap2.job.title) || '(none on the application)';
    var dep = (ap2.job && ap2.job.department && ap2.job.department.name) || '';
    var cr = ap2.createdAt ? String(ap2.createdAt).substring(0, 10) : '';
    var why = !ap2.job ? 'Ashby has no job on the application'
            : (cr && cr < '2026-01-01') ? 'Applied before this year, so the pipeline never stored it'
            : 'In Ashby, but missing from both pipeline stores';
    out.push([cand, mail, jt, dep, R.round, R.day, R.canc ? 'Yes' : 'No', cr, ap2.status || '', why]);
  }
  var ss = SpreadsheetApp.create('Interview Traction - interviews with no role (#206, 7 Oct 2026)');
  var sh = ss.getActiveSheet();
  sh.setName('No role');
  sh.getRange(1, 1, out.length, out[0].length).setValues(out);
  sh.getRange(1, 1, 1, out[0].length).setFontWeight('bold');
  sh.setFrozenRows(1);
  for (var c = 1; c <= out[0].length; c++) sh.autoResizeColumn(c);
  try { DriveApp.getFolderById(DASHBOARD_FOLDER_ID).addFile(DriveApp.getFileById(ss.getId())); } catch (eM) {}
  Logger.log('U|SHEET ROWS=' + (out.length - 1));
  Logger.log('U|SHEET URL=' + ss.getUrl());
  Logger.log('U|done in ' + Math.round((Date.now() - t0) / 1000) + 's');
}
