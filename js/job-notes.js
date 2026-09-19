// #150 (Jerin, 19 Sep 2026) — the Remarks a hiring manager or recruiter writes against a JOB.
//
// Storage: data/job_notes.json, keyed by the 8-char jobId (titles repeat and change, ids do not).
// Saving: the ONLY route that works from this site is a top-level GET in a popup — a background fetch or a
// cross-site POST is stripped of the user's Google login, which is exactly why the Refresh button has been
// silently doing nothing since at least 14 Sep (#144). So this mirrors js/metric-config.js publishConfig():
// open a popup, navigate it to the web app, then CONFIRM BY READING the published file back. A save is only
// reported as saved once the server's own copy says so.
//
// 🚨 job_notes.json is pushed to a PUBLIC repo (Rule 9). `guardProblem()` refuses an email address or a long
// digit run, and the editor shows a standing caution line. That is a guard, not a guarantee — the wording in
// front of the user is what keeps candidate data out of it.

const LIVE_URL = 'https://raw.githubusercontent.com/jerin-k/ik-hiring-website/main/data/job_notes.json';
const LOCAL_URL = '/data/job_notes.json';
// #152: confirm-by-read must NOT use LIVE_URL. raw.githubusercontent caches for five minutes and IGNORES the
// ?cb cache-buster — re-measured on THIS file 19 Sep: two GETs with different ?cb values returned
// `x-cache: MISS` then `x-cache: HIT, source-age: 75`, both `cache-control: max-age=300`. So every one of the
// sixteen polls below read the OLD file and a save that had worked perfectly reported "not confirmed". The
// contents API reads git directly and allows CORS — the same fix metric-config.js took in #111b (13 Sep).
const CONFIRM_URL = 'https://api.github.com/repos/jerin-k/ik-hiring-website/contents/data/job_notes.json?ref=main';
const WEBAPP_URL = 'https://script.google.com/a/macros/interviewkickstart.com/s/AKfycbxI6L89uE35GBRMNVRcjEHhvt6iWRTNO2J3C0JYn_hKdepYA80lCXe7TvFvriYb2XFHtQ/exec';
const DRAFT_LS = 'ik_job_notes_draft';   // {job8: text} — notes this browser has typed but not confirmed saved

export const NOTE_MAX = 600;

let published = {};     // job8 -> { text, by, at }   as the server has it
let drafts = {};        // job8 -> text               unconfirmed, this browser only
let loadedAt = null;

function readDrafts() {
  try { drafts = JSON.parse(localStorage.getItem(DRAFT_LS) || '{}') || {}; } catch (e) { drafts = {}; }
}
function writeDrafts() {
  try { localStorage.setItem(DRAFT_LS, JSON.stringify(drafts)); } catch (e) { /* private window — the note still shows until reload */ }
}

// #152: a draft whose confirm timed out used to sit here for ever. noteOf() always prefers a draft over the
// server's copy, and NOTHING ever re-checked — so a note that had saved perfectly kept its amber "unsaved"
// mark through every reload, forever. metric-config.js heals exactly this on load (the isDirty() + sameConfig
// block, #111b); this module never learned to. If the server now agrees with what this browser was holding,
// the draft has done its job and goes.
function healDrafts() {
  let changed = false;
  for (const k of Object.keys(drafts)) {
    const d = String(drafts[k] || '').trim();
    const p = published[k];
    // A cleared note is an EMPTY draft, and the server deletes the key rather than storing empty text — so
    // "no record on the server" is the confirmation that a clear went through.
    if (p ? String(p.text || '').trim() === d : d === '') { delete drafts[k]; changed = true; }
  }
  if (changed) writeDrafts();
}

// The published file first, the copy in this deployment as the fallback — the same order data.js uses, so a
// CDN hiccup degrades to "slightly stale", never to "no notes".
export async function loadNotes() {
  readDrafts();
  // #152: holding an unconfirmed draft, read the AUTHORITATIVE copy instead of the CDN's five-minute-old one —
  // otherwise a note that saved fine keeps showing amber until the cache happens to turn over. With no drafts
  // there is nothing to heal, so the cheap cached read is right (and leaves the API's hourly budget alone).
  if (Object.keys(drafts).length) {
    const live = await fetchFresh();
    if (live) {
      published = (live && live.notes) || {};
      loadedAt = (live && live.updatedAt) || null;
      healDrafts();
      return true;
    }
  }
  for (const url of [LIVE_URL + '?cb=' + Date.now(), LOCAL_URL]) {
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) continue;
      const j = await r.json();
      published = (j && j.notes) || {};
      loadedAt = (j && j.updatedAt) || null;
      healDrafts();
      return true;
    } catch (e) { /* try the next one */ }
  }
  published = {};
  return false;
}

// What to show in the cell: an unconfirmed draft wins over the server's copy, so the writer always sees their
// own words — marked unsaved, never passed off as saved.
export function noteOf(job8) {
  const k = String(job8 || '').slice(0, 8);
  if (!k) return null;
  const p = published[k] || null;
  if (Object.prototype.hasOwnProperty.call(drafts, k)) {
    return { text: drafts[k], by: p ? p.by : null, at: p ? p.at : null, unsaved: true };
  }
  return p ? { text: p.text || '', by: p.by || null, at: p.at || null, unsaved: false } : null;
}

export function notesLoadedAt() { return loadedAt; }
export function draftCount() { return Object.keys(drafts).length; }

// 🚨 The file is world-readable. Block the two things that are unmistakably personal data; everything else is
// the writer's judgement, which is why the caution line sits under the box at all times.
export function guardProblem(text) {
  const t = String(text || '');
  if (/[\w.+-]+@[\w.-]+\.\w{2,}/.test(t)) return 'That looks like an email address. This note is publicly readable — take it out before saving.';
  if (/\b\d{7,}\b/.test(t)) return 'That looks like a phone number or an ID. This note is publicly readable — take it out before saving.';
  if (t.length > NOTE_MAX) return `Too long by ${t.length - NOTE_MAX} characters — a remark is a line or two, not a report.`;
  return null;
}

const b64url = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// #152: the contents API first (it reads git itself, so a write shows up at once), the cached raw file only as
// a fallback if the API refuses — its unauthenticated limit is 60 requests an hour per address, and one save
// spends at most ten.
async function fetchFresh() {
  try {
    const r = await fetch(CONFIRM_URL + '&cb=' + Date.now(), { headers: { Accept: 'application/vnd.github.raw+json' }, cache: 'no-store' });
    if (r.ok) return await r.json();
  } catch (e) { /* fall through to the CDN */ }
  try {
    const r = await fetch(LIVE_URL + '?cb=' + Date.now(), { cache: 'no-store' });
    if (r.ok) return await r.json();
  } catch (e) { }
  return null;
}

// Save one note. Returns { ok, reason }. The draft is kept until the SERVER says the note is there, so a
// failed save never silently loses what somebody typed — and never claims success it cannot see.
export async function publishNote(job8, text) {
  const k = String(job8 || '').slice(0, 8);
  if (!k) return { ok: false, reason: 'This role has no job id, so a note cannot be filed against it.' };
  const clean = String(text || '').trim();
  const bad = guardProblem(clean);
  if (bad) return { ok: false, reason: bad };

  drafts[k] = clean; writeDrafts();   // keep it before anything can go wrong

  // #152: `popup=yes` has to be said out loud — without it Chrome hands back a full TAB, which is what made
  // saving feel like the dashboard had been thrown away. The size is set for GOOGLE's sign-in box, which is
  // what fills this window the first time somebody saves; 460x320 clipped it.
  const w = window.open('', 'jnPublish', 'popup=yes,width=440,height=420');
  if (!w) return { ok: false, reason: 'Pop-ups are blocked for this site. Allow them and press Save again — your note is kept here meanwhile.' };

  // Param names are jn-prefixed for the same reason metric-config uses mc-prefixes: Apps Script 404s on
  // short reserved names like c / i / n.
  const url = WEBAPP_URL + '?page=doPublishNote&jnjob=' + encodeURIComponent(k)
    + '&jnsid=jn' + Date.now().toString(36)
    + '&jndata=' + b64url(clean);
  try { w.location = url; } catch (e) { /* the popup reports its own errors on screen */ }

  // Confirm-by-read. #152: reading the real file instead of the cached one, the write is normally visible on
  // the first or second look, so the waits start short and only stretch if something is actually wrong — ten
  // looks over about half a minute, against sixteen fixed 2.5s polls that could never succeed.
  const WAITS = [1200, 1500, 1500, 2000, 2500, 3000, 3000, 4000, 4000, 5000];
  for (const wait of WAITS) {
    await new Promise(r => setTimeout(r, wait));
    const live = await fetchFresh();
    if (!live || !live.notes) continue;
    // 🚨 CLEARING a remark sends an empty string, and the server DELETES the key rather than storing empty
    // text — so the old `live.notes[k]` test could never confirm a clear, and every clear timed out and stayed
    // amber. Absent and empty are the same answer here.
    const got = live.notes[k];
    if ((got ? String(got.text || '').trim() : '') === clean) {
      published = live.notes; loadedAt = live.updatedAt || null;
      delete drafts[k]; writeDrafts();
      try { w.close(); } catch (e) { }
      return { ok: true };
    }
  }
  return { ok: false, reason: 'Your note is safe here, but the server has not confirmed it yet. Look at the small window for a sign-in or permission message. If it said Saved, reload in a minute and the amber mark clears itself.' };
}
