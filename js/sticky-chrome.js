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

  publish(band, filters);

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
