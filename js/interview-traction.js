// ===== INTERVIEW TRACTION (#206, 7 Oct 2026) =====
// Every interview BOOKING, on the day it was scheduled for, split four ways. One chart per round, stacked
// down the page. Lives on BOTH Hiring Manager and Overall Efficiency.
//
// 🔑 ONE HOME ON PURPOSE (Rule 3). Panelists is written twice, once per page, and that is exactly the drift
// this file avoids: the two tabs call the SAME render with their own scope, so a change can never land on
// one tab and miss the other. Do not copy this into a page module.
//
// Outcome rule is Jerin's (b), 7 Oct: what HAPPENED NEXT, never the interviewer's feedback form — feedback
// is often never submitted, so scoring on it would leave silent holes. The pipeline (Traction.gs) decides
// the four buckets; this file only ADDS UP and DRAWS. The chart computes nothing of its own.
import { defsBlock } from './definitions.js';

const SERIES = [
  { key: 'Select',                  col: 'var(--it-sel)' },
  { key: 'Reject',                  col: 'var(--it-rej)' },
  { key: 'Rescheduled / Cancelled', col: 'var(--it-can)' },
  { key: 'Awaiting outcome',        col: 'var(--it-pen)' }
];
// Jerin, 7 Oct: "keep Online assessment, R1 to R5 ticked by default".
const DEFAULT_ROUNDS = ['Online Assessment', 'R1', 'R2', 'R3', 'R4', 'R5'];
const DAY_WINDOW = 30;   // "lets show the last 30 days in the range" (Jerin, 7 Oct)

const pad2 = n => (n < 10 ? '0' : '') + n;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function isoWeek(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  const dn = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dn);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil((((t - y0) / 86400000) + 1) / 7);
}
function addDays(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.getUTCFullYear() + '-' + pad2(t.getUTCMonth() + 1) + '-' + pad2(t.getUTCDate());
}
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
// The day window is the last 30 days INSIDE the range (Jerin, 7 Oct: "the last 30 days in the range"), so a
// range shorter than 30 days gives a shorter window - and the caption has to say the window it actually drew,
// never "the last 30 days" over seven of them.
function dayStart(scope) {
  const first = addDays(scope.to, -(DAY_WINDOW - 1));
  return first < scope.from ? scope.from : first;
}

// Add up every job the scope lets through, for one round, into {day: [s,r,c,p]}.
function daysForRound(tr, round, scope) {
  const out = {};
  const byJob = tr.byJobRoundDay || {};
  for (const j8 in byJob) {
    if (scope.jobOk && !scope.jobOk(j8)) continue;
    const days = byJob[j8][round];
    if (!days) continue;
    for (const d in days) {
      if (d < scope.from || d > scope.to) continue;
      const v = days[d], c = out[d] || (out[d] = [0, 0, 0, 0]);
      c[0] += v[0]; c[1] += v[1]; c[2] += v[2]; c[3] += v[3];
    }
  }
  return out;
}

// Turn those days into the slots the chart draws. EVERY slot in the window is present, including the empty
// ones — Jerin, 7 Oct: "for the Zero days, give me a Zero bar". A missing day and a quiet day look different.
function slotsFor(dayMap, view, scope) {
  const slots = [];
  if (view === 'day') {
    const start = dayStart(scope);
    for (let d = start; d <= scope.to; d = addDays(d, 1)) {
      const v = dayMap[d] || [0, 0, 0, 0];
      const dow = new Date(d + 'T00:00:00Z').getUTCDay();
      slots.push({ lab: d.slice(8), sub: MON[Number(d.slice(5, 7)) - 1], v, quiet: dow === 0 || dow === 6 });
    }
    return slots;
  }
  const byWeek = {};
  for (const d in dayMap) {
    const k = isoWeek(d), c = byWeek[k] || (byWeek[k] = [0, 0, 0, 0]);
    const v = dayMap[d];
    c[0] += v[0]; c[1] += v[1]; c[2] += v[2]; c[3] += v[3];
  }
  const ks = Object.keys(byWeek).map(Number);
  if (!ks.length) return [];
  // Fill the gap weeks too, so a silent fortnight reads as silence rather than as two adjacent bars.
  for (let w = Math.min(...ks); w <= Math.max(...ks); w++) {
    slots.push({ lab: 'W' + w, sub: '', v: byWeek[w] || [0, 0, 0, 0], quiet: false });
  }
  return slots;
}

function chartSvg(slots) {
  const W = 1120, H = 186, padL = 34, padR = 8, padT = 18, padB = 32;
  const n = slots.length || 1, iw = (W - padL - padR) / n;
  let max = 0;
  slots.forEach(s => { max = Math.max(max, s.v[0] + s.v[1] + s.v[2] + s.v[3]); });
  // Floor the scale at 4. Without it a round with one booking a week draws a FULL-HEIGHT bar, the same size
  // as R1's seventy, because every chart scales to its own maximum. A small round has to look small.
  if (max < 4) max = 4;
  const plotH = H - padT - padB, base = padT + plotH;
  const y = v => base - (v / max) * plotH;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Interview outcomes by period">`;
  for (let g = 0; g <= 4; g++) {
    const val = Math.round(max * g / 4), yy = y(val);
    s += `<line x1="${padL}" y1="${yy}" x2="${W - padR}" y2="${yy}" stroke="var(--border-light)" stroke-width="1"/>`
       + `<text x="${padL - 6}" y="${yy + 3.5}" text-anchor="end" font-size="9" fill="var(--muted)">${val}</text>`;
  }
  slots.forEach((sl, ix) => {
    const x0 = padL + ix * iw, tot = sl.v[0] + sl.v[1] + sl.v[2] + sl.v[3];
    const bw = Math.min(26, Math.max(5, iw * 0.56)), bx = x0 + (iw - bw) / 2;
    if (sl.quiet && tot === 0) s += `<rect x="${x0}" y="${padT}" width="${iw}" height="${plotH}" fill="var(--it-quiet)"/>`;
    if (tot === 0) {
      s += `<rect x="${bx}" y="${base - 2}" width="${bw}" height="2" fill="var(--it-zero)"/>`
         + `<text x="${bx + bw / 2}" y="${base - 6}" text-anchor="middle" font-size="8.5" fill="var(--muted)" font-weight="600">0</text>`;
    } else {
      let acc = 0;
      for (let i = 0; i < 4; i++) {
        const v = sl.v[i]; if (v <= 0) continue;
        const hh = (v / max) * plotH, yy = y(acc + v);
        s += `<rect x="${bx}" y="${yy}" width="${bw}" height="${hh}" fill="${SERIES[i].col}"><title>${SERIES[i].key}: ${v}</title></rect>`;
        if (hh >= 11) s += `<text x="${bx + bw / 2}" y="${yy + hh / 2 + 3}" text-anchor="middle" font-size="8.5" fill="#fff" font-weight="600">${v}</text>`;
        acc += v;
      }
      s += `<text x="${bx + bw / 2}" y="${y(tot) - 4}" text-anchor="middle" font-size="9" fill="var(--text-secondary)" font-weight="600">${tot}</text>`;
    }
    s += `<text x="${x0 + iw / 2}" y="${H - 17}" text-anchor="middle" font-size="8.5" fill="${tot ? 'var(--text-secondary)' : 'var(--muted)'}" font-weight="600">${sl.lab}</text>`;
    s += sl.sub
      ? `<text x="${x0 + iw / 2}" y="${H - 8.5}" text-anchor="middle" font-size="7.5" fill="var(--muted)">${sl.sub}</text>`
      : `<text x="${x0 + iw / 2}" y="${H - 8.5}" text-anchor="middle" font-size="8" fill="var(--muted)">(${tot})</text>`;
  });
  s += `<line x1="${padL}" y1="${base}" x2="${W - padR}" y2="${base}" stroke="var(--border)" stroke-width="1"/></svg>`;
  return s;
}

// Builds the panel inside `host` once and returns the render function the page calls whenever a filter moves.
// `getScope()` must return { from, to, jobOk(job8) } — the page owns the filters, this owns the metric.
export function mountInterviewTraction(host, data, getScope) {
  if (!host) return () => {};
  const tr = data && data.interviewTraction;
  if (!tr || !tr.byJobRoundDay) {
    host.innerHTML = `<p class="sub-note" style="color:var(--orange)">Interview Traction has no data file yet.
      It is written by the stage-history job; the next run will fill this in.</p>`;
    return () => {};
  }
  const rounds = tr.rounds || [];
  const sel = new Set(DEFAULT_ROUNDS.filter(r => rounds.includes(r)));
  const state = { view: 'week', hide: true };

  host.innerHTML = `
    <div class="it-controls">
      <div class="it-seg" role="group" aria-label="Group interviews by">
        <button type="button" class="active" data-view="week">Week view</button>
        <button type="button" data-view="day">Day view</button>
      </div>
      <div class="ms it-rounds"></div>
      <label class="it-chk"><input type="checkbox" class="it-hide" checked> Hide rounds with no interviews</label>
      <div class="it-legend">${SERIES.map(s =>
        `<span><i style="background:${s.col}"></i>${s.key}</span>`).join('')}</div>
    </div>
    <p class="sub-note it-state"></p>
    <div class="it-charts"></div>
    ${defsBlock('interview-traction')}`;

  const seg = host.querySelector('.it-seg');
  const chartsEl = host.querySelector('.it-charts');
  const stateEl = host.querySelector('.it-state');
  const hideEl = host.querySelector('.it-hide');

  // The Rounds chip. makeMultiSelect treats an empty selection as "All" and cannot be preset, so the six
  // defaults are ticked by hand after it is built, with rendering held off until the last one lands.
  let booting = true;
  const roundsHost = host.querySelector('.it-rounds');
  roundsHost.innerHTML = `<button type="button" class="ms-btn"></button>
    <div class="ms-panel" style="display:none"><div class="ms-list">${rounds.map(r =>
      `<label class="ms-opt"><input type="checkbox" value="${esc(r)}"${sel.has(r) ? ' checked' : ''}> ${esc(r)}</label>`
    ).join('')}</div></div>`;
  const rBtn = roundsHost.querySelector('.ms-btn'), rPanel = roundsHost.querySelector('.ms-panel');
  const paintRounds = () => {
    const t = sel.size === 0 ? 'Rounds: none' : (sel.size === rounds.length ? 'Rounds: All' : `Rounds: ${sel.size} selected`);
    rBtn.textContent = t; rBtn.title = t;
  };
  rBtn.addEventListener('click', e => {
    e.stopPropagation();
    const open = rPanel.style.display !== 'none';
    document.querySelectorAll('.ms-panel').forEach(p => { p.style.display = 'none'; });
    rPanel.style.display = open ? 'none' : 'block';
  });
  rPanel.addEventListener('click', e => e.stopPropagation());
  roundsHost.querySelectorAll('input[type=checkbox]').forEach(cb => cb.addEventListener('change', () => {
    if (cb.checked) sel.add(cb.value); else sel.delete(cb.value);
    paintRounds(); if (!booting) render();
  }));
  paintRounds();
  booting = false;

  seg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    state.view = b.dataset.view;
    seg.querySelectorAll('button').forEach(o => o.classList.toggle('active', o === b));
    render();
  }));
  hideEl.addEventListener('change', () => { state.hide = hideEl.checked; render(); });

  function render() {
    const raw = getScope() || {};
    if (!raw.from || !raw.to) { chartsEl.innerHTML = ''; return; }
    // 🚨 NEVER let the window run past today. Interviews are booked WEEKS AHEAD - the data file already
    // carries bookings nine days out - and a future booking has not happened, so it is not traction and
    // must not sit in Awaiting outcome. Left unclamped, picking Q4 ends the range on 31 December and day
    // view draws a month of empty future days.
    const now = new Date();
    const today = now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-' + pad2(now.getDate());
    const scope = { from: raw.from, to: raw.to > today ? today : raw.to, jobOk: raw.jobOk };
    if (scope.from > scope.to) { chartsEl.innerHTML = ''; stateEl.textContent = ''; return; }
    const picked = rounds.filter(r => sel.has(r));
    if (!picked.length) {
      stateEl.textContent = '';
      chartsEl.innerHTML = '<p class="it-empty">No rounds selected &mdash; pick at least one from Rounds.</p>';
      return;
    }
    let html = '', hidden = 0, grand = 0;
    const blocks = picked.map(r => {
      const slots = slotsFor(daysForRound(tr, r, scope), state.view, scope);
      let tot = 0, s0 = 0, r0 = 0;
      slots.forEach(s => { tot += s.v[0] + s.v[1] + s.v[2] + s.v[3]; s0 += s.v[0]; r0 += s.v[1]; });
      grand += tot;
      return { r, slots, tot, s0, r0 };
    });
    blocks.forEach(b => {
      if (b.tot === 0 && state.hide) { hidden++; return; }
      html += `<div class="it-round"><h4>${esc(b.r)}</h4>`;
      if (b.tot === 0) { html += '<p class="it-empty">No interviews booked in this period.</p></div>'; return; }
      const dec = b.s0 + b.r0;
      html += `<p class="it-meta">${b.tot} booked${dec ? ` &middot; ${Math.round(b.s0 / dec * 100)}% of decided interviews were a select` : ''}</p>`
            + `<div class="it-scroller">${chartSvg(b.slots)}</div></div>`;
    });
    if (hidden) html += `<p class="it-empty">${hidden} round${hidden === 1 ? '' : 's'} with no interviews in this period ${hidden === 1 ? 'is' : 'are'} hidden.</p>`;
    const winFrom = state.view === 'day' ? dayStart(scope) : scope.from;
    stateEl.textContent = `Showing ${winFrom} to ${scope.to}`
      + (state.view === 'day' ? ', day by day' : '')
      + ` · ${grand.toLocaleString()} interviews booked across ${picked.length} round${picked.length === 1 ? '' : 's'}`;
    chartsEl.innerHTML = html;
  }
  return render;
}
