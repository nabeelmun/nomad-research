from contextlib import closing
"""Build immutable, searchable corpus packs from Nomad's verified raw databases.
No network calls. CLI verifies the pinned raw SHA before touching an existing pack.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import zstandard

ROOT = Path(__file__).resolve().parents[1]
ORIGINS = {
    'voyage': ('f59a2708b3c9bc3b96e2a9ded7fa082765e7ad1b62f3d302d50d0f75be7f7983', '2026-09', 'CC BY-SA'),
    'wiki': ('97dc1b11ebe8eaabcb5092115c24a5161f10f3700dd26707c41a4b0d4d247238', '2025-08', 'CC BY-SA'),
}
def sha256(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b''): digest.update(chunk)
    return digest.hexdigest()

def schema():
    # Share the exact SQL schema with the on-device indexer.
    text = (ROOT / 'src/rag/schema.ts').read_text(encoding='utf-8')
    sql = []
    for line in text.splitlines():
        match = re.match(r"""\s*(['"])(.*?)\1,?\s*$""", line)
        if match: sql.append(match.group(2))
    if not sql: raise ValueError('Missing corpus schema')
    return '\n'.join(sql)

def build(source, output, corpus, date, license_name, expected_sha):
    source, output = Path(source).resolve(), Path(output).resolve()
    if source == output: raise ValueError('Output must differ from source')
    origin_sha = sha256(source)
    if expected_sha and origin_sha != expected_sha: raise ValueError('Raw corpus SHA-256 does not match the pinned source')
    output.parent.mkdir(parents=True, exist_ok=True)
    stage = output.with_name(output.name + '.building')
    stage.unlink(missing_ok=True)
    articles_count = passages_count = 0
    try:
        with closing(sqlite3.connect(source.as_uri() + '?mode=ro', uri=True)) as raw, closing(sqlite3.connect(stage)) as db, db:
            raw.execute('PRAGMA temp_store=FILE')
            raw.executescript('CREATE TEMP TABLE index_articles AS SELECT id,title,block_id,off,len FROM articles; CREATE INDEX temp.index_articles_block ON index_articles(block_id);')
            db.executescript(schema())
            from urllib.parse import quote
            domain = 'wikivoyage' if corpus == 'voyage' else 'wikipedia'
            for (block_id,) in raw.execute('SELECT DISTINCT block_id FROM index_articles ORDER BY block_id'):
                row = raw.execute('SELECT zdata FROM blocks WHERE id=?', (block_id,)).fetchone()
                if not row or len(row[0]) > 16 * 1024 * 1024: raise ValueError('Invalid compressed block')
                decoder = zstandard.ZstdDecompressor(max_window_size=64 * 1024)
                # stream_reader bounds frames both with and without advertised content size.
                with decoder.stream_reader(row[0]) as stream:
                    block = stream.read(64 * 1024 * 1024 + 1)
                    if len(block) > 64 * 1024 * 1024: raise ValueError('Decompressed block exceeds memory budget')
                for article_id, title, offset, length in raw.execute('SELECT id,title,off,len FROM index_articles WHERE block_id=? ORDER BY id', (block_id,)):
                    if offset < 0 or length < 0 or offset + length > len(block): raise ValueError('Invalid article byte offsets')
                    text = block[offset:offset+length].decode('utf-8', errors='strict')
                    url = 'https://en.' + domain + '.org/wiki/' + quote(title.replace(' ', '_'), safe='')
                    section = ''
                    for paragraph in re.split(r'\n\s*\n', text):
                        heading = re.search(r'^#{1,6}\s+(.+)|^={2,6}\s*(.+?)\s*={2,6}$', paragraph, re.M)
                        if heading:
                            section = (heading.group(1) or heading.group(2)).strip()
                            if paragraph.strip() == heading.group(0).strip(): continue
                        points = paragraph.strip()
                        for start in range(0, len(points), 1000):
                            body = points[start:start+1200]
                            if len(body.encode('utf-16-le')) // 2 < 25 or (start > 0 and len(points) - start <= 200): continue
                            passages_count += 1
                            db.execute('INSERT INTO passages VALUES(?,?,?,?,?,?)', (passages_count, article_id, title, section, body, url))
                    articles_count += 1
                db.commit()
            if not passages_count: raise ValueError('Corpus has no searchable text')
            db.executemany('INSERT OR IGNORE INTO redirects VALUES(?,?)', raw.execute('SELECT title,article_id FROM redirects'))
            db.execute("INSERT INTO passages_fts(passages_fts) VALUES('rebuild')")
            db.execute("INSERT INTO passages_fts(passages_fts,rank) VALUES('integrity-check',1)")
            metadata = {'complete': '1', 'source_sha256': origin_sha, 'source_date': date, 'corpus': corpus,
                        'articles_count': str(articles_count), 'passages_count': str(passages_count), 'license': license_name}
            db.executemany('INSERT INTO meta VALUES(?,?)', metadata.items())
            if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok': raise ValueError('SQLite integrity check failed')
        os.replace(stage, output)
    except BaseException:
        stage.unlink(missing_ok=True)
        raise
    return {'id': corpus, 'filename': output.name, 'schemaVersion': 2, 'bytes': output.stat().st_size,
            'sha256': sha256(output), 'sourceSha256': origin_sha, 'articles': articles_count, 'passages': passages_count,
            'sourceDate': date, 'license': license_name}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('--corpus', choices=ORIGINS, required=True)
    parser.add_argument('--output-dir', type=Path, default=Path('release/corpora'))
    args = parser.parse_args()
    sha, date, license_name = ORIGINS[args.corpus]
    filename = 'voyage.search.db' if args.corpus == 'voyage' else 'wiki_core.search.db'
    pack = build(args.source, args.output_dir / filename, args.corpus, date, license_name, sha)
    manifest_path = args.output_dir / 'corpus-manifest.json'
    existing = json.loads(manifest_path.read_text())['packs'] if manifest_path.exists() else []
    packs = [p for p in existing if p['id'] != args.corpus] + [pack]
    stage = manifest_path.with_suffix('.json.tmp')
    stage.write_text(json.dumps({'packs': sorted(packs, key=lambda p: p['id'])}, indent=2) + '\n', encoding='utf-8')
    os.replace(stage, manifest_path)
    print(json.dumps(pack, indent=2))

if __name__ == '__main__': main()
