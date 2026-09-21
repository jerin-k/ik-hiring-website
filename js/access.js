// Live source of truth = data/access.json on GitHub (CDN-fast, picks up admin publishes immediately),
// falling back to the Vercel-served local copy if the fetch fails.
const LIVE_URL = 'https://raw.githubusercontent.com/jerin-k/ik-hiring-website/main/data/access.json';
const LOCAL_URL = '/data/access.json';
// #118 (14 Sep 2026): read the GitHub contents API FIRST. raw.githubusercontent ignores ?cb and served the previous access file
// for minutes after a publish — the Admin list reloaded without the person just added, and a publish from it would have
// removed them. The API is exact; if it refuses (60 unauthenticated reads an hour per IP), raw and then Vercel's copy follow.
const API_URL = 'https://api.github.com/repos/jerin-k/ik-hiring-website/contents/data/access.json?ref=main';

let accessConfig = null;

export async function loadAccessConfig() {
  let cfg = null;
  try { const r = await fetch(API_URL + '&cb=' + Date.now(), { headers: { Accept: 'application/vnd.github.raw+json' }, cache: 'no-store' }); if (r.ok) cfg = await r.json(); } catch (e) { /* fall through */ }
  if (!cfg) { try { const r = await fetch(LIVE_URL + '?cb=' + Date.now()); if (r.ok) cfg = await r.json(); } catch (e) { /* fall through */ } }
  if (!cfg) { try { const r = await fetch(LOCAL_URL + '?t=' + Date.now()); if (r.ok) cfg = await r.json(); } catch (e) { } }
  accessConfig = cfg || { defaultRole: 'none', users: [] };
  return accessConfig;
}

// #112 (21 Sep 2026): the person's userType on the published list (Recruitment Team · Hiring Manager · Admin · Others).
export function accessUserType(email) {
  const u = accessConfig && (accessConfig.users || []).find(x => String(x.email || '').toLowerCase() === String(email || '').toLowerCase());
  return (u && u.userType) || '';
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
        pages: ['home', 'hm-report', 'recruiter', 'efficiency', 'admin'],
        filters: null,
      };

    case 'full_access':
      return {
        role: 'full_access',
        pages: ['home', 'hm-report', 'recruiter', 'efficiency'],
        filters: null,
      };

    case 'restricted': {
      // Per-user tab grants (Overview always on; Admin never grantable). Legacy configs without `tabs`
      // fall back to hm-report + (recruiter if the old isRecruiter flag was set). Dept/Team scope the data.
      const RESTRICTABLE = ['hm-report', 'recruiter', 'efficiency'];
      const tabs = (user.tabs && user.tabs.length) ? user.tabs
        : ['hm-report'].concat(user.isRecruiter ? ['recruiter'] : []);
      const pages = ['home'];
      tabs.forEach(t => { if (RESTRICTABLE.includes(t) && !pages.includes(t)) pages.push(t); });

      // #120b (Jerin, 14 Sep 2026): departments alone scope the data. A `teams` list left on an older user entry is ignored.
      const filters = {};
      if (user.departments && user.departments.length > 0) filters.departments = user.departments;

      return { role: 'restricted', pages, filters };
    }

    default:
      return { role: 'none', pages: [] };
  }
}

export function canAccessPage(access, page) {
  return access.pages.includes(page);
}
