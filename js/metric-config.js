// ===== Team-wide Metric Configuration (antifragile) =====
// Source of truth = data/metric_config.json on GitHub (pods / capacity / score grid / dept-family).
// localStorage is the RUNTIME store the readers (recruiter-pods.js, score-model.js, admin.js) use — it is
// HYDRATED from the server config on load (unless the admin has unpublished edits = "dirty"), and FLUSHED to
// the server on Publish. So existing readers need no change, and the per-browser drift problem goes away.
//
// Degradation ladder (viewers never break): live GitHub → local file → last-known-good cache → built-in defaults.
// First-run safety: if a browser already has local config and has never synced, that local config is PRESERVED
// as an unpublished draft (marked dirty) rather than being overwritten — no data loss on rollout.

const LIVE_URL = 'https://raw.githubusercontent.com/jerin-k/ik-hiring-website/main/data/metric_config.json';
const LOCAL_URL = '/data/metric_config.json';
// #111b: confirm-by-read must NOT use LIVE_URL. raw.githubusercontent ignores the ?cb cache-buster and serves the old
// file for up to 5 minutes (measured 13 Sep: two different ?cb values both x-cache HIT, max-age=300), so a publish that
// succeeded read as "couldn't confirm" and a second Publish was refused as "Config changed meanwhile". The contents
// API reads git directly and allows CORS.
const CONFIRM_URL = 'https://api.github.com/repos/jerin-k/ik-hiring-website/contents/data/metric_config.json?ref=main';

const CACHE_LS = 'ik_metric_config_cache';   // last-known-good server config (full object)
const DIRTY_LS = 'ik_metric_config_dirty';   // '1' when this browser has unpublished edits
const META_LS = 'ik_metric_config_meta';     // { updatedAt, updatedBy } of the loaded server config
const PENDING_LS = 'ik_metric_config_pending';   // #111b: the payload Publish last sent, until it is confirmed

// runtime localStorage keys the readers consume (must match recruiter-pods.js / score-model.js)
// #11b: userType is the Agency|Freelancer toggle set beside the pod selector. It is NOT per-quarter — a user
// either is an agency or is not — so it is a flat { name: 'Agency' | 'Freelancer' } map, unlike pods/capacity.
const KEYS = { pods: 'ik_recruiter_pods_q', capacity: 'ik_recruiter_capacity_q', scoreGrid: 'ik_score_grid_q', deptFamily: 'ik_dept_family', userType: 'ik_user_type', recruiterDates: 'ik_recruiter_dates' };   // #111: start/leaving dates, flat per person

const WEBAPP_URL = 'https://script.google.com/a/macros/interviewkickstart.com/s/AKfycbxI6L89uE35GBRMNVRcjEHhvt6iWRTNO2J3C0JYn_hKdepYA80lCXe7TvFvriYb2XFHtQ/exec';

function readLS(key, dflt) { try { const v = localStorage.getItem(key); return v == null ? dflt : JSON.parse(v); } catch (e) { return dflt; } }
function validCfg(c) { return c && typeof c === 'object' && (c.pods || c.capacity || c.scoreGrid || c.deptFamily || c.userType || c.recruiterDates); }

// Fetch server config (with degradation ladder) and hydrate the runtime keys. Call once, before rendering.
export async function loadMetricConfig() {
  let cfg = null;
  try { const r = await fetch(LIVE_URL + '?cb=' + Date.now()); if (r.ok) cfg = await r.json(); } catch (e) { /* fall through */ }
  if (!cfg) { try { const r = await fetch(LOCAL_URL + '?t=' + Date.now()); if (r.ok) cfg = await r.json(); } catch (e) { } }
  if (!validCfg(cfg)) cfg = readLS(CACHE_LS, null);   // last-known-good
  if (!validCfg(cfg)) return { cfg: null, meta: getMeta(), dirty: isDirty() };  // nothing yet → readers use their built-in defaults

  localStorage.setItem(CACHE_LS, JSON.stringify(cfg));
  const meta = { updatedAt: cfg.updatedAt || null, updatedBy: cfg.updatedBy || null };
  localStorage.setItem(META_LS, JSON.stringify(meta));

  // #111b: a browser left "unpublished" by a publish whose confirm falsely failed heals here — if the team config already
  // equals this browser's edits, or the exact payload it last sent, nothing is unpublished.
  if (isDirty() && (sameConfig(cfg, collectConfig()) || sameConfig(cfg, readLS(PENDING_LS, null)))) {
    localStorage.removeItem(DIRTY_LS); localStorage.removeItem(PENDING_LS);
  }
  const firstRun = !readLS(META_LS + '_synced', false);
  const hasLocal = !!(localStorage.getItem(KEYS.pods) || localStorage.getItem(KEYS.scoreGrid) || localStorage.getItem(KEYS.capacity));
  if (!isDirty()) {
    if (firstRun && hasLocal) {
      localStorage.setItem(DIRTY_LS, '1');   // preserve pre-existing local config as an unpublished draft
    } else {
      hydrate(cfg);
    }
  }
  localStorage.setItem(META_LS + '_synced', 'true');
  return { cfg, meta, dirty: isDirty() };
}

function hydrate(cfg) {
  if (cfg.pods) localStorage.setItem(KEYS.pods, JSON.stringify(cfg.pods));
  if (cfg.capacity) localStorage.setItem(KEYS.capacity, JSON.stringify(cfg.capacity));
  if (cfg.scoreGrid) localStorage.setItem(KEYS.scoreGrid, JSON.stringify(cfg.scoreGrid));
  if (cfg.deptFamily) localStorage.setItem(KEYS.deptFamily, JSON.stringify(cfg.deptFamily));
  if (cfg.userType) localStorage.setItem(KEYS.userType, JSON.stringify(cfg.userType));   // #11b
  if (cfg.recruiterDates) localStorage.setItem(KEYS.recruiterDates, JSON.stringify(cfg.recruiterDates));   // #111
}

export function markDirty() { localStorage.setItem(DIRTY_LS, '1'); localStorage.removeItem(PENDING_LS); }   // an edit after Publish makes the sent payload stale
export function isDirty() { return localStorage.getItem(DIRTY_LS) === '1'; }
export function getMeta() { return readLS(META_LS, null); }

// Snapshot the runtime config into a publishable object.
export function collectConfig() {
  return { schemaVersion: 1, pods: readLS(KEYS.pods, {}), capacity: readLS(KEYS.capacity, {}), scoreGrid: readLS(KEYS.scoreGrid, {}), deptFamily: readLS(KEYS.deptFamily, {}), userType: readLS(KEYS.userType, {}), recruiterDates: readLS(KEYS.recruiterDates, {}) };
}

// Deep-equal of the meaningful config fields (for confirm-by-read).
function sameConfig(a, b) {
  const f = ['pods', 'capacity', 'scoreGrid', 'deptFamily', 'userType', 'recruiterDates'];
  return f.every(k => JSON.stringify(a && a[k] || {}) === JSON.stringify(b && b[k] || {}));
}

// Publish to team: send the config to the Apps Script web app through an AUTHENTICATED popup, driven as a sequence
// of small GET navigations. A top-level GET carries the admin's IK login (a cross-site POST does NOT — Google's
// SameSite cookies block it), but a GET URL is length-limited, so we split the gzip+base64url config into small
// chunks (?sid&i&n&c=<chunk>) and navigate the same popup through them in order; the server accumulates the chunks
// in its script cache and, on the final chunk, reassembles + ungzips + writes metric_config.json as the signed-in
// admin. We then CONFIRM-BY-READ (poll the published file until it matches) — no reliance on the popup messaging
// back, no CORS, no POST. Returns { ok, reason }.
const PUBLISH_CHUNK = 1500;   // chars of base64url per GET (URL stays well under any length limit)

// payloadOverride (optional): a full config object to publish instead of the raw localStorage snapshot — used by
// admin.js buildEffectiveConfig(data) so the FIRST publish captures the effective baseline (roster pods + grid +
// dept-family defaults) rather than an empty object, even before the admin has made any explicit edits.
export async function publishConfig(payloadOverride) {
  const payload = payloadOverride || collectConfig();
  const base = (getMeta() || {}).updatedAt || '';
  let cParam;
  try { cParam = await gzipB64url(JSON.stringify(payload)); }
  catch (e) { return { ok: false, reason: "This browser can't compress the config — use Download and commit metric_config.json." }; }

  const parts = [];
  for (let i = 0; i < cParam.length; i += PUBLISH_CHUNK) parts.push(cParam.slice(i, i + PUBLISH_CHUNK));
  const sid = 'mc' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  const w = window.open('', 'mcPublish', 'width=460,height=360');
  if (!w) return { ok: false, reason: 'Popup blocked — allow pop-ups for this site and retry, or use Download.' };
  localStorage.setItem(PENDING_LS, JSON.stringify(payload));   // #111b: lets a reload heal if the confirm below times out

  // Drive the popup through each chunk in order (top-level GET = carries login). base rides on the LAST chunk.
  // NOTE: param names MUST be mc-prefixed — Apps Script silently 404s ("Page Not Found") on reserved short names
  // like c / i / n. mcsid / mcidx / mctot / mcdata / mcbase are safe. This (not length or POST) was the whole bug.
  for (let i = 0; i < parts.length; i++) {
    const last = i === parts.length - 1;
    const url = WEBAPP_URL + '?page=doPublish&mcsid=' + sid + '&mcidx=' + i + '&mctot=' + parts.length
      + (last ? '&mcbase=' + encodeURIComponent(base) : '') + '&mcdata=' + parts[i];
    try { w.location = url; } catch (e) { }
    await new Promise(r => setTimeout(r, 2200));   // let each GET reach the server before the next nav
  }

  // Confirm-by-read: poll until the published file matches what we sent (or time out ~40s).
  for (let i = 0; i < 24; i++) {
    await new Promise(r => setTimeout(r, 2500));
    const live = await fetchFreshConfig();
    if (live && sameConfig(live, payload)) {
      localStorage.setItem(CACHE_LS, JSON.stringify(live));
      localStorage.setItem(META_LS, JSON.stringify({ updatedAt: live.updatedAt || null, updatedBy: live.updatedBy || null }));
      localStorage.removeItem(DIRTY_LS); localStorage.removeItem(PENDING_LS);   // server now matches → track server again
      try { w.close(); } catch (e) { }
      return { ok: true };
    }
  }
  return { ok: false, reason: "Couldn't confirm the publish yet — check the popup for an error (sign-in / not authorized). If the popup said Published, reload in a minute: this page clears the warning once the team config matches. Your edits are kept locally." };
}

// #111b: read the published config without the raw CDN's 5-minute lag; fall back to LIVE_URL if the API refuses
// (its unauthenticated limit is 60 requests an hour per IP — one publish uses at most 24).
export async function fetchFreshConfig() {
  try {
    const r = await fetch(CONFIRM_URL + '&cb=' + Date.now(), { headers: { Accept: 'application/vnd.github.raw+json' }, cache: 'no-store' });
    if (r.ok) return await r.json();
  } catch (e) { }
  try { const r = await fetch(LIVE_URL + '?cb=' + Date.now()); if (r.ok) return await r.json(); } catch (e) { }
  return null;
}

// gzip a string and return URL-safe base64 (matched by Apps Script Utilities.ungzip on the server).
async function gzipB64url(str) {
  const cs = new CompressionStream('gzip');
  const stream = new Blob([new TextEncoder().encode(str)]).stream().pipeThrough(cs);
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let bin = ''; for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Fallback: the exact JSON that should become data/metric_config.json (for manual commit if the web app is down).
export function configFileText(email) {
  const c = collectConfig();
  c.updatedAt = new Date().toISOString();
  c.updatedBy = email || 'unknown';
  return JSON.stringify(c, null, 2);
}


// ===== #11b: Agency | Freelancer =====
// Ashby's user.list tells us a user is an `External Recruiter` but NOT which kind, so the distinction is a
// manual toggle in Admin -> Metric Configuration, published with the rest of the config.
// 🚨 The default for an EXTERNAL user with no toggle set is FREELANCER, not Agency (Jerin, 7 Sep 2026).
// An unreviewed setting can then only ever HALVE an SME recruiter's credit, never ZERO it. Defaulting to
// Agency was rejected for exactly that reason.
export function getUserTypes() { return readLS(KEYS.userType, {}) || {}; }
export function setUserType(name, type) {
  const m = getUserTypes();
  if (type) m[name] = type; else delete m[name];
  localStorage.setItem(KEYS.userType, JSON.stringify(m));
  markDirty();
}

// ===== #111 (Jerin, 13 Sep 2026): recruiter START and LEAVING dates decide which quarters a recruiter counts in =====
// Ashby records NO deactivation date and NO start date for a user (measured 13 Sep: the user fields are id, name,
// email, globalRole, isEnabled, updatedAt — and updatedAt is the last change of any kind, not a deactivation). So the
// dates are kept here by hand, ONCE per person, not per quarter: { name: { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' } }.
export function getRecruiterDates() { return readLS(KEYS.recruiterDates, {}) || {}; }
export function setRecruiterDate(name, field, value) {
  if (!name || (field !== 'start' && field !== 'end')) return;
  const m = getRecruiterDates();
  const v = /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : '';
  const cur = Object.assign({}, m[name] || {});
  if (v) cur[field] = v; else delete cur[field];
  if (cur.start || cur.end) m[name] = cur; else delete m[name];
  localStorage.setItem(KEYS.recruiterDates, JSON.stringify(m));
  markDirty();
}
// 'YYYY-Qn' -> ['YYYY-MM-DD' first day, 'YYYY-MM-DD' last day], or null.
export function quarterBounds(q) {
  const mt = /^(\d{4})-Q([1-4])$/.exec(String(q || '')); if (!mt) return null;
  const y = +mt[1], n = +mt[2], m0 = (n - 1) * 3 + 1, m1 = n * 3;
  const last = new Date(Date.UTC(y, m1, 0)).getUTCDate();
  const p2 = (x) => String(x).padStart(2, '0');
  return [`${y}-${p2(m0)}-01`, `${y}-${p2(m1)}-${p2(last)}`];
}
// Does this recruiter count in quarter q? Rule: Started on <= last day of q AND (Left on blank OR >= first day of q).
// 🚨 With NO dates set at all, today's Ashby account decides, exactly as before #111 — so nothing changes for anyone
//    until their dates are entered, and Data Hygiene → Recruiter Dates lists who still needs them.
// Returns { in, basis: 'dates' | 'account', note } — note is plain English for a tooltip or pill.
export function recruiterInQuarter(name, q, accountActive) {
  const d = getRecruiterDates()[name] || {};
  const b = quarterBounds(q);
  if ((!d.start && !d.end) || !b) return { in: accountActive !== false, basis: 'account', note: accountActive === false ? 'Ashby account disabled' : '' };
  const [qs, qe] = b;
  if (d.start && d.start > qe) return { in: false, basis: 'dates', note: 'starts ' + d.start };
  if (d.end && d.end < qs) return { in: false, basis: 'dates', note: 'left ' + d.end };
  if (d.end && d.end <= qe) return { in: true, basis: 'dates', note: 'left ' + d.end + ', still counts' };
  if (d.start && d.start >= qs) return { in: true, basis: 'dates', note: 'joined ' + d.start };
  return { in: true, basis: 'dates', note: '' };
}
// 'Agency' | 'Freelancer' | 'Internal'. externalNames comes from dashboard.json's externalUsers, which the
// pipeline fills from globalRole === 'External Recruiter'.
export const USER_TYPES = ['Agency', 'Freelancer', 'Internal'];
// 🚨 THREE-way, not two (Jerin, 7 Sep 2026). Ashby's `External Recruiter` role is NOT a clean agency signal:
// of the four accounts carrying it today, two ('Deepti', 'Mashika') are duplicate accounts of IK's own
// recruiters and one is a test account. Without an Internal option those false positives could not be cleared,
// and under the Freelancer default a duplicate of a real recruiter would halve that recruiter's SME credit.
// 🚨 CHANGED 10 Sep 2026 (Jerin): an EXPLICIT choice now wins for ANYONE, not just accounts Ashby flags as
//   External Recruiter. Before this, a stored type on a non-external was read back as 'Internal' and thrown
//   away — so the Admin dropdown could be set and the score would quietly ignore it. Two gates had to move
//   together: this one and the `ext.has(name)` render gate in pages/admin.js. Enabling only the dropdown
//   would have been a silent no-op, which is the exact defect class this project keeps hitting.
//   The DEFAULTS are unchanged: an unreviewed external is a Freelancer (halves, never zeroes), one of ours
//   is Internal.
// #108 (13 Sep 2026): the type is now a LABEL only — creditSplit treats every type the same, so nothing read
//   from here moves a number any more.
export function userTypeOf(name, externalNames) {
  if (!name) return 'Internal';
  const set = externalNames instanceof Set ? externalNames : new Set(externalNames || []);
  const t = getUserTypes()[name];
  if (USER_TYPES.indexOf(t) >= 0) return t;       // a deliberate choice always wins, external or not
  return set.has(name) ? 'Freelancer' : 'Internal';   // unreviewed: external -> Freelancer, one of ours -> Internal
}

// #11 (Jerin, 7 Sep 2026): who belongs on the roster BESIDES data.recruiters.
// data.recruiters is built from people tagged as RECRUITER on an application, so an agency or freelancer
// tagged only as a SOURCER is invisible: no row, therefore no pod, therefore excluded from every table,
// total and chart — and the credit routed to them would vanish without trace.
// Jerin: they appear "once we either assign an opening to them or attribute a closure to them", which is
// exactly the four sources below. ⚠ Used by BOTH the Recruiter tab and Admin -> Metric Configuration; keep
// it here so the two rosters can never disagree about who exists.
export function sourcerOnlyNames(data) {
  if (!data) return [];
  const known = new Set((data.recruiters || []).map(r => r.name));
  const found = new Set();
  Object.keys(data.ownedSeatsBySourcerQ || {}).forEach(n => found.add(n));
  (data.offerEvents || []).forEach(e => { if (e.sourcer) found.add(e.sourcer); });
  (data.joiningPendingCases || []).forEach(c => { if (c.sourcer) found.add(c.sourcer); });
  (data.dropEvents || []).forEach(e => { if (e.sourcer) found.add(e.sourcer); });
  return [...found].filter(n => n && n !== 'Unassigned' && !known.has(n)).sort();
}
