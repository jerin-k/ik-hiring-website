// ===== #185 - mark the stale offers Declined, ONE record first (27 Sep 2026) =====
// 37 offers sit at WaitingOnCandidateResponse while the candidate's application is ARCHIVED. Jerin: "Yes, cleaner
// ashby is a must!" - mark them Declined. His standing rule: ONE record, then look at it in the Ashby UI.
// Nothing here runs on a trigger. Every mode except 'write_one' is READ-ONLY.
//   'read'      list the stale offers (names only, no ids) and probe offer.setStatus's schema with a FAKE offer
//               id, beside an invented control endpoint (the 403-vs-404 test).
//   'dry_one'   find R185_TARGET inside the stale set (must match EXACTLY once) and log its BEFORE state. No write.
//   'write_one' the same, then ONE offer.setStatus, then the AFTER state 20 s later.
//   'write_rest' (Jerin's "Go", 27 Sep, after the test record checked out) every remaining stale offer - REFUSES
//               above R185_MAX_REST - then re-reads each one through offer.info.
// Jerin, 6 Sep: never write decidedAt. This file never sends it; BEFORE/AFTER shows whether Ashby stamps it.
var R185_MODE = 'worklog';           // ONE row to the audit sheet's 'V9 - Work log' (refuses if a #185 row exists)
var R185_MAX_REST = 36;               // 37 approved, 1 done as the test (Jaydeep Sharma) - never more
var R185_TARGET = 'Jaydeep Sharma';   // a candidate NAME - accepted only if it matches exactly one of the stale offers
var R185_APP8 = 'bb29666a';            // first 8 chars of the application I LOOKED AT in the Ashby UI - the write refuses any other
var R185_FIELD = 'acceptanceStatus';   // learned 27 Sep: 'Accepted'|'Declined'|'Cancelled'; a FAKE id gave offer_not_found

function run185() {
  Logger.log('#185 mode=' + R185_MODE);
  if (R185_MODE === 'read') { r185List(); r185Probe(); return; }
  if (R185_MODE === 'dry_one' || R185_MODE === 'write_one') return r185One(R185_MODE === 'write_one');
  if (R185_MODE === 'write_rest') return r185Rest();
  if (R185_MODE === 'verify10') return r185Verify10();
  if (R185_MODE === 'worklog') return r185WorkLog();
  throw new Error('unknown mode ' + R185_MODE);
}

// Every offer at WaitingOnCandidateResponse, each with its application. Returns [{o, a}].
function r185Waiting() {
  var cursor = null, out = [];
  do {
    var body = { limit: 100 }; if (cursor) body.cursor = cursor;
    var resp = ashbyPost_('/offer.list', body);
    (resp.results || []).forEach(function (o) {
      if (o.offerStatus !== 'WaitingOnCandidateResponse') return;
      // the SAME scope as the pipeline (DataRefresh.gs fetchAndProcessOffers_), so this is exactly the dashboard's 37
      var d = o.decidedAt || (o.latestVersion && o.latestVersion.createdAt);
      if (!d || new Date(d).getTime() < SCOPE_FROM_MS) return;
      out.push({ o: o });
    });
    cursor = (resp.moreDataAvailable && resp.nextCursor) ? resp.nextCursor : null;
  } while (cursor);
  out.forEach(function (x) { x.a = (ashbyPost_('/application.info', { applicationId: x.o.applicationId }).results) || {}; });
  return out;
}

function r185Name(a) { var c = a.candidate || {}; return c.name || ((c.firstName || '') + ' ' + (c.lastName || '')).trim(); }

function r185List() {
  var w = r185Waiting(), stale = w.filter(function (x) { return x.a.status === 'Archived'; });
  Logger.log('waiting on candidate: ' + w.length + ' | application ARCHIVED: ' + stale.length);
  stale.forEach(function (x, i) {
    var lv = x.o.latestVersion || {};
    Logger.log((i + 1) + ' | ' + r185Name(x.a) + ' | ' + ((x.a.job && x.a.job.title) || '') + ' | archived ' +
      String(x.a.archivedAt || '').substring(0, 10) + ' | opening ' + (lv.openingId ? 'YES' : 'no') +
      ' | acceptance ' + x.o.acceptanceStatus + ' | decidedAt ' + (x.o.decidedAt || 'null'));
  });
  w.filter(function (x) { return x.a.status !== 'Archived'; }).forEach(function (x) {
    Logger.log('LIVE - leave alone: ' + r185Name(x.a) + ' | ' + x.a.status);
  });
}

// Learn the schema without touching a real record: a FAKE offer id, and an invented endpoint as the control.
function r185Probe() {
  var fake = '00000000-0000-4000-8000-000000000000';
  [['/offer.zzInventedControl', { offerId: fake }],
   ['/offer.setStatus', { offerId: fake }],
   ['/offer.setStatus', { offerId: fake, status: 'Declined' }],
   ['/offer.setStatus', { offerId: fake, offerStatus: 'Declined' }],
   ['/offer.setStatus', { offerId: fake, acceptanceStatus: 'Declined' }]
  ].forEach(function (c) {
    var r = ashbyWrite_(c[0], c[1]);
    Logger.log('PROBE ' + c[0] + ' ' + JSON.stringify(c[1]).replace(fake, 'FAKE') + ' -> HTTP ' + r.code + ' ' +
      String(r.text).substring(0, 400));
  });
}

function r185Snap(offerId, appId) {
  var oi = (ashbyPost_('/offer.info', { offerId: offerId }).results) || {};
  var ai = (ashbyPost_('/application.info', { applicationId: appId }).results) || {};
  var lv = oi.latestVersion || {};
  return { offerStatus: oi.offerStatus, acceptanceStatus: oi.acceptanceStatus, decidedAt: oi.decidedAt || null,
    versions: (oi.versions || []).length, latestVersionCreated: lv.createdAt || null, opening: lv.openingId ? 'YES' : 'no',
    appStatus: ai.status, archivedAt: ai.archivedAt || null,
    stage: (ai.currentInterviewStage && ai.currentInterviewStage.title) || null,
    archiveReason: (ai.archiveReason && ai.archiveReason.text) || null };
}

function r185One(doWrite) {
  var stale = r185Waiting().filter(function (x) { return x.a.status === 'Archived'; });
  var hits = stale.filter(function (x) { return r185Name(x.a) === R185_TARGET; });
  Logger.log('stale offers: ' + stale.length + ' | matching "' + R185_TARGET + '": ' + hits.length);
  if (hits.length !== 1) throw new Error('target must match EXACTLY one stale offer - matched ' + hits.length + '. Nothing written.');
  var x = hits[0], c = x.a.candidate || {};
  var em = (c.primaryEmailAddress && c.primaryEmailAddress.value) || '';
  var app8 = String(x.o.applicationId || '').substring(0, 8);
  Logger.log('TARGET ' + r185Name(x.a) + ' | ' + ((x.a.job && x.a.job.title) || '') + ' | email ' + em + ' | app ' + app8);
  if (app8 !== R185_APP8) throw new Error('application ' + app8 + ' is not the one checked in the UI (' + R185_APP8 + '). Nothing written.');
  Logger.log('BEFORE ' + JSON.stringify(r185Snap(x.o.id, x.o.applicationId)));
  if (!doWrite) { Logger.log('DRY RUN - nothing written.'); return; }
  if (!R185_FIELD) throw new Error('R185_FIELD is blank - run the read probe first. Nothing written.');
  var body = { offerId: x.o.id }; body[R185_FIELD] = 'Declined';
  var r = ashbyWrite_('/offer.setStatus', body);
  Logger.log('WRITE offer.setStatus -> HTTP ' + r.code + ' ok=' + r.ok + ' ' +
    String(r.text).substring(0, 400).split(x.o.id).join('OFFER'));
  Utilities.sleep(20000);   // info/list endpoints can lag a write
  Logger.log('AFTER  ' + JSON.stringify(r185Snap(x.o.id, x.o.applicationId)));
}

// The other 36. Each is re-checked just before its write; afterwards every one is re-read through offer.info and
// must be: Declined · decidedAt still null · the SAME latest version · its opening link exactly as before.
function r185Rest() {
  var stale = r185Waiting().filter(function (x) { return x.a.status === 'Archived'; });
  Logger.log('stale offers now: ' + stale.length + ' (cap ' + R185_MAX_REST + ')');
  if (stale.length > R185_MAX_REST) throw new Error('found ' + stale.length + ' - more than the ' + R185_MAX_REST + ' approved. Nothing written.');
  var before = {}, ok = 0, bad = 0;
  stale.forEach(function (x) {
    var lv = x.o.latestVersion || {};
    before[x.o.id] = { v: lv.id || null, op: !!lv.openingId, name: r185Name(x.a) };
  });
  stale.forEach(function (x, i) {
    if (x.a.status !== 'Archived' || x.o.offerStatus !== 'WaitingOnCandidateResponse') { Logger.log('SKIP ' + r185Name(x.a)); return; }
    var r = ashbyWrite_('/offer.setStatus', { offerId: x.o.id, acceptanceStatus: 'Declined' });
    var res = (r.json && r.json.results) || {}, lv = res.latestVersion || {}, b = before[x.o.id];
    var good = r.ok && res.acceptanceStatus === 'Declined';
    if (good) ok++; else bad++;
    Logger.log('W' + (i + 1) + ' | ' + b.name + ' | app ' + String(x.o.applicationId).substring(0, 8) + ' | HTTP ' + r.code +
      ' ok=' + r.ok + ' | ' + res.acceptanceStatus + '/' + res.offerStatus + ' | decidedAt ' + (res.decidedAt || 'null') +
      ' | sameVersion ' + (lv.id === b.v) + ' | opening ' + (b.op ? 'YES' : 'no') + '>' + (lv.openingId ? 'YES' : 'no') +
      (good ? '' : ' | ERR ' + String(r.text).substring(0, 200).split(x.o.id).join('OFFER')));
    Utilities.sleep(300);
  });
  Logger.log('WRITTEN ok=' + ok + ' failed=' + bad);
  Utilities.sleep(20000);   // info/list endpoints can lag a write
  var fine = 0, notFine = [];
  Object.keys(before).forEach(function (id) {
    var oi = (ashbyPost_('/offer.info', { offerId: id }).results) || {}, lv = oi.latestVersion || {}, b = before[id];
    var f = oi.acceptanceStatus === 'Declined' && !oi.decidedAt && lv.id === b.v && (!!lv.openingId) === b.op;
    if (f) fine++; else notFine.push(b.name + ' [' + oi.acceptanceStatus + ', decidedAt ' + (oi.decidedAt || 'null') +
      ', sameVersion ' + (lv.id === b.v) + ', opening ' + (b.op ? 'YES' : 'no') + '>' + (lv.openingId ? 'YES' : 'no') + ']');
  });
  Logger.log('VERIFY offer.info: fine=' + fine + ' of ' + Object.keys(before).length + (notFine.length ? ' | NOT FINE: ' + notFine.join(' ; ') : ''));
  var still = r185Waiting().filter(function (x) { return x.a.status === 'Archived'; });
  Logger.log('RE-LIST: 2026 offers still waiting with an archived application = ' + still.length +
    (still.length ? ' (list endpoints can lag a write) -> ' + still.map(function (x) { return r185Name(x.a); }).join(', ') : ''));
}

// READ-ONLY. The 10 the API refused ("running offer process"); Jerin pressed Set Response -> Declined on 7 of them in the
// UI (27 Sep). For each: the response, decidedAt, how many versions, the latest version's date and its opening link.
// Before: all Pending, decidedAt null, 7 with an opening, latest version dated 23 Jul - 18 Sep (the offer dates).
var R185_CHECK = ['Binu Mathew', 'Abdul Rohan Syed', 'Rohan Singh Poona', 'Tejus H P', 'Jana Gopi', 'Yatisha M',
  'Rishabh Tripathi', 'Kousick Kadambi', 'Manish Shahi', 'Najma'];
function r185Verify10() {
  var cursor = null, cand = [], cut = new Date('2026-07-20T00:00:00Z').getTime(), seen = {};
  do {
    var body = { limit: 100 }; if (cursor) body.cursor = cursor;
    var resp = ashbyPost_('/offer.list', body);
    (resp.results || []).forEach(function (o) {
      var lv = o.latestVersion || {};
      if ((o.offerStatus === 'CandidateRejected' || o.offerStatus === 'WaitingOnCandidateResponse') &&
          lv.createdAt && new Date(lv.createdAt).getTime() >= cut) cand.push(o);
    });
    cursor = (resp.moreDataAvailable && resp.nextCursor) ? resp.nextCursor : null;
  } while (cursor);
  Logger.log('recent offers not accepted: ' + cand.length);
  cand.forEach(function (o) {
    var a = (ashbyPost_('/application.info', { applicationId: o.applicationId }).results) || {}, n = r185Name(a);
    if (R185_CHECK.indexOf(n) < 0 || a.status !== 'Archived') return;
    var oi = (ashbyPost_('/offer.info', { offerId: o.id }).results) || {}, lv = oi.latestVersion || {};
    seen[n] = 1;
    Logger.log('V | ' + n + ' | ' + oi.acceptanceStatus + '/' + oi.offerStatus + ' | decidedAt ' + (oi.decidedAt || 'null') +
      ' | versions ' + (oi.versions || []).length + ' | latest ' + String(lv.createdAt || '').substring(0, 10) +
      ' | opening ' + (lv.openingId ? 'YES' : 'no') + ' | app ' + a.status);
  });
  Logger.log('not found: ' + (R185_CHECK.filter(function (n) { return !seen[n]; }).join(', ') || 'none'));
}

// The record of the work (Jerin's standing rule: every completed Ashby fix goes in 'V9 - Work log', never the Result
// column). Columns: Date | Task | What | Count | Method | Verified how | Status. Refuses to add a second #185 row.
function r185WorkLog() {
  var sh = SpreadsheetApp.openById(AUDIT_SHEET_ID).getSheetByName('V9 - Work log');
  if (!sh) throw new Error('tab V9 - Work log not found. Nothing written.');
  var hdr = sh.getRange(1, 1, 1, 7).getValues()[0].join('|');
  if (hdr !== 'Date|Task|What|Count|Method|Verified how|Status') throw new Error('unexpected header: ' + hdr + '. Nothing written.');
  var tasks = sh.getRange(1, 2, sh.getLastRow(), 1).getValues().map(function (r) { return String(r[0]).trim(); });
  if (tasks.indexOf('#185') >= 0) { Logger.log('a #185 row already exists - nothing written.'); return; }
  sh.appendRow(['2026-09-27', '#185',
    'Stale offers marked Declined: offer still read "waiting on candidate" while the candidate\'s application was ARCHIVED ' +
    '(2026 offers, 37 found). 27 via the API (Jaydeep Sharma first as the test, checked in the UI, then 26 more). ' +
    'The API refused 10 as a "running offer process" (sent for e-signature, request expired, never closed); Jerin set 7 of ' +
    'them by hand in the UI (Set Response > Declined). 3 NOT DONE and cannot be: Binu Mathew, Abdul Rohan Syed, Tejus H P - ' +
    'open e-signature process AND no opening on the offer, so neither the API nor the UI will set a response. ' +
    'Note: the UI route stamps decidedAt (27 Sep) on the 7; the API route does not.',
    34,
    'API offer.setStatus {acceptanceStatus: Declined} from Run185.gs (Apps Script; one record, then the rest, capped at 36) ' +
    '+ Ashby UI Set Response by Jerin (7)',
    'offer.info re-read on all 34: Declined, same offer version, opening link unchanged (the 7 with an opening kept it), ' +
    'application still Archived. Ashby UI by eye: Jaydeep Sharma, K Balambigai, Jason X read "Offer Declined"; feed unchanged ' +
    '(no email sent). Dashboard: Data Hygiene offers-with-no-opening expected 413 -> 386 at the next refresh.',
    'Done - 34 of 37; 3 cannot be closed']);
  Logger.log('work log row written at row ' + sh.getLastRow());
}
