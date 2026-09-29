import sqlite3
import os
import time

SRC_DB = "data/wiki.db"
DEST_DB = "data/wiki_core.db"

print("Connecting to databases...")
t0 = time.time()
src_conn = sqlite3.connect(SRC_DB)
dest_conn = sqlite3.connect(DEST_DB)

dest_cursor = dest_conn.cursor()
src_cursor = src_conn.cursor()

# Get the set of article IDs in dest_db
print("Reading article IDs from wiki_core.db...")
article_ids = set(r[0] for r in dest_cursor.execute("SELECT id FROM articles").fetchall())
print(f"Loaded {len(article_ids):,} article IDs in {time.time() - t0:.1f}s.")

# Stream redirects from wiki.db and insert matching ones
print("Streaming redirects in single pass...")
t1 = time.time()
matching_redirects = []
count = 0
BATCH_SIZE = 50000

dest_cursor.execute("PRAGMA synchronous = 0;")
dest_cursor.execute("PRAGMA journal_mode = OFF;")

for title, article_id in src_cursor.execute("SELECT title, article_id FROM redirects"):
    count += 1
    if count % 2000000 == 0:
        print(f"  Scanned {count:,} / 10,430,971 redirects...")
    if article_id in article_ids:
        matching_redirects.append((title, article_id))
        if len(matching_redirects) >= BATCH_SIZE:
            dest_cursor.executemany("INSERT INTO redirects (title, article_id) VALUES (?, ?);", matching_redirects)
            matching_redirects.clear()

if matching_redirects:
    dest_cursor.executemany("INSERT INTO redirects (title, article_id) VALUES (?, ?);", matching_redirects)
    matching_redirects.clear()

dest_conn.commit()
print(f"Copied matching redirects in {time.time() - t1:.1f}s.")

# Insert metadata
dest_cursor.execute("""
    INSERT OR REPLACE INTO meta (key, val) VALUES 
    ('dataset', 'English Wikipedia Core Top 120k'),
    ('source', 'FineWiki August 2025 extraction'),
    ('articles_count', '120000');
""")
dest_conn.commit()

# Create indexes
print("Creating indexes on wiki_core.db...")
t2 = time.time()
dest_cursor.executescript("""
    CREATE INDEX IF NOT EXISTS idx_articles_views ON articles(views DESC);
    CREATE INDEX IF NOT EXISTS idx_articles_title ON articles(title COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_redirects_title ON redirects(title COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_chunks_article ON chunks(article_id);
""")
dest_conn.commit()
print(f"Indexes created in {time.time() - t2:.1f}s.")

src_conn.close()
dest_conn.close()

size_gb = os.path.getsize(DEST_DB) / (1024**3)
print(f"\nSUCCESS! wiki_core.db is finalized. Total size: {size_gb:.2f} GB")
