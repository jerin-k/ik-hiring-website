// ===== ASSESSED / PROGRESSED ‚Äî the real throughput measure (2026-08-30) =====
// Replaces reached/cleared, which counted a rejection exactly like a promotion: `cleared` only ever meant
// "this stage row has a leftStageAt", so App Review read 99 -> 99 = 100% and Ref Check 18 -> 18 = 100%.
// Jerin, seeing the grid: "the throughput data looks wrong" ‚Äî it was.
//
// A ‚Äî ASSESSED AT A STAGE. Someone actually looked at the candidate there:
//     1. an interview HELD at that stage        (interviewSchedule.list, not Cancelled, start time passed)
//     2. an assignment TRIGGERED at that stage  (takeHomeAssignment.list, not Cancelled)
//     3. a feedback form with NO interview behind it (applicationFeedback.list)
// B ‚Äî PROGRESSED. Of those, the ones who afterwards entered a LATER stage.
//
// üö® Signal 3 is deliberately only the UNMATCHED forms. Where an interview exists it already carries its
// own stage, exactly, and counting its feedback as well adds nothing ‚Äî 1,340 of 5,802 forms are attached
// to an interview. The other 4,462 have none: someone opened a candidate at App Review, TA Screen or HM
// Review and hit select/reject. Those are the whole value of the signal, and the only reason the review
// stages become measurable at all. Jerin spotted the redundancy before it was built.
//
// üö® DEDUPE: one APPLICATION counts once per stage per quarter, however many signals it produced. But one
// person legitimately appears at SEVERAL stages ‚Äî the dedupe is within a stage, not across them, so the
// stage rows must never be summed. B is a SUBSET of A, so a rate can never exceed 100%.

var ASSESS_ORDER = smAssessOrder();
var ASSESS_IDX = (function () { var m = {}; for (var i = 0; i < ASSESS_ORDER.length; i++) m[ASSESS_ORDER[i]] = i; return m; })();
// The exit side of the headline span: whichever of these a candidate reaches first.
var ASSESS_SPAN_END = { refCheck: 1, docSub: 1, offer: 1 };
// The entry side: assessed at R1 or Online Assessment, whichever comes first.
var ASSESS_SPAN_START = { r1: 1, oa: 1 };

// Ref Check, Documentation and Offer are ADMINISTRATIVE stages - nobody is interviewed or assessed there,
// so the three assessment signals barely touch them (all of 2026: refCheck 11, offer 39, docSub 52). For
// these the measure is CANDIDATES ADDED - the day they entered the stage - against candidates who then
// progressed. Same shape as every other cell, honest wording (Jerin, 2026-08-31).
var ASSESS_ADDED = { refCheck: 1, docSub: 1, offer: 1 };

// #210 (Jerin, 8 Oct 2026) - LIVE since 8 Oct. Measured first, then published on his word.
// (d) The rounds are an UNORDERED POOL: "R2 might happen before R1." A move to any OTHER round is progress.
//     A move back into a screening stage is NOT - he asked about round order, not about returning to screening.
var ASSESS_ROUND_POOL = smRoundPool();
// (a) App Review and HM Review are REVIEWS, not interviews: an unmatched feedback form saw only 41 and 19
//     people in a quarter. Count everyone ADDED instead, as Ref Check / Doc / Offer do. TA Screen is NOT
//     included - real screening calls happen there and are already picked up.
var ASSESS_ADDED_210 = smAddedPool();

function assessQ_(day) {
  if (!day || day.length < 7) return null;
  return day.substring(0, 4) + '-Q' + (Math.floor((parseInt(day.substring(5, 7), 10) - 1) / 3) + 1);
}

// Signal 1 ‚Äî interviews HELD, per application per stage, earliest day.
// Also returns the event end times keyed (applicationId|userId), which is how a feedback form is matched
// back to the interview it was written about ‚Äî the same match the interviewer turnaround already uses.
function assessInterviews_(includeFuture) {
  var rows = [];
  try { rows = ashbyListAll_('/interviewSchedule.list', { createdAfter: Date.UTC(new Date().getFullYear(), 0, 1) }); }
  catch (e) { Logger.log('assess: interviewSchedule.list failed: ' + e.message); return { byApp: {}, ends: {} }; }
  var ids = {};
  rows.forEach(function (s) { if (s.interviewStageId) ids[s.interviewStageId] = 1; });
  var titles = tofuStageTitles_(Object.keys(ids));
  var byApp = {}, ends = {}, kept = 0, cancelled = 0, unmapped = {}, future = 0;
  var nowMs = Date.now();
  rows.forEach(function (s) {
    if (!s.applicationId) return;
    if (String(s.status || '') === 'Cancelled') { cancelled++; return; }
    var title = titles[s.interviewStageId] || '';
    var k = stageKeyFor(title);   // #236a
    if (!k) { if (title) unmapped[title] = (unmapped[title] || 0) + 1; return; }
    var evs = s.interviewEvents || [];
    for (var i = 0; i < evs.length; i++) {
      var ev = evs[i];
      var stMs = ev.startTime ? new Date(ev.startTime).getTime() : 0;
      if (!stMs) continue;
      // Ashby has no "attended" flag. A non-cancelled interview whose time has passed is the closest
      // thing to it ‚Äî a booking still in the future has assessed nobody yet.
      // #232 (Jerin, 14 Oct 2026): MOMENTUM is the one measure that wants the future. It asks when somebody
      // was first evaluated and dates an interview by when it is HELD, so a booking already on the calendar
      // belongs on its own future day - "We should also include bookings for the future dates."
      // ONLY tofuInterviewHeldDays_() MAY PASS includeFuture. The three assessed-rollup callers must not: an
      // interview not yet held has assessed nobody, so Throughput would read a booking as an assessment and
      // its rate would fall for no reason at all.
      var isFuture = stMs > nowMs;
      if (isFuture) { future++; if (!includeFuture) continue; }
      var day = String(ev.startTime).substring(0, 10);
      var a = byApp[s.applicationId] || (byApp[s.applicationId] = {});
      if (!a[k] || day < a[k]) a[k] = day;
      kept++;
      // #232: a booking that has not happened cannot have produced feedback, so a future event never
      // joins "ends" - that map exists only to match a feedback form back to its interview.
      if (isFuture) continue;
      var endMs = ev.endTime ? new Date(ev.endTime).getTime() : 0;
      var uids = ev.interviewerUserIds || [];
      for (var u = 0; u < uids.length; u++) {
        if (!uids[u] || !endMs) continue;
        var key = s.applicationId + '|' + uids[u];
        (ends[key] || (ends[key] = [])).push(endMs);
      }
    }
  });
  var un = Object.keys(unmapped);
  Logger.log('assess interviews: ' + rows.length + ' schedules -> ' + kept + ' events held (cancelled ' + cancelled
    + ', not yet held ' + future + (includeFuture ? ' KEPT (#232)' : ' skipped') + ')' + (un.length ? ', UNMAPPED stage titles: ' + un.join(', ') : ''));
  return { byApp: byApp, ends: ends };
}

// Signal 2 ‚Äî assignments triggered, per application per stage, earliest day.
function assessAssignments_() {
  var rows = [];
  try { rows = ashbyListAll_('/takeHomeAssignment.list'); }
  catch (e) { Logger.log('assess: takeHomeAssignment.list failed: ' + e.message); return {}; }
  var ids = {};
  rows.forEach(function (t) { if (t.interviewStageId) ids[t.interviewStageId] = 1; });
  var titles = tofuStageTitles_(Object.keys(ids));
  var byApp = {}, kept = 0, cancelled = 0;
  rows.forEach(function (t) {
    if (!t.applicationId || !t.createdAt) return;
    if (t.status === 'Cancelled') { cancelled++; return; }
    var k = stageKeyFor(titles[t.interviewStageId] || '');   // #236a
    if (!k) return;
    var day = String(t.createdAt).substring(0, 10);
    var a = byApp[t.applicationId] || (byApp[t.applicationId] = {});
    if (!a[k] || day < a[k]) a[k] = day;
    kept++;
  });
  Logger.log('assess assignments: ' + rows.length + ' rows -> ' + kept + ' kept (cancelled ' + cancelled + ')');
  return byApp;
}

// Signal 3 ‚Äî feedback with NO interview behind it. Returns [{ app, day }].
// A form counts as "behind an interview" when the same person wrote it after one of that candidate's
// interview events ended. Those are dropped: the interview already counted, exactly, at its own stage.
// ===== #222 - VENDOR ASSESSMENTS, read through a saved Ashby REPORT (12 Oct 2026) =====
// Ashby exposes an assessment TRIGGER through NO object endpoint at all - only through Reports. The take-home
// endpoint above (/takeHomeAssignment.list) sees a different, much smaller population: of the 783 assessments
// HackerEarth and Truffle actually ran, Interview Traction could see 22. This closes that hole.
//
// THE REPORT'S SUBJECT IS THE WHOLE DESIGN (Jerin: "assessment could be HackerEarth or anthing else as well,
// like Truffle being used for US Program advisor. Fool proof it, based on any type of assessment triggers in any
// stage."). Subject = `Assessments`, so EVERY assessment is one row whatever tool ran it and whatever stage it
// fired in, and `Integration Partner` merely names the vendor. A tool wired in tomorrow appears on its own, with
// no change here. There are no per-vendor columns and no vendor list to maintain.
//
// WHAT COUNTS - Jerin's rulings, 12 Oct, settled:
//   Complete (321) + Started (167) = 488. 'Started' means SENT and not finished, which is a real negative
//   OUTCOME - "not started will also count as failed - which is the right thing to do" - so it must be visible,
//   not dropped. Cancelled (41) is out: "a cancelled assessment is not an evaluation".
//   Waiting to Start (231) and Starting (23) are out because they were NEVER SENT - verified in the Ashby UI,
//   where a "Start Assessment" button is still waiting for a RECRUITER to press it. Those 231 are task #223,
//   a process problem, and deliberately not a number on this grid.
//   Dedupe one per (application + assessment name); two DIFFERENT assessments both count.
//
// 'THE REPORT CANNOT SUPPLY THE STAGE.' `Scheduled in Stage Name` is null on all 783 rows - an assessment has no
// interview attached, so the related Interview entity is empty. The stage is INFERRED from our own stage history
// through assessStageAt_(), exactly as an unmatched feedback form already is. It is an inference, and it is
// labelled as one wherever it is shown.
var ASSESS_REPORT_ID = '1e5e5d45-b5d9-45fb-8e4c-d37325bc0cea';   // "Dashboard feed - Assessments (all partners)"
var ASSESS_REPORT_COUNTS = { 'Complete': 1, 'Started': 1 };
var ASSESS_MONTHS_ = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
                       jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };

// The report returns a HUMAN date ("07 Oct 2026 19:19"), not the ISO stamp every other pipeline field carries.
// Returns null rather than guessing, so an unparseable date is counted and logged instead of silently becoming
// today.
function assessReportDay_(s) {
  if (!s) return null;
  s = String(s).trim();
  var iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[1] + '-' + iso[2] + '-' + iso[3];
  var m = s.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})/);
  if (m) {
    var mo = ASSESS_MONTHS_[m[2].toLowerCase()];
    if (mo) return m[3] + '-' + mo + '-' + (m[1].length === 1 ? '0' + m[1] : m[1]);
  }
  return null;
}

// `reportData`'s exact shape is NOT documented by Ashby. Normalise whatever comes back to
// { shape, header:[names], rows:[[cells]] } and report WHICH shape was found, so a change at Ashby's end is
// loud in the log instead of silently producing zero.
function assessReportShape_(rd) {
  if (!rd) return null;
  var isArr = function (v) { return Object.prototype.toString.call(v) === '[object Array]'; };
  var hdr = null, rows = null;
  if (isArr(rd)) {
    if (!rd.length) return null;
    if (isArr(rd[0])) { hdr = rd[0]; rows = rd.slice(1); }
    else { hdr = Object.keys(rd[0]); rows = rd; }
  } else {
    rows = rd.rows || rd.data || rd.values || null;
    if (!rows || !rows.length) return null;
    hdr = rd.columns || rd.headers || rd.columnNames || null;
    if (hdr && hdr.length && typeof hdr[0] === 'object' && hdr[0] !== null) {
      hdr = hdr.map(function (c) { return c.title || c.name || c.label || c.header || String(c); });
    }
    if (!hdr && isArr(rows[0])) { hdr = rows[0]; rows = rows.slice(1); }
    if (!hdr && !isArr(rows[0])) hdr = Object.keys(rows[0]);
  }
  if (!hdr || !rows) return null;
  // 'ASHBY SENDS BOTH' - a `columns` list AND the same header repeated as rows[0] - measured 12 Oct 2026, where it
  // showed up as a phantom row whose Activity Status was the literal text "Assessment's Activity Status". It never
  // reached a count (it matches no status we keep) but it inflated the row total by one. Drop it when it is there.
  if (rows.length && isArr(rows[0])) {
    var same = rows[0].length === hdr.length;
    for (var z = 0; same && z < hdr.length; z++) if (String(rows[0][z]) !== String(hdr[z])) same = false;
    if (same) rows = rows.slice(1);
  }
  var shape = isArr(rd) ? 'bare' : 'wrapped';
  if (rows.length && !isArr(rows[0])) {                      // objects keyed by column name -> arrays
    shape += '-objects';
    rows = rows.map(function (o) { return hdr.map(function (h) { return o[h]; }); });
  } else {
    shape += '-arrays';
  }
  return { shape: shape, header: hdr.map(function (h) { return String(h); }), rows: rows };
}

// Columns are matched BY NAME, loosely (case and punctuation ignored), so reordering or retitling a column in
// the Ashby report builder cannot silently shift the join key onto the wrong field.
// 'ASHBY RETURNS THE WHOLE ENTITY PATH AS THE HEADER', not the field name you picked in the builder - measured
// 12 Oct 2026: the join key comes back as "Assessment's Job Consideration's Ashby Job Consideration ID", and the
// status as "Assessment's Activity Status". An exact match therefore finds NOTHING. So: exact first, then a
// unique SUFFIX, then a unique substring - and -2 (refuse) if two columns match, rather than guessing which.
function assessReportCol_(header, name) {
  var want = String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
  var norm = [], i;
  for (i = 0; i < header.length; i++) norm.push(String(header[i]).toLowerCase().replace(/[^a-z0-9]/g, ''));
  for (i = 0; i < norm.length; i++) if (norm[i] === want) return i;
  var hits = [];
  for (i = 0; i < norm.length; i++) {
    if (norm[i].length >= want.length && norm[i].substring(norm[i].length - want.length) === want) hits.push(i);
  }
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) return -2;
  hits = [];
  for (i = 0; i < norm.length; i++) if (norm[i].indexOf(want) >= 0) hits.push(i);
  if (hits.length === 1) return hits[0];
  return hits.length > 1 ? -2 : -1;
}

// Returns { byApp: { applicationId: [day, ...] }, stats: {...} }. NO stage - the caller infers it.
var ASSESS_REPORT_CACHE_ = null;
function assessReportAssessments_() {
  // One report.synchronous per run. refreshStageHistory reaches this from Throughput AND from Momentum, and the
  // call costs ~8 s; without this the same report would be pulled two or three times in a single run.
  if (ASSESS_REPORT_CACHE_) return ASSESS_REPORT_CACHE_;
  var empty = { byApp: {}, stats: { ok: false, rows: 0, kept: 0, status: {}, partner: {} } };
  var resp = null;
  try { resp = ashbyPost_('/report.synchronous', { reportId: ASSESS_REPORT_ID }); }
  catch (e) {
    Logger.log('assess report: report.synchronous FAILED: ' + e.message + ' - vendor assessments NOT counted this run');
    return empty;
  }
  var r = resp && resp.results;
  if (!r) { Logger.log('assess report: no `results` block - NOT counted'); return empty; }
  // The same endpoint also fronts the ASYNC path, so status must be read before reportData is trusted.
  var st = String(r.status || '').toLowerCase();
  if (st !== 'complete') {
    Logger.log('assess report: status "' + r.status + '" (' + (r.failureReason || 'no reason given')
      + ') - reportData NOT trusted, vendor assessments NOT counted this run');
    return empty;
  }
  var t = assessReportShape_(r.reportData);
  if (!t || !t.rows.length) {
    Logger.log('assess report: status complete but reportData unreadable (keys: '
      + (r.reportData ? Object.keys(r.reportData).join(',') : 'none') + ') - NOT counted');
    return empty;
  }
  var cApp = assessReportCol_(t.header, 'Ashby Job Consideration ID');
  var cSt  = assessReportCol_(t.header, 'Activity Status');
  var cDay = assessReportCol_(t.header, 'Assessment Sent Date');
  var cNm  = assessReportCol_(t.header, 'Assessment Name');
  var cPt  = assessReportCol_(t.header, 'Integration Partner');
  if (cApp < 0 || cSt < 0 || cDay < 0) {
    Logger.log('assess report: REQUIRED column ' + (cApp === -2 || cSt === -2 || cDay === -2 ? 'AMBIGUOUS' : 'missing')
      + ' (app=' + cApp + ' status=' + cSt + ' sent=' + cDay + '; -1 none, -2 more than one)'
      + ' in header [' + t.header.join(' | ') + '] - NOT counted');
    return empty;
  }
  var byApp = {}, seen = {}, byStatus = {}, byPartner = {};
  var kept = 0, noApp = 0, noDay = 0, dupes = 0;
  t.rows.forEach(function (row) {
    var s = String(row[cSt] == null ? '' : row[cSt]).trim();
    byStatus[s || '(blank)'] = (byStatus[s || '(blank)'] || 0) + 1;
    if (cPt >= 0) {
      var p = String(row[cPt] == null ? '' : row[cPt]).trim() || '(blank)';
      byPartner[p] = (byPartner[p] || 0) + 1;
    }
    if (!ASSESS_REPORT_COUNTS[s]) return;                       // Complete + Started only
    var app = String(row[cApp] == null ? '' : row[cApp]).trim();
    if (!app) { noApp++; return; }
    var day = assessReportDay_(row[cDay]);
    if (!day) { noDay++; return; }                              // every Complete/Started row carries a sent date
    var dk = app + '|' + String(cNm >= 0 ? (row[cNm] == null ? '' : row[cNm]) : '').trim();
    if (seen[dk]) { dupes++; return; }                          // the SAME assessment repeated - his ruling
    seen[dk] = 1;
    (byApp[app] || (byApp[app] = [])).push(day);
    kept++;
  });
  Logger.log('assess report [' + t.shape + ']: ' + t.rows.length + ' rows; status ' + JSON.stringify(byStatus)
    + '; partner ' + JSON.stringify(byPartner));
  Logger.log('assess report: ' + kept + ' counted (Complete+Started, deduped) across ' + Object.keys(byApp).length
    + ' applications; dropped ' + dupes + ' repeat, ' + noApp + ' with no application id, ' + noDay
    + ' with no usable sent date');
  ASSESS_REPORT_CACHE_ = { byApp: byApp, stats: { ok: true, shape: t.shape, header: t.header, rows: t.rows.length,
    kept: kept, apps: Object.keys(byApp).length, status: byStatus, partner: byPartner,
    noApp: noApp, noDay: noDay, dupes: dupes } };
  return ASSESS_REPORT_CACHE_;
}

// ===== #222b - STAGE HISTORY FOR THE ASSESSMENT POPULATION. Fetched ONCE and kept. =====
// Jerin, 12 Oct 2026, in full: "Why not." He was right. I had called 295 of the 496 assessments unplaceable;
// probe222b asked Ashby for all 294 of their applications and got all 294 back - 0 empty, 0 failed - which made
// 291 of the 295 placeable. 99%, not 41%.
//
// WHY THEY WERE MISSING, AND WHY THAT FOOLED ME: they were missing from OUR stores, not from Ashby.
// stage_events.json holds LIVE applications; archived_late_stage.json was built for Drop and only ever covered
// applications that reached Ref Check / Documentation / Offer. An assessment is exactly where people get REJECTED,
// so the archived assessment population was never in scope for either. A good explanation of an absence is not
// evidence that it cannot be fetched. [[feedback_ask-the-real-question]]
//
// ARCHIVED STAGE HISTORY IS FROZEN (CLAUDE.md rule 8b), so an archived application is fetched once and cached for
// ever. One that is NOT archived is deliberately NOT cached - it can still move - so it costs a call each run, and
// there are few of them (19 of the 294 measured). First catch-up ~162 s; near-nothing after that.
var ASSESS_WIN_FILE = 'assess_windows.json';
var ASSESS_WIN_BUDGET_MS = 420000;   // 7 min. refreshStageHistory ran 575 s today against a 30-min ceiling.

function assessWindowBackfill_(need, win) {
  var store = loadDriveJson_(ASSESS_WIN_FILE) || {};
  if (!store.win) store.win = {};     // archived -> the stage window, frozen
  if (!store.none) store.none = {};   // archived, but no stage we map -> never ask again
  var served = 0, todo = [], i;
  for (i = 0; i < need.length; i++) {
    var a = need[i];
    if (store.win[a]) { win[a] = store.win[a]; served++; continue; }
    if (store.none[a]) { served++; continue; }
    todo.push(a);
  }
  if (!todo.length) {
    Logger.log('assess windows: ' + served + ' served from the cache, nothing new to fetch');
    return { served: served, fetched: 0, live: 0, empty: 0, failed: 0, left: 0 };
  }
  var t0 = Date.now(), fetched = 0, live = 0, empty = 0, failed = 0;
  for (i = 0; i < todo.length; i++) {
    if (Date.now() - t0 > ASSESS_WIN_BUDGET_MS) break;      // resume next run - the store is saved below anyway
    var id = todo[i];
    try {
      var resp = ashbyPost_('/application.listHistory', { applicationId: id });
      var hist = resp.results || resp.history || [];
      var ev = [], arch = false;
      for (var h = 0; h < hist.length; h++) {
        // 'Archived' is not a pipeline stage and has no STAGE_KEY_MAP entry, but it is the ONLY record that
        // this application is finished and its history will never change. 275 of the 294 measured carried one.
        if (hist[h].title === 'Archived') arch = true;
        var k = stageKeyFor(hist[h].title);   // #236a
        if (!k) continue;
        ev.push({ k: k,
          e: hist[h].enteredStageAt ? dayKey_(new Date(hist[h].enteredStageAt).getTime()) : null,
          l: hist[h].leftStageAt ? dayKey_(new Date(hist[h].leftStageAt).getTime()) : null });
      }
      if (ev.length) {
        win[id] = ev;
        if (arch) { store.win[id] = ev; fetched++; } else { live++; }
      } else {
        empty++;
        if (arch) store.none[id] = 1;
      }
    } catch (e) { failed++; }
  }
  saveDriveJson_(ASSESS_WIN_FILE, store);
  var left = todo.length - i;
  Logger.log('assess windows: ' + served + ' from cache, ' + fetched + ' archived and cached, ' + live
    + ' still live (re-read each run), ' + empty + ' with no mapped stage, ' + failed + ' failed'
    + (left > 0 ? ', ' + left + ' LEFT for the next run (time budget)' : '')
    + ' in ' + Math.round((Date.now() - t0) / 1000) + 's');
  return { served: served, fetched: fetched, live: live, empty: empty, failed: failed, left: left };
}

// #222 IS OFF until Jerin has seen the before-and-after (his review gate, step 12). probe222 shows exactly what
// flipping this does, and writes nothing. Flip to true in the SAME edit that ships the panel wording.
var ASSESS_USE_REPORT = true;    // LIVE from 12 Oct 2026, with Jerin at the review gate. See the note above.

function assessFeedback_(ends) {
  var rows = [];
  try { rows = ashbyListAll_('/applicationFeedback.list', { createdAfter: SCOPE_FROM_MS }); }
  catch (e) { Logger.log('assess: applicationFeedback.list failed: ' + e.message); return []; }
  var out = [], matched = 0, noApp = 0;
  rows.forEach(function (f) {
    if (!f.applicationId || !f.submittedAt) { noApp++; return; }
    var su = f.submittedByUser || f.creditedToUser;
    var uid = su && su.id;
    var subMs = new Date(f.submittedAt).getTime();
    if (uid) {
      var list = ends[f.applicationId + '|' + uid];
      if (list) {
        for (var i = 0; i < list.length; i++) {
          if (list[i] <= subMs) { matched++; return; }   // written about an interview we already counted
        }
      }
    }
    out.push({ app: f.applicationId, day: String(f.submittedAt).substring(0, 10) });
  });
  Logger.log('assess feedback: ' + rows.length + ' forms -> ' + out.length + ' with no interview behind them ('
    + matched + ' matched an interview and were dropped, ' + noApp + ' unusable)');
  return out;
}

// Which stage was this candidate sitting in on `day`? Falls back to the LAST stage they occupied before
// that day ‚Äî a reviewer who rejects at App Review submits the form as the candidate leaves it, so by the
// timestamp they can already be out of every stage.
function assessStageAt_(win, day) {
  if (!win || !win.length) return null;
  var best = null, bestE = null;
  for (var i = 0; i < win.length; i++) {
    var w = win[i];
    if (!w.e || w.e > day) continue;
    if (!w.l || w.l >= day) return w.k;               // sitting in it
    if (!bestE || w.e > bestE) { bestE = w.e; best = w.k; }   // last one they occupied
  }
  return best;
}

function computeAssessedRollups_(events, opts) {
  opts = opts || {};
  // #210 is LIVE. opts.legacy restores the pre-8-Oct rules so probe210 can still show before vs after.
  var USE_POOL = !opts.legacy;                                          // #210d
  var ADDED_SET = opts.legacy ? ASSESS_ADDED : ASSESS_ADDED_210;        // #210a
  var t0 = Date.now();
  // #210: a comparison run passes the signals in, so both rules see IDENTICAL input and Ashby is called once.
  var iv = (opts.pre && opts.pre.iv) || assessInterviews_();
  var asg = (opts.pre && opts.pre.asg) || assessAssignments_();
  var fb = (opts.pre && opts.pre.fb) || assessFeedback_(iv.ends);
  // #222 - vendor assessments (HackerEarth, Truffle, anything added later), read through the saved report.
  // `opts.pre.rep` lets probe222 fetch once and feed both runs; `opts.noReport` is how it produces the TODAY
  // column. While ASSESS_USE_REPORT is false the live refresh behaves exactly as it did before.
  var rep = (opts.pre && opts.pre.rep !== undefined) ? opts.pre.rep
          : ((opts.noReport || !ASSESS_USE_REPORT) ? {} : assessReportAssessments_().byApp);

  // Stage windows + who owns the application. Live apps come from the stage-history store; archived ones
  // from the v4 sweep, without which any review-stage feedback on somebody since rejected is unplaceable.
  var win = {}, who = {};
  for (var id in events) {
    win[id] = events[id].ev || [];
    who[id] = { r: events[id].r, j: events[id].j, s: events[id].s || null };
  }
  var arch = loadDriveJson_('archived_late_stage.json') || {};
  var archWin = arch.win || {};
  var archCount = 0;
  for (var aid in archWin) { if (!win[aid]) { win[aid] = archWin[aid]; archCount++; } }
  var archApps = (loadDriveJson_('archived_apps.json') || {}).apps || [];
  archApps.forEach(function (a) { if (a && a.id && !who[a.id]) who[a.id] = { r: a.r || null, j: a.j || null }; });
  Logger.log('assess windows: ' + Object.keys(events).length + ' live + ' + archCount + ' archived');

  // app -> stage -> earliest assessment day
  var assessed = {};
  function mark(app, stage, day) {
    if (!app || !stage || !day) return;
    var a = assessed[app] || (assessed[app] = {});
    if (!a[stage] || day < a[stage]) a[stage] = day;
  }
  for (var ia in iv.byApp) for (var ks in iv.byApp[ia]) mark(ia, ks, iv.byApp[ia][ks]);
  for (var ib in asg) for (var kt in asg[ib]) mark(ib, kt, asg[ib][kt]);
  // The added stages come from the stage window, not from an assessment signal.
  for (var appAdd in win) {
    var wAdd = win[appAdd] || [];
    for (var iAdd = 0; iAdd < wAdd.length; iAdd++) {
      if (ADDED_SET[wAdd[iAdd].k] && wAdd[iAdd].e) mark(appAdd, wAdd[iAdd].k, wAdd[iAdd].e);
    }
  }
  var placed = 0, unplaceable = 0;
  fb.forEach(function (f) {
    var k = assessStageAt_(win[f.app], f.day);
    if (!k) { unplaceable++; return; }
    mark(f.app, k, f.day); placed++;
  });
  Logger.log('assess feedback placed: ' + placed + ' (no stage history for ' + unplaceable + ')');

  // #222 - the report carries a DAY but NO stage: `Scheduled in Stage Name` is null on every row, because an
  // assessment has no interview attached to carry one. So the stage is INFERRED from our own stage history,
  // through the very same assessStageAt_() an unmatched feedback form already goes through. It is an inference
  // and is labelled as one on every panel that shows it.
  // #222b (Jerin: "Why not.") - the application behind an assessment is often archived AT the assessment
  // stage, which is the one population neither stage store ever covered. Fetch exactly those, once, and keep them.
  var needW = [];
  for (var rNeed in rep) if (!win[rNeed]) needW.push(rNeed);
  if (needW.length) assessWindowBackfill_(needW, win);

  var repPlaced = 0, repUnplaced = 0;
  for (var ra in rep) {
    var rdays = rep[ra] || [];
    for (var ri = 0; ri < rdays.length; ri++) {
      var rk = assessStageAt_(win[ra], rdays[ri]);
      if (!rk) { repUnplaced++; continue; }
      mark(ra, rk, rdays[ri]); repPlaced++;
    }
  }
  if (repPlaced || repUnplaced) {
    Logger.log('assess report placed: ' + repPlaced + ' (no stage history for ' + repUnplaced + ')');
  }

  // Did they enter a LATER stage on or after the day they were assessed here?
  function progressed(app, stage, day) {
    var w = win[app]; if (!w) return false;
    var idx = ASSESS_IDX[stage]; if (idx == null) return false;
    var inPool = USE_POOL && ASSESS_ROUND_POOL[stage];
    for (var i = 0; i < w.length; i++) {
      var k2 = w[i].k, j = ASSESS_IDX[k2];
      if (j == null || !w[i].e || w[i].e < day) continue;
      if (j > idx) return true;
      if (inPool && ASSESS_ROUND_POOL[k2] && k2 !== stage) return true;   // #210d rounds are unordered
    }
    // Offer is the last rung of the ladder, so "a later stage" cannot answer it, and 'Hired' is
    // deliberately NOT in STAGE_KEY_MAP so it never appears in a stage window. The application's own
    // status is the only record that they went on from an offer.
    if (stage === 'offer') { var mo = who[app]; if (mo && mo.s === 'Hired') return true; }
    return false;
  }

  // #210b: assessed but no decision yet. DISCLOSE ONLY - w is NEVER subtracted from a (Jerin chose to leave
  // the maths alone). An application still in the LIVE store is undecided; archive-only means rejected.
  var byJobQ = {}, spanByJobQ = {}, nA = 0, nB = 0, nW = 0;
  // #129: day twins - the same a / b keyed by the assessment DAY (the string assessQ_ cuts the quarter from), from
  // reportFloorDay_() on, so Throughput can follow the From / To boxes. A quarter's days add up to that quarter.
  var byJobD = {}, spanByJobD = {}, floorD = reportFloorDay_();
  for (var app in assessed) {
    var meta = who[app] || {}, j8 = meta.j ? String(meta.j).substring(0, 8) : null;
    if (!j8) continue;
    var stages = assessed[app];
    for (var st in stages) {
      var day = stages[st], q = assessQ_(day);
      if (!q) continue;
      var jm = byJobQ[j8] || (byJobQ[j8] = {});
      var sm = jm[st] || (jm[st] = {});
      var cell = sm[q] || (sm[q] = { a: 0, b: 0 });
      cell.a++; nA++;
      var prog = progressed(app, st, day);
      if (prog) { cell.b++; nB++; }
      else if (events[app]) { cell.w = (cell.w || 0) + 1; nW++; }   // #210b no decision yet
      if (day >= floorD) {
        var jmD = byJobD[j8] || (byJobD[j8] = {}), smD = jmD[st] || (jmD[st] = {});
        var cD = smD[day] || (smD[day] = { a: 0, b: 0 });
        cD.a++; if (prog) cD.b++; else if (events[app]) cD.w = (cD.w || 0) + 1;   // #210b day twin
      }
    }
    // The headline span: assessed at R1 or OA, whichever came first, through to Ref Check / Documentation /
    // Offer, whichever they reach first. One span per application ‚Äî no adding stage counts together.
    var startDay = null;
    for (var sk in ASSESS_SPAN_START) { if (stages[sk] && (!startDay || stages[sk] < startDay)) startDay = stages[sk]; }
    if (startDay) {
      var sq = assessQ_(startDay);
      if (sq) {
        var sj = spanByJobQ[j8] || (spanByJobQ[j8] = {});
        var sc = sj[sq] || (sj[sq] = { a: 0, b: 0 });
        sc.a++;
        var w2 = win[app] || [], reachedLate = false;
        for (var z = 0; z < w2.length; z++) {
          if (ASSESS_SPAN_END[w2[z].k] && w2[z].e && w2[z].e >= startDay) { reachedLate = true; break; }
        }
        if (reachedLate) sc.b++;
        if (startDay >= floorD) {
          var sjD = spanByJobD[j8] || (spanByJobD[j8] = {});
          var scD = sjD[startDay] || (sjD[startDay] = { a: 0, b: 0 });
          scD.a++; if (reachedLate) scD.b++;
        }
      }
    }
  }
  Logger.log('=== assessed pass: ' + nA + ' application-stage-quarters assessed, ' + nB + ' progressed ('
    + Math.round(100 * nB / (nA || 1)) + '%), ' + nW + ' awaiting, ' + Object.keys(byJobQ).length + ' jobs, '
    + Math.round((Date.now() - t0) / 1000) + 's [#210 pool=' + (USE_POOL ? 'ON' : 'off')
    + ' added=' + (ADDED_SET === ASSESS_ADDED_210 ? 'ON' : 'off') + '] ===');
  return {
    assessedByJobQ: byJobQ,
    assessedSpanByJobQ: spanByJobQ,
    assessedByJobD: byJobD,
    assessedSpanByJobD: spanByJobD,
    assessedMeta: {
      generatedAt: new Date().toISOString(),
      definition: 'A = interviewed at the stage, or an assignment triggered there, or feedback with no interview behind it. For Ref Check / Documentation / Offer, A = candidates ADDED to the stage, since nobody is assessed there. B = of those, entered a later stage afterwards; for Offer, B = went on to be Hired.',
      addedStages: ['refCheck', 'docSub', 'offer'],
      dedupe: 'one application per stage per quarter; B is a subset of A',
      span: 'assessed at R1 or OA (whichever first) -> reached Ref Check, Documentation or Offer (whichever first)',
      assessedRows: nA, progressedRows: nB
    }
  };
}


// ===== #210 DRY RUN - measures both rule changes and WRITES NOTHING =====
function probe210() {
  var t0 = Date.now();
  var events = loadDriveJson_('stage_events.json') || {};
  if (!Object.keys(events).length) { Logger.log('probe210 REFUSED: stage_events.json is empty'); return; }
  var iv = assessInterviews_(), asg = assessAssignments_(), fb = assessFeedback_(iv.ends);
  var pre = { iv: iv, asg: asg, fb: fb };
  Logger.log('probe210: signals fetched in ' + Math.round((Date.now() - t0) / 1000) + 's');
  var A = computeAssessedRollups_(events, { pre: pre, legacy: true });   // the pre-8-Oct rules
  var B = computeAssessedRollups_(events, { pre: pre });                 // live
  function tot(res, q) {
    var by = res.assessedByJobQ || {}, out = {};
    for (var job in by) for (var st in by[job]) {
      var v = by[job][st][q]; if (!v) continue;
      var c = out[st] || (out[st] = { a: 0, b: 0, w: 0 });
      c.a += v.a || 0; c.b += v.b || 0; c.w += v.w || 0;
    }
    return out;
  }
  function pc(c) { return c.a ? Math.round(100 * c.b / c.a) : 0; }
  function pad(v, n) { v = String(v); while (v.length < n) v += ' '; return v; }
  ['2026-Q3', '2026-Q4'].forEach(function (q) {
    var ta = tot(A, q), tb = tot(B, q);
    Logger.log('');
    Logger.log('===== #210 BEFORE vs AFTER - ' + q + ' =====');
    Logger.log(pad('stage', 17) + '|  ' + pad('NOW', 22) + '|  ' + pad('#210', 22) + '|  waiting');
    ASSESS_ORDER.forEach(function (st) {
      var x = ta[st] || { a: 0, b: 0, w: 0 }, y = tb[st] || { a: 0, b: 0, w: 0 };
      if (!x.a && !y.a) return;
      Logger.log(pad(st, 17) + '|  ' + pad(x.a + ' -> ' + x.b + ' (' + pc(x) + '%)', 22)
        + '|  ' + pad(y.a + ' -> ' + y.b + ' (' + pc(y) + '%)', 22)
        + '|  ' + y.w + ((y.a !== x.a || y.b !== x.b) ? '   <== CHANGED' : ''));
    });
    function span(res) { var sp = res.assessedSpanByJobQ || {}, a = 0, b = 0;
      for (var j in sp) { var v = sp[j][q]; if (v) { a += v.a || 0; b += v.b || 0; } } return a + ' -> ' + b; }
    Logger.log(pad('SPAN', 17) + '|  ' + pad(span(A), 22) + '|  ' + pad(span(B), 22) + '|');
  });
  Logger.log('');
  Logger.log('probe210 done in ' + Math.round((Date.now() - t0) / 1000) + 's. NOTHING WAS WRITTEN.');
}

// ===== #222 DRY RUN - reads the report, infers the stage, WRITES NOTHING =====
// The expected figures below were MEASURED on 12 Oct 2026 at 15:22 IST by reading the report directly. They are
// CONTROLS on the parse, not a specification: the report is live, so a few new assessments since then is a
// legitimate drift, and the probe says DRIFT rather than failing. A big or structural difference means the parse
// is wrong, which is exactly what this is here to catch - a silent zero is the failure mode this project keeps
// hitting (CLAUDE.md rule 5).
var P222_EXPECT_STATUS = { 'Complete': 321, 'Started': 167, 'Waiting to Start': 231, 'Cancelled': 41, 'Starting': 23 };
var P222_EXPECT_PARTNER = { 'HackerEarth': 635, 'Truffle': 148 };
var P222_EXPECT_ROWS = 783;
var P222_EXPECT_COUNTED = 488;        // Complete + Started, before dedupe

function probe222() {
  var t0 = Date.now();
  var events = loadDriveJson_('stage_events.json') || {};
  if (!Object.keys(events).length) { Logger.log('probe222 REFUSED: stage_events.json is empty'); return; }

  var rep = assessReportAssessments_();
  if (!rep.stats.ok) { Logger.log('probe222 STOPPED: the report did not return usable rows. See the line above.'); return; }
  var s = rep.stats;

  Logger.log('');
  Logger.log('===== #222 STEP 7 - THE REPORT, READ BY THE PIPELINE =====');
  Logger.log('reportData shape : ' + s.shape);
  Logger.log('columns          : ' + s.header.join(' | '));

  function cmp(label, got, want) {
    var tag = (got === want) ? 'MATCH' : (Math.abs(got - want) <= Math.max(5, want * 0.02) ? 'drift ok' : '<== CHECK');
    Logger.log('  ' + label + String('                    ').substring(label.length) + got + '  (expected ' + want + ')  ' + tag);
  }
  Logger.log('ROWS');
  cmp('total', s.rows, P222_EXPECT_ROWS);
  Logger.log('ACTIVITY STATUS');
  var statKeys = {}; for (var k1 in P222_EXPECT_STATUS) statKeys[k1] = 1; for (var k2 in s.status) statKeys[k2] = 1;
  for (var k in statKeys) cmp(k, s.status[k] || 0, P222_EXPECT_STATUS[k] || 0);
  Logger.log('INTEGRATION PARTNER  (a NEW vendor showing up here is the design working, not a fault)');
  var ptKeys = {}; for (var p1 in P222_EXPECT_PARTNER) ptKeys[p1] = 1; for (var p2 in s.partner) ptKeys[p2] = 1;
  for (var p in ptKeys) cmp(p, s.partner[p] || 0, P222_EXPECT_PARTNER[p] || 0);
  Logger.log('COUNTED  (Complete + Started, Jerin 12 Oct)');
  cmp('counted', s.kept + s.dupes, P222_EXPECT_COUNTED);
  Logger.log('  after dedupe      ' + s.kept + ' across ' + s.apps + ' applications ('
    + s.dupes + ' repeat of the same assessment dropped)');
  Logger.log('  unusable          ' + s.noApp + ' no application id, ' + s.noDay + ' no sent date');

  // ----- STEP 8: can we actually place these in a stage? Same windows computeAssessedRollups_ builds.
  var win = {};
  for (var id in events) win[id] = events[id].ev || [];
  var archWin = (loadDriveJson_('archived_late_stage.json') || {}).win || {};
  var archAdded = 0;
  for (var aid in archWin) { if (!win[aid]) { win[aid] = archWin[aid]; archAdded++; } }

  var placed = 0, noHistory = 0, noStage = 0, byStage = {}, oaDays = {};
  for (var app in rep.byApp) {
    var days = rep.byApp[app];
    if (!win[app]) { noHistory += days.length; continue; }
    for (var i = 0; i < days.length; i++) {
      var ks = assessStageAt_(win[app], days[i]);
      if (!ks) { noStage++; continue; }
      byStage[ks] = (byStage[ks] || 0) + 1;
      placed++;
      if (ks === 'oa') oaDays[assessQ_(days[i])] = (oaDays[assessQ_(days[i])] || 0) + 1;
    }
  }
  Logger.log('');
  Logger.log('===== #222 STEP 8 - INFERRED STAGE  (the report cannot supply it; this is OUR history) =====');
  Logger.log('windows available : ' + Object.keys(events).length + ' live + ' + archAdded + ' archived');
  Logger.log('placed            : ' + placed + ' of ' + s.kept
    + '   (' + (s.kept ? Math.round(100 * placed / s.kept) : 0) + '%)');
  Logger.log('unplaceable       : ' + noHistory + ' no stage history at all, ' + noStage + ' history but no stage on the day');
  Logger.log('WHERE THEY LAND:');
  ASSESS_ORDER.forEach(function (st) { if (byStage[st]) Logger.log('  ' + st + String('                    ').substring(st.length) + byStage[st]); });
  var stray = []; for (var sk in byStage) if (ASSESS_IDX[sk] == null) stray.push(sk + ' ' + byStage[sk]);
  if (stray.length) Logger.log('  (outside ASSESS_ORDER: ' + stray.join(', ') + ')');
  Logger.log('ONLINE ASSESSMENT by quarter: ' + JSON.stringify(oaDays)
    + '   <== today Interview Traction sees 22 in total');

  // ----- The before / after Jerin has to see (step 12) - what the grid WOULD become.
  Logger.log('');
  Logger.log('===== #222 - WHAT THIS WOULD DO TO THE GRID  (nothing written) =====');
  var iv = assessInterviews_(), asg = assessAssignments_(), fb = assessFeedback_(iv.ends);
  var A = computeAssessedRollups_(events, { pre: { iv: iv, asg: asg, fb: fb }, noReport: true });   // today
  var B = computeAssessedRollups_(events, { pre: { iv: iv, asg: asg, fb: fb, rep: rep.byApp } });  // with #222
  function tot(res, q) {
    var by = res.assessedByJobQ || {}, out = {};
    for (var job in by) for (var st in by[job]) {
      var v = by[job][st][q]; if (!v) continue;
      var c = out[st] || (out[st] = { a: 0, b: 0 });
      c.a += v.a || 0; c.b += v.b || 0;
    }
    return out;
  }
  function pc(c) { return c.a ? Math.round(100 * c.b / c.a) : 0; }
  function pad(v, n) { v = String(v); while (v.length < n) v += ' '; return v; }
  ['2026-Q3', '2026-Q4'].forEach(function (q) {
    var ta = tot(A, q), tb = tot(B, q);
    Logger.log('');
    Logger.log('--- ' + q + ' ---   ' + pad('TODAY', 24) + 'WITH #222');
    ASSESS_ORDER.forEach(function (st) {
      var x = ta[st] || { a: 0, b: 0 }, y = tb[st] || { a: 0, b: 0 };
      if (!x.a && !y.a) return;
      Logger.log(pad(st, 14) + '    ' + pad(x.a + ' -> ' + x.b + ' (' + pc(x) + '%)', 24)
        + pad(y.a + ' -> ' + y.b + ' (' + pc(y) + '%)', 24) + ((y.a !== x.a || y.b !== x.b) ? '  <== CHANGED' : ''));
    });
    function span(res) { var sp = res.assessedSpanByJobQ || {}, a = 0, b = 0;
      for (var j in sp) { var v = sp[j][q]; if (v) { a += v.a || 0; b += v.b || 0; } } return a + ' -> ' + b; }
    Logger.log(pad('SPAN', 14) + '    ' + pad(span(A), 24) + pad(span(B), 24)
      + '  <== the span gets WORSE and that is it becoming TRUE');
  });
  // ----- MOMENTUM, under Jerin's ruling: EVERY assessment forced to Online Assessment, whatever stage it fired
  // in. Toggling the global is safe here - the probe writes nothing and it is put straight back.
  Logger.log('');
  Logger.log('===== #222 - MOMENTUM, before and after  (nothing written) =====');
  var keepFlag = ASSESS_USE_REPORT;
  ASSESS_USE_REPORT = false; var M1 = computeTofuRollups_(events);
  ASSESS_USE_REPORT = true;  var M2 = computeTofuRollups_(events);
  ASSESS_USE_REPORT = keepFlag;
  function tofuTot(res) {
    var by = res.tofuByJob || {}, out = {};
    for (var jj in by) for (var qq in by[jj]) {
      var v = by[jj][qq];
      out[qq] = (out[qq] || 0) + (typeof v === 'number' ? v : ((v && (v.n || v.a || v.count)) || 0));
    }
    return out;
  }
  var mA = tofuTot(M1), mB = tofuTot(M2), qSeen = {};
  for (var qa in mA) qSeen[qa] = 1;
  for (var qb in mB) qSeen[qb] = 1;
  Object.keys(qSeen).sort().forEach(function (q) {
    var x = mA[q] || 0, y = mB[q] || 0;
    Logger.log('  ' + q + '    today ' + x + '    with #222 ' + y + (x !== y ? '    <== CHANGED' : ''));
  });
  Logger.log('  arrivals in total: today ' + ((M1.tofuMeta && M1.tofuMeta.arrivals) || '?')
    + '    with #222 ' + ((M2.tofuMeta && M2.tofuMeta.arrivals) || '?'));

  Logger.log('');
  Logger.log('probe222 done in ' + Math.round((Date.now() - t0) / 1000) + 's. NOTHING WAS WRITTEN.');
}

// ===== #222b - CAN THE 295 "UNPLACEABLE" ASSESSMENTS BE GIVEN A STAGE? Jerin, 12 Oct: "Why not." =====
// He was right to push. They are unplaceable only because we never FETCHED their history, not because it does not
// exist. `stage_events.json` holds LIVE applications; `archived_late_stage.json` deliberately holds only those that
// reached Ref Check / Documentation / Offer (it was built for Drop). Somebody archived AT the assessment stage was
// never in scope for either store - which is precisely the population an assessment produces.
// `application.listHistory` answers for ANY single application, and the report hands us the exact list, so this
// walks all of them and reports how many become placeable. WRITES NOTHING.
function probe222b() {
  var t0 = Date.now();
  var events = loadDriveJson_('stage_events.json') || {};
  if (!Object.keys(events).length) { Logger.log('probe222b REFUSED: stage_events.json is empty'); return; }
  var rep = assessReportAssessments_();
  if (!rep.stats.ok) { Logger.log('probe222b STOPPED: the report returned no usable rows'); return; }

  var win = {};
  for (var id in events) win[id] = events[id].ev || [];
  var archWin = (loadDriveJson_('archived_late_stage.json') || {}).win || {};
  for (var aid in archWin) if (!win[aid]) win[aid] = archWin[aid];

  var todo = [], missedAssessments = 0;
  for (var app in rep.byApp) if (!win[app]) { todo.push(app); missedAssessments += (rep.byApp[app] || []).length; }
  Logger.log('probe222b: ' + todo.length + ' applications hold ' + missedAssessments
    + ' counted assessments and have NO stage window today.');

  var got = 0, empty = 0, failed = 0, placed = 0, noStageOnDay = 0, byStage = {}, unmapped = {}, stopped = -1;
  for (var i = 0; i < todo.length; i++) {
    if (Date.now() - t0 > 1500000) { stopped = i; break; }          // 25-min guard, well inside the 30-min trigger
    var a = todo[i];
    try {
      var resp = ashbyPost_('/application.listHistory', { applicationId: a });
      var hist = resp.results || resp.history || [];
      if (!hist.length) { empty++; continue; }
      var ev = [];
      for (var h = 0; h < hist.length; h++) {
        var k = stageKeyFor(hist[h].title);   // #236a
        if (!k) { if (hist[h].title) unmapped[hist[h].title] = (unmapped[hist[h].title] || 0) + 1; continue; }
        ev.push({ k: k,
          e: hist[h].enteredStageAt ? dayKey_(new Date(hist[h].enteredStageAt).getTime()) : null,
          l: hist[h].leftStageAt ? dayKey_(new Date(hist[h].leftStageAt).getTime()) : null });
      }
      got++;
      var days = rep.byApp[a] || [];
      for (var d = 0; d < days.length; d++) {
        var ks = assessStageAt_(ev, days[d]);
        if (!ks) { noStageOnDay++; continue; }
        byStage[ks] = (byStage[ks] || 0) + 1; placed++;
      }
    } catch (e) { failed++; }
    if (i && i % 100 === 0) Logger.log('  ' + i + '/' + todo.length + ' (' + Math.round((Date.now() - t0) / 1000) + 's)');
  }

  Logger.log('');
  Logger.log('===== #222b - ARE THE "UNPLACEABLE" ONES RECOVERABLE? =====');
  Logger.log('asked Ashby for   : ' + todo.length + ' applications' + (stopped >= 0 ? '  (STOPPED at ' + stopped + ' on the time guard)' : ''));
  Logger.log('history came back : ' + got + '   (empty ' + empty + ', call failed ' + failed + ')');
  Logger.log('ASSESSMENTS NOW PLACEABLE: ' + placed + ' of ' + missedAssessments
    + '   (' + (missedAssessments ? Math.round(100 * placed / missedAssessments) : 0) + '%)');
  Logger.log('history but no stage on the assessment day: ' + noStageOnDay);
  Logger.log('WHERE THEY LAND:');
  ASSESS_ORDER.forEach(function (st) { if (byStage[st]) Logger.log('  ' + st + String('                    ').substring(st.length) + byStage[st]); });
  var un = Object.keys(unmapped);
  if (un.length) Logger.log('UNMAPPED stage titles (skipped, and they count for nothing): '
    + un.map(function (t) { return t + ' x' + unmapped[t]; }).join(', '));
  Logger.log('');
  Logger.log('probe222b done in ' + Math.round((Date.now() - t0) / 1000) + 's. NOTHING WAS WRITTEN.');
}

// ===== #223 - ASSESSMENTS SET UP AND NEVER SENT, and the people parked in Online Assessment. WRITES NOTHING. =====
// Jerin, 12 Oct 2026, asked whether this deserved its own task: "Yes."
// This is a PROCESS finding, not a reporting one. #222 made it visible; it does not fix it. The point of this probe
// is to turn "231 assessments were never sent" into something a person can act on: WHICH recruiter, WHICH role,
// and HOW LONG it has been sitting.
// PII: no candidate identity leaves Ashby here - only application ids, and nothing is written anywhere public.
function probe223() {
  var t0 = Date.now();
  var resp = null;
  try { resp = ashbyPost_('/report.synchronous', { reportId: ASSESS_REPORT_ID }); }
  catch (e) { Logger.log('probe223 STOPPED: report.synchronous failed - ' + e.message); return; }
  var r = resp && resp.results;
  if (!r || String(r.status || '').toLowerCase() !== 'complete') {
    Logger.log('probe223 STOPPED: report status "' + (r && r.status) + '"'); return;
  }
  var t = assessReportShape_(r.reportData);
  if (!t || !t.rows.length) { Logger.log('probe223 STOPPED: reportData unreadable'); return; }
  var cApp = assessReportCol_(t.header, 'Ashby Job Consideration ID');
  var cSt  = assessReportCol_(t.header, 'Activity Status');
  if (cApp < 0 || cSt < 0) { Logger.log('probe223 STOPPED: required column missing'); return; }

  var events = loadDriveJson_('stage_events.json') || {};
  var who = {};
  for (var aid in events) who[aid] = { r: events[aid].r, j: events[aid].j };
  var arch = (loadDriveJson_('archived_apps.json') || {}).apps || [];
  arch.forEach(function (a) { if (a && a.id && !who[a.id]) who[a.id] = { r: a.r || null, j: a.j || null }; });
  var jobName = {};
  try {
    var dash = loadDriveJson_('dashboard.json') || {};
    (dash.jobs || []).forEach(function (j) { jobName[String(j.id || '').substring(0, 8)] = j.title || '(untitled)'; });
  } catch (eD) { Logger.log('probe223: dashboard.json unreadable, roles show as ids - ' + eD.message); }

  var NEVER_SENT = { 'Waiting to Start': 1, 'Starting': 1 };
  var byRec = {}, byJob = {}, nUnsent = 0, noOwner = 0, unsentApps = {};
  t.rows.forEach(function (row) {
    var st = String(row[cSt] == null ? '' : row[cSt]).trim();
    if (!NEVER_SENT[st]) return;
    nUnsent++;
    var app = String(row[cApp] == null ? '' : row[cApp]).trim();
    if (!app) { noOwner++; return; }
    unsentApps[app] = 1;
    var w = who[app];
    if (!w) { noOwner++; return; }
    var rec = w.r || '(no recruiter on the application)';
    var j8 = w.j ? String(w.j).substring(0, 8) : null;
    byRec[rec] = (byRec[rec] || 0) + 1;
    if (j8) { var key = (jobName[j8] || j8); byJob[key] = (byJob[key] || 0) + 1; }
  });

  var today = dayKey_(Date.now());
  function daysBetween(a, b) { return Math.round((new Date(b) - new Date(a)) / 86400000); }
  var parked = 0, parkedRec = {}, ages = [], parkedWithUnsent = 0, oldest = 0;
  for (var id in events) {
    var ev = events[id].ev || [], inOa = null;
    for (var i = 0; i < ev.length; i++) {
      if (ev[i].k !== 'oa' || !ev[i].e) continue;
      if (ev[i].l) continue;
      if (!inOa || ev[i].e > inOa) inOa = ev[i].e;
    }
    if (!inOa) continue;
    parked++;
    var age = daysBetween(inOa, today);
    ages.push(age);
    if (age > oldest) oldest = age;
    var rec2 = (events[id].r) || '(no recruiter on the application)';
    var cell = parkedRec[rec2] || (parkedRec[rec2] = { n: 0, unsent: 0, oldest: 0 });
    cell.n++;
    if (cell.oldest < age) cell.oldest = age;
    if (unsentApps[id]) { cell.unsent++; parkedWithUnsent++; }
  }
  ages.sort(function (a, b) { return a - b; });
  var median = ages.length ? ages[Math.floor(ages.length / 2)] : 0;

  function top(obj, n, isCell) {
    return Object.keys(obj).sort(function (a, b) {
      var va = isCell ? obj[a].n : obj[a], vb = isCell ? obj[b].n : obj[b];
      return vb - va;
    }).slice(0, n);
  }

  Logger.log('');
  Logger.log('===== #223 - ASSESSMENTS NEVER SENT =====');
  Logger.log('total never sent (configured, nobody pressed send): ' + nUnsent
    + '   across ' + Object.keys(unsentApps).length + ' candidates'
    + (noOwner ? '   (' + noOwner + ' could not be tied to a recruiter)' : ''));
  Logger.log('BY RECRUITER:');
  top(byRec, 15).forEach(function (k) { Logger.log('  ' + byRec[k] + '   ' + k); });
  Logger.log('BY ROLE:');
  top(byJob, 15).forEach(function (k) { Logger.log('  ' + byJob[k] + '   ' + k); });
  Logger.log('');
  Logger.log('===== #223 - SITTING IN ONLINE ASSESSMENT TODAY =====');
  Logger.log('people parked there : ' + parked);
  Logger.log('how long they have waited: median ' + median + ' days, longest ' + oldest + ' days');
  Logger.log('OF THOSE, waiting on an assessment NOBODY SENT: ' + parkedWithUnsent
    + '   (' + (parked ? Math.round(100 * parkedWithUnsent / parked) : 0) + '%)');
  Logger.log('BY RECRUITER  (parked / of which never sent / longest wait in days):');
  top(parkedRec, 20, true).forEach(function (k) {
    var c = parkedRec[k];
    Logger.log('  ' + c.n + ' / ' + c.unsent + ' / ' + c.oldest + '   ' + k);
  });
  Logger.log('');
  Logger.log('probe223 done in ' + Math.round((Date.now() - t0) / 1000) + 's. NOTHING WAS WRITTEN.');
}

// ===== #224b - TRACE: how Momentum arrives at its number for ONE role. WRITES NOTHING. =====
// Jerin, 12 Oct 2026: "for automation role, are you sure that 9 ... is correct? If so, help me understand how we
// arrived at it?" This lists every candidate that counts, the day it counted them, and WHICH signal did it - then
// checks the total against the PUBLISHED rollup, which is the outside check: if the trace and the shipped file
// disagree, the trace is wrong, not the file.
var TRACE_JOB8 = '378e5361';   // Intern - Software Development Engineer (Automation)
function probeTrace() {
  var t0 = Date.now();
  var events = loadDriveJson_('stage_events.json') || {};
  if (!Object.keys(events).length) { Logger.log('probeTrace REFUSED: stage_events.json empty'); return; }

  var who = {};
  for (var aid in events) who[aid] = { r: events[aid].r, j: events[aid].j };
  var arch = (loadDriveJson_('archived_apps.json') || {}).apps || [];
  arch.forEach(function (a) { if (a && a.id && !who[a.id]) who[a.id] = { r: a.r || null, j: a.j || null }; });

  var src = {};
  function note(app, day, label) {
    if (!app || !day) return;
    (src[app] || (src[app] = [])).push({ d: day, s: label });
  }
  var oa = tofuAssignmentDays_(/online assessment/i, 'the Online Assessment stage');
  for (var a1 in oa) oa[a1].forEach(function (d) { note(a1, d, 'take-home triggered in OA'); });
  if (ASSESS_USE_REPORT) {
    var rep = assessReportAssessments_();
    for (var a2 in rep.byApp) rep.byApp[a2].forEach(function (d) { note(a2, d, 'assessment SENT (#222)'); });
  }
  var held = tofuInterviewHeldDays_();
  for (var a3 in held) held[a3].forEach(function (d) { note(a3, d, 'interview HELD (#221)'); });

  var rows = [];
  for (var app in src) {
    var w = who[app] || {};
    if (!w.j || String(w.j).substring(0, 8) !== TRACE_JOB8) continue;
    var list = src[app].slice().sort(function (x, y) { return x.d < y.d ? -1 : (x.d > y.d ? 1 : 0); });
    var first = list[0];
    var q = tofuQuarter_(first.d);
    rows.push({ app: app.substring(0, 8), day: first.d, q: q, why: first.s, n: list.length,
                rec: w.r || '(none)' });
  }
  rows.sort(function (x, y) { return x.day < y.day ? -1 : 1; });

  Logger.log('');
  Logger.log('===== #224b - EVERY CANDIDATE MOMENTUM COUNTS ON THIS ROLE =====');
  Logger.log('Momentum counts each candidate ONCE, on their FIRST evaluation ever (#221).');
  Logger.log('app      first evaluation  quarter   what counted them                 recruiter');
  var byQ = {};
  rows.forEach(function (r) {
    byQ[r.q] = (byQ[r.q] || 0) + 1;
    Logger.log('  ' + r.app + '  ' + r.day + '   ' + r.q + '   '
      + (r.why + '                                 ').substring(0, 33) + r.rec);
  });
  Logger.log('');
  Logger.log('TRACE TOTALS by quarter: ' + JSON.stringify(byQ) + '   (' + rows.length + ' candidates in all)');

  var pub = (loadDriveJson_('stage_rollups.json') || {}).tofuByJob || {};
  var mine = pub[TRACE_JOB8] || {};
  var pubQ = {};
  for (var d2 in mine) { var qq = tofuQuarter_(d2); if (qq) pubQ[qq] = (pubQ[qq] || 0) + mine[d2]; }
  Logger.log('PUBLISHED rollup for the same role: ' + JSON.stringify(pubQ));
  var ok = JSON.stringify(byQ) === JSON.stringify(pubQ);
  Logger.log('THE CHECK: trace ' + (ok ? 'MATCHES' : 'DOES NOT MATCH')
    + ' the shipped file. If it does not, trust the file and fix the trace.');
  Logger.log('');
  Logger.log('probeTrace done in ' + Math.round((Date.now() - t0) / 1000) + 's. NOTHING WAS WRITTEN.');
}
