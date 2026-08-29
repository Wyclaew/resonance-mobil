#!/usr/bin/env python3
"""Masaüstünün lib.rs migration'larını mobil için TS'e çevirir.

Şema TEK KAYNAKTAN gelir (masaüstü). Elle kopyalama = sapma = senkron bozulması.
Kullanım:  python3 scripts/gen-migrations.py [/yol/Resonance]
"""
import re, sys, pathlib

desktop = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else pathlib.Path.home() / "Desktop/Resonance")
src = (desktop / "src-tauri/src/lib.rs").read_text()
start = src.index("vec![Migration {")
end = src.index("\n    ]", start)
block = src[start:end]

pat = re.compile(
    r"version:\s*(\d+),\s*description:\s*\"([^\"]+)\",\s*kind:\s*MigrationKind::Up,\s*"
    r"(?://[^\n]*\n\s*)*sql:\s*(r#\"(?P<raw>.*?)\"#|\"(?P<plain>(?:[^\"\\]|\\.)*)\")",
    re.S)

out = ['// ⚠️ OTOMATİK ÜRETİLDİ — elle düzenleme. Kaynak: masaüstü `src-tauri/src/lib.rs`.',
       '// Yeniden üret: python3 scripts/gen-migrations.py',
       '// Şema masaüstüyle BİREBİR aynı olmalı; senkron (docs/SYNC.md) buna dayanır.',
       '',
       'export interface Migration { version: number; description: string; sql: string }',
       '',
       'export const MIGRATIONS: Migration[] = [']
count = 0
for m in pat.finditer(block):
    ver, desc = m.group(1), m.group(2)
    sql = m.group('raw') if m.group('raw') is not None else m.group('plain').encode().decode('unicode_escape')
    sql = "\n".join(l.rstrip() for l in sql.strip("\n").split("\n"))
    esc = sql.replace("\\", "\\\\").replace("`", "\\`").replace("${", "\\${")
    out.append('  {\n    version: %d,\n    description: "%s",\n    sql: `\n%s\n`,\n  },' % (int(ver), desc, esc))
    count += 1
out.append('];')
out.append('')
out.append(f'export const LATEST_VERSION = {count};')
out.append('')
target = pathlib.Path(__file__).resolve().parent.parent / "mobile/src/db/migrations.ts"
target.write_text("\n".join(out))
print(f"{count} migration → {target}")
