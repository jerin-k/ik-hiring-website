// #147 (Jerin, 19 Sep 2026 — option C+ of five, chosen from the mock-up). What stays at the top of a page.
//
// BEFORE: `.topbar` — the navy header plus the main tab strip — was the only frozen thing, 105px of it. The
// sub-tab band and the filter row scrolled away, so the controls you change constantly went out of reach
// while the title you never change stayed put. And a table's own heading row is `position:sticky; top:0`,
// where `top:0` means the VIEWPORT — so the heading slid UNDERNEATH the navy block and vanished at exactly
// the moment you needed it to name the column you were reading.
//
// THEN (#147 C+): the navy block scrolled away entirely and the SUB-TAB BAND + FILTER ROW froze in its place
// as one tinted block — 74px against the old 105px. The band took on the page's name and the Ask Ashby AI
// link so nothing was lost on the way past; that was the "+" in C+.
//
// NOW (#156, option A): the MAIN TAB STRIP is back in the frozen block. The brand line folds away on scroll,
// the white tab strip stays, and the band and filter row freeze under it — 117px. The band's page name has
// gone with the change, because the strip above it says the same thing. #156b took the Ask Ashby AI pill off
// the band too, at Jerin's word — it lives once, up top. See publish() for how the four heights work.
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

// #156: activePageName() went with `.sc-name`. The frozen tab strip names the page itself now, in white, so
// nothing has to copy it onto the band. (Rule 12 — a helper feeding nothing is the same bug as a class
// styling nothing.) If a page name is ever needed again, read `.nav-strip .nav-tab.active`.

// The filter row is the band's next sibling on every page that has one.
function filtersAfter(band) {
  const n = band.nextElementSibling;
  return n && FILTERS_RE.test(n.className || '') ? n : null;
}

// #156b (Jerin, 19 Sep 2026): "Why is there an 'Ask Ashby AI' on my sub tab pane? Didnt ask for it! Its ok
// being up-top alone!" The band's copy is gone. It only existed because #147 C+ let the whole navy block
// scroll away; he is content for the pill to live once, in the brand line, and to fold away with it.
// The original `askLink()` helper went with it — a builder nobody calls is Rule 12's other half.

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

// #156 (Jerin, 19 Sep 2026 — option A of three, chosen from the mock-up). The MAIN TAB STRIP stays frozen.
//
// The brand line folds away on scroll and the white tab strip is left at the top, with the band and filter
// row under it. Measured on the real page: 117px against C+'s 74. That 43px is one row of a 33px table out
// of 21 — he weighed it against a tab menu on the band (+0px) and a slimmed strip (+29px) and chose this.
//
// 🚨 THE STRIP CANNOT BE STICKY ON ITS OWN — the mistake the first mock-up shipped with, and Jerin caught it
// ("I think A & C are buggy"). A sticky element is released as soon as its own PARENT's box leaves the screen,
// and the strip lives inside .topbar; it held for 43px, then rode away leaving a see-through gap above the
// band. `.topbar` is the sticky element instead, pulled up by exactly the brand line's height.
//
// 🚨 EVERY ONE OF THESE FOUR FIGURES IS MEASURED. The brand line's height genuinely changes — it WRAPS at a
// narrow width, which is what broke the hard-coded `top: 53px` on 31 Aug. Do not turn any of them into a
// constant, and do not read them off a design mock: the site renders at 90%, so 1rem is 14.4px, not 16.
function publish(band, filters) {
  const root = document.documentElement;
  const header = document.querySelector('.header');
  const nav = document.querySelector('.nav-strip');
  const h = header ? Math.round(header.getBoundingClientRect().height) : 0;
  const n = nav ? Math.round(nav.getBoundingClientRect().height) : 0;
  const b = band ? Math.round(band.getBoundingClientRect().height) : 0;
  const f = filters ? Math.round(filters.getBoundingClientRect().height) : 0;
  root.style.setProperty('--sc-fold', (-h) + 'px');   // .topbar's sticky top — the line folds out of sight
  root.style.setProperty('--sc-nav', n + 'px');       // where the band starts
  root.style.setProperty('--sc-band', (n + b) + 'px');            // where the filter row starts
  root.style.setProperty('--sc-frozen', (n + b + f) + 'px');      // where everything below the block starts
}

// Re-measure whenever any piece of the block changes shape. The band and filter row change for the reasons
// they always did — the DOJ boxes appear on one sub-tab (#133), the rows wrap at narrow widths, a band wraps
// once its page has enough sub-tabs. #156 adds the two that matter most: the BRAND LINE wraps at a narrow
// width (the fold distance is wrong the instant it does) and the TAB STRIP wraps once there are enough tabs.
// Watched on every page, including the ones with no band at all.
// 🚨 The window's own resize event is wired TOO, not just as an old-browser fallback. A ResizeObserver only
// fires as part of the browser's rendering work, which a background tab does not do — the same trap that made
// #155 use the scroll event instead of requestAnimationFrame. Since the one thing that wraps the brand line
// IS a window resize, listening for it directly covers the real case without depending on rendering running.
// The observer still earns its place for content-driven changes: the DOJ boxes appearing on a sub-tab (#133),
// a filter row growing, a band wrapping once its page has enough sub-tabs.
let chromeResize = null;

function observeChrome(band, filters) {
  const header = document.querySelector('.header');
  const nav = document.querySelector('.nav-strip');
  const remeasure = () => publish(band, filters);

  // one listener, not one per render — mountStickyChrome runs again on every page change
  if (chromeResize) window.removeEventListener('resize', chromeResize);
  chromeResize = remeasure;
  window.addEventListener('resize', chromeResize);

  if (typeof ResizeObserver === 'function') {
    observer = new ResizeObserver(remeasure);
    if (header) observer.observe(header);
    if (nav) observer.observe(nav);
    if (band) observer.observe(band);
    if (filters) observer.observe(filters);
  }
}

// Call after every page render. Safe to call on a page with no sub-tab band (Overview) — since #156 the tab
// strip is frozen there too, so the figures are published with the strip alone.
export function mountStickyChrome() {
  if (observer) { observer.disconnect(); observer = null; }

  const content = document.getElementById('page-content');
  const band = content && content.querySelector(BAND_SEL);
  if (!band) {
    // Overview has no sub-tab band, but since #156 the tab strip is frozen on EVERY page — so the figures are
    // still published (strip only), and a heading on this page parks under the strip rather than at the top
    // of the window. `publish` reads the header and nav itself, so it needs nothing from here.
    publish(null, null);
    observeChrome(null, null);
    pinGroupHeadings(content);
    wireHold();
    holdTableChrome();
    return;
  }
  const filters = filtersAfter(band);

  band.classList.add('sc-stick-band');
  if (filters) filters.classList.add('sc-stick-filters');

  // #156: the page's name is NOT put on the band any more — the frozen tab strip above says it. A band built
  // by an older render could still carry one, so take it out rather than leave a duplicate on screen.
  const stale = band.querySelector('.sc-name');
  if (stale) stale.remove();

  // #156b: no Ask Ashby AI pill on the band either — it lives once, in the brand line. Clear a stale one the
  // same way as the page name, so a band built by an older render cannot leave one behind.
  const staleAsk = band.querySelector('.sc-ask');
  if (staleAsk) staleAsk.remove();

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
  observeChrome(band, filters);
  pinGroupHeadings(content);   // #154: the second heading row starts where the first one ends
  wireHold();                  // #155: the page scrolls; the headings are held under the frozen block
  holdTableChrome();
}
