// YouTube player yanıtı parça başına ses yüksekliği taşıyor mu? (stream'e dokunmadan)
import { Innertube } from 'youtubei.js';
const ids = process.argv.slice(2);
const yt = await Innertube.create({ retrieve_player: false });
const visitorData = yt.session.context.client.visitorData;
const UA = 'com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip';
for (const id of ids) {
  const body = { context: { client: { clientName: 'ANDROID_VR', clientVersion: '1.65.10', deviceMake: 'Oculus', deviceModel: 'Quest 3', androidSdkVersion: 32, userAgent: UA, osName: 'Android', osVersion: '12L', hl: 'en', gl: 'US', visitorData } }, videoId: id, contentCheckOk: true, racyCheckOk: true };
  const t0 = performance.now();
  const j = await (await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': UA, 'x-youtube-client-name': '28', 'x-youtube-client-version': '1.65.10' }, body: JSON.stringify(body) })).json();
  const ac = j.playerConfig?.audioConfig ?? {};
  const f140 = (j.streamingData?.adaptiveFormats ?? []).find((f) => f.itag === 140 || f.itag === 251);
  console.log(`${id} | ${(performance.now() - t0).toFixed(0)}ms | audioConfig:`, JSON.stringify(ac), '| format.loudnessDb:', f140?.loudnessDb, '| title:', j.videoDetails?.title?.slice(0, 30));
}
