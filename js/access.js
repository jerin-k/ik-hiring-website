const ACCESS_CONFIG_URL = '/data/access.json';

let accessConfig = null;

export async function loadAccessConfig() {
  const res = await fetch(ACCESS_CONFIG_URL);
  accessConfig = await res.json();
  return accessConfig;
}

export function getUserAccess(email) {
  if (!accessConfig) return { role: 'none', pages: [] };

  const user = accessConfig.users.find(u => u.email.toLowerCase() === email.toLowerCase());

  if (user) {
    return buildAccess(user);
  }

  return buildAccess({ role: accessConfig.defaultRole || 'none' });
}

function buildAccess(user) {
  const role = user.role;

  switch (role) {
    case 'admin':
      return {
        role: 'admin',
        pages: ['home', 'hm-report', 'recruiter', 'efficiency', 'sourcing', 'interviewer', 'admin'],
        filters: null,
      };

    case 'full_access':
      return {
        role: 'full_access',
        pages: ['home', 'hm-report', 'recruiter', 'efficiency', 'sourcing', 'interviewer'],
        filters: null,
      };

    case 'restricted':
      const pages = ['home', 'hm-report'];
      const filters = {};

      if (user.departments && user.departments.length > 0) {
        filters.departments = user.departments;
      }

      if (user.teams && user.teams.length > 0) {
        filters.teams = user.teams;
      }

      if (user.isRecruiter) {
        pages.push('recruiter');
        filters.recruiterEmail = user.email;
      }

      return { role: 'restricted', pages, filters };

    default:
      return { role: 'none', pages: [] };
  }
}

export function canAccessPage(access, page) {
  return access.pages.includes(page);
}
