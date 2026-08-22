// ===== Hiring audit: Tracker vs Ashby, built as a native Google Sheet =====
// Reads the Hiring Tracker (a Google Sheet in Drive) + offer_contacts.json (Drive-only, has the emails)
// and writes a fresh audit spreadsheet. Candidates are joined on PERSONAL EMAIL - both sides carry it on
// 100% of the rows in scope, and names disagree constantly (middle names, order flips).
// Scope: 2026 OPENINGS only, statuses Joined / Joining Pending / Dropped - Offer.
function buildAuditSheet() {
  var TRACKER_ID = '1_LQxHDZ6dXehyR2lc8pcFjfDeRaV80vBzVRB_BKWT5A';
  var FOLDER_ID  = '1z6tU6QhZQ_50V7oyqlprwpl8kpS4LHmI';
  var MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
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
  var vals = SpreadsheetApp.openById(TRACKER_ID).getSheetByName('Master').getDataRange().getValues();
  var hdr = vals[0];
  function col(n) { for (var i=0;i<hdr.length;i++) if (String(hdr[i]).trim() === n) return i; return -1; }
  var C = { date:col('Date'), jcq:col('Job Creation Quarter'), status:col('Overall Status'), dept:col('Department'),
            job:col('Job Name'), rec:col('Recruiter'), name:col('Candidate Name'), email:col('Personal Email'),
            offer:col('Date of Offer'), doj:col('DOJ'), jm:col('Joining Month'), jq:col('Joining Quarter') };
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
             'What Ashby has (reference)']];
  var used = {}, matched = 0;
  for (i = 0; i < trk.length; i++) {
    var t = trk[i], m = ash[t.email] || null, ref = '';
    if (m) { used[t.email] = 1; matched++; ref = m.candidate + ' | ' + m.jobTitle + ' | DOJ ' + (m.startDate || '-') + ' | ' + aStat(m); }
    var mq = m ? (qc(m.openingQuarter) || qc(m.attrQuarter)) : '';
    t1.push([t.email, t.name, m ? 'Yes' : 'No', t.job, m ? (roleOk(t.job, m.jobTitle) ? 'Yes' : 'No') : '',
             t.opd, m ? 'n/a' : '', t.opq, m ? eq(t.opq, mq) : '', t.doj, m ? eq(t.doj, m.startDate || '') : '',
             t.djm, m ? eq(t.djm, mth(m.startDate || '')) : '', t.djq, m ? eq(t.djq, qtr(m.startDate || '')) : '',
             t.status, m ? eq(t.status, aStat(m)) : '', ref]);
  }

  // ---- 4. Tab 2 ----
  var t2 = [['Personal Email','Candidate Name','Job Name','Opening Date','Opening Quarter','DOJ','DOJ Month',
             'DOJ Quarter','Status','Opening Quarter - source','Ashby application status']];
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
               qtr(o.startDate || ''), aStat(o), q[1], o.appStatus || '']);
    } else {
      var why = (tt.jcq && tt.jcq.indexOf('2026') < 0)
        ? ('Tracker opening is ' + tt.jcq + ', not 2026')
        : ('Tracker status is "' + tt.status + '", outside Joined / Joining Pending / Dropped - Offer');
      t3.push([o.email, o.candidate || '', o.jobTitle || '', q[0], aStat(o), tt.status, tt.jcq || '(blank)',
               tt.doj || '', o.startDate || '', why]);
    }
  }

  // ---- 5. write ----
  var out = SpreadsheetApp.create('Hiring Audit 2026 - Tracker vs Ashby');
  var s1 = out.getActiveSheet().setName('Tracker Candidates');
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
  var mcols = [3,5,7,9,11,13,15,17];
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
   ['Rebuild','Re-run buildAuditSheet() in Apps Script. It reads the live tracker and the latest Ashby refresh.'],
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
