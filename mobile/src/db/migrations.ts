// ⚠️ OTOMATİK ÜRETİLDİ — elle düzenleme. Kaynak: masaüstü `src-tauri/src/lib.rs`.
// Yeniden üret: python3 scripts/gen-migrations.py
// Şema masaüstüyle BİREBİR aynı olmalı; senkron (docs/SYNC.md) buna dayanır.

export interface Migration { version: number; description: string; sql: string }

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: "create_initial_schema",
    sql: `
            CREATE TABLE IF NOT EXISTS tracks (
                id          TEXT PRIMARY KEY,       -- "source:source_id"
                source      TEXT NOT NULL,          -- 'youtube' | 'local'
                source_id   TEXT NOT NULL,
                title       TEXT NOT NULL,
                artist      TEXT NOT NULL DEFAULT '',
                album       TEXT,
                duration_ms INTEGER NOT NULL DEFAULT 0,
                thumbnail   TEXT,
                added_at    INTEGER NOT NULL        -- epoch ms
            );

            CREATE TABLE IF NOT EXISTS playlists (
                id          TEXT PRIMARY KEY,
                name        TEXT NOT NULL,
                description TEXT,
                source      TEXT NOT NULL DEFAULT 'local', -- 'local' | 'spotify' | 'ytmusic'
                source_url  TEXT,
                created_at  INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS playlist_tracks (
                playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
                track_id    TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
                position    INTEGER NOT NULL DEFAULT 0,
                added_at    INTEGER NOT NULL,
                PRIMARY KEY (playlist_id, track_id)
            );
            CREATE INDEX IF NOT EXISTS idx_pt_playlist ON playlist_tracks(playlist_id, position);

            -- Oy olay günlüğü: öğrenen algoritmanın ve karma decay'in kaynağı.
            -- Her oy aksiyonu (zaman bağlamıyla) buraya eklenir.
            CREATE TABLE IF NOT EXISTS votes (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                track_id    TEXT NOT NULL,
                playlist_id TEXT,
                value       INTEGER NOT NULL,       -- -1 | 0 | +1
                created_at  INTEGER NOT NULL,       -- epoch ms
                hour        INTEGER NOT NULL,       -- 0..23 (yerel)
                dow         INTEGER NOT NULL         -- 0..6 (0=Pazar)
            );
            CREATE INDEX IF NOT EXISTS idx_votes_track ON votes(track_id);
            CREATE INDEX IF NOT EXISTS idx_votes_ctx ON votes(hour, dow);
            CREATE INDEX IF NOT EXISTS idx_votes_pt ON votes(playlist_id, track_id);

            -- Oynatma geçmişi: bağlamsal öğrenme için (ne zaman ne dinlendi).
            CREATE TABLE IF NOT EXISTS play_history (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                track_id  TEXT NOT NULL,
                played_at INTEGER NOT NULL,
                ms_played INTEGER NOT NULL DEFAULT 0,
                hour      INTEGER NOT NULL,
                dow       INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_hist_track ON play_history(track_id);
            CREATE INDEX IF NOT EXISTS idx_hist_ctx ON play_history(hour, dow);

            -- İndirilmiş/önbelleğe alınmış ses dosyaları (hibrit mod).
            CREATE TABLE IF NOT EXISTS cache (
                track_id    TEXT PRIMARY KEY REFERENCES tracks(id) ON DELETE CASCADE,
                file_path   TEXT NOT NULL,
                bytes       INTEGER NOT NULL DEFAULT 0,
                format      TEXT,
                last_played INTEGER
            );

            CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY,
                value TEXT
            );

`,
  },
  {
    version: 2,
    description: "add_downloaded_flag",
    sql: `
ALTER TABLE cache ADD COLUMN downloaded INTEGER NOT NULL DEFAULT 0;
`,
  },
  {
    version: 3,
    description: "add_current_vote",
    sql: `
ALTER TABLE playlist_tracks ADD COLUMN vote INTEGER NOT NULL DEFAULT 0;
`,
  },
  {
    version: 4,
    description: "add_recommendation_history",
    sql: `
CREATE TABLE IF NOT EXISTS recommendation_history (
                    id             INTEGER PRIMARY KEY AUTOINCREMENT,
                    track_id       TEXT NOT NULL,
                    recommended_at INTEGER NOT NULL
                  );
                  CREATE INDEX IF NOT EXISTS idx_rechist_track ON recommendation_history(track_id);
                  CREATE INDEX IF NOT EXISTS idx_rechist_at ON recommendation_history(recommended_at);
`,
  },
  {
    version: 5,
    description: "sync_scaffolding",
    sql: `
                ALTER TABLE playlists       ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
                ALTER TABLE playlists       ADD COLUMN deleted    INTEGER NOT NULL DEFAULT 0;
                ALTER TABLE playlist_tracks ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
                ALTER TABLE playlist_tracks ADD COLUMN deleted    INTEGER NOT NULL DEFAULT 0;
                ALTER TABLE tracks          ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;

                UPDATE playlists       SET updated_at = created_at WHERE updated_at = 0;
                UPDATE playlist_tracks SET updated_at = added_at   WHERE updated_at = 0;
                UPDATE tracks          SET updated_at = added_at   WHERE updated_at = 0;

                -- Olay günlükleri append-only'dir AMA \`undoVote\` bir oyu geri alır.
                -- Bu da tombstone olmalı (hard delete senkronda "hiç olmadı"ya
                -- eşittir → oy diğer cihazdan geri gelir). Tombstone \`created_at\`i
                -- değiştirmediği için push penceresi onu göremez → üç tabloya da
                -- ayrı \`updated_at\` gerekir (tek tip motor, tek kod yolu).
                ALTER TABLE votes                  ADD COLUMN uid        TEXT;
                ALTER TABLE votes                  ADD COLUMN device_id  TEXT;
                ALTER TABLE votes                  ADD COLUMN deleted    INTEGER NOT NULL DEFAULT 0;
                ALTER TABLE votes                  ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
                ALTER TABLE play_history           ADD COLUMN uid        TEXT;
                ALTER TABLE play_history           ADD COLUMN device_id  TEXT;
                ALTER TABLE play_history           ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
                ALTER TABLE recommendation_history ADD COLUMN uid        TEXT;
                ALTER TABLE recommendation_history ADD COLUMN device_id  TEXT;
                ALTER TABLE recommendation_history ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;

                UPDATE votes                  SET uid = lower(hex(randomblob(16))) WHERE uid IS NULL;
                UPDATE play_history           SET uid = lower(hex(randomblob(16))) WHERE uid IS NULL;
                UPDATE recommendation_history SET uid = lower(hex(randomblob(16))) WHERE uid IS NULL;

                UPDATE votes                  SET updated_at = created_at     WHERE updated_at = 0;
                UPDATE play_history           SET updated_at = played_at      WHERE updated_at = 0;
                UPDATE recommendation_history SET updated_at = recommended_at WHERE updated_at = 0;

                CREATE UNIQUE INDEX IF NOT EXISTS idx_votes_uid   ON votes(uid);
                CREATE UNIQUE INDEX IF NOT EXISTS idx_hist_uid    ON play_history(uid);
                CREATE UNIQUE INDEX IF NOT EXISTS idx_rechist_uid ON recommendation_history(uid);

                -- Push sorgusu "updated_at > watermark" ile tarar → indeks şart.
                CREATE INDEX IF NOT EXISTS idx_playlists_upd ON playlists(updated_at);
                CREATE INDEX IF NOT EXISTS idx_pt_upd        ON playlist_tracks(updated_at);
                CREATE INDEX IF NOT EXISTS idx_tracks_upd    ON tracks(updated_at);
                CREATE INDEX IF NOT EXISTS idx_votes_upd     ON votes(updated_at);
                CREATE INDEX IF NOT EXISTS idx_hist_upd      ON play_history(updated_at);
                CREATE INDEX IF NOT EXISTS idx_rechist_upd   ON recommendation_history(updated_at);

                CREATE TABLE IF NOT EXISTS sync_state (
                    table_name  TEXT PRIMARY KEY,
                    last_pulled TEXT    NOT NULL DEFAULT '',  -- sunucu synced_at (ISO)
                    last_pushed INTEGER NOT NULL DEFAULT 0    -- yerel updated_at (epoch ms)
                );

`,
  },
  {
    version: 6,
    description: "now_playing",
    sql: `
CREATE TABLE IF NOT EXISTS now_playing (
                    device_id   TEXT PRIMARY KEY,
                    device_name TEXT,
                    track_id    TEXT,
                    source_id   TEXT,
                    title       TEXT,
                    artist      TEXT,
                    thumbnail   TEXT,
                    duration_ms INTEGER NOT NULL DEFAULT 0,
                    position_ms INTEGER NOT NULL DEFAULT 0,
                    playing     INTEGER NOT NULL DEFAULT 0,
                    updated_at  INTEGER NOT NULL DEFAULT 0,
                    deleted     INTEGER NOT NULL DEFAULT 0
                  );
                  CREATE INDEX IF NOT EXISTS idx_np_upd ON now_playing(updated_at);
`,
  },
  {
    version: 7,
    description: "blocked_artists",
    sql: `
CREATE TABLE IF NOT EXISTS blocked_artists (
                    artist     TEXT PRIMARY KEY,   -- kÃ¼Ã§Ã¼k harf
                    created_at INTEGER NOT NULL DEFAULT 0,
                    updated_at INTEGER NOT NULL DEFAULT 0,
                    deleted    INTEGER NOT NULL DEFAULT 0,
                    device_id  TEXT
                  );
                  CREATE INDEX IF NOT EXISTS idx_blocked_upd ON blocked_artists(updated_at);
`,
  },
  {
    version: 8,
    description: "taste_controls_graph_loudness",
    sql: `
CREATE TABLE IF NOT EXISTS artist_prefs (
                    artist     TEXT PRIMARY KEY,   -- küçük harf
                    weight     REAL NOT NULL DEFAULT 1,
                    created_at INTEGER NOT NULL DEFAULT 0,
                    updated_at INTEGER NOT NULL DEFAULT 0,
                    deleted    INTEGER NOT NULL DEFAULT 0,
                    device_id  TEXT
                  );
                  CREATE INDEX IF NOT EXISTS idx_prefs_upd ON artist_prefs(updated_at);

                  CREATE TABLE IF NOT EXISTS artist_edges (
                    seed       TEXT NOT NULL,      -- küçük harf
                    neighbor   TEXT NOT NULL,      -- küçük harf
                    weight     REAL NOT NULL DEFAULT 0,
                    sample_id  TEXT,               -- komşudan bir video kimliği
                    updated_at INTEGER NOT NULL DEFAULT 0,
                    PRIMARY KEY (seed, neighbor)
                  );
                  CREATE INDEX IF NOT EXISTS idx_edges_seed ON artist_edges(seed);
                  CREATE INDEX IF NOT EXISTS idx_edges_nb   ON artist_edges(neighbor);

                  -- ⭐ SANATÇI ETİKETLERİ: veritabanında TÜR ALANI YOK. Küratörlü
                  -- tür/ruh hali havuzu (music_genre_pool) çekildiğinde, o havuzda
                  -- görülen sanatçılara filtre kimliği etiket olarak yazılır.
                  -- Böylece "şu anki modun" satırı sanatçı adı yerine ANLAŞILIR
                  -- kelime gösterebilir ("sakin · rock"). Yerel: türetilmiş sayaç.
                  CREATE TABLE IF NOT EXISTS artist_tags (
                    artist     TEXT NOT NULL,      -- küçük harf
                    tag        TEXT NOT NULL,      -- lib/filters.ts kimliği
                    weight     REAL NOT NULL DEFAULT 0,
                    updated_at INTEGER NOT NULL DEFAULT 0,
                    PRIMARY KEY (artist, tag)
                  );
                  CREATE INDEX IF NOT EXISTS idx_tags_artist ON artist_tags(artist);

                  -- ⭐ SEÇMELİ AYAR SENKRONU (v1.8.0): \`settings\` bugüne kadar
                  -- HİÇ senkronlanmıyordu, çünkü içinde cihaza özel şeyler var
                  -- (resumeState, avatar, ses seviyesi). Ama kullanıcı tema/dil/
                  -- öneri ayarlarının cihazlar arası aynı olmasını istiyor.
                  -- Çözüm: tabloya senkron alanları eklenir, BEYAZ LİSTEDEKİ
                  -- anahtarlar taşınır (bkz. SYNCED_SETTING_KEYS, engine.ts).
                  ALTER TABLE settings ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
                  ALTER TABLE settings ADD COLUMN deleted    INTEGER NOT NULL DEFAULT 0;
                  ALTER TABLE settings ADD COLUMN device_id  TEXT;

                  -- ⭐ CİHAZLAR ARASI KUYRUK (v1.8.0). now_playing yalnız TEK
                  -- parçayı taşıyordu; kullanıcı "Windows'taki Keşfet kuyruğu
                  -- Mac'e gelmedi, yeni keşif açtı" dedi. Kuyruğun kendisi
                  -- \`settings.resumeState\` içindeydi ve settings senkronlanmıyordu.
                  -- Cihaz başına satır → çakışma yok (now_playing ile aynı desen).
                  CREATE TABLE IF NOT EXISTS device_queue (
                    device_id    TEXT PRIMARY KEY,
                    device_name  TEXT,
                    mode         TEXT,     -- 'discovery' | 'normal'
                    playlist_id  TEXT,
                    queue_json   TEXT NOT NULL DEFAULT '',
                    queue_index  INTEGER NOT NULL DEFAULT 0,
                    position_ms  INTEGER NOT NULL DEFAULT 0,
                    filters_json TEXT,
                    seeds_json   TEXT,
                    updated_at   INTEGER NOT NULL DEFAULT 0,
                    deleted      INTEGER NOT NULL DEFAULT 0
                  );
                  CREATE INDEX IF NOT EXISTS idx_dq_upd ON device_queue(updated_at);

                  CREATE TABLE IF NOT EXISTS track_loudness (
                    track_id    TEXT PRIMARY KEY,
                    lufs        REAL NOT NULL,
                    peak_db     REAL NOT NULL,
                    measured_at INTEGER NOT NULL DEFAULT 0
                  );
`,
  },
  {
    version: 9,
    description: "playlist_folders",
    sql: `
ALTER TABLE playlists ADD COLUMN folder TEXT;
`,
  },
];

export const LATEST_VERSION = 9;
