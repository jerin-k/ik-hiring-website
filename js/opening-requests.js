// ===== #112 phase 1 (GO: Jerin, 16 Sep 2026) — the Opening Requests window =====
// A recruiter clicks "+ Create Opening", a draft form opens INSIDE the chat, the form sets or flags every entry
// against the rules we already work to, and on Submit the assistant looks for an opening on the job that could be
// used instead BEFORE anything reaches Jerin or Gopu. Approved design: mock-up v4
// (https://claude.ai/artifact/8KtDGLx1PBSCZaLsJUgMEi) · worklists/112_opening_request_assistant.md.
//
// 🔑 WHERE THIS RUNS: not on the dashboard. The Apps Script web app serves a thin page at `/exec?page=requests`
// (Code.gs → requestsPage_) that imports THIS module from the live site. Every read and write goes through
// `google.script.run` inside the signed-in Google session, so requests stay PRIVATE (a Drive Sheet), and the
// public GitHub repo never sees one. The dashboard frames that window as its Req Bot tab, and /requests frames it too.
// 🔑 The server re-checks everything that matters (who may raise, required fields, active recruiter). The checks
// here are for the person filling the form in — fast, and in plain words.
// Phase 2 (GO: Jerin, 21 Sep): Jerin or Gopu approves, or sends back with a note, inside the request's own thread.
// 112e (Jerin, 22 Sep: "for send back cases, dont create a new sequence number"): the person who raised a sent-back request
// revises it IN PLACE — same OR number, same thread here and in Slack — and it goes back for approval (server: orResubmit).
// 112a (GO: Jerin, 21 Sep): Edit & approve — the approver opens the request in the same draft form, changes what is
// needed and approves in one step; the server records each change, old ➔ new, in the thread.
// #158 (Jerin, 22 Sep): the window's look is mock-up direction C in the dashboard's own colours — see the stylesheet.
// Phase 3 (Claude creates the opening in Ashby) is NOT here; it has its own go.

import { loadDashboardData } from './data.js';
import { loadMetricConfig } from './metric-config.js';
import { familyForJob, classificationFor, gridForQuarter, scoreForRole, isSmeDept } from './score-model.js';

const FIRST_DAY = '2026-07-01';   // #127: nothing before Q3 2026
const LEVELS = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8'];
const ROLE_TYPES = ['New', 'Replacement', 'Anticipation Of Exit', 'As per AOP', 'Buffer'];
const COMPLEXITIES = ['Normal', 'Complex', 'Uber Complex'];
// A topic this short or this generic cannot tell two openings on one job apart - ask rather than accept it.
const VAGUE = /^(ai|ml|tech|technology|general|misc|others?|na|n\/a|tbd|tbc|any|role|instructor|sme|trainer|-+)$/i;

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const todayIST = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const quarterOf = (ds) => `${ds.slice(0, 4)}-Q${Math.floor((+ds.slice(5, 7) - 1) / 3) + 1}`;
const qLabel = (q) => q.slice(-2);
function quarterBounds(q) {
  const y = +q.slice(0, 4), n = +q.slice(-1);
  const start = `${y}-${String((n - 1) * 3 + 1).padStart(2, '0')}-01`;
  const end = new Date(Date.UTC(y, n * 3, 0)).toISOString().slice(0, 10);
  return [start, end];
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const niceDay = (ds) => ds ? `${+ds.slice(8, 10)} ${MON[+ds.slice(5, 7) - 1]} ${ds.slice(0, 4)}` : '';
function niceStamp(iso) {
  if (!iso) return '';
  const d = new Date(iso), ist = new Date(d.getTime() + 5.5 * 3600e3).toISOString();
  const day = ist.slice(0, 10) === todayIST() ? 'today' : niceDay(ist.slice(0, 10));
  return `${day} ${ist.slice(11, 16)}`;
}
// #158: the dashboard's own {ik} mark (index.html), so the window's header matches the site's
const IK_MARK = '<svg class="ik-mark" viewBox="0 0 176 128" role="img" aria-label="Interview Kickstart" fill="none"><path d="M36.41 13.546C32.422 13.546 29.647 14.153 28.088 15.367C26.613 16.494 25.877 18.531 25.877 21.477V47.354C25.877 52.555 24.836 56.371 22.756 58.797C20.763 61.225 17.598 63.002 13.264 64.129C17.598 65.169 20.805 66.901 22.886 69.33C24.967 71.671 26.007 75.44 26.007 80.643V106.52C26.007 109.467 26.744 111.504 28.218 112.63C29.779 113.845 32.509 114.451 36.41 114.451V127.585C29.215 127.585 23.58 126.805 19.504 125.244C15.517 123.769 12.7 121.515 11.053 118.481C9.40499 115.446 8.582 111.502 8.582 106.647V82.07C8.582 78.171 7.976 75.482 6.761 74.008C5.547 72.447 3.294 71.667 0 71.667V56.453C3.294 56.453 5.548 55.673 6.761 54.112C7.976 52.551 8.582 49.82 8.582 45.921V21.344C8.582 16.403 9.40399 12.458 11.053 9.51099C12.7 6.47599 15.517 4.22299 19.504 2.74799C23.58 1.18599 29.214 0.406006 36.41 0.406006V13.546Z" fill="#3996D2"></path><path d="M139.488 0.412994C146.683 0.412994 152.275 1.193 156.262 2.754C160.337 4.229 163.155 6.482 164.714 9.517C166.36 12.464 167.185 16.41 167.185 21.35V45.927C167.185 49.827 167.791 52.56 169.006 54.119C170.22 55.679 172.473 56.459 175.767 56.459V71.674C172.473 71.674 170.219 72.454 169.006 74.015C167.791 75.491 167.185 78.176 167.185 82.078V106.655C167.185 111.509 166.361 115.454 164.714 118.489C163.153 121.522 160.337 123.778 156.262 125.251C152.275 126.812 146.683 127.593 139.488 127.593V114.459C143.389 114.459 146.077 113.852 147.551 112.638C149.112 111.511 149.892 109.474 149.892 106.528V80.651C149.892 75.449 150.932 71.677 153.012 69.338C155.093 66.91 158.257 65.177 162.505 64.137C158.17 63.01 154.963 61.234 152.882 58.805C150.889 56.378 149.892 52.565 149.892 47.363V21.486C149.892 18.539 149.112 16.502 147.551 15.375C146.076 14.161 143.39 13.554 139.488 13.554V0.412994Z" fill="#3996D2"></path><path d="M66.024 45.959V100.054H51.531V45.959H66.024V45.959Z" fill="#ffffff"></path><path d="M58.674 18.094C61.261 18.094 63.369 18.91 65.002 20.544C66.703 22.107 67.554 24.116 67.554 26.565C67.554 29.014 66.703 31.056 65.002 32.689C63.369 34.253 61.26 35.038 58.674 35.038C56.089 35.038 53.98 34.255 52.347 32.689C50.714 31.056 49.898 29.014 49.898 26.565C49.898 24.117 50.714 22.108 52.347 20.544C53.981 18.911 56.089 18.094 58.674 18.094Z" fill="#ffffff"></path><path d="M94.729 22.79V100.055H80.237V24.423L94.729 22.79Z" fill="#ffffff"></path><path d="M127.594 45.959L110.345 69.74L129.125 100.053H112.692L95.239 70.453L112.591 45.958L127.594 45.959Z" fill="#ffffff"></path></svg>';
// Stroke icons for the buttons: they take the button's own text colour
const ICONS = { plus: '<path d="M12 5v14M5 12h14"/>', check: '<path d="M5 12l5 5 9-10"/>', pen: '<path d="M4 20l4-1 11-11-3-3L5 16z"/>',
  back: '<path d="M10 7l-5 5 5 5"/><path d="M5 12h14"/>' };
const ico = (n) => `<svg class="or-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg>`;
const initials = (name) => String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');

const STATUS_CLASS = { 'Draft': 's-draft', 'For approval': 's-wait', 'Needs changes': 's-fix', 'Sent back': 's-back', 'Approved': 's-ok', 'Created': 's-done' };

// 112a: what an approver's edit changes, previewed before saving. The server's list (Code.gs OR_EDIT, same labels, same
// order) is the one that records it; this one only shows the approver what will be recorded.
const EDIT_FIELDS = [['jobTitle', 'Job'], ['count', 'How many'], ['recruiter', 'Recruiter'], ['team', 'Team'], ['location', 'Location'],
  ['roleType', 'Role Type'], ['employmentType', 'Employment Type'], ['levelSet', 'Job Level'], ['complexity', 'Role Complexity'],
  ['topic', 'Topic'], ['openDate', 'Open date'], ['replacementOf', 'Replacement of'], ['sourcer', 'Sourcer'],
  ['description', 'Description'], ['name', 'Name'], ['pts', 'Points each']];
const str = (v) => String(v == null ? '' : v).trim();
const editsOf = (was, now) => EDIT_FIELDS.filter(([k]) => str(now[k]) !== str(was[k]))
  .map(([k, field]) => ({ field, from: str(was[k]), to: str(now[k]) }));
const editLi = (x) => `<li><span>${esc(x.field)}</span><span><s>${esc(x.from || 'blank')}</s> ➔ <b>${esc(x.to || 'blank')}</b></span></li>`;

// 112g (Jerin, 22 Sep, Gopu's point: "2 New, 1 buffer & 2 replacement openings"; mock-up B): one request can hold several
// Role Types. The draft keeps a count per Role Type (d.mix) and one name per Replacement opening (d.replacing) — each becomes
// its own opening in Ashby, naming the one person it replaces. How many, the Role Type and Replacement of follow from them.
const mixTotal = (m) => Object.values(m || {}).reduce((a, n) => a + (Number(n) || 0), 0);
const mixOrder = (m) => ROLE_TYPES.concat(Object.keys(m || {}).filter(t => !ROLE_TYPES.includes(t)));
const mixSummary = (m) => { const on = mixOrder(m).filter(t => (m[t] || 0) > 0); return on.length === 1 ? on[0] : on.map(t => `${t} ${m[t]}`).join(' · '); };
const mixOf = (x) => {   // a saved request's mix; one saved before 112g had a single Role Type
  if (x.mix && mixTotal(x.mix) > 0) return Object.assign({}, x.mix);
  return x.roleType && x.count ? { [x.roleType]: Number(x.count) || 0 } : {};
};

// ---------------------------------------------------------------------------------------------------------------
// The rules. ONE function, fed the draft and the dashboard data, returns what the form sets by itself, what it
// flags, and what blocks Submit. Each line maps to a row of mock-up v4's rules table.
// ---------------------------------------------------------------------------------------------------------------
function evaluate(d, ctx) {
  const r = { roleType: d.roleType, employmentType: d.employmentType, levelNow: '', levelSet: '', complexity: d.complexity,
              notes: {}, checks: [], blockers: [], pts: 0, tier: '', name: '',
              mix: Object.assign({}, d.mix), total: mixTotal(d.mix), aopOnly: false, replacing: [], replacementOf: '' };
  const check = (kind, text) => r.checks.push({ kind, text });
  const block = (text) => { r.blockers.push(text); check('stop', text); };
  const job = ctx.jobById[d.jobId];
  if (!job) { block('Pick the job this opening is for.'); return r; }

  const dept = job.department || '', title = job.title || '';
  const sme = isSmeDept(dept), pa = /program advisor/i.test(title), intern = /\bintern/i.test(title);
  const fam = familyForJob(dept, title);

  // Job is Open in Ashby, and not a Test job
  if (job.status !== 'Open') block(`This job is ${job.status || 'not Open'} in Ashby. An opening can only be requested on an Open job.`);
  else if (fam === 'Exclude' || /\btest\b/i.test(title)) block('This looks like a test job, which scores nothing. Pick the real job.');
  else check('ok', `${dept} · Open in Ashby`);

  // How many openings, by Role Type (112g). SME India, SME US and PA are always As per AOP, so every opening sits on that row.
  r.aopOnly = sme || pa;
  r.total = mixTotal(d.mix);
  r.mix = r.aopOnly ? { 'As per AOP': r.total } : Object.assign({}, d.mix);
  if (!(r.total >= 1 && r.total <= 25)) block('Say how many openings of each Role Type (1 to 25 in all).');

  // Team and Location are required on Ashby's Create Opening form (Jerin, 21 Sep: "as per screenshot")
  const meta = (ctx.meta && ctx.meta.jobs && ctx.meta.jobs[d.jobId]) || {};
  const jobTeam = meta.team || job.team || '';
  if (!d.team) block('Pick the Team (Ashby requires it on the opening).');
  else if (jobTeam && d.team === jobTeam) r.notes.team = { kind: 'auto', text: 'The job\'s team in Ashby' };
  if (!d.location) block('Pick the Location (Ashby requires it on the opening).');
  else if ((meta.locations || []).includes(d.location)) r.notes.location = { kind: 'auto', text: 'A location of this job in Ashby' };

  // Recruiter is an active Ashby user
  const rec = ctx.recruiters.find(x => x.name === d.recruiter);
  if (!d.recruiter) block('Pick the recruiter who will own the opening.');
  else if (!rec) block(`${d.recruiter} is not an active Ashby user, so they cannot be put on the opening.`);
  else check('ok', `Recruiter: ${d.recruiter}, full Ashby name, active user`);

  // Role Type: SME India, SME US and PA -> As per AOP (set by the form)
  if (r.aopOnly) {
    r.notes.roleType = { kind: 'auto', text: 'Always As per AOP for SME India, SME US and PA' };
    check('fix', 'Role Type set to As per AOP (SME India, SME US and PA rule)');
  }
  r.roleType = mixSummary(r.mix);
  // one name per Replacement opening (Jerin, 22 Sep: "its gonna be 1 opening per replacement")
  const nRep = r.mix.Replacement || 0;
  r.replacing = (d.replacing || []).slice(0, nRep).map(v => String(v || '').trim());
  const named = r.replacing.filter(Boolean).length;
  if (nRep > named) block(nRep === 1 ? 'Say who the Replacement opening replaces.' : `Name the person each Replacement opening replaces (${nRep - named} still to fill).`);
  r.replacementOf = r.replacing.filter(Boolean).join('; ');

  // Employment Type by department (set by the form)
  const etAuto = dept === 'SME - India' ? 'PTC - Direct' : (dept === 'SME - US' ? 'PTE' : null);
  if (etAuto) {
    r.employmentType = etAuto;
    r.notes.employmentType = { kind: 'auto', text: `${dept} ⇒ ${etAuto}` };
    check('fix', `Employment Type set to ${etAuto} (${dept})`);
  } else if (!d.employmentType) block('Pick an Employment Type.');

  // Level lives on the JOB. SME / PTC -> NA, Interns -> L0, Tech / NonTech must have one.
  const now = job.level || 'NA';
  r.levelNow = now;
  let target = now, why = '';
  if (sme || /^PTC/i.test(r.employmentType || '')) { target = 'NA'; why = 'SME US, SME India and PTC roles take Level NA'; }
  else if (intern) { target = 'L0'; why = 'Interns take Level L0'; }
  else if ((fam === 'Tech' || fam === 'NonTech') && !/^L\d/i.test(now)) {
    target = d.levelPick || '';
    r.levelPicked = true;   // the form offers the Level to pick, and keeps offering it once picked so it can be changed
    if (!target) block('This job has no Level in Ashby, and without one the role scores zero. Pick the Level.');
    why = 'Tech and NonTech roles need a Level';
  }
  r.levelSet = target;
  if (target && target !== now) {
    r.notes.level = { kind: 'bad', text: `${why}. This job reads ${now} in Ashby, so Claude sets it to ${target} when creating.`
      + (sme ? ' No score changes: SME roles score on Complexity.' : '') };
    check('fix', `Job Level ${now} → ${target} (Claude fixes it on the job when creating)`);
  } else if (target) {
    r.notes.level = { kind: 'auto', text: why ? `${why} ✓` : 'As it stands on the job in Ashby' };
  }

  // Role Complexity picked explicitly
  if (!d.complexity) block('Pick the Role Complexity. A blank would score as Normal.');

  // Topic, and the name it builds
  const topic = String(d.topic || '').trim();
  if (!topic) block('Type the topic (specialisation). It goes into the opening name.');
  else if (topic.length < 3 || VAGUE.test(topic)) {
    r.notes.topic = { kind: 'bad', text: `"${topic}" is too broad to tell two openings on this job apart. Something like "Agentic AI" or "System Design" works.` };
    check('q', `Topic "${topic}" looks too broad. Worth making it specific.`);
  } else r.notes.topic = { kind: 'plain', text: 'Specific enough ✓' };
  // #159 (Jerin, 22 Sep): IK-<n> - <recruiter> - <Role Type> - <topic>, the pattern every Q3 opening was renamed to. The number
  // is given when the opening is created. Role Type comes from r.mix, so SME India, SME US and PA read As per AOP; a request with
  // several Role Types (112g) makes one opening per Role Type, and the name shows each of them.
  const types = mixOrder(r.mix).filter(t => (r.mix[t] || 0) > 0);
  r.name = `IK-### - ${d.recruiter || '<recruiter>'} - ${types.length ? types.join(' / ') : '<Role Type>'} - ${topic || '<topic>'}`;

  // Open date inside the current quarter
  const q = quarterOf(todayIST()), [qs, qe] = quarterBounds(q);
  if (!d.openDate) block('Pick the open date.');
  else if (d.openDate < FIRST_DAY) block('The open date cannot be before 1 Jul 2026.');
  else if (d.openDate < qs || d.openDate > qe) {
    r.notes.openDate = { kind: 'bad', text: `Outside ${qLabel(q)} ${q.slice(0, 4)}. The quarter decides whose Goal this counts in: it will count in ${quarterOf(d.openDate)}.` };
    check('q', `Open date is in ${quarterOf(d.openDate)}, not the current quarter.`);
  } else r.notes.openDate = { kind: 'plain', text: `In ${qLabel(q)} ${q.slice(0, 4)} ✓` };

  // Adding a Sourcer - told: splits credit 50/50 (#108)
  if (String(d.sourcer || '').trim()) check('info', `Sourcer ${d.sourcer.trim()}: Joined, Joining pending and Drop split 50/50 with them. The Goal stays with the recruiter.`);

  // Score: tier and points per opening, and what it adds to the recruiter's Goal
  const cls = classificationFor(fam, target, d.complexity, title);
  const oq = d.openDate && d.openDate >= FIRST_DAY ? quarterOf(d.openDate) : q;
  r.pts = scoreForRole({ department: dept, title, level: target, complexity: d.complexity }, oq);
  r.tier = cls ? (gridForQuarter(oq).rowTier[cls] || '') : '';
  r.quarter = oq;
  return r;
}

// What the assistant raises AFTER Submit, before anything goes for approval — in this order.
function questionsFor(d, ctx, requests) {
  const qs = [];
  const job = ctx.jobById[d.jobId];
  const j8 = (d.jobId || '').slice(0, 8);
  const data = ctx.data;

  // A free opening already on the job: Open, nobody in closing tied to it. Only openings opened from Q3 2026 are
  // listed one by one (openingRows); older Open ones are a count from the quarter buckets.
  const rows = (data.openingRows || []).filter(o => o.jobId8 === j8 && o.state === 'open' && !(o.jpTied > 0));
  const from = data.openingRowsFrom || '2026-Q3';
  const older = Object.entries(((data.openingBuckets || {})[j8] || {}).quarters || {})
    .filter(([qq]) => qq < from).reduce((a, [, v]) => a + (v.open || 0), 0);
  const inClosing = (data.joiningPendingCases || []).filter(c => c.jobId8 === j8).length;
  const nFree = rows.length + older;
  if (nFree > 0) qs.push({ key: 'free', rows, older, inClosing, nFree });

  // Not re-opening a dropped position as new (#110)
  const q = quarterOf(todayIST());
  const drops = (data.dropEvents || []).filter(e => e.jobId8 === j8 && e.quarter === q).length;
  if (drops > 0) qs.push({ key: 'drop', drops });

  // Same job already has a request in progress
  const open = (requests || []).filter(x => x.jobId === d.jobId && ['For approval', 'Needs changes', 'Approved'].includes(x.status));
  if (open.length) qs.push({ key: 'dup', open });
  return qs;
}

// ---------------------------------------------------------------------------------------------------------------
export async function mountOpeningRequests(root, backend) {
  const S = { me: null, requests: [], recruiters: [], options: {}, slackOn: false, data: null, jobs: [], jobById: {},
              active: null, draft: null, thread: [], asking: null, answers: {}, busy: false, error: '',
              editing: null, editNote: '' };   // 112a: the request an approver is editing, and the note going with it
  root.classList.add('or-app');
  // 112f (Jerin, 22 Sep: "This title panel is pointless. can remove"): inside the dashboard's Req Bot tab the window's own navy bar
  // only repeats the dashboard's header, so it goes there. The window asks whoever shows it; only the dashboard answers
  // {orHost: 'dashboard'}. On /requests (opened from a Slack link) nobody answers and the bar stays: it is that page's only title.
  window.addEventListener('message', (e) => {
    if (SITE_ORIGINS.includes(e.origin) && e.data && e.data.orHost === 'dashboard') root.classList.add('or-embedded');
  });
  try { SITE_ORIGINS.forEach(o => window.top.postMessage({ orHello: true }, o)); } catch (e) { /* not framed */ }
  root.innerHTML = '<div class="or-loading">Loading your requests and the latest dashboard data…</div>';

  let boot;
  try {
    [boot] = await Promise.all([
      backend.call('orBoot'),
      loadDashboardData().then(d => { S.data = d; }),
      loadMetricConfig().catch(() => null),   // the team's score grid; without it the built-in defaults apply
    ]);
  } catch (e) {
    root.innerHTML = `<div class="or-loading or-err">Could not load: ${esc(e && e.message || e)}. Reload the window to try again.</div>`;
    return;
  }
  if (!boot || !boot.ok) {
    root.innerHTML = `<div class="or-loading or-err">${esc((boot && boot.message) || 'This window is for the Recruitment Team, Jerin and Gopu.')}</div>`;
    signalReady();
    return;
  }
  S.me = boot.me; S.requests = boot.requests || []; S.recruiters = boot.recruiters || [];
  S.options = boot.options || {}; S.slackOn = !!boot.slackOn;
  S.meta = boot.meta || { teams: [], locations: [], jobs: {} };
  S.people = boot.people || S.recruiters;   // every active Ashby user: a sourcer need not be on the Recruitment Team
  S.jobs = (S.data.jobs || []).filter(j => j.status === 'Open' && familyForJob(j.department, j.title) !== 'Exclude')
    .sort((a, b) => (a.department || '').localeCompare(b.department || '') || (a.title || '').localeCompare(b.title || ''));
  (S.data.jobs || []).forEach(j => { S.jobById[j.id] = j; });
  const ctx = () => ({ jobById: S.jobById, recruiters: S.recruiters, data: S.data, meta: S.meta });
  let teamList = (S.meta.teams && S.meta.teams.length) ? S.meta.teams
    : [...new Set((S.data.jobs || []).map(j => j.team).filter(Boolean))].sort();
  // ⏳ TEMPORARY (Jerin, 21 Sep: "add the test department to the team list till we finish testing this out"). Jerin and Gopu
  // only, so a recruiter can never file a real request under it. REMOVE when #112 testing ends (worklist 112 says so).
  if (S.me.isApprover && !teamList.includes('Test')) teamList = teamList.concat('Test');
  const locationList = S.meta.locations || [];

  const roleTypes = (S.options.roleType && S.options.roleType.length) ? S.options.roleType : ROLE_TYPES;
  const empTypes = (S.options.employmentType && S.options.employmentType.length) ? S.options.employmentType : ['FTE', 'PTE', 'PTC - Direct'];
  const complexities = (S.options.complexity && S.options.complexity.length) ? S.options.complexity : COMPLEXITIES;

  function newDraft() {
    const mine = S.recruiters.find(x => x.email === S.me.email);
    return { jobId: '', count: 0, mix: Object.fromEntries(roleTypes.map(t => [t, 0])), replacing: [],
             recruiter: mine ? mine.name : '', roleType: '', employmentType: '', levelPick: '',
             complexity: '', topic: '', openDate: todayIST(), replacementOf: '', sourcer: '', note: '',
             team: '', location: '', description: '' };
  }

  function startNew() {
    S.active = 'draft'; S.draft = newDraft(); S.asking = null; S.answers = {}; S.error = '';
    S.thread = [{ who: 'claude', at: new Date().toISOString(),
      text: 'Here\'s your draft. I\'ve filled in what I already know, and anything I set from our rules is marked in teal.', form: true }];
    render();
  }

  // ---------------- rendering ----------------
  function render() {
    root.innerHTML = `
      <header class="or-bar">${IK_MARK}<b>Opening Requests</b>
        <span class="or-user"><span>${esc(S.me.name || S.me.email)} · ${esc(S.me.userType || '')}</span><i aria-hidden="true">${esc(initials(S.me.name || S.me.email))}</i></span></header>
      <div class="or-split">
        <nav class="or-rail" aria-label="Requests">${railHtml()}</nav>
        <section class="or-thread" aria-live="polite">${threadHtml()}</section>
      </div>`;
    wire();
  }

  function railHtml() {
    const waiting = S.me.isApprover ? S.requests.filter(x => x.status === 'For approval') : [];
    const mine = S.requests.filter(x => x.requesterEmail === S.me.email && !waiting.includes(x));
    const others = S.requests.filter(x => x.requesterEmail !== S.me.email && !waiting.includes(x));
    const item = (x) => `<button type="button" class="or-req${S.active === x.id ? ' on' : ''}" data-open="${esc(x.id)}">
        <b>${esc(x.id)} · ${esc(x.topic || x.jobTitle)} × ${esc(x.count)}</b><span class="or-st ${STATUS_CLASS[x.status] || 's-wait'}">${esc(x.status)}</span>
        <small>${esc(x.jobTitle)}${x.requesterEmail !== S.me.email ? ' · ' + esc(x.requesterName) : ''} · ${esc(niceStamp(x.createdAt))}</small></button>`;
    const draft = S.active === 'draft' ? `<button type="button" class="or-req on" data-open="draft">
        <b>New request${S.draft && S.draft.topic ? ' · ' + esc(S.draft.topic) : ''}</b><span class="or-st s-draft">Draft</span>
        <small>${esc((S.jobById[S.draft.jobId] || {}).title || 'not submitted yet')}</small></button>` : '';
    return `<button type="button" class="or-new" data-act="new">${ico('plus')}Create Opening</button>
      ${waiting.length ? `<div class="or-rail-h or-wait-h"><span>Waiting for your approval</span><span>${waiting.length}</span></div>${waiting.map(item).join('')}` : ''}
      <div class="or-rail-h${waiting.length ? ' or-gap' : ''}"><span>Your requests</span><span>${mine.length}</span></div>
      ${draft}${mine.map(item).join('') || (draft ? '' : '<p class="or-empty">None yet. Start one with Create Opening.</p>')}
      ${S.me.isApprover && others.length ? `<div class="or-rail-h or-gap"><span>Everyone else's</span><span>${others.length}</span></div>${others.map(item).join('')}` : ''}`;
  }

  function threadHtml() {
    if (!S.active) {
      return `<div class="or-hello"><h2>Ask for a new opening</h2>
        <p>Click <b>+ Create Opening</b>. A draft opens here, filled in with what the dashboard already knows. It sets or flags each entry
        against the rules we work to, and before it goes to Jerin or Gopu it checks whether an opening already on the job could be used instead.</p>
        <p class="or-muted">${S.slackOn ? 'Each request gets one Slack thread in #ta-core-team.' : 'Slack messages are switched off for now: approvers see requests here.'}</p></div>`;
    }
    if (S.active !== 'draft') return savedThreadHtml(S.requests.find(x => x.id === S.active));
    const ev = evaluate(S.draft, ctx());
    const job = S.jobById[S.draft.jobId];
    return `<div class="or-th-h"><b>${S.draft.revises ? `Revising ${esc(S.draft.revises)}` : 'New request'}</b><span class="or-st s-draft">Draft</span>
        <span class="or-m">${esc(job ? job.title : 'pick a job')}</span></div>
      ${S.thread.map(m => msgHtml(m, ev)).join('')}
      ${S.asking ? askHtml(S.asking) : ''}
      ${S.busy ? '<div class="or-row"><span class="or-av c">C</span><div class="or-bub or-typing">Saving…</div></div>' : ''}
      ${S.error ? `<div class="or-row"><span class="or-av c">C</span><div class="or-bub or-bad">${esc(S.error)}
          <div class="or-btns"><button type="button" class="or-b p" data-act="retry">Try again</button></div></div></div>` : ''}`;
  }

  function msgHtml(m, ev) {
    if (m.who === 'me') return `<div class="or-row me"><div class="or-bub">${esc(m.text)}</div><span class="or-av r">${esc(initials(S.me.name))}</span></div>`;
    return `<div class="or-row"><span class="or-av c">C</span><div>
        <div class="or-who"><b>Claude</b> · ${esc(niceStamp(m.at))}</div>
        <div class="or-bub">${m.html || esc(m.text)}${m.form ? formHtml(ev) : ''}${m.card ? cardHtml(m.card) : ''}</div></div></div>`;
  }

  function note(n) { return n ? `<span class="or-note ${n.kind === 'auto' ? 'auto' : (n.kind === 'bad' ? 'bad' : '')}">${esc(n.text)}</span>` : ''; }

  // `edit` is the saved request when an approver is editing it (112a): same form, same rules, its own buttons.
  function formHtml(ev, edit) {
    const d = S.draft, locked = !!S.asking || S.busy || S.submitted;
    const dis = locked ? ' disabled' : '';
    const job = S.jobById[d.jobId];
    const opt = (list, cur, ph) => `<option value="">${esc(ph)}</option>` + list.map(v => `<option${v === cur ? ' selected' : ''}>${esc(v)}</option>`).join('');
    const auto = (k) => ev.notes[k] && ev.notes[k].kind === 'auto';
    const nBlock = ev.blockers.length;
    const levelField = (() => {
      if (!job) return `<span class="or-in ro">—</span>`;
      if (ev.levelPicked) return `<select class="or-in${d.levelPick ? ' bad' : ''}" data-f="levelPick"${dis}>${opt(LEVELS, d.levelPick, 'Pick the Level…')}</select>`;
      if (ev.levelSet && ev.levelSet !== ev.levelNow) return `<span class="or-in ro bad">${esc(ev.levelNow)} → ${esc(ev.levelSet)}</span>`;
      return `<span class="or-in ro auto">${esc(ev.levelNow)}</span>`;
    })();
    const pts = ev.pts ? `<b>${ev.pts} pts</b> each${ev.total > 1 ? ` · <b>${ev.total} openings</b>` : ''} · <b>+${ev.pts * (ev.total || 0)}</b> to ${esc(d.recruiter || 'the recruiter')}'s ${esc(qLabel(ev.quarter || ''))} Goal` : '<span class="or-muted">score shows once the job and complexity are set</span>';
    const changes = edit && job ? editsOf(edit, fieldsOf(d, ev)) : [];
    // 112g, mock-up B: one row per Role Type with − / + (the number can be typed too), the names under Replacement, the total
    // underneath. On an SME India / SME US / PA job only the As per AOP row is open.
    const mixBlock = (() => {
      const rows = roleTypes.map(t => {
        const n = ev.mix[t] || 0, off = ev.aopOnly && t !== 'As per AOP', no = locked || off;
        const row = `<div class="or-mix-row${n ? '' : ' zero'}${off ? ' off' : ''}"><span class="or-mix-rt">${esc(t)}</span>
          <span class="or-step"><button type="button" data-mix="${esc(t)}" data-d="-1" aria-label="One fewer ${esc(t)} opening"${no || !n ? ' disabled' : ''}>−</button><input
            class="or-step-n" type="number" min="0" max="25" inputmode="numeric" data-mix-n="${esc(t)}" value="${n}" aria-label="${esc(t)} openings"${no ? ' disabled' : ''}><button
            type="button" data-mix="${esc(t)}" data-d="1" aria-label="One more ${esc(t)} opening"${no || ev.total >= 25 ? ' disabled' : ''}>+</button></span></div>`;
        if (t !== 'Replacement' || !n) return row;
        const names = Array.from({ length: n }, (_, i) => `<input class="or-in" type="text" maxlength="80" data-rep="${i}"
          value="${esc((d.replacing || [])[i] || '')}" placeholder="Opening ${i + 1} replaces… (name)"${dis}>`).join('');
        return row + `<div class="or-mix-sub"><span class="or-note">Who does each one replace? One name per opening: each becomes its own opening in Ashby.</span>
          <div class="or-mix-names">${names}</div></div>`;
      }).join('');
      const parts = mixOrder(ev.mix).filter(t => ev.mix[t] > 0).map(t => `${esc(t)} ${ev.mix[t]}`).join(' · ');
      return `<div class="or-f wide"><span>How many openings, by Role Type</span><div class="or-mix">${rows}
        <div class="or-mix-total"><b>Total ${ev.total} opening${ev.total === 1 ? '' : 's'}</b><span>${parts || 'Use + to add openings'}</span></div></div>${note(ev.notes.roleType)}</div>`;
    })();
    const state = nBlock ? `${nBlock} thing${nBlock === 1 ? '' : 's'} still needed`
      : (edit ? (changes.length ? `${changes.length} change${changes.length === 1 ? '' : 's'}` : 'No changes yet') : 'Ready to submit');
    return `<div class="or-form">
      <div class="or-form-h"><span>${edit ? `Editing ${esc(edit.id)}` : 'Opening draft'}</span><span>${state}</span></div>
      <div class="or-fgrid">
        <label class="or-f wide"><span>Job</span><div class="or-pick"><input class="or-in" type="search" data-q="job" autocomplete="off"
            placeholder="Search open jobs by title or department…" value="${esc(job ? job.title : '')}"${dis}><div class="or-pick-list" hidden></div></div>
          ${job ? `<span class="or-note">${esc(job.department)} · ${esc(job.status)} in Ashby · Level ${esc(job.level || 'NA')}${job.complexity ? ' · ' + esc(job.complexity) : ''}</span>` : ''}</label>
        <label class="or-f"><span>Team</span><select class="or-in${ev.notes.team ? ' auto' : ''}" data-f="team"${dis}>${opt(teamList.includes(d.team) || !d.team ? teamList : [d.team].concat(teamList), d.team, 'Pick the team…')}</select>${note(ev.notes.team)}</label>
        <label class="or-f"><span>Location</span>${locationList.length
          ? `<select class="or-in${ev.notes.location ? ' auto' : ''}" data-f="location"${dis}>${opt(locationList, d.location, 'Pick the location…')}</select>`
          : `<input class="or-in" type="text" maxlength="80" data-f="location" value="${esc(d.location)}" placeholder="Location"${dis}>`}${note(ev.notes.location)}</label>
        ${mixBlock}
        <label class="or-f"><span>Recruiter</span><select class="or-in${S.recruiters.some(x => x.email === S.me.email && x.name === d.recruiter) ? ' auto' : ''}" data-f="recruiter"${dis}>${opt(S.recruiters.map(x => x.name), d.recruiter, 'Pick the recruiter…')}</select>
          ${d.recruiter && S.recruiters.some(x => x.name === d.recruiter) ? '<span class="or-note auto">Full Ashby name · active user</span>' : ''}</label>
        <label class="or-f"><span>Employment Type</span>${auto('employmentType') ? `<span class="or-in ro auto">${esc(ev.employmentType)}</span>` : `<select class="or-in" data-f="employmentType"${dis}>${opt(empTypes, d.employmentType, 'Pick…')}</select>`}${note(ev.notes.employmentType)}</label>
        <label class="or-f"><span>Job Level (in Ashby)</span>${levelField}${note(ev.notes.level)}</label>
        <label class="or-f"><span>Role Complexity</span><select class="or-in" data-f="complexity"${dis}>${opt(complexities, d.complexity, 'Pick one…')}</select>
          <span class="or-note${job && d.complexity && d.complexity === job.complexity ? ' auto' : ''}">${job && d.complexity && d.complexity === job.complexity ? 'As set on the job in Ashby. Change it if this opening differs.' : 'Pick one; a blank would score as Normal'}</span></label>
        <label class="or-f"><span>Topic</span><input class="or-in" type="text" maxlength="60" data-f="topic" value="${esc(d.topic)}" placeholder="e.g. Agentic AI"${dis}>${note(ev.notes.topic)}</label>
        <label class="or-f"><span>Open date</span><input class="or-in" type="date" min="${FIRST_DAY}" data-f="openDate" value="${esc(d.openDate)}"${dis}>${note(ev.notes.openDate)}</label>
        <label class="or-f"><span>Sourcer (optional)</span><select class="or-in" data-f="sourcer"${dis}>${opt(S.people.map(x => x.name), d.sourcer, 'No sourcer')}</select>
          ${d.sourcer ? '<span class="or-note">Splits Joined, Joining pending and Drop 50/50. The Goal stays with the recruiter.</span>' : ''}</label>
        <label class="or-f wide"><span>Description (optional)</span><input class="or-in" type="text" maxlength="120" data-f="description" value="${esc(d.description)}" placeholder="Shown on the opening in Ashby"${dis}></label>
        ${edit ? '' : `<label class="or-f wide"><span>Note to approvers</span><textarea class="or-in" rows="2" maxlength="600" data-f="note" placeholder="Why now, cohort dates, anything they should know"${dis}>${esc(d.note)}</textarea></label>`}
      </div>
      <div class="or-namebar">Name: <code>${esc(ev.name)}</code>${ev.tier ? ' · ' + esc(ev.tier) : ''} · ${pts}</div>
      <ul class="or-chk">${ev.checks.map(c => `<li class="or-c"><i class="${c.kind}">${{ ok: '✓', fix: '✓', q: '?', stop: '!', info: 'i' }[c.kind]}</i><span>${esc(c.text)}</span></li>`).join('')}</ul>
      ${edit ? `<div class="or-edit-sum">${changes.length
          ? `<b>${changes.length} change${changes.length === 1 ? '' : 's'}</b> will be recorded in the thread when you approve:<ul class="or-edits">${changes.map(editLi).join('')}</ul>`
          : 'Nothing changed yet. Saving now approves the request as it stands.'}</div>
        <label class="or-f wide"><span>Note with your approval (optional)</span><textarea class="or-in" rows="2" maxlength="600" data-edit-note
          placeholder="Goes into the thread with the changes"${dis}>${esc(S.editNote)}</textarea></label>
        <div class="or-btns"><button type="button" class="or-b g" data-act="edit-save"${nBlock ? ' disabled' : ''}>${ico('check')}Save &amp; approve</button>
          <button type="button" class="or-b" data-act="edit-cancel">Cancel</button></div>`
      : (locked ? '' : `<div class="or-btns"><button type="button" class="or-b p" data-act="submit"${nBlock ? ' disabled' : ''}>Submit</button>
        <button type="button" class="or-b" data-act="discard">Discard draft</button></div>`)}
    </div>`;
  }

  function askHtml(a) {
    const d = S.draft;
    if (a.key === 'free') {
      const list = a.rows.slice(0, 6).map(o => `<li>Opening <code>${esc(o.openingId)}</code> · opened ${esc(niceDay(o.day))}${o.owners && o.owners.length ? ' · ' + esc(o.owners.join(', ')) : ''}${o.topic ? ' · ' + esc(o.topic) : ''}</li>`).join('')
        + (a.rows.length > 6 ? `<li>and ${a.rows.length - 6} more</li>` : '')
        + (a.older ? `<li>${a.older} older one${a.older === 1 ? '' : 's'}, opened before Q3 2026, still Open</li>` : '');
      const k = Math.min(a.nFree, d.count), oneType = Object.values(d.mix || {}).filter(n => n > 0).length <= 1;
      const useBtn = k >= d.count
        ? `<button type="button" class="or-b" data-ans="use-all">Use ${a.nFree === 1 ? 'it' : (k < a.nFree ? `${k} of them` : 'them')}, no new opening</button>`
        : (oneType ? `<button type="button" class="or-b" data-ans="use-some">Use ${k} of them, request ${d.count - k} new</button>` : '');
      return `<div class="or-row"><span class="or-av c">C</span><div><div class="or-who"><b>Claude</b></div>
        <div class="or-bub">Before this goes for approval: this job already has <b>${a.nFree} Open opening${a.nFree === 1 ? '' : 's'}</b> with nobody tied to ${a.nFree === 1 ? 'it' : 'them'}.
          <ul class="or-list">${list}</ul>
          ${a.inClosing ? `<span class="or-note">${a.inClosing} ${a.inClosing === 1 ? 'person is' : 'people are'} in closing on this job (Ref Check, Documentation or Offer) and may be headed for ${a.nFree === 1 ? 'it' : 'some of these'}.</span>` : ''}
          Could ${a.nFree === 1 ? 'it' : 'they'} cover ${d.count === 1 ? 'this request' : `some of the ${d.count}`}?
          ${useBtn ? '' : `<span class="or-note">To use some of them, choose <b>Edit the draft</b> and lower the rows.</span>`}
          <div class="or-btns">${useBtn}<button type="button" class="or-b p" data-ans="all-new">${d.count === 1 ? 'It\'s a new position' : `All ${d.count} are new positions`}</button>
            <button type="button" class="or-b" data-ans="edit">Edit the draft</button></div>
          ${S.why === 'free' ? whyBox('Say briefly why the Open one can\'t be used (it goes to the approvers).') : ''}</div></div></div>`;
    }
    if (a.key === 'drop') {
      return `<div class="or-row"><span class="or-av c">C</span><div><div class="or-who"><b>Claude</b></div>
        <div class="or-bub">${a.drops} ${a.drops === 1 ? 'person' : 'people'} dropped on this job this quarter. If this request is to refill one of those positions, its opening is still there: reuse it rather than open a new one.
          <div class="or-btns"><button type="button" class="or-b p" data-ans="not-refill">Over &amp; above; proceed</button>
            <button type="button" class="or-b" data-ans="edit">Edit the draft</button></div></div></div></div>`;
    }
    const x = a.open[0];
    return `<div class="or-row"><span class="or-av c">C</span><div><div class="or-who"><b>Claude</b></div>
      <div class="or-bub">This job already has a request in progress: <b>${esc(x.id)}</b> (${esc(x.status)}, ${esc(x.count)} × ${esc(x.topic)}, by ${esc(x.requesterName)}).${a.open.length > 1 ? ` And ${a.open.length - 1} more.` : ''} Is this a separate need?
        <div class="or-btns"><button type="button" class="or-b p" data-ans="separate">Yes, a separate need</button>
          <button type="button" class="or-b" data-ans="edit">Edit the draft</button></div></div></div></div>`;
  }

  function whyBox(ph) {
    return `<div class="or-why"><textarea class="or-in" rows="2" maxlength="400" id="orWhy" placeholder="${esc(ph)}"></textarea>
      <button type="button" class="or-b p" data-act="why">Send</button></div>`;
  }

  function cardHtml(c) {
    return `<div class="or-card"><div class="or-kv">${c.map(([k, v]) => `<span>${esc(k)}</span><span>${esc(v)}</span>`).join('')}</div></div>`;
  }

  function summaryCard(x) {
    const rows = [['Name', `${x.name}${x.count > 1 ? ` (× ${x.count})` : ''}`],
      ['Job', `${x.jobTitle} · ${x.department}`],
      ['Team · Location', [x.team, x.location].filter(Boolean).join(' · ') || '—'],
      ['Fields', [Object.keys(mixOf(x)).length > 1 ? '' : x.roleType, x.employmentType, x.complexity, 'open ' + niceDay(x.openDate)].filter(Boolean).join(' · ')]];
    if (Object.keys(mixOf(x)).length > 1) rows.splice(3, 0, ['Role Types', x.roleType]);   // 112g
    if (x.levelSet && x.levelSet !== x.levelNow) rows.push(['Job fix', `Level ${x.levelNow} → ${x.levelSet}`]);
    if (x.replacementOf) rows.push(['Replacement of', x.replacementOf]);
    if (x.sourcer) rows.push(['Sourcer', `${x.sourcer} (splits 50/50)`]);
    if (x.freeOpening) rows.push(['Free opening', x.freeOpening]);
    if (x.pts) rows.push(['Score', `${x.pts} pts each · +${x.pts * x.count} to ${x.recruiter}'s ${qLabel(x.quarter || '')} Goal`]);
    if (x.description) rows.push(['Description', x.description]);
    if (x.note) rows.push(['Note', x.note]);
    return rows;
  }

  function savedThreadHtml(x) {
    if (!x) return '<div class="or-hello"><p>That request is not in your list.</p></div>';
    // The card takes the place of the draft message, which is always the conversation's FIRST line. If a request has no
    // such line (saved some other way), the card goes on top instead of replacing a real message.
    const tr = x.transcript || [];
    let carded = !(tr[0] && tr[0].who === 'claude');
    const cardTop = carded ? `<div class="or-row"><span class="or-av c">C</span><div><div class="or-bub">Request by <b>${esc(x.requesterName)}</b>.${cardHtml(summaryCard(x))}</div></div></div>` : '';
    const nEd = (x.edits || []).length, nRe = tr.filter(m => m.who === 'me' && m.resubmit).length;
    const t = cardTop + tr.map(m => {
      if (m.who === 'approver') {
        // 112a: an edit shows as its change list, old ➔ new, with the approver's note under it
        const said = m.edits && m.edits.length
          ? `Edited and approved.<ul class="or-edits">${m.edits.map(editLi).join('')}</ul>${m.note ? `<div class="or-edit-note">${esc(m.note)}</div>` : ''}`
          : esc(m.text);
        return `<div class="or-row"><span class="or-av j">${esc(initials(m.name))}</span><div><div class="or-who"><b>${esc(m.name)}</b> · ${esc(niceStamp(m.at))}</div><div class="or-bub">${said}</div></div></div>`;
      }
      // 112e: a resubmission shows what the requester changed, old ➔ new
      if (m.who === 'me') return `<div class="or-row me"><div class="or-bub">${m.resubmit && m.edits && m.edits.length
        ? `Resubmitted with ${m.edits.length} change${m.edits.length === 1 ? '' : 's'}.<ul class="or-edits">${m.edits.map(editLi).join('')}</ul>`
        : esc(m.text)}</div><span class="or-av r">${esc(initials(x.requesterName))}</span></div>`;
      // the first message carried the form: show the request in its place — as submitted, or as approved after an edit
      const body = carded ? esc(m.text) : (nEd
        ? `The request as approved: ${esc(x.requesterName)}'s draft with the ${nEd} change${nEd === 1 ? '' : 's'} ${esc(x.decidedBy)} made, listed below.`
        : nRe ? `The request as it stands now: ${esc(x.requesterName)} resubmitted it after it was sent back, with the changes listed below.`
        : `The draft, as ${esc(x.requesterName)} submitted it.`) + cardHtml(summaryCard(x));
      carded = true;
      return `<div class="or-row"><span class="or-av c">C</span><div><div class="or-who"><b>Claude</b> · ${esc(niceStamp(m.at))}</div><div class="or-bub">${body}</div></div></div>`;
    }).join('');
    return `<div class="or-th-h"><b>${esc(x.id)}</b><span class="or-st ${STATUS_CLASS[x.status] || 's-wait'}">${esc(x.status)}</span>
        <span class="or-m">${esc(x.jobTitle)} · ${x.slackTs ? 'Slack thread in #ta-core-team' : 'no Slack thread (Slack is off)'}</span></div>
      ${t}
      ${x.revises ? `<p class="or-muted or-small">Revises <button type="button" class="or-link" data-open="${esc(x.revises)}">${esc(x.revises)}</button>.</p>` : ''}
      ${decisionHtml(x)}`;
  }

  // Who can do what next on a saved request. Approvers decide while it waits; the requester revises once it is sent back.
  function decisionHtml(x) {
    if (S.busy) return '<div class="or-row"><span class="or-av c">C</span><div class="or-bub or-typing">Saving…</div></div>';
    const err = S.error ? `<div class="or-row"><span class="or-av c">C</span><div class="or-bub or-bad">${esc(S.error)}</div></div>` : '';
    if (x.status === 'For approval' && S.me.isApprover && S.editing === x.id) {
      return `<div class="or-divider">Edit, then approve</div>${err}
        <div class="or-row"><span class="or-av c">C</span><div><div class="or-who"><b>Claude</b></div>
          <div class="or-bub">Change what's needed. The same rules apply, and when you approve, each change is recorded in this
            thread${S.slackOn ? ' and in Slack' : ''}, old ➔ new.${formHtml(evaluate(S.draft, ctx()), x)}</div></div></div>`;
    }
    if (x.status === 'For approval' && S.me.isApprover) {
      return `<div class="or-divider">Your decision</div>${err}
        <div class="or-decide">
          <div class="or-btns"><button type="button" class="or-b g" data-act="approve">${ico('check')}Approve</button>
            <button type="button" class="or-b" data-act="edit">${ico('pen')}Edit &amp; approve</button>
            <button type="button" class="or-b x" data-act="sendback">${ico('back')}Send back with note</button></div>
          ${S.sendingBack ? `<div class="or-why"><textarea class="or-in" rows="2" maxlength="600" id="orNote" placeholder="What should ${esc(x.requesterName)} change?"></textarea>
            <button type="button" class="or-b x" data-act="sendback-go">${ico('back')}Send back</button></div>` : ''}
        </div>`;
    }
    if (x.status === 'For approval') return `<div class="or-divider">Waiting for Jerin or Gopu</div>`;
    if (x.status === 'Sent back' && x.requesterEmail === S.me.email) {
      return `${err}<div class="or-btns"><button type="button" class="or-b p" data-act="revise">${ico('pen')}Revise and resubmit</button></div>`;
    }
    return err;
  }

  async function decide(decision, note) {
    const id = S.active;
    S.busy = true; S.error = ''; render();
    let res;
    try { res = await backend.call('orDecide', id, decision, note || ''); }
    catch (e) { S.busy = false; S.error = `Couldn't save the decision: ${e && e.message || e}.`; render(); return; }
    S.busy = false; S.sendingBack = false;
    if (!res || !res.ok) { S.error = `Not saved: ${(res && res.message) || 'the server refused it'}.`; render(); return; }
    const i = S.requests.findIndex(r => r.id === id);
    if (i >= 0) S.requests[i] = res.request;
    render();
  }

  // A saved request back in the draft form: for the requester revising it, and for an approver editing it (112a).
  function draftFrom(x) {
    const d = Object.assign(newDraft(), {
      jobId: x.jobId, count: x.count, recruiter: x.recruiter, roleType: x.roleType, employmentType: x.employmentType,
      complexity: x.complexity, topic: x.topic, openDate: x.openDate, replacementOf: x.replacementOf, sourcer: x.sourcer,
      note: x.note, team: x.team, location: x.location, description: x.description });
    d.mix = Object.assign(d.mix, mixOf(x));   // 112g
    d.replacing = String(x.replacementOf || '').split(';').map(v => v.trim()).filter(Boolean);
    // a Level the requester had to pick (a Tech or NonTech job with none in Ashby) comes back picked
    if (evaluate(d, ctx()).levelPicked) d.levelPick = x.levelSet || '';
    return d;
  }

  // 112a: the approver's edit goes to the server, which re-checks it, records each change and approves.
  async function saveEdit() {
    const id = S.editing, ev = evaluate(S.draft, ctx());
    if (ev.blockers.length) return;
    S.busy = true; S.error = ''; render();
    let res;
    try { res = await backend.call('orEditApprove', id, fieldsOf(S.draft, ev), S.editNote || ''); }
    catch (e) { S.busy = false; S.error = `Couldn't save: ${e && e.message || e}. Nothing was approved.`; render(); return; }
    S.busy = false;
    if (!res || !res.ok) { S.error = `Not saved: ${(res && res.message) || 'the server refused it'}.`; render(); return; }
    S.editing = null; S.draft = null; S.editNote = '';
    const i = S.requests.findIndex(r => r.id === id);
    if (i >= 0) S.requests[i] = res.request;
    render();
  }

  function revise(x) {
    S.active = 'draft'; S.submitted = false; S.asking = null; S.answers = {}; S.error = '';
    S.draft = Object.assign(draftFrom(x), { openDate: x.openDate >= todayIST() ? x.openDate : todayIST(), revises: x.id });
    S.thread = [{ who: 'claude', at: new Date().toISOString(), form: true,
      text: `Here's ${x.id} again to revise.${x.decisionNote ? ` ${x.decidedBy} said: "${x.decisionNote}"` : ''} Change what's needed and submit. It goes back for approval as ${x.id}, in the same thread.` }];
    render();
  }

  // ---------------- behaviour ----------------
  function wire() {
    const leaveEdit = () => !S.editing || confirm('Leave this edit? Nothing has been saved or approved.');
    root.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.open;
      if (id !== 'draft' && S.active === 'draft' && !S.submitted && !confirm('Leave this draft? It has not been submitted.')) return;
      if (!leaveEdit()) return;
      if (id !== 'draft') { S.active = id; S.draft = null; S.asking = null; S.submitted = false; S.sendingBack = false; S.editing = null; S.error = ''; }
      render();
    }));
    root.querySelectorAll('[data-act="new"]').forEach(b => b.addEventListener('click', () => {
      if (S.active === 'draft' && !S.submitted && S.draft && S.draft.jobId && !confirm('Start again? The current draft has not been submitted.')) return;
      if (!leaveEdit()) return;
      S.submitted = false; S.editing = null; startNew();
    }));
    root.querySelectorAll('[data-f]').forEach(el => {
      const ev = (el.tagName === 'SELECT') ? 'change' : 'input';
      el.addEventListener(ev, () => {
        const f = el.dataset.f;
        S.draft[f] = f === 'count' ? parseInt(el.value, 10) || 0 : el.value;
        if (ev === 'change') { render(); return; }
        // typing: redraw without losing the caret
        const pos = el.selectionStart; render();
        const again = root.querySelector(`[data-f="${f}"]`);
        if (again) { again.focus(); try { again.setSelectionRange(pos, pos); } catch (e) { /* number/date inputs */ } }
      });
    });
    // 112g: the Role Type rows. − and + step a row, the number can be typed; a SME / PA job keeps everything on As per AOP.
    const setMix = (t, n) => {
      const eff = evaluate(S.draft, ctx()).mix;   // folds a SME / PA job's openings onto As per AOP first
      const next = Object.fromEntries(roleTypes.map(k => [k, eff[k] || 0]));
      next[t] = Math.max(0, Math.min(25, n));
      S.draft.mix = next; S.draft.count = mixTotal(next);
    };
    root.querySelectorAll('[data-mix]').forEach(b => b.addEventListener('click', () => {
      setMix(b.dataset.mix, (evaluate(S.draft, ctx()).mix[b.dataset.mix] || 0) + Number(b.dataset.d)); render();
    }));
    const keep = (sel, pos) => { const again = root.querySelector(sel); if (again) { again.focus(); try { again.setSelectionRange(pos, pos); } catch (e) { /* number inputs */ } } };
    root.querySelectorAll('[data-mix-n]').forEach(el => el.addEventListener('input', () => {
      const t = el.dataset.mixN;
      setMix(t, parseInt(el.value, 10) || 0); render(); keep(`[data-mix-n="${CSS.escape(t)}"]`, 0);
    }));
    root.querySelectorAll('[data-rep]').forEach(el => el.addEventListener('input', () => {
      const i = Number(el.dataset.rep), pos = el.selectionStart;
      S.draft.replacing = (S.draft.replacing || []).slice(); S.draft.replacing[i] = el.value; render(); keep(`[data-rep="${i}"]`, pos);
    }));
    const act = (name, fn) => root.querySelectorAll(`[data-act="${name}"]`).forEach(b => b.addEventListener('click', fn));
    act('approve', () => decide('approve', ''));
    act('sendback', () => { S.sendingBack = true; render(); const n = root.querySelector('#orNote'); if (n) n.focus(); });
    act('sendback-go', () => { const n = String((root.querySelector('#orNote') || {}).value || '').trim(); if (n) decide('sendback', n); });
    act('revise', () => revise(S.requests.find(r => r.id === S.active)));
    act('edit', () => {
      const x = S.requests.find(r => r.id === S.active);
      S.editing = x.id; S.draft = draftFrom(x); S.editNote = ''; S.sendingBack = false; S.error = ''; render();
    });
    act('edit-cancel', () => { S.editing = null; S.draft = null; S.error = ''; render(); });
    act('edit-save', saveEdit);
    const en = root.querySelector('[data-edit-note]');
    if (en) en.addEventListener('input', () => { S.editNote = en.value; });   // kept across redraws, never redraws itself
    act('discard', () => { if (confirm('Discard this draft?')) { S.active = null; S.draft = null; render(); } });
    act('submit', onSubmit);
    act('retry', () => { S.error = ''; send(); });
    act('why', () => {
      const t = String((root.querySelector('#orWhy') || {}).value || '').trim();
      if (!t) return;
      S.thread.push({ who: 'me', at: new Date().toISOString(), text: t });
      S.answers.free = `${S.draft.count === 1 ? 'A new position' : `All ${S.draft.count} new`}: ${t}`; S.why = null; nextQuestion();
    });
    root.querySelectorAll('[data-ans]').forEach(b => b.addEventListener('click', () => answer(b.dataset.ans, b.textContent.trim())));
    wireJobSearch();
  }

  function pickJob(id) {
    const j = S.jobById[id], m = (S.meta.jobs || {})[id] || {};
    S.draft.jobId = id; S.draft.levelPick = '';
    if (j && j.complexity && !S.draft.complexity && complexities.includes(j.complexity)) S.draft.complexity = j.complexity;
    // Team and Location start from the job in Ashby; a location is only filled in when the job has exactly one
    S.draft.team = m.team || (j && j.team) || '';
    S.draft.location = (m.locations && m.locations.length === 1) ? m.locations[0] : '';
    render();
  }

  // The job search: every word typed must appear in the title or the department. The list redraws on its own, so typing
  // never re-renders the form and never loses the caret.
  function wireJobSearch() {
    const q = root.querySelector('[data-q="job"]');
    if (!q) return;
    const list = q.parentElement.querySelector('.or-pick-list');
    let hi = 0, items = [];
    const draw = (text) => {
      const words = String(text == null ? q.value : text).toLowerCase().split(/\s+/).filter(Boolean);
      items = S.jobs.filter(j => { const t = `${j.title || ''} ${j.department || ''}`.toLowerCase(); return words.every(w => t.includes(w)); }).slice(0, 80);
      hi = Math.max(0, Math.min(hi, items.length - 1));
      let html = '', dep = null;
      items.forEach((j, i) => {
        if (j.department !== dep) { dep = j.department; html += `<div class="or-pick-g">${esc(dep || '(no department)')}</div>`; }
        html += `<button type="button" tabindex="-1" class="or-pick-i${i === hi ? ' on' : ''}" data-job="${esc(j.id)}">${esc(j.title)}</button>`;
      });
      list.innerHTML = html || '<div class="or-pick-none">No open job matches.</div>';
      list.hidden = false;
      const on = list.querySelector('.on'); if (on) on.scrollIntoView({ block: 'nearest' });
    };
    // clicking into a box that already holds the picked job shows the WHOLE list, not just that one job
    q.addEventListener('focus', () => { const j = S.jobById[S.draft && S.draft.jobId]; q.select(); draw(j && q.value === j.title ? '' : q.value); });
    q.addEventListener('input', () => { hi = 0; draw(); });
    q.addEventListener('keydown', (e) => {
      const cur = () => { const j = S.jobById[S.draft && S.draft.jobId]; return j && q.value === j.title ? '' : q.value; };
      if (e.key === 'ArrowDown') { hi = Math.min(hi + 1, items.length - 1); draw(cur()); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { hi = Math.max(hi - 1, 0); draw(cur()); e.preventDefault(); }
      else if (e.key === 'Enter') { if (items[hi]) pickJob(items[hi].id); e.preventDefault(); }
      else if (e.key === 'Escape') { list.hidden = true; }
    });
    list.addEventListener('mousedown', (e) => { const b = e.target.closest('[data-job]'); if (b) { e.preventDefault(); pickJob(b.dataset.job); } });
    q.addEventListener('blur', () => setTimeout(() => {
      list.hidden = true;
      const j = S.jobById[S.draft && S.draft.jobId]; if (root.contains(q)) q.value = j ? j.title : '';
    }, 150));
  }

  function onSubmit() {
    const ev = evaluate(S.draft, ctx());
    if (ev.blockers.length) return;
    S.draft.mix = Object.fromEntries(roleTypes.map(k => [k, ev.mix[k] || 0]));   // 112g: as the form shows it (SME / PA folded)
    S.draft.count = ev.total;
    S.thread.push({ who: 'me', at: new Date().toISOString(), text: 'Submit' });
    S.queue = questionsFor(S.draft, ctx(), S.requests);
    nextQuestion();
  }

  function nextQuestion() {
    S.asking = S.queue && S.queue.length ? S.queue.shift() : null;
    if (S.asking) { render(); return; }
    send();
  }

  function answer(code, label) {
    const a = S.asking; if (!a) return;
    const d = S.draft;
    if (code === 'edit') {
      S.thread.push({ who: 'me', at: new Date().toISOString(), text: 'Edit the draft' });
      S.asking = null; S.queue = []; render(); return;
    }
    if (a.key === 'free') {
      if (code === 'all-new') { S.why = 'free'; render(); const w = root.querySelector('#orWhy'); if (w) w.focus(); return; }
      const k = Math.min(a.nFree, d.count);
      S.thread.push({ who: 'me', at: new Date().toISOString(), text: label });
      if (code === 'use-all') {
        S.thread.push({ who: 'claude', at: new Date().toISOString(),
          text: 'Then no new opening is needed, and nothing has been sent. Put the person on the existing opening in Ashby (or ask Jerin or Gopu to).' });
        S.asking = null; S.queue = []; S.submitted = true; render(); return;
      }
      d.count = d.count - k;
      const t = Object.keys(d.mix || {}).find(x => d.mix[x] > 0);   // 112g: offered only when one Role Type is asked for
      if (t) d.mix = Object.assign({}, d.mix, { [t]: d.count });
      S.answers.free = `Use ${k} existing Open opening${k === 1 ? '' : 's'}; request ${d.count} new`;
      S.thread.push({ who: 'claude', at: new Date().toISOString(), text: `Done: the request is now for ${d.count} new opening${d.count === 1 ? '' : 's'}, and the existing one${k === 1 ? '' : 's'} stay${k === 1 ? 's' : ''} as they are.` });
    } else {
      S.thread.push({ who: 'me', at: new Date().toISOString(), text: label });
      S.answers[a.key] = label;
    }
    nextQuestion();
  }

  // A request's own fields as the server stores them: the same for a new request and for an approver's edit (112a).
  function fieldsOf(d, ev) {
    const job = S.jobById[d.jobId];
    return {
      jobId: d.jobId, jobTitle: job.title, department: job.department, count: ev.total, recruiter: d.recruiter,
      team: d.team, location: d.location, description: String(d.description || '').trim(),
      roleType: ev.roleType, employmentType: ev.employmentType, levelNow: ev.levelNow, levelSet: ev.levelSet,
      complexity: d.complexity, topic: String(d.topic).trim(), openDate: d.openDate,
      // one name per Replacement opening; a name left over from a row set back to fewer does not travel (112g)
      replacementOf: ev.replacementOf, mix: Object.fromEntries(Object.entries(ev.mix).filter(([, n]) => n > 0)),
      sourcer: String(d.sourcer || '').trim(), name: ev.name, pts: ev.pts, tier: ev.tier, quarter: ev.quarter,
      checks: ev.checks.map(c => `${c.kind}: ${c.text}`),
    };
  }

  async function send() {
    const d = S.draft, ev = evaluate(d, ctx());
    S.asking = null; S.busy = true; S.error = ''; render();
    const payload = Object.assign(fieldsOf(d, ev), {
      note: String(d.note || '').trim(), freeOpening: S.answers.free || '', answers: S.answers, revises: d.revises || '',
      transcript: S.thread.map(m => ({ who: m.who, at: m.at, text: m.text })),
    });
    let saved;
    // 112e: a revision of a sent-back request goes back under its own number; anything else is a new request
    try { saved = await (d.revises ? backend.call('orResubmit', d.revises, payload) : backend.call('orSubmit', payload)); }
    catch (e) { S.busy = false; S.error = `Couldn't save: ${e && e.message || e}. Nothing was sent.`; render(); return; }
    S.busy = false;
    if (!saved || !saved.ok) { S.error = `Not sent: ${(saved && saved.message) || 'the server refused it'}.`; render(); return; }
    const was = S.requests.findIndex(r => r.id === saved.request.id);
    if (was >= 0) S.requests.splice(was, 1);
    S.requests.unshift(saved.request);
    S.submitted = true;
    S.active = saved.request.id;
    render();
  }

  // ---------------- start ----------------
  if (backend.openId && S.requests.some(x => x.id === backend.openId)) S.active = backend.openId;
  render();
  signalReady();
}

// 112d: when the window is shown inside https://hiring.interviewkickstart.com/requests (requests.html), tell that page it has drawn,
// so it does not offer its "open in a new tab" fallback. Posted only to the site's two addresses; opened on its own, nobody listens.
const SITE_ORIGINS = ['https://hiring.interviewkickstart.com', 'https://hiring-dashboard-phi.vercel.app'];
function signalReady() {
  try { SITE_ORIGINS.forEach(o => window.top.postMessage({ orReady: true }, o)); }
  catch (e) { /* not framed, or the browser refused: nothing to tell */ }
}
