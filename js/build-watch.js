// ===== #164 (Jerin, 23 Sep 2026): a tab left open runs OLD code and shows OLD numbers =====
//
// WHAT WAS WRONG. The dashboard checked for new code and new numbers exactly once — while the page was
// loading — and then never again. Nothing in the site re-checked anything: no timer, no "came back to the
// tab" hook, nowhere. So a tab left open all day kept running the JavaScript it downloaded when it was
// opened, and kept drawing the figures from that moment, with no sign that either had moved on.
//
// 🚨 IT IS INVISIBLE BY CONSTRUCTION, WHICH IS WHY IT COST AN HOUR. On 23 Sep a topic row looked orphaned
// under a Recruiter filter. The code and the data were byte-identical to mine and it would not reproduce on
// any filter or tree state; a hard reload fixed it, because that tab predated the deploy. 🔑 The tell was
// ROW ORDER — his list was alphabetical, the live build sorts by activity. Two views of one dataset that
// disagree about ORDER are running different CODE. [[feedback_verification-from-outside]]
//
// THE TWO SIGNALS, and why each is read the way it is:
//   • NEW CODE   — /version.json, stamped by site/.git/hooks/pre-commit on every commit that touches code.
//                  The pipeline's twice-daily data pushes go through the GitHub API, which runs no local
//                  hook, so a data refresh can never masquerade as a deploy.
//   • NEW NUMBERS — a HEAD on our OWN copy of the data and its ETag. Same origin, so the header is readable
//                  (raw.githubusercontent.com does not expose ETag across origins), and HEAD means the 2 MB
//                  body is never fetched. Vercel redeploys on the pipeline's push, so this moves when the
//                  numbers do.
// 🚨 Both are read from THIS origin on purpose. Nothing here may become a second definition of "the data" —
//    data.js remains the only thing that loads it; this file only asks whether it has changed.
//
// WHAT IT DOES NOT DO. It never reloads on its own. A forced reload would throw away whatever the person was
// in the middle of, and on the Req Bot tab it would throw away a half-typed opening request — so the band is
// held back entirely while that tab is open, and appears the moment they leave it.

import { mountStickyChrome, holdTableChrome } from './sticky-chrome.js';

const VERSION_URL = '/version.json';
const DATA_URL = '/data/dashboard.json';

const EVERY_MS = 10 * 60 * 1000;   // while the tab is visible; a hidden tab is not polled at all
const MIN_GAP_MS = 30 * 1000;      // floor between checks, so flicking between windows cannot storm the server
const SNAP_KEY = 'ik_reload_state';
const SNAP_MAX_AGE_MS = 2 * 60 * 1000;   // a snapshot older than this is somebody's stale session, not this reload

let baseBuild = null, baseData = null;
let pending = null;                // { code: bool, data: bool } once something has moved
let lastCheck = 0, checking = false;

// ---------- the two reads ----------

async function readBuild() {
  try {
    const r = await fetch(VERSION_URL + '?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json();
    return j && j.build ? String(j.build) : null;
  } catch (e) { return null; }     // offline, or the file is not there yet: say nothing rather than guess
}

async function readDataStamp() {
  try {
    const r = await fetch(DATA_URL, { method: 'HEAD', cache: 'no-store' });
    if (!r.ok) return null;
    return r.headers.get('etag') || r.headers.get('last-modified') || null;
  } catch (e) { return null; }
}

// ---------- the band ----------

function bandEl() { return document.querySelector('.update-band'); }

// The band lives INSIDE .topbar, under the tab strip, so it freezes with the header block and stays on screen
// however far the page is scrolled. 🚨 That makes the frozen block taller, so sticky-chrome must re-measure —
// publish() in that file counts .update-band, and mountStickyChrome() re-runs the whole measurement. Without
// this the table headings hold at the OLD height and sit on top of the band. (#147 / #155 / #156)
function paint() {
  const onReqBot = (location.hash || '').replace('#', '').split('/')[0] === 'reqbot';
  const show = !!pending && !onReqBot;
  const existing = bandEl();

  if (!show) {
    if (existing) { existing.remove(); remeasure(); }
    return;
  }
  if (existing) return;

  const topbar = document.querySelector('.topbar');
  if (!topbar) return;

  const el = document.createElement('div');
  el.className = 'update-band';
  el.setAttribute('role', 'status');
  el.innerHTML = `<span class="update-dot" aria-hidden="true"></span>
    <span><strong>This tab is out of date.</strong> ${sentence(pending)}</span>
    <span class="update-spacer"></span>
    <button type="button" class="update-reload">Reload</button>`;
  el.querySelector('.update-reload').addEventListener('click', () => {
    snapshotState();
    location.reload();
  });
  topbar.appendChild(el);
  remeasure();
}

function sentence(what) {
  if (what.code && what.data) return 'The dashboard has been updated and newer numbers have arrived since you opened it.';
  if (what.code) return 'The dashboard has been updated since you opened this tab.';
  return 'Newer numbers have arrived since you opened this tab.';
}

function remeasure() {
  try { mountStickyChrome(); holdTableChrome(); } catch (e) { /* never let a measurement break the page */ }
}

// ---------- the check ----------

async function check() {
  if (checking || pending) return;              // already showing: there is nothing further to say
  if (Date.now() - lastCheck < MIN_GAP_MS) return;
  if (navigator.onLine === false) return;
  checking = true;
  lastCheck = Date.now();
  try {
    const [build, data] = await Promise.all([readBuild(), readDataStamp()]);
    // A null is "could not tell", never "changed" — an offline blip must not raise a false alarm.
    const code = !!(build && baseBuild && build !== baseBuild);
    const numbers = !!(data && baseData && data !== baseData);
    if (code || numbers) { pending = { code, data: numbers }; paint(); }
  } finally { checking = false; }
}

// ---------- keeping your place across the reload ----------
//
// The tab and sub-tab already survive a reload — they live in the URL hash (#4, 22 Aug). The FILTERS do not:
// they are held in memory by each page. A reload that dumped someone back on an unfiltered Overview would be
// half a fix, so the filter row is captured here and replayed afterwards.
// 🔑 Checkboxes are matched on their VALUE, not their position, because a refresh can add a recruiter to the
//    list and shift every index below it. Each one is replayed with a real `change` event, because that is
//    what updates the multi-select's own `selected` set — setting .checked alone changes nothing.

function snapshotState() {
  try {
    const boxes = [];
    [...document.querySelectorAll('#main-app .ms')].forEach((ms, i) => {
      ms.querySelectorAll('input[type=checkbox]').forEach(cb => { if (cb.checked) boxes.push([i, cb.value]); });
    });
    sessionStorage.setItem(SNAP_KEY, JSON.stringify({
      at: Date.now(),
      hash: location.hash,
      boxes,
      dates: [...document.querySelectorAll('#main-app input[type=date]')].map(e => e.value),
      sels: [...document.querySelectorAll('#main-app select')].map(e => e.value),
      scroll: Math.round(window.scrollY),
    }));
  } catch (e) { /* a convenience, never a reason to block the reload */ }
}

const tick = () => new Promise(r => setTimeout(r, 0));

async function restoreState() {
  let snap = null;
  try {
    snap = JSON.parse(sessionStorage.getItem(SNAP_KEY) || 'null');
    sessionStorage.removeItem(SNAP_KEY);        // one reload, one replay
  } catch (e) { return; }
  if (!snap || Date.now() - snap.at > SNAP_MAX_AGE_MS || snap.hash !== location.hash) return;

  // Every control is re-found immediately before it is used: replaying one filter re-renders the page, which
  // can rebuild the very elements a cached list was holding.
  const sels = snap.sels || [];
  for (let i = 0; i < sels.length; i++) {
    const el = document.querySelectorAll('#main-app select')[i];
    if (el && el.value !== sels[i] && [...el.options].some(o => o.value === sels[i])) {
      el.value = sels[i];
      el.dispatchEvent(new Event('change', { bubbles: true }));
      await tick();
    }
  }
  const dates = snap.dates || [];
  for (let i = 0; i < dates.length; i++) {
    const el = document.querySelectorAll('#main-app input[type=date]')[i];
    if (el && el.value !== dates[i]) {
      el.value = dates[i];
      el.dispatchEvent(new Event('change', { bubbles: true }));
      await tick();
    }
  }
  for (const [i, value] of (snap.boxes || [])) {
    const ms = document.querySelectorAll('#main-app .ms')[i];
    if (!ms) continue;
    const cb = [...ms.querySelectorAll('input[type=checkbox]')].find(c => c.value === value);
    if (cb && !cb.checked) {
      cb.checked = true;
      cb.dispatchEvent(new Event('change', { bubbles: true }));
      await tick();
    }
  }
  if (snap.scroll) window.scrollTo(0, snap.scroll);
}

// ---------- wiring ----------

export async function startBuildWatch() {
  [baseBuild, baseData] = await Promise.all([readBuild(), readDataStamp()]);

  // Coming back to the tab is the case that matters — it is exactly when someone starts reading figures they
  // assume are current. The timer is the backstop for a tab left in front all day.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  window.addEventListener('focus', check);
  setInterval(() => { if (!document.hidden) check(); }, EVERY_MS);

  // Held back on Req Bot (a half-typed request must not be thrown away), so it has to reappear on the way out.
  window.addEventListener('hashchange', paint);

  await restoreState();
}
