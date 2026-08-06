import { DEPT_TREE } from '../dept-map.js';
import { POD_OPTIONS, podOf, setPodOverride, mergedPodMap } from '../recruiter-pods.js';

export function renderAdmin(accessConfig, data) {
  const users = accessConfig?.users || [];
  const recruiters = [...new Set((data?.recruiters || []).map(r => r.name))].filter(Boolean).sort();

  const podSelect = (name) => {
    const cur = podOf(name);
    const opts = ['Unassigned', ...POD_OPTIONS]
      .map(p => `<option value="${p}"${p === cur ? ' selected' : ''}>${p === 'Unassigned' ? '— Unassigned —' : p}</option>`).join('');
    return `<select class="rec-pod-select" data-rec="${name}" style="padding:5px 9px;border:1px solid var(--border);border-radius:6px;font-size:12px;background:var(--card);color:var(--text);min-width:150px">${opts}</select>`;
  };

  return `
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

    <div class="admin-section">
      <h3>Recruiter → Pod Mapping</h3>
      <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1rem;">
        Assign each recruiter to a pod (Sales / Lateral / SME-US / SME-India). Pods drive the Recruiter tab's
        grouping and the Sales-vs-Non-Sales split in Position Fulfilment. Edits save to this browser immediately;
        click <strong>Export mapping</strong> and commit the result into <code>site/js/recruiter-pods.js</code> to make it permanent for everyone.
        ${recruiters.length ? '' : '<br><em>No recruiters in the current data yet.</em>'}
      </p>
      <div class="table-wrapper">
        <table>
          <thead><tr><th style="width:60%">Recruiter</th><th>Pod</th></tr></thead>
          <tbody>
            ${recruiters.map(name => `<tr><td style="font-weight:500">${name}</td><td>${podSelect(name)}</td></tr>`).join('')}
            ${recruiters.length === 0 ? '<tr><td colspan="2" style="text-align:center;color:var(--text-muted)">—</td></tr>' : ''}
          </tbody>
        </table>
      </div>
      <div class="form-row" style="margin-top:12px;align-items:center">
        <button class="btn btn-primary" id="rec-pod-export">Export mapping</button>
        <span id="rec-pod-summary" style="font-size:12px;color:var(--muted)"></span>
      </div>
      <textarea id="rec-pod-out" readonly placeholder="Click Export mapping — then paste the RECRUITER_POD block into site/js/recruiter-pods.js and commit."
        style="display:none;width:100%;margin-top:10px;min-height:140px;font-family:ui-monospace,Menlo,monospace;font-size:12px;padding:10px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text)"></textarea>
    </div>
  `;
}

// Wires the Recruiter → Pod dropdowns + Export. Call after renderAdmin is in the DOM.
export function initAdminPods() {
  const summary = document.getElementById('rec-pod-summary');
  const selects = [...document.querySelectorAll('.rec-pod-select')];
  function refreshSummary() {
    const counts = {};
    selects.forEach(s => { counts[s.value] = (counts[s.value] || 0) + 1; });
    const parts = Object.keys(counts).sort().map(k => `${k === 'Unassigned' ? 'Unassigned' : k}: ${counts[k]}`);
    if (summary) summary.textContent = parts.join('  ·  ');
  }
  selects.forEach(s => s.addEventListener('change', () => {
    setPodOverride(s.dataset.rec, s.value);
    refreshSummary();
  }));
  refreshSummary();

  document.getElementById('rec-pod-export')?.addEventListener('click', () => {
    const map = mergedPodMap();
    const lines = Object.keys(map).sort().map(n => `  ${JSON.stringify(n)}: ${JSON.stringify(map[n])},`);
    const snippet = `export const RECRUITER_POD = {\n${lines.join('\n')}\n};`;
    const out = document.getElementById('rec-pod-out');
    if (out) { out.style.display = 'block'; out.value = snippet; out.focus(); out.select(); }
  });
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
