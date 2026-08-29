const id = process.argv[2] ?? 'rtL5oMyBHPs';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';
const html = await (await fetch(`https://www.youtube.com/embed/${id}?html5=1`, { headers: { 'user-agent': UA, 'accept-language':'en-US,en' } })).text();
const pick = (re) => (html.match(re) || [])[1];
console.log('embed sayfasında:',
  'ytInitialPlayerResponse?', html.includes('ytInitialPlayerResponse'),
  '| adaptiveFormats?', html.includes('adaptiveFormats'),
  '| signatureCipher?', html.includes('signatureCipher'),
  '| encryptedHostFlags?', html.includes('encryptedHostFlags'),
  '| embeddedPlayerEncryptedContext?', html.includes('embeddedPlayerEncryptedContext'));
const ehf = pick(/"encryptedHostFlags":"([^"]+)"/);
const epec = pick(/"embeddedPlayerEncryptedContext":"([^"]+)"/);
const cv = pick(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/);
const vd = pick(/"VISITOR_DATA":"([^"]+)"/);
const pj = pick(/"(?:PLAYER_JS_URL|jsUrl)":"([^"]+)"/);
console.log('encryptedHostFlags?', !!ehf, '| embeddedPlayerEncryptedContext?', !!epec);
const playerJs = await (await fetch('https://www.youtube.com'+pj,{headers:{'user-agent':UA}})).text();
const sts = Number((playerJs.match(/signatureTimestamp[:=](\d+)/)||[])[1]);
const body = {
  context: {
    client: { hl:'en', gl:'US', deviceMake:'', deviceModel:'', visitorData: vd, userAgent: UA+',gzip(gfe)',
      clientName:'WEB_EMBEDDED_PLAYER', clientVersion: cv, osName:'Windows', osVersion:'10.0',
      originalUrl:`https://www.youtube.com/embed/${id}?html5=1`, platform:'DESKTOP',
      clientFormFactor:'UNKNOWN_FORM_FACTOR', timeZone:'UTC', browserName:'Chrome', browserVersion:'146.0.0.0',
      acceptHeader:'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', utcOffsetMinutes:0 },
    user: { lockedSafetyMode:false }, request:{ useSsl:true },
    thirdParty: { ...(epec ? { embeddedPlayerContext: { embeddedPlayerEncryptedContext: epec, ancestorOriginsSupported:false } } : {}), embedUrl:'https://www.reddit.com/' }
  },
  videoId:id,
  playbackContext:{ contentPlaybackContext:{ html5Preference:'HTML5_PREF_WANTS', signatureTimestamp: sts, ...(ehf?{encryptedHostFlags:ehf}:{}) } },
  contentCheckOk:true, racyCheckOk:true
};
const r = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false',{method:'POST',
  headers:{'content-type':'application/json','user-agent':UA,'x-youtube-client-name':'56','x-youtube-client-version':cv,
           'origin':'https://www.youtube.com','referer':`https://www.youtube.com/embed/${id}?html5=1`},body:JSON.stringify(body)});
const j = await r.json(); const sd=j.streamingData??{};
const audio=(sd.adaptiveFormats??[]).filter(f=>f.mimeType?.startsWith('audio/'));
console.log('→ playability', j.playabilityStatus?.status, j.playabilityStatus?.reason??'', '| audio', audio.length, '| sabr?', !!sd.serverAbrStreamingUrl);
const f=audio.find(x=>x.itag===140)??audio[0];
if(f) console.log('itag',f.itag,'url?',!!f.url,'signatureCipher?',!!f.signatureCipher,(Number(f.contentLength)/1048576).toFixed(2)+'MB');
