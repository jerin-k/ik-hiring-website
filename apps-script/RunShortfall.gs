function computeOpeningShortfall(){
  // 🚨 DEPRECATED / DISABLED — task #34, 7 Sep 2026.
  // BUG: this resolves tracker rows to an Ashby job partly by CANDIDATE EMAIL, so rows belonging to a
  // different job get counted into this job's target. Program Advisor read 15 when the true figure was 13.
  // Its output tab '22g Openings To Create' has been deleted and task 22g is killed, so the function has no
  // consumer. It is disabled rather than deleted so the aggregation logic survives if ever needed.
  // If you revive it: resolve jobs by NAME first and only fall back to candidate email when the name fails,
  // then de-duplicate per tracker row so one row can never be counted against two jobs.
  throw new Error('computeOpeningShortfall is DISABLED (task #34): candidate-email job resolution inflates targets. See comment.');

  var aud = SpreadsheetApp.openById('1U6Wi5uXLZ8hOhGKP2tyH--jHcEbUEvXgAPxbkUofTNA');
  var cw = aud.getSheetByName('Job Crosswalk (Tracker-Ashby)').getDataRange().getValues();
  var byJob = {};
  for (var i=1;i<cw.length;i++){
    var jid=String(cw[i][5]||'').trim(); if(!jid) continue;
    if(!byJob[jid]) byJob[jid]={title:cw[i][6]||'', trackerOpen:0, names:[]};
    byJob[jid].trackerOpen += Number(cw[i][2])||0;
    byJob[jid].names.push(cw[i][0]);
  }
  var openings = ashbyListAll_('/opening.list');
  var openByJob = {};
  openings.forEach(function(o){
    if(o.isArchived) return;
    if(o.closedAt) return;
    var lv = o.latestVersion || {}; var jids = lv.jobIds || [];
    jids.forEach(function(jid){ openByJob[jid]=(openByJob[jid]||0)+1; });
  });
  var out=[['Ashby Job ID','Ashby Title','Tracker Job Names','Tracker Open Count','Ashby Live Openings','Openings To Create']];
  var total=0, jobsShort=0;
  Object.keys(byJob).forEach(function(jid){
    var b=byJob[jid], ao=openByJob[jid]||0, create=Math.max(0,b.trackerOpen-ao);
    if(create>0) jobsShort++;
    total+=create;
    out.push([jid, b.title, b.names.join(' | '), b.trackerOpen, ao, create]);
  });
  out.sort(function(a,z){ return (typeof z[5]==='number'?z[5]:-1)-(typeof a[5]==='number'?a[5]:-1); });
  var name='22g Openings To Create';
  var sh=aud.getSheetByName(name); if(!sh) sh=aud.insertSheet(name); else sh.clear();
  sh.getRange(1,1,out.length,out[0].length).setValues(out);
  Logger.log('22g OPENINGS TO CREATE: total='+total+' | jobs needing openings='+jobsShort+' of '+Object.keys(byJob).length+' | total live Ashby openings scanned='+openings.length);
}