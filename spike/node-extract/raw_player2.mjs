import { Innertube } from 'youtubei.js';
const id = process.argv[2] ?? 'rtL5oMyBHPs';
const yt = await Innertube.create({ retrieve_player: false });
const visitorData = yt.session.context.client.visitorData;
console.log('visitorData?', !!visitorData);
const UA = 'com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip';
const body = {
  context: { client: {
    clientName:'ANDROID_VR', clientVersion:'1.65.10', deviceMake:'Oculus', deviceModel:'Quest 3',
    androidSdkVersion:32, userAgent:UA, osName:'Android', osVersion:'12L', hl:'en', gl:'US', visitorData
  }},
  videoId:id, contentCheckOk:true, racyCheckOk:true
};
const t0=performance.now();
const r = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false',{method:'POST',
  headers:{'content-type':'application/json','user-agent':UA,'x-youtube-client-name':'28','x-youtube-client-version':'1.65.10','x-goog-visitor-id':visitorData??''},
  body:JSON.stringify(body)});
const j = await r.json();
const sd=j.streamingData??{}; const ad=sd.adaptiveFormats??[]; const audio=ad.filter(f=>f.mimeType?.startsWith('audio/'));
console.log('http',r.status,'| playability',j.playabilityStatus?.status, j.playabilityStatus?.reason??'', '|', (performance.now()-t0).toFixed(0)+'ms');
console.log('adaptive',ad.length,'audio',audio.length,'sabr?',!!sd.serverAbrStreamingUrl);
const f = audio.find(x=>x.itag===140)??audio[0];
if(!f){process.exit(1);}
console.log('itag',f.itag,f.mimeType?.split(';')[0],Math.round(f.bitrate/1000)+'k',(f.contentLength/1048576).toFixed(1)+'MB','url?',!!f.url);
if(f.url){
  const clen=Number(f.contentLength);
  const h=await fetch(f.url,{headers:{Range:`bytes=${clen-1024}-${clen-1}`,'user-agent':UA}}); console.log('sağlık (son 1KB, açık aralık):',h.status);
  const p1=await fetch(f.url,{headers:{Range:'bytes=0-524287','user-agent':UA}}); console.log('ilk 512KB:',p1.status,(await p1.arrayBuffer()).byteLength);
  const p2=await fetch(f.url+'&range=0-524287',{headers:{'user-agent':UA}}); console.log('&range= sorgusu:',p2.status,(await p2.arrayBuffer()).byteLength);
  const t3=performance.now(); const full=await fetch(f.url,{headers:{'user-agent':UA}}); const fb=new Uint8Array(await full.arrayBuffer());
  console.log('TAM indirme:',full.status,(fb.length/1048576).toFixed(2)+'MB /',(f.contentLength/1048576).toFixed(2)+'MB',((performance.now()-t3)/1000).toFixed(1)+'s',
    fb.length>=Number(f.contentLength)?'✅ TAM':'❌ KESİK');
}
