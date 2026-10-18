// ===== #241 — WHICH OPENING A PERSON FILLED, RESOLVED ONCE, IN THE PIPELINE (19 Oct 2026) =====
//
// THE PROBLEM THIS FILE EXISTS FOR. `offerEvents[].openingId` is the opening named on the OFFER, and it is
// INCOMPLETE BY DESIGN. Two kinds of link are not in the Ashby API at all (#84, re-measured 19 Oct 2026 by
// probe241Links() with an invented control endpoint — `opening.list` and `opening.info` return the same
// shape and carry no application link, and `opening.getApplications` fails exactly like the control, which
// is what makes that genuine absence rather than a blocked key):
//    · the opening picked at the Hired step — when it is picked there, the offer's own box stays empty
//    · a person tied to an opening before they are hired
// Those live in `data/hire_links.json`, read by hand off Ashby's Openings screen on 15 Sep 2026 (41 links).
//
// 🔑 UNTIL NOW THE BROWSER MERGED THE TWO, in applyHireLinks() in site/js/data.js, at every page load. The
// site was right, but the FILE was not: anyone reading dashboard.json on its own — a tool, a pack, a future
// session — saw 40 joiners with "no opening" who all had one. That is exactly what happened building the Q3
// leadership pack on 18 Oct: 34 of 92 employee joiners reported as unlinked, every one of them linked.
// 🔑 SO THE PIPELINE RESOLVES IT HERE, ONCE, and publishes ONE answer. openingId / openingQuarter become the
// resolved values and `openingSource` says where each came from: 'offer' · 'hireLink' · 'none'.
//
// ⚠ THE MANUAL FILE STAYS AN INPUT. Nothing else can supply those links, so this does NOT replace it — it
// stops every reader having to know it exists. And because a hand-made file cannot grow by itself, a joiner
// who needs a link that is not in it is published as `dataQuality.joinersNoOpening`, which Data Hygiene
// shows as "Joiners Missing an Opening". That list reads 0 today; the day it does not, someone must open
// Ashby and add the link.
//
// 🚨 NO `var` AT FILE LEVEL, ON PURPOSE. Apps Script concatenates files in name order and this one sorts
// after DataRefresh.gs; a `var` here would still be undefined when DataRefresh's own file body runs. Every
// name below is a function declaration, which hoists across the whole project (the #240a lesson, the hard
// way: StageModel.gs as a `var` made every stage list read EMPTY, silently).

/**
 * FIRST FUNCTION IN THE FILE ON PURPOSE — the Run picker offers it, and it is read-only.
 * Proves the resolver on a fixture whose answer is known, WITH A CONTROL: the same fixture with the link
 * removed must come out unresolved. A test that cannot fail is not a test.
 */
function hlSelfTest() {
  var out = [];
  var mkFile = function (links) { return { generatedAt: '2026-09-15T09:31:37Z', links: links }; };
  // leading/trailing space AND a different case, which is what real rows look like and what trim+lower
  // is there for. ⚠ NOT a double inner space: trim does not collapse those, and neither does data.js —
  // the first run of this test used one and failed, correctly.
  var LINK = { candidate: '  asha rao ', jobId8: 'aaaa1111', startDate: '2026-08-01',
               openingId: 'ffffffff-1111-2222-3333-444444444444', openingQuarter: '2026-Q3', kind: 'hire' };
  var LOCK = { candidate: 'Bo Chen', jobId8: 'bbbb2222',
               openingId: 'eeeeeeee-5555-6666-7777-888888888888', openingQuarter: '2026-Q3', kind: 'lock' };
  var mkEvents = function () { return [
    // already linked on the offer — must be left alone and marked 'offer'
    { candidate: 'Zed Offer', jobId8: 'cccc3333', appStatus: 'Hired', startDate: '2026-08-05',
      openingId: 'dddddddd-9999-0000-1111-222222222222', openingQuarter: '2026-Q2',
      openingIdAny: 'dddddddd-9999-0000-1111-222222222222', openingQuarterAny: '2026-Q2', jobTitle: 'J3' },
    // name spaced and cased differently from the link, as real rows are — must still match
    { candidate: 'Asha Rao', jobId8: 'aaaa1111', appStatus: 'Hired', startDate: '2026-08-01',
      openingId: null, openingQuarter: null, openingIdAny: null, openingQuarterAny: null, jobTitle: 'J1' },
    // still in play, tied to an opening before hire
    { candidate: 'Bo Chen', jobId8: 'bbbb2222', appStatus: 'Active', startDate: '2026-11-01',
      openingId: null, openingQuarter: null, openingIdAny: null, openingQuarterAny: null, jobTitle: 'J2' },
    // a joiner nothing can resolve — the gap this task exists to surface
    { candidate: 'Gap Person', jobId8: 'dddd4444', appStatus: 'Hired', startDate: '2026-09-09',
      openingId: null, openingQuarter: null, openingIdAny: null, openingQuarterAny: null, jobTitle: 'J4' },
    // an ARCHIVED row (a drop). No link kind targets it, so it must never be filled from the file.
    { candidate: 'Asha Rao', jobId8: 'aaaa1111', appStatus: 'Archived', startDate: '2026-08-01',
      openingId: null, openingQuarter: null, openingIdAny: null, openingQuarterAny: null, jobTitle: 'J1' }
  ]; };
  var run = function (links) {
    var ev = mkEvents();
    var jp = [{ candidate: 'Bo Chen', jobId8: 'bbbb2222', linked: false, openingId: null, openingQuarter: null }];
    var gaps = [{ candidate: 'Asha Rao', jobId8: 'aaaa1111', appStatus: 'Hired', doj: '2026-08-01' },
                { candidate: 'Gap Person', jobId8: 'dddd4444', appStatus: 'Hired', doj: '2026-09-09' }];
    return hlApply_(mkFile(links), ev, jp, gaps, '2026-07-01');
  };

  var a = run([LINK, LOCK]);
  var src = a.offerEvents.map(function (e) { return e.openingSource; }).join(',');
  out.push(['sources', src, 'offer,hireLink,hireLink,none,none']);
  out.push(['applied', String(a.resolution.applied), '3']);
  out.push(['joiner gaps', a.joinersNoOpening.map(function (g) { return g.candidate; }).join(','), 'Gap Person']);
  out.push(['offerLinkGaps left', a.offerLinkGaps.map(function (g) { return g.candidate; }).join(','), 'Gap Person']);
  out.push(['jp linked', String(a.joiningPendingCases[0].linked), 'true']);
  out.push(['jp opening is 8 chars', String((a.joiningPendingCases[0].openingId || '').length), '8']);
  out.push(['archived untouched', String(a.offerEvents[4].openingId), 'null']);
  out.push(['unused links', JSON.stringify(a.resolution.unusedLinks), '[]']);

  // THE CONTROL. Take the hire link away and the same fixture must come out unresolved, with the person
  // in the gap list and the link count down by one. If this half passes unchanged, the test above proves
  // nothing — it would mean the resolver ignores the file.
  var b = run([LOCK]);
  out.push(['CONTROL sources', b.offerEvents.map(function (e) { return e.openingSource; }).join(','),
            'offer,none,hireLink,none,none']);
  out.push(['CONTROL joiner gaps', b.joinersNoOpening.map(function (g) { return g.candidate; }).sort().join(','),
            'Asha Rao,Gap Person']);
  // 2, not 1: the one remaining link is a 'lock', and a lock fills BOTH the live offer record and the
  // Joining Pipeline case for the same person. That pairing is the whole point of kind 'lock' (#132).
  out.push(['CONTROL applied', String(b.resolution.applied), '2']);
  // And an unused link must be reported, never guessed onto somebody else.
  var c = run([LINK, LOCK, { candidate: 'Nobody At All', jobId8: 'zzzz9999', startDate: '2026-08-01',
                             openingId: 'x', openingQuarter: '2026-Q3', kind: 'hire' }]);
  out.push(['unused reported', JSON.stringify(c.resolution.unusedLinks), '["Nobody At All"]']);

  var bad = 0;
  out.forEach(function (r) {
    var ok = r[1] === r[2];
    if (!ok) bad++;
    Logger.log((ok ? 'PASS  ' : 'FAIL  ') + r[0] + '  got[' + r[1] + ']' + (ok ? '' : '  want[' + r[2] + ']'));
  });
  Logger.log(bad ? ('hlSelfTest: ' + bad + ' FAILED') : ('hlSelfTest: all ' + out.length + ' passed'));
  return bad === 0;
}

/**
 * Called by both refresh jobs. Reads the link file, resolves, and hands back everything the dashboard
 * object needs. Never throws: if the file cannot be read, `resolution` comes back null, the records are
 * left exactly as the offers gave them, and the site falls back to merging the file in the browser as it
 * did before #241. A degraded day must not be a wrong day.
 */
function hlResolve_(offerEvents, joiningPendingCases, offerLinkGaps, floor) {
  var loaded = null;
  try { loaded = hlLoadLinkFile_(); } catch (e) { Logger.log('#241 link file read failed: ' + e.message); }
  if (!loaded || !loaded.file || !Array.isArray(loaded.file.links)) {
    Logger.log('#241 NO LINK FILE — publishing the offer links only; the site will merge in the browser.');
    return { resolution: null, offerEvents: offerEvents, joiningPendingCases: joiningPendingCases,
             offerLinkGaps: offerLinkGaps, joinersNoOpening: [] };
  }
  var out = hlApply_(loaded.file, offerEvents, joiningPendingCases, offerLinkGaps, floor);
  out.resolution.fileSource = loaded.source;
  Logger.log('#241 openings resolved: ' + out.resolution.fromOffer + ' from the offer, '
    + out.resolution.fromLink + ' from hire_links.json (' + loaded.source + ', captured '
    + String(out.resolution.fileGeneratedAt || '?').substring(0, 10) + '), '
    + out.joinersNoOpening.length + ' joiner(s) since ' + floor + ' with NO opening anywhere'
    + (out.resolution.unusedLinks.length ? '; UNUSED links: ' + out.resolution.unusedLinks.join(', ') : ''));
  return out;
}

/**
 * THE WHOLE RULE, pure and argument-only so it can be run outside Apps Script. It is a line-for-line port
 * of applyHireLinks() in site/js/data.js — deliberately, because both have to agree: the browser still runs
 * that path for any dashboard.json written before #241.
 *
 * 🔑 A link fills ONLY a record that names no opening. An offer's own opening is never overwritten.
 *    kind 'hire' → Hired offers, matched on candidate + job + start date
 *    kind 'lock' → still-live records (Active), matched on candidate + job
 * ⚠ Neither kind targets an ARCHIVED row, so drops are untouched by construction — which matters, because
 *   dropEvents is built from these same records and prices a drop from the opening its offer names (#183b).
 */
function hlApply_(file, offerEvents, joiningPendingCases, offerLinkGaps, floor) {
  var links = (file && file.links) || [];
  var person = function (name, j8) { return String(name == null ? '' : name).trim().toLowerCase() + '|' + (j8 || ''); };
  var hires = {}, locks = {}, usedKey = {};
  links.forEach(function (l, i) {
    l.__i = i;
    if ((l.kind || 'hire') === 'lock') locks[person(l.candidate, l.jobId8)] = l;
    else hires[person(l.candidate, l.jobId8) + '|' + (l.startDate || '')] = l;
  });
  var cleared = {}, fromOffer = 0, fromLink = 0, applied = 0;

  (offerEvents || []).forEach(function (e) {
    if (e.openingId) { e.openingSource = 'offer'; fromOffer++; return; }
    var p = person(e.candidate, e.jobId8);
    var l = e.appStatus === 'Hired' ? hires[p + '|' + (e.startDate || '')]
          : (e.appStatus === 'Active' ? locks[p] : null);
    if (!l) { e.openingSource = 'none'; return; }
    e.openingId = l.openingId;
    e.openingQuarter = l.openingQuarter;
    if (!e.openingIdAny) { e.openingIdAny = l.openingId; e.openingQuarterAny = l.openingQuarter; }
    e.openingVia = e.appStatus === 'Hired' ? 'hire' : 'lock';
    e.openingSource = 'hireLink';
    cleared[e.appStatus + '|' + p + '|' + (e.appStatus === 'Hired' ? (e.startDate || '') : '')] = 1;
    usedKey[l.__i] = 1; fromLink++; applied++;
  });

  (joiningPendingCases || []).forEach(function (c) {
    if (c.linked) { c.openingSource = 'offer'; return; }
    var l = locks[person(c.candidate, c.jobId8)];
    if (!l) { c.openingSource = 'none'; return; }
    c.linked = true;
    // 8 characters, which is what this field carries everywhere else on a JP case (#161) and what
    // openingRows is keyed by. The browser's own fallback wrote the full uuid here, which would have
    // matched nothing on the SME level; it has never fired in live data (0 cases today), and data.js is
    // corrected to agree so the two paths can never give different answers.
    c.openingId = String(l.openingId || '').substring(0, 8);
    c.openingQuarter = l.openingQuarter;
    c.openingVia = 'lock';
    c.openingSource = 'hireLink';
    usedKey[l.__i] = 1; applied++;
  });

  // An offer-link gap that a link has just filled is no longer a gap. The browser did this filtering after
  // the fact; doing it here is what makes the published file true on its own.
  var gapsOut = (offerLinkGaps || []).filter(function (g) {
    return !cleared[g.appStatus + '|' + person(g.candidate, g.jobId8) + '|'
      + (g.appStatus === 'Hired' ? (g.doj || '') : '')];
  });

  // THE GAP THE MANUAL FILE CANNOT CLOSE BY ITSELF: someone who has actually started, since the reporting
  // floor, and whose opening is in neither place. Published so Data Hygiene can show it; verify.sh check 7
  // tests the same population from outside.
  var joinersNoOpening = [];
  (offerEvents || []).forEach(function (e) {
    if (e.appStatus !== 'Hired') return;
    if (!floor || !(String(e.startDate || '') >= floor)) return;
    if (e.openingSource !== 'none') return;
    joinersNoOpening.push({ candidate: e.candidate || null, job: e.jobTitle || '', jobId8: e.jobId8 || null,
      department: e.department || '', recruiter: e.recruiter || null, doj: e.startDate || null,
      offerCreatedAt: e.offerCreatedAt || null });
  });
  joinersNoOpening.sort(function (a, b) { return (a.doj || '') < (b.doj || '') ? 1 : -1; });

  var unused = [];
  links.forEach(function (l) { if (!usedKey[l.__i]) unused.push(l.candidate); delete l.__i; });

  return {
    offerEvents: offerEvents, joiningPendingCases: joiningPendingCases,
    offerLinkGaps: gapsOut, joinersNoOpening: joinersNoOpening,
    resolution: {
      schema: 1,
      resolvedAt: new Date().toISOString(),
      fileGeneratedAt: (file && file.generatedAt) || null,
      fileSource: 'unknown',
      links: links.length,
      applied: applied,
      fromOffer: fromOffer,
      fromLink: fromLink,
      gapsCleared: (offerLinkGaps || []).length - gapsOut.length,
      joinersFloor: floor || null,
      joinersNoOpening: joinersNoOpening.length,
      unusedLinks: unused
    }
  };
}

/**
 * Reads data/hire_links.json. GitHub first — it is the file's one home, and the contents API is not CDN
 * cached, unlike raw.githubusercontent.com. A Drive mirror is kept so a GitHub outage still resolves; the
 * answer says which was used, because a silently stale mirror is worse than a visible gap.
 */
function hlLoadLinkFile_() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('GITHUB_TOKEN'), repo = props.getProperty('GITHUB_REPO');
  if (token && repo) {
    try {
      var r = UrlFetchApp.fetch('https://api.github.com/repos/' + repo + '/contents/data/hire_links.json',
        { headers: { Authorization: 'token ' + token, 'User-Agent': 'IK-Dashboard' }, muteHttpExceptions: true });
      if (r.getResponseCode() === 200) {
        var enc = (JSON.parse(r.getContentText()).content || '').replace(/\n/g, '');
        var txt = Utilities.newBlob(Utilities.base64Decode(enc)).getDataAsString();
        var parsed = JSON.parse(txt);
        if (parsed && Array.isArray(parsed.links)) {
          try { saveDriveJson_('hire_links_mirror.json', parsed); } catch (eS) { Logger.log('#241 mirror save: ' + eS.message); }
          return { file: parsed, source: 'github' };
        }
      }
      Logger.log('#241 GitHub read of hire_links.json: HTTP ' + r.getResponseCode());
    } catch (e) { Logger.log('#241 GitHub read of hire_links.json failed: ' + e.message); }
  }
  var mirror = loadDriveJson_('hire_links_mirror.json');
  if (mirror && Array.isArray(mirror.links)) return { file: mirror, source: 'drive-mirror' };
  return null;
}
