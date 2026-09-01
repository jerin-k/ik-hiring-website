// ONE function, on purpose - the run selector picks the FIRST function in the open file, so a file
// with a single runner cannot fire the wrong job. Same reasoning as Probe.gs and RunBackfill.gs.
//
// RIGHT NOW: buildJobGapReport() (RetagPlan.gs) -> writes the "Job Gaps" tab.
// It reads the "Tracker Candidates v2" tab plus dashboard.json from Drive, makes NO Ashby calls
// and touches no other tab, so it runs straight from the editor in a few seconds - no trigger.
//
// To rebuild the re-tag plan instead, put buildRetagPlan() back behind a one-time trigger:
//   ScriptApp.getProjectTriggers().forEach(function (t) {
//     if (t.getHandlerFunction() === "buildRetagPlan") ScriptApp.deleteTrigger(t); });
//   ScriptApp.newTrigger("buildRetagPlan").timeBased().after(1000).create();
// It needs the trigger because it makes ~509 application.info calls and would hit the editor
// 6-minute limit.
function runRetagPlanOnce() {
  buildJobGapReport();
}
