// ONE runner, deliberately. The run selector picks the FIRST function of whichever file is open when
// the page loads, and Audit.gs starts with buildAuditSheet() - which deletes every tab but the first and
// would wipe the team's Result columns, owner row and pivot. Keeping the v2 runner alone in its own file
// means a careless Run cannot fire the destructive one. Same reason Probe.gs and RunBackfill.gs each
// hold a single function. Do not add a second function here.
function runAuditV2Once() {
  return buildAuditV2();
}
