export function renderAdmin(accessConfig) {
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
