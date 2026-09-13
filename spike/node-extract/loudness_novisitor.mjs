// Kotlin'de youtubei.js yok: visitorData'yı /visitor_id uç noktasından alıp aynı çağrı çalışıyor mu?
const id = process.argv[2] ?? 'rtL5oMyBHPs';
const t0 = performance.now();
const v = await (await fetch('https://www.youtube.com/youtubei/v1/visitor_id?prettyPrint=false', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ context: { client: { clientName: 'WEB', clientVersion: '2.20260828.01.00', hl: 'en', gl: 'US' } } })
})).json();
const visitorData = v.responseContext?.visitorData;
console.log('visitorData?', !!visitorData, `${(performance.now() - t0).toFixed(0)}ms`);
const UA = 'com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip';
const body = { context: { client: { clientName: 'ANDROID_VR', clientVersion: '1.65.10', deviceMake: 'Oculus', deviceModel: 'Quest 3', androidSdkVersion: 32, userAgent: UA, osName: 'Android', osVersion: '12L', hl: 'en', gl: 'US', visitorData } }, videoId: id, contentCheckOk: true, racyCheckOk: true };
const j = await (await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': UA, 'x-youtube-client-name': '28', 'x-youtube-client-version': '1.65.10', 'x-goog-visitor-id': visitorData ?? '' }, body: JSON.stringify(body) })).json();
console.log('playability:', j.playabilityStatus?.status, '| audioConfig:', JSON.stringify(j.playerConfig?.audioConfig ?? null), `| toplam ${(performance.now() - t0).toFixed(0)}ms`);
