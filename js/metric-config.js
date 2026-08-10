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

const CACHE_LS = 'ik_metric_config_cache';   // last-known-good server config (full object)
const DIRTY_LS = 'ik_metric_config_dirty';   // '1' when this browser has unpublished edits
const META_LS = 'ik_metric_config_meta';     // { updatedAt, updatedBy } of the loaded server config

// runtime localStorage keys the readers consume (must match recruiter-pods.js / score-model.js)
const KEYS = { pods: 'ik_recruiter_pods_q', capacity: 'ik_recruiter_capacity_q', scoreGrid: 'ik_score_grid_q', deptFamily: 'ik_dept_family' };

const WEBAPP_URL = 'https://script.google.com/a/macros/interviewkickstart.com/s/AKfycbxI6L89uE35GBRMNVRcjEHhvt6iWRTNO2J3C0JYn_hKdepYA80lCXe7TvFvriYb2XFHtQ/exec';

function readLS(key, dflt) { try { const v = localStorage.getItem(key); return v == null ? dflt : JSON.parse(v); } catch (e) { return dflt; } }
function validCfg(c) { return c && typeof c === 'object' && (c.pods || c.capacity || c.scoreGrid || c.deptFamily); }

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
}

export function markDirty() { localStorage.setItem(DIRTY_LS, '1'); }
export function isDirty() { return localStorage.getItem(DIRTY_LS) === '1'; }
export function getMeta() { return readLS(META_LS, null); }

// Snapshot the runtime config into a publishable object.
export function collectConfig() {
  return { schemaVersion: 1, pods: readLS(KEYS.pods, {}), capacity: readLS(KEYS.capacity, {}), scoreGrid: readLS(KEYS.scoreGrid, {}), deptFamily: readLS(KEYS.deptFamily, {}) };
}

// Deep-equal of the meaningful config fields (for confirm-by-read).
function sameConfig(a, b) {
  const f = ['pods', 'capacity', 'scoreGrid', 'deptFamily'];
  return f.every(k => JSON.stringify(a && a[k] || {}) === JSON.stringify(b && b[k] || {}));
}

// Publish to team: submit the config to the Apps Script web app via an AUTHENTICATED popup using a top-level
// form POST (config in the request BODY, gzip+base64url — no URL-length limit, unlike a GET). The popup is a real
// navigation so the admin's IK login applies, and the server (doPost → publishConfigPage_) writes metric_config.json
// as the signed-in admin. We then CONFIRM-BY-READ (poll the published file until it matches) — no dependency on the
// popup messaging back, no CORS. Returns { ok, reason }.
export async function publishConfig() {
  const payload = collectConfig();
  const base = (getMeta() || {}).updatedAt || '';
  let cParam;
  try { cParam = await gzipB64url(JSON.stringify(payload)); }
  catch (e) { return { ok: false, reason: "This browser can't compress the config — use Download and commit metric_config.json." }; }

  const w = window.open('', 'mcPublish', 'width=460,height=360');
  if (!w) return { ok: false, reason: 'Popup blocked — allow pop-ups for this site and retry, or use Download.' };

  // Top-level form POST into the popup: carries login (like a GET navigation) but sends config in the body.
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = WEBAPP_URL + '?page=doPublish&base=' + encodeURIComponent(base);
  form.target = 'mcPublish';
  form.style.display = 'none';
  const inp = document.createElement('input');
  inp.type = 'hidden'; inp.name = 'c'; inp.value = cParam;
  form.appendChild(inp);
  document.body.appendChild(form);
  form.submit();
  setTimeout(() => { try { form.remove(); } catch (e) { } }, 2000);

  // Confirm-by-read: poll until the published file matches what we sent (or time out ~40s).
  for (let i = 0; i < 16; i++) {
    await new Promise(r => setTimeout(r, 2500));
    let live = null;
    try { const r = await fetch(LIVE_URL + '?cb=' + Date.now()); if (r.ok) live = await r.json(); } catch (e) { }
    if (live && sameConfig(live, payload)) {
      localStorage.setItem(CACHE_LS, JSON.stringify(live));
      localStorage.setItem(META_LS, JSON.stringify({ updatedAt: live.updatedAt || null, updatedBy: live.updatedBy || null }));
      localStorage.removeItem(DIRTY_LS);   // server now matches → track server again
      try { w.close(); } catch (e) { }
      return { ok: true };
    }
  }
  return { ok: false, reason: "Couldn't confirm the publish — check the popup window for an error (sign-in/not-authorized), or use Download. Your edits are kept locally." };
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
