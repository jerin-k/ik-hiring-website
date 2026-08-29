import { initAuth, getStoredUser, signOut, getCurrentUser } from './auth.js';
import { loadAccessConfig, getUserAccess, canAccessPage } from './access.js';
import { loadDashboardData, getFilteredData, getLastUpdated } from './data.js';
import { loadMetricConfig } from './metric-config.js';
import { renderHome, initHomeFilters } from './pages/home.js';
import { renderHmReport, initHmFilters } from './pages/hm-report.js';
import { renderRecruiter, initRecruiterFilters } from './pages/recruiter.js';
import { renderEfficiency, initEfficiencyFilters } from './pages/efficiency.js';
import { renderSourcing, initSourcingChart } from './pages/sourcing.js';
import { renderInterviewer, initInterviewer } from './pages/interviewer.js';
import { renderAdmin, initAdminMetricConfig, initAdminAccess } from './pages/admin.js';
import { initTableSorting } from './table-sort.js';
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
  { id: 'interviewer', title: 'Interviewer Efficiency' },
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
        <p style="color:var(--muted);margin-top:8px;">You don't have access to this dashboard. Contact your admin.</p>
      </div>
    `;
    return;
  }

  buildNavStrip();
  setupSignout();
  setupRefreshButton();
  initTableSorting();
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

function setupRefreshButton() {
  const btn = document.getElementById('refreshBtn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    btn.disabled = true;
    btn.innerHTML = '<span class="spin">&#x21bb;</span> Refreshing...';
    fetch(WEBAPP_URL + '?action=refresh', { mode: 'no-cors' }).then(() => {
      btn.innerHTML = '&#x2713; Refresh scheduled';
      btn.style.color = 'var(--green)';
      btn.style.borderColor = 'var(--green)';
      setTimeout(() => {
        btn.disabled = false;
        btn.innerHTML = '&#x21bb; Refresh Data';
        btn.style.color = '';
        btn.style.borderColor = '';
      }, 5000);
    }).catch(() => {
      btn.innerHTML = '&#x2717; Failed';
      btn.style.color = 'var(--red)';
      setTimeout(() => {
        btn.disabled = false;
        btn.innerHTML = '&#x21bb; Refresh Data';
        btn.style.color = '';
        btn.style.borderColor = '';
      }, 3000);
    });
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
    case 'sourcing':
      content.innerHTML = renderSourcing(data);
      initSourcingChart(data);
      break;
    case 'interviewer':
      content.innerHTML = renderInterviewer(data);
      initInterviewer(data);
      break;
    case 'admin':
      content.innerHTML = renderAdmin(accessConfig, data);
      initAdminMetricConfig(data);
      initAdminAccess(accessConfig);
      break;
  }

  applySub(currentSub);
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
