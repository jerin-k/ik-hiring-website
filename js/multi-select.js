// ===== THE multi-select filter chip — one home, for every tab =====
//
// 🚨 WHY THIS FILE EXISTS. `makeMultiSelect` was copied into FOUR files (hm-report · efficiency · recruiter ·
//    interviewer). Three were byte-identical; the fourth had quietly improved — it escaped the option TEXT,
//    which the other three interpolated raw. That is the whole argument for folding: a copy does not stay a
//    copy, and the fix lands in one of them. Two sessions declined to fold these and the handover's standing
//    note said "fold them before the next control lands". #196 is that control, so they are folded here.
// 🔑 The escaped version WON. Both the value and the label are escaped now, so a recruiter or job name
//    carrying a quote or an angle bracket can never break the panel's markup.
//
// #196 (Jerin, 28 Sep 2026) — option C: the button has a MAX WIDTH in css/style.css (`.ms-btn`). The label
// grows with what you pick ("Recruiter: Kaashvika Kashyap" is far wider than "Recruiter: All"), and the filter
// strip is `nowrap` with a fixed 1210px content column, so one long name used to push the row into a sideways
// scroll. It now ellipsises instead. The cap lives in CSS, not here: it is a layout rule, and putting it in the
// markup would hide it from anyone reading the stylesheet.
//
// An option is either a plain string or `{ v, t }` — `v` is the VALUE kept in `selected`, `t` is what the user
// reads (#172c). The Job dropdowns pass a JOB ID as `v`, so two jobs sharing a name stay distinct.
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function makeMultiSelect(container, label, options, onChange, initial) {
  if (!container) return null;
  const selected = new Set();
  const norm = (options || []).map(o => (o && typeof o === 'object')
    ? { v: String(o.v), t: String(o.t) } : { v: String(o), t: String(o) });
  const textOf = {}; norm.forEach(o => { textOf[o.v] = o.t; });
  const labelText = () => selected.size === 0 ? `${label}: All`
    : (selected.size === 1 ? `${label}: ${textOf[[...selected][0]] || [...selected][0]}` : `${label}: ${selected.size} selected`);
  container.classList.add('ms');
  container.innerHTML = `<button type="button" class="ms-btn"></button><div class="ms-panel" style="display:none">`
    + (norm.length ? `<div class="ms-tools"><input type="text" class="ms-search" placeholder="Type to filter..."><button type="button" class="ms-clear">Clear</button></div>` : '')
    + `<div class="ms-list">`
    + (norm.map(o => `<label class="ms-opt" data-v="${esc(o.v)}"><input type="checkbox" value="${esc(o.v)}"> ${esc(o.t)}</label>`).join('') || '<span style="font-size:0.6875rem;color:var(--muted);padding:0.25rem 0.5rem">No options yet</span>')
    + `</div><div class="ms-empty" style="display:none">No matches</div></div>`;
  const btn = container.querySelector('.ms-btn'), panel = container.querySelector('.ms-panel');
  const search = container.querySelector('.ms-search'), clearBtn = container.querySelector('.ms-clear');
  const opts = [...container.querySelectorAll('.ms-opt')];
  const emptyMsg = container.querySelector('.ms-empty');
  // #238: an optional STARTING selection. Seeded silently — onChange is deliberately NOT fired, because the page
  // is still being assembled here and a render would run before its data is ready. A value that is not on offer
  // is ignored rather than ticked blind, so a stale default can never select nothing and look like "All".
  (initial || []).forEach(v => {
    const key = String(v);
    if (!Object.prototype.hasOwnProperty.call(textOf, key)) return;
    selected.add(key);
    const box = opts.map(o => o.querySelector('input')).find(i => i && i.value === key);
    if (box) box.checked = true;
  });
  btn.textContent = labelText();
  // The full label is the tooltip, so a name the cap trims is still readable on hover (#196).
  const paint = () => { btn.textContent = labelText(); btn.title = labelText(); };
  paint();
  // #240d E: options withheld because they cannot change a number right now. Kept as a Set rather than
  // removed from the DOM, because what is offered changes with the period and has to come back.
  const hidden = new Set();
  function applyFilter(q) {
    const needle = q.trim().toLowerCase();
    let shown = 0;
    opts.forEach(o => {
      // \u26a0 HIDDEN WINS OVER THE SEARCH. Without this, typing in the filter box would put a withheld
      // option back on screen — the one place the two mechanisms can fight.
      const hit = !hidden.has(o.dataset.v) && (!needle || o.textContent.toLowerCase().indexOf(needle) >= 0);
      o.style.display = hit ? '' : 'none';
      if (hit) shown++;
    });
    if (emptyMsg) emptyMsg.style.display = shown ? 'none' : 'block';
  }
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = panel.style.display !== 'none';
    document.querySelectorAll('.ms-panel').forEach(p => p.style.display = 'none');
    panel.style.display = open ? 'none' : 'block';
    // Reopening always starts from the full list, so a stale filter can never hide options.
    if (!open && search) { search.value = ''; applyFilter(''); search.focus(); }
  });
  panel.addEventListener('click', e => e.stopPropagation());
  if (search) search.addEventListener('input', () => applyFilter(search.value));
  if (clearBtn) clearBtn.addEventListener('click', () => {
    if (selected.size === 0) return;
    selected.clear();
    container.querySelectorAll('input[type=checkbox]').forEach(cb => { cb.checked = false; });
    paint();
    onChange();
  });
  container.querySelectorAll('input[type=checkbox]').forEach(cb => cb.addEventListener('change', () => {
    if (cb.checked) selected.add(cb.value); else selected.delete(cb.value);
    paint(); onChange();
  }));
  /**
   * #240d E \u2014 withhold options that cannot change a number in the period on screen.
   * Used for a stage Ashby has deleted which nobody reached in the selected window: offering it would be
   * a tick box that moves nothing, which is the bug Jerin named on 15 Sep 2026 \u2014 \ud83d\udde3 *"If there is a filter
   * applied, data needs to change as well."*
   * \ud83d\udea8 A withheld option is also UNTICKED. A selection the user can no longer see would go on filtering the
   * table from behind a closed panel, and a filter you cannot find is worse than one that does nothing.
   * \ud83d\udd11 It does NOT fire onChange \u2014 the caller is mid-render when it calls this, and re-entering the render
   * from here would loop. It returns true when a tick was actually cleared, so a caller that has already
   * read getSelected() knows to read it again.
   * @param {string[]} values option values to withhold ([] restores every option)
   * @returns {boolean} true if this call cleared a selection
   */
  function setHidden(values) {
    const next = new Set((values || []).map(String));
    let same = next.size === hidden.size;
    if (same) for (const v of next) if (!hidden.has(v)) { same = false; break; }
    let cleared = false;
    hidden.clear(); next.forEach(v => hidden.add(v));
    hidden.forEach(v => {
      if (!selected.has(v)) return;
      selected.delete(v); cleared = true;
      const box = opts.map(o => o.querySelector('input')).find(i => i && i.value === v);
      if (box) box.checked = false;
    });
    if (!same || cleared) { applyFilter(search ? search.value : ''); paint(); }
    return cleared;
  }

  return { getSelected: () => [...selected], setHidden };
}
