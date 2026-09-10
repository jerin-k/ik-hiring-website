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

// ===== #11 — the recruiter / sourcer CREDIT SPLIT (Jerin, 7 Sep 2026) =====
// Confirmed rule. It keys off the ROLE'S DEPARTMENT, not the recruiter's pod — "SME India & SME US" means
// those two departments, and "Sales & Lateral" means EVERY OTHER department (Jerin was explicit).
//
//   SME - India / SME - US        Agency        -> SOURCER full, recruiter ZERO
//                                 Freelancer    -> half / half
//                                 Internal      -> half / half   (⚠ CHANGED 10 Sep 2026 — was 'earns nothing')
//                                 no sourcer    -> recruiter full
//   every other department        any sourcer   -> half / half
// ⚠ After the 10 Sep change the ONLY special case left is an AGENCY on an SME role. Freelancer and Internal
//   now behave identically everywhere, so the Agency|Freelancer|Internal toggle only changes the SCORE when
//   the value is Agency — it still changes who the HEAD goes to (hcTo), which is a separate thing.
//                                 no sourcer    -> recruiter full
//
// 🚨 It applies EVERYWHERE credit is counted — Goal, Joined, Joining Pending and Drop ("split is everywhere").
//    Splitting only some of them would make Achievement half-split and half-not, so Delta and Capacity
//    Utilisation would silently mix two credit rules inside one number.
// 🚨 The two halves ALWAYS sum to 1. Never discard the sourcer's share when the sourcer is external: that
//    shrinks the org total and breaks the reconciliation the "Others" pod exists to preserve.
// ⚠ Source (Agencies / Pre-identified / Employee Conversion) has NO effect on score. The 4 Sep source-based
//   rules are DEAD — do not reintroduce them. [[project_score-source-sourcer-rules]]
export const SME_DEPTS = { 'SME - India': 1, 'SME - US': 1 };

export function isSmeDept(dept) { return !!SME_DEPTS[dept]; }

// sourcerType: 'Agency' | 'Freelancer' | 'Internal' (from metric-config userTypeOf()).
// Returns { rec, src, hcTo } where rec + src === 1 and hcTo says who the HEAD belongs to.
//
// 🚨 HEADCOUNT IS NEVER SPLIT (Jerin, 7 Sep 2026). Score divides; the head goes to ONE party:
//     the AGENCY whenever the sourcer is an agency, otherwise the RECRUITER.
//   Why: headcount is people, and half a person reads as broken. More importantly it makes the agency's
//   own row the BILLING number — an agency that delivered 10 joiners reads 10, not 5 — which is the whole
//   reason agencies sit in the "Others" pod at all. Splitting the head would have quietly undermined that.
//   Exactly one party gets each head, so the totals still equal the real number of people.
// ⚠ Head and Score therefore DISAGREE inside a row on purpose: a Sales recruiter who placed ten people
//   through agencies reads Joined HC 0 with half the points, and the agency row carries the ten.
// ⚠ Apply hcTo to GOAL as well as to Joined/JP/Drop. If the head leaves the recruiter on delivery but their
//   Goal still counts it, every agency-sourced role shows a permanent shortfall in the HC column.
export function creditSplit(dept, sourcerName, sourcerType) {
  if (!sourcerName) return { rec: 1, src: 0, hcTo: 'rec' };
  const agency = sourcerType === 'Agency';
  const hcTo = agency ? 'src' : 'rec';
  // 🚨 CHANGED 10 Sep 2026 (Jerin): an INTERNAL sourcer now splits HALF/HALF in SME too — "internal person
  //   going in as the sourcer should also get 50%". The old rule gave an internal colleague nothing and let
  //   the recruiter keep the lot, which undercounted people who genuinely did the sourcing.
  //   ⚠ Only ONE special case survives: an AGENCY sourcing an SME role takes all of it, because there the
  //   sourcing IS the job. Everyone else — freelancer or internal — halves it, in every department.
  //   ⚠ Rule 6: the wording in definitions.js ('How credit is shared with a Sourcer') moves WITH this.
  if (isSmeDept(dept) && agency) return { rec: 0, src: 1, hcTo };       // agency does the sourcing: all of it
  return { rec: 0.5, src: 0.5, hcTo };                                  // freelancer or internal, any department
}
