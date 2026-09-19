// #151b (Jerin, 19 Sep 2026 — option B + width option 2): carry a column's FAMILY from its heading down the column.
//
// Why this exists at all. Jerin asked for two things in one change: every number centred, and one width for every
// set of columns that hold the same kind of thing. CSS can size a column from a `<col>` element but it cannot
// ALIGN one — `text-align` does not apply to a column — and nothing in CSS lets a `th` style the cells beneath it.
// The alternative was `nth-child` rules table by table, which is exactly the hand-made-one-at-a-time problem the
// task was raised to end, and which drifts the moment a column is inserted.
//
// So the family is declared ONCE, on the heading cell (`<th class="c-num">`), and this pass copies it onto every
// body cell in that column. The HEADER decides and the body follows — the same shape as Rule 3's "the table
// computes, the chart reads". Nothing here reads, writes or reformats a value: it adds class names and touches
// nothing else, so it cannot change a number.
//
// The families and their widths live in the `#151b` block in css/style.css:
//   c-num · c-pct   a plain number or a percentage            3.5rem, centred, never wrapped
//   c-cap           a number with a caption under it          7.8rem
//   c-bar           a number with a bar beside it             9.5rem
//   c-date          a date with its context under it          9rem
//   c-dept c-job c-rec c-cand c-open c-stage                  one width each, WRAPPING
//   c-txt           opt out — size yourself (IDs, free text)
//
// 🚨 A heading row is not one cell per column. The Fulfilment tables use rowspan="2" for the ungrouped measures
// and colspan="2" for the Heads/Score pairs, so header cell #5 is not column #5. headingsByColumn() lays the
// header out as a real grid and reports the BOTTOM-most heading of each column, which is the one that names it.

const FAMILIES = ['c-num', 'c-pct', 'c-cap', 'c-bar', 'c-date', 'c-dept', 'c-job', 'c-rec', 'c-cand', 'c-open', 'c-stage', 'c-txt'];

// Lay the <thead> out as a grid, honouring rowspan and colspan, and return the deepest heading cell per column.
function headingsByColumn(table) {
  const rows = [...table.querySelectorAll('thead tr')];
  if (!rows.length) return [];
  const grid = [];                       // grid[r][c] = the th occupying that slot
  rows.forEach((tr, r) => {
    grid[r] = grid[r] || [];
    let c = 0;
    for (const cell of tr.cells) {
      while (grid[r][c]) c++;            // skip slots already taken by a rowspan from above
      const cs = cell.colSpan || 1, rs = cell.rowSpan || 1;
      for (let dr = 0; dr < rs; dr++) {
        grid[r + dr] = grid[r + dr] || [];
        for (let dc = 0; dc < cs; dc++) grid[r + dr][c + dc] = cell;
      }
      c += cs;
    }
  });
  const width = Math.max(...grid.map(row => row.length));
  const out = [];
  for (let c = 0; c < width; c++) {
    for (let r = grid.length - 1; r >= 0; r--) if (grid[r] && grid[r][c]) { out[c] = grid[r][c]; break; }
  }
  return out;
}

const familiesOf = (th) => (th ? FAMILIES.filter(f => th.classList.contains(f)) : []);

// A score grid (`table.metrics`, minus the people lists) is a grid of NUMBERS by construction: every column after
// the name column holds one. So rather than hand-label a hundred heading cells across the three Fulfilment tables
// — which is how a wrong width gets in and stays — the three number families are told apart by what the cell
// actually CONTAINS, which is a structural fact and not a guess about meaning:
//   a bar beside the number  (.track / .deltacell / .gapcell)  ➡ c-bar   Delta, Joining conversion, Capacity used
//   a caption under it       (.sublab / small)                 ➡ c-cap   "+1 sourced", "17% of outcomes"
//   neither                                                   ➡ c-num
// An explicit `c-*` on the heading always wins, so a column can still be named by hand where it matters.
const AUTO_SEL = 'table.metrics:not(.pl-list)';
const BAR_SEL = '.track, .deltacell, .gapcell, .capbar';
const CAP_SEL = '.sublab, small';

function inferFamily(cells) {
  let bar = 0, cap = 0, seen = 0;
  for (const c of cells) {
    if (!c) continue;
    seen++;
    if (c.querySelector(BAR_SEL) || c.classList.contains('gapcell')) bar++;
    else if (c.querySelector(CAP_SEL)) cap++;
  }
  if (!seen) return [];
  if (bar) return ['c-bar'];
  if (cap) return ['c-cap'];
  return ['c-num'];
}

// One table. Idempotent: re-running it adds the same classes again, which changes nothing.
export function applyColumnFamilies(table) {
  const heads = headingsByColumn(table);
  if (!heads.length) return;
  const cols = heads.map(familiesOf);
  const auto = table.matches(AUTO_SEL);
  if (!auto && !cols.some(f => f.length)) return;   // no families declared and none to infer — leave it alone
  const body = table.tBodies[0];
  if (!body) return;
  // A "nothing to show" row is one cell spanning the table — it keeps its own centring and is never counted.
  const rows = [...body.rows].filter(tr => tr.cells.length === cols.length);
  // 🚨 The done-marker is on the ROW, not the table. A table-level signature (columns + row count) looked
  // cheaper and was wrong twice over: a filter that returns the same NUMBER of rows builds brand-new, unstamped
  // rows the signature calls unchanged, and a table stamped while its body was still empty was never revisited.
  // A row carries its own marker, so a rebuilt row is always a new row and is always stamped.
  const todo = rows.filter(tr => tr.dataset.colFam !== '1');
  if (!todo.length) return;
  for (let c = 0; c < cols.length; c++) {
    let fam = cols[c];
    // The first column is the name or the tree: it is never a number, and its width is each panel's own call.
    if (!fam.length && auto && c > 0) fam = inferFamily(rows.map(tr => tr.cells[c]));
    if (!fam.length) continue;
    if (!cols[c].length) heads[c] && heads[c].classList.add(...fam);   // so the heading sizes with its column
    for (const tr of todo) tr.cells[c].classList.add(...fam);
  }
  for (const tr of todo) tr.dataset.colFam = '1';
  // 🚨 Marks a table whose columns are sized by the families, so style.css can let its FIRST column absorb any
  // slack. Without that, a table narrower than its panel has spare width, and the layout shares the spare out
  // among all the columns — which stretched the number columns back to 62, 66, 69 and 76px and put the
  // raggedness straight back. The name column is the one that should take the room.
  table.classList.add('cols-sized');
}

export function applyAllColumnFamilies(root) {
  (root || document).querySelectorAll('table').forEach(applyColumnFamilies);
}

// Every page fills its tables with `body.innerHTML = …`, on first render and again on every filter change, and
// there are far too many of those call sites to hook one by one. Watching the page content instead means a table
// is stamped whoever rebuilt it and whenever — including the sub-tabs and trees that render lazily.
// 🔑 Only childList is observed and only classes and one data attribute are written, so this can never retrigger
// itself. Work is coalesced into one timeout, and the row marker means a re-run over an unchanged table stops at
// a single filter() call.
// 🚨 A timeout, NOT requestAnimationFrame. rAF does not run while the tab is in the background, so a page that
// finished rendering behind another tab would have kept its old widths and alignment until the tab was looked at.
export function watchColumnFamilies(root) {
  const target = root || document.getElementById('page-content') || document.body;
  let queued = false;
  const run = () => { queued = false; applyAllColumnFamilies(target); };
  const observer = new MutationObserver(() => { if (!queued) { queued = true; setTimeout(run, 0); } });
  observer.observe(target, { childList: true, subtree: true });
  run();
  return observer;
}
