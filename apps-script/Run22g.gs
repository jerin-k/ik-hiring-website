// ===== 22g - build the 'Openings to be created/checked' worklist tab =====
// NO WRITES TO ASHBY. Read-only against Ashby; writes one tab in the Audit sheet.
// Jerin, 6 Sep 2026: do not create the openings - hand the list to the team (Gopu).
var G22_AUDIT_ID = '1U6Wi5uXLZ8hOhGKP2tyH--jHcEbUEvXgAPxbkUofTNA';
var G22_TAB2 = 'Openings to be created-checked';

var G22_PLAN = [
  { job: 'Program Advisor', tracker: 'Program Advisor - US', cx: 'Normal', rt: 'Anticipation Of Exit', date: '2026-09-01',
    recs: ['Alokita Dhumne','Leenita Joseph Albert','Leenita Joseph Albert','Leenita Joseph Albert','Leenita Joseph Albert','Mahima Agarwal','Mahima Agarwal','Praveetha A','Praveetha A','Praveetha A','Rijo John','Rijo John','Rijo John'] },
  { job: 'Part Time Instructor - Advanced Gen AI (US)', tracker: 'Technical Mentor - Agentic AI', cx: 'Uber Complex', rt: 'New', date: '2026-08-13',
    recs: ['Ritika Bhasin','Aditya Singh'] },
  { job: 'Intern - Software Development Engineer', tracker: 'Intern - Software Development Engineer (Backend)', cx: 'Normal', rt: 'New', date: '2026-08-28',
    recs: ['Deepti Leslie','Deepti Leslie'] },
  { job: 'Manager - Corporate Partnerships (US)', tracker: 'Manager, Corporate Partnerships', cx: 'Normal', rt: 'Replacement', date: '2026-09-02',
    recs: ['Rijo John','Deepti Leslie'] },
  { job: 'SME India : Systems Design Instructor', tracker: 'SME India - System Design Instructor', cx: 'Complex', rt: '', date: '2026-07-08',
    recs: ['Oshin Verma'] },
  { job: 'Part Time Instructor - Embedded Engineering (US)', tracker: 'Technical Mentor - Embedded System', cx: 'Uber Complex', rt: 'New', date: '2026-07-09',
    recs: ['Ritika Bhasin'] },
  { job: 'Assistant Manager - Customer Success', tracker: 'Assistant Manager, Customer Success', cx: 'Normal', rt: 'New', date: '2026-08-14',
    recs: ['Tina Anisha Bibeiro'] }
];

function run22g() { buildAuditV8(); }   // #51: V7 funnel, Q3 2026. probeJobFieldWrite() is #53, unrun.

function g22_buildTab() {
  var jobs = ashbyListAll_('/job.list');
  var jobBy = {};
  jobs.forEach(function (j) { jobBy[String(j.title || '').trim().toLowerCase()] = j; });
  var users = ashbyListAll_('/user.list');
  function uid(name) {
    var exact = users.filter(function (u) {
      var nm = (((u.firstName || '') + ' ' + (u.lastName || '')).trim() || u.name || '');
      return nm.toLowerCase() === name.toLowerCase();
    });
    if (exact.length === 1) return exact[0].id;
    var part = users.filter(function (u) {
      var nm = (((u.firstName || '') + ' ' + (u.lastName || '')).trim() || u.name || '');
      return nm.toLowerCase().indexOf(name.toLowerCase()) > -1;
    });
    return part.length === 1 ? part[0].id : (part.length ? 'AMBIGUOUS(' + part.length + ')' : 'NOT FOUND');
  }
  var all = ashbyListAll_('/opening.list');
  function openCount(jid) {
    var n = 0;
    all.forEach(function (o) {
      var lv = o.latestVersion || {};
      var ids = lv.jobIds || o.jobIds || [];
      if (ids.indexOf(jid) < 0 || o.isArchived) return;
      if (String(o.openingState || '') === 'Open') n++;
    });
    return n;
  }

  var rows = [];
  rows.push(['#','Ashby Job','Ashby Job Status','Ashby Job ID','Tracker Job','Role Complexity (Opening)','Role Type','Recruiter (native opening Role)','Recruiter Ashby User ID','Tracker Opening Date','Opening Date to set','Action needed','Notes']);
  var n = 0;
  G22_PLAN.forEach(function (p) {
    var j = jobBy[p.job.toLowerCase()];
    var status = j ? (j.status || '') : 'JOB NOT FOUND';
    var jid = j ? j.id : '';
    var already = jid ? openCount(jid) : 0;
    var closed = /closed|archived/i.test(status);
    var action = closed
      ? 'CHECK FIRST - Ashby job is ' + status + '. Reopen the job, or confirm the tracker row is still genuinely open, BEFORE creating.'
      : 'Create opening on this job.';
    var note = 'Free Open openings already on this job: ' + already + '.';
    if (p.job.indexOf('Systems Design') > -1) note += ' Tracker has 2 open positions but 1 Open opening already exists, so only 1 is listed here.';
    if (!p.rt) note += ' Tracker had no Role Type for this row - confirm with the team.';
    p.recs.forEach(function (r) {
      n++;
      rows.push([n, p.job, status, jid, p.tracker, p.cx, p.rt || '(none - confirm)', r, uid(r), p.date,
        'Auto - Ashby stamps today when the opening is set to Open. Any date in Q3 2026 gives the same quarter.',
        action, note]);
    });
  });
  rows.push([]);
  rows.push(['NOTES']);
  rows.push(['Built ' + new Date().toISOString().substring(0,10) + ' by Claude. Source of truth = Hiring Tracker Master, Open + Job Creation Quarter Q3 2026.']);
  rows.push(['1. Opening Date: opening.create IGNORES openedAt and stamps today. Today is in Q3 2026, so the default is correct. The date is editable ONLY in the UI via Job > Openings.']);
  rows.push(['2. Recruiter must be set as the NATIVE opening Role (hiring team Recruiter), NOT the old "Recruiter (Opening Owner)" custom field, which is archived.']);
  rows.push(['3. Role Complexity (Opening) field id 068739cd-... allowed: Normal / Complex / Uber Complex.']);
  rows.push(['4. Role Type field id c6fdde4f-... allowed: Anticipation Of Exit / As per AOP / Buffer / New / Replacement.']);
  rows.push(['5. 19 of these 22 sit on a Closed or Archived Ashby job - that is the main thing to resolve before creating anything.']);
  rows.push(['6. Program Advisor = 13 (not 15). The 22g shortfall tab over-counted by 2 because it resolves some tracker rows to a job by candidate email.']);
  rows.push(['7. Two tracker jobs were dropped from scope by Jerin as fuzzy matches: Manager, Sales and Assistant Manager, Sales Operations.']);

  var ss = SpreadsheetApp.openById(G22_AUDIT_ID);
  var sh = ss.getSheetByName(G22_TAB2);
  if (!sh) sh = ss.insertSheet(G22_TAB2); else sh.clear();
  var w = 13;
  var norm = rows.map(function (r) {
    var x = r.slice(0, w);
    while (x.length < w) x.push('');
    return x.map(function (v) { return (v === null || v === undefined) ? '' : v; });
  });
  sh.getRange(1, 1, norm.length, w).setValues(norm);
  sh.getRange(1, 1, 1, w).setFontWeight('bold');
  sh.setFrozenRows(1);
  SpreadsheetApp.flush();
  Logger.log('22g tab rows: ' + norm.length + ' openings: ' + n);
}
// READ-ONLY inventory of every tab in the Audit sheet, so residue can be identified before deleting.
function g22_inventory() {
  var LOG = '22g Run Log';
  var ss = SpreadsheetApp.openById(G22_AUDIT_ID);
  var shs = ss.getSheets();
  var rows = [['idx','tab name','rows with data','cols','hidden','header row (first 6 cells)']];
  shs.forEach(function (s, i) {
    var lr = 0, lc = 0, hdr = '';
    try { lr = s.getLastRow(); lc = s.getLastColumn(); } catch (e) {}
    if (lr > 0 && lc > 0) {
      try {
        hdr = s.getRange(1, 1, 1, Math.min(lc, 6)).getValues()[0]
          .map(function (x) { return String(x).substring(0, 30); }).join(' | ');
      } catch (e) { hdr = '?'; }
    }
    rows.push([i + 1, s.getName(), lr, lc, s.isSheetHidden() ? 'HIDDEN' : '', hdr]);
  });
  var sh = ss.getSheetByName(LOG);
  if (!sh) sh = ss.insertSheet(LOG); else sh.clear();
  var w = 6;
  var norm = rows.map(function (r) {
    var x = r.slice(0, w);
    while (x.length < w) x.push('');
    return x.map(function (q) { return (q === null || q === undefined) ? '' : q; });
  });
  sh.getRange(1, 1, norm.length, w).setValues(norm);
  SpreadsheetApp.flush();
  Logger.log('inventory tabs: ' + shs.length);
}
// READ-ONLY probe: what does opening.list return, and does it carry custom fields / hiring team?
function v4_probe() {
  var LOG='V4 Probe';
  var out=[['section','a','b','c','d']];
  var all=ashbyListAll_('/opening.list');
  out.push(['TOTAL','', all.length,'','']);
  // pick a non-archived opening with a 2026 openedAt
  var pick=null, n2026=0, nonArch=0;
  for (var i=0;i<all.length;i++){
    var o=all[i];
    if(o.isArchived) continue;
    nonArch++;
    var oa=String(o.openedAt||'');
    if(oa.substring(0,4)==='2026'){ n2026++; if(!pick) pick=o; }
  }
  out.push(['NON_ARCHIVED','', nonArch,'','']);
  out.push(['OPENED_2026','', n2026,'','']);
  if(!pick){ out.push(['PICK','none found','','','']); }
  else{
    out.push(['LIST_KEYS','', Object.keys(pick).join(', '),'','']);
    var lv=pick.latestVersion||{};
    out.push(['LIST_LV_KEYS','', Object.keys(lv).join(', '),'','']);
    out.push(['LIST_HAS_CF','', (pick.customFields?'top:'+pick.customFields.length:'no') + ' | lv:' + (lv.customFields?lv.customFields.length:'no'),'','']);
    out.push(['LIST_HAS_TEAM','', (pick.hiringTeam?'top:'+pick.hiringTeam.length:'no') + ' | lv:' + (lv.hiringTeam?lv.hiringTeam.length:'no'),'','']);
    // now opening.info on the same one
    var r=ashbyWrite_('/opening.info',{openingId:pick.id});
    var info=null; try{ info=JSON.parse(r.text).results; }catch(e){}
    if(!info){ out.push(['INFO','failed', String(r.code),'','']); }
    else{
      out.push(['INFO_KEYS','', Object.keys(info).join(', '),'','']);
      var ilv=info.latestVersion||{};
      out.push(['INFO_LV_KEYS','', Object.keys(ilv).join(', '),'','']);
      var cf=info.customFields||ilv.customFields||[];
      out.push(['INFO_CF_COUNT','', cf.length,'','']);
      for(var k=0;k<Math.min(cf.length,8);k++){
        var f=cf[k];
        out.push(['INFO_CF', String(f.title||f.name||''), '', String(f.fieldType||''), JSON.stringify(f.value).substring(0,60)]);
      }
      var ht=info.hiringTeam||ilv.hiringTeam||[];
      out.push(['INFO_TEAM_COUNT','', ht.length,'','']);
      for(var h=0;h<Math.min(ht.length,6);h++){
        out.push(['INFO_TEAM', String(ht[h].role||ht[h].roleName||''), '', String((ht[h].user&&(ht[h].user.firstName+' '+ht[h].user.lastName))||ht[h].name||''),'']);
      }
    }
  }
  var ss=SpreadsheetApp.openById(G22_AUDIT_ID);
  var sh=ss.getSheetByName(LOG); if(!sh) sh=ss.insertSheet(LOG); else sh.clear();
  var w=5;
  var norm=out.map(function(r){var x=r.slice(0,w); while(x.length<w)x.push(''); return x.map(function(q){return (q===null||q===undefined)?'':String(q);});});
  sh.getRange(1,1,norm.length,w).setValues(norm);
  SpreadsheetApp.flush();
  Logger.log('v4 probe rows '+norm.length);
}
// READ-ONLY: the real 22h picture across every 2026 non-archived opening.
function v4_scan() {
  var LOG='V4 Probe';
  var out=[['section','a','b','c','d']];
  var jobs=ashbyListAll_('/job.list'), jobById={};
  jobs.forEach(function(j){ jobById[j.id]={title:j.title||'',dept:(j.department||''),status:j.status||''}; });
  var users=ashbyListAll_('/user.list'), userById={};
  users.forEach(function(u){ userById[u.id]=((u.firstName||'')+' '+(u.lastName||'')).trim()||u.name||''; });
  var all=ashbyListAll_('/opening.list');
  var pop=[];
  all.forEach(function(o){
    if(o.isArchived) return;
    var oa=String(o.openedAt||'');
    if(oa.substring(0,4)!=='2026') return;
    pop.push(o);
  });
  out.push(['POPULATION','2026 non-archived openings', pop.length,'','']);
  var byQ={}, byState={}, cfPresent={}, cfMissing=0, teamRoles={}, noTeam=0, cfCounts={};
  pop.forEach(function(o){
    var oa=String(o.openedAt||'');
    var q='Q'+(Math.floor((parseInt(oa.substring(5,7),10)-1)/3)+1)+' 2026';
    byQ[q]=(byQ[q]||0)+1;
    var st=String(o.openingState||'(none)'); byState[st]=(byState[st]||0)+1;
    var lv=o.latestVersion||{};
    var cf=lv.customFields||[];
    cfCounts[cf.length]=(cfCounts[cf.length]||0)+1;
    if(!cf.length) cfMissing++;
    cf.forEach(function(f){ var t=String(f.title||f.name||'?'); cfPresent[t]=(cfPresent[t]||0)+1; });
    var ht=lv.hiringTeam||[];
    if(!ht.length) noTeam++;
    ht.forEach(function(h){ var rn=String(h.role||h.roleName||h.roleId||'?'); teamRoles[rn]=(teamRoles[rn]||0)+1; });
  });
  function dump(tag,obj){ for(var k in obj) out.push([tag,k,obj[k],'','']); }
  dump('BY_QUARTER',byQ);
  dump('BY_STATE',byState);
  dump('CF_FIELD_PRESENT',cfPresent);
  dump('CF_COUNT_PER_OPENING',cfCounts);
  out.push(['CF_NONE','openings with zero custom fields', cfMissing,'','']);
  dump('TEAM_ROLE',teamRoles);
  out.push(['TEAM_NONE','openings with empty hiring team', noTeam,'','']);
  var ss=SpreadsheetApp.openById(G22_AUDIT_ID);
  var sh=ss.getSheetByName(LOG); if(!sh) sh=ss.insertSheet(LOG); else sh.clear();
  var w=5;
  var norm=out.map(function(r){var x=r.slice(0,w); while(x.length<w)x.push(''); return x.map(function(q2){return (q2===null||q2===undefined)?'':String(q2);});});
  sh.getRange(1,1,norm.length,w).setValues(norm);
  SpreadsheetApp.flush();
  Logger.log('v4 scan rows '+norm.length);
}
// ===== Tracker Openings v4 =====================================================
// All-2026. First audit that compares against REAL Ashby OPENINGS (custom fields +
// native hiring-team Recruiter), not just the candidate's offer record.
// Opening-level verdicts are COUNT-TO-COUNT per job x quarter: openings are paired to
// tracker positions greedily, because an opening cannot be tied to a specific position.
// #42 (Jerin, 7 Sep 2026): V5 is the SAME audit scoped to one quarter, so it is a PARAMETER, not a clone -
// a copied 500-line builder would drift from V4's method within a week and the two would stop being comparable.
// opts: {tab, manualTab, mapTab, carryFrom, onlyQuarter, label}
function buildAuditV4(opts) {
  opts = opts || {};
  var LBL = opts.label || 'v4';
  var TRACKER_ID='1_LQxHDZ6dXehyR2lc8pcFjfDeRaV80vBzVRB_BKWT5A';
  var V4_TAB=opts.tab||'Tracker Openings v4', MANUAL_TAB=opts.manualTab||'V4 Manual Fixes', V3_TAB=opts.carryFrom||'Tracker Openings v3';
  var MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var TZ='UTC';
  var MANUAL={'Opening Quarter':1,'Status':1,'DOJ Quarter':1};
  // tracker statuses that mean NO CANDIDATE EXISTS - a blank Ashby side is correct, not a defect
  var NO_CAND={'Open':1,'Role Shelved':1,'Carry Forward to Next Q':1,'Yet to Open':1};
  var CR_HIRED='2777221e-d3a7-40e6-95a3-6988ad60494d', CR_ONHOLD='05105d39-d5f6-442c-b7bf-f6b055a50a43',
      CR_SHELVED='63d32633-3047-458b-a9a2-fbf2d04738f2', CR_CARRYFWD='249988e6-c53c-4d6e-b60d-dc78e145520d';
  function openLabel(op){ if(!op) return 'No Opening'; var s=op.state;
    if(s==='Closed'){ if(op.cr===CR_SHELVED)return 'Closed - Shelved'; if(op.cr===CR_CARRYFWD)return 'Closed - Carry fwd';
      if(op.cr===CR_HIRED)return 'Closed - Hired'; if(op.cr===CR_ONHOLD)return 'Closed - On hold'; return 'Closed - other'; }
    return s||''; }
  // Jerin's ideal mapping (6 Sep): HT status -> the opening status it SHOULD have
  var EXPECT={'Joined':'Filled','Joining Pending':'Open','Dropped - Offer':'Open','Dropped - Select':'Open',
              'Open':'Open','Role Shelved':'Closed - Shelved','Carry Forward to Next Q':'Closed - Carry fwd','Yet to Open':'No Opening'};
  var TEAM_DASH={'Employment Type':1,'Level':1,'Complexity':1};
  function d2s(x){ if(!x) return ''; if(Object.prototype.toString.call(x)==='[object Date]') return Utilities.formatDate(x,TZ,'yyyy-MM-dd'); return String(x).trim(); }
  function qtr(s){ return (s&&s.length>=7)?('Q'+(Math.floor((parseInt(s.substring(5,7),10)-1)/3)+1)+' '+s.substring(0,4)):''; }
  function nrm(e){ return String(e||'').replace(/\s+/g,'').toLowerCase(); }
  function ok(e){ return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e); }
  function norm(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(); }
  function words(s){ var t=norm(s).split(' '),o={}; for(var i=0;i<t.length;i++) if(t[i])o[t[i]]=1; return o; }
  function roleOk(a,b){ var x=words(a),y=words(b),kx=Object.keys(x),ky=Object.keys(y),n=0; if(!kx.length||!ky.length)return false; for(var i=0;i<kx.length;i++) if(y[kx[i]])n++; return n>=2||n===kx.length||n===ky.length; }
  function eq(a,b){ return String(a).trim().toLowerCase()===String(b).trim().toLowerCase(); }
  function nameTok(s){ var t=norm(s).split(' '),o=[]; for(var i=0;i<t.length;i++) if(t[i]&&t[i].length>1)o.push(t[i]); return o; }
  function nameMatch(a,b){ var x=nameTok(a),y=nameTok(b); if(!x.length||!y.length)return false; var s=x.length<=y.length?x:y,l=x.length<=y.length?y:x; if(s.length===1)return s[0]===l[0]; for(var i=0;i<s.length;i++){var h=false; for(var j=0;j<l.length;j++) if(l[j]===s[i]){h=true;break;} if(!h)return false;} return true; }
  function cxMap(x){ var s=String(x||'').trim(); if(!s)return ''; var l=s.toLowerCase();
    if(l==='regular'||l==='normal')return 'Normal'; if(l==='complex')return 'Complex';
    if(l.replace(/\s+/g,'')==='ubercomplex')return 'Uber Complex'; return s; }
  function rtMap(x){ var s=String(x||'').trim().replace(/^\s*\d+\s*[.)\-]\s*/,''); if(!s)return ''; var l=s.toLowerCase();
    if(l==='new')return 'New'; if(l==='replacement')return 'Replacement'; if(l==='buffer')return 'Buffer';
    if(l.indexOf('anticipation')>-1)return 'Anticipation Of Exit'; if(l.indexOf('aop')>-1)return 'As per AOP'; return s; }

  // ---- tracker: every 2026 position ----
  var tss=SpreadsheetApp.openById(TRACKER_ID); TZ=tss.getSpreadsheetTimeZone()||'UTC';
  var vals=tss.getSheetByName('Master').getDataRange().getValues(), hdr=vals[0];
  function col(n){ for(var i=0;i<hdr.length;i++) if(String(hdr[i]).trim()===n) return i; return -1; }
  function colAny(a){ for(var i=0;i<a.length;i++){ var c=col(a[i]); if(c>=0)return c; } return -1; }
  function at(r,i){ return i>=0?String(r[i]==null?'':r[i]).trim():''; }
  var C={ date:col('Date'), jcq:col('Job Creation Quarter'), status:col('Overall Status'), dept:col('Department'),
          job:col('Job Name'), rec:col('Recruiter'), name:col('Candidate Name'), email:col('Personal Email'),
          offer:col('Date of Offer'), doj:col('DOJ'), jq:col('Joining Quarter'),
          role:colAny(['Role Type','Type of Role']), loc:colAny(['Job Location','Location']),
          emp:colAny(['Employment Type','Employment type','Emp Type','Type of Employment']),
          lvl:colAny(['Level','Job Level','Grade']), cx:colAny(['Complexity','Role Complexity','Job Complexity']) };
  var trk=[];
  for(var r=1;r<vals.length;r++){ var row=vals[r], jcq=String(row[C.jcq]||'').trim();
    if(!/2026$/.test(jcq)) continue;
    if(opts.onlyQuarter && String(jcq).trim()!==opts.onlyQuarter) continue;   // #42: quarter-scoped run
    var e=nrm(row[C.email]), dj=d2s(row[C.doj]);
    trk.push({ email:ok(e)?e:'', name:at(row,C.name), job:at(row,C.job), dept:at(row,C.dept),
      opd:d2s(row[C.date]), opq:jcq, doj:dj, rec:at(row,C.rec), role:at(row,C.role), loc:at(row,C.loc),
      emp:at(row,C.emp), lvl:at(row,C.lvl), cx:at(row,C.cx), offd:d2s(row[C.offer]),
      djq:String(row[C.jq]||'').trim()||qtr(dj), status:at(row,C.status) }); }

  // ---- Ashby reference data ----
  var deptMap={}; try{ deptMap=fetchDepartmentMap_(); }catch(eDp){}
  function topDept_(id){ var d=deptMap[id],g=0; while(d&&d.parentId&&deptMap[d.parentId]&&g++<8) d=deptMap[d.parentId]; return d?d.name:''; }
  function leafDept_(id){ return deptMap[id]?deptMap[id].name:''; }
  var jobs=ashbyListAll_('/job.list'), jobByTitle={};
  // tracker -> Ashby department aliases (Jerin, 6 Sep). Punctuation/case handled by norm().
  var DEPT_ALIAS={'business ai':'US Business','business interviewprep':'US Business'};
  function deptAlias(t){ var k=norm(t); return DEPT_ALIAS[k]||t; }
  function deptOf(j){ return topDept_(j.departmentId)||leafDept_(j.departmentId); }
  function teamOf(j){ return leafDept_(j.departmentId); }
  jobs.forEach(function(j){ jobByTitle[norm(j.title)]={id:j.id,title:j.title||'',dept:deptOf(j),team:teamOf(j),status:j.status||''}; });
  var users=ashbyListAll_('/user.list'), uById={};
  users.forEach(function(u){ uById[u.id]=((u.firstName||'')+' '+(u.lastName||'')).trim()||u.name||''; });
  var locName={}; try{ ashbyListAll_('/location.list').forEach(function(l){ locName[l.id]=l.name||''; }); }catch(eL){}
  var bucket={}, opsAll=[], opsByIdAll={};
  // #47 (V6): the loop below SKIPS every opening whose openedAt is not 2026 - which silently drops the ~53-58
  // UNDATED openings too. An opening that genuinely exists but has no date was therefore reported as 'no
  // opening', manufacturing a gap. Index EVERY non-archived opening here so V6 can tell 'missing' apart from
  // 'exists but undated'. Leave the 2026 filter alone below - V4/V5 numbers must stay reproducible.
  ashbyListAll_('/opening.list').forEach(function(o){
    if(o.isArchived) return;
    var lv2=o.latestVersion||{}, cf2={};
    (lv2.customFields||[]).forEach(function(f){ var lab=(f.valueLabel==null||f.valueLabel==='')?(f.value==null?'':f.value):f.valueLabel; cf2[String(f.title||f.name||'')]=String(lab); });
    var rc2=[]; (lv2.hiringTeam||[]).forEach(function(h){ if(/recruiter/i.test(String(h.role||h.roleName||''))) rc2.push(uById[h.userId]||h.name||''); });
    var oa2=String(o.openedAt||'');
    opsByIdAll[o.id]={ id:o.id, openedAt:oa2?oa2.substring(0,10):'', dated:!!oa2, q:oa2?qtr(oa2):'',
      state:String(o.openingState||''), cr:String(o.closeReasonId||''),
      cx:cxMap(cf2['Role Complexity (Opening)']||''), rt:rtMap(cf2['Role Type']||''),
      emp:String(cf2['Employment Type']||''),
      loc:(lv2.locationIds||[]).map(function(x){return locName[x]||'';}).filter(String).join(', '),
      recs:rc2, jobIds:(lv2.jobIds||[]) };
  });
  ashbyListAll_('/opening.list').forEach(function(o){
    if(o.isArchived) return; var oa=String(o.openedAt||''); if(oa.substring(0,4)!=='2026') return;
    var lv=o.latestVersion||{}, cf={};
    (lv.customFields||[]).forEach(function(f){ var lab=(f.valueLabel==null||f.valueLabel==='')?(f.value==null?'':f.value):f.valueLabel; cf[String(f.title||f.name||'')]=String(lab); });
    var recs=[]; (lv.hiringTeam||[]).forEach(function(h){ if(/recruiter/i.test(String(h.role||h.roleName||''))) recs.push(uById[h.userId]||h.name||''); });
    var op={ id:o.id, openedAt:oa.substring(0,10), q:qtr(oa), state:String(o.openingState||''), cr:String(o.closeReasonId||''),
      cx:cxMap(cf['Role Complexity (Opening)']||''), rt:rtMap(cf['Role Type']||''),
      emp:String(cf['Employment Type']||''),
      loc:(lv.locationIds||[]).map(function(x){return locName[x]||'';}).filter(String).join(', '),
      recs:recs, used:false };
    opsAll.push(op);
    (lv.jobIds||[]).forEach(function(jid){ var k=jid+'|'+op.q; (bucket[k]=bucket[k]||[]).push(op); });
  });

  // ---- candidate/offer records by email (same source as v2/v3) ----
  var it=DriveApp.getFilesByName('offer_contacts.json');
  if(!it.hasNext()) throw new Error('offer_contacts.json not found - run refreshDashboardData first');
  var ash=JSON.parse(it.next().getBlob().getDataAsString()).rows, byEmail={};
  ash.forEach(function(x){ var e=nrm(x.email); if(ok(e)) (byEmail[e]=byEmail[e]||[]).push(x); });
  function offerDate(m){ return (m&&(m.offerCreatedAt||m.decidedAt))||''; }
  function aStat(m){ if(m.appStatus==='Hired')return 'Joined'; if(m.joiningPending)return 'Joining Pending'; if(m.appStatus==='Archived')return 'Dropped - Offer'; return 'Offer Released'; }
  var multiRec={}; try{ var dash=loadDriveJson_('dashboard.json'); ((dash&&dash.dataQuality&&dash.dataQuality.multiRecruiter)||[]).forEach(function(x){ if(x&&x.app) multiRec[x.app]=x.names||[]; }); }catch(eD){}
  function candRecs(m){ var n=multiRec[m.applicationId]; if(n&&n.length>1)return n; return m.recruiter?[m.recruiter]:[]; }
  function pick(list){ if(list.length===1)return list[0]; var h=list.filter(function(x){return x.appStatus==='Hired';}); var p=h.length?h:list; return p[0]; }

  // ---- job resolution: name first, candidate route as fallback ----
  // Tracker job name -> exact Ashby job title. Confirmed by Jerin, 6 Sep. Takes precedence over fuzzy.
  var JOB_ALIAS={
    'program advisor us':'Program Advisor - US (AI Programs)',
    'technical mentor agentic ai':'Part Time Instructor - Agentic AI (US)',
    'sme india agentic ai for em':'SME India : Agentic AI Instructor'
  };
  function aliasJob(title){ var a=JOB_ALIAS[norm(title)]; return a?jobByTitle[norm(a)]:null; }
  function fuzzyJob(title,deptHint){ var t=norm(title); if(!t)return null;
    var x=words(title), kx=Object.keys(x); if(!kx.length)return null;
    var best=null,bs=0;
    for(var k in jobByTitle){ var j2=jobByTitle[k], y=words(j2.title), ky=Object.keys(y), n=0;
      for(var i=0;i<kx.length;i++) if(y[kx[i]])n++;
      var den=Math.max(kx.length,ky.length)||1, sc=n/den;
      if(deptHint&&norm(j2.dept)&&norm(j2.dept)===norm(deptHint)) sc+=0.15;
      if(sc>bs){bs=sc;best=j2;} }
    return bs>=0.6?best:null; }
  function resolveJob(tr,m){
    if(noMap[norm(tr.job)]) return {id:'',title:'',dept:'',team:'',jstatus:'',how:'do-not-map'};
    var al=aliasJob(tr.job);
    if(al) return {id:al.id,title:al.title,dept:al.dept,team:al.team,jstatus:al.status,how:'alias'};
    var j=jobByTitle[norm(tr.job)];
    if(j) return {id:j.id,title:j.title,dept:j.dept,team:j.team,jstatus:j.status,how:'name'};
    var fz=fuzzyJob(tr.job,deptAlias(tr.dept));
    if(fz) return {id:fz.id,title:fz.title,dept:fz.dept,team:fz.team,jstatus:fz.status,how:'fuzzy'};
    if(m&&m.jobTitle){ var j2=jobByTitle[norm(m.jobTitle)]; if(j2) return {id:j2.id,title:j2.title,dept:j2.dept,team:j2.team,jstatus:j2.status,how:'candidate'};
      var fz2=fuzzyJob(m.jobTitle,''); if(fz2) return {id:fz2.id,title:fz2.title,dept:fz2.dept,team:fz2.team,jstatus:fz2.status,how:'candidate-fuzzy'}; }
    return {id:'',title:'',dept:'',team:'',jstatus:'',how:'none'}; }

  // ---- fields ----
  var F=[
   {n:'Job Name',t:function(c){return c.tr.job;},a:function(c){return c.jr.title;},k:'role'},
   {n:'Department',t:function(c){return deptAlias(c.tr.dept);},a:function(c){return c.jr.dept;},k:'dept'},
   {n:'Location',t:function(c){return c.tr.loc;},a:function(c){return c.op?c.op.loc:'';},k:'loose'},
   {n:'Level',t:function(c){return c.tr.lvl;},a:function(c){return c.m?(c.m.level||''):'';},k:'eq'},
   {n:'Complexity',t:function(c){return cxMap(c.tr.cx);},a:function(c){return c.op?c.op.cx:'';},k:'need'},
   {n:'Employment Type',t:function(c){return c.tr.emp;},a:function(c){return c.op?c.op.emp:'';},k:'need'},
   {n:'Role Type',t:function(c){return rtMap(c.tr.role);},a:function(c){return c.op?c.op.rt:'';},k:'need'},
   {n:'Opening Date',t:function(c){return c.tr.opd;},a:function(c){return c.op?c.op.openedAt:'';},k:'na'},
   {n:'Opening Quarter',t:function(c){return c.tr.opq;},a:function(c){return c.op?c.op.q:'';},k:'need'},
   {n:'Recruiter (Opening Owner)',t:function(c){return c.tr.rec;},a:function(c){return c.op?c.op.recs.join(' + '):'';},k:'rec'},
   {n:'Opening Status',t:function(c){return EXPECT[String(c.tr.status).trim()]||'';},a:function(c){return openLabel(c.op);},k:'openst'},
   {n:'Status',t:function(c){return c.tr.status;},a:function(c){return c.m?aStat(c.m):'';},k:'status'},
   {n:'Candidate Name',t:function(c){return c.tr.name;},a:function(c){return c.m?(c.m.candidate||''):'';},k:'found'},
   {n:'Personal Email',t:function(c){return c.tr.email;},a:function(c){return c.m?nrm(c.m.email):'';},k:'eq'},
   {n:'DOJ Quarter',t:function(c){return c.tr.djq;},a:function(c){return qtr(c.m?(c.m.startDate||''):'');},k:'eq'},
   {n:'Offer Quarter',t:function(c){return qtr(c.tr.offd);},a:function(c){return qtr(c.m?(c.m.offerCreatedAt||''):'');},k:'eq'},
   {n:'Recruiter (Candidate)',t:function(c){return c.tr.rec;},a:function(c){return c.m?candRecs(c.m).join(' + '):'';},k:'rec'}
  ];
  // #47 (V6): which OBJECT each field actually describes, so a job-level defect is counted once per job and an
  // opening-level one once per opening - V5 counted both once per tracker POSITION, inflating Level/Location/Dept.
  var F_OBJ={'Job Name':'job','Department':'job','Level':'job','Location':'opening','Complexity':'opening',
    'Employment Type':'opening','Role Type':'opening','Opening Date':'opening','Opening Quarter':'opening',
    'Recruiter (Opening Owner)':'opening','Opening Status':'opening'};
  var F0=F.map(function(f){ return { n:f.n, t:f.t, a:f.a, k:f.k, obj:F_OBJ[f.n]||'candidate' }; });
  function rowKey(t){ return t.email || ('OPEN|'+t.job+'|'+t.opd+'|'+t.rec); }

  var out=SpreadsheetApp.openById(AUDIT_SHEET_ID);
  // Jerin's corrections live in the review tab: col A tracker job, col F verdict/correction.
  // 'Correct' = leave as resolved; anything else = an exact Ashby job title to force.
  var prevCorr={}, badAlias=[], noMap={};
  try{ var rvs=out.getSheetByName('V4 Job Mapping Review');
    if(rvs){ var rvv=rvs.getDataRange().getValues();
      var rh=rvv[0]||[], cJob=-1, cCor=-1;
      for(var ci=0;ci<rh.length;ci++){ var hn2=String(rh[ci]||'').trim();
        if(/^tracker job$/i.test(hn2)) cJob=ci;
        if(/correction/i.test(hn2)) cCor=ci; }
      if(cJob<0||cCor<0) throw new Error('V4 Job Mapping Review: could not find Tracker Job / CORRECTION headers');
      for(var ri=1;ri<rvv.length;ri++){
        var tj=String(rvv[ri][cJob]||'').trim(), cv=String(rvv[ri][cCor]||'').trim();
        if(!tj||!cv) continue;
        prevCorr[norm(tj)]=cv;
        if(/^(don'?t\s*map|do\s*not\s*map|no\s*map)$/i.test(cv)){ noMap[norm(tj)]=1; continue; }
        if(!/^correct$/i.test(cv)){ JOB_ALIAS[norm(tj)]=cv; if(!jobByTitle[norm(cv)]) badAlias.push(tj+' -> '+cv); }
      } } }catch(eRV){}
  var jobGaps={};
  try{ var jg=out.getSheetByName('Job Gaps'); if(jg){ var jv=jg.getDataRange().getValues();
    for(var jr2=1;jr2<jv.length;jr2++){ var jn=String(jv[jr2][0]||'').trim(); if(!jn)continue;
      jobGaps[jn]={'Employment Type':String(jv[jr2][16]||'').trim(),'Level':String(jv[jr2][17]||'').trim(),'Complexity':String(jv[jr2][18]||'').trim()}; } } }catch(eJ){}
  // carry Result across from V3 (Q3 only - V3 never covered other quarters)
  var oldRes={};
  try{ var os=out.getSheetByName(V3_TAB); if(os){ var ov=os.getDataRange().getValues();
    if(ov.length>1){ var oh=ov[0],kc=0,last='',rc={};
      for(var cc=0;cc<oh.length;cc++){ var hn=String(oh[cc]||'').trim(); if(!hn)continue;
        if(hn.indexOf('Row key')===0){kc=cc;continue;} if(hn==='Match?')continue; if(hn.indexOf(' - Ashby')>-1)continue;
        if(hn==='Result'){ if(last)rc[last]=cc; continue; } last=hn; }
      for(var rr=1;rr<ov.length;rr++){ var k2=String(ov[rr][kc]||'').trim(); if(!k2)continue;
        for(var fn in rc){ var vv=String(ov[rr][rc[fn]]==null?'':ov[rr][rc[fn]]).trim(); if(vv)(oldRes[k2]=oldRes[k2]||{})[fn]=vv; } } } } }catch(eO){}

  // ---- pair openings to positions, count-to-count per job x quarter ----
  var ctx=[];
  trk.forEach(function(tr){ var list=tr.email?(byEmail[tr.email]||[]):[]; var m=list.length?pick(list):null;
    var jr=resolveJob(tr,m); ctx.push({tr:tr,m:m,jr:jr,op:null,n:list.length}); });
  ctx.forEach(function(c){ if(!c.jr.id)return; var pool=bucket[c.jr.id+'|'+c.tr.opq]||[];
    var best=null,bs=-1;
    pool.forEach(function(o){ if(o.used)return; var s=0;
      if(o.cx&&eq(o.cx,cxMap(c.tr.cx)))s++; if(o.rt&&eq(o.rt,rtMap(c.tr.role)))s++;
      if(o.emp&&eq(o.emp,c.tr.emp))s++;
      if(o.recs.length===1&&nameMatch(c.tr.rec,o.recs[0]))s++;
      if(s>bs){bs=s;best=o;} });
    if(best){ best.used=true; c.op=best; } });

  // ============ #51 / V7 : Jerin's funnel, REVISED 7 Sep 2026 (supersedes the V6 tab) ============
  // Six revisions, each from something that actually bit while building V6:
  //  0. SCOPE OUT rows that should not have an opening at all (Yet to Open / Role Shelved / Carry Forward).
  //     In V6 these sat inside E and inflated the missing-openings number.
  //  1. B's gap splits: no EMAIL to match on (tracker hygiene) vs email present but NO Ashby record (create).
  //  2. D's gap splits THREE ways - and one of them feeds the create number, which V6 missed entirely:
  //     D1 no link but the job has a free opening -> LINK it;  D2 no link and no free opening -> CREATE one;
  //     D3 two positions pointing at the SAME opening -> a data error that was invisible before.
  //  3. F is a COUNT test, and splits: F1 covered by a correctly-dated opening vs F2 covered by an UNDATED or
  //     WRONG-QUARTER one -> that is a RE-DATE job, not a create job. Confusing the two is how duplicates get made.
  //  4. OPENINGS TO CREATE = G + D2 (not G alone).
  //  5. Every line carries its route, and the permanently-unfixable fields are named once instead of being
  //     re-counted as a backlog every run (offer date has no write API; application status is unwritable).
  // Allocation order is deliberate: openings proven by a LINK are consumed first, then unlinked filled rows,
  // then unfilled rows. A filled position has evidence of association; an unfilled one only has a count.
  // 🚨 The field-gap counts must use V4's OWN per-field comparators, not exact string equality. A first cut used
  // eq() everywhere and reported 92 recruiter mismatches where V4's nameMatch() finds far fewer - names differ by
  // spelling and word order constantly (Murali Manohar Krishna G = Murali Gopalachar). Same for role titles via
  // roleOk(). Mirrors the mm logic in the main build so the two can never disagree about what counts as a gap.
  function v7mismatch(f, c) {
    var tv = f.t(c), av = f.a(c);
    if (!String(tv).trim() || !String(av).trim()) return false;   // nothing to compare
    if (f.k === 'role')  return !roleOk(tv, av);
    if (f.k === 'loose') return !roleOk(tv, av);
    if (f.k === 'dept')  return norm(tv) !== norm(av);
    if (f.k === 'rec')   { var names = String(av).split(' + ').filter(String);
                           return !(names.length === 1 && nameMatch(tv, names[0])); }
    if (f.n === 'Candidate Name') return !nameMatch(tv, av);
    return !eq(tv, av);
  }
  if (opts.mode === 'v7' || opts.mode === 'v8') {
    var V8 = (opts.mode === 'v8');
    var L=[], add=function(a,b,c,d){ L.push([a,b===undefined?'':b,c===undefined?'':c,d===undefined?'':d]); };
    var NO_OPENING_EXPECTED={'Yet to Open':1,'Role Shelved':1,'Carry Forward to Next Q':1};
    var inScope=[], X=[];
    ctx.forEach(function(c){ var oos = !!NO_OPENING_EXPECTED[String(c.tr.status||'').trim()];
      // V8 step-0 GUARD: a row with a candidate or an Ashby match is NOT out of scope, whatever the tracker says.
      if (V8 && oos && (String(c.tr.name||'').trim() || c.m)) oos = false;
      (oos ? X : inScope).push(c); });
    var hasCand=function(c){ return !!(String(c.tr.name||'').trim()||String(c.tr.email||'').trim()); };
    var A=inScope.filter(hasCand), E=inScope.filter(function(c){ return !hasCand(c); });
    var B=A.filter(function(c){ return !!c.m; }), Bmiss=A.filter(function(c){ return !c.m; });
    var B1=Bmiss.filter(function(c){ return !String(c.tr.email||'').trim(); }).length;
    var B2=Bmiss.length-B1;
    var Cids={}, Cnojob=0;
    B.forEach(function(c){ if(c.jr.id) Cids[c.jr.id]=c; else Cnojob++; });
    // ---- D: follow the offer's opening link ----
    var Dids={}, useCount={}, linked=[], unlinked=[];
    B.forEach(function(c){ var oid=c.m.openingId||c.m.openingIdAny||null;
      if(oid && opsByIdAll[oid]){ linked.push(c); useCount[oid]=(useCount[oid]||0)+1; Dids[oid]=c; } else unlinked.push(c); });
    var D3=0; for(var uk in useCount) if(useCount[uk]>1) D3+=useCount[uk]-1;
    // free pool = every non-archived opening not already claimed by a link
    // 🚨 An opening that is CLOSED cannot cover a vacancy - it has already been used. Without this the
    // allocator hands out openings that were closed-as-hired years ago: 2025-Q3 alone holds 494 openings,
    // every one of them closed as Hired, sitting on 236 jobs. Those were being counted as 'cover' for unfilled
    // 2026 positions, and re-dating one would move a 2025 hire's opening into 2026 and corrupt both quarters.
    var freeByJob={}, alreadyClosed=0;
    for(var ok2 in opsByIdAll){ var o2=opsByIdAll[ok2]; if(useCount[o2.id]) continue;
      if(o2.cr){ alreadyClosed++; continue; }   // closed for any reason = not available
      o2.jobIds.forEach(function(jid){ (freeByJob[jid]=freeByJob[jid]||[]).push(o2); }); }
    var v8Claimed = {};
    var take = function(jid){ var p = freeByJob[jid]; if(!p||!p.length) return null; var t = p.shift(); if(t) v8Claimed[t.id]=1; return t; };
    var D1=0, D2=0;
    unlinked.forEach(function(c){ if(!c.jr.id){ D2++; return; } var o=take(c.jr.id); if(o) D1++; else D2++; });
    // ---- E branch: what is left over covers the unfilled positions ----
    // F2 lumps three different problems together, and they are NOT the same job:
    //   F2a UNDATED    - no openedAt at all. INVISIBLE to every dashboard metric. Needs a date typed in.
    //   F2b WRONG QTR  - dated, but to another quarter. It IS counted, just in the wrong bucket.
    //   F2c NO TRACKER QUARTER - the tracker row has no opening quarter to compare against, so this is a
    //       TRACKER gap, not an Ashby one. Previously these were silently blamed on Ashby.
    var F1=0, F2undated=0, F2wrongQ=0, F2noTrkQ=0, G1=0, G2=0, wrongQdetail={};
    E.forEach(function(c){
      if(!c.jr.id){ G2++; return; }
      var o=take(c.jr.id);
      if(!o){ if(String(c.jr.jstatus||'').toLowerCase().indexOf('open')>-1) G1++; else G2++; return; }
      if(!o.dated){ F2undated++; return; }
      if(!c.tr.opq){ F2noTrkQ++; return; }
      if(o.q===c.tr.opq){ F1++; return; }
      F2wrongQ++;
      var k=(c.tr.opq||'?')+' -> '+(o.q||'?'); wrongQdetail[k]=(wrongQdetail[k]||0)+1;
    });
    var F2=F2undated+F2wrongQ+F2noTrkQ;
    add('TRACKER POSITIONS', ctx.length, opts.onlyQuarter||'all 2026');
    add('   X = should NOT have an opening (Yet to Open / Shelved / Carry fwd)', X.length, 'excluded by design - not a gap');
    add('   IN SCOPE', inScope.length);
    add('');
    add('A = FILLED (a candidate is named on the row)', A.length);
    add('   B = candidate FOUND in Ashby by email', B.length);
    add('      B1 gap: tracker row has NO EMAIL to match on', B1, 'tracker hygiene');
    add('      B2 gap: email present but NO Ashby record', B2, 'candidate must be created - UI/manual');
    add('   C = distinct JOBS reached through B', Object.keys(Cids).length);
    add('      C gap: job will not resolve even with the fuzzy list', Cnojob, 'add to V4 Job Mapping Review');
    add('   D = distinct OPENINGS reached through B via the OFFER LINK', Object.keys(Dids).length);
    add('      D1 gap: no link, but a free opening exists on the job', D1, 'LINK it');
    add('      D2 gap: no link and NO free opening', D2, 'an opening must be CREATED');
    add('      D3 gap: two positions share ONE opening', D3, 'data error - one opening cannot hold two hires');
    add('');
    add('E = UNFILLED (no candidate on the row)', E.length);
    add('   (closed openings excluded from the free pool)', alreadyClosed, 'a closed opening has already been used - it cannot cover a vacancy');
    add('   F1 = covered by a correctly dated opening', F1, 'correct - nothing to do');
    add('   F2 = covered, but the opening needs attention', F2, 'RE-DATE - do NOT create a duplicate');
    add('      F2a opening is UNDATED', F2undated, 'INVISIBLE to every dashboard metric - type a date in');
    add('      F2b opening dated to the WRONG QUARTER', F2wrongQ, 'counted, but in the wrong bucket');
    add('      F2c tracker row has NO opening quarter', F2noTrkQ, 'TRACKER gap, not an Ashby one');
    for(var wq in wrongQdetail) add('         tracker ' + wq, wrongQdetail[wq]);
    add('   G  = no opening at all', G1+G2, 'CREATE');
    add('      G1 job is LIVE in Ashby', G1, 'unblocked');
    add('      G2 job closed or not found', G2, 'reopen/create the JOB first');
    add('');
    add('>>> THE THREE NUMBERS TO ACT ON');
    add('   OPENINGS TO CREATE  = G + D2', (G1+G2)+D2, 'UI only - opening.create is blocked by 4 required fields');
    add('   OPENINGS TO RE-DATE = F2 + wrong-date gaps on D', F2, 'UI only - openedAt fails SILENTLY by API (+ see the date gap below)');
    add('   OPENINGS TO LINK    = D1', D1, 'no API sets the opening on an existing offer - UI or at hire time');
    add('');
    add('FIELD GAPS - once per OBJECT, never per tracker position');
    var ROUTE={'Candidate Name':'UI - candidate record','Personal Email':'UI - candidate record (or fix the tracker)','Status':'NOT FIXABLE - application status is unwritable at any level','DOJ Quarter':'UI - offer start date','Offer Quarter':'NOT FIXABLE - offerCreatedAt has no write API','Recruiter (Candidate)':'API - application.addHiringTeamMember','Job Name':'mapping artefact - not actionable','Department':'UI (job property)','Level':'UI (job custom field)',
      'Location':'feasibility UNVERIFIED','Complexity':'API - customField.setValue (Opening)','Employment Type':'API - customField.setValue (Opening)',
      'Role Type':'API - customField.setValue (Opening)','Opening Date':'UI ONLY - API fails silently','Opening Quarter':'UI ONLY - follows the date',
      'Recruiter (Opening Owner)':'API - hiringTeam.addMember/removeMember','Opening Status':'API where shelved (opening.setArchived), else review'};
    // CANDIDATE-level gaps were never computed at all (Jerin caught this). These are per PERSON, so unlike the
    // job/opening blocks they are legitimately counted per row - one candidate, one record.
    // 56f FIX: the funnel resolves an opening by FOLLOWING THE OFFER LINK, but the field accessors
    // read c.op = V4's ALLOCATED opening. Different objects - 31 linked rows reported '-> No Opening'.
    // Rebind c.op to the link-derived opening for the gap block only, then restore it below.
    var v8Saved = [], v8Rebound = 0;
    if (V8) { B.forEach(function(c){ var oid = c.m.openingId || c.m.openingIdAny || null;
      if (oid && opsByIdAll[oid] && c.op !== opsByIdAll[oid]) { v8Saved.push([c, c.op]); c.op = opsByIdAll[oid]; v8Rebound++; } }); }
    var candGap={}, jobGap={}, opGap={};
    B.forEach(function(c){ F0.forEach(function(f){ if(f.obj!=='candidate') return;
      if(v7mismatch(f,c)) candGap[f.n]=(candGap[f.n]||0)+1; }); });
    Object.keys(Cids).forEach(function(id){ var c=Cids[id]; F0.forEach(function(f){ if(f.obj!=='job') return;
      if(v7mismatch(f,c)) jobGap[f.n]=(jobGap[f.n]||0)+1; }); });
    Object.keys(Dids).forEach(function(id){ var c=Dids[id]; F0.forEach(function(f){ if(f.obj!=='opening') return;
      if(v7mismatch(f,c)) opGap[f.n]=(opGap[f.n]||0)+1; }); });
    // 56f: compute the status split INSIDE the rebound window too, or it describes the old opening.
      var stF=null; for(var z=0;z<F0.length;z++) if(F0[z].n==='Opening Status') stF=F0[z];
      var stSplit={}, stTotal=0;
      if(stF) Object.keys(Dids).forEach(function(sid){ var sc=Dids[sid];
        if(v7mismatch(stF,sc)){ var k=(stF.t(sc)||'(blank)')+'  ->  '+(stF.a(sc)||'(no opening)');
          stSplit[k]=(stSplit[k]||0)+1; stTotal++; } });
    // 56f: put c.op back so nothing downstream sees the temporary rebinding.
    if (V8) { v8Saved.forEach(function(pr){ pr[0].op = pr[1]; }); }
    add('   on CANDIDATES (B) - of '+B.length+' matched people');
    for(var cg in candGap) add('      '+cg, candGap[cg], ROUTE[cg]||'');
    add('   on JOBS (C) - of '+Object.keys(Cids).length+' jobs');
    for(var jg in jobGap) add('      '+jg, jobGap[jg], ROUTE[jg]||'');
    add('   on OPENINGS (D) - of '+Object.keys(Dids).length+' openings');
    for(var og in opGap) add('      '+og, opGap[og], ROUTE[og]||'');
    add('');
    add('NEVER FIXABLE - stop counting these as a backlog');
    add('   Offer Quarter', '', 'offerCreatedAt has NO write API at any permission level');
    add('   Status (application)', '', 'application status / hire / archive cannot be written at any level');
    if (V8) {
      var openTotal=0, unclaimed=0;
      for (var rk in opsByIdAll){ var ro=opsByIdAll[rk]; if(ro.cr) continue; openTotal++;
        if(!useCount[ro.id] && !v8Claimed[ro.id]) unclaimed++; }
      var CREATE=G1+G2+D2+D3, REDATE=F2+(opGap['Opening Date']||0), LINK=D1;
      var CORRECT_raw=0; for(var q1 in candGap)CORRECT_raw+=candGap[q1]; for(var q2 in jobGap)CORRECT_raw+=jobGap[q2]; for(var q3 in opGap)CORRECT_raw+=opGap[q3];
      // 56c: the four outputs must be DISJOINT. RE-DATE owns Opening Date; never-fixable and mapping
      // artefacts are not work. Subtract them and show the subtraction so nobody re-adds it.
      var OWNED_BY_REDATE=(opGap['Opening Date']||0);
      var NEVERFIX=(candGap['Status']||0)+(candGap['Offer Quarter']||0);
      var NOTACTION=(jobGap['Job Name']||0);
      var CORRECT=CORRECT_raw-OWNED_BY_REDATE-NEVERFIX-NOTACTION;
      // 56d: Opening Status is the biggest bucket and is NOT actionable until split by what the
      // tracker expects vs what Ashby has. Shelved-but-live is a safe archive; Open<->Filled is a probe.
      add(''); add('THE FOUR OUTPUTS (V8)');
      add('  CREATE an opening', CREATE, 'UI only. G '+(G1+G2)+' + D2 '+D2+' + shared-opening '+D3);
      add('  RE-DATE an opening', REDATE, 'UI ONLY - openedAt fails silently (re-proven 7 Sep). unfilled '+F2+' + linked-wrong-date '+(opGap['Opening Date']||0));
      add('  LINK an offer to an opening', LINK, 'no API sets the opening on an existing offer');
      add('  CORRECT a field', CORRECT, 'ACTIONABLE only - per object, validated comparators');
      add('    raw field gaps', CORRECT_raw, 'before the subtractions below');
      add('    less: Opening Date', OWNED_BY_REDATE, 'counted in RE-DATE - do NOT count twice');
      add('    less: never fixable', NEVERFIX, 'Status + Offer Quarter - no write API at any level');
      add('    less: not actionable', NOTACTION, 'Job Name = mapping artefacts, not defects');
      add('  field gaps re-pointed to the LINKED opening (56f)', v8Rebound, 'rows where the allocator disagreed with the offer link');
      add(''); add('OPENING STATUS - split by tracker expects  ->  Ashby has', stTotal, 'NOT actionable as one number');
      for(var sk in stSplit){ var route = /shelved|closed/i.test(sk.split('->')[0]) ? 'API - opening.setArchived (safe batch)' : (/open|filled/i.test(sk) ? 'PROBE FIRST - state flip may be impossible' : 'review'); add('    '+sk, stSplit[sk], route); }
      add(''); add('REVERSE CHECK - Ashby openings NO tracker row claims', unclaimed, 'of '+openTotal+' non-closed openings');
      add(''); add('ARITHMETIC (step 10)');
      var ok1=(A.length+E.length+X.length)===ctx.length, ok2=(F1+F2+G1+G2)===E.length, ok3=(B.length+B1+B2)===A.length;
      add('  filled + unfilled + out-of-scope = tracker total', ok1?'PASS':'FAIL');
      add('  F1 + F2 + G = unfilled', ok2?'PASS':'FAIL');
      add('  B + B1 + B2 = filled', ok3?'PASS':'FAIL');
      add(''); add('NOT BUILT - Sourcer (field 18)', '', 'BLOCKED: the audit store carries no sourcer per application; needs a DataRefresh change');
      if(!(ok1&&ok2&&ok3)) throw new Error('V8 arithmetic FAILED - refusing to publish');
    }
    var rows7 = [[(V8?'V8':'V7')+' - filled vs unfilled funnel','Count','Route / note','']].concat(L);
    write(opts.tab||'Tracker Openings v7', rows7, false);
    L.forEach(function(x){ Logger.log(LBL+' | '+x[0]+(x[1]===''?'':'  ::  '+x[1])+(x[2]?'   ('+x[2]+')':'')); });
    return out.getUrl();
  }

  // ---- build ----
  var head=['Row key (email or job|date|recruiter)'];
  F.forEach(function(f){ head.push(f.n,f.n+' - Ashby','Match?','Result'); });
  head.push('Which Ashby record','Row status','Job match method','Ashby job status','Opening matched?','Ashby team (leaf)','Ashby opening state');
  var t1=[head], manual=[['Row key','Job','Candidate','Field','Tracker says','Ashby says','What to do']];
  var act={}, noOpening=0, matched=0;
  ctx.forEach(function(c){
    var key=rowKey(c.tr); if(c.m)matched++; if(!c.op)noOpening++;
    var closure=/Joined|Joining Pending|Dropped/.test(c.tr.status);
    var line=[key];
    F.forEach(function(f){ var tv=f.t(c), av=f.a(c), mm='';
      if(f.k==='found') mm=c.m?'Yes':(closure?'No':'n/a');
      else if(f.k==='na') mm='n/a';
      else if(f.k==='need') mm=(!c.op)?'n/a':(!String(av).trim()?'No':(eq(tv,av)?'Yes':'No'));
      else if(f.k==='openst'){ mm=(!String(tv).trim())?'n/a':(eq(tv,av)?'Yes':'No'); }
      else if(f.k==='dept'){ mm=(!String(av).trim())?'n/a':(norm(tv)===norm(av)?'Yes':'No'); }
      else if(f.k==='status'){ mm=(!String(av).trim()) ? (NO_CAND[String(tv).trim()]?'n/a':'No') : (eq(tv,av)?'Yes':'No'); }
      else if(f.k==='role') mm=(!c.jr.id)?'n/a':(roleOk(tv,av)?'Yes':'No');
      else if(f.k==='loose') mm=(!c.op||!String(av).trim()||!String(tv).trim())?'n/a':(roleOk(tv,av)?'Yes':'No');
      else if(f.k==='rec'){ var names=String(av).split(' + ').filter(String);
        mm=(f.n.indexOf('Opening')>-1)?((!c.op)?'n/a':(names.length===1&&nameMatch(tv,names[0])?'Yes':'No'))
                                      :((!c.m)?'n/a':(names.length===1&&nameMatch(tv,names[0])?'Yes':'No')); }
      else mm=(!String(tv).trim()&&!String(av).trim())?'n/a':(eq(tv,av)?'Yes':'No');
      var res=(oldRes[key]&&oldRes[key][f.n])||'';
      if(!res&&mm==='No'&&TEAM_DASH[f.n]&&c.jr.title&&jobGaps[c.jr.title]&&jobGaps[c.jr.title][f.n]==='-') res='Not actioning';
      if(mm==='No'&&!res){ act[f.n]=(act[f.n]||0)+1;
        if(MANUAL[f.n]) manual.push([key,c.tr.job,c.tr.name,f.n,tv,av,
          f.n==='Status'?'Fix in the Ashby UI - no API can change application status':
          (f.n==='Opening Quarter'?'Re-date the opening in Ashby UI: Job > Openings':'Manual review - DOJ comes from the offer start date')]); }
      line.push(tv,av,mm,res); });
    line.push(c.n>1?(c.n+' Ashby records'):'', c.tr.status, c.jr.how, c.jr.jstatus, c.op?'Yes':'No', c.jr.team||'', c.op?c.op.state:'');
    t1.push(line); });

  function write(tab,rows,freeze){ var sh=out.getSheetByName(tab);
    if(!sh) sh=out.insertSheet(tab); else { sh.clear().clearFormats();
      sh.getRange(1,1,sh.getMaxRows(),sh.getMaxColumns()).clearDataValidations();
      if(sh.getFrozenRows())sh.setFrozenRows(0); if(sh.getFrozenColumns())sh.setFrozenColumns(0); }
    sh.getRange(1,1,rows.length,rows[0].length).setValues(rows);
    sh.getRange(1,1,1,rows[0].length).setFontWeight('bold').setBackground('#334155').setFontColor('#ffffff');
    sh.setFrozenRows(1); if(freeze)sh.setFrozenColumns(1); return sh; }
  var sh4=write(V4_TAB,t1,true);
  for(var fi=0;fi<F.length;fi++){ var ac=3+fi*4; if(t1.length>1) sh4.getRange(2,ac,t1.length-1,1).setBackground('#f1f5f9'); sh4.getRange(1,ac).setBackground('#475569'); }
  write(MANUAL_TAB,manual,false);
  // distinct job mappings, for Jerin to review/correct
  var mm2={};
  ctx.forEach(function(c){ var k=(c.tr.job||'(blank)')+'||'+(c.jr.title||'(NONE)')+'||'+c.jr.how;
    if(!mm2[k]) mm2[k]={tj:c.tr.job||'(blank)', aj:c.jr.title||'(NONE)', how:c.jr.how, n:0, dept:c.tr.dept||''};
    mm2[k].n++; });
  var mrows=[['Tracker Job','Tracker Dept','Ashby Job (resolved)','How matched','Positions','YOUR CORRECTION (exact Ashby job title)']];
  Object.keys(mm2).map(function(k){return mm2[k];})
    .sort(function(a,b){ return b.n-a.n; })
    .forEach(function(x){ mrows.push([x.tj,x.dept,x.aj,x.how,x.n, prevCorr[norm(x.tj)]||'']); });
  // 🚨 NEVER write 'V4 Job Mapping Review' - it is hand-edited by Jerin. Generated view goes elsewhere.
  write(opts.mapTab||'V4 Mapping (generated)',mrows,false);
  Logger.log(LBL+' | distinct job mappings '+(mrows.length-1));
  Logger.log(LBL+' | ALIASES THAT MATCH NO ASHBY JOB ('+badAlias.length+'): '+badAlias.join(' ;; '));
  var tot=0; for(var a in act) tot+=act[a];
  Logger.log(LBL+' | rows '+(t1.length-1)+' | matched to offer '+matched+' | no opening paired '+noOpening);
  Logger.log(LBL+' | ACTIONABLE '+tot+' :: '+JSON.stringify(act));
  Logger.log(LBL+' | manual-fix rows '+(manual.length-1));
  var st={}; opsAll.forEach(function(o){ st[o.state||'(blank)']=(st[o.state||'(blank)']||0)+1; });
  Logger.log(LBL+' | 2026 opening states :: '+JSON.stringify(st));
  return out.getUrl();
}
// READ-ONLY: exact shape of opening customFields entries and job department.
function v4_probe2(){
  var out=[['section','a','b','c','d']];
  var jobs=ashbyListAll_('/job.list');
  out.push(['JOB_KEYS','',Object.keys(jobs[0]||{}).join(', '),'','']);
  var jd=jobs[0]||{};
  out.push(['JOB_DEPT_RAW','',JSON.stringify(jd.department||null).substring(0,120),'','']);
  out.push(['JOB_DEPTID','',String(jd.departmentId||''),'','']);
  // count how many jobs expose a usable department
  var withDept=0; jobs.forEach(function(j){ var d=j.department; if(d&&((d.name)||typeof d==='string'))withDept++; });
  out.push(['JOBS_WITH_DEPT','',withDept+' of '+jobs.length,'','']);
  // find an opening that HAS Role Complexity
  var all=ashbyListAll_('/opening.list'), found=0;
  for(var i=0;i<all.length&&found<2;i++){
    var o=all[i]; if(o.isArchived) continue;
    if(String(o.openedAt||'').substring(0,4)!=='2026') continue;
    var lv=o.latestVersion||{}, cfs=lv.customFields||[];
    var hit=null; for(var k=0;k<cfs.length;k++){ if(/Complexity/i.test(String(cfs[k].title||cfs[k].name||''))){hit=cfs[k];break;} }
    if(!hit) continue;
    found++;
    out.push(['CF_ENTRY_KEYS','',Object.keys(hit).join(', '),'','']);
    out.push(['CF_TITLE','',String(hit.title||hit.name||''),'','']);
    out.push(['CF_VALUE_TYPE','',(typeof hit.value),'','']);
    out.push(['CF_VALUE_JSON','',JSON.stringify(hit.value).substring(0,150),'','']);
    // dump every cf title+value on this opening
    for(var q=0;q<cfs.length;q++){
      out.push(['CF_ALL',String(cfs[q].title||cfs[q].name||''),(typeof cfs[q].value),JSON.stringify(cfs[q].value).substring(0,80),'']);
    }
  }
  out.push(['FOUND_WITH_CX','',found,'','']);
  var ss=SpreadsheetApp.openById(G22_AUDIT_ID);
  var sh=ss.getSheetByName('V4 Probe'); if(!sh) sh=ss.insertSheet('V4 Probe'); else sh.clear();
  var w=5; var norm=out.map(function(r){var x=r.slice(0,w); while(x.length<w)x.push(''); return x.map(function(z){return (z===null||z===undefined)?'':String(z);});});
  sh.getRange(1,1,norm.length,w).setValues(norm);
  SpreadsheetApp.flush(); Logger.log('probe2 rows '+norm.length);
}
// READ-ONLY: the Ashby department tree + how many 2026 jobs sit under each.
function v4_depts(){
  var out=[['level','department','parent','jobs2026','totalJobs']];
  var map=fetchDepartmentMap_();
  function top(id){ var d=map[id],g=0; while(d&&d.parentId&&map[d.parentId]&&g++<8) d=map[d.parentId]; return d?d.name:''; }
  var jobs=ashbyListAll_('/job.list');
  var cntAll={}, cnt2026={};
  jobs.forEach(function(j){ var id=j.departmentId; cntAll[id]=(cntAll[id]||0)+1; });
  // which jobs have a 2026 opening
  var jobHas={};
  ashbyListAll_('/opening.list').forEach(function(o){ if(o.isArchived) return;
    if(String(o.openedAt||'').substring(0,4)!=='2026') return;
    ((o.latestVersion&&o.latestVersion.jobIds)||[]).forEach(function(jid){ jobHas[jid]=1; }); });
  jobs.forEach(function(j){ if(jobHas[j.id]) cnt2026[j.departmentId]=(cnt2026[j.departmentId]||0)+1; });
  var ids=Object.keys(map);
  // roots first, then children
  var roots=ids.filter(function(i){ return !map[i].parentId||!map[map[i].parentId]; });
  roots.sort(function(a,b){ return String(map[a].name).localeCompare(String(map[b].name)); });
  roots.forEach(function(rid){
    out.push(['DEPARTMENT', map[rid].name, '', cnt2026[rid]||0, cntAll[rid]||0]);
    var kids=ids.filter(function(i){ return map[i].parentId===rid; });
    kids.sort(function(a,b){ return String(map[a].name).localeCompare(String(map[b].name)); });
    kids.forEach(function(kid){
      out.push(['  team', map[kid].name, map[rid].name, cnt2026[kid]||0, cntAll[kid]||0]);
      var g2=ids.filter(function(i){ return map[i].parentId===kid; });
      g2.forEach(function(gid){ out.push(['    sub', map[gid].name, map[kid].name, cnt2026[gid]||0, cntAll[gid]||0]); });
    });
  });
  out.push(['TOTALS','departments '+ids.length,'roots '+roots.length, jobs.length,'']);
  var ss=SpreadsheetApp.openById(G22_AUDIT_ID);
  var sh=ss.getSheetByName('V4 Probe'); if(!sh) sh=ss.insertSheet('V4 Probe'); else sh.clear();
  var w=5; var n=out.map(function(r){var x=r.slice(0,w); while(x.length<w)x.push(''); return x.map(function(z){return (z===null||z===undefined)?'':String(z);});});
  sh.getRange(1,1,n.length,w).setValues(n); SpreadsheetApp.flush();
  Logger.log('depts '+n.length);
}
// ===== Phase 3: fix what the API can fix =====================================
// MODES: 'dry' = plan only, no writes | 'pilot' = ONE write per field type | 'run' = full batch
// Reuses buildAuditV4's resolution by re-deriving it, so the plan matches the audit exactly.
var V4_RECRUITER_ROLE='22db8dc8-83f4-40de-8376-87efff4a6eb6';
function v4_fix(mode){
  mode=mode||'dry';
  var plan=v4_plan_();
  var rows=[['category','tracker job','opening id','field','from','to','status']];
  var counts={};
  function bump(k){ counts[k]=(counts[k]||0)+1; }
  var didPilot={};
  plan.forEach(function(p){
    bump(p.cat);
    var status='planned';
    var doIt = (mode==='run' && (p.cat==='SET_FIELD'||p.cat==='ADD_OWNER'||p.cat==='CHANGE_FIELD'||p.cat==='REPLACE_OWNER'))
            || (mode==='pilot' && !didPilot[p.cat] && (p.cat==='SET_FIELD'||p.cat==='ADD_OWNER'||p.cat==='REPLACE_OWNER'));
    if(doIt){
      didPilot[p.cat]=1;
      try{
        if(p.field==='Recruiter'){
          var nrm=0; (p.remove||[]).forEach(function(rid){ try{ ashbyWrite_('/hiringTeam.removeMember',{openingId:p.openingId,teamMemberId:rid,roleId:V4_RECRUITER_ROLE}); nrm++; }catch(e2){} Utilities.sleep(40); });
          ashbyWrite_('/hiringTeam.removeMember',{openingId:p.openingId,teamMemberId:p.userId,roleId:V4_RECRUITER_ROLE});
          var r2=ashbyWrite_('/hiringTeam.addMember',{openingId:p.openingId,teamMemberId:p.userId,roleId:V4_RECRUITER_ROLE});
          status='HTTP '+r2.code+' '+(JSON.parse(r2.text).success?'ok':'FAIL '+r2.text.substring(0,120));
        } else {
          var r3=ashbyWrite_('/customField.setValue',{objectType:'Opening',objectId:p.openingId,fieldId:p.fieldId,fieldValue:(p.send||p.to)});
          status='HTTP '+r3.code+' '+(JSON.parse(r3.text).success?'ok':'FAIL '+r3.text.substring(0,120));
        }
      }catch(e){ status='THREW '+e.message; }
      Utilities.sleep(60);
    }
    rows.push([p.cat,p.job,p.openingId,p.field,p.from||'(blank)',p.to,status]);
  });
  var out=SpreadsheetApp.openById(AUDIT_SHEET_ID);
  var sh=out.getSheetByName('V4 Fix Plan'); if(!sh) sh=out.insertSheet('V4 Fix Plan'); else sh.clear();
  sh.getRange(1,1,rows.length,7).setValues(rows.map(function(r){var x=r.slice(0,7); while(x.length<7)x.push(''); return x.map(function(z){return z==null?'':String(z);});}));
  sh.getRange(1,1,1,7).setFontWeight('bold'); sh.setFrozenRows(1);
  SpreadsheetApp.flush();
  Logger.log('v4fix ['+mode+'] plan '+(rows.length-1)+' :: '+JSON.stringify(counts));
}
// Derives the fix plan. READ-ONLY. Mirrors buildAuditV4's resolution rules.
function v4_plan_(){
  var TRACKER_ID='1_LQxHDZ6dXehyR2lc8pcFjfDeRaV80vBzVRB_BKWT5A';
  function norm(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(); }
  function words(s){ var t=norm(s).split(' '),o={}; for(var i=0;i<t.length;i++) if(t[i])o[t[i]]=1; return o; }
  function qtr(s){ return (s&&s.length>=7)?('Q'+(Math.floor((parseInt(s.substring(5,7),10)-1)/3)+1)+' '+s.substring(0,4)):''; }
  function eq(a,b){ return String(a).trim().toLowerCase()===String(b).trim().toLowerCase(); }
  function nameTok(s){ var t=norm(s).split(' '),o=[]; for(var i=0;i<t.length;i++) if(t[i]&&t[i].length>1)o.push(t[i]); return o; }
  function nameMatch(a,b){ var x=nameTok(a),y=nameTok(b); if(!x.length||!y.length)return false; var s=x.length<=y.length?x:y,l=x.length<=y.length?y:x; if(s.length===1)return s[0]===l[0]; for(var i=0;i<s.length;i++){var h=false; for(var j=0;j<l.length;j++) if(l[j]===s[i]){h=true;break;} if(!h)return false;} return true; }
  function cxMap(x){ var s=String(x||'').trim(); if(!s)return ''; var l=s.toLowerCase();
    if(l==='regular'||l==='normal')return 'Normal'; if(l==='complex')return 'Complex';
    if(l.replace(/\s+/g,'')==='ubercomplex')return 'Uber Complex'; return s; }
  function rtMap(x){ var s=String(x||'').trim().replace(/^\s*\d+\s*[.)\-]\s*/,''); if(!s)return ''; var l=s.toLowerCase();
    if(l==='new')return 'New'; if(l==='replacement')return 'Replacement'; if(l==='buffer')return 'Buffer';
    if(l.indexOf('anticipation')>-1)return 'Anticipation Of Exit'; if(l.indexOf('aop')>-1)return 'As per AOP'; return s; }
  var out=SpreadsheetApp.openById(AUDIT_SHEET_ID);
  // read Jerin's mapping decisions (READ ONLY)
  var ALIAS={}, NOMAP={};
  var rvs=out.getSheetByName('V4 Job Mapping Review');
  if(rvs){ var rvv=rvs.getDataRange().getValues(), rh=rvv[0]||[], cJ=-1,cC=-1;
    for(var ci=0;ci<rh.length;ci++){ var hn=String(rh[ci]||'').trim();
      if(/^tracker job$/i.test(hn))cJ=ci; if(/correction/i.test(hn))cC=ci; }
    for(var ri=1;ri<rvv.length;ri++){ var tj=String(rvv[ri][cJ]||'').trim(), cv=String(rvv[ri][cC]||'').trim();
      if(!tj||!cv) continue;
      if(/^(don'?t\s*map|do\s*not\s*map|no\s*map)$/i.test(cv)){ NOMAP[norm(tj)]=1; continue; }
      if(!/^correct$/i.test(cv)) ALIAS[norm(tj)]=cv; } }
  var deptMap=fetchDepartmentMap_();
  function topD(id){ var d=deptMap[id],g=0; while(d&&d.parentId&&deptMap[d.parentId]&&g++<8) d=deptMap[d.parentId]; return d?d.name:''; }
  var jobs=ashbyListAll_('/job.list'), byTitle={};
  jobs.forEach(function(j){ byTitle[norm(j.title)]={id:j.id,title:j.title||'',dept:topD(j.departmentId)||''}; });
  var users=ashbyListAll_('/user.list',{includeDeactivated:true});
  function findUser(nm){ if(!nm)return null; var hits=users.filter(function(u){ return nameMatch(nm,u.name||(((u.firstName||'')+' '+(u.lastName||'')).trim())); }); return hits.length===1?hits[0]:null; }
  // Resolved recruiter name -> Ashby user, from the reviewed 'V4 Recruiter Match' tab.
  var RECMAP={};
  (function(){
    var rms=out.getSheetByName('V4 Recruiter Match'); if(!rms) return;
    var rv=rms.getDataRange().getValues(), rh=rv[0]||[], cN=-1,cP=-1,cO=-1;
    for(var i=0;i<rh.length;i++){ var h=String(rh[i]||'').trim();
      if(/^tracker recruiter$/i.test(h)) cN=i;
      if(/auto pick/i.test(h)) cP=i;
      if(/override/i.test(h)) cO=i; }
    if(cN<0||cP<0) return;
    var byName={}; users.forEach(function(u){ byName[norm(u.name||(((u.firstName||'')+' '+(u.lastName||'')).trim()))]=u; });
    for(var r2=1;r2<rv.length;r2++){
      var tn=String(rv[r2][cN]||'').trim(); if(!tn) continue;
      var pick=(cO>-1?String(rv[r2][cO]||'').trim():'') || String(rv[r2][cP]||'').trim();
      if(!pick||/NO MATCH/i.test(pick)) continue;
      var u2=byName[norm(pick)]; if(u2) RECMAP[norm(tn)]=u2; }
  })();
  Logger.log('plan | RECMAP size '+Object.keys(RECMAP).length+' | users '+users.length);
  var cfById={}, cfByTitle={};
  ashbyListAll_('/customField.list').forEach(function(f){ if(String(f.objectType||'')!=='Opening')return;
    var opts={}; (f.selectableValues||[]).forEach(function(o){ var lab=String(o.label||o.value||o); if(o&&o.value!=null&&!o.isArchived) opts[lab.toLowerCase()]=o.value; });
    cfByTitle[String(f.title||'')]={id:f.id,title:f.title,type:String(f.fieldType||''),opts:opts,nOpts:Object.keys(opts).length}; });
  var bucket={};
  ashbyListAll_('/opening.list').forEach(function(o){
    if(o.isArchived) return; var oa=String(o.openedAt||''); if(oa.substring(0,4)!=='2026') return;
    var lv=o.latestVersion||{}, cf={};
    (lv.customFields||[]).forEach(function(f){ var lab=(f.valueLabel==null||f.valueLabel==='')?(f.value==null?'':f.value):f.valueLabel; cf[String(f.title||'')]=String(lab); });
    var recs=[]; (lv.hiringTeam||[]).forEach(function(h){ if(/recruiter/i.test(String(h.role||h.roleName||''))) recs.push({id:h.userId,name:''}); });
    var op={id:o.id,q:qtr(oa),cx:cxMap(cf['Role Complexity (Opening)']||''),rt:rtMap(cf['Role Type']||''),emp:String(cf['Employment Type']||''),recs:recs,used:false};
    (lv.jobIds||[]).forEach(function(jid){ var k=jid+'|'+op.q; (bucket[k]=bucket[k]||[]).push(op); }); });
  var vals=SpreadsheetApp.openById(TRACKER_ID).getSheetByName('Master').getDataRange().getValues(), hdr=vals[0];
  function col(n){ for(var i=0;i<hdr.length;i++) if(String(hdr[i]).trim()===n) return i; return -1; }
  var C={jcq:col('Job Creation Quarter'),job:col('Job Name'),dept:col('Department'),rec:col('Recruiter'),
         role:col('Role Type'),emp:col('Employment Type'),cx:col('Role Complexity')};
  function fuzzy(title,dh){ var x=words(title),kx=Object.keys(x); if(!kx.length)return null; var best=null,bs=0;
    for(var k in byTitle){ var j2=byTitle[k],y=words(j2.title),ky=Object.keys(y),n=0;
      for(var i=0;i<kx.length;i++) if(y[kx[i]])n++;
      var den=Math.max(kx.length,ky.length)||1, sc=n/den;
      if(dh&&norm(j2.dept)&&norm(j2.dept)===norm(dh)) sc+=0.15;
      if(sc>bs){bs=sc;best=j2;} } return bs>=0.6?best:null; }
  var plan=[];
  for(var r=1;r<vals.length;r++){
    var row=vals[r], jcq=String(row[C.jcq]||'').trim(); if(!/2026$/.test(jcq)) continue;
    var tjob=String(row[C.job]||'').trim(); if(NOMAP[norm(tjob)]) continue;
    var jr=null, al=ALIAS[norm(tjob)];
    if(al&&byTitle[norm(al)]) jr=byTitle[norm(al)];
    if(!jr) jr=byTitle[norm(tjob)];
    if(!jr) jr=fuzzy(tjob,String(row[C.dept]||''));
    if(!jr) continue;
    var pool=bucket[jr.id+'|'+jcq]||[], best=null,bs=-1;
    var tcx=cxMap(row[C.cx]), trt=rtMap(row[C.role]), temp=String(row[C.emp]||'').trim(), trec=String(row[C.rec]||'').trim();
    pool.forEach(function(o){ if(o.used)return; var s=0;
      if(o.cx&&eq(o.cx,tcx))s++; if(o.rt&&eq(o.rt,trt))s++; if(o.emp&&eq(o.emp,temp))s++;
      if(s>bs){bs=s;best=o;} });
    if(!best) continue; best.used=true;
    function push(field,cur,want,cfTitle){
      if(!want) return;
      if(eq(cur,want)) return;
      var f=cfByTitle[cfTitle]; if(!f) return;
      var send=want; if(f.nOpts){ var oid=f.opts[String(want).toLowerCase()]; if(!oid){ plan.push({cat:'SKIP_NO_OPTION', job:tjob, openingId:best.id, field:field, from:cur, to:want}); return; } send=oid; } plan.push({cat: cur?'CHANGE_FIELD':'SET_FIELD', job:tjob, openingId:best.id, field:field, fieldId:f.id, from:cur, to:want, send:send});
    }
    push('Complexity',best.cx,tcx,'Role Complexity (Opening)');
    push('Role Type',best.rt,trt,'Role Type');
    push('Employment Type',best.emp,temp,'Employment Type');
    if(trec){ var u=RECMAP[norm(trec)]||findUser(trec);
      if(!u) plan.push({cat:'SKIP_NO_USER', job:tjob, openingId:best.id, field:'Recruiter', from:'', to:trec});
      else {
        var has=best.recs.some(function(x){return x.id===u.id;});
        var others=best.recs.filter(function(x){return x.id!==u.id;}).map(function(x){return x.id;});
        // Jerin's solo-recruiter rule: exactly one Recruiter per opening, remove the rest.
        if(!has || others.length){
          plan.push({cat:(!has&&!others.length)?'ADD_OWNER':'REPLACE_OWNER', job:tjob, openingId:best.id,
            field:'Recruiter', userId:u.id, remove:others,
            from:(has?('correct + '+others.length+' extra'):(others.length+' wrong')), to:trec});
        } } }
  }
  return plan;
}

// READ ONLY: report the rows the pilot actually wrote, and read them back from Ashby.
function v4_pilotCheck(){
  var sh=SpreadsheetApp.openById(AUDIT_SHEET_ID).getSheetByName('V4 Fix Plan');
  var vals=sh.getDataRange().getValues();
  var acted=[];
  for(var i=1;i<vals.length;i++){ var st=String(vals[i][6]||''); if(st&&st!=='planned') acted.push(vals[i]); }
  Logger.log('PILOT wrote '+acted.length+' rows');
  acted.forEach(function(r){ Logger.log('W :: '+r[3]+' | from "'+r[4]+'" to "'+r[5]+'" | '+r[6]); });
  // read back each touched opening
  acted.forEach(function(r){
    var res=ashbyWrite_('/opening.info',{openingId:r[2]});
    try{ var o=JSON.parse(res.text).results, lv=o.latestVersion||{}, cf={};
      (lv.customFields||[]).forEach(function(f){ var lab=(f.valueLabel==null||f.valueLabel==='')?f.value:f.valueLabel; cf[String(f.title||'')]=String(lab); });
      var recs=(lv.hiringTeam||[]).filter(function(h){return /recruiter/i.test(String(h.role||''));}).length;
      Logger.log('RB :: '+r[3]+' -> Complexity="'+(cf['Role Complexity (Opening)']||'')+'" RoleType="'+(cf['Role Type']||'')+'" EmpType="'+(cf['Employment Type']||'')+'" recruiters='+recs);
    }catch(e){ Logger.log('RB :: failed '+e.message); }
  });
}


// READ ONLY: what shape are the selectable options on the two failing fields?
function v4_optProbe(){
  var fs=ashbyListAll_('/customField.list');
  fs.forEach(function(f){
    if(String(f.objectType||'')!=='Opening') return;
    var t=String(f.title||'');
    if(!/Complexity|Employment Type|Role Type/i.test(t)) return;
    Logger.log('F :: '+t+' | type='+f.fieldType+' | keys='+Object.keys(f).join(','));
    var sv=f.selectableValues||f.options||f.values||[];
    Logger.log('F ::   optCount='+sv.length+' firstType='+(typeof sv[0]));
    if(sv.length) Logger.log('F ::   first='+JSON.stringify(sv[0]).substring(0,160));
  });
}

// READ-ONLY vs Ashby. Fuzzy-matches every unresolved tracker recruiter name to Ashby users.
// Writes 'V4 Recruiter Match' for Jerin to pick. That tab is HAND-EDITED - never rewritten once filled.
function v4_recruiterMatch(){
  var TRACKER_ID='1_LQxHDZ6dXehyR2lc8pcFjfDeRaV80vBzVRB_BKWT5A';
  function norm(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(); }
  function tok(s){ return norm(s).split(' ').filter(function(x){return x&&x.length>1;}); }
  function score(a,b){ var x=tok(a),y=tok(b); if(!x.length||!y.length)return 0;
    var n=0; for(var i=0;i<x.length;i++) for(var j=0;j<y.length;j++){ if(x[i]===y[j]){n+=1;break;}
      else if(y[j].indexOf(x[i])===0||x[i].indexOf(y[j])===0){n+=0.6;break;} }
    return n/Math.max(x.length,y.length); }
  var users=ashbyListAll_('/user.list',{includeDeactivated:true}).map(function(u){
    return {id:u.id, name:(((u.firstName||'')+' '+(u.lastName||'')).trim()||u.name||''), email:String(u.email||''), on:(u.isEnabled?'active':'INACTIVE'), role:String(u.globalRole||'')}; })
    .filter(function(u){ return u.name; });
  var vals=SpreadsheetApp.openById(TRACKER_ID).getSheetByName('Master').getDataRange().getValues(), hdr=vals[0];
  function col(n){ for(var i=0;i<hdr.length;i++) if(String(hdr[i]).trim()===n) return i; return -1; }
  var cQ=col('Job Creation Quarter'), cR=col('Recruiter');
  var tally={};
  for(var r=1;r<vals.length;r++){ if(!/2026$/.test(String(vals[r][cQ]||'').trim())) continue;
    var nm=String(vals[r][cR]||'').trim(); if(!nm) continue; tally[nm]=(tally[nm]||0)+1; }
  var rows=[['Tracker Recruiter','Positions 2026','Exact Ashby match?','Best guess 1','score 1','Best guess 2','score 2','Best guess 3','score 3','YOUR PICK (exact Ashby name)']];
  Object.keys(tally).sort(function(a,b){return tally[b]-tally[a];}).forEach(function(nm){
    var scored=users.map(function(u){ return {u:u,s:score(nm,u.name)}; })
      .sort(function(a,b){ return b.s-a.s; });
    var exact=users.filter(function(u){ return norm(u.name)===norm(nm); });
    var top=scored.slice(0,3);
    rows.push([nm, tally[nm], exact.length===1?('YES - '+exact[0].name+' ['+exact[0].on+']'):(exact.length>1?('AMBIGUOUS x'+exact.length):'no'),
      top[0]?(top[0].u.name+' ['+top[0].u.on+']'):'', top[0]?Math.round(top[0].s*100)/100:'',
      top[1]?(top[1].u.name+' ['+top[1].u.on+']'):'', top[1]?Math.round(top[1].s*100)/100:'',
      top[2]?(top[2].u.name+' ['+top[2].u.on+']'):'', top[2]?Math.round(top[2].s*100)/100:'', '']); });
  var out=SpreadsheetApp.openById(AUDIT_SHEET_ID);
  var sh=out.getSheetByName('V4 Recruiter Match');
  if(sh){ var ex=sh.getDataRange().getValues(), picked=0;
    for(var q=1;q<ex.length;q++){ if(String(ex[q][9]||'').trim()) picked++; }
    if(picked){ Logger.log('rec | '+picked+' picks already filled - NOT overwriting.'); return; }
    sh.clear(); }
  else sh=out.insertSheet('V4 Recruiter Match');
  sh.getRange(1,1,rows.length,10).setValues(rows.map(function(r){var x=r.slice(0,10); while(x.length<10)x.push(''); return x.map(function(z){return z==null?'':z;});}));
  sh.getRange(1,1,1,10).setFontWeight('bold').setBackground('#334155').setFontColor('#ffffff');
  sh.setFrozenRows(1);
  Logger.log('rec | distinct tracker recruiters '+(rows.length-1)+' | ashby users '+users.length);
}

// READ ONLY: does user.list include deactivated users? What flags does a user carry?
function v4_userProbe(){
  var u=ashbyListAll_('/user.list');
  Logger.log('U | default count '+u.length);
  Logger.log('U | keys '+Object.keys(u[0]||{}).join(','));
  var flags={};
  u.forEach(function(x){ ['isEnabled','isDisabled','isDeactivated','status','globalRole','accessLevel'].forEach(function(k){
    if(x[k]!==undefined){ var kk=k+'='+String(x[k]); flags[kk]=(flags[kk]||0)+1; } }); });
  Logger.log('U | flags '+JSON.stringify(flags).substring(0,400));
  // try asking for deactivated users explicitly
  ['includeDeactivated','includeDisabled','includeArchived'].forEach(function(p){
    try{ var o={}; o[p]=true; var r=ashbyListAll_('/user.list',o);
      Logger.log('U | with '+p+'=true -> '+r.length); }catch(e){ Logger.log('U | '+p+' threw '+e.message); } });
  // is Smriti Das findable at all?
  ['smriti','das','sangha'].forEach(function(q){
    var hits=u.filter(function(x){ var n=(((x.firstName||'')+' '+(x.lastName||'')).trim()||x.name||'').toLowerCase();
      return n.indexOf(q)>-1; });
    Logger.log('U | search "'+q+'" -> '+hits.length+' :: '+hits.map(function(x){return ((x.firstName||'')+' '+(x.lastName||'')).trim();}).join(' | ')); });
}

// Auto-resolves every tracker recruiter name to ONE Ashby user.
// Rules: exact name > best token score; ties broken by (1) actually used as Recruiter on 2026 openings,
// (2) active over deactivated. Writes AUTO PICK + why into 'V4 Recruiter Match'. READ-ONLY vs Ashby.
// 'Bullseye' is an agency/source name sitting in the tracker's Recruiter column, not a person.
// Jerin (6 Sep): delegate those to Aditya Singh, and list them for a manual pass.
var RECRUITER_ALIAS={'bullseye':'Aditya Singh'};
function v4_recruiterAuto(){
  var TRACKER_ID='1_LQxHDZ6dXehyR2lc8pcFjfDeRaV80vBzVRB_BKWT5A';
  function norm(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(); }
  function tok(s){ return norm(s).split(' ').filter(function(x){return x&&x.length>1;}); }
  // A shorter name fully contained in a longer one is a PERFECT match, not a partial:
  // 'Tina' vs 'Tina Anisha Bibeiro' is the same person. Only genuinely divergent names score below 1.
  function score(a,b){ var x=tok(a),y=tok(b); if(!x.length||!y.length)return 0;
    var s=x.length<=y.length?x:y, l=x.length<=y.length?y:x, all=true;
    for(var k=0;k<s.length;k++){ if(l.indexOf(s[k])<0){ all=false; break; } }
    if(all) return 1;
    var n=0;
    for(var i=0;i<x.length;i++) for(var j=0;j<y.length;j++){ if(x[i]===y[j]){n+=1;break;}
      else if(y[j].indexOf(x[i])===0||x[i].indexOf(y[j])===0){n+=0.6;break;} }
    return n/Math.max(x.length,y.length); }
  var users=ashbyListAll_('/user.list',{includeDeactivated:true}).map(function(u){
    return {id:u.id,name:(((u.firstName||'')+' '+(u.lastName||'')).trim()||u.name||''),on:!!u.isEnabled}; })
    .filter(function(u){return u.name;});
  // usage: how often each user is a Recruiter on a 2026 opening
  var use={};
  ashbyListAll_('/opening.list').forEach(function(o){ if(o.isArchived)return;
    if(String(o.openedAt||'').substring(0,4)!=='2026')return;
    ((o.latestVersion&&o.latestVersion.hiringTeam)||[]).forEach(function(h){
      if(/recruiter/i.test(String(h.role||''))) use[h.userId]=(use[h.userId]||0)+1; }); });
  var vals=SpreadsheetApp.openById(TRACKER_ID).getSheetByName('Master').getDataRange().getValues(), hdr=vals[0];
  function col(n){ for(var i=0;i<hdr.length;i++) if(String(hdr[i]).trim()===n) return i; return -1; }
  var cQ=col('Job Creation Quarter'), cR=col('Recruiter');
  var tally={};
  for(var r=1;r<vals.length;r++){ if(!/2026$/.test(String(vals[r][cQ]||'').trim()))continue;
    var nm=String(vals[r][cR]||'').trim(); if(nm) tally[nm]=(tally[nm]||0)+1; }
  var rows=[['Tracker Recruiter','Positions 2026','AUTO PICK','Active?','Why','Runner-up','Override (leave blank to accept)']];
  var unresolved=0;
  Object.keys(tally).sort(function(a,b){return tally[b]-tally[a];}).forEach(function(nm){
    var forced=RECRUITER_ALIAS[norm(nm)];
    if(forced){ var fu=users.filter(function(u){return norm(u.name)===norm(forced);})[0];
      if(fu){ rows.push([nm,tally[nm],fu.name,fu.on?'active':'INACTIVE','forced by Jerin - not a person, delegated','','']); return; } }
    var sc=users.map(function(u){return {u:u,s:score(nm,u.name)};}).sort(function(a,b){return b.s-a.s;});
    var exact=users.filter(function(u){return norm(u.name)===norm(nm);});
    var pick=null, why='';
    if(exact.length===1){ pick=exact[0]; why='exact name'; }
    else {
      var top=sc[0]; if(!top||top.s<0.3){ unresolved++; rows.push([nm,tally[nm],'(NO MATCH)','','best score '+(top?Math.round(top.s*100)/100:0),top?top.u.name:'','']); return; }
      var tied=sc.filter(function(x){ return Math.abs(x.s-top.s)<0.05; });
      if(tied.length===1){ pick=top.u; why='best score '+Math.round(top.s*100)/100; }
      else {
        tied.sort(function(a,b){ var ua=use[a.u.id]||0, ub=use[b.u.id]||0;
          if(ub!==ua) return ub-ua; return (b.u.on?1:0)-(a.u.on?1:0); });
        pick=tied[0].u;
        why='tie of '+tied.length+' at '+Math.round(top.s*100)/100+' -> used on '+(use[pick.id]||0)+' openings, '+(pick.on?'active':'inactive');
      }
    }
    var runner=sc.filter(function(x){return x.u.id!==pick.id;})[0];
    rows.push([nm,tally[nm],pick.name,pick.on?'active':'INACTIVE',why,runner?(runner.u.name+' ('+Math.round(runner.s*100)/100+')'):'','']);
  });
  var out=SpreadsheetApp.openById(AUDIT_SHEET_ID);
  var sh=out.getSheetByName('V4 Recruiter Match');
  if(sh){ var ex=sh.getDataRange().getValues(), eh=ex[0]||[], cOv=-1, picked=0;
    for(var q2=0;q2<eh.length;q2++) if(/override/i.test(String(eh[q2]||''))) cOv=q2;
    if(cOv>-1){ for(var q=1;q<ex.length;q++){ if(String(ex[q][cOv]||'').trim()) picked++; } }
    if(picked){ Logger.log('auto | '+picked+' overrides present - NOT overwriting.'); return; }
    sh.clear(); } else sh=out.insertSheet('V4 Recruiter Match');
  sh.getRange(1,1,rows.length,7).setValues(rows.map(function(r){var x=r.slice(0,7); while(x.length<7)x.push(''); return x.map(function(z){return z==null?'':z;});}));
  sh.getRange(1,1,1,7).setFontWeight('bold').setBackground('#334155').setFontColor('#ffffff');
  sh.setFrozenRows(1);
  Logger.log('auto | recruiters '+(rows.length-1)+' | unresolved '+unresolved+' | users '+users.length);
}
// READ ONLY: every 2026 tracker position whose Recruiter is 'Bullseye', for Jerin's manual fix.
function v4_bullseye(){
  var TRACKER_ID='1_LQxHDZ6dXehyR2lc8pcFjfDeRaV80vBzVRB_BKWT5A';
  var vals=SpreadsheetApp.openById(TRACKER_ID).getSheetByName('Master').getDataRange().getValues(), hdr=vals[0];
  function col(n){ for(var i=0;i<hdr.length;i++) if(String(hdr[i]).trim()===n) return i; return -1; }
  var C={q:col('Job Creation Quarter'),st:col('Overall Status'),dept:col('Department'),job:col('Job Name'),
         rec:col('Recruiter'),cand:col('Candidate Name'),email:col('Personal Email'),date:col('Date')};
  var rows=[['Tracker Quarter','Department','Job Name','Status','Candidate','Tracker Recruiter','Interim owner set in Ashby','Correct owner (fill in)']];
  for(var r=1;r<vals.length;r++){
    if(!/2026$/.test(String(vals[r][C.q]||'').trim())) continue;
    if(String(vals[r][C.rec]||'').trim().toLowerCase()!=='bullseye') continue;
    rows.push([String(vals[r][C.q]||''),String(vals[r][C.dept]||''),String(vals[r][C.job]||''),
      String(vals[r][C.st]||''),String(vals[r][C.cand]||''),String(vals[r][C.rec]||''),'Aditya Singh','']);
  }
  var out=SpreadsheetApp.openById(AUDIT_SHEET_ID);
  var sh=out.getSheetByName('V4 Bullseye - Manual');
  if(sh){ var ex=sh.getDataRange().getValues(), filled=0;
    for(var q=1;q<ex.length;q++){ if(String(ex[q][7]||'').trim()) filled++; }
    if(filled){ Logger.log('be | '+filled+' already filled - NOT overwriting.'); return; }
    sh.clear(); } else sh=out.insertSheet('V4 Bullseye - Manual');
  sh.getRange(1,1,rows.length,8).setValues(rows);
  sh.getRange(1,1,1,8).setFontWeight('bold').setBackground('#334155').setFontColor('#ffffff');
  sh.setFrozenRows(1);
  Logger.log('be | Bullseye positions '+(rows.length-1));
}
// Re-test (6 Sep): can openedAt be BACKDATED via the API? Last measured 1 Sep = no.
// Creates ONE opening on the Hello Christy sandbox job, tries 3 write paths, reads back each,
// then ARCHIVES the test opening so nothing is left behind.
function v4_dateTest(){
  var TARGET='2026-02-15';   // Q1 2026 - deliberately a past quarter
  var jobs=ashbyListAll_('/job.list'), job=null;
  for(var i=0;i<jobs.length;i++) if(/Hello Christy/i.test(jobs[i].title||'')){ job=jobs[i]; break; }
  if(!job){ Logger.log('DT | sandbox job not found - ABORT'); return; }
  Logger.log('DT | sandbox job: '+job.title);
  ashbyListAll_('/customField.list').forEach(function(f){ if(String(f.objectType||'')!=='Opening')return;
    Logger.log('DT-REQ | '+f.title+' | required='+f.isRequired+' | type='+f.fieldType+' | archived='+f.isArchived); });
  function rb(tag,oid){
    var r=ashbyWrite_('/opening.info',{openingId:oid});
    try{ var o=JSON.parse(r.text).results;
      Logger.log('DT | '+tag+' -> openedAt='+o.openedAt+' state='+o.openingState);
      return String(o.openedAt||''); }
    catch(e){ Logger.log('DT | '+tag+' read-back FAILED'); return ''; } }
  // 1. create with openedAt in the body
  // resolve the required Opening custom fields and their option VALUES
  var cf={}; ashbyListAll_('/customField.list').forEach(function(f){ if(String(f.objectType||'')!=='Opening')return;
    var opts={}; (f.selectableValues||[]).forEach(function(o){ if(o&&o.value!=null&&!o.isArchived) opts[String(o.label||o.value).toLowerCase()]=o.value; });
    cf[String(f.title||'')]={id:f.id,opts:opts,type:String(f.fieldType||'')}; });
  function cfv(title,label){ var f=cf[title]; if(!f) return null; return f.opts[String(label).toLowerCase()]||label; }
  var reqEntries=[
    {id:cf['Role Type'].id,                  value:cfv('Role Type','New')},
    {id:cf['Role Complexity (Opening)'].id,  value:cfv('Role Complexity (Opening)','Normal')},
    {id:cf['Replacement of, if applicable'].id, value:'API date test'}
  ];
  var base={ identifier:'ZZ API date test - delete me', description:'openedAt re-test 6 Sep',
    jobIds:[job.id], openedAt:TARGET, targetStartDate:TARGET, targetHireDate:TARGET,
    employmentType:'FullTime', isBackfill:false, openingState:'Open' };
  // Ashby publishes no schema - try the plausible custom-field shapes, stop at the first that creates
  var byId={}; reqEntries.forEach(function(e){ byId[e.id]=e.value; });
  var byTitle={'Role Type':cfv('Role Type','New'),'Role Complexity (Opening)':cfv('Role Complexity (Opening)','Normal'),'Replacement of, if applicable':'API date test'};
  var e2=[{fieldId:cf['Role Type'].id,fieldValue:cfv('Role Type','New')},{fieldId:cf['Role Complexity (Opening)'].id,fieldValue:cfv('Role Complexity (Opening)','Normal')},{fieldId:cf['Replacement of, if applicable'].id,fieldValue:'API date test'}];
  var RT=cfv('Role Type','New'), RC=cfv('Role Complexity (Opening)','Normal'), RP='NA';
  var e2=[{fieldId:cf['Role Type'].id,fieldValue:RT},{fieldId:cf['Role Complexity (Opening)'].id,fieldValue:RC},{fieldId:cf['Replacement of, if applicable'].id,fieldValue:RP}];
  // top-level variants: by TITLE, by FIELD ID, and a couple of other documented-ish keys
  var topTitle={}; topTitle['Role Type']=RT; topTitle['Role Complexity (Opening)']=RC; topTitle['Replacement of, if applicable']=RP;
  var topId={}; topId[cf['Role Type'].id]=RT; topId[cf['Role Complexity (Opening)'].id]=RC; topId[cf['Replacement of, if applicable'].id]=RP;
  var shapes=[['__TOPLEVEL_TITLE__',topTitle],['__TOPLEVEL_ID__',topId],['customFieldSubmissions',e2],['openingCustomFields',e2]];
  var made=null, usedShape='';
  for(var si=0; si<shapes.length && !made; si++){
    var body={}; for(var k in base) body[k]=base[k];
    if(shapes[si][0]==='__TOPLEVEL_TITLE__'||shapes[si][0]==='__TOPLEVEL_ID__'){ var mp=shapes[si][1]; for(var kk in mp) body[kk]=mp[kk]; }
    else body[shapes[si][0]]=shapes[si][1];
    var res=ashbyWrite_('/opening.create', body);
    try{ made=JSON.parse(res.text).results; }catch(e){ made=null; }
    Logger.log('DT | shape "'+shapes[si][0]+'" -> '+(made?'CREATED':'rejected :: '+res.text.substring(0,150)));
    if(made) usedShape=shapes[si][0];
    Utilities.sleep(300);
  }
  if(!made){ Logger.log('DT | all shapes rejected - cannot create via API'); return; }
  Logger.log('DT | created using shape: '+usedShape+' | sent openedAt='+TARGET);
  var a=rb('AFTER CREATE', made.id);
  // 2. opening.update
  var u=ashbyWrite_('/opening.update',{openingId:made.id, openedAt:TARGET});
  Logger.log('DT | opening.update HTTP '+u.code+' :: '+u.text.substring(0,140));
  var b2=rb('AFTER opening.update', made.id);
  // 3. setOpeningState carrying openedAt
  var s=ashbyWrite_('/opening.setOpeningState',{openingId:made.id, openingState:'Open', openedAt:TARGET});
  Logger.log('DT | setOpeningState HTTP '+s.code+' :: '+s.text.substring(0,140));
  var c=rb('AFTER setOpeningState', made.id);
  Logger.log('DT | RESULT :: target '+TARGET+' | create='+a+' | update='+b2+' | setState='+c);
  Logger.log('DT | BACKDATING WORKS? '+((a===TARGET||b2===TARGET||c===TARGET)?'YES':'NO - still UI only'));
  // 4. clean up
  var ar=ashbyWrite_('/opening.setArchived',{openingId:made.id, archive:true});
  Logger.log('DT | cleanup archive HTTP '+ar.code+' :: '+ar.text.substring(0,90));
}
// Candidate-level recruiter fixes. APPLICATION-scoped only — a JOB-level removal cascades
// onto every application (the 31 Aug wipe). mode: 'dry' | 'run'.
function v4_fixCandRec(mode){
  mode=mode||'dry';
  var TRACKER_ID='1_LQxHDZ6dXehyR2lc8pcFjfDeRaV80vBzVRB_BKWT5A';
  function norm(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(); }
  function nrm(e){ return String(e||'').replace(/\s+/g,'').toLowerCase(); }
  function tokn(s){ return norm(s).split(' ').filter(function(x){return x&&x.length>1;}); }
  function nameMatch(a,b){ var x=tokn(a),y=tokn(b); if(!x.length||!y.length)return false;
    var s=x.length<=y.length?x:y,l=x.length<=y.length?y:x;
    for(var i=0;i<s.length;i++){ if(l.indexOf(s[i])<0) return false; } return true; }
  var out=SpreadsheetApp.openById(AUDIT_SHEET_ID);
  var users=ashbyListAll_('/user.list',{includeDeactivated:true}).map(function(u){
    return {id:u.id,name:(((u.firstName||'')+' '+(u.lastName||'')).trim()||u.name||'')}; });
  // recruiter name -> user, from the reviewed tab
  var RECMAP={}, byName={};
  users.forEach(function(u){ byName[norm(u.name)]=u; });
  var rms=out.getSheetByName('V4 Recruiter Match');
  if(rms){ var rv=rms.getDataRange().getValues(), rh=rv[0]||[], cN=-1,cP=-1,cO=-1;
    for(var i=0;i<rh.length;i++){ var h=String(rh[i]||'').trim();
      if(/^tracker recruiter$/i.test(h))cN=i; if(/auto pick/i.test(h))cP=i; if(/override/i.test(h))cO=i; }
    for(var r=1;r<rv.length;r++){ var tn=String(rv[r][cN]||'').trim(); if(!tn)continue;
      var pk=(cO>-1?String(rv[r][cO]||'').trim():'')||String(rv[r][cP]||'').trim();
      if(!pk||/NO MATCH/i.test(pk))continue; var u2=byName[norm(pk)]; if(u2) RECMAP[norm(tn)]=u2; } }
  // Ashby candidate records
  var it=DriveApp.getFilesByName('offer_contacts.json');
  if(!it.hasNext()) throw new Error('offer_contacts.json missing');
  var ash=JSON.parse(it.next().getBlob().getDataAsString()).rows, byEmail={};
  ash.forEach(function(x){ var e=nrm(x.email); if(e) (byEmail[e]=byEmail[e]||[]).push(x); });
  var vals=SpreadsheetApp.openById(TRACKER_ID).getSheetByName('Master').getDataRange().getValues(), hdr=vals[0];
  function col(n){ for(var i=0;i<hdr.length;i++) if(String(hdr[i]).trim()===n) return i; return -1; }
  var cQ=col('Job Creation Quarter'), cR=col('Recruiter'), cE=col('Personal Email'), cN2=col('Candidate Name');
  var rows=[['candidate','tracker recruiter','ashby recruiter','applicationId','action','status']], counts={};
  function bump(k){ counts[k]=(counts[k]||0)+1; }
  for(var r2=1;r2<vals.length;r2++){
    if(!/2026$/.test(String(vals[r2][cQ]||'').trim())) continue;
    var em=nrm(vals[r2][cE]); if(!em||!byEmail[em]) continue;
    var trec=String(vals[r2][cR]||'').trim(); if(!trec) continue;
    var u=RECMAP[norm(trec)]; if(!u){ bump('SKIP_NO_USER'); continue; }
    var m=byEmail[em][0];
    var cur=String(m.recruiter||'');
    if(cur && nameMatch(trec,cur)) { bump('ALREADY_OK'); continue; }
    bump(cur?'REPLACE':'ADD');
    var status='planned';
    if(mode==='run' && m.applicationId){
      try{
        var rr=ashbyWrite_('/application.removeHiringTeamMember',{applicationId:m.applicationId, teamMemberId:u.id, roleId:V4_RECRUITER_ROLE});
        var ar=ashbyWrite_('/application.addHiringTeamMember',{applicationId:m.applicationId, teamMemberId:u.id, roleId:V4_RECRUITER_ROLE});
        status='HTTP '+ar.code+' '+(JSON.parse(ar.text).success?'ok':'FAIL '+ar.text.substring(0,120));
      }catch(e){ status='THREW '+e.message; }
      Utilities.sleep(90);
    }
    rows.push([String(vals[r2][cN2]||''), trec, cur||'(none)', m.applicationId||'(none)', cur?'replace':'add', status]);
  }
  var sh=out.getSheetByName('V4 Candidate Recruiter Fix');
  if(!sh) sh=out.insertSheet('V4 Candidate Recruiter Fix'); else sh.clear();
  sh.getRange(1,1,rows.length,6).setValues(rows);
  sh.getRange(1,1,1,6).setFontWeight('bold'); sh.setFrozenRows(1);
  Logger.log('CR ['+mode+'] rows '+(rows.length-1)+' :: '+JSON.stringify(counts));
}
// READ ONLY: do we have an offerId to target with offer.setDecidedAt?
function v4_offerProbe(){
  var it=DriveApp.getFilesByName('offer_contacts.json');
  if(!it.hasNext()){ Logger.log('OP | offer_contacts.json missing'); return; }
  var rows=JSON.parse(it.next().getBlob().getDataAsString()).rows;
  Logger.log('OP | offer_contacts rows '+rows.length);
  Logger.log('OP | keys: '+Object.keys(rows[0]||{}).join(', '));
  var withOffer=0; rows.forEach(function(r){ if(r.offerId) withOffer++; });
  Logger.log('OP | rows carrying offerId: '+withOffer);
  // fallback: can offer.list give us offerId by application?
  var offers=ashbyListAll_('/offer.list');
  Logger.log('OP | offer.list count '+offers.length+' | keys '+Object.keys(offers[0]||{}).join(', '));
  var byApp=0; offers.forEach(function(o){ if(o.applicationId) byApp++; });
  Logger.log('OP | offers with applicationId: '+byApp);
}
// Offer Quarter fixes. Jerin (6 Sep): the Hiring Tracker is AUTHORITATIVE for offer dates.
// Rewrites offer.decidedAt to the tracker's 'Date of Offer'. mode: 'dry' | 'pilot' | 'run'.
function v4_fixOfferQ(mode){
  // 🚨 DO NOT RUN. Jerin's decision (6 Sep 2026): write NOTHING for Offer Quarter.
  // decidedAt is a bulk data-entry stamp (46 offers share 2026-09-02), not a decision date.
  // The real offer date is offerCreatedAt, which matches the tracker exactly and has no write API.
  if(mode!=='dry') throw new Error('v4_fixOfferQ: writing is disabled by decision (6 Sep). Dry run only.');
  mode=mode||'dry';
  var TRACKER_ID='1_LQxHDZ6dXehyR2lc8pcFjfDeRaV80vBzVRB_BKWT5A';
  var TZ='UTC';
  function nrm(e){ return String(e||'').replace(/\s+/g,'').toLowerCase(); }
  function d2s(x){ if(!x) return '';
    if(Object.prototype.toString.call(x)==='[object Date]') return Utilities.formatDate(x,TZ,'yyyy-MM-dd');
    return String(x).trim().substring(0,10); }
  function qtr(s){ return (s&&s.length>=7)?('Q'+(Math.floor((parseInt(s.substring(5,7),10)-1)/3)+1)+' '+s.substring(0,4)):''; }
  var it=DriveApp.getFilesByName('offer_contacts.json');
  if(!it.hasNext()) throw new Error('offer_contacts.json missing');
  var ash=JSON.parse(it.next().getBlob().getDataAsString()).rows, byEmail={};
  ash.forEach(function(x){ var e=nrm(x.email); if(e && !byEmail[e]) byEmail[e]=x; });
  // applicationId -> the most recently decided offer
  var offerByApp={};
  ashbyListAll_('/offer.list').forEach(function(o){
    var a=o.applicationId; if(!a) return;
    var prev=offerByApp[a];
    if(!prev || String(o.decidedAt||'') > String(prev.decidedAt||'')) offerByApp[a]=o; });
  var ss=SpreadsheetApp.openById(TRACKER_ID); TZ=ss.getSpreadsheetTimeZone()||'UTC';
  var vals=ss.getSheetByName('Master').getDataRange().getValues(), hdr=vals[0];
  function col(n){ for(var i=0;i<hdr.length;i++) if(String(hdr[i]).trim()===n) return i; return -1; }
  var cQ=col('Job Creation Quarter'), cE=col('Personal Email'), cN=col('Candidate Name'), cD=col('Date of Offer');
  var rows=[['candidate','tracker offer date','tracker Q','ashby decidedAt','ashby Q','offerId','status']];
  var counts={}; function bump(k){counts[k]=(counts[k]||0)+1;}
  var didPilot=false;
  for(var r=1;r<vals.length;r++){
    if(!/2026$/.test(String(vals[r][cQ]||'').trim())) continue;
    var em=nrm(vals[r][cE]); if(!em||!byEmail[em]) continue;
    var td=d2s(vals[r][cD]); if(!td){ bump('NO_TRACKER_DATE'); continue; }
    var m=byEmail[em];
    var off=offerByApp[m.applicationId];
    if(!off){ bump('NO_OFFER_RECORD'); continue; }
    var ad=d2s(off.decidedAt);
    if(qtr(td)===qtr(ad)){ bump('ALREADY_OK'); continue; }
    bump('FIX');
    var status='planned';
    var doIt=(mode==='run')||(mode==='pilot'&&!didPilot);
    if(doIt){ didPilot=true;
      try{ var res=ashbyWrite_('/offer.setDecidedAt',{offerId:off.id, decidedAt:td});
        status='HTTP '+res.code+' '+(JSON.parse(res.text).success?'ok':'FAIL '+res.text.substring(0,140));
      }catch(e){ status='THREW '+e.message; }
      if(mode==='pilot'){ var chk=ashbyWrite_('/offer.info',{offerId:off.id});
        try{ var oo=JSON.parse(chk.text).results; Logger.log('OQ-RB | wanted '+td+' -> decidedAt now '+d2s(oo.decidedAt)); }
        catch(e3){ Logger.log('OQ-RB | read-back failed :: '+chk.text.substring(0,140)); } }
      Utilities.sleep(90); }
    rows.push([String(vals[r][cN]||''), td, qtr(td), ad, qtr(ad), off.id, status]);
  }
  var out=SpreadsheetApp.openById(AUDIT_SHEET_ID);
  var sh=out.getSheetByName('V4 Offer Quarter Fix');
  if(!sh) sh=out.insertSheet('V4 Offer Quarter Fix'); else sh.clear();
  sh.getRange(1,1,rows.length,7).setValues(rows);
  sh.getRange(1,1,1,7).setFontWeight('bold'); sh.setFrozenRows(1);
  Logger.log('OQ ['+mode+'] rows '+(rows.length-1)+' :: '+JSON.stringify(counts));
}
// READ ONLY: for offers where the QUARTER differs, show tracker Date of Offer vs Ashby
// offerCreatedAt AND decidedAt, so we can see whether the gap is semantic (decision lag).
function v4_offerSamples(){
  var TRACKER_ID='1_LQxHDZ6dXehyR2lc8pcFjfDeRaV80vBzVRB_BKWT5A', TZ='UTC';
  function nrm(e){ return String(e||'').replace(/\s+/g,'').toLowerCase(); }
  function d2s(x){ if(!x) return '';
    if(Object.prototype.toString.call(x)==='[object Date]') return Utilities.formatDate(x,TZ,'yyyy-MM-dd');
    return String(x).trim().substring(0,10); }
  function qtr(s){ return (s&&s.length>=7)?('Q'+(Math.floor((parseInt(s.substring(5,7),10)-1)/3)+1)+' '+s.substring(0,4)):''; }
  function days(a,b){ if(!a||!b) return ''; return Math.round((new Date(b)-new Date(a))/86400000); }
  var it=DriveApp.getFilesByName('offer_contacts.json');
  var ash=JSON.parse(it.next().getBlob().getDataAsString()).rows, byEmail={};
  ash.forEach(function(x){ var e=nrm(x.email); if(e&&!byEmail[e]) byEmail[e]=x; });
  var ss=SpreadsheetApp.openById(TRACKER_ID); TZ=ss.getSpreadsheetTimeZone()||'UTC';
  var vals=ss.getSheetByName('Master').getDataRange().getValues(), hdr=vals[0];
  function col(n){ for(var i=0;i<hdr.length;i++) if(String(hdr[i]).trim()===n) return i; return -1; }
  var cQ=col('Job Creation Quarter'), cE=col('Personal Email'), cN=col('Candidate Name'),
      cD=col('Date of Offer'), cOQ=col('Offer Quarter');
  var shown=0, createdMatches=0, considered=0;
  for(var r=1;r<vals.length && shown<5;r++){
    if(!/2026$/.test(String(vals[r][cQ]||'').trim())) continue;
    var em=nrm(vals[r][cE]); if(!em||!byEmail[em]) continue;
    var td=d2s(vals[r][cD]); if(!td) continue;
    var m=byEmail[em];
    var oc=d2s(m.offerCreatedAt), dd=d2s(m.decidedAt);
    if(qtr(td)===qtr(dd)) continue;
    shown++;
    Logger.log('S'+shown+' | '+String(vals[r][cN]||''));
    Logger.log('S'+shown+' |   HT Date of Offer : '+td+'  ('+qtr(td)+')   HT Offer Quarter col: '+String(vals[r][cOQ]||''));
    Logger.log('S'+shown+' |   Ashby offerCreatedAt: '+(oc||'(none)')+'  ('+qtr(oc)+')   gap vs HT: '+days(td,oc)+'d');
    Logger.log('S'+shown+' |   Ashby decidedAt     : '+(dd||'(none)')+'  ('+qtr(dd)+')   gap vs HT: '+days(td,dd)+'d');
  }
  // across ALL quarter-mismatched rows, how often does offerCreatedAt match the HT date?
  for(var r2=1;r2<vals.length;r2++){
    if(!/2026$/.test(String(vals[r2][cQ]||'').trim())) continue;
    var e2=nrm(vals[r2][cE]); if(!e2||!byEmail[e2]) continue;
    var t2=d2s(vals[r2][cD]); if(!t2) continue;
    var m2=byEmail[e2], d3=d2s(m2.decidedAt), o2=d2s(m2.offerCreatedAt);
    if(qtr(t2)===qtr(d3)) continue;
    considered++;
    if(o2 && qtr(o2)===qtr(t2)) createdMatches++;
  }
  Logger.log('SUM | quarter-mismatched vs decidedAt: '+considered);
  Logger.log('SUM | of those, offerCreatedAt quarter MATCHES the HT quarter: '+createdMatches);
}
// READ ONLY: (a) show RAW values so we can see if formatting distorts anything,
// (b) check whether decidedAt clusters on a few dates (= set in bulk, not per decision).
function v4_dateForensics(){
  var TRACKER_ID='1_LQxHDZ6dXehyR2lc8pcFjfDeRaV80vBzVRB_BKWT5A', TZ='UTC';
  function nrm(e){ return String(e||'').replace(/\s+/g,'').toLowerCase(); }
  var it=DriveApp.getFilesByName('offer_contacts.json');
  var ash=JSON.parse(it.next().getBlob().getDataAsString()).rows, byEmail={};
  ash.forEach(function(x){ var e=nrm(x.email); if(e&&!byEmail[e]) byEmail[e]=x; });
  var ss=SpreadsheetApp.openById(TRACKER_ID); TZ=ss.getSpreadsheetTimeZone()||'UTC';
  Logger.log('F | tracker timezone: '+TZ);
  var vals=ss.getSheetByName('Master').getDataRange().getValues(), hdr=vals[0];
  function col(n){ for(var i=0;i<hdr.length;i++) if(String(hdr[i]).trim()===n) return i; return -1; }
  var cQ=col('Job Creation Quarter'), cE=col('Personal Email'), cN=col('Candidate Name'), cD=col('Date of Offer');
  var names={'Vivek Kumar Mishra':1,'Shreya Pratik':1,'Yash Mathur':1};
  for(var r=1;r<vals.length;r++){
    var nm=String(vals[r][cN]||'').trim(); if(!names[nm]) continue;
    var em=nrm(vals[r][cE]); var m=byEmail[em]||{};
    var raw=vals[r][cD];
    Logger.log('F | '+nm);
    Logger.log('F |   HT raw type='+Object.prototype.toString.call(raw)+' value='+String(raw));
    if(Object.prototype.toString.call(raw)==='[object Date]') Logger.log('F |   HT ISO='+raw.toISOString());
    Logger.log('F |   Ashby offerCreatedAt RAW = '+String(m.offerCreatedAt));
    Logger.log('F |   Ashby decidedAt      RAW = '+String(m.decidedAt));
  }
  // clustering: how concentrated are decidedAt values?
  var tally={};
  ash.forEach(function(x){ var d=String(x.decidedAt||'').substring(0,10); if(d) tally[d]=(tally[d]||0)+1; });
  var arr=Object.keys(tally).map(function(k){return [k,tally[k]];}).sort(function(a,b){return b[1]-a[1];});
  Logger.log('F | distinct decidedAt dates: '+arr.length+' across '+ash.length+' offers');
  for(var i=0;i<Math.min(8,arr.length);i++) Logger.log('F | TOP decidedAt '+arr[i][0]+' -> '+arr[i][1]+' offers');
}
// TASK #33 — delete the 12 residue Audit tabs. 🚨 'Job Gaps' is KEPT (feeds buildAuditV4 suppressions).
function task33_cleanTabs(){
  var KEEP_ALWAYS={'Job Gaps':1,'Read me':1,'Job Match Fixing':1,'Tracker Openings v3':1,
    'Tracker Candidates v2':1,'Tracker Openings v4':1,'V4 Manual Fixes':1,'V4 Job Mapping Review':1,
    'V4 Recruiter Match':1,'V4 Bullseye - Manual':1,'V4 Fix Plan':1,'V4 Candidate Recruiter Fix':1};
  var DROP=['22g Openings To Create','22g Run Log','Job Crosswalk (Tracker-Ashby)','FC Open Gopu Match',
           'FC Plan - Roles','FC Plan - Openings','Case A - PTI','Recruiter Re-tag Plan',
           'Tracker Candidates','Pivot Table 1','Ashby Only Candidates','In Tracker - Outside 2026 Scope'];
  var ss=SpreadsheetApp.openById(AUDIT_SHEET_ID);
  var deleted=[], missing=[], refused=[];
  for(var i=0;i<DROP.length;i++){
    var n=DROP[i];
    if(KEEP_ALWAYS[n]){ refused.push(n+' (protected)'); continue; }
    var sh=ss.getSheetByName(n);
    if(!sh){ missing.push(n); continue; }
    if(ss.getSheets().length<=1){ refused.push(n+' (last sheet)'); continue; }
    ss.deleteSheet(sh); deleted.push(n);
  }
  SpreadsheetApp.flush();
  var left=ss.getSheets().map(function(s){return s.getName();});
  Logger.log('T33 | deleted '+deleted.length+' | missing '+missing.length+' | refused '+refused.length);
  Logger.log('T33 | JOB GAPS STILL PRESENT: '+(ss.getSheetByName('Job Gaps')?'YES':'NO - PROBLEM'));
  Logger.log('T33 | remaining ('+left.length+'): '+left.join(' | '));
}
// TASK #4 — hired candidates whose offer is not marked Accepted. mode: 'dry' | 'pilot' | 'run'.
function task4_offersAccepted(mode){
  mode=mode||'dry';
  var it=DriveApp.getFilesByName('offer_contacts.json');
  if(!it.hasNext()) throw new Error('offer_contacts.json missing');
  var ash=JSON.parse(it.next().getBlob().getDataAsString()).rows;
  var appStatus={}, candName={};
  ash.forEach(function(x){ if(x.applicationId){ appStatus[x.applicationId]=String(x.appStatus||''); candName[x.applicationId]=String(x.candidate||''); } });
  var offers=ashbyListAll_('/offer.list');
  // distribution first, so we can see what we are dealing with
  var dist={}, hiredDist={};
  offers.forEach(function(o){
    var a=String(o.acceptanceStatus||'(none)'); dist[a]=(dist[a]||0)+1;
    if(appStatus[o.applicationId]==='Hired') hiredDist[a]=(hiredDist[a]||0)+1;
  });
  Logger.log('T4 | offers '+offers.length);
  Logger.log('T4 | acceptanceStatus ALL   :: '+JSON.stringify(dist));
  Logger.log('T4 | acceptanceStatus HIRED :: '+JSON.stringify(hiredDist));
  // the fix set: application is Hired, offer not Accepted
  var rows=[['candidate','applicationId','offerId','acceptanceStatus now','offerStatus','status']];
  var n=0, didPilot=false;
  offers.forEach(function(o){
    if(appStatus[o.applicationId]!=='Hired') return;
    var acc=String(o.acceptanceStatus||'');
    if(acc==='Accepted') return;
    n++;
    var status='planned';
    var doIt=(mode==='run')||(mode==='pilot'&&!didPilot);
    if(doIt){ didPilot=true;
      try{ var res=ashbyWrite_('/offer.setStatus',{offerId:o.id, acceptanceStatus:'Accepted'});
        status='HTTP '+res.code+' '+(JSON.parse(res.text).success?'ok':'FAIL '+res.text.substring(0,160));
      }catch(e){ status='THREW '+e.message; }
      Utilities.sleep(90);
      if(mode==='pilot'){
        var chk=ashbyWrite_('/offer.info',{offerId:o.id});
        try{ var oo=JSON.parse(chk.text).results;
          Logger.log('T4-RB | acceptanceStatus now = '+String(oo.acceptanceStatus)); }
        catch(e2){ Logger.log('T4-RB | read-back failed :: '+chk.text.substring(0,160)); } }
    }
    rows.push([candName[o.applicationId]||'', o.applicationId, o.id, acc||'(none)', String(o.offerStatus||''), status]);
  });
  var out=SpreadsheetApp.openById(AUDIT_SHEET_ID);
  var sh=out.getSheetByName('Task4 Offers To Accept');
  if(!sh) sh=out.insertSheet('Task4 Offers To Accept'); else sh.clear();
  sh.getRange(1,1,rows.length,6).setValues(rows);
  sh.getRange(1,1,1,6).setFontWeight('bold'); sh.setFrozenRows(1);
  Logger.log('T4 ['+mode+'] hired offers not Accepted: '+n);
}
// TASK #35 — remove the leftover scratch/dead tabs (Jerin approved 7 Sep).
function task35_tidyTabs(){
  var DROP=['V4 Probe','V4 Mapping (generated)','V4 Offer Quarter Fix','Openings to be created-checked','Task4 Offers To Accept'];
  var PROTECT={'Job Gaps':1,'Read me':1,'Job Match Fixing':1,'Tracker Openings v3':1,'Tracker Candidates v2':1,
    'Tracker Openings v4':1,'V4 Manual Fixes':1,'V4 Job Mapping Review':1,'V4 Recruiter Match':1,
    'V4 Bullseye - Manual':1,'V4 Fix Plan':1,'V4 Candidate Recruiter Fix':1};
  var ss=SpreadsheetApp.openById(AUDIT_SHEET_ID), del=[], miss=[], ref=[];
  DROP.forEach(function(n){
    if(PROTECT[n]){ ref.push(n); return; }
    var sh=ss.getSheetByName(n);
    if(!sh){ miss.push(n); return; }
    if(ss.getSheets().length<=1){ ref.push(n); return; }
    ss.deleteSheet(sh); del.push(n);
  });
  SpreadsheetApp.flush();
  var left=ss.getSheets().map(function(s){return s.getName();});
  Logger.log('T35 | deleted '+del.length+' :: '+del.join(' | '));
  Logger.log('T35 | missing '+miss.length+' | refused '+ref.length);
  Logger.log('T35 | JOB GAPS PRESENT: '+(ss.getSheetByName('Job Gaps')?'YES':'NO - PROBLEM'));
  Logger.log('T35 | remaining ('+left.length+'): '+left.join(' | '));
}

// #42: the V4 audit, scoped to Q3 2026 openings. Writes 'Tracker Openings v5' + 'V5 Manual Fixes'
// + 'V5 Mapping generated'. Carries the Result column across from V4 so decisions already made are kept.
// Never writes V4 Manual Fixes / V4 Bullseye - Manual / V4 Candidate Recruiter Fix / V4 Job Mapping Review.
function buildAuditV5() {
  return buildAuditV4({
    tab: 'Tracker Openings v5',
    manualTab: 'V5 Manual Fixes',
    mapTab: 'V5 Mapping (generated)',
    carryFrom: 'Tracker Openings v4',
    onlyQuarter: 'Q3 2026',
    label: 'v5'
  });
}


// #42 READ-ONLY: turn the V5 tab into the actionables list Jerin asked for - what, how many, and whether the
// correction is API or UI. Writes nothing. Run after buildAuditV5().
function v5_actionables() {
  var out = SpreadsheetApp.openById(AUDIT_SHEET_ID);
  var sh = out.getSheetByName('Tracker Openings v5');
  if (!sh) { Logger.log('no V5 tab - run buildAuditV5 first'); return; }
  var v = sh.getDataRange().getValues(), h = v[0];
  var fld = {}, last = '', trail = {};
  for (var c = 0; c < h.length; c++) {
    var n = String(h[c] || '').trim(); if (!n) continue;
    if (n.indexOf('Row key') === 0) continue;
    if (n === 'Match?') { if (last) fld[last].mm = c; continue; }
    if (n === 'Result') { if (last) fld[last].res = c; continue; }
    if (n.indexOf(' - Ashby') > -1) { var b = n.replace(' - Ashby',''); if (fld[b]) fld[b].ash = c; continue; }
    if (['Which Ashby record','Row status','Job match method','Ashby job status','Opening matched?','Ashby team (leaf)','Ashby opening state'].indexOf(n) > -1) { trail[n] = c; continue; }
    fld[n] = { trk: c }; last = n;
  }
  Logger.log('V5 rows: ' + (v.length - 1));
  // per-field open actionables (Match?=No AND Result blank)
  var order = [];
  for (var f in fld) { var k = fld[f]; if (k.mm == null) continue; var n2 = 0;
    for (var r = 1; r < v.length; r++) if (String(v[r][k.mm]).trim() === 'No' && !String(v[r][k.res] || '').trim()) n2++;
    if (n2) order.push([f, n2]); }
  order.sort(function(a,b){ return b[1]-a[1]; });
  Logger.log('--- OPEN ACTIONABLES BY FIELD ---');
  order.forEach(function(x){ Logger.log('   ' + x[0] + ' :: ' + x[1]); });
  // the big one: what does Ashby actually say where Opening Status mismatches?
  var os = fld['Opening Status'];
  if (os) { var by = {};
    for (var r2 = 1; r2 < v.length; r2++) {
      if (String(v[r2][os.mm]).trim() !== 'No' || String(v[r2][os.res] || '').trim()) continue;
      var key = (String(v[r2][os.trk] || '(blank)').trim()) + '  ->  ' + (String(v[r2][os.ash] || '(blank)').trim());
      by[key] = (by[key] || 0) + 1; }
    Logger.log('--- OPENING STATUS: tracker expects -> Ashby has ---');
    Object.keys(by).sort(function(a,b){ return by[b]-by[a]; }).forEach(function(k){ Logger.log('   ' + k + ' :: ' + by[k]); }); }
  // rows with no opening paired, by tracker status
  if (trail['Opening matched?'] != null && trail['Row status'] != null) {
    var noOp = {}, tot = 0;
    for (var r3 = 1; r3 < v.length; r3++) if (String(v[r3][trail['Opening matched?']]).trim() === 'No') {
      tot++; var st = String(v[r3][trail['Row status']] || '(blank)').trim(); noOp[st] = (noOp[st] || 0) + 1; }
    Logger.log('--- NO OPENING PAIRED (' + tot + ') by tracker status ---');
    Object.keys(noOp).sort(function(a,b){ return noOp[b]-noOp[a]; }).forEach(function(k){ Logger.log('   ' + k + ' :: ' + noOp[k]); }); }
  // and by Ashby job status, to see how many sit on a closed/archived job
  if (trail['Opening matched?'] != null && trail['Ashby job status'] != null) {
    var js = {};
    for (var r4 = 1; r4 < v.length; r4++) if (String(v[r4][trail['Opening matched?']]).trim() === 'No') {
      var j = String(v[r4][trail['Ashby job status']] || '(none)').trim(); js[j] = (js[j] || 0) + 1; }
    Logger.log('--- NO OPENING PAIRED, by Ashby JOB status ---');
    Object.keys(js).sort(function(a,b){ return js[b]-js[a]; }).forEach(function(k){ Logger.log('   ' + k + ' :: ' + js[k]); }); }
}


// #47: V6 - the filled-vs-unfilled funnel, scoped to Q3 2026 first (Jerin: Q1/Q2 later if it is cheap).
// Change onlyQuarter to 'Q1 2026' / 'Q2 2026' to re-run, or drop it for all of 2026.
function buildAuditV7() {
  return buildAuditV4({
    mode: 'v7',
    tab: 'Tracker Openings v7',
    onlyQuarter: 'Q3 2026',
    carryFrom: 'Tracker Openings v5',
    label: 'v7'
  });
}


// #53 PROBE (7 Sep 2026, Jerin): can JOB-level fields be written by API? customField.setValue with
// objectType 'Opening' is proven (#12, 332 writes) but 'Job' was NEVER probed - the Job Gaps edits were done
// by hand in the UI, which may have been a choice rather than a limit.
// Method: the 403-vs-404 test plus an IDEMPOTENT write - set a job custom field to the value it ALREADY holds.
// That proves capability without changing anything. Always include an invented endpoint as a control:
// Ashby returns 404 for "does not exist" and 403 for "you lack the scope", so a 404 on the control proves the
// test is meaningful.
function probeJobFieldWrite() {
  // 1. what custom fields exist on a JOB?
  var jf = [];
  try { jf = (ashbyPost_('/customField.list', { includeArchived: false }).results || [])
    .filter(function (f) { return String(f.objectType || '') === 'Job'; }); } catch (e) { Logger.log('customField.list: ' + e.message); }
  Logger.log('JOB custom fields: ' + jf.length);
  jf.forEach(function (f) { Logger.log('   ' + f.title + '  | id ' + String(f.id).substring(0, 8) + '  | type ' + f.fieldType); });

  // 2. find a job that already HAS a value for one of them, so the write is a no-op
  var jobs = ashbyListAll_('/job.list');
  Logger.log('jobs: ' + jobs.length + ' | keys on a job: ' + Object.keys(jobs[0] || {}).join(', '));
  var target = null, tf = null;
  for (var i = 0; i < jobs.length && !target; i++) {
    var cfs = jobs[i].customFields || [];
    for (var k = 0; k < cfs.length; k++) {
      var v = cfs[k].value; if (v === null || v === undefined || v === '') continue;
      target = jobs[i]; tf = cfs[k]; break;
    }
  }
  if (!target) { Logger.log('no job with a populated custom field - cannot run an idempotent write'); return; }
  Logger.log('IDEMPOTENT TARGET: job "' + target.title + '" field "' + (tf.title || tf.name) + '" (writing its EXISTING value back)');

  // 3. the write - same value in, so nothing changes either way
  try {
    var r = ashbyWrite_('/customField.setValue', { objectType: 'Job', objectId: target.id, fieldId: tf.id, fieldValue: tf.value });
    Logger.log('customField.setValue objectType=Job  ->  ' + JSON.stringify(r).substring(0, 300));
  } catch (e2) { Logger.log('customField.setValue objectType=Job  ->  THREW ' + e2.message); }

  // 4. does a job.update-style endpoint exist at all? 404 = no such thing, 403 = exists but no scope.
  ['/job.update', '/job.setStatus', '/job.info', '/jobPosting.update', '/job.thisEndpointIsInvented'].forEach(function (ep) {
    try { var rr = ashbyWrite_(ep, { jobId: target.id }); Logger.log('  ' + ep + ' -> ' + JSON.stringify(rr).substring(0, 160)); }
    catch (e3) { Logger.log('  ' + ep + ' -> THREW ' + String(e3.message).substring(0, 160)); }
  });
}


// #56 - V8 is a MODE of buildAuditV4, never a clone.
function buildAuditV8(){ return buildAuditV4({ mode:'v8', onlyQuarter:'Q3 2026', tab:'Tracker Openings v8', label:'v8' }); }
