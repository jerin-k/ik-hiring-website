// #147 (Jerin, 19 Sep 2026 — option C+ of five, chosen from the mock-up). What stays at the top of a page.
//
// BEFORE: `.topbar` — the navy header plus the main tab strip — was the only frozen thing, 105px of it. The
// sub-tab band and the filter row scrolled away, so the controls you change constantly went out of reach
// while the title you never change stayed put. And a table's own heading row is `position:sticky; top:0`,
// where `top:0` means the VIEWPORT — so the heading slid UNDERNEATH the navy block and vanished at exactly
// the moment you needed it to name the column you were reading.
//
// AFTER: the navy block scrolls away with the page, and the SUB-TAB BAND + FILTER ROW freeze in its place as
// one tinted block. Measured on the real page: 72px against the old 105px, so every filter stays reachable
// AND the page gives back 33px of screen. The band takes on the page's name at the left and the Ask Ashby AI
// link at the right, so nothing is lost when the navy block goes — that is the "+" in C+.
//
// Options A and B (freeze everything, with and without the title folding away) were measured at 130px in the
// mock-up against today's 66 there — which is Jerin's own ~136-against-~92 from 30–31 Aug, the reason he
// ruled the sticky sub-tab band out the first time. C+ is what got past that: it is cheaper than today.
//
// 🚨 THE FROZEN HEIGHT IS MEASURED, NEVER HARD-CODED. It is published as CSS variables that the stylesheet
// reads. A hard-coded `top:53px` is exactly what broke on 31 Aug when the header wrapped at a narrow width,
// and the heights here change legitimately: the DOJ boxes appear on one sub-tab (#133), the filter row wraps
// on a narrow window, and the band wraps once a page has enough sub-tabs.

const BAND_SEL = '.subtab-band';
const CTRL_SEL = '.tp-controls';   // #147c: the second control row, one per panel that has one
const FILTERS_RE = /(^|\s)[a-z]+-filters(\s|$)/;   // .hm-filters, .rec-filters, .eff-filters, .iv-filters…

let observer = null;

// One source of truth for the page's name: whatever the main tab strip says is active. If that is ever
// renamed, this follows it rather than drifting.
function activePageName() {
  const t = document.querySelector('.nav-strip .nav-tab.active');
  return t ? t.textContent.trim() : '';
}

// The filter row is the band's next sibling on every page that has one.
function filtersAfter(band) {
  const n = band.nextElementSibling;
  return n && FILTERS_RE.test(n.className || '') ? n : null;
}

// The Ask Ashby AI link lives in the navy header, which now scrolls away — so the frozen band carries its
// own copy. Href and title are read from the original so there is still only one place to change them.
function askLink() {
  const src = document.getElementById('askAshby');
  if (!src) return null;
  const a = document.createElement('a');
  a.className = 'sc-ask';
  a.id = 'scAskAshby';
  a.href = src.getAttribute('href');
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.title = src.getAttribute('title') || '';
  a.innerHTML = '<span aria-hidden="true">✦</span> Ask Ashby AI';
  return a;
}

// #147c (Jerin, 19 Sep 2026): "merge the second filter row into it". The Stages multi-select and Hide
// zero-pipeline live INSIDE the Throughput and Pipeline panels, so after #147a they scrolled away while the
// real filter row stayed frozen — two rows of controls behaving differently. They are now adopted into the
// frozen row, and only the active panel's pair is shown. Done here rather than in each page module because
// the sub-tab key (`data-tab`) and the panel key (`data-panel`) already match, so one rule covers both pages.
// ⚠ Runs AFTER each page's own init, so the multi-selects are already mounted; moving a node keeps its
// listeners, and `document.getElementById` still finds it in its new home.
function syncPanelControls(filters) {
  const content = document.getElementById('page-content');
  if (!content || !filters) return;
  let slot = filters.querySelector('.sc-slot');
  if (!slot) { slot = document.createElement('span'); slot.className = 'sc-slot'; filters.appendChild(slot); }

  content.querySelectorAll(CTRL_SEL).forEach((el) => {
    if (el.closest('.sc-slot')) return;                       // already adopted
    const panel = el.closest('[data-panel]');
    el.dataset.scPanel = panel ? (panel.dataset.panel || '') : '';
    slot.appendChild(el);
  });

  const active = content.querySelector('.subtab-chip.active');
  const key = active ? (active.dataset.tab || '') : '';
  slot.querySelectorAll(CTRL_SEL).forEach((el) => {
    el.classList.toggle('sc-hide', el.dataset.scPanel !== key);
  });
}

// #154 (Jerin, 19 Sep 2026 — "the row title filter freeze, its frozen wrong!"). The three Position Fulfilment
// tables have TWO heading rows: the measure groups (Goal · Joined · Drop · Delta) over their Heads/Score pairs.
// Every `th` on the site is `position: sticky; top: 0`, so once #147b gave each table a scroll box BOTH rows
// pinned to the same place and collapsed onto each other the moment you scrolled inside the table — the group
// names ended up drawn on top of the Heads/Score row, which is what Jerin photographed.
// The second row has to start where the first one ends, and 🚨 that height is MEASURED, never hard-coded — the
// same rule as the frozen block above. It genuinely changes: a group label like "Joined — prev qtr openings"
// wraps to two or three lines depending on the window, and `.wide-fulfil` caps its width so it wraps sooner.
let headObserver = null;

function measureGroupRow(thead) {
  const table = thead.parentElement;
  if (!table || thead.rows.length < 2) return;
  const h = Math.round(thead.rows[0].getBoundingClientRect().height);
  if (h > 0) table.style.setProperty('--grp-h', h + 'px');
}

export function pinGroupHeadings(root) {
  const content = root || document.getElementById('page-content');
  if (!content) return;
  if (headObserver) { headObserver.disconnect(); headObserver = null; }
  const heads = [...content.querySelectorAll('table > thead')].filter((t) => t.rows.length >= 2);
  heads.forEach(measureGroupRow);
  if (!heads.length || typeof ResizeObserver !== 'function') return;
  // Re-measure whenever a group row changes shape — a narrower window wraps its labels and makes it taller.
  headObserver = new ResizeObserver((entries) => {
    entries.forEach((e) => { const thead = e.target.parentElement; if (thead) measureGroupRow(thead); });
  });
  heads.forEach((t) => headObserver.observe(t.rows[0]));
}

// #155 (Jerin, 19 Sep 2026, after seeing option B as a full page — "this looks good actually").
//
// WHAT CHANGED: the tables no longer scroll inside their own box. They sit in the page, the PAGE scrolls, and
// the pointer can be anywhere to move down. Each table keeps its sideways scroll, because it has to: the
// Fulfilment tables are ~1,200px in a ~975px panel.
//
// 🚨 WHY THIS IS SCRIPT AND NOT CSS. A box that scrolls sideways is a scroll container in BOTH directions —
// a browser rule, not a setting — so a `position: sticky` heading inside it can only ever freeze against that
// box, never against the page. Measured 19 Sep: with the box's vertical scroll switched off the heading rode
// away 1:1 with the page (3953 ➡ 3553 ➡ 3153 over 400px steps). Holding it by hand is the only way to get a
// frozen heading AND a page that scrolls from anywhere.
//
// 🚨 IT RUNS OFF THE SCROLL EVENT, NOT requestAnimationFrame. rAF does not run in a background tab, so a
// heading held inside it only catches up when you look at the tab — which is the one thing a frozen heading
// must never do. (The same trap cost time twice on 19 Sep: here and in js/table-cols.js.)
//
// 🔑 It also fixes #154 by construction: the whole <thead> moves as ONE block, so a two-row heading can never
// collapse onto itself the way it did when each row was pinned separately.

// A held element's rect includes the translate we last gave it, so its untransformed position is read back
// from the rect minus that offset. Cheaper and steadier than clearing every transform to re-measure.
function baseTop(el) { return el.getBoundingClientRect().top - (el._holdY || 0); }

function setHold(el, y) {
  y = Math.max(0, Math.round(y));
  if (el._holdY === y) return;
  el._holdY = y;
  el.style.transform = y ? 'translateY(' + y + 'px)' : '';
}

function holdTable(table, top) {
  const head = table.tHead;
  const r = table.getBoundingClientRect();
  let headH = 0;
  if (head) {
    headH = head.getBoundingClientRect().height;
    // never past the end of its own table, or a heading drifts over whatever comes next
    setHold(head, Math.min(top - r.top, r.height - headH - 2));
  }
  // #149's month headings sit under the heading row, and travel only as far as their own group's last row.
  const months = table.querySelectorAll('tbody > tr.pt-m');
  if (!months.length) return;
  const bases = [];
  months.forEach((row) => bases.push(baseTop(row)));
  months.forEach((row, i) => {
    const next = i + 1 < bases.length ? bases[i + 1] : r.bottom;
    const h = row.getBoundingClientRect().height;
    setHold(row, Math.min(top + headH - bases[i], next - bases[i] - h));
  });
}

export function holdTableChrome() {
  const content = document.getElementById('page-content');
  if (!content) return;
  const top = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sc-frozen')) || 0);
  content.querySelectorAll('.scroll-table > table').forEach((t) => holdTable(t, top));
}

let holdWired = false;
function wireHold() {
  if (holdWired) return;
  holdWired = true;
  window.addEventListener('scroll', holdTableChrome, { passive: true });
  window.addEventListener('resize', holdTableChrome);
  // a filter or a sub-tab rebuilds a tbody, which changes every base position
  const content = document.getElementById('page-content');
  if (content && typeof MutationObserver === 'function') {
    new MutationObserver(() => holdTableChrome()).observe(content, { childList: true, subtree: true });
  }
}

function publish(band, filters) {
  const root = document.documentElement;
  const b = band ? Math.round(band.getBoundingClientRect().height) : 0;
  const f = filters ? Math.round(filters.getBoundingClientRect().height) : 0;
  root.style.setProperty('--sc-band', b + 'px');
  root.style.setProperty('--sc-frozen', (b + f) + 'px');
}

// Call after every page render. Safe to call on a page with no sub-tab band (Overview) — it simply clears
// the variables so table headings fall back to the top of the window, which is correct there.
export function mountStickyChrome() {
  if (observer) { observer.disconnect(); observer = null; }

  const content = document.getElementById('page-content');
  const band = content && content.querySelector(BAND_SEL);
  if (!band) {
    document.documentElement.style.setProperty('--sc-band', '0px');
    document.documentElement.style.setProperty('--sc-frozen', '0px');
    pinGroupHeadings(content);
    wireHold();
    holdTableChrome();
    return;
  }
  const filters = filtersAfter(band);

  band.classList.add('sc-stick-band');
  if (filters) filters.classList.add('sc-stick-filters');

  // the page's name, at the left of the band
  if (!band.querySelector('.sc-name')) {
    const name = document.createElement('span');
    name.className = 'sc-name';
    name.textContent = activePageName();
    band.insertBefore(name, band.firstChild);
  } else {
    band.querySelector('.sc-name').textContent = activePageName();
  }

  // …and the Ask Ashby AI link at the right
  if (!band.querySelector('.sc-ask')) {
    const a = askLink();
    if (a) band.appendChild(a);
  }

  syncPanelControls(filters);
  // The sub-tab is switched by a click that each page handles itself, so follow the same click rather than
  // asking every page module to call back. A tick later, so the page has swapped its panels first.
  if (!content.dataset.scWired) {
    content.dataset.scWired = '1';
    content.addEventListener('click', (e) => {
      if (!e.target.closest('.subtab-chip')) return;
      setTimeout(() => {
        const b = document.querySelector('#page-content ' + BAND_SEL);
        syncPanelControls(b && filtersAfter(b));
        pinGroupHeadings(content);   // #154: a panel's tables are only laid out once it is shown
        holdTableChrome();           // #155: and their headings need placing against the frozen block
      }, 0);
    });
  }

  publish(band, filters);
  pinGroupHeadings(content);   // #154: the second heading row starts where the first one ends
  wireHold();                  // #155: the page scrolls; the headings are held under the frozen block
  holdTableChrome();

  // Re-measure whenever either row changes shape: the DOJ boxes appear on one sub-tab, the rows wrap at
  // narrow widths, and a page's band wraps once it has enough sub-tabs.
  if (typeof ResizeObserver === 'function') {
    observer = new ResizeObserver(() => publish(band, filters));
    observer.observe(band);
    if (filters) observer.observe(filters);
  } else {
    window.addEventListener('resize', () => publish(band, filters));   // older browsers: good enough
  }
}
