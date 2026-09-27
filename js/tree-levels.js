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

// ===== #189d (28 Sep 2026) — TWO CONTROLS IN ONE SLOT, and only the one that works is shown =====
//
// 🚨 WHAT #188 BROKE. It replaced the old "Expand all" tick with this chooser and hard-coded `expandAll = true`.
// But `levelsOn()` is read in exactly ONE place per tab — the Position Fulfilment render — while the control is
// mounted once in the tab's shared filter row. So the chooser appeared over ELEVEN panels it cannot move
// (Hiring Manager: Throughput, Interview Pipeline, Panelists · Overall Efficiency: Momentum, Screening,
// Throughput, Interview Pipeline, Time in Process, Joining Conversion, Sourcing Mix, Panelists), measured by
// ticking each box off and on and finding the visible rows and their text identical every time. Worse, those
// trees lost their bulk collapse and sat permanently open — Panelists at 231 rows.
// 🗣 Jerin's rule: "If there is a filter applied, data needs to change as well." [[feedback_filters-must-change-data]]
//
// 🔑 THE FIX FOLLOWS A PATTERN ALREADY ON THE PAGE: the From / To boxes hide themselves on the two panels they
// cannot move (#133 Joining Pipeline, #141d Interview Pipeline). So does this now.
//   · a panel whose tree HAS the job/recruiter/topic levels  ➜ the level chooser
//   · every other tree                                        ➜ the plain "Expand all" tick, back again
// Both live inside the SAME element so one delegated listener still catches both, and `showLevels()` swaps them.
// ⚠ The tick defaults to ON, exactly as the old checkbox did, so nothing on screen changes until somebody
// unticks it. #188 did not change the default view and neither does this.

/** Is "Expand all" ticked for this control? Defaults to true, matching the box #188 removed. */
export function expandAllOn(id) {
  const s = state[id] || (state[id] = allOn());
  return s.xa !== false;
}

/**
 * The control itself. Drop it where the "Expand all" label used to sit.
 *
 * #189e: `keys` names the levels THIS tab's table actually has, so a tab offers only the ticks that move
 * something. Hiring Manager and Overall Efficiency run Department ➔ Job ➔ Recruiter ➔ Topic and offer all
 * three. Recruiter Efficiency runs Pod ➔ Recruiter ➔ Job ➔ Topic, where the recruiter IS the tab and the job
 * cannot be taken away (its topic rows carry Goal, Joining pipeline and Joined only, so with the jobs merged
 * away they would stop adding up to the recruiter) — it offers Topic alone. Left out, every level is offered.
 */
export function levelChooser(id, keys) {
  const on = levelsOn(id);
  const lv = keys ? LEVELS.filter((l) => keys.includes(l.key)) : LEVELS;
  return `<span class="lvl-pick" id="${id}">`
    + `<span class="lvl-lbl" data-part="lvl">Show levels</span>`
    + lv.map(l => `<label class="lvl-opt" data-part="lvl"><input type="checkbox" data-lv="${l.key}"${on[l.key] ? ' checked' : ''}> ${l.label}</label>`).join('')
    + `<label class="lvl-opt" data-part="xa"><input type="checkbox" data-xa${expandAllOn(id) ? ' checked' : ''}> Expand all</label>`
    + `</span>`;
}

/**
 * Which of the two controls this panel gets. `wantLevels` is true only where the level chooser actually
 * changes the table — today the two Position Fulfilment tables.
 */
export function showLevels(id, wantLevels) {
  const box = document.getElementById(id);
  if (!box) return;
  box.querySelectorAll('[data-part="lvl"]').forEach((e) => { e.style.display = wantLevels ? '' : 'none'; });
  box.querySelectorAll('[data-part="xa"]').forEach((e) => { e.style.display = wantLevels ? 'none' : ''; });
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
    const ds = e.target && e.target.dataset;
    if (!ds) return;
    // #189d: the same delegated listener serves both controls, which is why they share one element.
    if ('xa' in ds) { levelsOn(id).xa = !!e.target.checked; onChange(); return; }
    if (!ds.lv) return;
    levelsOn(id)[ds.lv] = !!e.target.checked;
    onChange();
  });
}

/** Re-tick the boxes from state after a re-render, so the control never disagrees with the table it drew. */
export function syncLevels(id) {
  const box = document.getElementById(id);
  if (!box) return;
  const on = levelsOn(id);
  box.querySelectorAll('input[data-lv]').forEach((i) => { i.checked = !!on[i.dataset.lv]; });
  box.querySelectorAll('input[data-xa]').forEach((i) => { i.checked = expandAllOn(id); });   // #189d
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
