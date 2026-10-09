// ===== #216 (Jerin, 9 Oct 2026): a truncated cell has to GIVE THE TEXT BACK on hover =====
// 🗣 "The hovering over opening isnt showing the full openinbg; in Joiner tab; please log a task"
//
// WHY THIS MODULE EXISTS, and why re-adding the `title` attribute was not the fix.
// #213 narrowed the Joiners list's Opening column on an explicit bargain: 156 of 164 names are cut off, and
// hovering gives the name back. `tdOpening` DID carry `title="<full name>"`, and measuring the shipped page
// proved every part of that chain was sound — all 156 truncated cells had the right title, the cell was the
// top element under the cursor, pointer-events was `auto`, no ancestor title competed, and the row did not
// re-render underneath the pointer. There was nothing left to repair in the markup.
// 🔑 THE DEVICE ITSELF WAS THE WRONG ONE. A native `title` tooltip waits about a second, is drawn by the
// browser outside the page, cannot be styled, cannot be read back from the DOM — so it can never be VERIFIED,
// only hoped for — and is easy to miss entirely. A column that hides data on the promise of a tooltip needs a
// tooltip that is certain, and this site already owns one: `.heat-tip` / `.sheat-tip` on the heat grids. This
// is that same device, pointed at table cells. [[feedback_ui-design-bar]]
//
// 🚨 IT ONLY TAKES OVER WHERE TEXT IS ACTUALLY CUT OFF. Several cells carry a `title` that is EXPLANATION
// rather than the cell's own text — `tdDoj` ("the joining date has passed and they are not moved to Hired
// yet"), `tdQuarter` ("An opening from Q2 2026, before Q3 2026"). Those are not truncated, so they are left
// to the browser exactly as they were. Hijacking them would have swapped a sentence for a word.
//
// 🚨 AND IT REMOVES THE `title` ONLY WHILE ITS OWN TIP IS UP, then puts it straight back. Two tooltips for one
// cell — mine at once, the browser's a second later, underneath it — looks broken. The attribute stays in the
// rendered HTML, so with JavaScript off, or if this module ever fails to load, the old native hover is still
// there and no information is lost. [[feedback_assert-what-you-remove]]
import { uiPx } from './ui-scale.js';

// Scoped to the people lists (`table.pl-list`) — Joiners and Joining Pipeline on all three tabs. That is the
// whole surface where a column was deliberately narrowed, and keeping the scope tight means no other table on
// the site changes behaviour.
const SCOPE = 'table.pl-list';
const CELL = 'td[title], th[title]';

let tip = null;       // the one tip element, made on first use
let armed = null;     // { cell, title } — the cell whose title is currently lent to us, so it can be given back

function tipEl() {
  if (tip) return tip;
  tip = document.createElement('div');
  tip.className = 'cell-tip';
  tip.setAttribute('aria-hidden', 'true');
  document.body.appendChild(tip);
  return tip;
}

// Is this cell's text actually cut off? The overflow may be on the cell or on an inline wrapper inside it
// (`.pl-rec` carries its own ellipsis, for one), so both are asked. One pixel of slack absorbs sub-pixel
// rounding at the 90% root font size (#140), which otherwise reports a perfectly fitting cell as truncated.
function isCut(cell) {
  if (cell.scrollWidth > cell.clientWidth + 1) return true;
  for (const kid of cell.children) if (kid.scrollWidth > kid.clientWidth + 1) return true;
  return false;
}

function hide() {
  if (armed) { armed.cell.setAttribute('title', armed.title); armed = null; }   // always give the title back
  if (tip) tip.style.display = 'none';
}

function show(cell, text) {
  const el = tipEl();
  el.textContent = text;                 // textContent, never innerHTML: an opening name is data, not markup
  el.style.display = 'block';
  el.style.left = '0px';                 // measure unclamped, then place
  el.style.top = '0px';
  const cb = cell.getBoundingClientRect();
  const gap = uiPx(8), tw = el.offsetWidth, th = el.offsetHeight;
  // Horizontally centred on the cell, then kept inside the window — a tip on the last column of a wide table
  // would otherwise hang off the right edge, which is the very thing #217 is clearing up.
  let left = cb.left + cb.width / 2 - tw / 2;
  left = Math.max(gap, Math.min(left, document.documentElement.clientWidth - tw - gap));
  // Above the cell by preference, below it when the row is near the top of the window. The sticky chrome
  // (#147) owns the top of the page, so `cb.top - th - gap` is measured against its bottom edge, not 0.
  const chrome = document.querySelector('.topbar');
  const ceiling = (chrome ? chrome.getBoundingClientRect().bottom : 0) + gap;
  const above = cb.top - th - gap;
  const top = above >= ceiling ? above : cb.bottom + gap;
  el.style.left = Math.round(left + window.scrollX) + 'px';
  el.style.top = Math.round(top + window.scrollY) + 'px';
}

function onOver(e) {
  const cell = e.target.closest ? e.target.closest(CELL) : null;
  // Moving within the same cell (over an inner span) must not flicker the tip off and on again.
  if (cell && armed && cell === armed.cell) return;
  hide();
  if (!cell || !cell.closest(SCOPE) || !isCut(cell)) return;
  const text = cell.getAttribute('title');
  if (!text) return;
  armed = { cell, title: text };
  cell.removeAttribute('title');
  show(cell, text);
}

// 🚨 Installed ONCE on the document, not per table. Every people list is rebuilt with `body.innerHTML = …` on
// first render and again on every filter change, from far too many call sites to hook one by one — the same
// reason js/table-cols.js watches the page instead of being called. A delegated listener cannot be lost to a
// rebuild, because it is not attached to anything that gets rebuilt.
export function initCellTips(root) {
  const host = root || document;
  host.addEventListener('mouseover', onOver, true);
  host.addEventListener('mouseout', (e) => {
    if (!armed) return;
    const to = e.relatedTarget;
    if (!to || !to.closest || to.closest(CELL) !== armed.cell) hide();
  }, true);
  // A tip is placed in page coordinates, so it has to go the moment the page moves under it, and it must never
  // be left hanging over a panel the reader has just navigated away from.
  window.addEventListener('scroll', hide, true);
  window.addEventListener('resize', hide);
  host.addEventListener('click', hide, true);
  window.addEventListener('hashchange', hide);
}
