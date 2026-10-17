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
    assess:true, round:false, added:true, evaluation:true, tis:true, rec:null, recMapped:false, tp:'app', late:false, beyondR1:false },
  { key:'helloChristy', titles:['Hello Christy'], label:'Hello Christy', roundLabel:null,
    assess:true, round:false, added:false, evaluation:true, tis:true, rec:'hc', recMapped:true, tp:'hc', late:false, beyondR1:false },
  { key:'taScreen', titles:['TA Screen'], label:'TA Screen', roundLabel:'TA Screen',
    assess:true, round:false, added:false, evaluation:false, tis:true, rec:'ta', recMapped:true, tp:'ta', late:false, beyondR1:false },
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
    assess:true, round:false, added:true, evaluation:true, tis:true, rec:null, recMapped:false, tp:'rc', late:true, beyondR1:true },
  { key:'docSub', titles:['Document Submission'], label:'Doc Sub', roundLabel:'Document Submission',
    assess:true, round:false, added:true, evaluation:true, tis:true, rec:null, recMapped:false, tp:'ds', late:true, beyondR1:true },
  { key:'offer', titles:['Offer'], label:'Offer', roundLabel:'Offer',
    assess:true, round:false, added:true, evaluation:true, tis:true, rec:'offer', recMapped:true, tp:'offer', late:true, beyondR1:true },
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
  obj('ASSESS_ADDED_210', smAddedPool(), B.ASSESS_ADDED_210);
  obj('TOFU_NOT_EVALUATION', smNotEvaluation(), B.TOFU_NOT_EVALUATION);
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
  chk('ASSESS_ADDED_210', ASSESS_ADDED_210, B.ASSESS_ADDED_210, true);
  chk('TOFU_NOT_EVALUATION', TOFU_NOT_EVALUATION, B.TOFU_NOT_EVALUATION, true);
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
