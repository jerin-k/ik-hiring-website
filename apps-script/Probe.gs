// Diagnostics for the ToFU pass (Tofu.gs). READ-ONLY. First function in the file on purpose.
function testTofu() {
  var events = loadDriveJson_("stage_events.json") || {};
  Logger.log("stage_events apps: " + Object.keys(events).length);
}
