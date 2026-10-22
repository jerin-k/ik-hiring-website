// ===== run210 - KEEP THIS FIRST IN THE FILE. The Run picker cannot be driven, so the function that runs is
// whichever comes first here; run210 fires RUN210_FN on a one-off trigger (30 min, not the editor 6) and
// asserts the refreshDashboardData clock triggers are untouched. Point RUN210_FN, open this file, press Run.
var RUN210_FN = 'run228cApply';   // #240: read-only Ashby probe. Park back on run228cApply when done   // #222: pointed deliberately at the read-only probe (was rebuildStageRollupsNow)
function run210() {
  var before = 0, after = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'refreshDashboardData') before++; });
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === RUN210_FN) ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger(RUN210_FN).timeBased().after(15000).create();
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'refreshDashboardData') after++; });
  Logger.log('#210: one-off ' + RUN210_FN + ' trigger created, fires in ~15s. Read its output in Executions.');
  Logger.log('#210: refreshDashboardData clock triggers before=' + before + ' after=' + after
    + (before === after ? ' (UNTOUCHED, correct)' : ' CHANGED - THE SCHEDULE IS DAMAGED, reinstall it'));
  return after;
}


// ===== #240 PROBE - can Ashby LIST its interview stages? Read-only, writes nothing. =====
// Decides step B of WORKLIST-240: whether a brand-new EMPTY stage can be caught the moment it is created, or
// only once the first candidate enters it. The pipeline today resolves ONE stage at a time by id
// (/interviewStage.info); it has never asked what stages EXIST.
// THE 403-vs-404 RULE: always include an invented control. A 404 identical to the control is proof of absence;
// a DIFFERENT code means the endpoint is real and something else is wrong (permissions, payload shape).
// SAFETY: only .list and .info are probed. NEVER a create/update/set - #234's lesson is that an empty body can
// still WRITE (opening.create did, and cost two stray openings).
function probe240Stages() {
  var eps = [
    ['/interviewStage.list',        'the one we want - every stage'],
    ['/interviewPlan.list',         'every plan, stages probably nested'],
    ['/interviewStage.info',        'KNOWN GOOD - the pipeline uses it (empty body should complain about a missing id)'],
    ['/interviewPlan.info',         'a plan by id'],
    ['/interviewStageGroup.list',   'a guess at the grouping level'],
    ['/job.list',                   'KNOWN GOOD - proves the key and the control are both working'],
    ['/interviewStage.zzInvented',  'CONTROL - definitely absent, same namespace'],
    ['/totallyMadeUp.endpoint',     'CONTROL - definitely absent']
  ];
  Logger.log('#240 probe: ' + eps.length + ' endpoints, READ-ONLY, empty bodies. Nothing is written.');
  for (var i = 0; i < eps.length; i++) {
    var ep = eps[i][0];
    // #240 FIX 16 Oct: the old guard was /\.(list|info)$/ which SILENTLY SKIPPED BOTH
    // INVENTED CONTROLS, leaving the one 404 uninterpretable. Block write verbs instead,
    // so a made-up path still gets called and can serve as the control it was meant to be.
    if (/\.(create|update|delete|set|add|remove|hire|archive)/i.test(ep)) {
      Logger.log('#240 SKIPPED (write verb, refusing): ' + ep); continue;
    }
    var out = { code: 0, text: '' };
    try {
      var resp = UrlFetchApp.fetch(ASHBY_API_BASE + ep, {
        method: 'post', contentType: 'application/json',
        headers: { 'Authorization': 'Basic ' + Utilities.base64Encode(getAshbyApiKey_() + ':') },
        payload: '{}', muteHttpExceptions: true });
      out.code = resp.getResponseCode();
      out.text = String(resp.getContentText() || '').substring(0, 220);
    } catch (e) { out.code = -1; out.text = 'threw: ' + e.message; }
    var n = '';
    try { var j = JSON.parse(out.text);
      if (j && j.results && j.results.length != null) n = '  results=' + j.results.length;
      else if (j && j.success === false) n = '  errors=' + JSON.stringify(j.errors || j.errorInfo || '').substring(0, 90);
    } catch (x) {}
    Logger.log('#240 | ' + (ep + '                          ').substring(0, 28) + ' HTTP ' + out.code + n
      + '  <- ' + eps[i][1]);
    Logger.log('#240 |     body: ' + out.text.replace(/\s+/g, ' ').substring(0, 1500));
    Utilities.sleep(200);
  }
  Logger.log('#240 probe done. Compare each against the two CONTROLS: same code as a control = that endpoint does not exist.');
}

// ===== #232b (Jerin, 14 Oct 2026) - stage history THREE times a day, pinned to the half hour =====
// "yes set them, pin to the half hour". 07:30 / 14:30 / 19:30 IST - one hour after each main refresh
// (6 AM / 1 PM / 6 PM), so every run works from a freshly rebuilt worklist. nearMinute(30) holds each firing
// within 15 minutes of the half hour, so a late-running 6 PM refresh can no longer overlap the evening start.
// Replaces the everyHours(12) trigger Recon.gs left behind, which drifted and was tied to nothing.
// SAFE BY CONSTRUCTION: deletes ONLY refreshStageHistory handlers, creates no recurring trigger for itself,
// and asserts the refreshDashboardData schedule is untouched before reporting success.
function run232Triggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'run232Triggers') ScriptApp.deleteTrigger(t);   // its own one-off from run210
  });
  var before = {}, n0 = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) { var h = t.getHandlerFunction(); before[h] = (before[h] || 0) + 1; n0++; });
  Logger.log('#232b BEFORE: ' + n0 + ' triggers - ' + JSON.stringify(before));
  var deleted = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'refreshStageHistory') { ScriptApp.deleteTrigger(t); deleted++; }
  });
  [7, 14, 19].forEach(function (h) {
    ScriptApp.newTrigger('refreshStageHistory').timeBased().atHour(h).nearMinute(30).everyDays(1).inTimezone('Asia/Kolkata').create();
  });
  var after = {}, n1 = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) { var h = t.getHandlerFunction(); after[h] = (after[h] || 0) + 1; n1++; });
  Logger.log('#232b deleted ' + deleted + ' refreshStageHistory trigger(s), created 3 at 07:30 / 14:30 / 19:30 IST');
  Logger.log('#232b AFTER: ' + n1 + ' triggers - ' + JSON.stringify(after));
  var b = before['refreshDashboardData'] || 0, a = after['refreshDashboardData'] || 0;
  Logger.log('#232b CONTROL refreshDashboardData ' + b + ' -> ' + a + (b === a ? ' (UNTOUCHED, correct)' : ' CHANGED - THE MAIN SCHEDULE IS DAMAGED'));
  Logger.log('#232b refreshStageHistory now ' + (after['refreshStageHistory'] || 0) + ' (expect 3)');
}

// ===== #222 PROBE - read-only. run210 now leads this file, because the picker defaults to the FIRST one =====
// Read-only. Asks whether THIS key can run the saved Assessments report, with an invented control so a
// failure can be told apart from an endpoint that does not exist (the 403-vs-404 rule). Writes nothing.
function probe222Reports() {
  var RID = "1e5e5d45-b5d9-45fb-8e4c-d37325bc0cea";
  var r = ashbyPost_("/report.synchronous", { reportId: RID });
  var res = (r && r.results) ? r.results : r;
  Logger.log("#222 status=" + res.status + " failureReason=" + (res.failureReason || "none"));
  var d = res.reportData;
  if (!d) { Logger.log("#222 NO reportData. keys=" + Object.keys(res).join(",")); return; }
  Logger.log("#222 reportData type=" + (Array.isArray(d) ? "array len " + d.length : typeof d + " keys " + Object.keys(d).join(",")));
  var rows = Array.isArray(d) ? d : (d.rows || d.data || null);
  if (!rows) { Logger.log("#222 could not find a rows array"); return; }
  Logger.log("#222 ROWCOUNT=" + rows.length);
  Logger.log("#222 HEADER=" + JSON.stringify(rows[0]).substring(0, 400));
  var hdr = rows[0], iStage = -1, iSent = -1, iStatus = -1, iPartner = -1;
  for (var h = 0; h < hdr.length; h++) {
    var nm = String(hdr[h]);
    if (/Scheduled in Stage/i.test(nm)) iStage = h;
    if (/Assessment Sent/i.test(nm)) iSent = h;
    if (/Activity Status/i.test(nm)) iStatus = h;
    if (/Integration Partner/i.test(nm)) iPartner = h;
  }
  Logger.log("#222 idx stage=" + iStage + " sent=" + iSent + " status=" + iStatus + " partner=" + iPartner);
  var stage = {}, status = {}, partner = {}, blankSent = 0, blankStage = 0, n = 0;
  for (var k = 1; k < rows.length; k++) {
    var row = rows[k]; n++;
    var sv = iStage >= 0 ? String(row[iStage] == null ? "" : row[iStage]).trim() : "";
    if (!sv) { blankStage++; sv = "(blank)"; }
    stage[sv] = (stage[sv] || 0) + 1;
    var st = iStatus >= 0 ? String(row[iStatus] || "(blank)") : "?";
    status[st] = (status[st] || 0) + 1;
    var pt = iPartner >= 0 ? String(row[iPartner] || "(blank)") : "?";
    partner[pt] = (partner[pt] || 0) + 1;
    var se = iSent >= 0 ? String(row[iSent] == null ? "" : row[iSent]).trim() : "";
    if (!se) blankSent++;
  }
  Logger.log("#222 DATAROWS=" + n + " blankStage=" + blankStage + " blankSentDate=" + blankSent);
  Logger.log("#222 STAGES=" + JSON.stringify(stage).substring(0, 700));
  Logger.log("#222 STATUSES=" + JSON.stringify(status));
  Logger.log("#222 PARTNERS=" + JSON.stringify(partner));
}

// ===== #204 RUNNER - KEEP THIS FIRST IN THE FILE =====
// The editor function picker cannot be driven from a background tab (its dropdown needs a real click) and it
// DEFAULTS TO THE FIRST FUNCTION IN THE OPEN FILE. So #204 is driven from here: point this at the step you
// want and press Run. Same reason the note below says testTofu was "first in the file on purpose".
// ===== #210 LAUNCHER - KEEP FIRST IN THE FILE (the Run picker defaults to the first function) =====
// Runs probe210 on a ONE-OFF TRIGGER so it gets 30 minutes instead of the editor's 6. probe210 writes nothing.
// Point this at the function you want to run on a trigger. 'probe210' = the dry-run comparison;
// 'rebuildStageRollupsNow' = recompute and PUBLISH the stored rollups.
function run204() {
  // #204 housekeeping. Deletes ONLY the spent one-off triggers this task created, and ASSERTS that the three
  // scheduled refreshDashboardData clock triggers are untouched - deleting those by accident is the single
  // worst thing this file could do (triggerRefreshNow and setupDailyTriggers both wipe them, which is how the
  // 1 PM trigger deleted in #175b came back).
  var MINE = { build204Step: 1, parity204B_live: 1, parity204B_store: 1, parity204Afull: 1, manualRefresh_: 1 };
  var before = 0, after = 0, removed = [];
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'refreshDashboardData') before++; });
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var f = t.getHandlerFunction();
    if (MINE[f]) { ScriptApp.deleteTrigger(t); removed.push(f); }
  });
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'refreshDashboardData') after++; });
  Logger.log('#204 cleanup: removed ' + removed.length + ' spent one-off trigger(s) [' + removed.join(', ') + ']');
  Logger.log('#204 cleanup: refreshDashboardData clock triggers before=' + before + ' after=' + after
    + (before === after ? ' (UNTOUCHED, correct)' : ' CHANGED - the schedule is damaged, reinstall it'));
  store204Status();
  return after;
}

// 8 Oct 2026 - WHY THIS IS A BLOCK AND NOT A ONE-LINER, AND WHAT IS MISSING FROM THIS FILE.
// I re-pointed run204 about a dozen times during #204 using: start = indexOf('function run204() {'), end =
// indexOf of the next newline-brace-newline, then splice. That end boundary is only correct for a MULTI-LINE
// body. Whenever run204 was a ONE-LINER there is no newline-brace-newline inside it, so the search ran on to
// the end of the NEXT function and the splice DELETED that function. Repeated, it ate testTofu,
// probeHistoryAndOnBehalf and probe204: 269 lines down to 36. trim204_ survived and is now dead code.
// 🔑 THE FIX IS THE RULE THIS PROJECT ALREADY HAS, WHICH I DID NOT APPLY: assert what you are about to
//    REMOVE, not only what you matched. A unique start anchor says nothing about where the end lands. The
//    replacement above is brace-matched and asserts the slice contains no other 'function'.
// 📦 THE LOST FUNCTIONS ARE INTACT IN GIT at site/apps-script/Probe.gs (the pipeline syncs this file to the
//    repo on every refresh, and the 6:38 AM sync on 8 Oct captured all 269 lines). Restore from there if the
//    updateHistory / X-On-Behalf-Of probe is ever wanted again - its FINDINGS are already written up in
//    [[project_ashby-write-api-map]], so nothing measured was lost, only the code that measured it.
// ⚠ Nothing in the live pipeline calls anything in this file. The 18.5-minute refresh at 09:42 and the
//   Version 60 web-app hit at 10:05 both ran clean while this file was mangled.


// The trimmed record the Drive store would hold: every field fetchAndProcessApps_ actually reads, and nothing else.
// 🔒 ce = candidate email. The store is DRIVE-ONLY and must NEVER be pushed to GitHub (Rule 9, same boundary as
// offer_contacts.json). dashboard.json is a PUBLIC repo.
function trim204_(a) {
  var ht = [], src = a.hiringTeam || [];
  for (var i = 0; i < src.length; i++) {
    var m = src[i];
    if (m.role === 'Recruiter' || m.role === 'Sourcer') ht.push({ r: m.role === 'Recruiter' ? 1 : 2, n: memberName_(m), u: m.userId || null });
  }
  var st = a.source && a.source.sourceType ? (a.source.sourceType.title || a.source.sourceType) : null;
  if (typeof st === 'object') st = null;
  return { i: a.id, c: a.createdAt || null, u: a.updatedAt || null, s: a.status || null,
    av: a.archivedAt || null, ar: (a.archiveReason && a.archiveReason.text) || null,
    rt: (a.archiveReason && a.archiveReason.reasonType) || null,
    j: (a.job && a.job.id) || null,
    sg: (a.currentInterviewStage && a.currentInterviewStage.title) || null,
    cn: (a.candidate && (a.candidate.name || ((a.candidate.firstName || '') + ' ' + (a.candidate.lastName || '')).trim())) || null,
    ce: (a.candidate && a.candidate.primaryEmailAddress && a.candidate.primaryEmailAddress.value) || null,
    sT: st, sN: (a.source && typeof a.source.title === 'string' && a.source.title) ? a.source.title : null, ht: ht };
}

// ===== #222 - apply the new rules to the live data, ONCE. =====
// 🚨 DO NOT point RUN210_FN at refreshStageHistory itself. run210 DELETES every trigger whose handler matches
// RUN210_FN before creating its one-off, and its safety assertion only counts refreshDashboardData triggers - so
// it would quietly destroy the refreshStageHistory SCHEDULE and report "UNTOUCHED, correct". This wrapper has no
// trigger of its own, so deleting "every trigger for run222Apply" deletes nothing.
// refreshStageHistory rebuilds the stage rollups AND calls refreshInterviewTraction, so one run covers both.
function run222Apply() {
  refreshStageHistory();
}


// #228a (13 Oct 2026): a wrapper with NO TRIGGER OF ITS OWN, so run210's trigger sweep deletes nothing.
// 🚨 Never point RUN210_FN at refreshStageHistory itself - it HAS its own schedule (four rows on the
// Triggers page) and run210 deletes every trigger whose handler matches, while its safety check only
// counts refreshDashboardData. Read-only against Ashby; rewrites interview_traction.json only.
function run228Apply() {
  refreshInterviewTraction();
}


// ===== #228c (13 Oct 2026): READ-ONLY. Does Ashby give us an address for every recruiter? =====
// Jerin: "In Admin Access Management, every user has an email ID / Same is the ID they have in Ashby as
// well / Isnt that a simple match?" - he is right, and this measures it before anything depends on it.
// Writes NOTHING. Compares the Ashby address against the dashboard's own recruiter list.
function probe228c() {
  var dash = loadDriveJson_('dashboard.json') || {};
  var recs = dash.recruiters || [];
  var emailById = {}, users = 0, withEmail = 0;
  ashbyListAll_('/user.list').forEach(function (u) {
    users++;
    if (u.email) { emailById[u.id] = String(u.email).trim().toLowerCase(); withEmail++; }
  });
  Logger.log('228c| ashby users=' + users + ' withEmail=' + withEmail);
  var hit = 0, noUid = [], noMail = [];
  for (var r = 0; r < recs.length; r++) {
    var rc = recs[r]; if (!rc.name || rc.name === 'Unassigned') continue;
    if (!rc.userId) { noUid.push(rc.name); continue; }
    if (emailById[rc.userId]) { hit++; Logger.log('228c| ' + rc.name + ' = ' + emailById[rc.userId]); }
    else noMail.push(rc.name);
  }
  Logger.log('228c| recruiters WITH an ashby address: ' + hit);
  Logger.log('228c| no userId at all (' + noUid.length + '): ' + noUid.join(' | '));
  Logger.log('228c| userId but no address (' + noMail.length + '): ' + noMail.join(' | '));
}

// #228c: the full refresh, wrapped so run210's trigger sweep cannot touch refreshDashboardData's own
// schedule. 🚨 NEVER point RUN210_FN at refreshDashboardData itself - it has three clock triggers.
function run228cApply() {
  refreshDashboardData();
}

// ===== #240 housekeeping: delete SPENT one-off triggers =====
// 16 Oct 2026. The project hit Apps Script 20-trigger ceiling, so run210 could not
// create its one-off and probe240Stages never ran:
//   "This script has too many triggers. Triggers must be deleted from the script
//    before more can be added."
// Deletes ONLY handlers listed in SPENT_240. refreshDashboardData and refreshStageHistory
// are absent from that list AND guarded by KEEP_240; the function throws if either count
// moves. Idempotent - safe to re-run. Anything on neither list is reported as UNKNOWN
// and left alone.
function cleanupSpentTriggers_240() {
  var SPENT_240 = ["probeTrace","probe210","probe221","probe222","probe222b","probe223",
                   "probe228c","probe222Reports","buildRetagPlan","run222Apply",
                   "run228Apply","run228cApply","runRefreshOnceSafe","probe240Stages"];
  var KEEP_240 = ["refreshDashboardData","refreshStageHistory"];
  function tally(ts) {
    var mm = {}, i, h;
    for (i = 0; i < ts.length; i++) { h = ts[i].getHandlerFunction(); mm[h] = (mm[h] || 0) + 1; }
    return mm;
  }
  var all = ScriptApp.getProjectTriggers();
  var before = tally(all);
  var deleted = [], keptReal = [], unknown = [], i, h;
  for (i = 0; i < all.length; i++) {
    h = all[i].getHandlerFunction();
    if (KEEP_240.indexOf(h) !== -1) { keptReal.push(h); continue; }
    if (SPENT_240.indexOf(h) === -1) { unknown.push(h); continue; }
    ScriptApp.deleteTrigger(all[i]);
    deleted.push(h);
  }
  var now = ScriptApp.getProjectTriggers();
  var after = tally(now);
  Logger.log("BEFORE  total %s  %s", all.length, JSON.stringify(before));
  Logger.log("DELETED %s  %s", deleted.length, JSON.stringify(deleted.sort()));
  Logger.log("KEPT (real jobs) %s  %s", keptReal.length, JSON.stringify(keptReal.sort()));
  Logger.log("UNKNOWN (left alone) %s  %s", unknown.length, JSON.stringify(unknown.sort()));
  Logger.log("AFTER   total %s  %s", now.length, JSON.stringify(after));
  for (i = 0; i < KEEP_240.length; i++) {
    var n = KEEP_240[i], b = before[n] || 0, a = after[n] || 0;
    Logger.log("GUARD %s before=%s after=%s %s", n, b, a, (b === a ? "OK" : "CHANGED"));
    if (b !== a) throw new Error("GUARD FAILED: " + n + " went from " + b + " to " + a);
  }
  Logger.log("Trigger slots free now: %s of 20", 20 - now.length);
  return { deleted: deleted.length, total: now.length };
}

// ===== #240 probe B - READ-ONLY. Does Ashby hand back its canonical stage titles? =====
// 16 Oct 2026. Probe A proved the endpoints EXIST but logged only 150 chars of each body,
// so it never showed the stage names - the one thing #240 actually needs. Uses ashbyPost_
// (the pipeline helper) because these calls are expected to succeed. Only .list endpoints.
function probe240StagesB() {
  var plans = ashbyPost_("/interviewPlan.list", {});
  var ps = (plans && plans.results) || [];
  Logger.log("#240B interviewPlan.list -> %s plans", ps.length);
  if (ps.length) Logger.log("#240B plan keys = %s", JSON.stringify(Object.keys(ps[0])));
  var i, j, k;
  for (i = 0; i < Math.min(ps.length, 8); i++) {
    Logger.log("#240B   plan %s | %s", i, ps[i].title || ps[i].name || "(no title)");
  }
  for (var pi = 0; pi < ps.length; pi++) {
    try {
      var st = ashbyPost_("/interviewStage.list", { interviewPlanId: ps[pi].id });
      var sr = (st && st.results) || [];
      Logger.log("#240B PLAN %s [%s] -> %s stages  ok=%s", pi, ps[pi].title, sr.length, st && st.success);
      if (sr.length) Logger.log("#240B stage keys = %s", JSON.stringify(Object.keys(sr[0])));
      for (j = 0; j < sr.length; j++) {
        Logger.log("#240B   p%s stage %s | title=%s | order=%s | type=%s", pi, j, sr[j].title,
          sr[j].orderInInterviewPlan, sr[j].type || sr[j].interviewStageType || "");
      }
    } catch (e) {
      Logger.log("#240B interviewStage.list THREW: %s", String(e).substring(0, 300));
    }
  }
  try {
    var grp = ashbyPost_("/interviewStageGroup.list", {});
    var gr = (grp && grp.results) || [];
    Logger.log("#240B interviewStageGroup.list -> %s groups", gr.length);
    if (gr.length) Logger.log("#240B group keys = %s", JSON.stringify(Object.keys(gr[0])));
    for (k = 0; k < Math.min(gr.length, 25); k++) {
      Logger.log("#240B   group %s | %s", k, gr[k].title || gr[k].name || "(no title)");
    }
  } catch (e2) {
    Logger.log("#240B interviewStageGroup.list THREW: %s", String(e2).substring(0, 300));
  }
  Logger.log("#240B done - nothing was written.");
}

// ===== #240 probe C - WHICH JOBS USE WHICH INTERVIEW PLAN. READ-ONLY. =====
// 16 Oct 2026, Jerin: "tell me which job number is HR Operations & Test. I'd like to check and figure
// why it has different stage approaches. Shouldnt ideally."
// Only .list and .info. Nothing is written.
function probe240JobPlans() {
  var plans = ashbyPost_("/interviewPlan.list", {});
  var ps = (plans && plans.results) || [];
  var nameById = {}, i;
  for (i = 0; i < ps.length; i++) {
    nameById[ps[i].id] = ps[i].title;
    Logger.log("#240C plan | %s | %s | archived=%s", ps[i].id, ps[i].title, ps[i].isArchived);
  }
  var probe = ashbyPost_("/job.list", { limit: 3 });
  var pr = (probe && probe.results) || [];
  if (pr.length) Logger.log("#240C job.list keys = %s", JSON.stringify(Object.keys(pr[0])));
  if (pr.length) {
    try {
      var info = ashbyPost_("/job.info", { jobId: pr[0].id });
      var ir = info && info.results;
      if (ir) Logger.log("#240C job.info keys = %s", JSON.stringify(Object.keys(ir)));
    } catch (e) { Logger.log("#240C job.info threw: %s", String(e).substring(0, 200)); }
  }
  var cursor = null, page = 0, tally = {}, odd = [], total = 0, j;
  do {
    var body = { limit: 100 };
    if (cursor) body.cursor = cursor;
    var res = ashbyPost_("/job.list", body);
    var rows = (res && res.results) || [];
    for (j = 0; j < rows.length; j++) {
      var job = rows[j];
      var pid = job.interviewPlanId || job.defaultInterviewPlanId ||
        (job.interviewPlan && job.interviewPlan.id) || null;
      total++;
      var key = pid ? (nameById[pid] || ("unknown plan " + pid)) : "(no plan field on job.list)";
      tally[key] = (tally[key] || 0) + 1;
      if (pid && nameById[pid] && nameById[pid].indexOf("Global Shared") < 0) {
        odd.push(job.title + " || num=" + (job.jobNumber || job.customJobNumber || "?") +
          " || " + nameById[pid] + " || status=" + job.status + " || id=" + job.id);
      }
    }
    cursor = (res && res.moreDataAvailable) ? res.nextCursor : null;
    page++;
  } while (cursor && page < 6);
  Logger.log("#240C jobs scanned: %s (pages %s)", total, page);
  for (var k in tally) Logger.log("#240C TALLY | %s | %s jobs", k, tally[k]);
  for (i = 0; i < odd.length; i++) Logger.log("#240C NONSHARED | %s", odd[i]);
  if (!odd.length) Logger.log("#240C NONSHARED | none found on job.list");
  Logger.log("#240C done - nothing was written.");
}

// ===== #241 probe - CAN THE API SEE WHICH APPLICATION WAS HIRED INTO AN OPENING? READ-ONLY. =====
// data/hire_links.json says "the public API cannot see these links" and was captured BY HAND from the
// Ashby Openings screen on 15 Sep. That is a claim about the SOURCE, and this project has been wrong
// about that kind of claim before, so it is measured rather than repeated.
// Test case: opening d3c3bf6a... has candidate "Pradeepthi J" hired into it per hire_links.json.
// Includes an INVENTED control endpoint: a 404 identical to the control is proof of absence.
function probe241Links() {
  var TARGET = "d3c3bf6a-7c43-420a-9faa-954e6e113f76";
  var all = ashbyListAll_("/opening.list"), hit = null, i;
  for (i = 0; i < all.length; i++) if (all[i].id === TARGET) { hit = all[i]; break; }
  Logger.log("#241 opening.list -> " + all.length + " openings; target found=" + !!hit);
  if (hit) {
    Logger.log("#241 TOP KEYS: " + JSON.stringify(Object.keys(hit)));
    if (hit.latestVersion) Logger.log("#241 latestVersion KEYS: " + JSON.stringify(Object.keys(hit.latestVersion)));
    var s = JSON.stringify(hit);
    Logger.log("#241 blob mentions application=" + (s.indexOf("pplication") >= 0)
      + " hired=" + (s.indexOf("ired") >= 0) + " locked=" + (s.indexOf("ocked") >= 0)
      + " blobLen=" + s.length);
  }
  var eps = ["/opening.info", "/opening.getApplications", "/opening.listApplications", "/zzzNotARealEndpoint.list"];
  for (i = 0; i < eps.length; i++) {
    try {
      var r = ashbyPost_(eps[i], { openingId: TARGET, id: TARGET });
      Logger.log("#241 " + eps[i] + " -> success=" + (r && r.success)
        + " keys=" + JSON.stringify(Object.keys(r || {})).substring(0, 160)
        + " err=" + JSON.stringify((r && (r.errors || r.error)) || "").substring(0, 120));
      if (r && r.results) {
        var rr = r.results, isArr = Object.prototype.toString.call(rr) === "[object Array]";
        var one = isArr ? (rr[0] || {}) : rr;
        Logger.log("#241 " + eps[i] + " RESULTS isArray=" + isArr + " n=" + (isArr ? rr.length : 1)
          + " resultKeys=" + JSON.stringify(Object.keys(one)).substring(0, 300));
        var blob = JSON.stringify(rr);
        Logger.log("#241 " + eps[i] + " RESULTS mentions application=" + (blob.indexOf("pplication") >= 0)
          + " hired=" + (blob.indexOf("ired") >= 0) + " locked=" + (blob.indexOf("ocked") >= 0)
          + " candidate=" + (blob.indexOf("andidate") >= 0) + " len=" + blob.length);
      }
    } catch (e) { Logger.log("#241 " + eps[i] + " THREW " + String(e).substring(0, 160)); }
  }
  Logger.log("#241 done - nothing was written.");
}

/**
 * #269a PROBE - 20 Oct 2026. READ ONLY: no writes, no triggers, no properties touched.
 * Settles three things before any pipeline change for #269:
 *   1. the EXACT custom-field titles that sit on an opening;
 *   2. how many openings actually CARRY Role Type / Employment Type / Budget;
 *   3. the SHAPE of the Currency budget value, so the aggregation can parse it.
 * Money is never logged as a figure - every digit is masked to #.
 */
function probe269Fields() {
  var ops = fetchOpenings_();
  var titles = {}, shapes = {}, n = 0;
  var cnt = { roleType: 0, empType: 0, budget: 0 };
  ops.forEach(function (o) {
    n++;
    var cfs = (o.latestVersion && o.latestVersion.customFields) || [];
    cfs.forEach(function (f) {
      var t = f.title || f.name || "(untitled)";
      titles[t] = (titles[t] || 0) + 1;
    });
    if (openingCustomFieldByTitle_(o, /role type/i)) cnt.roleType++;
    if (openingCustomFieldByTitle_(o, /employment type/i)) cnt.empType++;
    var bd = openingCustomFieldByTitle_(o, /budget/i);
    if (bd) {
      cnt.budget++;
      var masked = String(bd).replace(/[0-9]/g, "#");
      shapes[masked] = (shapes[masked] || 0) + 1;
    }
  });
  Logger.log("#269a PROBE - READ ONLY - " + n + " openings seen");
  Logger.log("  carries Role Type       : " + cnt.roleType);
  Logger.log("  carries Employment Type : " + cnt.empType);
  Logger.log("  carries a Budget value  : " + cnt.budget);
  var keys = Object.keys(titles).sort();
  Logger.log("  DISTINCT custom-field titles on openings (" + keys.length + "):");
  keys.forEach(function (k) { Logger.log("    \"" + k + "\"  on " + titles[k] + " openings"); });
  var sk = Object.keys(shapes);
  Logger.log("  budget value SHAPES, digits masked (" + sk.length + " distinct):");
  sk.forEach(function (k) { Logger.log("    " + k + "   x" + shapes[k]); });
  return cnt;
}


// ===== #271b - PROVE THE GUARD ACTUALLY CATCHES (20 Oct 2026) =====
// #271 shipped with its catch path UNEXERCISED: Drive behaved on the verifying run, and an outage cannot be
// summoned. That is why saveDriveBackupTo_ takes the folder id as a parameter - a bogus id reaches the SAME
// catch a real Drive failure would, in the REAL function, not a copy of it.
// READ-ONLY apart from one test file in the dashboard folder, which it trashes again at the end.
function probe271Guard() {
  // CONTROL FIRST: if the happy path does not work, a false from the bogus id proves nothing.
  var ok = saveDriveBackupTo_(DASHBOARD_FOLDER_ID, 'probe271_guard_test.json', { probe: '271b', at: new Date().toISOString() });
  var n0 = DRIVE_BACKUP_FAILURES_.length;
  var bad = saveDriveBackupTo_('this-folder-id-does-not-exist-271b', 'probe271_should_never_be_written.json', { x: 1 });
  var n1 = DRIVE_BACKUP_FAILURES_.length;
  Logger.log('probe271Guard: CONTROL happy path returned ' + ok + ' (expect true)');
  Logger.log('probe271Guard: bogus folder returned ' + bad + ' (expect false) AND DID NOT THROW');
  Logger.log('probe271Guard: failure tally ' + n0 + ' -> ' + n1 + ' (expect +1)');
  Logger.log('probe271Guard: the summary note a human would see reads ->' + driveBackupNote_());
  Logger.log(ok === true && bad === false && n1 === n0 + 1 ? 'probe271Guard: PASS' : 'probe271Guard: FAIL');
  try {
    var fo = DriveApp.getFolderById(DASHBOARD_FOLDER_ID), fs = fo.getFilesByName('probe271_guard_test.json');
    while (fs.hasNext()) { fs.next().setTrashed(true); }
    Logger.log('probe271Guard: test file trashed');
  } catch (e) { Logger.log('probe271Guard: cleanup FAILED - ' + e.message + ' - trash probe271_guard_test.json by hand'); }
}

// ===== #277 — CAN WE CREATE CANDIDATES AT ALL? Read-only + validation-only. =====
// Writes NOTHING. Every write-shaped call is built so that success is IMPOSSIBLE:
//   candidate.create    -> objects where strings are required
//   application.create  -> a candidateId of all zeroes, which cannot exist
// Both are paired with an INVENTED control endpoint, because a 403 and a 404 are
// only readable against one [[project_ashby-write-api-map]]. The controls are
// logged even when they looking boring - a dropped control is what made an earlier
// probe meaningless [[feedback_assert-what-you-remove]].
function probe277Feasibility() {
  var ZERO = '00000000-0000-0000-0000-000000000000';
  var L = [];
  function say(s) { L.push(s); Logger.log(s); }

  function call(ep, body) {
    try {
      var r = ashbyWrite_('/' + ep, body) || {};
      return { code: r.code, success: (r.json ? r.json.success : undefined),
               errors: (r.json && r.json.errors) ? JSON.stringify(r.json.errors).slice(0, 120) : '',
               text: String(r.text == null ? '' : r.text).slice(0, 160),
               json: r.json, threw: '' };
    } catch (e) {
      return { code: 'threw', success: undefined, errors: '', text: '', json: null,
               threw: String(e && e.message || e).slice(0, 120) };
    }
  }

  say('=== #277 feasibility probe, ' + new Date().toISOString() + ' ===');

  // ---- 1. the SOURCE he added ~10 minutes ago. Ids are NEVER logged (DLP masks
  //         uuid+title pairs, and the writer resolves the id by name anyway).
  var sres = call('source.list', {});
  var srcs = (sres.json && sres.json.results) || [];
  say('source.list http=' + sres.code + ' success=' + (sres.json && sres.json.success) +
      ' count=' + srcs.length);
  var smeKeys = [];
  for (var i = 0; i < srcs.length; i++) {
    var s = srcs[i];
    var key = ((s.sourceType && s.sourceType.title) || '?') + ': ' + (s.title || '?');
    if (/sme/i.test(key)) smeKeys.push(key + (s.isArchived ? '  [ARCHIVED]' : ''));
  }
  say('sources whose name mentions SME: ' + smeKeys.length);
  for (var k = 0; k < smeKeys.length; k++) say('   ' + smeKeys[k]);

  // ---- 2. the Kong job and the stage a new application would land in
  var jres = call('job.list', { status: 'Open' });
  var jobs = (jres.json && jres.json.results) || [];
  var kong = null;
  for (var j = 0; j < jobs.length; j++) {
    if ((jobs[j].title || '').indexOf('Forward Deployed Engineer - Kong') === 0) kong = jobs[j];
  }
  say('job.list http=' + jres.code + ' open jobs=' + jobs.length +
      ' kong found=' + (!!kong) + (kong ? ' status=' + kong.status : ''));

  var stageTitles = [];
  if (kong) {
    var pres = call('interviewPlan.list', {});
    var plans = (pres.json && pres.json.results) || [];
    say('interviewPlan.list http=' + pres.code + ' plans=' + plans.length);
    var sres2 = call('interviewStage.list', { interviewPlanId: kong.interviewPlanIds && kong.interviewPlanIds[0] });
    var stages = (sres2.json && sres2.json.results) || [];
    for (var t = 0; t < stages.length; t++) {
      stageTitles.push((stages[t].orderInInterviewPlan != null ? stages[t].orderInInterviewPlan : '?') +
                       ' ' + stages[t].title + ' [' + (stages[t].type || '?') + ']');
    }
    say('interviewStage.list http=' + sres2.code + ' stages=' + stages.length);
    for (var u = 0; u < stageTitles.length; u++) say('   ' + stageTitles[u]);
  }

  // ---- 3. does the key say what it may do? (free if it exists, a 404 if not)
  var ares = call('apiKey.info', {});
  say('apiKey.info http=' + ares.code + ' body=' + ares.text + (ares.threw ? ' THREW=' + ares.threw : ''));

  // ---- 4. THE CONTROLS and the two permission probes, interleaved so the pair
  //         is always read together.
  var probes = [
    ['zzzProbeNotARealEndpoint.list', {},                              'CONTROL A - nothing of this name exists'],
    ['candidate.create',              { name: {}, email: {} },         'candidate.create, un-coercible payload'],
    ['candidate.createZZZPROBE',      { name: {}, email: {} },         'CONTROL B - same payload, invented name'],
    ['application.create',            { candidateId: ZERO, jobId: ZERO }, 'application.create, impossible ids'],
    ['application.createZZZPROBE',    { candidateId: ZERO, jobId: ZERO }, 'CONTROL C - same payload, invented name'],
    ['candidate.search',              { email: 'nobody.probe277@example.invalid' }, 'candidate.search (read)']
  ];
  for (var p = 0; p < probes.length; p++) {
    var r = call(probes[p][0], probes[p][1]);
    var errs = r.errors;
    say(probes[p][0] + '  http=' + r.code +
        ' success=' + (r.json ? r.json.success : '?') +
        ' errors=' + errs + (r.threw ? ' THREW=' + r.threw : '') +
        '   <- ' + probes[p][2]);
  }

  say('=== probe done. NOTHING WAS CREATED: every write-shaped call above was ' +
      'built to fail validation. ===');
  return L.join('\n');
}


// ===== #277b — the two things the first probe could not answer. Read-only. =====
// 1. invalid_input proves the ENDPOINT is reachable, NOT that the key may write:
//    Ashby validates the payload before it checks the scope. The scopes list is
//    the only honest answer, so read it and print it.
// 2. job.list {status:'Open'} returned ZERO jobs - a wrong filter value, not an
//    empty workspace. Page it properly and find the Kong job and its stages.
function probe277bScopes() {
  function say(s) { Logger.log(s); }
  function call(ep, body) {
    try { var r = ashbyWrite_('/' + ep, body) || {};
          return { code: r.code, json: r.json, threw: '' }; }
    catch (e) { return { code: 'threw', json: null, threw: String(e && e.message || e).slice(0, 120) }; }
  }

  say('=== #277b, ' + new Date().toISOString() + ' ===');

  // ---- 1. WHAT MAY THIS KEY DO? Scopes are short words, safe to print whole.
  var a = call('apiKey.info', {});
  var sc = (a.json && a.json.results && a.json.results.scopes) || [];
  say('apiKey.info http=' + a.code + ' scopes=' + sc.length);
  var writes = [];
  for (var i = 0; i < sc.length; i++) if (String(sc[i]).indexOf('write') >= 0) writes.push(sc[i]);
  say('WRITE scopes (' + writes.length + '): ' + writes.join(' '));
  say('ALL scopes: ' + sc.join(' '));
  // the two that decide #277, named explicitly so the answer cannot be misread
  say('candidates:write present? ' + (sc.indexOf('candidates:write') >= 0));
  say('applications:write present? ' + (sc.indexOf('applications:write') >= 0));

  // ---- 2. the Kong job. No status filter - page the lot and match on title.
  var all = [], cursor = null, pages = 0, kong = null;
  do {
    var body = { limit: 100 };
    if (cursor) body.cursor = cursor;
    var r = call('job.list', body);
    var res = (r.json && r.json.results) || [];
    if (r.code !== 200) { say('job.list http=' + r.code + ' threw=' + r.threw); break; }
    for (var j = 0; j < res.length; j++) {
      all.push(res[j]);
      if ((res[j].title || '').indexOf('Forward Deployed Engineer - Kong') === 0) kong = res[j];
    }
    cursor = (r.json && r.json.moreDataAvailable) ? r.json.nextCursor : null;
    pages++;
  } while (cursor && pages < 30);
  say('job.list pages=' + pages + ' jobs=' + all.length + ' kong found=' + (!!kong) +
      (kong ? ' status=' + kong.status + ' plans=' +
              ((kong.interviewPlanIds && kong.interviewPlanIds.length) || 0) : ''));

  // ---- 3. the stages on that job, so we know what "Lead" actually is here
  if (kong && kong.interviewPlanIds && kong.interviewPlanIds.length) {
    var s = call('interviewStage.list', { interviewPlanId: kong.interviewPlanIds[0] });
    var stages = (s.json && s.json.results) || [];
    say('interviewStage.list http=' + s.code + ' stages=' + stages.length);
    for (var t = 0; t < stages.length; t++) {
      say('   ' + (stages[t].orderInInterviewPlan != null ? stages[t].orderInInterviewPlan : '?') +
          '  ' + stages[t].title + '   [type ' + (stages[t].type || '?') + ']');
    }
  }
  say('=== #277b done. Read-only: no create, update or delete was called. ===');
}


// ===== #277 — the 42 Kong FDE candidates. DRY BY DEFAULT; only 'run' writes. =====
// 🚨 THE CANDIDATE DATA IS NOT IN THIS FILE AND MUST NEVER BE PUT IN IT.
// Every .gs here is mirrored to the PUBLIC repo jerin-k/ik-hiring-website by
// pushSourceToGitHub on each refresh, so names, emails and phone numbers live in
// the SCRIPT PROPERTY K277_ROWS instead, which is never pushed. CLAUDE.md rule 9.
// Delete that property once the upload is confirmed.
var RUN277_MODE = 'dry';            // 'dry' = resolve and print, write nothing
var RUN277_LIMIT = 0;
var RUN277_START = 1;   // row 1 (Sujit Khasnis) is already written and verified - do not repeat it               // 0 = all rows; 1 = just the first, for the UI check

function run277Upload() {
  var MODE = RUN277_MODE;
  var props = PropertiesService.getScriptProperties();
  function say(s) { Logger.log(s); }
  function call(ep, body) {
    try { var r = ashbyWrite_('/' + ep, body) || {};
          return { code: r.code, ok: !!(r.json && r.json.success), json: r.json,
                   err: (r.json && r.json.errors) ? JSON.stringify(r.json.errors).slice(0,160) : '' }; }
    catch (e) { return { code:'threw', ok:false, json:null, err:String(e && e.message || e).slice(0,160) }; }
  }
  function abort(why) { say('ABORT: ' + why); throw new Error('#277 aborted: ' + why); }

  say('=== #277 upload, MODE=' + MODE + ', ' + new Date().toISOString() + ' ===');

  // ---- 0. a second real run would duplicate all 42. Refuse unless cleared.
  if (MODE === 'run' && props.getProperty('K277_DONE')) {
    abort('K277_DONE is already set (' + props.getProperty('K277_DONE') +
          '). Clear that property deliberately before running again.');
  }

  // ---- 1. the rows
  var raw = props.getProperty('K277_ROWS');
  if (!raw) abort('script property K277_ROWS is missing');
  var rows = JSON.parse(raw);
  if (rows.length !== 42) abort('expected 42 rows, got ' + rows.length);
  say('rows=' + rows.length + '  with phone=' +
      rows.filter(function(r){ return !!r.p; }).length);

  // ---- 2. the source he added: sourceType "IK SME", title "SME US"
  var sr = call('source.list', {});
  if (!sr.ok) abort('source.list ' + sr.code + ' ' + sr.err);
  var srcMatches = (sr.json.results || []).filter(function (s) {
    return ((s.sourceType && s.sourceType.title) || '') === 'IK SME' &&
           (s.title || '') === 'SME US' && !s.isArchived;
  });
  if (srcMatches.length !== 1) abort('expected exactly 1 live "IK SME: SME US" source, found ' + srcMatches.length);
  var sourceId = srcMatches[0].id;
  say('source resolved: IK SME: SME US  (one match, not archived)');

  // ---- 3. the Kong job
  var jobs = [], cur = null, pg = 0;
  do {
    var b = { limit: 100 }; if (cur) b.cursor = cur;
    var jr = call('job.list', b);
    if (!jr.ok) abort('job.list ' + jr.code + ' ' + jr.err);
    jobs = jobs.concat(jr.json.results || []);
    cur = jr.json.moreDataAvailable ? jr.json.nextCursor : null; pg++;
  } while (cur && pg < 30);
  var kongs = jobs.filter(function (j) { return (j.title || '') === 'Forward Deployed Engineer - Kong'; });
  if (kongs.length !== 1) abort('expected exactly 1 Kong job, found ' + kongs.length);
  var kong = kongs[0];
  if (kong.status !== 'Open') abort('the Kong job is ' + kong.status + ', not Open');
  say('job resolved: ' + kong.title + '  status=' + kong.status);

  // ---- 4. the stage he asked for: a LEAD stage, the first one
  var st = call('interviewStage.list', { interviewPlanId: kong.interviewPlanIds[0] });
  if (!st.ok) abort('interviewStage.list ' + st.code + ' ' + st.err);
  var leads = (st.json.results || []).filter(function (s) {
    return (s.title || '') === 'New Lead' && (s.type || '') === 'Lead'; });
  if (leads.length !== 1) abort('expected exactly 1 "New Lead" stage of type Lead, found ' + leads.length);
  var stageId = leads[0].id;
  say('stage resolved: New Lead  [type Lead, order ' + leads[0].orderInInterviewPlan + ']');

  // ---- 5. Ritika, by email. user.list hides deactivated users unless asked.
  var ur = call('user.list', { includeDeactivated: true });
  if (!ur.ok) abort('user.list ' + ur.code + ' ' + ur.err);
  var rit = (ur.json.results || []).filter(function (u) {
    return String(u.email || '').toLowerCase() === 'ritika.bhasin@interviewkickstart.com'; });
  if (rit.length !== 1) abort('expected exactly 1 user for Ritika, found ' + rit.length);
  if (rit[0].isEnabled === false) abort('Ritika\'s Ashby account is disabled');
  var ritikaId = rit[0].id;
  say('credited-to / recruiter resolved: ' + (rit[0].firstName || '') + ' ' + (rit[0].lastName || ''));

  var RECRUITER_ROLE = '22db8dc8-83f4-40de-8376-87efff4a6eb6';   // Ashby "Recruiter"

  // ---- 6. what row 1 would send, printed in full so it can be checked before a run
  var r0 = rows[0];
  say('--- row 1 payloads ---');
  say('  candidate.create   name=' + r0.n + '  email=' + r0.e +
      '  phoneNumber=' + (r0.p || '(none)') + '  linkedInUrl=' + (r0.l ? 'yes' : 'no') +
      '  sourceId=set  creditedToUserId=set');
  say('  application.create candidateId=<new>  jobId=<kong>  interviewStageId=<New Lead>' +
      '  sourceId=set  creditedToUserId=set');
  say('  application.addHiringTeamMember  applicationId=<new>  teamMemberId=<ritika>  roleId=<Recruiter>');

  if (MODE !== 'run') {
    say('=== DRY RUN COMPLETE. Everything resolved; NOTHING was written. ===');
    return;
  }

  // ---- 7. the real thing
  var n = RUN277_LIMIT > 0 ? Math.min(RUN277_LIMIT, rows.length) : rows.length;
  var made = [], failed = [];
  for (var i = RUN277_START; i < n; i++) {
    var row = rows[i];
    var cBody = { name: row.n, email: row.e, sourceId: sourceId, creditedToUserId: ritikaId };
    if (row.p) cBody.phoneNumber = row.p;
    if (row.l) cBody.linkedInUrl = row.l;
    var c = call('candidate.create', cBody);
    if (!c.ok || !c.json.results || !c.json.results.id) {
      failed.push(row.n + ' candidate.create ' + c.code + ' ' + c.err); continue;
    }
    var candId = c.json.results.id;

    var a = call('application.create', { candidateId: candId, jobId: kong.id,
                                         interviewStageId: stageId, sourceId: sourceId,
                                         creditedToUserId: ritikaId });
    if (!a.ok || !a.json.results || !a.json.results.id) {
      failed.push(row.n + ' application.create ' + a.code + ' ' + a.err + ' (candidate WAS created)');
      continue;
    }
    var appId = a.json.results.id;

    var h = call('application.addHiringTeamMember',
                 { applicationId: appId, teamMemberId: ritikaId, roleId: RECRUITER_ROLE });
    made.push(row.n + (h.ok ? '' : '  [hiring team FAILED ' + h.code + ' ' + h.err + ']'));
    if (i === 0) say('row 1 done: candidate ok, application ok, hiring team ' + (h.ok ? 'ok' : 'FAILED ' + h.err));
  }

  say('--- RESULT: created ' + made.length + ' of ' + (n - RUN277_START) + ', failed ' + failed.length + ' ---');
  for (var f = 0; f < failed.length; f++) say('  FAILED  ' + failed[f]);
  var teamFails = made.filter(function (m) { return m.indexOf('hiring team FAILED') >= 0; });
  say('hiring-team failures: ' + teamFails.length);
  if (RUN277_LIMIT === 0 && failed.length === 0) {
    props.setProperty('K277_DONE', new Date().toISOString());
    say('K277_DONE set - a second run will now refuse.');
  }
  say('=== #277 run complete. VERIFY IN THE ASHBY UI before calling this done. ===');
}


// ===== #277 — the V9 work-log row. Reads the header, matches it EXACTLY, appends once. =====
// The #275 row landed two columns wrong because the matcher tried /method|how/ before
// /verif/ and the header is "Verified how". So: EXACT match only, and any header this
// does not recognise is left BLANK rather than guessed at. [[feedback_audit-result-column]]
function log277V9() {
  var SHEET_ID = '1U6Wi5uXLZ8hOhGKP2tyH--jHcEbUEvXgAPxbkUofTNA';
  var TAB = 'V9 - Work log';
  function say(s) { Logger.log(s); }

  var sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(TAB);
  if (!sh) { say('ABORT: no tab named ' + TAB); return; }
  var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  say('tab=' + TAB + '  rows=' + lastRow + '  cols=' + lastCol);
  say('HEADERS: ' + headers.map(function (h, i) { return i + ':' + h; }).join(' | '));
  var prev = sh.getRange(lastRow, 1, 1, lastCol).getValues()[0];
  say('LAST ROW (' + lastRow + '): ' + prev.map(function (v) {
    return String(v).slice(0, 28); }).join(' | '));

  if (PropertiesService.getScriptProperties().getProperty('K277_V9_ROW')) {
    say('ABORT: already logged at row ' +
        PropertiesService.getScriptProperties().getProperty('K277_V9_ROW'));
    return;
  }

  // exact header -> value. Anything not named here stays blank on purpose.
  var vals = {
    'Date': new Date(),
    'Task': '#277',
    'Task ID': '#277',
    'What': 'Uploaded 42 Kong FDE shortlist mentors to Ashby as new candidates',
    'What was done': 'Uploaded 42 Kong FDE shortlist mentors to Ashby as new candidates',
    'Description': 'Created 42 NEW candidate records and 42 applications on "Forward Deployed Engineer - Kong", each in the New Lead stage, source "IK SME: SME US", credited to Ritika Bhasin, with Ritika added as Recruiter on the application hiring team. Fresh records were requested even where the person already existed in Ashby (7 known duplicates). 38 of 42 carry a phone number; 4 were left blank because the only numbers available came from a tab whose phone column is misaligned against its own names.',
    'Count': 42,
    'Records': 42,
    'Method': 'Apps Script run277Upload (Probe.gs): candidate.create -> application.create -> application.addHiringTeamMember, one row at a time. Candidate data was held in the script property K277_ROWS, never in a .gs file, because every .gs is mirrored to a PUBLIC repo. Property deleted afterwards.',
    'Verified how': 'Ashby UI: job pipeline shows Leads = 42 and Application Review unchanged at 376. Sujit Khasnis opened individually - source "IK SME: SME US", Credited To Ritika Bhasin, Hiring Team shows Recruiter = Ritika Bhasin (NOT "No Roles"), phone and LinkedIn present. Qian Wang confirmed as a single new record in New Lead.',
    'Status': 'Done',
    'Failed': 0,
    'Skipped': 0,
    'By': 'Claude (jerin@interviewkickstart.com)'
  };

  var row = [], filled = [];
  for (var c = 0; c < lastCol; c++) {
    var h = String(headers[c]).trim();
    if (Object.prototype.hasOwnProperty.call(vals, h)) { row.push(vals[h]); filled.push(h); }
    else row.push('');
  }
  if (!filled.length) { say('ABORT: no header matched exactly - nothing written'); return; }

  sh.appendRow(row);
  var newRow = sh.getLastRow();
  PropertiesService.getScriptProperties().setProperty('K277_V9_ROW', String(newRow));
  say('APPENDED at row ' + newRow + '; columns filled by exact header match: ' + filled.join(', '));
  var back = sh.getRange(newRow, 1, 1, lastCol).getValues()[0];
  say('READ BACK: ' + back.map(function (v) { return String(v).slice(0, 28); }).join(' | '));
}
