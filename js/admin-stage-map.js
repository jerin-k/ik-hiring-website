// ===== ADMIN ➝ STAGE MAPPING (#240c, layout B1) =====================================================
// Jerin's own idea, 16 Oct 2026: "Is it better to have a configuration in Admin console - where we match
// stage to dashboards it is applicable. In that case, when something alien/new shows up, it gets added to
// the same list - and i can help map."
//
// Layout B1, his pick after two mock rounds ("I like B better. In that can you highlight what I'm supposed
// to act on." then "B1"): the interview PLAN rail on the left carrying an amber count, the plan's stages on
// the right in ASHBY'S OWN ORDER, and a row needing him marked IN PLACE with an amber edge and a badge —
// not lifted to the top, not hidden behind a filter.
//
// 🔑 THE TABLE OVERRIDES A DEFAULT, IT NEVER SUPPLIES ONE. A stage Ashby adds is picked up and counted by
// its default the moment it appears; this screen exists so he can CORRECT that. It is what keeps him out of
// the middle while still in control — and it is why a new round needs no decision from anyone (an Active
// stage is a round, is an evaluation, and is measured by assessment rather than by people added).
//
// 🚨 WHAT "NEEDS YOU" MEANS, precisely: an **Active** stage the pipeline cannot match to a stage it knows.
// It is still being counted — by default — so this is a "come and confirm", never an outage. Everything
// else is quiet on purpose: a screen that cries for attention when nothing is wrong is the #234 mistake,
// where a real warning sat unread among three permanent false alarms. The fix there was to make the list
// QUIETER. [[project_ashby-stage-naming]]
//
// ⚠ ONLY PLANS WITH A LIVE JOB ARE OFFERED. Archiving the job that used a plan is how a retired plan stops
// asking him things — measured 16 Oct, both non-shared plans belong to Closed jobs, so the three unmapped
// Test-plan stages disappeared by themselves when he archived them. An archived plan is skipped outright.
// The stages of a retired plan stay MAPPED in the data (historical candidates sat in them); this rule
// governs only what the screen ASKS about.
//
// Where the data comes from: `data.stagePlans` (the pipeline publishes the Ashby inventory) and
// `data.stageLists.rules` (what today's code already does with each stage). Overrides are stored under the
// `stageRules` config key and published team-wide by Admin ➝ Publish, exactly as Pod & Capacity does.

import { defsBlock } from './definitions.js';
import { markDirty } from './metric-config.js';

const LS_KEY = 'ik_stage_rules';
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 🔑 ONE QUESTION WITH THREE ANSWERS, not two tick-boxes (Jerin, 19 Oct 2026). "Round" and "By people
// added" were separate ticks and were never both set — they cannot be, because a stage that IS an interview
// round has interviews by definition, so it can never be the "nobody is interviewed here" case. Two switches
// that are logically exclusive read as two independent choices, which is exactly what confused him:
// 🗣 "Round reads like evaluation itself. hence confused." So they are one dropdown.
// ⚠ It does carry TWO consequences at once — how the stage is counted, AND whether moves between it and the
// rounds count as progress. Today those always travel together, which is what makes the merge safe.
const MEASURE = [
  ['round',    'Interview round', 'Someone is interviewed, and the rounds can happen in any order — so moving to another round counts as progress.'],
  ['arrivals', 'By arrivals',     'Throughput counts who arrived rather than assessments held. At most of these nobody is interviewed at all; at a screening step it is how many turned up that matters.'],
  ['ordered',  'Ordered step',    'Someone is interviewed, but the stage has a fixed place in the process, so going backwards is not progress.'],
];
// Momentum's question, and a separate one: does what happens here tell you whether the person can do the job?
// It holds the same six stages as "Interview round" today. Kept as its own control deliberately, so a future
// stage that evaluates without being one of the numbered rounds can be set without a code change.
const EVAL_LABEL = 'Counts as evaluating ability';

export function readStageRules() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; } catch (e) { return {}; }
}
function writeStageRules(o) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(o)); } catch (e) { /* private window */ }
}

// 🚨 KEYED ON ASHBY'S STAGE ID, NEVER ITS TITLE (#240 section C). A title changes; an id does not, and that
// is the whole point of keying this way — a renamed stage keeps the rules he set for it instead of arriving
// as a stranger.
const ruleKeyOf = (stage) => stage.id || ('title:' + stage.title);

/** The plans this screen is willing to ask about: not archived, and at least one live job. */
export function offeredPlans(stagePlans) {
  const plans = (stagePlans && stagePlans.plans) || [];
  return plans.filter(p => !p.archived && (p.liveJobs || 0) > 0);
}

/** An Active stage the pipeline cannot match to a stage it knows, and that has not been excluded. */
function needsHim(stage, rules) {
  if (stage.type !== 'Active') return false;
  const r = rules[ruleKeyOf(stage)] || {};
  if (r.exclude) return false;
  return !stage.key;
}
export function countNeedsHim(plan, rules) {
  return ((plan && plan.stages) || []).filter(s => needsHim(s, rules)).length;
}

/** The pipeline's own default for a stage, as one of the three measures. */
function defaultMeasure(stage, defaults) {
  const d = (stage.key && defaults[stage.key]) || {};
  if (d.round) return 'round';
  if (d.added) return 'arrivals';
  return 'ordered';
}
/** What a stage reads today: his override if he set one, otherwise the pipeline's default. */
function effectiveMeasure(stage, defaults, rules) {
  const r = rules[ruleKeyOf(stage)] || {};
  return r.measure || defaultMeasure(stage, defaults);
}
function effectiveEval(stage, defaults, rules) {
  const r = rules[ruleKeyOf(stage)] || {};
  if (Object.prototype.hasOwnProperty.call(r, 'evaluation')) return !!r.evaluation;
  return !!((stage.key && defaults[stage.key]) || {}).evaluation;
}

export function renderStageMap() {
  return `
    <div class="adm-panel" data-apanel="stages" style="display:none">
      <div class="adm-split">
        <div class="adm-rail" role="tablist" aria-label="Interview plans" id="stmRail"></div>
        <div class="adm-main">
          <div class="adm-card">
            <div class="adm-toolbar">
              <span class="adm-title" id="stmTitle">Stages</span>
              <span class="adm-count" id="stmNote"></span>
            </div>
            <div class="cfg-scroll"><table class="ac-table adm-roomy stm-table">
              <thead><tr>
                <th style="min-width:13rem">Stage in Ashby</th>
                <th style="width:9rem">Ashby type</th>
                <th style="min-width:9rem">Counted as</th>
                <th style="min-width:10.5rem;width:10.5rem" title="How Throughput counts people at this stage, and whether moving away from it counts as progress.">How it&rsquo;s counted</th>
                <th style="width:9.5rem" title="Whether an interview here counts towards Momentum — does what happens here tell you if the person can do the job?">${EVAL_LABEL}</th>
                <th style="width:7rem" title="Reaches no number at all, and stops the pipeline mailing about it. Durable, and reversible.">Exclude</th>
              </tr></thead>
              <tbody id="stmBody"></tbody>
            </table></div>
          </div>
          ${defsBlock('admin-stages')}
        </div>
      </div>
    </div><!-- /stage mapping panel -->
  `;
}

export function initStageMap(data, viewer) {
  const ro = !!(viewer && viewer.adminReadOnly);
  const sp = data && data.stagePlans;
  const defaults = (data && data.stageLists && data.stageLists.rules) || {};
  const rail = document.getElementById('stmRail');
  const body = document.getElementById('stmBody');
  if (!rail || !body) return;

  // ⚠ The pipeline publishes this; an older dashboard.json has none. Say so plainly rather than drawing an
  // empty table that looks like every plan vanished — CLAUDE.md rule 4's cousin, a blank that reads as a fact.
  if (!sp) {
    rail.innerHTML = '<div class="adm-empty">No interview plans yet</div>';
    body.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:1.25rem">
      The stage list has not been published by the pipeline yet. It appears after the next data refresh.</td></tr>`;
    const n = document.getElementById('stmNote'); if (n) n.textContent = '';
    return;
  }

  const plans = offeredPlans(sp);
  let rules = readStageRules();
  let current = plans.length ? plans[0].id : null;

  function drawRail() {
    if (!plans.length) {
      rail.innerHTML = '<div class="adm-empty">No plan has a live job</div>';
      return;
    }
    rail.innerHTML = plans.map(p => {
      const need = countNeedsHim(p, rules);
      const total = (p.stages || []).length;
      const active = (p.stages || []).filter(s => s.type === 'Active').length;
      return `<button type="button" class="adm-row stm-row${need ? ' stm-needs' : ''}" role="tab"
          data-splan="${esc(p.id)}" aria-selected="${String(p.id === current)}">
        <b>${esc(p.title)}</b>
        ${need ? `<em class="stm-badge">${need} need${need === 1 ? 's' : ''} you</em>` : `<em>${total}</em>`}
        <small>${active} evaluation stage${active === 1 ? '' : 's'} · ${p.liveJobs} live job${p.liveJobs === 1 ? '' : 's'}</small>
      </button>`;
    }).join('');
    rail.querySelectorAll('.stm-row').forEach(btn => btn.addEventListener('click', () => {
      current = btn.dataset.splan; drawRail(); drawTable();
    }));
  }

  function drawTable() {
    const plan = plans.find(p => p.id === current);
    const title = document.getElementById('stmTitle');
    const note = document.getElementById('stmNote');
    if (!plan) {
      body.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:1.25rem">
        Nothing to map — no interview plan has a live job. A plan reappears here when a job starts using it.</td></tr>`;
      if (title) title.textContent = 'Stages';
      if (note) note.textContent = '';
      return;
    }
    const need = countNeedsHim(plan, rules);
    if (title) title.textContent = plan.title;
    // 🚨 LIVE STATE ONLY above a table (CLAUDE.md Conventions): what is shown, and whether anything wants him.
    // Everything explanatory belongs in the definitions block at the foot of the panel.
    if (note) note.textContent = need
      ? `${need} stage${need === 1 ? '' : 's'} to confirm · in Ashby's order`
      : `Nothing needs you · in Ashby's order`;

    body.innerHTML = (plan.stages || []).map(s => {
      const k = ruleKeyOf(s);
      const r = rules[k] || {};
      const excluded = !!r.exclude;
      const flag = needsHim(s, rules);
      // Only a stage the dashboard actually measures carries these rules. A Lead-type stage is before the
      // process starts and is deliberately inert here — showing it greyed is honest about the whole plan
      // without pretending it has settings.
      const measured = !!s.key || s.type === 'Active';
      const cls = [flag ? 'stm-flag' : '', excluded ? 'stm-off' : ''].filter(Boolean).join(' ');
      const mapped = s.key
        ? `<span class="stm-key">${esc((defaults[s.key] && defaults[s.key].label) || s.key)}</span>`
        : (s.type === 'Active'
            ? `<span class="stm-new">not recognised — counted by default</span>`
            : `<span class="zero">—</span>`);
      // The two controls. A stage outside the process (Lead / Archived / Hired) carries neither, and says so
      // with a dash rather than an empty box that looks like an unticked setting.
      let controls;
      if (!measured) {
        controls = '<td><span class="zero">—</span></td><td><span class="zero">—</span></td>';
      } else {
        const m = effectiveMeasure(s, defaults, rules);
        const mOver = !!r.measure;
        const ev = effectiveEval(s, defaults, rules);
        const eOver = Object.prototype.hasOwnProperty.call(r, 'evaluation');
        const srcTitle = (o) => o ? 'You set this' : 'The pipeline’s own default';
        controls =
          `<td><select class="stm-sel${mOver ? ' stm-over' : ''}" data-sk="${esc(k)}" data-field="measure"
              title="${srcTitle(mOver)}" ${ro || excluded ? 'disabled' : ''}>
            ${MEASURE.map(([v, label, why]) => `<option value="${v}" title="${esc(why)}" ${v === m ? 'selected' : ''}>${esc(label)}</option>`).join('')}
          </select></td>` +
          `<td><label class="stm-tick${eOver ? ' stm-over' : ''}" title="${srcTitle(eOver)}">
            <input type="checkbox" data-sk="${esc(k)}" data-field="evaluation" ${ev ? 'checked' : ''} ${ro || excluded ? 'disabled' : ''}>
          </label></td>`;
      }
      return `<tr class="${cls}">
        <td>${flag ? '<span class="stm-dot" title="Needs you to confirm"></span>' : ''}${esc(s.title)}</td>
        <td><span class="stm-type">${esc(s.type || '')}</span></td>
        <td>${mapped}</td>
        ${controls}
        <td><label class="stm-tick"><input type="checkbox" data-sk="${esc(k)}" data-field="exclude" ${excluded ? 'checked' : ''} ${ro ? 'disabled' : ''}></label></td>
      </tr>`;
    }).join('');

    if (ro) return;
    // 🔑 AN OVERRIDE EQUAL TO THE DEFAULT IS NOT AN OVERRIDE. Setting a control back to what the pipeline
    // already does DELETES the stored correction rather than recording it, so the config stays a short list
    // of his genuine corrections — and a later change of default still reaches every stage he never touched.
    const onEdit = (el) => {
      const k = el.dataset.sk, field = el.dataset.field;
      const row = rules[k] || (rules[k] = {});
      const plan2 = plans.find(p => p.id === current);
      const stage = ((plan2 && plan2.stages) || []).find(s2 => ruleKeyOf(s2) === k);
      if (field === 'measure') {
        row.measure = el.value;
        if (stage && defaultMeasure(stage, defaults) === el.value) delete row.measure;
      } else if (field === 'exclude') {
        if (el.checked) row.exclude = true; else delete row.exclude;
      } else {
        row[field] = el.checked;
        if (stage) {
          const d = (stage.key && defaults[stage.key]) || {};
          if (!!d[field] === !!el.checked) delete row[field];
        }
      }
      if (!Object.keys(row).length) delete rules[k];
      writeStageRules(rules);
      markDirty();   // an edit after Publish makes the sent payload stale — the same contract as every other Admin screen
      drawRail(); drawTable();
    };
    body.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.addEventListener('change', () => onEdit(cb)));
    body.querySelectorAll('select.stm-sel').forEach(sel => sel.addEventListener('change', () => onEdit(sel)));
  }

  drawRail();
  drawTable();
}
