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

// The published file first, the copy in this deployment as the fallback — the same order data.js uses, so a
// CDN hiccup degrades to "slightly stale", never to "no notes".
export async function loadNotes() {
  readDrafts();
  for (const url of [LIVE_URL + '?cb=' + Date.now(), LOCAL_URL]) {
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) continue;
      const j = await r.json();
      published = (j && j.notes) || {};
      loadedAt = (j && j.updatedAt) || null;
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

async function fetchFresh() {
  try {
    const r = await fetch(LIVE_URL + '?cb=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
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

  const w = window.open('', 'jnPublish', 'width=460,height=320');
  if (!w) return { ok: false, reason: 'Pop-ups are blocked for this site. Allow them and press Save again — your note is kept here meanwhile.' };

  // Param names are jn-prefixed for the same reason metric-config uses mc-prefixes: Apps Script 404s on
  // short reserved names like c / i / n.
  const url = WEBAPP_URL + '?page=doPublishNote&jnjob=' + encodeURIComponent(k)
    + '&jnsid=jn' + Date.now().toString(36)
    + '&jndata=' + b64url(clean);
  try { w.location = url; } catch (e) { /* the popup reports its own errors on screen */ }

  // Confirm-by-read: poll the published file until it carries this note (~40s), exactly as a publish does.
  for (let i = 0; i < 16; i++) {
    await new Promise(r => setTimeout(r, 2500));
    const live = await fetchFresh();
    const got = live && live.notes && live.notes[k];
    if (got && String(got.text || '').trim() === clean) {
      published = live.notes; loadedAt = live.updatedAt || null;
      delete drafts[k]; writeDrafts();
      try { w.close(); } catch (e) { }
      return { ok: true };
    }
  }
  return { ok: false, reason: 'Saved here, but the server has not confirmed it yet — check the pop-up for a sign-in or permission message. Your note is kept in this browser and the cell stays marked unsaved.' };
}
