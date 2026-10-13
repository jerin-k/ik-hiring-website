// ===== run210 - KEEP THIS FIRST IN THE FILE. The Run picker cannot be driven, so the function that runs is
// whichever comes first here; run210 fires RUN210_FN on a one-off trigger (30 min, not the editor 6) and
// asserts the refreshDashboardData clock triggers are untouched. Point RUN210_FN, open this file, press Run.
var RUN210_FN = 'run228Apply';   // #222: pointed deliberately at the read-only probe (was rebuildStageRollupsNow)
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
