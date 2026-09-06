// Diagnostics for the ToFU pass (Tofu.gs). READ-ONLY. First function in the file on purpose.
// (A temporary probeAgencyUsers() lived here on 7 Sep 2026 to answer #11's "can the API spot an agency?"
//  question. Answer: YES - user.list returns globalRole, and 'External Recruiter' IS the agency tier.
//  It also proved that ZERO of 2,470 openings carry a Sourcer. Probe deleted; findings in the memory.)
function testTofu() {
  var events = loadDriveJson_("stage_events.json") || {};
  Logger.log("stage_events apps: " + Object.keys(events).length);
}
