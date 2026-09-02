// Case A (tracker Joined / Ashby Offer Released) - helper for the PTI - Agentic AI (US) batch.
// ONE entry function per file: the run selector picks the FIRST function of the open file.
// MODE 'survey' is READ-ONLY. It writes a worklist tab on the audit sheet and nothing to Ashby.
var CASEA_MODE = 'survey';
var CASEA_JOB_ID = '3c1dbb02-7212-42c2-a397-7d96f6b92ec4';
var CASEA_JOB_TITLE = 'Part Time Instructor - Agentic AI (US)';
var CASEA_TAB = 'Case A - PTI';

function caseARun() {
  if (CASEA_MODE === 'survey') return caseASurvey_();
  throw new Error('unknown CASEA_MODE ' + CASEA_MODE);
}

function caseASurvey_() {
  var t0 = Date.now();
  // 1. every opening on the job (openings carry jobIds inside latestVersion)
  var ops = ashbyListAll_('/opening.list');
  var mine = ops.filter(function (o) { return JSON.stringify(o).indexOf(CASEA_JOB_ID) >= 0; });
  // 2. every offer, to see which opening is already taken and which application holds which offer
  var offers = ashbyListAll_('/offer.list');
  var takenBy = {}, byApp = {};
  offers.forEach(function (o) {
    var oid = o.latestVersion && o.latestVersion.openingId;
    if (oid) (takenBy[oid] = takenBy[oid] || []).push(o.applicationId.substring(0, 8) + ':' + o.acceptanceStatus);
    (byApp[o.applicationId] = byApp[o.applicationId] || []).push(o);
  });
  // 3. the PTI candidates still sitting on an offer, from the Drive-only contacts file
  var it = DriveApp.getFilesByName('offer_contacts.json');
  if (!it.hasNext()) throw new Error('offer_contacts.json not found');
  var rows = JSON.parse(it.next().getBlob().getDataAsString()).rows;
  var want = rows.filter(function (r) { return r.jobTitle === CASEA_JOB_TITLE && r.appStatus !== 'Hired' && r.appStatus !== 'Archived'; });

  var out = [['section', 'candidate', 'email', 'applicationId', 'candidateId', 'appStatus', 'stage', 'offerId', 'acceptance', 'offerStatus', 'offerOpeningId', 'offerStartDate', 'nOffers']];
  want.forEach(function (w) {
    var info = null;
    try { info = ashbyPost_('/application.info', { applicationId: w.applicationId }).results; } catch (e) { info = null; }
    var os = byApp[w.applicationId] || [];
    // prefer the most recently created offer
    os.sort(function (a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); });
    var o = os[0] || null, lv = (o && o.latestVersion) || {};
    out.push(['APP', w.candidate, w.email, w.applicationId, info && info.candidate ? info.candidate.id : '',
      info ? info.status : '', info && info.currentInterviewStage ? info.currentInterviewStage.title : '',
      o ? o.id : '', o ? o.acceptanceStatus : '', o ? o.offerStatus : '', lv.openingId || '',
      (lv.startDate || '').substring(0, 10), os.length]);
    Utilities.sleep(60);
  });
  out.push(['OPENINGS', 'id', 'identifier', 'openingState', 'openedAt', 'isArchived', 'takenBy(offers)', 'jobIds', 'keys']);
  mine.forEach(function (o) {
    var lv = o.latestVersion || {};
    out.push(['OP', o.id, lv.identifier || '', o.openingState || '', (o.openedAt || '').substring(0, 10), String(o.isArchived),
      (takenBy[o.id] || []).join(';'), (lv.jobIds || []).join(';'), Object.keys(o).join(',')]);
  });
  var ss = SpreadsheetApp.openById(AUDIT_SHEET_ID);
  var sh = ss.getSheetByName(CASEA_TAB) || ss.insertSheet(CASEA_TAB);
  sh.clear();
  var width = 0; out.forEach(function (r) { if (r.length > width) width = r.length; });
  out.forEach(function (r) { while (r.length < width) r.push(''); });
  sh.getRange(1, 1, out.length, width).setValues(out);
  Logger.log('caseA survey | openings on job ' + mine.length + ' of ' + ops.length + ' | offers ' + offers.length + ' | PTI apps ' + want.length + ' | ' + Math.round((Date.now() - t0) / 1000) + 's');
}
