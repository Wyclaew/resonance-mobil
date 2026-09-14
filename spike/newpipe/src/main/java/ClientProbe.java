import com.grack.nanojson.JsonObject;
import org.schabi.newpipe.extractor.NewPipe;
import org.schabi.newpipe.extractor.ServiceList;
import org.schabi.newpipe.extractor.localization.ContentCountry;
import org.schabi.newpipe.extractor.localization.Localization;
import org.schabi.newpipe.extractor.services.youtube.YoutubeStreamHelper;
import org.schabi.newpipe.extractor.services.youtube.extractors.YoutubeStreamExtractor;
import org.schabi.newpipe.extractor.stream.StreamExtractor;

import java.util.concurrent.Callable;

/**
 * LOGIN_REQUIRED teşhisi: aynı videoyu her InnerTube istemcisi mi reddediyor, yoksa
 * yalnız çıkarıcının kullandığı mı? İstemci başına playabilityStatus + akış sayısı.
 * Sonuç (2026-09-14, K8v_DaCcORQ): android-reel / ios / visionos LOGIN_REQUIRED,
 * gömülü "kullanılamıyor" — oturumsuz aşılamaz. Resmi video (dX3k_QDnzHE) hepsinde OK.
 * Çalıştırma: gradle -q run -PmainClass=ClientProbe --args="K8v_DaCcORQ dX3k_QDnzHE"
 */
public class ClientProbe {
    static String verdict(JsonObject r) {
        JsonObject ps = r.getObject("playabilityStatus");
        JsonObject sd = r.getObject("streamingData");
        int adaptive = sd.getArray("adaptiveFormats").size();
        long withUrl = sd.getArray("adaptiveFormats").stream()
                .filter(o -> o instanceof JsonObject j && j.has("url")).count();
        return ps.getString("status", "?") + " \"" + ps.getString("reason", "") + "\" adaptive=" + adaptive + " url=" + withUrl;
    }

    static void run(String label, Callable<String> c) {
        try {
            System.out.printf("  %-14s %s%n", label, c.call());
        } catch (Exception e) {
            String m = String.valueOf(e.getMessage());
            System.out.printf("  %-14s EXC %s: %s%n", label, e.getClass().getSimpleName(), m.substring(0, Math.min(90, m.length())));
        }
    }

    public static void main(String[] args) {
        NewPipe.init(new Spike.Dl());
        Localization loc = new Localization("tr", "TR");
        ContentCountry cc = new ContentCountry("TR");
        String cpn = "AbCdEfGhIjKlMnOp";
        for (String id : args) {
            System.out.printf("%n== %s%n", id);
            run("web-meta", () -> verdict(YoutubeStreamHelper.getWebMetadataPlayerResponse(loc, cc, id)));
            run("android", () -> verdict(YoutubeStreamHelper.getAndroidPlayerResponse(cc, loc, id, cpn, null)));
            run("android-reel", () -> verdict(YoutubeStreamHelper.getAndroidReelPlayerResponse(cc, loc, id, cpn)));
            run("ios", () -> verdict(YoutubeStreamHelper.getIosPlayerResponse(cc, loc, id, cpn, null)));
            run("visionos", () -> verdict(YoutubeStreamHelper.getVisionOsPlayerResponse(cc, loc, id, cpn)));
            run("web-embedded", () -> verdict(YoutubeStreamHelper.getWebEmbeddedPlayerResponse(loc, cc, id, cpn, null, 0)));
            for (boolean ios : new boolean[]{false, true}) {
                run("extractor ios=" + ios, () -> {
                    YoutubeStreamExtractor.setFetchIosClient(ios);
                    StreamExtractor e = ServiceList.YouTube.getStreamExtractor("https://www.youtube.com/watch?v=" + id);
                    e.fetchPage();
                    return "OK audio=" + e.getAudioStreams().size();
                });
            }
            YoutubeStreamExtractor.setFetchIosClient(false);
        }
    }
}
