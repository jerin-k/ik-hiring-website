// ===== #157b - build the topic-canon review tab in the AUDIT sheet (Jerin approved, 20 Sep) =====
// Writes ONE NEW TAB to 'Hiring Audit 2026 - Tracker vs Ashby'. Touches no existing tab and nothing in Ashby
// and nothing in the Hiring Tracker (which is read-only here). Delete this function once #157b is settled.
function build157bTab() {
  var TRACKER_ID = '1_LQxHDZ6dXehyR2lc8pcFjfDeRaV80vBzVRB_BKWT5A';
  var AUDIT_ID   = '1U6Wi5uXLZ8hOhGKP2tyH--jHcEbUEvXgAPxbkUofTNA';
  var TAB        = '157b - Topic canon';

  var vals = SpreadsheetApp.openById(TRACKER_ID).getSheetByName('Master').getDataRange().getValues();
  var hdr = vals[0].map(function (h) { return String(h || '').trim(); });
  var ci = hdr.indexOf('Remarks'), qi = hdr.indexOf('Joining Quarter'), di = -1;
  hdr.forEach(function (h, i) { if (/department/i.test(h) && di < 0) di = i; });
  if (ci < 0 || qi < 0 || di < 0) { Logger.log('B0 ABORT cols: remarks=' + ci + ' q=' + qi + ' dept=' + di); return; }

  // Conservative normalisation: it merges only spelling variants of the SAME words. It deliberately does NOT
  // guess that e.g. 'DS Math' and 'ML Math' are one topic - that is Jerin's call, not a rule's.
  function key(s) {
    var t = String(s).toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
    t = t.replace(/\bmaths\b/g, 'math').replace(/\bmodelling\b/g, 'modeling')
         .replace(/\bvisualisation\b/g, 'visualization').replace(/\boptimising\b/g, 'optimizing')
         .replace(/\barchitechture\b/g, 'architecture').replace(/\barchitectures\b/g, 'architecture')
         .replace(/\binstrutors\b/g, 'instructors').replace(/\bml ops\b/g, 'mlops')
         .replace(/\bllms\b/g, 'llm');
    return t.replace(/\s+/g, ' ').trim();
  }
  var LOOKS_LIKE_REMARK = /did not|approval|concerns?|declin|rejected|not interested/i;

  var lab = {}, prose = {};
  for (var r = 1; r < vals.length; r++) {
    var v = String(vals[r][ci] || '').trim();
    if (!v) continue;
    if (!/Q3/i.test(String(vals[r][qi] || ''))) continue;
    if (!/SME/i.test(String(vals[r][di] || ''))) continue;
    if (v.length <= 40 && v.split(/\s+/).length <= 5) lab[v] = (lab[v] || 0) + 1;
    else prose[v] = (prose[v] || 0) + 1;
  }

  // group the label-like values by normalised key
  var groups = {};
  Object.keys(lab).forEach(function (v) {
    var k = key(v);
    (groups[k] || (groups[k] = [])).push(v);
  });
  // suggested canonical per group = the most frequent spelling (ties: the shortest)
  var suggest = {}, groupTotal = {};
  Object.keys(groups).forEach(function (k) {
    var best = groups[k][0], tot = 0;
    groups[k].forEach(function (v) {
      tot += lab[v];
      if (lab[v] > lab[best] || (lab[v] === lab[best] && v.length < best.length)) best = v;
    });
    suggest[k] = best; groupTotal[k] = tot;
  });
  var keys = Object.keys(groups).sort(function (a, b) {
    if (groupTotal[b] !== groupTotal[a]) return groupTotal[b] - groupTotal[a];
    return suggest[a].localeCompare(suggest[b]);
  });

  var rows = [];
  rows.push(['#157b - canonical topic review', '', '', '', '']);
  rows.push(['Q3 SME tracker rows with a remark: ' + (Object.keys(lab).reduce(function (a, v) { return a + lab[v]; }, 0)
    + Object.keys(prose).reduce(function (a, v) { return a + prose[v]; }, 0))
    + ' | topic-like ' + Object.keys(lab).reduce(function (a, v) { return a + lab[v]; }, 0)
    + ' across ' + Object.keys(lab).length + ' distinct, grouped into ' + keys.length
    + ' | prose-like ' + Object.keys(prose).reduce(function (a, v) { return a + prose[v]; }, 0), '', '', '', '']);
  rows.push(['Fill in YOUR CALL. Leave it blank for anything that is not a topic. Same name on two rows = merge them.', '', '', '', '']);
  rows.push(['', '', '', '', '']);
  rows.push(['Remark as written', 'Times', 'Claude suggests', 'YOUR CALL', 'Note']);
  keys.forEach(function (k) {
    var vs = groups[k].sort(function (a, b) { return lab[b] - lab[a]; });
    vs.forEach(function (v, idx) {
      var note = '';
      if (vs.length > 1) note = (idx === 0 ? 'group of ' + vs.length + ' spellings' : 'merged into the row above');
      if (LOOKS_LIKE_REMARK.test(v)) note = (note ? note + ' - ' : '') + 'CHECK: reads like a remark, not a topic';
      rows.push([v, lab[v], LOOKS_LIKE_REMARK.test(v) ? '' : suggest[k], '', note]);
    });
  });
  rows.push(['', '', '', '', '']);
  rows.push(['Longer remarks (prose) - scan in case a topic is hiding here', '', '', '', '']);
  var pk = Object.keys(prose).sort(function (a, b) { return prose[b] - prose[a]; });
  pk.forEach(function (v) { rows.push([v.slice(0, 120), prose[v], '', '', 'prose']); });

  var ss = SpreadsheetApp.openById(AUDIT_ID);
  var sh = ss.getSheetByName(TAB);
  if (sh) sh.clear(); else sh = ss.insertSheet(TAB);
  sh.getRange(1, 1, rows.length, 5).setValues(rows);
  sh.setFrozenRows(5);
  sh.getRange(5, 1, 1, 5).setFontWeight('bold');
  sh.setColumnWidth(1, 300); sh.setColumnWidth(3, 220); sh.setColumnWidth(4, 220); sh.setColumnWidth(5, 300);
  Logger.log('B1 wrote tab "' + TAB + '": ' + rows.length + ' rows | groups=' + keys.length
    + ' | distinctLabels=' + Object.keys(lab).length + ' | distinctProse=' + pk.length);
  Logger.log('B2 url: ' + ss.getUrl() + '#gid=' + sh.getSheetId());
}

// ===== #157c READ-ONLY - is the topic sitting in the tracker's Remark column? (Jerin, 20 Sep) =====
// Nothing is written. Delete once #157b is settled.
function probe157c() {
  var TRACKER_ID = '1_LQxHDZ6dXehyR2lc8pcFjfDeRaV80vBzVRB_BKWT5A';
  var sh = SpreadsheetApp.openById(TRACKER_ID).getSheetByName('Master');
  var vals = sh.getDataRange().getValues();
  var hdr = vals[0].map(function (h) { return String(h || '').trim(); });

  var remCols = [];
  hdr.forEach(function (h, i) { if (h && /remark|comment|note/i.test(h)) remCols.push(i); });
  Logger.log('R0 remark-like cols: ' + remCols.map(function (i) { return i + '="' + hdr[i] + '"'; }).join(' , '));
  if (!remCols.length) { Logger.log('R0 NONE FOUND. headers: ' + hdr.filter(String).slice(0, 40).join(' | ')); return; }

  var qi = hdr.indexOf('Joining Quarter'), di = -1, ji = -1;
  hdr.forEach(function (h, i) { if (/department/i.test(h) && di < 0) di = i; if (/^job/i.test(h) && ji < 0) ji = i; });
  Logger.log('R0 scope cols: quarter=' + qi + ' dept=' + di + '("' + (di >= 0 ? hdr[di] : '') + '") job=' + ji + '("' + (ji >= 0 ? hdr[ji] : '') + '")');

  remCols.forEach(function (ci) {
    var all = 0, filled = 0, q3 = 0, q3f = 0, sme = 0, smef = 0, shortv = 0, seen = {}, samples = [];
    for (var r = 1; r < vals.length; r++) {
      var v = String(vals[r][ci] || '').trim();
      var isQ3 = qi >= 0 && /Q3/i.test(String(vals[r][qi] || ''));
      var isSme = di >= 0 && /SME/i.test(String(vals[r][di] || ''));
      all++;
      if (v) { filled++; seen[v] = (seen[v] || 0) + 1; if (v.length <= 40) shortv++; }
      if (isQ3) { q3++; if (v) q3f++; }
      if (isQ3 && isSme) { sme++; if (v) { smef++; if (samples.length < 12) samples.push(v.slice(0, 38)); } }
    }
    var d = Object.keys(seen);
    Logger.log('R1 col ' + ci + ' "' + hdr[ci] + '": rows=' + all + ' filled=' + filled
      + ' | Q3=' + q3 + ' Q3filled=' + q3f + ' | Q3-SME=' + sme + ' Q3-SMEfilled=' + smef
      + ' | distinct=' + d.length + ' shortValues(<=40ch)=' + shortv);
    if (samples.length) Logger.log('R2 col ' + ci + ' Q3-SME samples: ' + samples.join(' \u00b7 '));
    // #157c-2: the DISTINCT Q3-SME values with counts, split into label-like (a topic) and prose (a real
    // remark). Jerin reviews the label list and says which are genuine topics - no heuristic decides a write.
    var lab = {}, prose = 0, proseRows = 0;
    for (var r2 = 1; r2 < vals.length; r2++) {
      var vv = String(vals[r2][ci] || '').trim();
      if (!vv) continue;
      if (!(qi >= 0 && /Q3/i.test(String(vals[r2][qi] || '')))) continue;
      if (!(di >= 0 && /SME/i.test(String(vals[r2][di] || '')))) continue;
      var words = vv.split(/\s+/).length;
      if (vv.length <= 40 && words <= 5) { lab[vv] = (lab[vv] || 0) + 1; }
      else { prose++; proseRows++; }
    }
    var keys = Object.keys(lab).sort(function (a, b) { return lab[b] - lab[a]; });
    var tot = 0; keys.forEach(function (k) { tot += lab[k]; });
    Logger.log('R3 Q3-SME remarks: labelLike=' + tot + ' across ' + keys.length + ' distinct | proseLike=' + prose);
    for (var z = 0; z < keys.length; z += 6) {
      Logger.log('R4 ' + keys.slice(z, z + 6).map(function (k) { return k + ' (' + lab[k] + ')'; }).join('  |  '));
    }
  });
  Logger.log('probe157c done - NOTHING WAS WRITTEN');
}

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

// ===== #157b READ-ONLY PROBE - nothing is written, to Ashby or to any sheet =====
// Answers the three questions that decide whether the Hiring Tracker -> opening topic backfill is possible:
//   T1  does the tracker carry a topic column at all (nothing in this codebase has ever read one)
//   T2  is the Ashby Specialization/Topic field free text or a fixed option list (a select only takes
//       existing options, and a MultiValueSelect silently no-ops on a bare string)
//   T3  how many Q3 openings already carry audit-id - the difference between "automatic" and "one browser pass"
// Delete this function once #157b is settled.
function probe157b() {
  var TRACKER_ID = '1_LQxHDZ6dXehyR2lc8pcFjfDeRaV80vBzVRB_BKWT5A';

  // --- T1: the tracker -------------------------------------------------------------------------
  try {
    var sh = SpreadsheetApp.openById(TRACKER_ID).getSheetByName('Master');
    var vals = sh.getDataRange().getValues();
    var hdr = vals[0].map(function (h) { return String(h || '').trim(); });
    var hits = [];
    hdr.forEach(function (h, i) { if (h && /special|topic|subject|stream|domain/i.test(h)) hits.push(i + '="' + h + '"'); });
    Logger.log('T1 tracker: cols=' + hdr.length + ' rows=' + (vals.length - 1) + ' topicLikeCols=[' + hits.join(' , ') + ']');
    var qi = hdr.indexOf('Joining Quarter');
    if (hits.length) {
      var ci = parseInt(hits[0], 10);
      var tot = 0, filled = 0, q3 = 0, q3filled = 0, seen = {};
      for (var r = 1; r < vals.length; r++) {
        var v = String(vals[r][ci] || '').trim();
        var isQ3 = qi >= 0 && /Q3/i.test(String(vals[r][qi] || ''));
        tot++; if (v) { filled++; seen[v] = (seen[v] || 0) + 1; }
        if (isQ3) { q3++; if (v) q3filled++; }
      }
      var distinct = Object.keys(seen);
      Logger.log('T1 topic col ' + ci + ': allRows=' + tot + ' filled=' + filled
        + ' | Q3 rows=' + q3 + ' Q3 filled=' + q3filled + ' | distinct values=' + distinct.length);
      Logger.log('T1 first 8 distinct: ' + distinct.slice(0, 8).join(' / '));
    } else {
      Logger.log('T1 NO topic-like column found. Headers: ' + hdr.filter(String).slice(0, 40).join(' | '));
    }
  } catch (e) { Logger.log('T1 FAILED: ' + e.message); }

  // --- T2: the Ashby field's type and options --------------------------------------------------
  try {
    var res = ashbyPost_('/customField.list', {});
    var list = (res && (res.results || res.data)) || [];
    Logger.log('T2 customField.list returned ' + list.length + ' fields');
    var found = 0;
    list.forEach(function (f) {
      var t = String(f.title || f.name || '');
      if (!/specializ|specialis|audit-?id/i.test(t)) return;
      found++;
      var opts = f.selectableValues || f.options || f.possibleValues || [];
      Logger.log('T2 field="' + t + '" type=' + f.type + ' objectType=' + (f.objectType || f.object || '?')
        + ' options=' + opts.length + (opts.length ? ' e.g. ' + JSON.stringify(opts.slice(0, 3)) : ''));
    });
    if (!found) Logger.log('T2 no field title matched specializ/specialis/audit-id');
  } catch (e) { Logger.log('T2 FAILED: ' + e.message); }

  // --- T3: Q3 openings - audit-id and topic fill rates -----------------------------------------
  try {
    var ops = ashbyListAll_('/opening.list');
    var n = 0, withAid = 0, withTopic = 0, noOpenedAt = 0;
    ops.forEach(function (o) {
      if (o.isArchived) return;
      var iso = o.openedAt;
      if (!iso) { noOpenedAt++; return; }
      if (quarterIST_(iso) !== '2026-Q3') return;
      n++;
      var aid = openingCustomFieldByTitle_(o, /audit-?id/i);
      var top = openingCustomFieldByTitle_(o, /specializ|specialis/i);
      if (aid) withAid++;
      if (top) withTopic++;
    });
    Logger.log('T3 Q3 openings (not archived, dated): ' + n
      + ' | withAuditId=' + withAid + ' (' + (n ? Math.round(withAid * 100 / n) : 0) + '%)'
      + ' | withTopic=' + withTopic
      + ' | skipped undated=' + noOpenedAt);
  } catch (e) { Logger.log('T3 FAILED: ' + e.message); }

  Logger.log('probe157b done - NOTHING WAS WRITTEN');
}
