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
  // #120b: the pipeline keys panelist rows by JOB, and two jobs can share a title. Every page shows one row per
  // department + job title + panelist, so same-title rows are merged here; the per-job rows stay on panelistRows,
  // which is what a department scope narrows.
  dashboardData.panelistRows = dashboardData.panelists || [];
  dashboardData.panelists = mergePanelists(dashboardData.panelistRows);
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

// One row per department + job title + panelist. A key held by a single row keeps that exact row object, so data that
// was already one row per title comes back unchanged. Turnaround re-averages from the summed hours when rows merge.
export function mergePanelists(rows) {
  const byKey = new Map();
  rows.forEach(p => {
    const k = [p.dept, p.jobTitle, p.userId || p.name].join('|');
    const list = byKey.get(k);
    if (list) list.push(p); else byKey.set(k, [p]);
  });
  const addMap = (into, from) => Object.keys(from || {}).forEach(x => { into[x] = (into[x] || 0) + from[x]; });
  return [...byKey.values()].map(list => {
    if (list.length === 1) return list[0];
    const m = { ...list[0], jobId8: null, jobIds8: list.map(p => p.jobId8).filter(Boolean),
      interviews: 0, feedbackSubmitted: 0, feedbackOnScheduled: 0, pendingFeedback: 0, turnN: 0, turnSumHrs: 0, byQuarter: {}, byMonth: {} };
    list.forEach(p => {
      ['interviews', 'feedbackSubmitted', 'feedbackOnScheduled', 'pendingFeedback', 'turnN', 'turnSumHrs'].forEach(f => { m[f] += p[f] || 0; });
      addMap(m.byQuarter, p.byQuarter); addMap(m.byMonth, p.byMonth);
    });
    m.avgTurnaroundHrs = m.turnN ? Math.round(m.turnSumHrs / m.turnN * 10) / 10 : null;
    return m;
  });
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
