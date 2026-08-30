// ===== Time-in-stage helpers (shared by Overall + Recruiter Efficiency "Time in Process" tabs) =====
// A "histogram" is { "<days>": count } — how many candidates dwelt N whole days in a stage.
// App Review histograms come from data.appReviewDwellByJob/ByRecruiter (main pull: now − createdAt for
// candidates CURRENTLY parked — full coverage of the ~51K), so App Review is 100% still-waiting and has
// no completed-stay side at all. Other stages come from data.stageRollups: timeInStageByJob/ByRecruiter
// is COMPLETED stays only (real enteredStageAt → leftStageAt), and waitingByJob/ByRecruiter is how long
// the people still sitting in the stage have waited. See the split note further down for why.

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

// ===== Completed stays vs still waiting (added 2026-08-30) =====
// 🚨 THE MEDIAN USED TO MEASURE THE CALENDAR, NOT THE PROCESS. The pipeline recorded a dwell for everyone
// who ENTERED a stage, measuring anyone still parked there to TODAY. In 2026-Q1, 250 of TA Screen's 265
// candidates never left, so each contributed "today − applied" and the column read 192 days — one more
// every day. Q1 read 192d and Q2 109d, which is simply how long ago each quarter was, so the tab looked
// like the process was getting dramatically faster when nothing had changed.
//
// The pipeline now keeps the two apart (tisSchema 2):
//   timeInStageBy*  = COMPLETED stays only — a real processing time, comparable between quarters
//   waitingBy*      = how long the people still sitting in the stage have been waiting
// Both are shown: the median on top, the waiting pile under it in amber. Losing the pile would hide the
// more useful finding — 250 people nobody ever actioned is a backlog, not a slow process.

// Does this rollups file carry the finished/waiting split? An older file does not, and silently showing its
// pooled median as if it were a completed-stay time is exactly the "fallback on a different time basis" trap
// (CLAUDE.md rule 4) — so callers check this and say so on screen instead.
export function hasWaitSplit(rollups) { return !!(rollups && rollups.tisSchema >= 2); }

// One stage's { fin, wait } pair for a key, scoped to `quarters` when the data supports it.
// `wait: null` means this file predates the split — the caller renders the old single number and warns.
export function tisPair(store, storeQ, waitStore, waitStoreQ, key, stage, quarters, split) {
  const fin = tisHist(store, storeQ, key, stage, quarters);
  if (!split) return { fin, wait: null };
  return { fin, wait: tisHist(waitStore, waitStoreQ, key, stage, quarters) };
}

// Merge pairs up a tree (Pod → Recruiter → Job, Department → Job). Waiting stays null if any level lacks it.
export function poolPairs(pairs) {
  const anyWait = pairs.some(p => p && p.wait);
  return {
    fin: poolHists(pairs.map(p => (p && p.fin) || {})),
    wait: anyWait ? poolHists(pairs.map(p => (p && p.wait) || {})) : null,
    // `live` marks the App Review column, which has no completed-stay side at all. It must survive pooling
    // or a rolled-up App Review cell would read empty on the pre-split fallback path.
    live: pairs.some(p => p && p.live)
  };
}

// A Time-in-Process cell: median days for those who FINISHED the stage, with the still-waiting pile under it
// in amber as "<count> · <median>d". An empty median with a waiting pile reads "—", which is the honest
// answer for a stage nobody has completed in the period (App Review always, Q1 TA Screen very nearly).
export function tisCellSplit(pair, threshold) {
  const fin = (pair && pair.fin) || {};
  const wait = pair ? pair.wait : null;
  const f = histStats(fin), w = wait ? histStats(wait) : { n: 0 };
  if (!f.n && !w.n) return '<td class="tis zero" style="text-align:right">·</td>';
  threshold = threshold == null ? 5 : threshold;
  const med = f.n
    ? `<span class="tis-med${f.median > threshold ? ' over' : ''}">${fmt(f.median)}</span>`
    : '<span class="tis-med none">—</span>';
  // 🚨 THE WAITING PILE IS TWO STACKED LINES, NOT "20 · 212.5d" ON ONE (Jerin, 2026-08-30).
  // The middot read as a decimal point — "what does 20.212.5d even mean, dude?" — and he was right: two
  // separate numbers separated by a dot is one number to anyone not already expecting two. Stacking them
  // with the units spelled out makes it unmisreadable, and keeps the column narrow. Putting "waiting" on
  // the same line instead would roughly double every column's width; across 13 stages that forces the
  // whole table into sideways scrolling. Do not "tidy" this back onto one line.
  const cnt = (n) => n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k' : String(n);
  // The pile is measured in months, so the half-day is false precision — rounded. The median on top is a
  // real processing time where half a day genuinely means something, so that one keeps its .5.
  const wd = w.n ? Math.round(w.median) : 0;
  const waitLine = w.n
    ? `<span class="tis-wait">${cnt(w.n)} waiting</span><span class="tis-wait">${wd} ${wd === 1 ? 'day' : 'days'}</span>`
    : '';
  const tip = [
    f.n ? `finished: median ${fmt(f.median)}d · mean ${f.mean.toFixed(1)}d · n=${f.n}`
        : 'nobody has finished this stage in the period',
    w.n ? `still waiting: ${w.n} ${w.n === 1 ? 'candidate' : 'candidates'}, median ${fmt(w.median)} days so far` : ''
  ].filter(Boolean).join(' — ');
  return `<td class="tis" title="${tip}">${med}${waitLine}</td>`;
}

// Said on both tabs, under the heading. The convention needs one line or the amber figure is a mystery.
export const TIS_SPLIT_NOTE = 'Each cell: <strong>median days for candidates who finished the stage</strong>, then two amber lines &mdash; <span style="color:var(--orange)">how many are still sitting there, and how long they have waited</span>. A dash on top means nobody has finished it in this period.';
