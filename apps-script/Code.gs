// ===== CONFIG =====
// RESTORED 2026-09-07. This whole block was deleted from the deployed Code.gs on 5 Sep 2026,
// which broke "Publish Metric Config" with: ReferenceError: CONFIG_SHEET_NAME is not defined.
// ALL_TABS / ALL_DEPARTMENTS / ALL_TEAMS / VALID_ROLES were lost in the same deletion and are
// used by serveDashboard, adminSetUserAccess and the adminGet* helpers. Do not delete again.
// DASHBOARD_FOLDER_ID is intentionally NOT here - it was restored into DataRefresh.gs on 5 Sep.
var CONFIG_SHEET_NAME = 'Dashboard Access Config';

var ALL_TABS = [
  { id: 'hm', label: '1. Hiring Manager Report' },
  { id: 'recruiter', label: '2. Recruiter Efficiency' },
  { id: 'efficiency', label: '3. Overall Hiring Efficiency' },
  { id: 'sourcing', label: '4. Sourcing Mix' }
];

var ALL_DEPARTMENTS = [
  'US Business', 'Business - India', 'SME - India', 'SME - US',
  'Engineering', 'Operations', 'Talent Acquisition', 'Finance',
  'Human Resource', 'Marketing', 'New Programs', 'Test'
];

var ALL_TEAMS = [
  'Sales', 'Sales Training & Enablement', 'Software Development',
  'Product Management (Tech)', 'Product Management (Curriculum)',
  'Customer Success Management', 'Corporate Partnerships',
  'HR Operations', 'Content', 'Delivery'
];

// Roles: admin, all_access, department, team, page
var VALID_ROLES = ['admin', 'all_access', 'department', 'team', 'page'];

// ===== MAIN ROUTER =====
function doGet(e) {
  if (e && e.parameter && e.parameter.page === 'doPublishAccess') return publishAccessPage_(e, Session.getActiveUser().getEmail().toLowerCase());
  if (e && e.parameter && e.parameter.page === 'doSendInvite') return sendInvitePage_(e, Session.getActiveUser().getEmail().toLowerCase());   // #118
  var page = (e && e.parameter && e.parameter.page) || 'dashboard';
  // Handle manual refresh action
  var action = (e && e.parameter && e.parameter.action) || '';
  if (action === 'refresh') {
    ScriptApp.getProjectTriggers().forEach(function(t) {
      if (t.getHandlerFunction() === 'manualRefresh_') ScriptApp.deleteTrigger(t);
    });
    ScriptApp.newTrigger('manualRefresh_').timeBased().after(1000).create();
    return ContentService.createTextOutput(JSON.stringify({
      status: 'ok',
      message: 'Refresh scheduled. Data will update in 2-4 minutes.',
      triggeredAt: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
  // JSON data endpoint — serves dashboard.json from Drive
  if (action === 'data') {
    return serveJsonData();
  }



  // JSON API endpoint for the Vercel dashboard
  if (page === 'data') {
    return serveJsonData();
  }

  var userEmail = Session.getActiveUser().getEmail().toLowerCase();

  if (page === 'doPublish') { return publishConfigPage_(e, userEmail); }

  // #112 phase 1 (Jerin, 16 Sep 2026): the Opening Requests window. Its gate (orUser_) runs inside, on EVERY call.
  if (page === 'requests') { return requestsPage_(e); }

  // #150 (19 Sep 2026): one remark against one job. Any role but 'none' may write; the guard runs server-side too.
  if (page === 'doPublishNote') { return publishNotePage_(e, userEmail); }

  if (page === 'admin') {
    var access = getUserAccess(userEmail);
    if (!access || access.role !== 'admin') {
      return HtmlService.createHtmlOutput(
        '<div style="font-family:system-ui,sans-serif;padding:60px;text-align:center">' +
        '<h1 style="color:#dc2626">Access Denied</h1>' +
        '<p style="color:#64748b">You don\'t have admin privileges.</p></div>'
      ).setTitle('Access Denied');
    }
    return HtmlService.createHtmlOutputFromFile('AdminPage')
      .setTitle('Dashboard Admin')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  return serveDashboard(userEmail);
}

// ===== SERVE DASHBOARD WITH FILTERING =====
function serveDashboard(userEmail) {
  var folder = DriveApp.getFolderById(DASHBOARD_FOLDER_ID);
  var files = folder.getFilesByType('text/html');
  var latest = null;
  var latestDate = new Date(0);
  while (files.hasNext()) {
    var file = files.next();
    var created = file.getDateCreated();
    if (created > latestDate) {
      latestDate = created;
      latest = file;
    }
  }

  if (!latest) {
    return HtmlService.createHtmlOutput('<h1>No dashboard found</h1>');
  }

  var content = latest.getBlob().getDataAsString();
  var access = getUserAccess(userEmail);

  // No config entry â check default
  if (!access) {
    var defaults = getDefaultAccess();
    if (defaults.defaultRole === 'none') {
      return HtmlService.createHtmlOutput(
        '<div style="font-family:system-ui,sans-serif;padding:60px;text-align:center">' +
        '<h1 style="color:#dc2626">Access Denied</h1>' +
        '<p style="color:#64748b">You don\'t have access to this dashboard.<br>Contact your administrator.</p>' +
        '<p style="color:#94a3b8;font-size:12px;margin-top:20px">' + userEmail + '</p></div>'
      ).setTitle('Access Denied');
    }
    access = { role: defaults.defaultRole, allowedTabs: 'all', allowedDepartments: 'all', allowedTeams: 'all' };
  }

  // Admin / all_access â no filtering
  if (access.role === 'admin' || access.role === 'all_access') {
    return HtmlService.createHtmlOutput(content)
      .setTitle('Ashby Hiring Dashboard')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  // Page centric â server-side tab removal
  if (access.role === 'page') {
    if (access.allowedTabs !== 'all') {
      content = filterTabs(content, access.allowedTabs);
    }
    return HtmlService.createHtmlOutput(content)
      .setTitle('Ashby Hiring Dashboard')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  // Department / Team centric â inject client-side filter
  if (access.role === 'department' || access.role === 'team') {
    var filterConfig = JSON.stringify({
      mode: access.role,
      departments: access.allowedDepartments,
      teams: access.allowedTeams
    });
    var filterScript = buildFilterScript(filterConfig);
    // Inject before </body>
    content = content.replace('</body>', filterScript + '\n</body>');
    return HtmlService.createHtmlOutput(content)
      .setTitle('Ashby Hiring Dashboard')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  return HtmlService.createHtmlOutput(content)
    .setTitle('Ashby Hiring Dashboard')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ===== CLIENT-SIDE FILTER SCRIPT (injected into dashboard HTML) =====
function buildFilterScript(filterConfigJson) {
  return '<script>\n' +
    '(function(){\n' +
    '  var cfg=' + filterConfigJson + ';\n' +
    '  function getDept(teamStr){\n' +
    '    if(typeof DEPT_MAP!=="undefined" && DEPT_MAP[teamStr]) return DEPT_MAP[teamStr].dept;\n' +
    '    var parts=teamStr.split(/[|\\-]/); return parts[0].trim();\n' +
    '  }\n' +
    '  function getTeam(teamStr){\n' +
    '    if(typeof DEPT_MAP!=="undefined" && DEPT_MAP[teamStr]) return DEPT_MAP[teamStr].tm;\n' +
    '    var parts=teamStr.split(/[|]/); return parts.length>1?parts[1].trim():teamStr.trim();\n' +
    '  }\n' +
    '  function shouldShow(teamStr){\n' +
    '    if(cfg.mode==="department"){\n' +
    '      if(cfg.departments==="all") return true;\n' +
    '      var d=getDept(teamStr);\n' +
    '      return cfg.departments.indexOf(d)!==-1;\n' +
    '    }\n' +
    '    if(cfg.mode==="team"){\n' +
    '      if(cfg.teams==="all") return true;\n' +
    '      var t=getTeam(teamStr);\n' +
    '      var d2=getDept(teamStr);\n' +
    '      for(var i=0;i<cfg.teams.length;i++){\n' +
    '        if(cfg.teams[i]===t || cfg.teams[i]===teamStr || cfg.teams[i]===d2) return true;\n' +
    '      }\n' +
    '      return false;\n' +
    '    }\n' +
    '    return true;\n' +
    '  }\n' +
    '  // Filter table rows\n' +
    '  document.querySelectorAll("table tbody tr").forEach(function(tr){\n' +
    '    var cells=tr.querySelectorAll("td");\n' +
    '    if(cells.length<2) return;\n' +
    '    var teamCell=cells[1];\n' +
    '    if(!teamCell) return;\n' +
    '    var teamText=teamCell.textContent.trim();\n' +
    '    if(teamText && !shouldShow(teamText)){\n' +
    '      tr.style.display="none";\n' +
    '    }\n' +
    '  });\n' +
    '  // Add filter notice banner\n' +
    '  var notice=document.createElement("div");\n' +
    '  notice.style.cssText="background:#fef3c7;border:1px solid #fbbf24;border-radius:6px;padding:8px 16px;margin:8px 24px;font-size:12px;color:#92400e";\n' +
    '  notice.innerHTML="<strong>Filtered view</strong> â You are seeing data for: "+(cfg.mode==="department"?(cfg.departments==="all"?"all departments":cfg.departments.join(", ")):(cfg.teams==="all"?"all teams":cfg.teams.join(", ")));\n' +
    '  var container=document.querySelector(".container");\n' +
    '  if(container) container.insertBefore(notice,container.firstChild);\n' +
    '})();\n' +
    '</script>';
}

// ===== SERVER-SIDE TAB FILTERING =====
function filterTabs(html, allowedTabs) {
  ALL_TABS.forEach(function(tab) {
    if (allowedTabs.indexOf(tab.id) === -1) {
      // Remove tab button
      var tabBtnRegex = new RegExp('<div class="tab[^"]*" data-tab="' + tab.id + '">[^<]*</div>', 'g');
      html = html.replace(tabBtnRegex, '');

      // Remove section content
      var startTag = 'id="sec-' + tab.id + '">';
      var startIdx = html.indexOf(startTag);
      if (startIdx !== -1) {
        var commentIdx = html.lastIndexOf('<!--', startIdx);
        if (commentIdx !== -1 && (startIdx - commentIdx) < 200) {
          var lineStart = html.lastIndexOf('\n', commentIdx);
          startIdx = lineStart !== -1 ? lineStart : commentIdx;
        }
        var nextTab = html.indexOf('<!-- =', startIdx + 10);
        var scriptTag = html.indexOf('<script', startIdx + 10);
        var endIdx = html.length;
        if (nextTab !== -1) endIdx = Math.min(endIdx, nextTab);
        if (scriptTag !== -1) endIdx = Math.min(endIdx, scriptTag);
        html = html.substring(0, startIdx) + html.substring(endIdx);
      }
    }
  });

  // Set first allowed tab as active
  if (allowedTabs.length > 0) {
    var first = allowedTabs[0];
    html = html.replace(/class="tab active"/g, 'class="tab"');
    html = html.replace('class="tab" data-tab="' + first + '"', 'class="tab active" data-tab="' + first + '"');
    html = html.replace(/class="section active"/g, 'class="section"');
    html = html.replace('class="section" id="sec-' + first + '"', 'class="section active" id="sec-' + first + '"');
  }
  return html;
}

// ===== CONFIG SHEET =====
function getOrCreateConfigSheet() {
  var folder = DriveApp.getFolderById(DASHBOARD_FOLDER_ID);
  var files = folder.getFilesByName(CONFIG_SHEET_NAME);

  if (files.hasNext()) {
    return SpreadsheetApp.open(files.next());
  }

  var ss = SpreadsheetApp.create(CONFIG_SHEET_NAME);
  DriveApp.getFileById(ss.getId()).moveTo(folder);

  var usersSheet = ss.getActiveSheet();
  usersSheet.setName('Users');
  usersSheet.appendRow(['Email', 'Role', 'AllowedTabs', 'AllowedDepartments', 'AllowedTeams', 'DateAdded']);
  usersSheet.setFrozenRows(1);
  usersSheet.appendRow([Session.getActiveUser().getEmail().toLowerCase(), 'admin', 'all', 'all', 'all', new Date().toISOString()]);

  var settingsSheet = ss.insertSheet('Settings');
  settingsSheet.appendRow(['Key', 'Value']);
  settingsSheet.appendRow(['defaultRole', 'none']);

  return ss;
}

function getUserAccess(email) {
  var ss = getOrCreateConfigSheet();
  var sheet = ss.getSheetByName('Users');
  var data = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase() === email.toLowerCase()) {
      var tabs = String(data[i][2]);
      var depts = String(data[i][3]);
      var teams = String(data[i][4]);
      return {
        role: String(data[i][1]),
        allowedTabs: tabs === 'all' ? 'all' : tabs.split(',').map(function(t) { return t.trim(); }),
        allowedDepartments: depts === 'all' ? 'all' : depts.split(',').map(function(d) { return d.trim(); }),
        allowedTeams: teams === 'all' ? 'all' : teams.split(',').map(function(t) { return t.trim(); })
      };
    }
  }
  return null;
}

// #124 (Jerin, 15 Sep 2026): who may PUBLISH (access or metric config) is decided by the PUBLISHED access.json -
// the same list Send invite checks - not the old "Dashboard Access Config" sheet, which a newly published admin
// never reached. Only if access.json cannot be read at all does the old sheet decide, so a Drive hiccup can never
// lock every admin out.
function isPublishedAdmin_(email) {
  email = String(email || '').toLowerCase();
  var access = null;
  try { access = loadDriveJson_('access.json'); } catch (eA) { access = null; }
  if (access && access.users && access.users.length) {
    for (var i = 0; i < access.users.length; i++) {
      if (String(access.users[i].email || '').toLowerCase() === email) return access.users[i].role === 'admin';
    }
    return false;
  }
  var old = getUserAccess(email);
  return !!(old && old.role === 'admin');
}

function getDefaultAccess() {
  var ss = getOrCreateConfigSheet();
  var sheet = ss.getSheetByName('Settings');
  if (!sheet) return { defaultRole: 'none' };
  var data = sheet.getDataRange().getValues();
  var settings = {};
  for (var i = 1; i < data.length; i++) {
    settings[data[i][0]] = data[i][1];
  }
  return { defaultRole: settings.defaultRole || 'none' };
}

// ===== ADMIN API =====
function adminGetUsers() {
  var ss = getOrCreateConfigSheet();
  var sheet = ss.getSheetByName('Users');
  var data = sheet.getDataRange().getValues();
  var users = [];
  for (var i = 1; i < data.length; i++) {
    users.push({
      email: String(data[i][0]),
      role: String(data[i][1]),
      allowedTabs: String(data[i][2]),
      allowedDepartments: String(data[i][3]),
      allowedTeams: String(data[i][4]),
      dateAdded: String(data[i][5])
    });
  }
  return users;
}

function adminAddUser(email, role, allowedTabs, allowedDepartments, allowedTeams) {
  email = email.toLowerCase().trim();
  if (!email || email.indexOf('@') === -1) throw new Error('Invalid email.');
  if (VALID_ROLES.indexOf(role) === -1) throw new Error('Invalid role.');

  var ss = getOrCreateConfigSheet();
  var sheet = ss.getSheetByName('Users');
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase() === email) throw new Error('User already exists.');
  }

  sheet.appendRow([email, role, allowedTabs || 'all', allowedDepartments || 'all', allowedTeams || 'all', new Date().toISOString()]);
  return { success: true };
}

function adminUpdateUser(email, role, allowedTabs, allowedDepartments, allowedTeams) {
  email = email.toLowerCase().trim();
  var ss = getOrCreateConfigSheet();
  var sheet = ss.getSheetByName('Users');
  var data = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase() === email) {
      sheet.getRange(i + 1, 2).setValue(role);
      sheet.getRange(i + 1, 3).setValue(allowedTabs || 'all');
      sheet.getRange(i + 1, 4).setValue(allowedDepartments || 'all');
      sheet.getRange(i + 1, 5).setValue(allowedTeams || 'all');
      return { success: true };
    }
  }
  throw new Error('User not found.');
}

function adminDeleteUser(email) {
  email = email.toLowerCase().trim();
  var ss = getOrCreateConfigSheet();
  var sheet = ss.getSheetByName('Users');
  var data = sheet.getDataRange().getValues();

  var adminCount = 0;
  var targetRow = -1;
  var isTargetAdmin = false;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][1]) === 'admin') adminCount++;
    if (String(data[i][0]).toLowerCase() === email) {
      targetRow = i + 1;
      isTargetAdmin = String(data[i][1]) === 'admin';
    }
  }
  if (targetRow === -1) throw new Error('User not found.');
  if (isTargetAdmin && adminCount <= 1) throw new Error('Cannot delete the last admin.');

  sheet.deleteRow(targetRow);
  return { success: true };
}

function adminGetSettings() {
  return getDefaultAccess();
}

function adminUpdateSettings(defaultRole) {
  var ss = getOrCreateConfigSheet();
  var sheet = ss.getSheetByName('Settings');
  if (!sheet) {
    sheet = ss.insertSheet('Settings');
    sheet.appendRow(['Key', 'Value']);
    sheet.appendRow(['defaultRole', defaultRole]);
    return { success: true };
  }
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === 'defaultRole') {
      sheet.getRange(i + 1, 2).setValue(defaultRole);
      return { success: true };
    }
  }
  sheet.appendRow(['defaultRole', defaultRole]);
  return { success: true };
}

function adminGetCurrentUser() {
  return Session.getActiveUser().getEmail();
}

function adminGetAllTabs() { return ALL_TABS; }
function adminGetAllDepartments() { return ALL_DEPARTMENTS; }
function adminGetAllTeams() { return ALL_TEAMS; }
function adminGetValidRoles() { return VALID_ROLES; }

// POST entry: the Admin "Publish to team" button submits the gzipped config in the request BODY (no URL
// length limit) via a top-level form POST, which carries the admin's IK login. Route it to the same page fn.
function doPost(e) {
  var page = (e && e.parameter && e.parameter.page) || '';
  var userEmail = Session.getActiveUser().getEmail().toLowerCase();
  if (page === 'doPublish') return publishConfigPage_(e, userEmail);
  return HtmlService.createHtmlOutput('OK');
}

// ===== METRIC CONFIG PUBLISH (team-wide, admin-only; chunked-GET + Session auth) =====
// Opened by the Admin "Publish to team" button, which navigates a popup through a SEQUENCE of small GETs:
//   WEBAPP_URL?page=doPublish&sid=<id>&i=<idx>&n=<count>&c=<gzip+base64url chunk>[&base=<baseUpdatedAt> on last]
// A top-level GET carries the admin's IK login (a cross-site POST does NOT — SameSite blocks it), and small GET
// URLs dodge the URL-length limit that a whole-config GET hit. We buffer chunks in the script cache and, on the
// final chunk, reassemble + ungzip + write. isPublishedAdmin_(Session email) is the real gate (#124). The frontend confirms
// success by RE-READING data/metric_config.json (the popup never needs to message back). Writes Drive + GitHub.
function publishConfigPage_(e, userEmail) {
  var head = '<!DOCTYPE html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:-apple-system,system-ui,sans-serif;padding:36px 28px;text-align:center;color:#0f172a;line-height:1.5}h2{margin:0 0 8px}p{color:#475569;font-size:14px}</style>';
  var page = function (h) { return HtmlService.createHtmlOutput(head + h).setTitle('Publish Metric Config'); };
  if (!isPublishedAdmin_(userEmail)) return page('<h2 style="color:#be123c">Not authorized</h2><p>' + userEmail + ' is not an admin in the published access list. Ask an admin to publish.</p>');   // #124: the published access.json decides, not the old sheet
  try {
    var p = e.parameter || {};
    var sid = p.mcsid || '', c = p.mcdata || '';
    var i = parseInt(p.mcidx, 10), n = parseInt(p.mctot, 10);
    if (!sid || !c || isNaN(i) || isNaN(n) || n < 1) return page('<h2 style="color:#be123c">No config received</h2>');
    var cache = CacheService.getScriptCache();
    cache.put('mc_' + sid + '_' + i, c, 600);
    if (i < n - 1) return page('<h2 style="color:#1d4ed8">Receiving… ' + (i + 1) + '/' + n + '</h2><p>Keep this window open.</p>');
    var keys = []; for (var k = 0; k < n; k++) keys.push('mc_' + sid + '_' + k);
    var got = cache.getAll(keys);
    var full = '';
    for (var k2 = 0; k2 < n; k2++) { var v = got['mc_' + sid + '_' + k2]; if (v == null) return page('<h2 style="color:#a16207">Lost a part</h2><p>Part ' + (k2 + 1) + '/' + n + ' expired — close this and click Publish again.</p>'); full += v; }
    var bytes = Utilities.base64DecodeWebSafe(full);
    var json = Utilities.ungzip(Utilities.newBlob(bytes, 'application/x-gzip')).getDataAsString();
    var cfg = JSON.parse(json);
    var base = p.mcbase || '';
    if (base) { var cur = loadDriveJson_('metric_config.json'); if (cur && cur.updatedAt && cur.updatedAt !== base) return page('<h2 style="color:#a16207">Config changed meanwhile</h2><p>Someone published since you loaded' + (cur.updatedBy ? ' (' + cur.updatedBy + ')' : '') + '. Close this, reload the dashboard, and re-apply your edits.</p>'); }
    var doc = { schemaVersion: 1, updatedAt: new Date().toISOString(), updatedBy: userEmail, pods: cfg.pods || {}, capacity: cfg.capacity || {}, scoreGrid: cfg.scoreGrid || {}, deptFamily: cfg.deptFamily || {}, userType: cfg.userType || {}, recruiterDates: cfg.recruiterDates || {} };   // #11b: Agency|Freelancer per user
    saveDriveJson_('metric_config.json', doc);
    pushFileToGitHub_('data/metric_config.json', JSON.stringify(doc, null, 2), 'Update metric config by ' + userEmail);
    for (var k3 = 0; k3 < n; k3++) cache.remove('mc_' + sid + '_' + k3);
    return page('<h2 style="color:#0f766e">✓ Published</h2><p>Team config saved by ' + userEmail + '.<br>You can close this window — the dashboard will confirm in a moment.</p><script>setTimeout(function(){try{window.close()}catch(x){}},2500)</script>');
  } catch (err) {
    return page('<h2 style="color:#be123c">Publish failed</h2><p>' + String(err) + '</p><p>Close this and use the <b>Download</b> fallback in Admin.</p>');
  }
}


// ===== ACCESS CONFIG PUBLISH (team-wide, admin-only; chunked popup, Session auth) — writes data/access.json =====
function publishAccessPage_(e, userEmail) {
  var head = '<!DOCTYPE html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:-apple-system,system-ui,sans-serif;padding:36px 28px;text-align:center;color:#0f172a;line-height:1.5}h2{margin:0 0 8px}p{color:#475569;font-size:14px}</style>';
  var page = function (h) { return HtmlService.createHtmlOutput(head + h).setTitle('Publish Access'); };
  if (!isPublishedAdmin_(userEmail)) return page('<h2 style="color:#be123c">Not authorized</h2><p>' + userEmail + ' is not an admin in the published access list. Ask an admin to publish.</p>');   // #124: the published access.json decides, not the old sheet
  try {
    var sid = e.parameter.mcsid, idx = parseInt(e.parameter.mcidx, 10), tot = parseInt(e.parameter.mctot, 10), data = e.parameter.mcdata || '';
    var cache = CacheService.getScriptCache();
    cache.put('ac_' + sid + '_' + idx, data, 3600);
    if (idx < tot - 1) return page('<h2>Received ' + (idx + 1) + '/' + tot + '</h2>');
    var full = '';
    for (var i = 0; i < tot; i++) { var c = cache.get('ac_' + sid + '_' + i); if (c == null) return page('<h2 style="color:#a16207">Missing chunk ' + i + '</h2><p>Retry the publish.</p>'); full += c; }
    var bytes = Utilities.base64DecodeWebSafe(full);
    var json = Utilities.ungzip(Utilities.newBlob(bytes, 'application/x-gzip')).getDataAsString();
    var cfg = JSON.parse(json);
    var doc = { schemaVersion: 1, updatedAt: new Date().toISOString(), updatedBy: userEmail, defaultRole: cfg.defaultRole || 'none', users: cfg.users || [] };
    saveDriveJson_('access.json', doc);
    pushFileToGitHub_('data/access.json', JSON.stringify(doc, null, 2), 'Update access config by ' + userEmail);
    for (var j = 0; j < tot; j++) cache.remove('ac_' + sid + '_' + j);
    return page('<h2 style="color:#0f766e">Published</h2><p>Access saved by ' + userEmail + '. You can close this window.</p><script>setTimeout(function(){try{window.close()}catch(x){}},2500)<\/script>');
  } catch (err) {
    return page('<h2 style="color:#be123c">Publish failed</h2><p>' + String(err) + '</p><p>Close this and use the Download fallback in Admin.</p>');
  }
}

// ===== #118 SEND INVITE (Jerin, 14 Sep 2026) — admin-only; the email is written HERE from the PUBLISHED access =====
// The Admin page's Send invite button opens this route in a popup after the admin confirms. Nothing is ever sent
// automatically: one click, one person. The web app runs as the deployer, so the email leaves from that Gmail with the
// display name TA Team and replies go back there. Only someone already in the PUBLISHED access.json can be invited, with
// the access recorded there, so the route cannot be used to send arbitrary email. Each send is recorded in
// access_invites.json (Drive + GitHub) so the row can show when and by whom. Admin = admin in access.json (not the old sheet).
var INVITE_SITE_ = 'https://hiring.interviewkickstart.com';
var INVITE_TABS_ = [['hm-report', 'Hiring Manager'], ['recruiter', 'Recruiter Efficiency'], ['efficiency', 'Overall Efficiency']];
function inviteListAnd_(xs) { return xs.length <= 1 ? (xs[0] || '') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]; }
// The one line that differs per person (wording: Jerin, 14 Sep 2026).
function inviteAccessLine_(u) {
  if (u.role === 'admin') return 'You can see every tab, plus the Admin page.';
  if (u.role === 'full_access') return 'You can see every tab: Overview, Hiring Manager, Recruiter Efficiency and Overall Efficiency.';
  var labels = INVITE_TABS_.filter(function (t) { return (u.tabs || []).indexOf(t[0]) >= 0; }).map(function (t) { return t[1]; });
  if (!labels.length) return 'You can see the Overview tab.';
  var line = 'You can see ' + inviteListAnd_(['Overview'].concat(labels)) + ' tabs';
  var depts = u.departments || [];
  if (depts.length) line += '; the figures on ' + inviteListAnd_(labels) + (labels.length > 1 ? ' sections' : ' section') + ' cover ' + inviteListAnd_(depts);
  return line + '.';
}
function inviteEmailText_(u) {
  return ['Hi,', '',
    'You now have access to the IK Hiring Dashboard, where the TA team tracks hiring across Interview Kickstart.', '',
    'Open it here: ' + INVITE_SITE_,
    'Sign in with your Interview Kickstart Google account (' + u.email + ').', '',
    inviteAccessLine_(u), '',
    'Each table has a short "How these numbers are worked out" note that explains the figures.', '',
    'If anything looks wrong or you cannot get in, reply to this email.', '',
    'Thanks,', 'TA Team'].join('\n');
}
function sendInvitePage_(e, userEmail) {
  var head = '<!DOCTYPE html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:-apple-system,system-ui,sans-serif;padding:36px 28px;text-align:center;color:#0f172a;line-height:1.5}h2{margin:0 0 8px}p{color:#475569;font-size:14px}</style>';
  var page = function (h) { return HtmlService.createHtmlOutput(head + h).setTitle('Send Invite'); };
  var esc = function (x) { return String(x).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var access = null;
  try { access = loadDriveJson_('access.json'); } catch (eA) { return page('<h2 style="color:#be123c">Not sent</h2><p>Could not read the published access: ' + esc(eA) + '</p>'); }
  var users = (access && access.users) || [];
  var find = function (em) { em = String(em || '').toLowerCase(); for (var i = 0; i < users.length; i++) if (String(users[i].email || '').toLowerCase() === em) return users[i]; return null; };
  var me = find(userEmail);
  if (!me || me.role !== 'admin') return page('<h2 style="color:#be123c">Not authorized</h2><p>' + esc(userEmail) + ' is not an admin in the published access list.</p>');
  var to = String((e && e.parameter && e.parameter.to) || '').toLowerCase().replace(/^\s+|\s+$/g, '');
  var u = find(to);
  if (!u || !u.role || u.role === 'none') return page('<h2 style="color:#be123c">Not sent</h2><p>' + esc(to) + ' has no published access yet. Publish access first.</p>');
  if (!/@interviewkickstart\.com$/.test(to)) return page('<h2 style="color:#be123c">Not sent</h2><p>Invites go only to @interviewkickstart.com addresses.</p>');
  var inv = null;
  try { inv = loadDriveJson_('access_invites.json'); } catch (eI) { inv = null; }
  inv = inv || {}; inv.invites = inv.invites || {};
  var prev = inv.invites[to];
  if (prev && prev.at && (Date.now() - new Date(prev.at).getTime()) < 120000) return page('<h2>Already sent</h2><p>An invite went to ' + esc(to) + ' less than two minutes ago.</p>');
  try {
    MailApp.sendEmail({ to: u.email, subject: inviteEmailSubject_(), body: inviteEmailText_(u), htmlBody: inviteEmailHtml_(u), name: 'TA Team' });   // #118: designed email, plain text as the fallback
  } catch (eM) { return page('<h2 style="color:#be123c">Invite failed</h2><p>' + esc(eM) + '</p>'); }
  var rec = { at: new Date().toISOString(), by: userEmail, count: ((prev && prev.count) || 0) + 1 };
  inv.invites[to] = rec; inv.updatedAt = rec.at;
  try {
    saveDriveJson_('access_invites.json', inv);
    pushFileToGitHub_('data/access_invites.json', JSON.stringify(inv, null, 2), 'Invite sent to ' + to + ' by ' + userEmail);
  } catch (eR) { return page('<h2 style="color:#a16207">Invite sent — not recorded</h2><p>The email went to ' + esc(u.email) + ', but saving the record failed: ' + esc(eR) + '</p>'); }
  return page('<h2 style="color:#0f766e">Invite sent</h2><p>To ' + esc(u.email) + '. You can close this window.</p><script>setTimeout(function(){try{window.close()}catch(x){}},2500)<\/script>');
}

// #118 (Jerin, 14 Sep 2026): the invite as a designed HTML email. The plain-text inviteEmailText_ stays as the fallback body.
// Email-safe on purpose: tables, inline styles, no images (Gmail does not show the SVG logo), no scripts, no web fonts.
// It describes ONLY the access this person has — the same rule as the plain-text version.
var INVITE_TAB_BLURB_ = {
  'Overview': 'A company-wide snapshot of positions, applications, joiners and interviews.',
  'Hiring Manager': 'Open and filled positions, candidates in the final stages, the hiring pipeline by stage and the interview panel.',
  'Recruiter Efficiency': 'Each recruiter’s goals and results, screening, time spent at each stage and where joiners came from.',
  'Overall Efficiency': 'Team-wide fulfilment, throughput, time in process and sourcing.'
};
function inviteEmailSubject_() { return 'Your access to the IK Hiring Dashboard is ready'; }
function inviteEmailHtml_(u) {
  var esc = function (x) { return String(x).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  var full = u.role === 'full_access' || u.role === 'admin';
  var tabs = full ? ['Overview', 'Hiring Manager', 'Recruiter Efficiency', 'Overall Efficiency']
    : ['Overview'].concat(INVITE_TABS_.filter(function (t) { return (u.tabs || []).indexOf(t[0]) >= 0; }).map(function (t) { return t[1]; }));
  var depts = full ? [] : (u.departments || []);
  var scoped = tabs.slice(1);   // the tabs a restriction applies to (never Overview)
  var levelLabel = u.role === 'admin' ? 'Admin' : full ? 'Full access' : 'Hiring Manager view';
  var coverage = full ? 'Everything, across the whole company'
    : (depts.length ? inviteListAnd_(depts) : 'The whole company');
  var chip = function (t) { return '<span style="display:inline-block;margin:0 6px 6px 0;padding:4px 10px;border-radius:999px;background:#ffffff;border:1px solid #dbe1ec;font:600 12px/16px ' + FONT + ';color:#33507f">' + esc(t) + '</span>'; };
  var row = function (label, value) {
    return '<tr><td style="padding:10px 0;border-top:1px solid #dbe1ec;font:600 12px/18px ' + FONT + ';color:#6b7391;width:104px;padding-right:12px;vertical-align:top">' + label + '</td>'
      + '<td style="padding:10px 0;border-top:1px solid #dbe1ec;font:400 14px/20px ' + FONT + ';color:#0f172a;vertical-align:top">' + value + '</td></tr>';
  };
  var find = tabs.map(function (t) {
    return '<tr><td style="padding:0 0 12px 0;vertical-align:top;width:18px;font:700 14px/20px ' + FONT + ';color:#4E6BA6">&#8250;</td>'
      + '<td style="padding:0 0 12px 0;font:400 14px/21px ' + FONT + ';color:#334155"><strong style="color:#0f172a">' + esc(t) + '</strong> &mdash; '
      + esc(INVITE_TAB_BLURB_[t]) + (!full && t !== 'Overview' && depts.length ? ' Covers ' + esc(inviteListAnd_(depts)) + '.' : '') + '</td></tr>';
  }).join('');
  var notes = [
    'Every table has a <strong style="color:#0f172a">How these numbers are worked out</strong> note that explains the figures.',
    'The numbers refresh twice a day, around 6 AM and 6 PM IST.'
  ];
  if (!full && depts.length) notes.push('Your view is limited to ' + esc(inviteListAnd_(depts)) + '. The Overview page shows the whole company.');
  var noteRows = notes.map(function (n) {
    return '<tr><td style="padding:0 0 8px 0;vertical-align:top;width:18px;font:700 14px/20px ' + FONT + ';color:#6b7391">&bull;</td>'
      + '<td style="padding:0 0 8px 0;font:400 13px/20px ' + FONT + ';color:#334155">' + n + '</td></tr>';
  }).join('');
  var preheader = 'Sign in with your Interview Kickstart Google account to open the IK Hiring Dashboard.';
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>' + esc(inviteEmailSubject_()) + '</title></head>'
    + '<body style="margin:0;padding:0;background:#f4f6fb">'
    + '<div style="display:none;max-height:0;overflow:hidden;opacity:0">' + esc(preheader) + '</div>'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f6fb"><tr><td align="center" style="padding:32px 16px">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border:1px solid #dbe1ec;border-radius:12px;overflow:hidden">'
    // header band
    + '<tr><td style="background:#22344f;padding:22px 32px">'
    + '<div style="font:600 11px/14px ' + FONT + ';letter-spacing:1.5px;text-transform:uppercase;color:#a8bcd8">Interview Kickstart</div>'
    + '<div style="font:700 18px/24px ' + FONT + ';color:#ffffff;margin-top:4px">Hiring Dashboard</div>'
    + '</td></tr>'
    // title + intro + button
    + '<tr><td style="padding:32px 32px 8px 32px">'
    + '<h1 style="margin:0 0 14px 0;font:700 24px/31px ' + FONT + ';color:#0f172a">Your access is ready</h1>'
    + '<p style="margin:0 0 14px 0;font:400 15px/23px ' + FONT + ';color:#334155">Hi,</p>'
    + '<p style="margin:0 0 24px 0;font:400 15px/23px ' + FONT + ';color:#334155">The TA team has given you access to the <strong style="color:#0f172a">IK Hiring Dashboard</strong> &mdash; one place to follow hiring '
    + (full ? 'across Interview Kickstart' : 'for ' + esc(inviteListAnd_(depts.length ? depts : ['Interview Kickstart'])))
    + ': open positions, candidates in the final stages, the hiring pipeline and interview activity.</p>'
    + '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:8px;background:#4E6BA6">'
    + '<a href="' + INVITE_SITE_ + '" style="display:inline-block;padding:13px 26px;font:600 15px/20px ' + FONT + ';color:#ffffff;text-decoration:none;border-radius:8px">Open the Hiring Dashboard</a>'
    + '</td></tr></table>'
    + '<p style="margin:14px 0 0 0;font:400 13px/20px ' + FONT + ';color:#6b7391">Sign in with your Interview Kickstart Google account &mdash; <span style="color:#0f172a">' + esc(u.email) + '</span>. Other Google accounts will not work.</p>'
    + '</td></tr>'
    // access card
    + '<tr><td style="padding:24px 32px 8px 32px">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eaeef6;border-radius:10px"><tr><td style="padding:18px 20px 8px 20px">'
    + '<div style="font:700 12px/16px ' + FONT + ';letter-spacing:.6px;text-transform:uppercase;color:#33507f;margin-bottom:10px">Your access</div>'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">'
    + row('Access level', esc(levelLabel))
    + row('Tabs', tabs.map(chip).join('') + (u.role === 'admin' ? chip('Admin') : ''))
    + row('Figures cover', esc(coverage))
    + '</table></td></tr></table>'
    + '</td></tr>'
    // what you'll find
    + '<tr><td style="padding:24px 32px 4px 32px">'
    + '<div style="font:700 15px/20px ' + FONT + ';color:#0f172a;margin-bottom:12px">What you will find</div>'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' + find + '</table>'
    + '</td></tr>'
    // good to know
    + '<tr><td style="padding:12px 32px 8px 32px">'
    + '<div style="font:700 15px/20px ' + FONT + ';color:#0f172a;margin-bottom:10px">Good to know</div>'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' + noteRows + '</table>'
    + '</td></tr>'
    // sign-off
    + '<tr><td style="padding:16px 32px 30px 32px">'
    + '<p style="margin:0 0 18px 0;font:400 14px/22px ' + FONT + ';color:#334155">Questions, or trouble signing in? Just reply to this email.</p>'
    + '<p style="margin:0;font:400 14px/22px ' + FONT + ';color:#334155">Warm regards,<br><strong style="color:#0f172a">TA Team</strong><br><span style="color:#6b7391">Interview Kickstart</span></p>'
    + '</td></tr>'
    + '</table>'
    // footer
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px"><tr><td style="padding:16px 32px 0 32px;font:400 11px/17px ' + FONT + ';color:#6b7391;text-align:center">'
    + 'You are receiving this because a dashboard admin gave your Interview Kickstart account access. The dashboard is for internal use only.'
    + '</td></tr></table>'
    + '</td></tr></table></body></html>';
}

// ===== #150 JOB REMARKS (Jerin, 19 Sep 2026) — the note the team writes against a JOB =====
// Anyone on the published access list (any role but 'none') may write one; everyone with the tab reads it.
// Called as a TOP-LEVEL GET from a popup, because a cross-site fetch or POST reaches Apps Script with no Google
// login at all — the same reason the dashboard's Refresh button has been silently doing nothing (#144). The page
// then confirms by READING data/job_notes.json back, so a save is never reported that the server cannot show.
// 🚨 That file is pushed to a PUBLIC repo, so the guard the browser applies runs AGAIN here: a check that lives
// only in the browser protects nobody who edits the URL.
function publishNotePage_(e, userEmail) {
  var head = '<!DOCTYPE html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:-apple-system,system-ui,sans-serif;padding:36px 28px;text-align:center;color:#0f172a;line-height:1.5}h2{margin:0 0 8px}p{color:#475569;font-size:14px}</style>';
  var page = function (h) { return HtmlService.createHtmlOutput(head + h).setTitle('Save remark'); };
  var role = publishedRole_(userEmail);
  if (!role || role === 'none') return page('<h2 style="color:#be123c">Not authorized</h2><p>' + userEmail + ' is not on the published access list, so remarks cannot be saved from this account.</p>');
  try {
    var job8 = String(e.parameter.jnjob || '').toLowerCase().slice(0, 8);
    if (!/^[0-9a-f]{8}$/.test(job8)) return page('<h2 style="color:#be123c">Not saved</h2><p>That is not a job id.</p>');
    var text = '';
    if (e.parameter.jndata) text = Utilities.newBlob(Utilities.base64DecodeWebSafe(e.parameter.jndata)).getDataAsString().trim();
    if (text.length > 600) return page('<h2 style="color:#be123c">Not saved</h2><p>A remark is capped at 600 characters.</p>');
    if (/[\w.+-]+@[\w.-]+\.\w{2,}/.test(text) || /\b\d{7,}\b/.test(text)) return page('<h2 style="color:#be123c">Not saved</h2><p>This note is publicly readable, so an email address or a long number cannot go into it.</p>');
    var doc = null;
    try { doc = loadDriveJson_('job_notes.json'); } catch (eR) { doc = null; }
    if (!doc || typeof doc !== 'object' || !doc.notes) doc = { schema: 1, updatedAt: null, notes: {} };
    if (text) doc.notes[job8] = { text: text, by: userEmail, at: new Date().toISOString() };
    else delete doc.notes[job8];
    doc.updatedAt = new Date().toISOString();
    saveDriveJson_('job_notes.json', doc);
    pushFileToGitHub_('data/job_notes.json', JSON.stringify(doc, null, 2), 'Remark on job ' + job8 + ' by ' + userEmail);
    return page('<h2 style="color:#0f766e">Saved</h2><p>' + (text ? 'Remark saved' : 'Remark cleared') + ' by ' + userEmail + '. You can close this window.</p>');
  } catch (err) {
    return page('<h2 style="color:#be123c">Not saved</h2><p>' + String(err) + '</p>');
  }
}

// The published access.json decides, exactly as isPublishedAdmin_ does for a publish (#124) — but writing a remark
// needs only a place on the list, not the admin role (Jerin, 19 Sep: "anyone who can open the tab").
function publishedRole_(email) {
  email = String(email || '').toLowerCase();
  var access = null;
  try { access = loadDriveJson_('access.json'); } catch (eA) { access = null; }
  if (access && access.users && access.users.length) {
    for (var i = 0; i < access.users.length; i++) {
      if (String(access.users[i].email || '').toLowerCase() === email) return access.users[i].role || 'none';
    }
    return 'none';
  }
  var old = getUserAccess(email);
  return (old && old.role) || 'none';
}

// ===== #112 phase 1 (GO: Jerin, 16 Sep 2026) — Opening Requests, in its own window: /exec?page=requests =====
// The page served here is a thin shell. The screen itself is js/opening-requests.js on the LIVE SITE, imported as a
// module, so a change to the screen ships with a git push and needs no redeploy. Every read and write below runs
// through google.script.run inside the viewer's signed-in session.
// 🔒 PRIVATE: requests live in a Drive Sheet in the Ashby Hiring Dashboards folder (id in Script Properties,
//    OR_SHEET_ID), NEVER in the public GitHub repo.
// 👥 Who may use it: userType Recruitment Team or Admin in the PUBLISHED access.json — the same list the dashboard reads —
//    re-checked on EVERY call, not only when the page loads.
// 💬 Slack stays OFF until Jerin puts a bot token in Script Properties (SLACK_BOT_TOKEN). Claude never handles tokens.
//    Optional SLACK_IDS = {"email": "U0123..."} turns names into @mentions.
// Phase 2 (GO: Jerin, 21 Sep): orDecide — Jerin or Gopu approves, or sends back with a note. 112a (GO: Jerin, 21 Sep):
// orEditApprove — they change the request first, and each change is recorded. Phase 3 (Claude creates the opening in
// Ashby) is NOT here; it has its own go.
// 112d (Jerin, 22 Sep: "Inside the site"): people open it at https://hiring.interviewkickstart.com/requests, which shows this
// page inside the site, so the page allows being shown there (ALLOWALL, as AdminPage already does) and Slack links go there.
var OR_ASSETS = 'https://hiring.interviewkickstart.com';
var OR_FOLDER_ID = '1z6tU6QhZQ_50V7oyqlprwpl8kpS4LHmI';
var OR_SLACK_CHANNEL = 'C0B7Q5TG10R';   // #ta-core-team
var OR_APPROVERS = [['jerin@interviewkickstart.com', 'Jerin'], ['gopu.nair@interviewkickstart.com', 'Gopu']];
var OR_COLS = ['id', 'createdAt', 'status', 'requesterEmail', 'requesterName', 'jobId', 'jobTitle', 'department', 'count', 'recruiter',
  'roleType', 'employmentType', 'levelNow', 'levelSet', 'complexity', 'topic', 'openDate', 'replacementOf', 'sourcer', 'note',
  'name', 'pts', 'tier', 'quarter', 'freeOpening', 'answers', 'checks', 'transcript', 'slackTs', 'updatedAt',
  // 21 Sep (Jerin: "as per screenshot" of Ashby's Create Opening): added at the END, so rows already saved keep their places
  'team', 'location', 'description',
  // 21 Sep, phase 2: who decided, when, why, and the request a resubmission revises
  'decidedBy', 'decidedAt', 'decisionNote', 'revises',
  // 21 Sep, 112a: what an approver changed before approving, each change old ➔ new
  'edits'];
var OR_JSON = { answers: 1, checks: 1, transcript: 1, edits: 1 };
var OR_NUM = { count: 1, pts: 1 };
// 112a: what an approver may change, in the order a change list reads. Name and Points each follow from the fields above
// them (recruiter + topic, job + level + complexity), so they change on their own and are listed because they are what
// gets created. OR_EDIT_ALSO follows from the job and the open date: written with the rest, never listed.
var OR_EDIT = [['jobTitle', 'Job'], ['count', 'How many'], ['recruiter', 'Recruiter'], ['team', 'Team'], ['location', 'Location'],
  ['roleType', 'Role Type'], ['employmentType', 'Employment Type'], ['levelSet', 'Job Level'], ['complexity', 'Role Complexity'],
  ['topic', 'Topic'], ['openDate', 'Open date'], ['replacementOf', 'Replacement of'], ['sourcer', 'Sourcer'],
  ['description', 'Description'], ['name', 'Name'], ['pts', 'Points each']];
var OR_EDIT_ALSO = ['jobId', 'department', 'levelNow', 'tier', 'quarter'];

function orUser_() {
  var email = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  var access = null;
  try { access = loadDriveJson_('access.json'); } catch (e) { access = null; }
  var u = null;
  ((access && access.users) || []).forEach(function (x) { if (String(x.email || '').toLowerCase() === email) u = x; });
  var userType = (u && u.userType) || '';
  var approver = OR_APPROVERS.some(function (a) { return a[0] === email; });
  return { email: email, userType: approver && !userType ? 'Admin' : userType, isApprover: approver,
           allowed: !!email && (userType === 'Recruitment Team' || userType === 'Admin' || approver) };
}

function requestsPage_(e) {
  var me = orUser_();
  var h = function (s) { return String(s || '').replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  if (!me.allowed) {
    return HtmlService.createHtmlOutput('<div style="font-family:system-ui,sans-serif;padding:3rem 1.5rem;text-align:center">'
      + '<h2 style="color:#22344f">Opening Requests</h2><p style="color:#6b7391">' + h(me.email || 'This account')
      + ' is not on the Recruitment Team list, so it cannot raise opening requests. Ask Jerin or Gopu.</p></div>').setTitle('Opening Requests')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  var v = new Date().getTime();
  var open = String((e && e.parameter && e.parameter.id) || '').replace(/[^A-Za-z0-9-]/g, '');
  var html = '<link rel="stylesheet" href="' + OR_ASSETS + '/css/opening-requests.css?v=' + v + '">'
    + '<div id="or-root"><div class="or-loading">Loading your requests…</div></div>'
    + '<script type="module">'
    + 'import { mountOpeningRequests } from "' + OR_ASSETS + '/js/opening-requests.js?v=' + v + '";'
    + 'const call = (fn, ...a) => new Promise((ok, bad) => google.script.run.withSuccessHandler(ok).withFailureHandler(bad)[fn](...a));'
    + 'mountOpeningRequests(document.getElementById("or-root"), { call, openId: ' + JSON.stringify(open) + ' });'
    + '</script>';
  return HtmlService.createHtmlOutput(html).setTitle('Opening Requests').addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// Everything the window needs to start: who is asking, who can own an opening, the Ashby field options, and the requests
// this person may see (their own; Jerin and Gopu see everyone's).
function orBoot() {
  var me = orUser_();
  if (!me.allowed) return { ok: false, message: 'This window is for the Recruitment Team, Jerin and Gopu.' };
  var users = orAshbyUsers_();
  var access = null;
  try { access = loadDriveJson_('access.json'); } catch (e) { access = null; }
  var team = {};
  ((access && access.users) || []).forEach(function (x) {
    if (x.userType === 'Recruitment Team' || x.userType === 'Admin') team[String(x.email || '').toLowerCase()] = 1;
  });
  var mine = null;
  users.forEach(function (u) { if (u.email === me.email) mine = u; });
  var all = orReadAll_();
  var visible = me.isApprover ? all : all.filter(function (r) { return r.requesterEmail === me.email; });
  visible.sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
  return {
    ok: true,
    me: { email: me.email, name: mine ? mine.name : me.email, userType: me.userType, isApprover: me.isApprover },
    recruiters: users.filter(function (u) { return team[u.email]; }),
    people: users,                 // a sourcer can be any active Ashby user
    meta: orMeta_(),               // Ashby's teams and locations, and each Open job's own team and locations
    requests: visible,
    options: orOptions_(),
    slackOn: !!PropertiesService.getScriptProperties().getProperty('SLACK_BOT_TOKEN')
  };
}

// What the server insists on before a request is saved, and before an approver's edit is kept (112a). The window checks
// far more, for the person filling it in; these are the ones that must never be skipped. '' means fine.
function orValidate_(p) {
  var need = ['jobId', 'jobTitle', 'recruiter', 'team', 'location', 'roleType', 'employmentType', 'complexity', 'topic', 'openDate'];
  var miss = need.filter(function (k) { return !String(p[k] || '').trim(); });
  var count = parseInt(p.count, 10);
  if (!(count >= 1 && count <= 25)) miss.push('how many');
  if (p.roleType === 'Replacement' && !String(p.replacementOf || '').trim()) miss.push('replacement of');
  if (miss.length) return 'missing ' + miss.join(', ');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(p.openDate)) || String(p.openDate) < '2026-07-01') return 'the open date must be on or after 1 Jul 2026';
  if (!orAshbyUsers_().some(function (u) { return u.name === p.recruiter; })) return p.recruiter + ' is not an active Ashby user';
  return '';
}

// The server re-checks what matters before anything is saved. The window's checks are for the person filling it in.
function orSubmit(p) {
  var me = orUser_();
  if (!me.allowed) return { ok: false, message: 'This account is not on the Recruitment Team list.' };
  p = p || {};
  var bad = orValidate_(p);
  if (bad) return { ok: false, message: bad };
  var count = parseInt(p.count, 10), mine = null;
  orAshbyUsers_().forEach(function (u) { if (u.email === me.email) mine = u; });

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = orSheet_(), last = sh.getLastRow(), n = 0;
    if (last > 1) sh.getRange(2, 1, last - 1, 1).getValues().forEach(function (r) { var m = /^OR-(\d+)$/.exec(String(r[0])); if (m) n = Math.max(n, +m[1]); });
    var now = new Date().toISOString();
    var rq = {};
    OR_COLS.forEach(function (k) { rq[k] = (p[k] == null) ? '' : p[k]; });
    rq.id = 'OR-' + ('00' + (n + 1)).slice(-3);
    rq.createdAt = now; rq.updatedAt = now; rq.status = 'For approval';
    rq.requesterEmail = me.email; rq.requesterName = mine ? mine.name : me.email;
    rq.count = count; rq.pts = Number(p.pts) || 0;
    rq.checks = Array.isArray(p.checks) ? p.checks.slice(0, 40).map(function (x) { return String(x).slice(0, 300); }) : [];
    rq.answers = (p.answers && typeof p.answers === 'object') ? p.answers : {};
    rq.revises = /^OR-\d+$/.test(String(p.revises || '')) ? String(p.revises) : '';
    rq.decidedBy = ''; rq.decidedAt = ''; rq.decisionNote = ''; rq.edits = [];
    var tr = (Array.isArray(p.transcript) ? p.transcript : []).slice(0, 60).map(function (m) {
      return { who: m && m.who === 'me' ? 'me' : 'claude', at: String((m && m.at) || now), text: String((m && m.text) || '').slice(0, 1000) };
    });
    var slackOn = !!PropertiesService.getScriptProperties().getProperty('SLACK_BOT_TOKEN');
    tr.push({ who: 'claude', at: now, text: 'Sent to Jerin and Gopu for approval. '
      + (slackOn ? 'They have been tagged in the Slack thread.' : 'Slack is off for now, so they will see it here.') });
    rq.transcript = tr;
    rq.slackTs = slackOn ? orSlackNew_(rq) : '';
    var row = OR_COLS.map(function (k) { return OR_JSON[k] ? JSON.stringify(rq[k]) : String(rq[k] == null ? '' : rq[k]); });
    // Written as TEXT: a Sheet turns "2026-09-21" into a date at midnight, which is the date trap #1 in CLAUDE.md.
    sh.getRange(sh.getLastRow() + 1, 1, 1, OR_COLS.length).setNumberFormat('@').setValues([row]);
    SpreadsheetApp.flush();
    return { ok: true, request: rq };
  } finally {
    lock.releaseLock();
  }
}

// The private Sheet. Created ONCE in the dashboard's Drive folder; its id is kept in Script Properties. If the id is set
// but the Sheet cannot be opened, this STOPS rather than quietly starting a second, empty Sheet.
function orSheet_() {
  var props = PropertiesService.getScriptProperties(), id = props.getProperty('OR_SHEET_ID');
  if (id) return orEnsureHead_(SpreadsheetApp.openById(id).getSheets()[0]);
  var ss = SpreadsheetApp.create('Opening Requests (#112) - private');
  DriveApp.getFileById(ss.getId()).moveTo(DriveApp.getFolderById(OR_FOLDER_ID));
  var sh = ss.getSheets()[0];
  sh.setName('Requests');
  sh.getRange(1, 1, 1, OR_COLS.length).setNumberFormat('@').setValues([OR_COLS]).setFontWeight('bold');
  sh.setFrozenRows(1);
  props.setProperty('OR_SHEET_ID', ss.getId());
  Logger.log('#112: created the requests Sheet ' + ss.getUrl());
  return sh;
}

// New columns are only ever ADDED at the end of OR_COLS. If the saved header is not a leading part of OR_COLS the columns
// would no longer line up with the rows, so this stops instead of writing.
function orEnsureHead_(sh) {
  var have = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].map(String).filter(String);
  for (var i = 0; i < have.length; i++) if (have[i] !== OR_COLS[i]) throw new Error('#112: the requests Sheet header does not match (' + have[i] + ')');
  if (have.length < OR_COLS.length) sh.getRange(1, 1, 1, OR_COLS.length).setNumberFormat('@').setValues([OR_COLS]).setFontWeight('bold');
  return sh;
}

function orRowObj_(head, r) {
  var o = {};
  head.forEach(function (k, i) {
    var x = r[i];
    if (OR_JSON[k]) { try { x = JSON.parse(x || (k === 'answers' ? '{}' : '[]')); } catch (e) { x = k === 'answers' ? {} : []; } }
    else if (OR_NUM[k]) x = Number(x) || 0;
    else x = String(x == null ? '' : x);
    o[k] = x;
  });
  return o;
}

function orReadAll_() {
  var v = orSheet_().getDataRange().getValues();
  if (v.length < 2) return [];
  var head = v[0].map(String);
  return v.slice(1).filter(function (r) { return r[0]; }).map(function (r) { return orRowObj_(head, r); });
}

// Phase 2: Jerin or Gopu decides. Only a request still "For approval" can be decided, checked under the lock, so two
// approvers pressing at once cannot both decide it. A send-back must say why.
function orDecide(id, decision, note) { return orDecide_(id, decision, note, null); }

// 112a (Jerin, 21 Sep: "1 option needed would be for approval to edit & approve"): the approver changes the request in
// the same draft form and approves it in one step. The edit is re-checked as a new request is, each change is recorded
// old ➔ new in the thread (and Slack), and the row keeps the approved values. An edit that changes nothing is a plain
// approval.
function orEditApprove(id, p, note) { return orDecide_(id, 'approve', note, p || {}); }

function orDecide_(id, decision, note, edit) {
  var me = orUser_();
  if (!me.allowed || !me.isApprover) return { ok: false, message: 'only Jerin or Gopu can approve or send back' };
  decision = String(decision || ''); note = String(note || '').trim().slice(0, 600);
  if (decision !== 'approve' && decision !== 'sendback') return { ok: false, message: 'unknown decision' };
  if (decision === 'sendback' && !note) return { ok: false, message: 'say what should change' };
  var bad = edit ? orValidate_(edit) : '';
  if (bad) return { ok: false, message: bad };
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = orSheet_(), v = sh.getDataRange().getValues(), head = v[0].map(String), col = {};
    head.forEach(function (k, i) { col[k] = i; });
    var r = -1;
    for (var i = 1; i < v.length; i++) if (String(v[i][col.id]) === String(id)) { r = i; break; }
    if (r < 0) return { ok: false, message: id + ' was not found' };
    var status = String(v[r][col.status]);
    if (status !== 'For approval') return { ok: false, message: id + ' is already ' + status + (v[r][col.decidedBy] ? ' (by ' + v[r][col.decidedBy] + ')' : '') };
    var mine = null;
    orAshbyUsers_().forEach(function (u) { if (u.email === me.email) mine = u; });
    var who = mine ? mine.name : me.email, now = new Date().toISOString();
    // 112a: the edit against what was submitted, field by field. Only what differs is written or listed.
    var old = orRowObj_(head, v[r]), set = {}, edits = [];
    if (edit) {
      OR_EDIT.map(function (f) { return f[0]; }).concat(OR_EDIT_ALSO).forEach(function (k) {
        var nv = OR_NUM[k] ? String(k === 'count' ? parseInt(edit[k], 10) : (Number(edit[k]) || 0)) : String(edit[k] == null ? '' : edit[k]).trim();
        if (nv !== String(old[k])) set[k] = nv;
      });
      OR_EDIT.forEach(function (f) { if (set[f[0]] != null) edits.push({ field: f[1], from: String(old[f[0]]), to: set[f[0]] }); });
      if (edits.length) {
        set.edits = JSON.stringify(edits);
        if (Array.isArray(edit.checks)) set.checks = JSON.stringify(edit.checks.slice(0, 40).map(function (x) { return String(x).slice(0, 300); }));
      }
    }
    var list = edits.map(function (x) { return x.field + ' ' + (x.from || '(blank)') + ' ➔ ' + (x.to || '(blank)'); }).join('; ');
    var tr = [];
    try { tr = JSON.parse(v[r][col.transcript] || '[]'); } catch (e) { tr = []; }
    var said = { who: 'approver', name: who, at: now, text: decision !== 'approve' ? 'Sent back: ' + note
      : (edits.length ? 'Edited and approved. ' + list + '.' : 'Approved.') + (note ? ' ' + note : '') };
    if (edits.length) { said.edits = edits; said.note = note; }
    tr.push(said);
    tr.push({ who: 'claude', at: now, text: decision === 'approve'
      ? 'Approved by ' + who + (edits.length ? ' with ' + edits.length + ' change' + (edits.length === 1 ? '' : 's') + ', listed above' : '')
        + '. Claude creates the opening in Ashby in its next working session and marks it Created here.'
      : 'Sent back by ' + who + '. Revise the draft and submit it again with "Revise and resubmit".' });
    set.status = decision === 'approve' ? 'Approved' : 'Sent back';
    set.decidedBy = who; set.decidedAt = now; set.decisionNote = note; set.updatedAt = now; set.transcript = JSON.stringify(tr);
    Object.keys(set).forEach(function (k) { if (col[k] != null) sh.getRange(r + 1, col[k] + 1).setNumberFormat('@').setValue(set[k]); });
    SpreadsheetApp.flush();
    var rq = orRowObj_(head, sh.getRange(r + 1, 1, 1, head.length).getValues()[0]);
    if (rq.slackTs) orSlackPost_((decision === 'approve' ? (edits.length ? 'Edited and approved by ' : 'Approved by ') : 'Sent back by ') + orSlackEsc_(who)
      + (edits.length ? ': ' + orSlackEsc_(list) + (note ? ' · ' + orSlackEsc_(note) : '') : (note ? ': ' + orSlackEsc_(note) : ''))
      + ' · ' + orSlackAt_(rq.requesterEmail, rq.requesterName), rq.slackTs);
    return { ok: true, request: rq };
  } finally {
    lock.releaseLock();
  }
}

// Active Ashby users with their full Ashby name — the name that goes into the opening name. Cached for six hours.
function orAshbyUsers_() {
  var c = CacheService.getScriptCache(), k = 'or_users_v1', hit = c.get(k);
  if (hit) return JSON.parse(hit);
  var out = [];
  ashbyListAll_('/user.list').forEach(function (u) {
    if (u.isEnabled === false || !u.email) return;
    var name = ((u.firstName || '') + ' ' + (u.lastName || '')).trim();
    if (name) out.push({ name: name, email: String(u.email).toLowerCase() });
  });
  out.sort(function (a, b) { return a.name.localeCompare(b.name); });
  try { c.put(k, JSON.stringify(out), 21600); } catch (e) { /* too big to cache: fine, just slower */ }
  return out;
}

// The option lists of the three Opening fields the form sets, read from Ashby so the form offers exactly what Ashby
// accepts. Cached for six hours. Empty lists fall back to the window's built-in ones.
function orOptions_() {
  var c = CacheService.getScriptCache(), k = 'or_opts_v1', hit = c.get(k);
  if (hit) return JSON.parse(hit);
  var out = { roleType: [], employmentType: [], complexity: [] };
  try {
    ashbyListAll_('/customField.list').forEach(function (f) {
      if (f.isArchived || String(f.objectType || '').toLowerCase() !== 'opening') return;
      var t = String(f.title || '');
      var key = /^role type/i.test(t) ? 'roleType' : (/^employment type/i.test(t) ? 'employmentType' : (/role complexity/i.test(t) ? 'complexity' : null));
      if (!key) return;
      out[key] = (f.selectableValues || f.options || []).filter(function (x) { return !x.isArchived; })
        .map(function (x) { return String(x.label || x.value || ''); }).filter(String);
    });
  } catch (e) { Logger.log('#112 orOptions_: ' + e.message); }
  try { c.put(k, JSON.stringify(out), 21600); } catch (e) { /* ignore */ }
  return out;
}

// Ashby's teams and locations (both required on an opening), and each Open job's own team and locations so the form can
// start from them. Cached for six hours.
function orMeta_() {
  var c = CacheService.getScriptCache(), k = 'or_meta_v1', hit = c.get(k);
  if (hit) return JSON.parse(hit);
  var out = { teams: [], locations: [], jobs: {} };
  try {
    var dept = {}, locs = {};
    ashbyListAll_('/department.list').forEach(function (d) { if (!d.isArchived && d.name) dept[d.id] = d.name; });
    ashbyListAll_('/location.list').forEach(function (l) { if (!l.isArchived && l.name) locs[l.id] = l.name; });
    var uniq = function (xs) { var s = {}; return xs.filter(function (x) { return x && !s[x] && (s[x] = 1); }); };
    out.teams = uniq(Object.keys(dept).map(function (id) { return dept[id]; })).sort();
    out.locations = uniq(Object.keys(locs).map(function (id) { return locs[id]; })).sort();
    ashbyListAll_('/job.list').forEach(function (j) {
      if (j.status !== 'Open') return;
      var ids = [].concat(j.locationId || [], j.locationIds || [], j.secondaryLocationIds || []);
      out.jobs[String(j.id).slice(0, 8)] = { team: dept[j.departmentId] || '',
        locations: uniq(ids.map(function (id) { return locs[id]; })) };
    });
  } catch (e) { Logger.log('#112 orMeta_: ' + e.message); }
  try { c.put(k, JSON.stringify(out), 21600); } catch (e) { /* ignore */ }
  return out;
}

// ---- Slack: one thread per request. Runs ONLY when SLACK_BOT_TOKEN is set. ----
function orSlackEsc_(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function orSlackAt_(email, name) {
  var ids = {};
  try { ids = JSON.parse(PropertiesService.getScriptProperties().getProperty('SLACK_IDS') || '{}'); } catch (e) { ids = {}; }
  var id = ids[String(email || '').toLowerCase()];
  return id ? '<@' + id + '>' : orSlackEsc_(name);
}
function orSlackNew_(rq) {
  try {
    var at = orSlackAt_;
    var url = OR_ASSETS + '/requests?id=' + rq.id;   // 112d: the neat address; it opens the window inside the site
    var ts = orSlackPost_(rq.id + ' · *' + rq.count + ' × ' + orSlackEsc_(rq.jobTitle) + '* · started by ' + at(rq.requesterEmail, rq.requesterName)
      + ' · <' + url + '|Open the request>', '');
    if (!ts) return '';
    if (rq.freeOpening) orSlackPost_('Opening already on the job: ' + orSlackEsc_(rq.freeOpening), ts);
    orSlackPost_('For approval ' + OR_APPROVERS.map(function (a) { return at(a[0], a[1]); }).join(' ') + ' · cc ' + at(rq.requesterEmail, rq.requesterName)
      + ' · `' + orSlackEsc_(rq.name) + '`' + (rq.count > 1 ? ' × ' + rq.count : '') + ' · ' + orSlackEsc_([rq.team, rq.location, rq.roleType, rq.employmentType, rq.complexity].filter(String).join(' · '))
      + (rq.levelSet && rq.levelSet !== rq.levelNow ? ' · job Level ' + orSlackEsc_(rq.levelNow) + ' → ' + orSlackEsc_(rq.levelSet) : ''), ts);
    return ts;
  } catch (e) { Logger.log('#112 Slack failed: ' + e.message); return ''; }
}
function orSlackPost_(text, threadTs) {
  var token = PropertiesService.getScriptProperties().getProperty('SLACK_BOT_TOKEN');
  if (!token) return '';
  var body = { channel: OR_SLACK_CHANNEL, text: text, unfurl_links: false };
  if (threadTs) body.thread_ts = threadTs;
  var res = UrlFetchApp.fetch('https://slack.com/api/chat.postMessage', { method: 'post', contentType: 'application/json; charset=utf-8',
    headers: { Authorization: 'Bearer ' + token }, payload: JSON.stringify(body), muteHttpExceptions: true });
  var j = {};
  try { j = JSON.parse(res.getContentText() || '{}'); } catch (e) { j = {}; }
  if (!j.ok) { Logger.log('#112 Slack refused: ' + (j.error || res.getResponseCode())); return ''; }
  return j.ts || '';
}
