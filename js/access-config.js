// ===== Team-wide Access config publish =====
// Mirrors the metric-config.js publish infra, but targets data/access.json. Sends the access config to the Apps
// Script web app through an AUTHENTICATED popup, driven as a sequence of small GET navigations (the admin's IK
// login rides the top-level GET). Chunked gzip+base64url; the server reassembles + writes access.json as the
// signed-in admin. mcfile=access tells the server which file to write (metric_config.json is the default).
// Confirm-by-read: poll data/access.json until it matches (server never needs to message back). See Code.gs.

const LIVE_URL = 'https://raw.githubusercontent.com/jerin-k/ik-hiring-website/main/data/access.json';
const WEBAPP_URL = 'https://script.google.com/a/macros/interviewkickstart.com/s/AKfycbxI6L89uE35GBRMNVRcjEHhvt6iWRTNO2J3C0JYn_hKdepYA80lCXe7TvFvriYb2XFHtQ/exec';
const PUBLISH_CHUNK = 1500;

function normUsers(users) {
  return (users || []).map(u => ({
    email: (u.email || '').toLowerCase(), role: u.role || 'none',
    tabs: (u.tabs || []).slice().sort(),
    departments: (u.departments || []).slice().sort(), teams: (u.teams || []).slice().sort()
  })).sort((x, y) => x.email.localeCompare(y.email));
}
// Deep-equal of the meaningful access fields (ignores updatedAt/updatedBy) — for confirm-by-read.
function sameAccess(a, b) {
  if (!a || !b) return false;
  if ((a.defaultRole || 'none') !== (b.defaultRole || 'none')) return false;
  return JSON.stringify(normUsers(a.users)) === JSON.stringify(normUsers(b.users));
}

export async function publishAccess(payload) {
  let cParam;
  try { cParam = await gzipB64url(JSON.stringify(payload)); }
  catch (e) { return { ok: false, reason: "This browser can't compress the config — use Download and commit access.json." }; }

  const parts = [];
  for (let i = 0; i < cParam.length; i += PUBLISH_CHUNK) parts.push(cParam.slice(i, i + PUBLISH_CHUNK));
  const sid = 'ac' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  const w = window.open('', 'acPublish', 'width=460,height=360');
  if (!w) return { ok: false, reason: 'Popup blocked — allow pop-ups for this site and retry, or use Download.' };

  // Drive the popup through each chunk in order. Dedicated page=doPublishAccess route writes data/access.json.
  for (let i = 0; i < parts.length; i++) {
    const url = WEBAPP_URL + '?page=doPublishAccess&mcsid=' + sid + '&mcidx=' + i + '&mctot=' + parts.length + '&mcdata=' + parts[i];
    try { w.location = url; } catch (e) { }
    await new Promise(r => setTimeout(r, 2200));
  }

  // Confirm-by-read: poll until the published file matches what we sent (or time out ~40s).
  for (let i = 0; i < 16; i++) {
    await new Promise(r => setTimeout(r, 2500));
    let live = null;
    try { const r = await fetch(LIVE_URL + '?cb=' + Date.now()); if (r.ok) live = await r.json(); } catch (e) { }
    if (live && sameAccess(live, payload)) { try { w.close(); } catch (e) { } return { ok: true }; }
  }
  return { ok: false, reason: "Couldn't confirm the publish — check the popup for an error (sign-in/not-authorized), or use Download. Your edits are kept locally." };
}

// Fallback: the exact JSON that should become data/access.json (for manual commit if the web app is down).
export function accessFileText(payload, email) {
  const c = Object.assign({}, payload);
  c.updatedAt = new Date().toISOString();
  c.updatedBy = email || 'unknown';
  return JSON.stringify(c, null, 2);
}

// gzip a string → URL-safe base64 (matched by Apps Script Utilities.ungzip on the server).
async function gzipB64url(str) {
  const cs = new CompressionStream('gzip');
  const stream = new Blob([new TextEncoder().encode(str)]).stream().pipeThrough(cs);
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let bin = ''; for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
