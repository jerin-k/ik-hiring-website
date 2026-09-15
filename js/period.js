// ===== The reporting period (#127, Jerin 15 Sep 2026) =====
// Nothing in Ashby before Q3 2026 was cleaned up, so no tab offers an earlier quarter and no period reaches back past it.
// A quarter joins the dropdowns on its first day — Q4 2026 on 1 Oct, 2027 on 1 Jan — because the list runs up to the quarter
// TODAY falls in, read from the viewer's own clock. Nothing here needs editing when a quarter turns.
export const REPORTING_START = '2026-Q3';

const rankOf = (k) => { const m = /^(\d{4})-Q([1-4])$/.exec(k || ''); return m ? +m[1] * 4 + (+m[2] - 1) : 0; };
const keyOf = (r) => `${Math.floor(r / 4)}-Q${(r % 4) + 1}`;
const pad = (n) => String(n).padStart(2, '0');

// Every quarter on offer, oldest first. `now` exists only so the turn of a quarter can be tested.
export function reportingQuarters(now = new Date()) {
  const cur = now.getFullYear() * 4 + Math.floor(now.getMonth() / 3);
  const out = [];
  for (let r = rankOf(REPORTING_START); r <= cur; r++) out.push(keyOf(r));
  return out.length ? out : [REPORTING_START];
}

// Years on offer, newest first.
export function reportingYears(now) {
  return [...new Set(reportingQuarters(now).map(k => k.slice(0, 4)))].reverse();
}

// The quarters a Year / Quarter selection covers. Year '' = every year on offer; Quarter '' = every quarter of it on offer.
export function selectionQuarters(year, quarter, now) {
  const all = reportingQuarters(now);
  if (quarter) return [`${year || all[all.length - 1].slice(0, 4)}-${quarter}`];
  return year ? all.filter(k => k.startsWith(year + '-')) : all;
}

// First and last day of a run of quarters (oldest first), as YYYY-MM-DD.
export function quarterSpan(qs) {
  const first = qs[0], last = qs[qs.length - 1];
  const q1 = +first.slice(6), y2 = +last.slice(0, 4), em = +last.slice(6) * 3;
  return { from: `${first.slice(0, 4)}-${pad((q1 - 1) * 3 + 1)}-01`, to: `${y2}-${pad(em)}-${pad(new Date(y2, em, 0).getDate())}` };
}

// Plain name for a period: "2026-Q3", "2026 — Q3 to Q4", or "2026-Q3 to 2027-Q1".
export function periodText(qs) {
  if (!qs || !qs.length) return '';
  if (qs.length === 1) return qs[0];
  const first = qs[0], last = qs[qs.length - 1];
  return first.slice(0, 4) === last.slice(0, 4) ? `${first.slice(0, 4)} — ${first.slice(5)} to ${last.slice(5)}` : `${first} to ${last}`;
}

// <option>s for a Year dropdown; withAll puts "All" first.
export function yearOptions(withAll) {
  return (withAll ? '<option value="">All</option>' : '') + reportingYears().map(y => `<option value="${y}">${y}</option>`).join('');
}

// Refills a Quarter dropdown with the quarters on offer for `year` ('' = none picked, so only "All" when withAll).
// Keeps the current choice while it is still on offer; otherwise falls back to All, or to the latest quarter when there is no All.
export function fillQuarterSelect(sel, year, withAll, now) {
  if (!sel) return;
  const keep = sel.value;
  const qs = year ? reportingQuarters(now).filter(k => k.startsWith(year + '-')).map(k => k.slice(5)) : [];
  sel.innerHTML = (withAll ? '<option value="">All</option>' : '') + qs.map(q => `<option value="${q}">${q}</option>`).join('');
  sel.value = qs.includes(keep) ? keep : (withAll ? '' : (qs[qs.length - 1] || ''));
}

// Puts a Year + Quarter pair on the quarter today falls in — so every tab opens on Q4 from 1 Oct without anyone touching it.
export function selectCurrentQuarter(yearSel, quarterSel, withAll, now = new Date()) {
  if (!yearSel || !quarterSel) return;
  const cur = reportingQuarters(now).slice(-1)[0];
  yearSel.value = cur.slice(0, 4);
  fillQuarterSelect(quarterSel, yearSel.value, withAll, now);
  quarterSel.value = cur.slice(5);
}

// Limits a From / To pair of date pickers to a period: the calendar greys out every other day. reset = also fill both boxes
// with the whole period (what choosing a Year / Quarter does).
export function setDateBounds(fromEl, toEl, qs, reset) {
  const { from, to } = quarterSpan(qs);
  [fromEl, toEl].forEach(el => { if (el) { el.min = from; el.max = to; } });
  if (reset) { if (fromEl) fromEl.value = from; if (toEl) toEl.value = to; }
}

// A date typed outside the limits, or a box cleared, snaps back to the nearest edge before the page reads it — a cleared box would
// otherwise mean "no limit". From never passes To. Listens in the capture phase so it runs before the page's own change handlers.
export function keepDatesInBounds(fromEl, toEl) {
  const fix = (el, other, isFrom) => () => {
    let v = el.value || (isFrom ? el.min : el.max);
    if (el.min && v < el.min) v = el.min;
    if (el.max && v > el.max) v = el.max;
    el.value = v;
    if (other && other.value && (isFrom ? v > other.value : v < other.value)) other.value = v;
  };
  if (fromEl) fromEl.addEventListener('change', fix(fromEl, toEl, true), true);
  if (toEl) toEl.addEventListener('change', fix(toEl, fromEl, false), true);
}

// ===== #129 (Jerin, 15 Sep 2026): the From / To boxes filter EVERY panel =====
// "If there is a filter applied, data needs to change as well." The pipeline keeps a DAY twin of every quarter store (openings, Goal,
// drops, interviews, R1, assessed, Time in Process), with day keys from `reportDayFloor` (dashboard.json) / `dayFloor`
// (stage_rollups.json) on — never earlier than REPORTING_START, so every range a page can offer is covered. A range is
// { from, to } as YYYY-MM-DD, both ends included, always inside the selected period.

// The range the From / To boxes describe, clamped to the period — an empty box means that edge of the period.
export function rangeOf(fromEl, toEl, qs) {
  const s = quarterSpan(qs);
  let from = (fromEl && fromEl.value) || s.from, to = (toEl && toEl.value) || s.to;
  if (from < s.from) from = s.from;
  if (to > s.to) to = s.to;
  if (from > to) from = to;
  return { from, to };
}

export const inRange = (day, r) => !!day && (!r || (day >= r.from && day <= r.to));

// Plain name for what is on screen: the period's own name when the range covers it, else the dates — "1 Aug – 31 Aug 2026".
const MON_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayText = (d, withYear) => `${+d.slice(8, 10)} ${MON_ABBR[+d.slice(5, 7) - 1]}${withYear ? ' ' + d.slice(0, 4) : ''}`;
export function rangeText(r, qs) {
  if (!r || coversQuarters(r, qs)) return periodText(qs);
  return `${dayText(r.from, r.from.slice(0, 4) !== r.to.slice(0, 4))} – ${dayText(r.to, true)}`;
}
export const quarterOfDay = (d) => (d && d.length >= 7) ? `${d.slice(0, 4)}-Q${Math.floor((+d.slice(5, 7) - 1) / 3) + 1}` : null;

// Does the range touch this quarter at all? A quarter counts when ANY of its days is inside — keeping only quarters whose FIRST day is
// inside (the old rule) dropped Q3 the moment From moved to 15 Aug.
export function rangeTouchesQuarter(q, r) {
  if (!r) return true;
  const s = quarterSpan([q]);
  return s.from <= r.to && s.to >= r.from;
}

// Does the range cover every day of these quarters? Then the day sums equal the quarter figures (#129 control 1).
export function coversQuarters(r, qs) {
  if (!r) return true;
  const s = quarterSpan(qs);
  return r.from <= s.from && r.to >= s.to;
}

// Whole days of quarter q, and of q inside the range. Capacity for part of a quarter is scaled by these (Jerin: 1A).
const dayNum = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86400000;
export function quarterDays(q) { const s = quarterSpan([q]); return dayNum(s.to) - dayNum(s.from) + 1; }
export function quarterDaysIn(q, r) {
  const s = quarterSpan([q]);
  if (!r) return quarterDays(q);
  const a = s.from > r.from ? s.from : r.from, b = s.to < r.to ? s.to : r.to;
  return b < a ? 0 : dayNum(b) - dayNum(a) + 1;
}

// {day: n} → n added up over the range.
export function sumDayCount(map, r) {
  let n = 0;
  for (const d in (map || {})) if (inRange(d, r)) n += map[d] || 0;
  return n;
}
// {day: {field: n}} → {field: n} added up over the range.
export function sumDayFields(map, r) {
  const out = {};
  for (const d in (map || {})) if (inRange(d, r)) { const v = map[d]; for (const f in v) out[f] = (out[f] || 0) + (v[f] || 0); }
  return out;
}

// Does this data file carry the day twins? A file from before 15 Sep does not — callers then keep the quarter figures for a range that
// covers whole quarters and show an empty cell + a note for anything narrower (Rule 4: never swap the time basis silently).
export const hasDayData = (data) => !!(data && data.reportDayFloor);
export const hasDayRollups = (rollups) => !!(rollups && rollups.dayFloor);
