// yt-dlp'nin android_vr isteğinin BİREBİR aynısı, saf fetch ile (RN'de de aynısı yazılabilir).
const id = process.argv[2] ?? 'rtL5oMyBHPs';
const UA = 'com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip';
const body = {
  context: { client: {
    clientName: 'ANDROID_VR', clientVersion: '1.65.10', deviceMake: 'Oculus', deviceModel: 'Quest 3',
    androidSdkVersion: 32, userAgent: UA, osName: 'Android', osVersion: '12L', hl: 'en', gl: 'US'
  }},
  videoId: id, contentCheckOk: true, racyCheckOk: true
};
const t0 = performance.now();
const r = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'user-agent': UA,
             'x-youtube-client-name': '28', 'x-youtube-client-version': '1.65.10' },
  body: JSON.stringify(body)
});
const j = await r.json();
const sd = j.streamingData ?? {};
const ad = sd.adaptiveFormats ?? [];
const audio = ad.filter(f => f.mimeType?.startsWith('audio/'));
console.log('http', r.status, '| playability', j.playabilityStatus?.status, '| çözüm', (performance.now()-t0).toFixed(0)+'ms');
console.log('adaptive', ad.length, '| audio', audio.length, '| sabr?', !!sd.serverAbrStreamingUrl, '| formats', (sd.formats??[]).length);
const f = audio.find(x => x.itag === 140) ?? audio[0];
if (!f) { console.log('ses formatı yok'); process.exit(1); }
console.log('itag', f.itag, f.mimeType?.split(';')[0], Math.round(f.bitrate/1000)+'k', (f.contentLength/1048576).toFixed(1)+'MB',
            f.audioSampleRate+'Hz', 'url?', !!f.url, 'cipher?', !!f.signatureCipher);
if (f.url) {
  const t1 = performance.now();
  const h = await fetch(f.url, { headers: { Range: 'bytes=-1024', 'user-agent': UA } });
  console.log('sağlık testi (son 1KB):', h.status, ((performance.now()-t1)).toFixed(0)+'ms');
  const t2 = performance.now();
  const d = await fetch(f.url, { headers: { Range: 'bytes=0-524287', 'user-agent': UA } });
  const buf = new Uint8Array(await d.arrayBuffer());
  const secs = (performance.now()-t2)/1000;
  console.log('512KB indirme:', d.status, buf.length, 'bayt,', Math.round(buf.length/1024/secs), 'KB/s');
  // Tamamını indirmeyi dene (PO Token duvarı 1MB'da mı?)
  const t3 = performance.now();
  const full = await fetch(f.url, { headers: { 'user-agent': UA } });
  const fb = new Uint8Array(await full.arrayBuffer());
  console.log('TAM indirme:', full.status, (fb.length/1048576).toFixed(2)+'MB /', (f.contentLength/1048576).toFixed(2)+'MB',
              'in', ((performance.now()-t3)/1000).toFixed(1)+'s', fb.length >= Number(f.contentLength) ? '✅ TAM' : '❌ KESİK');
}
