// ===== #188 — "Show levels": which branches the tree is built from =====
//
// 🗣 Jerin, 27 Sep 2026: *"Can expand be a branch with multiplechoice options for what to branch versus not? Like
// for Eg, i might choose expand recruiter or not; or expand topic or not"* — and, after seeing the mock, *"B is
// better. But i dont see Job as an option. Since that is also a branch, need it too."*
//
// 🔑 IT DECIDES WHICH LEVELS EXIST, NOT HOW DEEP THE TABLE OPENS. Option A on the mock was a depth picker; it was
// rejected because the levels are NESTED, so a depth can never give you Topic without Recruiter. Switching a level
// OFF removes it and re-hangs whatever was under it on the level above — so Department ➔ Job ➔ Topic and
// Department ➔ Recruiter are both reachable, which a depth control cannot express.
//
// ⭐ ONE HOME, deliberately. `makeMultiSelect` is copied FOUR times in this codebase and every change has to be made
// four times; this control is on at least as many tabs, so it starts as a module rather than becoming a fifth copy.
//
// The top level — Department on Hiring Manager and Overall Efficiency, Pod on Recruiter Efficiency — is always on:
// it is the table, not a branch of it. A table that lacks a level simply ignores that tick.

export const LEVELS = [
  { key: 'job', label: 'Job' },
  { key: 'rec', label: 'Recruiter' },
  { key: 'top', label: 'Topic' },
];

const state = {};   // { [id]: {job,rec,top} } — per tab, for the life of the page

/** Every level on, which is what "Expand all" used to mean. */
const allOn = () => LEVELS.reduce((a, l) => (a[l.key] = true, a), {});

/** What is ticked for this control. Defaults to everything, matching the old checked-by-default box. */
export function levelsOn(id) {
  return state[id] || (state[id] = allOn());
}

/** The control itself. Drop it where the "Expand all" label used to sit. */
export function levelChooser(id) {
  const on = levelsOn(id);
  return `<span class="lvl-pick" id="${id}"><span class="lvl-lbl">Show levels</span>`
    + LEVELS.map(l => `<label class="lvl-opt"><input type="checkbox" data-lv="${l.key}"${on[l.key] ? ' checked' : ''}> ${l.label}</label>`).join('')
    + `</span>`;
}

/**
 * Wire the control. `onChange` re-renders the tab, exactly as the old checkbox's listener did.
 * 🚨 Delegated from the container, because the tab's filter row is rebuilt on every render — a listener bound to
 * each input would be lost the first time anything else changed (the bug pattern behind #172c's duplicate wiring).
 */
export function wireLevels(id, onChange) {
  const box = document.getElementById(id);
  if (!box || box.dataset.wired === '1') return;
  box.dataset.wired = '1';
  box.addEventListener('change', (e) => {
    const lv = e.target && e.target.dataset ? e.target.dataset.lv : null;
    if (!lv) return;
    levelsOn(id)[lv] = !!e.target.checked;
    onChange();
  });
}

/** Re-tick the boxes from state after a re-render, so the control never disagrees with the table it drew. */
export function syncLevels(id) {
  const box = document.getElementById(id);
  if (!box) return;
  const on = levelsOn(id);
  box.querySelectorAll('input[data-lv]').forEach((i) => { i.checked = !!on[i.dataset.lv]; });
}

/**
 * Merge a set of per-job recruiter splits into ONE row per recruiter.
 *
 * This is what makes "Job off, Recruiter on" possible: the recruiter rows are computed per job, and with the job
 * level gone they have to add up to the DEPARTMENT instead. Summing partitions is safe — every position has one
 * owner and every person one recruiter — so the merged rows still close the level above them.
 *
 * @param {Array} lists  one array of recruiter splits per job
 * @param {string} noneKey  the catch-all name, kept last
 */
export function mergeByRecruiter(lists, noneKey) {
  const bag = {};
  (lists || []).forEach((rows) => (rows || []).forEach((r) => {
    const b = bag[r.recruiter] || (bag[r.recruiter] = {
      recruiter: r.recruiter, total: 0, joined: 0, open: 0, missed: 0, jpTied: 0,
      pending: 0, drop: 0, tS: 0, jS: 0, mS: 0, pS: 0, pNS: 0, dS: 0,
      openings: [], joWho: [], jpWho: [], topics: {},
    });
    ['total', 'joined', 'open', 'missed', 'jpTied', 'pending', 'drop', 'tS', 'jS', 'mS', 'pS', 'pNS', 'dS']
      .forEach((f) => { if (typeof r[f] === 'number') b[f] += r[f]; });
    if (r.openings) b.openings = b.openings.concat(r.openings);
    if (r.joWho) b.joWho = b.joWho.concat(r.joWho);
    if (r.jpWho) b.jpWho = b.jpWho.concat(r.jpWho);
    // 🚨 MERGE THE SCORE HALF TOO. The first version summed only total and joined, so on Overall Efficiency —
    // the one table with points — a merged topic row came through with an empty Score and none of the five
    // recruiters' topics added up to the recruiter above them. Caught by summing children against parents, not
    // by looking at the page, where an empty cell reads as a dash.
    Object.entries(r.topics || {}).forEach(([t, v]) => {
      const x = b.topics[t] || (b.topics[t] = { total: 0, joined: 0, missed: 0, tS: 0, jS: 0, mS: 0 });
      ['total', 'joined', 'missed', 'tS', 'jS', 'mS'].forEach((f) => { x[f] += v[f] || 0; });
    });
  }));
  return Object.values(bag).sort((a, b) => {
    if (a.recruiter === noneKey) return 1;
    if (b.recruiter === noneKey) return -1;
    return (b.total - a.total) || String(a.recruiter).localeCompare(String(b.recruiter));
  });
}
