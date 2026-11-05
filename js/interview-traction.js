// ===== INTERVIEW TRACTION (#206, 7 Oct 2026) =====
// Every interview BOOKING, on the day it was scheduled for, split four ways. One chart per round, stacked
// down the page. Lives on BOTH Hiring Manager and Overall Efficiency.
//
// 🔑 ONE HOME ON PURPOSE (Rule 3). Panelists is written twice, once per page, and that is exactly the drift
// this file avoids: the two tabs call the SAME render with their own scope, so a change can never land on
// one tab and miss the other. Do not copy this into a page module.
//
// Outcome rule is Jerin's (b), 7 Oct: what HAPPENED NEXT, never the interviewer's feedback form — feedback
// is often never submitted, so scoring on it would leave silent holes. The pipeline (Traction.gs) decides
// the four buckets; this file only ADDS UP and DRAWS. The chart computes nothing of its own.
import { defsBlock } from './definitions.js';
import { scrollToLatest } from './grid-shade.js';   // #231b
import { jobLookup } from './job-filter.js';   // #291c: the role names behind a bar

const SERIES = [
  { key: 'Select',                  col: 'var(--it-sel)' },
  { key: 'Reject',                  col: 'var(--it-rej)' },
  { key: 'Rescheduled / Cancelled', col: 'var(--it-can)' },
  // #289b (Jerin, 5 Nov 2026): an interview still showing no result after its grace period is a No Show.
  // Its colour is a RELATIVE of --it-can, not a new hue, because both mean the interview produced nothing -
  // the same reasoning that gave --it-ahead a relative of --it-pen.
  { key: 'No Show',                 col: 'var(--it-nos)' },
  { key: 'Awaiting outcome',        col: 'var(--it-pen)' },
  // #245 (Jerin, 20 Oct 2026, option A): interviews already in the diary for a day that has not arrived.
  // \ud83d\udea8 ITS OWN SLOT, NEVER FOLDED INTO AWAITING OUTCOME. "Awaiting outcome" means HELD, no decision yet;
  // a booking for next Tuesday has not happened, so counting it there would have quietly moved that figure
  // from 249 to 304 on the day this shipped and changed what the word means.
  { key: 'Booked, not yet held',    col: 'var(--it-ahead)', ahead: true }
];
// \ud83d\udd11 FIVE IS STRUCTURAL. Every slot array, sum and loop goes through these three, so a sixth series
// would be one edit here rather than fourteen scattered ones - which is how the fourth nearly got missed.
// \u26a0 `addInto` tolerates a FOUR-long input on purpose: the data file's day arrays are [s,r,c,p], with no
// fifth element, and `v[4]` on them is undefined.
const NSLOT = SERIES.length;
// 🚨 TWO grace periods, his call (5 Nov 2026). A meeting gets 2 business days; Online Assessment is a test
// SENT OUT rather than attended, so it gets 7. Measured the day this shipped: a flat 2 would have called 79
// assessments no-shows, the split calls 57 - and 22 assessments correctly stay Awaiting, still inside their week.
const NOSHOW_DAYS = { 'Online Assessment': 7 };
const NOSHOW_DEFAULT = 2;
// Business days = Mon-Fri. There is NO holiday calendar, and the definitions block says so rather than
// letting a reader assume one. A FUNCTION of todayKey(), so a tab left open overnight ages with the clock.
function staleAwaiting(day, round) {
  const want = NOSHOW_DAYS[round] || NOSHOW_DEFAULT;
  let c = 0, d = new Date(day + 'T00:00:00Z');
  const today = new Date(todayKey() + 'T00:00:00Z');
  while (c < want) { d = new Date(d.getTime() + 86400000); const w = d.getUTCDay(); if (w !== 0 && w !== 6) c++; }
  return d.getTime() <= today.getTime();
}
const zeroSlots = () => new Array(NSLOT).fill(0);
const slotSum = (v) => { let t = 0; for (let i = 0; i < NSLOT; i++) t += (v[i] || 0); return t; };
const addInto = (c, v) => { for (let i = 0; i < NSLOT; i++) c[i] += (v[i] || 0); };
// 🚨 THE RAW DAY ARRAY IS [select, reject, cancelled, awaiting] AND ITS 4th ELEMENT NO LONGER MAPS TO SLOT 3.
// Since #289b the awaiting count splits BY AGE into No Show (3) and Awaiting outcome (4), so a raw array put
// through addInto would land every awaiting interview in No Show. addInto still merges already-mapped slot
// arrays (weeks, months, role tallies); this is the ONLY door raw data comes through.
const addRaw = (c, v, day, round) => {
  c[0] += v[0] || 0; c[1] += v[1] || 0; c[2] += v[2] || 0;
  const aw = v[3] || 0;
  if (aw) c[staleAwaiting(day, round) ? 3 : 4] += aw;
};
// Today, as the store writes its day keys. A FUNCTION, not a const: this module is loaded once and a tab
// left open overnight would otherwise keep yesterday's idea of "not yet held".
function todayKey() {
  const n = new Date();
  return n.getFullYear() + '-' + pad2(n.getMonth() + 1) + '-' + pad2(n.getDate());
}
// The furthest day anything is booked on, or null. Mirrors Momentum's horizon (#232), including which
// store it reads - the Recruiter tab's own store is a SUBSET, so reading the job store there would open
// columns that tab can never fill.
// #289c (Jerin, 5 Nov 2026): pass `only` and this answers for ONE round. It used to take a single maximum
// across every job and every round, so one TA Screen booking on 17 Nov drew twelve empty days onto Online
// Assessment, R3, R4 and R5 - rounds with nothing booked ahead at all.
function horizonOf(tr, scope, only) {
  let max = null;
  const scan = (days) => { if (days) for (const d in days) if (!max || d > max) max = d; };
  const walkRounds = (byRound) => { for (const r in byRound) { if (only && r !== only) continue; scan(byRound[r]); } };
  if (scope.byRecruiter) {
    const byRec = tr.byRecJobRoundDay || {};
    for (const rec in byRec) for (const j8 in byRec[rec]) walkRounds(byRec[rec][j8]);
  } else {
    const byJob = tr.byJobRoundDay || {};
    for (const j8 in byJob) walkRounds(byJob[j8]);
  }
  return max;
}
// Jerin, 7 Oct: "keep Online assessment, R1 to R5 ticked by default".
const DEFAULT_ROUNDS = ['Online Assessment', 'R1', 'R2', 'R3', 'R4', 'R5'];
// #289a (Jerin, 5 Nov 2026): "Lets limit this page to show the below round ... Rest can be ommitted."
// HM Review, Reference Check, Document Submission and Offer held 1, 0, 1 and 0 decisions in four months.
// The DATA still carries them - this hides them from the panel, it does not stop the pipeline emitting them.
const PANEL_ROUNDS = ['TA Screen', 'Online Assessment', 'R1', 'R2', 'R3', 'R4', 'R5'];
const DAY_WINDOW = 30;   // "lets show the last 30 days in the range" (Jerin, 7 Oct)

const pad2 = n => (n < 10 ? '0' : '') + n;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function isoWeek(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  const dn = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dn);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil((((t - y0) / 86400000) + 1) / 7);
}
function addDays(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.getUTCFullYear() + '-' + pad2(t.getUTCMonth() + 1) + '-' + pad2(t.getUTCDate());
}
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
// The day window is the last 30 days INSIDE the range (Jerin, 7 Oct: "the last 30 days in the range"), so a
// range shorter than 30 days gives a shorter window - and the caption has to say the window it actually drew,
// never "the last 30 days" over seven of them.
// Which month an ISO week belongs to is decided by its THURSDAY - that is the ISO rule, and it stops a week
// straddling a month boundary being labelled by whichever day happened to carry data.
function isoWeekThursday(year, week) {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dn = jan4.getUTCDay() || 7;
  const mon1 = new Date(jan4.getTime() - (dn - 1) * 86400000);
  return new Date(mon1.getTime() + ((week - 1) * 7 + 3) * 86400000);
}
function dayStart(scope) {
  const first = addDays(scope.to, -(DAY_WINDOW - 1));
  return first < scope.from ? scope.from : first;
}

// Add up every job the scope lets through, for one round, into {day: [s,r,c,p]}.
// #228a (Jerin, 13 Oct 2026): the Recruiter tab sets scope.byRecruiter, which reads the
// recruiter -> role -> round -> day store instead, so its Recruiter and Role chips both bite.
// 🔑 ONE function, deliberately. Hiring Manager and Overall Efficiency pass neither flag and are
// byte-for-byte unaffected — copying this into the Recruiter page is exactly the drift Rule 3 forbids.
function daysForRound(tr, round, scope, jobOut) {
  const out = {};
  const take = (days, j8) => {
    if (!days) return;
    for (const d in days) {
      if (d < scope.from || d > scope.to) continue;
      const v = days[d], c = out[d] || (out[d] = zeroSlots());
      // #291c (Jerin, 4 Nov 2026): "i want to know which role the count comes from". The tally is filled in
      // THIS loop, under the same window and the same scope tests - not in a second pass that could drift.
      // 🔑 That is what makes the role lines add up to the bar's own total by construction: the chart
      // already skips '(no job)' and anything the Job pick excludes, so there is no residue to explain.
      if (jobOut) {
        const jm = jobOut[d] || (jobOut[d] = {});
        const jc = jm[j8] || (jm[j8] = zeroSlots());
        // 🔑 THE SAME future-day rule as the bar, two lines up. The role tally is per OUTCOME, so it has to
        // split exactly where the bar splits, or a slice would name roles that are not in it.
        if (d > todayKey()) jc[NSLOT - 1] += (v[0] || 0) + (v[1] || 0) + (v[2] || 0) + (v[3] || 0);
        else addRaw(jc, v, d, round);
      }
      // #245: THE WHOLE of a future day goes to "booked, not yet held" - not just its awaiting count.
      // Nothing dated after today has happened, so no part of it is an outcome. Measured 19 Oct 2026: all
      // 55 future bookings were already awaiting-only, so this moves no number today; it is here so that a
      // stray select or reject on a future date cannot be reported as something that took place.
      // \ud83d\udd11 Read from todayKey() rather than from `scope`: gapNote builds a cut-down scope of its own, and
      // a key it forgot to copy would silently turn this rule off there (the same trap as #228a's spread).
      if (d > todayKey()) c[NSLOT - 1] += v[0] + v[1] + v[2] + v[3];
      else addRaw(c, v, d, round);
    }
  };
  if (scope.byRecruiter) {
    const byRec = tr.byRecJobRoundDay || {};
    for (const rec in byRec) {
      if (scope.recOk && !scope.recOk(rec)) continue;
      const jobs = byRec[rec];
      for (const j8 in jobs) {
        if (!j8 || j8 === '(no job)') continue;
        if (scope.jobOk && !scope.jobOk(j8)) continue;
        take(jobs[j8][round], j8);
      }
    }
    return out;
  }
  const byJob = tr.byJobRoundDay || {};
  for (const j8 in byJob) {
    // #206b: belt and braces. The pipeline no longer emits a '(no job)' bucket, but a cached older file
    // might still carry one — and 55 of the 74 bookings in it were the SANDBOX job, which the pipeline
    // drops by design (#37). Test interviews must never reach a business number.
    if (!j8 || j8 === '(no job)') continue;
    if (scope.jobOk && !scope.jobOk(j8)) continue;
    take(byJob[j8][round], j8);
  }
  return out;
}

// #228a: on the Recruiter tab a booking can only appear if its application names a recruiter, and today
// many do not — so this panel is SMALLER than the same panel on Hiring Manager and Overall Efficiency.
// 🚨 Say so on screen, for the period actually being shown. A figure two panels disagree about must never
// be left for someone to trip over. It is a READING, not a rule, so it belongs here in the live state and
// never in the definitions block (Rule 6).
function gapNote(tr, picked, scope) {
  if (!scope.byRecruiter) return '';
  // Only when you are looking at EVERYONE. Pick a recruiter and the unattributed interviews are not hers by
  // definition — nothing is missing from her view — so the line would be a number about a different
  // population sitting directly above her own.
  if (scope.recPicked) return '';
  const base = { from: scope.from, to: scope.to, jobOk: scope.jobOk };
  let all = 0, mine = 0;
  const add = (m) => { let n = 0; for (const d in m) n += slotSum(m[d]); return n; };
  picked.forEach(r => {
    all  += add(daysForRound(tr, r, base));
    mine += add(daysForRound(tr, r, { ...base, byRecruiter: true }));
  });
  const gap = all - mine;
  if (gap <= 0) return '';
  return `<p class="it-gap">${gap.toLocaleString()} of the ${all.toLocaleString()} interviews booked in this
    period have no recruiter on the application, so they are counted on Hiring Manager and Overall Efficiency
    but cannot be shown here.</p>`;
}

// Turn those days into the slots the chart draws. EVERY slot in the window is present, including the empty
// ones — Jerin, 7 Oct: "for the Zero days, give me a Zero bar". A missing day and a quiet day look different.
// #291c: `jobMap` ({day: {job8: n}}) rides alongside and is folded up the SAME way as the bar values, so a
// week bar's roles are the roles of exactly the days that bar draws.
const mergeJobs = (target, src) => { for (const j in (src || {})) addInto(target[j] || (target[j] = zeroSlots()), src[j]); };
function slotsFor(dayMap, view, scope, jobMap) {
  const slots = [];
  if (view === 'day') {
    const start = dayStart(scope);
    for (let d = start; d <= scope.to; d = addDays(d, 1)) {
      const v = dayMap[d] || zeroSlots();
      const dow = new Date(d + 'T00:00:00Z').getUTCDay();
      slots.push({ lab: d.slice(8), sub: MON[Number(d.slice(5, 7)) - 1], v, quiet: dow === 0 || dow === 6,
                   jobs: (jobMap && jobMap[d]) || {},
                   ahead: d > todayKey() });   // #245: for the today divider below
    }
    return slots;
  }
  if (view === 'month') {
    const byMon = {}, jMon = {};
    for (const d in dayMap) {
      const k = d.slice(0, 7), c = byMon[k] || (byMon[k] = zeroSlots());
      addInto(c, dayMap[d]);
      mergeJobs(jMon[k] || (jMon[k] = {}), jobMap && jobMap[d]);
    }
    // Every month across the range, so a silent month is a visible gap rather than a missing column.
    let cur = scope.from.slice(0, 7);
    const last = scope.to.slice(0, 7);
    while (cur <= last) {
      slots.push({ lab: MON[Number(cur.slice(5, 7)) - 1], sub: cur.slice(0, 4),
                   v: byMon[cur] || zeroSlots(), jobs: jMon[cur] || {}, quiet: false });
      let yy = Number(cur.slice(0, 4)), mm = Number(cur.slice(5, 7)) + 1;
      if (mm > 12) { mm = 1; yy++; }
      cur = yy + '-' + pad2(mm);
    }
    return slots;
  }
  const byWeek = {}, jWeek = {};
  for (const d in dayMap) {
    const k = isoWeek(d), c = byWeek[k] || (byWeek[k] = zeroSlots());
    addInto(c, dayMap[d]);
    mergeJobs(jWeek[k] || (jWeek[k] = {}), jobMap && jobMap[d]);
  }
  const ks = Object.keys(byWeek).map(Number);
  if (!ks.length) return [];
  const yr = Number(scope.from.slice(0, 4));
  // Fill the gap weeks too, so a silent fortnight reads as silence rather than as two adjacent bars.
  // Jerin, 8 Oct: the MONTH sits under the week number now. The total used to, and it already sits above
  // the bar - printing it twice told you nothing and cost the one line that could carry the calendar.
  for (let w = Math.min(...ks); w <= Math.max(...ks); w++) {
    slots.push({ lab: 'W' + w, sub: MON[isoWeekThursday(yr, w).getUTCMonth()],
                 v: byWeek[w] || zeroSlots(), jobs: jWeek[w] || {}, quiet: false });
  }
  return slots;
}

// #291c (Jerin, 4 Nov 2026) — WHICH ROLES ARE BEHIND THIS SLICE.
// 🗣 *"Hover over it & i want to know which role the count comes from?"*, then, on being offered an outcome
//    summary line: *"Outcome ins tnecssary cz the hover should work on the posrtion of the bar, not for the
//    whole bar dude."*
// 🔑 THE DESIGN THAT ANSWERS BOTH: every SLICE carries its own tooltip — which outcome it is, how many,
//    and the roles behind THAT number. The outcome never has to be listed, because the slice you are
//    pointing at IS the outcome. #291's whole-bar split and the summary line both fall away.
// ⚠ He named the limit himself: *"If we filter it by job, this feature may not make sense. But more often
//    than not, it'll help."* With one job picked every line is that role; harmless, just redundant.
// 🔑 WHY IT IS CAPPED, measured on the live file 4 Nov 2026 (Jul-Dec, R1 + TA Screen), per BAR — a slice
//    can only be shorter, so this is the worst case:
//      day view   — median 3 roles a bar, max 13; only 18% carry more than six
//      week view  — median 4, max 24; 46% carry more than six
//      month view — median 11, max 33
//    Day view is where this is read and it is short there. Month view would otherwise print 33 lines into a
//    tooltip, so the list stops at six BY SIZE and says how many it did not name - never a silent truncation.
const TIP_ROLES = 6;
function roleLines(sl, i, nameOf) {
  const rows = Object.keys(sl.jobs || {})
    .filter(j => ((sl.jobs[j] || [])[i] || 0) > 0)
    .map(j => [nameOf ? nameOf(j) : j, sl.jobs[j][i]])
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
  if (!rows.length) return '(role not recorded)';
  const out = rows.slice(0, TIP_ROLES).map(([t, n]) => `${t}: ${n}`);
  const rest = rows.length - TIP_ROLES;
  if (rest > 0) out.push(`+${rest} more role${rest === 1 ? '' : 's'}`);
  return out.join('\n');
}

function chartSvg(slots, nameOf) {
  const W = 1120, H = 186, padL = 34, padR = 8, padT = 18, padB = 32;
  const n = slots.length || 1, iw = (W - padL - padR) / n;
  let max = 0;
  slots.forEach(s => { max = Math.max(max, slotSum(s.v)); });
  // Floor the scale at 4. Without it a round with one booking a week draws a FULL-HEIGHT bar, the same size
  // as R1's seventy, because every chart scales to its own maximum. A small round has to look small.
  if (max < 4) max = 4;
  const plotH = H - padT - padB, base = padT + plotH;
  const y = v => base - (v / max) * plotH;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Interview outcomes by period">`;
  for (let g = 0; g <= 4; g++) {
    const val = Math.round(max * g / 4), yy = y(val);
    s += `<line x1="${padL}" y1="${yy}" x2="${W - padR}" y2="${yy}" stroke="var(--border-light)" stroke-width="1"/>`
       + `<text x="${padL - 6}" y="${yy + 3.5}" text-anchor="end" font-size="9" fill="var(--muted)">${val}</text>`;
  }
  slots.forEach((sl, ix) => {
    const x0 = padL + ix * iw, tot = slotSum(sl.v);
    const bw = Math.min(26, Math.max(5, iw * 0.56)), bx = x0 + (iw - bw) / 2;
    if (sl.quiet && tot === 0) s += `<rect x="${x0}" y="${padT}" width="${iw}" height="${plotH}" fill="var(--it-quiet)"/>`;
    if (tot === 0) {
      s += `<rect x="${bx}" y="${base - 2}" width="${bw}" height="2" fill="var(--it-zero)"><title>${esc(sl.lab + ' ' + sl.sub + ' · 0 booked')}</title></rect>`
         + `<text x="${bx + bw / 2}" y="${base - 6}" text-anchor="middle" font-size="8.5" fill="var(--muted)" font-weight="600">0</text>`;
    } else {
      // #291 (Jerin, 4 Nov 2026): "show the split of the count in a chart bar - when we hover over it".
      // The per-slice numbers were already printed, but a bare number never said WHICH outcome it was — you
      // had to match its colour against the legend by eye. Every slice now carries the WHOLE split, so one
      // hover anywhere on the bar answers it, and you no longer have to find the right slice first.
      // ⚠ This REPLACES the old one-line title ("Select: 10") on purpose. Native <title>: no tooltip code.
      let acc = 0; const outside = [];
      for (let i = 0; i < NSLOT; i++) {
        const v = sl.v[i]; if (v <= 0) continue;
        const hh = (v / max) * plotH, yy = y(acc + v);
        // 🗣 Jerin, 4 Nov 2026: *"the hover should work on the posrtion of the bar, not for the whole bar"*.
        // So each SLICE answers for itself - which outcome it is, how many, and the roles behind THAT number.
        // 🔑 That is also why no outcome summary is needed: the slice you are pointing at IS the outcome.
        const tip = `${sl.lab} ${sl.sub} · ${SERIES[i].key}: ${v}\n` + roleLines(sl, i, nameOf);
        s += `<rect x="${bx}" y="${yy}" width="${bw}" height="${hh}" fill="${SERIES[i].col}"><title>${esc(tip)}</title></rect>`;
        if (hh >= 11) s += `<text x="${bx + bw / 2}" y="${yy + hh / 2 + 3}" text-anchor="middle" font-size="8.5" fill="#fff" font-weight="600">${v}</text>`;
        else outside.push({ y: yy + hh / 2, y0: yy + hh / 2, v, col: SERIES[i].col });
        acc += v;
      }
      // Jerin, 8 Oct: "Even if its a small bar, i still want the data label, may be outside somehow."
      // A slice too thin to hold a number puts it BESIDE the bar, in that slice's own colour so you can
      // tell which one it belongs to, nudged apart so two thin slices never print on top of each other.
      if (outside.length) {
        outside.sort((a, b) => a.y - b.y);
        const GAP = 8.5, loY = padT + 3, hiY = base - 1;
        const spread = () => { for (let k = 1; k < outside.length; k++) {
          if (outside[k].y - outside[k - 1].y < GAP) outside[k].y = outside[k - 1].y + GAP; } };
        spread();
        // 🚨 Jerin, 8 Oct 2026, pointing at R1/W41: the stack must then be pulled back INSIDE the plot.
        // The spread above only ever pushes labels DOWN, and the draw step used to clamp each one to the
        // baseline independently - so on a SHORT bar (W41 is 14 against a 106 scale, so every slice sits near
        // the bottom) several labels all clamped to the same y and printed ON TOP of each other. Measured on
        // the live page: 5 colliding pairs out of 46 labels, one of them at a gap of exactly 0.
        // Shifting the whole stack up by the overflow keeps the spacing AND keeps it off the axis.
        const over = (outside[outside.length - 1].y + 2.5) - hiY;
        if (over > 0) outside.forEach(o => { o.y -= over; });
        if (outside[0].y + 2.5 < loY) { outside[0].y = loY - 2.5; spread(); }
        const right = bx + bw + 14 < W - padR;
        // Jerin, 8 Oct 2026: "these data labels suck.. connect the label to the block using a line."
        // A number parked beside the bar does not say WHICH slice it belongs to, and two thin slices in a row
        // make it worse. Each outside number now carries a leader in its own slice's colour, from the slice
        // edge to the digit. 46 of the 171 slices need one on today's data.
        // ⚠ The alternative he preferred - a chart tall enough that a block of 1 holds its own label - was
        //   measured and CANNOT work: it needs 11px per unit, and R1's busiest week is 106, so R1 alone would
        //   need a 1,166px chart. At 4x height 13 R1 slices still would not fit. Height is a readability
        //   choice; the leader is what removes the ambiguity. Do not swap one for the other.
        outside.forEach(o => {
          const ly = Math.min(base - 1, o.y + 2.5);
          const tx = right ? bx + bw + 6 : bx - 6;
          const ex = right ? bx + bw : bx;
          const mx = right ? bx + bw + 3.5 : bx - 3.5;
          s += `<path d="M ${ex} ${o.y0} L ${mx} ${o.y0} L ${right ? tx - 1.2 : tx + 1.2} ${ly - 2.5}" fill="none" stroke="${o.col}" stroke-width="0.7" opacity="0.8"/>`;
          s += `<text x="${tx}" y="${ly}" text-anchor="${right ? 'start' : 'end'}" font-size="7.5" fill="${o.col}" font-weight="700">${o.v}</text>`;
        });
      }
      s += `<text x="${bx + bw / 2}" y="${y(tot) - 4}" text-anchor="middle" font-size="9" fill="var(--text-secondary)" font-weight="600">${tot}</text>`;
    }
    s += `<text x="${x0 + iw / 2}" y="${H - 17}" text-anchor="middle" font-size="8.5" fill="${tot ? 'var(--text-secondary)' : 'var(--muted)'}" font-weight="600">${sl.lab}</text>`;
    s += sl.sub
      ? `<text x="${x0 + iw / 2}" y="${H - 8.5}" text-anchor="middle" font-size="7.5" fill="var(--muted)">${sl.sub}</text>`
      : `<text x="${x0 + iw / 2}" y="${H - 8.5}" text-anchor="middle" font-size="8" fill="var(--muted)">(${tot})</text>`;
  });
  // ---- #245: the today divider ----
  // DAY VIEW ONLY, and deliberately. In week or month view a bucket straddles today - the week of the 19th
  // holds both held and booked days - so a line drawn "at today" would fall INSIDE a bar and claim a
  // precision the bar does not have. There the colour carries the meaning on its own.
  const firstAhead = slots.findIndex(sl => sl.ahead);
  if (firstAhead > 0) {
    const dx = padL + firstAhead * iw;
    s += `<line x1="${dx}" y1="${padT - 7}" x2="${dx}" y2="${base}" stroke="var(--text-secondary)"
           stroke-width="1" stroke-dasharray="3 2.5"/>`
       + `<text x="${dx + 3}" y="${padT - 9}" font-size="8.5" fill="var(--text-secondary)" font-weight="600">today</text>`;
  }

  // ---- trend line over the slot TOTALS (Jerin, 8 Oct: "Add a trendline if it makes sense") ----
  // A straight least-squares fit, so it answers one question: is the volume rising or falling across the
  // period shown. It is drawn from the totals ALREADY computed above - the chart reads, it never recomputes.
  const tots = slots.map(sl => slotSum(sl.v));
  if (tots.length >= 3) {
    const n2 = tots.length;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    tots.forEach((t, i) => { sx += i; sy += t; sxx += i * i; sxy += i * t; });
    const den = n2 * sxx - sx * sx;
    if (den !== 0) {
      const slope = (n2 * sxy - sx * sy) / den, inter = (sy - slope * sx) / n2;
      const cx = i => padL + i * iw + iw / 2;
      const cl = val => y(Math.max(0, Math.min(max, val)));
      s += `<line x1="${cx(0)}" y1="${cl(inter)}" x2="${cx(n2 - 1)}" y2="${cl(inter + slope * (n2 - 1))}" `
         + `stroke="var(--it-trend)" stroke-width="1.6" stroke-dasharray="5 4" stroke-linecap="round" opacity="0.9"/>`;
    }
  }
  s += `<line x1="${padL}" y1="${base}" x2="${W - padR}" y2="${base}" stroke="var(--border)" stroke-width="1"/></svg>`;
  return s;
}

// Builds the panel inside `host` once and returns the render function the page calls whenever a filter moves.
// `getScope()` must return { from, to, jobOk(job8) } — the page owns the filters, this owns the metric.
// #207 (Jerin, 8 Oct): THIS PANEL gets its own Quarter box, ticking more than one, opening on the two most
// recent. The page-wide Quarter dropdown only ever holds ONE, which is what locked From/To inside a single
// quarter - the thing that sent him looking. `opts.quarters` is every quarter on offer, newest last;
// `opts.onQuarters(qs)` lets the page re-bound its date inputs to whatever is ticked here. Nothing else on
// the tab is touched: the page hides its own Quarter chip while this sub-tab is open.
export function mountInterviewTraction(host, data, getScope, opts) {
  // #291c: the SAME name the Job dropdown shows, from the one lookup in job-filter.js - a role must not read
  // one way in the filter and another in the tooltip. An id with no entry keeps a readable fallback.
  const jobNames = jobLookup(data);
  const roleName = (j8) => (jobNames[String(j8).slice(0, 8)] || {}).title || `Unknown role (${String(j8).slice(0, 8)})`;
  if (!host) return () => {};
  const tr = data && data.interviewTraction;
  if (!tr || !tr.byJobRoundDay) {
    host.innerHTML = `<p class="sub-note" style="color:var(--orange)">Interview Traction has no data file yet.
      It is written by the stage-history job; the next run will fill this in.</p>`;
    return () => {};
  }
  const rounds = (tr.rounds || []).filter(r => PANEL_ROUNDS.includes(r));   // #289a
  const sel = new Set(DEFAULT_ROUNDS.filter(r => rounds.includes(r)));
  const allQ = (opts && opts.quarters) || [];
  const onQuarters = (opts && opts.onQuarters) || (() => {});
  const qSel = new Set(allQ.slice(-2));            // the two most recent, ticked to begin with
  const state = { view: 'day', hide: true };   // #230 (Jerin, 13 Oct 2026): opens on Day

  host.innerHTML = `
    <div class="it-controls">
      <!-- #230 (Jerin, 13 Oct 2026): shortest period first - Day, Week, Month - and the panel OPENS on Day.
           ⚠ Day view shows the LAST 30 DAYS of the period, not all of it (DAY_WINDOW), so the panel now
           opens on recent detail rather than the whole range. One module, so all three tabs move together. -->
      <div class="it-seg" role="group" aria-label="Group interviews by">
        <button type="button" class="active" data-view="day">Day view</button>
        <button type="button" data-view="week">Week view</button>
        <button type="button" data-view="month">Month view</button>
      </div>
      <div class="ms it-quarters"></div>
      <div class="ms it-rounds"></div>
      <label class="it-chk"><input type="checkbox" class="it-hide" checked> Hide rounds with no interviews</label>
      <div class="it-legend">${SERIES.map(s =>
        `<span${s.ahead ? ' class="it-ahead-key" hidden' : ''}><i style="background:${s.col}"></i>${s.key}</span>`
        ).join('')}<span class="it-trendkey">Trend</span></div>
    </div>
    <div class="it-charts"></div>
    ${defsBlock('interview-traction')}`;

  const seg = host.querySelector('.it-seg');
  const chartsEl = host.querySelector('.it-charts');
  const hideEl = host.querySelector('.it-hide');

  // The Quarter chip. Same shape as Rounds. Ticking one re-bounds the page's From/To through onQuarters,
  // THEN redraws - in that order, because the redraw reads the range the page has just been re-bounded to.
  const qHost = host.querySelector('.it-quarters');
  const pickedQ = () => allQ.filter(q => qSel.has(q));
  const paintQ = () => {
    const p = pickedQ();
    const b = qHost.querySelector('.ms-btn');
    b.textContent = p.length === 0 ? 'Quarter: none' : 'Quarter: ' + p.map(q => q.slice(5)).join(', ');
    b.title = p.join(', ');
  };
  if (allQ.length) {
    qHost.innerHTML = `<button type="button" class="ms-btn"></button>
      <div class="ms-panel" style="display:none"><div class="ms-list">${allQ.slice().reverse().map(q =>
        `<label class="ms-opt"><input type="checkbox" value="${esc(q)}"${qSel.has(q) ? ' checked' : ''}> ${esc(q)}</label>`
      ).join('')}</div></div>`;
    const qBtn = qHost.querySelector('.ms-btn'), qPanel = qHost.querySelector('.ms-panel');
    qBtn.addEventListener('click', e => {
      e.stopPropagation();
      const open = qPanel.style.display !== 'none';
      document.querySelectorAll('.ms-panel').forEach(x => { x.style.display = 'none'; });
      qPanel.style.display = open ? 'none' : 'block';
    });
    qPanel.addEventListener('click', e => e.stopPropagation());
    qHost.querySelectorAll('input[type=checkbox]').forEach(cb => cb.addEventListener('change', () => {
      if (cb.checked) qSel.add(cb.value); else qSel.delete(cb.value);
      paintQ();
      onQuarters(pickedQ());
      render();
    }));
    paintQ();
  } else {
    qHost.style.display = 'none';
  }

  // The Rounds chip. makeMultiSelect treats an empty selection as "All" and cannot be preset, so the six
  // defaults are ticked by hand after it is built, with rendering held off until the last one lands.
  let booting = true;
  const roundsHost = host.querySelector('.it-rounds');
  roundsHost.innerHTML = `<button type="button" class="ms-btn"></button>
    <div class="ms-panel" style="display:none"><div class="ms-list">${rounds.map(r =>
      `<label class="ms-opt"><input type="checkbox" value="${esc(r)}"${sel.has(r) ? ' checked' : ''}> ${esc(r)}</label>`
    ).join('')}</div></div>`;
  const rBtn = roundsHost.querySelector('.ms-btn'), rPanel = roundsHost.querySelector('.ms-panel');
  const paintRounds = () => {
    const t = sel.size === 0 ? 'Rounds: none' : (sel.size === rounds.length ? 'Rounds: All' : `Rounds: ${sel.size} selected`);
    rBtn.textContent = t; rBtn.title = t;
  };
  rBtn.addEventListener('click', e => {
    e.stopPropagation();
    const open = rPanel.style.display !== 'none';
    document.querySelectorAll('.ms-panel').forEach(p => { p.style.display = 'none'; });
    rPanel.style.display = open ? 'none' : 'block';
  });
  rPanel.addEventListener('click', e => e.stopPropagation());
  roundsHost.querySelectorAll('input[type=checkbox]').forEach(cb => cb.addEventListener('change', () => {
    if (cb.checked) sel.add(cb.value); else sel.delete(cb.value);
    paintRounds(); if (!booting) render();
  }));
  paintRounds();
  booting = false;
  // Open on the two most recent quarters, not the current one. This runs BEFORE the page's first render()
  // call, so the date inputs are already re-bounded by the time anything is drawn.
  if (allQ.length) onQuarters(pickedQ());

  seg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    state.view = b.dataset.view;
    seg.querySelectorAll('button').forEach(o => o.classList.toggle('active', o === b));
    render();
  }));
  hideEl.addEventListener('change', () => { state.hide = hideEl.checked; render(); });

  function render() {
    const raw = getScope() || {};
    if (!raw.from || !raw.to) { chartsEl.innerHTML = ''; return; }
    // #245 (Jerin, 20 Oct 2026, option A). The window used to stop dead at today, so interviews already in
    // the diary were drawn nowhere. It now runs to the FURTHEST BOOKING and no further — the same shape
    // Momentum has used since #232 — and those days draw in their own colour, so nothing lands in Awaiting
    // outcome that has not happened.
    // 🚨 THE OLD WARNING STILL HOLDS, and is why this is a horizon rather than a lifted clamp: picking Q4
    // ends the range on 31 December, and running to THAT would draw ten empty weeks of future.
    // 🔑 AND IT NEVER OVERRIDES HIS OWN To DATE. The limit is the EARLIER of what he asked for and the
    // furthest booking, so narrowing To still bites (Rule 13).
    const today = todayKey();
    const horizon = horizonOf(tr, raw);
    const limit = (horizon && horizon > today) ? horizon : today;
    // 🚨 SPREAD raw — do NOT rebuild this object field by field. It used to copy only from/to/jobOk, which
    // silently DROPPED #228a's byRecruiter and recOk: the Recruiter tab then read the role store and its
    // Recruiter chip moved no number at all, while the charts still looked perfectly reasonable.
    // Any new scope key must survive this clamp (Rule 13).
    const scope = { ...raw, to: raw.to > limit ? limit : raw.to };
    if (scope.from > scope.to) { chartsEl.innerHTML = ''; return; }
    const picked = rounds.filter(r => sel.has(r));
    if (!picked.length) {
      chartsEl.innerHTML = '<p class="it-empty">No rounds selected &mdash; pick at least one from Rounds.</p>';
      return;
    }
    // #245: the fifth key shows only when the window actually reaches past today. Shown always it would sit
    // there meaning nothing on every past quarter — a key for a colour the chart cannot draw.
    const aheadKey = host.querySelector('.it-ahead-key');
    if (aheadKey) aheadKey.hidden = !(scope.to > today);
    let html = gapNote(tr, picked, scope), hidden = 0;
    const blocks = picked.map(r => {
      // #289c: EACH CHART ENDS AT ITS OWN LAST BOOKING. Nothing is hidden - a round still draws every day it
      // has - but a round with nothing ahead now stops at today instead of following the furthest booking
      // anywhere on the panel. The panel-wide `scope` above still governs gapNote and the ahead key.
      const hz = horizonOf(tr, raw, r);
      const lim = (hz && hz > today) ? hz : today;
      const sc = { ...raw, to: raw.to > lim ? lim : raw.to };
      if (sc.from > sc.to) return { r, slots: [], tot: 0 };
      const jobMap = {};   // #291c: filled by the same traversal that builds the bars
      const slots = slotsFor(daysForRound(tr, r, sc, jobMap), state.view, sc, jobMap);
      let tot = 0;
      slots.forEach(s => { tot += slotSum(s.v); });
      return { r, slots, tot };
    });
    blocks.forEach(b => {
      if (b.tot === 0 && state.hide) { hidden++; return; }
      html += `<div class="it-round"><h4>${esc(b.r)}</h4>`;
      if (b.tot === 0) { html += '<p class="it-empty">No interviews booked in this period.</p></div>'; return; }
      // The select rate came off on 8 Oct with the trend line (#210). The same figure reads 38% here and
      // 22% on the Throughput tab, and a number two panels disagree about should not be stated as fact on
      // either of them. The bars still show the split; nothing is hidden, it is just not asserted as a rate.
      html += `<p class="it-meta">${b.tot} booked</p>`
            + `<div class="it-scroller">${chartSvg(b.slots, roleName)}</div></div>`;
    });
    if (hidden) html += `<p class="it-empty">${hidden} round${hidden === 1 ? '' : 's'} with no interviews in this period ${hidden === 1 ? 'is' : 'are'} hidden.</p>`;
    chartsEl.innerHTML = html;
    // #231b: a chart wider than its box opens on the OLDEST bars otherwise, which day view hits every time.
    chartsEl.querySelectorAll('.it-scroller').forEach(scrollToLatest);
  }
  return render;
}
