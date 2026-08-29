// Duvar nerede? Kendi çözdüğümüz adres vs yt-dlp'nin çözdüğü adres.
import { execFileSync } from 'node:child_process';
import { Innertube } from 'youtubei.js';
const id = process.argv[2] ?? 'rtL5oMyBHPs';
const UA='com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip';

async function probe(label, url, ua) {
  const H = ua ? {'user-agent':ua} : {};
  const out = [];
  for (const [a,b] of [[0,524287],[524288,1048575],[1048576,1572863],[3000000,3524287]]) {
    const r = await fetch(url,{headers:{...H, Range:`bytes=${a}-${b}`}});
    out.push(`${(a/1048576).toFixed(1)}MB:${r.status}`);
    if (r.body) await r.arrayBuffer().catch(()=>{});
  }
  const full = await fetch(url,{headers:H});
  const n = full.status===200 ? (await full.arrayBuffer()).byteLength : 0;
  console.log(`${label}: ${out.join(' ')} | tam:${full.status} ${(n/1048576).toFixed(2)}MB`);
}

const yt = await Innertube.create({ retrieve_player: false });
const visitorData = yt.session.context.client.visitorData;
const body={context:{client:{clientName:'ANDROID_VR',clientVersion:'1.65.10',deviceMake:'Oculus',deviceModel:'Quest 3',androidSdkVersion:32,userAgent:UA,osName:'Android',osVersion:'12L',hl:'en',gl:'US',visitorData}},videoId:id,contentCheckOk:true,racyCheckOk:true};
const j = await (await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false',{method:'POST',headers:{'content-type':'application/json','user-agent':UA,'x-youtube-client-name':'28','x-youtube-client-version':'1.65.10'},body:JSON.stringify(body)})).json();
const mine = (j.streamingData?.adaptiveFormats??[]).find(f=>f.itag===140);
await probe('KENDİ (android_vr)', mine.url, UA);

const t0=performance.now();
const ytdlpUrl = execFileSync('yt-dlp',['-f','bestaudio[ext=m4a]/bestaudio','-g',`https://www.youtube.com/watch?v=${id}`],{encoding:'utf8'}).trim().split('\n')[0];
console.log('yt-dlp çözüm süresi:', ((performance.now()-t0)/1000).toFixed(2)+'s', 'client:', (ytdlpUrl.match(/[?&]c=([A-Z_]+)/)||[])[1]);
await probe('YT-DLP', ytdlpUrl, UA);
await probe('YT-DLP (UA yok)', ytdlpUrl, null);
