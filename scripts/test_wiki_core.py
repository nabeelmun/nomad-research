import sqlite3
import zstandard as zstd

conn = sqlite3.connect("data/wiki_core.db")
cursor = conn.cursor()

# Query for an interesting article, e.g. "Quantum computing" or "Artificial intelligence"
article = cursor.execute("""
    SELECT id, title, views, block_id, off, len 
    FROM articles 
    WHERE title = 'Quantum computing' COLLATE NOCASE
    LIMIT 1;
""").fetchone()

if not article:
    # If exact title not found, pick the most viewed article
    article = cursor.execute("""
        SELECT id, title, views, block_id, off, len 
        FROM articles 
        ORDER BY views DESC 
        LIMIT 1;
    """).fetchone()

art_id, title, views, block_id, off, length = article
print(f"Article: {title} (ID: {art_id}, Views: {views:,})")
print(f"Block ID: {block_id}, Offset: {off}, Length: {length}")

# Fetch the compressed block
zdata = cursor.execute("SELECT zdata FROM blocks WHERE id = ?;", (block_id,)).fetchone()[0]
print(f"Compressed block size: {len(zdata)} bytes")

# Decompress using zstandard
dctx = zstd.ZstdDecompressor()
decompressed = dctx.decompress(zdata)
print(f"Decompressed block size: {len(decompressed)} bytes")

# Slice the article text
article_bytes = decompressed[off : off + length]
article_text = article_bytes.decode("utf-8", errors="replace")

print("\n--- Article Content (first 500 chars) ---")
print(article_text[:500])
print("...\n")

conn.close()
