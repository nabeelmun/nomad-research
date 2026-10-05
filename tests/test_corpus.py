from contextlib import closing
import hashlib
import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
import zstandard
spec = importlib.util.spec_from_file_location('build_corpus', Path(__file__).parents[1] / 'scripts' / 'build_corpus.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)
class CorpusTests(unittest.TestCase):
    def fixture(self, root):
        source = root / 'raw.db'
        text = 'São Paulo 🌍\n\n## Eat\nVegan food in São Paulo includes vegetables and beans, without dairy or eggs.'
        raw = text.encode('utf-8')
        with closing(sqlite3.connect(source)) as db, db:
            db.executescript('CREATE TABLE blocks(id INTEGER PRIMARY KEY,zdata BLOB); CREATE TABLE articles(id INTEGER PRIMARY KEY,title TEXT,block_id INTEGER,off INTEGER,len INTEGER); CREATE TABLE redirects(title TEXT,article_id INTEGER);')
            db.execute('INSERT INTO blocks VALUES(?,?)', (1, zstandard.ZstdCompressor().compress(raw)))
            db.execute('INSERT INTO articles VALUES(1,?,1,0,?)', ('São Paulo', len(raw)))
            db.execute('INSERT INTO redirects VALUES(?,1)', ('Sampa',))
        return source
    def test_unicode_fts_provenance_and_manifest(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); source = self.fixture(root); output = root / 'voyage.search.db'
            manifest = builder.build(source, output, 'voyage', '2026-09', 'CC BY-SA', None)
            with closing(sqlite3.connect(output)) as db, db:
                hit = db.execute("SELECT p.body,p.source_url FROM passages_fts f JOIN passages p ON p.id=f.rowid WHERE passages_fts MATCH ?", ('"vegan" AND "sao"',)).fetchone()
                self.assertIn('São Paulo', hit[0]); self.assertIn('S%C3%A3o_Paulo', hit[1])
                self.assertEqual(db.execute('PRAGMA user_version').fetchone()[0], 2)
                self.assertEqual(db.execute("SELECT value FROM meta WHERE key='complete'").fetchone()[0], '1')
                self.assertEqual(db.execute('SELECT article_id FROM redirects WHERE title=? COLLATE NOCASE', ('sampa',)).fetchone()[0], 1)
            self.assertEqual(manifest['sha256'], hashlib.sha256(output.read_bytes()).hexdigest())
            self.assertEqual(manifest['bytes'], output.stat().st_size)
    def test_invalid_origin_is_rejected_before_output_changes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); source = self.fixture(root); output = root / 'keep.db'; output.write_bytes(b'keep')
            with self.assertRaises(ValueError): builder.build(source, output, 'voyage', '2026-09', 'CC BY-SA', '0' * 64)
            self.assertEqual(output.read_bytes(), b'keep')
    def test_corrupt_offsets_do_not_replace_previous_pack(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); source = self.fixture(root)
            with closing(sqlite3.connect(source)) as db, db: db.execute('UPDATE articles SET off=9999')
            output = root / 'keep.db'; output.write_bytes(b'keep')
            with self.assertRaises(ValueError): builder.build(source, output, 'voyage', '2026-09', 'CC BY-SA', None)
            self.assertEqual(output.read_bytes(), b'keep')
if __name__ == '__main__': unittest.main()
