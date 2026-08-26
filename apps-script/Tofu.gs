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

// { applicationId: [dayKey, ...] } for assessments triggered in the Online Assessment stage.
function tofuAssessmentDays_() {
  var rows = [];
  try { rows = ashbyListAll_('/takeHomeAssignment.list'); }
  catch (e) { Logger.log('ToFU: takeHomeAssignment.list failed: ' + e.message); return {}; }
  var ids = {};
  rows.forEach(function (t) { if (t.interviewStageId) ids[t.interviewStageId] = 1; });
  var titles = tofuStageTitles_(Object.keys(ids));
  var out = {}, kept = 0, cancelled = 0, wrongStage = 0;
  rows.forEach(function (t) {
    if (!t.applicationId || !t.createdAt) return;
    if (t.status === 'Cancelled') { cancelled++; return; }
    var title = titles[t.interviewStageId] || '';
    if (!/online assessment/i.test(title)) { wrongStage++; return; }
    (out[t.applicationId] || (out[t.applicationId] = [])).push(String(t.createdAt).substring(0, 10));
    kept++;
  });
  Logger.log('ToFU assessments: ' + rows.length + ' rows -> kept ' + kept + ' (cancelled ' + cancelled + ', not in the OA stage ' + wrongStage + ')');
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
  var oaDays = tofuAssessmentDays_();
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
  Logger.log('ToFU: ' + total + ' arrivals (application x quarter), ' + unattributed + ' with neither recruiter nor job, '
    + Object.keys(byRec).length + ' recruiters, ' + Object.keys(byJob).length + ' jobs, archived HM contributions ' + archHmCount);
  return {
    tofuByRecruiter: byRec,
    tofuByJob: byJob,
    tofuByRecruiterJob: byRecJob,
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
