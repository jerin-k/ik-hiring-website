// ONE function, on purpose - the run selector picks the FIRST function in the open file, so a file with
// a single runner cannot fire the wrong job. Same reasoning as Probe.gs.
//
// Rebuilds stage_events.json from scoped_apps.json and re-emits stage_rollups.json, which now carries the
// ASSESSED / PROGRESSED pass (Assess.gs) alongside the old reached/cleared. ~12 min for the history pull
// plus a few for the three signal endpoints; if it hits the 25-minute cutoff it saves a resume cursor and
// the next run continues from there.
//
// The archived-application sweep this file used to launch is COMPLETE (30 Aug 2026) - every archived
// application has its full stage timeline in archived_late_stage.json under store.win. To run that again,
// call backfillArchivedLateStage() instead.
function runStageHistoryWithAssessOnce() {
  refreshStageHistory();
}
