function buildJobCrosswalk(){
  function norm(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(); }
  var depts = {};
  try { ashbyListAll_('/department.list').forEach(function(d){ depts[d.id]=d.name; }); } catch(e){}
  var jobs = ashbyListAll_('/job.list');
  var jobById = {};
  jobs.forEach(function(j){ jobById[j.id] = { title:j.title||'', dept: depts[j.departmentId]||'', status:j.status||'' }; });
  function findByName(tn, td){
    var n = norm(tn), d = norm(td), fuzzy=null;
    for (var id in jobById){
      var jt = norm(jobById[id].title), jd = norm(jobById[id].dept);
      if (jt === n){ if (!d || !jd || jd === d) return {id:id, conf:'exact'}; if(!fuzzy) fuzzy=id; }
      else if (!fuzzy && n && (jt.indexOf(n)>=0 || n.indexOf(jt)>=0)) fuzzy=id;
    }
    return fuzzy ? {id:fuzzy, conf:'fuzzy'} : null;
  }
  function jobViaCandidate(emails){
    for (var e=0; e<emails.length && e<3; e++){
      var r; try { r = ashbyPost_('/candidate.search', {email: emails[e]}); } catch(ex){ continue; }
      var list = (r && r.results) ? r.results : [];
      for (var i=0;i<list.length;i++){
        var apps = list[i].applicationIds || [];
        for (var a=0;a<apps.length && a<3;a++){
          var ai; try { ai = ashbyPost_('/application.info', {applicationId: apps[a]}); } catch(ex2){ continue; }
          var app = ai && ai.results ? ai.results : null;
          var jid = app && app.job ? (app.job.id || app.job) : null;
          if (jid && jobById[jid]) return jid;
        }
      }
    }
    return null;
  }
  var aud = SpreadsheetApp.openById('1U6Wi5uXLZ8hOhGKP2tyH--jHcEbUEvXgAPxbkUofTNA');
  var v3 = aud.getSheetByName('Tracker Openings v3').getDataRange().getValues();
  var openCount = {};
  for (var i=1;i<v3.length;i++){
    if (String(v3[i][66]||'').trim().toLowerCase()!=='open') continue;
    var jn = String(v3[i][9]||'').trim(); if(!jn) continue;
    openCount[jn]=(openCount[jn]||0)+1;
  }
  var master = SpreadsheetApp.openById('1_LQxHDZ6dXehyR2lc8pcFjfDeRaV80vBzVRB_BKWT5A').getSheetByName('Master');
  var mv = master.getDataRange().getValues();
  var jobDept={}, jobEmails={};
  for (var r2=1;r2<mv.length;r2++){
    var mj = String(mv[r2][7]||'').trim(); if(!openCount[mj]) continue;
    if(!jobDept[mj]) jobDept[mj]=String(mv[r2][4]||'').trim();
    var em = String(mv[r2][23]||'').trim(); if(em){ (jobEmails[mj]=jobEmails[mj]||[]).push(em.toLowerCase()); }
  }
  var out=[['Tracker Job Name','Tracker Dept','Open Count','Match Method','Confidence','Ashby Job ID','Ashby Title','Ashby Dept','Ashby Status']];
  var cName=0,cCand=0,cNone=0;
  Object.keys(openCount).forEach(function(jn){
    var dept=jobDept[jn]||'', m1=findByName(jn,dept), jid=null, method='', conf='';
    if(m1){ jid=m1.id; method='name'; conf=m1.conf; cName++; }
    else { var j2=jobViaCandidate(jobEmails[jn]||[]); if(j2){ jid=j2; method='candidate'; conf='id'; cCand++; } else { method='none'; cNone++; } }
    var aj = jid?jobById[jid]:null;
    out.push([jn, dept, openCount[jn], method, conf, jid||'', aj?aj.title:'', aj?aj.dept:'', aj?aj.status:'']);
  });
  var name='Job Crosswalk (Tracker-Ashby)';
  var sh = aud.getSheetByName(name); if(!sh) sh=aud.insertSheet(name); else sh.clear();
  sh.getRange(1,1,out.length,out[0].length).setValues(out);
  Logger.log('CROSSWALK: open job-names='+Object.keys(openCount).length+' | name-matched='+cName+' | candidate-matched='+cCand+' | NONE='+cNone);
}