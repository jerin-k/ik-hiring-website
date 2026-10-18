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
