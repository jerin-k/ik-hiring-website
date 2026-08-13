// Live source of truth = data/access.json on GitHub (CDN-fast, picks up admin publishes immediately),
// falling back to the Vercel-served local copy if the fetch fails.
const LIVE_URL = 'https://raw.githubusercontent.com/jerin-k/ik-hiring-website/main/data/access.json';
const LOCAL_URL = '/data/access.json';

let accessConfig = null;

export async function loadAccessConfig() {
  let cfg = null;
  try { const r = await fetch(LIVE_URL + '?cb=' + Date.now()); if (r.ok) cfg = await r.json(); } catch (e) { /* fall through */ }
  if (!cfg) { try { const r = await fetch(LOCAL_URL + '?t=' + Date.now()); if (r.ok) cfg = await r.json(); } catch (e) { } }
  accessConfig = cfg || { defaultRole: 'none', users: [] };
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

      // isRecruiter now purely grants the Recruiter Efficiency tab (dept/team-scoped view; they see ALL
      // recruiters, not just their own row — no recruiter-centric self-filter). Identity stays the email.
      if (user.isRecruiter) {
        pages.push('recruiter');
      }

      return { role: 'restricted', pages, filters };

    default:
      return { role: 'none', pages: [] };
  }
}

export function canAccessPage(access, page) {
  return access.pages.includes(page);
}
