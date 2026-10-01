// ===== Role scoring engine (shared) =====
// A role's Score = Family + Level + Complexity → classification → tier → points.
// The Metric Configuration UI (admin.js) is the EDITOR; it persists per-quarter tier points + row→tier
// choices under localStorage 'ik_score_grid_q', and the Department→Family overrides under 'ik_dept_family'.
// This module reads those SAME keys so scores here always match what the Admin grid shows.
// Spec: memory project_recruiter-score-model + CLAUDE.md "Recruiter scoring model".

// #199 (Jerin, 1 Oct 2026 — his revised score card, option A): NINE bands, named S1..S9, and the old tier NAMES
// (Vanilla · Regular · Semi-Niche · Niche · Super Niche · Leadership · Senior Leadership) are RETIRED. His card is
// the source of truth and people check the screen against it, so the screen uses his labels. S5 (30) and S8 (90) are new.
// 🚨 The band id IS the storage key (grid.tierPoints.S3, grid.rowTier[cls] === 'S3'), so a grid saved under the old
//    names cannot be read — see GRID_VERSION below, which is what retires it.
export const SCORE_TIERS = [['S1', 6], ['S2', 12], ['S3', 15], ['S4', 20], ['S5', 30], ['S6', 40], ['S7', 60], ['S8', 90], ['S9', 120]];

// 28 rows, read from the PDF Jerin sent on 1 Oct 2026 (the ticks are vector paths, not text — see the task memory).
export const CLASSIFICATIONS = [
  ['India SME', 'India SME - Normal', 'S1'], ['India SME', 'India SME - Complex', 'S2'], ['India SME', 'India SME - Uber Complex', 'S3'],
  ['US SME', 'US SME - Normal', 'S2'], ['US SME', 'US SME - Complex', 'S3'], ['US SME', 'US SME - Uber Complex', 'S4'],
  ['PA', 'India PA Junior', 'S1'], ['PA', 'Associate & Sr.Associate - Pre Sales', 'S2'], ['PA', 'India PA', 'S3'],
  ['PA', 'US PA Junior', 'S1'], ['PA', 'US PA', 'S3'],
  ['NonTech', 'NonTech - Intern - Normal', 'S1'], ['NonTech', 'NonTech - Intern - Complex', 'S2'],
  ['NonTech', 'NonTech L1 to L2 - Normal', 'S3'], ['NonTech', 'NonTech L1 to L2 - Complex', 'S4'],
  ['NonTech', 'NonTech L3 to L4 - Normal', 'S5'], ['NonTech', 'NonTech L3 to L4 - Complex', 'S6'],
  ['NonTech', 'NonTech L5 to L6 - Normal', 'S6'], ['NonTech', 'NonTech L5 to L6 - Complex', 'S7'],
  ['Tech', 'Tech - Intern - Normal', 'S3'], ['Tech', 'Tech - Intern - Complex', 'S4'],
  ['Tech', 'Tech L1 to L3 - Normal', 'S5'], ['Tech', 'Tech L1 to L3 - Complex', 'S6'],
  ['Tech', 'Tech L4 to L6 - Normal', 'S6'], ['Tech', 'Tech L4 to L6 - Complex', 'S7'],
  ['Leadership', 'L7 - L8 - Normal', 'S7'], ['Leadership', 'L7 - L8 - Complex', 'S8'], ['Leadership', 'L9 & above', 'S9'],
];

export const FAMILY_OPTIONS = ['India SME', 'US SME', 'India PA', 'US PA', 'NonTech', 'Tech', 'Leadership', 'Exclude'];

export const DEPT_FAMILY_DEFAULT = [
  ['SME - India', 'India SME', ''], ['SME - US', 'US SME', ''], ['Engineering', 'Tech', 'Tech = Engineering only'],
  ['IT', 'NonTech', ''], ['Curriculum', 'NonTech', ''],
  ['Business - India', 'India PA', 'PA if title = Program Advisor, else NonTech'], ['US Business', 'US PA', 'PA if title = Program Advisor, else NonTech'],
  ['Marketing', 'NonTech', ''], ['Operations', 'NonTech', ''], ['Finance', 'NonTech', ''], ['Human Resource', 'NonTech', ''],
  ['Talent Acquisition', 'NonTech', ''], ['New Programs', 'NonTech', ''], ["Founder's Office", 'NonTech', ''], ['B2B', 'NonTech', ''], ['Test', 'Exclude', ''],
];

// #199: Tech and NonTech no longer band levels the same way — NonTech is cut in three, Tech stays in two.
export const LEVEL_BANDS = [
  ['Intern', 'L0'], ['Junior (PA only)', 'L1'], ['Pre Sales (needs the title too)', 'L0, L1, L2'],
  ['NonTech L1–L2', 'L1, L2'], ['NonTech L3–L4', 'L3, L4'], ['NonTech L5–L6', 'L5, L6'],
  ['Tech L1–L3', 'L1, L2, L3'], ['Tech L4–L6', 'L4, L5, L6'],
  ['L7–L8 (splits by complexity)', 'L7, L8'], ['L9 & above', 'L9–L12'],
];

const GRID_LS = 'ik_score_grid_q';   // { "2026-Q3": { v, tierPoints:{}, rowTier:{} } } — per quarter, copy-forward
// 🚨 #199: BUMP THIS whenever the band ids or the classification row names change. A stored grid is keyed by BOTH
// (tierPoints.Vanilla, rowTier['NonTech L1 to L3 - Normal']), so one saved under the old card cannot be translated —
// it is simply not this grid any more. Any grid without the current version is IGNORED and the default rebuilt, which
// is what makes Jerin's new card take effect on Q3 without waiting for a publish.
// ✅ Nothing is lost by ignoring the old one: the published Q3 grid differed from the old code default in exactly ONE
//    row, India PA at 15, and the new card also puts India PA at 15. Measured on data/metric_config.json, 1 Oct 2026.
export const GRID_VERSION = 2;
const DEPT_FAM_LS = 'ik_dept_family';

export function defaultGrid() {
  const tierPoints = {}; SCORE_TIERS.forEach(([n, p]) => { tierPoints[n] = p; });
  const rowTier = {}; CLASSIFICATIONS.forEach(([, cls, tier]) => { rowTier[cls] = tier; });
  return { v: GRID_VERSION, tierPoints, rowTier };
}
// A stored grid counts only if it was written for THIS card.
function gridCurrent(g) { return !!g && g.v === GRID_VERSION; }
export function loadGridStore() { try { return JSON.parse(localStorage.getItem(GRID_LS) || '{}'); } catch (e) { return {}; } }
export function saveGridStore(o) { localStorage.setItem(GRID_LS, JSON.stringify(o)); }
function gridQRank(k) { const m = /^(\d{4})-Q([1-4])$/.exec(k || ''); return m ? parseInt(m[1], 10) * 10 + parseInt(m[2], 10) : 0; }
export function gridForQuarter(quarter) {
  const store = loadGridStore();
  if (gridCurrent(store[quarter])) return store[quarter];
  const target = gridQRank(quarter); let best = null, br = -1;
  for (const k of Object.keys(store)) {
    if (!gridCurrent(store[k])) continue;   // #199: never copy an old-card grid forward
    const r = gridQRank(k); if (r <= target && r > br) { br = r; best = store[k]; }
  }
  return best ? JSON.parse(JSON.stringify(best)) : defaultGrid();
}
export function materialiseGrid(quarter) { const s = loadGridStore(); if (!gridCurrent(s[quarter])) { s[quarter] = gridForQuarter(quarter); saveGridStore(s); } return s; }
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
  const cx2 = cx === 'Uber Complex' ? 'Complex' : cx;     // only the two SME families have an Uber row
  if (ln != null && ln >= 9) return 'L9 & above';         // leadership override (any family)
  if (ln != null && ln >= 7) return 'L7 - L8 - ' + cx2;   // #199: L7–L8 now splits by complexity (60 / 90)
  // #199 (Jerin, 1 Oct 2026): "'Pre Sales' or Pre-Sales in title with Level L0, L1, L2". BOTH halves are required,
  // and it is checked BEFORE family because a Pre Sales title is not Program Advisor, so the family would read
  // NonTech and the row could never be reached. "Associate & Sr.Associate" DESCRIBES L0–L2; it is not a second test.
  // ⚠ A Pre-Sales title at L3+ deliberately falls through to its department's normal family — confirm with Jerin.
  if (ln != null && ln <= 2 && /pre[\s-]?sales/i.test(title || '')) return 'Associate & Sr.Associate - Pre Sales';
  if (family === 'India SME') return 'India SME - ' + cx; // SME resolves by complexity (incl. NA level)
  if (family === 'US SME') return 'US SME - ' + cx;
  if (family === 'India PA' || family === 'US PA') {
    const geo = family === 'India PA' ? 'India' : 'US';
    return /junior/i.test(title || '') ? `${geo} PA Junior` : `${geo} PA`;   // Sr PA → regular
  }
  if (family === 'Tech' || family === 'NonTech') {
    if (ln == null) return null;                          // NA level → unscored for Tech/NonTech
    // 🚨 #199: the two families band levels DIFFERENTLY now. NonTech is cut in three, Tech stays in two.
    const band = ln === 0 ? 'Intern'
      : family === 'NonTech' ? (ln <= 2 ? 'L1 to L2' : (ln <= 4 ? 'L3 to L4' : (ln <= 6 ? 'L5 to L6' : null)))
      : (ln <= 3 ? 'L1 to L3' : (ln <= 6 ? 'L4 to L6' : null));
    if (!band) return null;
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

// ===== #108 — the recruiter / sourcer CREDIT RULE (Jerin, 13 Sep 2026 — replaces #11 of 7 Sep and #94 of 10 Sep) =====
// ONE rule, identical in every department and for every type (Agency · Freelancer · Internal), in either role:
//   no sourcer tagged    -> the recruiter takes the whole score
//   any sourcer tagged   -> recruiter HALF, sourcer HALF
// 🚨 This split applies to Joined, Joining Pending and Drop ONLY. The GOAL does not use it: the recruiter keeps the
//    FULL Goal and a sourcer earns no Goal points (goalOf in pages/recruiter.js). Jerin: "through recruiter they shud
//    be able to close more heads to land the score" — halving the Goal too cancelled that incentive out.
// 🚨 HEADCOUNT always goes to the RECRUITER (hcTo === 'rec'), so HC still adds up to the real number of people.
//    The sourcer's heads are not lost — they are counted separately and shown as a "+N sourced" second line.
// 🚨 The two halves still sum to 1, so no points are created or lost on Joined / Joining Pending / Drop.
// ⚠ DEAD — do not reintroduce: an agency taking the whole score on SME (#94) · the head moving to an agency (#11)
//   · the Goal being halved · the 4 Sep source-based rules. The Agency|Freelancer|Internal setting is now a LABEL
//   that moves no number. `dept` and `sourcerType` are still accepted so no caller has to change.
//   [[project_score-source-sourcer-rules]]
export const SME_DEPTS = { 'SME - India': 1, 'SME - US': 1 };

export function isSmeDept(dept) { return !!SME_DEPTS[dept]; }

// Returns { rec, src, hcTo } where rec + src === 1 and hcTo says who the HEAD belongs to — always the recruiter.
export function creditSplit(dept, sourcerName, sourcerType) {
  if (!sourcerName) return { rec: 1, src: 0, hcTo: 'rec' };
  return { rec: 0.5, src: 0.5, hcTo: 'rec' };
}
