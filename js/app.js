import './ui-scale.js';   // #140: first, so every chart is built by the scaled Chart
import { initAuth, getStoredUser, signOut, getCurrentUser } from './auth.js';
import { loadAccessConfig, getUserAccess, canAccessPage } from './access.js';
import { loadDashboardData, getFilteredData, getLastUpdated } from './data.js';
import { loadMetricConfig } from './metric-config.js';
import { renderHome, initHomeFilters } from './pages/home.js';
import { renderHmReport, initHmFilters } from './pages/hm-report.js';
import { renderRecruiter, initRecruiterFilters } from './pages/recruiter.js';
import { renderEfficiency, initEfficiencyFilters } from './pages/efficiency.js';
// The hidden Sourcing page was removed (#120, 14 Sep 2026): it counted applications, contradicting Sourcing Mix (joiners).
import { renderAdmin, initAdminMetricConfig, initAdminAccess } from './pages/admin.js';
import { initTableSorting } from './table-sort.js';
import { initFilterDropdowns } from './filter-dropdowns.js';   // 17 Sep: filter dropdowns open in full, never clipped by their row
import { mountStickyChrome } from './sticky-chrome.js';   // #147 C+: the sub-tab band + filter row are what freeze, not the navy block
import { watchColumnFamilies } from './table-cols.js';   // #151b: a column's family is declared on its heading and mirrored down the column
import { startBuildWatch } from './build-watch.js';   // #164: a tab left open runs old code and old numbers — it says so, and offers a reload
import { valueLabelsPlugin, stackTotalsPlugin } from './chart-datalabels.js';

// Register the global value-label plugin once (Chart is the UMD global from chart.umd.min.js). Every chart across
// every tab then shows data labels; individual charts can opt out via options.plugins.valueLabels = false.
if (window.Chart && !window.Chart.registry.plugins.get('valueLabels')) window.Chart.register(valueLabelsPlugin);
// Stacked bars hide their total; draw it at the end of every stack, on every tab, automatically.
if (window.Chart && !window.Chart.registry.plugins.get('stackTotals')) window.Chart.register(stackTotalsPlugin);

let currentAccess = null;
let accessConfig = null;

const NAV_ITEMS = [
  { id: 'hm-report', title: 'Hiring Manager' },
  { id: 'recruiter', title: 'Recruiter Efficiency' },
  { id: 'efficiency', title: 'Overall Efficiency' },
  { id: 'reqbot', title: 'Req Bot' },   // #112: Opening Requests, for the Recruitment Team and Admins (access.js)
  { id: 'admin', title: 'Admin' },
];

const DEV_MODE = location.hostname === 'localhost';

document.addEventListener('DOMContentLoaded', async () => {
  if (DEV_MODE) {
    await onAuthSuccess({ email: 'jerin@interviewkickstart.com', name: 'Jerin Kesavan' });
    return;
  }
  const storedUser = getStoredUser();
  if (storedUser) {
    await onAuthSuccess(storedUser);
  } else {
    showAuthScreen();
  }
});

function showAuthScreen() {
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('main-app').classList.add('hidden');
  initAuth(onAuthSuccess, onAuthFailure);
}

async function onAuthSuccess(user) {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('main-app').classList.remove('hidden');
  document.getElementById('user-email').textContent = user.email;

  accessConfig = await loadAccessConfig();
  await loadDashboardData();
  await loadMetricConfig();   // hydrate team-wide pods/capacity/score-grid/dept-family before tabs read them

  currentAccess = getUserAccess(user.email);

  if (currentAccess.role === 'none') {
    document.getElementById('nav-strip').innerHTML = '';
    document.getElementById('page-content').innerHTML = `
      <div class="card" style="text-align:center;padding:3rem;">
        <h2>Access Denied</h2>
        <p style="color:var(--muted);margin-top:0.5rem;">You don't have access to this dashboard. Contact your admin.</p>
      </div>
    `;
    return;
  }

  buildNavStrip();
  setupSignout();
  setupRefreshButton();
  initTableSorting();
  initFilterDropdowns();
  // #4 (2026-08-22): a refresh used to dump you back on Overview. The active tab now lives in the URL hash,
  // so reloading returns you to where you were, and back/forward work. Falls back to Overview when the hash is
  // empty or names a page this user cannot see (navigateTo re-checks access anyway).
  const opening = openingRoute();
  navigateTo(opening.page, opening.sub);

  const lastUpdated = getLastUpdated();
  if (lastUpdated) {
    document.getElementById('last-updated').textContent =
      'Data as of ' + new Date(lastUpdated).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
      });
  }

  // #164: from here on the page keeps asking whether the code and the numbers have moved on, and says so
  // rather than quietly showing yesterday's. Last, so a failure here can never stop the dashboard drawing.
  startBuildWatch();
}

function onAuthFailure(message) {
  const note = document.querySelector('.auth-note');
  note.textContent = message;
  note.style.color = 'var(--red)';
}

function buildNavStrip() {
  const strip = document.getElementById('nav-strip');
  const visible = NAV_ITEMS.filter(n => canAccessPage(currentAccess, n.id));

  strip.innerHTML = `
    <div class="nav-tab active" data-nav="home">Overview</div>
    ${visible.map(n => `<div class="nav-tab" data-nav="${n.id}">${n.title}</div>`).join('')}
  `;

  strip.addEventListener('click', (e) => {
    const target = e.target.closest('[data-nav]');
    if (target) navigateTo(target.dataset.nav);
  });
}

const WEBAPP_URL = 'https://script.google.com/a/macros/interviewkickstart.com/s/AKfycbxI6L89uE35GBRMNVRcjEHhvt6iWRTNO2J3C0JYn_hKdepYA80lCXe7TvFvriYb2XFHtQ/exec';

// #112 Req Bot (Jerin, 22 Sep 2026: "move 'Opening Request' as a tab before Admin. Call it 'Req Bot'"; it replaced the header
// button). The Opening Requests window lives in the Apps Script web app, because requests are private and this site is public,
// so the tab FRAMES it, as /requests does (web app V38 allows that; a frame is a real browsing context, so it carries the
// person's own Google sign-in — #144). Built ONCE and kept, hidden on the other tabs: the window takes a few seconds to start,
// and coming back to the tab should not start it again. A browser that will not share the sign-in with a frame (Safari) gets
// a button to open the same window in a new tab: the window posts {orReady} when it has drawn, and without it the button shows.
let reqBot = null;
function showReqBot(on) {
  if (!on) { if (reqBot) reqBot.hidden = true; return; }
  if (!reqBot) {
    const src = WEBAPP_URL + '?page=requests';
    reqBot = document.createElement('div');
    reqBot.className = 'reqbot';
    reqBot.innerHTML = `<iframe class="reqbot-frame" title="Req Bot: opening requests" allow="clipboard-write"></iframe>
      <div class="reqbot-fallback" hidden role="alert"><div>
        <h2>Req Bot</h2>
        <p>This browser would not open the requests window inside the dashboard. Open it in its own tab instead: it is the same window.</p>
        <a href="${src}" target="_blank" rel="noopener">Open Req Bot &#x2197;</a></div></div>`;
    document.getElementById('page-content').after(reqBot);
    let ready = false;
    window.addEventListener('message', (e) => {
      // the window runs on Google's own sandbox domains; accept its ready signal only from there
      if (!/^https:\/\/([a-z0-9-]+\.)*(googleusercontent\.com|google\.com)$/.test(e.origin)) return;
      if (e.data && e.data.orReady) { ready = true; reqBot.querySelector('.reqbot-fallback').hidden = true; }
      // the window asks who shows it: here it is the dashboard, so it drops its own title bar (Jerin, 22 Sep)
      if (e.data && (e.data.orHello || e.data.orReady) && e.source) e.source.postMessage({ orHost: 'dashboard' }, e.origin);
    });
    setTimeout(() => { if (!ready) reqBot.querySelector('.reqbot-fallback').hidden = false; }, 15000);
    reqBot.querySelector('iframe').src = src;
  }
  reqBot.hidden = false;
}

function setupRefreshButton() {
  const btn = document.getElementById('refreshBtn');
  if (!btn) return;
  // Admins only (Jerin, 2026-08-31). The button kicks off a full Ashby pull on the shared pipeline, so it
  // is not something every viewer should be able to fire. Removed from the DOM rather than disabled —
  // a greyed-out control invites people to ask why they cannot use it.
  if (!currentAccess || currentAccess.role !== 'admin') { btn.remove(); return; }
  // #144 (Jerin, 19 Sep 2026 — "fix it fully"). WHAT WAS WRONG, and why it looked fine for weeks:
  //
  //   fetch(WEBAPP_URL + '?action=refresh', { mode: 'no-cors' })
  //
  // Two faults in one line. `no-cors` makes the response OPAQUE — the promise resolves whatever comes back,
  // so a Google sign-in page, a 403 and a real run were indistinguishable and the button always said
  // "Refresh scheduled". And a cross-site fetch carries no Google session, so the request reached the web app
  // as nobody: Apps Script answered with the sign-in page and `doGet` never ran. Nothing had reached the
  // pipeline since at least 14 Sep, and the Executions log showed exactly that — no executions at all.
  //
  // 🚨 THE SAME TRAP IS WAITING FOR ANY FUTURE CALL TO THE WEB APP. It cannot be fixed with `credentials:
  // 'include'`: Google does not answer cross-site XHR for /exec at all. The only thing that carries the
  // signed-in session is a REAL BROWSING CONTEXT, which is why `js/access-config.js` opens a window for
  // Send invite and Publish rather than fetching. This now does the same.
  //
  // What the window shows is the web app's own answer — `{"status":"ok","message":"Refresh scheduled. Data
  // will update in 2-4 minutes."}` — so the person sees the truth from the pipeline itself rather than a
  // hopeful message from this page. This page deliberately claims NOTHING about whether the run succeeded:
  // it cannot read across origins, and pretending otherwise is the bug being fixed.
  btn.addEventListener('click', () => {
    const win = window.open(WEBAPP_URL + '?action=refresh', 'ikRefresh', 'width=560,height=300');
    if (!win) {
      // the honest failure: nothing was started, and the person needs to do something about it
      btn.innerHTML = '&#x2717; Allow pop-ups, then retry';
      btn.style.color = 'var(--red)';
      btn.style.borderColor = 'var(--red)';
      btn.title = 'The refresh runs in a small window so it carries your Google sign-in. Your browser blocked it.';
      setTimeout(() => {
        btn.innerHTML = '&#x21bb; Refresh';
        btn.style.color = '';
        btn.style.borderColor = '';
        btn.title = 'Trigger Ashby data refresh';
      }, 6000);
      return;
    }
    btn.disabled = true;
    btn.innerHTML = '&#x2197; Started in a new window';
    btn.title = 'The new window shows what the pipeline said. New numbers land here in 2-4 minutes, after a reload.';
    setTimeout(() => {
      btn.disabled = false;
      btn.innerHTML = '&#x21bb; Refresh';
      btn.title = 'Trigger Ashby data refresh';
    }, 8000);
  });
}

function setupSignout() {
  document.getElementById('signout-btn').addEventListener('click', signOut);
}

// The route is "page" or "page/sub-tab" — e.g. #recruiter/momentum. Reloading has to put you back exactly
// where you were, sub-tab included (Jerin, 2026-08-30: "can refresh of a page land in the same page?
// Today, it goes to the Home page; weird").
// 🔑 The hash alone was not enough. It is the primary record, but it is also the thing that goes missing —
// a link shared without it, a redirect, a browser restoring a bare URL — and when it is missing the app
// falls back to Overview, which is the behaviour being complained about. So the last route is ALSO written
// to localStorage and used whenever the hash is empty. The hash still wins when it is there, so a pasted
// link opens what it says.
const ROUTE_KEY = 'ik_last_route';

function parseRoute(str) {
  const raw = String(str || '').replace(/^#\/?/, '');
  if (!raw) return null;
  const [page, sub] = raw.split('/');
  return page ? { page, sub: sub || null } : null;
}

function routeFromHash() { return parseRoute(location.hash); }

function storedRoute() {
  try { return parseRoute(localStorage.getItem(ROUTE_KEY)); } catch (e) { return null; }
}

function rememberRoute() {
  try { localStorage.setItem(ROUTE_KEY, currentSub ? `${currentPage}/${currentSub}` : currentPage); } catch (e) { /* private window */ }
}

function openingRoute() {
  return routeFromHash() || storedRoute() || { page: 'home', sub: null };
}

// The sub-tab strips on each page. They all carry the active tab in a data attribute; these are the only
// two names in use.
const SUBTAB_SEL = '.rec-subtab, .eff-subtab, .hm-subtab, .adm-subtab';
const subKeyOf = (el) => el.dataset.tab || el.dataset.atab || null;

function applySub(sub) {
  currentSub = sub || null;
  if (!sub) return;
  const content = document.getElementById('page-content');
  if (!content) return;
  const btn = [...content.querySelectorAll(SUBTAB_SEL)].find(b => subKeyOf(b) === sub);
  // Click rather than set classes: each page owns what showing a tab means (which panel, which chart to
  // build). Skip it when that tab is already the active one, or the page would render itself twice.
  if (btn && !btn.classList.contains('active')) btn.click();
}

let currentPage = null;
let currentSub = null;

function navigateTo(page, sub) {
  if (!canAccessPage(currentAccess, page)) {
    page = 'home';
    sub = null;
  }
  currentPage = page;
  currentSub = sub || null;
  // Keep the URL in step. The hashchange listener below compares against currentPage, so this assignment
  // cannot bounce back into navigateTo and loop.
  const want = currentSub ? `${page}/${currentSub}` : page;
  if ((location.hash || '').replace(/^#\/?/, '') !== want) location.hash = want;
  rememberRoute();

  document.querySelectorAll('[data-nav]').forEach(el => {
    el.classList.toggle('active', el.dataset.nav === page);
  });

  const content = document.getElementById('page-content');
  const data = getFilteredData(currentAccess);
  showReqBot(page === 'reqbot');

  switch (page) {
    case 'home':
      content.innerHTML = renderHome(currentAccess);
      initHomeFilters();
      break;
    case 'hm-report':
      content.innerHTML = renderHmReport(data);
      initHmFilters(data);
      break;
    case 'recruiter':
      content.innerHTML = renderRecruiter(data);
      initRecruiterFilters(data);
      break;
    case 'efficiency':
      content.innerHTML = renderEfficiency(data);
      initEfficiencyFilters(data);
      break;
    case 'reqbot':
      content.innerHTML = '';   // the window sits beside #page-content, kept between visits (showReqBot)
      break;
    case 'admin':
      content.innerHTML = renderAdmin(accessConfig, data);
      initAdminMetricConfig(data);
      initAdminAccess(accessConfig, data);   // #120b: the department choices come from the data
      break;
  }

  mountStickyChrome();   // #147 C+: measure the frozen block and publish its height for the table headings
  startColumnFamilies();   // #151b: one width per family, carried from each heading down its column
  applySub(currentSub);
}

// #151b: ONE observer for the whole session, on #page-content — every page rebuilds its tables inside it, so a
// table is stamped with its column families whoever rendered it and whenever, including lazily drawn sub-tabs.
let columnFamiliesWatching = false;
function startColumnFamilies() {
  if (columnFamiliesWatching) return;
  const root = document.getElementById('page-content');
  if (!root) return;
  watchColumnFamilies(root);
  columnFamiliesWatching = true;
}

// Browser back/forward, and any hash typed by hand, route through the same entry point.
window.addEventListener('hashchange', () => {
  const r = routeFromHash() || { page: 'home', sub: null };
  if (r.page !== currentPage) navigateTo(r.page, r.sub);
  else if ((r.sub || null) !== currentSub) applySub(r.sub);
});

// Clicking a sub-tab writes it into the route, so a reload comes back to that panel and not to the page's
// default one. Delegated, because every page rebuilds its own strip on render.
document.addEventListener('click', (e) => {
  const btn = e.target.closest(SUBTAB_SEL);
  if (!btn || !document.getElementById('page-content').contains(btn)) return;
  const sub = subKeyOf(btn);
  if (!sub || sub === currentSub) return;
  currentSub = sub;
  location.hash = `${currentPage}/${sub}`;
  rememberRoute();
});
