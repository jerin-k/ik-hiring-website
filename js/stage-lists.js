// ===== THE STAGE LISTS — one source, published by the pipeline (#240b, 18 Oct 2026) =====
// #240a made every stage list in the PIPELINE derive from one table (StageModel.gs). The site kept its
// own copies: STAGES_ORDER / STAGE_LABELS / TP_KEYS / TP_LABELS / TP_TO_STAGE in hm-report.js, TP_KEYS /
// TP_LABELS / TP_TO_SK in efficiency.js, TIS_STAGES in stage-time.js. They matched, but a second copy
// that has to be kept in step by hand is exactly the disease #240 exists to cure — add a stage in Ashby
// and the pipeline would pick it up while the site's columns silently would not.
//
// 🔑 THE PIPELINE DERIVES, THE SITE READS. The lists arrive pre-built in dashboard.json (`stageLists`,
// written by smPublish() in StageModel.gs). The site derives NOTHING of its own — same division as
// "the table computes, the chart reads" (CLAUDE.md rule 3). So a stage added to the model reaches every
// column here on the next refresh with no edit to this file, which is what #240d needs.
//
// 🚨 WHY THESE ARE `let` AND NOT `const`. dashboard.json is fetched asynchronously, long after these
// module bodies have run, so the published lists cannot be read at import time. The literals below are
// the FALLBACK; loadDashboardData() calls adoptStageLists() the moment the file lands, before any page
// renders. ES module imports are live bindings, so every importer then sees the published list without
// any change at its own use sites. Do not turn these back into `const`, and do not copy one into
// another module-level `const` — that copy would freeze the fallback and reintroduce the drift.
//
// ⚠ THE FALLBACK IS A REAL CODE PATH, not decoration: it is what an older dashboard.json gets, and what
// everyone gets if the emit is ever broken. It must stay equal to the model. `tools/stage-model/
// frontend-check.py` compares these literals against the pipeline's own baseline and fails if they drift.

// ----- the fallback: what the site used before #240b, verbatim ---------------------------------------
// 'Hello Christy' is a bot-driven ALTERNATIVE to TA Screen (not a step before it) — candidates take one
// route or the other. It sits immediately to the LEFT of TA Screen everywhere, per the user 2026-08-21.
const FB_STAGES_ORDER = ['appReview','helloChristy','taScreen','hmReview','oa','r1','r2','r3','r4','r5','refCheck','docSub','offer','hired'];
const FB_STAGE_LABELS = {
  appReview:'App Review', helloChristy:'Hello Christy', taScreen:'TA Screen', hmReview:'HM Review', oa:'OA',
  r1:'R1', r2:'R2', r3:'R3', r4:'R4', r5:'R5',
  refCheck:'Ref Check', docSub:'Doc Sub', offer:'Offer', hired:'Hired'
};
// Throughput has its own shorter vocabulary (app/rc/ds against appReview/refCheck/docSub). Both are on
// screen today, so the model carries both rather than silently picking one.
const FB_TP_KEYS = ['app','hc','ta','hm','oa','r1','r2','r3','r4','r5','rc','ds','offer'];
const FB_TP_LABELS = {
  app:'App Review', hc:'Hello Christy', ta:'TA Screen', hm:'HM Review', oa:'OA',
  r1:'R1', r2:'R2', r3:'R3', r4:'R4', r5:'R5',
  rc:'Ref Check', ds:'Doc Sub', offer:'Offer'
};
const FB_TP_TO_STAGE = { app:'appReview', hc:'helloChristy', ta:'taScreen', hm:'hmReview', oa:'oa', r1:'r1', r2:'r2', r3:'r3', r4:'r4', r5:'r5', rc:'refCheck', ds:'docSub', offer:'offer' };
// Time in Process shows every stage except Hired (nobody dwells in Hired), as [key, label] pairs.
const FB_TIS_STAGES = [
  ['appReview', 'App Review'], ['helloChristy', 'Hello Christy'], ['taScreen', 'TA Screen'], ['hmReview', 'HM Review'], ['oa', 'OA'],
  ['r1', 'R1'], ['r2', 'R2'], ['r3', 'R3'], ['r4', 'R4'], ['r5', 'R5'], ['refCheck', 'Ref Check'], ['docSub', 'Doc Sub'], ['offer', 'Offer']
];

// #240d E: the stages Ashby no longer has. Empty in the fallback and on every day so far — a stage only
// lands here once the pipeline's register has seen it vanish.
const FB_STAGE_GONE = [];

// ----- what the rest of the site imports -------------------------------------------------------------
export let STAGES_ORDER = FB_STAGES_ORDER;
export let STAGE_LABELS = FB_STAGE_LABELS;
export let TP_KEYS = FB_TP_KEYS;
export let TP_LABELS = FB_TP_LABELS;
export let TP_TO_STAGE = FB_TP_TO_STAGE;
export let TIS_STAGES = FB_TIS_STAGES;
/** #240d E: stage keys Ashby no longer has. Their history is real, so they keep their place in every
 *  list above — this is what lets a table drop one from the periods that hold nothing for it. */
export let STAGE_GONE = FB_STAGE_GONE;

let source = 'fallback';
/** 'published' once a valid stageLists has been adopted, otherwise 'fallback'. For diagnostics and tests. */
export function stageListsSource() { return source; }

// 🚨 VALIDATE, DO NOT TRUST. A malformed or empty `stagesOrder` would not throw — it would quietly
// render every stage column away, on every tab, and look like a data outage. CLAUDE.md rule 4's cousin:
// a silent fallback onto a different basis is worse than a visible gap. So a payload is adopted whole or
// not at all, and a refusal says why in the console.
function problemWith(p) {
  if (!p || typeof p !== 'object') return 'no stageLists in dashboard.json';
  if (!(p.stageSchema >= 1)) return 'stageSchema is ' + JSON.stringify(p.stageSchema);
  const strArr = (v) => Array.isArray(v) && v.length > 0 && v.every(x => typeof x === 'string' && x);
  if (!strArr(p.stagesOrder)) return 'stagesOrder is not a non-empty list of keys';
  if (!strArr(p.tpKeys)) return 'tpKeys is not a non-empty list of keys';
  if (!p.stageLabels || typeof p.stageLabels !== 'object') return 'stageLabels missing';
  for (const k of p.stagesOrder) if (typeof p.stageLabels[k] !== 'string' || !p.stageLabels[k]) return 'no label for stage "' + k + '"';
  if (!p.tpLabels || typeof p.tpLabels !== 'object') return 'tpLabels missing';
  for (const k of p.tpKeys) if (typeof p.tpLabels[k] !== 'string' || !p.tpLabels[k]) return 'no throughput label for "' + k + '"';
  if (!p.tpToStage || typeof p.tpToStage !== 'object') return 'tpToStage missing';
  for (const k of p.tpKeys) if (p.stagesOrder.indexOf(p.tpToStage[k]) < 0) return 'tpToStage["' + k + '"] is not a known stage';
  if (!Array.isArray(p.tisStages) || !p.tisStages.length) return 'tisStages is not a non-empty list';
  for (const pair of p.tisStages) {
    if (!Array.isArray(pair) || pair.length !== 2 || !pair[0] || !pair[1]) return 'tisStages holds a malformed pair';
    if (p.stagesOrder.indexOf(pair[0]) < 0) return 'tisStages names unknown stage "' + pair[0] + '"';
    // tisStages carries its OWN copy of the label, so a disagreement would put two different names on
    // one stage — "OA" in Time in Process and something else in the Pipeline table. smTisStages() and
    // smStageLabels() both read the model's single `label` field, so a correct emit can never trip this;
    // if it ever does, the pipeline is at fault and the fallback is the safer screen. (Caught exactly
    // this in the #240b test payload, where only one of the two had been changed.)
    if (p.stageLabels[pair[0]] !== pair[1]) return 'tisStages calls "' + pair[0] + '" "' + pair[1] + '" but stageLabels calls it "' + p.stageLabels[pair[0]] + '"';
  }
  // #240d E — OPTIONAL, because an older dashboard.json has no goneKeys and its stages are all live.
  // Validated when present: a key that is not a known stage would silently hide nothing, or worse hide
  // the wrong column, and neither would throw.
  if (p.goneKeys !== undefined) {
    if (!Array.isArray(p.goneKeys)) return 'goneKeys is not a list';
    for (const k of p.goneKeys) {
      if (typeof k !== 'string' || !k) return 'goneKeys holds something that is not a key';
      if (p.stagesOrder.indexOf(k) < 0) return 'goneKeys names "' + k + '", which is not in stagesOrder';
    }
  }
  return null;
}

/**
 * Take the stage lists the pipeline published, if they are sound. Called once by loadDashboardData()
 * before any page renders. Returns 'published' or 'fallback'; never throws.
 */
export function adoptStageLists(data) {
  const p = data && data.stageLists;
  const problem = problemWith(p);
  if (problem) {
    // Silent on the ordinary case — an older dashboard.json simply has no stageLists and the fallback is
    // correct for it. Loud only when something IS there and is wrong, which is a pipeline fault.
    if (p) console.warn('#240b: ignoring the published stage lists and keeping the built-in ones — ' + problem);
    source = 'fallback';
    return source;
  }
  STAGES_ORDER = p.stagesOrder;
  STAGE_LABELS = p.stageLabels;
  TP_KEYS = p.tpKeys;
  TP_LABELS = p.tpLabels;
  TP_TO_STAGE = p.tpToStage;
  TIS_STAGES = p.tisStages;
  STAGE_GONE = p.goneKeys || [];
  source = 'published';
  return source;
}

// ===== #240d E — which GONE stages a period leaves out ===============================================
// 🗣 HIS RULE, 16 Oct 2026, verbatim: "a stage shows in a period if Ashby still has it, OR it has data in
// that period." Both halves matter:
//   · a stage Ashby STILL HAS always shows, even reading zero — that zero is a real fact about the period,
//     and hiding it would be a lie about what happened (CLAUDE.md rule 4's cousin).
//   · a stage Ashby no longer has shows ONLY where it holds something, so a deleted round stops cluttering
//     every period for ever while its real history stays reachable.
// 🔑 ONE HOME, and the caller supplies the data test because only the caller knows what ITS table counts —
// the same division as "the table computes, the chart reads".
// ⚠ Returns an empty Set the moment nothing is gone, which is every day so far: this is a provable no-op
// until the pipeline's register actually reports a vanished stage.
/**
 * @param {string[]} keys        the key list the table is about to render (throughput keys, stage keys…)
 * @param {function} stageKeyOf  maps one of those keys to its STAGE key (identity, or TP_TO_STAGE)
 * @param {function} hasData     true when that key holds anything in the period on screen
 * @returns {Set<string>}        the keys to leave out
 */
export function dropGoneEmpty(keys, stageKeyOf, hasData) {
  const out = new Set();
  if (!STAGE_GONE.length) return out;
  for (const k of keys) if (STAGE_GONE.indexOf(stageKeyOf(k)) >= 0 && !hasData(k)) out.add(k);
  return out;
}
