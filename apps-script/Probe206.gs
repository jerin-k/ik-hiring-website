// ===== PROBE 206 -- Interview Traction feasibility (READ ONLY -- writes nothing, changes nothing) =====
// Answers the four things the design rests on, each with a CONTROL:
//   A. Does interviewSchedule.list RETURN cancelled schedules? What status values exist?
//   B. Do interviewEvents[] carry their own status? What values?
//   C. Is a RESCHEDULE visible (an event moved to another day)?
//   D. Does schedule.interviewStageId match a stageId in application.listHistory -> gives the ROUND NAME free?
// !! Output is deliberately UUID-FREE: the DLP filter blanks any result carrying Ashby uuids.
function probe206() {
  var t0 = Date.now(), MAX_MS = 240000, MAX_PAGES = 30;
  function rd(s) { return String(s).replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, 'ID'); }
  function top(o, n) { var a = []; for (var k in o) a.push([k, o[k]]); a.sort(function (x, y) { return y[1] - x[1]; });
    return a.slice(0, n || 12).map(function (p) { return p[0] + '=' + p[1]; }).join(' | '); }

  var cursor = null, pages = 0, scheds = 0, evs = 0;
  var sStat = {}, eStat = {}, eKeys = {}, sKeys = {};
  var multi = 0, movedDay = 0, sameDay = 0, cancelledSeen = 0;
  var stageIdCount = {}, appByStage = {};
  var sampleAny = null, sampleCanc = null, sampleMulti = null;

  do {
    if (Date.now() - t0 > MAX_MS) { Logger.log('P206 TIME CUTOFF page ' + pages); break; }
    var body = { limit: 100, createdAfter: 1782864000000 }; if (cursor) body.cursor = cursor;
    var resp = ashbyPost_('/interviewSchedule.list', body);
    var batch = resp.results || [];
    for (var i = 0; i < batch.length; i++) {
      var s = batch[i]; scheds++;
      for (var sk in s) sKeys[sk] = 1;
      var ss = s.status == null ? '(none)' : String(s.status);
      sStat[ss] = (sStat[ss] || 0) + 1;
      if (/cancel/i.test(ss)) { cancelledSeen++; if (!sampleCanc) sampleCanc = s; }
      if (s.interviewStageId) { stageIdCount[s.interviewStageId] = (stageIdCount[s.interviewStageId] || 0) + 1;
        if (!appByStage[s.interviewStageId] && s.applicationId) appByStage[s.interviewStageId] = s.applicationId; }
      if (!sampleAny) sampleAny = s;
      var ev = s.interviewEvents || [], days = {};
      for (var e = 0; e < ev.length; e++) { evs++;
        for (var ek in ev[e]) eKeys[ek] = 1;
        var es = ev[e].status == null ? '(none)' : String(ev[e].status);
        eStat[es] = (eStat[es] || 0) + 1;
        if (ev[e].startTime) days[String(ev[e].startTime).substring(0, 10)] = 1; }
      if (ev.length > 1) { multi++; if (!sampleMulti) sampleMulti = s;
        if (Object.keys(days).length > 1) movedDay++; else sameDay++; }
    }
    cursor = (resp.moreDataAvailable && resp.nextCursor) ? resp.nextCursor : null; pages++;
  } while (cursor && pages < MAX_PAGES);

  Logger.log('P206|HDR|pages=' + pages + ' scheds=' + scheds + ' events=' + evs + ' secs=' + Math.round((Date.now() - t0) / 1000));
  Logger.log('P206|A|schedStatus|' + top(sStat, 15));
  Logger.log('P206|B|eventStatus|' + top(eStat, 15));
  Logger.log('P206|B2|schedKeys|' + Object.keys(sKeys).join(','));
  Logger.log('P206|B3|eventKeys|' + Object.keys(eKeys).join(','));
  Logger.log('P206|C|multiEvent=' + multi + ' ofScheds=' + scheds + ' movedToAnotherDay=' + movedDay + ' sameDay=' + sameDay + ' cancelledSchedules=' + cancelledSeen);
  Logger.log('P206|D0|distinctStageIds=' + Object.keys(stageIdCount).length);

  var ids = Object.keys(appByStage).slice(0, 10), ok = 0, bad = 0, names = [];
  for (var d = 0; d < ids.length; d++) {
    if (Date.now() - t0 > MAX_MS + 60000) { Logger.log('P206|D|time cutoff'); break; }
    try {
      var h = ashbyPost_('/application.listHistory', { applicationId: appByStage[ids[d]] });
      var rows = h.results || h.history || [], hit = null;
      for (var r = 0; r < rows.length; r++) if (rows[r].stageId === ids[d]) { hit = rows[r].title; break; }
      if (hit) { ok++; names.push(hit + ' x' + stageIdCount[ids[d]]); } else { bad++; names.push('NOMATCH(' + rows.map(function (x) { return x.title; }).join('/') + ')'); }
    } catch (e) { Logger.log('P206|D|err ' + rd(e.message)); }
  }
  Logger.log('P206|D|matched=' + ok + ' unmatched=' + bad + ' => ' + (ok && !bad ? 'ROUND NAME IS FREE' : 'ROUND NAME NEEDS ANOTHER SOURCE'));
  Logger.log('P206|D2|rounds|' + names.join(' | '));
  Logger.log('P206|S1|' + rd(JSON.stringify(sampleAny)).substring(0, 700));
  Logger.log('P206|S2|cancelled|' + (sampleCanc ? rd(JSON.stringify(sampleCanc)).substring(0, 700) : 'NONE IN SAMPLE'));
  Logger.log('P206|S3|multi|' + (sampleMulti ? rd(JSON.stringify(sampleMulti)).substring(0, 700) : 'NONE IN SAMPLE'));
  Logger.log('P206|END');
}
