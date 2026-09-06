/** One-off: kick a full refresh at HEAD via a manualRefresh_ trigger (self-cleaning), bypassing the stale web-app deployment. Delete this file after use. */
function kickFullRefresh() {
  ScriptApp.getProjectTriggers().forEach(function(t){ if (t.getHandlerFunction()==='manualRefresh_') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('manualRefresh_').timeBased().after(1000).create();
  Logger.log('kickFullRefresh: manualRefresh_ trigger created at HEAD');
}
