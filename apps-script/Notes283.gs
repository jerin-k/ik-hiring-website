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
var N283_VER_FIX   = false;          // true = write a note to anyone found missing one
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


/* ------------------------------------------------------------------ *
 *  #283d - WHO are the SMEs credited to, and who is their Recruiter?
 *  Read-only. Answers two separate questions that are easy to confuse:
 *    Credited To  = Ashby's own sourcing credit, stamped when the
 *                   candidate RECORD IS FIRST CREATED.
 *    Recruiter    = a hiring-team role on the application - the thing
 *                   the import was actually asked to set.
 * ------------------------------------------------------------------ */

function run283CreditedTo() {
  var started = new Date().getTime();
  var N283D_GROUP = 'learners';                       // 'smes' | 'learners'
  var props = PropertiesService.getScriptProperties();
  var people = n283People_(n283ReadPayload_()).filter(function (p) { return p.group === N283D_GROUP; });
  var idx = parseInt(props.getProperty('N283D_IDX') || '0', 10);
  if (isNaN(idx) || idx < 0) idx = 0;
  var tal = JSON.parse(props.getProperty('N283D_TAL') || '{}');
  Logger.log('#283d ' + N283D_GROUP + ': ' + people.length + ' people, from index ' + idx);

  var credited = {}, appCredited = {}, recruiter = {}, seen = 0, skipped = 0;

  credited = tal.credited || {}; appCredited = tal.appCredited || {}; recruiter = tal.recruiter || {};
  seen = tal.seen || 0; skipped = tal.skipped || 0;
  for (var i = idx; i < people.length; i++) {
    if (new Date().getTime() - started > N283_MAX_MS) {
      Logger.log('#283d stopped on the clock at index ' + i); break;
    }
    props.setProperty('N283D_IDX', String(i + 1));
    props.setProperty('N283D_TAL', JSON.stringify({credited:credited, appCredited:appCredited, recruiter:recruiter, seen:seen, skipped:skipped}));
    var ids = n283AllIdsByEmail_(people[i].email);
    if (!ids || ids.length === 0) { skipped++; continue; }
    var id = ids[0];
    if (ids.length > 1) {
      var onJob = [];
      for (var k = 0; k < ids.length; k++) if (n283OnJob_(ids[k], false)) onJob.push(ids[k]);
      if (onJob.length !== 1) { skipped++; continue; }
      id = onJob[0];
    }
    var info = n283Call_('candidate.info', { id: id });
    if (info.code !== 200 || !info.json || !info.json.results) { skipped++; continue; }
    var res = info.json.results;

    var c = res.creditedToUser;
    var cName = c ? (((c.firstName || '') + ' ' + (c.lastName || '')).trim() || c.email || 'set, name not given') : '(nobody)';
    credited[cName] = (credited[cName] || 0) + 1;

    // the hiring-team Recruiter sits on the APPLICATION, not the candidate
    var rName = '(no application on the job)';
    var appIds = res.applicationIds || [];
    for (var a = 0; a < appIds.length; a++) {
      var app = n283Call_('application.info', { applicationId: appIds[a] });
      var r = app.json && app.json.results;
      if (!r || !r.job || r.job.id !== N283_JOB_ID) continue;
      rName = '(none on the hiring team)';
      // the APPLICATION carries its OWN creditedToUser - this is the one that belongs to THIS job
      var ac = r.creditedToUser;
      var acName = ac ? (((ac.firstName || '') + ' ' + (ac.lastName || '')).trim() || ac.email || 'set, name not given') : '(nobody)';
      appCredited[acName] = (appCredited[acName] || 0) + 1;
      var team = r.hiringTeam || [];
      for (var h = 0; h < team.length; h++) {
        var role = String(team[h].role || team[h].roleName || '');
        if (role.toLowerCase().indexOf('recruiter') !== -1) {
          rName = ((team[h].firstName || '') + ' ' + (team[h].lastName || '')).trim() || team[h].email || role;
        }
      }
      break;
    }
    recruiter[rName] = (recruiter[rName] || 0) + 1;
    seen++;
  }

  props.setProperty('N283D_TAL', JSON.stringify({credited:credited, appCredited:appCredited, recruiter:recruiter, seen:seen, skipped:skipped}));
  var cur = parseInt(props.getProperty('N283D_IDX') || '0', 10);
  Logger.log('#283d READ ' + seen + ' of ' + people.length + ' (skipped ' + skipped + ') | cursor ' + cur);
  if (cur >= people.length) Logger.log('#283d ALL ' + people.length + ' ' + N283D_GROUP + ' CHECKED.');
  Logger.log('#283d CREDITED TO - on the CANDIDATE record (can predate this job):');
  Object.keys(credited).sort(function (a, b) { return credited[b] - credited[a]; })
    .forEach(function (k) { Logger.log('   ' + credited[k] + '  ' + k); });
  Logger.log('#283d CREDITED TO - on the WONDERFUL.AI APPLICATION itself:');
  Object.keys(appCredited).sort(function (x, y) { return appCredited[y] - appCredited[x]; })
    .forEach(function (k) { Logger.log('   ' + appCredited[k] + '  ' + k); });
  Logger.log('#283d HIRING-TEAM RECRUITER on the Wonderful.ai application:');
  Object.keys(recruiter).sort(function (a, b) { return recruiter[b] - recruiter[a]; })
    .forEach(function (k) { Logger.log('   ' + recruiter[k] + '  ' + k); });
}


/* ------------------------------------------------------------------ *
 *  #283e - WHAT are the addresses that email-alone cannot resolve?
 *  Jerin: "Can t you do a email + job (Wonderful.ai) check?" - that is
 *  already the rule. This asks what is left when it still fails, which
 *  is the interesting part:
 *     2+ records share the address and EXACTLY ONE is on the job -> fine
 *     2+ share it and TWO OR MORE are on the job -> the SAME PERSON IS
 *        ON THE JOB TWICE, a real data problem worth seeing
 *     2+ share it and NONE is on the job -> matched the wrong person
 *  Read-only. Costs ONE call for everyone who is not duplicated.
 * ------------------------------------------------------------------ */

function run283Dupes() {
  var started = new Date().getTime();
  var props = PropertiesService.getScriptProperties();
  var people = n283People_(n283ReadPayload_());
  var idx = parseInt(props.getProperty('N283E_IDX') || '0', 10);
  if (isNaN(idx) || idx < 0) idx = 0;
  var t = JSON.parse(props.getProperty('N283E_TAL')
    || '{"scanned":0,"dup":0,"oneOnJob":0,"manyOnJob":0,"noneOnJob":0,"noRecord":0,"rows":[]}');

  Logger.log('#283e from index ' + idx + ' of ' + people.length);

  for (var i = idx; i < people.length; i++) {
    if (new Date().getTime() - started > N283_MAX_MS) { Logger.log('#283e stopped on the clock at ' + i); break; }
    var ids = n283AllIdsByEmail_(people[i].email);
    t.scanned++;
    if (!ids || ids.length === 0) { t.noRecord++; }
    else if (ids.length > 1) {
      t.dup++;
      var onJob = 0;
      for (var k = 0; k < ids.length; k++) if (n283OnJob_(ids[k], false)) onJob++;
      if (onJob === 1) t.oneOnJob++;
      else if (onJob > 1) { t.manyOnJob++; t.rows.push(people[i].group + ' | ' + ids.length + ' records | ' + onJob + ' of them ON THE JOB'); }
      else { t.noneOnJob++; t.rows.push(people[i].group + ' | ' + ids.length + ' records | NONE on the job'); }
    }
    props.setProperty('N283E_IDX', String(i + 1));
    if (t.scanned % 25 === 0) props.setProperty('N283E_TAL', JSON.stringify(t));
  }
  props.setProperty('N283E_TAL', JSON.stringify(t));
  var cur = parseInt(props.getProperty('N283E_IDX') || '0', 10);

  Logger.log('#283e scanned ' + t.scanned + ' | cursor ' + cur + ' of ' + people.length);
  Logger.log('#283e   addresses on ONE record only ... ' + (t.scanned - t.dup - t.noRecord));
  Logger.log('#283e   addresses on SEVERAL records .. ' + t.dup);
  Logger.log('#283e       of those, exactly 1 on job  ' + t.oneOnJob + '   (resolved cleanly)');
  Logger.log('#283e       of those, 2+ ON THE JOB ... ' + t.manyOnJob + '   (SAME PERSON TWICE ON THE JOB)');
  Logger.log('#283e       of those, none on the job . ' + t.noneOnJob);
  Logger.log('#283e   address on NO record .......... ' + t.noRecord);
  t.rows.forEach(function (r) { Logger.log('   ' + r); });
  if (cur >= people.length) Logger.log('#283e ALL ' + people.length + ' CHECKED.');
}

function run283DupesReset() {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty('N283E_IDX'); props.deleteProperty('N283E_TAL');
  Logger.log('#283e cursor cleared.');
}


/* ------------------------------------------------------------------ *
 *  #283f - URGENT: who did the upload drag BACKWARDS into New Lead?
 *  Jerin, 26 Oct: "looks like you moved 5 candidates from TA screen to
 *  Lead Stage as part of candidate upload to Wonderful."
 *  Reads applicationHistory on the Wonderful.ai application and reports
 *  anyone who was at a LATER stage before and is at New Lead now.
 *  READ-ONLY. It names candidate ids so they can be put back by hand.
 * ------------------------------------------------------------------ */

var N283F_LATER = ['TA Screen','HM Review','R0 - Online Assessment','R1','R2','R3','R4','R5',
                   'Reference Check','Document Submission','Offer','Hello Christy'];

function run283MovedBack() {
  var started = new Date().getTime();
  var props = PropertiesService.getScriptProperties();
  var people = n283People_(n283ReadPayload_());
  var idx = parseInt(props.getProperty('N283F_IDX') || '0', 10);
  if (isNaN(idx) || idx < 0) idx = 0;
  var hits = JSON.parse(props.getProperty('N283F_HITS') || '[]');
  var probed = false;

  Logger.log('#283f from index ' + idx + ' of ' + people.length + ' | looking for backwards moves');

  for (var i = idx; i < people.length; i++) {
    if (new Date().getTime() - started > N283_MAX_MS) { Logger.log('#283f stopped on the clock at ' + i); break; }
    props.setProperty('N283F_IDX', String(i + 1));
    var ids = n283AllIdsByEmail_(people[i].email);
    if (!ids || !ids.length) continue;

    for (var k = 0; k < ids.length; k++) {
      var info = n283Call_('candidate.info', { id: ids[k] });
      var res = info.json && info.json.results;
      if (!res) continue;
      var appIds = res.applicationIds || [];
      for (var a = 0; a < appIds.length; a++) {
        var app = n283Call_('application.info', { applicationId: appIds[a] });
        var r = app.json && app.json.results;
        if (!r || !r.job || r.job.id !== N283_JOB_ID) continue;

        var hist = r.applicationHistory || [];
        if (!probed) {
          probed = true;
          Logger.log('#283f PROBE history rows: ' + hist.length
            + ' | keys: ' + (hist[0] ? Object.keys(hist[0]).join(', ') : 'none'));
        }
        // every stage title this application has EVER sat in
        var everAt = [];
        for (var h = 0; h < hist.length; h++) {
          var ttl = hist[h].stage && (hist[h].stage.title || hist[h].stage.name) || hist[h].title || hist[h].stageName || '';
          if (ttl && everAt.indexOf(ttl) === -1) everAt.push(String(ttl));
        }
        var nowAt = (r.currentInterviewStage && (r.currentInterviewStage.title || r.currentInterviewStage.name)) || '';
        var wentBack = [];
        for (var z = 0; z < everAt.length; z++) if (N283F_LATER.indexOf(everAt[z]) !== -1) wentBack.push(everAt[z]);

        if (wentBack.length && String(nowAt).indexOf('Lead') !== -1) {
          var row = people[i].group + ' | candidate ' + ids[k] + ' | now ' + nowAt + ' | had reached: ' + wentBack.join(' > ');
          hits.push(row);
          Logger.log('#283f  >>> MOVED BACK: ' + row);
          props.setProperty('N283F_HITS', JSON.stringify(hits));
        }
      }
    }
  }
  var cur = parseInt(props.getProperty('N283F_IDX') || '0', 10);
  Logger.log('#283f cursor ' + cur + ' of ' + people.length + ' | moved-back found so far: ' + hits.length);
  hits.forEach(function (h) { Logger.log('   ' + h); });
  if (cur >= people.length) Logger.log('#283f ALL CHECKED - total moved back: ' + hits.length);
}

function run283MovedBackReset() {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty('N283F_IDX'); props.deleteProperty('N283F_HITS');
  Logger.log('#283f cursor cleared.');
}


/* ------------------------------------------------------------------ *
 *  #283g - PUT BACK the 6 learners the upload dragged out of TA Screen.
 *  Jerin asked for this directly on 26 Oct.
 *  It does NOT pick a stage: for each person it reads THEIR OWN history
 *  row titled 'TA Screen' and uses that row's stageId, so everyone goes
 *  back exactly where they were. It refuses to touch anyone who is not
 *  currently sitting in a Lead stage.
 * ------------------------------------------------------------------ */

var N283G_MODE = 'dry';   // done 26 Oct: 6 learners restored to TA Screen                 // 'dry' | 'run'
var N283G_BACK_TO = 'TA Screen';
var N283G_IDS = [
  'bfe5707b-7986-4bec-af9a-1c9fd804184b',
  '85f555a4-9c71-48d3-bf23-9e43f5f6899b',
  'c0a8eb85-be04-4206-9eb2-d9d24230c8db',
  '716e4ad3-3204-4d73-9e32-cad15dca274a',
  'f3ccb99c-dfcf-40ec-bc01-1b2cb482bcd6',
  'eb953546-140b-4115-bb26-4b751fb1398a'
];

function run283PutBack() {
  var mode = N283G_MODE === 'run' ? 'run' : 'dry';
  Logger.log('#283g MODE=' + mode.toUpperCase() + ' | ' + N283G_IDS.length + ' people to put back to ' + N283G_BACK_TO);
  var done = 0, refused = 0;

  for (var i = 0; i < N283G_IDS.length; i++) {
    var cid = N283G_IDS[i];
    var info = n283Call_('candidate.info', { id: cid });
    var res = info.json && info.json.results;
    if (!res) { Logger.log('#283g ' + cid + ' -> cannot read candidate'); refused++; continue; }

    var appIds = res.applicationIds || [];
    var handled = false;
    for (var a = 0; a < appIds.length; a++) {
      var app = n283Call_('application.info', { applicationId: appIds[a] });
      var r = app.json && app.json.results;
      if (!r || !r.job || r.job.id !== N283_JOB_ID) continue;
      handled = true;

      var nowAt = (r.currentInterviewStage && (r.currentInterviewStage.title || r.currentInterviewStage.name)) || '';
      if (String(nowAt).indexOf('Lead') === -1) {
        Logger.log('#283g ' + cid + ' -> SKIPPED, already at "' + nowAt + '", not a Lead stage');
        refused++; break;
      }
      // their OWN history row for the stage we are restoring
      var hist = r.applicationHistory || [], stageId = null;
      for (var h = 0; h < hist.length; h++) {
        var ttl = String(hist[h].title || (hist[h].stage && hist[h].stage.title) || '');
        if (ttl === N283G_BACK_TO) stageId = hist[h].stageId || (hist[h].stage && hist[h].stage.id);
      }
      if (!stageId) { Logger.log('#283g ' + cid + ' -> SKIPPED, no "' + N283G_BACK_TO + '" row in their own history'); refused++; break; }

      if (mode === 'dry') {
        Logger.log('#283g WOULD MOVE ' + cid + ' from "' + nowAt + '" back to "' + N283G_BACK_TO + '"');
        done++; break;
      }
      var w = n283Call_('application.changeStage', { applicationId: appIds[a], interviewStageId: stageId });
      if (w.code === 200 && w.json && w.json.success === true) {
        var back = n283Call_('application.info', { applicationId: appIds[a] });
        var nb = back.json && back.json.results && back.json.results.currentInterviewStage;
        Logger.log('#283g MOVED ' + cid + ' -> reads back as "' + ((nb && (nb.title || nb.name)) || '?') + '"');
        done++;
      } else {
        Logger.log('#283g FAILED ' + cid + ' -> HTTP ' + w.code + ' ' + String(w.text).substring(0, 200));
        refused++;
      }
      Utilities.sleep(200);
      break;
    }
    if (!handled) { Logger.log('#283g ' + cid + ' -> no application on this job'); refused++; }
  }
  Logger.log('#283g ' + (mode === 'run' ? 'moved ' : 'would move ') + done + ' | not touched ' + refused);
}
