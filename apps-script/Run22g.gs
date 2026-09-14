function run22g() { task105i_srcCheck(); }  // #105i: READ-ONLY for Ashby (rebuilds the audit tab V9 - 105i Source check). The source switches ran once on 13 Sep: done 46, skip 0, fail 0.

// #115 (14 Sep 2026): an Ashby opening date set in India time is stored as UTC (1 Jul = 30 Jun 18:30Z), so reading its
// first 10 characters gave the day BEFORE and could file it in the previous quarter. Every audit read of an opening's
// opened date goes through this, so the date and its quarter match the Ashby page. Returns '' for a missing date.
function istDay_(iso){ if(!iso) return ''; var d=new Date(iso); return isNaN(d.getTime()) ? '' : Utilities.formatDate(d,'Asia/Kolkata','yyyy-MM-dd'); }

function task64_candOwners(mode){
  mode=mode||'dry';
  var SS='1U6Wi5uXLZ8hOhGKP2tyH--jHcEbUEvXgAPxbkUofTNA';
  var ss=SpreadsheetApp.openById(SS);
  var cor=ss.getSheetByName('V9 - Correct').getDataRange().getValues();
  var cl=ss.getSheetByName('V9 - Claim ledger').getDataRange().getValues();
  var emailByAid={};
  for(var r=1;r<cl.length;r++){ var a=String(cl[r][0]||'').trim(); var e=String(cl[r][2]||'').trim().toLowerCase(); if(a&&e) emailByAid[a]=e; }
  var st=JSON.parse(DriveApp.getFilesByName('offer_contacts.json').next().getBlob().getDataAsString()).rows||[];
  var appByEmail={};
  for(var i=0;i<st.length;i++){ var e=String(st[i].email||'').trim().toLowerCase(); if(e&&st[i].applicationId) appByEmail[e]=st[i].applicationId; }
  var act=ashbyListAll_('/user.list',{}); var all=ashbyListAll_('/user.list',{includeDeactivated:true});
  function nm(u){ return (u.name||((u.firstName||'')+' '+(u.lastName||'')).trim()); }
  var uAll={}; for(var i=0;i<all.length;i++) uAll[all[i].id]=nm(all[i]);
  var actIds={}; for(var i=0;i<act.length;i++) actIds[act[i].id]=1;
  var ALIAS={'sanghamitra moulik':'Sangha'};
  function resolve(t){ var q=ALIAS[String(t||'').toLowerCase().trim()]||t; var h=[]; for(var j=0;j<act.length;j++) if(nameMatch64_(q,nm(act[j]))) h.push(act[j]); return h.length===1?h[0]:null; }
  var plan=[], noApp=0, unres=0;
  for(var r=1;r<cor.length;r++){ if(String(cor[r][5]).trim()!=='Candidate Owner') continue;
    var aid=String(cor[r][2]||'').trim(), trk=String(cor[r][6]||'').trim();
    var u=resolve(trk); if(!u){ unres++; Logger.log('T64c UNRESOLVED | "'+trk+'"'); continue; }
    var em=emailByAid[aid]; var appId=em?appByEmail[em]:null;
    if(!appId){ noApp++; Logger.log('T64c NO APPLICATION FOUND | audit-id '+aid+' | emailKnown='+(em?'yes':'no')); continue; }
    var resp=ashbyWrite_('/application.info',{applicationId:appId});
    var body=(resp&&resp.json)||{};
    if(!body.success){ Logger.log('T64c application.info FAILED | '+JSON.stringify(body.errors||'').slice(0,80)); continue; }
    var ht=(body.results||{}).hiringTeam||[]; var cur=[];
    for(var k=0;k<ht.length;k++){ if(/recruiter/i.test(String(ht[k].role||ht[k].roleName||''))) cur.push(ht[k].userId); }
    var already=false, rm=[];
    for(var k=0;k<cur.length;k++){ if(cur[k]===u.id) already=true; else rm.push(cur[k]); }
    var label=[]; for(var k=0;k<cur.length;k++) label.push((uAll[cur[k]]||'?')+(actIds[cur[k]]?'':' [inactive]'));
    if(already&&!rm.length){ Logger.log('T64c ALREADY CORRECT | "'+trk+'"'); continue; }
    Logger.log('T64c '+(cur.length?'REPLACE':'ADD')+' | tracker "'+trk+'" -> '+nm(u)+' | live='+(label.length?label.join(' + '):'(nobody)'));
    plan.push({appId:appId, u:u, rm:rm, add:!already}); }
  Logger.log('T64c PLAN '+plan.length+' | unresolved '+unres+' | no application '+noApp);
  if(mode==='dry'){ Logger.log('T64c DRY - nothing written'); return; }
  if(plan.length>10){ Logger.log('T64c REFUSE - more than 10'); return; }
  var ok=0, fail=0;
  for(var i=0;i<plan.length;i++){ var p=plan[i];
    try{ for(var k=0;k<p.rm.length;k++) ashbyWrite_('/application.removeHiringTeamMember',{applicationId:p.appId, teamMemberId:p.rm[k], roleId:V4_RECRUITER_ROLE});
      if(p.add) ashbyWrite_('/application.addHiringTeamMember',{applicationId:p.appId, teamMemberId:p.u.id, roleId:V4_RECRUITER_ROLE});
      ok++; }catch(e){ fail++; Logger.log('T64c FAIL '+String(e).slice(0,100)); } }
  Logger.log('T64c '+mode.toUpperCase()+' applied '+ok+' | failed '+fail);
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
  function nameMatch(a,b){ var x=nameTok(a),y=nameTok(b); if(!x.length||!y.length)return false; var s=x.length<=y.length?x:y,l=x.length<=y.length?y:x; for(var i=0;i<s.length;i++){var h=false; for(var j=0;j<l.length;j++) if(l[j]===s[i]){h=true;break;} if(!h)return false;} return true; }
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
          offer:col('Date of Offer'), doj:col('DOJ'), jq:col('Joining Quarter'), aid:col('audit-id'),
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
      djq:String(row[C.jq]||'').trim()||qtr(dj), status:at(row,C.status), aid:at(row,C.aid) }); }

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
  // #71 (8 Sep): Level is a JOB attribute, but it was read through c.m.level - a per-candidate field from the
  // pipeline's offer_contacts.json - so it came back blank even when the tracker, the store AND live Ashby all
  // agreed on the value, manufacturing a finding per position. Read it from the job, as the opening fields are
  // read from the opening. Verified 8 Sep: all 23 Level 'findings' were already correct in Ashby.
  var jobLevel={};
  jobs.forEach(function(j){ var cf=j.customFields||[]; for(var q=0;q<cf.length;q++){ if(/^level$/i.test(String(cf[q].title||''))){ var x=cf[q].valueLabel; if(x==null) x=cf[q].value; if(x instanceof Array) x=x.join('+'); jobLevel[j.id]=String(x==null?'':x); } } });
  var users=ashbyListAll_('/user.list'), uById={};
  users.forEach(function(u){ uById[u.id]=((u.firstName||'')+' '+(u.lastName||'')).trim()||u.name||''; });
  // #68 (8 Sep): resolve DEACTIVATED users too - the active-only list left departed recruiters as an EMPTY
  // name, which read downstream as 'this opening has no recruiter' and mis-classified REPLACE work as ADD.
  // A deactivated owner is marked so the comparison below cannot silently match it against the tracker.
  var activeIds={}; users.forEach(function(u){ activeIds[u.id]=1; });
  ashbyListAll_('/user.list',{includeDeactivated:true}).forEach(function(u){ var nx=((u.firstName||'')+' '+(u.lastName||'')).trim()||u.name||''; if(nx) uById[u.id]= nx + (activeIds[u.id]?'':' [inactive]'); });
  var locName={}; try{ ashbyListAll_('/location.list').forEach(function(l){ locName[l.id]=l.name||''; }); }catch(eL){}
  var bucket={}, opsAll=[], opsByIdAll={}, opsArchived=[];   // #110g: archived 2026 openings, used only to cover Joined positions
  // #47 (V6): the loop below SKIPS every opening whose openedAt is not 2026 - which silently drops the ~53-58
  // UNDATED openings too. An opening that genuinely exists but has no date was therefore reported as 'no
  // opening', manufacturing a gap. Index EVERY non-archived opening here so V6 can tell 'missing' apart from
  // 'exists but undated'. Leave the 2026 filter alone below - V4/V5 numbers must stay reproducible.
  ashbyListAll_('/opening.list').forEach(function(o){
    if(o.isArchived) return;
    var lv2=o.latestVersion||{}, cf2={};
    (lv2.customFields||[]).forEach(function(f){ var lab=(f.valueLabel==null||f.valueLabel==='')?(f.value==null?'':f.value):f.valueLabel; cf2[String(f.title||f.name||'')]=String(lab); });
    var rc2=[]; (lv2.hiringTeam||[]).forEach(function(h){ if(/recruiter/i.test(String(h.role||h.roleName||''))) rc2.push(uById[h.userId]||h.name||''); });
    var oa2=istDay_(o.openedAt);   // #115: India time, not UTC
    opsByIdAll[o.id]={ id:o.id, openedAt:oa2?oa2.substring(0,10):'', dated:!!oa2, q:oa2?qtr(oa2):'',
      state:String(o.openingState||''), cr:String(o.closeReasonId||''),
      cx:cxMap(cf2['Role Complexity (Opening)']||''), rt:rtMap(cf2['Role Type']||''),
      emp:String(cf2['Employment Type']||''),
      loc:(lv2.locationIds||[]).map(function(x){return locName[x]||'';}).filter(String).join(', '),
      recs:rc2, jobIds:(lv2.jobIds||[]) };
  });
  ashbyListAll_('/opening.list').forEach(function(o){
    var oa=istDay_(o.openedAt); if(oa.substring(0,4)!=='2026') return;   // #115: India time, not UTC · #110g: archived no longer skipped here - kept aside below
    var lv=o.latestVersion||{}, cf={};
    (lv.customFields||[]).forEach(function(f){ var lab=(f.valueLabel==null||f.valueLabel==='')?(f.value==null?'':f.value):f.valueLabel; cf[String(f.title||f.name||'')]=String(lab); });
    var recs=[]; (lv.hiringTeam||[]).forEach(function(h){ if(/recruiter/i.test(String(h.role||h.roleName||''))) recs.push(uById[h.userId]||h.name||''); });
    var op={ id:o.id, openedAt:oa.substring(0,10), q:qtr(oa), state:String(o.openingState||''), cr:String(o.closeReasonId||''),
      cx:cxMap(cf['Role Complexity (Opening)']||''), rt:rtMap(cf['Role Type']||''), aid:String(cf['audit-id']||''), jobIds:(lv.jobIds||[]),
      emp:String(cf['Employment Type']||''),
      loc:(lv.locationIds||[]).map(function(x){return locName[x]||'';}).filter(String).join(', '),
      recs:recs, used:false };
    if(o.isArchived){ op.archived=true; opsArchived.push(op); return; }   // #110g: never enters opsAll, the pool or the orphan view
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
    // 🚨 JOB_ALIAS IS NOT THE CROSSWALK'S HOME. Line ~583 REWRITES it at runtime from the hand-edited tab
    //   'V4 Job Mapping Review' (col A tracker job, col F correction). Anything added HERE that the tab also
    //   names is silently overwritten - a 10 Sep edit for #85 looked correct, saved, ran, and changed nothing.
    //   ➡ To change a job mapping, edit THE TAB (Jerin's, never overwrite it), not this literal.
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
   {n:'Level',t:function(c){return c.tr.lvl;},a:function(c){return (c.jr&&jobLevel[c.jr.id])||'';},k:'eq'},
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
      if (String(av).indexOf('[inactive]') > -1) return true; // #68: owner is a DEACTIVATED account - always a finding
                           return !(names.length === 1 && nameMatch(tv, names[0])); }
    if (f.n === 'Candidate Name') return !nameMatch(tv, av);
    return !eq(tv, av);
  }
  // ================= V9 | RECONCILIATION (revision 9, 8 Sep 2026) =================
  // Docket: Tracker-Ashby Reconciliation. Keeps the X/A/B/C/D/E/F/G funnel; replaces the MIDDLE.
  // Principles enforced here: preconditions HALT (never degrade) | four joins each with its own
  // confidence | claims are WRITTEN, not mutated | only compare what you matched with evidence |
  // every count is a list length. Milestone 1 = joins + claim ledger + closure checks.
  if (opts.mode === 'v9') {
    var RUN = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm');
    var QF  = opts.onlyQuarter || '';

    // ---- 0. PRECONDITIONS. A missing dependency stops the run; it never downgrades the method. ----
    var pre = [];
    if (!ash || !ash.length) pre.push('candidate store is empty');
    else {
      // 8 Sep: test the WHOLE set. Sampling a prefix of an ordered list is not sampling -
      // linked offers cluster at the end, so slice(0,400) reported zero when 170 exist.
      var nLink = ash.filter(function(x){ return x && (x.openingId || x.openingIdAny); }).length;
      var nMail = ash.filter(function(x){ return x && x.email; }).length;
      Logger.log('V9 precondition | store rows ' + ash.length + ' | with openingId ' + nLink + ' | with email ' + nMail);
      if (!nLink) pre.push('store carries NO openingId - the opening join would have to guess');
      if (!nMail) pre.push('store carries NO email - person join impossible');
    }
    if (C.aid < 0) pre.push('tracker has no audit-id column (run task58b_auditId)');
    if (!opsAll || !opsAll.length) pre.push('no openings loaded');
    if (pre.length) throw new Error('V9 PRECONDITION FAILED :: ' + pre.join(' ;; '));

    // ---- 1. Reset state left behind by the V4 greedy pass (it ran above and marked openings used). ----
    opsAll.forEach(function(o){ o.used = false; });

    // ---- 2. Scope ----
    var rows = ctx.filter(function(c){ return !QF || c.tr.opq === QF; });
    // 🚨 X has its OWN status set. V4's NO_CAND means 'no candidate exists yet' and INCLUDES 'Open',
    // which is an unfilled position that is very much in scope. Reusing it swallowed the whole E branch.
    var OUT_OF_SCOPE = {'Yet to Open':1, 'Role Shelved':1, 'Carry Forward to Next Q':1};
    var X = rows.filter(function(c){ return OUT_OF_SCOPE[String(c.tr.status).trim()] && !c.m && !c.tr.email; });
    var inScope = rows.filter(function(c){ return X.indexOf(c) < 0; });

    // ---- 3. FOUR JOINS, each recording its own evidence ----
    var JOBTRUST = {alias:'trusted', name:'trusted', candidate:'trusted', fuzzy:'weak', 'candidate-fuzzy':'weak', none:'none', 'do-not-map':'none'};
    inScope.forEach(function(c){
      c.j1 = c.m ? 'email' : (c.tr.email ? 'no-ashby-record' : 'no-email');
      c.j2 = JOBTRUST[c.jr.how] || 'none';
      c.j4 = (c.m && candRecs(c.m).length === 1 && nameMatch(c.tr.rec, candRecs(c.m)[0])) ? 'match' : (c.m ? 'differs' : 'n/a');
      c.bound = (c.m && (c.m.openingId || c.m.openingIdAny)) ? String(c.m.openingId || c.m.openingIdAny) : '';
    });

    // ---- 4. THE POOL, as a definition: not archived, not closed, not claimed. Built once. ----
    var opById = {}; opsAll.concat(opsArchived).forEach(function(o){ opById[o.id] = o; });   // #110g: archived too, so bound/covered claims resolve
    // 🚨 8 Sep: THE POOL TESTS THE STATE, not the absence of a close reason. 1,996 openings are 'Filled'
    // and some carry no closeReasonId, so the old test let filled openings into the free pool - V7 fault #4
    // rebuilt. Only an opening Ashby itself calls Open can cover anything.
    var poolable = opsAll.filter(function(o){ return String(o.state||'') === 'Open' && !o.cr; });
    var byJob = {};
    poolable.forEach(function(o){ (o.jobIds||[]).forEach(function(jid){ (byJob[jid] = byJob[jid] || []).push(o); }); });

    // ---- 5. THE CLAIM LEDGER. Written down, never a mutation. Ranked; bound cannot be displaced. ----
    var claims = [], onOpening = {};
    function claim(c, oid, rank, why){
      var cl = { aid:c.tr.aid, name:c.tr.name, email:c.tr.email, job:c.jr.title || c.tr.job, jobId:c.jr.id,
                 jobTrust:c.j2, personJoin:c.j1, openingId:oid || '', rank:rank, why:why,
                 openingQ:(oid && opById[oid]) ? opById[oid].q : '', trackerQ:c.tr.opq };
      claims.push(cl); c.claim = cl;
      if (oid) (onOpening[oid] = onOpening[oid] || []).push(cl);
      return cl;
    }
    // 5a. BOUND first - Ashby's own offer->opening link is a fact and settles the slot.
    inScope.forEach(function(c){ if (c.bound) { claim(c, c.bound, 'bound', 'offer carries the opening'); if (opById[c.bound]) opById[c.bound].used = true; } });
    // 5b. FORCED / CHOSEN for filled rows with no link, then unfilled rows. Fixed order, deterministic.
    function free(jid, q){ return (byJob[jid]||[]).filter(function(o){ return !o.used && (!q || o.q === q); }); }
    // #75 (Jerin, 8 Sep): a DROPPED position must NOT claim an opening at all. Once someone is marked
    //   Dropped the opening detaches from them, so letting a dropped row win a free opening both hides a
    //   LIVE position's claim and emits a false Opening Owner finding against the dropped claimant.
    //   Same rule that already excludes Dropped rows from the CREATE list. Values are EXPECT's own (line 393).
    //   Only the ALLOCATOR is gated: a 'bound' claim (5a) is Ashby's own offer->opening link and stays a fact.
    var DROPPED_NO_CLAIM = {'Dropped - Offer':1, 'Dropped - Select':1};
    var DROPPED_WHY = 'dropped position - does not claim an opening (#75)';
    function allocate(c){
      if (DROPPED_NO_CLAIM[String(c.tr.status||'').trim()]) { claim(c, '', 'none', DROPPED_WHY); return; }
      if (!c.jr.id) { claim(c, '', 'none', 'job did not resolve'); return; }
      var cand = free(c.jr.id, c.tr.opq);
      if (!cand.length) cand = free(c.jr.id, '');   // any quarter: Jerin 8 Sep - age is not a disqualifier
      // #110g (Jerin, 13 Sep 2026): the team closes or archives an opening once its person JOINS, so a Joined position
      //   with no free Open opening is COVERED, not a CREATE. First the opening carrying its own audit-id (any state),
      //   else a closed/archived opening on the same job with no audit-id and no claim. Same quarter only - the date need
      //   not match (Jerin: "date neednt match, if Quarter is matching"). Never used for unfilled or dropped positions.
      if (!cand.length && String(c.tr.status||'').trim() === 'Joined') {
        var onJob = function(o){ return !o.used && (o.jobIds||[]).indexOf(c.jr.id) >= 0 && (!c.tr.opq || o.q === c.tr.opq); };
        var coverPool = opsAll.concat(opsArchived);
        var own = coverPool.filter(function(o){ return onJob(o) && o.aid && o.aid === c.tr.aid; })[0];
        if (own) { own.used = true; claim(c, own.id, 'covered', 'joined - own tagged opening (' + (own.archived ? 'archived' : (own.state || '?')) + ')'); return; }
        var shut = coverPool.filter(function(o){ return onJob(o) && !o.aid && (o.archived || String(o.state||'') !== 'Open'); })[0];
        if (shut) { shut.used = true; claim(c, shut.id, 'covered', 'joined - closed/archived opening on the job'); return; }
      }
      if (!cand.length) { claim(c, '', 'none', 'no free opening on this job'); return; }
      cand.sort(function(a,b){ return String(a.openedAt||'zz').localeCompare(String(b.openedAt||'zz')) || String(a.id).localeCompare(String(b.id)); });
      var rank = cand.length === 1 ? 'forced' : 'chosen';
      cand[0].used = true;
      claim(c, cand[0].id, rank, rank === 'forced' ? 'only free opening on the job' : (cand.length + ' free; earliest taken'));
    }
    inScope.filter(function(c){ return !c.bound && c.m; }).forEach(allocate);
    inScope.filter(function(c){ return !c.bound && !c.m; }).forEach(allocate);

    // 5c. CONTESTED - two bound claims on one opening is an ASHBY DATA ERROR and is reported, never overwritten.
    var contested = Object.keys(onOpening).filter(function(oid){
      return onOpening[oid].filter(function(x){ return x.rank === 'bound'; }).length > 1; });

    // ---- 6. THE FIELD REGISTER. Grain + which join GATES it + which SYSTEM is right + the route.
    // Location is deliberately absent (Jerin, 8 Sep). Sourcer is 58e, blocked on the pipeline.
    var V9F = [
      {n:'Job Name',        obj:'job',    gate:'j2', auth:'mapping', route:'not actionable', cmp:'role'},
      {n:'Department',      obj:'job',    gate:'j2', auth:'Ashby',   route:'UI only',        cmp:'norm'},
      {n:'Level',           obj:'job',    gate:'j2', auth:'Tracker', route:'API',            cmp:'exact'},
      {n:'Complexity',      obj:'open',   gate:'j3', auth:'Tracker', route:'API',            cmp:'exact'},
      {n:'Employment Type', obj:'open',   gate:'j3', auth:'Tracker', route:'API',            cmp:'exact'},
      {n:'Role Type',       obj:'open',   gate:'j3', auth:'Tracker', route:'API',            cmp:'exact'},
      {n:'Opening Date',    obj:'open',   gate:'j3', auth:'Tracker', route:'UI only',        cmp:'exact'},
      {n:'Opening Quarter', obj:'open',   gate:'j3', auth:'Tracker', route:'UI only',        cmp:'exact'},
      {n:'Opening Status',  obj:'open',   gate:'j3', auth:'Tracker', route:'UI only',        cmp:'exact'},
      {n:'Opening Owner',   obj:'open',   gate:'j3', auth:'Tracker', route:'API',            cmp:'person'},
      {n:'Candidate Owner', obj:'cand',   gate:'j1', auth:'Tracker', route:'API',            cmp:'person'},
      {n:'Candidate Name',  obj:'cand',   gate:'j1', auth:'Ashby',   route:'UI only',        cmp:'person'},
      {n:'Personal Email',  obj:'cand',   gate:'j1', auth:'Ashby',   route:'UI only',        cmp:'email'},
      {n:'Status',          obj:'cand',   gate:'j1', auth:'Ashby',   route:'never fixable',  cmp:'exact'},
      {n:'DOJ Quarter',     obj:'cand',   gate:'j1', auth:'Ashby',   route:'UI only',        cmp:'exact'},
      {n:'Offer Quarter',   obj:'cand',   gate:'j1', auth:'Ashby',   route:'never fixable',  cmp:'exact'}
    ];
    function tSide(f, c){ var o = c.claim.openingId ? opById[c.claim.openingId] : null; var m2 = c.m;
      switch(f.n){
        case 'Job Name': return c.tr.job; case 'Department': return deptAlias(c.tr.dept);
        case 'Level': return c.tr.lvl; case 'Complexity': return cxMap(c.tr.cx);
        case 'Employment Type': return c.tr.emp; case 'Role Type': return rtMap(c.tr.role);
        case 'Opening Date': return c.tr.opd; case 'Opening Quarter': return c.tr.opq;
        case 'Opening Status': return EXPECT[String(c.tr.status).trim()] || '';
        case 'Opening Owner': return c.tr.rec; case 'Candidate Owner': return c.tr.rec;
        case 'Candidate Name': return c.tr.name; case 'Personal Email': return c.tr.email;
        case 'Status': return c.tr.status; case 'DOJ Quarter': return c.tr.djq;
        case 'Offer Quarter': return qtr(c.tr.offd);
      } return ''; }
    // #74 (9 Sep): Candidate Owner must come from ASHBY, not offer_contacts.json. That file is a snapshot
    //   written by the 6 AM pipeline, so an owner tagged in Ashby TODAY still reads empty here and the audit
    //   reports a correction that was already made - the same 'field read from the wrong object' shape as #68
    //   and #71. Memoised per applicationId and hard-capped so a long run cannot blow the 6-minute limit.
    //   FALLS BACK to the store on any failure, so a transient API error degrades to the old behaviour
    //   instead of inventing a finding. An empty ARRAY means Ashby genuinely has nobody - a REAL finding
    //   that must survive; only null means 'could not read'.
    var _coLive = {}, _coCalls = 0;
    function liveCandOwner_(m2){
      if (!m2 || !m2.applicationId) return null;
      var k = m2.applicationId;
      if (_coLive.hasOwnProperty(k)) return _coLive[k];
      if (_coCalls >= 400) return (_coLive[k] = null);
      _coCalls++;
      var out = null;
      try {
        var resp = ashbyWrite_('/application.info', { applicationId: k });
        var body = (resp && resp.json) || resp || {};
        if (body.success && body.results) {
          var ht = body.results.hiringTeam || [], acc = [];
          for (var i=0;i<ht.length;i++) if (/recruiter/i.test(String(ht[i].role||ht[i].roleName||'')))
            acc.push(uById[ht[i].userId] || String(ht[i].name || ((ht[i].firstName||'')+' '+(ht[i].lastName||'')).trim() || ''));
          out = acc.filter(String);
        }
      } catch(e){}
      _coLive[k] = out; return out;
    }
    function aSide(f, c){ var o = c.claim.openingId ? opById[c.claim.openingId] : null; var m2 = c.m;
      switch(f.n){
        case 'Job Name': return c.jr.title; case 'Department': return c.jr.dept;
        case 'Level': return (c.jr && jobLevel[c.jr.id]) || '';  // #71: Level is a JOB field - read the job, not the pipeline record
        case 'Complexity': return o ? o.cx : ''; case 'Employment Type': return o ? o.emp : '';
        case 'Role Type': return o ? o.rt : ''; case 'Opening Date': return o ? o.openedAt : '';
        case 'Opening Quarter': return o ? o.q : ''; case 'Opening Status': return openLabel(o);
        case 'Opening Owner': return o ? o.recs.join(' + ') : '';
      case 'Candidate Owner': { if (!m2) return ''; var lvCO = liveCandOwner_(m2); return lvCO ? lvCO.join(' + ') : candRecs(m2).join(' + '); }
        case 'Candidate Name': return m2 ? (m2.candidate||'') : ''; case 'Personal Email': return m2 ? nrm(m2.email) : '';
        case 'Status': return m2 ? aStat(m2) : ''; case 'DOJ Quarter': return qtr(m2 ? (m2.startDate||'') : '');
        case 'Offer Quarter': return qtr(m2 ? (m2.offerCreatedAt||'') : '');
      } return ''; }
    function same(f, a, b){
      if (f.cmp === 'person'){ var ns = String(b).split(' + ').filter(String); return ns.length === 1 && nameMatch(f.n === 'Candidate Name' ? a : ownerAlias_(a), ns[0]); }   // #110f (13 Sep): owner names go through ownerAlias_ (Sanghamitra Moulik = Sangha)
      if (f.cmp === 'role')  return roleOk(a, b);
      if (f.cmp === 'norm')  return norm(a) === norm(b);
      if (f.cmp === 'email') return nrm(a) === nrm(b);
      return eq(a, b); }

    // ---- 7. COMPARE - but ONLY what we matched with evidence. A guessed pairing can only
    // produce guessed differences, so a 'chosen' opening is confirmed to exist and nothing more.
    var findings = [], skipped = { chosenOpening:0, weakJob:0, noPerson:0, blankAuthority:0, droppedOpening:0 };
    var jobRoll = {};   // job-grain values rolled up, so one bad job is one defect not twelve
    inScope.forEach(function(c){
      var rank = c.claim.rank;
      V9F.forEach(function(f){
      // #92 (Jerin, 10 Sep): a DROPPED position must not drive a correction on an OPENING either.
      //   #75 stops it CLAIMING one, but a 'bound' claim is Ashby's own offer->opening link and is
      //   deliberately NOT gated - so a dropped candidate still emitted opening findings. Writing them is
      //   actively wrong: Opening Owner would hand the opening to the DROPPED candidate's recruiter instead
      //   of the LIVE one's (P-03494 Rishabh Tripathi vs Praveetha's P-03565), and the field rows would write
      //   onto an opening we ARCHIVED as a phantom hire (P-03466 Jana Gopi).
      //   Candidate-grain fields are deliberately left alone - those are still about the person.
      if (f.obj === 'open' && DROPPED_NO_CLAIM[String(c.tr.status||'').trim()]) { skipped.droppedOpening++; return; }
        if (f.gate === 'j1' && !c.m) { skipped.noPerson++; return; }
        if (f.gate === 'j2' && c.j2 !== 'trusted') { skipped.weakJob++; return; }
        if (f.gate === 'j3'){
          if (rank === 'chosen') { skipped.chosenOpening++; return; }   // THE GATE
          if (rank !== 'bound' && rank !== 'forced') return;
        }
        var tv = String(tSide(f, c) || '').trim(), av = String(aSide(f, c) || '').trim();
        // 'blank is not wrong': if the AUTHORITATIVE side is empty there is nothing to copy across.
        if (f.auth === 'Tracker' && !tv) { skipped.blankAuthority++; return; }
        if (f.auth === 'Ashby'   && !av) { skipped.blankAuthority++; return; }
        if (same(f, tv, av)) return;
        var key = f.obj === 'job'  ? ('job|'  + c.jr.id) : f.obj === 'open' ? ('open|' + c.claim.openingId) : ('pos|' + c.tr.aid);
        if (f.obj === 'job'){   // roll up to the Ashby grain: one finding per job, not per position
          var jk = key + '|' + f.n;
          if (!jobRoll[jk]) jobRoll[jk] = { f:f, key:key, job:c.jr.title, tvals:{}, av:av, n:0 };
          jobRoll[jk].tvals[tv] = 1; jobRoll[jk].n++;
          return;
        }
        findings.push({ obj:f.obj, key:key, aid:c.tr.aid, who:c.tr.name || '(unfilled)', job:c.jr.title || c.tr.job,
                        field:f.n, tracker:tv, ashby:av, auth:f.auth, route:f.route, rank:rank });
      });
    });
    // job-grain findings, plus a class nobody could see before: the TRACKER disagreeing with itself
    var trackerSelfConflict = [];
    Object.keys(jobRoll).forEach(function(k){ var r = jobRoll[k]; var vals = Object.keys(r.tvals);
      if (vals.length > 1) trackerSelfConflict.push({ job:r.job, field:r.f.n, values:vals.join(' / '), positions:r.n });
      findings.push({ obj:'job', key:r.key, aid:'', who:'(' + r.n + ' positions)', job:r.job, field:r.f.n,
                      tracker:vals.join(' / '), ashby:r.av, auth:r.f.auth, route:r.f.route, rank:'job-grain' });
    });

    // ---- 8. OUTPUTS. Six views, all filters over the ledger and the findings. Counts = list lengths. ----
    // #75b (9 Sep): a DROPPED position claims nothing, but it must NOT therefore land in the CREATE view -
    //   Jerin ruled on 8 Sep that we do NOT create openings for dropped positions. Splitting them out here
    //   keeps BOTH rules true at once. They stay in the claim ledger (with their reason) so nothing is hidden.
    //   NOTE: the partition check on line ~861 counts lDropped too, or it would report a false failure.
    var lDropped = claims.filter(function(x){ return x.rank === 'none' && String(x.why||'') === DROPPED_WHY; });
    var lCreate  = claims.filter(function(x){ return x.rank === 'none' && String(x.why||'') !== DROPPED_WHY; });
    var lBound  = claims.filter(function(x){ return x.rank === 'bound'; });
    var lForced = claims.filter(function(x){ return x.rank === 'forced'; });
    var lChosen = claims.filter(function(x){ return x.rank === 'chosen'; });
    var lCovered = claims.filter(function(x){ return x.rank === 'covered'; });   // #110g
    var lLink   = inScope.filter(function(c){ return c.m && !c.bound && c.claim.openingId && c.claim.rank !== 'covered'; }).map(function(c){ return c.claim; });   // #110g: a covered Joined needs no link
    var lRedate = claims.filter(function(x){ return x.openingId && x.trackerQ && x.openingQ && x.openingQ !== x.trackerQ; });
    var lUndated= claims.filter(function(x){ return x.openingId && !x.openingQ; });
    var lOrphan = poolable.filter(function(o){ return !o.used; });
    var lCorrect= findings.filter(function(x){ return x.auth === 'Tracker' || x.auth === 'Ashby'; });
    var lDecide = findings.filter(function(x){ return x.auth !== 'Tracker' && x.auth !== 'Ashby'; });
    var lFixable= lCorrect.filter(function(x){ return x.route === 'API'; });

    // ---- 9. CLOSURE CHECKS. They prove nothing about match QUALITY - see 58d. ----
    var chk = [];
    if (X.length + inScope.length !== rows.length) chk.push('scope split does not sum');
    if (claims.length !== inScope.length) chk.push('every in-scope position must make exactly one claim');
    if (lBound.length + lForced.length + lChosen.length + lCovered.length + lCreate.length + lDropped.length !== inScope.length) chk.push('claim ranks do not partition');
    var seen9 = {}, dbl = 0;
    claims.forEach(function(x){ if (!x.openingId) return; if (seen9[x.openingId]) dbl++; seen9[x.openingId] = 1; });
    if (dbl !== contested.length) chk.push('double-claimed openings (' + dbl + ') not all reported contested (' + contested.length + ')');
    if (chk.length) throw new Error('V9 CLOSURE FAILED :: ' + chk.join(' ;; '));

    // ---- 10. Write. The ledger is the primary artefact; the rest are views over it. ----
    var head = ['audit-id','Candidate','Email','Job','Tracker Qtr','Opening Qtr','Claim rank','Why','Person join','Job join','Opening id','Result'];
    var out9 = [head];
    claims.forEach(function(x){ out9.push([x.aid, x.name, x.email, x.job, x.trackerQ, x.openingQ, x.rank, x.why, x.personJoin, x.jobTrust, x.openingId, '']); });
    write('V9 - Claim ledger', out9, true);

    var fh = [['Object','Object id','audit-id','Who','Job','Field','Tracker says','Ashby says','Which is right','Route','Claim rank','Result']];
    findings.forEach(function(x){ fh.push([x.obj, String(x.key||'').split('|')[1] || '', x.aid, x.who, x.job, x.field, x.tracker, x.ashby, x.auth, x.route, x.rank, '']); });
    write('V9 - Correct', fh, true);

    var ch = [['audit-id','Candidate','Job','Tracker Qtr','Why no opening','Result']];
    lCreate.forEach(function(x){ ch.push([x.aid, x.name || '(unfilled)', x.job, x.trackerQ, x.why, '']); });
    write('V9 - Create', ch, true);

    var rh = [['audit-id','Candidate','Job','Opening id','Opening Qtr','Tracker Qtr','Claim rank','Result']];
    lRedate.concat(lUndated).forEach(function(x){ rh.push([x.aid, x.name || '(unfilled)', x.job, x.openingId, x.openingQ || '(undated)', x.trackerQ, x.rank, '']); });
    write('V9 - Re-date', rh, true);

    var lh = [['audit-id','Candidate','Job','Opening to link','Claim rank','Why','Result']];
    lLink.forEach(function(x){ lh.push([x.aid, x.name, x.job, x.openingId, x.rank, x.why, '']); });
    write('V9 - Link', lh, true);

    var oh = [['Opening id','Opened','Quarter','State','Note']];
    lOrphan.forEach(function(o){ oh.push([o.id, o.openedAt || '(undated)', o.q || '', o.state || '', 'no tracker position claims it']); });
    write('V9 - Orphan', oh, false);

    var sh9 = [['Job','Field','Tracker values that disagree','Positions']];
    trackerSelfConflict.forEach(function(x){ sh9.push([x.job, x.field, x.values, x.positions]); });
    write('V9 - Tracker self-conflict', sh9, false);

    Logger.log('V9 ' + RUN + ' | scope ' + (QF||'all 2026') + ' | rows ' + rows.length + ' | X ' + X.length + ' | in scope ' + inScope.length);
    Logger.log('V9 FIELDS findings ' + findings.length + ' | CORRECT ' + lCorrect.length + ' (API-fixable ' + lFixable.length + ') | DECIDE ' + lDecide.length + ' | tracker self-conflicts ' + trackerSelfConflict.length);
    Logger.log('V9 GATE skipped :: chosen-opening ' + skipped.chosenOpening + ' | weak-job ' + skipped.weakJob + ' | no-person ' + skipped.noPerson + ' | dropped-opening ' + skipped.droppedOpening + ' | blank-authority ' + skipped.blankAuthority);
    Logger.log('V9 VIEWS create ' + lCreate.length + ' | re-date ' + (lRedate.length + lUndated.length) + ' | link ' + lLink.length + ' | orphan ' + lOrphan.length + ' | dropped (excluded from CREATE) ' + lDropped.length);
    Logger.log('V9 CLAIMS bound ' + lBound.length + ' | forced ' + lForced.length + ' | chosen ' + lChosen.length + ' | covered(joined) ' + lCovered.length + ' | none(CREATE) ' + lCreate.length + ' | dropped-no-claim ' + lDropped.length);
    Logger.log('V9 re-date candidates ' + lRedate.length + ' | contested openings ' + contested.length + ' | unclaimed openings (ORPHAN, unscoped) ' + lOrphan.length);
    var whyCount = {};
    claims.forEach(function(x){ whyCount[x.why] = (whyCount[x.why]||0) + 1; });
    Logger.log('V9 WHY :: ' + Object.keys(whyCount).map(function(k){ return k + '=' + whyCount[k]; }).join(' | '));
    Logger.log('V9 POOL :: poolable ' + poolable.length + ' | jobs with a free opening ' + Object.keys(byJob).length + ' | filled-no-link ' + inScope.filter(function(c){ return !c.bound && c.m; }).length + ' | unfilled ' + inScope.filter(function(c){ return !c.m; }).length);
    Logger.log('V9 closure checks PASSED (they prove nothing about match quality - see 58d)');
    return out.getUrl();
  }
  if (opts.mode === 'v7' || opts.mode === 'v8') {
    var V8 = (opts.mode === 'v8');
    var L=[], add=function(a,b,c,d){ L.push([a,b===undefined?'':b,c===undefined?'':c,d===undefined?'':d]); };
    var NO_OPENING_EXPECTED={'Yet to Open':1,'Role Shelved':1,'Carry Forward to Next Q':1};
    var inScope=[], X=[];
    ctx.forEach(function(c){ var oos = !!NO_OPENING_EXPECTED[String(c.tr.status||'').trim()];
      // V8 step-0 GUARD: a row with a candidate or an Ashby match is NOT out of scope, whatever the tracker says.
      if (V8 && oos && (String(c.tr.name||'').trim() || String(c.tr.email||'').trim() || c.m)) oos = false;  // 56s
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
    var Dproven=0, Dinferred=0, Dbroken=0;   // 56p: proven link vs inferred guess
    B.forEach(function(c){ var own=c.m.openingId||null, oid=own||c.m.openingIdAny||null;
      if(oid && !opsByIdAll[oid]) Dbroken++;   // 56t(b): link points at an opening the store lacks
      if(oid && opsByIdAll[oid]){ if(own) Dproven++; else Dinferred++;
        linked.push(c); useCount[oid]=(useCount[oid]||0)+1; Dids[oid]=c; } else unlinked.push(c); });
    var D3=0, d3List=[];
    for(var uk in useCount) if(useCount[uk]>1){ D3+=useCount[uk]-1;
      if(V8) d3List.push({openingId:uk, extra:useCount[uk]-1, c:Dids[uk]}); }
    // free pool = every non-archived opening not already claimed by a link
    // 🚨 An opening that is CLOSED cannot cover a vacancy - it has already been used. Without this the
    // allocator hands out openings that were closed-as-hired years ago: 2025-Q3 alone holds 494 openings,
    // every one of them closed as Hired, sitting on 236 jobs. Those were being counted as 'cover' for unfilled
    // 2026 positions, and re-dating one would move a 2025 hire's opening into 2026 and corrupt both quarters.
    // 56k: the pool was workspace-wide while demand was ONE quarter, so an opening already
    // claimed by ANOTHER quarter's position was handed out as free. ash = every offer, all quarters.
    var globalClaimed={}, gcCount=0;
    try{ ash.forEach(function(x){ if(!x.openingId) return;
      if(String(x.appStatus||'')==='Archived') return;   // 56x: dropped candidate releases the opening
      if(!globalClaimed[x.openingId]){ globalClaimed[x.openingId]=1; gcCount++; } }); }catch(eGC){}
    var freeByJob={}, alreadyClosed=0, claimedElsewhere=0;
    for(var ok2 in opsByIdAll){ var o2=opsByIdAll[ok2]; if(useCount[o2.id]) continue;
      if(o2.cr){ alreadyClosed++; continue; }   // closed for any reason = not available
      if(V8 && globalClaimed[o2.id]){ claimedElsewhere++; continue; }   // 56k
      o2.jobIds.forEach(function(jid){ (freeByJob[jid]=freeByJob[jid]||[]).push(o2); }); }
    var v8Claimed = {};
    // 56m: skip openings already claimed (a multi-job opening sits in several pools).
    // 56l: prefer an opening whose quarter already matches, so a stale one is not handed out
    //      while a correctly-dated free opening sits behind it in the same pool.
    var take = function(jid, wantQ){ var p = freeByJob[jid]; if(!p||!p.length) return null;
      var pick = -1;
      for (var pi=0; pi<p.length; pi++){ if (v8Claimed[p[pi].id]) continue;
        if (pick < 0) pick = pi;
        if (wantQ && p[pi].dated && p[pi].q === wantQ) { pick = pi; break; } }
      if (pick < 0) return null;
      var t = p.splice(pick,1)[0]; v8Claimed[t.id] = 1; return t; };
    var D1 = 0, D2 = 0;
    var linkList = [], createFilled = [], createUnfilled = [], redateList = [], okList = [];  // 56o: keep identities
    unlinked.forEach(function(c){ if(!c.jr.id){ D2++; if(V8) createFilled.push(c); return; }
      var o = take(c.jr.id, V8 ? c.tr.opq : null);
      if(o){ D1++; if(V8) linkList.push({c:c, o:o}); } else { D2++; if(V8) createFilled.push(c); } });
    // ---- E branch: what is left over covers the unfilled positions ----
    // F2 lumps three different problems together, and they are NOT the same job:
    //   F2a UNDATED    - no openedAt at all. INVISIBLE to every dashboard metric. Needs a date typed in.
    //   F2b WRONG QTR  - dated, but to another quarter. It IS counted, just in the wrong bucket.
    //   F2c NO TRACKER QUARTER - the tracker row has no opening quarter to compare against, so this is a
    //       TRACKER gap, not an Ashby one. Previously these were silently blamed on Ashby.
    var F1=0, F2undated=0, F2wrongQ=0, F2noTrkQ=0, G1=0, G2=0, wrongQdetail={};
    E.forEach(function(c){
      if(!c.jr.id){ G2++; return; }
      var o = take(c.jr.id, V8 ? c.tr.opq : null);
      if(!o){ if(V8) createUnfilled.push(c); if(String(c.jr.jstatus||'').toLowerCase().indexOf('open')>-1) G1++; else G2++; return; }
      if(!o.dated){ F2undated++; if(V8) redateList.push({c:c,o:o,from:'UNDATED',to:c.tr.opq}); return; }
      if(!c.tr.opq){ F2noTrkQ++; return; }
      if(o.q === c.tr.opq){ F1++; if(V8) okList.push({c:c,o:o}); return; }
      F2wrongQ++; if(V8) redateList.push({c:c,o:o,from:o.q,to:c.tr.opq});
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
    if(!V8) add('>>> THE THREE NUMBERS TO ACT ON');
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
    var allocPairs = [];   // 56n: every opening the audit PUT IN PLAY, not only the offer-linked ones
    if (V8) { B.forEach(function(c){ var oid = c.m.openingId || c.m.openingIdAny || null;
      if (oid && opsByIdAll[oid] && c.op !== opsByIdAll[oid]) { v8Saved.push([c, c.op]); c.op = opsByIdAll[oid]; v8Rebound++; } }); }
    // 56n: the 44 LINK targets and the pool-allocated unfilled openings were NEVER field-checked.
    if (V8) { [].concat(linkList, redateList, okList).forEach(function(pr){
      if (pr && pr.o && pr.c) { v8Saved.push([pr.c, pr.c.op]); pr.c.op = pr.o; allocPairs.push(pr); } }); }
    var candGap={}, jobGap={}, opGap={};
    var corrRows = [];
    B.forEach(function(c){ F0.forEach(function(f){ if(f.obj!=='candidate') return;
      if(v7mismatch(f,c)){ candGap[f.n]=(candGap[f.n]||0)+1;
        if(V8) corrRows.push(['Candidate', c.tr.name||'', f.n, String(f.t(c)||''), String(f.a(c)||''), ROUTE[f.n]||'']); } }); });
    Object.keys(Cids).forEach(function(id){ var c=Cids[id]; F0.forEach(function(f){ if(f.obj!=='job') return;
      if(v7mismatch(f,c)){ jobGap[f.n]=(jobGap[f.n]||0)+1;
        if(V8) corrRows.push(['Job', c.jr.title||'', f.n, String(f.t(c)||''), String(f.a(c)||''), ROUTE[f.n]||'']); } }); });
    var opRows = [], opSeen = {};
    Object.keys(Dids).forEach(function(id){ opRows.push({id:id, c:Dids[id]}); });
    if (V8) allocPairs.forEach(function(pr){ opRows.push({id:pr.o.id, c:pr.c}); });
    opRows.forEach(function(rw){ if(opSeen[rw.id]) return; opSeen[rw.id]=1;
      F0.forEach(function(f){ if(f.obj!=='opening') return;
        if(v7mismatch(f, rw.c)){ opGap[f.n]=(opGap[f.n]||0)+1;
          if(V8) corrRows.push(['Opening', String(rw.id).slice(0,8), f.n, String(f.t(rw.c)||''), String(f.a(rw.c)||''), ROUTE[f.n]||'']); } }); });
    // 56f: compute the status split INSIDE the rebound window too, or it describes the old opening.
      var stF=null; for(var z=0;z<F0.length;z++) if(F0[z].n==='Opening Status') stF=F0[z];
    var stSplit={}, stTotal=0, stArchivable=0;
    // was Dids (90 offer-linked) while the field gaps moved to opRows (187) — stale, now aligned.
    if(stF) opRows.forEach(function(rw){ var sc=rw.c;
      if(v7mismatch(stF,sc)){ var tv=String(stF.t(sc)||'(blank)'), av=String(stF.a(sc)||'(no opening)');
        var k=tv+'  ->  '+av;
        if(/shelv|closed|drop/i.test(tv) && /open|filled/i.test(av)) stArchivable++;
          stSplit[k]=(stSplit[k]||0)+1; stTotal++; } });
    // 56f: put c.op back so nothing downstream sees the temporary rebinding.
    // 56v: RE-DATE is ONE deduped set of openings whose quarter is wrong - never F2 + QGAP,
    // which counted the unfilled 15 twice once F4 pulled them into the gap loop.
    var redateSet = {}, qF = null;
    for (var z2=0; z2<F0.length; z2++) if (F0[z2].n === 'Opening Quarter') qF = F0[z2];
    if (V8 && qF) opRows.forEach(function(rw){ if (v7mismatch(qF, rw.c)) {
      redateSet[rw.id] = { id:rw.id, c:rw.c, from:(rw.c.op && rw.c.op.q) || 'UNDATED', to:rw.c.tr.opq || '?' }; } });
    if (V8) redateList.forEach(function(pr){ if(!redateSet[pr.o.id])
      redateSet[pr.o.id] = { id:pr.o.id, c:pr.c, from:pr.from||'UNDATED', to:pr.to||'?' }; });
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
      var openTotal=0, unclaimed=0, undatedOrphan=0;
        for (var rk in opsByIdAll){ var ro=opsByIdAll[rk]; if(ro.cr) continue;
          // 56y: an UNDATED unclaimed opening is the most important orphan - never filter it out.
          if (opts.onlyQuarter && ro.dated && ro.q !== opts.onlyQuarter) continue;
          if (!ro.dated) undatedOrphan++;
          openTotal++;
        if(!useCount[ro.id] && !v8Claimed[ro.id]) unclaimed++; }
      // 56q: RE-DATE is a QUARTER problem. Only Opening Quarter moves a dashboard number;
      //      Opening Date gaps inside the right quarter are cosmetic. Both leave CORRECT
      //      because fixing either is the SAME single openedAt edit.
      var QGAP=(opGap['Opening Quarter']||0), DGAP=(opGap['Opening Date']||0);
      var DATE_ONLY = Math.max(0, DGAP - QGAP);
      var REDATE_ROWS = Object.keys(redateSet);
      var CREATE=G1+G2+D2+D3, REDATE=REDATE_ROWS.length, LINK=D1;   // 56v: deduped set, not a sum
      var CORRECT_raw=0; for(var q1 in candGap)CORRECT_raw+=candGap[q1]; for(var q2 in jobGap)CORRECT_raw+=jobGap[q2]; for(var q3 in opGap)CORRECT_raw+=opGap[q3];
      // 56c: the four outputs must be DISJOINT. RE-DATE owns Opening Date; never-fixable and mapping
      // artefacts are not work. Subtract them and show the subtraction so nobody re-adds it.
      var OWNED_BY_REDATE=QGAP+DGAP;   // 56q
      var NEVERFIX=(candGap['Status']||0)+(candGap['Offer Quarter']||0);
      var NOTACTION=(jobGap['Job Name']||0);
      var DROPPED=(opGap['Location']||0);   // 56r: owner ruled Location not worth fixing
      var CORRECT=CORRECT_raw-OWNED_BY_REDATE-NEVERFIX-NOTACTION-DROPPED;
      // 56d: Opening Status is the biggest bucket and is NOT actionable until split by what the
      // tracker expects vs what Ashby has. Shelved-but-live is a safe archive; Open<->Filled is a probe.
      add(''); add('LINK EVIDENCE (56p)', '', 'plan step 4 says follow the offer link, never guess');
      add('  D reached by the offer OWN link (proven)', Dproven);
      add('  D reached only by openingIdAny (INFERRED - a guess)', Dinferred, 'treat these as unverified');
      add('  offer links pointing at an opening the store lacks', Dbroken, '56t - silently re-labelled unlinked');
      add('  openings excluded: already claimed by ANOTHER quarter (56k)', claimedElsewhere, 'of '+gcCount+' globally claimed');
      add('  shared-opening rows needing their own opening (D3)', d3List.length, 'now carried as worklist rows');
      var undatedStore=0, undatedOpen=0;
      for(var uk2 in opsByIdAll){ var uo=opsByIdAll[uk2]; if(!uo.dated){ undatedStore++; if(!uo.cr) undatedOpen++; } }
      add(''); add('CONTROL (56B) - openings in the STORE with no openedAt', undatedStore, 'of which still open: '+undatedOpen+'. If 0, the store builder is dropping them and every undated figure is meaningless');
      add(''); add('THE FOUR OUTPUTS (V8)');
      add('  CREATE an opening', CREATE, 'UI only. G '+(G1+G2)+' + D2 '+D2+' + shared-opening '+D3);
      add('  RE-DATE an opening', REDATE, 'deduped set of openings whose quarter is wrong');
      add('  LINK an offer to an opening', LINK, 'no API sets the opening on an existing offer');
      add('  CORRECT a field', CORRECT, 'ACTIONABLE only - per object, validated comparators');
      add('    raw field gaps', CORRECT_raw, 'before the subtractions below');
      add('    less: Opening Date + Opening Quarter', OWNED_BY_REDATE, 'counted in RE-DATE - do NOT count twice');
      add('    less: never fixable', NEVERFIX, 'Status + Offer Quarter - no write API at any level');
      add('    less: not actionable', NOTACTION, 'Job Name = mapping artefacts, not defects');
      add('  field gaps re-pointed to the LINKED opening (56f)', v8Rebound, 'rows where the allocator disagreed with the offer link');
      // DIAGNOSTIC (Jerin, 7 Sep): the audit sets tr.opq = Job Creation Quarter, but the axis that
      // matters is the OPENING creation quarter - on both sides. Measure how far apart they are.
      var qMis=0, qNoDate=0, qSample={};
      ctx.forEach(function(c){ var dq = qtr(c.tr.opd);
        if(!dq){ qNoDate++; return; }
        if(dq !== c.tr.opq){ qMis++; var kk = c.tr.opq + '  (job-creation)  vs  ' + dq + '  (tracker opening date)';
          qSample[kk] = (qSample[kk]||0)+1; } });
      var linkUndated = linkList.filter(function(pr){ return !pr.o.dated; }).length;
      var linkWrongQ  = linkList.filter(function(pr){ return pr.o.dated && pr.o.q !== pr.c.tr.opq; }).length;
      add(''); add('56n - openings actually FIELD-CHECKED', Object.keys(opSeen).length, 'was 90 (offer-linked only); now includes every allocated opening');
      add('  LINK targets with NO DATE', linkUndated, 'CRITICAL - linking a hire here makes it INVISIBLE to every dashboard metric');
      add('  LINK targets dated to the WRONG QUARTER', linkWrongQ, 'linking is fine but they need re-dating too');
      add(''); add('DIAGNOSTIC - which quarter axis?', '', 'tr.opq is Job Creation Quarter; the opening date says otherwise');
      add('  rows whose tracker OPENING DATE is in a different quarter', qMis, 'these are audited against the WRONG quarter');
      add('  rows with no tracker opening date at all', qNoDate, 'no opening-quarter can be derived for these');
      for(var qk in qSample) add('    ' + qk, qSample[qk]);
      add(''); add('OPENING STATUS - split by tracker expects  ->  Ashby has', stTotal, 'now over all openings the audit touched, not just the linked ones');
      add('  tracker says shelved/closed but Ashby is live  ->  API opening.setArchived', stArchivable, 'SCRIPTABLE');
      add('  the rest need a human decision first', stTotal-stArchivable, 'state flips not in the proven write set');
      for(var sk in stSplit){ var route = /shelved|closed/i.test(sk.split('->')[0]) ? 'API - opening.setArchived (safe batch)' : (/open|filled/i.test(sk) ? 'PROBE FIRST - state flip may be impossible' : 'review'); add('    '+sk, stSplit[sk], route); }
      add(''); add('REVERSE CHECK - Ashby openings NO tracker row claims', unclaimed, 'of '+openTotal+' in-quarter or undated');
      add('  of those, UNDATED', undatedOrphan, 'invisible to every dashboard metric - the worst kind');
      add(''); add('ARITHMETIC (step 10)');
      // 56h: the old ok1/ok2/ok3 were partition identities - true by construction, could never fail.
      // These CAN fail, and each one guards a defect we actually hit.
      // 56w: the previous gates compared a list against the counter incremented on the same line -
      // tautologies. These test PROPERTIES of the emitted rows and can genuinely fail.
      var badRedate = REDATE_ROWS.filter(function(k){ var r=redateSet[k]; return r.from === r.to; }).length;
      var badLink   = linkList.filter(function(pr){ return !!pr.o.cr || useCount[pr.o.id] > 0; }).length;
      var badCreate = createUnfilled.filter(function(c){ var pool=freeByJob[c.jr.id]||[];
        return pool.filter(function(o){ return !v8Claimed[o.id]; }).length > 0; }).length;
      var takesOK  = (badRedate===0);
      var linkOK   = (badLink===0);
      var redateOK = (badCreate===0);
      var createOK = (createFilled.length+createUnfilled.length) === (D2+G1+G2);
      var ok1=takesOK, ok2=(linkOK&&redateOK&&createOK), ok3=(CORRECT>=0 && CORRECT_raw>=OWNED_BY_REDATE+NEVERFIX+NOTACTION+DROPPED);
      add('  no re-date row that needs no change', ok1?'PASS':'FAIL', badRedate+' rows where from===to');
      add('  no link to a closed/already-linked opening · no create while a free one remained', ok2?'PASS':'FAIL', 'badLink '+badLink+' · badCreate '+badCreate);
      add('  CORRECT subtractions do not exceed the raw total', ok3?'PASS':'FAIL');
      add('  IGNORED - date drift inside the right quarter', DATE_ONLY, 'cosmetic - moves no dashboard number');
      add('  IGNORED - Location', DROPPED, 'owner ruled it not worth fixing');
      add('  WORKLIST ROWS CAPTURED', linkList.length+redateList.length+createFilled.length+createUnfilled.length, 'link + redate + create, with identities - 56o');
      add(''); add('NOT BUILT - Sourcer (field 18)', '', 'BLOCKED: the audit store carries no sourcer per application; needs a DataRefresh change');
      if(!(ok1&&ok2&&ok3)) throw new Error('V8 arithmetic FAILED - refusing to publish');
    }
      if (V8) {   // ===== 56e: WORKLIST TABS - one row per action =====
        var q = function(x){ return String(x==null?'':x); };
        var reW = [['Opening ID','Job','Position / candidate','Current quarter','TARGET quarter','Offer qtr','Joining qtr','CHECK','Route','Result']];
        var reSuspect=0, reNoCand=0;
        REDATE_ROWS.forEach(function(k){ var r=redateSet[k], c=r.c||{};
          var mm=c.m||null;
          var oq = mm ? qtr(mm.offerCreatedAt||mm.decidedAt||'') : '';
          var jq = mm ? qtr(mm.startDate||'') : '';
          var flag='';
          if(!mm){ reNoCand++; flag='unfilled - nothing to cross-check'; }
          else if((oq && oq!==r.to) || (jq && jq!==r.to)){ reSuspect++;
            flag='SUSPECT - candidate offer/join is not '+r.to+'; the TRACKER row may be misfiled. Do NOT re-date blindly'; }
          else flag='consistent';
          reW.push([ q(r.id).slice(0,8), q(c.jr&&c.jr.title), q((c.tr&&c.tr.name)||'(unfilled position)'),
                     q(r.from), q(r.to), q(oq), q(jq), flag, 'UI only - openedAt cannot be set by API', '' ]); });
        add(''); add('RE-DATE CROSS-CHECK');
        add('  rows with a candidate whose offer/join quarter is NOT the target', reSuspect, 'need a human decision - re-dating could corrupt a completed hire');
        add('  rows with no candidate (unfilled)', reNoCand);
        write('V8 - Re-date', reW, false);
        var lkW = [['Candidate','Email','Job','Opening ID to attach','That opening quarter','Tracker quarter','Route','Result']];
        linkList.forEach(function(pr){ var c=pr.c||{}, o=pr.o||{};
          lkW.push([ q(c.tr&&c.tr.name), q(c.tr&&c.tr.email), q(c.jr&&c.jr.title), q(o.id).slice(0,8),
                     q(o.dated?o.q:'UNDATED'), q(c.tr&&c.tr.opq), 'UI, or at hire time', '' ]); });
        write('V8 - Link', lkW, false);
        var crW = [['Job','Job status','Why','Target quarter','Role Complexity','Role Type','Employment Type','Result']];
        [].concat(createFilled, createUnfilled).forEach(function(c){ if(!c) return; var t=c.tr||{};
          crW.push([ q(c.jr&&c.jr.title), q(c.jr&&c.jr.jstatus), q(t.name?'filled position, no free opening':'unfilled, no opening'),
                     q(t.opq), q(t.cx), q(t.role), q(t.emp), '' ]); });
        d3List.forEach(function(d){ var c=d.c||{}, t=c.tr||{};
          crW.push([ q(c.jr&&c.jr.title), q(c.jr&&c.jr.jstatus), 'shared opening - '+d.extra+' extra position(s) need their own',
                     q(t.opq), q(t.cx), q(t.role), q(t.emp), '' ]); });
        write('V8 - Create', crW, false);
        var coW = [['Object','Which','Field','Tracker says','Ashby says','Route','Actionable?','Result']];
        var DROP_F = {'Location':1,'Job Name':1,'Status':1,'Offer Quarter':1,'Opening Date':1,'Opening Quarter':1};
        var DROP_F2 = DROP_F;
        corrRows.forEach(function(r){ coW.push(r.concat([ DROP_F[r[2]] ? 'no - excluded' : 'YES', '' ])); });
        write('V8 - Correct', coW, false);
        // ===== BY OBJECT: one row per opening / per candidate, everything wrong with it =====
        var opFix={}, cdFix={};
        function opAdd(id, job, who, what){ if(!id) return; var k=String(id);
          if(!opFix[k]) opFix[k]={ id:k, job:job||'', who:who||'', acts:[] }; 
          if(!opFix[k].job && job) opFix[k].job=job; if(!opFix[k].who && who) opFix[k].who=who;
          opFix[k].acts.push(what); }
        function cdAdd(name, email, job, what){ var k=(email||name||'').toLowerCase(); if(!k) return;
          if(!cdFix[k]) cdFix[k]={ name:name||'', email:email||'', job:job||'', acts:[] };
          cdFix[k].acts.push(what); }
        REDATE_ROWS.forEach(function(k){ var r=redateSet[k], c=r.c||{};
          opAdd(r.id, c.jr&&c.jr.title, (c.tr&&c.tr.name)||'(unfilled)', 'RE-DATE: '+r.from+' -> '+r.to); });
        linkList.forEach(function(pr){ var c=pr.c||{}, o=pr.o||{};
          opAdd(o.id, c.jr&&c.jr.title, c.tr&&c.tr.name, 'LINK this opening to '+((c.tr&&c.tr.name)||'the hire'));
          cdAdd(c.tr&&c.tr.name, c.tr&&c.tr.email, c.jr&&c.jr.title, 'LINK to opening '+String(o.id).slice(0,8)); });
        corrRows.forEach(function(r){
          var drop = {'Location':1,'Job Name':1,'Status':1,'Offer Quarter':1,'Opening Date':1,'Opening Quarter':1}[r[2]];
          if(drop) return;
          if(r[0]==='Opening') opAdd(r[1], '', '', 'SET '+r[2]+': "'+r[4]+'" -> "'+r[3]+'"');
          else if(r[0]==='Candidate') cdAdd(r[1], '', '', 'SET '+r[2]+': "'+r[4]+'" -> "'+r[3]+'"'); });
        var opW=[['Opening ID','Job','Position / candidate','How many changes','Everything to change on this opening','Result']];
        Object.keys(opFix).forEach(function(k){ var o=opFix[k];
          opW.push([ o.id.slice(0,8), o.job, o.who, o.acts.length, o.acts.join('  |  '), '' ]); });
        write('V8 - Openings to fix', opW, false);
        var cdW=[['Candidate','Email','Job','How many changes','Everything to change for this person','Result']];
        Object.keys(cdFix).forEach(function(k){ var c=cdFix[k];
          cdW.push([ c.name, c.email, c.job, c.acts.length, c.acts.join('  |  '), '' ]); });
        write('V8 - Candidates to fix', cdW, false);
        // route split of the ACTIONABLE corrections
        var byRoute={}, apiN=0, uiN=0, otherN=0, dropN=0;
        var DROP_R={'Location':1,'Job Name':1,'Status':1,'Offer Quarter':1,'Opening Date':1,'Opening Quarter':1};
        corrRows.forEach(function(r){ if(DROP_R[r[2]]){ dropN++; return; }
          var rt=String(r[5]||''); byRoute[r[2]]=(byRoute[r[2]]||0)+1;
          if(/^API/i.test(rt)) apiN++; else if(/UI/i.test(rt)) uiN++; else otherN++; });
        add(''); add('HOW THE 137 CORRECTIONS SPLIT BY ROUTE');
        add('  fixable by API (scriptable, no clicking)', apiN);
        add('  UI only (by hand in Ashby)', uiN);
        add('  unclear / needs a decision', otherN);
        for(var bk in byRoute) add('    ' + bk, byRoute[bk], ROUTE[bk]||'');
        // ===== CLOSURE TEST (Jerin's design): mock-apply every correction, then ask what is LEFT.
        // Runs on the OUTPUT rows, not on the counters that produced them - so it can genuinely fail.
        var cBlank=0, cSame=0, cApplicable=0, residual={}, blankEx=[], sameEx=[];
        corrRows.forEach(function(r){
          var field=r[2], trk=String(r[3]||'').trim(), ash=String(r[4]||'').trim();
          if(DROP_F2[field]){ residual[field]=(residual[field]||0)+1; return; }   // deliberately not fixed
          if(!trk){ cBlank++; if(blankEx.length<4) blankEx.push(field+' on '+String(r[1]).substring(0,22)); return; }
          if(trk===ash){ cSame++; if(sameEx.length<4) sameEx.push(field+' = "'+trk.substring(0,18)+'"'); return; }
          cApplicable++; });
        add(''); add('CLOSURE TEST - mock-apply the corrections, then look at what remains');
        add('  corrections that WOULD close the gap', cApplicable, 'tracker has a real value that differs from Ashby');
        add('  PHANTOM: tracker side is BLANK - nothing to write', cBlank, cBlank? ('e.g. '+blankEx.join(' | ')) : 'none - good');
        add('  PHANTOM: both sides already identical - comparator flagged a non-difference', cSame, cSame? ('e.g. '+sameEx.join(' | ')) : 'none - good');
        add('  RESIDUAL after applying everything (should be ONLY the agreed exclusions):');
        var expectedEx={'Location':1,'Job Name':1,'Status':1,'Offer Quarter':1,'Opening Date':1,'Opening Quarter':1};
        var unexpected=0;
        for(var rf in residual){ add('      '+rf, residual[rf], expectedEx[rf]?'expected - agreed exclusion':'*** UNEXPECTED - a gap with no correction ***');
          if(!expectedEx[rf]) unexpected+=residual[rf]; }
        add('  unexpected residual (must be 0)', unexpected, unexpected? '*** THE AUDIT MISSED SOMETHING ***':'PASS - every remaining gap is one we chose to leave');
        add('  people with no Ashby record - unfixable by any field correction', B2, 'expected residual, needs candidate creation');
        // ===== STRUCTURAL CLOSURE TEST: mock-apply CREATE + RE-DATE + LINK, then re-check coverage.
        // Every in-scope position must end up on exactly ONE opening, dated to ITS OWN quarter.
        var sim=[], simIdx=0;
        function qAfter(oid, fallbackQ){ return redateSet[oid] ? redateSet[oid].to : fallbackQ; }
        Object.keys(Dids).forEach(function(oid){ var c=Dids[oid], o=opsByIdAll[oid]||{};
          sim.push({c:c, oid:oid, q:qAfter(oid, o.dated?o.q:null), src:'already linked'}); });
        linkList.forEach(function(pr){ sim.push({c:pr.c, oid:pr.o.id, q:qAfter(pr.o.id, pr.o.dated?pr.o.q:null), src:'LINK'}); });
        okList.forEach(function(pr){ sim.push({c:pr.c, oid:pr.o.id, q:qAfter(pr.o.id, pr.o.dated?pr.o.q:null), src:'already correct'}); });
        redateList.forEach(function(pr){ sim.push({c:pr.c, oid:pr.o.id, q:qAfter(pr.o.id, pr.o.dated?pr.o.q:null), src:'RE-DATE'}); });
        [].concat(createFilled, createUnfilled).forEach(function(c){ if(!c) return;
          sim.push({c:c, oid:'NEW#'+(simIdx++), q:(c.tr&&c.tr.opq)||null, src:'CREATE'}); });
        d3List.forEach(function(d){ for(var e=0;e<d.extra;e++)
          sim.push({c:d.c, oid:'NEW#'+(simIdx++), q:(d.c&&d.c.tr&&d.c.tr.opq)||null, src:'CREATE (shared)'}); });
        var seenPos=[], dupPos=0, useCnt={}, dupOpening=0, wrongQ=0, nullQ=0, wrongEx=[];
        sim.forEach(function(s){
          if(seenPos.indexOf(s.c)>-1) dupPos++; else seenPos.push(s.c);
          useCnt[s.oid]=(useCnt[s.oid]||0)+1;
          var want=(s.c&&s.c.tr&&s.c.tr.opq)||null;
          if(!s.q) nullQ++;
          else if(want && s.q!==want){ wrongQ++; if(wrongEx.length<4) wrongEx.push(s.src+': '+s.q+' vs wanted '+want); } });
        for(var uo in useCnt) if(useCnt[uo]>1) dupOpening++;
        var uncovered=[];
        inScope.forEach(function(c){ if(seenPos.indexOf(c)<0) uncovered.push(c); });
        var uncovNoAshby=0, uncovOther=0, uncovEx=[];
        uncovered.forEach(function(c){ if(!c.m) uncovNoAshby++; else { uncovOther++; if(uncovEx.length<4) uncovEx.push(String((c.tr&&c.tr.name)||'(unfilled)').substring(0,24)); } });
        add(''); add('STRUCTURAL CLOSURE TEST - mock-apply CREATE + RE-DATE + LINK, then re-check');
        add('  in-scope positions', inScope.length);
        add('  positions covered after corrections', seenPos.length);
        add('  positions still UNCOVERED', uncovered.length, 'expected = the people with no Ashby record');
        add('      ...of those, no Ashby record (expected)', uncovNoAshby);
        add('      ...of those, UNEXPLAINED', uncovOther, uncovOther? ('*** GAP: '+uncovEx.join(' | ')+' ***'):'PASS - none');
        add('  a position covered TWICE', dupPos, dupPos?'*** FAIL ***':'PASS');
        add('  an opening used by TWO positions', dupOpening, dupOpening?'*** FAIL ***':'PASS');
        add('  opening left in the WRONG quarter after corrections', wrongQ, wrongQ? ('*** FAIL: '+wrongEx.join(' | ')+' ***'):'PASS');
        add('  opening left with NO quarter after corrections', nullQ, nullQ?'*** FAIL - undated ***':'PASS');
        add(''); add('BY OBJECT (open each thing ONCE)');
        add('  V8 - Openings to fix', opW.length-1, 'distinct openings, each with everything wrong with it');
        add('  V8 - Candidates to fix', cdW.length-1, 'distinct people');
        add(''); add('WORKLIST TABS WRITTEN');
        add('  V8 - Re-date', reW.length-1); add('  V8 - Link', lkW.length-1);
        add('  V8 - Create', crW.length-1); add('  V8 - Correct', coW.length-1, 'excluded rows flagged in the Actionable column');
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
// ===== Phase 3: fix what the API can fix =====================================
// MODES: 'dry' = plan only, no writes | 'pilot' = ONE write per field type | 'run' = full batch
// Reuses buildAuditV4's resolution by re-deriving it, so the plan matches the audit exactly.
var V4_RECRUITER_ROLE='22db8dc8-83f4-40de-8376-87efff4a6eb6';

// ===== #58 | 8 Sep 2026 | audit-sheet cleanup. Jerin approved keeping the hand-reviewed fuzzy
// job match ('V4 Job Mapping Review') and the suppression source ('Job Gaps'). 'Read me' is held
// back pending one decision. Only mode==="run" deletes.
function task59_tidyAuditTabs(mode){
  var KEEP = {'V4 Job Mapping Review':1, 'Job Gaps':1};
  var MUST = ['V4 Job Mapping Review','Job Gaps'];
  var ss = SpreadsheetApp.openById(AUDIT_SHEET_ID);
  var all = ss.getSheets().map(function(s){ return s.getName(); });
  var drop = all.filter(function(n){ return !KEEP[n]; });
  Logger.log('TOTAL ' + all.length + ' | DROP ' + drop.length);
  var rm = ss.getSheetByName("Read me");
  if (rm) {
    var rv = rm.getRange(1,1,Math.min(8,rm.getLastRow()||1),Math.min(2,rm.getLastColumn()||1)).getValues();
    Logger.log('READ ME >> ' + rv.map(function(r){ return r.join(' ~ '); }).join(' // ').slice(0,700));
  }
  if (mode !== 'run'){ Logger.log('LIST MODE - nothing deleted'); return; }
  MUST.forEach(function(n){ if (all.indexOf(n) < 0) throw new Error("REFUSING: keeper missing - " + n); });
  var done = 0, fail = [];
  drop.forEach(function(n){
    try { ss.deleteSheet(ss.getSheetByName(n)); done++; }
    catch(e){ fail.push(n + ' :: ' + e.message); }
  });
  Logger.log('DELETED ' + done + ' | FAILED ' + fail.length + (fail.length ? ' :: ' + fail.join(' ;; ') : ''));
  Logger.log('REMAINING: ' + ss.getSheets().map(function(s){ return s.getName(); }).join(' | '));
}

// ===== #58b | 8 Sep 2026 | the audit-id shared key. Jerin approved 8 Sep; field created by him on Opening
// (non-mandatory). MODES: inspect (read-only) | column (tracker column + protect) | dry | pilot | run.
// PRINCIPLE: only stamp Ashby where the pairing is a FACT (the offer carries the openingId). A forced or
// chosen pairing is an inference and must NOT be baked into the key.
function task58b_auditId(mode){
  mode = mode || 'inspect';
  var TRACKER='1_LQxHDZ6dXehyR2lc8pcFjfDeRaV80vBzVRB_BKWT5A', COL='audit-id';
  var ss = SpreadsheetApp.openById(TRACKER), sh = ss.getSheetByName("Master");
  var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  var hdr = sh.getRange(1,1,1,lastCol).getValues()[0].map(function(h){ return String(h||"").trim(); });
  var idx = hdr.indexOf(COL);
  Logger.log('TRACKER rows ' + (lastRow-1) + ' | cols ' + lastCol + ' | audit-id col ' + (idx<0?'ABSENT':(idx+1)));

  // --- Ashby: locate the custom field Jerin created ---
  var fid = null, fobj = null;
  try {
    var cfs = ashbyListAll_('/customField.list');
    cfs.forEach(function(f){
      var title = String(f.title || f.name || "").trim().toLowerCase();
      if (title === COL) { fid = f.id; fobj = String(f.objectType||""); }
    });
    Logger.log('ASHBY field audit-id: ' + (fid ? ('FOUND on ' + fobj) : 'NOT FOUND'));
  } catch(e){ Logger.log('customField.list FAILED :: ' + e.message); }

  if (mode === 'column' || mode === 'inspect') {
    if (idx < 0) {
      if (mode === 'column') {
        sh.getRange(1, lastCol+1).setValue(COL).setFontWeight("bold");
        idx = lastCol; lastCol = lastCol + 1;
        Logger.log('CREATED audit-id column at ' + lastCol);
      } else { Logger.log('inspect: column would be created at ' + (lastCol+1)); }
    }
  }

  // --- assign ids to every data row that has content ---
  var assigned = 0, existing = 0;
  if (idx >= 0 && mode === 'column') {
    var vals = sh.getRange(2, idx+1, lastRow-1, 1).getValues();
    var probe = sh.getRange(2, 1, lastRow-1, lastCol).getValues();  // 8 Sep fix: whole row, not col 1
    var maxN = 0;
    vals.forEach(function(r){ var mm = /^P-(\d+)$/.exec(String(r[0]||"").trim()); if (mm) maxN = Math.max(maxN, parseInt(mm[1],10)); });
    for (var i=0; i<vals.length; i++){
      var cur = String(vals[i][0]||"").trim();
      if (cur) { existing++; continue; }
      var hasContent = probe[i].some(function(v,c){ return c !== idx && String(v||"").trim() !== ""; });
      if (!hasContent) continue;   // genuinely empty row
      maxN++; vals[i][0] = "P-" + ("00000"+maxN).slice(-5); assigned++;
    }
    sh.getRange(2, idx+1, lastRow-1, 1).setValues(vals);
    Logger.log('IDS assigned ' + assigned + ' | already had one ' + existing);
    try {
      var rng = sh.getRange(1, idx+1, lastRow, 1);
      var prot = rng.protect().setDescription("audit-id - machine key, do not edit (#58b)");
      prot.removeEditors(prot.getEditors());
      Logger.log('PROTECTED the audit-id column');
    } catch(eP){ Logger.log('protect FAILED :: ' + eP.message); }
  }
  return { rows: lastRow-1, idCol: idx+1, fieldId: fid ? true : false, assigned: assigned };
}

// READ-ONLY check written against the SHEET, not against the assigner. Different content test on purpose:
// "any cell in the row is non-empty", vs the assigner's "column 1 is non-empty".
function verify58b_(){
  var ss = SpreadsheetApp.openById('1_LQxHDZ6dXehyR2lc8pcFjfDeRaV80vBzVRB_BKWT5A');
  var sh = ss.getSheetByName("Master");
  var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  var all = sh.getRange(2,1,lastRow-1,lastCol).getValues();
  var hdr = sh.getRange(1,1,1,lastCol).getValues()[0].map(function(h){return String(h||"").trim();});
  var idc = hdr.indexOf("audit-id");
  var jcq = hdr.indexOf("Job Creation Quarter");
  var blankRows=0, withIds=0, missingId=0, missing2026=0, dupes=0, seen={};
  all.forEach(function(r){
    var content = r.some(function(v,i){ return i!==idc && String(v||"").trim()!==""; });
    var id = String(r[idc]||"").trim();
    if (!content) { blankRows++; return; }
    if (id) { withIds++; if (seen[id]) dupes++; seen[id]=1; }
    else { missingId++; if (jcq>-1 && /2026$/.test(String(r[jcq]||"").trim())) missing2026++; }
  });
  Logger.log('VERIFY rows ' + (lastRow-1) + ' | trulyBlank ' + blankRows + ' | withId ' + withIds +
    ' | MISSING id ' + missingId + ' (of which 2026 scope: ' + missing2026 + ') | duplicate ids ' + dupes);
}

// #58c | revision 9. A MODE inside buildAuditV4 - never a clone.
function buildAuditV9(){ return buildAuditV4({ mode:'v9', onlyQuarter:'Q3 2026', label:'v9' }); }

// ===== #58c milestone 3 | 8 Sep 2026 | stamp audit-id onto Ashby openings.
// Reads the WRITTEN ledger tab, not in-memory state - an outside consumer of the artefact.
// 🚨 BOUND PAIRS ONLY. A forced or chosen pairing is an inference and must never be baked into the key.
// modes: 'dry' (default, read-only) | 'pilot' (one write + read-back) | 'run'.
function task58c_stamp(mode){
  mode = mode || 'dry';
  var book = SpreadsheetApp.openById(AUDIT_SHEET_ID);
  var sh = book.getSheetByName('V9 - Claim ledger');
  if (!sh) throw new Error('no V9 - Claim ledger tab - run buildAuditV9() first');
  var v = sh.getDataRange().getValues(), h = v[0];
  var cA = h.indexOf('audit-id'), cR = h.indexOf('Claim rank'), cO = h.indexOf('Opening id'), cN = h.indexOf('Candidate');
  if (cA < 0 || cR < 0 || cO < 0) throw new Error('ledger tab is missing a required column');
  var pairs = [];
  for (var i = 1; i < v.length; i++){
    if (String(v[i][cR]||'').trim() !== 'bound') continue;
    var aid = String(v[i][cA]||'').trim(), oid = String(v[i][cO]||'').trim();
    if (!aid || !oid) continue;
    pairs.push({ aid:aid, oid:oid, who:String(v[i][cN]||'') });
  }
  var fid = null;
  ashbyListAll_('/customField.list').forEach(function(f){
    if (String(f.title||f.name||'').trim().toLowerCase() === 'audit-id') fid = f.id; });
  if (!fid) throw new Error('audit-id custom field not found in Ashby');
  function readCurrent(){ var map = {};
    ashbyListAll_('/opening.list').forEach(function(o){ var lv = o.latestVersion || {};
      (lv.customFields||[]).forEach(function(f){
        if (String(f.title||f.name||'').trim().toLowerCase() === 'audit-id')
          map[o.id] = String(f.value == null ? '' : f.value).trim(); }); });
    return map; }
  var cur = readCurrent();
  var todo = pairs.filter(function(p){ return (cur[p.oid]||'') !== p.aid; });
  var conflict = pairs.filter(function(p){ var c = cur[p.oid]||''; return c && c !== p.aid; });
  var seen = {}, dup = 0;
  pairs.forEach(function(p){ if (seen[p.oid]) dup++; seen[p.oid] = 1; });
  Logger.log('STAMP mode=' + mode + ' | bound pairs ' + pairs.length + ' | already correct ' + (pairs.length - todo.length) +
    ' | to write ' + todo.length + ' | contested(excluded) ' + dup + ' | CONFLICT (already holds a different id) ' + conflict.length);
  // A CONTESTED opening (two positions both holding a real offer link) is an Ashby data error with a known
  // route: one of the two needs its own opening. It cannot carry a key, so it is EXCLUDED and named -
  // not written, and not allowed to block the other pairs.
  var multi = {}; pairs.forEach(function(p){ multi[p.oid] = (multi[p.oid]||0) + 1; });
  var contestedPairs = pairs.filter(function(p){ return multi[p.oid] > 1; });
  if (contestedPairs.length) Logger.log('CONTESTED - excluded from stamping, need a human decision :: ' +
    contestedPairs.map(function(p){ return p.who + ' (' + p.aid + ')'; }).join(' ;; '));
  todo = todo.filter(function(p){ return multi[p.oid] === 1; });
  Logger.log('STAMP after exclusions | will write ' + todo.length + ' (was ' + (todo.length + contestedPairs.length) + ' before removing contested)');
  if (conflict.length) throw new Error('REFUSING: ' + conflict.length + ' openings already carry a DIFFERENT audit-id - resolve by hand first');
  if (mode === 'dry') { Logger.log('DRY - nothing written'); return; }
  var batch = (mode === 'pilot') ? todo.slice(0,1) : todo;
  var okN = 0, fail = [];
  batch.forEach(function(p){
    try { var r = ashbyWrite_('/customField.setValue', { objectType:'Opening', objectId:p.oid, fieldId:fid, fieldValue:p.aid });
      if (r && r.success === false) fail.push(p.aid + ' :: ' + JSON.stringify(r.errors||r).slice(0,70)); else okN++; }
    catch(e){ fail.push(p.aid + ' :: ' + String(e.message).slice(0,70)); } });
  Logger.log('STAMP wrote ' + okN + ' | failed ' + fail.length + (fail.length ? ' :: ' + fail.slice(0,3).join(' ;; ') : ''));
  var back = readCurrent();
  var verified = batch.filter(function(p){ return back[p.oid] === p.aid; }).length;
  var unver = batch.filter(function(p){ return back[p.oid] !== p.aid; });
  Logger.log('STAMP READ-BACK verified ' + verified + ' of ' + batch.length + (unver.length ? ' - MISMATCH' : ' - ALL CONFIRMED'));
  if (unver.length) Logger.log('UNVERIFIED :: ' + unver.map(function(p){
    return p.who + ' | wanted ' + p.aid + ' | Ashby now holds "' + (back[p.oid] || '(empty)') + '"'; }).join(' ;; ').slice(0, 400));
}

// READ-ONLY | 8 Sep | what would "archive the stray openings" actually cost?
// Stray = state Open, not archived, and NOT claimed by any Q3 position in the v9 ledger.
function probeStray58_(){
  var claimed = {}, byRank = {};
  var book = SpreadsheetApp.openById(AUDIT_SHEET_ID);
  var sh = book.getSheetByName('V9 - Claim ledger');
  if (!sh) throw new Error('run buildAuditV9() first');
  var v = sh.getDataRange().getValues(), h = v[0];
  var cR = h.indexOf('Claim rank'), cO = h.indexOf('Opening id');
  for (var i=1;i<v.length;i++){ var oid = String(v[i][cO]||"").trim();
    var r = String(v[i][cR]||"").trim(); if (r) byRank[r] = (byRank[r]||0)+1;
    if (oid) claimed[oid] = 1; }
  var all=0, arch=0, byState={}, open=[];
  ashbyListAll_('/opening.list').forEach(function(o){ all++;
    if (o.isArchived) { arch++; return; }
    var st = String(o.openingState||"(blank)"); byState[st]=(byState[st]||0)+1;
    if (st === 'Open'){ var oa = String(o.openedAt||'');
      open.push({ id:o.id, y: oa ? oa.substring(0,4) : '(undated)', claimed: claimed[o.id] ? 1 : 0 }); } });
  var stray = open.filter(function(o){ return !o.claimed; });
  var byYear = {}; stray.forEach(function(o){ byYear[o.y] = (byYear[o.y]||0)+1; });
  var rowsOut = [['Measure','Value']];
  rowsOut.push(['Openings total (all time)', all]);
  rowsOut.push(['Archived already', arch]);
  Object.keys(byState).sort().forEach(function(k){ rowsOut.push(['Live state: ' + k, byState[k]]); });
  rowsOut.push(['OPEN and live', open.length]);
  rowsOut.push(['-- of those, claimed by a Q3 position', open.length - stray.length]);
  rowsOut.push(['-- STRAY: nothing claims them', stray.length]);
  Object.keys(byYear).sort().forEach(function(k){ rowsOut.push(['STRAY opened in ' + k, byYear[k]]); });
  Object.keys(byRank).sort().forEach(function(k){ rowsOut.push(['Q3 claim rank: ' + k, byRank[k]]); });
  rowsOut.push(['COST IF THE POOL IS ARCHIVED', 'forced + chosen become HAND-CREATED openings (opening.create is blocked)']);
  var t2 = book.getSheetByName('V9 - Stray probe') || book.insertSheet('V9 - Stray probe');
  t2.clear(); t2.getRange(1,1,rowsOut.length,2).setValues(rowsOut);
  t2.getRange(1,1,1,2).setFontWeight("bold");
  Logger.log('stray probe written: ' + rowsOut.length + ' rows');
}

// ================= #58d | THE CHECKER | 8 Sep 2026 =================
// Written OUTSIDE the builder, sharing none of its logic. Reads the PUBLISHED TABS and re-queries Ashby
// and the tracker directly, so it never re-derives a number by the route that produced it.
// Closure checks live in the builder and cannot fail on a bad match. THESE can.
function check58d_(){
  var book = SpreadsheetApp.openById(AUDIT_SHEET_ID);
  function tab(n){ var s = book.getSheetByName(n); if (!s) throw new Error("missing tab: " + n); return s.getDataRange().getValues(); }
  function cols(v){ var h = v[0], o = {}; h.forEach(function(x,i){ o[String(x).trim()] = i; }); return o; }
  var out = [["Check","Scope","Result","Detail"]];
  function rec(n, sc, ok, d){ out.push([n, sc, ok ? "PASS" : "FAIL", d || ""]); }
  var ops = {};
  ashbyListAll_('/opening.list').forEach(function(o){
    var lv = o.latestVersion || {}, aid = "";
    (lv.customFields||[]).forEach(function(f){ if (String(f.title||f.name||'').trim().toLowerCase() === 'audit-id') aid = String(f.value == null ? '' : f.value).trim(); });
    var oa = istDay_(o.openedAt);   // #115: India time, not UTC
    ops[o.id] = { state:String(o.openingState||''), archived:!!o.isArchived, aid:aid,
      q: oa ? ('Q' + (Math.floor((parseInt(oa.substring(5,7),10)-1)/3)+1) + ' ' + oa.substring(0,4)) : '' }; });
  var trkSS = SpreadsheetApp.openById('1_LQxHDZ6dXehyR2lc8pcFjfDeRaV80vBzVRB_BKWT5A');
  var trk = trkSS.getSheetByName('Master');
  var tv = trk.getDataRange().getValues(), tc = cols(tv), trkByAid = {};
  for (var i=1;i<tv.length;i++){ var a = String(tv[i][tc['audit-id']]||'').trim(); if (a) trkByAid[a] = tv[i]; }
  function tq(row, key){ if (tc[key] == null) return ""; var v = row[tc[key]]; if (!v) return "";
    var d = (Object.prototype.toString.call(v) === "[object Date]") ? v : new Date(v);
    if (isNaN(d.getTime())) return String(v).trim();
    var s = Utilities.formatDate(d, trkSS.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
    return 'Q' + (Math.floor((parseInt(s.substring(5,7),10)-1)/3)+1) + ' ' + s.substring(0,4); }
  var lg = tab("V9 - Claim ledger"), lc = cols(lg);
  var boundN = 0, boundBad = [], claimCount = {};
  for (var r=1;r<lg.length;r++){ var oid = String(lg[r][lc["Opening id"]]||"").trim();
    if (oid) claimCount[oid] = (claimCount[oid]||0)+1;
    if (String(lg[r][lc["Claim rank"]]).trim() !== "bound") continue;
    var aid = String(lg[r][lc["audit-id"]]||"").trim(); if (!aid || !oid) continue; boundN++;
    var o = ops[oid];
    if (!o) { boundBad.push(aid + ":opening not in Ashby"); continue; }
    if (o.aid && o.aid !== aid) boundBad.push(aid + ":Ashby holds " + o.aid); }
  var boundUnstamped = 0;
  for (var rb=1;rb<lg.length;rb++){ if (String(lg[rb][lc["Claim rank"]]).trim() !== "bound") continue;
    var ob = ops[String(lg[rb][lc["Opening id"]]||"").trim()]; if (ob && !ob.aid) boundUnstamped++; }
  rec("Bound stamps read back from Ashby", boundN + " bound", boundBad.length === 0, boundBad.slice(0,5).join(" ;; "));
  rec("COVERAGE: bound openings carrying no audit-id at all", boundN + " bound", boundUnstamped === 0,
      boundUnstamped + " unstamped - expected to equal the contested pairs, which are excluded by design");
  var rv = tab("V9 - Re-date"), rc = cols(rv), rdN = 0, rdBad = [];
  for (var r2=1;r2<rv.length;r2++){ var a2 = String(rv[r2][rc["audit-id"]]||"").trim(); if (!a2) continue; rdN++;
    var row = trkByAid[a2]; if (!row) { rdBad.push(a2 + ":not in tracker"); continue; }
    var target = String(rv[r2][rc["Tracker Qtr"]]||"").trim();
    var doj = tq(row, "DOJ"), off = tq(row, "Date of Offer");
    if (doj && off && doj !== target && off !== target) rdBad.push(a2 + ":target " + target + " vs DOJ " + doj + " / offer " + off); }
  var rdUnverifiable = 0;
  for (var r6=1;r6<rv.length;r6++){ var a6 = String(rv[r6][rc["audit-id"]]||"").trim(); if (!a6) continue;
    var row6 = trkByAid[a6]; if (!row6) continue;
    if (!tq(row6,"DOJ") && !tq(row6,"Date of Offer")) rdUnverifiable++; }
  rec("Re-date direction: the evidence sits in the target quarter", rdN + " re-dates", rdBad.length === 0, rdBad.slice(0,5).join(" ;; "));
  rec("COVERAGE: re-dates with no date evidence to check against", rdN + " re-dates", rdUnverifiable === 0,
      rdUnverifiable + " cannot be verified either way - they pass by absence, not by evidence");
  var kv = tab("V9 - Link"), kc = cols(kv), lkN = 0, lkBad = [];
  for (var r4=1;r4<kv.length;r4++){ var o2id = String(kv[r4][kc["Opening to link"]]||"").trim(); if (!o2id) continue; lkN++;
    var o2 = ops[o2id];
    if (!o2) { lkBad.push("target not in Ashby"); continue; }
    if (o2.state !== "Open") lkBad.push("state " + o2.state);
    else if (claimCount[o2id] > 1) lkBad.push("claimed " + claimCount[o2id] + " times"); }
  rec("Link targets are Open and claimed exactly once", lkN + " links", lkBad.length === 0, lkBad.slice(0,5).join(" ;; "));
  var cv = tab("V9 - Create"), cc = cols(cv), crN = 0, crBad = [], aidToOp = {};
  Object.keys(ops).forEach(function(k){ if (ops[k].aid) aidToOp[ops[k].aid] = 1; });
  for (var r5=1;r5<cv.length;r5++){ var a3 = String(cv[r5][cc["audit-id"]]||"").trim(); if (!a3) continue; crN++;
    if (aidToOp[a3]) crBad.push(a3 + ":already stamped on an opening"); }
  rec("Create list holds nobody who already owns an opening", crN + " creates", crBad.length === 0, crBad.slice(0,5).join(" ;; "));
  var ghosts = [];
  [["Create",cv,cc],["Re-date",rv,rc],["Link",kv,kc]].forEach(function(pr){ var vv = pr[1], cx = pr[2];
    for (var i2=1;i2<vv.length;i2++){ var a4 = String(vv[i2][cx["audit-id"]]||"").trim();
      if (a4 && !trkByAid[a4]) ghosts.push(pr[0] + ":" + a4); } });
  rec("No worklist names an audit-id the tracker does not have", "all worklists", ghosts.length === 0, ghosts.slice(0,5).join(" ;; "));
  var s2 = book.getSheetByName("V9 - Checker") || book.insertSheet("V9 - Checker");
  s2.clear(); s2.getRange(1,1,out.length,4).setValues(out); s2.getRange(1,1,1,4).setFontWeight("bold");
  var fails = out.slice(1).filter(function(x){ return x[2] === "FAIL"; }).length;
  Logger.log("CHECKER checks " + (out.length-1) + " | FAILURES " + fails);
}

// READ-ONLY | 8 Sep | is CREATE 78 real? Break it down by REASON, then by job, against live Ashby.
function spotCreate58_(){
  var book = SpreadsheetApp.openById(AUDIT_SHEET_ID);
  var lg = book.getSheetByName("V9 - Claim ledger").getDataRange().getValues();
  var h = {}; lg[0].forEach(function(x,i){ h[String(x).trim()] = i; });
  var job = {}, claimedOid = {};
  for (var i=1;i<lg.length;i++){
    var j = String(lg[i][h["Job"]]||"(blank)").trim();
    var r = String(lg[i][h["Claim rank"]]||"").trim();
    var oid = String(lg[i][h["Opening id"]]||"").trim();
    if (oid) claimedOid[oid] = 1;
    if (!job[j]) job[j] = { total:0, bound:0, covered:0, create:0 };
    job[j].total++;
    if (r === "bound") job[j].bound++; else if (r === "forced" || r === "chosen") job[j].covered++;
    else if (r === "none") job[j].create++; }
  var jobTitle = {};
  ashbyListAll_('/job.list').forEach(function(j2){ jobTitle[j2.id] = String(j2.title||''); });
  // TRUE leftover: an Open opening on this job that NOBODY in the ledger claims - bound included.
  var openTotal = {}, openFree = {};
  ashbyListAll_('/opening.list').forEach(function(o){ if (o.isArchived) return;
    if (String(o.openingState||'') !== 'Open') return;
    var lv = o.latestVersion || {};
    (lv.jobIds||[]).forEach(function(jid){ var tt = jobTitle[jid] || jid;
      openTotal[tt] = (openTotal[tt]||0)+1;
      if (!claimedOid[o.id]) openFree[tt] = (openFree[tt]||0)+1; }); });
  var rows = [["Job","In-scope positions","bound","covered from pool","CREATE","Ashby OPEN total","OPEN that nobody claims","Verdict"]];
  var bad = 0, reducible = 0;
  Object.keys(job).sort(function(a,b){ return job[b].create - job[a].create; }).forEach(function(j){
    var d = job[j], ot = openTotal[j]||0, of = openFree[j]||0, v;
    if (d.create > 0 && of > 0) { v = "SUSPECT: " + of + " unclaimed open opening(s) while " + d.create + " ask to be created"; bad++; reducible += Math.min(of, d.create); }
    else if (d.create > 0) v = "consistent: no unclaimed open opening on this job";
    else v = "no creates";
    rows.push([j, d.total, d.bound, d.covered, d.create, ot, of, v]); });
  var s = book.getSheetByName("V9 - Create sanity") || book.insertSheet("V9 - Create sanity");
  s.clear(); s.getRange(1,1,rows.length,8).setValues(rows); s.getRange(1,1,1,8).setFontWeight("bold");
  Logger.log("CREATE SANITY v2 | jobs " + (rows.length-1) + " | SUSPECT jobs " + bad + " | CREATE reducible by at most " + reducible);
}

// ===== #59 | 8 Sep 2026 | archive the STRAY open openings.
// Stray = state Open, not archived, and claimed by NOBODY in the v9 claim ledger.
// Jerin asked for this directly. opening.setArchived is proven and REVERSIBLE (archive:false).
// modes: 'dry' (default) | 'run'.
function task59_archiveStrays(mode){
  mode = mode || 'dry';
  var book = SpreadsheetApp.openById(AUDIT_SHEET_ID);
  var lg = book.getSheetByName("V9 - Claim ledger").getDataRange().getValues();
  var h = {}; lg[0].forEach(function(x,i){ h[String(x).trim()] = i; });
  var claimed = {};
  for (var i=1;i<lg.length;i++){ var o = String(lg[i][h["Opening id"]]||"").trim(); if (o) claimed[o] = 1; }
  var jobTitle = {};
  ashbyListAll_('/job.list').forEach(function(j){ jobTitle[j.id] = String(j.title||''); });
  var stray = [];
  ashbyListAll_('/opening.list').forEach(function(o){
    if (o.isArchived) return;
    if (String(o.openingState||'') !== 'Open') return;
    if (claimed[o.id]) return;
    var lv = o.latestVersion || {};
    var titles = (lv.jobIds||[]).map(function(x){ return jobTitle[x] || '(unknown job)'; });
    stray.push({ id:o.id, opened:String(o.openedAt||'').substring(0,10) || '(undated)', jobs:titles.join(' / ') }); });
  var rows = [["Opening opened","Job(s)","Action"]];
  stray.forEach(function(x){ rows.push([x.opened, x.jobs, mode === 'run' ? 'archiving' : 'would archive']); });
  var s = book.getSheetByName("V9 - Strays archived") || book.insertSheet("V9 - Strays archived");
  s.clear(); s.getRange(1,1,rows.length,3).setValues(rows); s.getRange(1,1,1,3).setFontWeight("bold");
  Logger.log("STRAYS found " + stray.length + " | mode " + mode);
  if (mode !== 'run') { Logger.log('DRY - nothing archived'); return; }
  if (stray.length > 30) throw new Error('REFUSING: ' + stray.length + ' strays is more than expected - re-check first');
  var ok = 0, fail = [];
  stray.forEach(function(x){
    try { var r = ashbyWrite_('/opening.setArchived', { openingId:x.id, archive:true });
      if (r && r.success === false) fail.push(JSON.stringify(r.errors||r).slice(0,60)); else ok++; }
    catch(e){ fail.push(String(e.message).slice(0,60)); } });
  Logger.log("STRAYS archived " + ok + " | failed " + fail.length + (fail.length ? " :: " + fail.slice(0,3).join(" ;; ") : ""));
  // independent read-back
  var still = 0;
  ashbyListAll_('/opening.list').forEach(function(o){ if (!o.isArchived && String(o.openingState||'') === 'Open' && !claimed[o.id]) still++; });
  Logger.log("READ-BACK: unclaimed open openings remaining = " + still + (still === 0 ? " - ALL CLEARED" : ""));
}
// READ-ONLY | #60 | the findings broken down by field, authority and route - the basis of the exclusion register.
function listFindings58_(){
  var v = SpreadsheetApp.openById(AUDIT_SHEET_ID).getSheetByName("V9 - Correct").getDataRange().getValues();
  var h = {}; v[0].forEach(function(x,i){ h[String(x).trim()] = i; });
  var agg = {};
  for (var i=1;i<v.length;i++){
    var f = String(v[i][h["Field"]]||"").trim();
    var a = String(v[i][h["Which is right"]]||"").trim();
    var r = String(v[i][h["Route"]]||"").trim();
    var k = f + " | " + a + " | " + r;
    agg[k] = (agg[k]||0)+1; }
  var keys = Object.keys(agg).sort(function(x,y){ return agg[y]-agg[x]; });
  Logger.log("FINDINGS by field | total " + (v.length-1) + " | distinct " + keys.length);
  keys.forEach(function(k){ Logger.log("  " + k + " = " + agg[k]); });
}
// ================= #60 | THE EXCLUSION REGISTER + THE RESIDUAL CHECK | 8 Sep 2026 =================
// Confirmed by Jerin 8 Sep. The residual check mock-applies every correction we would actually make and
// asserts that what REMAINS is exactly this register - nothing more, nothing less.
// 🚨 Pass condition is NOT zero. Extra = a gap. Missing = we are about to change something agreed untouched.
var V9_EXCLUSIONS = [
  { code:"never-fixable", why:"No write path exists in Ashby at any permission level. Will mismatch forever.",
    fields:["Status","Offer Quarter"] },
  { code:"ashby-wins", why:"Ashby is right, so the TRACKER moves. Tracker hygiene for the team, not an Ashby write.",
    fields:["DOJ Quarter","Department","Candidate Name"] },
  { code:"mapping", why:"Title differences between the two systems are mapping artefacts, settled in V3. Not a defect.",
    fields:["Job Name"] },
  { code:"same-quarter-date-drift", why:"Opening date is wrong but lands in the RIGHT quarter, so no dashboard number moves. Hand edits with zero reporting gain. Jerin, 8 Sep.",
    fields:["Opening Date (same quarter both sides)"] },
  { code:"set-by-rule-10-sep", why:"Role Type / Employment Type set on Q3 openings by Jerin's 10-Sep rule (#103): SME - India => PTC - Direct + As per AOP; SME - US => PTE + As per AOP; Program Advisor => As per AOP. Ashby is deliberately right; the tracker keeps its older values. Excluded by Jerin 13 Sep (#110e).",
    fields:["Role Type","Employment Type"] }
];
function q_(s){ s = String(s||"").trim(); if (s.length < 7) return "";
  var d = new Date(s); if (isNaN(d.getTime())) return "";
  return "Q" + (Math.floor(d.getMonth()/3)+1) + " " + d.getFullYear(); }
function residual58d_(){
  var book = SpreadsheetApp.openById(AUDIT_SHEET_ID);
  var v = book.getSheetByName("V9 - Correct").getDataRange().getValues();
  var h = {}; v[0].forEach(function(x,i){ h[String(x).trim()] = i; });
  var deptByTitle = rule103Depts_();   // #110e
  var apply = 0, resid = {}, residRows = [];
  for (var i=1;i<v.length;i++){
    var f = String(v[i][h["Field"]]||"").trim();
    var a = String(v[i][h["Which is right"]]||"").trim();
    var r = String(v[i][h["Route"]]||"").trim();
    var tvv = String(v[i][h["Tracker says"]]||"").trim();
    var avv = String(v[i][h["Ashby says"]]||"").trim();
    var code = null;
    if (r === "never fixable") code = "never-fixable";
    else if (a === "mapping") code = "mapping";
    else if (a === "Ashby") code = "ashby-wins";
    else if (f === "Opening Date") { var qa = q_(tvv), qb = q_(avv); if (qa && qb && qa === qb) code = "same-quarter-date-drift"; }
    else if ((f === "Role Type" || f === "Employment Type") && rule103Match_(f, String(v[i][h["Job"]]||"").trim(), avv, deptByTitle)) code = "set-by-rule-10-sep";   // #110e
    if (code) { resid[code + " :: " + f] = (resid[code + " :: " + f]||0)+1;
      residRows.push([code, f, a, r, tvv, avv]); }
    else apply++; }
  // does every residual reason appear in the declared register?
  var declared = {};
  V9_EXCLUSIONS.forEach(function(e){ e.fields.forEach(function(fd){ declared[e.code] = 1; }); });
  var undeclared = Object.keys(resid).filter(function(k){ return !declared[k.split(" :: ")[0]]; });
  var rows = [["Code","Why it is excluded","Fields","Findings remaining"]];
  V9_EXCLUSIONS.forEach(function(e){
    var n = 0; Object.keys(resid).forEach(function(k){ if (k.split(" :: ")[0] === e.code) n += resid[k]; });
    rows.push([e.code, e.why, e.fields.join(" · "), n]); });
  rows.push(["", "", "TOTAL RESIDUAL", residRows.length]);
  rows.push(["", "", "CORRECTIONS WE WOULD APPLY", apply]);
  rows.push(["", "", "CHECKED AGAINST", (v.length-1) + " findings"]);
  var s = book.getSheetByName("V9 - Exclusion register") || book.insertSheet("V9 - Exclusion register");
  s.clear(); s.getRange(1,1,rows.length,4).setValues(rows); s.getRange(1,1,1,4).setFontWeight("bold");
  if (residRows.length) { s.getRange(rows.length+2,1,1,6).setValues([["Code","Field","Which is right","Route","Tracker says","Ashby says"]]).setFontWeight("bold");
    s.getRange(rows.length+3,1,residRows.length,6).setValues(residRows); }
  Logger.log("RESIDUAL " + residRows.length + " | would apply " + apply + " | of " + (v.length-1) + " findings");
  Object.keys(resid).sort().forEach(function(k){ Logger.log("  " + k + " = " + resid[k]); });
  if (undeclared.length) throw new Error("RESIDUAL FAILED :: reasons not in the register :: " + undeclared.join(" ;; "));
  if (apply + residRows.length !== v.length-1) throw new Error("RESIDUAL FAILED :: applied + residual does not equal total");
  Logger.log("RESIDUAL PASS - everything left over is a declared exclusion, and the two sides sum");
}

// #110e (Jerin, 13 Sep 2026): values written by the 10-Sep opening-field rule (#103) are EXPECTED, not corrections.
// Keyed on the job's TOP department; only a row whose Ashby value equals the rule for that role is excluded.
function rule103Depts_(){
  var dmap = fetchDepartmentMap_(), out = {};
  function top(id){ var g=0; while(id && dmap[id] && dmap[id].parentId && g++<10) id=dmap[id].parentId; return (id && dmap[id]) ? dmap[id].name : ""; }
  (ashbyListAll_("/job.list", {}) || []).forEach(function(j){ var t = String(j.title||"").trim(); if (!t) return; (out[t] = out[t] || {})[top(j.departmentId)] = 1; });
  return out;
}
function rule103Match_(field, jobTitle, ashbyValue, deptByTitle){
  var d = deptByTitle[jobTitle] || {}, v = String(ashbyValue||"").trim();
  if (field === "Role Type") return v === "As per AOP" && !!(d["SME - India"] || d["SME - US"] || /Program Advisor/i.test(jobTitle));
  if (field === "Employment Type") return !!((d["SME - India"] && v === "PTC - Direct") || (d["SME - US"] && v === "PTE"));
  return false;
}

// ===== #61 | 8 Sep 2026 | fill the 22 missing joining dates in the TRACKER from Ashby.
// Jerin asked for this directly. Ashby is authoritative on the start date; the tracker simply never
// recorded it. All 22 are Part Time Instructors - a process gap, not 22 oversights.
// modes: 'dry' (default) | 'run'. NEVER overwrites a non-empty cell.
function task61_fillDOJ(mode){
  mode = mode || 'dry';
  var book = SpreadsheetApp.openById(AUDIT_SHEET_ID);
  var v = book.getSheetByName("V9 - Correct").getDataRange().getValues();
  var h = {}; v[0].forEach(function(x,i){ h[String(x).trim()] = i; });
  var tss = SpreadsheetApp.openById('1_LQxHDZ6dXehyR2lc8pcFjfDeRaV80vBzVRB_BKWT5A');
  var TZ = tss.getSpreadsheetTimeZone();
  var trk = tss.getSheetByName('Master');
  var tv = trk.getDataRange().getValues(), tc = {};
  tv[0].forEach(function(x,i){ tc[String(x).trim()] = i; });
  var cAid = tc["audit-id"], cDoj = tc["DOJ"], cJq = tc["Joining Quarter"], cEm = tc["Personal Email"];
  if (cAid == null || cDoj == null || cJq == null || cEm == null)
    throw new Error("REFUSING: a required tracker column is missing");
  // learn the Joining Quarter format from existing rows rather than assuming it
  var samples = {};
  for (var i=1;i<tv.length;i++){ var q = String(tv[i][cJq]||"").trim(); if (q) samples[q] = (samples[q]||0)+1; }
  var topQ = Object.keys(samples).sort(function(a,b){ return samples[b]-samples[a]; }).slice(0,4);
  Logger.log("Joining Quarter existing formats (top 4) :: " + topQ.join(" | "));
  var rowByAid = {};
  for (var i2=1;i2<tv.length;i2++){ var a = String(tv[i2][cAid]||"").trim(); if (a) rowByAid[a] = i2; }
  var it = DriveApp.getFilesByName('offer_contacts.json'); var store = {};
  if (it.hasNext()) JSON.parse(it.next().getBlob().getDataAsString()).rows.forEach(function(r){
    var e = String(r.email||'').replace(/\s+/g,'').toLowerCase(); if (e) store[e] = r; });
  var plan = [], skipped = [];
  for (var r2=1;r2<v.length;r2++){
    if (String(v[r2][h["Field"]]||"").trim() !== "DOJ Quarter") continue;
    var aid = String(v[r2][h["audit-id"]]||"").trim();
    var who = String(v[r2][h["Who"]]||"").trim();
    var ri = rowByAid[aid];
    if (ri == null) { skipped.push(who + ":no tracker row"); continue; }
    if (String(tv[ri][cDoj]||"").trim()) { skipped.push(who + ":DOJ already set - NOT overwriting"); continue; }
    var em = String(tv[ri][cEm]||'').replace(/\s+/g,'').toLowerCase();
    var sd = store[em] ? String(store[em].startDate||"").substring(0,10) : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sd)) { skipped.push(who + ":no Ashby start date"); continue; }
    var d = new Date(sd + "T12:00:00");
    var q = "Q" + (Math.floor(d.getMonth()/3)+1) + " " + d.getFullYear();
    plan.push({ row:ri+1, who:who, date:d, iso:sd, q:q }); }
  Logger.log("FILL DOJ mode=" + mode + " | to write " + plan.length + " | skipped " + skipped.length +
    (skipped.length ? " :: " + skipped.slice(0,5).join(" ;; ") : ""));
  plan.slice(0,25).forEach(function(x){ Logger.log("  " + x.who + " -> " + x.iso + " (" + x.q + ")"); });
  if (mode !== "run") { Logger.log("DRY - nothing written"); return; }
  if (plan.length > 30) throw new Error("REFUSING: " + plan.length + " is more than expected");
  plan.forEach(function(x){
    trk.getRange(x.row, cDoj+1).setValue(x.date);
    trk.getRange(x.row, cJq+1).setValue(x.q); });
  SpreadsheetApp.flush();
  // independent read-back
  var fresh = trk.getDataRange().getValues(), ok = 0, bad = [];
  plan.forEach(function(x){
    var got = fresh[x.row-1][cDoj];
    var s = got ? Utilities.formatDate(new Date(got), TZ, "yyyy-MM-dd") : "";
    if (s === x.iso) ok++; else bad.push(x.who + ":" + s); });
  Logger.log("READ-BACK verified " + ok + " of " + plan.length + (bad.length ? " :: " + bad.slice(0,4).join(" ;; ") : " - ALL CONFIRMED"));
}
// ===== #58e | 8 Sep 2026 | SOURCER as an audit field, and the writes it justifies.
// Reads Ashby DIRECTLY (application.info per candidate) - not the pipeline file, which carries no sourcer.
// 🚨 FILLED ROWS ONLY. The tracker Sourcer exists only for filled rows; comparing vacancies invents a finding each.
// 🚨 Writes ONLY where the tracker name resolves to exactly ONE Ashby user (Jerin, 8 Sep). Names that resolve to
//    no user are almost certainly AGENCIES - reported for task #62, never guessed at.
// modes: 'dry' | 'pilot' | 'run'.
var SOURCER_ROLE_ID = "952a945b-4f74-44cd-be85-2acba0248822";
function task58e_sourcer(mode){
  mode = mode || 'dry';
  var book = SpreadsheetApp.openById(AUDIT_SHEET_ID);
  var lg = book.getSheetByName("V9 - Claim ledger").getDataRange().getValues();
  var h = {}; lg[0].forEach(function(x,i){ h[String(x).trim()] = i; });
  var tss = SpreadsheetApp.openById('1_LQxHDZ6dXehyR2lc8pcFjfDeRaV80vBzVRB_BKWT5A');
  var trk = tss.getSheetByName('Master');
  var tv = trk.getDataRange().getValues(), tc = {};
  tv[0].forEach(function(x,i){ tc[String(x).trim()] = i; });
  var cSrc = tc["Sourcer"];
  if (cSrc == null) throw new Error("PRECONDITION: the tracker has no Sourcer column");
  var byAid = {};
  for (var i=1;i<tv.length;i++){ var a = String(tv[i][tc['audit-id']]||'').trim(); if (a) byAid[a] = tv[i]; }
  var it = DriveApp.getFilesByName('offer_contacts.json'); var store = {};
  if (it.hasNext()) JSON.parse(it.next().getBlob().getDataAsString()).rows.forEach(function(r){
    var e = String(r.email||'').replace(/\s+/g,'').toLowerCase(); if (e) store[e] = r; });
  // 🚨 includeDeactivated - user.list returns only 451 active of 1021 without it (hard-won lesson #1)
  var users = ashbyListAll_('/user.list', { includeDeactivated: true });
  function nm(u){ return String(u.name || ((u.firstName||"") + " " + (u.lastName||"")).trim() || "").trim(); }
  function resolve(name){ var hits = users.filter(function(u){ return nameMatch(name, nm(u)); });
    return hits.length === 1 ? hits[0] : null; }
  var already = 0, toWrite = [], different = [], unresolved = {}, noApp = 0, blank = 0, checked = 0;
  for (var r=1;r<lg.length;r++){
    var aid = String(lg[r][h["audit-id"]]||"").trim();
    var who = String(lg[r][h["Candidate"]]||"").trim();
    var email = String(lg[r][h["Email"]]||"").trim().toLowerCase();
    if (!who || who === "(unfilled)" || !email) continue;   // FILLED ROWS ONLY
    var row = byAid[aid]; if (!row) continue;
    var src = String(row[cSrc]||"").trim();
    if (!src) { blank++; continue; }                        // blank authority = nothing to copy
    var rec = store[email]; if (!rec || !rec.applicationId) { noApp++; continue; }
    checked++;
    var info = null;
    try { info = ashbyPost_('/application.info', { applicationId: rec.applicationId }); } catch(e){}
    var team = (info && info.results && info.results.hiringTeam) || (info && info.hiringTeam) || [];
    var cur = "";
    team.forEach(function(x){ if (/sourcer/i.test(String(x.role||x.roleName||""))) cur = String(x.name || ((x.firstName||"")+" "+(x.lastName||"")).trim() || ""); });
    var u = resolve(src);
    if (!u) { unresolved[src] = (unresolved[src]||0)+1; continue; }
    if (cur && nameMatch(cur, src)) { already++; continue; }
    if (cur) { different.push(who + ": tracker " + src + " vs Ashby " + cur); continue; }
    toWrite.push({ aid:aid, who:who, appId:rec.applicationId, userId:u.id, name:nm(u) });
  }
  var unresKeys = Object.keys(unresolved).sort(function(a,b){ return unresolved[b]-unresolved[a]; });
  Logger.log("SOURCER mode=" + mode + " | filled+named " + checked + " | already correct " + already +
    " | TO WRITE " + toWrite.length + " | differs " + different.length + " | no application " + noApp + " | tracker blank " + blank);
  Logger.log("UNRESOLVED tracker sourcer names (likely AGENCIES - task #62) :: " +
    unresKeys.map(function(k){ return k + " x" + unresolved[k]; }).join(" | ").slice(0, 400));
  if (different.length) Logger.log("DIFFERS (not overwritten) :: " + different.slice(0,5).join(" ;; "));
  var rows = [["audit-id","Candidate","Tracker Sourcer","Resolved Ashby user","Action"]];
  toWrite.forEach(function(x){ rows.push([x.aid, x.who, "", x.name, mode === "run" ? "writing" : "would write"]); });
  unresKeys.forEach(function(k){ rows.push(["", "", k, "(no Ashby user)", "task #62 - agency user needed"]); });
  var s = book.getSheetByName("V9 - Sourcer") || book.insertSheet("V9 - Sourcer");
  s.clear(); s.getRange(1,1,rows.length,5).setValues(rows); s.getRange(1,1,1,5).setFontWeight("bold");
  // read current state first so a re-run only touches what is still wrong
  var curOpen = {}, curJob = {};
  function grab(o, into){ var lv = o.latestVersion || o; var mp = {};
    (lv.customFields || o.customFields || []).forEach(function(f){
      var lab = (f.valueLabel == null || f.valueLabel === "") ? (f.value == null ? "" : f.value) : f.valueLabel;
      mp[String(f.title || f.name || "").trim()] = String(lab).trim(); }); into[o.id] = mp; }
  ashbyListAll_('/opening.list').forEach(function(o){ grab(o, curOpen); });
  ashbyListAll_('/job.list').forEach(function(j){ grab(j, curJob); });
  var before = plan.length;
  plan = plan.filter(function(x){
    var src = (x.objectType === "Job") ? curJob : curOpen;
    var got = (src[x.objectId] || {})[F2ASHBY[x.field]] || "";
    return String(got).trim().toLowerCase() !== String(x.want).trim().toLowerCase(); });
  Logger.log("ALREADY CORRECT " + (before - plan.length) + " | STILL TO WRITE " + plan.length);
  if (mode === "dry") { Logger.log("DRY - nothing written"); return; }
  var batch = (mode === "pilot") ? toWrite.slice(0,1) : toWrite;
  var ok = 0, fail = [];
  batch.forEach(function(x){
    try { var res = ashbyWrite_('/application.addHiringTeamMember', { applicationId:x.appId, teamMemberId:x.userId, roleId:SOURCER_ROLE_ID });
      if (res && res.success === false) fail.push(x.who + " :: " + JSON.stringify(res.errors||res).slice(0,60)); else ok++; }
    catch(e){ fail.push(x.who + " :: " + String(e.message).slice(0,60)); } });
  Logger.log("SOURCER wrote " + ok + " | failed " + fail.length + (fail.length ? " :: " + fail.slice(0,3).join(" ;; ") : ""));
}

// ===== #63 | 8 Sep 2026 | apply the API-fixable CUSTOM FIELD corrections.
// Scope: Level (Job field) + Complexity / Employment Type / Role Type (Opening fields). Tracker-wins only.
// 🚨 customField.setValue needs the option VALUE, never the label (hard-won lesson #2). A tracker value that
//    matches no option is REPORTED and NOT written - never guessed at.
// modes: 'dry' | 'pilot' | 'run'.
var F2ASHBY = { "Complexity":"Role Complexity (Opening)", "Employment Type":"Employment Type",
               "Role Type":"Role Type", "Level":"Level" };
var F2OBJ = { "Complexity":"Opening", "Employment Type":"Opening", "Role Type":"Opening", "Level":"Job" };
function task63_applyFields(mode){
  mode = mode || 'dry';
  var book = SpreadsheetApp.openById(AUDIT_SHEET_ID);
  var v = book.getSheetByName("V9 - Correct").getDataRange().getValues();
  var h = {}; v[0].forEach(function(x,i){ h[String(x).trim()] = i; });
  if (h["Object id"] == null) throw new Error("PRECONDITION: V9 - Correct has no Object id column - re-run buildAuditV9()");
  var cf = {};
  ashbyListAll_('/customField.list').forEach(function(f){
    var title = String(f.title || f.name || "").trim();
    var opts = {};
    (f.selectableValues || f.options || f.values || []).forEach(function(o){
      var lab = String((o && (o.label != null ? o.label : o.name != null ? o.name : o.value)) || "").trim();
      var val = String((o && (o.value != null ? o.value : o.id)) || "").trim();
      if (lab) opts[lab.toLowerCase()] = val || lab; });
    cf[title] = { id:f.id, objectType:String(f.objectType||""), opts:opts, nOpts:Object.keys(opts).length,
                  type:String(f.type||f.fieldType||"") }; });
  var plan = [], unmapped = [], noField = [], seen = {};
  for (var r=1;r<v.length;r++){
    var field = String(v[r][h["Field"]]||"").trim();
    if (!F2ASHBY[field]) continue;
    if (String(v[r][h["Route"]]||"").trim() !== "API") continue;
    if (String(v[r][h["Which is right"]]||"").trim() !== "Tracker") continue;
    var oid = String(v[r][h["Object id"]]||"").trim();
    var want = String(v[r][h["Tracker says"]]||"").trim();
    var have = String(v[r][h["Ashby says"]]||"").trim();
    if (!oid || !want) { unmapped.push(field + ": missing object id or value"); continue; }
    var key = field + "|" + oid;
    if (seen[key]) continue; seen[key] = 1;              // one write per object per field
    var meta = cf[F2ASHBY[field]];
    if (!meta) { noField.push(F2ASHBY[field]); continue; }
    var val = want;
    if (meta.nOpts) { var mapped = meta.opts[want.toLowerCase()];
      if (!mapped) { unmapped.push(field + " :: \"" + want + "\" matches no option"); continue; }
      val = mapped; }
    plan.push({ field:field, objectType:F2OBJ[field], objectId:oid, fieldId:meta.id, value:val, want:want, have:have, ftype:meta.type }); }
  var byF = {}; plan.forEach(function(x){ byF[x.field] = (byF[x.field]||0)+1; });
  Logger.log("APPLY FIELDS mode=" + mode + " | to write " + plan.length + " :: " +
    Object.keys(byF).map(function(k){ return k + "=" + byF[k]; }).join(" | "));
  Object.keys(F2ASHBY).forEach(function(k){ var mm = cf[F2ASHBY[k]];
    Logger.log("  field " + k + " -> \"" + F2ASHBY[k] + "\" " + (mm ? ("objectType=" + mm.objectType + " options=" + mm.nOpts) : "NOT FOUND")); });
  if (unmapped.length) Logger.log("UNMAPPED (NOT written) " + unmapped.length + " :: " + unmapped.slice(0,6).join(" ;; "));
  if (noField.length) Logger.log("CUSTOM FIELD NOT FOUND :: " + noField.join(" | "));
  var rows = [["Field","Object type","Object id","Tracker wants","Ashby has","Option value to write","Result"]];
  plan.forEach(function(x){ rows.push([x.field, x.objectType, x.objectId, x.want, x.have, x.value, ""]); });
  unmapped.forEach(function(u){ rows.push(["(unmapped)", "", "", u, "", "", "NOT WRITTEN"]); });
  var s = book.getSheetByName("V9 - Field writes") || book.insertSheet("V9 - Field writes");
  s.clear(); s.getRange(1,1,rows.length,7).setValues(rows); s.getRange(1,1,1,7).setFontWeight("bold");
  if (mode === "dry") { Logger.log("DRY - nothing written"); return; }
  if (plan.length > 200) throw new Error("REFUSING: " + plan.length + " is more than expected");
  var batch = (mode === "pilot") ? plan.slice(0,1) : plan;
  var ok = 0, fail = [];
  batch.forEach(function(x){
    // 🚨 8 Sep: Level is a MultiValueSelect. Sent as a bare STRING it returns success and does NOT stick
    //    (12 of 23 silently no-opped). Multi-value fields must receive an ARRAY.
    var payloadValue = /multi/i.test(String(x.ftype||'')) ? [x.value] : x.value;
    try { var res = ashbyWrite_('/customField.setValue', { objectType:x.objectType, objectId:x.objectId, fieldId:x.fieldId, fieldValue:payloadValue });
      if (res && res.success === false) fail.push(x.field + " :: " + JSON.stringify(res.errors||res).slice(0,60)); else ok++; }
    catch(e){ fail.push(x.field + " :: " + String(e.message).slice(0,60)); } });
  Logger.log("APPLY FIELDS wrote " + ok + " | failed " + fail.length + (fail.length ? " :: " + fail.slice(0,4).join(" ;; ") : ""));
  // ---- READ-BACK, from a fresh pull of Ashby. Bulk, one call per object type. ----
  Utilities.sleep(20000);  // 🚨 Ashby list endpoints lag a write - 4s was NOT enough (pilot, 8 Sep).
  // Even 20s is no guarantee: a MISMATCH here means 'check again later', NEVER 'the write failed'.
  var nowOpen = {}, nowJob = {};
  function harvest(o, into){ var lv = o.latestVersion || o; var map = {};
    (lv.customFields || o.customFields || []).forEach(function(f){
      var lab = (f.valueLabel == null || f.valueLabel === "") ? (f.value == null ? "" : f.value) : f.valueLabel;
      map[String(f.title || f.name || "").trim()] = String(lab).trim(); });
    into[o.id] = map; }
  ashbyListAll_('/opening.list').forEach(function(o){ harvest(o, nowOpen); });
  ashbyListAll_('/job.list').forEach(function(j){ harvest(j, nowJob); });
  var good = 0, bad = [];
  batch.forEach(function(x){
    var src = (x.objectType === "Job") ? nowJob : nowOpen;
    var got = (src[x.objectId] || {})[F2ASHBY[x.field]] || "";
    // compare on the LABEL the tracker asked for, since read-back returns valueLabel
    if (String(got).trim().toLowerCase() === String(x.want).trim().toLowerCase()) good++;
    else bad.push(x.field + " wanted \"" + x.want + "\" got \"" + got + "\""); });
  Logger.log("READ-BACK verified " + good + " of " + batch.length + (bad.length ? " :: " + bad.slice(0,5).join(" ;; ") : " - ALL CONFIRMED"));
}

// READ-ONLY | #64 | of the owner corrections, how many are ADD-to-empty vs REPLACE-an-existing-person?
function ownerSplit64_(){
  var v = SpreadsheetApp.openById(AUDIT_SHEET_ID).getSheetByName("V9 - Correct").getDataRange().getValues();
  var h = {}; v[0].forEach(function(x,i){ h[String(x).trim()] = i; });
  var out = {};
  var samples = { add:[], replace:[] };
  for (var i=1;i<v.length;i++){
    var f = String(v[i][h["Field"]]||"").trim();
    if (f !== "Opening Owner" && f !== "Candidate Owner") continue;
    var want = String(v[i][h["Tracker says"]]||"").trim();
    var have = String(v[i][h["Ashby says"]]||"").trim();
    var kind = have ? "REPLACE (Ashby already names someone)" : "ADD (Ashby has nobody)";
    var k = f + " :: " + kind;
    out[k] = (out[k]||0)+1;
    var s = have ? samples.replace : samples.add;
    if (s.length < 4) s.push(f.split(" ")[0] + ": tracker \"" + want + "\" vs Ashby \"" + (have||"(nobody)") + "\"");
  }
  Object.keys(out).sort().forEach(function(k){ Logger.log(k + " = " + out[k]); });
  Logger.log("SAMPLE ADD :: " + samples.add.join(" ;; ").slice(0,300));
  Logger.log("SAMPLE REPLACE :: " + samples.replace.join(" ;; ").slice(0,300));
}

// READ-ONLY | #64 | Jerin's test, 8 Sep: compare owner counts PER JOB, not row by row.
// A forced/chosen pairing is partly arbitrary, so pairing position A to the wrong opening on the same job
// manufactures TWO row-level mismatches that are not disagreements at all. If the per-job multiset of
// owners matches, there is nothing to fix.
// ⚠ nameMatch lives INSIDE buildAuditV4 and is not visible here. This is a DELIBERATE MIRROR of it,
// character for character - not a hand-rolled comparator. If buildAuditV4 ever changes its matching,
// this must change with it. (V7 fault #2 was using exact equality where nameMatch existed; copying the
// SAME algorithm for an outside checker is the opposite of that mistake.)
function nm64_(s){ return String(s||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim(); }
function nameMatch64_(a,b){
  var x = nm64_(a).split(" ").filter(function(z){ return z && z.length > 1; });
  var y = nm64_(b).split(" ").filter(function(z){ return z && z.length > 1; });
  if (!x.length || !y.length) return false;
  var s = x.length <= y.length ? x : y, l = x.length <= y.length ? y : x;
  
  for (var i=0;i<s.length;i++){ var h = false;
    for (var j=0;j<l.length;j++) if (l[j] === s[i]) { h = true; break; }
    if (!h) return false; }
  return true; }
// #76 (9 Sep): ONE definition of the owner-name alias, shared by ownerGrain64_, task64_applyOwners and
//   verify64_. It was copy-pasted into the last two and MISSING from ownerGrain64_, so the same person
//   counted as a disagreement in one probe and a match in the others.
//   'Sangha' is a SHORTENED form, not a token, of 'Sanghamitra Moulik' - nameMatch64_ can never bridge
//   it (#69/#70, confirmed by Jerin 8 Sep). Add rejoiners HERE, not to a cleverer comparator.
function ownerAlias_(t){ var A = {'sanghamitra moulik':'Sangha'}; return A[String(t||'').toLowerCase().trim()] || t; }
function ownerGrain64_(){
  var book = SpreadsheetApp.openById(AUDIT_SHEET_ID);
  var lg = book.getSheetByName("V9 - Claim ledger").getDataRange().getValues();
  var h = {}; lg[0].forEach(function(x,i){ h[String(x).trim()] = i; });
  var tss = SpreadsheetApp.openById('1_LQxHDZ6dXehyR2lc8pcFjfDeRaV80vBzVRB_BKWT5A');
  var tv = tss.getSheetByName('Master').getDataRange().getValues(), tc = {};
  tv[0].forEach(function(x,i){ tc[String(x).trim()] = i; });
  var recByAid = {};
  for (var i=1;i<tv.length;i++){ var a = String(tv[i][tc['audit-id']]||'').trim();
    if (a) recByAid[a] = String(tv[i][tc['Recruiter']]||'').trim(); }
  var uById = {};
  ashbyListAll_('/user.list', { includeDeactivated:true }).forEach(function(u){
    uById[u.id] = String(u.name || ((u.firstName||"")+" "+(u.lastName||"")).trim() || "").trim(); });
  var ownerByOpening = {};
  ashbyListAll_('/opening.list').forEach(function(o){ var lv = o.latestVersion || {}; var r = [];
    (lv.hiringTeam||[]).forEach(function(x){ if (/recruiter/i.test(String(x.role||x.roleName||"")))
      r.push(uById[x.userId] || String(x.name||"")); });
    ownerByOpening[o.id] = r.filter(String).join(" + "); });
  // build per-job multisets over the SAME set of paired rows
  var jobs = {};
  for (var r2=1;r2<lg.length;r2++){
    var job = String(lg[r2][h["Job"]]||"").trim();
    var oid = String(lg[r2][h["Opening id"]]||"").trim();
    if (!job || !oid) continue;
    var aid = String(lg[r2][h["audit-id"]]||"").trim();
    var tr = recByAid[aid] || "";
    var as = ownerByOpening[oid] || "";
    if (!jobs[job]) jobs[job] = { trk:{}, ash:{}, n:0 };
    jobs[job].n++;
    if (tr) jobs[job].trk[tr.toLowerCase()] = (jobs[job].trk[tr.toLowerCase()]||0)+1;
    if (as) jobs[job].ash[as.toLowerCase()] = (jobs[job].ash[as.toLowerCase()]||0)+1; }
  // a tracker FIRST NAME should count against the Ashby full name - use nameMatch, never exact
  var agree = 0, differ = 0, rows = [["Job","Paired positions","Tracker owners","Ashby owners","Verdict"]];
  Object.keys(jobs).sort().forEach(function(j){
    var d = jobs[j];
    var tk = Object.keys(d.trk), ak = Object.keys(d.ash);
    // match each tracker name to an Ashby name by nameMatch, then compare counts
    var used = {}, ok = true;
    tk.forEach(function(tn){
      var hit = ak.filter(function(an){ return !used[an] && nameMatch64_(ownerAlias_(tn), an); })[0];
      if (!hit) { ok = false; return; }
      used[hit] = 1;
      if (d.trk[tn] !== d.ash[hit]) ok = false; });
    if (ak.filter(function(an){ return !used[an]; }).length) ok = false;
    if (ok) agree++; else differ++;
    rows.push([j, d.n,
      tk.map(function(k){ return k + " x" + d.trk[k]; }).join(", "),
      ak.map(function(k){ return k + " x" + d.ash[k]; }).join(", "),
      ok ? "AGREE at job level - row mismatches are PAIRING ARTEFACTS" : "REAL DIFFERENCE"]); });
  var s = book.getSheetByName("V9 - Owner by job") || book.insertSheet("V9 - Owner by job");
  s.clear(); s.getRange(1,1,rows.length,5).setValues(rows); s.getRange(1,1,1,5).setFontWeight("bold");
  Logger.log("OWNER BY JOB | jobs " + (agree+differ) + " | AGREE (artefact) " + agree + " | REAL DIFFERENCE " + differ);
  rows.slice(1).forEach(function(r3){ if (String(r3[4]).indexOf("REAL") === 0)
    Logger.log("  REAL :: " + r3[0] + " | tracker [" + r3[2] + "] vs ashby [" + r3[3] + "]"); });
}
function task64_applyOwners(mode){
  mode = mode || 'dry';
  var v = SpreadsheetApp.openById('1U6Wi5uXLZ8hOhGKP2tyH--jHcEbUEvXgAPxbkUofTNA').getSheetByName('V9 - Correct').getDataRange().getValues();
  var act = ashbyListAll_('/user.list',{});
  function nm(u){ return (u.name||((u.firstName||'')+' '+(u.lastName||'')).trim()); }
  function resolve(t){ var q=ownerAlias_(t); var h=[];
    for(var j=0;j<act.length;j++) if(nameMatch64_(q,nm(act[j]))) h.push(act[j]);
    return h.length===1?h[0]:null; }
  var work=[], cand=0;
  for(var r=1;r<v.length;r++){ var f=String(v[r][5]).trim();
    if(f==='Candidate Owner'){ cand++; continue; }
    if(f!=='Opening Owner') continue;
    var trk=String(v[r][6]).trim();
    work.push({id:String(v[r][1]).trim(), trk:trk, ash:String(v[r][7]).trim(), u:resolve(trk)}); }
  var bad=[]; for(var i=0;i<work.length;i++) if(!work[i].u) bad.push(work[i]);
  Logger.log('T64 mode='+mode+' | opening-owner rows '+work.length+' | candidate-owner rows DEFERRED '+cand+' | unresolved '+bad.length);
  for(var i=0;i<bad.length;i++) Logger.log('T64 UNRESOLVED | "'+bad[i].trk+'"');
  if(bad.length){ Logger.log('T64 HALT - unresolved names, nothing written'); return; }
  if(work.length>80){ Logger.log('T64 REFUSE - '+work.length+' exceeds the 80 cap'); return; }
  var ops={}; ashbyListAll_('/opening.list',{}).forEach(function(o){ ops[o.id]=o; });
  var plan=[], missing=0;
  for(var i=0;i<work.length;i++){ var w=work[i], o=ops[w.id];
    if(!o){ missing++; continue; }
    var ht=((o.latestVersion||{}).hiringTeam)||[], cur=[];
    for(var k=0;k<ht.length;k++) if(/recruiter/i.test(String(ht[k].role||''))) cur.push(ht[k].userId);
    var rm=[], already=false;
    for(var k=0;k<cur.length;k++){ if(cur[k]===w.u.id) already=true; else rm.push(cur[k]); }
    if(already && rm.length===0) continue;
    plan.push({w:w, rm:rm, add:!already}); }
  var totRm=0, totAdd=0;
  for(var i=0;i<plan.length;i++){ totRm+=plan[i].rm.length; if(plan[i].add) totAdd++; }
  Logger.log('T64 PLAN objects '+plan.length+' | removals '+totRm+' | adds '+totAdd+' | already correct '+(work.length-plan.length-missing)+' | opening not found '+missing);
  for(var i=0;i<plan.length && i<8;i++) Logger.log('T64 e.g. tracker "'+plan[i].w.trk+'" -> '+nm(plan[i].w.u)+' | was "'+plan[i].w.ash+'" | remove '+plan[i].rm.length+' add '+(plan[i].add?'1':'0'));
  if(mode==='dry'){ Logger.log('T64 DRY - nothing written'); return; }
  var todo = (mode==='pilot') ? plan.slice(0,1) : plan;
  var ok=0, fail=0;
  for(var i=0;i<todo.length;i++){ var p=todo[i], w=p.w;
    try{
      for(var k=0;k<p.rm.length;k++) ashbyWrite_('/hiringTeam.removeMember',{openingId:w.id, teamMemberId:p.rm[k], roleId:V4_RECRUITER_ROLE});
      if(p.add) ashbyWrite_('/hiringTeam.addMember',{openingId:w.id, teamMemberId:w.u.id, roleId:V4_RECRUITER_ROLE});
      ok++;
    }catch(e){ fail++; Logger.log('T64 FAIL | "'+w.trk+'" | '+String(e).slice(0,140)); } }
  Logger.log('T64 '+mode.toUpperCase()+' applied '+ok+' | failed '+fail);
}

function verify64_(){
  var v = SpreadsheetApp.openById('1U6Wi5uXLZ8hOhGKP2tyH--jHcEbUEvXgAPxbkUofTNA').getSheetByName('V9 - Correct').getDataRange().getValues();
  var act = ashbyListAll_('/user.list',{});
  function nm(u){ return (u.name||((u.firstName||'')+' '+(u.lastName||'')).trim()); }
  function resolve(t){ var q=ownerAlias_(t); var h=[];
    for(var j=0;j<act.length;j++) if(nameMatch64_(q,nm(act[j]))) h.push(act[j]); return h.length===1?h[0]:null; }
  var ops={}; ashbyListAll_('/opening.list',{}).forEach(function(o){ ops[o.id]=o; });
  var good=0, wrong=0, multi=0, none=0;
  for(var r=1;r<v.length;r++){ if(String(v[r][5]).trim()!=='Opening Owner') continue;
    var id=String(v[r][1]).trim(), u=resolve(String(v[r][6]).trim()); if(!u) continue;
    var o=ops[id]; if(!o) continue;
    var ht=((o.latestVersion||{}).hiringTeam)||[], cur=[];
    for(var k=0;k<ht.length;k++) if(/recruiter/i.test(String(ht[k].role||''))) cur.push(ht[k].userId);
    if(cur.length===0) none++;
    else if(cur.length>1) multi++;
    else if(cur[0]===u.id) good++;
    else wrong++; }
  Logger.log('VERIFY64 sole-and-correct '+good+' | still wrong '+wrong+' | still MULTIPLE recruiters '+multi+' | no recruiter '+none);
}



// ===== ONE-OFF READ-ONLY, 11 Sep 2026 — the state of every Q3-2026 opening =====
// WRITES NOTHING TO ASHBY. Adds one tab to the audit sheet.
// Purpose: tell apart the four kinds of "open" Q3 opening —
//   filled but never closed out · closed after a drop · a LIVE VACANCY · genuinely spare.
// The audit's orphan rule cannot do this: it asks only whether a candidate-bearing tracker position
// claims the opening, and a live vacancy has no candidate yet, so it is unclaimable by construction.
// Delete with the other one-offs under #99.
function q3State() {
  var SS = SpreadsheetApp.openById('1U6Wi5uXLZ8hOhGKP2tyH--jHcEbUEvXgAPxbkUofTNA');
  var CR = { '2777221e-d3a7-40e6-95a3-6988ad60494d':'Hired',
             '05105d39-d5f6-442c-b7bf-f6b055a50a43':'On hold',
             '63d32633-3047-458b-a9a2-fbf2d04738f2':'Shelved',
             '249988e6-c53c-4d6e-b60d-dc78e145520d':'Carry forward' };
  var dmap = fetchDepartmentMap_();
  function deptOf(id){ var g=0; while(id && dmap[id] && dmap[id].parentId && g++<10) id=dmap[id].parentId;
                       return (id && dmap[id]) ? dmap[id].name : ''; }
  var jobs = {}; (ashbyListAll_('/job.list', {}) || []).forEach(function(j){
    jobs[j.id] = { title:j.title||'', dept:deptOf(j.departmentId) }; });

  var rows = [['Ashby uuid','Identifier','Opened','Job title','Department','State','Close reason','audit-id stamp','Archived']];
  var n = { open:0, closedHired:0, closedOther:0, archived:0 };
  (ashbyListAll_('/opening.list', {}) || []).forEach(function(o){
    var iso = o.openedAt; if (!iso) return;
    var d = new Date(iso); if (isNaN(d.getTime())) return;
    if (d.getUTCFullYear() !== 2026 || Math.floor(d.getUTCMonth()/3) + 1 !== 3) return;
    var lv = o.latestVersion || {};
    var j = jobs[(lv.jobIds||[])[0] || ''] || { title:'', dept:'' };
    var stamp = '';
    (lv.customFields || []).forEach(function(f){
      if (String(f.title) === 'audit-id') stamp = String(f.value != null ? f.value : (f.valueLabel||'')); });
    var reason = o.closeReasonId ? (CR[o.closeReasonId] || 'other') : '';
    var state = o.closedAt ? ('Closed - ' + (reason || 'no reason')) : 'Open';
    if (o.isArchived) n.archived++;
    else if (!o.closedAt) n.open++;
    else if (reason === 'Hired') n.closedHired++;
    else n.closedOther++;
    rows.push([o.id, o.identifier || (lv.identifier || ''), String(iso).substring(0,10),
               j.title, j.dept, state, reason, stamp, o.isArchived ? 'yes' : '']);
  });
  var sh = SS.getSheetByName('V9 - Q3 opening state') || SS.insertSheet('V9 - Q3 opening state');
  sh.clear(); sh.getRange(1,1,rows.length,rows[0].length).setValues(rows);
  Logger.log('Q3-2026 openings ' + (rows.length-1) + ' | still Open ' + n.open
    + ' | closed as Hired ' + n.closedHired + ' | closed other ' + n.closedOther
    + ' | archived ' + n.archived + ' | tab "V9 - Q3 opening state". NOTHING written to Ashby.');
}


// ===== #105i (b)+(c) (13 Sep 2026) — READ-ONLY for Ashby =====
// Jerin: "Tracker will continue to be source of truth - for selected candidates". Compares the SOURCE and the SOURCER of
// every Q3 selected candidate (Hiring Tracker Master: a name, Offer or Joining Quarter = Q3 2026, status not 'Open') with
// the application in Ashby, joined on EMAIL via offer_contacts.json and read LIVE with application.info. Nothing is written
// to Ashby; the only write is the audit tab 'V9 - 105i Source check' (cleared and rebuilt each run).
// v2 (13 Sep late night): reads the application behind the Q3 OFFER (start date, then offer-created date, in Jul-Sep 2026)
// rather than the latest offer · the tracker's channel is ANY of category / portal / referral / vendor, so
// 'Pre-identified / Linkedin' matches either · Jerin's calls: Third-party boards: LinkedIn => Job Portal: Linkedin Inbound
// and Prospecting: Juicebox => Juicebox: Juicebox Sourced (verdict 'SWITCH (Jerin)'); Juicebox Agent, Linkedin Outreach and
// Other: Recruiter Networking stay. A blank tracker source never asks for Ashby to be blanked.
function task105i_srcCheck(){
  var TRACKER_ID='1_LQxHDZ6dXehyR2lc8pcFjfDeRaV80vBzVRB_BKWT5A', AUDIT='1U6Wi5uXLZ8hOhGKP2tyH--jHcEbUEvXgAPxbkUofTNA', TAB='V9 - 105i Source check';
  var vals=SpreadsheetApp.openById(TRACKER_ID).getSheetByName('Master').getDataRange().getDisplayValues(), hdr=vals[0];
  function col(n){ for(var i=0;i<hdr.length;i++) if(String(hdr[i]).replace(/\s+/g,' ').trim()===n) return i; return -1; }
  var C={id:col('audit-id'),nm:col('Candidate Name'),st:col('Overall Status'),em:col('Personal Email'),oq:col('Offer Quarter'),jq:col('Joining Quarter'),
         job:col('Job Name'),cat:col('Source Category'),por:col('Source Name, if Portal'),er:col('Source Name, if ER'),ven:col('Source name, if Vendor'),srcr:col('Sourcer')};
  var miss=[]; for(var k in C) if(C[k]<0) miss.push(k);
  if(miss.length) throw new Error('T105i tracker columns not found: '+miss.join(','));
  var oc=JSON.parse(DriveApp.getFilesByName('offer_contacts.json').next().getBlob().getDataAsString()).rows||[];
  var byEmail={};
  oc.forEach(function(r){ var e=String(r.email||'').trim().toLowerCase(); if(e&&r.applicationId) (byEmail[e]=byEmail[e]||[]).push(r); });
  function low(s){ return String(s==null?'':s).toLowerCase(); }
  function fam(s){ var x=low(s);
    if(/pre.?identified/.test(x)) return 'Pre-identified';
    if(/linkedin/.test(x)) return 'LinkedIn'; if(/juicebox/.test(x)) return 'Juicebox'; if(/naukri/.test(x)) return 'Naukri';
    if(/instahyre/.test(x)) return 'Instahyre'; if(/indeed/.test(x)) return 'Indeed'; if(/iim/.test(x)) return 'IIM Jobs';
    if(/referr/.test(x)) return 'Referral'; if(/career site|careers page|jobs page/.test(x)) return 'Career Site';
    if(/networking/.test(x)) return 'Recruiter Networking';
    if(/bull.?s.?eye|black bull|jobkreators|talent diary|agenc|vendor|consult/.test(x)) return 'Agency';
    return ''; }
  function inQ3(d){ d=String(d||'').slice(0,10); return d>='2026-07-01' && d<='2026-09-30'; }
  var SWITCH={'Third-party boards: LinkedIn':'Job Portal: Linkedin Inbound','Prospecting: Juicebox':'Juicebox: Juicebox Sourced'};
  var PICK={'LinkedIn':'Job Portal: Linkedin Inbound','Juicebox':'Juicebox: Juicebox Sourced','Recruiter Networking':'Recruiter Networking: Recruiter Networking',
            'Career Site':'Career Site: Career Site','Referral':'Referral: Referral','Pre-identified':'Pre-identified: Pre-identified'};
  var out=[['audit-id','Candidate (tracker)','Tracker status','Job (tracker)','Tracker source','Tracker channel(s)','Ashby source','Ashby channel','Source verdict','Suggested Ashby source','Tracker sourcer','Ashby recruiter','Ashby sourcer','Sourcer verdict','Application id','Ashby job']];
  var n=0, cnt={};
  for(var r=1;r<vals.length;r++){
    var row=vals[r], nm=String(row[C.nm]||'').trim(); if(!nm) continue;
    var st=String(row[C.st]||'').trim(); if(st==='Open') continue;
    if(String(row[C.oq]).trim()!=='Q3 2026' && String(row[C.jq]).trim()!=='Q3 2026') continue;
    n++;
    var cat=String(row[C.cat]||'').trim(), por=String(row[C.por]||'').trim(), er=String(row[C.er]||'').trim(), ven=String(row[C.ven]||'').trim();
    var tSrc=[cat, por||er||ven].filter(function(x){ return x; }).join(' / ');
    var tSet=[]; [fam(por), fam(er), (ven?'Agency':''), fam(cat)].forEach(function(f){ if(f && tSet.indexOf(f)<0) tSet.push(f); });
    if(!tSet.length && /job portal/i.test(cat) && !por) tSet.push('LinkedIn');
    var tSr=String(row[C.srcr]||'').trim();
    var cands=byEmail[low(row[C.em]).trim()]||[];
    var aSrc='', aRec='', aSr='', aJob='', app='', verdict='', sv='';
    if(!cands.length){ verdict='NO ASHBY OFFER BY EMAIL'; }
    else {
      cands.sort(function(a,b){ var ra=(inQ3(a.startDate)?2:0)+(inQ3(a.offerCreatedAt)?1:0), rb=(inQ3(b.startDate)?2:0)+(inQ3(b.offerCreatedAt)?1:0);
        if(ra!==rb) return rb-ra; return String(b.offerCreatedAt||b.decidedAt||'').localeCompare(String(a.offerCreatedAt||a.decidedAt||'')); });
      app=cands[0].applicationId;
      var resp=ashbyWrite_('/application.info',{applicationId:app});
      var a=(resp&&resp.json&&resp.json.success!==false&&resp.json.results)||null;
      if(!a){ verdict='ASHBY READ FAILED'; }
      else {
        var s=a.source||null, stt=(s&&s.sourceType&&typeof s.sourceType.title==='string')?s.sourceType.title:'';
        aSrc=s?((stt?stt+': ':'')+(s.title||'')):'';
        aJob=(a.job&&a.job.title)||'';
        var recs=[], srs=[]; (a.hiringTeam||[]).forEach(function(m){ if(m.role==='Recruiter') recs.push(memberName_(m)); if(m.role==='Sourcer') srs.push(memberName_(m)); });
        aRec=recs.join(' | '); aSr=srs.join(' | ');
        var aFam=fam(aSrc);
        if(!tSrc) verdict=aSrc?'TRACKER BLANK (Ashby has one)':'BOTH BLANK';
        else if(!aSrc) verdict='ASHBY BLANK';
        else if(!tSet.length) verdict='CHECK BY HAND';
        else if(SWITCH[aSrc] && tSet.indexOf(aFam)>=0) verdict='SWITCH (Jerin)';
        else if(tSet.indexOf(aFam)>=0) verdict='MATCH';
        else verdict='MISMATCH';
      }
      if(tSr){ var tw=low(tSr).split(/\s+/).filter(function(w){ return w.length>2; });
        sv=!aSr?'ASHBY BLANK':(tw.some(function(w){ return low(aSr).indexOf(w)>=0; })?'MATCH':'MISMATCH'); }
      else if(aSr) sv='TRACKER BLANK (Ashby has one)';
    }
    cnt[verdict]=(cnt[verdict]||0)+1; if(sv) cnt['sourcer: '+sv]=(cnt['sourcer: '+sv]||0)+1;
    var sugg=verdict==='SWITCH (Jerin)'?SWITCH[aSrc]:((verdict==='ASHBY BLANK'||verdict==='MISMATCH')?(PICK[tSet[0]]||'(by hand)'):'');
    out.push([String(row[C.id]||''),nm,st,String(row[C.job]||''),tSrc,tSet.join(' + '),aSrc,fam(aSrc),verdict,sugg,tSr,aRec,aSr,sv,app,aJob]);
  }
  var ss=SpreadsheetApp.openById(AUDIT), sh=ss.getSheetByName(TAB); if(!sh) sh=ss.insertSheet(TAB);
  sh.clear(); sh.getRange(1,1,out.length,out[0].length).setValues(out); sh.setFrozenRows(1); sh.getRange(1,1,1,out[0].length).setFontWeight('bold');
  Logger.log('T105i v2 selected='+n+' | '+JSON.stringify(cnt));
}

// ===== #105i source switches (Jerin, 13 Sep 2026) — WRITES to Ashby only in mode 'run' =====
// Only rows the check marked 'SWITCH (Jerin)': Third-party boards: LinkedIn => Job Portal: Linkedin Inbound and
// Prospecting: Juicebox => Juicebox: Juicebox Sourced. Re-reads each application first and skips it if its source has
// changed since the check; reads it back after application.changeSource. Run task105i_srcCheck() first.
function task105i_applySources(mode){
  mode=mode||'dry';
  var AUDIT='1U6Wi5uXLZ8hOhGKP2tyH--jHcEbUEvXgAPxbkUofTNA', TAB='V9 - 105i Source check';
  var SWITCH={'Third-party boards: LinkedIn':'Job Portal: Linkedin Inbound','Prospecting: Juicebox':'Juicebox: Juicebox Sourced'};
  var vals=SpreadsheetApp.openById(AUDIT).getSheetByName(TAB).getDataRange().getValues(), hdr=vals[0];
  var C={id:hdr.indexOf('audit-id'),as:hdr.indexOf('Ashby source'),v:hdr.indexOf('Source verdict'),app:hdr.indexOf('Application id')};
  if(C.id<0||C.as<0||C.v<0||C.app<0) throw new Error('T105iW check tab columns not found');
  var idByKey={};
  ashbyListAll_('/source.list',{}).forEach(function(s){ var st=(s.sourceType&&s.sourceType.title)||''; if(!s.isArchived) idByKey[(st?st+': ':'')+s.title]=s.id; });
  function srcOf(appId){ var j=(ashbyWrite_('/application.info',{applicationId:appId}).json)||{}; var s=(j.results||{}).source||{}; return ((s.sourceType&&s.sourceType.title)?s.sourceType.title+': ':'')+(s.title||''); }
  var done=0, skip=0, fail=0;
  for(var r=1;r<vals.length;r++){
    var row=vals[r]; if(String(row[C.v])!=='SWITCH (Jerin)') continue;
    var from=String(row[C.as]), to=SWITCH[from], app=String(row[C.app]), aid=String(row[C.id]);
    if(!to||!app){ skip++; Logger.log('T105iW SKIP no target | '+aid); continue; }
    var sid=idByKey[to]; if(!sid){ fail++; Logger.log('T105iW NO SOURCE ID | '+to); continue; }
    var cur=srcOf(app);
    if(cur!==from){ skip++; Logger.log('T105iW SKIP changed since check | '+aid+' | now '+cur); continue; }
    if(mode!=='run'){ done++; Logger.log('T105iW DRY | '+aid+' | '+from+' => '+to); continue; }
    var w=ashbyWrite_('/application.changeSource',{applicationId:app, sourceId:sid});
    if(!w.ok){ fail++; Logger.log('T105iW FAIL | '+aid+' | '+String(w.text).slice(0,120)); continue; }
    var now=srcOf(app);
    if(now===to){ done++; } else { fail++; Logger.log('T105iW READBACK DIFFERS | '+aid+' | '+now); }
  }
  Logger.log('T105iW mode='+mode+' done='+done+' skip='+skip+' fail='+fail+' | inbound id '+(idByKey['Job Portal: Linkedin Inbound']?'found':'MISSING')+' | sourced id '+(idByKey['Juicebox: Juicebox Sourced']?'found':'MISSING'));
}


// #105i (14 Sep 2026) - Jerin's go on the 18 real source mismatches: "Go on all 15" (confirms Referral / Career Site / Pre-identified),
// Naukri = Job Portal: Naukri Inbound (Shreya Pasari, Jagrati Khatri), Tejus H P = just fix the source (on the application holding his Q3 offer).
// One target per audit-id. Stops before any write if a target source is missing/archived. Skips a row whose live source no longer equals the
// check tab's 'Ashby source'. Reads back after every write. 'dry' by default - only 'run' writes.
function task105i_apply18(mode){
  mode=mode||'dry';
  var AUDIT='1U6Wi5uXLZ8hOhGKP2tyH--jHcEbUEvXgAPxbkUofTNA', TAB='V9 - 105i Source check';
  var LI='Job Portal: Linkedin Inbound', JS='Juicebox: Juicebox Sourced', RN='Recruiter Networking: Recruiter Networking', RF='Referral: Referral', CS='Career Site: Career Site', PI='Pre-identified: Pre-identified', NI='Job Portal: Naukri Inbound';
  var TARGET={'P-03168':JS,'P-03169':JS,'P-03269':CS,'P-03374':NI,'P-03419':RF,'P-03423':LI,'P-03424':RN,'P-03426':LI,'P-03430':LI,'P-03464':PI,'P-03465':PI,'P-03480':LI,'P-03516':LI,'P-03539':RF,'P-03549':NI,'P-03559':LI,'P-03560':LI,'P-03561':RN};
  var vals=SpreadsheetApp.openById(AUDIT).getSheetByName(TAB).getDataRange().getValues(), hdr=vals[0];
  var C={id:hdr.indexOf('audit-id'),as:hdr.indexOf('Ashby source'),v:hdr.indexOf('Source verdict'),app:hdr.indexOf('Application id')};
  if(C.id<0||C.as<0||C.v<0||C.app<0) throw new Error('T105i18 check tab columns not found');
  var idByKey={};
  ashbyListAll_('/source.list',{}).forEach(function(s){ var st=(s.sourceType&&s.sourceType.title)||''; if(!s.isArchived) idByKey[(st?st+': ':'')+s.title]=s.id; });
  var missing=[]; for(var k in TARGET){ if(!idByKey[TARGET[k]] && missing.indexOf(TARGET[k])<0) missing.push(TARGET[k]); }
  if(missing.length){ Logger.log('T105i18 STOP before any write - source not found or archived: '+missing.join(' ; ')); return; }
  function srcOf(appId){ var j=(ashbyWrite_('/application.info',{applicationId:appId}).json)||{}; var s=(j.results||{}).source||{}; return ((s.sourceType&&s.sourceType.title)?s.sourceType.title+': ':'')+(s.title||''); }
  var seen={}, done=0, skip=0, fail=0;
  for(var r=1;r<vals.length;r++){
    var row=vals[r], aid=String(row[C.id]); if(!TARGET[aid]) continue; seen[aid]=1;
    if(String(row[C.v])!=='MISMATCH'){ skip++; Logger.log('T105i18 SKIP verdict '+row[C.v]+' | '+aid); continue; }
    var from=String(row[C.as]), to=TARGET[aid], app=String(row[C.app]);
    if(!app){ skip++; Logger.log('T105i18 SKIP no application | '+aid); continue; }
    var cur=srcOf(app);
    if(cur!==from){ skip++; Logger.log('T105i18 SKIP changed since check | '+aid+' | now '+cur); continue; }
    if(mode!=='run'){ done++; Logger.log('T105i18 DRY | '+aid+' | '+from+' => '+to); continue; }
    var w=ashbyWrite_('/application.changeSource',{applicationId:app, sourceId:idByKey[to]});
    if(!w.ok){ fail++; Logger.log('T105i18 FAIL | '+aid+' | '+String(w.text).slice(0,120)); continue; }
    var now=srcOf(app);
    if(now===to){ done++; Logger.log('T105i18 OK | '+aid+' | '+from+' => '+now); } else { fail++; Logger.log('T105i18 READBACK DIFFERS | '+aid+' | '+now); }
  }
  var unseen=Object.keys(TARGET).filter(function(k){ return !seen[k]; });
  Logger.log('T105i18 mode='+mode+' done='+done+' skip='+skip+' fail='+fail+' | not in the check tab: '+(unseen.join(',')||'none'));
}