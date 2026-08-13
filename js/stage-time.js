// ===== Time-in-stage helpers (shared by Overall + Recruiter Efficiency "Time in Process" tabs) =====
// A "histogram" is { "<days>": count } — how many candidates dwelt N whole days in a stage.
// App Review histograms come from data.appReviewDwellByJob/ByRecruiter (main pull: now − createdAt for
// candidates CURRENTLY parked — full coverage of the ~51K). Other stages come from
// data.stageRollups.timeInStageByJob/ByRecruiter (real enteredStageAt/leftStageAt from stage history).

// Stage columns, in pipeline order. keys match the histogram stage keys.
export const TIS_STAGES = [
  ['appReview', 'App Review'], ['taScreen', 'TA Screen'], ['hmReview', 'HM Screening'], ['oa', 'OA'],
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
