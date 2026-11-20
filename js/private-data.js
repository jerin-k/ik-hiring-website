// #10f (Jerin, 20 Nov 2026 — "Keep Vercel, split"): THE ONE READER for the dashboard's data once it is private.
//
// WHY. The sign-in guarded the screen, not the data: every data file was a public download. The site and its
// address stay exactly where they are; only the DATA moves, to private storage, handed out by a small service
// (`hiring-data`, in the project-root repo under cloudrun-data/) that checks the Google sign-in itself.
//
// HOW IT WORKS, in order:
//   1. The person signs in with Google as they always have. auth.js keeps that sign-in in this tab.
//   2. The first data request hands that sign-in to the service ONCE. The service checks it with Google and
//      against the access list, and gives back its own pass, good for a working day.
//   3. Every data request carries the pass. No pass, no data — for every one of the data files.
//
// 🚨 THERE IS NO FALLBACK TO THE PUBLIC COPIES when this is on, on purpose. After switch-over they will not
//    exist, and before it a quiet fallback would hide exactly the failure a rehearsal is run to find.
// 🚨 THE SWITCH. Until switch-over (task 10, sub-task 10l) this reader is OFF for everyone, and every module
//    that imports it behaves exactly as it did before. One browser turns it on for a rehearsal with
//    localStorage.setItem('ik_private_data', '1'). At switch-over the default flips, here, in privateDataOn().

const SERVICE = 'https://hiring-data-670799872834.asia-south1.run.app';
const SWITCH_LS = 'ik_private_data';
const PASS_SS = 'ik_data_pass';   // this tab's pass: { p: the pass, x: when it ends (epoch seconds), e: whose it is }

export function privateDataOn() {
  if (location.hostname === 'localhost') return false;   // a local preview has no Google sign-in to show the service
  try { return localStorage.getItem(SWITCH_LS) === '1'; } catch (e) { return false; }
}

function signedInUser() {
  try { return JSON.parse(sessionStorage.getItem('user') || 'null'); } catch (e) { return null; }
}

// A pass is reused only by the person it was issued to, and only while it has a minute or more left.
function storedPass(email) {
  try {
    const s = JSON.parse(sessionStorage.getItem(PASS_SS) || 'null');
    if (s && s.p && s.e === email && s.x - 60 > Date.now() / 1000) return s.p;
  } catch (e) { /* no usable pass */ }
  return null;
}

export function forgetPass() {
  try { sessionStorage.removeItem(PASS_SS); } catch (e) { /* nothing to forget */ }
}

// Google's sign-in lasts about an hour; the pass lasts a working day. When the pass is gone AND Google's sign-in
// has gone stale, the only honest thing left is the sign-in card. The promise never settles: the page is leaving.
function signInAgain() {
  const wasSignedIn = !!signedInUser();
  forgetPass();
  try { sessionStorage.removeItem('user'); } catch (e) { /* already gone */ }
  // Reload ONLY if there was a sign-in to clear. A page with nobody signed in must never reload itself here:
  // it would come back just as signed-out and do it again, for ever.
  if (!wasSignedIn) throw new Error('not signed in');
  location.reload();
  return new Promise(() => { });
}

function noAccess() {
  const e = new Error('no access');
  e.noAccess = true;
  return e;
}

let inFlight = null;   // several files load at once; they share ONE trip to the service for the pass

async function getPass(fresh) {
  const user = signedInUser();
  if (!user || !user.token || !user.email) return signInAgain();
  if (!fresh) {
    const kept = storedPass(user.email);
    if (kept) return kept;
  }
  if (!inFlight) {
    const trip = (async () => {
      const r = await fetch(SERVICE + '/session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: user.token }), cache: 'no-store',
      });
      if (r.status === 403) throw noAccess();        // an IK account the access list does not let in
      if (r.status === 401) return signInAgain();    // Google's sign-in has gone stale
      if (!r.ok) throw new Error('the data service answered ' + r.status);
      const j = await r.json();
      try { sessionStorage.setItem(PASS_SS, JSON.stringify({ p: j.session, x: j.expires, e: user.email })); } catch (e) { /* still usable this once */ }
      return j.session;
    })();
    inFlight = trip;
    const clear = () => { if (inFlight === trip) inFlight = null; };
    trip.then(clear, clear);
  }
  return inFlight;
}

// The named data file, parsed. null if the service has no such file. Throws an error with .noAccess for a person the
// access list keeps out, and a plain error if the service is unwell.
export async function privateJson(name) {
  const ask = (pass) => fetch(SERVICE + '/data/' + name, { headers: { Authorization: 'Bearer ' + pass }, cache: 'no-store' });
  let r = await ask(await getPass(false));
  if (r.status === 401) {              // the pass ran out: one fresh pass, one more try
    forgetPass();
    r = await ask(await getPass(true));
    if (r.status === 401) return signInAgain();
  }
  if (r.status === 404) return null;
  if (r.status === 403) throw noAccess();
  if (!r.ok) throw new Error('the data service answered ' + r.status + ' for ' + name);
  return await r.json();
}
