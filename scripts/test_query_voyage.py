import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "voyage.db")
conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

# Test searching for "Lisbon vegan" or "Lisbon"
print("--- Query: Lisbon vegan ---")
results = cursor.execute("""
    SELECT title, snippet(fts, 0, '<b>', '</b>', '...', 32) 
    FROM fts 
    WHERE fts MATCH 'Lisbon AND (vegan OR vegetarian OR restaurant)' 
    LIMIT 5;
""").fetchall()

for title, snippet in results:
    print(f"Title: {title}")
    print(f"Snippet: {snippet}\n")

# Check total articles and chunks
total_articles = cursor.execute("SELECT COUNT(*) FROM articles;").fetchone()[0]
total_chunks = cursor.execute("SELECT COUNT(*) FROM chunks;").fetchone()[0]
print(f"Total articles in voyage.db: {total_articles:,}")
print(f"Total searchable chunks: {total_chunks:,}")

conn.close()
