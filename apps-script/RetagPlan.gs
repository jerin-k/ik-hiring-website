// ============================================================================================
// RetagPlan.gs - STEP 1 of the Ashby recruiter re-tag: THE DRY RUN.
//
// 🚨 READ-ONLY AGAINST ASHBY. This file contains no write endpoint and must never gain one -
// the write step lives in its own file so that opening this one cannot fire a write.
// buildRetagPlan() is deliberately the FIRST function here: the run selector picks the first
// function of whichever file is open, and misfiring this one costs a few minutes and nothing else.
//
// What it does:
//   1. Rebuilds the in-scope tracker rows with the SAME rules as buildAuditV2 (2026 + Joined /
//      Joining Pending / Dropped - Offer), so the plan cannot drift from the audit tab.
//   2. Reads the LIVE hiring team of every in-scope application via application.info, rather than
//      trusting offer_contacts.json - that file is derived from the data the 31 Aug job-level
//      removal wiped, so it under-reports who Ashby actually holds today.
//   3. Resolves each tracker recruiter name to a real Ashby user from user.list (NOT dashboard.json,
//      which is derived from the wiped hiring-team data).
//   4. Writes the plan to its own tab and the reversal snapshot to Drive.
//
// Touches NOTHING else in the audit sheet: not `Tracker Candidates` (the team's working tab) and
// not `Tracker Candidates v2`. Writes one new tab, RETAG_TAB, replacing its contents each run.
//
// ⚠ PII: the plan tab carries candidate emails, exactly as the audit sheet already does. The Drive
// snapshot deliberately carries NO email - ids and names only. Neither ever goes to GitHub.
// ============================================================================================

var RETAG_TAB = 'Recruiter Re-tag Plan';
var RETAG_SNAPSHOT = 'retag_snapshot.json';

function buildRetagPlan() {
  var TRACKER_ID = '1_LQxHDZ6dXehyR2lc8pcFjfDeRaV80vBzVRB_BKWT5A';
  var t0 = new Date().getTime();
  var TZ = 'UTC';

  function d2s(v) {
    if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
    var s = String(v == null ? '' : v).trim();
    return s;
  }
  function nrm(e) { return String(e || '').replace(/\s+/g, '').toLowerCase(); }
  function okEmail(e) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e); }

  // ---- the SAME fuzzy person-name match buildAuditV2 uses. Single letters dropped, then one
  // name's words must all appear in the other's; a single-word value must match the FIRST name,
  // so a lone "Singh" never matches "Aditya Singh". ----
  function nameTokens(s) {
    var t = String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/), o = [];
    for (var i = 0; i < t.length; i++) if (t[i] && t[i].length > 1) o.push(t[i]);
    return o;
  }
  function nameMatch(a, b) {
    var x = nameTokens(a), y = nameTokens(b);
    if (!x.length || !y.length) return false;
    var s = x.length <= y.length ? x : y, l = x.length <= y.length ? y : x, i;
    if (s.length === 1) return s[0] === l[0];
    for (i = 0; i < s.length; i++) {
      var hit = false;
      for (var j = 0; j < l.length; j++) if (l[j] === s[i]) { hit = true; break; }
      if (!hit) return false;
    }
    return true;
  }

  // ---- 1. tracker, identical scope rules to buildAuditV2 ----
  var trackerSS = SpreadsheetApp.openById(TRACKER_ID);
  TZ = trackerSS.getSpreadsheetTimeZone() || 'UTC';
  var vals = trackerSS.getSheetByName('Master').getDataRange().getValues();
  var hdr = vals[0];
  function col(n) { for (var i = 0; i < hdr.length; i++) if (String(hdr[i]).trim() === n) return i; return -1; }
  var C = { date: col('Date'), jcq: col('Job Creation Quarter'), status: col('Overall Status'),
            job: col('Job Name'), rec: col('Recruiter'), name: col('Candidate Name'), email: col('Personal Email') };
  for (var k in C) if (C[k] < 0) throw new Error('Tracker column not found: ' + k);

  var KEEP = { 'Joined': 1, 'Joining Pending': 1, 'Dropped - Offer': 1 };
  var trk = [], r;
  for (r = 1; r < vals.length; r++) {
    var row = vals[r], nm = String(row[C.name] || '').trim();
    if (!nm) continue;
    var stat = String(row[C.status] || '').trim();
    var jcq = String(row[C.jcq] || '').trim(), od = d2s(row[C.date]);
    var is26 = (jcq.indexOf('2026') > -1) || (od.substring(0, 4) === '2026');
    if (!is26 || !KEEP[stat]) continue;
    trk.push({ email: nrm(row[C.email]), name: nm, job: String(row[C.job] || '').trim(),
               rec: String(row[C.rec] || '').trim(), status: stat });
  }
  Logger.log('plan | tracker rows in scope: ' + trk.length);

  // ---- 2. Ashby offer rows per email (the application ids we will act on) ----
  var it = DriveApp.getFilesByName('offer_contacts.json');
  if (!it.hasNext()) throw new Error('offer_contacts.json not found in Drive - run refreshDashboardData first');
  var ashRows = JSON.parse(it.next().getBlob().getDataAsString()).rows;
  var byEmail = {}, i;
  for (i = 0; i < ashRows.length; i++) {
    var e2 = nrm(ashRows[i].email);
    if (!okEmail(e2)) continue;
    if (!byEmail[e2]) byEmail[e2] = [];
    byEmail[e2].push(ashRows[i]);
  }
  Logger.log('plan | Ashby offer rows: ' + ashRows.length + ' | distinct emails: ' + Object.keys(byEmail).length);

  // ---- 3. user.list - the ONLY acceptable source for name -> userId ----
  var users = [], disabled = 0;
  ashbyListAll_('/user.list').forEach(function (u) {
    var n = ((u.firstName || '') + ' ' + (u.lastName || '')).trim();
    if (!n) return;
    if (u.isEnabled === false) disabled++;
    users.push({ id: u.id, name: n, enabled: u.isEnabled !== false });
  });
  Logger.log('plan | user.list: ' + users.length + ' users (' + disabled + ' disabled)');

  // "Bullseye" in the tracker is an AGENCY, not a person: Jerin's rule is recruiter Aditya Singh
  // plus the existing Agencies / Bulls Eye source.
  // ⚠ Bulls Eye (8 applications) is NOT Black Bull (489) - different agencies, do not conflate.
  var BULLS_EYE_RE = /bull\s*'?s?\s*eye/i;
  var BULLS_EYE_SOURCE = 'Bulls Eye';
  var BULLS_EYE_RECRUITER = 'Aditya Singh';

  var resolveCache = {};
  function resolveUser(nameRaw) {
    var key = String(nameRaw || '').toLowerCase();
    if (resolveCache[key]) return resolveCache[key];
    var out = { user: null, why: '' };
    if (!nameRaw) { out.why = 'blocked - the tracker names no recruiter'; resolveCache[key] = out; return out; }
    var hits = [], j;
    for (j = 0; j < users.length; j++) if (nameMatch(nameRaw, users[j].name)) hits.push(users[j]);
    if (!hits.length) out.why = 'blocked - no Ashby user matches "' + nameRaw + '"';
    else if (hits.length > 1) {
      var nmz = [];
      for (j = 0; j < hits.length; j++) nmz.push(hits[j].name);
      out.why = 'blocked - "' + nameRaw + '" matches ' + hits.length + ' Ashby users: ' + nmz.join(', ');
    } else {
      out.user = hits[0];
      if (!hits[0].enabled) out.why = 'review - the Ashby user "' + hits[0].name + '" is disabled';
    }
    resolveCache[key] = out;
    return out;
  }

  // ---- 4. live hiring team + source, per application ----
  var infoCalls = 0, infoErr = 0, snapshot = {};
  function liveInfo(appId) {
    infoCalls++;
    try {
      var res = ashbyPost_('/application.info', { applicationId: appId });
      var app = (res && res.results) || null;
      if (!app) { infoErr++; return null; }
      var roles = getHiringTeamRoles_(app);
      var src = app.source || null;
      var st = src && src.sourceType ? (src.sourceType.title || src.sourceType) : null;
      if (typeof st === 'object') st = null;
      return { recruiters: roles.recruiters, sourcers: roles.sourcers,
               srcType: st || '', srcName: (src && typeof src.title === 'string' && src.title) ? src.title : '' };
    } catch (e) { infoErr++; Logger.log('plan | application.info failed for ' + appId + ': ' + e.message); return null; }
  }

  // ---- 5. build one plan row per APPLICATION we would write to ----
  // Jerin's rule for the candidates holding two Ashby applications is TAG BOTH, so every application
  // of an in-scope candidate is planned - each judged on its own live hiring team, which is what lets
  // an already-correct one fall out as "already correct" rather than a write.
  var head = ['Personal Email (match key)', 'Candidate', 'Job (Ashby)', 'Ashby application id',
              'Applications for this candidate', 'Tracker recruiter', 'Ashby recruiter(s) NOW (live)',
              'Ashby recruiter at last refresh', 'Resolved Ashby user', 'Resolved user id',
              'Action', 'Remove', 'Add', 'Source now', 'Source action', 'Note'];
  var rows = [], counts = { add: 0, remove_add: 0, ok: 0, blocked: 0, review: 0, srcSet: 0, viaHiringTeamId: 0, excluded: 0 };
  var noAshby = 0, matchedRows = 0;

  // 5a. FETCH PASS - every application's live state once, before any decision is taken.
  var work = [], a;
  for (i = 0; i < trk.length; i++) {
    var tr0 = trk[i];
    var list0 = byEmail[tr0.email] || [];
    if (!list0.length) { noAshby++; continue; }
    matchedRows++;
    for (a = 0; a < list0.length; a++) work.push({ tr: tr0, rec: list0[a], n: list0.length, idx: a });
  }
  var liveBy = {}, liveUserByName = {}, w;
  for (w = 0; w < work.length; w++) {
    var aid = work[w].rec.applicationId || '';
    if (!aid || liveBy[aid] !== undefined) continue;
    var lv0 = liveInfo(aid);
    liveBy[aid] = lv0;
    if (!lv0) continue;
    snapshot[aid] = { candidate: work[w].rec.candidate || '', job: work[w].rec.jobTitle || '',
                      recruiters: lv0.recruiters, sourcers: lv0.sourcers,
                      srcType: lv0.srcType, srcName: lv0.srcName };
    // Every hiring-team member is a real Ashby user, so this records ids for people user.list does not
    // return. Used ONLY to explain a block - never to resolve a name behind Jerin's back.
    for (var q = 0; q < lv0.recruiters.length; q++) {
      var rr0 = lv0.recruiters[q];
      if (rr0.name && rr0.userId && !liveUserByName[rr0.name]) liveUserByName[rr0.name] = rr0.userId;
    }
  }
  Logger.log('plan | distinct applications fetched: ' + Object.keys(liveBy).length +
             ' | recruiter names seen in live hiring teams: ' + Object.keys(liveUserByName).length);

  // An application reached by MORE THAN ONE tracker row is left alone.
  // 🚨 Jerin, 1 Sep: "Dont act on those - just give me the names & we will take care of it manually."
  // Three candidates (Abhishek Jha, Karuna Tomar, Manikanta P) each sit on two tracker rows, and for two
  // of them those rows name DIFFERENT recruiters - so whichever row was written last would decide the
  // answer. Excluding them is what stops the write order from silently picking a winner.
  var appCount = {}, wq;
  for (wq = 0; wq < work.length; wq++) {
    var idq = work[wq].rec.applicationId || '';
    if (idq) appCount[idq] = (appCount[idq] || 0) + 1;
  }

  // 5b. DECIDE PASS.
  // 🚨 ORDER MATTERS. "Ashby already holds the right person" is settled BEFORE "can this name be
  // resolved to a user id", because an already-correct row needs no id - it needs no write at all.
  // The first cut of this had the two the other way round and reported 178 already-correct rows as
  // blocked, purely because their recruiter is absent from user.list.
  function liveIdFor(nameRaw) {
    for (var nm2 in liveUserByName) if (nameMatch(nameRaw, nm2)) return { name: nm2, id: liveUserByName[nm2] };
    return null;
  }

  for (w = 0; w < work.length; w++) {
    var tr = work[w].tr, rec0 = work[w].rec, appId = rec0.applicationId || '';
    var live = appId ? liveBy[appId] : null;
    var wantName = BULLS_EYE_RE.test(tr.rec) ? BULLS_EYE_RECRUITER : tr.rec;
    var isBullsEye = BULLS_EYE_RE.test(tr.rec);
    var res = resolveUser(wantName);

    var liveRecs = (live && live.recruiters) || [];
    var liveNames = [], b;
    for (b = 0; b < liveRecs.length; b++) liveNames.push(liveRecs[b].name);

    var action = '', remove = '', add = '', note = '';
    var already = false;
    for (b = 0; b < liveNames.length; b++) if (nameMatch(wantName, liveNames[b])) already = true;

    // The user to add. user.list first; if it does not hold the name, fall back to the id this person
    // carries as a Recruiter on other live applications.
    // 🚨 Jerin, 1 Sep: "Use that ID." user.list returns ACTIVE accounts only (451 users, 0 disabled), so
    // seven recruiters the tracker names - Sanghamitra Moulik, Tabitha Anceline E, Ankita Kabra, Smriti
    // Das, Deepti Leslie, Neha Pattar, Navya - are absent from it while still being real Ashby users.
    // The hiring-team id is live Ashby data, not the wiped derived file, so it is safe to use.
    var eff = res.user, idFrom = '';
    if (!eff) {
      var alt = liveIdFor(wantName);
      if (alt) { eff = { name: alt.name, id: alt.id }; idFrom = 'id taken from a live hiring team, not user.list - probably a deactivated account (Jerin approved 1 Sep)'; }
    }

    if (!appId)                 { action = 'blocked'; note = 'no Ashby application id on the offer record'; }
    else if (!live)             { action = 'blocked'; note = 'application.info did not return this application'; }
    else if (already && liveNames.length === 1) { action = 'already correct'; }
    else if (appCount[appId] > 1) {
      action = 'excluded - manual';
      note = 'this application is reached by more than one tracker row; Jerin is resolving these by hand';
    }
    else if (already && liveNames.length > 1) {
      action = 'remove + add';
      var extra = [];
      for (b = 0; b < liveRecs.length; b++) if (!nameMatch(wantName, liveRecs[b].name)) extra.push(liveRecs[b].name + ' [' + (liveRecs[b].userId || '?') + ']');
      remove = extra.join(' | ');
      add = '(already tagged - only the extra names come off)';
      note = 'Ashby holds more than one Recruiter; the tracker name stays, the others come off';
    }
    else if (!eff) { action = 'blocked'; note = res.why + ' - and no live hiring team carries that name either'; }
    else if (!liveNames.length) {
      action = 'add';
      add = eff.name + ' [' + eff.id + ']';
    }
    else {
      action = 'remove + add';
      var rm = [];
      for (b = 0; b < liveRecs.length; b++) rm.push(liveRecs[b].name + ' [' + (liveRecs[b].userId || '?') + ']');
      remove = rm.join(' | ');
      add = eff.name + ' [' + eff.id + ']';
    }
    if (idFrom && (action === 'add' || action === 'remove + add')) { counts.viaHiringTeamId++; note = note ? note + '; ' + idFrom : idFrom; }
    if (res.why && res.user) { note = note ? note + '; ' + res.why : res.why; counts.review++; }

    // source, Bulls Eye rows only
    var srcNow = live ? ((live.srcType || '?') + ' / ' + (live.srcName || '(none)')) : '';
    var srcAction = '';
    if (isBullsEye && live) {
      if (String(live.srcName || '').toLowerCase() === BULLS_EYE_SOURCE.toLowerCase()) srcAction = 'already correct';
      else { srcAction = 'set source to Agencies / ' + BULLS_EYE_SOURCE; counts.srcSet++; }
    }

    if (action === 'add') counts.add++;
    else if (action === 'remove + add') counts.remove_add++;
    else if (action === 'already correct') counts.ok++;
    else if (action === 'blocked') counts.blocked++;
    else if (action === 'excluded - manual') counts.excluded++;

    rows.push([tr.email, rec0.candidate || tr.name, rec0.jobTitle || '', appId,
               (work[w].idx + 1) + ' of ' + work[w].n, tr.rec, liveNames.join(' + '), rec0.recruiter || '',
               eff ? eff.name : '', eff ? eff.id : '',
               action, remove, add, srcNow, srcAction, note]);
  }

  Logger.log('plan | tracker rows with an Ashby record: ' + matchedRows + ' | without: ' + noAshby);
  Logger.log('plan | application.info calls: ' + infoCalls + ' (' + infoErr + ' failed)');
  Logger.log('plan | ACTIONS  add: ' + counts.add + ' | remove + add: ' + counts.remove_add +
             ' | already correct: ' + counts.ok + ' | blocked: ' + counts.blocked +
             ' | excluded for manual handling: ' + counts.excluded +
             ' | source to set: ' + counts.srcSet +
             ' | writes using a hiring-team id (not in user.list): ' + counts.viaHiringTeamId);

  // ---- 6. write the plan tab, and the reversal snapshot ----
  var out = SpreadsheetApp.openById(AUDIT_SHEET_ID);
  var sh = out.getSheetByName(RETAG_TAB);
  if (!sh) sh = out.insertSheet(RETAG_TAB);
  sh.clear();
  var all = [head].concat(rows);
  sh.getRange(1, 1, all.length, head.length).setValues(all);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, head.length).setFontWeight('bold');
  sh.autoResizeColumns(1, head.length);

  saveDriveJson_(RETAG_SNAPSHOT, {
    generatedAt: new Date().toISOString(),
    note: 'PRE-WRITE SNAPSHOT of the live Ashby hiring team + source for every application in the ' +
          'recruiter re-tag scope. Drive only - never push to GitHub. Use this to reverse a write.',
    applications: snapshot });

  Logger.log('plan | wrote ' + rows.length + ' rows to "' + RETAG_TAB + '" and ' +
             Object.keys(snapshot).length + ' applications to ' + RETAG_SNAPSHOT +
             ' | ' + Math.round((new Date().getTime() - t0) / 1000) + 's');
  Logger.log('plan | NOTHING was written to Ashby.');
}

// ============================================================================================
// JOB-FIRST GAP REPORT  ->  tab "Job Gaps"
//
// Employment Type, Level, Complexity and Job Name are properties of the JOB, not the candidate,
// so 118 / 227 / 26 / 64 candidate-row mismatches collapse to 20 / 43 / 16 / 15 JOBS. Fixing the
// job once clears every candidate under it. This tab is the validation list for the team; once
// they fill the CORRECT columns it becomes the input for an API fix.
//
// Reads ONLY the "Tracker Candidates v2" tab plus dashboard.json from Drive for job ids.
// Makes NO Ashby calls and writes NO other tab.
// Re-runnable: anything the team has typed into the CORRECT / Notes columns is carried across,
// keyed on the Ashby job name.
// ============================================================================================
var JOBGAP_TAB = 'Job Gaps';

function buildJobGapReport() {
  var out = SpreadsheetApp.openById(AUDIT_SHEET_ID);
  var src = out.getSheetByName(AUDIT_V2_TAB);
  if (!src) throw new Error('"' + AUDIT_V2_TAB + '" not found - run runAuditV2Once() first');
  var vals = src.getDataRange().getValues(), H = vals[0], i, r;

  // The v2 tab is laid out as: email, then repeating [field, field - Ashby, Match?, Result].
  function colOf(n) { for (var k = 1; k + 2 < H.length; k += 4) if (String(H[k]).trim() === n) return k; return -1; }
  var C = { job: colOf('Job Name'), emp: colOf('Employment Type'),
            lvl: colOf('Level'), cx: colOf('Complexity') };
  for (var key in C) if (C[key] < 0) throw new Error('v2 column not found: ' + key);

  // job id + department, by title, from dashboard.json
  var meta = {};
  try {
    var dash = loadDriveJson_('dashboard.json');
    (dash.jobs || []).forEach(function (j) {
      if (j && j.title && !meta[j.title]) meta[j.title] = { id: j.id || '', dept: j.department || '' };
    });
  } catch (e) { Logger.log('jobgap | dashboard.json unreadable, no job ids: ' + e.message); }

  var FIELDS = [['emp', 'Employment Type'], ['lvl', 'Level'], ['cx', 'Complexity'], ['job', 'Job Name']];
  var jobs = {}, skipped = 0;
  for (r = 1; r < vals.length; r++) {
    var aj = String(vals[r][C.job + 1] || '').trim();
    if (!aj) { skipped++; continue; }                    // candidate not in Ashby at all
    if (!jobs[aj]) jobs[aj] = { n: 0, ash: {}, trk: {}, gap: {} };
    var J = jobs[aj];
    J.n++;
    for (i = 0; i < FIELDS.length; i++) {
      var k = C[FIELDS[i][0]], f = FIELDS[i][0];
      var av = String(vals[r][k + 1] || '').trim() || '(blank)';
      var tv = String(vals[r][k] || '').trim() || '(blank)';
      J.ash[f] = J.ash[f] || {}; J.ash[f][av] = (J.ash[f][av] || 0) + 1;
      if (String(vals[r][k + 2] || '').trim() !== 'No') continue;
      J.gap[f] = (J.gap[f] || 0) + 1;
      J.trk[f] = J.trk[f] || {}; J.trk[f][tv] = (J.trk[f][tv] || 0) + 1;
    }
  }

  // "a > b (12)" style, biggest first, so one glance shows the dominant disagreement
  function fmt(m) {
    if (!m) return '';
    return Object.keys(m).sort(function (a, b) { return m[b] - m[a]; })
      .map(function (v) { return v + ' (' + m[v] + ')'; }).join(' | ');
  }
  function dominant(m) {
    if (!m) return '';
    var best = '', n = -1;
    for (var v in m) if (m[v] > n) { n = m[v]; best = v; }
    return best;
  }

  // carry the team's own columns across a rebuild
  var prior = {};
  var old = out.getSheetByName(JOBGAP_TAB);
  if (old) {
    var ov = old.getDataRange().getValues(), oh = ov[0] || [];
    var oj = oh.indexOf('Job (Ashby)');
    var keep = ['CORRECT Employment Type', 'CORRECT Level', 'CORRECT Complexity', 'CORRECT Job Name', 'Notes / validated by'];
    if (oj >= 0) {
      for (r = 1; r < ov.length; r++) {
        var kj = String(ov[r][oj] || '').trim(); if (!kj) continue;
        keep.forEach(function (h) {
          var ci = oh.indexOf(h); if (ci < 0) return;
          var v = String(ov[r][ci] == null ? '' : ov[r][ci]).trim();
          if (v) { prior[kj] = prior[kj] || {}; prior[kj][h] = v; }
        });
      }
    }
  }

  var head = ['Job (Ashby)', 'Job ID', 'Department', 'Candidates in scope', 'Gap rows (total)',
              'Employment Type - Ashby', 'Employment Type - Tracker says', 'Emp Type gap rows',
              'Level - Ashby', 'Level - Tracker says', 'Level gap rows',
              'Complexity - Ashby', 'Complexity - Tracker says', 'Complexity gap rows',
              'Job name(s) used in tracker', 'Job name gap rows',
              'CORRECT Employment Type', 'CORRECT Level', 'CORRECT Complexity', 'CORRECT Job Name',
              'Notes / validated by'];
  var rows = [];
  Object.keys(jobs).forEach(function (j) {
    var J = jobs[j], m = meta[j] || { id: '', dept: '' };
    var tot = (J.gap.emp || 0) + (J.gap.lvl || 0) + (J.gap.cx || 0) + (J.gap.job || 0);
    var p = prior[j] || {};
    rows.push([j, m.id, m.dept, J.n, tot,
      dominant(J.ash.emp), fmt(J.trk.emp), J.gap.emp || 0,
      dominant(J.ash.lvl), fmt(J.trk.lvl), J.gap.lvl || 0,
      dominant(J.ash.cx), fmt(J.trk.cx), J.gap.cx || 0,
      fmt(J.trk.job), J.gap.job || 0,
      p['CORRECT Employment Type'] || '', p['CORRECT Level'] || '',
      p['CORRECT Complexity'] || '', p['CORRECT Job Name'] || '', p['Notes / validated by'] || '']);
  });
  rows.sort(function (a, b) { return (b[4] - a[4]) || (b[3] - a[3]); });   // worst gaps first

  var sh = out.getSheetByName(JOBGAP_TAB);
  if (!sh) sh = out.insertSheet(JOBGAP_TAB);
  sh.clear();
  var all = [head].concat(rows);
  sh.getRange(1, 1, all.length, head.length).setValues(all);
  sh.setFrozenRows(1);
  sh.setFrozenColumns(1);
  sh.getRange(1, 1, 1, head.length).setFontWeight('bold');
  sh.autoResizeColumns(1, head.length);

  var withGap = 0, jg = { emp: 0, lvl: 0, cx: 0, job: 0 };
  rows.forEach(function (x) { if (x[4] > 0) withGap++;
    if (x[7] > 0) jg.emp++; if (x[10] > 0) jg.lvl++; if (x[13] > 0) jg.cx++; if (x[15] > 0) jg.job++; });
  Logger.log('jobgap | jobs: ' + rows.length + ' | with at least one gap: ' + withGap +
             ' | candidate rows not in Ashby (excluded): ' + skipped);
  Logger.log('jobgap | jobs affected - Employment Type ' + jg.emp + ' | Level ' + jg.lvl +
             ' | Complexity ' + jg.cx + ' | Job Name ' + jg.job);
  Logger.log('jobgap | carried over ' + Object.keys(prior).length + ' job(s) of team-entered values');
  Logger.log('jobgap | wrote tab "' + JOBGAP_TAB + '". No Ashby calls, no other tab touched.');
}
