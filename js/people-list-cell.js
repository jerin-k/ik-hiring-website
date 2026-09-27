// ===== The people-list CELL — ONE renderer for "Who has joined" and "Who is joining", on every tab =====
// #182c (Jerin, 27 Sep 2026): 🗣 "Then add these columns to Recruiter Effi & Overall Effi" + 🗣 "Painted halves
// travel too", then of three ways to fit them: 🗣 "A".
//
// 🚨 WHY THIS FILE EXISTS. This was `jnWhoCell` inside `hm-report.js`, and its own comment already said the right
//    thing: "It was tempting to copy this for the new column. A second copy is how two columns that are meant to
//    look identical drift apart." Carrying the columns to two more tabs would have made three copies, so the
//    function moved here instead. **Every tab that shows people in a cell imports it from here. Never copy it.**
//
// 🔑 It returns a COMPLETE `<td>`, so a caller appends it rather than wrapping it.
// 🔑 The list and its date are ARGUMENTS, which is what lets one function draw both columns:
//      Who is joining → jnWhoCell(row)                                  (defaults: row.jpWho, dated by doj)
//      Who has joined → jnWhoCell(row, { list: row.joWho, dateOf: c => c.startDate, groupByDate: true })
// 🔑 The CSS lives in `css/style.css` under `.jn-*` and is NOT scoped to one tab — see `td.jn-cell` there.
//    ⚠ It was `.hm-summary td.jn-cell` until #182c; a tab-scoped selector is why this could not travel before.
// 🚨 The "+N more" button needs `moreClick` wired on each tab's tbody, or the extra names can never be shown.

const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const SHOW_FIRST = 3;   // names visible before "+N more"

export function dayLabel(iso) {
  if (!iso || iso.length < 10) return '';
  const d = +iso.slice(8, 10), m = parseInt(iso.slice(5, 7), 10);
  return `${d} ${MON[m - 1] || ''}`;
}

// The "+N more" / "Show fewer" toggle. Call it FIRST from a tab's own click handler and stop if it returns true.
// 🚨 One copy of this logic, because it carries a bug that was fixed once: it must count `.jn-p.jn-extra`, the
//    PEOPLE only. Counting every `.jn-extra` also counts hidden DATE HEADINGS, and a cell with 11 hidden people
//    and one hidden heading reads "+12 more" (#182a3).
export function moreClick(ev) {
  const btn = ev.target.closest('[data-jn-more]');
  if (!btn) return false;
  ev.stopPropagation();
  const cell = btn.closest('td');
  const open = cell.classList.toggle('jn-open');
  btn.textContent = open ? 'Show fewer' : `+${cell.querySelectorAll('.jn-p.jn-extra').length} more`;
  return true;
}

// Wire a tbody that has no click handler of its own (Recruiter, Overall Efficiency). The Hiring Manager tab does
// NOT use this — its tbody already owns a handler for the Remarks editor, and calls moreClick from inside it.
export function wireMoreCells(body) {
  if (!body || body.dataset.jnMoreWired === '1') return;
  body.dataset.jnMoreWired = '1';
  body.addEventListener('click', moreClick);
}

export function jnWhoCell(o, opt = {}) {
  const dateOf = opt.dateOf || (c => c.doj);
  const list = [...(opt.list || o.jpWho || [])].sort((a, b) => String(dateOf(a) || '9999').localeCompare(String(dateOf(b) || '9999'))
    || String(a.candidate || '').localeCompare(String(b.candidate || '')));
  // #161: on a job with topics, the people under its topics are named there; this line says how many, so the job row
  // still accounts for everyone behind its Joining pending figure.
  const under = opt.under ? `<span class="jn-under">${opt.under} under ${opt.under === 1 ? 'its topic' : 'their topics'}</span>` : '';
  if (!list.length) return under ? `<td class="jn-cell jn-who">${under}</td>` : '<td class="jn-cell"><span class="zero">—</span></td>';
  // Name on its own line, then a quiet meta line. "date not set" repeated down the column was noise, so a missing
  // date simply leaves the stage to speak (Jerin, 19 Sep).
  const line = (c, i) => {
    const d = dayLabel(dateOf(c)), st = c.subStage ? esc(c.subStage) : '';
    const meta = [d ? `<span class="jn-d">${esc(d)}</span>` : '', st].filter(Boolean).join(' · ');
    const why = opt.note ? opt.note(c) : '';
    // #182a2 (Jerin, 26 Sep 2026): 🗣 "bring some distinguishment." — mark the joiners who are NOT behind the
    // Joined number beside them, so the two figures stop looking like they disagree for no reason.
    // 🚨 MEASURED FIRST, and it changed what to build: of 157 Q3 joiners, only **7** sit on an earlier quarter's
    //    opening — the case Jerin named — while **40** have NO opening at all. Marking just the 7 would have left
    //    the larger half unexplained, which is the half-fix he has rejected before.
    // 🔑 Same chips and the same words the Joiners sub-tab already uses (`tdQuarter` in people-cells.js), so the
    //    two views say the same thing about the same person rather than inventing a second vocabulary.
    const tag = opt.tagOf ? opt.tagOf(c) : '';
    return `<span class="jn-p${i >= SHOW_FIRST ? ' jn-extra' : ''}"><b>${esc(c.candidate || '(no name)')}</b>`
      + (meta || tag ? `<span class="jn-m">${meta}${tag}</span>` : '') + (why ? `<span class="jn-r">${esc(why)}</span>` : '') + '</span>';
  };
  const more = list.length > SHOW_FIRST
    ? `<button type="button" class="jn-more" data-jn-more="1">+${list.length - SHOW_FIRST} more</button>` : '';
  // ===== #182a3 option C (Jerin, 26 Sep 2026: "go with C - but i like the green for date") =====
  // The same date was stamped on EVERY person under it — "29 Jul" eleven times in one cell. Said once as a
  // heading with its people beneath, it stops being clutter and starts saying "these people arrived together".
  // A thin rule and a little air between groups is what makes a long list scannable; without it the names read
  // as a wall. Where every date is unique this renders exactly as it did before, one heading per person.
  // 🔑 The heading keeps the GREEN the per-person date already used (`.jn-who .jn-d`) — his call, and it means
  //    the colour still says "date" wherever it appears rather than changing meaning between the two columns.
  if (opt.groupByDate) {
    let out = '', last = null, n = 0;
    list.forEach((c) => {
      const d = dayLabel(dateOf(c)) || 'date not set';
      if (d !== last) { out += `<span class="jn-dh${n >= SHOW_FIRST ? ' jn-extra' : ''}">${esc(d)}</span>`; last = d; }
      const tag = opt.tagOf ? opt.tagOf(c) : '';
      out += `<span class="jn-p jn-pg${n >= SHOW_FIRST ? ' jn-extra' : ''}"><b>${esc(c.candidate || '(no name)')}</b>`
        + (tag ? `<span class="jn-m">${tag}</span>` : '') + `</span>`;
      n++;
    });
    return `<td class="jn-cell jn-who jn-grouped">${out}${more}${under}</td>`;
  }
  return `<td class="jn-cell jn-who">${list.map(line).join('')}${more}${under}</td>`;
}