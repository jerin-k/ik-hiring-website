// ===== STAGE MODEL (#240 step A, 16 Oct 2026) ================================
// THE one place a stage is described. Every list that used to be typed out by hand is DERIVED
// from the table below, so a stage can never again be added in seven places and forgotten in the
// eighth. Nothing here changes behaviour: stageModelSelfTest() asserts every derived list still
// equals the value the live code produced BEFORE the switchover.
//
// Fields, and the hand-written list each one used to feed:
//   key/titles[]  internal key, and EVERY Ashby title meaning it   STAGE_KEY_MAP, TRACTION_TORD
//   label         short display label                              STAGE_LABELS, TIS_STAGES
//   roundLabel    long label where one is used, else null          TRACTION_ROUNDS
//                 (deliberately differs: 'Online Assessment' vs label 'OA' - two vocabularies
//                  are on screen today, so the model carries both rather than silently picking)
//   assess        counted by Assess.gs                             ASSESS_ORDER
//   round         is an interview round                            ASSESS_ROUND_POOL
//   added         measured by people ADDED, not assessed           ASSESS_ADDED_210
//   evaluation    an interview here counts for Momentum            TOFU_NOT_EVALUATION (the INVERSE)
//   tis           appears in Time in Process                       TIS_STAGES
//   rec/recMapped recruiter short code                             RECRUITER_STAGES, STAGEKEY_TO_RECKEY
//                 (hired is in RECRUITER_STAGES but has no STAGEKEY_TO_RECKEY entry)
//   tp            throughput short code, else null                 TP_TO_STAGE, TP_TO_SK
//   late/beyondR1 title-keyed flags                                LATE_STAGES_, BEYOND_R1_

// A FUNCTION, NOT A var, AND THAT IS LOAD-ORDER SAFETY, NOT STYLE.
// Apps Script concatenates every .gs file and runs their top-level code in FILE ORDER, and this
// file sorts LAST. Function declarations hoist across files; var ASSIGNMENTS do not. If this were
// var STAGE_MODEL = [...], then DataRefresh.gs's own top-level var PIPELINE_KEYS = smPipelineKeys()
// would read it as undefined and every stage list would come out silently EMPTY.
var STAGE_MODEL_CACHE_ = null;
function stageModel_() {
  if (STAGE_MODEL_CACHE_) return STAGE_MODEL_CACHE_;
  STAGE_MODEL_CACHE_ = [
  { key:'appReview', titles:['App Review','Application Review'], label:'App Review', roundLabel:null,
    assess:true, round:false, added:true, evaluation:false, tis:true, rec:null, recMapped:false, tp:'app', late:false, beyondR1:false },
  { key:'helloChristy', titles:['Hello Christy'], label:'Hello Christy', roundLabel:null,
    assess:true, round:false, added:true, evaluation:false, tis:true, rec:'hc', recMapped:true, tp:'hc', late:false, beyondR1:false },
  { key:'taScreen', titles:['TA Screen'], label:'TA Screen', roundLabel:'TA Screen',
    assess:true, round:false, added:true, evaluation:false, tis:true, rec:'ta', recMapped:true, tp:'ta', late:false, beyondR1:false },
  { key:'hmReview', titles:['HM Review'], label:'HM Review', roundLabel:'HM Review',
    assess:true, round:false, added:true, evaluation:false, tis:true, rec:'hm', recMapped:true, tp:'hm', late:false, beyondR1:false },
  { key:'oa', titles:['Online Assessment','OA','R0 - Online Assessment'], label:'OA', roundLabel:'Online Assessment',
    assess:true, round:true, added:false, evaluation:true, tis:true, rec:'oa', recMapped:true, tp:'oa', late:false, beyondR1:false },
  { key:'r1', titles:['R1'], label:'R1', roundLabel:'R1',
    assess:true, round:true, added:false, evaluation:true, tis:true, rec:'r1', recMapped:true, tp:'r1', late:false, beyondR1:false },
  { key:'r2', titles:['R2'], label:'R2', roundLabel:'R2',
    assess:true, round:true, added:false, evaluation:true, tis:true, rec:'r2', recMapped:true, tp:'r2', late:false, beyondR1:true },
  { key:'r3', titles:['R3'], label:'R3', roundLabel:'R3',
    assess:true, round:true, added:false, evaluation:true, tis:true, rec:'r3', recMapped:true, tp:'r3', late:false, beyondR1:true },
  { key:'r4', titles:['R4'], label:'R4', roundLabel:'R4',
    assess:true, round:true, added:false, evaluation:true, tis:true, rec:'r4', recMapped:true, tp:'r4', late:false, beyondR1:true },
  { key:'r5', titles:['R5'], label:'R5', roundLabel:'R5',
    assess:true, round:true, added:false, evaluation:true, tis:true, rec:'r5', recMapped:true, tp:'r5', late:false, beyondR1:true },
  { key:'refCheck', titles:['Reference Check'], label:'Ref Check', roundLabel:'Reference Check',
    assess:true, round:false, added:true, evaluation:false, tis:true, rec:null, recMapped:false, tp:'rc', late:true, beyondR1:true },
  { key:'docSub', titles:['Document Submission'], label:'Doc Sub', roundLabel:'Document Submission',
    assess:true, round:false, added:true, evaluation:false, tis:true, rec:null, recMapped:false, tp:'ds', late:true, beyondR1:true },
  { key:'offer', titles:['Offer'], label:'Offer', roundLabel:'Offer',
    assess:true, round:false, added:true, evaluation:false, tis:true, rec:'offer', recMapped:true, tp:'offer', late:true, beyondR1:true },
  { key:'hired', titles:[], label:'Hired', roundLabel:null,
    assess:false, round:false, added:false, evaluation:true, tis:false, rec:'hired', recMapped:false, tp:null, late:false, beyondR1:false }
  ];
  return STAGE_MODEL_CACHE_;
}

// ----- derivations: every list that used to be hand-written -------------------
function M_() { return stageModel_(); }
function smKeys_(pred) { var o=[],i; for(i=0;i<M_().length;i++) if(!pred||pred(M_()[i])) o.push(M_()[i].key); return o; }
function smFlagSet_(f) { var o={},i,s; for(i=0;i<M_().length;i++){ s=M_()[i]; if(s[f]) o[s.key]=1; } return o; }
function smPipelineKeys() { return smKeys_(null); }
function smAssessOrder() { return smKeys_(function(s){ return s.assess; }); }
function smRoundPool() { return smFlagSet_('round'); }
function smAddedPool() { return smFlagSet_('added'); }
function smNotEvaluation() { var o={},i,s; for(i=0;i<M_().length;i++){ s=M_()[i]; if(!s.evaluation) o[s.key]=1; } return o; }
function smTractionKord() { var o={},i; for(i=0;i<M_().length;i++) o[M_()[i].key]=i+1; return o; }
function smRecruiterStages() { var o=[],i,s; for(i=0;i<M_().length;i++){ s=M_()[i]; if(s.rec) o.push(s.rec); } return o; }
function smStageKeyToRecKey() { var o={},i,s; for(i=0;i<M_().length;i++){ s=M_()[i]; if(s.recMapped) o[s.key]=s.rec; } return o; }
function smStageKeyMap() { var o={},i,j,s; for(i=0;i<M_().length;i++){ s=M_()[i]; for(j=0;j<s.titles.length;j++) o[s.titles[j]]=s.key; } return o; }
function smLateStages() { var o={},i,s; for(i=0;i<M_().length;i++){ s=M_()[i]; if(s.late) o[s.titles[0]]=1; } return o; }
function smBeyondR1() { var o={},i,s; for(i=0;i<M_().length;i++){ s=M_()[i]; if(s.beyondR1) o[s.titles[0]]=1; } return o; }
function smTisStages() { var o=[],i,s; for(i=0;i<M_().length;i++){ s=M_()[i]; if(s.tis) o.push([s.key,s.label]); } return o; }
function smStageLabels() { var o={},i,s; for(i=0;i<M_().length;i++){ s=M_()[i]; o[s.key]=s.label; } return o; }
function smTpToStage() { var o={},i,s; for(i=0;i<M_().length;i++){ s=M_()[i]; if(s.tp) o[s.tp]=s.key; } return o; }
function smTractionRounds() { var o=[],i,s; for(i=0;i<M_().length;i++){ s=M_()[i]; if(s.roundLabel) o.push(s.roundLabel); } return o; }
// TRACTION_TORD is pipeline order BY TITLE, used to decide whether a candidate advanced. It covers
// more stages than TRACTION_ROUNDS, which is only what is shown on screen: App Review and Hello
// Christy are ordered here but never displayed as rounds. So it follows assess, not roundLabel.
function smTractionTord() { var o={},i,j,s; for(i=0;i<M_().length;i++){ s=M_()[i]; if(!s.assess) continue;
  for(j=0;j<s.titles.length;j++) o[s.titles[j]]=i+1; } return o; }

// ===== 240b: publish the model for the frontend =============================
// The site is a STATIC page and cannot call into Apps Script, so the one model reaches it by
// riding in dashboard.json. THE PIPELINE DERIVES, THE SITE READS - it computes nothing of its
// own, the same division as "the table computes, the chart reads". A stage added to stageModel_()
// therefore reaches every column on the site at the next refresh with NO frontend edit, which is
// what #240d needs.
//
// Each list replaces a literal the site used to keep by hand:
//   stagesOrder  <- STAGES_ORDER (hm-report.js), re-exported to Overall Efficiency and Recruiter
//   stageLabels  <- STAGE_LABELS (hm-report.js)
//   tisStages    <- TIS_STAGES   (stage-time.js), the Time in Process columns
//   tpKeys       <- TP_KEYS      (hm-report.js AND efficiency.js - two copies, now one)
//   tpLabels     <- TP_LABELS    (the same two copies)
//   tpToStage    <- TP_TO_STAGE / TP_TO_SK (one map that had two names)
// Throughput keeps its own shorter vocabulary (app/rc/ds against appReview/refCheck/docSub)
// because both are on screen today; the model carries both rather than silently picking one.
//
// stageSchema marks a change in what a FIELD MEANS, never the adding of a stage - a new stage must
// flow through without a bump or the whole point is lost. The site validates this object and keeps
// its own built-in copy if anything is off, so a bad emit degrades rather than empties the screen.
function smPublish() {
  var m = M_(), i, s, tpKeys = [], tpLabels = {}, rules = {};
  for (i = 0; i < m.length; i++) {
    s = m[i];
    if (s.tp) { tpKeys.push(s.tp); tpLabels[s.tp] = s.label; }
    // #240c: the pipeline's own default for each stage, so the Admin screen can mark his corrections apart.
    rules[s.key] = { label: s.label, round: !!s.round, added: !!s.added, evaluation: !!s.evaluation };
  }
  return {
    stageSchema: 1,
    stagesOrder: smPipelineKeys(),
    stageLabels: smStageLabels(),
    tisStages:   smTisStages(),
    tpKeys:      tpKeys,
    tpLabels:    tpLabels,
    tpToStage:   smTpToStage(),
    rules:       rules
  };
}

// ===== FROZEN BASELINE - the BEFORE half of the before/after check ============
// Captured 16 Oct 2026 from the live DataRefresh.gs / Assess.gs / Tofu.gs / Traction.gs /
// stage-time.js / hm-report.js / efficiency.js, BEFORE any of them was switched to the model.
// NEVER regenerate this from the model. It has value only because it was taken from the code as
// it behaved before the change. Rebuilt from the thing it checks, it stops being a check.
function stageBaseline_() {
  return {
    STAGE_KEY_MAP: { 'App Review':'appReview', 'Application Review':'appReview', 'Hello Christy':'helloChristy',
      'TA Screen':'taScreen', 'HM Review':'hmReview', 'Online Assessment':'oa', 'OA':'oa',
      'R0 - Online Assessment':'oa', 'R1':'r1', 'R2':'r2', 'R3':'r3', 'R4':'r4', 'R5':'r5',
      'Reference Check':'refCheck', 'Document Submission':'docSub', 'Offer':'offer' },
    PIPELINE_KEYS: ['appReview','helloChristy','taScreen','hmReview','oa','r1','r2','r3','r4','r5','refCheck','docSub','offer','hired'],
    RECRUITER_STAGES: ['hc','ta','hm','oa','r1','r2','r3','r4','r5','offer','hired'],
    STAGEKEY_TO_RECKEY: { helloChristy:'hc', taScreen:'ta', hmReview:'hm', oa:'oa', r1:'r1', r2:'r2', r3:'r3', r4:'r4', r5:'r5', offer:'offer' },
    LATE_STAGES: { 'Reference Check':1, 'Document Submission':1, 'Offer':1 },
    BEYOND_R1: { 'R2':1, 'R3':1, 'R4':1, 'R5':1, 'Reference Check':1, 'Document Submission':1, 'Offer':1 },
    ASSESS_ORDER: ['appReview','helloChristy','taScreen','hmReview','oa','r1','r2','r3','r4','r5','refCheck','docSub','offer'],
    ASSESS_ROUND_POOL: { oa:1, r1:1, r2:1, r3:1, r4:1, r5:1 },
    ASSESS_ADDED_210: { refCheck:1, docSub:1, offer:1, appReview:1, hmReview:1 },
    TOFU_NOT_EVALUATION: { taScreen:1, hmReview:1 },
    TRACTION_KORD: { appReview:1, helloChristy:2, taScreen:3, hmReview:4, oa:5, r1:6, r2:7, r3:8, r4:9, r5:10, refCheck:11, docSub:12, offer:13, hired:14 },
    TRACTION_ROUNDS: ['TA Screen','HM Review','Online Assessment','R1','R2','R3','R4','R5','Reference Check','Document Submission','Offer'],
    TRACTION_TORD: { 'App Review':1, 'Application Review':1, 'Hello Christy':2, 'TA Screen':3, 'HM Review':4,
      'Online Assessment':5, 'OA':5, 'R1':6, 'R2':7, 'R3':8, 'R4':9, 'R5':10, 'Reference Check':11,
      'Document Submission':12, 'Offer':13 },
    TIS_STAGES: [['appReview','App Review'],['helloChristy','Hello Christy'],['taScreen','TA Screen'],
      ['hmReview','HM Review'],['oa','OA'],['r1','R1'],['r2','R2'],['r3','R3'],['r4','R4'],['r5','R5'],
      ['refCheck','Ref Check'],['docSub','Doc Sub'],['offer','Offer']],
    STAGES_ORDER: ['appReview','helloChristy','taScreen','hmReview','oa','r1','r2','r3','r4','r5','refCheck','docSub','offer','hired'],
    STAGE_LABELS: { appReview:'App Review', helloChristy:'Hello Christy', taScreen:'TA Screen', hmReview:'HM Review',
      oa:'OA', r1:'R1', r2:'R2', r3:'R3', r4:'R4', r5:'R5', refCheck:'Ref Check', docSub:'Doc Sub', offer:'Offer', hired:'Hired' },
    TP_TO_STAGE: { app:'appReview', hc:'helloChristy', ta:'taScreen', hm:'hmReview', oa:'oa', r1:'r1', r2:'r2', r3:'r3', r4:'r4', r5:'r5', rc:'refCheck', ds:'docSub', offer:'offer' },
    TP_TO_SK: { app:'appReview', hc:'helloChristy', ta:'taScreen', hm:'hmReview', oa:'oa', r1:'r1', r2:'r2', r3:'r3', r4:'r4', r5:'r5', rc:'refCheck', ds:'docSub', offer:'offer' }
  };
}

// ===== stageModelSelfTest - the AFTER half ====================================
// Run from the editor any time. Read-only: no data, no Ashby, no triggers. Throws on any failure.
// ONE declared difference: TRACTION_TORD gains 'R0 - Online Assessment'. STAGE_KEY_MAP has carried
// that alias since #234; the title-keyed traction list never got it, so the model supplies it.
function stageModelSelfTest() {
  var B = stageBaseline_(), fails = [], passes = [], warns = [], i;
  function j(v) { return JSON.stringify(v); }
  function pairs(o) { var k = Object.keys(o).sort(), r = [], n; for (n=0;n<k.length;n++) r.push([k[n],o[k[n]]]); return r; }
  function arr(name, got, want) {
    if (j(got) === j(want)) { passes.push(name + ' (' + got.length + ')'); return; }
    fails.push(name + ' | got ' + j(got) + ' | want ' + j(want));
  }
  function obj(name, got, want) {
    if (j(pairs(got)) !== j(pairs(want))) { fails.push(name + ' | got ' + j(got) + ' | want ' + j(want)); return; }
    if (j(Object.keys(got)) !== j(Object.keys(want))) warns.push(name + ' same members, different key order');
    passes.push(name + ' (' + Object.keys(got).length + ')');
  }
  function objPlus(name, got, want, allowed) {
    var extra = [], miss = [], diff = [], k;
    for (k in got) if (!(k in want) && allowed.indexOf(k) < 0) extra.push(k);
    for (k in want) { if (!(k in got)) miss.push(k); else if (got[k] !== want[k]) diff.push(k); }
    if (extra.length || miss.length || diff.length) {
      fails.push(name + ' | unexpected ' + j(extra) + ' | missing ' + j(miss) + ' | changed ' + j(diff)); return;
    }
    var added = []; for (k in got) if (!(k in want)) added.push(k);
    passes.push(name + ' (' + Object.keys(got).length + ', +' + added.length + ' declared ' + j(added) + ')');
  }
  arr('PIPELINE_KEYS', smPipelineKeys(), B.PIPELINE_KEYS);
  arr('STAGES_ORDER', smPipelineKeys(), B.STAGES_ORDER);
  arr('ASSESS_ORDER', smAssessOrder(), B.ASSESS_ORDER);
  arr('RECRUITER_STAGES', smRecruiterStages(), B.RECRUITER_STAGES);
  arr('TIS_STAGES', smTisStages(), B.TIS_STAGES);
  arr('TRACTION_ROUNDS', smTractionRounds(), B.TRACTION_ROUNDS);
  obj('ASSESS_ROUND_POOL', smRoundPool(), B.ASSESS_ROUND_POOL);
  // TWO APPROVED DIFFERENCES FROM THE FROZEN BASELINE (Jerin, 19 Oct 2026). The baseline records how the
  // code behaved BEFORE #240a and is never regenerated, so a deliberate change of DEFAULT is declared
  // here instead - and the test still fails on anything missing or flipped.
  //   ASSESS_ADDED_210    + helloChristy, taScreen - neither books an interview (Hello Christy is a bot),
  //                         so Throughput counts who ARRIVED rather than assessments it will never find.
  //   TOFU_NOT_EVALUATION + appReview, helloChristy, refCheck, docSub, offer - the first two decide
  //                         WHETHER to evaluate, the last three happen after the deciding is done.
  objPlus('ASSESS_ADDED_210', smAddedPool(), B.ASSESS_ADDED_210, ['helloChristy','taScreen']);
  objPlus('TOFU_NOT_EVALUATION', smNotEvaluation(), B.TOFU_NOT_EVALUATION, ['appReview','helloChristy','refCheck','docSub','offer']);
  obj('TRACTION_KORD', smTractionKord(), B.TRACTION_KORD);
  obj('STAGEKEY_TO_RECKEY', smStageKeyToRecKey(), B.STAGEKEY_TO_RECKEY);
  obj('STAGE_KEY_MAP', smStageKeyMap(), B.STAGE_KEY_MAP);
  obj('LATE_STAGES_', smLateStages(), B.LATE_STAGES);
  obj('BEYOND_R1_', smBeyondR1(), B.BEYOND_R1);
  obj('STAGE_LABELS', smStageLabels(), B.STAGE_LABELS);
  obj('TP_TO_STAGE', smTpToStage(), B.TP_TO_STAGE);
  obj('TP_TO_SK', smTpToStage(), B.TP_TO_SK);
  objPlus('TRACTION_TORD', smTractionTord(), B.TRACTION_TORD, ['R0 - Online Assessment']);
  var out = ['#240 stage model vs the frozen pre-switchover baseline',
    (fails.length ? 'FAIL' : 'PASS') + ' ' + passes.length + ' / ' + (passes.length + fails.length)];
  for (i=0;i<passes.length;i++) out.push('  ok   ' + passes[i]);
  for (i=0;i<warns.length;i++) out.push('  warn ' + warns[i]);
  for (i=0;i<fails.length;i++) out.push('  FAIL ' + fails[i]);
  var s = out.join('\n');
  Logger.log(s);
  if (fails.length) throw new Error('stageModelSelfTest: ' + fails.length + ' list(s) differ from the baseline');
  return s;
}

// ===== stageGlobalsSelfTest - the check that matters AFTER the switchover =====
// stageModelSelfTest() proves the MODEL derives the right values. This proves the REAL GLOBALS the
// pipeline actually reads now hold those values - which is a different claim, because it also
// depends on Apps Script's file load order. StageModel.gs sorts LAST, after DataRefresh.gs, so if
// the model were ever turned back into a `var` these globals would silently be empty and only this
// test would notice. Read-only. Throws on any difference.
function stageGlobalsSelfTest() {
  var B = stageBaseline_(), fails = [], passes = [], i;
  function j(v) { return JSON.stringify(v); }
  function pairs(o) { var k = Object.keys(o).sort(), r = [], n; for (n=0;n<k.length;n++) r.push([k[n],o[k[n]]]); return r; }
  function chk(name, got, want, isObj, allowed) {
    if (got === undefined || got === null) { fails.push(name + ' is ' + got + ' - LOAD ORDER PROBLEM'); return; }
    if (!isObj) {
      if (j(got) === j(want)) { passes.push(name + ' (' + got.length + ')'); return; }
      fails.push(name + ' | got ' + j(got) + ' | want ' + j(want)); return;
    }
    var extra = [], miss = [], diff = [], k;
    for (k in got) if (!(k in want) && (allowed || []).indexOf(k) < 0) extra.push(k);
    for (k in want) { if (!(k in got)) miss.push(k); else if (got[k] !== want[k]) diff.push(k); }
    if (extra.length || miss.length || diff.length) {
      fails.push(name + ' | unexpected ' + j(extra) + ' | missing ' + j(miss) + ' | changed ' + j(diff)); return;
    }
    passes.push(name + ' (' + Object.keys(got).length + ')');
  }
  chk('PIPELINE_KEYS', PIPELINE_KEYS, B.PIPELINE_KEYS, false);
  chk('RECRUITER_STAGES', RECRUITER_STAGES, B.RECRUITER_STAGES, false);
  chk('ASSESS_ORDER', ASSESS_ORDER, B.ASSESS_ORDER, false);
  chk('TRACTION_ROUNDS', TRACTION_ROUNDS, B.TRACTION_ROUNDS, false);
  chk('STAGE_KEY_MAP', STAGE_KEY_MAP, B.STAGE_KEY_MAP, true);
  chk('STAGEKEY_TO_RECKEY', STAGEKEY_TO_RECKEY, B.STAGEKEY_TO_RECKEY, true);
  chk('LATE_STAGES_', LATE_STAGES_, B.LATE_STAGES, true);
  chk('BEYOND_R1_', BEYOND_R1_, B.BEYOND_R1, true);
  chk('ASSESS_ROUND_POOL', ASSESS_ROUND_POOL, B.ASSESS_ROUND_POOL, true);
  chk('ASSESS_ADDED_210', ASSESS_ADDED_210, B.ASSESS_ADDED_210, true, ['helloChristy','taScreen']);   // declared 19 Oct
  chk('TOFU_NOT_EVALUATION', TOFU_NOT_EVALUATION, B.TOFU_NOT_EVALUATION, true, ['appReview','helloChristy','refCheck','docSub','offer']);
  chk('TRACTION_KORD', TRACTION_KORD, B.TRACTION_KORD, true);
  chk('TRACTION_TORD', TRACTION_TORD, B.TRACTION_TORD, true, ['R0 - Online Assessment']);
  var out = ['#240 LIVE GLOBALS vs the frozen pre-switchover baseline',
    (fails.length ? 'FAIL' : 'PASS') + ' ' + passes.length + ' / ' + (passes.length + fails.length)];
  for (i=0;i<passes.length;i++) out.push('  ok   ' + passes[i]);
  for (i=0;i<fails.length;i++) out.push('  FAIL ' + fails[i]);
  var s = out.join('\n');
  Logger.log(s);
  if (fails.length) throw new Error('stageGlobalsSelfTest: ' + fails.length + ' global(s) differ');
  return s;
}

// ===== #240c: THE ASHBY INVENTORY, AND HIS CORRECTIONS ==========================================
// Two jobs, both feeding the Admin -> Stage Mapping screen:
//   stageInventory_()      what stages Ashby actually has, per interview plan
//   applyStageOverrides_() his corrections to how a stage is counted, read from the published config
//
// WHY THE OVERRIDES CANNOT BE APPLIED IN THE BROWSER. Everything else configurable here (pods,
// capacity, the score grid) is applied by the SITE, on numbers the pipeline already worked out. These
// three rules work EARLIER - they decide how raw stage history is aggregated in the first place - so
// the site cannot apply them after the fact. The refresh has to read the config itself.
//
// AND WHY IT IS A FUNCTION CALLED FROM THE REFRESH, NOT WORK DONE AT LOAD TIME. ASSESS_ROUND_POOL,
// ASSESS_ADDED_210 and TOFU_NOT_EVALUATION are built the moment their files load. A Drive read there
// would run on EVERY execution, including every web-app request. So the globals are built from the
// defaults as before, and the refresh REASSIGNS them before any aggregation starts. Every use site
// reads the global inside a function at call time, so one reassignment reaches all of them.
// Call it FIRST in a refresh. refreshStageHistory needs it too - it builds the assessed rollups.

var STAGE_EXCLUDED_ = {};   // titles he has switched off; notifyStageNames_ skips them

// Every stage Ashby holds, with the dashboard key it maps to (or null when nothing matches).
// Cheap: one call for the plans, one per plan. Four calls today.
var STAGE_INVENTORY_CACHE_ = null;
function stageInventory_() {
  if (STAGE_INVENTORY_CACHE_) return STAGE_INVENTORY_CACHE_;
  var out = [], map = smStageKeyMap(), i, j, ps = [];
  // DEGRADE, NEVER ABORT. This runs inside the refresh critical path; an Ashby hiccup here must cost the
  // Stage Mapping screen its data, not the whole rebuild. An empty inventory means no overrides are
  // applied (the defaults stand) and no stagePlans is published (the screen says so plainly).
  try {
    var plans = ashbyPost_("/interviewPlan.list", {});
    ps = (plans && plans.results) || [];
  } catch (e) { Logger.log("#240c stageInventory_ could not read the plans: " + String(e).substring(0,200)); return []; }
  for (i = 0; i < ps.length; i++) {
    var sr = [];
    try { var st = ashbyPost_("/interviewStage.list", { interviewPlanId: ps[i].id }); sr = (st && st.results) || []; }
    catch (e2) { Logger.log("#240c stageInventory_ skipped a plan: " + String(e2).substring(0,160)); continue; }
    for (j = 0; j < sr.length; j++) {
      out.push({ id: sr[j].id, title: sr[j].title, order: sr[j].orderInInterviewPlan,
                 type: sr[j].type || "", planId: ps[i].id, planTitle: ps[i].title || "",
                 planArchived: !!ps[i].isArchived, key: map[sr[j].title] || null });
    }
  }
  STAGE_INVENTORY_CACHE_ = out;
  return out;
}

// What the Admin screen renders: the plans, and each plan stages in ASHBY OWN ORDER.
// liveJobs decides whether a plan is OFFERED for mapping - archiving the last job that used a plan is
// how a retired plan stops asking him things. The stages stay MAPPED in the data either way; this
// governs only what he is asked about.
function buildStagePlans_(liveJobCountByPlanId) {
  var inv = stageInventory_(), byPlan = {}, order = [], i, s;
  for (i = 0; i < inv.length; i++) {
    s = inv[i];
    if (!byPlan[s.planId]) {
      byPlan[s.planId] = { id: s.planId, title: s.planTitle, archived: s.planArchived,
                           liveJobs: (liveJobCountByPlanId && liveJobCountByPlanId[s.planId]) || 0, stages: [] };
      order.push(s.planId);
    }
    byPlan[s.planId].stages.push({ id: s.id, title: s.title, order: s.order, type: s.type, key: s.key });
  }
  var plans = [];
  for (i = 0; i < order.length; i++) {
    var p = byPlan[order[i]];
    // orderInInterviewPlan is NOT dense (the Test plan runs 0-6 then 1001-1003): SORT by it, never index.
    p.stages.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    plans.push(p);
  }
  return { stageRulesSchema: 1, plans: plans };
}

// His corrections. Keyed by Ashby STAGE ID: a title changes, an id does not, so a renamed stage keeps
// what he set for it. Returns how many were applied; throws nothing.
function applyStageOverrides_() {
  try { return applyStageOverridesInner_(); }
  catch (e) { Logger.log("#240c overrides NOT applied, defaults stand: " + String(e).substring(0,200)); return -1; }
}
function applyStageOverridesInner_() {
  var cfg = loadDriveJson_("metric_config.json");
  var rules = (cfg && cfg.stageRules) || {};
  var ids = Object.keys(rules);
  if (!ids.length) { Logger.log("#240c stage overrides: none set - the defaults stand"); return 0; }
  var byId = {}, inv = stageInventory_(), i;
  for (i = 0; i < inv.length; i++) byId[inv[i].id] = inv[i];
  var round = smRoundPool(), added = smAddedPool(), notEval = smNotEvaluation(), excl = {}, applied = [];
  for (i = 0; i < ids.length; i++) {
    var id = ids[i], r = rules[id] || {}, st = byId[id];
    if (!st) { applied.push("(stage " + id.substring(0, 8) + " no longer in Ashby - skipped)"); continue; }
    if (r.exclude) {
      excl[st.title] = 1;
      if (st.key) { delete round[st.key]; delete added[st.key]; }
      applied.push(st.title + ": excluded");
      continue;
    }
    if (!st.key) { applied.push(st.title + ": unrecognised, nothing to re-point"); continue; }
    if (r.measure === "round")         { round[st.key] = 1; delete added[st.key]; applied.push(st.title + ": interview round"); }
    else if (r.measure === "arrivals") { added[st.key] = 1; delete round[st.key]; applied.push(st.title + ": by arrivals"); }
    else if (r.measure === "ordered")  { delete round[st.key]; delete added[st.key]; applied.push(st.title + ": ordered step"); }
    if (r.evaluation === true) { delete notEval[st.key]; applied.push(st.title + ": evaluates"); }
    else if (r.evaluation === false) { notEval[st.key] = 1; applied.push(st.title + ": does not evaluate"); }
  }
  ASSESS_ROUND_POOL = round;
  ASSESS_ADDED_210 = added;
  TOFU_NOT_EVALUATION = notEval;
  STAGE_EXCLUDED_ = excl;
  Logger.log("#240c stage overrides applied (" + applied.length + "): " + applied.join(" | "));
  return applied.length;
}

// ===== #240d — a new or renamed stage looks after itself =====================================
// Goes into StageModel.gs, after applyStageOverrides_().
//
// 🔑 IDENTITY LIVES ON THE STAGE DEFINITION, NOT ON EVERY APPLICATION. The original plan costed
// capturing Ashby's stage id onto each application and backfilling the #204 shard. Not needed:
// stageInventory_() already reads every stage Ashby defines WITH ITS ID, so a rename is recognised
// here and becomes another TITLE on the stage that already exists. History keeps arriving by title,
// and the alias makes that title resolve to the stage it always was.
//
// 🚨 ITS OWN DRIVE FILE, on purpose. metric_config.json is owned by Admin ➝ Publish and its guard
// compares against the Drive copy, so a pipeline write into it would fight the publish. One owner
// per file.
//
// 🚨 DEGRADE, NEVER ABORT. This runs inside the refresh. An Ashby hiccup must cost the register an
// update, never the rebuild — so an empty inventory means "do nothing", not "forget everything".
var STAGE_REGISTER_FILE_ = 'stage_register.json';
var STAGE_REGISTER_CACHE_ = null;

function stageRegisterLoad_() {
  if (STAGE_REGISTER_CACHE_) return STAGE_REGISTER_CACHE_;
  var r = loadDriveJson_(STAGE_REGISTER_FILE_);
  if (!r || typeof r !== 'object' || !r.stages) r = { schema: 1, updatedAt: null, stages: {} };
  STAGE_REGISTER_CACHE_ = r;
  return r;
}

// A stable key for a stage we have never seen. Minted ONCE and stored against the Ashby id, so it
// survives every later rename — which is the whole point of keying on the id.
function smMintKey_(title, taken) {
  var base = String(title || '').replace(/[^0-9A-Za-z ]/g, ' ').split(/\s+/).filter(String);
  var k = '';
  for (var i = 0; i < base.length; i++) {
    var w = base[i].toLowerCase();
    k += i ? (w.charAt(0).toUpperCase() + w.slice(1)) : w;
  }
  if (!k) k = 'stage';
  if (/^[0-9]/.test(k)) k = 's' + k;
  var out = k, n = 2;
  while (taken[out]) { out = k + n; n++; }
  return out;
}

// What a stage Ashby has just grown looks like to us. 🔑 These defaults need NOTHING from him:
// Jerin's constraint (16 Oct) is "it is only evaluation level stages that might get added or edited",
// so a new stage is an interview round, counts as assessed, and counts for Momentum.
// ⚠ tp / rec MUST be set. tp drives the Throughput column and rec the Recruiter pipeline column —
// leave either null and the new stage silently has no column, which is the exact bug #240 exists to kill.
function smNewStageEntry_(key, title) {
  return { key: key, titles: [title], label: title, roundLabel: title,
           assess: true, round: true, added: false, evaluation: true, tis: true,
           rec: key, recMapped: true, tp: key, late: false, beyondR1: true, autoAdded: true };
}

// Reconcile what Ashby has against what we have seen before.
// Returns { added:[], renamed:[], gone:[] } — the three things the #236a mail has to distinguish.
function stageRegisterSync_(dry) {
  try { return stageRegisterSyncInner_(dry); }
  catch (e) {
    Logger.log('#240d register NOT synced, the model stands as it was: ' + String(e).substring(0, 200));
    return { added: [], renamed: [], gone: [], failed: true };
  }
}

function stageRegisterSyncInner_(dry) {
  var out = { added: [], renamed: [], gone: [] };
  var inv = stageInventory_();
  // 🚨 An empty inventory is Ashby being unreachable, NOT Ashby having no stages. Marking everything
  // gone on a bad network call would wipe the register and mail him a fiction.
  if (!inv || !inv.length) { Logger.log('#240d register: no inventory, nothing done'); return out; }

  var reg = stageRegisterLoad_(), st = reg.stages || {}, now = new Date().toISOString();
  var model = stageModel_(), byKey = {}, i, id;
  for (i = 0; i < model.length; i++) byKey[model[i].key] = model[i];
  // seed: on the very first run every stage Ashby already maps is recorded, so nothing it has always
  // had is reported as "added".
  var seen = {}, firstRun = !reg.updatedAt;

  for (i = 0; i < inv.length; i++) {
    var s = inv[i];
    if (!s || !s.id) continue;
    seen[s.id] = 1;
    var rec = st[s.id];

    if (rec) {
      rec.lastSeen = now;
      if (rec.gone) { rec.gone = false; }
      if ((rec.titles || []).indexOf(s.title) < 0) {
        var was = rec.titles[rec.titles.length - 1];
        rec.titles.push(s.title);
        var m = byKey[rec.key];
        // the alias is what makes history under the OLD name and the NEW name the same stage
        if (m && m.titles.indexOf(s.title) < 0) m.titles.push(s.title);
        out.renamed.push(s.title + ' (was "' + was + '")');
      }
      continue;
    }

    // an id we have never seen
    if (s.key) {                      // already mapped by title - record it, report nothing
      st[s.id] = { key: s.key, titles: [s.title], type: s.type, firstSeen: now, lastSeen: now, gone: false };
      continue;
    }
    if (STAGE_EXCLUDED_ && STAGE_EXCLUDED_[s.title]) continue;   // he switched it off; stay quiet
    if (String(s.type || '') !== 'Active') continue;             // only evaluation stages are ever added
    var key = smMintKey_(s.title, byKey);
    var entry = smNewStageEntry_(key, s.title);
    model.push(entry);
    byKey[key] = entry;
    st[s.id] = { key: key, titles: [s.title], type: s.type, firstSeen: now, lastSeen: now, gone: false, auto: true };
    if (!firstRun) out.added.push(s.title);
  }

  for (id in st) {
    if (!st.hasOwnProperty(id) || seen[id] || st[id].gone) continue;
    st[id].gone = true; st[id].goneAt = now;
    // 🔑 The key and every alias STAY. Its history is real, and E says it shows in any period that
    // still holds data for it.
    out.gone.push((st[id].titles || ['?'])[(st[id].titles || ['?']).length - 1]);
  }

  reg.schema = 1; reg.stages = st; reg.updatedAt = now;
  if (dry) { Logger.log('#240d DRY - nothing written to Drive'); }
  else saveDriveJson_(STAGE_REGISTER_FILE_, reg);
  // the inventory cached a key per stage against the OLD map; a rename or an adoption changes that
  if (out.added.length || out.renamed.length) STAGE_INVENTORY_CACHE_ = null;
  Logger.log('#240d register: ' + out.added.length + ' added, ' + out.renamed.length
    + ' renamed, ' + out.gone.length + ' gone' + (firstRun ? ' (first run - seeded, nothing reported)' : ''));
  return out;
}

// #240d test entry points. The Run picker hides names ending in _, so these exist to reach it.
// run240dDry() changes NOTHING - it reports what a sync would do against live Ashby data.
function run240dDry() {
  var r = stageRegisterSync_(true);
  Logger.log('#240d DRY RESULT  added=' + JSON.stringify(r.added)
    + '  renamed=' + JSON.stringify(r.renamed) + '  gone=' + JSON.stringify(r.gone)
    + (r.failed ? '  (FAILED - see above)' : ''));
  var reg = stageRegisterLoad_(), n = 0, k;
  for (k in (reg.stages || {})) n++;
  Logger.log('#240d register currently holds ' + n + ' stage ids; model is now '
    + stageModel_().length + ' stages');
}
function run240dSync() { var r = stageRegisterSync_(false); Logger.log('#240d SYNCED ' + JSON.stringify(r)); }
