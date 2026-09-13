// Mobil `src/lib/spotify.ts` ile aynı ayrıştırma — kütüphaneye yazmadan doğrular.
const id = process.argv[2] ?? "37i9dQZF1DXcBWIGoYBM5M";
const res = await fetch(`https://open.spotify.com/embed/playlist/${id}`, { headers: { "user-agent": "Mozilla/5.0 (Resonance)" } });
console.log("HTTP", res.status);
const html = await res.text();
const marker = '<script id="__NEXT_DATA__" type="application/json">';
const start = html.indexOf(marker);
if (start < 0) { console.log("__NEXT_DATA__ YOK"); process.exit(1); }
const body = html.slice(start + marker.length);
const json = JSON.parse(body.slice(0, body.indexOf("</script>")));
const entity = json?.props?.pageProps?.state?.data?.entity;
const tracks = (entity?.trackList ?? []).map((t) => ({ title: String(t?.title ?? "").trim(), artist: String(t?.subtitle ?? "").replace(/ /g, " ").split(",")[0].trim() })).filter((t) => t.title);
console.log("liste:", entity?.name, "| şarkı:", tracks.length);
console.log("ilk 3:", tracks.slice(0, 3).map((t) => `${t.artist} — ${t.title}`).join(" | "));
