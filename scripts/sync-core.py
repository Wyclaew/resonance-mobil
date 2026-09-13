#!/usr/bin/env python3
"""Masaüstündeki PLATFORMDAN BAĞIMSIZ TS dosyalarını mobile kopyalar.

Neden kopya (monorepo değil): mobil ayrı bir depo. Sapmayı görebilmek için
kopyalar BİREBİR aynı kalır — mobil tarafta düzenleme YAPMA, masaüstünde düzelt
ve bu betiği yeniden çalıştır.

Numara: mobil, masaüstüyle AYNI modül yollarını (`./db`, `./device`,
`../store/useSettingsStore`, `@tauri-apps/api/core`) kendi uygulamalarıyla
sağlar → kopyalanan dosyalar TEK SATIR değişmeden çalışır.

Kullanım:  python3 scripts/sync-core.py [--check] [/yol/Resonance]
"""
import sys, pathlib, hashlib

FILES = [
    "types.ts",
    "lib/karma.ts", "lib/share.ts", "lib/filters.ts", "lib/mood.ts",
    "lib/taste.ts", "lib/acceptance.ts", "lib/smartLists.ts",
    "lib/prefs.ts", "lib/blocked.ts", "lib/graph.ts", "lib/tags.ts",
    "lib/nowPlaying.ts", "lib/deviceQueue.ts", "lib/recommender.ts",
    "lib/i18n.ts",
    "lib/sync/engine.ts", "lib/sync/client.ts",
    "lib/settings.ts", "lib/playlists.ts", "lib/history.ts", "lib/format.ts",
    "lib/vote.ts", "lib/lyrics.ts", "lib/smartLists.ts", "lib/loudness.ts",
    "store/useSettingsStore.ts", "store/useToastStore.ts",
]

BANNER = (
    "// ⚠️ MASAÜSTÜNDEN KOPYALANDI — mobil tarafta DÜZENLEME.\n"
    "// Kaynak: Resonance/src/{rel}  ·  Yeniden kopyala: python3 scripts/sync-core.py\n"
)

def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    check = "--check" in sys.argv
    desktop = pathlib.Path(args[0] if args else pathlib.Path.home() / "Desktop/Resonance") / "src"
    target = pathlib.Path(__file__).resolve().parent.parent / "mobile/src"

    drift, copied = [], 0
    for rel in FILES:
        src = desktop / rel
        if not src.exists():
            print(f"⚠️  kaynak yok: {src}")
            continue
        body = BANNER.format(rel=rel) + src.read_text()
        dst = target / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        if dst.exists() and hashlib.sha1(dst.read_bytes()).digest() == hashlib.sha1(body.encode()).digest():
            continue
        if check:
            drift.append(rel)
        else:
            dst.write_text(body)
            copied += 1

    if check:
        if drift:
            print("SAPMA VAR:\n  " + "\n  ".join(drift))
            return 1
        print("çekirdek dosyalar masaüstüyle aynı ✅")
        return 0
    print(f"{copied} dosya kopyalandı ({len(FILES)} izleniyor)")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
