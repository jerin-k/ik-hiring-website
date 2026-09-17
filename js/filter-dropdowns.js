// ===== Filter dropdowns open in full, on top (Jerin, 17 Sep 2026) =====
// Jerin: "Filters are not working in certain place; its flowing into the pane." Measured 17 Sep: 59 of the 63 multi-select
// dropdowns on Hiring Manager · Recruiter Efficiency · Overall Efficiency opened CUT OFF, hidden under the panel below.
//
// 🔑 Cause: since 31 Aug (498af0c) the filter rows scroll sideways (`overflow-x: auto`) so they stay on one line and match the
// sub-tab band's height. A box that scrolls on one axis clips on BOTH, so every panel hanging below the 40px row was cut at the
// row's bottom edge. The 4 that worked were the ones outside those rows.
// A second fault underneath: each page opens its panel with `display: block`, which drops the stylesheet's column layout
// (search box fixed, list scrolls) — so a long list was simply cut at the panel's max-height with no way to reach the rest.
//
// The fix keeps the one-line, matched-height row: when a panel opens it is pinned to the WINDOW just under its button
// (position: fixed — no scrolling row can clip it), laid out as the stylesheet's column, kept inside the window, and it
// follows the button while the page or the row scrolls. The four page modules still build and toggle their own panels
// (makeMultiSelect); this file only decides where a panel sits. Wired once from app.js, like table-sort.js.
// 🚨 Positions come from getBoundingClientRect, which is real pixels — never pass them through uiPx (#140). Gaps are design
//    constants, so they do.

import { uiPx } from './ui-scale.js';

const ROWS = '.rec-filters, .eff-filters, .hm-filters, .iv-filters';

const panelOf = (ms) => ms && ms.querySelector(':scope > .ms-panel');
const isOpen = (panel) => !!panel && panel.style.display !== 'none' && getComputedStyle(panel).display !== 'none';

function place(ms) {
  const btn = ms.querySelector(':scope > .ms-btn'), panel = panelOf(ms);
  if (!btn || !panel) return;
  const row = ms.closest(ROWS);
  if (row && row.scrollTop) row.scrollTop = 0;          // an earlier focus may have scrolled the row down inside itself

  const r = btn.getBoundingClientRect();
  const gap = uiPx(4), margin = uiPx(8);
  panel.style.position = 'fixed';
  panel.style.zIndex = '30';                            // over the page's panels and charts; under the frozen header (40)
  panel.style.maxHeight = '';                           // let the stylesheet's max-height decide first

  if (!isOpen(panel)) {                                 // about to open: a first position, before it is shown and focused
    panel.style.top = Math.round(r.bottom + gap) + 'px';
    panel.style.left = Math.round(Math.max(margin, r.left)) + 'px';
    return;
  }

  // Open: the column layout the stylesheet intends — the search box stays, the list scrolls.
  if (panel.style.display !== 'flex') panel.style.display = 'flex';
  panel.style.flexDirection = 'column';

  const want = panel.offsetHeight;                      // already capped by the stylesheet's max-height
  const below = window.innerHeight - r.bottom - gap - margin;
  const above = r.top - gap - margin;
  let top;
  if (want <= below || below >= above) {                // open downwards whenever it fits, or when below is the roomier side
    top = r.bottom + gap;
    if (want > below) panel.style.maxHeight = Math.max(uiPx(120), below) + 'px';
  } else {                                              // flip above the button
    const h = Math.min(want, above);
    if (want > above) panel.style.maxHeight = Math.max(uiPx(120), above) + 'px';
    top = r.top - gap - h;
  }
  const w = panel.offsetWidth;
  const left = Math.min(r.left, window.innerWidth - w - margin);
  panel.style.top = Math.round(top) + 'px';
  panel.style.left = Math.round(Math.max(margin, left)) + 'px';
}

let wired = false;

export function initFilterDropdowns() {
  if (wired) return;
  wired = true;

  // CAPTURE phase: runs before the page's own button handler shows the panel and focuses its search box, so the panel is
  // already out of the row when it appears. The second pass sizes and flips it once the page has shown it: a 0ms timer, which
  // runs after the whole click has been handled. Not requestAnimationFrame — a tab that is not painting never runs it.
  document.addEventListener('click', (e) => {
    const btn = e.target && e.target.closest && e.target.closest('.ms-btn');
    const ms = btn && btn.closest('.ms');
    if (!ms) return;
    place(ms);
    setTimeout(() => { if (isOpen(panelOf(ms))) place(ms); }, 0);
  }, true);

  // Keep an open panel attached to its button. Capture catches the filter row's own sideways scroll as well as the page's.
  const follow = (e) => {
    document.querySelectorAll('.ms').forEach(ms => {
      const p = panelOf(ms);
      if (!isOpen(p) || (e && e.target && p.contains(e.target))) return;   // scrolling inside the list moves nothing
      place(ms);
    });
  };
  document.addEventListener('scroll', follow, true);
  window.addEventListener('resize', () => follow(null));
}
