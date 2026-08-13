const LIVE_DATA_URL = 'https://raw.githubusercontent.com/jerin-k/ik-hiring-website/main/data/dashboard.json';
const LOCAL_DATA_URL = '/data/dashboard.json';
const LIVE_ROLLUPS_URL = 'https://raw.githubusercontent.com/jerin-k/ik-hiring-website/main/data/stage_rollups.json';
const LOCAL_ROLLUPS_URL = '/data/stage_rollups.json';

let dashboardData = null;

export async function loadDashboardData() {
  try {
    const res = await fetch(LIVE_DATA_URL);
    if (res.ok) dashboardData = await res.json();
  } catch (e) {
    console.warn('Live data fetch failed, using local fallback:', e.message);
  }
  if (!dashboardData) {
    const res = await fetch(LOCAL_DATA_URL + '?t=' + Date.now());
    dashboardData = await res.json();
  }
  // Stage-history rollups (true daily velocity + reached/cleared throughput). Best-effort — the UI
  // degrades gracefully to the snapshot approximation if this file isn't present yet.
  dashboardData.stageRollups = await loadStageRollups_();
  return dashboardData;
}

async function loadStageRollups_() {
  try { const r = await fetch(LIVE_ROLLUPS_URL); if (r.ok) return await r.json(); } catch (e) { /* optional */ }
  try { const r = await fetch(LOCAL_ROLLUPS_URL + '?t=' + Date.now()); if (r.ok) return await r.json(); } catch (e) { /* optional */ }
  return null;
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

  // (Recruiter-centric self-filtering removed 2026-08-13 — restricted recruiters are Department/Team scoped and
  // see all recruiter rows. dashboard.json keys recruiters by name, not email, so the old r.email filter was dead.)

  return filtered;
}

export function getLastUpdated() {
  return dashboardData?.lastUpdated || null;
}
