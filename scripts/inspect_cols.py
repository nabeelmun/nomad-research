import sqlite3
import os

conn = sqlite3.connect("data/voyage.db")
print("articles cols:", [d[0] for d in conn.execute("SELECT * FROM articles LIMIT 1").description])
print("chunks cols:", [d[0] for d in conn.execute("SELECT * FROM chunks LIMIT 1").description])
print("fts schema:", conn.execute("SELECT sql FROM sqlite_master WHERE name='fts'").fetchone()[0])
print("\nSample chunk row:")
row = conn.execute("SELECT * FROM chunks LIMIT 1").fetchone()
print(row)
conn.close()
