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

// 'Others' (added 2026-09-07, Jerin) is a DELIBERATE assignment for recruiters who work across pods —
// e.g. Gopu Nair V. It is NOT the same as 'Unassigned', which means nobody has set a pod and stays
// excluded from the Recruiter tab (decision #23, 2026-08-24). Others behaves like any other pod:
// it groups, filters, charts and totals normally, and counts as Non-Sales in Fulfilment.
export const POD_OPTIONS = ['Sales', 'Lateral', 'SME-US', 'SME-India', 'Others'];
export const POD_ORDER = [...POD_OPTIONS, 'Unassigned'];

// Committed baseline (quarter-agnostic default). Update via Metric Configuration → Export, then commit.
// 🚨 This list is what EVERY quarter without its own published assignment falls back to, and copy-forward
// only fills forwards — a pod published for Q3 never reaches Q1. Pods have only ever been published for
// 2026-Q3, so until 2026-08-26 the nine people below were "no pod set" for Q1 and Q2 and were therefore
// excluded from every row, total and chart on the Recruiter tab: 11,576 applications, 125 offers, 85 hires,
// and Data Hygiene → Pod Not Set read 13 under Q1 against 4 under Q3. Brought in line with the Q3 config on
// Jerin's call — a person's current pod is taken to be where they sat earlier in the year too. Anyone who
// genuinely moved pods mid-year needs an explicit assignment on that quarter, which overrides this.
// Aditya Singh was the one place the two lists disagreed (Sales here, SME-US in the Q3 config). Jerin
// confirmed 2026-08-26 that the old value was simply wrong and he had corrected it to SME-US — not a
// mid-year move — so the baseline now says SME-US and he reads the same in every quarter.
export const RECRUITER_POD = {
  "Aaron Collins": "SME-US",
  "Aditya Singh": "SME-US",
  "Alokita Dhumne": "Sales",
  "Ankita Kabra": "Lateral",
  "Astha Thakur": "Lateral",
  "Chhavi Rana": "Sales",
  "Deepti Leslie": "Lateral",
  "Kaashvika Kashyap": "Sales",
  "M Navya": "Sales",
  "Mahima Agarwal": "Sales",
  "Mashika De Almeida": "Lateral",
  "Neha Vivekanand Pattar": "Lateral",
  "Oshin Verma": "SME-India",
  "Rijo John": "Sales",
  "Ritika Bhasin": "SME-US",
  "Sanghamitra Moulik": "Lateral",
  "Satinder Kaur": "Lateral",
  "Siva Sruthi V S": "Sales",
  "Smriti Das": "Sales",
  "Tabitha Anceline E": "Sales",
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

// ===== #205 (7 Oct 2026): POD DEFINITIONS — what a pod MEASURES, set per quarter and copied forward =====
// 🗣 Jerin: Sales moved to chasing Offers from Q4. His first instinct was to move all 12 Sales recruiters into the
// Lateral pod, which works but destroys the only thing that said who was Sales and who was Lateral.
// 🔑 THE FAULT IT FIXES: "pod" was doing TWO jobs — WHO someone is, and HOW they are measured. The measurement was
// hard-coded in FULFIL_TABLES, invisible anywhere on screen. Now a pod KEEPS its people and its identity, and the
// measurement is a definition you set for a quarter.
// 🚨 THE DEFAULTS BELOW ARE EXACTLY TODAY'S HARD-CODED VALUES. With no definition configured, every number is
// unchanged — this ships as a no-op until a definition is actually set.
export const POD_DEF_DEFAULTS = {
  'Sales':     { measuredOn: 'hire',  dropInDelta: false, dropPts: false, capUnit: 'Joiners', goalUnit: 'Joiners' },
  'SME-US':    { measuredOn: 'offer', dropInDelta: false, dropPts: false, capUnit: 'Joiners', goalUnit: 'Joiners' },
  'SME-India': { measuredOn: 'offer', dropInDelta: false, dropPts: false, capUnit: 'Joiners', goalUnit: 'Joiners' },
  'Lateral':   { measuredOn: 'offer', dropInDelta: true,  dropPts: true,  capUnit: 'Offers',  goalUnit: 'Offers'  },
  'Others':    { measuredOn: 'hire',  dropInDelta: false, dropPts: true,  capUnit: 'NA',      goalUnit: 'Joiners' },
};
export const POD_DEF_FIELDS = ['measuredOn', 'dropInDelta', 'dropPts', 'capUnit', 'goalUnit'];
const PODDEF_LS = 'ik_pod_defs_q';   // { "2026-Q4": { Sales: {measuredOn:'offer', ...} } }

// The definition in force for a pod in a quarter: the quarter's own entry, else the newest EARLIER quarter that set
// one, else the built-in default — the same copy-forward ladder pods and capacity already use.
// ⚠ Merged FIELD BY FIELD over the default, so a definition that sets only `measuredOn` keeps sane values for the rest.
export function podDefOf(pod, quarter = currentQuarter()) {
  const base = POD_DEF_DEFAULTS[pod] || POD_DEF_DEFAULTS['Others'];
  const store = loadJSON(PODDEF_LS);
  const v = inheritedValue(store, pod, quarter);
  return v && typeof v === 'object' ? { ...base, ...v } : { ...base };
}
// The quarter whose entry is actually in force — for the Admin tab's "effective from" column. null = the built-in default.
export function podDefSetAt(pod, quarter = currentQuarter()) {
  const store = loadJSON(PODDEF_LS); const target = qRank(quarter);
  let best = null, bestRank = -1;
  for (const qk of Object.keys(store)) {
    const r = qRank(qk);
    if (r <= target && r > bestRank && store[qk] && store[qk][pod] != null) { bestRank = r; best = qk; }
  }
  return best;
}
export function setPodDef(pod, def, quarter) {
  const store = loadJSON(PODDEF_LS);
  if (!store[quarter]) store[quarter] = {};
  if (!def) delete store[quarter][pod]; else store[quarter][pod] = def;
  saveJSON(PODDEF_LS, store);
}
export function podDefsStore() { return loadJSON(PODDEF_LS); }

// ===== capacity (Score) =====
export function capacityOf(name, quarter = currentQuarter()) {
  const v = inheritedValue(loadJSON(CAP_LS), name, quarter);
  return v != null ? v : 0;
}

// #13 (Jerin, 14 Sep 2026): Data Hygiene → Capacity Not Set lists people whose capacity was never ENTERED. capacityOf() reads a blank
// as 0, so it cannot tell "never entered" from a deliberate 0; this can. A value carried forward from an earlier quarter counts as set.
export function capacityIsSet(name, quarter = currentQuarter()) {
  return inheritedValue(loadJSON(CAP_LS), name, quarter) != null;
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
