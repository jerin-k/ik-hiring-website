// Recruiter → Pod mapping + per-recruiter Capacity. Pods are the backbone for the
// Recruiter tab: they drive Velocity / Screening / Joining grouping and Sales-vs-Non-Sales
// in Fulfilment (Sales pod = Sales; others = Non-Sales). Capacity (a Score) is the ideal
// Fulfilment target per recruiter.
//
// BOTH pod and capacity are stored PER QUARTER (key "YYYY-QN"). A quarter with no explicit
// value inherits (copy-forward) the latest earlier quarter's value, then the committed
// RECRUITER_POD baseline, then 'Unassigned' / 0. Editing a value in a quarter materialises
// an explicit entry for that quarter only. Both are set in Recruiter Efficiency →
// Metric Configuration (quarter toggle). localStorage; export bakes back to committed files.

export const POD_OPTIONS = ['Sales', 'Lateral', 'SME-US', 'SME-India'];
export const POD_ORDER = [...POD_OPTIONS, 'Unassigned'];

// Committed baseline (quarter-agnostic default). Update via Metric Configuration → Export, then commit.
export const RECRUITER_POD = {
  "Aditya Singh": "Sales",
  "Deepti Leslie": "Lateral",
  "M Navya": "Sales",
  "Mahima Agarwal": "Sales",
  "Mashika De Almeida": "Lateral",
  "Neha Vivekanand Pattar": "Lateral",
  "Oshin Verma": "SME-India",
  "Rijo John": "Sales",
  "Sanghamitra Moulik": "Lateral",
  "Siva Sruthi V S": "Sales",
  "Smriti Das": "Sales",
  "Tina Anisha Bibeiro": "Sales",
  "V Pooja": "Lateral",
};

const POD_LS = 'ik_recruiter_pods_q';       // { "2026-Q3": { name: pod } }
const CAP_LS = 'ik_recruiter_capacity_q';   // { "2026-Q3": { name: scoreNumber } }
const LEGACY_POD_LS = 'ik_recruiter_pods';  // pre-quarter flat overrides (baseline fallback)

function loadJSON(key) { try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch (e) { return {}; } }
function saveJSON(key, o) { localStorage.setItem(key, JSON.stringify(o)); }

// ===== quarter helpers =====
export function qKey(year, q) { return `${year}-Q${String(q).replace(/^Q/i, '')}`; }
export function currentQuarter() { const d = new Date(); return qKey(d.getFullYear(), Math.floor(d.getMonth() / 3) + 1); }
function qRank(key) { const m = /^(\d{4})-Q([1-4])$/.exec(key || ''); return m ? parseInt(m[1], 10) * 10 + parseInt(m[2], 10) : 0; }

// Latest value for `name` in `quarter` or any earlier quarter (copy-forward). null if none.
function inheritedValue(store, name, quarter) {
  if (store[quarter] && store[quarter][name] != null) return store[quarter][name];
  const target = qRank(quarter);
  let best = null, bestRank = -1;
  for (const qk of Object.keys(store)) {
    const r = qRank(qk);
    if (r <= target && r > bestRank && store[qk] && store[qk][name] != null) { bestRank = r; best = store[qk][name]; }
  }
  return best;
}

// ===== pods =====
export function podOf(name, quarter = currentQuarter()) {
  const v = inheritedValue(loadJSON(POD_LS), name, quarter);
  if (v) return v;
  const legacy = loadJSON(LEGACY_POD_LS);
  return legacy[name] || RECRUITER_POD[name] || 'Unassigned';
}

export function setPod(name, pod, quarter) {
  const store = loadJSON(POD_LS);
  if (!store[quarter]) store[quarter] = {};
  if (!pod || pod === 'Unassigned') delete store[quarter][name]; else store[quarter][name] = pod;
  saveJSON(POD_LS, store);
}

export function isSalesPod(pod) { return pod === 'Sales'; }

// ===== capacity (Score) =====
export function capacityOf(name, quarter = currentQuarter()) {
  const v = inheritedValue(loadJSON(CAP_LS), name, quarter);
  return v != null ? v : 0;
}

export function setCapacity(name, val, quarter) {
  const store = loadJSON(CAP_LS);
  if (!store[quarter]) store[quarter] = {};
  if (val === '' || val == null) delete store[quarter][name];
  else store[quarter][name] = Math.max(0, parseInt(val, 10) || 0);
  saveJSON(CAP_LS, store);
}

// Full per-quarter config, for the Export/bake-back button.
export function exportConfig() { return { pods: loadJSON(POD_LS), capacity: loadJSON(CAP_LS) }; }

// ===== legacy shims (used by the Admin pod section until it's removed; operate on the flat store) =====
export function loadPodOverrides() { return loadJSON(LEGACY_POD_LS); }
export function setPodOverride(name, pod) {
  const o = loadJSON(LEGACY_POD_LS);
  if (!pod || pod === 'Unassigned') delete o[name]; else o[name] = pod;
  saveJSON(LEGACY_POD_LS, o);
}
export function mergedPodMap() { return { ...RECRUITER_POD, ...loadJSON(LEGACY_POD_LS) }; }
