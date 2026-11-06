// ===== #269 — the "Type & Budget" sub-tab, shared by Hiring Manager and Overall Efficiency =====
//
// Jerin, 20 Oct 2026: "These 3 subtabs shud be nested vertically under a single sub tab under HM & Overall.
// Can call it - Type & Budget". So ONE chip on the band, and inside it a vertical rail with three panels:
//
//   Role Type   positions by WHY the role exists, against filled status
//   Emp Type    positions by WHAT KIND OF CONTRACT it is, against filled status
//   Budget      a per-department ledger
//
// 🔑 ONE MODULE, TWO TABS — the same shape as `interview-traction.js` (#206). The page owns the filters, this
// module owns the metric, so Hiring Manager and Overall Efficiency can never drift apart (CLAUDE.md Rule 3).
//
// 🔑 THE ROWS MUST CLOSE THE POSITION FULFILMENT ROW. They are built from `data.openingRows` through the SAME
// `sel` contract `opening-topics.js` uses — whole quarters when the window covers them, India-time days when
// it is narrower — so a full-quarter range gives exactly the quarter figures by construction, not by a second
// sum. The caller passes that filter in; this module never invents one.
//
// 🚨 THE CATCH-ALL ROWS ARE NOT OPTIONAL. Every position the period counted has to land in some row, or the
// table silently loses positions and stops adding up to Total — this project's favourite bug.
//
// ⚠ `roleType` and `empType` arrived on `openingRows` with #269a (20 Oct 2026, web app V74). Data written
// before that run has neither, and then both tables show everything under their catch-all row and say so.
// Never assume the fields exist.

import { defsBlock } from './definitions.js';
// #269d: the Starting point cell is saved exactly the way Remarks and Pri are — by the web app, never by
// git, into the same PUBLIC file, with a digits-only guard at both ends.
import { budgetOf, publishBudget, loadNotes, notesLoadedAt } from './job-notes.js';
// #280: the Department ➔ Job ➔ Type levels hang off the tab's EXISTING "Show levels" ticks, never a new
// control — #188 settled that (a depth picker was rejected in favour of per-level toggles).
import { levelsOn, showLevels, expandAllOn } from './tree-levels.js';

/** What a row shows when the field has not been filled in. Shown, never dropped, so the total still adds up. */
export const NO_ROLE_TYPE = '(role type not set)';
export const NO_EMP_TYPE = '(contract type not set)';
/** #280: the same rule one level up — a position whose job has no department, or no title, is shown not dropped. */
export const NO_DEPT = '(no department)';
export const NO_JOB = '(job not named)';

/** The two role types that are raised WITH a budget — the Req Bot asks for one only for these (#244c). */
export const BUDGET_ROLE_TYPES = new Set(['Replacement', 'Anticipation Of Exit']);

/**
 * Where a position stands, in the order the columns read, and in the site's OWN words (Jerin, 6 Nov 2026:
 * *"Use nomenclatures we have already used in teh site. Like Delta instead of Open and so on."*).
 * 🔑 `Total positions − Joined − Joining pipeline = Delta` now reads across every row here exactly as it
 *    does on Position Fulfilment.
 * 🚨 MISSED IS NOT A COLUMN ANY MORE and must not come back as one. Delta means "not joined, and nobody
 *    closing against it", so a missed position is ALREADY inside Delta — carrying both would count it twice.
 *    That also puts this tab back in line with #182e, which took Missed off every other table while this one
 *    kept it. Q3 2026 is the proof: old Open 2 + Missed 9 = Delta 11.
 * ⚠ `jp` is NOT the Joining Pipeline card on Position Fulfilment. That one counts PEOPLE, is live, and
 *    includes anyone with no opening attached; this counts POSITIONS somebody is closing against. The two
 *    will not match and neither is wrong — the definitions block says so.
 */
const STATES = ['joined', 'jp', 'delta'];

/** The Fulfilment chart's own three colours, so a bar here means what a bar there means (`FULFIL_COLORS`). */
const STATE_COLOUR = { joined: '#1E7590', jp: '#9fb3d6', delta: '#D8B5BE' };
const STATE_LABEL = { joined: 'Joined', jp: 'Joining pipeline', delta: 'Delta' };
/** On a number rather than a filled chip: eleven columns of pills was most of this table's weight. */
const STATE_INK = { joined: 'var(--green)', jp: 'var(--orange)', delta: '' };

/** #280. The class is only a handle for the toggle to find — the look is inline, because `.caret` is styled at
 *  its use site in `hm-report.js` and has no rule in `style.css` (CLAUDE.md Rule 12: grep before trusting one). */
const CARET = '<span class="tb-caret" style="display:inline-block;width:0.875rem;color:var(--muted)">\u25b8</span>';
const CARET_OPEN = '<span class="tb-caret" style="display:inline-block;width:0.875rem;color:var(--muted)">\u25be</span>';
const CARET_GAP = '<span style="display:inline-block;width:0.875rem"></span>';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Group the positions of the selected period three ways.
 *
 * @param {object} data  the dashboard payload
 * @param {object} sel   the SAME period selection Position Fulfilment used:
 *                       { wholeWin, winQs, dayOK, inDay } — see `topicIndex()`, which this mirrors exactly.
 * @param {function} jobOk  (job8) => boolean, the page's department/job filter. Never invented here.
 * @returns {object} { roleTree, empTree, roleRows, empRows, deptRows, totals, source }
 *
 * ===== #280 (26 Oct 2026) — ONE TREE, THREE VIEWS OF IT =====
 * 🗣 Jerin, 22 Oct: *"For all the tables under Type & Budget - we need Department wise, job-wise view"*, then
 * *"I'd lean B"* of the three shapes mocked — **B = Department ➔ Job ➔ Type**.
 * 🔑 THE FLAT TYPE ROWS ARE NOW A PROJECTION OF THE TREE, not a second count beside it. `roleRows` is the tree's
 * own leaves added up, so the bar chart that reads them and the table that renders the tree are arithmetically
 * the same figures — they cannot drift the way a chart that recomputes eventually does (CLAUDE.md Rule 3).
 * The Budget ledger's department rows come off the SAME tree, which is also where `canCarryBudget` is counted now.
 * 🚨 NO PIPELINE WORK: department and job come from `jobIndex`, which already carries both, over the same
 * `openingRows` the flat tables always used. This is a front-end grouping, so nothing about the figures moved.
 */
export function typeBudgetIndex(data, sel, jobOk) {
  const rows = (data && data.openingRows) || null;
  const jobIndex = (data && data.jobIndex) || {};
  const empty = {
    roleTree: [], empTree: [], roleRows: [], empRows: [], deptRows: [],
    totals: blank(), source: { field: 0, name: 0, none: 0 }
  };
  if (!rows || !rows.length) return empty;

  const take = (r) => {
    if (!jobOk(r.jobId8)) return false;
    if (sel.wholeWin) return sel.winQs.includes(r.quarter);
    if (sel.dayOK) return !!r.day && sel.inDay(r.day);
    return false;
  };

  const role = {}, emp = {};
  const totals = blank();
  const source = { field: 0, name: 0, none: 0 };

  rows.forEach((r) => {
    if (!take(r)) return;
    const st = stateOf(r);
    const ji = jobIndex[r.jobId8] || {};
    const dept = ji.department || NO_DEPT;
    const job = ji.title || NO_JOB;

    plant(role, dept, job, r.jobId8, r.roleType || NO_ROLE_TYPE, st);
    plant(emp, dept, job, r.jobId8, r.empType || NO_EMP_TYPE, st);

    totals.total++;
    if (st) totals[st]++;
    source[r.roleTypeSource === 'field' ? 'field' : (r.roleTypeSource === 'name' ? 'name' : 'none')]++;
  });

  const roleTree = grow(role, NO_ROLE_TYPE);
  const empTree = grow(emp, NO_EMP_TYPE);

  return {
    roleTree,
    empTree,
    roleRows: leaves(roleTree, NO_ROLE_TYPE),
    empRows: leaves(empTree, NO_EMP_TYPE),
    deptRows: ledger(roleTree),
    totals,
    source
  };

  function blank() { return { total: 0, joined: 0, jp: 0, delta: 0 }; }
  /**
   * One position, one bucket. `jpTied` is how many people in closing name this opening on their offer
   * (#157), so a position with one or more of them is in the pipeline; everything that is neither joined
   * nor in the pipeline — still open, or closed as carry forward — lands in Delta.
   */
  function stateOf(r) {
    if (r.state === 'joined') return 'joined';
    if (r.state !== 'missed' && (r.jpTied || 0) > 0) return 'jp';
    return 'delta';
  }
  function add(t, st) { t.total++; if (st) t[st]++; }

  /** Count one position at all three levels at once, so a level can never disagree with the one above it. */
  function plant(tree, dept, job, job8, type, st) {
    const d = tree[dept] || (tree[dept] = Object.assign({ key: dept, jobs: {} }, blank()));
    add(d, st);
    // Keyed on the job ID, never the title: two jobs can share a title and must stay two rows.
    const j = d.jobs[job8] || (d.jobs[job8] = Object.assign({ key: job, job8, types: {} }, blank()));
    add(j, st);
    const t = j.types[type] || (j.types[type] = Object.assign({ key: type }, blank()));
    add(t, st);
  }

  // Biggest first; the catch-all sits LAST however big it is, because it is a gap marker, not a type.
  function order(list, catchAll) {
    return list.sort((a, b) => {
      if (a.key === catchAll) return 1;
      if (b.key === catchAll) return -1;
      return b.total - a.total || String(a.key).localeCompare(String(b.key));
    });
  }

  /** Maps ➔ sorted arrays. Each department also gets its OWN type split, added up across its jobs: that is what
   *  the table shows when the Job level is unticked, and it is computed here so the renderer never sums. */
  function grow(tree, catchAll) {
    return order(Object.values(tree).map((d) => {
      const jobs = order(Object.values(d.jobs).map((j) =>
        Object.assign({}, j, { types: order(Object.values(j.types), catchAll) })), NO_JOB);
      return Object.assign({}, d, { jobs, types: roll(jobs, catchAll) });
    }), NO_DEPT);
  }

  /** Add a set of per-job type splits into one row per type. Safe to sum: every position has exactly one job
   *  and one type, so the merged rows still close the level above them (the same argument as `mergeByRecruiter`). */
  function roll(jobs, catchAll) {
    const bag = {};
    jobs.forEach((j) => j.types.forEach((t) => {
      const x = bag[t.key] || (bag[t.key] = Object.assign({ key: t.key }, blank()));
      x.total += t.total;
      STATES.forEach((s) => { x[s] += t[s]; });
    }));
    return order(Object.values(bag), catchAll);
  }

  function leaves(tree, catchAll) { return roll(tree.map((d) => ({ types: d.types })), catchAll); }

  /** The Budget ledger's rows: the same departments and jobs, plus how many positions could carry a budget. */
  function ledger(tree) {
    const carry = (types) => types.reduce((n, t) => n + (BUDGET_ROLE_TYPES.has(t.key) ? t.total : 0), 0);
    return tree.map((d) => Object.assign({}, d, {
      canCarryBudget: carry(d.types),
      jobs: d.jobs.map((j) => Object.assign({}, j, { canCarryBudget: carry(j.types) }))
    }));
  }
}

/**
 * Mount the sub-tab. Returns a render() the page calls whenever its filters move.
 *
 * @param {HTMLElement} host   the panel container on the page
 * @param {object} data        the dashboard payload
 * @param {function} getScope  () => ({ sel, jobOk }) — the page's current period and job filter
 */
export function mountTypeBudget(host, data, getScope) {
  if (!host) return () => {};

  const SECTIONS = [
    { id: 'role', label: 'Role Type' },
    { id: 'emp', label: 'Emp Type' },
    { id: 'budget', label: 'Budget' }
  ];
  let active = 'role';

  host.innerHTML = `
    <div class="tb-nest">
      <nav class="tb-rail" aria-label="Type and Budget sections">
        <div class="tb-rail-head">Type &amp; Budget</div>
        ${SECTIONS.map((s) => `<button type="button" class="subtab-chip${s.id === active ? ' active' : ''}"
          data-tb="${s.id}">${esc(s.label)}</button>`).join('')}
      </nav>
      <div class="tb-body"></div>
    </div>`;

  const rail = host.querySelector('.tb-rail');
  const body = host.querySelector('.tb-body');

  rail.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tb]');
    if (!b || b.dataset.tb === active) return;
    active = b.dataset.tb;
    rail.querySelectorAll('[data-tb]').forEach((x) => x.classList.toggle('active', x.dataset.tb === active));
    render();
  });

  function render() {
    const scope = getScope() || {};
    const sel = scope.sel || { wholeWin: false, dayOK: false };
    const ix = typeBudgetIndex(data, sel, scope.jobOk || (() => true));
    // #280: this panel offers Job and Type on the two type tables and Job ALONE on Budget, whose money columns
    // belong to a department and have no type level at all — a tick that moves nothing is a bug (Rule 13).
    // It is re-asserted on every render, so switching the rail inside this sub-tab keeps the ticks honest.
    const lvId = scope.levelsId;
    // #280b: Type is a row of COLUMNS now, not a level, so Job is the only level left to offer — and the
    // Expand all tick comes out of hiding, which is what he asked for ("i need a Expan All tick box").
    if (lvId) showLevels(lvId, ['job'], true);
    const LV = lvId ? levelsOn(lvId) : { job: true };
    const expandAll = lvId ? expandAllOn(lvId) : false;
    if (active === 'role') body.innerHTML = rolePanel(ix, LV, expandAll);
    else if (active === 'emp') body.innerHTML = empPanel(ix, LV, expandAll);
    else {
      // 🔑 A starting budget belongs to ONE department in ONE quarter, so the cell is only editable when a
      //    single whole quarter is selected. Over a range or several quarters there is no one key to write
      //    to, and inventing one would file the figure against the wrong period.
      const qs = (sel.winQs || []);
      const oneQ = sel.wholeWin && qs.length === 1 ? qs[0] : null;
      body.innerHTML = budgetPanel(ix, oneQ, LV);
      // The store loads lazily with the page; if this panel is reached before it has, fill it and redraw.
      if (oneQ && !notesLoadedAt()) loadNotes().then(() => { if (active === 'budget') render(); });
    }
  }

  // One listener on the body, so it survives every re-render of the table inside it.
  body.addEventListener('change', async (e) => {
    const inp = e.target.closest('.tb-set');
    if (!inp) return;
    const dept = inp.dataset.dept, q = inp.dataset.q;
    inp.disabled = true;
    const res = await publishBudget(dept, q, inp.value);
    inp.disabled = false;
    if (!res.ok) window.alert(res.reason || 'That did not save.');
    render();
  });

  // #280: ONE delegated click listener for the whole tree, on the body — it survives every re-render of the
  // table inside it, which a listener bound per row would not (the bug pattern behind #172c).
  // 🔑 Only a row that HAS children carries `data-exp`, so a leaf department is inert rather than a row that
  // pretends to open. The Budget panel's department rows use the same listener and the same data attributes.
  body.addEventListener('click', (e) => {
    if (e.target.closest('input')) return;          // typing a budget figure must not collapse its department
    const tr = e.target.closest('tr[data-exp]');
    if (!tr) return;
    // ⚠ A HIDDEN ROW DOES NOT TOGGLE. A person cannot click one, but `.click()` from a script can, and opening a
    // collapsed department's job leaves its type rows stranded under a shut parent. It cost a confused reading of
    // a screenshot once; the guard makes the component say what it means.
    if (tr.offsetParent === null) return;
    const tb = tr.closest('tbody');
    if (!tb) return;
    const open = tr.dataset.exp !== '1';
    tr.dataset.exp = open ? '1' : '0';
    caret(tr, open);
    if (tr.classList.contains('tb-l1')) {
      const g = tr.dataset.g;
      // What hangs directly under a department: its jobs when the Job level is on, and its own type rows when
      // it is off (those carry no `data-j`, which is what tells the two apart).
      tb.querySelectorAll(`tr.tb-l2[data-g="${g}"], tr.tb-l3[data-g="${g}"]:not([data-j])`)
        .forEach((k) => { k.style.display = open ? '' : 'none'; });
      // Closing a department closes the jobs inside it, so re-opening it never reveals a half-open tree.
      if (!open) tb.querySelectorAll(`tr.tb-l2[data-g="${g}"][data-exp]`).forEach((j) => {
        j.dataset.exp = '0';
        caret(j, false);
        tb.querySelectorAll(`tr.tb-l3[data-j="${j.dataset.j}"]`).forEach((x) => { x.style.display = 'none'; });
      });
    } else {
      tb.querySelectorAll(`tr.tb-l3[data-j="${tr.dataset.j}"]`)
        .forEach((x) => { x.style.display = open ? '' : 'none'; });
    }
  });

  render();
  return render;
}

/** Turn one row's caret. ▸ shut, ▾ open — the same two glyphs the Fulfilment trees use. */
function caret(tr, open) {
  const c = tr.querySelector('.tb-caret');
  if (c) c.textContent = open ? '\u25be' : '\u25b8';
}

/* ---------- the panels ---------- */

function cards(totals) {
  return `<div class="cards">
    <div class="card"><div class="label">Total Positions</div><div class="value">${totals.total}</div>
      <div class="sub">opened in this period</div></div>
    <div class="card"><div class="label">Joined</div><div class="value" style="color:var(--green)">${totals.joined}</div>
      <div class="sub">someone moved to Hired</div></div>
    <div class="card"><div class="label">Joining Pipeline</div><div class="value" style="color:var(--orange)">${totals.jp}</div>
      <div class="sub">somebody closing against it</div></div>
    <div class="card"><div class="label">Delta</div><div class="value">${totals.delta}</div>
      <div class="sub">still to fill</div></div>
  </div>`;
}

/** The distribution bar. 🔑 THE TABLE COMPUTES, THE BAR READS — both take the same `rows`, so they cannot
 *  drift (Rule 3). Each row's track is its share of the biggest row; the segments are its own split. */
function barChart(rows, axisLabel) {
  if (!rows.length) return '';
  const max = rows.reduce((m, r) => Math.max(m, r.total), 0) || 1;
  return `<div class="tb-chart">
    <div class="tb-legend">${STATES.map((s) =>
      `<span class="tb-key"><span class="tb-sw" style="background:${STATE_COLOUR[s]}"></span>${STATE_LABEL[s]}</span>`
      ).join('')}</div>
    ${rows.map((r) => `
      <div class="tb-row">
        <div class="tb-lab">${esc(r.key)}</div>
        <div class="tb-track">
          <div class="tb-bar" style="width:${(r.total / max * 100).toFixed(2)}%">
            ${STATES.filter((s) => r[s] > 0).map((s) =>
              `<div class="tb-seg" style="width:${(r[s] / r.total * 100).toFixed(2)}%;background:${STATE_COLOUR[s]}"
                 title="${STATE_LABEL[s]}: ${r[s]}"></div>`).join('')}
          </div>
          <span class="tb-tot">${r.total}</span>
        </div>
      </div>`).join('')}
    <div class="tb-axis">${esc(axisLabel)}</div>
  </div>`;
}

/**
 * Department ➔ Job, with the TYPE as COLUMNS (#280b — Jerin, 6 Nov 2026).
 *
 * 🚨 TYPE USED TO BE THE THIRD LEVEL OF A TREE AND IS NOW A ROW OF COLUMNS. That was the whole point: his
 * complaint was *"If i have to understand the the new/replacement spluit in a department - no way of figuring
 * that, as that differentiation is at role level"* — as a nested level it could only be read by opening every
 * job and adding the leaves up by hand. As columns, a department's split reads straight off its own row.
 * ⚠ So the **Type** level tick no longer moves anything here and is NOT offered (Rule 13); see `render()`.
 *
 * 🔑 IT RENDERS, IT DOES NOT COUNT. Every figure — including a department's own type split — was counted in
 * `typeBudgetIndex`. This function looks up and prints; it sums nothing, so no row can disagree with the row
 * above it or with the bar chart beside it (CLAUDE.md Rule 3).
 * ⚠ The first column's header follows the Job tick, so it never names a level that is not on screen.
 * ⚠ `totals` must arrive carrying its own `types` array, or the total row's type columns read zero while its
 *    Total positions reads the real figure — the kind of silent disagreement Rule 3 exists to stop.
 */
function typeColumnTable(tree, typeOrder, totals, LV, expandAll) {
  const head = LV.job ? 'Department / Job' : 'Department';
  const ind = (n) => CARET_GAP.repeat(n);

  /** One figure, with room under it for the money this table does not have a source for yet (#294). */
  const cell = (n, ink, first) =>
    `<td class="tb-num${first ? ' tb-sep' : ''}">`
    + (n ? `<span class="tb-c"${ink ? ` style="color:${ink}"` : ''}>${n}</span>`
         : '<span class="tb-c tb-z">0</span>')
    + '</td>';

  /** A row's figures, in the order the headers read. It LOOKS UP, it never adds: every number here was
   *  counted in `typeBudgetIndex`, so a job row cannot disagree with its department (Rule 3). */
  const nums = (r) => {
    const by = {};
    (r.types || []).forEach((t) => { by[t.key] = t.total; });
    return `<td class="tb-num">${r.total}</td>`
      + typeOrder.map((t, i) => cell(by[t] || 0, '', i === 0)).join('')
      + STATES.map((st, i) => cell(r[st], STATE_INK[st], i === 0)).join('');
  };

  let html = '';
  tree.forEach((d, gi) => {
    const opens = LV.job && d.jobs.length > 0;
    const open = opens && expandAll;
    html += `<tr class="tb-l1 dept-header" data-g="${gi}"`
      + (opens ? ` data-exp="${open ? 1 : 0}" style="cursor:pointer"` : '') + '>'
      + `<td>${opens ? (open ? CARET_OPEN : CARET) : CARET_GAP}${esc(d.key)}</td>${nums(d)}</tr>`;
    if (LV.job) d.jobs.forEach((j) => {
      html += `<tr class="tb-l2" data-g="${gi}" style="display:${open ? '' : 'none'}">`
        + `<td>${ind(1)}${CARET_GAP}${esc(j.key)}</td>${nums(j)}</tr>`;
    });
  });

  return `<div class="scroll-table"><table class="tb-table tb-cols">
    <thead>
      <tr class="tb-grp"><th></th><th></th>
        <th class="tb-sep" colspan="${typeOrder.length}">Why the position exists</th>
        <th class="tb-sep" colspan="${STATES.length}">Where it stands</th></tr>
      <tr><th>${esc(head)}</th><th>Total positions</th>
        ${typeOrder.map((t, i) => `<th class="tb-tight${i === 0 ? ' tb-sep' : ''}">${esc(t)}</th>`).join('')}
        ${STATES.map((st, i) => `<th class="tb-tight${i === 0 ? ' tb-sep' : ''}">${STATE_LABEL[st]}</th>`).join('')}
      </tr>
    </thead>
    <tbody>
      ${html}
      ${tree.length ? `<tr class="tb-tot-row"><td>Total</td>${nums(totals)}</tr>` : ''}
    </tbody>
  </table></div>`;
}

/** The heading and the ONE line of live state above a tree table: what opens, and nothing else — above a table
 *  there is live state only, and "click to drill in" is the sanctioned case. */
function treeHead(LV) {
  return '<h3 class="subsection-title">Where those positions sit</h3>'
    + (LV.job ? '<p class="sub-note">Click a department to open the roles inside it.</p>' : '');
}

function emptyNote(what) {
  return `<p class="sub-note">No positions were opened in this period, so there is nothing to split by ${esc(what)}.</p>`;
}

function rolePanel(ix, LV, expandAll) {
  const n = ix.roleRows.length;
  // ⚠ A dated, measured note is honest; a live count inside explanation text goes stale within a day and
  // nothing tells you (CLAUDE.md Rule 6). This one is computed from what is on screen, so it cannot.
  const src = ix.source;
  const fallback = src.name > 0
    ? `<p class="sub-note">${src.field} of these read their role type from the field on the position; ${src.name}
       fall back to the position's name.</p>` : '';
  return `
    <h3 class="subsection-title">Positions by role type</h3>
    <p class="sub-note">Why each position exists, against whether it has been filled.</p>
    ${cards(ix.totals)}
    ${n ? barChart(ix.roleRows, 'Positions') : ''}
    ${n ? treeHead(LV) : ''}
    ${n ? typeColumnTable(ix.roleTree, ix.roleRows.map((r) => r.key),
            Object.assign({}, ix.totals, { types: ix.roleRows }), LV, expandAll) : emptyNote('role type')}
    ${fallback}
    ${defsBlock('tb-roletype')}`;
}

function empPanel(ix, LV, expandAll) {
  const n = ix.empRows.length;
  const unknown = ix.empRows.find((r) => r.key === NO_EMP_TYPE);
  // The gap is worth naming on screen, because it is the one thing that makes this table misleading.
  const note = unknown && unknown.total
    ? `<p class="sub-note" style="color:var(--orange)">${unknown.total} of ${ix.totals.total} positions carry no
       contract type. They are shown in their own row rather than dropped, so the total still adds up.</p>` : '';
  return `
    <h3 class="subsection-title">Positions by contract type</h3>
    <p class="sub-note">What kind of contract each position is, against whether it has been filled.</p>
    ${cards(ix.totals)}
    ${n ? barChart(ix.empRows, 'Positions') : ''}
    ${n ? treeHead(LV) : ''}
    ${n ? typeColumnTable(ix.empTree, ix.empRows.map((r) => r.key),
            Object.assign({}, ix.totals, { types: ix.empRows }), LV, expandAll) : emptyNote('contract type')}
    ${note}
    ${defsBlock('tb-emptype')}`;
}

function budgetPanel(ix, oneQ, LV) {
  const canCarry = ix.deptRows.reduce((s, d) => s + d.canCarryBudget, 0);
  const none = '<span class="tb-none">not held anywhere</span>';
  const inr = (v) => (v === '' || v == null) ? '' : Number(v).toLocaleString('en-IN');
  // The one cell that can hold a figure. Editable only against a single whole quarter — see render().
  const startCell = (dept) => {
    if (!oneQ) return '<span class="tb-none">pick one quarter</span>';
    const b = budgetOf(dept, oneQ);
    const val = b ? inr(b.amount) : '';
    const mark = b && b.unsaved ? ' tb-unsaved' : '';
    return `<input class="tb-set${mark}" type="text" inputmode="numeric" maxlength="18"
      value="${esc(val)}" data-dept="${esc(dept)}" data-q="${esc(oneQ)}"
      placeholder="set a figure" aria-label="Starting budget for ${esc(dept)} in ${esc(oneQ)}"
      title="${b && b.unsaved ? 'Not confirmed saved yet' : (b && b.by ? 'Set by ' + esc(b.by) : 'Digits only')}">`;
  };
  return `
    <h3 class="subsection-title">Budget status by department</h3>
    <p class="sub-note">Positions opened in this period, by department. Amounts in rupees.${
      LV.job ? ' Click a department to open the jobs inside it.' : ''}</p>
    <div class="tb-flag">
      <b>No position in Ashby carries a budget figure today, so the three money columns are empty on purpose.</b>
      Measured 20 Oct 2026 across every position in the workspace. A budget is asked for only when a position is
      raised as a <b>Replacement</b> or <b>Anticipation Of Exit</b> &mdash; ${canCarry} of ${ix.totals.total} here
      &mdash; and that was made compulsory only on 20 Oct, so positions raised before then have none.
      <b>What an offer costs is not held anywhere the dashboard can read.</b> An empty cell is not a zero.
      ${oneQ ? `<br><b>Starting point is yours to type</b> &mdash; digits only, saved against ${esc(oneQ)}.
        Delta stays empty until the two middle columns have a source.`
             : '<br><b>Pick a single quarter above to type a starting point</b> &mdash; a budget is saved against one quarter, so a range has no single place to file it.'}
    </div>
    <div class="scroll-table"><table class="tb-table tb-budget">
      <thead><tr><th>${LV.job ? 'Department / Job' : 'Department'}</th><th>Positions</th>
        <th>Starting point</th><th>Added from Replacement / Anticipation</th>
        <th>Spent on new &amp; replacement offers</th><th>Delta</th></tr></thead>
      <tbody>
        ${ix.deptRows.map((d, gi) => {
          const opens = LV.job && d.jobs.length > 0;
          // 🔑 A job row shows POSITIONS and nothing else. A starting budget is saved against one department in
          //    one quarter, so there is no key to file a job's figure against — a dash, never an empty box that
          //    looks typeable. The money columns stay the department's.
          return `<tr class="tb-l1 dept-header" data-g="${gi}"${opens ? ' data-exp="0" style="cursor:pointer"' : ''}>`
            + `<td>${opens ? CARET : CARET_GAP}${esc(d.key)}</td><td>${d.total}</td>`
            + `<td>${startCell(d.key)}</td><td>${none}</td><td>${none}</td>`
            + `<td><span class="tb-none">&mdash;</span></td></tr>`
            + (LV.job ? d.jobs.map((j) => `<tr class="tb-l2" data-g="${gi}" style="display:none">`
              + `<td>${CARET_GAP}${CARET_GAP}${esc(j.key)}</td><td>${j.total}</td>`
              + `<td><span class="tb-none">&mdash;</span></td><td>${none}</td><td>${none}</td>`
              + `<td><span class="tb-none">&mdash;</span></td></tr>`).join('') : '');
        }).join('')}
        ${ix.deptRows.length ? `<tr class="tb-tot-row"><td>Total</td><td>${ix.totals.total}</td>
          <td><span class="tb-none">&mdash;</span></td><td><span class="tb-none">&mdash;</span></td>
          <td><span class="tb-none">&mdash;</span></td><td><span class="tb-none">&mdash;</span></td></tr>` : ''}
      </tbody>
    </table></div>
    ${ix.deptRows.length ? '' : emptyNote('department')}
    ${defsBlock('tb-budget')}`;
}
