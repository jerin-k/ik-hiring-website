import { DEPT_TREE } from '../dept-map.js';
import { podOf, POD_OPTIONS, setPod, capacityOf, setCapacity, currentQuarter, qKey } from '../recruiter-pods.js';

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

export function renderAdmin(accessConfig, data) {
  const users = accessConfig?.users || [];

  return `
    <style>
      .cfg-card { border:1px solid var(--border); border-radius:12px; padding:16px 18px; margin-bottom:18px; background:var(--card); }
      .cfg-card .lbl { font-size:11px; font-weight:700; color:var(--accent); text-transform:uppercase; letter-spacing:0.04em; }
      .cfg-card select, .cfg-card input[type=number] {
        appearance:none; -webkit-appearance:none; height:32px; padding:0 10px; border:1px solid var(--border);
        border-radius:8px; font-size:12px; font-weight:500; background:var(--bg); color:var(--text); }
      .cfg-grid td, .cfg-grid th { text-align:center; white-space:nowrap; }
      .cfg-grid th:first-child, .cfg-grid td:first-child { text-align:left; min-width:210px; white-space:normal; }
      .cfg-grid tbody tr.fam-sep td { background:var(--border-light); font-weight:700; font-size:11px; text-transform:uppercase; letter-spacing:0.03em; color:var(--muted); text-align:left; }
      .cfg-grid .tier-pts { width:46px; text-align:center; padding:2px; font-size:11px; }
      .cfg-ref { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:16px; }
      .cfg-ref table { width:100%; font-size:12px; }
      .cfg-ref th { text-align:left; color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:0.03em; }
      .cfg-scroll { overflow-x:auto; }
    </style>

    <div class="admin-section">
      <h3>Default Access</h3>
      <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1rem;">
        What unlisted @interviewkickstart.com users see when they sign in.
      </p>
      <div class="form-row">
        <div class="form-group">
          <label>Default Role</label>
          <select id="default-role">
            <option value="none" ${accessConfig?.defaultRole === 'none' ? 'selected' : ''}>None (denied)</option>
            <option value="full_access" ${accessConfig?.defaultRole === 'full_access' ? 'selected' : ''}>Full Access</option>
            <option value="restricted" ${accessConfig?.defaultRole === 'restricted' ? 'selected' : ''}>Restricted</option>
          </select>
        </div>
        <button class="btn btn-primary" id="save-default-btn">Save</button>
      </div>
    </div>

    <div class="admin-section">
      <h3>Users</h3>
      <div class="form-row" style="margin-bottom: 1.5rem;">
        <div class="form-group" style="flex: 1;">
          <label>Email</label>
          <input type="email" id="new-email" placeholder="name@interviewkickstart.com">
        </div>
        <div class="form-group">
          <label>Role</label>
          <select id="new-role">
            <option value="admin">Admin</option>
            <option value="full_access">Full Access</option>
            <option value="restricted">Restricted</option>
          </select>
        </div>
        <button class="btn btn-primary" id="add-user-btn">Add User</button>
      </div>

      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Filters</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="users-table-body">
            ${users.map(u => renderUserRow(u)).join('')}
            ${users.length === 0 ? '<tr><td colspan="4" style="text-align:center; color: var(--text-muted);">No users configured</td></tr>' : ''}
          </tbody>
        </table>
      </div>
    </div>

    <div class="admin-section">
      <h3>Metric Configuration</h3>
      <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1rem;">
        The scoring &amp; capacity model that drives Recruiter Efficiency and Overall Efficiency — the pipeline just reads it.
        Everything is stored <strong>per quarter</strong> (copy-forward) and saved to this browser; team-wide server-side
        persistence is a pending pipeline step. A role's Score = Family + Level + Complexity → grid → points.
      </p>

      <div class="cfg-card" style="display:flex;align-items:center;gap:12px;background:var(--accent-light);border-color:var(--border)">
        <span class="lbl">Quarter</span>
        <select id="cfgQuarter"></select>
        <span style="font-size:11px;color:var(--muted)">Drives Pod, Capacity &amp; Score Grid below — each stored per quarter, inheriting the previous quarter (copy-forward); edit to override.</span>
      </div>

      <div class="cfg-card">
        <h4 style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:var(--muted);margin:0 0 8px">Recruiter → Pod &amp; Capacity</h4>
        <p style="color:var(--text-muted);font-size:0.85rem;margin:0 0 10px">Pod feeds grouping across the reports; Capacity (a Score) is the ideal Fulfilment target.</p>
        <div class="cfg-scroll"><table>
          <thead><tr><th style="min-width:220px">Recruiter</th><th style="width:160px">Pod</th><th style="width:140px">Capacity (Score)</th></tr></thead>
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
  `;
}

function renderUserRow(user) {
  const roleBadge = {
    admin: 'badge-danger',
    full_access: 'badge-info',
    restricted: 'badge-warning',
  }[user.role] || 'badge-info';

  let filters = '—';
  if (user.departments?.length) filters = `Depts: ${user.departments.join(', ')}`;
  if (user.teams?.length) filters = `Teams: ${user.teams.join(', ')}`;
  if (user.isRecruiter) filters += (filters === '—' ? '' : ' | ') + 'Recruiter';

  return `
    <tr>
      <td>${user.email}</td>
      <td><span class="badge ${roleBadge}">${user.role}</span></td>
      <td style="font-size: 0.8rem;">${filters}</td>
      <td><button class="btn btn-danger btn-sm" data-delete="${user.email}">Remove</button></td>
    </tr>
  `;
}

// ===== Metric Configuration interactivity (called by app.js after renderAdmin) =====
export function initAdminMetricConfig(data) {
  const recs = (data && data.recruiters) || [];
  const cfgQ = () => document.getElementById('cfgQuarter')?.value || currentQuarter();

  function updatePodSummary() {
    const el = document.getElementById('cfgPodSummary'); if (!el) return;
    const q = cfgQ(); const counts = {};
    recs.forEach(r => { const p = podOf(r.name, q); counts[p] = (counts[p] || 0) + 1; });
    el.textContent = Object.entries(counts).map(([p, c]) => `${p}: ${c}`).join('  ·  ');
  }
  function renderPodCapacity() {
    const body = document.getElementById('cfgPodBody'); if (!body) return;
    const q = cfgQ();
    const names = recs.map(r => r.name).sort((a, b) => a.localeCompare(b));
    const podOpts = [...POD_OPTIONS, 'Unassigned'];
    body.innerHTML = names.map(name => `<tr>
      <td style="font-weight:500">${name}</td>
      <td><select class="cfg-pod" data-name="${name}">${podOpts.map(p => `<option value="${p}"${p === podOf(name, q) ? ' selected' : ''}>${p}</option>`).join('')}</select></td>
      <td><input type="number" min="0" class="cfg-cap" data-name="${name}" value="${capacityOf(name, q)}" style="width:90px"></td></tr>`).join('')
      || `<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:16px">No recruiters in the data yet.</td></tr>`;
    body.querySelectorAll('.cfg-pod').forEach(sel => sel.addEventListener('change', () => { setPod(sel.dataset.name, sel.value, cfgQ()); updatePodSummary(); }));
    body.querySelectorAll('.cfg-cap').forEach(inp => inp.addEventListener('input', () => setCapacity(inp.dataset.name, inp.value, cfgQ())));
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
    document.querySelectorAll('#cfgGridBody .grid-radio').forEach(r => r.addEventListener('change', () => { if (r.checked) setGridTier(cfgQ(), r.dataset.cls, r.dataset.tier); }));
    document.querySelectorAll('#cfgGridHead .tier-pts').forEach(inp => inp.addEventListener('input', () => setGridPoints(cfgQ(), inp.dataset.tier, parseInt(inp.value, 10) || 0)));
    const note = document.getElementById('cfgGridNote');
    if (note) note.textContent = ` — ${loadGridStore()[q] ? 'edited for ' + q.replace('-', ' ') : 'inherited (copy-forward)'}`;
  }
  function renderDeptFamily() {
    const body = document.getElementById('cfgDeptBody'); if (!body) return;
    body.innerHTML = DEPT_FAMILY_DEFAULT.map(([dept, , note]) => `<tr>
      <td style="font-weight:500">${dept}</td>
      <td><select class="cfg-fam" data-dept="${dept}">${FAMILY_OPTIONS.map(f => `<option value="${f}"${f === familyOf(dept) ? ' selected' : ''}>${f}</option>`).join('')}</select></td>
      <td style="color:var(--muted);font-size:11px">${note || ''}</td></tr>`).join('');
    body.querySelectorAll('.cfg-fam').forEach(s => s.addEventListener('change', () => { const o = loadDeptFamily(); o[s.dataset.dept] = s.value; saveDeptFamily(o); }));
  }
  function renderRefBlock() {
    const el = document.getElementById('cfgRefBlock'); if (!el) return;
    el.innerHTML = `<div class="cfg-ref">
      <table><thead><tr><th>Level band</th><th>Ashby L-scale</th></tr></thead><tbody>${LEVEL_BANDS.map(([b, l]) => `<tr><td>${b}</td><td style="color:var(--muted)">${l}</td></tr>`).join('')}</tbody></table>
      <table><thead><tr><th>Complexity (Ashby)</th></tr></thead><tbody><tr><td>Normal</td></tr><tr><td>Complex</td></tr><tr><td>Uber Complex</td></tr></tbody></table>
      <table><thead><tr><th>Leadership override</th></tr></thead><tbody><tr><td>L7–L8 → Leadership (60)</td></tr><tr><td>L9 &amp; above → Senior Leadership (120)</td></tr><tr><td style="color:var(--muted);font-size:11px">Any family; overrides Family/Complexity by level.</td></tr></tbody></table>
    </div>`;
  }

  const qSel = document.getElementById('cfgQuarter');
  if (qSel) {
    const cy = new Date().getFullYear(); const qs = [];
    for (let y = cy; y >= cy - 1; y--) for (let q = 4; q >= 1; q--) qs.push(qKey(y, q));
    qSel.innerHTML = qs.map(q => `<option value="${q}">${q.replace('-', ' ')}</option>`).join('');
    qSel.value = currentQuarter();
    qSel.addEventListener('change', () => { renderPodCapacity(); renderScoreGrid(); });
  }
  renderPodCapacity(); renderScoreGrid(); renderDeptFamily(); renderRefBlock();
}
