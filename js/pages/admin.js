import { DEPT_TREE } from '../dept-map.js';
import { podOf, POD_OPTIONS, setPod, capacityOf, setCapacity, currentQuarter, qKey } from '../recruiter-pods.js';
import { markDirty, isDirty, getMeta, publishConfig, configFileText } from '../metric-config.js';
import { publishAccess, accessFileText } from '../access-config.js';
import { getCurrentUser } from '../auth.js';

// ===== Metric Configuration model (moved here from Recruiter Efficiency 2026-08-09) =====
// See memory project_recruiter-score-model. A role's Score = Family + Level + Complexity → grid → points.
const SCORE_TIERS = [['Vanilla', 6], ['Regular', 12], ['Semi-Niche', 15], ['Niche', 20], ['Super Niche', 40], ['Leadership', 60], ['Senior Leadership', 120]];
const CLASSIFICATIONS = [
  ['India SME', 'India SME - Normal', 'Vanilla'], ['India SME', 'India SME - Complex', 'Regular'], ['India SME', 'India SME - Uber Complex', 'Semi-Niche'],
  ['US SME', 'US SME - Normal', 'Regular'], ['US SME', 'US SME - Complex', 'Semi-Niche'], ['US SME', 'US SME - Uber Complex', 'Niche'],
  ['PA', 'India PA Junior', 'Vanilla'], ['PA', 'India PA', 'Regular'], ['PA', 'US PA Junior', 'Vanilla'], ['PA', 'US PA', 'Semi-Niche'],
  ['NonTech', 'NonTech - Intern - Normal', 'Vanilla'], ['NonTech', 'NonTech - Intern - Complex', 'Regular'], ['NonTech', 'NonTech L1 to L3 - Normal', 'Semi-Niche'], ['NonTech', 'NonTech L1 to L3 - Complex', 'Niche'], ['NonTech', 'NonTech L4 to L6 - Normal', 'Niche'], ['NonTech', 'NonTech L4 to L6 - Complex', 'Super Niche'],
  ['Tech', 'Tech - Intern - Normal', 'Regular'], ['Tech', 'Tech - Intern - Complex', 'Semi-Niche'], ['Tech', 'Tech L1 to L3 - Normal', 'Niche'], ['Tech', 'Tech L1 to L3 - Complex', 'Super Niche'], ['Tech', 'Tech L4 to L6 - Normal', 'Super Niche'], ['Tech', 'Tech L4 to L6 - Complex', 'Leadership'],
  ['Leadership', 'L7 - L8', 'Leadership'], ['Leadership', 'L9 & above', 'Senior Leadership'],
];
const FAMILY_OPTIONS = ['India SME', 'US SME', 'India PA', 'US PA', 'NonTech', 'Tech', 'Leadership', 'Exclude'];
const DEPT_FAMILY_DEFAULT = [
  ['SME - India', 'India SME', ''], ['SME - US', 'US SME', ''], ['Engineering', 'Tech', 'Tech = Engineering only'],
  ['IT', 'NonTech', ''], ['Curriculum', 'NonTech', ''],
  ['Business - India', 'India PA', 'PA if title = Program Advisor, else NonTech'], ['US Business', 'US PA', 'PA if title = Program Advisor, else NonTech'],
  ['Marketing', 'NonTech', ''], ['Operations', 'NonTech', ''], ['Finance', 'NonTech', ''], ['Human Resource', 'NonTech', ''],
  ['Talent Acquisition', 'NonTech', ''], ['New Programs', 'NonTech', ''], ["Founder's Office", 'NonTech', ''], ['B2B', 'NonTech', ''], ['Test', 'Exclude', ''],
];
const LEVEL_BANDS = [['Intern', 'L0'], ['Junior (PA/Sales only)', 'L1'], ['L1–L3', 'L1, L2, L3'], ['L4–L6', 'L4, L5, L6'], ['L7–L8', 'L7, L8'], ['L9 & above', 'L9–L12']];

const GRID_LS = 'ik_score_grid_q';   // { "2026-Q3": { tierPoints:{}, rowTier:{} } } — per quarter, copy-forward
const DEPT_FAM_LS = 'ik_dept_family';
function defaultGrid() {
  const tierPoints = {}; SCORE_TIERS.forEach(([n, p]) => { tierPoints[n] = p; });
  const rowTier = {}; CLASSIFICATIONS.forEach(([, cls, tier]) => { rowTier[cls] = tier; });
  return { tierPoints, rowTier };
}
function loadGridStore() { try { return JSON.parse(localStorage.getItem(GRID_LS) || '{}'); } catch (e) { return {}; } }
function saveGridStore(o) { localStorage.setItem(GRID_LS, JSON.stringify(o)); }
function gridQRank(k) { const m = /^(\d{4})-Q([1-4])$/.exec(k || ''); return m ? parseInt(m[1], 10) * 10 + parseInt(m[2], 10) : 0; }
function gridForQuarter(quarter) {
  const store = loadGridStore();
  if (store[quarter]) return store[quarter];
  const target = gridQRank(quarter); let best = null, br = -1;
  for (const k of Object.keys(store)) { const r = gridQRank(k); if (r <= target && r > br) { br = r; best = store[k]; } }
  return best ? JSON.parse(JSON.stringify(best)) : defaultGrid();
}
function materialiseGrid(quarter) { const s = loadGridStore(); if (!s[quarter]) { s[quarter] = gridForQuarter(quarter); saveGridStore(s); } return s; }
function setGridTier(quarter, cls, tier) { const s = materialiseGrid(quarter); s[quarter].rowTier[cls] = tier; saveGridStore(s); }
function setGridPoints(quarter, tier, pts) { const s = materialiseGrid(quarter); s[quarter].tierPoints[tier] = pts; saveGridStore(s); }
function loadDeptFamily() { try { return JSON.parse(localStorage.getItem(DEPT_FAM_LS) || '{}'); } catch (e) { return {}; } }
function saveDeptFamily(o) { localStorage.setItem(DEPT_FAM_LS, JSON.stringify(o)); }
function familyOf(dept) { const o = loadDeptFamily(); const d = DEPT_FAMILY_DEFAULT.find(x => x[0] === dept); return o[dept] || (d ? d[1] : ''); }

// Auto-capture the effective BASELINE for Publish. collectConfig() only snapshots explicit localStorage edits, so
// the very first publish (fresh browser, no edits) would send an empty config. This resolves what the readers
// ACTUALLY use — current-quarter pod assignments for the live roster + the effective score grid + the dept→family
// defaults — and merges them on top of any explicit edits (edits always win; this only FILLS gaps). Preserves
// every other quarter's edits untouched. See memory metric-config-serverside.
const POD_LS = 'ik_recruiter_pods_q', CAP_LS = 'ik_recruiter_capacity_q';
// The manual Active/Inactive override was RETIRED 2026-08-22. Status now comes from the Ashby SEAT: an
// active recruiter holds an elevated seat (UI roles Recruiter / Recruiter Admin = API globalRole
// 'Elevated Access' / 'Organization Admin'). NOTE isEnabled is useless here - it is true for all 446 Ashby
// users because IK never disables accounts, which is why every recruiter first appeared Active.
// Status is reported, never edited. Where no Ashby user matches, the pipeline says so
// (dataQuality.recruitersWithoutUserId) rather than defaulting to Active.
function buildEffectiveConfig(data) {
  const q = currentQuarter();
  const readLS = (k) => { try { return JSON.parse(localStorage.getItem(k) || '{}'); } catch (e) { return {}; } };
  const pods = readLS(POD_LS), capacity = readLS(CAP_LS), scoreGrid = loadGridStore(), deptFamily = loadDeptFamily();
  pods[q] = pods[q] || {}; capacity[q] = capacity[q] || {};
  ((data && data.recruiters) || []).forEach(r => {
    if (!r.name || r.name === 'Unassigned') return;
    // Only freeze a real pod (skip Unassigned so future baseline/edits still resolve for unmapped recruiters).
    if (pods[q][r.name] == null) { const p = podOf(r.name, q); if (p && p !== 'Unassigned') pods[q][r.name] = p; }
    if (capacity[q][r.name] == null) capacity[q][r.name] = capacityOf(r.name, q);
  });
  if (!scoreGrid[q]) scoreGrid[q] = gridForQuarter(q);
  DEPT_FAMILY_DEFAULT.forEach(([dept]) => { if (deptFamily[dept] == null) deptFamily[dept] = familyOf(dept); });
  return { schemaVersion: 1, pods, capacity, scoreGrid, deptFamily };
}

export function renderAdmin(accessConfig, data) {
  const users = accessConfig?.users || [];

  return `
    <style>
      .cfg-card { border:1px solid var(--border); border-radius:12px; padding:16px 18px; margin-bottom:18px; background:var(--card); }
      .cfg-card .lbl { font-size:11px; font-weight:700; color:var(--accent); text-transform:uppercase; letter-spacing:0.04em; }
      .cfg-card select, .cfg-card input[type=number], .cfg-card input[type=email], .cfg-card input[type=text] {
        appearance:none; -webkit-appearance:none; height:32px; padding:0 10px; border:1px solid var(--border);
        border-radius:8px; font-size:12px; font-weight:500; background:var(--bg); color:var(--text); }
      .ac-addrow { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
      .ac-addrow #new-email { flex:1; min-width:240px; }
      .ac-table { width:100%; border-collapse:collapse; }
      .ac-table th { text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:0.03em; color:var(--muted); font-weight:600; padding:7px 10px; border-bottom:1px solid var(--border); white-space:nowrap; }
      .ac-table td { padding:9px 10px; border-bottom:1px solid var(--border-light); vertical-align:top; font-size:13px; }
      .ac-table tbody tr:last-child td { border-bottom:none; }
      .ac-table tbody tr:hover { background:var(--border-light); }
      .ac-ms { border:1px solid var(--border); border-radius:7px; background:var(--bg); }
      .ac-ms summary::-webkit-details-marker { display:none; }
      .ac-del { background:none; border:1px solid var(--border); color:var(--red); font-size:11px; font-weight:600; padding:4px 10px; border-radius:6px; cursor:pointer; }
      .ac-del:hover { background:var(--red); color:#fff; border-color:var(--red); }
      .cfg-grid td, .cfg-grid th { text-align:center; white-space:nowrap; }
      .cfg-grid th:first-child, .cfg-grid td:first-child { text-align:left; min-width:210px; white-space:normal; }
      .cfg-grid tbody tr.fam-sep td { background:var(--border-light); font-weight:700; font-size:11px; text-transform:uppercase; letter-spacing:0.03em; color:var(--muted); text-align:left; }
      .cfg-grid .tier-pts { width:46px; text-align:center; padding:2px; font-size:11px; }
      .cfg-ref { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:16px; }
      .cfg-ref table { width:100%; font-size:12px; }
      .cfg-ref th { text-align:left; color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:0.03em; }
      .cfg-scroll { overflow-x:auto; }
      /* .adm-subtabs is the recessed .subtab-band — see style.css */
      /* .adm-subtab now inherits .subtab-chip from style.css — one chip for every level below the page */
    </style>

    <div class="adm-subtabs subtab-band">
      <button class="adm-subtab subtab-chip active" data-atab="access">Access Management</button>
      <button class="adm-subtab subtab-chip" data-atab="metric">Metric Configuration</button>
    </div>

    <div class="adm-panel" data-apanel="access">
      <p style="color: var(--text-muted); font-size: 0.9rem; margin:0 0 14px;">
        Controls who can sign in and what they see. Edits apply immediately in this browser; click <strong>Publish access</strong> to make them live for everyone.
      </p>

      <div class="cfg-card" style="background:var(--accent-light);border-color:var(--border);display:flex;flex-wrap:wrap;align-items:center;gap:12px;justify-content:space-between">
        <div style="font-size:12px;line-height:1.6">
          <div id="acStatus" style="font-weight:700"></div>
          <div id="acProvenance" style="color:var(--muted)"></div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <button id="acPublishBtn" class="btn btn-primary">Publish access</button>
          <button id="acDownloadBtn" class="btn-secondary" style="padding:8px 12px" title="Download access.json — fallback if publish is unavailable">Download</button>
        </div>
      </div>

      <div class="cfg-card" style="display:flex;flex-wrap:wrap;align-items:center;gap:12px">
        <span class="lbl">Default access</span>
        <select id="default-role">
          <option value="none">None (denied)</option>
          <option value="full_access">Full Access</option>
          <option value="restricted">Restricted</option>
        </select>
        <span style="font-size:11px;color:var(--muted)">What unlisted @interviewkickstart.com users see when they first sign in.</span>
      </div>

      <div class="cfg-card">
        <h4 style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:var(--muted);margin:0 0 4px">Users</h4>
        <p style="color:var(--text-muted);font-size:0.85rem;margin:0 0 12px">Sign-in identity is the GSuite <strong>email</strong>. <strong>Restricted</strong> users see only the <strong>Tabs</strong> you grant (Overview is always on); Hiring Manager / Overview data is scoped to the <strong>Departments/Teams</strong> you pick (empty = all).</p>

        <div class="ac-addrow">
          <input type="email" id="new-email" placeholder="name@interviewkickstart.com">
          <select id="new-role">
            <option value="restricted">Restricted</option>
            <option value="full_access">Full Access</option>
            <option value="admin">Admin</option>
            <option value="none">None (denied)</option>
          </select>
          <button class="btn btn-primary" id="add-user-btn">Add user</button>
        </div>

        <div class="cfg-scroll" style="margin-top:14px"><table class="ac-table">
          <thead><tr>
            <th style="min-width:210px">Email</th>
            <th style="width:140px">Role</th>
            <th>Restricted access (tabs + scope)</th>
            <th style="width:70px"></th>
          </tr></thead>
          <tbody id="users-table-body"></tbody>
        </table></div>
      </div>

    </div><!-- /access panel -->

    <div class="adm-panel" data-apanel="metric" style="display:none">
    <div class="admin-section">
      <h3>Metric Configuration</h3>
      <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1rem;">
        The scoring &amp; capacity model that drives Recruiter Efficiency and Overall Efficiency. Stored <strong>per quarter</strong>
        (copy-forward). Edit below, then <strong>Publish to team</strong> to make it the shared config everyone sees.
        A role's Score = Family + Level + Complexity → grid → points.
      </p>

      <div class="cfg-card" id="mcPublishCard" style="background:var(--accent-light);border-color:var(--border);display:flex;flex-wrap:wrap;align-items:center;gap:12px;justify-content:space-between">
        <div style="font-size:12px;line-height:1.6">
          <div id="mcStatus" style="font-weight:700"></div>
          <div id="mcProvenance" style="color:var(--muted)"></div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <button id="mcPublishBtn" class="btn btn-primary">Publish to team</button>
          <button id="mcDownloadBtn" class="btn-secondary" style="padding:8px 12px" title="Download metric_config.json — fallback if publish is unavailable">Download</button>
        </div>
      </div>

      <div class="cfg-card" style="display:flex;align-items:center;gap:12px;background:var(--accent-light);border-color:var(--border)">
        <span class="lbl">Quarter</span>
        <select id="cfgQuarter"></select>
        <span style="font-size:11px;color:var(--muted)">Drives Pod, Capacity &amp; Score Grid below — each stored per quarter, inheriting the previous quarter (copy-forward); edit to override.</span>
      </div>

      <div class="cfg-card">
        <h4 style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:var(--muted);margin:0 0 8px">Recruiter → Pod &amp; Capacity</h4>
        <p style="color:var(--text-muted);font-size:0.85rem;margin:0 0 10px">Pod feeds grouping across the reports; Capacity (a Score) is the ideal Fulfilment target. <strong>Status is read from the Ashby seat</strong> and is not editable here: Active means the person holds an elevated recruiter seat (role <em>Recruiter</em> or <em>Recruiter Admin</em>). Remove that seat in Ashby and they show as Inactive on the next refresh. Historical offers/hires still score, and the reports still include past recruiters. This table lists <strong>current recruiters only</strong> — tick the box below to see the rest. (Pod &amp; Capacity are per-quarter.) Remember to <strong>Publish to team</strong> to share.</p>
        <label class="opt" style="display:inline-flex;align-items:center;gap:6px;font-size:12px;margin:0 0 10px;cursor:pointer" title="Past recruiters no longer hold a recruiter seat in Ashby. Their saved Pod and Capacity are kept either way — this only changes what is listed here.">
          <input type="checkbox" id="cfgShowPast"> Show past recruiters <span id="cfgPastCount" style="color:var(--muted)"></span>
        </label>
        <div class="cfg-scroll"><table>
          <thead><tr><th style="min-width:220px">Recruiter</th><th style="width:160px">Pod</th><th style="width:140px">Capacity (Score)</th><th style="width:150px">Status</th></tr></thead>
          <tbody id="cfgPodBody"></tbody>
        </table></div>
        <div style="margin-top:10px;font-size:11px;color:var(--muted)"><span id="cfgPodSummary"></span><span style="margin-left:6px">· edits auto-save to this browser (team-wide sync is pending the pipeline).</span></div>
      </div>

      <div class="cfg-card">
        <h4 style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:var(--muted);margin:0 0 6px">Role Score Grid <span id="cfgGridNote" style="font-weight:400;font-size:11px;color:var(--muted);text-transform:none;letter-spacing:0"></span></h4>
        <p style="color:var(--text-muted);font-size:0.85rem;margin:0 0 10px">Each classification maps to one complexity tier → its point value. Stored <strong>per quarter</strong> (copy-forward); a candidate scores off the grid for the quarter of its offer/hire date. Points editable in the header; one tier per row.</p>
        <div class="cfg-scroll"><table class="cfg-grid">
          <thead id="cfgGridHead"></thead>
          <tbody id="cfgGridBody"></tbody>
        </table></div>
      </div>

      <div class="cfg-card">
        <h4 style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:var(--muted);margin:0 0 6px">Department → Family</h4>
        <p style="color:var(--text-muted);font-size:0.85rem;margin:0 0 10px">Maps each Ashby department to a scoring family. Business departments resolve to <strong>PA</strong> only when the job title is <em>Program Advisor</em> (incl. Sr PA → PA Regular); otherwise NonTech.</p>
        <div class="cfg-scroll"><table>
          <thead><tr><th style="min-width:200px">Ashby Department</th><th style="width:150px">Family</th><th>Note</th></tr></thead>
          <tbody id="cfgDeptBody"></tbody>
        </table></div>
      </div>

      <div class="cfg-card">
        <h4 style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:var(--muted);margin:0 0 6px">Level → Band · Complexity · Leadership override</h4>
        <div id="cfgRefBlock"></div>
      </div>
    </div>

    <div class="admin-section">
      <h3>Departments &amp; Teams</h3>
      <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1rem;">
        Authoritative Ashby department → team hierarchy, used across all reports to resolve department names.
        Mirrors Ashby → Admin → Organization Setup → Departments &amp; Teams.
        ${Object.keys(DEPT_TREE).length} departments,
        ${Object.values(DEPT_TREE).reduce((s, t) => s + t.length, 0)} teams.
        Edit <code>site/js/dept-map.js</code> when Ashby changes.
      </p>
      <div class="table-wrapper">
        <table>
          <thead><tr><th style="width:180px">Department</th><th>Teams</th></tr></thead>
          <tbody>
            ${Object.keys(DEPT_TREE).sort().map(dept => `
              <tr>
                <td style="font-weight:600; white-space:nowrap; vertical-align:top">${dept}</td>
                <td style="font-size:0.85rem">${DEPT_TREE[dept].length
                  ? DEPT_TREE[dept].map(t => `<span style="display:inline-block; background:var(--border-light,#f1f5f9); border:1px solid var(--border,#e2e8f0); border-radius:4px; padding:1px 6px; margin:2px 3px 2px 0">${t}</span>`).join('')
                  : '<span style="color:var(--text-muted)">— no teams —</span>'}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
    </div><!-- /metric panel -->
  `;
}

// ===== Access Management (functional; edits a working copy, publishes access.json team-wide) =====
const AC_ROLE_OPTS = [['admin', 'Admin'], ['full_access', 'Full Access'], ['restricted', 'Restricted'], ['none', 'None (denied)']];
const AC_DIRTY_LS = 'ik_access_dirty';
const acEsc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const AC_DEPTS = Object.keys(DEPT_TREE).sort();
const AC_TEAMS = [...new Set(Object.values(DEPT_TREE).flat())].sort();
// Tabs a restricted user can be granted (Overview is always on; Admin is admin-only, never offered here).
const AC_TABS = [['hm-report', 'Hiring Manager'], ['recruiter', 'Recruiter Efficiency'], ['efficiency', 'Overall Efficiency'], ['interviewer', 'Interviewer Efficiency']];
// Compact multi-select (native <details> + checkboxes). options = array of strings OR [value, label] pairs.
function acMs(cls, i, selected, options, labelWord) {
  const opts = options.map(o => Array.isArray(o) ? o : [o, o]);
  const sel = new Set(selected || []);
  const selLabels = opts.filter(([v]) => sel.has(v)).map(([, l]) => l);
  const summary = selLabels.length ? selLabels.join(', ') : 'Any';
  return `<details class="ac-ms">
    <summary style="list-style:none;cursor:pointer;padding:5px 8px;font-size:11px;color:${sel.size ? 'var(--text)' : 'var(--muted)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${labelWord}: ${acEsc(summary)}</summary>
    <div style="max-height:160px;overflow:auto;padding:4px 8px;border-top:1px solid var(--border)">
      ${opts.map(([v, l]) => `<label style="display:flex;align-items:center;gap:6px;font-size:11px;padding:2px 0;white-space:nowrap"><input type="checkbox" class="${cls}" data-i="${i}" value="${acEsc(v)}"${sel.has(v) ? ' checked' : ''}> ${acEsc(l)}</label>`).join('')}
    </div>
  </details>`;
}

// app.js calls this alongside initAdminMetricConfig. accessConfig = the loaded data/access.json.
export function initAdminAccess(accessConfig) {
  const work = JSON.parse(JSON.stringify(accessConfig || { defaultRole: 'none', users: [] }));
  if (!Array.isArray(work.users)) work.users = [];
  if (!work.defaultRole) work.defaultRole = 'none';
  // Migrate legacy restricted users (old isRecruiter flag) to the explicit per-user Tabs model.
  work.users.forEach(u => { if (u.role === 'restricted' && !Array.isArray(u.tabs)) { u.tabs = ['hm-report']; if (u.isRecruiter) u.tabs.push('recruiter'); } });

  const isDirtyAc = () => localStorage.getItem(AC_DIRTY_LS) === '1';
  const setDirtyAc = (v) => { if (v) localStorage.setItem(AC_DIRTY_LS, '1'); else localStorage.removeItem(AC_DIRTY_LS); refreshUI(); };

  function refreshUI() {
    const st = document.getElementById('acStatus'), pv = document.getElementById('acProvenance');
    if (st) { st.textContent = isDirtyAc() ? '● Unpublished access changes on this browser' : '✓ In sync with the team'; st.style.color = isDirtyAc() ? 'var(--orange)' : 'var(--green)'; }
    if (pv) pv.innerHTML = (accessConfig && accessConfig.updatedAt)
      ? `Access published ${new Date(accessConfig.updatedAt).toLocaleString()}${accessConfig.updatedBy ? ' · by ' + accessConfig.updatedBy : ''}`
      : 'Live access config — publish to update the shared file.';
  }

  const dr = document.getElementById('default-role');
  if (dr) { dr.value = work.defaultRole; dr.addEventListener('change', () => { work.defaultRole = dr.value; setDirtyAc(true); }); }

  function renderRows() {
    const body = document.getElementById('users-table-body'); if (!body) return;
    if (!work.users.length) { body.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:14px">No users configured</td></tr>'; return; }
    body.innerHTML = work.users.map((u, i) => {
      const restricted = u.role === 'restricted';
      return `<tr>
        <td style="font-weight:500">${acEsc(u.email)}</td>
        <td><select class="ac-role" data-i="${i}">${AC_ROLE_OPTS.map(([v, l]) => `<option value="${v}"${u.role === v ? ' selected' : ''}>${l}</option>`).join('')}</select></td>
        <td>${restricted ? `<div style="display:flex;flex-direction:column;gap:5px;max-width:330px">
              ${acMs('ac-tabs', i, u.tabs, AC_TABS, 'Tabs')}
              ${acMs('ac-depts', i, u.departments, AC_DEPTS, 'Depts')}
              ${acMs('ac-teams', i, u.teams, AC_TEAMS, 'Teams')}
            </div>` : `<span style="color:var(--text-muted);font-size:12px">${u.role === 'none' ? 'No access' : u.role === 'admin' ? 'All tabs + Admin' : 'All tabs'}</span>`}</td>
        <td><button class="btn btn-danger btn-sm ac-del" data-i="${i}">Remove</button></td>
      </tr>`;
    }).join('');
    body.querySelectorAll('.ac-role').forEach(s => s.addEventListener('change', () => { work.users[+s.dataset.i].role = s.value; setDirtyAc(true); renderRows(); }));
    const wireMs = (cls, key, word, opts) => body.querySelectorAll('.' + cls).forEach(cb => cb.addEventListener('change', () => {
      const i = +cb.dataset.i;
      const vals = [...body.querySelectorAll('.' + cls + '[data-i="' + i + '"]:checked')].map(x => x.value);
      work.users[i][key] = vals;
      const lm = new Map((opts || []).map(o => Array.isArray(o) ? o : [o, o]));
      const disp = vals.map(v => lm.get(v) || v);
      const sum = cb.closest('details').querySelector('summary');
      if (sum) sum.textContent = word + ': ' + (disp.length ? disp.join(', ') : 'Any');
      setDirtyAc(true);
    }));
    wireMs('ac-tabs', 'tabs', 'Tabs', AC_TABS);
    wireMs('ac-depts', 'departments', 'Depts', AC_DEPTS);
    wireMs('ac-teams', 'teams', 'Teams', AC_TEAMS);
    body.querySelectorAll('.ac-del').forEach(b => b.addEventListener('click', () => { work.users.splice(+b.dataset.i, 1); setDirtyAc(true); renderRows(); }));
  }
  renderRows();

  const addBtn = document.getElementById('add-user-btn');
  if (addBtn) addBtn.addEventListener('click', () => {
    const emailEl = document.getElementById('new-email'), roleEl = document.getElementById('new-role');
    const email = (emailEl.value || '').trim().toLowerCase(), role = roleEl.value;
    if (!email || email.indexOf('@') < 0) { emailEl.focus(); emailEl.style.borderColor = 'var(--red)'; return; }
    if (work.users.some(u => (u.email || '').toLowerCase() === email)) { emailEl.style.borderColor = 'var(--red)'; return; }
    const u = { email, role }; if (role === 'restricted') { u.tabs = ['hm-report']; u.departments = []; u.teams = []; }
    work.users.push(u); emailEl.value = ''; emailEl.style.borderColor = ''; setDirtyAc(true); renderRows();
  });

  const pubBtn = document.getElementById('acPublishBtn');
  if (pubBtn) pubBtn.addEventListener('click', async () => {
    const st = document.getElementById('acStatus');
    pubBtn.disabled = true; const lbl = pubBtn.textContent; pubBtn.textContent = 'Publishing…';
    if (st) { st.textContent = 'A sign-in popup will open — approve it, then this verifies automatically…'; st.style.color = 'var(--muted)'; }
    const payload = { schemaVersion: 1, defaultRole: work.defaultRole, users: work.users };
    let res; try { res = await publishAccess(payload); } catch (e) { res = { ok: false, reason: e.message }; }
    pubBtn.textContent = lbl; pubBtn.disabled = false;
    if (res.ok) { setDirtyAc(false); if (st) { st.textContent = '✓ Published — access is live for the whole team.'; st.style.color = 'var(--green)'; } }
    else if (st) { st.textContent = '✗ ' + res.reason; st.style.color = 'var(--red)'; }
  });
  const dlBtn = document.getElementById('acDownloadBtn');
  if (dlBtn) dlBtn.addEventListener('click', () => {
    const user = getCurrentUser();
    const blob = new Blob([accessFileText({ schemaVersion: 1, defaultRole: work.defaultRole, users: work.users }, user && user.email)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'access.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
  });

  refreshUI();
}

// ===== Metric Configuration interactivity (called by app.js after renderAdmin) =====
export function initAdminMetricConfig(data) {
  const recs = (data && data.recruiters) || [];
  const cfgQ = () => document.getElementById('cfgQuarter')?.value || currentQuarter();

  // ===== Admin sub-tabs (Access Management | Metric Configuration) =====
  document.querySelectorAll('.adm-subtab').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.adm-subtab').forEach(b => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.adm-panel').forEach(p => { p.style.display = p.dataset.apanel === btn.dataset.atab ? '' : 'none'; });
  }));

  function updatePodSummary() {
    const el = document.getElementById('cfgPodSummary'); if (!el) return;
    const q = cfgQ(); const counts = {};
    const showPast = !!document.getElementById('cfgShowPast')?.checked;
    // Count what is actually listed, so pod sizes read as current headcount rather than an all-time tally.
    const shown = recs.filter(r => r.name !== 'Unassigned' && (showPast || r.isActive !== false));
    shown.forEach(r => { const p = podOf(r.name, q); counts[p] = (counts[p] || 0) + 1; });
    const hidden = showPast ? 0 : recs.filter(r => r.name !== 'Unassigned' && r.isActive === false).length;
    el.textContent = Object.entries(counts).map(([p, c]) => `${p}: ${c}`).join('  ·  ') + (hidden ? `  ·  ${hidden} past hidden` : '');
  }
  function renderPodCapacity() {
    const body = document.getElementById('cfgPodBody'); if (!body) return;
    const q = cfgQ();
    // This table is for CONFIGURING current staff, so past recruiters are hidden by default. It is a display
    // filter only — their saved Pod/Capacity is untouched and still published, and the reports still show
    // their historical work (Recruiter Efficiency defaults to including them, deliberately).
    const showPast = !!document.getElementById('cfgShowPast')?.checked;
    const all = [...recs].filter(r => r.name && r.name !== 'Unassigned').sort((a, b) => a.name.localeCompare(b.name));
    const pastCount = all.filter(r => r.isActive === false).length;
    const pc = document.getElementById('cfgPastCount');
    if (pc) pc.textContent = pastCount ? `(${pastCount})` : '';
    const sorted = showPast ? all : all.filter(r => r.isActive !== false);
    const podOpts = [...POD_OPTIONS, 'Unassigned'];
    body.innerHTML = sorted.map(r => { const name = r.name; const off = r.isActive === false; const unk = r.activeKnown === false; return `<tr>
      <td style="font-weight:500">${name}</td>
      <td><select class="cfg-pod" data-name="${name}">${podOpts.map(p => `<option value="${p}"${p === podOf(name, q) ? ' selected' : ''}>${p}</option>`).join('')}</select></td>
      <td><input type="number" min="0" class="cfg-cap" data-name="${name}" value="${capacityOf(name, q)}" style="width:90px"></td>
      <td><span title="${unk ? 'No Ashby user record matched this name, so the status is unknown.' : 'Active = holds an elevated recruiter seat in Ashby (Recruiter / Recruiter Admin).'}" style="font-size:11px;font-weight:600;color:${unk ? 'var(--orange)' : (off ? 'var(--red)' : 'var(--green)')}">${unk ? 'Unknown' : (off ? 'Inactive' : 'Active')}</span></td></tr>`; }).join('')
      || `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:16px">${pastCount && !showPast ? 'No current recruiters — tick “Show past recruiters” to see the ' + pastCount + ' who no longer hold a seat.' : 'No recruiters in the data yet.'}</td></tr>`;
    body.querySelectorAll('.cfg-pod').forEach(sel => sel.addEventListener('change', () => { setPod(sel.dataset.name, sel.value, cfgQ()); touched(); updatePodSummary(); }));
    body.querySelectorAll('.cfg-cap').forEach(inp => inp.addEventListener('input', () => { setCapacity(inp.dataset.name, inp.value, cfgQ()); touched(); }));
    updatePodSummary();
  }
  function renderScoreGrid() {
    const head = document.getElementById('cfgGridHead'); if (!head) return;
    const q = cfgQ();
    const grid = gridForQuarter(q);
    head.innerHTML = `<tr><th>Role Classification</th>${SCORE_TIERS.map(([n]) => `<th>${n}<br><input type="number" class="tier-pts" data-tier="${n}" value="${grid.tierPoints[n]}"></th>`).join('')}</tr>`;
    let html = '', lastFam = null;
    CLASSIFICATIONS.forEach(([fam, cls]) => {
      if (fam !== lastFam) { html += `<tr class="fam-sep"><td colspan="${SCORE_TIERS.length + 1}">${fam}</td></tr>`; lastFam = fam; }
      const rname = 'grid_' + cls.replace(/[^a-z0-9]/gi, '_');
      html += `<tr><td>${cls}</td>${SCORE_TIERS.map(([n]) => `<td><input type="radio" name="${rname}" class="grid-radio" data-cls="${cls}" data-tier="${n}"${n === grid.rowTier[cls] ? ' checked' : ''}></td>`).join('')}</tr>`;
    });
    document.getElementById('cfgGridBody').innerHTML = html;
    document.querySelectorAll('#cfgGridBody .grid-radio').forEach(r => r.addEventListener('change', () => { if (r.checked) { setGridTier(cfgQ(), r.dataset.cls, r.dataset.tier); touched(); } }));
    document.querySelectorAll('#cfgGridHead .tier-pts').forEach(inp => inp.addEventListener('input', () => { setGridPoints(cfgQ(), inp.dataset.tier, parseInt(inp.value, 10) || 0); touched(); }));
    const note = document.getElementById('cfgGridNote');
    if (note) note.textContent = ` — ${loadGridStore()[q] ? 'edited for ' + q.replace('-', ' ') : 'inherited (copy-forward)'}`;
  }
  function renderDeptFamily() {
    const body = document.getElementById('cfgDeptBody'); if (!body) return;
    body.innerHTML = DEPT_FAMILY_DEFAULT.map(([dept, , note]) => `<tr>
      <td style="font-weight:500">${dept}</td>
      <td><select class="cfg-fam" data-dept="${dept}">${FAMILY_OPTIONS.map(f => `<option value="${f}"${f === familyOf(dept) ? ' selected' : ''}>${f}</option>`).join('')}</select></td>
      <td style="color:var(--muted);font-size:11px">${note || ''}</td></tr>`).join('');
    body.querySelectorAll('.cfg-fam').forEach(s => s.addEventListener('change', () => { const o = loadDeptFamily(); o[s.dataset.dept] = s.value; saveDeptFamily(o); touched(); }));
  }
  function renderRefBlock() {
    const el = document.getElementById('cfgRefBlock'); if (!el) return;
    el.innerHTML = `<div class="cfg-ref">
      <table><thead><tr><th>Level band</th><th>Ashby L-scale</th></tr></thead><tbody>${LEVEL_BANDS.map(([b, l]) => `<tr><td>${b}</td><td style="color:var(--muted)">${l}</td></tr>`).join('')}</tbody></table>
      <table><thead><tr><th>Complexity (Ashby)</th></tr></thead><tbody><tr><td>Normal</td></tr><tr><td>Complex</td></tr><tr><td>Uber Complex</td></tr></tbody></table>
      <table><thead><tr><th>Leadership override</th></tr></thead><tbody><tr><td>L7–L8 → Leadership (60)</td></tr><tr><td>L9 &amp; above → Senior Leadership (120)</td></tr><tr><td style="color:var(--muted);font-size:11px">Any family; overrides Family/Complexity by level.</td></tr></tbody></table>
    </div>`;
  }

  // ===== team-wide publish (antifragile: dirty tracking + confirm-by-read + download fallback) =====
  function touched() { markDirty(); refreshPublishUI(); }
  function refreshPublishUI() {
    const status = document.getElementById('mcStatus'), prov = document.getElementById('mcProvenance');
    if (!status) return;
    const dirty = isDirty(), meta = getMeta();
    status.textContent = dirty ? '● Unpublished changes on this browser' : '✓ In sync with the team';
    status.style.color = dirty ? 'var(--orange)' : 'var(--green)';
    prov.innerHTML = (meta && meta.updatedAt)
      ? `Team config published ${new Date(meta.updatedAt).toLocaleString()}${meta.updatedBy ? ' · by ' + meta.updatedBy : ''}`
      : 'No team config published yet — Publish to set the shared baseline.';
  }
  const pubBtn = document.getElementById('mcPublishBtn');
  if (pubBtn) pubBtn.addEventListener('click', async () => {
    const status = document.getElementById('mcStatus');
    pubBtn.disabled = true; const label = pubBtn.textContent; pubBtn.textContent = 'Publishing…';
    status.textContent = 'A sign-in popup will open — approve it, then this verifies automatically…'; status.style.color = 'var(--muted)';
    let res; try { res = await publishConfig(buildEffectiveConfig(data)); } catch (e) { res = { ok: false, reason: e.message }; }
    pubBtn.textContent = label; pubBtn.disabled = false;
    if (res.ok) { status.textContent = '✓ Published — the whole team now sees this config.'; status.style.color = 'var(--green)'; refreshPublishUI(); }
    else { status.textContent = '✗ ' + res.reason; status.style.color = 'var(--red)'; }
  });
  const dlBtn = document.getElementById('mcDownloadBtn');
  if (dlBtn) dlBtn.addEventListener('click', () => {
    const user = getCurrentUser();
    const blob = new Blob([configFileText(user && user.email)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'metric_config.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
  });

  const qSel = document.getElementById('cfgQuarter');
  if (qSel) {
    const cy = new Date().getFullYear(); const qs = [];
    for (let y = Math.max(cy, 2026); y >= 2026; y--) for (let q = 4; q >= 1; q--) qs.push(qKey(y, q));
    qSel.innerHTML = qs.map(q => `<option value="${q}">${q.replace('-', ' ')}</option>`).join('');
    qSel.value = currentQuarter();
    qSel.addEventListener('change', () => { renderPodCapacity(); renderScoreGrid(); });
    document.getElementById('cfgShowPast')?.addEventListener('change', renderPodCapacity);
  }
  renderPodCapacity(); renderScoreGrid(); renderDeptFamily(); renderRefBlock(); refreshPublishUI();
}
