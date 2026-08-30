// ONE function, on purpose - the run selector picks the FIRST function in the open file, so a file with
// a single runner cannot fire the wrong job. Same reasoning as Probe.gs.
//
// Starts the archived-application sweep. It self-chains at each 25-minute cutoff until it has walked
// every archived application, so this is clicked ONCE and then left alone (~4 passes, roughly 80 min).
// The v4 pass added on 2026-08-30 stores each archived application FULL stage timeline, which the new
// Throughput definition needs: applicationFeedback carries no stage, so the stage a candidate was sitting
// in when a form was submitted has to be read off their history.
function runArchivedBackfillOnce() {
  try {
    ScriptApp.getProjectTriggers().forEach(function (tr) {
      if (tr.getHandlerFunction() === 'backfillArchivedLateStage') ScriptApp.deleteTrigger(tr);
    });
  } catch (e) { Logger.log('trigger cleanup: ' + e.message); }
  backfillArchivedLateStage();
}
