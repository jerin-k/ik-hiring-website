// ============================================================================================
// RunTeamWrite.gs - THE ONLY PLACE IN THIS PROJECT THAT CAN WRITE TO ASHBY.
//
// 🚨 runRetagWriteStep() is the ONLY public function here, and it is FIRST. Everything below it
// is private (trailing underscore), which Apps Script hides from the editor's run selector - so
// opening this file offers exactly one thing to run, and that thing is whatever rung of the
// agreed sequence we are on. Same reasoning as Probe.gs and RunBackfill.gs.
//
// SWAP THE BODY of runRetagWriteStep as the sequence advances: probe -> one -> ten -> the rest.
// Never widen the batch until Jerin has confirmed the previous rung landed correctly in Ashby.
//
// The reviewed plan tab is the source of truth, not a recomputation - Jerin approved those rows,
// so the writes come from what he actually saw.
//
// ⚠ Ashby publishes NO request schema for application.addHiringTeamMember /
// removeHiringTeamMember. retagProbeSchema_ asks the API itself, by sending deliberately
// incomplete bodies and logging the server's own error text. A body missing either the
// application id or the user id cannot create anything, so the probe is safe against real ids.
// ============================================================================================

// RIGHT NOW: the SOURCE write - the last 2 records of the re-tag (Ross Y, Kiran Lakkaraju).
// Sets their source to Agencies / Bulls Eye. Idempotent: a row with a status is skipped.
// The 222 recruiter writes are COMPLETE (222 done, 0 failed, verified by read-back).
function runRetagWriteStep() {
  retagWriteSource_();
}

var RETAG_TAB_W = 'Recruiter Re-tag Plan';

// Like ashbyPost_ but NEVER throws and NEVER truncates - on a write we want the server's exact
// words, because that error text is the only schema documentation these endpoints have.
function ashbyWrite_(endpoint, body) {
  var options = { method: 'post', contentType: 'application/json',
    headers: { 'Authorization': 'Basic ' + Utilities.base64Encode(getAshbyApiKey_() + ':') },
    payload: JSON.stringify(body), muteHttpExceptions: true };
  var resp = UrlFetchApp.fetch(ASHBY_API_BASE + endpoint, options);
  var code = resp.getResponseCode(), text = resp.getContentText();
  var json = null;
  try { json = JSON.parse(text); } catch (e) {}
  // 🚨 Ashby answers HTTP 200 with {success:false, errors:[...]} on a bad request, so a 200 alone
  // is NOT success. Check the envelope too, or a rejected write reads as a completed one.
  return { code: code, text: text, json: json,
           ok: code === 200 && json && json.success !== false };
}

// Read the reviewed plan tab into objects.
function retagReadPlan_() {
  var sh = SpreadsheetApp.openById(AUDIT_SHEET_ID).getSheetByName(RETAG_TAB_W);
  if (!sh) throw new Error('"' + RETAG_TAB_W + '" not found - run buildRetagPlan() first');
  var vals = sh.getDataRange().getValues(), hdr = vals[0], i;
  function c(n) { for (i = 0; i < hdr.length; i++) if (String(hdr[i]).trim() === n) return i; return -1; }
  var C = { app: c('Ashby application id'), act: c('Action'), add: c('Add'), rm: c('Remove'),
            cand: c('Candidate'), job: c('Job (Ashby)'), trk: c('Tracker recruiter'),
            live: c('Ashby recruiter(s) NOW (live)'), status: c('Write status') };
  var rows = [];
  for (var r = 1; r < vals.length; r++) {
    rows.push({ row: r + 1, app: String(vals[r][C.app] || ''), act: String(vals[r][C.act] || ''),
                add: String(vals[r][C.add] || ''), rm: String(vals[r][C.rm] || ''),
                cand: String(vals[r][C.cand] || ''), job: String(vals[r][C.job] || ''),
                trk: String(vals[r][C.trk] || ''), live: String(vals[r][C.live] || ''),
                status: C.status < 0 ? '' : String(vals[r][C.status] || '') });
  }
  return { sheet: sh, hdr: hdr, C: C, rows: rows };
}

// "Name [uuid]" -> uuid. Null for the "(already tagged ...)" placeholder, which carries no id.
function retagIdIn_(cell) {
  var m = String(cell || '').match(/\[([0-9a-fA-F-]{36})\]/);
  return m ? m[1] : null;
}

// ---- the schema probe ----
function retagProbeSchema_() {
  var plan = retagReadPlan_(), target = null, i;
  for (i = 0; i < plan.rows.length; i++) {
    if (plan.rows[i].act === 'add' && plan.rows[i].app && retagIdIn_(plan.rows[i].add)) { target = plan.rows[i]; break; }
  }
  if (!target) throw new Error('no add row with an application id and a resolved user id');
  Logger.log('probe | plan row ' + target.row + ': ' + target.cand + ' / ' + target.job);
  Logger.log('probe | application ' + target.app);
  Logger.log('probe | that row would add: ' + target.add);
  Logger.log('probe | every body below is missing either the application id or the user id, so none can write.');

  var eps = ['/application.addHiringTeamMember', '/application.removeHiringTeamMember'];
  var bodies = [
    { label: 'empty body', body: {} },
    { label: 'applicationId only', body: { applicationId: target.app } },
    { label: 'userId only', body: { userId: retagIdIn_(target.add) } }
  ];
  for (var e = 0; e < eps.length; e++) {
    for (var b = 0; b < bodies.length; b++) {
      var res = ashbyWrite_(eps[e], bodies[b].body);
      Logger.log('probe | ' + eps[e] + ' [' + bodies[b].label + '] -> HTTP ' + res.code + ' :: ' +
                 res.text.substring(0, 600));
      Utilities.sleep(200);
    }
  }
  Logger.log('probe | done. NOTHING was written to Ashby.');
}

// ---- what the schema probe told us, 1 Sep ----
// BOTH endpoints take exactly three strings:
//     applicationId, teamMemberId, roleId
// 🚨 roleId, NOT the role NAME - sending 'Recruiter' will not work. And the field is teamMemberId,
// not userId, so it is worth confirming that an Ashby user id is what it actually wants.
//
// retagProbeRole_ answers both by reading a live application that already HAS a Recruiter and
// dumping its raw hiringTeam array. Whatever id that member carries for the person is what
// teamMemberId means, and the role's own id is the roleId we have to send. A read, nothing more.
function retagProbeRole_() {
  var plan = retagReadPlan_(), target = null, i;
  for (i = 0; i < plan.rows.length; i++) {
    if (plan.rows[i].app && plan.rows[i].live && plan.rows[i].live.indexOf('+') < 0) { target = plan.rows[i]; break; }
  }
  if (!target) throw new Error('no plan row with exactly one live recruiter');
  Logger.log('role | reading application ' + target.app + ' (' + target.cand + ')');
  Logger.log('role | the plan says Ashby currently holds: ' + target.live);
  var res = ashbyPost_('/application.info', { applicationId: target.app });
  var app = res && res.results;
  if (!app) { Logger.log('role | application.info returned nothing'); return; }
  Logger.log('role | RAW hiringTeam: ' + JSON.stringify(app.hiringTeam));
  Logger.log('role | done. This was a READ. Nothing was written to Ashby.');
}

// application.info exposes the role as a NAME ("Recruiter") and carries no roleId, so the id the
// write endpoints demand has to come from a list endpoint. Ashby's own API index names two:
//   applicationHiringTeamRole.list - "all available hiring team roles for applications"
//   hiringTeamRole.list            - "the possible hiring team roles in an organization"
// Read both and log them; the application-level one is the one addHiringTeamMember should want.
function retagProbeRoleList_() {
  var eps = ['/applicationHiringTeamRole.list', '/hiringTeamRole.list'];
  for (var e = 0; e < eps.length; e++) {
    var res = ashbyWrite_(eps[e], {});
    Logger.log('roles | ' + eps[e] + ' -> HTTP ' + res.code + ' :: ' + res.text.substring(0, 1200));
    Utilities.sleep(200);
  }
  Logger.log('roles | done. Both were reads. Nothing was written to Ashby.');
}

// Recruiter role, from applicationHiringTeamRole.list (1 Sep). The write endpoints demand the
// role's ID - the string 'Recruiter' is rejected.
//   Hiring Manager 8336b30f-9e35-4cf2-a5fe-bfeab765adef | Recruiter 22db8dc8-83f4-40de-8376-87efff4a6eb6
//   Recruiting Coordinator 58174d36-36dc-4955-828c-7ce221a23510 | Sourcer 952a945b-4f74-44cd-be85-2acba0248822
var RETAG_ROLE_RECRUITER = '22db8dc8-83f4-40de-8376-87efff4a6eb6';

// Every "Name [uuid]" in a cell, not just the first - a Remove cell can name several people.
function retagIdsIn_(cell) {
  var out = [], re = /\[([0-9a-fA-F-]{36})\]/g, m;
  while ((m = re.exec(String(cell || '')))) out.push(m[1]);
  return out;
}

// THE WRITE. limit = how many plan rows to act on; addOnly = only take plain 'add' rows.
// Resumable and idempotent: a row that already carries a Write status is skipped, so re-running
// never writes the same application twice. Status is written back per row, as we go, so a crash
// mid-batch still leaves an accurate record of what landed.
function retagWriteBatch_(limit, addOnly) {
  var plan = retagReadPlan_(), sh = plan.sheet, C = plan.C, i;

  // Add the two progress columns the first time.
  var statusCol = C.status;
  if (statusCol < 0) {
    statusCol = plan.hdr.length;
    sh.getRange(1, statusCol + 1).setValue('Write status').setFontWeight('bold');
    sh.getRange(1, statusCol + 2).setValue('Write result').setFontWeight('bold');
  }

  var picked = [];
  for (i = 0; i < plan.rows.length && picked.length < limit; i++) {
    var r = plan.rows[i];
    if (r.status) continue;                                   // already written
    if (r.act !== 'add' && r.act !== 'remove + add') continue; // never touch already-correct / excluded / blocked
    if (addOnly && r.act !== 'add') continue;
    if (!r.app) continue;
    picked.push(r);
  }
  if (!picked.length) { Logger.log('write | nothing left to write for this filter'); return; }
  Logger.log('write | acting on ' + picked.length + ' row(s). Recruiter roleId ' + RETAG_ROLE_RECRUITER);

  var okCount = 0, failCount = 0;
  for (i = 0; i < picked.length; i++) {
    var row = picked[i];
    var addId = retagIdsIn_(row.add)[0] || null;
    var rmIds = retagIdsIn_(row.rm);
    var steps = [], failed = null;
    Logger.log('write | row ' + row.row + ' ' + row.cand + ' / ' + row.job + ' [' + row.act + ']');
    Logger.log('write | application ' + row.app + ' | remove ' + rmIds.length + ' | add ' + (addId ? addId : 'none'));

    // remove first, then add - whether add REPLACES or STACKS is undocumented, and
    // remove-then-add does not depend on the answer.
    for (var q = 0; q < rmIds.length && !failed; q++) {
      var rr = ashbyWrite_('/application.removeHiringTeamMember',
        { applicationId: row.app, teamMemberId: rmIds[q], roleId: RETAG_ROLE_RECRUITER });
      steps.push('remove ' + rmIds[q].substring(0, 8) + (rr.ok ? ' ok' : ' FAILED'));
      Logger.log('write |   remove -> HTTP ' + rr.code + ' :: ' + rr.text.substring(0, 300));
      if (!rr.ok) failed = 'remove failed: ' + rr.text.substring(0, 200);
    }
    if (!failed && addId) {
      var ar = ashbyWrite_('/application.addHiringTeamMember',
        { applicationId: row.app, teamMemberId: addId, roleId: RETAG_ROLE_RECRUITER });
      steps.push('add ' + addId.substring(0, 8) + (ar.ok ? ' ok' : ' FAILED'));
      Logger.log('write |   add -> HTTP ' + ar.code + ' :: ' + ar.text.substring(0, 300));
      if (!ar.ok) failed = 'add failed: ' + ar.text.substring(0, 200);
    }

    // Read the application back and say who Ashby holds NOW - never trust the write's own answer.
    var after = '';
    try {
      var chk = ashbyPost_('/application.info', { applicationId: row.app });
      var names = getHiringTeamRoles_((chk && chk.results) || {}).recruiters.map(function (x) { return x.name; });
      after = names.length ? names.join(' + ') : '(nobody)';
    } catch (eC) { after = 'read-back failed: ' + eC.message; }
    Logger.log('write |   Ashby now holds: ' + after);

    sh.getRange(row.row, statusCol + 1).setValue(failed ? 'FAILED' : 'done');
    sh.getRange(row.row, statusCol + 2).setValue(
      (failed ? failed + ' | ' : '') + steps.join(', ') + ' | after: ' + after);
    if (failed) failCount++; else okCount++;
    Utilities.sleep(300);
  }
  Logger.log('write | DONE. ' + okCount + ' succeeded, ' + failCount + ' failed.');
}

// ---- the Bulls Eye source, the last piece of Jerin's rule ----
// Two applications (Ross Y and Kiran Lakkaraju, both Part Time Instructor - Agentic AI (US)) are
// tagged Third-party boards / LinkedIn and should read Agencies / Bulls Eye.
// ⚠ Bulls Eye is NOT Black Bull - different agencies, and Black Bull carries 489 applications.
// source.list needs hiringProcessMetadataRead; application.changeSource needs candidatesWrite.
function retagProbeSource_() {
  var res = ashbyWrite_('/source.list', {});
  Logger.log('src | /source.list -> HTTP ' + res.code + ' | success ' + (res.json ? res.json.success : '?'));
  var hits = [], all = 0;
  if (res.json && res.json.results) {
    var list = res.json.results;
    for (var i = 0; i < list.length; i++) {
      all++;
      var title = list[i].title || list[i].name || '';
      // Log anything bull-ish so Bulls Eye and Black Bull are visibly distinguished.
      if (/bull/i.test(title)) hits.push(JSON.stringify(list[i]));
    }
  }
  Logger.log('src | sources returned: ' + all);
  Logger.log('src | matches on "bull": ' + (hits.length ? hits.join(' :: ') : 'NONE'));
  var sc = ashbyWrite_('/application.changeSource', {});
  Logger.log('src | /application.changeSource [empty body] -> HTTP ' + sc.code + ' :: ' + sc.text.substring(0, 600));
  Logger.log('src | done. Nothing was written to Ashby.');
}

// ---- the Bulls Eye source write ----
// From source.list (1 Sep). BOTH are Agencies, and picking the wrong one would mis-attribute
// against an agency carrying 489 applications:
//   Bulls Eye   33cd4070-f9ea-40e2-843e-fa6971d3564e   <- ours, 8 applications
//   Black Bull  5f830bc2-ae22-4e98-bdfb-5e99107191e4   <- NOT ours
// application.changeSource takes exactly { applicationId, sourceId }.
var RETAG_SOURCE_BULLS_EYE = '33cd4070-f9ea-40e2-843e-fa6971d3564e';

// Driven off the plan tab's "Source action" column, not a hardcoded id list, so it stays tied to
// what Jerin reviewed. Records its own status column and reads the source back afterwards.
function retagWriteSource_() {
  var plan = retagReadPlan_(), sh = plan.sheet, i;
  var vals = sh.getDataRange().getValues(), hdr = vals[0];
  function c(n) { for (var k = 0; k < hdr.length; k++) if (String(hdr[k]).trim() === n) return k; return -1; }
  var iAct = c('Source action'), iApp = c('Ashby application id'), iCand = c('Candidate');
  var iSt = c('Source write status');
  if (iAct < 0) throw new Error('no "Source action" column');
  if (iSt < 0) {
    iSt = hdr.length;
    sh.getRange(1, iSt + 1).setValue('Source write status').setFontWeight('bold');
  }

  var done = 0, failed = 0;
  for (i = 1; i < vals.length; i++) {
    var act = String(vals[i][iAct] || '').trim();
    if (act.indexOf('set source') !== 0) continue;      // only rows that need a change
    if (String(vals[i][iSt] || '').trim()) continue;    // already written
    var app = String(vals[i][iApp] || '');
    if (!app) continue;
    Logger.log('src | row ' + (i + 1) + ' ' + vals[i][iCand] + ' | application ' + app);
    var res = ashbyWrite_('/application.changeSource',
      { applicationId: app, sourceId: RETAG_SOURCE_BULLS_EYE });
    Logger.log('src |   changeSource -> HTTP ' + res.code + ' :: ' + res.text.substring(0, 300));

    // Read it back rather than trusting the write's own answer.
    var after = '';
    try {
      var chk = ashbyPost_('/application.info', { applicationId: app });
      var a = chk && chk.results, s = a && a.source;
      var st = s && s.sourceType ? (s.sourceType.title || s.sourceType) : '';
      after = (st || '?') + ' / ' + ((s && s.title) || '(none)');
    } catch (e) { after = 'read-back failed: ' + e.message; }
    Logger.log('src |   source now: ' + after);

    sh.getRange(i + 1, iSt + 1).setValue((res.ok ? 'done' : 'FAILED') + ' | after: ' + after);
    if (res.ok) done++; else failed++;
    Utilities.sleep(300);
  }
  Logger.log('src | DONE. ' + done + ' source(s) changed, ' + failed + ' failed.');
}
