// ===== Hiring audit: Tracker vs Ashby, built as a native Google Sheet =====
// Reads the Hiring Tracker (a Google Sheet in Drive) + offer_contacts.json (Drive-only, has the emails)
// and writes a fresh audit spreadsheet. Candidates are joined on PERSONAL EMAIL - both sides carry it on
// 100% of the rows in scope, and names disagree constantly (middle names, order flips).
// Scope: 2026 OPENINGS only, statuses Joined / Joining Pending / Dropped - Offer.
// The sheet is REUSED, never recreated. SpreadsheetApp.create() made a NEW file on every run, so the folder
// ended up with two identically-named audits nine minutes apart and the link already sent to the team went
// stale the moment anyone rebuilt. Rebuilding now clears this spreadsheet in place, so the URL is permanent.
var AUDIT_SHEET_ID = '1U6Wi5uXLZ8hOhGKP2tyH--jHcEbUEvXgAPxbkUofTNA';

function buildAuditSheet() {
  var TRACKER_ID = '1_LQxHDZ6dXehyR2lc8pcFjfDeRaV80vBzVRB_BKWT5A';
  var FOLDER_ID  = '1z6tU6QhZQ_50V7oyqlprwpl8kpS4LHmI';
  var MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  // 🚨 Was 'UTC'. Google Sheets stores a date as midnight in the SPREADSHEET's timezone, so formatting an
  // IST sheet's date in UTC lands on the previous day: 2026-01-27 00:00 IST is 2026-01-26 18:30 UTC. Every
  // tracker date came out one day early, which made DOJ, DOJ Month, DOJ Quarter, Offer Date and Offer
  // Quarter read No on rows that actually agree. Set from the tracker itself once it is open.
  var TZ = 'UTC';

  function d2s(v) {
    if (!v) return '';
    if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
    return String(v).trim();
  }
  function mth(s) { return (s && s.length >= 7) ? MON[parseInt(s.substring(5,7),10)-1] + '-' + s.substring(0,4) : ''; }
  function qtr(s) { return (s && s.length >= 7) ? 'Q' + (Math.floor((parseInt(s.substring(5,7),10)-1)/3)+1) + ' ' + s.substring(0,4) : ''; }
  function qc(a)  { return a ? 'Q' + a.charAt(a.length-1) + ' ' + a.substring(0,4) : ''; }
  function nrm(e) { return String(e || '').replace(/\s+/g,'').toLowerCase(); }
  function okEmail(e) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e); }
  function words(s) {
    var t = String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/), o = {};
    for (var i=0;i<t.length;i++) if (t[i]) o[t[i]] = 1;
    return o;
  }
  function roleOk(a, b) {
    var x = words(a), y = words(b), kx = Object.keys(x), ky = Object.keys(y), n = 0, i;
    if (!kx.length || !ky.length) return false;
    for (i=0;i<kx.length;i++) if (y[kx[i]]) n++;
    return n >= 2 || n === kx.length || n === ky.length;
  }
  var eq = function (a, b) { return String(a).trim().toLowerCase() === String(b).trim().toLowerCase() ? 'Yes' : 'No'; };

  // ---- 1. tracker ----
  var trackerSS = SpreadsheetApp.openById(TRACKER_ID);
  TZ = trackerSS.getSpreadsheetTimeZone() || 'UTC';
  var vals = trackerSS.getSheetByName('Master').getDataRange().getValues();
  Logger.log('tracker timezone: ' + TZ);
  var hdr = vals[0];
  function col(n) { for (var i=0;i<hdr.length;i++) if (String(hdr[i]).trim() === n) return i; return -1; }
  // Employment Type / Level / Complexity are newer tracker columns and their exact heading is not guaranteed.
  // colAny tries each spelling and returns -1 if none match, so the audit renders a blank cell instead of
  // throwing and taking the whole rebuild down.
  function colAny(list) { for (var i=0;i<list.length;i++) { var c = col(list[i]); if (c >= 0) return c; } return -1; }
  function at(row, idx) { return idx >= 0 ? String(row[idx] == null ? '' : row[idx]).trim() : ''; }
  var C = { date:col('Date'), jcq:col('Job Creation Quarter'), status:col('Overall Status'), dept:col('Department'),
            job:col('Job Name'), rec:col('Recruiter'), name:col('Candidate Name'), email:col('Personal Email'),
            offer:col('Date of Offer'), doj:col('DOJ'), jm:col('Joining Month'), jq:col('Joining Quarter'),
            emp:colAny(['Employment Type','Employment type','Emp Type','Type of Employment']),
            lvl:colAny(['Level','Job Level','Grade']),
            cx:colAny(['Complexity','Role Complexity','Job Complexity']) };
  for (var k in C) if (C[k] < 0) throw new Error('Tracker column not found: ' + k);

  var KEEP = { 'Joined':1, 'Joining Pending':1, 'Dropped - Offer':1 };
  var trk = [], allTrk = {};
  for (var r = 1; r < vals.length; r++) {
    var row = vals[r], nm = String(row[C.name] || '').trim();
    if (!nm) continue;
    var e = nrm(row[C.email]), stat = String(row[C.status] || '').trim(), dj = d2s(row[C.doj]);
    if (okEmail(e) && !allTrk[e]) allTrk[e] = { status: stat, doj: dj, jcq: String(row[C.jcq] || '').trim() };
    var jcq = String(row[C.jcq] || '').trim(), od = d2s(row[C.date]);
    var is26 = (jcq.indexOf('2026') > -1) || (od.substring(0,4) === '2026');
    if (!is26 || !KEEP[stat]) continue;
    trk.push({ email:e, name:nm, job:String(row[C.job]||'').trim(), opd:od, opq:jcq, doj:dj,
               rec:at(row,C.rec), emp:at(row,C.emp), lvl:at(row,C.lvl), cx:at(row,C.cx), offd:d2s(row[C.offer]),
               djm:String(row[C.jm]||'').trim() || mth(dj), djq:String(row[C.jq]||'').trim() || qtr(dj), status:stat });
  }

  // ---- 2. Ashby (Drive-only contacts file) ----
  var it = DriveApp.getFilesByName('offer_contacts.json');
  if (!it.hasNext()) throw new Error('offer_contacts.json not found in Drive - run refreshDashboardData first');
  var rows = JSON.parse(it.next().getBlob().getDataAsString()).rows;
  var ash = {};
  for (var i = 0; i < rows.length; i++) {
    var e2 = nrm(rows[i].email);
    if (okEmail(e2) && !ash[e2]) ash[e2] = rows[i];
  }
  // The free-text reason actually chosen when the application was archived, with who rejected whom. This is
  // the ONLY field that says why: offerStatus reads CandidateRejected even where the archive reason records
  // RejectedByOrg, and for the 19 in question the two flatly disagree.
  // The tracker's "Date of Offer" is the day the offer WENT OUT. Ashby's decidedAt is the day the candidate
  // ANSWERED - they coincide on only 7% of offers, typically 1-9 days apart, so matching on decidedAt made
  // this column read No on nearly every row. offerCreatedAt is the like-for-like field.
  function offerDateOf(o) { return (o && (o.offerCreatedAt || o.decidedAt)) || ''; }
  function reasonOf(o) {
    if (!o || !o.archiveReason) return '';
    return o.archiveReason + (o.archiveReasonType ? ' (' + o.archiveReasonType + ')' : '');
  }
  function aStat(o) {
    if (o.appStatus === 'Hired') return 'Joined';
    if (o.joiningPending) return 'Joining Pending';
    if (o.appStatus === 'Archived') return 'Dropped - Offer';
    return 'Offer Released';
  }
  function aQ(o) {
    if (o.openingQuarter) return [qc(o.openingQuarter), 'real opening'];
    if (o.attrQuarter)    return [qc(o.attrQuarter), 'attributed (stage entry)'];
    var dt = o.decidedAt || o.startDate || '';
    return dt ? [qtr(dt), 'from offer date'] : ['',''];
  }

  // ---- 3. Tab 1 ----
  var t1 = [['Personal Email (match key)','Candidate Name','Match?','Job Name','Match?','Opening Date','Match?',
             'Opening Quarter','Match?','DOJ','Match?','DOJ Month','Match?','DOJ Quarter','Match?','Status','Match?',
             'Recruiter','Match?','Employment Type','Match?','Level','Match?','Complexity','Match?',
             'Offer Date','Match?','Offer Quarter','Match?','What Ashby has (reference)','Ashby archive reason']];
  var used = {}, matched = 0;
  for (i = 0; i < trk.length; i++) {
    var t = trk[i], m = ash[t.email] || null, ref = '';
    if (m) { used[t.email] = 1; matched++; ref = m.candidate + ' | ' + m.jobTitle + ' | DOJ ' + (m.startDate || '-') + ' | ' + aStat(m); }
    var mq = m ? (qc(m.openingQuarter) || qc(m.attrQuarter)) : '';
    t1.push([t.email, t.name, m ? 'Yes' : 'No', t.job, m ? (roleOk(t.job, m.jobTitle) ? 'Yes' : 'No') : '',
             t.opd, m ? 'n/a' : '', t.opq, m ? eq(t.opq, mq) : '', t.doj, m ? eq(t.doj, m.startDate || '') : '',
             t.djm, m ? eq(t.djm, mth(m.startDate || '')) : '', t.djq, m ? eq(t.djq, qtr(m.startDate || '')) : '',
             t.status, m ? eq(t.status, aStat(m)) : '',
             t.rec, m ? eq(t.rec, m.recruiter || '') : '',
             t.emp, m ? eq(t.emp, m.employmentType || '') : '',
             t.lvl, m ? eq(t.lvl, m.level || '') : '',
             t.cx,  m ? eq(t.cx,  m.complexity || '') : '',
             t.offd, m ? eq(t.offd, offerDateOf(m)) : '',
             qtr(t.offd), m ? eq(qtr(t.offd), qtr(offerDateOf(m))) : '',
             ref, reasonOf(m)]);
  }

  // ---- 4. Tab 2 ----
  var t2 = [['Personal Email','Candidate Name','Job Name','Opening Date','Opening Quarter','DOJ','DOJ Month',
             'DOJ Quarter','Status','Opening Quarter - source','Ashby application status','Ashby archive reason']];
  var t3 = [['Personal Email','Candidate Name','Job Name','Ashby opening quarter (inferred)','Ashby status',
             'Tracker status','Tracker opening quarter','Tracker DOJ','Ashby DOJ','Why it is not on Tab 1']];
  for (i = 0; i < rows.length; i++) {
    var o = rows[i], e3 = nrm(o.email);
    if (used[e3]) continue;
    if (!(o.appStatus === 'Archived' || o.appStatus === 'Hired' || o.joiningPending)) continue;
    var q = aQ(o);
    if (q[0].indexOf('2026') < 0) continue;
    var tt = allTrk[e3];
    if (!tt) {
      t2.push([o.email, o.candidate || '', o.jobTitle || '', '', q[0], o.startDate || '', mth(o.startDate || ''),
               qtr(o.startDate || ''), aStat(o), q[1], o.appStatus || '', reasonOf(o)]);
    } else {
      var why = (tt.jcq && tt.jcq.indexOf('2026') < 0)
        ? ('Tracker opening is ' + tt.jcq + ', not 2026')
        : ('Tracker status is "' + tt.status + '", outside Joined / Joining Pending / Dropped - Offer');
      t3.push([o.email, o.candidate || '', o.jobTitle || '', q[0], aStat(o), tt.status, tt.jcq || '(blank)',
               tt.doj || '', o.startDate || '', why]);
    }
  }

  // ---- 5. write ----
  var out = null;
  try { out = SpreadsheetApp.openById(AUDIT_SHEET_ID); } catch (e) { out = null; }
  if (out) {
    // Wipe in place: drop every sheet but the first, then strip its contents, formats and dropdowns so a
    // shorter rebuild cannot leave stale rows or validations behind.
    var olds = out.getSheets();
    for (var k = olds.length - 1; k >= 1; k--) out.deleteSheet(olds[k]);
    olds[0].clear().clearFormats();
    // clearDataValidations lives on Range, NOT on Sheet — calling it on the sheet threw and left the audit
    // half-wiped (contents gone, nothing rebuilt).
    olds[0].getRange(1, 1, olds[0].getMaxRows(), olds[0].getMaxColumns()).clearDataValidations();
    if (olds[0].getFrozenRows()) olds[0].setFrozenRows(0);
    if (olds[0].getFrozenColumns()) olds[0].setFrozenColumns(0);
  } else {
    out = SpreadsheetApp.create('Hiring Audit 2026 - Tracker vs Ashby');
  }
  var s1 = out.getSheets()[0].setName('Tracker Candidates');
  s1.getRange(1,1,t1.length,t1[0].length).setValues(t1);
  s1.getRange(1,1,1,t1[0].length).setFontWeight('bold').setBackground('#334155').setFontColor('#ffffff');
  s1.setFrozenRows(1); s1.setFrozenColumns(2);
  var s2 = out.insertSheet('Ashby Only Candidates');
  s2.getRange(1,1,t2.length,t2[0].length).setValues(t2);
  s2.getRange(1,1,1,t2[0].length).setFontWeight('bold').setBackground('#334155').setFontColor('#ffffff');
  s2.setFrozenRows(1);
  var s3 = out.insertSheet('In Tracker - Outside 2026 Scope');
  s3.getRange(1,1,t3.length,t3[0].length).setValues(t3);
  s3.getRange(1,1,1,t3[0].length).setFontWeight('bold').setBackground('#a16207').setFontColor('#ffffff');
  s3.setFrozenRows(1);
  for (i = 1; i <= t3[0].length; i++) s3.autoResizeColumn(i);

  var yn = SpreadsheetApp.newDataValidation().requireValueInList(['Yes','No','n/a'], true).setAllowInvalid(true).build();
  // Match? dropdowns. Six new pairs were appended (Recruiter, Employment Type, Level, Complexity, Offer Date,
  // Offer Quarter), so the list runs to 29; leaving it at 17 would have silently dropped the dropdowns from
  // exactly the columns this rebuild was for.
  var mcols = [3,5,7,9,11,13,15,17,19,21,23,25,27,29];
  for (i = 0; i < mcols.length; i++) if (t1.length > 1) s1.getRange(2, mcols[i], t1.length-1, 1).setDataValidation(yn);
  var STAT = ['Open','Joining Pending','Joined','Dropped - Offer','Dropped - Select','Role Shelved',
              'Carry Forward to Next Q','Yet to Open','Offer to be released','Offer Released'];
  var sv = SpreadsheetApp.newDataValidation().requireValueInList(STAT, true).setAllowInvalid(true).build();
  if (t1.length > 1) s1.getRange(2,16,t1.length-1,1).setDataValidation(sv);
  if (t2.length > 1) s2.getRange(2,9,t2.length-1,1).setDataValidation(sv);

  var rd = out.insertSheet('Read me', 0);
  rd.getRange(1,1,11,2).setValues([
   ['How to use this audit',''],
   ['Match key','PERSONAL EMAIL. Both systems carry it on 100% of the rows in scope, so people are paired on email alone - no name or role guessing.'],
   ['Scope','2026 OPENINGS only. Tracker: Job Creation Quarter (or job creation date) in 2026, status Joined / Joining Pending / Dropped - Offer.'],
   ['Tab 1','Every tracker candidate in scope with the Ashby record for the same email. Each Match? compares that one field. If Candidate Name Match? is No, the person is not in Ashby and the rest is blank.'],
   ['Tab 2 - Ashby Only','ONLY people whose email appears NOWHERE in the tracker. A genuine gap: Ashby has them, the tracker does not.'],
   ['Tab 3 - In Tracker, Outside Scope','People who ARE in the tracker but whose opening is not a 2026 one (mostly Q4 2025), so they are not on Tab 1. NOTHING IS MISSING here. Ashby holds no real opening for them, so its quarter is inferred from when they reached the offer stage - which reads 2026 while the tracker says the seat was opened in 2025. A dating difference, not a data gap. Do not chase these.'],
   ['DO NOT audit Opening Quarter','Most rows read No. Ashby holds no real opening for these people, so its quarter is inferred. Skip this column.'],
   ['Where to start','1) Status mismatches. 2) DOJ mismatches. 3) Candidate Name Match? = No. 4) Tab 2 rows saying NOT IN TRACKER.'],
   ['Opening Date, Ashby side','Always blank / n-a. Ashby drops the opening link on archive and 91% of offers never had one.'],
   ['Rebuild','Re-run buildAuditSheet() in Apps Script. It reads the live tracker and the latest Ashby refresh, and rewrites THIS spreadsheet - the link never changes.'],
   ['Built at', Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm') + ' UTC']]);
  rd.getRange(1,1,11,1).setFontWeight('bold');
  rd.setColumnWidth(1,240); rd.setColumnWidth(2,760);
  rd.getRange(1,1,11,2).setWrap(true);

  try { DriveApp.getFileById(out.getId()).moveTo(DriveApp.getFolderById(FOLDER_ID)); } catch (e) {}
  Logger.log('AUDIT SHEET: ' + out.getUrl());
  Logger.log('Tab1 rows: ' + (t1.length-1) + ' | matched by email: ' + matched + ' | unmatched: ' + (t1.length-1-matched));
  Logger.log('Tab2 (truly absent from tracker): ' + (t2.length-1) + ' | Tab3 (in tracker, opening outside 2026): ' + (t3.length-1));
  return out.getUrl();
}

// ===== V2 AUDIT TAB - reworked 2026-08-31 (Jerin) ==========================================
// Written to a NEW tab so the tab the team is working in is left exactly as it is.
// 🚨 buildAuditSheet() above is NOT called by this and must NOT be run while the team is in the
// file: it deletes every tab but the first and rewrites it, which would wipe their Result
// columns, their owner row and their pivot. buildAuditV2() only ever rewrites its own tab.
//
// Three changes, all from Jerin's 31 Aug review:
//
// 1. RECRUITER IS MATCHED ON NAME SHAPE, not character-for-character. The tracker writes the
//    short form of a name - "Navya" where Ashby has "M Navya", "Mahima" for "Mahima Agarwal",
//    "Alokita Ajay Dhumne" for "Alokita Dhumne", "Mashika Almeida" for "Mashika De Almeida",
//    "Neha Pattar" for "Neha Vivekanand Pattar". Same person, printed as a mismatch. That is why
//    the team checked the Recruiter "No" rows and found Ashby already correct. In their own pivot
//    of 181 rows, 59 sit under a short-form name.
//    ⚠ Where the job carries MORE THAN ONE Recruiter tag the answer stays No even when the
//    tracker's name is one of them (Jerin): Ashby failing to name a single owner is itself the
//    defect, and letting it pass would hide it.
//
// 2. A CANDIDATE WITH SEVERAL ASHBY OFFERS IS SETTLED ON ONE RECORD - the one that ended in
//    Hired, else the one that most recently moved into Ref Check / Documentation / Offer. The old
//    code kept whichever offer the API happened to return first: not the newest, not the hired
//    one, not chosen by anything. That put Manikanta P on an archived May application instead of
//    his August hire, and one wrong pick reads as six separate mismatches (Job, Status, DOJ, DOJ
//    Month, Recruiter, Offer Date). Six candidates carry two offer records; four are on different
//    jobs. Hired wins first because "latest movement" alone picks Karuna Tomar's later ARCHIVED
//    offer over the March one she actually joined on.
//
// 3. EVERY FIELD NOW PRINTS WHAT ASHBY HAS beside the tracker's value. The old tab said "No"
//    without saying what it disagreed with, so the only way to find out was to open Ashby.
//
// Tracker rows added since the 24 Aug build come in automatically (the tracker is read live) and
// are flagged in "Row source". Non-empty Result cells from the old tab are carried across, keyed
// on email + field name, so nobody's working notes are lost.
// Tabs 2 and 3 are NOT rebuilt here and still show the 24 Aug picture.
var AUDIT_V2_TAB = 'Tracker Candidates v2';

function buildAuditV2() {
  var TRACKER_ID = '1_LQxHDZ6dXehyR2lc8pcFjfDeRaV80vBzVRB_BKWT5A';
  var MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var TZ = 'UTC';   // replaced by the tracker's own timezone below - see buildAuditSheet for why

  function d2s(v) {
    if (!v) return '';
    if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
    return String(v).trim();
  }
  function mth(s) { return (s && s.length >= 7) ? MON[parseInt(s.substring(5,7),10)-1] + '-' + s.substring(0,4) : ''; }
  function qtr(s) { return (s && s.length >= 7) ? 'Q' + (Math.floor((parseInt(s.substring(5,7),10)-1)/3)+1) + ' ' + s.substring(0,4) : ''; }
  function qc(a)  { return a ? 'Q' + a.charAt(a.length-1) + ' ' + a.substring(0,4) : ''; }
  function nrm(e) { return String(e || '').replace(/\s+/g,'').toLowerCase(); }
  function okEmail(e) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e); }
  function words(s) {
    var t = String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/), o = {};
    for (var i=0;i<t.length;i++) if (t[i]) o[t[i]] = 1;
    return o;
  }
  function roleOk(a, b) {
    var x = words(a), y = words(b), kx = Object.keys(x), ky = Object.keys(y), n = 0, i;
    if (!kx.length || !ky.length) return false;
    for (i=0;i<kx.length;i++) if (y[kx[i]]) n++;
    return n >= 2 || n === kx.length || n === ky.length;
  }
  function eq(a, b) { return String(a).trim().toLowerCase() === String(b).trim().toLowerCase() ? 'Yes' : 'No'; }

  // ---- fuzzy PERSON-name match (recruiters only - never candidates) ----
  // Single letters are dropped first, so "M Navya" reduces to the same token as "Navya" and
  // "Siva Sruthi V S" to "Siva Sruthi". Then one name's words must all appear in the other's.
  // ⚠ A single-word tracker value must match the Ashby FIRST name, not any word - otherwise a
  // lone surname like "Singh" would wrongly match "Aditya Singh".
  function nameTokens(s) {
    var t = String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/), o = [];
    for (var i=0;i<t.length;i++) if (t[i] && t[i].length > 1) o.push(t[i]);
    return o;
  }
  function nameMatch(a, b) {
    var x = nameTokens(a), y = nameTokens(b);
    if (!x.length || !y.length) return false;
    var s = x.length <= y.length ? x : y, l = x.length <= y.length ? y : x, i;
    if (s.length === 1) return s[0] === l[0];
    for (i=0;i<s.length;i++) { var hit = false;
      for (var j=0;j<l.length;j++) if (l[j] === s[i]) { hit = true; break; }
      if (!hit) return false; }
    return true;
  }

  // ---- 1. tracker (identical scope rules to buildAuditSheet) ----
  var trackerSS = SpreadsheetApp.openById(TRACKER_ID);
  TZ = trackerSS.getSpreadsheetTimeZone() || 'UTC';
  var vals = trackerSS.getSheetByName('Master').getDataRange().getValues();
  Logger.log('v2 | tracker timezone: ' + TZ + ' | tracker rows: ' + (vals.length - 1));
  var hdr = vals[0];
  function col(n) { for (var i=0;i<hdr.length;i++) if (String(hdr[i]).trim() === n) return i; return -1; }
  function colAny(list) { for (var i=0;i<list.length;i++) { var c = col(list[i]); if (c >= 0) return c; } return -1; }
  function at(row, idx) { return idx >= 0 ? String(row[idx] == null ? '' : row[idx]).trim() : ''; }
  var C = { date:col('Date'), jcq:col('Job Creation Quarter'), status:col('Overall Status'), dept:col('Department'),
            job:col('Job Name'), rec:col('Recruiter'), name:col('Candidate Name'), email:col('Personal Email'),
            offer:col('Date of Offer'), doj:col('DOJ'), jm:col('Joining Month'), jq:col('Joining Quarter'),
            emp:colAny(['Employment Type','Employment type','Emp Type','Type of Employment']),
            lvl:colAny(['Level','Job Level','Grade']),
            cx:colAny(['Complexity','Role Complexity','Job Complexity']) };
  for (var k in C) if (C[k] < 0) throw new Error('Tracker column not found: ' + k);

  var KEEP = { 'Joined':1, 'Joining Pending':1, 'Dropped - Offer':1 };
  var trk = [];
  for (var r = 1; r < vals.length; r++) {
    var row = vals[r], nm = String(row[C.name] || '').trim();
    if (!nm) continue;
    var e = nrm(row[C.email]), stat = String(row[C.status] || '').trim(), dj = d2s(row[C.doj]);
    var jcq = String(row[C.jcq] || '').trim(), od = d2s(row[C.date]);
    var is26 = (jcq.indexOf('2026') > -1) || (od.substring(0,4) === '2026');
    if (!is26 || !KEEP[stat]) continue;
    trk.push({ email:e, name:nm, job:String(row[C.job]||'').trim(), opd:od, opq:jcq, doj:dj,
               rec:at(row,C.rec), emp:at(row,C.emp), lvl:at(row,C.lvl), cx:at(row,C.cx), offd:d2s(row[C.offer]),
               djm:String(row[C.jm]||'').trim() || mth(dj), djq:String(row[C.jq]||'').trim() || qtr(dj), status:stat });
  }

  // ---- 2. Ashby: EVERY offer row per email, not just the first ----
  var it = DriveApp.getFilesByName('offer_contacts.json');
  if (!it.hasNext()) throw new Error('offer_contacts.json not found in Drive - run refreshDashboardData first');
  var ashRows = JSON.parse(it.next().getBlob().getDataAsString()).rows;
  var byEmail = {}, multiCount = 0;
  for (var i = 0; i < ashRows.length; i++) {
    var e2 = nrm(ashRows[i].email);
    if (!okEmail(e2)) continue;
    if (!byEmail[e2]) byEmail[e2] = [];
    byEmail[e2].push(ashRows[i]);
  }
  for (var em0 in byEmail) if (byEmail[em0].length > 1) multiCount++;
  Logger.log('v2 | Ashby offer rows: ' + ashRows.length + ' | distinct emails: ' + Object.keys(byEmail).length + ' | emails with >1 record: ' + multiCount);

  function offerDateOf(o) { return (o && (o.offerCreatedAt || o.decidedAt)) || ''; }
  function reasonOf(o) {
    if (!o || !o.archiveReason) return '';
    return o.archiveReason + (o.archiveReasonType ? ' (' + o.archiveReasonType + ')' : '');
  }
  function aStat(o) {
    if (o.appStatus === 'Hired') return 'Joined';
    if (o.joiningPending) return 'Joining Pending';
    if (o.appStatus === 'Archived') return 'Dropped - Offer';
    return 'Offer Released';
  }

  // ---- 3. which applications carry MORE THAN ONE Recruiter tag ----
  // Read off dashboard.json's dataQuality.multiRecruiter (application id -> every name tagged), so
  // no extra Ashby calls. ⚠ That list is built from the current-year application sweep, so an offer
  // recovered through the pre-scope-year application.info path is not represented - it will look
  // single-recruiter here. Small and known; it is not a silent wrong answer, it is a missing flag.
  var multiRec = {};
  try {
    var dash = loadDriveJson_('dashboard.json');
    var mr = (dash && dash.dataQuality && dash.dataQuality.multiRecruiter) || [];
    for (i = 0; i < mr.length; i++) if (mr[i] && mr[i].app) multiRec[mr[i].app] = mr[i].names || [];
    Logger.log('v2 | applications with more than one Recruiter tag: ' + mr.length);
  } catch (eD) { Logger.log('v2 | dashboard.json unreadable, multi-recruiter flag off: ' + eD.message); }

  function ashRecruiterNames(m) {
    var names = multiRec[m.applicationId];
    if (names && names.length > 1) return names;
    return m.recruiter ? [m.recruiter] : [];
  }

  // ---- 4. settle a candidate with several offers on ONE record ----
  var LATE = { 'Reference Check':1, 'Document Submission':1, 'Offer':1, 'Hired':1 };
  var histCalls = 0, histErr = 0;
  function lastLateMove(appId) {
    if (!appId) return '';
    histCalls++;
    try {
      var h = ashbyPost_('/application.listHistory', { applicationId: appId });
      var list = (h && (h.results || h.history)) || [], best = '';
      for (var q = 0; q < list.length; q++) {
        var ht = list[q];
        if (!ht || !ht.enteredStageAt || !LATE[ht.title]) continue;
        if (String(ht.enteredStageAt) > best) best = String(ht.enteredStageAt);
      }
      return best;
    } catch (eH) { histErr++; return ''; }
  }
  // Only used when stage history gives nothing, so a record is never picked at random.
  function fallbackDate(rc) {
    var cands = [rc.offerCreatedAt, rc.decidedAt, rc.startDate, rc.archivedAt], b = '';
    for (var q = 0; q < cands.length; q++) if (cands[q] && String(cands[q]) > b) b = String(cands[q]);
    return b;
  }
  function chooseRecord(list) {
    if (list.length === 1) return { rec: list[0], note: '' };
    var hired = [], q;
    for (q = 0; q < list.length; q++) if (list[q].appStatus === 'Hired') hired.push(list[q]);
    var pool = hired.length ? hired : list;
    var why = hired.length ? 'ended in Hired' : 'moved most recently into Ref Check / Documentation / Offer';
    if (pool.length === 1) return { rec: pool[0], note: list.length + ' Ashby records - kept the one that ' + why };
    var best = null, bestKey = '';
    for (q = 0; q < pool.length; q++) {
      var key = lastLateMove(pool[q].applicationId) || fallbackDate(pool[q]);
      if (!best || String(key) > bestKey) { best = pool[q]; bestKey = String(key); }
    }
    return { rec: best, note: list.length + ' Ashby records - kept the one that ' + why +
             ', latest movement ' + (bestKey ? bestKey.substring(0,10) : 'unknown') };
  }

  // ---- 5. the fields, defined ONCE so the header and the rows cannot drift apart ----
  var FIELDS = [
    { name:'Candidate Name',  t:function(t){return t.name;},      a:function(m){return m.candidate || '';},                          c:'found' },
    { name:'Job Name',        t:function(t){return t.job;},       a:function(m){return m.jobTitle || '';},                           c:'role'  },
    { name:'Opening Date',    t:function(t){return t.opd;},       a:function(m){return '';},                                          c:'na'    },
    { name:'Opening Quarter', t:function(t){return t.opq;},       a:function(m){return qc(m.openingQuarter) || qc(m.attrQuarter);},  c:'eq'    },
    { name:'DOJ',             t:function(t){return t.doj;},       a:function(m){return m.startDate || '';},                          c:'eq'    },
    { name:'DOJ Month',       t:function(t){return t.djm;},       a:function(m){return mth(m.startDate || '');},                     c:'eq'    },
    { name:'DOJ Quarter',     t:function(t){return t.djq;},       a:function(m){return qtr(m.startDate || '');},                     c:'eq'    },
    { name:'Status',          t:function(t){return t.status;},    a:function(m){return aStat(m);},                                   c:'eq'    },
    { name:'Recruiter',       t:function(t){return t.rec;},       a:function(m){return ashRecruiterNames(m).join(' + ');},           c:'rec'   },
    { name:'Employment Type', t:function(t){return t.emp;},       a:function(m){return m.employmentType || '';},                     c:'eq'    },
    { name:'Level',           t:function(t){return t.lvl;},       a:function(m){return m.level || '';},                              c:'eq'    },
    { name:'Complexity',      t:function(t){return t.cx;},        a:function(m){return m.complexity || '';},                         c:'eq'    },
    { name:'Offer Date',      t:function(t){return t.offd;},      a:function(m){return offerDateOf(m);},                             c:'eq'    },
    { name:'Offer Quarter',   t:function(t){return qtr(t.offd);}, a:function(m){return qtr(offerDateOf(m));},                        c:'eq'    }
  ];

  // ---- 6. carry the team's Result cells across, keyed on email + field ----
  var out = SpreadsheetApp.openById(AUDIT_SHEET_ID);
  var oldSeen = {}, oldResult = {}, carried = 0;
  try {
    var oldSheet = out.getSheetByName('Tracker Candidates');
    if (oldSheet) {
      var ov = oldSheet.getDataRange().getValues(), hRow = -1, rr, cc;
      for (rr = 0; rr < Math.min(ov.length, 10) && hRow < 0; rr++)
        for (cc = 0; cc < ov[rr].length; cc++)
          if (String(ov[rr][cc] || '').trim().indexOf('Personal Email') === 0) { hRow = rr; break; }
      if (hRow >= 0) {
        var oh = ov[hRow], emailCol = -1, lastField = '', resCol = {};
        for (cc = 0; cc < oh.length; cc++) {
          var hn = String(oh[cc] || '').trim();
          if (!hn) continue;
          if (hn.indexOf('Personal Email') === 0) { emailCol = cc; continue; }
          if (hn === 'Match?') continue;
          // "Result" belongs to the field before it; the team also added one stray "Result Recruiter".
          if (hn === 'Result') { if (lastField) resCol[lastField] = cc; continue; }
          if (hn.indexOf('Result ') === 0) { resCol[hn.substring(7).trim()] = cc; continue; }
          lastField = hn.replace(/\s*\(Hiring Tracker\)\s*$/, '');
        }
        for (rr = hRow + 1; rr < ov.length; rr++) {
          var oem = emailCol >= 0 ? nrm(ov[rr][emailCol]) : '';
          if (!oem) continue;
          oldSeen[oem] = 1;
          for (var fn in resCol) {
            var vv = String(ov[rr][resCol[fn]] == null ? '' : ov[rr][resCol[fn]]).trim();
            if (vv) { if (!oldResult[oem]) oldResult[oem] = {}; oldResult[oem][fn] = vv; carried++; }
          }
        }
      }
      Logger.log('v2 | previous tab: ' + Object.keys(oldSeen).length + ' emails, ' + carried + ' Result cells carried over');
    }
  } catch (eO) { Logger.log('v2 | could not read the previous tab (nothing carried over): ' + eO.message); }

  // ---- 7. build the rows ----
  var head = ['Personal Email (match key)'], fi;
  for (fi = 0; fi < FIELDS.length; fi++) head.push(FIELDS[fi].name, FIELDS[fi].name + ' - Ashby', 'Match?', 'Result');
  head.push('Which Ashby record', 'Ashby archive reason', 'Row source');
  var t1 = [head], matched = 0, fresh = 0, recFixed = 0, recMulti = 0;

  for (i = 0; i < trk.length; i++) {
    var tr = trk[i];
    var list = byEmail[tr.email] || [];
    var pick = list.length ? chooseRecord(list) : null;
    var m = pick ? pick.rec : null;
    if (m) matched++;
    var line = [tr.email];
    for (fi = 0; fi < FIELDS.length; fi++) {
      var f = FIELDS[fi], tv = f.t(tr), av = m ? f.a(m) : '', mm = '';
      if (f.c === 'found')    mm = m ? 'Yes' : 'No';
      else if (!m)            mm = '';
      else if (f.c === 'na')  mm = 'n/a';
      else if (f.c === 'role') mm = roleOk(tv, av) ? 'Yes' : 'No';
      else if (f.c === 'rec') {
        var names = ashRecruiterNames(m);
        if (names.length > 1) { mm = 'No'; recMulti++; }
        else if (!names.length) mm = 'No';
        else { mm = nameMatch(tv, names[0]) ? 'Yes' : 'No';
               if (mm === 'Yes' && eq(tv, names[0]) === 'No') recFixed++; }
      }
      else mm = eq(tv, av);
      line.push(tv, av, mm, (oldResult[tr.email] && oldResult[tr.email][f.name]) || '');
    }
    // A row with no email cannot be matched to Ashby at all, so it is neither new nor previously seen.
    // Labelling it "New since 24 Aug" reads as a fresh candidate when it is really a tracker gap.
    var src = !tr.email ? 'No email in the tracker - cannot be matched'
            : (oldSeen[tr.email] ? 'On previous tab' : 'New since 24 Aug');
    if (src === 'New since 24 Aug') fresh++;
    line.push(pick ? pick.note : '', m ? reasonOf(m) : '', src);
    t1.push(line);
  }

  // ---- 8. write, on our own tab only ----
  var sh = out.getSheetByName(AUDIT_V2_TAB);
  if (!sh) sh = out.insertSheet(AUDIT_V2_TAB);
  else {
    sh.clear().clearFormats();
    sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).clearDataValidations();
    if (sh.getFrozenRows()) sh.setFrozenRows(0);
    if (sh.getFrozenColumns()) sh.setFrozenColumns(0);
  }
  sh.getRange(1, 1, t1.length, head.length).setValues(t1);
  sh.getRange(1, 1, 1, head.length).setFontWeight('bold').setBackground('#334155').setFontColor('#ffffff');
  sh.setFrozenRows(1); sh.setFrozenColumns(2);
  // Tint the Ashby column of every field, so the two sides are told apart at a glance rather than
  // by counting across. This is the whole point of the rework - do not drop it in a tidy-up.
  for (fi = 0; fi < FIELDS.length; fi++) {
    var aCol = 3 + fi * 4;
    if (t1.length > 1) sh.getRange(2, aCol, t1.length - 1, 1).setBackground('#f1f5f9');
    sh.getRange(1, aCol).setBackground('#475569');
  }
  var yn = SpreadsheetApp.newDataValidation().requireValueInList(['Yes','No','n/a'], true).setAllowInvalid(true).build();
  for (fi = 0; fi < FIELDS.length; fi++)
    if (t1.length > 1) sh.getRange(2, 4 + fi * 4, t1.length - 1, 1).setDataValidation(yn);
  // Result dropdown (Jerin, 2026-09-02). Result sits at 5 + fi*4 - it was the one column with no
  // validation, so a rebuild used to drop the options the team picks from.
  var rv = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Fixed-Ashby', 'Pending', 'Fixed-HT', 'cant-be-done', 'Not actioning'], true)
    .setAllowInvalid(true).build();
  for (fi = 0; fi < FIELDS.length; fi++)
    if (t1.length > 1) sh.getRange(2, 5 + fi * 4, t1.length - 1, 1).setDataValidation(rv);
  var STAT = ['Open','Joining Pending','Joined','Dropped - Offer','Dropped - Select','Role Shelved',
              'Carry Forward to Next Q','Yet to Open','Offer to be released','Offer Released'];
  var sv = SpreadsheetApp.newDataValidation().requireValueInList(STAT, true).setAllowInvalid(true).build();
  for (fi = 0; fi < FIELDS.length; fi++)
    if (FIELDS[fi].name === 'Status' && t1.length > 1) sh.getRange(2, 2 + fi * 4, t1.length - 1, 1).setDataValidation(sv);

  // ---- 9. the Read me line that would destroy this file ----
  try {
    var rd = out.getSheetByName('Read me');
    if (rd) {
      var rv = rd.getDataRange().getValues(), done = false, firstEmpty = rv.length + 1, ptrRow = 0;
      // Re-running must land on the SAME row, not append a second copy of the pointer each time.
      for (var rp = 0; rp < rv.length; rp++) if (String(rv[rp][0] || '').trim() === AUDIT_V2_TAB) ptrRow = rp + 1;
      for (var rz = 0; rz < rv.length; rz++) {
        if (String(rv[rz][0] || '').trim() === 'Rebuild') {
          rd.getRange(rz + 1, 2).setValue('DO NOT run buildAuditSheet() - it deletes every tab but the first, '
            + 'which would wipe the Result columns, the owner row and the pivot. To refresh, run buildAuditV2(): '
            + 'it only ever rewrites the "' + AUDIT_V2_TAB + '" tab and leaves everything else alone.');
          done = true;
        }
        if (!String(rv[rz][0] || '').trim() && rz + 1 < firstEmpty) firstEmpty = rz + 1;
      }
      if (ptrRow) firstEmpty = ptrRow;
      rd.getRange(firstEmpty, 1, 1, 2).setValues([[AUDIT_V2_TAB,
        'The reworked tab (' + Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd') + '). Recruiter is matched on '
        + 'name shape, so "Navya" and "M Navya" agree; a job with more than one Recruiter tagged still reads No. '
        + 'A candidate with several Ashby offers is settled on the one that ended in Hired, else the one that '
        + 'moved most recently into Ref Check / Documentation / Offer. Every field shows WHAT ASHBY HAS next to '
        + 'the tracker value. "Row source" marks candidates added since the 24 Aug build.']]);
      rd.getRange(firstEmpty, 1).setFontWeight('bold');
      rd.getRange(firstEmpty, 1, 1, 2).setWrap(true);
      Logger.log('v2 | Read me rebuild warning ' + (done ? 'updated' : 'NOT FOUND - check it by hand'));
    }
  } catch (eR) { Logger.log('v2 | Read me not updated: ' + eR.message); }

  Logger.log('v2 | rows: ' + (t1.length - 1) + ' | matched to Ashby: ' + matched
    + ' | new since 24 Aug: ' + fresh
    + ' | recruiter now Yes on a name the old exact match called No: ' + recFixed
    + ' | recruiter No because the job has several Recruiter tags: ' + recMulti
    + ' | stage-history calls: ' + histCalls + ' (errors ' + histErr + ')');
  Logger.log('AUDIT SHEET: ' + out.getUrl());
  return out.getUrl();
}

// ============================================================================================
// buildAuditV3() - OPENING-FIRST audit. Spine = Hiring Tracker (source of truth), one row per
// Q3-2026 position/opening (ALL statuses). Candidate-field audits fire only on CLOSURE rows
// (where an Ashby offer matches by email). Writes ONLY the "Tracker Openings v3" tab; leaves
// Tracker Candidates v2 and everything else untouched. Added 2026-09-04.
// ============================================================================================
function buildAuditV3() {
  var TRACKER_ID = '1_LQxHDZ6dXehyR2lc8pcFjfDeRaV80vBzVRB_BKWT5A';
  var V3_TAB = 'Tracker Openings v3';
  var MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var TZ = 'UTC';
  var DONT_ACTION = { 'Opening Quarter':1, 'DOJ':1, 'DOJ Month':1, 'DOJ Quarter':1, 'Offer Date':1, 'Offer Quarter':1 };
  var TEAM_DASH = { 'Employment Type':1, 'Level':1, 'Complexity':1 };   // fields the team validated in Job Gaps

  function d2s(v) {
    if (!v) return '';
    if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
    return String(v).trim();
  }
  function mth(s) { return (s && s.length >= 7) ? MON[parseInt(s.substring(5,7),10)-1] + '-' + s.substring(0,4) : ''; }
  function qtr(s) { return (s && s.length >= 7) ? 'Q' + (Math.floor((parseInt(s.substring(5,7),10)-1)/3)+1) + ' ' + s.substring(0,4) : ''; }
  function qc(a)  { return a ? 'Q' + a.charAt(a.length-1) + ' ' + a.substring(0,4) : ''; }
  function nrm(e) { return String(e || '').replace(/\s+/g,'').toLowerCase(); }
  function okEmail(e) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e); }
  function words(s) { var t=String(s||'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/),o={};for(var i=0;i<t.length;i++)if(t[i])o[t[i]]=1;return o; }
  function roleOk(a,b){ var x=words(a),y=words(b),kx=Object.keys(x),ky=Object.keys(y),n=0,i;if(!kx.length||!ky.length)return false;for(i=0;i<kx.length;i++)if(y[kx[i]])n++;return n>=2||n===kx.length||n===ky.length; }
  function eq(a,b){ return String(a).trim().toLowerCase() === String(b).trim().toLowerCase() ? 'Yes' : 'No'; }
  function nameTokens(s){ var t=String(s||'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/),o=[];for(var i=0;i<t.length;i++)if(t[i]&&t[i].length>1)o.push(t[i]);return o; }
  function nameMatch(a,b){ var x=nameTokens(a),y=nameTokens(b);if(!x.length||!y.length)return false;var s=x.length<=y.length?x:y,l=x.length<=y.length?y:x,i;if(s.length===1)return s[0]===l[0];for(i=0;i<s.length;i++){var hit=false;for(var j=0;j<l.length;j++)if(l[j]===s[i]){hit=true;break;}if(!hit)return false;}return true; }

  // ---- tracker: EVERY Q3-2026 position, all statuses ----
  var trackerSS = SpreadsheetApp.openById(TRACKER_ID);
  TZ = trackerSS.getSpreadsheetTimeZone() || 'UTC';
  var vals = trackerSS.getSheetByName('Master').getDataRange().getValues();
  var hdr = vals[0];
  function col(n){ for (var i=0;i<hdr.length;i++) if (String(hdr[i]).trim() === n) return i; return -1; }
  function colAny(list){ for (var i=0;i<list.length;i++){ var c=col(list[i]); if (c>=0) return c; } return -1; }
  function at(row,idx){ return idx>=0 ? String(row[idx]==null?'':row[idx]).trim() : ''; }
  var C = { date:col('Date'), jcq:col('Job Creation Quarter'), status:col('Overall Status'), dept:col('Department'),
            job:col('Job Name'), rec:col('Recruiter'), name:col('Candidate Name'), email:col('Personal Email'),
            offer:col('Date of Offer'), doj:col('DOJ'), jm:col('Joining Month'), jq:col('Joining Quarter'),
            role:colAny(['Role Type','Type of Role']), loc:colAny(['Job Location','Location']),
            emp:colAny(['Employment Type','Employment type','Emp Type','Type of Employment']),
            lvl:colAny(['Level','Job Level','Grade']), cx:colAny(['Complexity','Role Complexity','Job Complexity']) };

  var trk = [];
  for (var r = 1; r < vals.length; r++) {
    var row = vals[r];
    var jcq = String(row[C.jcq] || '').trim();
    if (jcq !== 'Q3 2026') continue;
    var e = nrm(row[C.email]), dj = d2s(row[C.doj]), od = d2s(row[C.date]);
    trk.push({ email: okEmail(e) ? e : '', name:String(row[C.name]||'').trim(),
               job:at(row,C.job), opd:od, opq:jcq, doj:dj,
               rec:at(row,C.rec), role:at(row,C.role), loc:at(row,C.loc),
               emp:at(row,C.emp), lvl:at(row,C.lvl), cx:at(row,C.cx), offd:d2s(row[C.offer]),
               djm:String(row[C.jm]||'').trim() || mth(dj), djq:String(row[C.jq]||'').trim() || qtr(dj),
               status:String(row[C.status]||'').trim() });
  }

  // ---- Ashby offers by email (offer_contacts.json - same source as v2) ----
  var it = DriveApp.getFilesByName('offer_contacts.json');
  if (!it.hasNext()) throw new Error('offer_contacts.json not found - run refreshDashboardData first');
  var ashRows = JSON.parse(it.next().getBlob().getDataAsString()).rows;
  var byEmail = {};
  for (var i = 0; i < ashRows.length; i++) { var e2 = nrm(ashRows[i].email); if (!okEmail(e2)) continue; (byEmail[e2] = byEmail[e2] || []).push(ashRows[i]); }
  function offerDateOf(o){ return (o && (o.offerCreatedAt || o.decidedAt)) || ''; }
  function aStat(o){ if(o.appStatus==='Hired')return 'Joined'; if(o.joiningPending)return 'Joining Pending'; if(o.appStatus==='Archived')return 'Dropped - Offer'; return 'Offer Released'; }
  var multiRec = {};
  try { var dash = loadDriveJson_('dashboard.json'); var mr=(dash&&dash.dataQuality&&dash.dataQuality.multiRecruiter)||[]; for(i=0;i<mr.length;i++) if(mr[i]&&mr[i].app) multiRec[mr[i].app]=mr[i].names||[]; } catch(eD){}
  function ashRecruiterNames(m){ var names=multiRec[m.applicationId]; if(names&&names.length>1)return names; return m.recruiter?[m.recruiter]:[]; }
  var LATE = { 'Reference Check':1,'Document Submission':1,'Offer':1,'Hired':1 };
  function lastLateMove(appId){ if(!appId)return ''; try{ var h=ashbyPost_('/application.listHistory',{applicationId:appId}); var list=(h&&(h.results||h.history))||[],best=''; for(var q=0;q<list.length;q++){var ht=list[q]; if(!ht||!ht.enteredStageAt||!LATE[ht.title])continue; if(String(ht.enteredStageAt)>best)best=String(ht.enteredStageAt);} return best; }catch(eH){return '';} }
  function fallbackDate(rc){ var cands=[rc.offerCreatedAt,rc.decidedAt,rc.startDate,rc.archivedAt],b=''; for(var q=0;q<cands.length;q++) if(cands[q]&&String(cands[q])>b)b=String(cands[q]); return b; }
  function chooseRecord(list){ if(list.length===1)return list[0]; var hired=[],q; for(q=0;q<list.length;q++)if(list[q].appStatus==='Hired')hired.push(list[q]); var pool=hired.length?hired:list; if(pool.length===1)return pool[0]; var best=null,bestKey=''; for(q=0;q<pool.length;q++){var key=lastLateMove(pool[q].applicationId)||fallbackDate(pool[q]); if(!best||String(key)>bestKey){best=pool[q];bestKey=String(key);}} return best; }

  // ---- fields (opening-first order); each -> value | Ashby | Match? | Result ----
  var FIELDS = [
    { name:'Opening Date',    t:function(t){return t.opd;},    a:function(m){return '';},                                        c:'na'    },
    { name:'Opening Quarter', t:function(t){return t.opq;},    a:function(m){return qc(m.openingQuarter)||qc(m.attrQuarter);},   c:'eq'    },
    { name:'Job Name',        t:function(t){return t.job;},    a:function(m){return m.jobTitle||'';},                            c:'role'  },
    { name:'Role Type',       t:function(t){return t.role;},   a:function(m){return '';},                                        c:'na'    },
    { name:'Employment Type', t:function(t){return t.emp;},    a:function(m){return m.employmentType||'';},                      c:'eq'    },
    { name:'Level',           t:function(t){return t.lvl;},    a:function(m){return m.level||'';},                               c:'eq'    },
    { name:'Complexity',      t:function(t){return t.cx;},     a:function(m){return m.complexity||'';},                          c:'eq'    },
    { name:'Location',        t:function(t){return t.loc;},    a:function(m){return '';},                                        c:'na'    },
    { name:'Recruiter (Owner)', t:function(t){return t.rec;},  a:function(m){return ashRecruiterNames(m).join(' + ');},          c:'rec'   },
    { name:'Status',          t:function(t){return t.status;}, a:function(m){return aStat(m);},                                  c:'eq'    },
    { name:'Candidate Name',  t:function(t){return t.name;},   a:function(m){return m.candidate||'';},                           c:'found' },
    { name:'DOJ',             t:function(t){return t.doj;},    a:function(m){return m.startDate||'';},                           c:'eq'    },
    { name:'DOJ Month',       t:function(t){return t.djm;},    a:function(m){return mth(m.startDate||'');},                      c:'eq'    },
    { name:'DOJ Quarter',     t:function(t){return t.djq;},    a:function(m){return qtr(m.startDate||'');},                      c:'eq'    },
    { name:'Offer Date',      t:function(t){return t.offd;},   a:function(m){return offerDateOf(m);},                            c:'eq'    },
    { name:'Offer Quarter',   t:function(t){return qtr(t.offd);}, a:function(m){return qtr(offerDateOf(m));},                    c:'eq'    }
  ];

  function rowKey(t){ return t.email || ('OPEN|'+t.job+'|'+t.opd+'|'+t.rec); }

  // ---- carry Result cells across from a previous V3 tab (keyed on row key + field) ----
  var out = SpreadsheetApp.openById(AUDIT_SHEET_ID);
  // Job Gaps team answers keyed on Ashby job name: '-' = Ashby already right / don't action.
  var jobGaps = {};
  try {
    var jg = out.getSheetByName('Job Gaps');
    if (jg) { var jv = jg.getDataRange().getValues();
      for (var jr = 1; jr < jv.length; jr++) { var jn = String(jv[jr][0]||'').trim(); if (!jn) continue;
        jobGaps[jn] = { 'Employment Type': String(jv[jr][16]||'').trim(), 'Level': String(jv[jr][17]||'').trim(), 'Complexity': String(jv[jr][18]||'').trim() }; } }
  } catch (eJG) {}
  var actionable = [], actCount = {};
  var oldResult = {};
  try {
    var oldSheet = out.getSheetByName(V3_TAB);
    if (oldSheet) {
      var ov = oldSheet.getDataRange().getValues(); if (ov.length > 1) {
        var oh = ov[0], keyCol = 0, lastField = '', resCol = {};
        for (var cc = 0; cc < oh.length; cc++) { var hn=String(oh[cc]||'').trim(); if(!hn)continue;
          if (hn.indexOf('Row key')===0){keyCol=cc;continue;} if(hn==='Match?')continue; if(hn.indexOf(' - Ashby')>-1)continue;
          if (hn==='Result'){ if(lastField)resCol[lastField]=cc; continue; } lastField=hn; }
        for (var rr=1; rr<ov.length; rr++){ var ok=String(ov[rr][keyCol]||'').trim(); if(!ok)continue;
          for (var fn in resCol){ var vv=String(ov[rr][resCol[fn]]==null?'':ov[rr][resCol[fn]]).trim(); if(vv){ (oldResult[ok]=oldResult[ok]||{})[fn]=vv; } } }
      }
    }
  } catch(eO){}

  // ---- build rows ----
  var head = ['Row key (email or job|date|recruiter)'], fi;
  for (fi=0; fi<FIELDS.length; fi++) head.push(FIELDS[fi].name, FIELDS[fi].name+' - Ashby', 'Match?', 'Result');
  head.push('Which Ashby record', 'Row status');
  var t1 = [head], closures = 0, matched = 0;

  for (i=0; i<trk.length; i++) {
    var tr = trk[i], key = rowKey(tr);
    var list = tr.email ? (byEmail[tr.email] || []) : [];
    var m = list.length ? chooseRecord(list) : null;
    if (m) matched++;
    var isClosure = /Joined|Joining Pending|Dropped/.test(tr.status);
    if (isClosure) closures++;
    var line = [key];
    var ajob = m ? (m.jobTitle || '') : '';
    for (fi=0; fi<FIELDS.length; fi++) {
      var f = FIELDS[fi], tv = f.t(tr), av = m ? f.a(m) : '', mm = '';
      if (f.c === 'found')      mm = m ? 'Yes' : (isClosure ? 'No' : 'n/a');
      else if (!m)              mm = (f.c === 'na') ? 'n/a' : 'n/a';
      else if (f.c === 'na')    mm = 'n/a';
      else if (f.c === 'role')  mm = roleOk(tv, av) ? 'Yes' : 'No';
      else if (f.c === 'rec')   { var nm2 = ashRecruiterNames(m); mm = (nm2.length===1 && nameMatch(tv, nm2[0])) ? 'Yes' : 'No'; }
      else                      mm = eq(tv, av);
      var res = (oldResult[key] && oldResult[key][f.name]) || '';
      if (!res && mm === 'No') {
        if (DONT_ACTION[f.name]) res = 'Not actioning';
        else if (TEAM_DASH[f.name] && ajob && jobGaps[ajob] && jobGaps[ajob][f.name] === '-') res = 'Not actioning';
      }
      if (mm === 'No' && !res) { actCount[f.name] = (actCount[f.name]||0) + 1;
        if (actionable.length < 300) actionable.push(tr.status + ' | ' + tr.job + ' | ' + f.name + ': HT "' + tv + '" vs Ashby "' + av + '"'); }
      line.push(tv, av, mm, res);
    }
    line.push(m ? (list.length>1?(list.length+' Ashby records'):'') : '', tr.status);
    t1.push(line);
  }

  // ---- write ONLY the V3 tab ----
  var sh = out.getSheetByName(V3_TAB);
  if (!sh) sh = out.insertSheet(V3_TAB);
  else { sh.clear().clearFormats(); sh.getRange(1,1,sh.getMaxRows(),sh.getMaxColumns()).clearDataValidations(); if(sh.getFrozenRows())sh.setFrozenRows(0); if(sh.getFrozenColumns())sh.setFrozenColumns(0); }
  sh.getRange(1,1,t1.length,head.length).setValues(t1);
  sh.getRange(1,1,1,head.length).setFontWeight('bold').setBackground('#334155').setFontColor('#ffffff');
  sh.setFrozenRows(1); sh.setFrozenColumns(1);
  for (fi=0; fi<FIELDS.length; fi++){ var aCol=3+fi*4; if(t1.length>1) sh.getRange(2,aCol,t1.length-1,1).setBackground('#f1f5f9'); sh.getRange(1,aCol).setBackground('#475569'); }
  var yn = SpreadsheetApp.newDataValidation().requireValueInList(['Yes','No','n/a'],true).setAllowInvalid(true).build();
  for (fi=0; fi<FIELDS.length; fi++) if(t1.length>1) sh.getRange(2,4+fi*4,t1.length-1,1).setDataValidation(yn);

  var actTot = 0; for (var an in actCount) actTot += actCount[an];
  Logger.log('v3 | ACTIONABLE (Match=No, Result blank): ' + actTot + ' | by field: ' + JSON.stringify(actCount));
  for (var ax = 0; ax < actionable.length; ax++) Logger.log('ACT :: ' + actionable[ax]);
  Logger.log('v3 | Q3-2026 opening rows: ' + (t1.length-1) + ' | closures: ' + closures + ' | matched to an Ashby offer: ' + matched);
  Logger.log('AUDIT SHEET: ' + out.getUrl());
  return out.getUrl();
}
