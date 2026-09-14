import org.schabi.newpipe.extractor.InfoItem;
import org.schabi.newpipe.extractor.NewPipe;
import org.schabi.newpipe.extractor.ServiceList;
import org.schabi.newpipe.extractor.search.SearchExtractor;
import org.schabi.newpipe.extractor.stream.StreamExtractor;
import org.schabi.newpipe.extractor.stream.StreamInfoItem;

import java.util.List;

/**
 * Alternatif kaynak teşhisi (kullanıcı raporu 2026-09-14): "Midnight City" hem orijinalde
 * hem ilk alternatifte LOGIN_REQUIRED. Bir sorgunun TÜM arama adaylarını (YT Music
 * şarkıları + videolar) çözer, hangisinin çalınabildiğini yazar. Ölçüm: M83'ün YT Music
 * kayıtları (Midnight City, Outro, Wait) oturum istiyor; resmi video + söz videoları OK.
 * Çalıştırma: gradle -q run -PmainClass=AltProbe --args="M83 Midnight City"
 */
public class AltProbe {
    public static void main(String[] args) throws Exception {
        NewPipe.init(new Spike.Dl());
        String query = String.join(" ", args);
        for (String filter : List.of("music_songs", "videos")) {
            System.out.printf("%n### %s — %s%n", filter, query);
            SearchExtractor s = ServiceList.YouTube.getSearchExtractor(query, List.of(filter), "");
            s.fetchPage();
            int n = 0;
            for (InfoItem item : s.getInitialPage().getItems()) {
                if (!(item instanceof StreamInfoItem si) || n++ >= 8) continue;
                String url = si.getUrl();
                String id = url.replaceAll(".*[?&]v=([A-Za-z0-9_-]{11}).*", "$1");
                String verdict;
                long t0 = System.nanoTime();
                try {
                    StreamExtractor e = ServiceList.YouTube.getStreamExtractor("https://www.youtube.com/watch?v=" + id);
                    e.fetchPage();
                    long audio = e.getAudioStreams().stream().filter(a -> a.getContent() != null && !a.getContent().isEmpty()).count();
                    verdict = "OK " + audio + " audio";
                } catch (Exception ex) {
                    String m = String.valueOf(ex.getMessage());
                    verdict = "FAIL " + ex.getClass().getSimpleName() + ": " + m.substring(0, Math.min(70, m.length()));
                }
                System.out.printf("  %s %4ds %-28s %-40s %s (%.1fs)%n", id, si.getDuration(),
                        trim(si.getUploaderName(), 28), trim(si.getName(), 40), verdict, (System.nanoTime() - t0) / 1e9);
            }
        }
    }

    static String trim(String s, int n) {
        s = s == null ? "" : s;
        return s.length() > n ? s.substring(0, n) : s;
    }
}
