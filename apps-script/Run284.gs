/**
 * #284 - the FDE sourcing intake: 75 people onto "Forward Deployed Engineer- General".
 *
 * 🔒 NO CANDIDATE DATA IS IN THIS FILE AND NONE MUST EVER BE PUT IN IT.
 *    Every .gs here is mirrored into a PUBLIC GitHub repo by pushSourceToGitHub, so the
 *    names, emails, phones and assessment notes are read AT RUN TIME from three PRIVATE
 *    Drive files in "Ashby Hiring Dashboards". This file holds only their ids. CLAUDE.md rule 9.
 *
 * Entry point: run284Upload()
 *   R284_MODE 'dry'  - resolves the job, stage, source, recruiter and every tag, checks the
 *                      payload against a known signature, prints row 1's payloads, writes NOTHING.
 *             'run'  - writes. Resumable: the index reached is kept in a script property, so a
 *                      run that hits the 6-minute editor limit is continued by running it again.
 *   It creates NO TRIGGER, so it cannot touch the refresh schedule or the 20-trigger ceiling.
 *
 * Reset before a fresh pass: run284Reset()
 */

var R284_FILES = ['1r7kGVSSN4MFGmr4bdJMBjbyOF0aL7xOT',   // 284_fde_intake_01.json
                  '1u-t-wFKL9c8lOixMr6tIfNIauFFGOfy0',   // 284_fde_intake_02.json
                  '1ePM-Uo8TOQ0-MbdccvZs4P1AN5vk4HbH'];  // 284_fde_intake_03.json
var R284_MODE      = 'dry';                 // 'dry' | 'run'
var R284_JOB       = 'Forward Deployed Engineer- General';   // no space before the hyphen
var R284_SRC_TYPE  = 'IK Alumni';
var R284_SRC_TITLE = 'Alumni - US';
var R284_RECRUITER = 'ritika.bhasin@interviewkickstart.com';
var R284_ROLE      = '22db8dc8-83f4-40de-8376-87efff4a6eb6';  // Ashby "Recruiter"
var R284_LEAD      = 'New Lead';
var R284_HM        = 'HM Review';
var R284_IDX_KEY   = 'R284_IDX';
var R284_DONE_KEY  = 'R284_DONE';
var R284_MAX_MS    = 4.5 * 60 * 1000;       // stop well inside the 6-minute editor limit

// The payload signature, measured locally before upload. If the files were damaged in
// transit these will not match, and the run refuses rather than writing half-built records.
var R284_EXP_PEOPLE = 75;
var R284_EXP_NOTE   = 106155;
var R284_EXP_EMAIL  = 1641;

function r284Call_(ep, body) {
  try {
    var r = ashbyWrite_('/' + ep, body) || {};
    return { code: r.code, ok: !!(r.json && r.json.success), json: r.json,
             err: (r.json && r.json.errors) ? JSON.stringify(r.json.errors).slice(0, 160) : '' };
  } catch (e) {
    return { code: 'threw', ok: false, json: null, err: String(e && e.message || e).slice(0, 160) };
  }
}

/** Read the people out of the PRIVATE Drive files. Never from the repo, never from this file. */
function r284Read_() {
  var all = [];
  for (var i = 0; i < R284_FILES.length; i++) {
    var txt = DriveApp.getFileById(R284_FILES[i]).getBlob().getDataAsString('UTF-8');
    var d = JSON.parse(txt);
    if (!d || !d.people || !d.people.length) throw new Error('part ' + (i + 1) + ' has no people');
    if (d.task !== '284') throw new Error('part ' + (i + 1) + ' is not task 284');
    all = all.concat(d.people);
  }
  return all;
}

function run284Reset() {
  var P = PropertiesService.getScriptProperties();
  P.deleteProperty(R284_IDX_KEY); P.deleteProperty(R284_DONE_KEY);
  Logger.log('#284 progress and done-guard cleared.');
}

function run284Upload() {
  var MODE = R284_MODE, t0 = new Date().getTime();
  var P = PropertiesService.getScriptProperties();
  function say(s) { Logger.log(s); }
  function abort(why) { say('ABORT: ' + why); throw new Error('#284 aborted: ' + why); }

  say('=== #284 upload, MODE=' + MODE + ', ' + new Date().toISOString() + ' ===');

  // ---- 0. a second full run would duplicate all 75. Refuse unless deliberately cleared.
  if (MODE === 'run' && P.getProperty(R284_DONE_KEY)) {
    abort(R284_DONE_KEY + ' is already set (' + P.getProperty(R284_DONE_KEY) +
          '). Run run284Reset() deliberately before running again.');
  }

  // ---- 1. the people, and the signature check
  var people = r284Read_();
  var nChars = 0, eChars = 0, stages = {}, tagWant = {};
  for (var i = 0; i < people.length; i++) {
    nChars += String(people[i].note || '').length;
    eChars += String(people[i].e || '').length;
    stages[people[i].stage] = (stages[people[i].stage] || 0) + 1;
    if (people[i].tag) tagWant[people[i].tag] = (tagWant[people[i].tag] || 0) + 1;
  }
  say('payload: ' + people.length + ' people, ' + nChars + ' note chars, ' + eChars + ' email chars');
  if (people.length !== R284_EXP_PEOPLE || nChars !== R284_EXP_NOTE || eChars !== R284_EXP_EMAIL) {
    abort('payload signature mismatch - expected ' + R284_EXP_PEOPLE + ' / ' + R284_EXP_NOTE +
          ' / ' + R284_EXP_EMAIL + '. The Drive files are not what was measured; do not write.');
  }
  say('signature MATCHES the locally measured payload.');
  say('stages: ' + JSON.stringify(stages));

  // every email present and unique, or the run would silently merge two people
  var seen = {}, noEmail = 0, dupe = [];
  for (i = 0; i < people.length; i++) {
    var em = String(people[i].e || '').trim().toLowerCase();
    if (!em) { noEmail++; continue; }
    if (seen[em]) dupe.push(em); else seen[em] = 1;
  }
  if (noEmail) abort(noEmail + ' people have no email');
  if (dupe.length) abort('duplicate emails in the payload: ' + dupe.join(', '));
  say('all ' + people.length + ' emails present and distinct.');

  // ---- 2. the source
  var sr = r284Call_('source.list', {});
  if (!sr.ok) abort('source.list ' + sr.code + ' ' + sr.err);
  var srcs = (sr.json.results || []).filter(function (s) {
    return ((s.sourceType && s.sourceType.title) || '') === R284_SRC_TYPE &&
           (s.title || '') === R284_SRC_TITLE && !s.isArchived; });
  if (srcs.length !== 1) abort('expected exactly 1 live "' + R284_SRC_TYPE + ': ' + R284_SRC_TITLE +
                               '" source, found ' + srcs.length);
  var sourceId = srcs[0].id;
  say('source resolved: ' + R284_SRC_TYPE + ': ' + R284_SRC_TITLE);

  // ---- 3. the job. job.list PAGINATES - the FDE jobs are not on page one.
  var jobs = [], cur = null, pg = 0;
  do {
    var b = { limit: 100 }; if (cur) b.cursor = cur;
    var jr = r284Call_('job.list', b);
    if (!jr.ok) abort('job.list ' + jr.code + ' ' + jr.err);
    jobs = jobs.concat(jr.json.results || []);
    cur = jr.json.moreDataAvailable ? jr.json.nextCursor : null; pg++;
  } while (cur && pg < 30);
  var hit = jobs.filter(function (j) { return (j.title || '') === R284_JOB; });
  if (hit.length !== 1) abort('expected exactly 1 job titled "' + R284_JOB + '", found ' + hit.length +
                              ' (' + jobs.length + ' jobs over ' + pg + ' pages)');
  var job = hit[0];
  if (job.status !== 'Open') abort('the job is ' + job.status + ', not Open');
  say('job resolved: ' + job.title + '  status=' + job.status);

  // ---- 4. the two stages, by exact title
  var st = r284Call_('interviewStage.list', { interviewPlanId: job.interviewPlanIds[0] });
  if (!st.ok) abort('interviewStage.list ' + st.code + ' ' + st.err);
  var allSt = st.json.results || [];
  say('the job has ' + allSt.length + ' stages:');
  for (i = 0; i < allSt.length; i++) {
    say('   ' + (allSt[i].orderInInterviewPlan != null ? allSt[i].orderInInterviewPlan : '?') +
        '  ' + allSt[i].title + '   [type ' + (allSt[i].type || '?') + ']');
  }
  function oneStage(title) {
    var m = allSt.filter(function (s) { return (s.title || '') === title; });
    if (m.length !== 1) abort('expected exactly 1 stage titled "' + title + '", found ' + m.length);
    return m[0];
  }
  var lead = oneStage(R284_LEAD), hm = oneStage(R284_HM);
  say('stages resolved: "' + lead.title + '" [' + lead.type + ']  and  "' + hm.title + '" [' + hm.type + ']');

  // ---- 5. Ritika
  var ur = r284Call_('user.list', { includeDeactivated: true });
  if (!ur.ok) abort('user.list ' + ur.code + ' ' + ur.err);
  var rit = (ur.json.results || []).filter(function (u) {
    return String(u.email || '').toLowerCase() === R284_RECRUITER; });
  if (rit.length !== 1) abort('expected exactly 1 user for ' + R284_RECRUITER + ', found ' + rit.length);
  if (rit[0].isEnabled === false) abort('that Ashby account is disabled');
  var ritikaId = rit[0].id;
  say('recruiter / credited-to resolved: ' + (rit[0].firstName || '') + ' ' + (rit[0].lastName || ''));

  // ---- 6. the tags. Names are matched against the LIVE list, ignoring capitals, so a
  //         difference in case reuses the existing tag instead of creating a twin.
  var live = [], tcur = null, tpg = 0;
  do {
    var tb = { limit: 100 }; if (tcur) tb.cursor = tcur;
    var tr = r284Call_('candidateTag.list', tb);
    if (!tr.ok) abort('candidateTag.list ' + tr.code + ' ' + tr.err);
    live = live.concat(tr.json.results || []);
    tcur = tr.json.moreDataAvailable ? tr.json.nextCursor : null; tpg++;
  } while (tcur && tpg < 20);
  say('tag pages read: ' + tpg);
  var byLower = {};
  for (i = 0; i < live.length; i++) {
    if (live[i].isArchived) continue;                       // an archived tag must not be reused
    byLower[String(live[i].title || '').toLowerCase()] = live[i];
  }
  say('live tags: ' + live.length + ' (' + Object.keys(byLower).length + ' not archived)');

  var wanted = Object.keys(tagWant).sort(), tagId = {}, toCreate = [];
  for (i = 0; i < wanted.length; i++) {
    var ex = byLower[wanted[i].toLowerCase()];
    if (ex) { tagId[wanted[i]] = ex.id;
              say('   REUSE  "' + ex.title + '"  for ' + tagWant[wanted[i]] + ' people' +
                  (ex.title === wanted[i] ? '' : '   (payload said "' + wanted[i] + '")')); }
    else { toCreate.push(wanted[i]);
           say('   NEW    "' + wanted[i] + '"  for ' + tagWant[wanted[i]] + ' people'); }
  }
  say('tags: ' + (wanted.length - toCreate.length) + ' reused, ' + toCreate.length + ' to create');

  // ---- 7. what row 1 would send
  var r0 = people[0];
  say('--- row 1 (' + r0.n + ') ---');
  say('  candidate.create   name set  email set  phoneNumber=' + (r0.p ? 'set' : '(none)') +
      '  linkedInUrl=' + (r0.l ? 'set' : '(none)') + '  sourceId=set  creditedToUserId=set');
  say('  application.create jobId=<fde-general>  interviewStageId=<' + r0.stage + '>  sourceId=set  creditedToUserId=set');
  say('  application.addHiringTeamMember  teamMemberId=<ritika>  roleId=<Recruiter>');
  say('  candidate.addTag   tagId=<' + (r0.tag || '(no tag)') + '>');
  say('  candidate.createNote  ' + String(r0.note || '').length + ' chars, sendNotifications false');

  if (MODE !== 'run') {
    say('=== DRY RUN COMPLETE. Everything resolved; NOTHING was written. ===');
    return;
  }

  // ---- 8. create the tags that do not exist yet
  for (i = 0; i < toCreate.length; i++) {
    var cr = r284Call_('candidateTag.create', { title: toCreate[i] });
    var made = cr.ok && cr.json.results && cr.json.results.id;
    if (!made) abort('candidateTag.create "' + toCreate[i] + '" failed ' + cr.code + ' ' + cr.err +
                     ' - stopping before any candidate is written');
    tagId[toCreate[i]] = cr.json.results.id;
    say('created tag "' + toCreate[i] + '"');
  }

  // ---- 9. the real thing, one person at a time, resumable
  var idx = Number(P.getProperty(R284_IDX_KEY) || '0');
  say('starting at index ' + idx + ' of ' + people.length);
  var made2 = 0, fails = [], partial = [];
  for (i = idx; i < people.length; i++) {
    if (new Date().getTime() - t0 > R284_MAX_MS) { say('time budget reached at index ' + i); break; }
    var p = people[i], who = p.n;

    var cBody = { name: p.n, email: p.e, sourceId: sourceId, creditedToUserId: ritikaId };
    if (p.p) cBody.phoneNumber = p.p;
    if (p.l) cBody.linkedInUrl = p.l;
    var c = r284Call_('candidate.create', cBody);
    if (!c.ok || !c.json.results || !c.json.results.id) {
      fails.push(who + ' candidate.create ' + c.code + ' ' + c.err);
      P.setProperty(R284_IDX_KEY, String(i + 1)); continue;
    }
    var candId = c.json.results.id;

    var wantStage = (p.stage === R284_HM) ? hm : lead;
    var a = r284Call_('application.create', { candidateId: candId, jobId: job.id,
                                              interviewStageId: wantStage.id, sourceId: sourceId,
                                              creditedToUserId: ritikaId });
    // An Active stage may be refused at creation; fall back to the Lead stage then move.
    var moved = '';
    if ((!a.ok || !a.json.results || !a.json.results.id) && wantStage !== lead) {
      a = r284Call_('application.create', { candidateId: candId, jobId: job.id,
                                            interviewStageId: lead.id, sourceId: sourceId,
                                            creditedToUserId: ritikaId });
      if (a.ok && a.json.results && a.json.results.id) {
        var mv = r284Call_('application.changeStage',
                           { applicationId: a.json.results.id, interviewStageId: wantStage.id });
        moved = mv.ok ? ' [created at Lead then moved to ' + wantStage.title + ']'
                      : ' [STUCK AT LEAD - changeStage ' + mv.code + ' ' + mv.err + ']';
        if (!mv.ok) partial.push(who + ' is on the job but still at ' + lead.title);
      }
    }
    if (!a.ok || !a.json.results || !a.json.results.id) {
      fails.push(who + ' application.create ' + a.code + ' ' + a.err + ' (CANDIDATE WAS CREATED)');
      P.setProperty(R284_IDX_KEY, String(i + 1)); continue;
    }
    var appId = a.json.results.id;

    var h = r284Call_('application.addHiringTeamMember',
                      { applicationId: appId, teamMemberId: ritikaId, roleId: R284_ROLE });
    if (!h.ok) partial.push(who + ' recruiter not set: ' + h.code + ' ' + h.err);

    if (p.tag) {
      var tg = r284Call_('candidate.addTag', { candidateId: candId, tagId: tagId[p.tag] });
      if (!tg.ok) partial.push(who + ' tag "' + p.tag + '" not set: ' + tg.code + ' ' + tg.err);
    }

    if (p.note) {
      var nt = r284Call_('candidate.createNote',
                         { candidateId: candId, note: { type: 'text/plain', value: p.note },
                           sendNotifications: false });
      if (!nt.ok) partial.push(who + ' note not written: ' + nt.code + ' ' + nt.err);
    }

    made2++;
    P.setProperty(R284_IDX_KEY, String(i + 1));
    if (i === idx) say('row ' + (i + 1) + ' (' + who + ') done' + moved);
    Utilities.sleep(80);
  }

  var reached = Number(P.getProperty(R284_IDX_KEY) || '0');
  say('--- this run: created ' + made2 + ', hard failures ' + fails.length +
      ', partial problems ' + partial.length + ' ---');
  for (i = 0; i < fails.length; i++) say('  FAILED   ' + fails[i]);
  for (i = 0; i < Math.min(partial.length, 20); i++) say('  PARTIAL  ' + partial[i]);
  say('progress: ' + reached + ' of ' + people.length +
      (reached >= people.length ? '  <- COMPLETE' : '  <- run again to continue'));
  if (reached >= people.length && fails.length === 0) {
    P.setProperty(R284_DONE_KEY, new Date().toISOString());
    say(R284_DONE_KEY + ' set - a second run will now refuse.');
  }
  say('=== #284 run complete. VERIFY IN THE ASHBY UI before calling this done. ===');
}

/**
 * #284 verification. Walks the JOB's applications - the opposite direction from the write,
 * which went candidate -> application - and checks every person against the payload.
 * Read-only: it calls no write endpoint.
 */
function probe284Verify() {
  function say(s) { Logger.log(s); }
  var people = r284Read_(), want = {};
  for (var i = 0; i < people.length; i++) want[String(people[i].e || '').toLowerCase()] = people[i];
  say('=== #284 verify, ' + new Date().toISOString() + ' - payload holds ' + people.length + ' people ===');

  var jobs = [], cur = null, pg = 0;
  do {
    var b = { limit: 100 }; if (cur) b.cursor = cur;
    var jr = r284Call_('job.list', b);
    jobs = jobs.concat(jr.json.results || []);
    cur = jr.json.moreDataAvailable ? jr.json.nextCursor : null; pg++;
  } while (cur && pg < 30);
  var job = jobs.filter(function (j) { return (j.title || '') === R284_JOB; })[0];
  if (!job) { say('JOB NOT FOUND'); return; }

  // everything created in the last 3 hours, kept only if it is on this job
  var since = new Date().getTime() - 3 * 60 * 60 * 1000;
  var apps = [], c2 = null, p2 = 0;
  do {
    var b2 = { createdAfter: since, limit: 100 }; if (c2) b2.cursor = c2;
    var ar = r284Call_('application.list', b2);
    if (!ar.ok) { say('application.list failed ' + ar.code + ' ' + ar.err); return; }
    (ar.json.results || []).forEach(function (a) {
      if (((a.job && a.job.title) || '') === R284_JOB) apps.push(a);
    });
    c2 = ar.json.moreDataAvailable ? ar.json.nextCursor : null; p2++;
  } while (c2 && p2 < 40);
  say('applications on the job, created in the last 3 hours: ' + apps.length + ' (' + p2 + ' pages)');

  var byStage = {}, tagOk = 0, tagWrong = [], tagMissing = [], notOnPayload = [], seenEmail = {};
  var recOk = 0, recMissing = [];
  for (i = 0; i < apps.length; i++) {
    var a = apps[i], cand = a.candidate || {};
    var stg = (a.currentInterviewStage && a.currentInterviewStage.title) || '(none)';
    byStage[stg] = (byStage[stg] || 0) + 1;

    var team = a.hiringTeam || [], hasR = false;
    for (var z = 0; z < team.length; z++) {
      var nm = ((team[z].firstName || '') + ' ' + (team[z].lastName || '')).toLowerCase();
      if (nm.indexOf('ritika') >= 0) hasR = true;
    }
    if (hasR) recOk++; else recMissing.push(cand.name || a.id);

    var ci = r284Call_('candidate.info', { id: cand.id });
    if (!ci.ok) ci = r284Call_('candidate.info', { candidateId: cand.id });
    var res = (ci.ok && ci.json.results) || {};
    var em = String((res.primaryEmailAddress && res.primaryEmailAddress.value) ||
                    (res.emailAddresses && res.emailAddresses[0] && res.emailAddresses[0].value) || '').toLowerCase();
    var p = want[em];
    if (!p) { notOnPayload.push(res.name || cand.name || '(unnamed)'); continue; }
    seenEmail[em] = 1;

    var titles = (res.tags || []).map(function (t) { return t.title; });
    if (!p.tag) { if (titles.length === 0) tagOk++; else tagWrong.push((res.name||'') + ' should be untagged, has ' + titles.join('/')); }
    else if (titles.length === 1 && titles[0].toLowerCase() === p.tag.toLowerCase()) tagOk++;
    else if (titles.length === 0) tagMissing.push(res.name || '');
    else tagWrong.push((res.name||'') + ' wanted "' + p.tag + '" has ' + titles.join('/'));
  }

  say('by stage: ' + JSON.stringify(byStage));
  say('recruiter set on: ' + recOk + ' of ' + apps.length + '; missing ' + recMissing.length);
  say('tags exactly right: ' + tagOk + '; missing ' + tagMissing.length + '; wrong ' + tagWrong.length);
  for (i = 0; i < Math.min(tagWrong.length, 10); i++) say('   TAG WRONG   ' + tagWrong[i]);
  for (i = 0; i < Math.min(tagMissing.length, 10); i++) say('   TAG MISSING ' + tagMissing[i]);
  say('on the job but NOT in the payload: ' + notOnPayload.length);
  for (i = 0; i < Math.min(notOnPayload.length, 10); i++) say('   EXTRA  ' + notOnPayload[i]);

  var missing = [];
  for (var k in want) if (!seenEmail[k]) missing.push(want[k].n);
  say('in the payload but NOT found on the job: ' + missing.length);
  for (i = 0; i < Math.min(missing.length, 15); i++) say('   MISSING  ' + missing[i]);
  say('=== verify done. Read-only; nothing was written. ===');
}

/** Notes are checked on a sample, because listNotes is one call per person. */
function probe284Notes() {
  function say(s) { Logger.log(s); }
  var people = r284Read_();
  var since = new Date().getTime() - 3 * 60 * 60 * 1000;
  var apps = [], c2 = null, p2 = 0;
  do {
    var b2 = { createdAfter: since, limit: 100 }; if (c2) b2.cursor = c2;
    var ar = r284Call_('application.list', b2);
    if (!ar.ok) { say('application.list failed'); return; }
    (ar.json.results || []).forEach(function (a) {
      if (((a.job && a.job.title) || '') === R284_JOB) apps.push(a);
    });
    c2 = ar.json.moreDataAvailable ? ar.json.nextCursor : null; p2++;
  } while (c2 && p2 < 40);
  say('checking notes on all ' + apps.length + ' records');
  var withNote = 0, without = [];
  for (var i = 0; i < apps.length; i++) {
    var cid = (apps[i].candidate || {}).id;
    var nr = r284Call_('candidate.listNotes', { candidateId: cid });
    var n = (nr.ok && nr.json.results && (nr.json.results.length || (nr.json.results.notes||[]).length)) || 0;
    if (n > 0) withNote++; else without.push((apps[i].candidate||{}).name || cid);
  }
  say('records carrying at least one note: ' + withNote + ' of ' + apps.length);
  for (i = 0; i < Math.min(without.length, 10); i++) say('   NO NOTE  ' + without[i]);
}

// #284 - the V9 - Work log row. Reads the tab's own header and matches it EXACTLY; any header
// it does not recognise is left BLANK rather than guessed at. [[feedback_audit-result-column]]
function log284V9() {
  var SHEET_ID = '1U6Wi5uXLZ8hOhGKP2tyH--jHcEbUEvXgAPxbkUofTNA';
  var TAB = 'V9 - Work log';
  function say(s) { Logger.log(s); }

  var sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(TAB);
  if (!sh) { say('ABORT: no tab named ' + TAB); return; }
  var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  say('tab=' + TAB + '  rows=' + lastRow + '  cols=' + lastCol);
  say('HEADERS: ' + headers.map(function (h, i) { return i + ':' + h; }).join(' | '));

  var P = PropertiesService.getScriptProperties();
  if (P.getProperty('R284_V9_ROW')) { say('ABORT: already logged at row ' + P.getProperty('R284_V9_ROW')); return; }

  var vals = {
    'Date': new Date(),
    'Task': '#284',
    'Task ID': '#284',
    'What': 'Uploaded 75 FDE sourcing-intake candidates to Forward Deployed Engineer- General',
    'What was done': 'Uploaded 75 FDE sourcing-intake candidates to Forward Deployed Engineer- General',
    'Description': 'Created 75 NEW candidate records and 75 applications on "Forward Deployed Engineer- General" (IK-Job-13), which held nobody beforehand. 65 went into New Lead and 10 - the Ritika shortlist - into HM Review. Every one: source "IK Alumni: Alumni - US", credited to Ritika Bhasin, Ritika added as Recruiter on the application hiring team, and a note carrying the fields Ashby has no home for (HubSpot ID, company, title, course, cohort, fitment type and rationale, AI and deployment evidence, tier-1 college/employer, years, location, work authorisation, profile summary, ranking, key highlight, recruiter remarks, resume link). 71 carry a fitment tag; 4 whose fitment was never judged in the source went in untagged, with the reason in their notes. Source files: FDE-26-10.xlsx and Findem_consolidated_2026-10-26 (1).xlsx - 49 shortlisted learners plus 26 on the Findem/Jerin list, no overlap. An earlier count of 76 was wrong: Sat Virk appears on both the learners tab and the Ritika shortlist and would have been created twice.',
    'Count': 75,
    'Records': 75,
    'Method': 'Apps Script run284Upload (Run284.gs): candidate.create -> application.create -> application.addHiringTeamMember -> candidate.addTag -> candidate.createNote, one person at a time, resumable. Candidate data was held in three PRIVATE Drive JSON files in "Ashby Hiring Dashboards", never in a .gs, because every .gs is mirrored to a PUBLIC repo. The run refuses unless the payload matches a signature measured before upload (75 people / 106155 note chars / 1641 email chars). Tags: 5 created (AI + Deployment, Deployment, No pedigree or AI/deployment, Pedigree + AI + Deployment, Pedigree + Deployment) and 3 REUSED on Jerin call (Pedigreefit, Pedigree + AI experience, AI experience, no pedigree) - names resolved case-insensitively against the live tag list so no near-twin could be created.',
    'Verified how': 'Ashby UI: the job row reads Lead Stages 65 and HM Review 10, everything else 0. Sat Virk PhD, JD opened individually - stage HM Review, tag Pedigreefit, source "IK Alumni: Alumni - US", Credited To Ritika Bhasin, Hiring Team shows Recruiter = Ritika Bhasin (NOT "No Roles"), and the full intake note rendered. Separately, probe284Verify walked the JOB side (application.list filtered to this job, the opposite direction from the write): 75 applications, recruiter on 75 of 75, tags exactly right on 75 with 0 missing and 0 wrong, 0 people on the job that are not in the payload and 0 in the payload missing from the job. probe284Notes: 75 of 75 carry a note.',
    'Status': 'Done',
    'Failed': 0,
    'Skipped': 0,
    'By': 'Claude (jerin@interviewkickstart.com)'
  };

  var row = [], filled = [];
  for (var c = 0; c < lastCol; c++) {
    var h = String(headers[c]).trim();
    if (Object.prototype.hasOwnProperty.call(vals, h)) { row.push(vals[h]); filled.push(h); }
    else row.push('');
  }
  if (!filled.length) { say('ABORT: no header matched exactly - nothing written'); return; }

  sh.appendRow(row);
  var newRow = sh.getLastRow();
  P.setProperty('R284_V9_ROW', String(newRow));
  say('APPENDED at row ' + newRow + '; columns filled by exact header match: ' + filled.join(', '));
  var back = sh.getRange(newRow, 1, 1, lastCol).getValues()[0];
  say('READ BACK: ' + back.map(function (v) { return String(v).slice(0, 30); }).join(' | '));
}

// #284b - Jerin's correction, 27 Oct 2026. WHO and WHAT are read at run time from a PRIVATE
// Drive file, never written here: every .gs is mirrored to a PUBLIC repo.
function run284bEmail() {
  var MODE = 'dry';                                     // 'dry' | 'run'
  var FILE = '1UfY3YNFi6NhpwN85q4Mii8KWCxRzaVw7';
  function say(s) { Logger.log(s); }
  function mask(e) { var a = String(e || '').split('@'); return a.length === 2 ? (a[0].slice(0,2) + '***@' + a[1]) : '(none)'; }
  function abort(w) { say('ABORT: ' + w); throw new Error('#284b: ' + w); }

  say('=== #284b e-mail, MODE=' + MODE + ', ' + new Date().toISOString() + ' ===');
  var plan = JSON.parse(DriveApp.getFileById(FILE).getBlob().getDataAsString('UTF-8'));
  if (!plan || plan.task !== '284b') abort('the Drive instructions are not task 284b');

  var people = r284Read_(), byName = {};
  for (var i = 0; i < people.length; i++) byName[people[i].n] = people[i];

  var since = new Date().getTime() - 24 * 60 * 60 * 1000;
  var apps = [], cur = null, pg = 0;
  do {
    var b = { createdAfter: since, limit: 100 }; if (cur) b.cursor = cur;
    var ar = r284Call_('application.list', b);
    if (!ar.ok) abort('application.list ' + ar.code + ' ' + ar.err);
    (ar.json.results || []).forEach(function (a) {
      if (((a.job && a.job.title) || '') === R284_JOB) apps.push(a);
    });
    cur = ar.json.moreDataAvailable ? ar.json.nextCursor : null; pg++;
  } while (cur && pg < 40);
  var idOf = {};
  for (i = 0; i < apps.length; i++) { var c = apps[i].candidate || {}; if (c.name) idOf[c.name] = c.id; }
  say('applications on the job: ' + apps.length);

  for (var f = 0; f < plan.fixes.length; f++) {
    var fix = plan.fixes[f];
    if (!fix.badDomain) continue;
    var p = byName[fix.name], cid = idOf[fix.name];
    if (!p || !cid) abort('fix ' + (f + 1) + ': that person is not on the job');
    var oldE = String(p.e || ''), bad = String(fix.badDomain), good = String(fix.goodDomain);
    if (oldE.slice(-bad.length - 1) !== '@' + bad) abort('fix ' + (f + 1) + ': the address does not end in the domain named');
    var newE = oldE.slice(0, oldE.length - bad.length) + good;
    say('--- ' + fix.name + ': ' + mask(oldE) + '  ->  ' + mask(newE) + ' ---');
    say('    reason: ' + (fix.why || ''));
    if (MODE !== 'run') { say('    DRY - nothing written.'); continue; }
    var up = r284Call_('candidate.update', { candidateId: cid, email: newE });
    say('    candidate.update ' + (up.ok ? 'OK' : 'FAILED ' + up.code + ' ' + up.err));
    var ci = r284Call_('candidate.info', { id: cid });
    var res = (ci.ok && ci.json.results) || {};
    var all = (res.emailAddresses || []).map(function (x) { return String(x.value || ''); });
    var prim = String((res.primaryEmailAddress && res.primaryEmailAddress.value) || '');
    say('    read back: ' + all.length + ' address(es); primary domain ' + prim.split('@')[1] +
        '; the old one is ' + (all.join(' ').indexOf('@' + bad) >= 0 ? 'STILL THERE' : 'gone'));
  }
  say('=== #284b e-mail done. ===');
}
