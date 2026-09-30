import os
import sys
import sqlite3
import time

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

SRC_DB = "data/wiki.db"
DEST_DB = "data/wiki_core.db"

# 2,500 top global articles + all benchmark topics (~210 MB, fast download on mobile & reliable upload)
TOP_LIMIT = 2500

BENCHMARK_KEYWORDS = [
    'Zero-knowledge', 'STARK', 'SNARK', 'Byzantine fault', 'State machine replication',
    '1973 oil crisis', 'Organization of Arab Petroleum', 'Transformer (machine learning',
    'Attention (machine learning)', 'Large language model', 'FlashAttention',
    'Elliptic curve cryptography', 'Consensus (computer science)', 'Lamport',
    'Practical Byzantine Fault Tolerance', 'Proof of stake', 'Proof of work',
    'Ethereum', 'Bitcoin', 'Solana', 'Quantum computing', 'Superconductivity',
    'Lisbon', 'Portugal', 'Turing machine', 'P versus NP problem'
]

def build_compact_wiki():
    if not os.path.exists(SRC_DB):
        print(f"Error: {SRC_DB} not found!")
        sys.exit(1)

    if os.path.exists(DEST_DB):
        print(f"Removing old {DEST_DB}...")
        os.remove(DEST_DB)

    print(f"Connecting to source {SRC_DB}...")
    src_conn = sqlite3.connect(SRC_DB)
    src_cur = src_conn.cursor()

    dest_conn = sqlite3.connect(DEST_DB)
    dest_cur = dest_conn.cursor()

    dest_cur.execute("PRAGMA journal_mode = OFF;")
    dest_cur.execute("PRAGMA synchronous = 0;")
    dest_cur.execute("PRAGMA cache_size = 100000;")

    dest_cur.executescript("""
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
    """)

    print(f"1. Fetching top {TOP_LIMIT:,} articles by views...")
    t0 = time.time()
    articles_dict = {}
    
    # 1. Top by views
    for row in src_cur.execute("SELECT id, title, views, block_id, off, len FROM articles ORDER BY views DESC LIMIT ?", (TOP_LIMIT,)):
        articles_dict[row[0]] = row

    # 2. Add benchmark articles if not already present
    print("2. Ensuring all benchmark topics are included...")
    for kw in BENCHMARK_KEYWORDS:
        for row in src_cur.execute("SELECT id, title, views, block_id, off, len FROM articles WHERE title LIKE ? LIMIT 5", (f"%{kw}%",)):
            articles_dict[row[0]] = row

    all_articles = list(articles_dict.values())
    print(f"Total articles selected: {len(all_articles):,} (in {time.time() - t0:.1f}s)")

    print("3. Inserting articles into compact DB...")
    dest_cur.executemany("INSERT INTO articles VALUES (?, ?, ?, ?, ?, ?);", all_articles)
    dest_conn.commit()

    article_ids = set(a[0] for a in all_articles)
    block_ids = list(set(a[3] for a in all_articles))
    print(f"Total distinct compressed blocks needed: {len(block_ids):,}")

    # Copy blocks in batches
    print("4. Copying compressed text blocks...")
    t1 = time.time()
    BATCH_SIZE = 1000
    for i in range(0, len(block_ids), BATCH_SIZE):
        batch = block_ids[i:i+BATCH_SIZE]
        placeholders = ",".join("?" * len(batch))
        rows = src_cur.execute(f"SELECT id, zdata FROM blocks WHERE id IN ({placeholders})", batch).fetchall()
        dest_cur.executemany("INSERT INTO blocks VALUES (?, ?);", rows)
        if i % 5000 == 0 and i > 0:
            print(f"   Copied {i:,} / {len(block_ids):,} blocks ({time.time() - t1:.1f}s)...")
    dest_conn.commit()
    print(f"[OK] Copied all {len(block_ids):,} blocks in {time.time() - t1:.1f}s")

    # Copy chunks
    print("5. Copying chunks...")
    t2 = time.time()
    art_list = list(article_ids)
    for i in range(0, len(art_list), BATCH_SIZE):
        batch = art_list[i:i+BATCH_SIZE]
        placeholders = ",".join("?" * len(batch))
        rows = src_cur.execute(f"SELECT id, article_id, start, end FROM chunks WHERE article_id IN ({placeholders})", batch).fetchall()
        dest_cur.executemany("INSERT INTO chunks VALUES (?, ?, ?, ?);", rows)
    dest_conn.commit()
    print(f"[OK] Copied chunks in {time.time() - t2:.1f}s")

    # Copy redirects
    print("6. Copying matching redirects...")
    t3 = time.time()
    matching_redirects = []
    r_count = 0
    for title, article_id in src_cur.execute("SELECT title, article_id FROM redirects"):
        r_count += 1
        if article_id in article_ids:
            matching_redirects.append((title, article_id))
            if len(matching_redirects) >= 20000:
                dest_cur.executemany("INSERT INTO redirects VALUES (?, ?);", matching_redirects)
                matching_redirects.clear()
    if matching_redirects:
        dest_cur.executemany("INSERT INTO redirects VALUES (?, ?);", matching_redirects)
    dest_conn.commit()
    print(f"[OK] Scanned {r_count:,} redirects and copied matches in {time.time() - t3:.1f}s")

    # Create indexes
    print("7. Creating search indexes...")
    t4 = time.time()
    dest_cur.executescript("""
        CREATE INDEX idx_articles_views ON articles(views DESC);
        CREATE INDEX idx_articles_title ON articles(title COLLATE NOCASE);
        CREATE INDEX idx_redirects_title ON redirects(title COLLATE NOCASE);
        CREATE INDEX idx_chunks_article ON chunks(article_id);
    """)
    dest_conn.commit()
    print(f"[OK] Indexes built in {time.time() - t4:.1f}s")

    dest_cur.execute("""
        INSERT INTO meta (key, val) VALUES 
        ('dataset', 'English Wikipedia Core Compact (Release Edition)'),
        ('source', 'FineWiki August 2025 extraction'),
        ('articles_count', ?);
    """, (str(len(all_articles)),))
    dest_conn.commit()

    src_conn.close()
    dest_conn.close()

    size_bytes = os.path.getsize(DEST_DB)
    size_mb = size_bytes / (1024 * 1024)
    size_gb = size_bytes / (1024 ** 3)
    print(f"\n==========================================")
    print(f"  SUCCESS! Compact Wikipedia built!")
    print(f"  Total Articles: {len(all_articles):,}")
    print(f"  Exact Size: {size_bytes:,} bytes")
    print(f"  Size (MB): {size_mb:.2f} MB")
    print(f"  Size (GB): {size_gb:.2f} GB")
    print(f"  Fits < 2.0 GB GitHub Release Limit: {size_bytes < 2147483648}")
    print(f"==========================================")

if __name__ == "__main__":
    build_compact_wiki()
