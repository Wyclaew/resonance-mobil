// Faz 0 spike (Node tarafı): youtubei.js bu makineden çalınabilir bir ses adresi
// çözebiliyor mu? MOBILE.md §5 "çok yollu indirme" dersini birebir uygular:
// istemci çeşitliliği + adres sağlık testi (son 1 KB Range) + gerçek indirme ölçümü.
import { Innertube } from 'youtubei.js';

const IDS = process.argv.slice(2);
const CLIENTS = ['WEB_EMBEDDED', 'WEB', 'MWEB', 'ANDROID', 'IOS', 'TV_EMBEDDED', 'YTMUSIC'];

const ms = (t) => `${(performance.now() - t).toFixed(0)}ms`;

async function healthCheck(url) {
  // Son 1 KB'ı iste: kısıtlı adres 403, kısıtsız 206 döner (~0.1sn).
  const t = performance.now();
  const r = await fetch(url, { headers: { Range: 'bytes=-1024' } });
  return { status: r.status, ok: r.status === 206 || r.status === 200, took: ms(t) };
}

async function rangeSpeed(url, bytes = 512 * 1024) {
  const t = performance.now();
  const r = await fetch(url, { headers: { Range: `bytes=0-${bytes - 1}` } });
  if (!r.ok && r.status !== 206) return { status: r.status, ok: false };
  const buf = new Uint8Array(await r.arrayBuffer());
  const secs = (performance.now() - t) / 1000;
  return { status: r.status, ok: true, got: buf.length, kbps: Math.round(buf.length / 1024 / secs) };
}

const yt = await Innertube.create({ retrieve_player: true });

for (const id of IDS) {
  console.log(`\n=== ${id} ===`);
  for (const client of CLIENTS) {
    const t0 = performance.now();
    try {
      const info = await yt.getBasicInfo(id, client);
      const adaptive = info.streaming_data?.adaptive_formats ?? [];
      const audio = adaptive.filter((f) => f.mime_type?.startsWith('audio/'));
      if (!audio.length) { console.log(`${client.padEnd(13)} ❌ ses formatı yok (${ms(t0)})`); continue; }
      audio.sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
      const f = audio.find((x) => x.itag === 140) ?? audio[0];
      const url = await f.decipher(yt.session.player);
      const resolveMs = ms(t0);
      const h = await healthCheck(url);
      const s = h.ok ? await rangeSpeed(url) : { ok: false };
      console.log(
        `${client.padEnd(13)} ✅ itag ${f.itag} ${f.mime_type?.split(';')[0]} ${Math.round((f.bitrate ?? 0) / 1000)}k ` +
        `${((f.content_length ?? 0) / 1048576).toFixed(1)}MB | çözüm ${resolveMs} | sağlık ${h.status} ${h.took} | ` +
        (s.ok ? `512KB @ ${s.kbps} KB/s` : `indirme ❌ ${s.status ?? ''}`)
      );
    } catch (e) {
      console.log(`${client.padEnd(13)} ❌ ${String(e.message ?? e).split('\n')[0].slice(0, 90)} (${ms(t0)})`);
    }
  }
}
