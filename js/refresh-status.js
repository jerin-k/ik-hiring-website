// ===== #162 (Jerin, 23 Sep 2026): "Poor UI play" — Refresh threw open a window of raw JSON =====
//
// WHAT IT USED TO DO. Clicking Refresh opened a second browsing context at the web app's ?action=refresh and
// left the person looking at the pipeline's raw answer:
//     {"status":"ok","message":"Refresh scheduled. Data will update in 2-4 minutes."}
// That window was never the point — it was the #144 workaround. Google does not answer cross-site XHR for
// /exec at all, so a plain fetch arrives as nobody and is handed a sign-in page instead of running anything.
// Only a REAL browsing context carries the person's Google session. A window was the blunt way to get one;
// it also meant a pop-up blocker could stop the refresh outright.
//
// 🚨 A HIDDEN FRAME IS A REAL BROWSING CONTEXT — BUT NOT FOR THE JSON ENDPOINT. Measured 23 Sep from
//    hiring.interviewkickstart.com, with a control: a TOP-LEVEL load of ?action=orQueue returns its JSON,
//    while the IDENTICAL url inside an iframe returns 403. Same browser, same session, same url — so it is
//    the framing, not the sign-in. ContentService cannot be framed by a third-party site; only HtmlService
//    can declare ALLOWALL. That is why #162 needed a web-app change (V43) and could not be site-only, and
//    why this points at ?action=refreshUi rather than ?action=refresh.
//
// WHAT IT DOES NOW. The hidden frame loads ?action=refreshUi, which schedules the same run and posts its
// outcome back with window.top.postMessage — the pattern opening-requests.js already uses for {orReady},
// because Apps Script nests the user code two frames down and `parent` is Google's own wrapper.
//
// 🔑 SO THE CARD NEVER GUESSES. #144's real lesson was that this page must claim nothing it cannot see:
//   • "started" is the pipeline's OWN word, relayed from inside the frame — not this page hoping.
//   • "the numbers have landed" waits for our copy of the data to actually change, read through #164's
//     readDataStamp() so the two can never drift into different ideas of what "new data" means.
//   • Anything else says plainly that it could not be confirmed, and offers the old window.

import { readDataStamp, reloadKeepingPlace } from './build-watch.js';

const POLL_MS = 20 * 1000;            // the pipeline says 2-4 minutes; Vercel then takes another half minute
const GIVE_UP_MS = 10 * 60 * 1000;
const CONFIRM_MS = 20 * 1000;         // how long to wait for the frame's own word that it started
const GOOGLE_ORIGIN = /^https:\/\/([a-z0-9-]+\.)*(googleusercontent\.com|google\.com)$/;

let card = null, frame = null, timer = null, confirmTimer = null;
let startedAt = 0, baseline = null, confirmed = false, webapp = '';

function stop() {
  if (timer) { clearInterval(timer); timer = null; }
  if (confirmTimer) { clearTimeout(confirmTimer); confirmTimer = null; }
  if (frame) { frame.remove(); frame = null; }
}

function close() { stop(); if (card) { card.remove(); card = null; } }

const COPY = {
  starting: ['Starting the refresh', 'Asking the pipeline to re-read Ashby.'],
  running: ['Refresh started', 'The pipeline has taken it. New numbers usually land in 2 to 4 minutes — this '
          + 'card will say so the moment they do, so there is nothing to watch for.'],
  landed: ['New numbers have landed', 'This tab is still showing the older figures. Reload to see the new '
         + 'ones; you will come back to this same tab, with your filters still set.'],
  stalled: ['Could not confirm the refresh', 'Nothing came back to say the run started. Your Google sign-in '
          + 'has to reach the pipeline. Open it in a window to see the pipeline\'s own answer.'],
  quiet: ['No new numbers yet', 'The run started, but ten minutes have passed with no change to the data. '
        + 'Open the pipeline in a window to see what it says.'],
};

function show(state, detail) {
  if (!card) {
    card = document.createElement('div');
    card.className = 'refresh-toast';
    card.setAttribute('role', 'status');
    document.body.appendChild(card);
  }
  card.dataset.state = state;
  const [head, body] = COPY[state];
  const withWindow = state === 'stalled' || state === 'quiet';

  card.innerHTML = `
    <div class="refresh-toast-head">
      <span class="refresh-toast-dot" aria-hidden="true"></span>${head}
      <button type="button" class="refresh-toast-x" title="Dismiss" aria-label="Dismiss">&#x2715;</button>
    </div>
    <div class="refresh-toast-body">${body}${detail ? ' <span class="refresh-toast-detail">' + detail + '</span>' : ''}</div>
    ${state === 'landed' ? '<div class="refresh-toast-actions"><button type="button" class="refresh-toast-btn">Reload</button></div>' : ''}
    ${withWindow ? '<div class="refresh-toast-actions"><button type="button" class="refresh-toast-ghost">Open in a window</button></div>' : ''}`;

  card.querySelector('.refresh-toast-x').addEventListener('click', close);
  const go = card.querySelector('.refresh-toast-btn');
  if (go) go.addEventListener('click', reloadKeepingPlace);
  const win = card.querySelector('.refresh-toast-ghost');
  if (win) win.addEventListener('click', () => {
    window.open(webapp + '?action=refresh', 'ikRefresh', 'width=560,height=300');
    close();
  });
}

// The frame's own word that the run was taken. Origin-checked the same way app.js checks Req Bot's {orReady}:
// the window runs on Google's own sandbox domains, and nothing else may speak for it.
function onMessage(e) {
  if (!GOOGLE_ORIGIN.test(e.origin) || !e.data || !e.data.ikRefresh) return;
  if (e.data.ikRefresh === 'started') {
    confirmed = true;
    if (confirmTimer) { clearTimeout(confirmTimer); confirmTimer = null; }
    show('running');
  } else if (e.data.ikRefresh === 'failed') {
    stop();
    show('stalled', String(e.data.message || ''));
  }
}

// Waiting is the honest part: success is claimed only once our own copy of the data has actually moved.
function watch() {
  timer = setInterval(async () => {
    const now = await readDataStamp();
    if (now && baseline && now !== baseline) { stop(); show('landed'); return; }
    if (Date.now() - startedAt > GIVE_UP_MS) { stop(); show(confirmed ? 'quiet' : 'stalled'); }
  }, POLL_MS);
}

export async function startRefresh(webappUrl) {
  close();
  webapp = webappUrl;
  confirmed = false;
  startedAt = Date.now();
  show('starting');
  baseline = await readDataStamp();

  window.removeEventListener('message', onMessage);
  window.addEventListener('message', onMessage);

  // This frame is what actually asks the pipeline to run: a real browsing context, so it carries the person's
  // Google session — a plain fetch would arrive as nobody and be handed a sign-in page (#144).
  frame = document.createElement('iframe');
  frame.style.cssText = 'position:absolute;width:0;height:0;border:0;left:-9999px;top:-9999px';
  frame.setAttribute('aria-hidden', 'true');
  frame.title = 'Ashby refresh trigger';
  frame.src = webappUrl + '?action=refreshUi';
  document.body.appendChild(frame);

  // Nothing back within 20 seconds means the frame never ran — say so rather than sit on "starting".
  confirmTimer = setTimeout(() => { if (!confirmed) { stop(); show('stalled'); } }, CONFIRM_MS);
  watch();
}
