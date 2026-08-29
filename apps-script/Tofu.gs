// ===== ToFU (top of funnel) — added 2026-08-26, spec settled with Jerin =====
// "How many candidates got added to ToFU on a particular day. ToFU is HM or OA or R1, whichever comes
//  first. Once a candidate is logged as added to ToFU they shouldn't be repeated in the same job."
//
//   HM = entered the HM Screening stage.                      Source: stage history (events).
//   OA = an assessment was TRIGGERED while the candidate was
//        sitting in the Online Assessment stage.              Source: takeHomeAssignment.list.
//   R1 = an interview was BOOKED at R1, dated the day it was
//        BOOKED (schedule createdAt), not the day it is held. Source: interviewSchedule.list.
//
// One count per APPLICATION per QUARTER, on the EARLIEST of those signals inside that quarter. An
// application is one candidate on one job, so "not repeated in the same job" comes free. Dedupe resets
// each quarter (Jerin, 26 Aug) — so a candidate re-entering the funnel in a later quarter counts again,
// and quarters therefore do NOT add up to a year.
//
// 🚨 IK's assessments ARE Ashby take-home assignments — verified 2026-08-26 against live data: the
// interview definitions carrying them have type 'TakeHome' ("Executive Assistant", "Assignment - APM",
// "Assignment - Performance Marketing"). The assessment.* endpoints are partner-side and 404 for us.
// Only 5 distinct interviewStageId values appear across every assignment in the workspace, so resolving a
// stage id to its title is a handful of cached lookups, not one per row.
// 🚨 Cancelled does not count, on either signal (Jerin: "remove from ToFU then, only fair"). That means a
// cancellation can take a count off a PAST day — accepted, and small, because it only bites for a
// candidate whose sole signal was that booking.
// ⚠ NOT the same as Screening Efficiency's "Added", which counts arrivals at each stage separately and
// counts a candidate again every time they re-enter one. Two questions, two numbers, on purpose.

var TOFU_STAGE_CACHE_FILE = 'tofu_stage_titles.json';

function tofuQuarter_(day) {
  if (!day || day.length < 7) return null;
  return day.substring(0, 4) + '-Q' + (Math.floor((parseInt(day.substring(5, 7), 10) - 1) / 3) + 1);
}

// interviewStageId -> stage title, cached on Drive so a run costs no lookups once warm.
function tofuStageTitles_(ids) {
  var cache = loadDriveJson_(TOFU_STAGE_CACHE_FILE) || {};
  var missing = 0;
  for (var n = 0; n < ids.length; n++) {
    var sid = ids[n];
    if (!sid || cache[sid]) continue;
    var got = null;
    try { got = ashbyPost_('/interviewStage.info', { interviewStageId: sid }).results; }
    catch (e1) { try { got = ashbyPost_('/interviewStage.info', { id: sid }).results; } catch (e2) { got = null; } }
    cache[sid] = (got && got.title) || '';
    missing++;
  }
  if (missing) saveDriveJson_(TOFU_STAGE_CACHE_FILE, cache);
  Logger.log('ToFU stage titles: ' + Object.keys(cache).length + ' cached (' + missing + ' resolved this run)');
  return cache;
}

// 🚨 IK's assessments and its take-home assignments are the SAME Ashby object — the interview
// definitions carrying them are typed 'TakeHome'. One fetch, filtered by the stage the candidate was
// sitting in when it was triggered: the Online Assessment stage feeds ToFU, the R1 stage feeds Screening
// Efficiency. Fetched once and cached, because both callers run in the same pass.
var TOFU_ASSIGN_CACHE_ = null;
function tofuAssignmentRows_() {
  if (TOFU_ASSIGN_CACHE_) return TOFU_ASSIGN_CACHE_;
  var rows = [];
  try { rows = ashbyListAll_('/takeHomeAssignment.list'); }
  catch (e) { Logger.log('ToFU: takeHomeAssignment.list failed: ' + e.message); rows = []; }
  var ids = {};
  rows.forEach(function (t) { if (t.interviewStageId) ids[t.interviewStageId] = 1; });
  TOFU_ASSIGN_CACHE_ = { rows: rows, titles: tofuStageTitles_(Object.keys(ids)) };
  return TOFU_ASSIGN_CACHE_;
}

// { applicationId: [dayKey, ...] } for assignments triggered while the candidate sat in `stageRe`.
function tofuAssignmentDays_(stageRe, label) {
  var c = tofuAssignmentRows_();
  var out = {}, kept = 0, cancelled = 0, wrongStage = 0;
  c.rows.forEach(function (t) {
    if (!t.applicationId || !t.createdAt) return;
    if (t.status === 'Cancelled') { cancelled++; return; }
    var title = c.titles[t.interviewStageId] || '';
    if (!stageRe.test(title)) { wrongStage++; return; }
    (out[t.applicationId] || (out[t.applicationId] = [])).push(String(t.createdAt).substring(0, 10));
    kept++;
  });
  Logger.log('Assignments triggered in ' + label + ': ' + c.rows.length + ' rows -> kept ' + kept + ' (cancelled ' + cancelled + ', other stages ' + wrongStage + ')');
  return out;
}

// { applicationId: [dayKey, ...] } for interviews BOOKED at R1, dated by when the booking was made.
function tofuR1BookingDays_() {
  var rows = [];
  try { rows = ashbyListAll_('/interviewSchedule.list', { createdAfter: Date.UTC(new Date().getFullYear(), 0, 1) }); }
  catch (e) {
    Logger.log('ToFU: interviewSchedule.list with createdAfter failed (' + e.message + ') - retrying unfiltered');
    try { rows = ashbyListAll_('/interviewSchedule.list'); } catch (e2) { Logger.log('ToFU: interviewSchedule.list failed: ' + e2.message); return {}; }
  }
  var ids = {};
  rows.forEach(function (s) { if (s.interviewStageId) ids[s.interviewStageId] = 1; });
  var titles = tofuStageTitles_(Object.keys(ids));
  var out = {}, kept = 0, cancelled = 0, wrongStage = 0;
  rows.forEach(function (s) {
    if (!s.applicationId || !s.createdAt) return;
    if (String(s.status || '') === 'Cancelled') { cancelled++; return; }
    var title = titles[s.interviewStageId] || '';
    if (!/^r1\b/i.test(title.trim())) { wrongStage++; return; }
    (out[s.applicationId] || (out[s.applicationId] = [])).push(String(s.createdAt).substring(0, 10));
    kept++;
  });
  Logger.log('ToFU R1 bookings: ' + rows.length + ' schedules -> kept ' + kept + ' (cancelled ' + cancelled + ', not R1 ' + wrongStage + ')');
  return out;
}

// The whole pass. The 'events' argument is the stage-history store: { appId: {r, j, ev, x, s} }.
// Returns the maps that get merged into stage_rollups.json.
function computeTofuRollups_(events) {
  var oaDays = tofuAssignmentDays_(/online assessment/i, 'the Online Assessment stage');
  var r1Days = tofuR1BookingDays_();

  // applicationId -> { r: recruiter, j: jobId }. Live apps come from the stage-history store; archived ones
  // from archived_apps.json, so a candidate who has since been rejected still counts on the day they
  // actually arrived. Without this, historical momentum would shrink every time somebody was archived.
  var who = {};
  for (var aid in events) who[aid] = { r: events[aid].r, j: events[aid].j };
  var arch = (loadDriveJson_('archived_apps.json') || {}).apps || [];
  arch.forEach(function (a) { if (a && a.id && !who[a.id]) who[a.id] = { r: a.r || null, j: a.j || null }; });

  // signal days per application: HM from history (live), HM from the archived backfill, OA and R1 from the
  // org-wide endpoints (which are not gated on the application still being live).
  var days = {};
  function add(aid, day) {
    if (!aid || !day) return;
    (days[aid] || (days[aid] = [])).push(day);
  }
  for (var aid2 in events) {
    var ev = events[aid2].ev || [];
    for (var k = 0; k < ev.length; k++) if (ev[k].k === 'hmReview' && ev[k].e) add(aid2, ev[k].e);
  }
  var archStore = loadDriveJson_('archived_late_stage.json') || {};
  var archHm = archStore.tofuHm || {};
  var archHmCount = 0;
  for (var aid3 in archHm) { add(aid3, archHm[aid3]); archHmCount++; }
  for (var aid4 in oaDays) oaDays[aid4].forEach(function (d) { add(aid4, d); });
  for (var aid5 in r1Days) r1Days[aid5].forEach(function (d) { add(aid5, d); });

  // one count per application per QUARTER, on the earliest signal in that quarter
  var byRec = {}, byJob = {}, byRecJob = {}, total = 0, unattributed = 0;
  for (var aid6 in days) {
    var earliestInQ = {};
    days[aid6].forEach(function (d) {
      var q = tofuQuarter_(d);
      if (!q) return;
      if (!earliestInQ[q] || d < earliestInQ[q]) earliestInQ[q] = d;
    });
    var w = who[aid6] || {};
    var rec = w.r || null, job8 = w.j ? String(w.j).substring(0, 8) : null;
    for (var q2 in earliestInQ) {
      var day = earliestInQ[q2];
      total++;
      if (!rec && !job8) { unattributed++; continue; }
      if (rec) {
        var mr = byRec[rec] || (byRec[rec] = {});
        mr[day] = (mr[day] || 0) + 1;
        if (job8) {
          var mrj = byRecJob[rec] || (byRecJob[rec] = {});
          var mj2 = mrj[job8] || (mrj[job8] = {});
          mj2[day] = (mj2[day] || 0) + 1;
        }
      }
      if (job8) {
        var mj = byJob[job8] || (byJob[job8] = {});
        mj[day] = (mj[day] || 0) + 1;
      }
    }
  }

  // ===== R1 SCREENING (added 2026-08-29, Jerin) =====
  // Screening Efficiency stopped being three stage columns and became ONE set about R1:
  //   Added   = an R1 interview was BOOKED in the quarter — the same signal ToFU uses, but on its own,
  //             so a candidate who arrived via HM still counts here once their R1 is booked. Cancelled
  //             bookings do not count. One count per APPLICATION per QUARTER.
  //   Cleared = they went PAST R1 — reached R2, R3, R4, R5, Ref Check, Documentation or Offer on or after
  //             the day the R1 was booked.
  // ⚠ This is NOT the R1 number Momentum shows: Momentum only credits R1 when it was the candidate's
  // FIRST signal, so its R1 is a subset of this one. And it is not the old per-stage 'Added' either, which
  // counted stage ENTRIES and re-counted anyone who came back round.
  var beyondR1 = { r2: 1, r3: 1, r4: 1, r5: 1, refCheck: 1, docSub: 1, offer: 1 };
  var archLate = archStore.hits || {};
  var r1Rec = {}, r1RecJob = {}, r1Job = {};
  var bump2 = function (store, key, q, field) {
    if (!key) return;
    var a = store[key] || (store[key] = {});
    var b = a[q] || (a[q] = { added: 0, cleared: 0 });
    b[field]++;
  };
  // ADDED = the candidate was ACTIONED at R1 (Jerin, 2026-08-29): an interview scheduled at R1, OR an
  // assignment/assessment triggered while they sat at R1. Either one counts, and a candidate with both
  // counts once. Cancelled bookings and cancelled assignments are excluded from both.
  var r1AssignDays = tofuAssignmentDays_(/^r1\b/i, 'the R1 stage');
  var r1Signals = {};
  var pushSig = function (aid, d) { (r1Signals[aid] || (r1Signals[aid] = [])).push(d); };
  for (var b1 in r1Days) r1Days[b1].forEach(function (d) { pushSig(b1, d); });
  for (var b2 in r1AssignDays) r1AssignDays[b2].forEach(function (d) { pushSig(b2, d); });
  Logger.log('R1 signals: ' + Object.keys(r1Days).length + ' applications with a booking, '
    + Object.keys(r1AssignDays).length + ' with an assignment, ' + Object.keys(r1Signals).length + ' distinct');

  var r1Added = 0, r1Cleared = 0, r1NoHistory = 0;
  for (var raid in r1Signals) {
    // earliest R1 action per quarter — booking or assignment, whichever came first
    var firstInQ = {};
    r1Signals[raid].forEach(function (d) {
      var q = tofuQuarter_(d); if (!q) return;
      if (!firstInQ[q] || d < firstInQ[q]) firstInQ[q] = d;
    });
    var rw = who[raid] || {};
    var rrec = rw.r || null, rjob8 = rw.j ? String(rw.j).substring(0, 8) : null;
    var ev = (events[raid] && events[raid].ev) || null;
    for (var rq in firstInQ) {
      var bookedOn = firstInQ[rq];
      r1Added++;
      bump2(r1Rec, rrec, rq, 'added');
      bump2(r1Job, rjob8, rq, 'added');
      if (rrec && rjob8) {
        var rj = r1RecJob[rrec] || (r1RecJob[rrec] = {});
        var rjq = rj[rjob8] || (rj[rjob8] = {});
        var cell = rjq[rq] || (rjq[rq] = { added: 0, cleared: 0 });
        cell.added++;
      }
      // did they go past R1?
      var moved = false;
      if (ev) {
        for (var e2 = 0; e2 < ev.length; e2++) {
          if (beyondR1[ev[e2].k] && ev[e2].e && ev[e2].e >= bookedOn) { moved = true; break; }
        }
      } else {
        // Archived, so its stage history is not in the live store. The drop backfill kept the earliest
        // Ref Check / Documentation / Offer arrival, which is the only 'past R1' evidence we hold for them.
        // ⚠ An archived candidate who reached R2-R5 but never a late stage cannot be seen — counted as not
        // cleared, and logged so the size of the blind spot is on the record rather than assumed small.
        // The archived sweep records the earliest stage each archived candidate reached BEYOND R1
        // (R2-R5, Ref Check, Documentation, Offer). Fall back to the drop backfill's late-stage date for
        // anything the sweep has not reached yet, and count what is still unjudgeable so the size of the
        // blind spot is logged rather than assumed away.
        var beyond = (archStore.beyondR1 || {})[raid];
        var h = archLate[raid];
        if (beyond && beyond >= bookedOn) moved = true;
        else if (h && h.e && h.e >= bookedOn) moved = true;
        else if (!beyond && !h) r1NoHistory++;
      }
      if (moved) {
        r1Cleared++;
        bump2(r1Rec, rrec, rq, 'cleared');
        bump2(r1Job, rjob8, rq, 'cleared');
        if (rrec && rjob8) r1RecJob[rrec][rjob8][rq].cleared++;
      }
    }
  }
  Logger.log('R1 screening: ' + r1Added + ' booked (per app x quarter), ' + r1Cleared + ' went past R1, '
    + r1NoHistory + ' archived with no history to judge (counted as not cleared)');
  Logger.log('ToFU: ' + total + ' arrivals (application x quarter), ' + unattributed + ' with neither recruiter nor job, '
    + Object.keys(byRec).length + ' recruiters, ' + Object.keys(byJob).length + ' jobs, archived HM contributions ' + archHmCount);
  return {
    tofuByRecruiter: byRec,
    tofuByJob: byJob,
    tofuByRecruiterJob: byRecJob,
    r1ByRecruiter: r1Rec,
    r1ByJob: r1Job,
    r1ByRecruiterJob: r1RecJob,
    // ⚠ archivedNoProgress is NOT a blind spot: the archived sweep COMPLETED on 2026-08-29 (all 14,128
    // applications read), so an archived candidate with no record past R1 genuinely did not progress.
    // While the sweep was still running the same count WAS a blind spot — 1,016 then, and the rates it
    // produced were understated by roughly ten points. Do not read the old meaning into the new number.
    r1Meta: { added: r1Added, cleared: r1Cleared, archivedNoProgress: r1NoHistory,
      rule: 'added = an interview scheduled at R1 OR an assignment triggered at R1, one per application per quarter, cancellations excluded; cleared = reached R2 or beyond on or after that day' },
    tofuMeta: {
      generatedAt: new Date().toISOString(),
      dedupe: 'application per quarter, earliest signal',
      signals: ['hmReview stage entry', 'assessment triggered in the Online Assessment stage', 'R1 interview booked'],
      arrivals: total,
      unattributed: unattributed,
      archivedHmApplications: archHmCount
    }
  };
}
