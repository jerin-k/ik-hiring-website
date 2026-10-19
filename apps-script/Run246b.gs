// ===== #246b (Jerin, 19 Oct 2026) — write the topic onto the openings Req Bot already created =====
// 🗣 "All the cases already created needs to be fixed as well; keep this task open ill thats done."
// 🗣 "Write the full name text for IK-444 and IK-445, and go ahead with all 18."
//
// #246 fixed the ROUTINE so new openings get their topic field filled. This fills in the ones already made.
// 🚨 TWO TRAPS this was built around, both found before a single write:
//   1. dashboard.json TRUNCATES openingId to 8 characters (DataRefresh.gs:802 `.substring(0, 8)`), so the id in
//      our own data CANNOT be used for a write. Every opening here is matched on its IK number and the FULL
//      uuid is taken from opening.list.
//   2. The field id in our notes is truncated too ("650ddec1…"), so it is read from customField.list, never typed.
// 🚨 Ashby answers HTTP 200 with {success:false} on a rejected write, so ashbyWrite_().ok is what is checked.
// Mode: 'dry' (default) reports and writes NOTHING. 'run' writes.
function run246bTopics(mode) {
  mode = mode || 'dry';
  var WANT = {
    'IK-435': "LLMOps/AgentOps",
    'IK-436': "LLMOps/AgentOps",
    'IK-437': "LLMOps/AgentOps",
    'IK-438': "Harness Engineering for Reliable Agent Development",
    'IK-439': "Harness Engineering for Reliable Agent Development",
    'IK-440': "Harness Engineering for Reliable Agent Development",
    'IK-441': "Agent Engineering & Loop Engineering",
    'IK-442': "Agent Engineering & Loop Engineering",
    'IK-443': "Agent Engineering & Loop Engineering",
    'IK-444': "Multi Agent Systems - atleast 1 AI Engineer",
    'IK-445': "Multi Agent Systems - atleast 1 AI Engineer",
    'IK-446': "Agent Communication Protocols (MCP, A2A, ACP)",
    'IK-447': "Regression, MLE, EM and MAP",
    'IK-448': "Introduction to Machine Learning",
    'IK-449': "Supervised Learning II",
    'IK-450': "Deep Learning",
    'IK-451': "Deep Learning",
    'IK-524': "FDE"
  };
  var want = Object.keys(WANT);
  Logger.log('#246b  mode=' + mode + '  targets=' + want.length);
  if (want.length !== 18) throw new Error('PRECONDITION: expected 18 targets, got ' + want.length);

  // ---- 1. the FIELD, read not typed ------------------------------------------------------------
  var cfs = ashbyListAll_('/customField.list');
  var hits = [], CONTROL = [];
  cfs.forEach(function (f) {
    var title = String(f.title || f.name || '').trim();
    var ot = String(f.objectType || '');
    if (/specializ|specialis/i.test(title) && /opening/i.test(ot)) hits.push(f);
    // CONTROL: a title that cannot exist must match NOTHING. If this ever finds something the
    // matcher is too loose and the real match above means nothing either.
    if (/zzz-no-such-field-246b/i.test(title)) CONTROL.push(f);
  });
  Logger.log('  customField.list: ' + cfs.length + ' fields | Specialization-on-Opening matches: ' + hits.length
    + ' | CONTROL (invented title) matches: ' + CONTROL.length);
  if (CONTROL.length !== 0) throw new Error('CONTROL FAILED: the invented field title matched something');
  if (hits.length !== 1) {
    hits.forEach(function (f) { Logger.log('    candidate: ' + (f.title || f.name) + ' [' + f.objectType + '] ' + String(f.id).substring(0, 8) + '…'); });
    throw new Error('expected exactly ONE Specialization field on Opening, found ' + hits.length);
  }
  var FLD = hits[0];
  var ftype = String(FLD.type || FLD.fieldType || '');
  Logger.log('  FIELD: "' + (FLD.title || FLD.name) + '" id=' + String(FLD.id).substring(0, 8) + '… objectType=' + FLD.objectType + ' type=' + ftype + ' idLen=' + String(FLD.id).length);
  // 🚨 A MultiValueSelect needs fieldValue:[v]; a bare string returns success and silently no-ops.
  // This field is documented as plain text — assert it, do not assume it.
  if (/multi/i.test(ftype)) throw new Error('field is ' + ftype + ' — a bare string would silently no-op. Stop.');

  // ---- 2. the OPENINGS, full ids, matched on the IK number -------------------------------------
  var ops = ashbyListAll_('/opening.list');
  Logger.log('  opening.list: ' + ops.length);
  function nameOf(o) {
    return String(o.identifier || (o.latestVersion && (o.latestVersion.identifier || o.latestVersion.name)) || o.name || '').trim();
  }
  function topicOf(o) {
    var cf = (o.latestVersion && o.latestVersion.customFields) || [];
    for (var i = 0; i < cf.length; i++) {
      var t = String(cf[i].title || cf[i].name || '');
      if (!/specializ|specialis/i.test(t)) continue;
      var v = cf[i].valueLabel != null ? cf[i].valueLabel : cf[i].value;
      if (v && typeof v !== 'string' && v.length === 1) v = v[0];
      return (v === '' || v == null) ? '' : String(v);
    }
    return '';
  }
  var byIk = {};
  ops.forEach(function (o) {
    var nm = nameOf(o), m = /^(IK-\d+)\b/.exec(nm);
    if (!m) return;
    (byIk[m[1]] = byIk[m[1]] || []).push(o);
  });

  // ---- 3. plan, with every refusal reported rather than skipped --------------------------------
  var plan = [], problems = [];
  want.forEach(function (ik) {
    var found = byIk[ik] || [];
    if (found.length !== 1) { problems.push(ik + ': matched ' + found.length + ' openings, expected 1'); return; }
    var o = found[0], now = topicOf(o);
    if (now) { problems.push(ik + ': ALREADY has a topic ("' + now + '") — not overwriting'); return; }
    if (String(o.id).length < 20) { problems.push(ik + ': id looks truncated (' + o.id + ')'); return; }
    plan.push({ ik: ik, id: o.id, name: nameOf(o), value: WANT[ik] });
  });
  Logger.log('  PLAN: ' + plan.length + ' to write, ' + problems.length + ' refused');
  problems.forEach(function (p) { Logger.log('    REFUSED  ' + p); });
  plan.forEach(function (p) { Logger.log('    will set ' + p.ik + '  ' + String(p.id).substring(0, 8) + '…(len ' + String(p.id).length + ')  "' + p.value + '"'); });

  if (mode !== 'run') { Logger.log('  DRY — nothing written. Call run246bTopics("run") to write.'); return; }

  // ---- 4. write ---------------------------------------------------------------------------------
  var done = 0, failed = 0;
  plan.forEach(function (p) {
    var res = ashbyWrite_('/customField.setValue',
      { objectType: 'Opening', objectId: p.id, fieldId: FLD.id, fieldValue: p.value });
    if (res.ok) { done++; Logger.log('    OK   ' + p.ik + '  "' + p.value + '"'); }
    else { failed++; Logger.log('    FAIL ' + p.ik + '  code=' + res.code + '  ' + String(res.text).substring(0, 200)); }
    Utilities.sleep(250);
  });
  Logger.log('  WROTE ' + done + ', FAILED ' + failed);

  // ---- 5. read back ------------------------------------------------------------------------------
  // ⚠ A read-back through the SAME API is not proof (list endpoints also lag a write). It catches a
  // gross failure; the real confirmation is opening the field in the Ashby UI.
  Utilities.sleep(4000);
  var after = ashbyListAll_('/opening.list'), still = [];
  var byId = {}; after.forEach(function (o) { byId[o.id] = o; });
  plan.forEach(function (p) {
    var o = byId[p.id]; var v = o ? topicOf(o) : '(opening not found)';
    if (v !== p.value) still.push(p.ik + ': reads "' + v + '", wanted "' + p.value + '"');
  });
  Logger.log('  READ BACK: ' + (plan.length - still.length) + '/' + plan.length + ' match');
  still.forEach(function (s) { Logger.log('    MISMATCH ' + s); });
  Logger.log('#246b done. CONFIRM IN THE ASHBY UI before calling it finished.');
}

// The editor's Run passes no argument, so this wrapper is the ONLY way to reach 'run'.
// Kept separate on purpose: a stray Run on run246bTopics can therefore only ever be a DRY run.
function run246bWrite() { run246bTopics('run'); }

// The standing rule: every completed Ashby fix goes in the audit sheet tab 'V9 - Work log',
// NOT the Result column (buildAuditV9 rebuilds 'V9 - Correct' every run).
// 'peek' prints the header and the last row so the mapping is read, never guessed. 'append' writes.
function run246bLog(mode) {
  mode = mode || 'peek';
  var SS = '1U6Wi5uXLZ8hOhGKP2tyH--jHcEbUEvXgAPxbkUofTNA';
  var sh = SpreadsheetApp.openById(SS).getSheetByName('V9 - Work log');
  if (!sh) throw new Error("'V9 - Work log' not found");
  var v = sh.getDataRange().getValues();
  var hdr = v[0], last = v[v.length - 1];
  Logger.log('rows=' + v.length + '  (last data row = ' + (v.length - 1) + ')');
  Logger.log('HEADER: ' + hdr.join(' | '));
  Logger.log('LAST  : ' + last.map(function (x) { return String(x).substring(0, 60); }).join(' | '));
  var row = [];
  for (var i = 0; i < hdr.length; i++) {
    var h = String(hdr[i] || '').trim().toLowerCase();
    if (/date/.test(h)) row.push(Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd'));
    else if (/task|ref|id$/.test(h)) row.push('#246b');
    else if (/count|number|qty|#/.test(h)) row.push(18);
    else if (/verif/.test(h)) row.push('WROTE 18, FAILED 0; read back 18/18 via opening.list; IK-435 and IK-444 then confirmed by eye on the Ashby opening screen.');
    else if (/method|how/.test(h)) row.push('API customField.setValue on Opening, field "Specialization/Topic (SME Specific)" (String). run246bWrite in Run246b.gs.');
    else if (/what|desc|change|detail/.test(h)) row.push('#246b backfill: wrote the topic into the opening topic field on 18 Req Bot openings (IK-435..IK-451, IK-524) whose topic was only in the name. 227 openings named NA were deliberately left alone - no topic was ever given.');
    else if (/status/.test(h)) row.push('Done');
    else row.push('');
  }
  Logger.log('WOULD WRITE: ' + row.map(function (x) { return String(x).substring(0, 70); }).join(' | '));
  if (mode !== 'append') { Logger.log('PEEK only \u2014 nothing written.'); return; }
  sh.appendRow(row);
  SpreadsheetApp.flush();
  var after = sh.getDataRange().getValues();
  Logger.log('APPENDED. rows now ' + after.length + ' (was ' + v.length + ')');
  Logger.log('NEW ROW: ' + after[after.length - 1].map(function (x) { return String(x).substring(0, 60); }).join(' | '));
}

// Same pattern as run246bWrite: the editor's Run passes no argument, so run246bLog on its own
// can only ever PEEK. This is the only way to reach 'append'.
function run246bLogWrite() { run246bLog('append'); }

// ===== #244c probe — the two Budget fields on an Opening (read-only) =====
// Jerin asked for a budget on Replacement and Anticipation Of Exit rows, and the fields already exist
// in Ashby (seen on the opening screen 19 Oct while confirming #246b). Before anything is built, read
// their ID and TYPE: a Currency field does NOT take a bare number, and a MultiValueSelect silently
// no-ops on a string. 🚨 Nothing is written here.
function probe244cBudget() {
  var cfs = ashbyListAll_('/customField.list');
  var CONTROL = 0, hits = 0;
  Logger.log('customField.list: ' + cfs.length + ' fields');
  cfs.forEach(function (f) {
    var t = String(f.title || f.name || '').trim();
    if (/zzz-no-such-budget-244c/i.test(t)) CONTROL++;
    if (!/budget/i.test(t)) return;
    hits++;
    Logger.log('  FIELD "' + t + '" | objectType=' + f.objectType
      + ' | type=' + (f.type || f.fieldType) + ' | idLen=' + String(f.id).length
      + ' | id=' + String(f.id).substring(0, 8) + '…'
      + ' | options=' + ((f.selectableValues || f.options || f.values || []).length));
    Logger.log('    keys: ' + Object.keys(f).join(', '));
  });
  Logger.log('budget-matching fields: ' + hits + ' | CONTROL (invented title): ' + CONTROL);
  if (CONTROL !== 0) throw new Error('CONTROL FAILED - the matcher is too loose');
  if (!hits) throw new Error('no Budget field found - do not build against a guess');
}

// ===== #244c probe 2 — what shape does a Currency custom field hold? (read-only) =====
// Budget (Replacement / Anticipation of Exit) is type=Currency on Opening. A Currency field does NOT
// take a bare number, and Ashby does not publish the shape - so READ one that is already set rather
// than guess at a write. 🚨 Nothing is written here.
function probe244cShape() {
  var ops = ashbyListAll_('/opening.list');
  Logger.log('opening.list: ' + ops.length);
  var seen = 0, empty = 0, CONTROL = 0;
  for (var i = 0; i < ops.length && seen < 5; i++) {
    var cf = (ops[i].latestVersion && ops[i].latestVersion.customFields) || [];
    for (var j = 0; j < cf.length; j++) {
      var t = String(cf[j].title || cf[j].name || '');
      if (/zzz-no-such-budget/i.test(t)) CONTROL++;
      if (!/budget/i.test(t)) continue;
      var v = cf[j].value, vl = cf[j].valueLabel;
      if (v === null || v === undefined || v === '') { empty++; continue; }
      seen++;
      Logger.log('  "' + t + '" on ' + String(ops[i].identifier || '').substring(0, 12));
      Logger.log('    value typeof=' + (typeof v) + '  JSON=' + JSON.stringify(v));
      Logger.log('    valueLabel=' + JSON.stringify(vl) + '  cf keys=' + Object.keys(cf[j]).join(','));
    }
  }
  Logger.log('budget values FOUND=' + seen + '  empty=' + empty + '  CONTROL=' + CONTROL);
  if (CONTROL !== 0) throw new Error('CONTROL FAILED');
  if (!seen) Logger.log('  ⚠ NONE set anywhere — the shape must be measured by writing to a SANDBOX opening.');
}

// ===== #244c probe 3 — find a SANDBOX opening to measure the Currency write shape on =====
// No opening anywhere has a budget set (probe 2: 0 of 2,681), so the shape cannot be read. It has to
// be measured by writing - and that write belongs on a TEST job, never a real opening.
// 🚨 READ-ONLY. It only reports what is available.
function probe244cSandbox() {
  var jobs = ashbyListAll_('/job.list');
  var test = jobs.filter(function (j) { return /\btest\b|sandbox/i.test(String(j.title || '')); });
  Logger.log('jobs: ' + jobs.length + ' | test-looking: ' + test.length);
  var ids = {};
  test.forEach(function (j) { ids[j.id] = j.title; Logger.log('  TEST JOB: ' + j.title + ' | ' + String(j.id).substring(0,8) + '\u2026'); });
  var ops = ashbyListAll_('/opening.list'), n = 0;
  ops.forEach(function (o) {
    var jl = (o.jobs || []).map(function (x) { return x.id || x; });
    var hit = jl.some(function (x) { return ids[x]; });
    if (!hit) return;
    n++;
    if (n <= 8) Logger.log('  SANDBOX OPENING: "' + String(o.identifier || o.name || '') + '" state=' + o.status
      + ' id=' + String(o.id).substring(0,8) + '\u2026');
  });
  Logger.log('openings on a test job: ' + n);
  if (!n) Logger.log('  \u26a0 none found - do NOT fall back to a real opening; ask first.');
}
