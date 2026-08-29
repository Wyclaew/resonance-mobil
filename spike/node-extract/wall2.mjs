import { Innertube } from 'youtubei.js';
const id = process.argv[2] ?? 'rtL5oMyBHPs';
const UA='com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip';
const yt = await Innertube.create({ retrieve_player:false });
const visitorData = yt.session.context.client.visitorData;
const body={context:{client:{clientName:'ANDROID_VR',clientVersion:'1.65.10',deviceMake:'Oculus',deviceModel:'Quest 3',androidSdkVersion:32,userAgent:UA,osName:'Android',osVersion:'12L',hl:'en',gl:'US',visitorData}},videoId:id,contentCheckOk:true,racyCheckOk:true};
const j=await (await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false',{method:'POST',headers:{'content-type':'application/json','user-agent':UA,'x-youtube-client-name':'28','x-youtube-client-version':'1.65.10'},body:JSON.stringify(body)})).json();
const f=(j.streamingData?.adaptiveFormats??[]).find(x=>x.itag===140);
const clen=Number(f.contentLength);
console.log('boyut', (clen/1048576).toFixed(2)+'MB');
// &range= sorgu parametresiyle TÜM dosyayı parça parça indir (yt-dlp'nin yaptığı bu)
const CH=1048576; let got=0, rn=0; const t0=performance.now(); const parts=[];
for (let a=0; a<clen; a+=CH) {
  const b=Math.min(a+CH-1, clen-1);
  const r=await fetch(`${f.url}&range=${a}-${b}&rn=${rn++}`,{headers:{'user-agent':UA}});
  if(!r.ok){ console.log(`parça ${a}-${b} ❌ ${r.status}`); break; }
  const buf=new Uint8Array(await r.arrayBuffer()); parts.push(buf); got+=buf.length;
}
const secs=(performance.now()-t0)/1000;
console.log(`&range= ile indirilen: ${(got/1048576).toFixed(2)}MB / ${(clen/1048576).toFixed(2)}MB  ${secs.toFixed(1)}s  ${Math.round(got/1024/secs)} KB/s  ${got>=clen?'✅ TAM':'❌ KESİK'}`);
if (got>=clen){ const fs=await import('node:fs'); fs.writeFileSync('/tmp/spike_track.m4a', Buffer.concat(parts.map(Buffer.from))); console.log('yazıldı: /tmp/spike_track.m4a'); }
