// ONE function, on purpose - the run selector picks the FIRST function in the open file, so a file
// with a single runner cannot fire the wrong job. Same reasoning as Probe.gs and RunBackfill.gs.
//
// Runs buildRetagPlan() (RetagPlan.gs) on a one-time trigger, which gets the 30-minute Workspace
// limit instead of the editor's 6 minutes - the job makes one application.info call per in-scope
// application, so it runs for a few minutes.
//
// 🚨 READ-ONLY against Ashby. It writes the "Recruiter Re-tag Plan" tab and retag_snapshot.json in
// Drive, and nothing else. No candidate is re-tagged by this.
//
// Self-cleaning: delete-then-recreate, so it can never contribute to the per-script trigger cap
// that once nearly killed the 6AM/6PM refresh.
function runRetagPlanOnce() {
  var deleted = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'buildRetagPlan') { ScriptApp.deleteTrigger(t); deleted++; }
  });
  ScriptApp.newTrigger('buildRetagPlan').timeBased().after(1000).create();
  Logger.log('Deleted ' + deleted + ' buildRetagPlan trigger(s); scheduled one immediate run. ' +
             'Read the result on the Executions page - the log ends with the ACTIONS summary.');
}
