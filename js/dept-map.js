// Authoritative Ashby Departments & Teams hierarchy.
// Source: Ashby → Admin → Organization Setup → Departments & Teams
// (app.ashbyhq.com/admin/organizational-settings/teams), captured 2026-08-05.
//
// The data pipeline (DataRefresh.gs) currently resolves each job's `departmentId`
// via /department.list and copies that single value into BOTH `department` and `team`.
// That value is the LEAF (team) node name — so this tree lets us recover the true
// parent department. The permanent fix is for the pipeline to read Ashby's department
// parent hierarchy and emit separate department/team fields; until then this map is the
// single source of truth for the frontend. Keep it in sync with Ashby.

export const DEPT_TREE = {
  'B2B': ['B2B Operations'],
  'Business - India': [
    'Business - India (Visual Design)', 'Business India (CRM)', 'Business India (Growth Analytics)',
    'Business India (Performance Marketing)', 'Business India (Pre-Sales)', 'Business India (Program Management)',
    'Business India (Revenue)', 'Business India (Sales Operations)', 'Business India (Sales)', 'Business India (Training)'
  ],
  'Curriculum': [],
  'Engineering': [
    'Machine Learning', 'Mobile Development', 'Product Management (Tech)',
    'Software Development', 'User Interface (UI) Design', 'WordPress'
  ],
  'Finance': ['Financial Planning & Analysis', 'General Finance Management'],
  "Founder's Office": ['Strategy & Program Management', 'TLs'],
  'Human Resource': ['Administration', 'HR Analytics', 'HR Operations', 'HRBP'],
  'IT': ['General Information Technology'],
  'Marketing': [
    'Brand', 'Content', 'CRM', 'Growth Analytics', 'Performance Marketing',
    'SEO', 'Social Media', 'Video Editing (Marketing)', 'Youtube'
  ],
  'New Programs': ['People Partnering', 'Product Management (Curriculum)'],
  'Operations': [
    'B2B Operations', 'Career Transformation', 'Community Management', 'Corporate Partnerships',
    'Customer Success Management', 'Delivery Operations', 'Operations Training',
    'Placement Partnerships', 'Projects Management', 'Video Editing (Operations)'
  ],
  'SME - India': [],
  'SME - US': [],
  'Talent Acquisition': ['Talent Acquisition (Delivery)', 'Talent Acquisition (Operations)'],
  'Test': [],
  'US Business': [
    'US Business (Growth)', 'US Business (Product Development)', 'US Business (Quality and Audits)',
    'US Business (Revenue)', 'US Business (Sales Operations)', 'US Business (Sales Training & Enablement)',
    'US Business (Sales)'
  ]
};

// Shorten a leaf node's display name relative to its parent, e.g.
// "US Business (Sales)" -> "Sales", "Video Editing (Marketing)" -> "Video Editing",
// "Business India (CRM)" -> "CRM". Leaves that don't reference the parent stay as-is.
function cleanTeam(child, parent) {
  const m = child.match(/^(.*?)\s*\((.*)\)\s*$/);
  if (m) {
    const outside = m[1].trim(), inside = m[2].trim();
    const norm = s => s.replace(/[\s-]/g, '').toLowerCase();
    if (norm(outside) === norm(parent)) return inside;
    if (norm(inside) === norm(parent)) return outside;
  }
  return child;
}

// Lookup: node display name -> { dept, team }. Includes both parent nodes
// (team = '—') and leaf nodes (team = cleaned leaf name).
export const DEPT_MAP = (() => {
  const map = {};
  for (const dept of Object.keys(DEPT_TREE)) {
    map[dept] = { dept, team: '—' };
    for (const child of DEPT_TREE[dept]) {
      map[child] = { dept, team: cleanTeam(child, dept) };
    }
  }
  // The data also uses a no-hyphen "Business India" for the parent node.
  map['Business India'] = { dept: 'Business - India', team: '—' };
  return map;
})();

// Resolve any raw department/team value to { dept, team }. Falls back to a
// "Department (Team)" parse for values not (yet) in the Ashby dump.
export function resolveDeptTeam(val) {
  const s = (val || '').trim();
  if (DEPT_MAP[s]) return DEPT_MAP[s];
  const m = s.match(/^(.*?)\s*\((.*)\)\s*$/);
  if (m && m[1].trim()) return { dept: m[1].trim(), team: m[2].trim() };
  return { dept: s, team: s };
}
