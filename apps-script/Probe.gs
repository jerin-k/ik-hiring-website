// ===== #204 RUNNER - KEEP THIS FIRST IN THE FILE =====
// The editor function picker cannot be driven from a background tab (its dropdown needs a real click) and it
// DEFAULTS TO THE FIRST FUNCTION IN THE OPEN FILE. So #204 is driven from here: point this at the step you
// want and press Run. Same reason the note below says testTofu was "first in the file on purpose".
function run204() {
  // 🚨 DELIBERATELY creates a one-off trigger and DELETES NOTHING. triggerRefreshNow() and
  //    setupDailyTriggers() both wipe every CLOCK trigger for refreshDashboardData - which is how the 1 PM
  //    trigger deleted in #175b came back. Never use them to kick a test run.
  var before = ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === 'refreshDashboardData'; }).length;
  ScriptApp.newTrigger('manualRefresh_').timeBased().after(5000).create();
  var after = ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === 'refreshDashboardData'; }).length;
  Logger.log('#204c validation: manualRefresh_ one-off created. refreshDashboardData clock triggers before=' + before + ' after=' + after + (before === after ? ' (UNTOUCHED, correct)' : ' 🚨 CHANGED - investigate'));
  return after;
}

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
