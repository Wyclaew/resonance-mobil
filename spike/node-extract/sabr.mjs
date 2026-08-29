// Faz 0 / deney 3: SABR ile ses indirilebiliyor mu? (PO token + googlevideo)
import { JSDOM } from 'jsdom';
import { Innertube } from 'youtubei.js';
import { BotGuardClient, getChallenge } from 'bgutils-js/botguard';
import { WebPoMinter } from 'bgutils-js/webpo';
import { buildURL, GOOG_API_KEY, USER_AGENT } from 'bgutils-js/utils';
import { SabrStream } from 'googlevideo/sabr-stream';
import { writeFileSync } from 'node:fs';

const id = process.argv[2] ?? 'rtL5oMyBHPs';
const REQUEST_KEY = 'O43z0dpjhgX20SCx4KAo';
const T = performance.now(); const el = (t) => `${((performance.now()-t)/1000).toFixed(2)}s`;

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url:'https://www.youtube.com/', referrer:'https://www.youtube.com/', userAgent: USER_AGENT, pretendToBeVisual:true });
for (const [k,v] of Object.entries({ window:dom.window, document:dom.window.document, location:dom.window.location, origin:dom.window.origin, navigator:dom.window.navigator, self:dom.window }))
  { try { Object.defineProperty(globalThis,k,{value:v,configurable:true,writable:true}); } catch {} }

const yt0 = await Innertube.create({ retrieve_player:false });
const visitorData = yt0.session.context.client.visitorData;
const tp = performance.now();
const challenge = await getChallenge({ requestKey: REQUEST_KEY, fetchFunction:(...a)=>fetch(...a), useYouTubeAPI:true });
new Function(challenge.interpreterJavascript.privateDoNotAccessOrElseSafeScriptWrappedValue)();
const bg = await BotGuardClient.create({ program: challenge.program, globalName: challenge.globalName, globalObject: globalThis });
const webPoSignalOutput = [];
const botguardResponse = await bg.snapshot({ webPoSignalOutput });
const itRes = await fetch(buildURL('GenerateIT', true), { method:'POST', headers:{'content-type':'application/json+protobuf','x-goog-api-key':GOOG_API_KEY,'x-user-agent':'grpc-web-javascript/0.1'}, body: JSON.stringify([REQUEST_KEY, botguardResponse]) });
const [integrityToken, estimatedTtlSecs, mintRefreshThreshold, websafeFallbackToken] = await itRes.json();
const minter = await WebPoMinter.create({ integrityToken, estimatedTtlSecs, mintRefreshThreshold, websafeFallbackToken }, webPoSignalOutput);
const sessionPo = await minter.mintAsWebsafeString(visitorData);
console.log('PO token hazır', el(tp));

const yt = await Innertube.create({ po_token: sessionPo, visitor_data: visitorData, retrieve_player: true });
const info = await yt.getInfo(id, 'WEB');
const sd = info.streaming_data;
const ustreamer = info.player_config?.media_common_config?.media_ustreamer_request_config?.video_playback_ustreamer_config;
console.log('sabr url?', !!sd?.server_abr_streaming_url, '| ustreamer?', !!ustreamer, '| süre', info.basic_info.duration+'s');

const formats = (sd?.adaptive_formats ?? []).map(f => ({
  itag:f.itag, lastModified:f.last_modified_ms ?? '0', contentLength:Number(f.content_length ?? 0), mimeType:f.mime_type,
  bitrate:f.bitrate ?? 0, approxDurationMs:Number(f.approx_duration_ms ?? 0), audioQuality:f.audio_quality,
  width:f.width, height:f.height, xtags:f.xtags, isDrc:f.is_drc, quality:f.quality, averageBitrate:f.average_bitrate, language:f.language
}));
const stream = new SabrStream({
  fetch: (...a)=>fetch(...a),
  serverAbrStreamingUrl: sd.server_abr_streaming_url,
  videoPlaybackUstreamerConfig: ustreamer,
  poToken: sessionPo,
  durationMs: (info.basic_info.duration ?? 0) * 1000,
  formats,
  clientInfo: { clientName: 1, clientVersion: yt.session.context.client.clientVersion, osName:'Windows', osVersion:'10.0' }
});
const td = performance.now();
const { audioStream, selectedFormats } = await stream.start({
  audioFormat: (fs) => fs.filter(f=>f.mimeType?.startsWith('audio/')).sort((a,b)=>(b.bitrate??0)-(a.bitrate??0)).find(f=>f.itag===140) ?? fs.find(f=>f.mimeType?.startsWith('audio/')),

});
console.log('seçilen ses formatı:', selectedFormats?.audioFormat?.itag, selectedFormats?.audioFormat?.mimeType?.split(';')[0]);
const chunks=[]; let n=0;
for await (const c of audioStream) { chunks.push(c); n += c.length; }
console.log(`SABR indirme: ${(n/1048576).toFixed(2)}MB ${el(td)} → ${n>0?'✅':'❌'}`);
if (n) { writeFileSync('/tmp/sabr_track.m4a', Buffer.concat(chunks.map(Buffer.from))); console.log('yazıldı /tmp/sabr_track.m4a'); }
console.log('toplam', el(T));
