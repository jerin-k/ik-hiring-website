// ===== #218 (Jerin, 9 Oct 2026): the Delta cell — a pill, no bar =====
// 🗣 "Ppl are not liking the delta bar - can we revise it to a red-green approach?" ➡ mock-up option A,
//    muted palette ➡ 🗣 "I like A, Muted; but without the '+', cz thats obvious; but '-' can be there."
//
// WHAT WAS WRONG WITH THE BAR. It only ever drew ONE thing — how far short a row was — in one colour, and it
// drew nothing at all whenever there was nothing short. MEASURED on the live Q3 figures: **79 of the 112 rows
// on Position Fulfilment have a Delta of exactly zero**, so on seven rows in ten the bar was an empty grey
// track saying nothing. Worse, a SURPLUS drew the same empty track as a met row — US Business at −6, the best
// row on the board, looked identical to Marketing at 0. A bar that cannot tell the best row from an average
// one is not carrying information, it is carrying noise.
//
// 🔑 THE RULE THE PILL FOLLOWS: spend colour only where there is something to act on.
//    short (> 0)    rose    — still to fill
//    surplus (< 0)  teal    — more people in closing than positions opened
//    met (= 0)      quiet   — nothing to do, and the most common row by far
//
// 🚨 THE SIGN. A plus is NOT shown — Jerin: "thats obvious". A MINUS always is, because a surplus is the one
// state a reader could otherwise misread as a shortfall. That also keeps the cell readable without colour,
// which matters for anyone who cannot tell rose from teal: the sign and the word "met" carry it alone.
//
// 🚨 NEVER CLAMP A DELTA (Rule 1, and Jerin reversed the last clamp himself on 25 Sep — "Should go surplus
// too"). A negative belongs here and must arrive as a negative.
// ⚠ This is the DELTA cell only. The Joining-conversion cells share the `.deltacell` / `.track` furniture but
// are a different measure with their own green/amber/red bands — they keep their bar and are not touched.
// ⚠ The chart's Delta band (`FULFIL_COLORS.gap`, #D8B5BE) is already a pale rose from the same family, so the
// table and the chart still agree about what Delta looks like. Checked, not assumed (Rule 3).

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// `n` is the Delta itself. Returns the inner pill only, so each caller keeps its own <td> classes — the
// `gapcell` family is what js/table-cols.js sizes the column by, and that must not move.
// #252i (Jerin, 20 Oct 2026): `label` lets a caller supply the text while the COLOUR and the tooltip still
// come from `n`. The Recruiter tab needs it because a credit split makes its counts fractional - half a
// position is real - and rounding 0.5 to 1 inside here would quietly change a number on screen.
// ⚠ Additive: every existing caller passes one argument and gets exactly what it got before.
export function deltaPill(n, label) {
  const raw = Number(n) || 0;
  const v = Math.round(raw);
  // 🚨 #252i: the state comes from the RAW number, not the rounded one. Math.round(-0.5) is -0 in JavaScript,
  // which is neither > 0 nor < 0, so half a position of SURPLUS used to read "met". Identical for whole
  // numbers, which is every caller except the Recruiter tab.
  const state = raw > 0 ? 'short' : (raw < 0 ? 'over' : 'met');
  // A plus is never drawn; a minus comes free with the number.
  // #268 (Jerin, 20 Oct 2026): 🗣 "Just skip the met." Zero now reads as a plain 0, like every other value
  // in the column. The word was doing the job the COLOUR already does — grey is the settled state — and it
  // was the only cell on the site that put a word inside a number column.
  // ⚠ The `met` STATE name below is an internal identifier and keeps its name, as `gapCell` and `.gapcell`
  // do: it is what picks the grey, and renaming it would move no number (CLAUDE.md Rule 2).
  const shown = label != null ? String(label) : String(v);
  const title = v > 0 ? `${v} still to fill`
    : v < 0 ? `${-v} more ${-v === 1 ? 'person' : 'people'} in closing than positions opened`
    : 'Nothing outstanding';
  return `<span class="deltacell"><span class="dpill ${state}" title="${esc(title)}">${shown}</span></span>`;
}

// The whole cell, for the three callers that need nothing else around it.
export const deltaCell = (n, cls) => `<td class="${cls || 'gapcell'}">${deltaPill(n)}</td>`;
