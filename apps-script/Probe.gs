function createOpenings(){
  var all=ashbyListAll_('/opening.list');
  var n=0;
  for(var i=0;i<all.length;i++){
    var o=all[i];var lv=o.latestVersion||{};var ident=lv.identifier||'';
    if(!/^IK-Opening-2(3[4-9]|[45][0-9]|6[0-6])$/.test(ident))continue;
    n++;
    Logger.log(ident+' '+String(o.id).split('-').join('_'));
  }
  Logger.log('N '+n);
}

function createOpenings_REAL_HOLD() {
  var jobs = [
    ['4078cca1-e621-4a4c-a772-a679efd15c12', 6],
    ['7c1706f1-264a-48eb-aecb-ab4f60a85f41', 7],
    ['5a5f471f-dccc-46aa-aafb-93ae21a19a27', 2],
    ['3c1dbb02-7212-42c2-a397-7d96f6b92ec4', 1],
    ['f9725a3b-4dc3-482c-8fc0-b38595012af0', 2],
    ['23285eb9-94cb-404c-ad32-10fec202d0ec', 2],
    ['378e5361-27c8-44c3-a967-a1ef74877b4e', 3],
    ['b9a5a189-1fb9-43e5-afe6-4ef8f9894e78', 2],
    ['9783f817-e58a-4f35-aa83-e85422f14c86', 1],
    ['1c646e48-14db-4b3d-b8c4-66ba7087d444', 1],
    ['e2b1a6be-559f-4a09-803d-c0d4be36996b', 1],
    ['a6729ee8-f1ef-4a54-b5c3-abeab36f44bf', 1],
    ['84640934-cab3-464d-82eb-cf981353812b', 1],
    ['2970acb5-6258-42e8-9aa0-ef3bc46102fd', 1],
    ['dd785a22-9985-4f5e-b41b-c28875fbd3bf', 1],
    ['1cef9cfe-b1de-4a63-98a0-a964c4aa6ff9', 1]
  ];
  var made = 0;
  for (var i=0;i<jobs.length;i++) {
    var uuid = jobs[i][0], n = jobs[i][1];
    for (var k=0;k<n;k++) {
      var res = ashbyPost_('/opening.create', { openingState:'Open', jobIds:[uuid] });
      var op = (res && res.results) ? res.results : res;
      var id = (op && op.id) ? op.id : ((op && op.opening && op.opening.id) ? op.opening.id : 'x');
      var lv = (op && op.latestVersion) ? op.latestVersion : ((op && op.opening) ? op.opening.latestVersion : null);
      var ident = (lv && lv.identifier) ? lv.identifier : 'x';
      made++;
      Logger.log('CREATED ' + uuid.slice(0,8) + ' ' + ident + ' ' + String(id).slice(0,8));
    }
  }
  Logger.log('MADE ' + made);
}

function testTofu() {
  var events = loadDriveJson_("stage_events.json") || {};
  Logger.log("stage_events apps: " + Object.keys(events).length);
}