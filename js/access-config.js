// ===== Team-wide Access config publish =====
// Mirrors the metric-config.js publish infra, but targets data/access.json. Sends the access config to the Apps
// Script web app through an AUTHENTICATED popup, driven as a sequence of small GET navigations (the admin's IK
// login rides the top-level GET). Chunked gzip+base64url; the server reassembles + writes access.json as the
// signed-in admin. mcfile=access tells the server which file to write (metric_config.json is the default).
// Confirm-by-read: poll data/access.json until it matches (server never needs to message back). See Code.gs.

const LIVE_URL = 'https://raw.githubusercontent.com/jerin-k/ik-hiring-website/main/data/access.json';
const WEBAPP_URL = 'https://script.google.com/a/macros/interviewkickstart.com/s/AKfycbxI6L89uE35GBRMNVRcjEHhvt6iWRTNO2J3C0JYn_hKdepYA80lCXe7TvFvriYb2XFHtQ/exec';
const PUBLISH_CHUNK = 1500;
// #118 (14 Sep 2026): confirm-by-read goes through the GitHub contents API. raw.githubusercontent IGNORES ?cb and can serve the
// old file for up to 5 minutes, so a publish that had landed was reported as "Couldn't confirm" (the same fault metric-config.js
// fixed with fetchFreshConfig on 13 Sep). One publish makes at most 16 reads; the unauthenticated limit is 60 an hour.
const CONFIRM_API = 'https://api.github.com/repos/jerin-k/ik-hiring-website/contents/data/access.json?ref=main';

// ===== #118 Send invite (Jerin, 14 Sep 2026): the web app writes and sends the email; this opens it for ONE person =====
const INVITES_API = 'https://api.github.com/repos/jerin-k/ik-hiring-website/contents/data/access_invites.json?ref=main';
const INVITES_RAW = 'https://raw.githubusercontent.com/jerin-k/ik-hiring-website/main/data/access_invites.json';
// Who was sent an invite and when: {email: {at, by, count}}. Through the contents API (the raw CDN lags up to 5 minutes),
// falling back to raw. No file yet means nobody has been invited.
export async function fetchInvites() {
  try { const r = await fetch(INVITES_API + '&cb=' + Date.now(), { headers: { Accept: 'application/vnd.github.raw+json' }, cache: 'no-store' }); if (r.ok) return (await r.json()).invites || {}; } catch (e) { }
  try { const r = await fetch(INVITES_RAW + '?cb=' + Date.now()); if (r.ok) return (await r.json()).invites || {}; } catch (e) { }
  return {};
}
// The popup itself says "Invite sent" or why not (the server checks the admin, reads the person's PUBLISHED access, writes
// the email and records it). Here the record is read back at most twice, to update the row — the contents API allows 60
// unauthenticated reads an hour.
export async function sendInvite(email) {
  const key = String(email || '').toLowerCase();
  const w = window.open(WEBAPP_URL + '?page=doSendInvite&to=' + encodeURIComponent(key), 'acInvite', 'width=460,height=360');
  if (!w) return { ok: false, reason: 'Popup blocked — allow pop-ups for this site and retry.' };
  const started = Date.now();
  for (const waitMs of [12000, 12000]) {
    await new Promise(r => setTimeout(r, waitMs));
    const rec = (await fetchInvites())[key];
    if (rec && rec.at && new Date(rec.at).getTime() >= started - 60000) return { ok: true, at: rec.at, by: rec.by };
  }
  return { ok: false, reason: 'Could not confirm the invite yet — check the window for "Invite sent", then reload this page.' };
}

function normUsers(users) {
  return (users || []).map(u => ({
    email: (u.email || '').toLowerCase(), role: u.role || 'none', userType: u.userType || '',   // #118: a label-only change must still count as a change
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
    try { const r = await fetch(CONFIRM_API + '&cb=' + Date.now(), { headers: { Accept: 'application/vnd.github.raw+json' }, cache: 'no-store' }); if (r.ok) live = await r.json(); } catch (e) { }
    if (!live) { try { const r = await fetch(LIVE_URL + '?cb=' + Date.now()); if (r.ok) live = await r.json(); } catch (e) { } }
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
