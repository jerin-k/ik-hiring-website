// ===== #165 — a role's score comes from the OPENING, never the job =====
// Jerin, 23 Sep 2026: "Complexity is to be considered at a opening level, not job. What have you done dude!"
// Jerin, 24 Sep 2026: "it shud take from opening and score Goal, and Closures" · "Yes, total the score from openings."
//
// THE RULE, settled 24 Sep — every branch of it lives HERE so it cannot drift between the panels that read it:
//   1. Complexity comes from the OPENING. The job's own Complexity field no longer scores anything.
//   2. An opening with NO complexity scores NOTHING. A blank is not an answer and must never read as "Normal" —
//      that silent default is the bug Jerin found (System Design + DSA read 12 instead of 15).
//   3. NO OPENING AT ALL scores NOTHING. He was shown what this costs and confirmed it twice: every Drop scores
//      zero points for good, because a drop can never be tied to an opening (settled with a control; do not re-test).
//   4. 🚨 HEADS ARE NEVER AFFECTED. Only points move. Σ headcount still equals the real number of people (Rule 1).
//   5. A JOB's score is the SUM of its openings' scores — an opening scoring 0 still counts as a zero in that
//      total, never skipped, or the total quietly stops agreeing with the opening count printed beside it.
//
// ⚠ THE GATE. The pipeline only began carrying `complexity` on 24 Sep 2026. Until a refresh has run, no opening has
// one, and rule 2 would read every score on the dashboard as zero — a dashboard that looks catastrophically broken
// for a reason no one could see. So `ready` asks whether the DATA can answer the question at all, and every caller
// keeps its old behaviour until it can. Same shape as `hasWaitSplit()` gating tisSchema 2 in stage-time.js.
import { scoreForRole } from './score-model.js';

const k8 = (id) => String(id || '').slice(0, 8);

// Memoised on the data object, exactly as topicLookup is: a refresh is a new object, so it rebuilds then and only
// then. Callers can say openingScores(data) inside a per-row function without rebuilding per row.
let osData = null, osIdx = null;
export function openingScores(data) {
  if (data && data === osData && osIdx) return osIdx;
  const cxOf = {}, jobOpenings = {};
  let withCx = 0, total = 0;
  ((data && data.openingRows) || []).forEach((r) => {
    if (!r.openingId) return;
    const key = k8(r.openingId), cx = String(r.complexity || '').trim();
    cxOf[key] = cx; total++; if (cx) withCx++;
    if (r.jobId8) (jobOpenings[r.jobId8] || (jobOpenings[r.jobId8] = [])).push(key);
  });
  // `ready` is deliberately "does ANY opening carry one", not "do they all". 26 of 271 Q3 openings are blank by
  // nature and are exactly what rule 2 is for; zero of them carrying one means the pipeline has not run yet.
  osData = data;
  osIdx = { cxOf, jobOpenings, ready: withCx > 0, withCx, total };
  return osIdx;
}

// The score of ONE opening. `meta` supplies department/title/level; the complexity comes from the opening alone.
// Returns 0 for an unknown opening and for one with no complexity — which is the rule, not a failure.
export function scoreOfOpening(openingId, meta, quarter, idx) {
  if (!idx || !idx.ready || !meta) return 0;
  const cx = idx.cxOf[k8(openingId)];
  if (!cx) return 0;
  return scoreForRole({ department: meta.department, title: meta.title, level: meta.level, complexity: cx }, quarter);
}

// Rule 5: a job is worth the sum of its openings. A blank opening contributes its zero rather than vanishing.
export function scoreOfJob(job8, meta, quarter, idx) {
  if (!idx || !idx.ready) return null;          // null = "cannot answer yet", so callers keep the old number
  const list = idx.jobOpenings[job8] || [];
  return list.reduce((sum, op) => sum + scoreOfOpening(op, meta, quarter, idx), 0);
}

// ===== #165e — a zero has to say WHY, or it is a number nobody can explain =====
// Jerin, 24 Sep 2026: "in cells that have scores that are Zero, mention a caption that X openings with no score —
// wont that help the recruiters to clean up their opening by updating the correct complexity?"
// Yes — and the caption names the REAL reason, because each one needs a different action (the #169 rule: each
// column answers ONE question, so the reason sits in the column it is about).
// 🚨 Never call this for a Drop. Every drop scores zero, permanently and unfixably, so a caption on each would be
// a clean-up list of ~125 items nobody can ever clear. That one is stated ONCE, in the Drop definitions block.
export function noScoreReason(openingIds, idx) {
  if (!idx || !idx.ready) return '';
  const ids = (openingIds || []).filter(Boolean);
  if (!ids.length) return 'not linked to an opening';
  const blank = ids.filter(id => !idx.cxOf[k8(id)]).length;
  if (!blank) return '';
  return blank === 1 ? '1 opening with no complexity' : `${blank} openings with no complexity`;
}
