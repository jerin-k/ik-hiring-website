// Recruiter → Pod mapping. Pods are the backbone for the Recruiter tab:
// they drive Submission Velocity / Screening / Joining Conversion grouping,
// and Sales-vs-Non-Sales in Position Fulfilment (Sales pod = Sales; others = Non-Sales).
//
// Persistence = option B: the committed RECRUITER_POD below is the durable, shared
// default. Admin edits are held in localStorage and take precedence; use
// Admin → "Export mapping" to copy the merged object back into RECRUITER_POD here,
// then commit — that makes the assignments permanent for everyone.
//
// Merge-on-refresh: new recruiters that appear later are simply "Unassigned" until
// mapped; existing assignments are never overwritten.

export const POD_OPTIONS = ['Sales', 'Lateral', 'SME-US', 'SME-India'];

// Baked mapping — update from Admin → Export, then commit.
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

const LS_KEY = 'ik_recruiter_pods';

export function loadPodOverrides() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch (e) { return {}; }
}

export function setPodOverride(name, pod) {
  const o = loadPodOverrides();
  if (!pod || pod === 'Unassigned') delete o[name]; else o[name] = pod;
  localStorage.setItem(LS_KEY, JSON.stringify(o));
}

// Effective pod for a recruiter — localStorage override wins over the committed default.
export function podOf(name) {
  const o = loadPodOverrides();
  return o[name] || RECRUITER_POD[name] || 'Unassigned';
}

export function isSalesPod(pod) { return pod === 'Sales'; }

// Committed defaults + local overrides, ready to bake back into RECRUITER_POD.
export function mergedPodMap() {
  return { ...RECRUITER_POD, ...loadPodOverrides() };
}
