import sqlite3
import os

conn = sqlite3.connect("data/wiki.db")
cursor = conn.cursor()
tables = [t[0] for t in cursor.execute("SELECT name FROM sqlite_master WHERE type='table';").fetchall()]
print("Tables in wiki.db:", tables)

for t in ["articles", "chunks", "redirects", "blocks"]:
    if t in tables:
        count = cursor.execute(f"SELECT COUNT(*) FROM {t};").fetchone()[0]
        cols = [d[0] for d in cursor.execute(f"SELECT * FROM {t} LIMIT 1;").description]
        print(f"Table '{t}': {count:,} rows | Cols: {cols}")

conn.close()
