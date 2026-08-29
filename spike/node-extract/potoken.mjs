// Faz 0 / deney 2: PO Token üretilirse youtubei.js gerçek adres veriyor mu?
// Node + jsdom, MOBİLDE bunun karşılığı gizli bir WebView (gerçek tarayıcı motoru).
import { JSDOM } from 'jsdom';
import { Innertube } from 'youtubei.js';
import { BotGuardClient } from 'bgutils-js/botguard';
import { WebPoMinter } from 'bgutils-js/webpo';
import { getChallenge } from 'bgutils-js/botguard';
import { buildURL, GOOG_API_KEY, USER_AGENT } from 'bgutils-js/utils';

const id = process.argv[2] ?? 'rtL5oMyBHPs';
const REQUEST_KEY = 'O43z0dpjhgX20SCx4KAo';
const t0 = performance.now();
const el = (t) => `${((performance.now()-t)/1000).toFixed(2)}s`;

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'https://www.youtube.com/', referrer: 'https://www.youtube.com/', userAgent: USER_AGENT,
  pretendToBeVisual: true
});
for (const [k, v] of Object.entries({
  window: dom.window, document: dom.window.document, location: dom.window.location,
  origin: dom.window.origin, navigator: dom.window.navigator, self: dom.window
})) { try { Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true }); } catch { /* yoksay */ } }

const yt0 = await Innertube.create({ retrieve_player: false });
const visitorData = yt0.session.context.client.visitorData;

const tc = performance.now();
const challenge = await getChallenge({ requestKey: REQUEST_KEY, fetchFunction: (...a) => fetch(...a), useYouTubeAPI: true });
console.log('challenge alındı', el(tc), '| interpreter?', !!challenge.interpreterJavascript?.privateDoNotAccessOrElseSafeScriptWrappedValue);
const js = challenge.interpreterJavascript?.privateDoNotAccessOrElseSafeScriptWrappedValue;
if (!js) throw new Error('interpreter JS yok');
new Function(js)();   // ⚠️ Hermes'te ÇALIŞMAZ — WebView gerekmesinin sebebi bu satır.

const tb = performance.now();
const bg = await BotGuardClient.create({ program: challenge.program, globalName: challenge.globalName, globalObject: globalThis });
const webPoSignalOutput = [];
const botguardResponse = await bg.snapshot({ webPoSignalOutput });
console.log('botguard snapshot', el(tb));

const ti = performance.now();
const res = await fetch(buildURL('GenerateIT', true), {
  method: 'POST',
  headers: { 'content-type': 'application/json+protobuf', 'x-goog-api-key': GOOG_API_KEY, 'x-user-agent': 'grpc-web-javascript/0.1' },
  body: JSON.stringify([REQUEST_KEY, botguardResponse])
});
const [integrityToken, estimatedTtlSecs, mintRefreshThreshold, websafeFallbackToken] = await res.json();
const minter = await WebPoMinter.create({ integrityToken, estimatedTtlSecs, mintRefreshThreshold, websafeFallbackToken }, webPoSignalOutput);
const sessionPo = await minter.mintAsWebsafeString(visitorData);
const contentPo  = await minter.mintAsWebsafeString(id);
console.log('PO token üretildi', el(ti), '| ttl', estimatedTtlSecs + 's | session', sessionPo.slice(0, 18) + '…');

const yt = await Innertube.create({ po_token: sessionPo, visitor_data: visitorData, retrieve_player: true });
const info = await yt.getBasicInfo(id, 'WEB');
const ad = info.streaming_data?.adaptive_formats ?? [];
const audio = ad.filter(f => f.mime_type?.startsWith('audio/')).sort((a,b)=>(b.bitrate??0)-(a.bitrate??0));
const f = audio.find(x => x.itag === 140) ?? audio[0];
console.log('format', f?.itag, f?.mime_type?.split(';')[0], Math.round((f?.bitrate??0)/1000)+'k', ((f?.content_length??0)/1048576).toFixed(2)+'MB');
let url = await f.decipher(yt.session.player);
if (!url.includes('pot=')) url += `&pot=${contentPo}`;
const clen = Number(f.content_length);
const t3 = performance.now();
const full = await fetch(url);
const buf = full.status === 200 ? new Uint8Array(await full.arrayBuffer()) : new Uint8Array();
console.log(`TAM indirme: ${full.status} ${(buf.length/1048576).toFixed(2)}MB / ${(clen/1048576).toFixed(2)}MB ${el(t3)} ${buf.length>=clen?'✅ TAM':'❌ KESİK'}`);
console.log('toplam', el(t0));
