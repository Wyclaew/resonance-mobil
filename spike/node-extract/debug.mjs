import { Innertube } from 'youtubei.js';
const id = process.argv[2];
const yt = await Innertube.create({ retrieve_player: true });
for (const client of ['WEB_EMBEDDED','WEB','ANDROID','IOS','TV_EMBEDDED']) {
  try {
    const info = await yt.getBasicInfo(id, client);
    const ad = info.streaming_data?.adaptive_formats ?? [];
    const a = ad.find(f => f.mime_type?.startsWith('audio/'));
    console.log(client, '| playability:', info.playability_status?.status, info.playability_status?.reason ?? '',
      '| adaptive:', ad.length, '| audio keys:', a ? Object.entries(a).filter(([k,v])=>v!=null&&typeof v!=='function').map(([k])=>k).join(',') : '-');
    if (a) console.log('   url?', !!a.url, 'cipher?', !!a.signature_cipher, !!a.cipher, 'itag', a.itag);
  } catch(e){ console.log(client, 'ERR', String(e.message).slice(0,120)); }
}
console.log('player id:', yt.session.player?.sts, yt.session.player?.url ?? '(no player url)');
