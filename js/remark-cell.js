// ===== The Remarks CELL and its EDITOR — ONE copy, used by Hiring Manager and Overall Efficiency =====
// #252e (Jerin, 20 Oct 2026): 🗣 "Remarks editable from Overall Efficiency too" — the remark already SHOWED
// there, read-only, and could only be changed on the Hiring Manager tab.
//
// 🚨 WHY THIS FILE EXISTS, and it is the same reason js/people-list-cell.js exists. The cell, the editor and
//    the guard wording lived inside hm-report.js. Making the second tab editable by copying them would have
//    produced two editors that write to the same PUBLIC file and drift apart — and the thing that must never
//    drift is the guard that keeps candidate data out of it (Rule 9). So the code moved here instead.
//    **Both tabs import it. Never copy it.**
//
// 🔑 ONE save path. `publishNote()` in js/job-notes.js is still the only writer: popup ➔ web app ➔ confirm by
//    reading the published file back. Nothing here talks to the server itself.
// 🔑 The tab-specific part is ONE callback, `onClosed`. The Hiring Manager tab uses it to keep its department
//    row's "N of M written" count honest; Overall Efficiency has no such count and passes nothing.
// ⚠ A remark belongs to a JOB. A row with no `job8` gets a dash and no editor — that is every department,
//    recruiter and topic row, and it is why `remarkCell` takes the row rather than a bare id.

import { noteOf, publishNote, guardProblem, NOTE_MAX, firstNameOf } from './job-notes.js';
import { dayLabel, remarkMore, markRemarkOverflow } from './people-list-cell.js';   // #252b: the "more" control

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const GUARD_LINE = 'Visible to anyone with the link — no candidate names, salaries, phone numbers or email addresses.';

// The cell as it reads when nobody is editing it.
// #180: it carries the REMARK ALONE — the byline moved into the editor, 🗣 "the email ... being mentioned is
// unecessary clutter". ONE EXCEPTION: an UNSAVED draft still says so, because that is LIVE STATE — without it
// a remark sitting in this browser alone looks identical to one the whole team can see.
export function remarkCell(o) {
  const job8 = o && o.job8 ? String(o.job8).slice(0, 8) : '';
  if (!job8) return '<td class="jn-cell"><span class="zero">—</span></td>';
  const n = noteOf(job8);
  if (!n || !n.text) {
    // "Add a remark" down every row was nine repetitions of the same sentence; the column heading already says
    // what this is, so the empty state is a quiet affordance (Jerin, 19 Sep).
    return `<td class="jn-cell jn-rem" data-job8="${esc(job8)}"><button type="button" class="jn-add" data-jn-edit="1" title="Add a remark">+ Add</button></td>`;
  }
  return `<td class="jn-cell jn-rem${n.unsaved ? ' jn-unsaved' : ''}" data-job8="${esc(job8)}">`
    + `<button type="button" class="jn-text" data-jn-edit="1" title="Edit this remark">${esc(n.text)}</button>`
    + remarkMore(n.text)   // #252b: cut to the height of the capped people lists, with its own more
    + (n.unsaved ? `<span class="jn-by">Unsaved — in this browser only</span>` : '') + `</td>`;
}

// Redraw THIS CELL only — a full re-render would throw away which departments the reader had open and where
// they were on the page, for a change that touches one cell.
export function closeRemarkEditor(cell, onClosed) {
  const job8 = cell.dataset.job8 || '';
  cell.className = 'jn-cell jn-rem';
  cell.outerHTML = remarkCell({ job8 });
  if (typeof onClosed === 'function') onClosed();
}

export function openRemarkEditor(cell, onClosed) {
  if (!cell || cell.querySelector('textarea')) return;
  const job8 = cell.dataset.job8 || '';
  const n = noteOf(job8) || { text: '' };
  cell.innerHTML = `<textarea class="jn-ta" maxlength="${NOTE_MAX + 200}" rows="3"
      placeholder="What should a hiring manager know about this role?">${esc(n.text)}</textarea>
    <p class="jn-guard">${GUARD_LINE}</p>
    ${n.by ? `<p class="jn-byline">Last written by <strong>${esc(firstNameOf(n.by))}</strong>${n.at ? ' · ' + esc(dayLabel(n.at)) : ''}</p>` : ''}
    <div class="jn-actions"><button type="button" class="jn-btn quiet" data-jn-cancel="1">Cancel</button>
      <button type="button" class="jn-btn" data-jn-save="1">Save</button></div>`;
  const ta = cell.querySelector('textarea'), guard = cell.querySelector('.jn-guard'), save = cell.querySelector('[data-jn-save]');
  const check = () => {
    const bad = guardProblem(ta.value);
    guard.textContent = bad || GUARD_LINE;
    guard.classList.toggle('bad', !!bad);
    save.disabled = !!bad;
  };
  ta.addEventListener('input', check); ta.addEventListener('click', e => e.stopPropagation()); check();
  ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
  cell.querySelector('[data-jn-cancel]').addEventListener('click', (e) => { e.stopPropagation(); closeRemarkEditor(cell, onClosed); });
  save.addEventListener('click', async (e) => {
    e.stopPropagation();
    save.disabled = true; save.textContent = 'Saving…';
    const res = await publishNote(job8, ta.value);
    if (res.ok && !res.warn) { closeRemarkEditor(cell, onClosed); return; }
    // Two different endings, and they must not read alike:
    //  · res.warn — the note IS saved, but under a different Google account than the dashboard sign-in (#152a).
    //    Amber, and the Save button says Saved, because nothing needs doing again.
    //  · res.reason — we could NOT see the save. Never claim one we cannot see (#144); the note is kept locally
    //    and the cell stays marked unsaved.
    guard.textContent = res.warn || res.reason;
    guard.classList.toggle('warn', !!res.warn);
    guard.classList.toggle('bad', !res.warn);
    if (res.ok) { save.textContent = 'Saved'; } else { save.disabled = false; save.textContent = 'Save'; }
    if (!cell.querySelector('[data-jn-done]')) {   // pressing Save twice must not stack up Close buttons
      const done = document.createElement('button');
      done.type = 'button'; done.className = 'jn-btn quiet'; done.textContent = 'Close';
      done.setAttribute('data-jn-done', '1');
      done.addEventListener('click', (e2) => { e2.stopPropagation(); closeRemarkEditor(cell, onClosed); });
      cell.querySelector('.jn-actions').appendChild(done);
    }
  });
}

// ONE delegated listener for the life of a table body: open an editor, and keep the "more" control honest.
// ⚠ A render runs on every filter change and again when the notes land, so this must not stack — two
//   listeners toggled the same cell twice and the editor appeared frozen (found in the 19 Sep preview).
// 🚨 The caller must have already handled a people-list "+N more" click (people-list-cell.js `moreClick`)
//   and returned, or a click on that button would open an editor underneath it.
export function wireRemarks(body, onClosed) {
  if (!body || body.dataset.jnRemWired === '1') return;
  body.dataset.jnRemWired = '1';
  body.addEventListener('click', (ev) => {
    const edit = ev.target.closest('[data-jn-edit]');
    if (edit) { ev.stopPropagation(); openRemarkEditor(edit.closest('td'), onClosed); return; }
    requestAnimationFrame(() => markRemarkOverflow(body));   // #252b: a row that just opened measures 0 while hidden
  });
}
