// ===== Time-in-stage helpers (shared by Overall + Recruiter Efficiency "Time in Process" tabs) =====
// A "histogram" is { "<days>": count } — how many candidates dwelt N whole days in a stage.
// App Review histograms come from data.appReviewDwellByJob/ByRecruiter (main pull: now − createdAt for
// candidates CURRENTLY parked — full coverage of the ~51K). Other stages come from
// data.stageRollups.timeInStageByJob/ByRecruiter (real enteredStageAt/leftStageAt from stage history).

// Stage columns, in pipeline order. keys match the histogram stage keys.
export const TIS_STAGES = [
  ['appReview', 'App Review'], ['helloChristy', 'Hello Christy'], ['taScreen', 'TA Screen'], ['hmReview', 'HM Screening'], ['oa', 'OA'],
  ['r1', 'R1'], ['r2', 'R2'], ['r3', 'R3'], ['r4', 'R4'], ['r5', 'R5'], ['refCheck', 'Ref Check'], ['docSub', 'Doc Sub'], ['offer', 'Offer']
];

export function mergeHist(target, src) { if (src) for (const d in src) target[d] = (target[d] || 0) + src[d]; return target; }
export function poolHists(hists) { const out = {}; hists.forEach(h => mergeHist(out, h)); return out; }

// { n, median, mean } from a {days:count} histogram. Median handles even n by averaging the two middle values,
// so it stays robust to the long App-Review tail (a few candidates parked 150+ days don't move it).
export function histStats(h) {
  if (!h) return { n: 0, median: null, mean: null };
  const days = Object.keys(h).map(Number).sort((a, b) => a - b);
  let n = 0, sum = 0; days.forEach(d => { n += h[d]; sum += d * h[d]; });
  if (!n) return { n: 0, median: null, mean: null };
  const at = (pos) => { let c = 0; for (const d of days) { c += h[d]; if (c >= pos) return d; } return days[days.length - 1]; };
  const lo = Math.floor((n + 1) / 2), hi = Math.ceil((n + 1) / 2);
  return { n, median: (at(lo) + at(hi)) / 2, mean: sum / n };
}

const fmt = (x) => Number.isInteger(x) ? String(x) : x.toFixed(1);

// A <td> for a time-in-stage cell: MEDIAN days (red when > threshold), with mean + n in the tooltip.
// Empty (no candidates in that stage) → a faint dot to keep the wide grid readable.
export function tisCell(hist, threshold) {
  const s = histStats(hist);
  if (!s.n) return '<td class="zero" style="text-align:right">·</td>';
  threshold = threshold == null ? 5 : threshold;
  const red = s.median > threshold;
  const style = 'text-align:right;white-space:nowrap' + (red ? ';color:var(--red);font-weight:700' : '');
  return `<td style="${style}" title="median ${fmt(s.median)}d · mean ${s.mean.toFixed(1)}d · n=${s.n}">${fmt(s.median)}</td>`;
}

// ===== Period scoping (added 2026-08-21, backlog #13) =====
// The Year/Quarter selector used to change pod membership only, so these panels rendered LIFETIME medians
// under a quarter heading — Q1 and Q2 came out byte-identical and nothing looked broken. The pipeline now
// also emits timeInStageByJobQ / timeInStageByRecruiterQ, bucketed by the quarter the candidate ENTERED the
// stage (same basis as throughputBy*Q), which is what these helpers read.

// Quarter keys covered by a Year/Quarter selection. null = no period picked (all-time).
// `years` is the page's own year list, used only to resolve "quarter but no year".
export function periodQuarters(year, quarter, years) {
  if (!year && !quarter) return null;
  const yr = String(year || (years && years[0]) || new Date().getFullYear());
  if (quarter) return [`${yr}-${quarter}`];
  return ['Q1', 'Q2', 'Q3', 'Q4'].map(q => `${yr}-${q}`);
}

// Does this rollups file carry the per-quarter dwell histograms? Older files do not, and a caller that
// silently fell back to lifetime numbers would recreate the exact bug this fixes — so pages check this
// and say so on screen instead.
export function hasQuarterTis(rollups) {
  return !!(rollups && (rollups.timeInStageByJobQ || rollups.timeInStageByRecruiterQ));
}

// Dwell histogram for one key + stage, scoped to `quarters` when the data supports it.
//   store  = lifetime  {key:{stage:{days:count}}}
//   storeQ = quarterly {key:{stage:{quarter:{days:count}}}}
// With a period selected and storeQ present, an absent entry means "nobody entered that stage that
// quarter" — return {} rather than falling back to the lifetime figure.
export function tisHist(store, storeQ, key, stage, quarters) {
  if (quarters && quarters.length && storeQ) {
    const byQ = storeQ[key] && storeQ[key][stage];
    if (!byQ) return {};
    const out = {};
    quarters.forEach(q => mergeHist(out, byQ[q]));
    return out;
  }
  return (store && store[key] && store[key][stage]) || {};
}

// App Review dwell is "today − applied date for everyone CURRENTLY parked there" — a live snapshot with no
// historical dimension, so it cannot be quarter-scoped at all. Panels mark the column and say this rather
// than letting a live number sit unlabelled beside quarter-scoped ones.
export const APP_REVIEW_LIVE_NOTE = 'App Review is a live snapshot (everyone parked there today) and does not follow the period — the other stages do.';
