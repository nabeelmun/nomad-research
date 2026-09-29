import sqlite3
conn = sqlite3.connect("data/wiki.db")
indexes = conn.execute("SELECT name, tbl_name, sql FROM sqlite_master WHERE type='index';").fetchall()
for idx in indexes:
    print(idx)
conn.close()
