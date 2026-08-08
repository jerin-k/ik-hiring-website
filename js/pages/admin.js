import { DEPT_TREE } from '../dept-map.js';

export function renderAdmin(accessConfig, data) {
  const users = accessConfig?.users || [];

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
