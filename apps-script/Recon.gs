// Recon.gs — refresh trigger management

// NOTE the run selector picks the FIRST function in the file on page load (the toolbar
// dropdown is unreliable), so resetAndRefreshNow is deliberately kept at the top: it is the
// routine dashboard refresh. Do not move another runner above it.
// Cleanup + one-shot. The one-time triggers created by runRefreshOnceSafe accumulate and
// eventually hit Apps Script's per-script trigger cap. This deletes ALL refreshDashboardData
// triggers, restores the two daily ones (6AM/6PM), then schedules a single immediate run.
function resetAndRefreshNow() {
  var deleted = 0;
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'refreshDashboardData') { ScriptApp.deleteTrigger(t); deleted++; }
  });
  ScriptApp.newTrigger('refreshDashboardData').timeBased().atHour(6).everyDays(1).create();
  ScriptApp.newTrigger('refreshDashboardData').timeBased().atHour(18).everyDays(1).create();
  ScriptApp.newTrigger('refreshDashboardData').timeBased().after(1000).create();
  Logger.log('Deleted ' + deleted + ' refreshDashboardData trigger(s); restored 2 daily (6AM/6PM) + 1 one-time now.');
}



// Stage-history accumulator runner. Same self-cleaning pattern as resetAndRefreshNow:
// one-time triggers pile up and eventually hit Apps Script's per-script cap.
function runStageHistoryOnce() {
  var deleted = 0;
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'refreshStageHistory') { ScriptApp.deleteTrigger(t); deleted++; }
  });
  ScriptApp.newTrigger('refreshStageHistory').timeBased().everyHours(12).create();
  ScriptApp.newTrigger('refreshStageHistory').timeBased().after(1000).create();
  Logger.log('Deleted ' + deleted + ' refreshStageHistory trigger(s); restored the 12-hourly one + 1 immediate run.');
}

function runRefreshOnceSafe() {
  ScriptApp.newTrigger('refreshDashboardData').timeBased().after(1000).create();
  Logger.log('Scheduled refreshDashboardData one-time (~1s). Recurring triggers untouched.');
}

// Schedule BOTH the main refresh and the stage-history accumulator once (for the Time-in-Process rollout).
function runBothRefreshOnce() {
  ScriptApp.newTrigger('refreshDashboardData').timeBased().after(1000).create();
  ScriptApp.newTrigger('refreshStageHistory').timeBased().after(30000).create();
  Logger.log('Scheduled refreshDashboardData (~1s) + refreshStageHistory (~30s). Recurring triggers untouched.');
}

// Delete ALL refreshDashboardData triggers (disabled + active) and recreate two clean daily ones (~6AM + ~6PM).
function resetRefreshTriggers() {
  var deleted = 0;
  ScriptApp.getProjectTriggers().forEach(function(t){
    if (t.getHandlerFunction() === 'refreshDashboardData') { ScriptApp.deleteTrigger(t); deleted++; }
  });
  ScriptApp.newTrigger('refreshDashboardData').timeBased().atHour(6).everyDays(1).create();
  ScriptApp.newTrigger('refreshDashboardData').timeBased().atHour(18).everyDays(1).create();
  Logger.log('Deleted ' + deleted + ' refreshDashboardData trigger(s); created 2 fresh daily (~6AM + ~6PM).');
}

function listTriggers() {
  ScriptApp.getProjectTriggers().forEach(function(t){ Logger.log(t.getHandlerFunction() + ' | ' + t.getEventType()); });
}

// ===== RECON: resolve opening closeReasonId UUIDs (openings-quarter-model build, 2026-08-20) =====
function reconOpenings() {
  var SAMPLES = {
    '02f5d614-076f-4a68-910a-cc4fe933e3d6': 'Hired',
    '01b4f631-5a33-4c85-8f5b-fc1475b08a8c': 'On Hold',
    '02a9b512-eac2-4d9b-8495-34a93286752c': 'Shelved',
    '50a922f9-913f-4e1d-ac60-a60be3638e24': 'Carry forward to next quarter'
  };
  var openings = ashbyListAll_('/opening.list');
  Logger.log('=== reconOpenings: ' + openings.length + ' openings ===');
  Logger.log('RAW[0]: ' + JSON.stringify(openings[0]));
  var byId = {}, distinct = {};
  openings.forEach(function (o) { byId[o.id] = o; var cr = o.closeReasonId || '(none)'; distinct[cr] = (distinct[cr] || 0) + 1; });
  for (var sid in SAMPLES) { var o = byId[sid]; Logger.log(SAMPLES[sid] + ' = ' + (o ? o.closeReasonId : 'NOT FOUND') + (o ? '  (openedAt=' + o.openedAt + ' closedAt=' + o.closedAt + ' state=' + o.openingState + ')' : '')); }
  Logger.log('--- distinct closeReasonId counts ---');
  for (var k in distinct) Logger.log('  ' + k + ' : ' + distinct[k]);
  Logger.log('=== reconOpenings done ===');
}


// ===== RECON: offer.list shape + application.info opening/stage fields (JP #52, 2026-08-20) =====
function reconOffers() {
  var LINKED_APP = '24920dbd-2975-4c48-a779-a3f7dcca26dc';
  var resp = ashbyPost_('/offer.list', { limit: 5 });
  var offers = (resp && resp.results) || [];
  Logger.log('=== reconOffers: offer.list page ' + offers.length + ' ===');
  if (offers[0]) Logger.log('OFFER[0]: ' + JSON.stringify(offers[0]));
  offers.forEach(function (o, i) {
    Logger.log('offer[' + i + '] status=' + o.status + ' acceptanceStatus=' + o.acceptanceStatus + ' appId=' + o.applicationId + ' startDate=' + (o.latestVersion && o.latestVersion.startDate) + ' openingId=' + o.openingId + ' opening=' + JSON.stringify(o.opening));
  });
  var ai = ashbyPost_('/application.info', { applicationId: LINKED_APP });
  var a = ai && ai.results;
  if (a) {
    Logger.log('APP.keys: ' + Object.keys(a).join(','));
    Logger.log('APP.opening: ' + JSON.stringify(a.opening));
    Logger.log('APP.currentInterviewStage: ' + JSON.stringify(a.currentInterviewStage));
    Logger.log('APP.stage: ' + JSON.stringify(a.stage) + ' | currentStage=' + JSON.stringify(a.currentStage));
    Logger.log('APP.candidate: ' + JSON.stringify(a.candidate ? { id: a.candidate.id, name: a.candidate.name } : null));
  } else Logger.log('APP.info returned nothing');
  Logger.log('=== reconOffers done ===');
}

// ===== WRITE-ACCESS PROBE — non-destructive: empty payloads, creates nothing =====
function reconWriteProbe() {
  var key = getAshbyApiKey_();
  var auth = 'Basic ' + Utilities.base64Encode(key + ':');
  var eps = ['/opening.list', '/opening.create', '/offer.update', '/application.changeStage'];
  eps.forEach(function(ep) {
    try {
      var res = UrlFetchApp.fetch('https://api.ashbyhq.com' + ep, {
        method: 'post', contentType: 'application/json',
        headers: { Authorization: auth }, payload: JSON.stringify({}),
        muteHttpExceptions: true
      });
      Logger.log(ep + '  ->  HTTP ' + res.getResponseCode() + '  |  ' + res.getContentText().substring(0, 300));
    } catch (err) {
      Logger.log(ep + '  ->  THREW ' + err.message);
    }
  });
}

// Mirrors this Apps Script project into the GitHub repo so the checked-in copy can never go stale.
// Reads the project via Drive export (works with the scopes the script already has; the Apps Script
// API route returns 403 without an extra scope). Only pushes a file whose content actually changed,
// so a twice-daily run does not create empty commits. Verified 2026-08-22: no secrets are hardcoded
// in any project file - the token and API key live in Script Properties.
function pushSourceToGitHub() {
  var id = ScriptApp.getScriptId();
  var url = "https://www.googleapis.com/drive/v3/files/" + id + "/export?mimeType=application/vnd.google-apps.script%2Bjson";
  var res = UrlFetchApp.fetch(url, { headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) { Logger.log("source sync FAILED: Drive export " + res.getResponseCode()); return; }
  var files = JSON.parse(res.getContentText()).files || [];
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty("GITHUB_TOKEN"), repo = props.getProperty("GITHUB_REPO");
  if (!token || !repo) { Logger.log("source sync skipped: token/repo not set"); return; }
  var pushed = 0, same = 0;
  files.forEach(function (f) {
    var ext = (f.type === "server_js") ? ".gs" : ((f.type === "html") ? ".html" : ".json");
    var path = "apps-script/" + f.name + ext;
    var cur = null;
    try {
      var g = UrlFetchApp.fetch("https://api.github.com/repos/" + repo + "/contents/" + path,
        { headers: { Authorization: "token " + token, "User-Agent": "IK-Dashboard" }, muteHttpExceptions: true });
      if (g.getResponseCode() === 200) {
        var enc = (JSON.parse(g.getContentText()).content || "").replace(/\n/g, "");
        cur = Utilities.newBlob(Utilities.base64Decode(enc)).getDataAsString();
      }
    } catch (e) { Logger.log("source sync read " + path + ": " + e.message); }
    if (cur === f.source) { same++; return; }
    pushFileToGitHub_(path, f.source, "Sync Apps Script source: " + f.name + ext);
    pushed++;
  });
  Logger.log("source sync: " + pushed + " pushed, " + same + " unchanged");
}

// One-off probe (2026-08-22): confirmed application.list returns archiveReason {text, reasonType} on
// 25/25 archived rows, so the pipeline needs no extra call. KEPT BELOW resetAndRefreshNow on purpose -
// the run selector picks the FIRST function in the file, which must stay the routine refresh.
function reconArchiveReason() {
  Logger.log('=== RECON archiveReason ===');
  var ids = ['48368c4f-9557-4fb4-afa3-092e15239d62','741c9245-0aae-4158-ae47-c5fdc489e997','cf461b0d-03a6-45a2-84d8-84f89a4772e2','00024aca-674c-4a28-98c3-25b44a2e3095','000ceaa4-d1ba-4079-a6ce-040b216106ff','000e2980-52dd-4cbb-a08c-21a287bf4e7b','0006ddb4-e1a6-4881-88b9-d59138651a84','0015948d-c303-4bea-890e-540d190433d2'];
  ids.forEach(function (id) {
    try {
      var r = ashbyPost_('/application.info', { applicationId: id });
      var a = r.results || {};
      var ar = a.archiveReason;
      Logger.log('INFO ' + (a.candidate ? a.candidate.name : '?') + ' | status=' + a.status + ' | archivedAt=' + a.archivedAt + ' | reason=' + (ar ? JSON.stringify([ar.text, ar.reasonType, ar.id]) : 'NULL'));
    } catch (e) { Logger.log('INFO ' + id + ' FAILED ' + e.message); }
  });
  var lr = ashbyPost_('/application.list', { limit: 25, status: 'Archived' });
  var rs = lr.results || [];
  var withAR = 0, texts = {};
  rs.forEach(function (a) { if (a.archiveReason) { withAR++; var t = a.archiveReason.text || '(blank)'; texts[t] = (texts[t] || 0) + 1; } });
  Logger.log('LIST Archived rows=' + rs.length + ' | archiveReason present on ' + withAR);
  Logger.log('LIST row keys: ' + (rs[0] ? JSON.stringify(Object.keys(rs[0])) : 'none'));
  Logger.log('LIST reason texts: ' + JSON.stringify(texts));
  Logger.log('=== RECON DONE ===');
}
