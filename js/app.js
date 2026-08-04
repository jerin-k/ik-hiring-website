import { initAuth, getStoredUser, signOut, getCurrentUser } from './auth.js';
import { loadAccessConfig, getUserAccess, canAccessPage } from './access.js';
import { loadDashboardData, getFilteredData, getLastUpdated } from './data.js';
import { renderHome, initHomeFilters } from './pages/home.js';
import { renderHmReport, initHmFilters } from './pages/hm-report.js';
import { renderRecruiter, initRecruiterFilters } from './pages/recruiter.js';
import { renderEfficiency, initEfficiencyFilters } from './pages/efficiency.js';
import { renderSourcing, initSourcingChart } from './pages/sourcing.js';
import { renderInterviewer } from './pages/interviewer.js';
import { renderAdmin } from './pages/admin.js';
import { initTableSorting } from './table-sort.js';

let currentAccess = null;
let accessConfig = null;

const NAV_ITEMS = [
  { id: 'hm-report', icon: '📋', title: 'Hiring Manager Report', desc: 'Job openings, pipeline throughput, and fulfilment tracking' },
  { id: 'recruiter', icon: '📈', title: 'Recruiter Efficiency', desc: 'Recruiter activity, candidate velocity, and workload' },
  { id: 'efficiency', icon: '⚙️', title: 'Overall Efficiency', desc: 'Org-wide funnel, conversion rates, and offer-to-hire gap' },
  { id: 'sourcing', icon: '🔍', title: 'Sourcing Mix', desc: 'Source channel breakdown and effectiveness' },
  { id: 'interviewer', icon: '🎯', title: 'Interviewer Efficiency', desc: 'Feedback TAT and quality of hire metrics' },
  { id: 'admin', icon: '🛠️', title: 'Admin', desc: 'Manage user access and roles' },
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
  navigateTo('home');

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
    <div class="nav-strip-home active" data-nav="home" title="Home">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 10L10 3L17 10M5 8.5V16H8.5V12H11.5V16H15V8.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>
    <div class="nav-strip-cards">
      ${visible.map(n => `
        <div class="nav-strip-card" data-nav="${n.id}">
          <span class="nsc-icon">${n.icon}</span>
          <div>
            <div class="nsc-title">${n.title}</div>
            <div class="nsc-desc">${n.desc}</div>
          </div>
        </div>
      `).join('')}
    </div>
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

function navigateTo(page) {
  if (!canAccessPage(currentAccess, page)) {
    page = 'home';
  }

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
      break;
    case 'admin':
      content.innerHTML = renderAdmin(accessConfig);
      break;
  }
}
