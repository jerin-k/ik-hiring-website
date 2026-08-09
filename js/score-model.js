// ===== Role scoring engine (shared) =====
// A role's Score = Family + Level + Complexity → classification → tier → points.
// The Metric Configuration UI (admin.js) is the EDITOR; it persists per-quarter tier points + row→tier
// choices under localStorage 'ik_score_grid_q', and the Department→Family overrides under 'ik_dept_family'.
// This module reads those SAME keys so scores here always match what the Admin grid shows.
// Spec: memory project_recruiter-score-model + CLAUDE.md "Recruiter scoring model".

export const SCORE_TIERS = [['Vanilla', 6], ['Regular', 12], ['Semi-Niche', 15], ['Niche', 20], ['Super Niche', 40], ['Leadership', 60], ['Senior Leadership', 120]];

export const CLASSIFICATIONS = [
  ['India SME', 'India SME - Normal', 'Vanilla'], ['India SME', 'India SME - Complex', 'Regular'], ['India SME', 'India SME - Uber Complex', 'Semi-Niche'],
  ['US SME', 'US SME - Normal', 'Regular'], ['US SME', 'US SME - Complex', 'Semi-Niche'], ['US SME', 'US SME - Uber Complex', 'Niche'],
  ['PA', 'India PA Junior', 'Vanilla'], ['PA', 'India PA', 'Regular'], ['PA', 'US PA Junior', 'Vanilla'], ['PA', 'US PA', 'Semi-Niche'],
  ['NonTech', 'NonTech - Intern - Normal', 'Vanilla'], ['NonTech', 'NonTech - Intern - Complex', 'Regular'], ['NonTech', 'NonTech L1 to L3 - Normal', 'Semi-Niche'], ['NonTech', 'NonTech L1 to L3 - Complex', 'Niche'], ['NonTech', 'NonTech L4 to L6 - Normal', 'Niche'], ['NonTech', 'NonTech L4 to L6 - Complex', 'Super Niche'],
  ['Tech', 'Tech - Intern - Normal', 'Regular'], ['Tech', 'Tech - Intern - Complex', 'Semi-Niche'], ['Tech', 'Tech L1 to L3 - Normal', 'Niche'], ['Tech', 'Tech L1 to L3 - Complex', 'Super Niche'], ['Tech', 'Tech L4 to L6 - Normal', 'Super Niche'], ['Tech', 'Tech L4 to L6 - Complex', 'Leadership'],
  ['Leadership', 'L7 - L8', 'Leadership'], ['Leadership', 'L9 & above', 'Senior Leadership'],
];

export const FAMILY_OPTIONS = ['India SME', 'US SME', 'India PA', 'US PA', 'NonTech', 'Tech', 'Leadership', 'Exclude'];

export const DEPT_FAMILY_DEFAULT = [
  ['SME - India', 'India SME', ''], ['SME - US', 'US SME', ''], ['Engineering', 'Tech', 'Tech = Engineering only'],
  ['IT', 'NonTech', ''], ['Curriculum', 'NonTech', ''],
  ['Business - India', 'India PA', 'PA if title = Program Advisor, else NonTech'], ['US Business', 'US PA', 'PA if title = Program Advisor, else NonTech'],
  ['Marketing', 'NonTech', ''], ['Operations', 'NonTech', ''], ['Finance', 'NonTech', ''], ['Human Resource', 'NonTech', ''],
  ['Talent Acquisition', 'NonTech', ''], ['New Programs', 'NonTech', ''], ["Founder's Office", 'NonTech', ''], ['B2B', 'NonTech', ''], ['Test', 'Exclude', ''],
];

export const LEVEL_BANDS = [['Intern', 'L0'], ['Junior (PA/Sales only)', 'L1'], ['L1–L3', 'L1, L2, L3'], ['L4–L6', 'L4, L5, L6'], ['L7–L8', 'L7, L8'], ['L9 & above', 'L9–L12']];

const GRID_LS = 'ik_score_grid_q';   // { "2026-Q3": { tierPoints:{}, rowTier:{} } } — per quarter, copy-forward
const DEPT_FAM_LS = 'ik_dept_family';

export function defaultGrid() {
  const tierPoints = {}; SCORE_TIERS.forEach(([n, p]) => { tierPoints[n] = p; });
  const rowTier = {}; CLASSIFICATIONS.forEach(([, cls, tier]) => { rowTier[cls] = tier; });
  return { tierPoints, rowTier };
}
export function loadGridStore() { try { return JSON.parse(localStorage.getItem(GRID_LS) || '{}'); } catch (e) { return {}; } }
export function saveGridStore(o) { localStorage.setItem(GRID_LS, JSON.stringify(o)); }
function gridQRank(k) { const m = /^(\d{4})-Q([1-4])$/.exec(k || ''); return m ? parseInt(m[1], 10) * 10 + parseInt(m[2], 10) : 0; }
export function gridForQuarter(quarter) {
  const store = loadGridStore();
  if (store[quarter]) return store[quarter];
  const target = gridQRank(quarter); let best = null, br = -1;
  for (const k of Object.keys(store)) { const r = gridQRank(k); if (r <= target && r > br) { br = r; best = store[k]; } }
  return best ? JSON.parse(JSON.stringify(best)) : defaultGrid();
}
export function materialiseGrid(quarter) { const s = loadGridStore(); if (!s[quarter]) { s[quarter] = gridForQuarter(quarter); saveGridStore(s); } return s; }
export function setGridTier(quarter, cls, tier) { const s = materialiseGrid(quarter); s[quarter].rowTier[cls] = tier; saveGridStore(s); }
export function setGridPoints(quarter, tier, pts) { const s = materialiseGrid(quarter); s[quarter].tierPoints[tier] = pts; saveGridStore(s); }
export function loadDeptFamily() { try { return JSON.parse(localStorage.getItem(DEPT_FAM_LS) || '{}'); } catch (e) { return {}; } }
export function saveDeptFamily(o) { localStorage.setItem(DEPT_FAM_LS, JSON.stringify(o)); }
export function familyOf(dept) { const o = loadDeptFamily(); const d = DEPT_FAMILY_DEFAULT.find(x => x[0] === dept); return o[dept] || (d ? d[1] : ''); }

// ---- the engine ----
function levelNum(level) { const m = /L(\d+)/i.exec(String(level || '')); return m ? parseInt(m[1], 10) : null; }
function normComplexity(c) { c = String(c || '').toLowerCase(); if (c.indexOf('uber') >= 0) return 'Uber Complex'; if (c.indexOf('complex') >= 0) return 'Complex'; return 'Normal'; }

// Family for a specific role: Business depts resolve to PA only when the title is Program Advisor, else NonTech.
export function familyForJob(dept, title) {
  const fam = familyOf(dept);
  if ((fam === 'India PA' || fam === 'US PA') && !/program advisor/i.test(title || '')) return 'NonTech';
  return fam;
}

// (family, level, complexity, title) → classification string in the grid (or null = unscored).
export function classificationFor(family, level, complexity, title) {
  const ln = levelNum(level);
  const cx = normComplexity(complexity);
  if (ln != null && ln >= 9) return 'L9 & above';        // leadership override (any family)
  if (ln != null && ln >= 7) return 'L7 - L8';
  if (family === 'India SME') return 'India SME - ' + cx; // SME resolves by complexity (incl. NA level)
  if (family === 'US SME') return 'US SME - ' + cx;
  if (family === 'India PA' || family === 'US PA') {
    const geo = family === 'India PA' ? 'India' : 'US';
    return /junior/i.test(title || '') ? `${geo} PA Junior` : `${geo} PA`;   // Sr PA → regular
  }
  if (family === 'Tech' || family === 'NonTech') {
    if (ln == null) return null;                          // NA level → unscored for Tech/NonTech
    const band = ln === 0 ? 'Intern' : (ln <= 3 ? 'L1 to L3' : (ln <= 6 ? 'L4 to L6' : null));
    if (!band) return null;
    const cx2 = cx === 'Uber Complex' ? 'Complex' : cx;   // grid only has Normal/Complex here
    return band === 'Intern' ? `${family} - Intern - ${cx2}` : `${family} ${band} - ${cx2}`;
  }
  return null; // Exclude / unknown
}

export function pointsForClassification(cls, quarter) {
  if (!cls) return 0;
  const grid = gridForQuarter(quarter);
  const tier = grid.rowTier[cls];
  return tier ? (grid.tierPoints[tier] || 0) : 0;
}

// job = { department, title, level, complexity } → Score (points) for the given quarter.
export function scoreForRole(job, quarter) {
  if (!job) return 0;
  const fam = familyForJob(job.department, job.title);
  if (!fam || fam === 'Exclude') return 0;
  return pointsForClassification(classificationFor(fam, job.level, job.complexity, job.title), quarter);
}
