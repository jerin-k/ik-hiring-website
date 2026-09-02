// ONE function on purpose - the run selector picks the FIRST function of whichever file is open.
// (a) applies the Result dropdown to every Result column on 'Tracker Candidates v2',
// (b) verifies archived applications by reading them back from Ashby,
// (c) writes the Result cells for completed work. Extend WRITES/VERIFY and re-run.
var AUDIT_ID_ = '1U6Wi5uXLZ8hOhGKP2tyH--jHcEbUEvXgAPxbkUofTNA';
var RESULT_OPTS_ = ['Fixed-Ashby', 'Pending', 'Fixed-HT', 'cant-be-done', 'Not actioning'];

function applyAuditResults() {
  // --- case C archives done 2 Sep: appId -> name ---
  var VERIFY = [
    ['6a33dbef-6d52-4940-931a-0129f978d6bf', 'Biswajit Pradhan'],
    ['2cf2b23a-ffde-423e-80bf-d2e762f50a89', 'Alex Games'],
    ['5c0e541d-fff4-4a43-bbc9-a178c36aa9a6', 'Jiju John'],
    ['5a412617-2382-4fa4-95ec-98ab59ec6cc7', 'Tunde Aderinwale'],
    ['ece8eac7-3bcc-478b-80eb-35f19f1c3e80', 'Brandi Richardson'],
    ['278e9b2e-946e-4643-9e77-75942916214e', 'Bhavna Kohli'],
    ['d1662a44-f18a-465f-8cff-ab592424a65e', 'Bipradeep Ghosh'],
    ['74b31d27-177f-428c-8121-b3448d1c8cca', 'Pankaj Sharma'],
    ['db04011d-74bd-4651-b043-79fc20bb97d2', 'Shaik Baba Fakruddin'],
    ['f5d60d36-2033-40cd-a723-923264bd5504', 'Jana Gopi'],
    ['d2dc1f65-abad-4e71-98e6-ed711d77ea18', 'Priya Choudhary'],
    ['7b311930-6fd4-48ee-9222-4a951defc364', 'Rohan Singh Poona'],
    ['2107591f-4bb3-46b9-959b-5574d8e90aef', 'Kousick Kadambi']
  ];
  var okCount = 0, bad = [];
  for (var i = 0; i < VERIFY.length; i++) {
    var st = '?', ar = '';
    try {
      var r = ashbyPost_('/application.info', { applicationId: VERIFY[i][0] });
      var res = (r && r.results) || null;
      if (res) { st = res.status || '?'; ar = (res.archiveReason && res.archiveReason.text) || res.archiveReasonId || ''; }
    } catch (e) { st = 'THREW ' + e.message; }
    if (st === 'Archived') { okCount++; } else { bad.push(VERIFY[i][1] + ' -> ' + st); }
    Logger.log(VERIFY[i][1] + ' :: status ' + st + ' :: reason ' + ar);
  }
  Logger.log('ARCHIVED VERIFIED: ' + okCount + ' of ' + VERIFY.length + (bad.length ? ' | NOT ARCHIVED: ' + bad.join('; ') : ''));

// 🔒 REDACTED 22 Oct 2026: the 15 candidate email addresses that used to sit in WRITES were
// personal data in a PUBLIC repo (every .gs here is mirrored to jerin-k/ik-hiring-website by
// pushSourceToGitHub). This is a V4-era ONE-OFF that has already run and must never be used for
// V9, so the keys are placeholders now and the row count is kept only as a record of 15 writes.
// CLAUDE.md rule 9. ⚠ They remain in the repo's HISTORY.
var WRITES = [
  ['redacted-01', 'Status', 'Fixed-Ashby'],
  ['redacted-02', 'Status', 'Fixed-Ashby'],
  ['redacted-03', 'Status', 'Fixed-Ashby'],
  ['redacted-04', 'Status', 'Fixed-Ashby'],
  ['redacted-05', 'Status', 'Fixed-Ashby'],
  ['redacted-06', 'Status', 'Fixed-Ashby'],
  ['redacted-07', 'Status', 'Fixed-Ashby'],
  ['redacted-08', 'Status', 'Fixed-Ashby'],
  ['redacted-09', 'Status', 'Fixed-Ashby'],
  ['redacted-10', 'Status', 'Fixed-Ashby'],
  ['redacted-11', 'Status', 'Fixed-Ashby'],
  ['redacted-12', 'Status', 'Fixed-Ashby'],
  ['redacted-13', 'Status', 'Fixed-Ashby'],
  ['redacted-14', 'Status', 'Fixed-Ashby'],
  ['redacted-15', 'Status', 'Fixed-Ashby']
];
  var sh = SpreadsheetApp.openById(AUDIT_ID_).getSheetByName('Tracker Candidates v2');
  if (!sh) { Logger.log('tab not found'); return; }
  var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  var head = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  var n = lastRow - 1;
  var dv = SpreadsheetApp.newDataValidation().requireValueInList(RESULT_OPTS_, true).setAllowInvalid(true).build();
  var resCol = {}, lastField = '', applied = 0;
  for (var c = 1; c <= lastCol; c++) {
    var hn = String(head[c - 1] || '').trim();
    if (hn.indexOf('Result') === 0) {
      if (n > 0) { sh.getRange(2, c, n, 1).setDataValidation(dv); applied++; }
      var fn = (hn === 'Result') ? lastField : hn.substring(6).trim();
      if (fn) { resCol[fn] = c; }
      continue;
    }
    if (hn === 'Match?') { continue; }
    if (hn.indexOf(' - Ashby') > -1) { continue; }
    lastField = hn;
  }
  var rowsOf = {};
  if (n > 0) {
    var em = sh.getRange(2, 1, n, 1).getValues();
    for (var r = 0; r < em.length; r++) {
      var e = String(em[r][0] || '').trim().toLowerCase();
      if (!e) { continue; }
      if (!rowsOf[e]) { rowsOf[e] = []; }
      rowsOf[e].push(r + 2);
    }
  }
  // picks the row for a write: by email, narrowed by the field's own value when given
  function pickRow_(email, field, want) {
    var cand = rowsOf[email] || [];
    if (!cand.length) { return 0; }
    if (!want) { return cand[0]; }
    var fieldCol = resCol[field] - 3;
    for (var i = 0; i < cand.length; i++) {
      if (String(sh.getRange(cand[i], fieldCol).getValue()).trim() === want) { return cand[i]; }
    }
    return 0;
  }
  var done = 0, miss = [];
  for (var w = 0; w < WRITES.length; w++) {
    var key = String(WRITES[w][0]).trim().toLowerCase(), fld = WRITES[w][1], val = WRITES[w][2];
    var cc = resCol[fld], rr = pickRow_(key, fld, WRITES[w][3]);
    if (!rr || !cc) { miss.push(key); continue; }
    sh.getRange(rr, cc).setValue(val);
    done++;
  }
  SpreadsheetApp.flush();
  var verified = 0;
  for (var v = 0; v < WRITES.length; v++) {
    var k2 = String(WRITES[v][0]).trim().toLowerCase();
    var c2 = resCol[WRITES[v][1]], r2 = pickRow_(k2, WRITES[v][1], WRITES[v][3]);
    if (r2 && c2 && String(sh.getRange(r2, c2).getValue()).trim() === WRITES[v][2]) { verified++; }
  }
  Logger.log('dropdown on ' + applied + ' Result columns | written ' + done + ' | verified on read-back ' + verified + ' | missed ' + miss.length + (miss.length ? ': ' + miss.join(',') : ''));
}