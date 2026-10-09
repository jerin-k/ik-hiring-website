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
export function deltaPill(n) {
  const v = Math.round(Number(n) || 0);
  const state = v > 0 ? 'short' : (v < 0 ? 'over' : 'met');
  // A plus is never drawn; a minus comes free with the number. "met" says in a word what a bare 0 does not.
  const label = v === 0 ? '0 met' : String(v);
  const title = v > 0 ? `${v} still to fill`
    : v < 0 ? `${-v} more ${-v === 1 ? 'person' : 'people'} in closing than positions opened`
    : 'Met exactly — nothing outstanding';
  return `<span class="deltacell"><span class="dpill ${state}" title="${esc(title)}">${label}</span></span>`;
}

// The whole cell, for the three callers that need nothing else around it.
export const deltaCell = (n, cls) => `<td class="${cls || 'gapcell'}">${deltaPill(n)}</td>`;
