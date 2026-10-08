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

var ASSESS_ORDER = ['appReview', 'helloChristy', 'taScreen', 'hmReview', 'oa', 'r1', 'r2', 'r3', 'r4', 'r5', 'refCheck', 'docSub', 'offer'];
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
var ASSESS_ROUND_POOL = { oa: 1, r1: 1, r2: 1, r3: 1, r4: 1, r5: 1 };
// (a) App Review and HM Review are REVIEWS, not interviews: an unmatched feedback form saw only 41 and 19
//     people in a quarter. Count everyone ADDED instead, as Ref Check / Doc / Offer do. TA Screen is NOT
//     included - real screening calls happen there and are already picked up.
var ASSESS_ADDED_210 = { refCheck: 1, docSub: 1, offer: 1, appReview: 1, hmReview: 1 };

function assessQ_(day) {
  if (!day || day.length < 7) return null;
  return day.substring(0, 4) + '-Q' + (Math.floor((parseInt(day.substring(5, 7), 10) - 1) / 3) + 1);
}

// Signal 1 ‚Äî interviews HELD, per application per stage, earliest day.
// Also returns the event end times keyed (applicationId|userId), which is how a feedback form is matched
// back to the interview it was written about ‚Äî the same match the interviewer turnaround already uses.
function assessInterviews_() {
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
    var k = STAGE_KEY_MAP[title];
    if (!k) { if (title) unmapped[title] = (unmapped[title] || 0) + 1; return; }
    var evs = s.interviewEvents || [];
    for (var i = 0; i < evs.length; i++) {
      var ev = evs[i];
      var stMs = ev.startTime ? new Date(ev.startTime).getTime() : 0;
      if (!stMs) continue;
      // Ashby has no "attended" flag. A non-cancelled interview whose time has passed is the closest
      // thing to it ‚Äî a booking still in the future has assessed nobody yet.
      if (stMs > nowMs) { future++; continue; }
      var day = String(ev.startTime).substring(0, 10);
      var a = byApp[s.applicationId] || (byApp[s.applicationId] = {});
      if (!a[k] || day < a[k]) a[k] = day;
      kept++;
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
    + ', not yet held ' + future + ')' + (un.length ? ', UNMAPPED stage titles: ' + un.join(', ') : ''));
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
    var k = STAGE_KEY_MAP[titles[t.interviewStageId] || ''];
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
