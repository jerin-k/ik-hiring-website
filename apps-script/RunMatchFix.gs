function buildJobMatchFixing(){
  function norm(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(); }
  var depts={}; try{ ashbyListAll_('/department.list').forEach(function(d){depts[d.id]=d.name;}); }catch(e){}
  var jobs = ashbyListAll_('/job.list');
  var jobById={}; jobs.forEach(function(j){ jobById[j.id]={title:j.title||'',dept:depts[j.departmentId]||'',status:j.status||''}; });
  function findByName(tn,td){ var n=norm(tn),d=norm(td),fz=null; for(var id in jobById){var jt=norm(jobById[id].title),jd=norm(jobById[id].dept); if(jt===n){if(!d||!jd||jd===d)return{id:id,conf:'exact'}; if(!fz)fz=id;} else if(!fz&&n&&(jt.indexOf(n)>=0||n.indexOf(jt)>=0))fz=id;} return fz?{id:fz,conf:'fuzzy'}:null; }
  function jobViaCandidate(emails){ for(var e=0;e<emails.length&&e<3;e++){ var r;try{r=ashbyPost_('/candidate.search',{email:emails[e]});}catch(x){continue;} var list=(r&&r.results)?r.results:[]; for(var i=0;i<list.length;i++){var apps=list[i].applicationIds||[]; for(var a=0;a<apps.length&&a<3;a++){var ai;try{ai=ashbyPost_('/application.info',{applicationId:apps[a]});}catch(y){continue;} var app=ai&&ai.results?ai.results:null; var jid=app&&app.job?(app.job.id||app.job):null; if(jid&&jobById[jid])return jid;}}} return null; }
  var master=SpreadsheetApp.openById('1_LQxHDZ6dXehyR2lc8pcFjfDeRaV80vBzVRB_BKWT5A').getSheetByName('Master');
  var mv=master.getDataRange().getValues();
  var QTR=2,STATUS=3,DEPT=4,JOB=7,EMAIL=23;
  var byKey={};
  for(var i=1;i<mv.length;i++){
    if(String(mv[i][QTR]||'').indexOf('2026')<0) continue;
    var jn=String(mv[i][JOB]||'').trim(); if(!jn) continue;
    var dp=String(mv[i][DEPT]||'').trim(); var key=jn+'||'+dp;
    if(!byKey[key]) byKey[key]={name:jn,dept:dp,total:0,open:0,emails:[]};
    byKey[key].total++;
    if(String(mv[i][STATUS]||'').trim().toLowerCase()==='open') byKey[key].open++;
    var em=String(mv[i][EMAIL]||'').trim(); if(em) byKey[key].emails.push(em.toLowerCase());
  }
  var openings=ashbyListAll_('/opening.list'); var openByJob={};
  openings.forEach(function(o){ if(o.isArchived)return; if(o.closedAt)return; var lv=o.latestVersion||{}; (lv.jobIds||[]).forEach(function(jid){openByJob[jid]=(openByJob[jid]||0)+1;}); });
  var rows=[]; var cN=0,cC=0,cNone=0;
  Object.keys(byKey).forEach(function(k){
    var b=byKey[k]; var m1=findByName(b.name,b.dept); var jid=null,method='',conf='';
    if(m1){jid=m1.id;method='name';conf=m1.conf;cN++;}
    else{var j2=jobViaCandidate(b.emails);if(j2){jid=j2;method='candidate';conf='id';cC++;}else{method='none';cNone++;}}
    var aj=jid?jobById[jid]:null;
    var diff=aj?(String(b.name).trim().toLowerCase()!==String(aj.title).trim().toLowerCase()?'YES':'no'):'';
    var live=jid?(openByJob[jid]||0):'';
    rows.push([b.name,b.dept,b.total,b.open,(b.open>0?'YES':'no'),method,conf,jid||'',aj?aj.title:'',aj?aj.dept:'',aj?aj.status:'',live,diff]);
  });
  rows.sort(function(a,z){ return (Number(z[3])||0)-(Number(a[3])||0); });
  var header=['Tracker Job Name','Tracker Dept','Total 2026 Positions','Open Positions','Has Open Positions?','Match Method','Confidence','Ashby Job ID','Ashby Title','Ashby Dept','Ashby Status','Ashby Live Openings','Name Differs?'];
  var out=[header].concat(rows);
  var aud=SpreadsheetApp.openById('1U6Wi5uXLZ8hOhGKP2tyH--jHcEbUEvXgAPxbkUofTNA');
  var name='Job Match Fixing';
  var sh=aud.getSheetByName(name); if(!sh)sh=aud.insertSheet(name); else sh.clear();
  sh.getRange(1,1,out.length,out[0].length).setValues(out);
  Logger.log('JOB MATCH FIXING: distinct 2026 jobs='+rows.length+' | name='+cN+' candidate='+cC+' none='+cNone+' | with-open='+rows.filter(function(r){return r[3]>0;}).length);
}