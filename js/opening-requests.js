// ===== #112 phase 1 (GO: Jerin, 16 Sep 2026) — the Opening Requests window =====
// A recruiter clicks "+ Create Opening", a draft form opens INSIDE the chat, the form sets or flags every entry
// against the rules we already work to, and on Submit the assistant looks for an opening on the job that could be
// used instead BEFORE anything reaches Jerin or Gopu. Approved design: mock-up v4
// (https://claude.ai/artifact/8KtDGLx1PBSCZaLsJUgMEi) · worklists/112_opening_request_assistant.md.
//
// 🔑 WHERE THIS RUNS: not on the dashboard. The Apps Script web app serves a thin page at `/exec?page=requests`
// (Code.gs → requestsPage_) that imports THIS module from the live site. Every read and write goes through
// `google.script.run` inside the signed-in Google session, so requests stay PRIVATE (a Drive Sheet), and the
// public GitHub repo never sees one. The dashboard only carries a button that opens that window.
// 🔑 The server re-checks everything that matters (who may raise, required fields, active recruiter). The checks
// here are for the person filling the form in — fast, and in plain words.
// Phase 2 (GO: Jerin, 21 Sep): Jerin or Gopu approves, or sends back with a note, inside the request's own thread; a
// sent-back request can be revised and resubmitted as a new request that names the one it revises.
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
const initials = (name) => String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');

const STATUS_CLASS = { 'Draft': 's-draft', 'For approval': 's-wait', 'Needs changes': 's-fix', 'Sent back': 's-back', 'Approved': 's-ok', 'Created': 's-done' };

// ---------------------------------------------------------------------------------------------------------------
// The rules. ONE function, fed the draft and the dashboard data, returns what the form sets by itself, what it
// flags, and what blocks Submit. Each line maps to a row of mock-up v4's rules table.
// ---------------------------------------------------------------------------------------------------------------
function evaluate(d, ctx) {
  const r = { roleType: d.roleType, employmentType: d.employmentType, levelNow: '', levelSet: '', complexity: d.complexity,
              notes: {}, checks: [], blockers: [], pts: 0, tier: '', name: '' };
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

  // How many
  if (!(d.count >= 1 && d.count <= 25)) block('Say how many openings (1 to 25).');

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
  if (sme || pa) {
    r.roleType = 'As per AOP';
    r.notes.roleType = { kind: 'auto', text: 'Always As per AOP for SME India, SME US and PA' };
    check('fix', 'Role Type set to As per AOP (SME India, SME US and PA rule)');
  } else if (!d.roleType) block('Pick a Role Type.');
  if (r.roleType === 'Replacement' && !String(d.replacementOf || '').trim()) block('Role Type is Replacement, so say who it replaces.');

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
  r.name = `IK-Opening-### - ${d.recruiter || '<recruiter>'} - ${topic || '<topic>'}`;

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
              active: null, draft: null, thread: [], asking: null, answers: {}, busy: false, error: '' };
  root.classList.add('or-app');
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
    return { jobId: '', count: 1, recruiter: mine ? mine.name : '', roleType: '', employmentType: '', levelPick: '',
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
      <header class="or-bar"><span class="or-logo">ik</span><b>Opening Requests</b>
        <small>signed in as ${esc(S.me.name || S.me.email)} · ${esc(S.me.userType || '')}</small></header>
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
    return `<button type="button" class="or-new" data-act="new">+ Create Opening</button>
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

  function formHtml(ev) {
    const d = S.draft, locked = !!S.asking || S.busy || S.submitted;
    const dis = locked ? ' disabled' : '';
    const job = S.jobById[d.jobId];
    const opt = (list, cur, ph) => `<option value="">${esc(ph)}</option>` + list.map(v => `<option${v === cur ? ' selected' : ''}>${esc(v)}</option>`).join('');
    const auto = (k) => ev.notes[k] && ev.notes[k].kind === 'auto';
    const nBlock = ev.blockers.length;
    const levelField = (() => {
      if (!job) return `<span class="or-in ro">—</span>`;
      if (ev.levelSet && ev.levelSet !== ev.levelNow) return `<span class="or-in ro bad">${esc(ev.levelNow)} → ${esc(ev.levelSet)}</span>`;
      const needsPick = !/^L\d/i.test(ev.levelNow) && ev.blockers.some(b => /Pick the Level/.test(b)) || d.levelPick;
      if (needsPick) return `<select class="or-in" data-f="levelPick"${dis}>${opt(LEVELS, d.levelPick, 'Pick the Level…')}</select>`;
      return `<span class="or-in ro auto">${esc(ev.levelNow)}</span>`;
    })();
    const pts = ev.pts ? `<b>${ev.pts} pts</b> each · <b>+${ev.pts * (d.count || 0)}</b> to ${esc(d.recruiter || 'the recruiter')}'s ${esc(qLabel(ev.quarter || ''))} Goal` : '<span class="or-muted">score shows once the job and complexity are set</span>';
    return `<div class="or-form">
      <div class="or-form-h"><span>Opening draft</span><span>${nBlock ? `${nBlock} thing${nBlock === 1 ? '' : 's'} still needed` : 'Ready to submit'}</span></div>
      <div class="or-fgrid">
        <label class="or-f wide"><span>Job</span><div class="or-pick"><input class="or-in" type="search" data-q="job" autocomplete="off"
            placeholder="Search open jobs by title or department…" value="${esc(job ? job.title : '')}"${dis}><div class="or-pick-list" hidden></div></div>
          ${job ? `<span class="or-note">${esc(job.department)} · ${esc(job.status)} in Ashby · Level ${esc(job.level || 'NA')}${job.complexity ? ' · ' + esc(job.complexity) : ''}</span>` : ''}</label>
        <label class="or-f"><span>Team</span><select class="or-in${ev.notes.team ? ' auto' : ''}" data-f="team"${dis}>${opt(teamList.includes(d.team) || !d.team ? teamList : [d.team].concat(teamList), d.team, 'Pick the team…')}</select>${note(ev.notes.team)}</label>
        <label class="or-f"><span>Location</span>${locationList.length
          ? `<select class="or-in${ev.notes.location ? ' auto' : ''}" data-f="location"${dis}>${opt(locationList, d.location, 'Pick the location…')}</select>`
          : `<input class="or-in" type="text" maxlength="80" data-f="location" value="${esc(d.location)}" placeholder="Location"${dis}>`}${note(ev.notes.location)}</label>
        <label class="or-f"><span>How many openings</span><input class="or-in" type="number" min="1" max="25" data-f="count" value="${esc(d.count)}"${dis}></label>
        <label class="or-f"><span>Recruiter</span><select class="or-in${S.recruiters.some(x => x.email === S.me.email && x.name === d.recruiter) ? ' auto' : ''}" data-f="recruiter"${dis}>${opt(S.recruiters.map(x => x.name), d.recruiter, 'Pick the recruiter…')}</select>
          ${d.recruiter && S.recruiters.some(x => x.name === d.recruiter) ? '<span class="or-note auto">Full Ashby name · active user</span>' : ''}</label>
        <label class="or-f"><span>Role Type</span>${auto('roleType') ? `<span class="or-in ro auto">${esc(ev.roleType)}</span>` : `<select class="or-in" data-f="roleType"${dis}>${opt(roleTypes, d.roleType, 'Pick…')}</select>`}${note(ev.notes.roleType)}</label>
        <label class="or-f"><span>Employment Type</span>${auto('employmentType') ? `<span class="or-in ro auto">${esc(ev.employmentType)}</span>` : `<select class="or-in" data-f="employmentType"${dis}>${opt(empTypes, d.employmentType, 'Pick…')}</select>`}${note(ev.notes.employmentType)}</label>
        <label class="or-f"><span>Job Level (in Ashby)</span>${levelField}${note(ev.notes.level)}</label>
        <label class="or-f"><span>Role Complexity</span><select class="or-in" data-f="complexity"${dis}>${opt(complexities, d.complexity, 'Pick one…')}</select>
          <span class="or-note${job && d.complexity && d.complexity === job.complexity ? ' auto' : ''}">${job && d.complexity && d.complexity === job.complexity ? 'As set on the job in Ashby. Change it if this opening differs.' : 'Pick one; a blank would score as Normal'}</span></label>
        <label class="or-f"><span>Topic</span><input class="or-in" type="text" maxlength="60" data-f="topic" value="${esc(d.topic)}" placeholder="e.g. Agentic AI"${dis}>${note(ev.notes.topic)}</label>
        <label class="or-f"><span>Open date</span><input class="or-in" type="date" min="${FIRST_DAY}" data-f="openDate" value="${esc(d.openDate)}"${dis}>${note(ev.notes.openDate)}</label>
        ${ev.roleType === 'Replacement' ? `<label class="or-f"><span>Replacement of</span><input class="or-in" type="text" maxlength="80" data-f="replacementOf" value="${esc(d.replacementOf)}" placeholder="Who is leaving"${dis}></label>` : ''}
        <label class="or-f"><span>Sourcer (optional)</span><select class="or-in" data-f="sourcer"${dis}>${opt(S.people.map(x => x.name), d.sourcer, 'No sourcer')}</select>
          ${d.sourcer ? '<span class="or-note">Splits Joined, Joining pending and Drop 50/50. The Goal stays with the recruiter.</span>' : ''}</label>
        <label class="or-f wide"><span>Description (optional)</span><input class="or-in" type="text" maxlength="120" data-f="description" value="${esc(d.description)}" placeholder="Shown on the opening in Ashby"${dis}></label>
        <label class="or-f wide"><span>Note to approvers</span><textarea class="or-in" rows="2" maxlength="600" data-f="note" placeholder="Why now, cohort dates, anything they should know"${dis}>${esc(d.note)}</textarea></label>
      </div>
      <div class="or-namebar">Name: <code>${esc(ev.name)}</code>${ev.tier ? ' · ' + esc(ev.tier) : ''} · ${pts}</div>
      <ul class="or-chk">${ev.checks.map(c => `<li class="or-c"><i class="${c.kind}">${{ ok: '✓', fix: '✓', q: '?', stop: '!', info: 'i' }[c.kind]}</i><span>${esc(c.text)}</span></li>`).join('')}</ul>
      ${locked ? '' : `<div class="or-btns"><button type="button" class="or-b p" data-act="submit"${nBlock ? ' disabled' : ''}>Submit</button>
        <button type="button" class="or-b" data-act="discard">Discard draft</button></div>`}
    </div>`;
  }

  function askHtml(a) {
    const d = S.draft;
    if (a.key === 'free') {
      const list = a.rows.slice(0, 6).map(o => `<li>Opening <code>${esc(o.openingId)}</code> · opened ${esc(niceDay(o.day))}${o.owners && o.owners.length ? ' · ' + esc(o.owners.join(', ')) : ''}${o.topic ? ' · ' + esc(o.topic) : ''}</li>`).join('')
        + (a.rows.length > 6 ? `<li>and ${a.rows.length - 6} more</li>` : '')
        + (a.older ? `<li>${a.older} older one${a.older === 1 ? '' : 's'}, opened before Q3 2026, still Open</li>` : '');
      const k = Math.min(a.nFree, d.count);
      const useBtn = k >= d.count
        ? `<button type="button" class="or-b" data-ans="use-all">Use ${a.nFree === 1 ? 'it' : (k < a.nFree ? `${k} of them` : 'them')}, no new opening</button>`
        : `<button type="button" class="or-b" data-ans="use-some">Use ${k} of them, request ${d.count - k} new</button>`;
      return `<div class="or-row"><span class="or-av c">C</span><div><div class="or-who"><b>Claude</b></div>
        <div class="or-bub">Before this goes for approval: this job already has <b>${a.nFree} Open opening${a.nFree === 1 ? '' : 's'}</b> with nobody tied to ${a.nFree === 1 ? 'it' : 'them'}.
          <ul class="or-list">${list}</ul>
          ${a.inClosing ? `<span class="or-note">${a.inClosing} ${a.inClosing === 1 ? 'person is' : 'people are'} in closing on this job (Ref Check, Documentation or Offer) and may be headed for ${a.nFree === 1 ? 'it' : 'some of these'}.</span>` : ''}
          Could ${a.nFree === 1 ? 'it' : 'they'} cover ${d.count === 1 ? 'this request' : `some of the ${d.count}`}?
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
      ['Fields', [x.roleType, x.employmentType, x.complexity, 'open ' + niceDay(x.openDate)].join(' · ')]];
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
    const t = cardTop + tr.map(m => {
      if (m.who === 'approver') return `<div class="or-row"><span class="or-av j">${esc(initials(m.name))}</span><div><div class="or-who"><b>${esc(m.name)}</b> · ${esc(niceStamp(m.at))}</div><div class="or-bub">${esc(m.text)}</div></div></div>`;
      if (m.who === 'me') return `<div class="or-row me"><div class="or-bub">${esc(m.text)}</div><span class="or-av r">${esc(initials(x.requesterName))}</span></div>`;
      // the first message carried the form: show the request as submitted in its place
      const body = carded ? esc(m.text) : `The draft, as ${esc(x.requesterName)} submitted it.${cardHtml(summaryCard(x))}`;
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
    if (x.status === 'For approval' && S.me.isApprover) {
      return `<div class="or-divider">Your decision</div>${err}
        <div class="or-decide">
          <div class="or-btns"><button type="button" class="or-b g" data-act="approve">Approve</button>
            <button type="button" class="or-b x" data-act="sendback">Send back with note</button></div>
          ${S.sendingBack ? `<div class="or-why"><textarea class="or-in" rows="2" maxlength="600" id="orNote" placeholder="What should ${esc(x.requesterName)} change?"></textarea>
            <button type="button" class="or-b x" data-act="sendback-go">Send back</button></div>` : ''}
        </div>`;
    }
    if (x.status === 'For approval') return `<div class="or-divider">Waiting for Jerin or Gopu</div>`;
    if (x.status === 'Sent back' && x.requesterEmail === S.me.email) {
      return `${err}<div class="or-btns"><button type="button" class="or-b p" data-act="revise">Revise and resubmit</button></div>`;
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

  function revise(x) {
    S.active = 'draft'; S.submitted = false; S.asking = null; S.answers = {}; S.error = '';
    S.draft = Object.assign(newDraft(), {
      jobId: x.jobId, count: x.count, recruiter: x.recruiter, roleType: x.roleType, employmentType: x.employmentType,
      complexity: x.complexity, topic: x.topic, openDate: x.openDate >= todayIST() ? x.openDate : todayIST(),
      replacementOf: x.replacementOf, sourcer: x.sourcer, note: x.note, team: x.team, location: x.location,
      description: x.description, revises: x.id });
    S.thread = [{ who: 'claude', at: new Date().toISOString(), form: true,
      text: `Here's ${x.id} again to revise.${x.decisionNote ? ` ${x.decidedBy} said: "${x.decisionNote}"` : ''} Change what's needed and submit. It goes for approval as a new request.` }];
    render();
  }

  // ---------------- behaviour ----------------
  function wire() {
    root.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.open;
      if (id !== 'draft' && S.active === 'draft' && !S.submitted && !confirm('Leave this draft? It has not been submitted.')) return;
      if (id !== 'draft') { S.active = id; S.draft = null; S.asking = null; S.submitted = false; S.sendingBack = false; S.error = ''; }
      render();
    }));
    root.querySelectorAll('[data-act="new"]').forEach(b => b.addEventListener('click', () => {
      if (S.active === 'draft' && !S.submitted && S.draft && S.draft.jobId && !confirm('Start again? The current draft has not been submitted.')) return;
      S.submitted = false; startNew();
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
    const act = (name, fn) => root.querySelectorAll(`[data-act="${name}"]`).forEach(b => b.addEventListener('click', fn));
    act('approve', () => decide('approve', ''));
    act('sendback', () => { S.sendingBack = true; render(); const n = root.querySelector('#orNote'); if (n) n.focus(); });
    act('sendback-go', () => { const n = String((root.querySelector('#orNote') || {}).value || '').trim(); if (n) decide('sendback', n); });
    act('revise', () => revise(S.requests.find(r => r.id === S.active)));
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
      S.answers.free = `Use ${k} existing Open opening${k === 1 ? '' : 's'}; request ${d.count} new`;
      S.thread.push({ who: 'claude', at: new Date().toISOString(), text: `Done: the request is now for ${d.count} new opening${d.count === 1 ? '' : 's'}, and the existing one${k === 1 ? '' : 's'} stay${k === 1 ? 's' : ''} as they are.` });
    } else {
      S.thread.push({ who: 'me', at: new Date().toISOString(), text: label });
      S.answers[a.key] = label;
    }
    nextQuestion();
  }

  async function send() {
    const d = S.draft, ev = evaluate(d, ctx()), job = S.jobById[d.jobId];
    S.asking = null; S.busy = true; S.error = ''; render();
    const payload = {
      jobId: d.jobId, jobTitle: job.title, department: job.department, count: d.count, recruiter: d.recruiter,
      team: d.team, location: d.location, description: String(d.description || '').trim(),
      roleType: ev.roleType, employmentType: ev.employmentType, levelNow: ev.levelNow, levelSet: ev.levelSet,
      complexity: d.complexity, topic: String(d.topic).trim(), openDate: d.openDate, replacementOf: String(d.replacementOf || '').trim(),
      sourcer: String(d.sourcer || '').trim(), note: String(d.note || '').trim(), name: ev.name, pts: ev.pts, tier: ev.tier,
      quarter: ev.quarter, freeOpening: S.answers.free || '', answers: S.answers, revises: d.revises || '',
      checks: ev.checks.map(c => `${c.kind}: ${c.text}`), transcript: S.thread.map(m => ({ who: m.who, at: m.at, text: m.text })),
    };
    let saved;
    try { saved = await backend.call('orSubmit', payload); }
    catch (e) { S.busy = false; S.error = `Couldn't save: ${e && e.message || e}. Nothing was sent.`; render(); return; }
    S.busy = false;
    if (!saved || !saved.ok) { S.error = `Not sent: ${(saved && saved.message) || 'the server refused it'}.`; render(); return; }
    S.requests.unshift(saved.request);
    S.submitted = true;
    S.active = saved.request.id;
    render();
  }

  // ---------------- start ----------------
  if (backend.openId && S.requests.some(x => x.id === backend.openId)) S.active = backend.openId;
  render();
}
