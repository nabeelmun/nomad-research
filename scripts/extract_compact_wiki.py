import os
import sys
import sqlite3
import time

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
SRC_DB = os.path.join(DATA_DIR, "wiki.db")
DEST_DB = os.path.join(DATA_DIR, "wiki_core.db")

# Top 120,000 most-read Wikipedia articles (~4.5 - 5 GB)
TOP_ARTICLES_LIMIT = 120000 

def extract_compact_corpus(src_path, dest_path, limit):
    if not os.path.exists(src_path):
        print(f"Source database not found at {src_path}.")
        return

    print(f"Opening source database: {src_path}...")
    src_conn = sqlite3.connect(src_path)
    src_cursor = src_conn.cursor()

    if os.path.exists(dest_path):
        print(f"Removing existing {dest_path}...")
        os.remove(dest_path)

    print(f"Creating compact database: {dest_path}...")
    dest_conn = sqlite3.connect(dest_path)
    dest_cursor = dest_conn.cursor()

    # High performance pragmas for fast bulk creation
    dest_cursor.execute("PRAGMA journal_mode = OFF;")
    dest_cursor.execute("PRAGMA synchronous = 0;")
    dest_cursor.execute("PRAGMA cache_size = 100000;")

    # Exact matching schema from wiki.db
    dest_cursor.executescript("""
        CREATE TABLE meta (key TEXT PRIMARY KEY, val TEXT);
        CREATE TABLE blocks (id INTEGER PRIMARY KEY, zdata BLOB NOT NULL);
        CREATE TABLE articles (
            id INTEGER PRIMARY KEY,
            title TEXT NOT NULL,
            views INTEGER NOT NULL,
            block_id INTEGER NOT NULL,
            off INTEGER NOT NULL,
            len INTEGER NOT NULL
        );
        CREATE TABLE chunks (
            id INTEGER PRIMARY KEY,
            article_id INTEGER NOT NULL,
            start INTEGER NOT NULL,
            end INTEGER NOT NULL
        );
        CREATE TABLE redirects (title TEXT, article_id INTEGER);
        CREATE INDEX idx_articles_views ON articles(views DESC);
        CREATE INDEX idx_articles_title ON articles(title);
        CREATE INDEX idx_redirects_title ON redirects(title);
    """)

    print(f"Selecting top {limit:,} articles by pageviews...")
    t0 = time.time()
    top_articles = src_cursor.execute("""
        SELECT id, title, views, block_id, off, len 
        FROM articles 
        ORDER BY views DESC 
        LIMIT ?;
    """, (limit,)).fetchall()
    print(f"Selected {len(top_articles):,} articles in {time.time() - t0:.1f}s.")

    print("Inserting articles into compact database...")
    dest_cursor.executemany("""
        INSERT INTO articles (id, title, views, block_id, off, len)
        VALUES (?, ?, ?, ?, ?, ?);
    """, top_articles)
    dest_conn.commit()

    article_ids = set(a[0] for a in top_articles)
    block_ids = set(a[3] for a in top_articles)
    print(f"Total distinct compressed data blocks required: {len(block_ids):,}")

    # Copy required blocks
    print("Copying compressed text blocks...")
    block_list = list(block_ids)
    BATCH_SIZE = 1000
    for i in range(0, len(block_list), BATCH_SIZE):
        batch = block_list[i:i+BATCH_SIZE]
        placeholders = ",".join("?" * len(batch))
        rows = src_cursor.execute(f"SELECT id, zdata FROM blocks WHERE id IN ({placeholders})", batch).fetchall()
        dest_cursor.executemany("INSERT INTO blocks (id, zdata) VALUES (?, ?);", rows)
        if i % 10000 == 0 and i > 0:
            print(f"  Copied {i:,} / {len(block_list):,} blocks...")
    dest_conn.commit()

    # Copy chunks for these articles
    print("Copying chunks for selected articles...")
    art_list = list(article_ids)
    for i in range(0, len(art_list), BATCH_SIZE):
        batch = art_list[i:i+BATCH_SIZE]
        placeholders = ",".join("?" * len(batch))
        rows = src_cursor.execute(f"SELECT id, article_id, start, end FROM chunks WHERE article_id IN ({placeholders})", batch).fetchall()
        dest_cursor.executemany("INSERT INTO chunks (id, article_id, start, end) VALUES (?, ?, ?, ?);", rows)
        if i % 20000 == 0 and i > 0:
            print(f"  Copied chunks for {i:,} / {len(art_list):,} articles...")
    dest_conn.commit()

    # Copy redirects for selected articles
    print("Copying redirects for selected articles...")
    for i in range(0, len(art_list), BATCH_SIZE):
        batch = art_list[i:i+BATCH_SIZE]
        placeholders = ",".join("?" * len(batch))
        rows = src_cursor.execute(f"SELECT title, article_id FROM redirects WHERE article_id IN ({placeholders})", batch).fetchall()
        dest_cursor.executemany("INSERT INTO redirects (title, article_id) VALUES (?, ?);", rows)
    dest_conn.commit()

    dest_cursor.execute("""
        INSERT INTO meta (key, val) VALUES 
        ('dataset', 'English Wikipedia Core Top 120k'),
        ('source', 'FineWiki August 2025 extraction'),
        ('articles_count', ?);
    """, (str(len(top_articles)),))
    dest_conn.commit()

    src_conn.close()
    dest_conn.close()

    dest_size_gb = os.path.getsize(dest_path) / (1024**3)
    print(f"\nExtraction complete! Final size of wiki_core.db: {dest_size_gb:.2f} GB")

if __name__ == "__main__":
    extract_compact_corpus(SRC_DB, DEST_DB, TOP_ARTICLES_LIMIT)
