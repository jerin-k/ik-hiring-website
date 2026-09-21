// Diagnostics for the ToFU pass (Tofu.gs). READ-ONLY. First function in the file on purpose.
// (A temporary probeAgencyUsers() lived here on 7 Sep 2026 to answer #11's "can the API spot an agency?"
//  question. Answer: YES - user.list returns globalRole, and 'External Recruiter' IS the agency tier.
//  It also proved that ZERO of 2,470 openings carry a Sourcer. Probe deleted; findings in the memory.)
function testTofu() {
  var events = loadDriveJson_("stage_events.json") || {};
  Logger.log("stage_events apps: " + Object.keys(events).length);
}


/** PROBE — application.updateHistory + X-On-Behalf-Of.  Read-only except where marked.
 *  Never deletes. Never sends an array that could REPLACE a history list.
 *  Any real write happens ONLY on the Test-department sandbox job, with read-back + restore. */
function probeHistoryAndOnBehalf() {
  var L = [];
  function log(s){ L.push(s); Logger.log(s); }

  function raw(ep, body, obo) {
    var h = { 'Authorization':'Basic ' + Utilities.base64Encode(getAshbyApiKey_() + ':') };
    if (obo) h['X-On-Behalf-Of'] = obo;
    var r = UrlFetchApp.fetch(ASHBY_API_BASE + (ep.charAt(0)==='/'?ep:'/'+ep), { method:'post', contentType:'application/json',
              headers:h, payload:JSON.stringify(body||{}), muteHttpExceptions:true });
    var c = r.getResponseCode(), t = (r.getContentText()||'').replace(/\s+/g,' ').substring(0,220);
    return { c:c, t:t };
  }
  function verdict(r){
    if (r.c === 404) return 'ABSENT (404) - no such endpoint';
    if (r.c === 403) return 'FORBIDDEN (403) - exists, key lacks the scope';
    if (r.c === 200 && /"success"\s*:\s*false/.test(r.t)) return 'REACHABLE (200 + error) - endpoint real, body wrong';
    if (r.c === 200) return 'REACHABLE (200 OK)';
    return 'HTTP ' + r.c;
  }

  log('=== S1 existence battery (no on-behalf-of) ===');
  var eps = ['application.updateHistory','application.setStatus','application.changeStatus',
             'application.archive','application.unarchive','application.hire',
             'application.setOpening','application.zzInventedControl'];
  var s1 = {};
  eps.forEach(function(ep){ var r = raw(ep, {}); s1[ep] = r;
    log(ep + ' -> ' + verdict(r) + ' | ' + r.t); });

  log('=== S2 locate Test-department sandbox target ===');
  var testJobIds = {}, testJobNames = [];
  try {
    var jobs = ashbyListAll_('/job.list', {});
    var dmap = (typeof fetchDepartmentMap_ === 'function') ? fetchDepartmentMap_() : null;
    jobs.forEach(function(j){
      var nm = j.title || '';
      var leaf = dmap && dmap[j.departmentId] ? dmap[j.departmentId].name : '';
      var top = (typeof topDept === 'function' && dmap) ? topDept(j.departmentId, dmap) : leaf;
      if (String(top).toLowerCase() === 'test' || /hello christy/i.test(nm)) {
        testJobIds[j.id] = nm; testJobNames.push(nm);
      }
    });
  } catch(e){ log('job.list failed: ' + e); }
  log('Test/sandbox jobs found: ' + testJobNames.length + ' -> ' + testJobNames.join(' | '));

  var target = null, fallbackTarget = false;
  try {
    // ONE PAGE ONLY - ashbyListAll_ would page ~38,000 apps and blow the 6-min limit.
    var apps = (ashbyPost_('/application.list', { limit:100 }) || {}).results || [];
    for (var i=0;i<apps.length && !target;i++){
      var a = apps[i];
      if (testJobIds[a.job && a.job.id]) target = a;
    }
    if (!target && apps.length) { target = apps[0]; fallbackTarget = true; }
  } catch(e){ log('application.list failed: ' + e); }
  log('application target: ' + (!target ? 'NONE' : (fallbackTarget ? 'FALLBACK non-sandbox - SCHEMA DISCOVERY ONLY, never written to' : 'SANDBOX')));

  var hist = null;
  if (target) {
    try {
      var hr = ashbyPost_('/application.listHistory', { applicationId: target.id });
      hist = hr && hr.results;
      log('history events on target: ' + (hist ? hist.length : 0) +
          ' | first keys: ' + (hist && hist[0] ? Object.keys(hist[0]).join(',') : '-'));
    } catch(e){ log('listHistory failed: ' + e); }
  }

  log('=== S3 updateHistory schema discovery - error shapes only, nothing written ===');
  var uh = s1['application.updateHistory'];
  if (uh.c === 403) {
    log('TOGGLE IS OFF -> "Allow updating application history?" is not enabled on the key.');
    log('   Endpoint EXISTS (403 = scope missing, not 404 = absent). Enable it and re-run for the real answer.');
  } else if (uh.c === 404) {
    log('SETTLED: application.updateHistory is ABSENT - same as the invented control. Nothing more to test.');
  } else {
    log('Endpoint is REACHABLE. Probing the schema with deliberately incomplete bodies (no writes):');
    var shapes = [
      ['applicationId only',            target ? {applicationId: target.id} : null],
      ['+ empty updates array',         target ? {applicationId: target.id, updates: []} : null],
      ['+ wrong-type probe on status',  target ? {applicationId: target.id, status: 12345} : null],
      ['+ wrong-type probe on event',   target ? {applicationId: target.id, historyEventId: 12345} : null]
    ];
    shapes.forEach(function(s){
      if (!s[1]) { log('  ' + s[0] + ' -> skipped (no sandbox target)'); return; }
      var r = raw('application.updateHistory', s[1]);
      log('  ' + s[0] + ' -> ' + verdict(r) + ' | ' + r.t);
    });
    log('STOPPING before any write. An "update history" endpoint that takes an ARRAY may REPLACE the');
    log('   whole history - sending a subset would DELETE events. The schema above decides whether a');
    log('   single-event idempotent write is safe. Not guessing at it.');
  }

  log('=== S4 X-On-Behalf-Of ===');
  var oboId = null, oboWho = '';
  try {
    var us = ashbyListAll_('/user.list', { includeDeactivated:false });
    for (var u=0; u<us.length; u++){
      var em = (us[u].email||'').toLowerCase();
      if (em === 'jerin@interviewkickstart.com') { oboId = us[u].id; oboWho = 'jerin@interviewkickstart.com'; break; }
    }
    if (!oboId && us.length) { oboId = us[0].id; oboWho = 'first active user (fallback)'; }
  } catch(e){ log('user.list failed: ' + e); }
  log('acting-as user resolved: ' + (oboId ? oboWho : 'NONE - S4 skipped'));

  if (oboId) {
    var rr = raw('user.list', { limit:1 }, oboId);
    log('READ with header (user.list) -> ' + verdict(rr) + ' | header ' +
        (rr.c === 200 ? 'ACCEPTED' : 'REJECTED') + ' | ' + rr.t);

    log('re-running the battery WITH the header, to see if acting as a user unlocks anything:');
    eps.forEach(function(ep){
      var r = raw(ep, {}, oboId);
      var before = verdict(s1[ep]), after = verdict(r);
      log('  ' + ep + ' : ' + before + '  ->  ' + after + (before === after ? '   (no change)' : '   *** CHANGED ***'));
    });
  }

  log('=== S5 openedAt write test - SANDBOX OPENING ONLY, with read-back and restore ===');
  try {
    var op = null, jobIdsArr = Object.keys(testJobIds);
    for (var q=0; q<jobIdsArr.length && !op; q++){
      var ops = ashbyPost_('/opening.list', { jobId: jobIdsArr[q] });
      var rows = (ops && ops.results) || [];
      for (var z=0; z<rows.length && !op; z++){ if (!rows[z].closeReasonId) op = rows[z]; }
    }
    if (!op) { log('no free sandbox opening found - S5 skipped (no write attempted)'); }
    else {
      var was = op.openedAt || null;
      log('sandbox opening found. openedAt currently: ' + (was || 'UNDATED'));
      var probeDate = '2026-01-15T00:00:00.000Z';
      var w1 = raw('opening.update', { openingId: op.id, openedAt: probeDate }, oboId || null);
      log('opening.update openedAt (with header) -> ' + verdict(w1));
      var back = ashbyPost_('/opening.list', { jobId: op.jobId || jobIdsArr[0] });
      var now = null; ((back && back.results) || []).forEach(function(o){ if (o.id === op.id) now = o.openedAt; });
      var moved = (now || null) !== (was || null);
      log('READ-BACK: openedAt is now ' + (now || 'UNDATED') + ' -> ' + (moved ? '*** IT ACTUALLY WROTE ***' : 'unchanged (silent no-op, as recorded)'));
      if (moved) {
        var rest = raw('opening.update', { openingId: op.id, openedAt: was }, oboId || null);
        log('RESTORE attempted -> ' + verdict(rest));
        var b2 = ashbyPost_('/opening.list', { jobId: op.jobId || jobIdsArr[0] });
        var n2 = null; ((b2 && b2.results) || []).forEach(function(o){ if (o.id === op.id) n2 = o.openedAt; });
        log('RESTORE read-back: ' + (n2 || 'UNDATED') + ' -> ' + (((n2||null) === (was||null)) ? 'RESTORED' : '!!! NOT RESTORED - fix by hand !!!'));
      }
    }
  } catch(e){ log('S5 failed: ' + e); }

  log('=== PROBE COMPLETE - no deletions, no status changes, no production records touched ===');
  return L.length + ' lines - read the execution log';
}
