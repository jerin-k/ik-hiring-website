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

// #252b (Jerin, 20 Oct 2026): TWO names before "+N more", not three. 🗣 "Show two names ... rest behind more".
// 🔑 ONE constant, so all three tabs move together — he approved that explicitly rather than per-tab numbers.
// ⚠ It only earns its keep now: #252g made every number cell two lines tall, so a three-name list is what
//   sets the row height. Width does not fix height (#252a did the width).
export const SHOW_FIRST = 2;   // names visible before "+N more"

// ===== #252b: a long REMARK is cut to the same height, with its own "more" =====
// 🔑 It lives HERE, beside the names cell, for the reason the file header already gives: two cells meant to
//    stand the same height drift apart the moment there are two copies. The Hiring Manager tab draws the
//    remark as an editable button and Overall Efficiency as read-only text; BOTH call this.
// ⚠ The cut itself is CSS (`.jn-rem`/`.jn-note-ro` are line-clamped) — this only decides whether the control
//    is worth drawing, so nothing is hidden without a way to open it. The Recruiter tables have no Remarks
//    column at all, which is why this reaches two tabs and the names cap reaches three.
// 🚨 THE CONTROL IS DECIDED BY REAL OVERFLOW, NOT BY A CHARACTER COUNT, and the first build got this wrong.
//    A count was tried first (90 characters, the figure the mock used) and measured WRONG on the real table:
//    #252a and #252g took Remarks from 115px to 438px, so 155 characters now fits inside the clamp with room
//    to spare — the control appeared on a remark that was not cut, revealed nothing, and added a line, making
//    the row 78px ➔ 80px. A control that hides nothing is worse than no control.
//    🔑 So the button is always DRAWN and only SHOWN on a cell `markRemarkOverflow` has found to be clipped.
//    [[feedback_self-consistency-is-not-proof]] — the mock's 90 agreed with the mock's own column width.
export function remarkMore() {
  return `<button type="button" class="jn-more jn-rmore" data-jn-more="1">more</button>`;
}

// Call after a render: flags the remark cells whose text is ACTUALLY clipped, so only those show "more".
// ⚠ Must run after layout — a cell measures 0 while its row is display:none, so a hidden tree row would be
//   read as "not clipped". Rows opened later are re-checked by calling this again.
export function markRemarkOverflow(root) {
  if (!root) return;
  root.querySelectorAll('td.jn-rem').forEach(cell => {
    const txt = cell.querySelector('.jn-text, .jn-note-ro');
    if (!txt) return;
    if (cell.offsetParent === null) return;              // hidden row: leave it for the next pass
    const clipped = txt.scrollHeight > txt.clientHeight + 1;
    cell.classList.toggle('jn-rtrunc', clipped);
  });
}

export function dayLabel(iso) {
  if (!iso || iso.length < 10) return '';
  const d = +iso.slice(8, 10), m = parseInt(iso.slice(5, 7), 10);
  return `${d} ${MON[m - 1] || ''}`;
}

// The "+N more" / "Show fewer" toggle. Call it FIRST from a tab's own click handler and stop if it returns true.
// 🚨 One copy of this logic, because it carries a bug that was fixed once: it must count `.jn-p.jn-extra`, the
//    PEOPLE only. Counting every `.jn-extra` also counts hidden DATE HEADINGS, and a cell with 11 hidden people
//    and one hidden heading reads "+12 more" (#182a3).
// 🚨 #193a (Jerin, 28 Sep 2026): 🗣 *"clicking on it open the Topic rows than showing who are the 7 ppl hehe!"*
// A tree row owns its OWN click listener, so it runs BEFORE this file's tbody listener and `stopPropagation()`
// below is far too late to stop it — the row toggled and, on the Recruiter tab, the names never opened at all.
// Every tree row handler must therefore ASK FIRST whether the click belongs to a people cell. The Hiring
// Manager tab already did the equivalent (it calls `moreClick` first inside its one handler and returns),
// which is why it was the only tab of the three that worked.
// 🔑 ONE definition of "this click is the people cell's", so a new tree cannot guess at its own.
const moreBtn = (ev) => { const t = ev && ev.target; return (t && t.closest) ? t.closest('[data-jn-more]') : null; };
export function isMoreClick(ev) { return !!moreBtn(ev); }

export function moreClick(ev) {
  const btn = moreBtn(ev);
  if (!btn) return false;
  ev.stopPropagation();
  const cell = btn.closest('td');
  const open = cell.classList.toggle('jn-open');
  // #252b: a REMARK's control says more/less — counting `.jn-p.jn-extra` in a remark cell would read "+0 more".
  btn.textContent = btn.classList.contains('jn-rmore')
    ? (open ? 'less' : 'more')
    : (open ? 'Show fewer' : `+${cell.querySelectorAll('.jn-p.jn-extra').length} more`);
  return true;
}

// Wire a tbody that has no click handler of its own (Recruiter, Overall Efficiency). The Hiring Manager tab does
// NOT use this — its tbody already owns a handler for the Remarks editor, and calls moreClick from inside it.
export function wireMoreCells(body) {
  if (!body || body.dataset.jnMoreWired === '1') return;
  body.dataset.jnMoreWired = '1';
  body.addEventListener('click', moreClick);
  // #252b: opening a tree row reveals remark cells that measured 0 while their row was hidden, so re-check
  // after the click has been applied. One frame later, or the row is still mid-toggle and measures nothing.
  body.addEventListener('click', () => requestAnimationFrame(() => markRemarkOverflow(body)));
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