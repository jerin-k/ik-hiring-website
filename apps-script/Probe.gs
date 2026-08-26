// Diagnostics for the ToFU pass (Tofu.gs). READ-ONLY: it loads the stored stage events, runs the same
// computation refreshStageHistory runs, logs the totals and writes nothing. Safe to run any time, and
// the first function in the file on purpose - the run selector picks the first function on page load.
//
// The runners that used to live here were deleted 2026-08-26: Recon.gs already has them
// (runStageHistoryOnce, runDropBackfillOnce), and having a runner that restarts a 14,000-application
// sweep sitting one careless click away was a footgun.
function testTofu() {
  var events = loadDriveJson_("stage_events.json") || {};
  Logger.log("stage_events apps: " + Object.keys(events).length);
  var t = computeTofuRollups_(events);
  var byQ = {};
  for (var rec in t.tofuByRecruiter) {
    for (var d in t.tofuByRecruiter[rec]) { var q = tofuQuarter_(d); byQ[q] = (byQ[q] || 0) + t.tofuByRecruiter[rec][d]; }
  }
  Logger.log("TOFU BY QUARTER: " + JSON.stringify(byQ));
  Logger.log("TOFU META: " + JSON.stringify(t.tofuMeta));
}