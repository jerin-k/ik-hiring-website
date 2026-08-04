const LIVE_DATA_URL = 'https://raw.githubusercontent.com/jerin-k/ik-hiring-website/main/data/dashboard.json';
const LOCAL_DATA_URL = '/data/dashboard.json';

let dashboardData = null;

export async function loadDashboardData() {
  try {
    const res = await fetch(LIVE_DATA_URL);
    if (res.ok) {
      dashboardData = await res.json();
      return dashboardData;
    }
  } catch (e) {
    console.warn('Live data fetch failed, using local fallback:', e.message);
  }
  const res = await fetch(LOCAL_DATA_URL + '?t=' + Date.now());
  dashboardData = await res.json();
  return dashboardData;
}

export function getData() {
  return dashboardData;
}

export function getFilteredData(access) {
  if (!dashboardData) return null;
  if (!access.filters) return dashboardData;

  const filtered = { ...dashboardData };

  if (access.filters.departments) {
    filtered.openings = dashboardData.openings.filter(o =>
      access.filters.departments.includes(o.department)
    );
    filtered.jobs = dashboardData.jobs.filter(j =>
      access.filters.departments.includes(j.department)
    );
  }

  if (access.filters.teams) {
    filtered.openings = (filtered.openings || dashboardData.openings).filter(o =>
      access.filters.teams.includes(o.team)
    );
    filtered.jobs = (filtered.jobs || dashboardData.jobs).filter(j =>
      access.filters.teams.includes(j.team)
    );
  }

  if (access.filters.recruiterEmail) {
    filtered.recruiters = dashboardData.recruiters.filter(r =>
      r.email.toLowerCase() === access.filters.recruiterEmail.toLowerCase()
    );
  }

  return filtered;
}

export function getLastUpdated() {
  return dashboardData?.lastUpdated || null;
}
