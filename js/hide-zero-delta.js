// ===== #301 (Jerin, 19 Nov 2026) — ONE "hide the finished roles" tick, for every table that has a Delta =====
// 🗣 *"Need a filter to remove Zero Delta roles"* · *"I think this is applicable for multiple tabs"* — he was
//    right: Delta is on Position Fulfilment (Hiring Manager AND Overall Efficiency), on the five Recruiter
//    Fulfilment tables, and on Type & Budget. Four renderers.
//
// 🚨 WHY THIS FILE EXISTS, and it is the same reason `people-list-cell.js` exists: four copies of one control
//    is four chances for the label, the default or the rule to drift. The tick, the test and the line that
//    discloses what was hidden all live here, so changing one changes all four.
//
// 🔑 THE TOTALS, THE CARDS AND THE CHART ARE NOT FILTERED, AND THAT IS DELIBERATE.
//    A role with Delta 0 contributes **exactly 0** to Delta, so filtering it would not move the Delta total by
//    a single position — but it WOULD drop its Joined and its Total positions, and a Joined figure that falls
//    when you tick a box reads as joiners going missing. The totals stay the true totals; the table says on
//    screen how many rows it is not showing. That line is live state, which is the one thing sanctioned above
//    a table (CLAUDE.md).
//    ⚠ This is NOT the `Hide zero-pipeline` rule, which filters before its totals are built. Those rows are
//      genuinely EMPTY; these rows are FINISHED, which is real work and must keep counting.
//
// ⚠ DEFAULT OFF, unlike `Hide zero-pipeline`. Hiding an empty row costs nothing; hiding a FINISHED role hides
//   a result somebody delivered, so the first thing you see stays the whole table and hiding is a choice.
//   Measured in this codebase's own note: 79 rows of 112 have a Delta of exactly zero, so the tick is not a
//   detail — it decides whether you see a third of the table or all of it.

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** The tick itself. Drop it in the same control row the other ticks sit in. */
export function hideZeroTick(id, checked) {
  // ⚠ `checked` exists for a panel that REDRAWS ITS OWN CONTROL (Type & Budget rewrites the whole panel on
  //   every render), where the tick would otherwise reset itself the moment it is used. Tabs whose control
  //   outlives the table - Hiring Manager, Overall Efficiency - pass nothing and read the DOM instead.
  return `<label><input type="checkbox" class="jn-hz" id="${esc(id)}"${checked ? ' checked' : ''}> Hide zero-Delta</label>`;
}

/** Is a click on the tick? Lets a panel's existing delegated listener tell this control from its own. */
export const isHideZeroTick = (el) => !!(el && el.closest && el.closest('input.jn-hz'));

/** Is it ticked? Absent control ⇒ false, so a tab that has not been given the tick behaves exactly as before. */
export function hideZeroOn(id) {
  const el = document.getElementById(id);
  return !!(el && el.checked);
}

/**
 * Is this row finished? 🚨 EXACTLY ZERO, never "<= 0".
 * A NEGATIVE Delta means more people are in closing than positions were opened (Rule 1 — never clamped, and
 * a real signal about missing opening links). Hiding those would hide the very rows worth looking at.
 */
export const isZeroDelta = (delta) => Number(delta) === 0;

/** The line under the table saying what it is not showing. Says nothing when nothing is hidden. */
export function hiddenNote(n, what = 'role') {
  if (!n) return '';
  return `<p class="sub-note">${n} ${esc(what)}${n === 1 ? '' : 's'} with nothing left to fill `
    + `${n === 1 ? 'is' : 'are'} hidden. The figures above still count ${n === 1 ? 'it' : 'them'}.</p>`;
}
