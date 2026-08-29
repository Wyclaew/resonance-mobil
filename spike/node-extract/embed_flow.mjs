// yt-dlp'nin ÇALIŞAN web_embedded akışının saf fetch kopyası:
// embed sayfası → ytcfg (taze clientVersion + visitorData) → player.js → sts → /player
const id = process.argv[2] ?? 'rtL5oMyBHPs';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';
const t0 = performance.now();

const html = await (await fetch(`https://www.youtube.com/embed/${id}?html5=1`, { headers: { 'user-agent': UA, 'accept-language': 'en-US,en' } })).text();
const pick = (re) => (html.match(re) || [])[1];
const clientVersion = pick(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/);
const visitorData   = pick(/"VISITOR_DATA":"([^"]+)"/);
const playerUrl     = pick(/"(?:PLAYER_JS_URL|jsUrl)":"([^"]+)"/);
const clientName    = pick(/"INNERTUBE_CONTEXT_CLIENT_NAME":\s*"?(\w+)"?/);
console.log('ytcfg:', { clientVersion, clientName, visitorData: visitorData?.slice(0,14)+'…', playerUrl });

const playerJs = await (await fetch(`https://www.youtube.com${playerUrl}`, { headers: { 'user-agent': UA } })).text();
const sts = Number((playerJs.match(/signatureTimestamp[:=](\d+)/) || [])[1]);
console.log('player boyutu', (playerJs.length/1024).toFixed(0)+'KB', '| sts', sts, '|', ((performance.now()-t0)/1000).toFixed(2)+'s');

const body = {
  context: { client: {
    hl: 'en', gl: 'US', clientName: 'WEB_EMBEDDED_PLAYER', clientVersion,
    userAgent: UA + ',gzip(gfe)', visitorData,
    originalUrl: `https://www.youtube.com/embed/${id}?html5=1`, platform: 'DESKTOP',
    osName: 'Macintosh', osVersion: '10_15_7', clientFormFactor: 'UNKNOWN_FORM_FACTOR'
  }, thirdParty: { embedUrl: 'https://www.youtube.com/' } },
  playbackContext: { contentPlaybackContext: { html5Preference: 'HTML5_PREF_WANTS', signatureTimestamp: sts } },
  videoId: id, contentCheckOk: true, racyCheckOk: true
};
const r = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'user-agent': UA, 'x-youtube-client-name': '56',
             'x-youtube-client-version': clientVersion, 'x-goog-visitor-id': visitorData,
             'origin': 'https://www.youtube.com', 'referer': `https://www.youtube.com/embed/${id}?html5=1` },
  body: JSON.stringify(body)
});
const j = await r.json();
const sd = j.streamingData ?? {};
const audio = (sd.adaptiveFormats ?? []).filter(f => f.mimeType?.startsWith('audio/'));
console.log('http', r.status, '| playability', j.playabilityStatus?.status, j.playabilityStatus?.reason ?? '');
console.log('adaptive', (sd.adaptiveFormats??[]).length, '| audio', audio.length, '| sabr?', !!sd.serverAbrStreamingUrl);
const f = audio.find(x => x.itag === 140) ?? audio[0];
if (f) console.log('itag', f.itag, '| url?', !!f.url, '| signatureCipher?', !!f.signatureCipher,
                   '| boyut', (Number(f.contentLength)/1048576).toFixed(2)+'MB');
if (f?.signatureCipher) console.log('cipher alanları:', [...new URLSearchParams(f.signatureCipher).keys()].join(','));
if (f?.url) console.log('n param?', new URL(f.url).searchParams.has('n'));
console.log('toplam', ((performance.now()-t0)/1000).toFixed(2)+'s');
