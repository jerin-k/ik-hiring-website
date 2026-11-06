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
var TRACTION_ROUNDS = smTractionRounds();
// Pipeline order by stage TITLE (what interviewSchedule gives us) and by stage KEY (what stage_events stores).
var TRACTION_TORD = smTractionTord();
// #222 (Jerin, 12 Oct 2026): a vendor assessment has NO interview behind it and therefore no interviewStageId
// of its own, so it cannot be matched to a round the way a booking is. It gets this synthetic id, mapped straight
// to 'Online Assessment' - his ruling. Everything downstream then treats it exactly like any other row: the
// select / reject / awaiting logic asks only whether the candidate reached a LATER round afterwards.
var TRACTION_ASSESS_SID = '__assessment_222__';
var TRACTION_KORD = smTractionKord();
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
  var snapNow = {};   // #287c: schedule id -> { s: start time, u: updatedAt, a: applicationId }
  var sidOfSched = {};   // #287: schedule id -> interviewStageId, so a MOVE can find its round
  do {
    var body = { limit: 100, createdAfter: fromMs };
    if (cursor) body.cursor = cursor;
    var resp = ashbyPost_('/interviewSchedule.list', body);
    var batch = resp.results || [];
    for (var i = 0; i < batch.length; i++) {
      var s = batch[i], evs = s.interviewEvents || [], start = null;
      for (var e = 0; e < evs.length; e++) { var st = evs[e].startTime; if (st && (!start || st < start)) start = st; }
      // #287c: keep what this pass used to throw away - BEFORE the cancelled-booking fallback below,
      // so a cancellation's createdAt can never be mistaken for a scheduled slot.
      if (s.id) snapNow[s.id] = { s: start || '', u: s.updatedAt || '', a: s.applicationId || '' };
      if (s.id && s.interviewStageId) sidOfSched[s.id] = s.interviewStageId;   // #287
      var canc = /cancel/i.test(String(s.status || ''));
      // A cancelled booking can have NO event left on it, so fall back to when it was raised - otherwise
      // every cancellation disappears and that bar reads zero for ever.
      if (!start) { if (canc && s.createdAt) start = s.createdAt; else continue; }
      var day = dayIST_(start);
      if (!day || day < fromDay) continue;
      if (s.interviewStageId) { stageIds[s.interviewStageId] = 1;
        if (!appOfStage[s.interviewStageId] && s.applicationId) appOfStage[s.interviewStageId] = s.applicationId; }
      rows.push({ sid: s.interviewStageId, app: s.applicationId, d: day, canc: canc,
                  c: s.createdAt || '' });   // #287e: WHEN IT WAS RAISED - that is what orders a rebooking
    }
    cursor = (resp.moreDataAvailable && resp.nextCursor) ? resp.nextCursor : null;
    pages++;
    if (cursor) Utilities.sleep(30);
  } while (cursor);
  // #287e (Jerin, 5 Nov 2026): "On cancel & rebook for the same day - lets take the latest one alone."
  // ONE call site, and it sits HERE on purpose: these are the interview BOOKINGS alone. The take-home rows
  // and the #222 report rows appended below are not rebookings of a cancelled slot, so they must never be
  // the "later booking" that absorbs a cancellation.
  var canc287eBefore = 0;
  for (var cb = 0; cb < rows.length; cb++) if (rows[cb].canc) canc287eBefore++;
  var col287e = collapseSameDayRebookings_(rows);
  rows = col287e.rows;
  var canc287eAfter = 0;
  for (var ca = 0; ca < rows.length; ca++) if (rows[ca].canc) canc287eAfter++;
  // BOTH SIDES ARE LOGGED EVERY RUN, because the harm side of this rule is invisible otherwise: the number
  // that must stay large is the count of groups it LEAVES ALONE.
  Logger.log('traction #287e: absorbed ' + col287e.absorbed + ' cancellation(s) across ' + col287e.groups +
    ' group(s) - cancelled ' + canc287eBefore + ' -> ' + canc287eAfter + '. ' + col287e.multiGroups +
    ' group(s) hold 2+ bookings; ' + col287e.groupsNoneCancelled + ' of those have NONE cancelled and were' +
    ' LEFT ALONE (a blunt "keep the latest" would have wrongly collapsed every one of them).');
  // #287c: remember this run's times and count what moved since the last run. Wrapped on its own so a
  // store failure can never cost interview_traction.json - the same guard the take-home pass uses.
  try { recordScheduleMoves_(snapNow); }
  catch (eSM) { Logger.log('#287c: reschedule watch FAILED (traction unaffected) - ' + eSM.message); }
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
  // #222: the assessments the take-home endpoint cannot see. It found 18 in the Online Assessment stage; the
  // saved Ashby report finds 496. Cancelled ones are already excluded upstream, and the counting rule (finished
  // plus sent-but-unfinished) is Jerin's, applied once in assessReportAssessments_ so every panel shares it.
  var repN = 0;
  if (ASSESS_USE_REPORT) {
    try {
      var repR = assessReportAssessments_();
      for (var rApp in repR.byApp) {
        var rDs = repR.byApp[rApp] || [];
        for (var rd = 0; rd < rDs.length; rd++) {
          if (!rDs[rd] || rDs[rd] < fromDay) continue;
          rows.push({ sid: TRACTION_ASSESS_SID, app: rApp, d: rDs[rd], canc: false });
          repN++;
        }
      }
      Logger.log('traction #222: ' + repN + ' vendor assessments added to the Online Assessment round');
    } catch (eR) { Logger.log('traction: #222 assessments failed - ' + eR.message); }
  }
  // #287 (Jerin, 6 Nov 2026): put each MOVE back on the day it was ORIGINALLY booked for.
  // Appended HERE, after every other source, so the #287e collapse never sees these rows.
  try {
    var mvRes = moveRowsForTraction_(loadDriveJson_(SCHED_MOVES_FILE), sidOfSched, fromDay, dayIST_);
    for (var mi2 = 0; mi2 < mvRes.rows.length; mi2++) rows.push(mvRes.rows[mi2]);
    Logger.log('traction #287: ' + mvRes.placed + ' moved interview(s) added to Rescheduled / Cancelled on ' +
      'their ORIGINAL day; ' + mvRes.unplaced + ' could not be placed (booking no longer in the window), ' +
      mvRes.tooOld + ' before the floor. A moved interview is now counted on BOTH days - his call, 6 Nov.');
  } catch (eMV) { Logger.log('traction #287: move rows FAILED (traction unaffected) - ' + eMV.message); }
  Logger.log('traction: ' + rows.length + ' events (' + asgN + ' take-home), ' + pages + ' pages, ' +
    Object.keys(stageIds).length + ' stages');

  // --- stage id -> the name Ashby calls it TODAY (#293, Jerin 5 Nov 2026: "follow Ashby") ---
  // 🚨 THIS USED TO SAY `if (nameOf[sid]) continue;` AND THAT WAS THE BUG. A stage id already in the cache
  // was never looked up again, so the title captured the FIRST time a stage was seen was kept for ever and
  // a rename in Ashby never reached this panel. `R0 - Online Assessment` was live in Ashby while the
  // published data still said `Online Assessment`.
  // The cache is now a FALLBACK for a failed read, never a reason to skip the read.
  var props = PropertiesService.getScriptProperties();
  var cachedNames = {};
  try { cachedNames = JSON.parse(props.getProperty(TRACTION_STAGE_CACHE) || '{}'); } catch (eC) { cachedNames = {}; }
  var nameOf = {}, resolved = 0, reused = 0, renamed = 0;
  for (var sid in stageIds) {
    if (sid === TRACTION_ASSESS_SID) continue;         // #222: synthetic, never looked up against Ashby
    var liveTitle = null;
    if (appOfStage[sid]) {
      try {
        var h = ashbyPost_('/application.listHistory', { applicationId: appOfStage[sid] });
        var hr = h.results || h.history || [];
        for (var k = 0; k < hr.length; k++) if (hr[k].stageId === sid) { liveTitle = hr[k].title; break; }
      } catch (eH) { Logger.log('traction: stage lookup failed - ' + eH.message); }
    }
    if (liveTitle) {
      resolved++;
      if (cachedNames[sid] && cachedNames[sid] !== liveTitle) {
        renamed++;
        Logger.log('traction #293: stage RENAMED in Ashby - "' + cachedNames[sid] + '" is now "' + liveTitle + '"');
      }
      nameOf[sid] = liveTitle;
    } else if (cachedNames[sid]) { nameOf[sid] = cachedNames[sid]; reused++; }
  }
  props.setProperty(TRACTION_STAGE_CACHE, JSON.stringify(nameOf));

  // ONE LABEL PER STAGE KEY, and that is the whole point. Interview plans are per job, so two plans could
  // title the same stage differently; keying the display on the stage KEY collapses them into one round
  // instead of silently splitting it into two columns. (Measured 5 Nov 2026: this workspace runs ONE
  // "Global Shared Interview Plan", so they agree today - this keeps them agreeing if that ever changes.)
  var keyOfTitle = smStageKeyMap();                    // every Ashby title we recognise -> stage key
  var lr = tractionLiveRounds_(nameOf, keyOfTitle, smTractionRounds());
  var liveLabelOf = lr.liveLabelOf, roundsOut = lr.rounds, roundKeyOf = lr.roundKeyOf;
  nameOf[TRACTION_ASSESS_SID] = liveLabelOf['oa'] || 'Online Assessment';   // #222, now following the rename
  Logger.log('traction #293: ' + resolved + ' stage name(s) read from Ashby, ' + reused +
    ' reused from cache after a failed read, ' + renamed + ' RENAMED since the last run. Rounds published: ' +
    roundsOut.join(' | '));

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
  // #228a (Jerin, 13 Oct 2026): the SAME bookings, also bucketed by the recruiter on the application, so
  // Recruiter Efficiency can show this panel narrowed to one person. recOf[] is already built at the top of
  // this function from stage_events.json .r and archived_apps.json .r - nothing new is fetched.
  var byRec = {}, noRec = 0;
  for (var z = 0; z < rows.length; z++) {
    var R = rows[z], title = nameOf[R.sid];
    if (!title) { unmapped['(unresolved stage)'] = (unmapped['(unresolved stage)'] || 0) + 1; continue; }
    var ord = TRACTION_TORD[title];
    if (!ord) { unmapped[title] = (unmapped[title] || 0) + 1; continue; }
    // #293: the DATA is keyed by the same string the rounds list carries, resolved through the stage key.
    // That is what makes "the list and the data keys can never disagree" true by construction rather than
    // by luck - the luck that a stale cache was providing.
    var rKey = keyOfTitle[title] || null;
    var round = (rKey && liveLabelOf[rKey]) ? liveLabelOf[rKey] : title;
    var j8 = (jobOf[R.app] || '').substring(0, 8);
    // !! #206b (Jerin, 7 Oct): a booking we cannot tie to a KNOWN role is NOT counted. Measured on the
    // 74 of them: 55 were the sandbox job 'Test - Project Hello Christy - Sales PA'. The pipeline drops
    // the Test department (#37), so those applications sit in no store - and counting them put TEST
    // INTERVIEWS into a business number. The rest were applications from before 2026, and ones so recent
    // the stage store has not caught up; those reappear on their own next run. Sheet: 'Interview Traction
    // - interviews with no role (#206, 7 Oct 2026)'.
    if (!j8) { noJob++; continue; }
    var slot = ((byJob[j8] || (byJob[j8] = {}))[round] || (byJob[j8][round] = {}));
    var cell = slot[R.d] || (slot[R.d] = [0, 0, 0, 0]);
    // !! ONE classification, TWO buckets. The outcome is decided once below and written to both, so the
    // recruiter view can NEVER drift from the role view - the thing Rule 3 exists to prevent. Same population
    // too: a booking with no known role is dropped above, before either bucket is opened.
    var recNm = recOf[R.app] || '', rcell = null;
    if (recNm) {
      var rjob = (byRec[recNm] || (byRec[recNm] = {}));
      var rslot = ((rjob[j8] || (rjob[j8] = {}))[round] || (rjob[j8][round] = {}));
      rcell = rslot[R.d] || (rslot[R.d] = [0, 0, 0, 0]);
    } else noRec++;
    var bump = function (i) { cell[i]++; if (rcell) rcell[i]++; };

    if (R.canc) { bump(2); tot.can++; continue; }
    var advanced = false, mine = laterByApp[R.app] || [];
    for (var m = 0; m < mine.length; m++) if (mine[m][0] > ord && mine[m][1] >= R.d) { advanced = true; break; }
    if (!advanced) {
      var ev = winOf[R.app] || [];
      for (var w = 0; w < ev.length; w++) { var oo = TRACTION_KORD[ev[w].k];
        if (oo && oo > ord && ev[w].e && ev[w].e >= R.d) { advanced = true; break; } }
    }
    if (advanced) { bump(0); tot.sel++; }
    // #209: archived is decided by the archived LIST now, not by 'missing from stage_events' - that
    // proxy was only ever right because the archived trail was absent. An application WITH a trail
    // that shows no later stage is still in flight; one with no trail anywhere is archived.
    else if (archived[R.app] || !winOf[R.app]) { bump(1); tot.rej++; }
    else { bump(3); tot.pen++; }
  }

  var un = Object.keys(unmapped);
  if (un.length) Logger.log('TRACTION: ' + un.length + ' stage title(s) outside the round list, skipped - ' +
    un.map(function (t) { return t + ' x' + unmapped[t]; }).join(', '));

  var out = {
    schema: TRACTION_SCHEMA,
    generatedAt: new Date().toISOString(),
    from: fromDay,
    rounds: roundsOut,
    roundKeyOf: roundKeyOf,   // #293: live label -> stage key, so the SITE never keys on a name
    byJobRoundDay: byJob,
    byRecJobRoundDay: byRec,
    totals: { select: tot.sel, reject: tot.rej, cancelled: tot.can, awaiting: tot.pen,
              bookings: tot.sel + tot.rej + tot.can + tot.pen, excludedNoRole: noJob,
              noRecruiter: noRec },
    skippedStages: unmapped
  };
  // #271 (20 Oct 2026). The Drive copy is only a BACKUP - the GitHub file is what the site reads. This save
  // was UNGUARDED, so when Drive threw 'Service error: Drive' at 19:54 IST on 20 Oct it took the push below
  // with it: interview_traction.json stayed twelve hours stale while the run still reported Completed, because
  // the caller's own try/catch logged the failure and carried on. A Drive outage must cost the backup, never
  // the live file - so the backup gets its own catch and the push always runs.
  // #271b: was #271's own inline try/catch. It now goes through the SHARED saveDriveBackup_ in
  // DataRefresh.gs, so every guarded backup logs the same way and lands in the same failure tally that the
  // job's final summary line reports. One mechanism, not one per file.
  saveDriveBackup_('interview_traction.json', out);
  pushFileToGitHub_('data/interview_traction.json', JSON.stringify(out), 'Update interview traction');
  // #228a: coverage decides whether the recruiter panel is usable, so it is MEASURED every run, never
  // assumed. A booking with no recruiter is counted here and shown on the page - never silently dropped.
  var withRec = out.totals.bookings - noRec;
  Logger.log('traction #228a: ' + Object.keys(byRec).length + ' recruiters, ' + withRec + ' of ' +
    out.totals.bookings + ' bookings carry a recruiter (' +
    (out.totals.bookings ? Math.round(withRec / out.totals.bookings * 100) : 0) + '%), ' + noRec + ' do not');
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


// ===== #287c - THE RESCHEDULE WATCH. Stores each run's booking times; counts the moves between runs. =====
// Jerin, 5 Nov 2026: "Watch from today" - he turned the add-on down knowing the past is unrecoverable.
// There is no Ashby field holding a previous time (rounds 1-4), and the interviewScheduleUpdate WEBHOOK
// cannot be used here because it needs a public endpoint IK's Workspace blocks. So we remember it ourselves.
// NO EXTRA ASHBY LOAD: refreshInterviewTraction already pages every booking - this just keeps what it threw away.
// HONEST LIMITS, to be said out loud before anyone quotes a number: it counts from the FIRST DAY WE STORE and
// never backwards - it misses a move made and undone between two runs (3 a day) - it says a time CHANGED, never why.
// Both files are DRIVE-ONLY. Nothing here is ever pushed to the public repo.
var SCHED_SNAP_FILE  = 'schedule_snapshot.json';
var SCHED_MOVES_FILE = 'schedule_moves.json';
var SCHED_MOVES_CAP  = 5000;

// PURE. No Ashby, no Drive, no clock - so it is unit-tested locally before it ever reaches Monaco.
// 24 checks pass, including a control proving the suite can fail and that a no-op diff would be caught.
function diffScheduleTimes_(prev, cur) {
  var moves = [];
  if (!prev || !cur) return moves;
  for (var id in cur) {
    if (!Object.prototype.hasOwnProperty.call(cur, id)) continue;
    var p = prev[id], c = cur[id];
    if (!p) continue;                 // first time we have seen this booking - a new booking is not a move
    if (!p.s || !c.s) continue;       // never call a MISSING time a move: that is a cancellation or a bad pull
    if (p.s === c.s) continue;
    moves.push({ id: id, a: c.a || p.a || '', from: p.s, to: c.s });
  }
  return moves;
}

function recordScheduleMoves_(snapNow) {
  var t0 = Date.now();
  var nowIso = new Date().toISOString();
  var nNow = Object.keys(snapNow || {}).length;
  var prevWrap = loadDriveJson_(SCHED_SNAP_FILE);
  var prev = (prevWrap && prevWrap.byId) ? prevWrap.byId : null;
  var moves = [];
  if (!prev) {
    Logger.log('#287c: NO PREVIOUS SNAPSHOT - baseline written for ' + nNow +
      ' bookings. Diffing starts on the NEXT run; nothing is countable yet.');
  } else {
    moves = diffScheduleTimes_(prev, snapNow);
    Logger.log('#287c: compared ' + nNow + ' bookings against ' + Object.keys(prev).length +
      ' stored - ' + moves.length + ' MOVED since the last run');
  }
  var log = loadDriveJson_(SCHED_MOVES_FILE) || { schema: 1, since: nowIso, moves: [] };
  if (!log.moves) log.moves = [];
  for (var m = 0; m < moves.length; m++) { moves[m].seen = nowIso; log.moves.push(moves[m]); }
  if (log.moves.length > SCHED_MOVES_CAP) log.moves = log.moves.slice(log.moves.length - SCHED_MOVES_CAP);
  log.count = log.moves.length;
  log.lastRun = nowIso;
  saveDriveJson_(SCHED_MOVES_FILE, log);
  saveDriveJson_(SCHED_SNAP_FILE, { schema: 1, generatedAt: nowIso, n: nNow, byId: snapNow });
  Logger.log('#287c: store written in ' + Math.round((Date.now() - t0) / 1000) + 's; log now holds ' +
    log.moves.length + ' move(s) since ' + log.since);
  return moves.length;
}

// ===== #287e (Jerin, 5 Nov 2026): a booking cancelled and rebooked for the SAME DAY counts once =====
// He asked: "On cancel & rebook for the same day - lets take the latest one alone. Can that be done?"
// THE RULE IS DELIBERATELY NARROW, and the measurement is why. A blunt "keep the latest" would collapse the
// 145 groups that hold two or more bookings with NONE cancelled - two genuine interviews at one stage on one
// day are common here - to fix the 19 that need it. Seven times more harm than good.
// So an earlier booking is dropped ONLY when it was itself CANCELLED and a LATER-RAISED booking exists for the
// same application + stage + day.
// !! ORDER BY createdAt - when the booking was RAISED - never by the slot time. A rebooking is often earlier
// in the day than the slot it replaced, so slot time gets the direction wrong.
// !! TIES ARE LEFT ALONE: two bookings raised at the same instant cannot be ordered, so neither is dropped.
// !! SCOPED TO INTERVIEW BOOKINGS. A take-home assignment and a #222 report assessment are not rebookings of
// a cancelled slot, so they must never be the "later booking" that absorbs one - which is why this is called
// on the booking rows alone, before the other two sources are appended.
function collapseSameDayRebookings_(rows) {
  var byGroup = {};
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var k = String(r.app) + '|' + String(r.sid) + '|' + String(r.d);
    (byGroup[k] || (byGroup[k] = [])).push(i);
  }
  var drop = {}, absorbed = 0, groups = 0, multi = 0, noneCanc = 0;
  for (var k2 in byGroup) {
    var idx = byGroup[k2];
    if (idx.length < 2) continue;
    multi++;
    var latest = '', anyCanc = false;
    for (var a = 0; a < idx.length; a++) {
      var c = rows[idx[a]].c || '';
      if (c > latest) latest = c;
      if (rows[idx[a]].canc) anyCanc = true;
    }
    if (!anyCanc) { noneCanc++; continue; }
    var hit = 0;
    for (var b = 0; b < idx.length; b++) {
      var row = rows[idx[b]];
      if (!row.canc) continue;
      var mine = row.c || '';
      if (mine && latest && mine < latest) { drop[idx[b]] = 1; hit++; }
    }
    if (hit) { absorbed += hit; groups++; }
  }
  var out = [];
  for (var z = 0; z < rows.length; z++) if (!drop[z]) out.push(rows[z]);
  return { rows: out, absorbed: absorbed, groups: groups, multiGroups: multi, groupsNoneCancelled: noneCanc };
}


// ===== #293 (Jerin, 5 Nov 2026): the round names follow Ashby =====================================
// Given the titles resolved from Ashby this run, decide ONE displayed label per stage KEY and build the
// published rounds list in model order.
// 🔑 WHY A KEY AND NOT A TITLE. Interview plans are per job, so two plans could title the same stage
// differently; keying on the stage KEY collapses them into one round instead of silently splitting one
// round into two columns. (Measured 5 Nov 2026: this workspace runs ONE "Global Shared Interview Plan",
// so they agree today - this keeps them agreeing if that ever stops being true.)
// 🚨 THE LIST AND THE DATA KEYS COME OUT OF THE SAME PLACE ON PURPOSE. Before this, the data was keyed by
// the cached Ashby title while the list came from the model's own static labels, and they matched only
// because the cache never refreshed. Clearing that cache would have made the Online Assessment chart
// VANISH - no error, just not drawn. Both now derive from `liveLabelOf`, so they cannot drift apart.
// ⚠ A round the model knows but Ashby was not read for keeps OUR word for it, so the list never loses a
// round just because nothing was booked in it this run.
function tractionLiveRounds_(nameOf, keyOfTitle, staticRounds) {
  var liveLabelOf = {}, rounds = [], roundKeyOf = {}, sid, k, i, sk, lbl;
  for (sid in nameOf) {
    k = keyOfTitle[nameOf[sid]];
    if (k && !liveLabelOf[k]) liveLabelOf[k] = nameOf[sid];
  }
  for (i = 0; i < staticRounds.length; i++) {
    sk = keyOfTitle[staticRounds[i]] || null;
    lbl = (sk && liveLabelOf[sk]) ? liveLabelOf[sk] : staticRounds[i];
    if (sk) liveLabelOf[sk] = lbl;
    rounds.push(lbl);
    roundKeyOf[lbl] = sk;
  }
  return { liveLabelOf: liveLabelOf, rounds: rounds, roundKeyOf: roundKeyOf };
}


// ===== #287 (Jerin, 6 Nov 2026): a MOVED interview counts on the day it was ORIGINALLY booked for =====
// 🗣 He was shown the cost and took it: *"This is ok. And no note is required."*
// A booking moved from Thursday to Friday sits in FRIDAY's bar, because that is when it now happens, and
// Thursday's bar never knew it existed. This puts it back on THURSDAY as a Rescheduled / Cancelled event,
// which is where he looked for it.
// 🚨 THE COST HE OWNS, AND IT MUST STAY SAYABLE: that one interview is then counted on BOTH days, so
// `bookings` double-counts every move. The stack still sums to `bookings` EXACTLY - what changes is that
// `bookings` is no longer the number of DISTINCT interviews. Measured the day it shipped: 5 moves against
// ~3,000 bookings. 🔑 If that ratio ever stops being small, this is the decision to revisit.
// !! THE ROUND COMES FROM A JOIN, NOT FROM THE STORE. The snapshot keeps only {start, updatedAt,
// applicationId}; the round is recovered by joining the move's SCHEDULE ID against the booking list this run
// already walked. 🚨 Do NOT "fix" this by putting the stage into the snapshot - changing what is stored
// forces a NEW BASELINE and would report a move for every booking at once (#287d).
// !! A move whose booking has left the window cannot be placed. It is COUNTED AS UNPLACED and logged, never
// guessed into a round.
function moveRowsForTraction_(log, sidOfSched, fromDay, dayOf) {
  var out = [], placed = 0, unplaced = 0, tooOld = 0;
  var mv = (log && log.moves) || [];
  for (var i = 0; i < mv.length; i++) {
    var m = mv[i];
    if (!m || !m.id || !m.from) { unplaced++; continue; }
    var sid = sidOfSched[m.id];
    if (!sid) { unplaced++; continue; }
    var d = dayOf(m.from);
    if (!d) { unplaced++; continue; }
    if (d < fromDay) { tooOld++; continue; }
    out.push({ sid: sid, app: m.a || '', d: d, canc: true, mv: true });
    placed++;
  }
  return { rows: out, placed: placed, unplaced: unplaced, tooOld: tooOld };
}
