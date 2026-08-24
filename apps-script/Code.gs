// TEMPORARY runner (2026-08-24). The Apps Script run selector picks the FIRST function of the OPEN file and
// the file tree was unreachable, so this sits at the top of Code.gs purely to be runnable. DELETE when done.
function zzRunNow() {
  resetAndRefreshNow();   // clears stale triggers, restores the 6AM/6PM pair, fires one refresh immediately
}

// ===== CONFIG =====
var DASHBOARD_FOLDER_ID = '1z6tU6QhZQ_50V7oyqlprwpl8kpS4LHmI';
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
// final chunk, reassemble + ungzip + write. getUserAccess(Session email) is the real gate. The frontend confirms
// success by RE-READING data/metric_config.json (the popup never needs to message back). Writes Drive + GitHub.
function publishConfigPage_(e, userEmail) {
  var head = '<!DOCTYPE html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:-apple-system,system-ui,sans-serif;padding:36px 28px;text-align:center;color:#0f172a;line-height:1.5}h2{margin:0 0 8px}p{color:#475569;font-size:14px}</style>';
  var page = function (h) { return HtmlService.createHtmlOutput(head + h).setTitle('Publish Metric Config'); };
  var access = getUserAccess(userEmail);
  if (!access || access.role !== 'admin') return page('<h2 style="color:#be123c">Not authorized</h2><p>' + userEmail + ' is not an admin. Ask an admin to publish.</p>');
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
    var doc = { schemaVersion: 1, updatedAt: new Date().toISOString(), updatedBy: userEmail, pods: cfg.pods || {}, capacity: cfg.capacity || {}, scoreGrid: cfg.scoreGrid || {}, deptFamily: cfg.deptFamily || {} };
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
  var access = getUserAccess(userEmail);
  if (!access || access.role !== 'admin') return page('<h2 style="color:#be123c">Not authorized</h2><p>' + userEmail + ' is not an admin. Ask an admin to publish.</p>');
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