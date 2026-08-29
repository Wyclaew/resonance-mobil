import { Innertube } from 'youtubei.js';
const id = process.argv[2];
const yt = await Innertube.create({ retrieve_player: true });
for (const c of ['ANDROID_VR','VISIONOS','TV_SIMPLY','YTMUSIC_ANDROID','WEB_CREATOR','YTKIDS','TV_EMBEDDED']) {
  try {
    const info = await yt.getBasicInfo(id, c);
    const ad = info.streaming_data?.adaptive_formats ?? [];
    const a = ad.find(f=>f.itag===140) ?? ad.find(f=>f.mime_type?.startsWith('audio/'));
    let url=null, err=null;
    if (a) { try { url = await a.decipher(yt.session.player); } catch(e){ err=String(e.message).slice(0,40); } }
    let health='-';
    if (url) { const r = await fetch(url,{headers:{Range:'bytes=-1024'}}); health = r.status; }
    console.log(`${c.padEnd(16)} status=${info.playability_status?.status} adaptive=${ad.length} itag=${a?.itag ?? '-'} url=${url?'VAR':'yok'} ${err??''} health=${health}`);
  } catch(e){ console.log(`${c.padEnd(16)} ERR ${String(e.message).slice(0,80)}`); }
}
