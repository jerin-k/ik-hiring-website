/**
 * Fractal / Verizon - write ONE note on each candidate of the two Verizon jobs.
 *
 * Owned by the acceler-client-submissions project: this file's source of truth is
 * ashby-uploads/apps-script/NotesVerizon.gs there. It is the ONE file Jerin approved that
 * project adding to "Ashby Dashboard Server" (11 Nov 2026). It calls only getAshbyApiKey_()
 * and ASHBY_API_BASE from DataRefresh.gs, defines nothing outside the nvz/NVZ prefix, and
 * creates NO TRIGGER - it cannot touch the refresh schedule or the 20-trigger ceiling.
 *
 * 🔒 NO CANDIDATE DATA IS IN THIS FILE AND NONE MUST EVER BE PUT IN IT.
 *    Every .gs here is mirrored to a PUBLIC GitHub repo. Emails and note text are read AT RUN
 *    TIME from PRIVATE Drive files; this file holds only their ids.
 *
 * Run from the editor:
 *   runVerizonNotes()       NVZ_MODE 'dry' resolves everyone and writes NOTHING; 'run' writes.
 *                           Resumable: run again after the 6-minute limit and it carries on.
 *                           Safe to re-run: anyone already carrying a note that starts with
 *                           NVZ_MARK is skipped, so nobody gets the note twice.
 *   runVerizonNotesReset()  clears the resume cursor (and the census cursor).
 *   verifyVerizonNotes()    READ-ONLY census from the JOB side: every candidate on the two jobs,
 *                           does each carry the note? Resumable the same way.
 *
 * NEVER from here: triggerRefreshNow() / setupDailyTriggers() - they delete the live triggers.
 */

var NVZ_FILE_IDS   = ['1zBRrRvVn7taDibUPIscu9oX_Y3jWIZ-0',   // fractal-verizon-ashby-notes-part-1-of-4-2026-11-11.json
                      '1T0NhTTiGwP5ZFSU2rDLEAVWmKkYNVtm4',   // part 2 of 4
                      '1KiXDoydgLlD_61h1vVnmrN1yuVbrfoLH',   // part 3 of 4
                      '1a1carpuHqSgriDIONb_EQAnYGpgPffxe'];  // part 4 of 4 - PRIVATE, jerin@IK My Drive, owner only
var NVZ_MODE       = 'run';       // 'dry' | 'run'
var NVZ_JOBS       = ['Principal- AI Engineering (Verizon)',             // no space before the hyphen
                      'Associate Director - AI Engineering (Verizon)'];
var NVZ_SINCE_MS   = Date.UTC(2026, 10, 10);   // both jobs were created 11 Nov 2026
var NVZ_MARK       = 'Fractal / Verizon sourcing';  // every note's first line starts with this
var NVZ_EXP_PEOPLE = 665;         // payload signature, counted locally before upload
var NVZ_EXP_CHARS  = 581079;      //   (build-summary.txt, 11 Nov 2026); a mismatch makes the run refuse
var NVZ_IDX_KEY    = 'NVZ_IDX';
var NVZ_VER_KEY    = 'NVZ_VER';
var NVZ_MAX_MS     = 4.5 * 60 * 1000;

/* ---------- pure helpers (no Ashby, no Drive) - unit-tested locally ---------- */

/** Merge the parsed Drive parts into one list, sorted by email so the resume cursor is stable. */
function nvzMergeParts_(parts) {
  var seen = {}, out = [];
  for (var i = 0; i < parts.length; i++) {
    var d = parts[i];
    if (!d || d.task !== 'verizon-notes') throw new Error('part ' + (i + 1) + ' is not a verizon-notes payload');
    if (!d.people || !d.people.length) throw new Error('part ' + (i + 1) + ' has no people');
    for (var j = 0; j < d.people.length; j++) {
      var e = String(d.people[j].e || '').trim().toLowerCase();
      var n = String(d.people[j].n || '');
      if (!e) throw new Error('part ' + (i + 1) + ' row ' + (j + 1) + ' has no email');
      if (n.indexOf(NVZ_MARK) !== 0) throw new Error('part ' + (i + 1) + ' row ' + (j + 1) + ' note does not start with the marker');
      if (seen[e]) throw new Error('DUPLICATE email across the payload at part ' + (i + 1) + ' row ' + (j + 1));
      seen[e] = 1;
      out.push({ email: e, note: n });
    }
  }
  out.sort(function (a, b) { return a.email < b.email ? -1 : (a.email > b.email ? 1 : 0); });
  return out;
}

/** People and characters, to compare with the signature measured before upload. */
function nvzSignature_(people) {
  var chars = 0;
  for (var i = 0; i < people.length; i++) chars += people[i].note.length;
  return { people: people.length, chars: chars };
}

/**
 * From candidate.search results, the ONE candidate carrying that exact address - or a reason.
 * Ashby already holds some people TWICE under one email (seen 11 Nov: Rupinder Guron, a 27 Oct record
 * flagged "Duplicate Candidate"). When two records carry the address, the one holding the Verizon
 * application (onJobs) is the right one; if that does not settle it to exactly one, skip and report.
 */
function nvzPickExact_(results, email, onJobs) {
  var hits = (results || []).filter(function (c) {
    var addrs = (c.emailAddresses || []).map(function (x) { return String(x && x.value || '').trim().toLowerCase(); });
    var primary = String(c.primaryEmailAddress && c.primaryEmailAddress.value || '').trim().toLowerCase();
    if (primary) addrs.push(primary);
    return addrs.indexOf(email) !== -1;
  });
  if (hits.length === 0) return { skip: 'no candidate carries that exact address' };
  if (hits.length > 1) {
    var onHits = onJobs ? hits.filter(function (c) { return onJobs[c.id]; }) : [];
    if (onHits.length === 1) return { id: onHits[0].id, dup: true };
    return { skip: 'AMBIGUOUS - ' + hits.length + ' candidates share it, ' + onHits.length + ' of them on a Verizon job' };
  }
  return { id: hits[0].id };
}

/** Does a candidate.listNotes result already hold our note? */
function nvzRowsHaveMark_(results) {
  var rows = results || [];
  if (!Array.isArray(rows)) rows = rows.notes || [];
  for (var i = 0; i < rows.length; i++) {
    var body = rows[i] && (rows[i].content || rows[i].note || '');
    if (typeof body === 'object' && body) body = body.value || body.text || '';
    if (String(body).indexOf(NVZ_MARK) !== -1) return true;
  }
  return false;
}

/* ---------- Ashby and Drive ---------- */

function nvzCall_(endpoint, body) {
  var resp = UrlFetchApp.fetch(ASHBY_API_BASE + '/' + endpoint, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'Authorization': 'Basic ' + Utilities.base64Encode(getAshbyApiKey_() + ':') },
    payload: JSON.stringify(body || {})
  });
  var code = resp.getResponseCode(), text = String(resp.getContentText() || ''), json = null;
  try { json = JSON.parse(text); } catch (e) {}
  // Ashby answers 200 with {success:false} on a bad request - a 200 alone is NOT success.
  return { code: code, json: json, text: text.substring(0, 300), ok: code === 200 && !!json && json.success === true };
}

function nvzReadPayload_() {
  if (!NVZ_FILE_IDS.length) throw new Error('NVZ_FILE_IDS is empty - the payload files are not installed');
  var parts = NVZ_FILE_IDS.map(function (id) {
    return JSON.parse(DriveApp.getFileById(id).getBlob().getDataAsString('UTF-8'));
  });
  var people = nvzMergeParts_(parts);
  var sig = nvzSignature_(people);
  if (!NVZ_EXP_PEOPLE || !NVZ_EXP_CHARS) throw new Error('signature not set - refusing');
  if (sig.people !== NVZ_EXP_PEOPLE || sig.chars !== NVZ_EXP_CHARS) {
    throw new Error('payload signature MISMATCH: ' + sig.people + ' people / ' + sig.chars
      + ' chars, expected ' + NVZ_EXP_PEOPLE + ' / ' + NVZ_EXP_CHARS + ' - refusing');
  }
  return people;
}

/** candidateId -> job title, for every application on the two Verizon jobs. */
function nvzOnJobs_() {
  var jobIds = {}, cur = null, pg = 0;
  do {
    var b = { limit: 100 }; if (cur) b.cursor = cur;
    var jr = nvzCall_('job.list', b);
    if (!jr.ok) throw new Error('job.list HTTP ' + jr.code + ' ' + jr.text);
    (jr.json.results || []).forEach(function (j) { if (NVZ_JOBS.indexOf(j.title) !== -1) jobIds[j.id] = j.title; });
    cur = jr.json.moreDataAvailable ? jr.json.nextCursor : null; pg++;
  } while (cur && pg < 40);
  var found = Object.keys(jobIds).length;
  if (found !== NVZ_JOBS.length) throw new Error('found ' + found + ' of ' + NVZ_JOBS.length + ' Verizon jobs by exact title - refusing');

  var on = {}, c2 = null, p2 = 0;
  do {
    var b2 = { createdAfter: NVZ_SINCE_MS, limit: 100 }; if (c2) b2.cursor = c2;
    var ar = nvzCall_('application.list', b2);
    if (!ar.ok) throw new Error('application.list HTTP ' + ar.code + ' ' + ar.text);
    (ar.json.results || []).forEach(function (a) {
      var jid = (a.job && a.job.id) || a.jobId, jt = a.job && a.job.title, cid = a.candidate && a.candidate.id;
      if (cid && (jobIds[jid] || NVZ_JOBS.indexOf(jt) !== -1)) on[cid] = jobIds[jid] || jt;
    });
    c2 = ar.json.moreDataAvailable ? ar.json.nextCursor : null; p2++;
  } while (c2 && p2 < 80);
  return on;
}

/** true / false, or null when Ashby could not say. */
function nvzHasNote_(candidateId) {
  var r = nvzCall_('candidate.listNotes', { candidateId: candidateId });
  if (!r.ok) return null;
  return nvzRowsHaveMark_(r.json.results);
}

function runVerizonNotesReset() {
  var P = PropertiesService.getScriptProperties();
  P.deleteProperty(NVZ_IDX_KEY); P.deleteProperty(NVZ_VER_KEY);
  Logger.log('Verizon notes: resume and census cursors cleared.');
}

function runVerizonNotes() {
  var t0 = new Date().getTime(), P = PropertiesService.getScriptProperties();
  var mode = NVZ_MODE === 'run' ? 'run' : 'dry';
  var people = nvzReadPayload_();
  var on = nvzOnJobs_();
  var idx = parseInt(P.getProperty(NVZ_IDX_KEY) || '0', 10); if (isNaN(idx) || idx < 0) idx = 0;
  Logger.log('Verizon notes | MODE=' + mode.toUpperCase() + ' | payload ' + people.length + ' people (signature OK)'
    + ' | on the two jobs ' + Object.keys(on).length + ' candidates | starting at ' + idx);
  if (mode === 'dry') Logger.log('DRY RUN - candidate.createNote is NOT called.');

  var t = { wrote: 0, already: 0, skipped: 0, dupResolved: 0 }, skips = [], shown = 0;
  for (var i = idx; i < people.length; i++) {
    if (new Date().getTime() - t0 > NVZ_MAX_MS) { Logger.log('stopping on the clock at ' + i + ' - run again to carry on.'); break; }
    var p = people[i];
    var s = nvzCall_('candidate.search', { email: p.email });
    var res = s.ok ? nvzPickExact_(s.json.results, p.email, on) : { skip: 'search HTTP ' + s.code };
    if (res.dup) t.dupResolved++;
    if (!res.skip && !on[res.id]) res = { skip: 'not on either Verizon job' };
    var has = res.skip ? null : nvzHasNote_(res.id);
    if (!res.skip && has === null) res = { skip: 'listNotes failed - could not tell' };

    if (res.skip) { t.skipped++; skips.push('index ' + i + ' -> ' + res.skip); }
    else if (has) { t.already++; }
    else if (mode === 'dry') {
      if (shown++ < 2) Logger.log('WOULD WRITE to ' + res.id + ' (' + on[res.id] + '), ' + p.note.length + ' chars:\n' + p.note.substring(0, 300));
      t.wrote++;
    } else {
      var w = nvzCall_('candidate.createNote', { candidateId: res.id,
        note: { type: 'text/plain', value: p.note }, sendNotifications: false });
      if (w.ok) t.wrote++; else { t.skipped++; skips.push('index ' + i + ' -> createNote HTTP ' + w.code + ' ' + w.text); }
      Utilities.sleep(120);
    }
    if (mode === 'run') P.setProperty(NVZ_IDX_KEY, String(i + 1));
  }
  var reached = mode === 'run' ? parseInt(P.getProperty(NVZ_IDX_KEY) || '0', 10) : i;
  Logger.log('batch done: ' + (mode === 'dry' ? 'would write ' : 'wrote ') + t.wrote + ' | already had it ' + t.already
    + ' | skipped ' + t.skipped + ' | two records, settled by the Verizon job ' + t.dupResolved
    + ' | reached ' + reached + ' of ' + people.length);
  skips.slice(0, 40).forEach(function (x) { Logger.log('   SKIP ' + x); });
  if (reached >= people.length) Logger.log('ALL ' + people.length + ' processed. Now run verifyVerizonNotes() and look at one record in the Ashby UI (Notes tab).');
}

/** READ-ONLY. Walks the jobs, not the payload - the opposite direction from the write. */
function verifyVerizonNotes() {
  var t0 = new Date().getTime(), P = PropertiesService.getScriptProperties();
  var on = nvzOnJobs_(), ids = Object.keys(on).sort();
  var st = JSON.parse(P.getProperty(NVZ_VER_KEY) || '{"i":0,"with":0,"without":0,"unknown":0}');
  for (; st.i < ids.length; st.i++) {
    if (new Date().getTime() - t0 > NVZ_MAX_MS) break;
    var h = nvzHasNote_(ids[st.i]);
    if (h === true) st['with']++; else if (h === false) st.without++; else st.unknown++;
  }
  P.setProperty(NVZ_VER_KEY, JSON.stringify(st));
  Logger.log('Verizon notes census: checked ' + st.i + ' of ' + ids.length + ' candidates on the two jobs | with the note '
    + st['with'] + ' | without ' + st.without + ' | could not tell ' + st.unknown
    + (st.i < ids.length ? ' | run again to carry on' : ' | DONE'));
}
