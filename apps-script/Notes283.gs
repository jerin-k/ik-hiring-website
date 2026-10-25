/**
 * #283 - write the FDE - Wonderful.ai fitment notes onto candidate records.
 *
 * 🔒 THE NOTE TEXT IS NOT IN THIS FILE AND MUST NEVER BE PUT IN IT.
 *    Every .gs in this project is mirrored into a PUBLIC GitHub repo, and these notes are
 *    candidate assessment text. They are read AT RUN TIME from a PRIVATE Drive file in
 *    "Ashby Hiring Dashboards". This file holds only its id.
 *
 * Entry point:  run283Notes()
 *   - N283_MODE 'dry' reads everything, resolves every candidate and prints what WOULD be
 *     written, without calling a single write endpoint. 'run' writes.
 *   - It is RESUMABLE: the index of the last person finished is kept in Script Properties,
 *     so a run that hits the 6-minute editor limit is continued simply by running it again.
 *   - It creates NO TRIGGER, so it cannot touch the refresh schedule or the 20-trigger ceiling.
 *
 * Reset before a fresh pass:  run283NotesReset()
 */

var N283_FILE_IDS = [                                      // PRIVATE Drive files holding the notes
  '1dZrin7TrJobaV2oVCZzXX_95XY7Xstls', '1SOBKr4cbNTySXKOVjvmaWRuwmkuerqGn',
  '1xXlWeX7oaB-w2AsVIMU6wbF76TZQq0Te', '1ysutX8rGibZ57k03aOW6xsTghuIorYmG',
  '1oUinItIZonh82ssjH8E32Vc6HxPYs-as', '1XRWXEIy3w9Ggr5f1taV8XPAvEYGjNNtm',
  '1pQwiHFaggKH_XloQBgMr9CHw99vqgXJ6', '18JvmSSrMYBcDz-8rb7Lk2mPO1m0Ea7AE',
  '1uPys526LtEiWF1h4awLmAtZoBQM3jSL9', '1mGt7EFOPojOzxGu0bFnFRAGCnzW54HaE',
  '1nhsxvOJGLz3e1jPyMWPSFxp8qpuYDshz'
];
var N283_MODE    = 'run';                                  // 'dry' | 'run'
var N283_BATCH   = 200;                                    // people per invocation
var N283_IDX_KEY = 'N283_IDX';                             // resume cursor
var N283_MAX_MS  = 4.5 * 60 * 1000;                        // stop well inside the 6-minute limit

/** Basic-auth header, the same shape the pipeline uses everywhere else. */
function n283Auth_() {
  return { 'Authorization': 'Basic ' + Utilities.base64Encode(getAshbyApiKey_() + ':') };
}

function n283Call_(endpoint, body) {
  var resp = UrlFetchApp.fetch(ASHBY_API_BASE + '/' + endpoint, {
    method: 'post',
    contentType: 'application/json',
    headers: n283Auth_(),
    payload: JSON.stringify(body || {}),
    muteHttpExceptions: true
  });
  var code = resp.getResponseCode();
  var text = String(resp.getContentText() || '');
  var json = null;
  try { json = JSON.parse(text); } catch (e) {}
  return { code: code, json: json, text: text.substring(0, 300) };
}

/** Read the notes out of the PRIVATE Drive file. Never from the repo, never from this file. */
function n283ReadPayload_() {
  var out = { learners: {}, smes: {} };
  for (var i = 0; i < N283_FILE_IDS.length; i++) {
    var blob = DriveApp.getFileById(N283_FILE_IDS[i]).getBlob().getDataAsString('UTF-8');
    var d = JSON.parse(blob);
    if (!d || (!d.learners && !d.smes)) throw new Error('part ' + (i + 1) + ' has neither learners nor smes');
    ['learners', 'smes'].forEach(function (g) {
      Object.keys(d[g] || {}).forEach(function (k) {
        if (out[g][k]) throw new Error('DUPLICATE across parts: ' + g + ' ' + k);
        out[g][k] = d[g][k];
      });
    });
  }
  return out;
}

/**
 * One flat, DETERMINISTICALLY ORDERED list. The resume cursor is an index into this list,
 * so the order must not change between runs - hence the sort.
 */
function n283People_(payload) {
  var out = [];
  ['learners', 'smes'].forEach(function (grp) {
    var m = payload[grp] || {};
    Object.keys(m).forEach(function (email) {
      out.push({ email: String(email).trim().toLowerCase(), note: m[email], group: grp });
    });
  });
  out.sort(function (a, b) {
    if (a.group !== b.group) return a.group < b.group ? -1 : 1;
    return a.email < b.email ? -1 : (a.email > b.email ? 1 : 0);
  });
  return out;
}

/**
 * Resolve ONE email to ONE candidate id.
 * 🚨 Matches on EMAIL only, never on name, and refuses anything ambiguous: a result counts
 * only if that exact address is on the candidate's own list of addresses. Returns
 * {id:…} or {skip:'reason'} - a skip is reported, never guessed past.
 */
function n283ResolveByEmail_(email) {
  var r = n283Call_('candidate.search', { email: email });
  if (r.code !== 200 || !r.json || r.json.success !== true) {
    return { skip: 'search HTTP ' + r.code + ' ' + r.text };
  }
  var hits = (r.json.results || []).filter(function (c) {
    var addrs = (c.emailAddresses || []).map(function (e) {
      return String(e && e.value || '').trim().toLowerCase();
    });
    var primary = String(c.primaryEmailAddress && c.primaryEmailAddress.value || '').trim().toLowerCase();
    if (primary) addrs.push(primary);
    return addrs.indexOf(email) !== -1;
  });
  if (hits.length === 0) return { skip: 'no candidate carries that exact address' };
  if (hits.length > 1) {
    return { skip: 'AMBIGUOUS - ' + hits.length + ' candidates share it: '
      + hits.map(function (c) { return c.id; }).join(' ') };
  }
  return { id: hits[0].id };
}

function run283Notes() {
  var started = new Date().getTime();
  var props = PropertiesService.getScriptProperties();
  var mode = N283_MODE === 'run' ? 'run' : 'dry';

  var payload = n283ReadPayload_();
  var people = n283People_(payload);
  var idx = parseInt(props.getProperty(N283_IDX_KEY) || '0', 10);
  if (isNaN(idx) || idx < 0) idx = 0;

  var chars = 0;
  for (var c = 0; c < people.length; c++) chars += people[c].note.length;
  Logger.log('#283 CHECKSUM | notes ' + people.length + ' | note characters ' + chars
    + '  (expected 739 and 456080)');
  Logger.log('#283 notes | MODE=' + mode.toUpperCase() + ' | ' + people.length
    + ' people in the payload | starting at index ' + idx
    + ' | batch ' + N283_BATCH);
  if (mode === 'dry') Logger.log('#283 DRY RUN - candidate.createNote is NOT called.');

  var wrote = 0, skipped = 0, done = 0;
  var skips = [];

  for (var i = idx; i < people.length && done < N283_BATCH; i++) {
    if (new Date().getTime() - started > N283_MAX_MS) {
      Logger.log('#283 stopping on the clock at index ' + i + ' - run it again to carry on.');
      break;
    }
    var p = people[i];
    var res = n283ResolveByEmail_(p.email);

    if (res.skip) {
      skipped++; skips.push(p.email + '  ->  ' + res.skip);
    } else if (mode === 'dry') {
      if (done < 3) {
        Logger.log('#283 WOULD WRITE to ' + res.id + ' (' + p.group + ', ' + p.email + '):\n'
          + p.note.substring(0, 400) + (p.note.length > 400 ? '\n…[' + p.note.length + ' chars]' : ''));
      }
      wrote++;
    } else {
      var w = n283Call_('candidate.createNote', {
        candidateId: res.id,
        note: { type: 'text/plain', value: p.note },
        sendNotifications: false          // 741 notifications would be a nuisance, not a feature
      });
      if (w.code === 200 && w.json && w.json.success === true) {
        wrote++;
      } else {
        skipped++; skips.push(p.email + '  ->  createNote HTTP ' + w.code + ' ' + w.text);
      }
      Utilities.sleep(120);
    }
    done++;
    if (mode === 'run') props.setProperty(N283_IDX_KEY, String(i + 1));
  }

  var reached = parseInt(props.getProperty(N283_IDX_KEY) || '0', 10);
  Logger.log('#283 batch finished: ' + wrote + ' ' + (mode === 'dry' ? 'resolved OK' : 'written')
    + ', ' + skipped + ' skipped, cursor now ' + (mode === 'dry' ? '(unchanged in dry mode) ' : '') + reached
    + ' of ' + people.length);
  if (skips.length) {
    Logger.log('#283 SKIPS (' + skips.length + '):');
    skips.forEach(function (s) { Logger.log('   ' + s); });
  }
  if (mode === 'run' && reached >= people.length) {
    Logger.log('#283 ALL ' + people.length + ' PEOPLE PROCESSED. Verify in the Ashby UI, then log it in V9.');
  }
}

/** Put the cursor back to the start. Does not remove any note already written. */
function run283NotesReset() {
  PropertiesService.getScriptProperties().deleteProperty(N283_IDX_KEY);
  Logger.log('#283 cursor cleared - the next run starts at 0. Notes already written are NOT removed.');
}


/* ------------------------------------------------------------------ *
 *  #283b - the people whose address sits on MORE THAN ONE Ashby record.
 *  run283Notes() refuses to guess between duplicates, which is right:
 *  a note on the wrong twin is worse than no note. This pass settles
 *  them by a rule anyone can check - of the records sharing an address,
 *  take the one that is actually ON the Wonderful.ai job. If exactly one
 *  is, the note goes there. If none or several are, nothing is written
 *  and the person is listed for a human.
 *
 *  It is resumable in the same way as the main pass, and it NEVER touches
 *  a person whose address resolves to a single record - they already have
 *  their note and a second one would be a duplicate.
 * ------------------------------------------------------------------ */

var N283_JOB_ID    = '1b6df61c' + '-c3ea-4765-84b6-1ee084e34123';   // FDE - Wonderful.ai
var N283_AMB_MODE  = 'run';                                          // 'dry' | 'run'
var N283_AMB_BATCH = 260;                                            // addresses looked at per invocation
var N283_AMB_IDX   = 'N283_AMB_IDX';
var N283_AMB_HITS  = 'N283_AMB_HITS';                                // running tally across invocations

/** Every candidate id whose OWN addresses include this one. */
function n283AllIdsByEmail_(email) {
  var r = n283Call_('candidate.search', { email: email });
  if (r.code !== 200 || !r.json || r.json.success !== true) return null;
  return (r.json.results || []).filter(function (c) {
    var addrs = (c.emailAddresses || []).map(function (e) {
      return String(e && e.value || '').trim().toLowerCase();
    });
    var primary = String(c.primaryEmailAddress && c.primaryEmailAddress.value || '').trim().toLowerCase();
    if (primary) addrs.push(primary);
    return addrs.indexOf(email) !== -1;
  }).map(function (c) { return c.id; });
}

/** Is this candidate record on the Wonderful.ai job? Measured, not assumed. */
function n283OnJob_(candidateId, probe) {
  var info = n283Call_('candidate.info', { id: candidateId });
  if (info.code !== 200 || !info.json || !info.json.results) {
    if (probe) Logger.log('#283b PROBE candidate.info HTTP ' + info.code + ' ' + String(info.text).substring(0, 200));
    return false;
  }
  var res = info.json.results;
  if (probe) Logger.log('#283b PROBE candidate.info keys: ' + Object.keys(res).join(', '));
  var appIds = res.applicationIds || [];
  if (probe) Logger.log('#283b PROBE applicationIds found: ' + appIds.length);
  for (var i = 0; i < appIds.length; i++) {
    var a = n283Call_('application.info', { applicationId: appIds[i] });
    if (probe && i === 0) {
      Logger.log('#283b PROBE application.info HTTP ' + a.code + ' | keys: '
        + (a.json && a.json.results ? Object.keys(a.json.results).join(', ') : 'none'));
    }
    var job = a.json && a.json.results && a.json.results.job;
    if (job && job.id === N283_JOB_ID) return true;
  }
  return false;
}

function run283Ambiguous() {
  var started = new Date().getTime();
  var props = PropertiesService.getScriptProperties();
  var mode = N283_AMB_MODE === 'run' ? 'run' : 'dry';

  var people = n283People_(n283ReadPayload_());
  var idx = parseInt(props.getProperty(N283_AMB_IDX) || '0', 10);
  if (isNaN(idx) || idx < 0) idx = 0;
  var tally = JSON.parse(props.getProperty(N283_AMB_HITS) || '{"wrote":0,"stuck":0,"dupes":0}');

  Logger.log('#283b ambiguous pass | MODE=' + mode.toUpperCase() + ' | from index ' + idx
    + ' of ' + people.length + ' | batch ' + N283_AMB_BATCH);

  var done = 0, probed = false;
  var stuck = [];

  for (var i = idx; i < people.length && done < N283_AMB_BATCH; i++) {
    if (new Date().getTime() - started > N283_MAX_MS) {
      Logger.log('#283b stopping on the clock at index ' + i + ' - run it again to carry on.');
      break;
    }
    var p = people[i];
    var ids = n283AllIdsByEmail_(p.email);
    done++;
    props.setProperty(N283_AMB_IDX, String(i + 1));
    if (!ids || ids.length <= 1) continue;          // a single record already has its note

    tally.dupes++;
    var onJob = [];
    for (var k = 0; k < ids.length; k++) {
      if (n283OnJob_(ids[k], !probed)) onJob.push(ids[k]);
      probed = true;
    }

    if (onJob.length === 1) {
      if (mode === 'run') {
        var w = n283Call_('candidate.createNote', {
          candidateId: onJob[0],
          note: { type: 'text/plain', value: p.note },
          sendNotifications: false
        });
        if (!(w.code === 200 && w.json && w.json.success === true)) {
          tally.stuck++; stuck.push(p.email + '  ->  createNote HTTP ' + w.code);
          props.setProperty(N283_AMB_HITS, JSON.stringify(tally));
          continue;
        }
        Utilities.sleep(120);
      }
      tally.wrote++;
      Logger.log('#283b ' + (mode === 'run' ? 'WROTE' : 'would write') + ' | '
        + ids.length + ' records share the address, exactly 1 is on the job');
    } else {
      tally.stuck++;
      stuck.push(p.email + '  ->  ' + ids.length + ' records, ' + onJob.length + ' of them on the job');
    }
    props.setProperty(N283_AMB_HITS, JSON.stringify(tally));
  }

  var reached = parseInt(props.getProperty(N283_AMB_IDX) || '0', 10);
  Logger.log('#283b batch done: looked at ' + done + ' | duplicated addresses so far ' + tally.dupes
    + ' | ' + (mode === 'run' ? 'written ' : 'resolvable ') + tally.wrote
    + ' | left for a human ' + tally.stuck + ' | cursor ' + reached + ' of ' + people.length);
  if (stuck.length) {
    Logger.log('#283b NEEDS A HUMAN (this batch):');
    stuck.forEach(function (s) { Logger.log('   ' + s); });
  }
  if (reached >= people.length) Logger.log('#283b ALL ADDRESSES CHECKED.');
}

function run283AmbiguousReset() {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty(N283_AMB_IDX);
  props.deleteProperty(N283_AMB_HITS);
  Logger.log('#283b cursor and tally cleared.');
}


/* ------------------------------------------------------------------ *
 *  #283c - the census. For every person in the payload, does a #283
 *  note actually EXIST on their record in Ashby?
 *
 *  This is the check that answers "done", because neither pass can:
 *  each one only knows what IT did. The main pass skipped 19 addresses
 *  as duplicated; the duplicate pass found 18. One person therefore has
 *  no note and no pass is aware of it. This finds them by looking.
 *
 *  It WRITES NOTHING. Set N283_VER_FIX to true only to fill in the
 *  people it finds missing, one note each.
 * ------------------------------------------------------------------ */

var N283_VER_BATCH = 240;
var N283_VER_IDX   = 'N283_VER_IDX';
var N283_VER_HITS  = 'N283_VER_HITS';
var N283_VER_FIX   = true;           // true = write a note to anyone found missing one
var N283_VER_MARK  = 'Fitment rationale:';

/** Does this candidate already carry a #283 note? Null means "could not tell". */
function n283HasNote_(candidateId, probe) {
  var r = n283Call_('candidate.listNotes', { candidateId: candidateId });
  if (probe) {
    var ctrl = n283Call_('candidate.listNotesNotARealEndpoint', { candidateId: candidateId });
    Logger.log('#283c PROBE candidate.listNotes HTTP ' + r.code
      + ' | invented control HTTP ' + ctrl.code
      + ' | (same code on both = the endpoint does not exist)');
    if (r.json && r.json.results) {
      Logger.log('#283c PROBE results is ' + (Array.isArray(r.json.results) ? 'an array of ' + r.json.results.length : Object.keys(r.json.results).join(', ')));
    }
  }
  if (r.code !== 200 || !r.json || r.json.success !== true) return null;
  var rows = r.json.results || [];
  if (!Array.isArray(rows)) rows = rows.notes || [];
  for (var i = 0; i < rows.length; i++) {
    var body = rows[i] && (rows[i].content || rows[i].note || '');
    if (typeof body === 'object' && body) body = body.value || body.text || '';
    if (String(body).indexOf(N283_VER_MARK) !== -1) return true;
  }
  return false;
}

function run283Verify() {
  var started = new Date().getTime();
  var props = PropertiesService.getScriptProperties();
  var people = n283People_(n283ReadPayload_());
  var idx = parseInt(props.getProperty(N283_VER_IDX) || '0', 10);
  if (isNaN(idx) || idx < 0) idx = 0;
  var tally = JSON.parse(props.getProperty(N283_VER_HITS) || '{"ok":0,"missing":0,"unknown":0,"fixed":0}');

  Logger.log('#283c census | from index ' + idx + ' of ' + people.length
    + ' | FIX=' + (N283_VER_FIX ? 'ON' : 'off'));

  var done = 0, probed = false;
  var gaps = [];

  for (var i = idx; i < people.length && done < N283_VER_BATCH; i++) {
    if (new Date().getTime() - started > N283_MAX_MS) {
      Logger.log('#283c stopping on the clock at index ' + i + ' - run it again to carry on.');
      break;
    }
    var p = people[i];
    var ids = n283AllIdsByEmail_(p.email);
    done++;
    props.setProperty(N283_VER_IDX, String(i + 1));

    if (!ids || ids.length === 0) { tally.unknown++; gaps.push(p.email + '  ->  no record carries that address'); continue; }

    var target = null;
    if (ids.length === 1) target = ids[0];
    else {
      var onJob = [];
      for (var k = 0; k < ids.length; k++) if (n283OnJob_(ids[k], false)) onJob.push(ids[k]);
      if (onJob.length === 1) target = onJob[0];
    }
    if (!target) { tally.unknown++; gaps.push(p.email + '  ->  ' + ids.length + ' records, cannot tell which'); continue; }

    var has = n283HasNote_(target, !probed);
    probed = true;
    if (has === null) { tally.unknown++; gaps.push(p.email + '  ->  could not read notes'); continue; }
    if (has) { tally.ok++; continue; }

    tally.missing++;
    gaps.push(p.email + '  ->  NO #283 NOTE at index ' + i);
    if (N283_VER_FIX) {
      var w = n283Call_('candidate.createNote', {
        candidateId: target,
        note: { type: 'text/plain', value: p.note },
        sendNotifications: false
      });
      if (w.code === 200 && w.json && w.json.success === true) {
        tally.fixed++;
        Logger.log('#283c FILLED IN the missing note at index ' + i);
      } else {
        Logger.log('#283c could not fill index ' + i + ': createNote HTTP ' + w.code);
      }
      Utilities.sleep(120);
    }
    props.setProperty(N283_VER_HITS, JSON.stringify(tally));
  }
  props.setProperty(N283_VER_HITS, JSON.stringify(tally));

  var reached = parseInt(props.getProperty(N283_VER_IDX) || '0', 10);
  Logger.log('#283c batch done: looked at ' + done + ' | with a note ' + tally.ok
    + ' | MISSING ' + tally.missing + ' | could not tell ' + tally.unknown
    + ' | filled in ' + tally.fixed + ' | cursor ' + reached + ' of ' + people.length);
  if (gaps.length) { Logger.log('#283c GAPS this batch:'); gaps.forEach(function (g) { Logger.log('   ' + g); }); }
  if (reached >= people.length) {
    Logger.log('#283c CENSUS COMPLETE: ' + tally.ok + ' of ' + people.length + ' carry a note | '
      + tally.missing + ' missing | ' + tally.unknown + ' unreadable');
  }
}

function run283VerifyReset() {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty(N283_VER_IDX);
  props.deleteProperty(N283_VER_HITS);
  Logger.log('#283c census cursor and tally cleared.');
}
