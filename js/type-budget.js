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

/** What a row shows when the field has not been filled in. Shown, never dropped, so the total still adds up. */
export const NO_ROLE_TYPE = '(role type not set)';
export const NO_EMP_TYPE = '(contract type not set)';

/** The two role types that are raised WITH a budget — the Req Bot asks for one only for these (#244c). */
export const BUDGET_ROLE_TYPES = new Set(['Replacement', 'Anticipation Of Exit']);

/** Filled status, in the order the columns read. `state` on an opening row is one of exactly these three. */
const STATES = ['joined', 'open', 'missed'];

/** The three colours the Fulfilment charts already use, so a bar here means what a bar there means. */
const STATE_COLOUR = { joined: '#398AA2', open: '#4E6BA6', missed: '#D8B5BE' };
const STATE_LABEL = { joined: 'Filled', open: 'Open', missed: 'Missed' };

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Group the positions of the selected period three ways.
 *
 * @param {object} data  the dashboard payload
 * @param {object} sel   the SAME period selection Position Fulfilment used:
 *                       { wholeWin, winQs, dayOK, inDay } — see `topicIndex()`, which this mirrors exactly.
 * @param {function} jobOk  (job8) => boolean, the page's department/job filter. Never invented here.
 * @returns {object} { roleRows, empRows, deptRows, totals, source }
 */
export function typeBudgetIndex(data, sel, jobOk) {
  const rows = (data && data.openingRows) || null;
  const jobIndex = (data && data.jobIndex) || {};
  const empty = { roleRows: [], empRows: [], deptRows: [], totals: blank(), source: { field: 0, name: 0, none: 0 } };
  if (!rows || !rows.length) return empty;

  const take = (r) => {
    if (!jobOk(r.jobId8)) return false;
    if (sel.wholeWin) return sel.winQs.includes(r.quarter);
    if (sel.dayOK) return !!r.day && sel.inDay(r.day);
    return false;
  };

  const byRole = {}, byEmp = {}, byDept = {};
  const totals = blank();
  const source = { field: 0, name: 0, none: 0 };

  rows.forEach((r) => {
    if (!take(r)) return;
    const st = STATES.indexOf(r.state) >= 0 ? r.state : null;

    bump(byRole, r.roleType || NO_ROLE_TYPE, st);
    bump(byEmp, r.empType || NO_EMP_TYPE, st);

    const dept = (jobIndex[r.jobId8] || {}).department || '(no department)';
    const d = byDept[dept] || (byDept[dept] = { key: dept, total: 0, canCarryBudget: 0 });
    d.total++;
    if (BUDGET_ROLE_TYPES.has(r.roleType)) d.canCarryBudget++;

    totals.total++;
    if (st) totals[st]++;
    source[r.roleTypeSource === 'field' ? 'field' : (r.roleTypeSource === 'name' ? 'name' : 'none')]++;
  });

  return {
    roleRows: order(byRole, NO_ROLE_TYPE),
    empRows: order(byEmp, NO_EMP_TYPE),
    deptRows: Object.values(byDept).sort((a, b) => b.total - a.total || a.key.localeCompare(b.key)),
    totals,
    source
  };

  function blank() { return { total: 0, joined: 0, open: 0, missed: 0 }; }
  function bump(map, key, st) {
    const t = map[key] || (map[key] = Object.assign({ key }, blank()));
    t.total++;
    if (st) t[st]++;
  }
  // The catch-all sits LAST however big it is: it is a gap marker, not a type.
  function order(map, catchAll) {
    return Object.values(map).sort((a, b) => {
      if (a.key === catchAll) return 1;
      if (b.key === catchAll) return -1;
      return b.total - a.total || a.key.localeCompare(b.key);
    });
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
    const ix = typeBudgetIndex(data, scope.sel || { wholeWin: false, dayOK: false }, scope.jobOk || (() => true));
    if (active === 'role') body.innerHTML = rolePanel(ix);
    else if (active === 'emp') body.innerHTML = empPanel(ix);
    else body.innerHTML = budgetPanel(ix);
  }

  render();
  return render;
}

/* ---------- the panels ---------- */

function cards(totals) {
  return `<div class="cards">
    <div class="card"><div class="label">Total Positions</div><div class="value">${totals.total}</div>
      <div class="sub">opened in this period</div></div>
    <div class="card"><div class="label">Filled</div><div class="value" style="color:var(--green)">${totals.joined}</div>
      <div class="sub">someone moved to Hired</div></div>
    <div class="card"><div class="label">Open</div><div class="value" style="color:var(--blue)">${totals.open}</div>
      <div class="sub">still to fill</div></div>
    <div class="card"><div class="label">Missed</div><div class="value">${totals.missed}</div>
      <div class="sub">carried forward unfilled</div></div>
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

function table(rows, firstHeader, totals) {
  const row = (r, cls) => `<tr${cls ? ` class="${cls}"` : ''}><td>${esc(r.key)}</td><td>${r.total}</td>
    ${STATES.map((s) => `<td>${r[s]}</td>`).join('')}</tr>`;
  return `<div class="scroll-table"><table class="tb-table">
    <thead><tr><th>${esc(firstHeader)}</th><th>Total positions</th>
      ${STATES.map((s) => `<th>${STATE_LABEL[s]}</th>`).join('')}</tr></thead>
    <tbody>
      ${rows.map((r) => row(r)).join('')}
      ${rows.length ? row(Object.assign({ key: 'Total' }, totals), 'tb-tot-row') : ''}
    </tbody>
  </table></div>`;
}

function emptyNote(what) {
  return `<p class="sub-note">No positions were opened in this period, so there is nothing to split by ${esc(what)}.</p>`;
}

function rolePanel(ix) {
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
    <h3 class="subsection-title">Role type and filled status</h3>
    ${n ? table(ix.roleRows, 'Role type', ix.totals) : emptyNote('role type')}
    ${fallback}
    ${defsBlock('tb-roletype')}`;
}

function empPanel(ix) {
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
    <h3 class="subsection-title">Contract type and filled status</h3>
    ${n ? table(ix.empRows, 'Contract type', ix.totals) : emptyNote('contract type')}
    ${note}
    ${defsBlock('tb-emptype')}`;
}

function budgetPanel(ix) {
  const canCarry = ix.deptRows.reduce((s, d) => s + d.canCarryBudget, 0);
  const none = '<span class="tb-none">not held anywhere</span>';
  return `
    <h3 class="subsection-title">Budget status by department</h3>
    <p class="sub-note">Positions opened in this period, by department. Amounts in rupees.</p>
    <div class="tb-flag">
      <b>No position in Ashby carries a budget figure today, so the three money columns are empty on purpose.</b>
      Measured 20 Oct 2026 across every position in the workspace. A budget is asked for only when a position is
      raised as a <b>Replacement</b> or <b>Anticipation Of Exit</b> &mdash; ${canCarry} of ${ix.totals.total} here
      &mdash; and that was made compulsory only on 20 Oct, so positions raised before then have none.
      <b>What an offer costs is not held anywhere the dashboard can read.</b> An empty cell is not a zero.
    </div>
    <div class="scroll-table"><table class="tb-table tb-budget">
      <thead><tr><th>Department</th><th>Positions</th><th>Can carry a budget</th>
        <th>Starting point</th><th>Added from Replacement / Anticipation</th>
        <th>Spent on new &amp; replacement offers</th><th>Delta</th></tr></thead>
      <tbody>
        ${ix.deptRows.map((d) => `<tr><td>${esc(d.key)}</td><td>${d.total}</td><td>${d.canCarryBudget}</td>
          <td><span class="tb-none">not set</span></td><td>${none}</td><td>${none}</td>
          <td><span class="tb-none">&mdash;</span></td></tr>`).join('')}
        ${ix.deptRows.length ? `<tr class="tb-tot-row"><td>Total</td><td>${ix.totals.total}</td><td>${canCarry}</td>
          <td><span class="tb-none">&mdash;</span></td><td><span class="tb-none">&mdash;</span></td>
          <td><span class="tb-none">&mdash;</span></td><td><span class="tb-none">&mdash;</span></td></tr>` : ''}
      </tbody>
    </table></div>
    ${ix.deptRows.length ? '' : emptyNote('department')}
    ${defsBlock('tb-budget')}`;
}
