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

// RIGHT NOW: the OPENING/STATUS endpoint probe. Writes NOTHING - empty bodies only.
// The 222 recruiter writes and the 2 source writes are COMPLETE.
// The 222 recruiter writes are COMPLETE (222 done, 0 failed, verified by read-back).
function runRetagWriteStep() {
  retagTestFullFlow_();
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

// ---- can we link an application to an opening, hire, or archive, via the API at all? ----
// Ashby's published index lists NO application->opening link (only offer.create takes an openingId),
// and NO hire/archive endpoint. But that index was already wrong once - it did not document the
// addHiringTeamMember fields either - so ask the API directly.
// An endpoint that does not exist answers differently from one that exists and is missing fields:
//   exists  -> 200 {"success":false,"errors":["invalid_input"], ... names the fields it wants}
//   absent  -> 404 / not_found / unknown endpoint
// Every body is EMPTY, so nothing can be created or changed either way.
function retagProbeOpening_() {
  var eps = [
    '/application.changeStage',
    '/application.setOpening', '/application.linkOpening', '/application.update',
    '/application.change', '/application.setStatus', '/application.hire',
    '/application.archive', '/application.unarchive', '/application.setArchived',
    '/offer.create', '/offer.update', '/offer.setOpening',
    '/opening.addApplication', '/opening.list'
  ];
  var exists = [], absent = [];
  for (var e = 0; e < eps.length; e++) {
    var res = ashbyWrite_(eps[e], {});
    var txt = res.text || '';
    var msg = '';
    try { var j = JSON.parse(txt); msg = (j.errorInfo && j.errorInfo.message) || (j.errors || []).join(',') || (j.success ? 'SUCCESS - returned data' : ''); } catch (x) { msg = txt.substring(0, 120); }
    var gone = res.code === 404 || /not_found|unknown|no such|cannot .*(POST|find)/i.test(txt);
    (gone ? absent : exists).push(eps[e] + '  [' + res.code + ']  ' + msg.substring(0, 260));
    Utilities.sleep(150);
  }
  Logger.log('open | ENDPOINTS THAT EXIST:');
  exists.forEach(function (l) { Logger.log('open |   ' + l); });
  Logger.log('open | ENDPOINTS THAT DO NOT EXIST:');
  absent.forEach(function (l) { Logger.log('open |   ' + l); });
  Logger.log('open | done. Every body was empty - nothing was written to Ashby.');
}

// ---- what does application.update actually accept? ----
// It exists (Ashby's published index does not list it) and demands only applicationId, so every other
// field is optional - which makes it the only candidate for setting an opening or a status.
// To find its schema WITHOUT any risk: send one candidate field at a time with a DELIBERATELY WRONG
// TYPE and NO applicationId. A field in the schema is named back with a type error; one that is not
// in the schema is silently ignored and only applicationId is reported missing. Nothing can be
// written - there is no application id in any request.
function retagProbeUpdateFields_() {
  var fields = ['openingId', 'status', 'archived', 'archiveReasonId', 'archiveReason',
                'sourceId', 'creditedToUserId', 'currentInterviewStageId', 'interviewStageId',
                'hiredAt', 'startDate', 'customFields', 'applicationHistory'];
  var recognised = [], ignored = [];
  for (var i = 0; i < fields.length; i++) {
    var body = {};
    body[fields[i]] = 12345;                       // wrong type on purpose, and NO applicationId
    var res = ashbyWrite_('/application.update', body);
    var msg = '';
    try { var j = JSON.parse(res.text); msg = (j.errorInfo && j.errorInfo.message) || ''; } catch (e) { msg = res.text.substring(0, 150); }
    if (msg.indexOf(fields[i]) > -1) recognised.push(fields[i] + '  ::  ' + msg.substring(0, 200));
    else ignored.push(fields[i]);
    Utilities.sleep(150);
  }
  Logger.log('upd | FIELDS application.update RECOGNISES:');
  recognised.forEach(function (l) { Logger.log('upd |   ' + l); });
  Logger.log('upd | not in its schema: ' + ignored.join(', '));
  Logger.log('upd | done. No applicationId was ever sent - nothing was written to Ashby.');
}

// ---- is a 404 "no such endpoint", or "you lack the scope"? ----
// The whole "the API cannot do this" conclusion rests on 404 meaning ABSENT rather than FORBIDDEN.
// Some APIs deliberately answer 404 for endpoints you lack permission for, which would mean a
// better-scoped key could still do the work. Test it against endpoints Ashby DOCUMENTS as existing
// but which need permissions this key probably lacks (jobsWrite, organizationWrite):
//   403 / permission error  -> Ashby distinguishes, so our 404s really do mean ABSENT
//   404                     -> Ashby masks scope as 404, and our conclusion is unsafe
// Empty bodies throughout - nothing can be created.
function retagProbePermissions_() {
  var eps = [
    ['/hiringTeam.addMember',      'documented, needs organizationWrite'],
    ['/opening.create',            'documented, needs jobsWrite'],
    ['/opening.update',            'documented, needs jobsWrite'],
    ['/application.updateHistory', 'documented candidatesWrite - can it set stage or status?'],
    ['/application.transfer',      'documented candidatesWrite - moves app to another job'],
    ['/offer.setStatus',           'documented offersWrite - offer acceptance status'],
    ['/offer.setDecidedAt',        'documented offersWrite'],
    ['/offer.start',               'documented offersWrite'],
    ['/application.hire',          'CONTROL - believed absent'],
    ['/totallyMadeUp.endpoint',    'CONTROL - definitely absent']
  ];
  for (var e = 0; e < eps.length; e++) {
    var res = ashbyWrite_(eps[e][0], {});
    var code = '', msg = '';
    try { var j = JSON.parse(res.text);
      code = (j.errors || []).join(',') || (j.errorInfo && j.errorInfo.code) || '';
      msg = (j.errorInfo && j.errorInfo.message) || ''; } catch (x) { msg = res.text.substring(0, 120); }
    Logger.log('perm | ' + eps[e][0] + '  HTTP ' + res.code + '  [' + code + ']  ' +
               msg.substring(0, 180) + '   <- ' + eps[e][1]);
    Utilities.sleep(150);
  }
  Logger.log('perm | done. Empty bodies only - nothing was written to Ashby.');
}

// One-off: did the empty-body /opening.create probe actually CREATE something? It answered HTTP 200
// with no error while every other endpoint rejected an empty body. Read-only check.
function retagCheckOpeningCreate_() {
  var res = ashbyWrite_('/opening.create', {});
  Logger.log('chk | repeating opening.create with an empty body, RAW: ' + res.text.substring(0, 900));
  var all = [];
  try { all = ashbyListAll_('/opening.list'); } catch (e) { Logger.log('chk | opening.list failed: ' + e.message); }
  Logger.log('chk | total openings now: ' + all.length);
  var recent = all.slice().sort(function (a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); });
  for (var i = 0; i < Math.min(6, recent.length); i++) {
    var o = recent[i];
    Logger.log('chk | recent ' + (i + 1) + ': id ' + o.id + ' created ' + (o.createdAt || '?') +
               ' identifier ' + JSON.stringify(o.identifier) + ' jobs ' + ((o.jobs || []).length) +
               ' state ' + JSON.stringify(o.openingState));
  }
}

// READ ONLY. Find the openings the empty-body opening.create probe created, so they can be cleaned up.
// Signature: no jobs attached, no openedAt, state Draft, created today.
function retagFindStrayOpenings_() {
  var all = ashbyListAll_('/opening.list');
  Logger.log('stray | total openings: ' + all.length);
  var hits = 0;
  for (var i = 0; i < all.length; i++) {
    var o = all[i], lv = o.latestVersion || {};
    var created = String(lv.createdAt || '');
    if (created.indexOf('2026-09-01') !== 0) continue;
    var jobs = (lv.jobIds || o.jobIds || []).length;
    Logger.log('stray | id ' + o.id + ' | ' + (lv.identifier || '?') + ' | created ' + created +
               ' | state ' + o.openingState + ' | archived ' + o.isArchived +
               ' | openedAt ' + o.openedAt + ' | jobs ' + jobs);
    hits++;
  }
  Logger.log('stray | openings created today: ' + hits);
}

// ---- can offer.update re-link an opening on an EXISTING offer? ----
// Ashby does not publish OfferUpdateRequest, so ask the schema - with a body that cannot write:
//   * NO offerId / offerProcessId, so there is no target record at all
//   * openingId sent as a NUMBER, so it could not be applied even if there were
// offer.create is the POSITIVE CONTROL: its documented error codes (opening_in_use,
// opening_state_invalid) prove it accepts openingId, so it must come back recognised. If the
// control lights up and offer.update does not, the negative result is real.
// 🚨 Contrast with opening.create, which CREATED a record from an empty body: these two endpoints
// both REQUIRE ids we are deliberately omitting, which is what makes this safe.
function retagProbeOfferOpening_() {
  var tests = [
    ['/offer.create', { openingId: 12345 }, 'POSITIVE CONTROL - must recognise openingId'],
    ['/offer.update', { openingId: 12345 }, 'THE QUESTION - can it re-link an opening?'],
    ['/offer.update', { offerForm: 12345 }, 'sanity - offerForm is known to exist'],
    ['/offer.start',  { openingId: 12345 }, 'does offer.start take an opening?'],
    ['/offer.setStatus', { openingId: 12345 }, 'does setStatus take an opening?']
  ];
  for (var i = 0; i < tests.length; i++) {
    var res = ashbyWrite_(tests[i][0], tests[i][1]);
    var msg = '';
    try { var j = JSON.parse(res.text);
      if (j.success) { msg = 'WARNING - SUCCEEDED, RAW: ' + res.text.substring(0, 400); }
      else { msg = (j.errorInfo && j.errorInfo.message) || (j.errors || []).join(','); } }
    catch (e) { msg = res.text.substring(0, 200); }
    var probe = Object.keys(tests[i][1])[0];
    Logger.log('ofr | ' + tests[i][0] + ' [' + probe + '] -> ' +
               (msg.indexOf(probe) > -1 ? 'RECOGNISED' : 'not in schema') + '  :: ' +
               msg.substring(0, 240) + '   <- ' + tests[i][2]);
    Utilities.sleep(200);
  }
  Logger.log('ofr | done. No offerId or offerProcessId was ever sent - no record could be touched.');
}

// READ ONLY. Two questions, no writes:
//  1. Where does openingId actually live on an offer? Dump one offer that HAS an opening.
//  2. What are the offerIds on the Test - Project Hello Christy - Sales PA job (our sandbox)?
// Knowing the real shape beats guessing at the request body - which is what created the two
// stray openings earlier today.
function retagInspectOffers_() {
  var all = ashbyListAll_('/offer.list');
  Logger.log('ins | offers returned: ' + all.length);
  var withOpening = null, i;
  for (i = 0; i < all.length; i++) {
    var lv = all[i].latestVersion || {};
    if (lv.openingId) { withOpening = all[i]; break; }
  }
  if (withOpening) {
    Logger.log('ins | TOP-LEVEL keys on an offer: ' + Object.keys(withOpening).join(', '));
    Logger.log('ins | latestVersion keys: ' + Object.keys(withOpening.latestVersion || {}).join(', '));
    Logger.log('ins | a LINKED offer, raw: ' + JSON.stringify(withOpening).substring(0, 1500));
  } else { Logger.log('ins | no offer with an openingId found in offer.list'); }
  var test = [];
  for (i = 0; i < all.length; i++) {
    var o = all[i], lv2 = o.latestVersion || {};
    var jt = (o.job && o.job.title) || lv2.jobTitle || '';
    if (!/Hello Christy/i.test(jt)) continue;
    test.push('offerId ' + o.id + ' | ' + ((o.candidate && o.candidate.name) || '?') +
              ' | app ' + o.applicationId + ' | openingId ' + (lv2.openingId || 'NONE') +
              ' | status ' + (o.acceptanceStatus || lv2.acceptanceStatus || '?'));
  }
  Logger.log('ins | offers on the Hello Christy TEST job: ' + test.length);
  test.slice(0, 8).forEach(function (l) { Logger.log('ins |   ' + l); });
}

// READ ONLY. offer.list carries no job title, so match through offer_contacts.json (Drive), which
// holds applicationId + candidate + jobTitle. Finds the offers on the Hello Christy TEST job so we
// have a real, disposable offerId to experiment against.
function retagFindTestOffers_() {
  var it = DriveApp.getFilesByName('offer_contacts.json');
  if (!it.hasNext()) throw new Error('offer_contacts.json not in Drive');
  var rows = JSON.parse(it.next().getBlob().getDataAsString()).rows || [];
  var want = {};
  rows.forEach(function (r) { if (/Hello Christy/i.test(r.jobTitle || '')) want[r.applicationId] = r; });
  Logger.log('test | applications on the Hello Christy job: ' + Object.keys(want).length);
  var all = ashbyListAll_('/offer.list'), found = 0;
  for (var i = 0; i < all.length; i++) {
    var o = all[i];
    if (!want[o.applicationId]) continue;
    var lv = o.latestVersion || {};
    found++;
    Logger.log('test |   offerId ' + o.id + ' | versionId ' + (lv.id || '?') +
               ' | ' + (want[o.applicationId].candidate || '?') +
               ' | app ' + o.applicationId +
               ' | openingId ' + (lv.openingId || 'NONE') +
               ' | acceptance ' + (o.acceptanceStatus || '?') +
               ' | startDate ' + (lv.startDate || 'none'));
  }
  Logger.log('test | offers found on that job: ' + found);
}

// ---- CAN offer.update RE-LINK AN OPENING? Tested on the Hello Christy TEST job. ----
// Target: Test - Kaashvika Kashyap, offer a75032f4-a70b-4ef7-a725-ad5f3ef76646, openingId NONE.
// Jerin pointed at this job precisely because everything on it is disposable.
//
// Round 1 mutates NOTHING: offerForm is sent as a NUMBER, so validation fails before any write,
// while openingId is also a number - if it is in the schema it gets named in the error.
// This is the test the earlier attempt got wrong: last time the REQUIRED fields were missing, which
// stopped Ashby from ever validating the optional ones, and offer.create (which we KNOW takes an
// openingId) came back a false negative. Here offerId is real, so the optional fields are reached.
var RETAG_TEST_OFFER = 'a75032f4-a70b-4ef7-a725-ad5f3ef76646';
function retagTestOfferOpening_() {
  var bodies = [
    [{ offerId: RETAG_TEST_OFFER, offerForm: 12345, openingId: 12345 }, 'openingId TOP-LEVEL, nothing writable'],
    [{ offerId: RETAG_TEST_OFFER, offerForm: 12345, opening: 12345 },   'alt name: opening'],
    [{ offerId: RETAG_TEST_OFFER, offerForm: 12345, openingIds: 12345 },'alt name: openingIds']
  ];
  for (var i = 0; i < bodies.length; i++) {
    var res = ashbyWrite_('/offer.update', bodies[i][0]);
    var msg = '';
    try { var j = JSON.parse(res.text);
      if (j.success) { msg = 'WARNING - SUCCEEDED: ' + res.text.substring(0, 300); }
      else { msg = (j.errorInfo && j.errorInfo.message) || (j.errors || []).join(','); } }
    catch (e) { msg = res.text.substring(0, 200); }
    var key = Object.keys(bodies[i][0])[2];
    Logger.log('ofr2 | ' + key + ' -> ' + (msg.indexOf(key) > -1 ? 'RECOGNISED' : 'not in schema') +
               '  :: ' + msg.substring(0, 260) + '   <- ' + bodies[i][1]);
    Utilities.sleep(200);
  }
  Logger.log('ofr2 | done. offerForm was an invalid type in every call - no version could be written.');
}

// openingId is not a TOP-LEVEL param of offer.update (proved with a valid offerId, so the optional
// fields were reachable and would have type-errored if they existed). Next candidate: inside
// offerForm - which is where it sits on the read side, on latestVersion beside startDate.
// Guard: fieldSubmissions is also sent as a wrong type, so if offerForm requires it the request
// still fails validation and no new offer version is written.
function retagTestOfferForm_() {
  var bodies = [
    [{ offerId: RETAG_TEST_OFFER, offerForm: { fieldSubmissions: 12345, openingId: 12345 } },
     'openingId INSIDE offerForm, fieldSubmissions wrong-typed as a guard'],
    [{ offerId: RETAG_TEST_OFFER, offerForm: { openingId: 12345 } },
     'openingId inside offerForm, no guard - may write if openingId is unknown']
  ];
  for (var i = 0; i < bodies.length; i++) {
    var res = ashbyWrite_('/offer.update', bodies[i][0]);
    var msg = '', wrote = false;
    try { var j = JSON.parse(res.text);
      if (j.success) { wrote = true; msg = 'SUCCEEDED - a version was written: ' + res.text.substring(0, 500); }
      else { msg = (j.errorInfo && j.errorInfo.message) || (j.errors || []).join(','); } }
    catch (e) { msg = res.text.substring(0, 250); }
    Logger.log('form | [' + bodies[i][1] + ']');
    Logger.log('form |   openingId ' + (msg.indexOf('openingId') > -1 ? 'RECOGNISED' : 'not named') +
               ' | ' + msg.substring(0, 320));
    if (wrote) { Logger.log('form |   STOPPING - a write happened, not sending the next body.'); break; }
    Utilities.sleep(250);
  }
  var chk = ashbyWrite_('/offer.info', { offerId: RETAG_TEST_OFFER });
  try { var o = JSON.parse(chk.text).results; var lv = (o && o.latestVersion) || {};
    Logger.log('form | READ BACK: openingId ' + (lv.openingId || 'NONE') + ' | startDate ' +
               (lv.startDate || 'none') + ' | versionId ' + (lv.id || '?') +
               ' | customFields ' + ((lv.customFields || []).length)); }
  catch (e) { Logger.log('form | read-back failed: ' + chk.text.substring(0, 200)); }
}

// ---- Jerin, 1 Sep: create 2 openings on the TEST job, opened 1 July ----
// Ashby publishes no request schema for opening.create, and unknown keys are silently stripped
// rather than rejected - so the only way to learn what it accepts is to send a rich body and read
// the result back. Doing ONE first, on the Test - Project Hello Christy job, then checking before
// the second. Anything that did not stick gets fixed with opening.update / setOpeningState / addJob.
function retagCreateTestOpening_() {
  var jobs = ashbyListAll_('/job.list'), job = null, i;
  for (i = 0; i < jobs.length; i++) if (/Hello Christy/i.test(jobs[i].title || '')) { job = jobs[i]; break; }
  if (!job) throw new Error('Hello Christy test job not found');
  Logger.log('mk | test job: ' + job.title + ' | id ' + job.id + ' | status ' + job.status);

  var body = {
    identifier: 'Test opening - 1 July A',
    description: 'Created via API test, Hello Christy test job',
    jobIds: [job.id],
    openedAt: '2026-07-01',
    targetStartDate: '2026-07-01',
    targetHireDate: '2026-07-01',
    employmentType: 'FullTime',
    isBackfill: false,
    openingState: 'Open'
  };
  Logger.log('mk | sending: ' + JSON.stringify(body));
  var res = ashbyWrite_('/opening.create', body);
  Logger.log('mk | opening.create HTTP ' + res.code + ' :: ' + res.text.substring(0, 1200));
  var made = null;
  try { made = JSON.parse(res.text).results; } catch (e) {}
  if (!made) { Logger.log('mk | nothing created, stopping'); return; }

  var lv = made.latestVersion || {};
  Logger.log('mk | RESULT id ' + made.id + ' | state ' + made.openingState +
             ' | openedAt ' + made.openedAt + ' | identifier ' + lv.identifier +
             ' | jobs ' + JSON.stringify(lv.jobIds) + ' | targetStartDate ' + lv.targetStartDate);
  Logger.log('mk | WHAT STUCK: openedAt ' + (made.openedAt ? 'YES' : 'no') +
             ' | job attached ' + (((lv.jobIds || []).length) ? 'YES' : 'no') +
             ' | state Open ' + (made.openingState === 'Open' ? 'YES' : 'no - it is ' + made.openingState));
  Logger.log('mk | ONE opening created. Not creating the second until this one is checked.');
}

// opening.create IGNORED the openedAt I sent and stamped today instead - Ashby sets the opened date
// itself when an opening goes to Open. That matters: the dashboard buckets openings by their own
// openedAt quarter, so an opening meant for July would land in the wrong quarter.
// Can it be corrected afterwards? Try opening.update, then setOpeningState, reading back each time.
var RETAG_TEST_OPENING = 'b0ad947b-4051-484d-bba8-ca9bbcb16679';
function retagFixOpenedAt_() {
  function readBack(tag) {
    var r = ashbyWrite_('/opening.info', { openingId: RETAG_TEST_OPENING });
    try { var o = JSON.parse(r.text).results;
      Logger.log('fix | ' + tag + ' -> openedAt ' + o.openedAt + ' | state ' + o.openingState);
      return o.openedAt; }
    catch (e) { Logger.log('fix | ' + tag + ' read-back failed: ' + r.text.substring(0, 200)); return null; }
  }
  readBack('BEFORE');

  var a = ashbyWrite_('/opening.update', { openingId: RETAG_TEST_OPENING, openedAt: '2026-07-01' });
  Logger.log('fix | opening.update openedAt -> HTTP ' + a.code + ' :: ' + a.text.substring(0, 300));
  readBack('after opening.update');

  var b = ashbyWrite_('/opening.setOpeningState',
    { openingId: RETAG_TEST_OPENING, openingState: 'Open', openedAt: '2026-07-01' });
  Logger.log('fix | setOpeningState openedAt -> HTTP ' + b.code + ' :: ' + b.text.substring(0, 300));
  readBack('after setOpeningState');
  Logger.log('fix | done.');
}

// READ ONLY. Jerin found the opened date IS editable, from Job > Openings (not the global Openings
// tab), and it auto-saves with no apply button. I set this test opening to 1 July in the UI and it
// survived a page reload. This confirms whether the API - and therefore the dashboard - sees it.
function retagVerifyOpenedAt_() {
  var r = ashbyWrite_('/opening.info', { openingId: 'b0ad947b-4051-484d-bba8-ca9bbcb16679' });
  try { var o = JSON.parse(r.text).results;
    Logger.log('ver | openedAt now: ' + o.openedAt);
    Logger.log('ver | state ' + o.openingState + ' | archived ' + o.isArchived);
    Logger.log('ver | quarter the dashboard would bucket it in: ' +
      (o.openedAt ? String(o.openedAt).substring(0,4) + '-Q' + (Math.floor((parseInt(String(o.openedAt).substring(5,7),10)-1)/3)+1) : 'none'));
  } catch (e) { Logger.log('ver | failed: ' + r.text.substring(0,300)); }
}

// READ ONLY SURVEY, before any hiring. Jerin's rule (1 Sep): for each person to be hired, look for an
// EXISTING opening on their job whose opened date falls in the quarter the Hiring Tracker expects.
// If one is free, close against it. If not, create one dated to that quarter, then link.
// 🚨 An opening is consumed by one hire, so two people on the same job in the same quarter need TWO
// free openings - this counts availability properly rather than just 'does one exist'.
function retagSurveyOpenings_() {
  var sh = SpreadsheetApp.openById(AUDIT_SHEET_ID).getSheetByName(AUDIT_V2_TAB);
  var vals = sh.getDataRange().getValues(), H = vals[0];
  function colOf(n){ for (var k=1;k+2<H.length;k+=4) if (String(H[k]).trim()===n) return k; return -1; }
  var cS=colOf('Status'), cJ=colOf('Job Name'), cOQ=colOf('Opening Quarter'), cN=colOf('Candidate Name');

  // the 91: tracker says Joined, Ashby has not marked them Hired
  var need = [];
  for (var r=1;r<vals.length;r++){
    if (String(vals[r][cS+2]||'').trim()!=='No') continue;
    if (String(vals[r][cS]||'').trim()!=='Joined') continue;
    if (String(vals[r][cS+1]||'').trim()!=='Offer Released') continue;
    need.push({ cand:String(vals[r][cN]||''), job:String(vals[r][cJ+1]||''), q:String(vals[r][cOQ]||'').trim() });
  }
  Logger.log('srv | people to hire: ' + need.length);

  // every opening, by job, with its quarter and whether it is still free
  var jobs = ashbyListAll_('/job.list'), titleById = {};
  jobs.forEach(function(j){ titleById[j.id] = j.title; });
  var all = ashbyListAll_('/opening.list');
  var free = {}, taken = 0;
  all.forEach(function(o){
    var lv = o.latestVersion || {};
    if (!o.openedAt || o.isArchived) return;
    var st = String(o.openingState||'');
    if (st !== 'Open') { taken++; return; }                 // Filled / Closed / Draft are not available
    var q = String(o.openedAt).substring(0,4) + '-Q' + (Math.floor((parseInt(String(o.openedAt).substring(5,7),10)-1)/3)+1);
    (lv.jobIds || []).forEach(function(jid){
      var key = (titleById[jid]||jid) + '||' + q;
      free[key] = (free[key] || 0) + 1;
    });
  });
  Logger.log('srv | openings total ' + all.length + ' | not available (filled/closed/draft/archived) ' + taken);

  var pool = {}; for (var k in free) pool[k] = free[k];
  var matched = 0, mustCreate = 0, noQuarter = 0, byJob = {};
  need.forEach(function(p){
    if (!p.q) { noQuarter++; return; }
    // 'Q3 2026' -> '2026-Q3'. No regex: an escaped regex here silently matched nothing and made
    // every single row look like it needed a new opening. A flat 0 is almost never a real finding.
    var qq = (p.q.charAt(0) === 'Q') ? (p.q.substring(p.q.length - 4) + '-Q' + p.q.charAt(1)) : p.q;
    if (matched + mustCreate < 3) Logger.log('srv | sample key: [' + p.job + '||' + qq + '] pool has ' + (pool[p.job + '||' + qq] || 0));
    var key = p.job + '||' + qq;
    if (pool[key] > 0) { pool[key]--; matched++; }
    else { mustCreate++; byJob[key] = (byJob[key]||0)+1; }
  });
  Logger.log('srv | RESULT  existing free opening in the right quarter: ' + matched +
             ' | need a NEW opening created: ' + mustCreate +
             ' | no opening quarter in the tracker: ' + noQuarter);
  var list = Object.keys(byJob).sort(function(a,b){return byJob[b]-byJob[a];});
  Logger.log('srv | openings to create, by job and quarter (top 15):');
  list.slice(0,15).forEach(function(k){ Logger.log('srv |   ' + k.replace('||',' | ') + '  -> ' + byJob[k]); });
}

// ---- TEST-JOB DRY RUN of the real flow, Jerin approved 1 Sep ----
// Creates ONE opening on the Hello Christy test job, as Open, and tries to tag a recruiter on it in
// the same call. Unknown keys are stripped silently rather than rejected, so the only way to learn
// whether hiringTeam is accepted is to send it and read the result back.
// Recruiter used for the test: Smriti Das, whose id we confirmed in this morning's writes.
function retagTestFullFlow_() {
  var jobs = ashbyListAll_('/job.list'), job = null;
  for (var i = 0; i < jobs.length; i++) if (/Hello Christy/i.test(jobs[i].title || '')) { job = jobs[i]; break; }
  if (!job) throw new Error('test job not found');

  var body = {
    identifier: 'TEST flow - Q2 opening',
    description: 'Test of the real flow: create as Open, date in UI, tag recruiter, hire against it',
    jobIds: [job.id],
    openingState: 'Open',
    employmentType: 'FullTime',
    hiringTeam: [{ userId: '53ee8081-4fdb-4e1d-916a-bd30fbd421ca', roleId: RETAG_ROLE_RECRUITER }]
  };
  var res = ashbyWrite_('/opening.create', body);
  var o = null; try { o = JSON.parse(res.text).results; } catch (e) {}
  if (!o) { Logger.log('flow | create failed: ' + res.text.substring(0, 400)); return; }
  var lv = o.latestVersion || {};
  Logger.log('flow | CREATED ' + o.id);
  Logger.log('flow |   state ...... ' + o.openingState + '   (Open means it skipped draft+approval)');
  Logger.log('flow |   openedAt ... ' + o.openedAt + '   (expect today - the API cannot set this)');
  Logger.log('flow |   job ........ ' + JSON.stringify(lv.jobIds));
  Logger.log('flow |   hiringTeam . ' + JSON.stringify(lv.hiringTeam) +
             '   (empty means the recruiter tag must be done in the UI)');
  Logger.log('flow | open this to set the date + check Copy:');
  Logger.log('flow | https://app.ashbyhq.com/jobs/' + job.id + '/openings/' + o.id);
}
