// ===== #204 RUNNER - KEEP THIS FIRST IN THE FILE =====
// The editor function picker cannot be driven from a background tab (its dropdown needs a real click) and it
// DEFAULTS TO THE FIRST FUNCTION IN THE OPEN FILE. So #204 is driven from here: point this at the step you
// want and press Run. Same reason the note below says testTofu was "first in the file on purpose".
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
