import * as SQLite from 'expo-sqlite';
import * as FS from 'expo-file-system/legacy';
import { Decompress } from 'fzstd';
import { decodeUTF8 } from './bytes';
import { AssetSpec, indexedFilename } from './manifest';
import { CORPUS_SCHEMA, CORPUS_VERSION } from '../rag/schema';

interface ArticleRow {
  id: number;
  title: string;
  off: number;
  len: number;
}
export function decompressBlock(data: Uint8Array, maxBytes = 64 * 1024 * 1024): Uint8Array {
  if (data.byteLength > 16 * 1024 * 1024)
    throw new Error('Compressed corpus block exceeds the memory budget.');
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  const stream = new Decompress((chunk) => {
    bytes += chunk.byteLength;
    if (bytes > maxBytes) throw new Error('Corpus block exceeds the decompression memory budget.');
    chunks.push(chunk);
  });
  stream.push(data, true);
  const output = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

export async function verifyCorpus(db: SQLite.SQLiteDatabase, spec: AssetSpec): Promise<void> {
  const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  const complete = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM meta WHERE key='complete';",
  );
  const origin = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM meta WHERE key='source_sha256';",
  );
  if (
    version?.user_version !== CORPUS_VERSION ||
    complete?.value !== '1' ||
    origin?.value !== spec.sha256
  ) {
    throw new Error(spec.label + ': index needs rebuilding.');
  }
  if (!(await db.getFirstAsync('SELECT id, title, body, source_url FROM passages LIMIT 1;')))
    throw new Error(spec.label + ': empty index.');
  const metadata = Object.fromEntries(
    (await db.getAllAsync<{ key: string; value: string }>('SELECT key,value FROM meta;')).map(
      (row) => [row.key, row.value],
    ),
  );
  if (
    metadata.corpus !== spec.id ||
    !metadata.source_date ||
    !metadata.license ||
    !Number.isSafeInteger(Number(metadata.articles_count)) ||
    Number(metadata.articles_count) < 1 ||
    !Number.isSafeInteger(Number(metadata.passages_count)) ||
    Number(metadata.passages_count) < 1
  )
    throw new Error(spec.label + ': incomplete provenance metadata.');
  await db.getFirstAsync(
    "SELECT rowid FROM passages_fts WHERE passages_fts MATCH 'knowledge' LIMIT 1;",
  );
}

export async function buildIndex(
  spec: AssetSpec,
  directory: string,
  onProgress: (message: string, fraction: number) => void,
  isCancelled: () => boolean,
): Promise<void> {
  const target = indexedFilename(spec),
    temp = target + '.building';
  const finalUri = directory + target;
  if ((await FS.getInfoAsync(finalUri)).exists) {
    const existing = await SQLite.openDatabaseAsync(target, { useNewConnection: true }, directory);
    try {
      await verifyCorpus(existing, spec);
      return;
    } catch {
      /* incomplete index is replaced below */
    } finally {
      await existing.closeAsync();
    }
  }
  await FS.deleteAsync(directory + temp, { idempotent: true });
  const source = await SQLite.openDatabaseAsync(
    spec.filename,
    { useNewConnection: true },
    directory,
  );
  const output = await SQLite.openDatabaseAsync(temp, { useNewConnection: true }, directory).catch(
    async (error) => {
      await source.closeAsync();
      throw error;
    },
  );
  try {
    // Index metadata in a temporary disk-backed table; leave the verified source untouched.
    await source.execAsync(
      'PRAGMA temp_store=FILE; CREATE TEMP TABLE index_articles AS SELECT id,title,block_id,off,len FROM articles; CREATE INDEX temp.index_articles_block ON index_articles(block_id); PRAGMA query_only=ON;',
    );
    await source.getFirstAsync('SELECT id, title, block_id, off, len FROM articles LIMIT 1;');
    await output.execAsync(CORPUS_SCHEMA);
    const total =
      (
        await source.getFirstAsync<{ n: number }>(
          'SELECT COUNT(DISTINCT block_id) AS n FROM index_articles;',
        )
      )?.n || 0;
    if (!total) throw new Error('Corpus has no articles.');
    let lastBlock = -1,
      processed = 0,
      passageId = 0,
      articleCount = 0;
    while (true) {
      if (isCancelled()) throw new Error('Setup paused. Retry to continue.');
      const block = await source.getFirstAsync<{ id: number }>(
        'SELECT MIN(block_id) AS id FROM index_articles WHERE block_id > ?;',
        lastBlock,
      );
      if (block?.id == null) break;
      lastBlock = block.id;
      const size = await source.getFirstAsync<{ n: number }>(
        'SELECT length(zdata) AS n FROM blocks WHERE id=?;',
        lastBlock,
      );
      if (!size || size.n > 16 * 1024 * 1024) throw new Error('Invalid corpus block size.');
      const row = await source.getFirstAsync<{ zdata: Uint8Array }>(
        'SELECT zdata FROM blocks WHERE id=?;',
        lastBlock,
      );
      if (!row) throw new Error('Corpus references a missing block.');
      const decoded = decompressBlock(row.zdata);
      const articles = await source.getAllAsync<ArticleRow>(
        'SELECT id, title, off, len FROM index_articles WHERE block_id=? ORDER BY id;',
        lastBlock,
      );
      const insert = await output.prepareAsync(
        'INSERT INTO passages(id,article_id,title,section,body,source_url) VALUES(?,?,?,?,?,?);',
      );
      try {
        await output.withTransactionAsync(async () => {
          for (const article of articles) {
            if (isCancelled()) throw new Error('Setup paused. Retry to continue.');
            if (article.off < 0 || article.len < 0 || article.off + article.len > decoded.length)
              throw new Error('Invalid article byte offsets.');
            const text = decodeUTF8(decoded.subarray(article.off, article.off + article.len));
            const url =
              'https://en.' +
              (spec.id === 'voyage' ? 'wikivoyage' : 'wikipedia') +
              '.org/wiki/' +
              encodeURIComponent(article.title.replace(/ /g, '_'));
            // Rechunk complete article text so Unicode offsets never become byte offsets.
            let section = '';
            for (const paragraph of text.split(/\n\s*\n/)) {
              const heading = paragraph.match(/^#{1,6}\s+(.+)|^={2,6}\s*(.+?)\s*={2,6}$/m);
              if (heading) {
                section = (heading[1] || heading[2]).trim();
                if (paragraph.trim() === heading[0].trim()) continue;
              }
              const points = Array.from(paragraph.trim());
              for (let start = 0; start < points.length; start += 1000) {
                const body = points.slice(start, start + 1200).join('');
                if (body.length < 25 || (start > 0 && points.length - start <= 200)) continue;
                await insert.executeAsync(
                  ++passageId,
                  article.id,
                  article.title,
                  section,
                  body,
                  url,
                );
              }
            }
            articleCount++;
          }
        });
      } finally {
        await insert.finalizeAsync();
      }
      processed++;
      onProgress(
        'Indexing ' + spec.label + ' · ' + articleCount.toLocaleString() + ' articles',
        processed / total,
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    if (!passageId) throw new Error('Corpus contained no searchable text.');
    // Redirects are small enough to page through without retaining the full table.
    let offset = 0;
    while (true) {
      if (isCancelled()) throw new Error('Setup paused. Retry to continue.');
      const rows = await source.getAllAsync<{ title: string; article_id: number }>(
        'SELECT title, article_id FROM redirects LIMIT 500 OFFSET ?;',
        offset,
      );
      if (!rows.length) break;
      await output.withTransactionAsync(async () => {
        for (const r of rows)
          await output.runAsync(
            'INSERT OR IGNORE INTO redirects VALUES(?,?);',
            r.title,
            r.article_id,
          );
      });
      offset += rows.length;
    }
    onProgress('Building search index for ' + spec.label, 0.98);
    await output.execAsync("INSERT INTO passages_fts(passages_fts) VALUES('rebuild');");
    for (const [key, value] of Object.entries({
      complete: '1',
      source_sha256: spec.sha256,
      source_date: spec.sourceDate || '',
      articles_count: String(articleCount),
      passages_count: String(passageId),
      license: spec.license,
      corpus: spec.id,
    })) {
      await output.runAsync('INSERT INTO meta VALUES(?,?);', key, value);
    }
    await verifyCorpus(output, spec);
  } finally {
    await source.closeAsync();
    await output.closeAsync();
  }
  if (isCancelled()) throw new Error('Setup paused. Retry to continue.');
  const backup = finalUri + '.previous';
  const hadPrevious = (await FS.getInfoAsync(finalUri)).exists;
  if (hadPrevious) {
    await FS.deleteAsync(backup, { idempotent: true });
    await FS.moveAsync({ from: finalUri, to: backup });
  }
  try {
    await FS.moveAsync({ from: directory + temp, to: finalUri });
  } catch (error) {
    if (hadPrevious) await FS.moveAsync({ from: backup, to: finalUri });
    throw error;
  }
  await FS.deleteAsync(backup, { idempotent: true });
}
