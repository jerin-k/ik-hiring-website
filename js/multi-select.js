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
  // #279 (Jerin, 22 Oct 2026) — A FILTER THAT SHOWS EVERYTHING NOW LOOKS LIKE IT.
  // 🗣 "if i have to avoid one Department - i can just untick that department."
  // Which filters change is decided by EXISTING LOGIC, not a hand-kept list: a caller that seeds its own
  // starting pick (`initial`) keeps it; one that does not used to open empty, meaning "no restriction", and
  // now opens with every box ticked instead. That is the 23-vs-3 split with no call site touched.
  const allByDefault = !(initial && initial.length);
  // How many options can actually be picked right now. setHidden() withholds some (#240d E), so this is NOT
  // always norm.length — and getting that wrong is what would turn "all ticked" into a real filter.
  let selectableTotal = norm.length;
  // 🔑 THE GUARANTEE: every box ticked means NO RESTRICTION, exactly as an empty box list did before. The 12
  // predicates in the pages still read `!sel.length || sel.includes(x)`, so not one figure moves.
  const everythingTicked = () => allByDefault && selectableTotal > 0 && selected.size === selectableTotal;
  const labelText = () => (selected.size === 0 || everythingTicked()) ? `${label}: All`
    : (selected.size === 1 ? `${label}: ${textOf[[...selected][0]] || [...selected][0]}` : `${label}: ${selected.size} selected`);
  container.classList.add('ms');
  container.innerHTML = `<button type="button" class="ms-btn"></button><div class="ms-panel" style="display:none">`
    + (norm.length ? `<div class="ms-tools"><input type="text" class="ms-search" placeholder="Type to filter..."><button type="button" class="ms-clear">${allByDefault ? 'Select all' : 'Clear'}</button></div>` : '')
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
  if (allByDefault) {
    norm.forEach(o => selected.add(o.v));
    container.querySelectorAll('input[type=checkbox]').forEach(cb => { cb.checked = true; });
  }
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
    if (allByDefault) {
      // "Select all" — put every option that is on offer back. A withheld option (#240d E) stays out.
      if (everythingTicked()) return;
      selected.clear();
      norm.forEach(o => { if (!hidden.has(o.v)) selected.add(o.v); });
      container.querySelectorAll('input[type=checkbox]').forEach(cb => { cb.checked = selected.has(cb.value); });
    } else {
      if (selected.size === 0) return;
      selected.clear();
      container.querySelectorAll('input[type=checkbox]').forEach(cb => { cb.checked = false; });
    }
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
    selectableTotal = norm.length - hidden.size;
    if (!same || cleared) { applyFilter(search ? search.value : ''); paint(); }
    return cleared;
  }

  // 🚨 ALL TICKED READS AS AN EMPTY SELECTION ON PURPOSE. That is what keeps every figure identical to
  // before: the pages' own test is `!sel.length || sel.includes(x)`, so [] means "do not filter".
  return { getSelected: () => (everythingTicked() ? [] : [...selected]), setHidden };
}
