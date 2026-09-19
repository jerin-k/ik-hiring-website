// #149 (Jerin, 19 Sep 2026 — option A of three). The people lists as a tree: Joining Month ➡ Joining Date ➡
// the people, with a count on both group rows.
//
// BEFORE: one flat list — 45 rows on Joining Pending, 138 on Joiners — with Month and DOJ repeated on every
// single row and Opening Quarter taking the FIRST column. Nothing told you where one month ended and the next
// began, so forty rows down you were reading names with no idea which week they belonged to.
//
// AFTER: month and date become headings that carry their own counts, so they come off the person rows
// entirely; Opening Quarter moves to the far right. ⚠ The tree ADDS rows, because the group headings are rows
// too. That is the trade Jerin took: more scrolling, in exchange for always knowing where you are. Option C
// (months closed by default) was the alternative and was not chosen.
//
// #149a (Jerin, seeing it live the same day): *"dont like the yellow"*. Measured cause — SIX of the eight
// month headings were amber (five overdue months plus Date not set), so the colour read as decoration rather
// than attention, and it was doing two different jobs at once: "overdue" is a problem, "no date recorded" is
// missing information. He chose option D: the past months FOLD into one Overdue group, and the wash is gone
// in favour of a thin left edge (see .pt-overdue / .pt-nodate in style.css).
//
// 🚨 THE MONTH HEADING IS A STICKY <tr>, NOT A STICKY SPAN. A sticky span inside a table cell can only travel
// the height of its own row, so the first attempt at pinning did nothing at all. And its `top` is MEASURED
// from the column header rather than written down — see pinMonthHeadings below.
//
// 🔑 This only works because of 147b: tables now scroll inside their own box, so a group heading has
// something to stick inside. Before today there was no scroll container and nothing could pin.

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const isDay = (s) => /^\d{4}-\d{2}-\d{2}/.test(s || '');
const utcDay = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const todayUtc = () => { const n = new Date(); return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()); };

const monthLabel = (ym) => `${MON[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`;
const countTag = (n) => `<span class="pt-count">${n}</span>`;

// The date heading carries the same context the DOJ cell used to: the weekday, and on a live list how far
// away it is — which is the whole reason a joining date is worth reading.
function dateLabel(day, live) {
  const d = new Date(utcDay(day));
  const shown = `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  if (!live) return `${shown}<span class="pt-sub">${WD[d.getUTCDay()]}</span>`;
  const diff = Math.round((utcDay(day) - todayUtc()) / 864e5);
  const when = diff < 0 ? `Passed · ${-diff} day${diff === -1 ? '' : 's'} ago`
    : diff === 0 ? 'Today'
      : diff === 1 ? 'Tomorrow'
        : diff <= 13 ? `In ${diff} days` : `In ${Math.round(diff / 7)} weeks`;
  return `${shown}<span class="pt-sub${diff < 0 ? ' pt-late' : ''}">${WD[d.getUTCDay()]} · ${when}</span>`;
}

// items -> "Offer accepted 12 · Offer sent 8", in the order the stages actually happen.
const STAGE_ORDER = ['Ref Check', 'Documentation', 'Offer Created', 'Offer Sent', 'Offer Accepted'];
export function stageSplit(items, stageOf) {
  const n = {};
  items.forEach((i) => { const s = stageOf(i) || '—'; n[s] = (n[s] || 0) + 1; });
  const keys = Object.keys(n).sort((a, b) => {
    const ia = STAGE_ORDER.indexOf(a), ib = STAGE_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  return keys.map((k) => `${k} ${n[k]}`).join(' · ');
}

/**
 * Build the rows. Returns one HTML string of <tr>s.
 *   dayOf(item)  -> 'YYYY-MM-DD' or falsy (falsy people land in "Date not set", never dropped — #26's rule:
 *                   everyone in the list must land somewhere or it stops reconciling)
 *   nameOf(item) -> the person's name, shown in the tree column
 *   cells(item)  -> the <td>s AFTER the name column
 *   cols         -> total columns, for the group rows' colspan
 *   order        -> 'soonest' (Joining Pending looks forward) | 'newest' (Joiners looks back)
 *   split(items) -> optional text for the month row
 *   live         -> true on Joining Pending: date headings say how far away they are, and every month wholly
 *                   in the past folds into ONE "Overdue" group at the top (#149a). False on Joiners, where a
 *                   past joining date is just the past.
 */
export function monthTreeRows(items, { dayOf, nameOf, cells, cols, order = 'soonest', split = null, live = false }) {
  const dated = [], undated = [];
  items.forEach((i) => (isDay(dayOf(i)) ? dated : undated).push(i));

  const byMonth = new Map();
  dated.forEach((i) => {
    const ym = dayOf(i).slice(0, 7);
    if (!byMonth.has(ym)) byMonth.set(ym, new Map());
    const days = byMonth.get(ym), d = dayOf(i).slice(0, 10);
    if (!days.has(d)) days.set(d, []);
    days.get(d).push(i);
  });

  const dir = order === 'newest' ? -1 : 1;
  const months = [...byMonth.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0) * dir);
  const today = todayUtc();
  let html = '';

  const personRow = (i) => `<tr class="pt-p"><td class="pt-name">${esc(nameOf(i) || '(no name)')}</td>${cells(i)}</tr>`;
  const sortDays = (ds) => ds.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0) * dir);
  const dateBlock = (day, people) =>
    `<tr class="pt-d"><td colspan="${cols}"><span class="pt-dname">${dateLabel(day, live)}</span>${countTag(people.length)}</td></tr>`
    + people.map(personRow).join('');

  // #149a option D (Jerin, 19 Sep, after seeing it live): every month wholly in the past folds into ONE
  // "Overdue" group instead of one heading each. On Joining Pending five of the seven dated months held a
  // SINGLE person and were all stale, so the list opened on five near-empty headings — eight headings became
  // four. It is one thing to chase, which is what they actually are. Joiners never folds: `live` is false
  // there and a past joining date is simply the past, not a problem.
  const lateMonths = [], currentMonths = [];
  months.forEach((ym) => {
    const latest = Math.max(...[...byMonth.get(ym).keys()].map(utcDay));
    (live && latest < today ? lateMonths : currentMonths).push(ym);
  });

  if (lateMonths.length) {
    const days = new Map();
    lateMonths.forEach((ym) => byMonth.get(ym).forEach((v, d) => days.set(d, (days.get(d) || []).concat(v))));
    const all = [...days.values()].flat();
    html += `<tr class="pt-m pt-overdue"><td colspan="${cols}">`
      + `<span class="pt-mname">Overdue</span>${countTag(all.length)}`
      + (split ? `<span class="pt-split">${esc(split(all))}</span>` : '')
      + '</td></tr>';
    sortDays([...days.keys()]).forEach((d) => { html += dateBlock(d, days.get(d)); });
  }

  currentMonths.forEach((ym) => {
    const days = byMonth.get(ym);
    const all = [...days.values()].flat();
    html += `<tr class="pt-m"><td colspan="${cols}">`
      + `<span class="pt-mname">${monthLabel(ym)}</span>${countTag(all.length)}`
      + (split ? `<span class="pt-split">${esc(split(all))}</span>` : '')
      + '</td></tr>';
    sortDays([...days.keys()]).forEach((d) => { html += dateBlock(d, days.get(d)); });
  });

  if (undated.length) {
    html += `<tr class="pt-m pt-nodate"><td colspan="${cols}">`
      + '<span class="pt-mname">Date not set</span>' + countTag(undated.length)
      + (split ? `<span class="pt-split">${esc(split(undated))}</span>` : '')
      + '</td></tr>';
    undated.forEach((i) => { html += personRow(i); });
  }
  return html;
}

// 🚨 The sticky month heading needs a `top`, and it must be the column header's MEASURED height — a written-in
// number breaks the moment a heading wraps, which is exactly what went wrong with the old `top:53px` on the
// page chrome (31 Aug). Call this after writing the rows.
export function pinMonthHeadings(tbody) {
  if (!tbody) return;
  const table = tbody.closest('table');
  const th = table && table.querySelector('thead th');
  const top = th ? Math.round(th.getBoundingClientRect().height) : 0;
  tbody.querySelectorAll('tr.pt-m').forEach((r) => { r.style.top = top + 'px'; });
}
