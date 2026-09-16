// #137c (Jerin, 15 Sep 2026 — option B of mock-up 3): light shading for the four number grids — Momentum day by day, Time in Process,
// Hiring Manager Pipeline and Sourcing Mix, on every tab that shows them. Each function is a pass over a table the page has ALREADY
// filled: it never changes a number, a row, a column or the order. It wraps what is there in a tinted span, adds a weekday line, a bar or
// a label, and leaves each cell's text as it was. Call it straight after the render that fills the <tbody>; expanding and collapsing the
// tree only shows and hides rows, so the shading survives it. Styles: the `.gs-*` block at the end of style.css.
// Teal = how many (deeper = more) · slate = how long a stage took · amber → rose = how long people have been waiting.

import { uiPx } from './ui-scale.js';   // #140

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const step = (v, max) => (v > 0 && max > 0 ? Math.max(1, Math.min(5, Math.ceil((v / max) * 5))) : 0);
const numOf = (td) => { const t = td ? td.textContent.replace(/[,\s]/g, '') : ''; return /^\d+(\.\d+)?$/.test(t) ? +t : 0; };
const maxOf = (vals) => Math.max(0, ...vals);
// A band row — a pod or a department. Shaded against the other bands, never against the rows inside them.
const isTop = (tr) => tr.classList.contains('lvl-pod') || tr.classList.contains('lvl-dept') || tr.classList.contains('dept-header')
  || (tr.hasAttribute('data-path') && !tr.dataset.path.includes('-'));
const depthOf = (tr) => (tr.dataset.path || '').split('-').length;
const tint = (td, n, cls) => { if (td && n) td.innerHTML = `<span class="${cls} gs-h${n}">${td.innerHTML}</span>`; };

// Momentum: `dates` = the Date for each day column, in the order the header draws them (columns 3+ after name and total).
export function shadeMomentum(tbody, dates) {
  const table = tbody && tbody.closest('table');
  if (!table || !dates || !dates.length) return;
  const FIRST = 2;
  const dayMs = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const monday = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x.getTime(); };
  const today = dayMs(new Date());
  // weekend columns are greyed; a thin line runs down the first column of each new Monday-to-Sunday week, whichever way the days run
  const colCls = dates.map((d, i) => [d.getDay() === 0 || d.getDay() === 6 ? 'gs-wkend' : '', i > 0 && monday(d) !== monday(dates[i - 1]) ? 'gs-wkedge' : ''].filter(Boolean));
  const ths = table.querySelectorAll('thead th');
  dates.forEach((d, i) => {
    const th = ths[FIRST + i]; if (!th) return;
    th.classList.add(...colCls[i]);
    const isToday = dayMs(d) === today;
    if (!th.querySelector('.gs-dow')) th.insertAdjacentHTML('beforeend', `<span class="gs-dow${isToday ? ' is-today' : ''}">${isToday ? 'Today' : WD[d.getDay()]}</span>`);
  });
  const rows = [...tbody.rows].filter(tr => tr.cells.length === FIRST + dates.length);
  const tops = rows.filter(isTop), rest = rows.filter(tr => !isTop(tr));
  const days = (tr) => [...tr.cells].slice(FIRST);
  const topMax = maxOf(tops.flatMap(tr => days(tr).map(numOf))), restMax = maxOf(rest.flatMap(tr => days(tr).map(numOf)));
  rows.forEach(tr => {
    const max = isTop(tr) ? topMax : restMax;
    days(tr).forEach((td, i) => { td.classList.add(...colCls[i]); tint(td, step(numOf(td), max), 'gs-hc'); });
  });
  // a small bar beside each total one level in — recruiters on Recruiter Efficiency, jobs on Overall Efficiency
  const second = rest.filter(tr => depthOf(tr) === 2);
  const totMax = maxOf(second.map(tr => numOf(tr.cells[1])));
  second.forEach(tr => {
    const v = numOf(tr.cells[1]);
    if (v > 0) tr.cells[1].insertAdjacentHTML('beforeend', `<span class="gs-bar" style="width:${uiPx(Math.max(3, Math.round((v / totMax) * 36)))}px"></span>`);
  });
}

// Time in Process: each median is shaded against the others in its stage column; the waiting pile keeps its TWO stacked lines
// (Jerin, 30 Aug: "20 · 212.5d" on one line read as a decimal) inside a label that darkens with time — rose after 30 days.
export function shadeTis(tbody) {
  const rows = tbody ? [...tbody.rows] : [];
  if (!rows.length) return;
  const medOf = (td) => { const m = td && td.querySelector('.tis-med:not(.none)'); return m ? (parseFloat(m.textContent) || 0) : null; };
  const ncol = Math.max(...rows.map(r => r.cells.length));
  const tops = rows.filter(isTop), rest = rows.filter(tr => !isTop(tr));
  for (let k = 1; k < ncol; k++) {
    for (const group of [tops, rest]) {
      const max = maxOf(group.map(tr => medOf(tr.cells[k]) || 0));
      group.forEach(tr => {
        const m = medOf(tr.cells[k]); const n = m == null ? 0 : step(m, max);
        if (n) tr.cells[k].querySelector('.tis-med').classList.add('gs-m', 'gs-m' + n);
      });
    }
  }
  rows.forEach(tr => [...tr.cells].forEach(td => {
    const w = td.querySelectorAll(':scope > .tis-wait');
    if (w.length !== 2) return;
    const d = parseInt(w[1].textContent, 10) || 0;
    const box = document.createElement('span');
    box.className = 'gs-wait ' + (d > 30 ? 'gs-w3' : d >= 7 ? 'gs-w2' : 'gs-w1');
    td.insertBefore(box, w[0]); box.append(w[0], w[1]);
  }));
}

// Pipeline: every stage column (after Department and Total) is shaded against its own largest number — App Review runs into the
// thousands while R3 is in single digits. Departments against departments, jobs against jobs; the Total row is left alone.
export function shadePipeline(tbody) {
  const rows = tbody ? [...tbody.rows].filter(tr => !tr.classList.contains('totals-row')) : [];
  if (!rows.length) return;
  const ncol = Math.max(...rows.map(r => r.cells.length));
  const groups = [rows.filter(isTop), rows.filter(tr => !isTop(tr))];
  for (let k = 2; k < ncol; k++) {
    groups.forEach(g => { const max = maxOf(g.map(tr => numOf(tr.cells[k]))); g.forEach(tr => tint(tr.cells[k], step(numOf(tr.cells[k]), max), 'gs-pc')); });
  }
}

// Sourcing Mix: each % becomes a share bar. Rows 3 deep are source types, 4 deep their source names. `colorOf(type, name, kind)` comes
// from the chart above the table, so a bar takes the colour its type (Recruiter Efficiency) or its source name (Overall Efficiency) has
// in that chart. Anything the chart gives no colour — and every bar before the chart is first drawn — stays slate.
export function shareBars(tbody, colorOf) {
  if (!tbody) return;
  let type = '';
  [...tbody.rows].forEach(tr => {
    const td = tr.cells[tr.cells.length - 1];
    const txt = td ? td.textContent.trim() : '';
    if (!/%$/.test(txt)) return;
    const depth = depthOf(tr);
    const label = tr.cells[0].textContent.replace(/[▸▾]/g, '').trim();
    if (depth === 3) type = label;
    const kind = depth <= 2 ? 'lvl' : depth === 3 ? 'type' : 'name';
    if (kind !== 'lvl') { td.dataset.gsType = type; td.dataset.gsKind = kind; if (kind === 'name') td.dataset.gsName = label; }
    td.innerHTML = `<span class="gs-share gs-${kind}"><span class="gs-track"><span class="gs-fill" style="width:${Math.min(100, parseFloat(txt) || 0)}%"></span></span><b>${txt}</b></span>`;
  });
  colorShareBars(tbody, colorOf);
}
export function colorShareBars(tbody, colorOf) {
  if (!tbody || typeof colorOf !== 'function') return;
  tbody.querySelectorAll('td[data-gs-kind]').forEach(td => {
    const f = td.querySelector('.gs-fill'); const c = colorOf(td.dataset.gsType, td.dataset.gsName || '', td.dataset.gsKind);
    if (f) f.style.background = c || '';
  });
}
