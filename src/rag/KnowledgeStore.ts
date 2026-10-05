import * as SQLite from 'expo-sqlite';
import { assetManager } from '../assets/AssetManager';
import { CORPORA, indexedFilename } from '../assets/manifest';
import { verifyCorpus } from '../assets/CorpusIndexer';
import { Passage, ftsQuery, rankPassages, queryTerms } from './retrieval';

export type SearchResult = Passage;
export interface SavedChat {
  id: string;
  query: string;
  answer: string;
  citationsJson: string;
  metrics: string;
  messagesJson: string;
  createdAt: number;
  title?: string;
}
export interface CorpusInfo {
  id: string;
  label: string;
  date: string;
  articles: number;
  passages: number;
}
export class KnowledgeStore {
  private historyDb: SQLite.SQLiteDatabase | null = null;
  private corpora: { id: string; date: string; db: SQLite.SQLiteDatabase }[] = [];
  private initializing: Promise<void> | null = null;
  initialize(): Promise<void> {
    if (!this.initializing)
      this.initializing = this.open().catch((error) => {
        this.initializing = null;
        throw error;
      });
    return this.initializing;
  }
  private async open(): Promise<void> {
    const db = await SQLite.openDatabaseAsync('nomad_knowledge.db');
    try {
      await db.execAsync(
        'CREATE TABLE IF NOT EXISTS chat_history (id TEXT PRIMARY KEY, query TEXT NOT NULL, answer TEXT NOT NULL, citations_json TEXT NOT NULL, metrics TEXT, messages_json TEXT, created_at INTEGER NOT NULL, title TEXT);',
      );
      const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(chat_history);');
      for (const name of ['messages_json', 'title']) {
        if (!columns.some((c) => c.name === name))
          await db.execAsync('ALTER TABLE chat_history ADD COLUMN ' + name + ' TEXT;');
      }
      this.historyDb = db;
    } catch (error) {
      await db.closeAsync();
      throw error;
    }
    const opened: typeof this.corpora = [];
    try {
      for (const spec of CORPORA) {
        const corpus = await SQLite.openDatabaseAsync(
          indexedFilename(spec),
          { useNewConnection: true },
          assetManager.dataDir,
        );
        opened.push({ id: spec.id, date: spec.sourceDate || '', db: corpus });
        await verifyCorpus(corpus, spec);
        await corpus.execAsync('PRAGMA query_only=ON; PRAGMA cache_size=-4096;');
      }
      this.corpora = opened;
    } catch (error) {
      await Promise.all(opened.map((c) => c.db.closeAsync()));
      await db.closeAsync();
      this.historyDb = null;
      throw error;
    }
  }
  async close(): Promise<void> {
    if (this.initializing) await this.initializing.catch(() => {});
    await Promise.all(this.corpora.map((c) => c.db.closeAsync()));
    if (this.historyDb) await this.historyDb.closeAsync();
    this.corpora = [];
    this.historyDb = null;
    this.initializing = null;
  }
  async search(query: string, limit = 6): Promise<SearchResult[]> {
    await this.initialize();
    const match = ftsQuery(query);
    if (!match) return [];
    const candidates: Passage[] = [];
    let rankingQuery = query;
    for (const corpus of this.corpora) {
      const sql =
        'SELECT p.id,p.article_id AS articleId,p.title,p.section,p.body AS snippet,p.source_url AS sourceUrl,bm25(passages_fts,5.0,2.0,1.0) AS score FROM passages_fts JOIN passages p ON p.id=passages_fts.rowid WHERE passages_fts MATCH ? ORDER BY score LIMIT 24;';
      let rows = await corpus.db.getAllAsync<Omit<Passage, 'corpus' | 'sourceDate'>>(
        sql,
        ftsQuery(query, true),
      );
      if (rows.length < limit)
        rows = rows.concat(
          await corpus.db.getAllAsync<Omit<Passage, 'corpus' | 'sourceDate'>>(sql, match),
        );
      // Exact aliases help queries such as Bombay / Mumbai without online geocoding.
      const words = query.split(/\s+/).slice(0, 30);
      const aliases: string[] = [];
      for (let n = Math.min(4, words.length); n > 0; n--)
        for (let i = 0; i <= words.length - n; i++) {
          const alias = words
            .slice(i, i + n)
            .join(' ')
            .replace(/[?!.,]+$/, '');
          if (
            queryTerms(alias).length &&
            !/\b(vegan|vegetarian|food|restaurant|restaurants|sights|visit|travel|hotel|airport)\b/i.test(
              alias,
            )
          )
            aliases.push(alias);
        }
      if (aliases.length) {
        const redirects = await corpus.db.getAllAsync<{ article_id: number; title: string }>(
          'SELECT article_id,title FROM redirects WHERE title COLLATE NOCASE IN (' +
            aliases.map(() => '?').join(',') +
            ') ORDER BY length(title) DESC LIMIT 2;',
          ...aliases,
        );
        for (const redirect of redirects) {
          const relevant = await corpus.db.getAllAsync<Omit<Passage, 'corpus' | 'sourceDate'>>(
            'SELECT p.id,p.article_id AS articleId,p.title,p.section,p.body AS snippet,p.source_url AS sourceUrl,bm25(passages_fts) AS score FROM passages_fts JOIN passages p ON p.id=passages_fts.rowid WHERE passages_fts MATCH ? AND p.article_id=? ORDER BY score LIMIT 12;',
            match,
            redirect.article_id,
          );
          rows.push(...relevant);
          if (relevant.length)
            rankingQuery = rankingQuery
              .toLowerCase()
              .replace(redirect.title.toLowerCase(), relevant[0].title.toLowerCase());
        }
      }
      candidates.push(
        ...rows.map((row) => ({
          ...row,
          id: corpus.id + ':' + row.id,
          corpus: corpus.id,
          sourceDate: corpus.date,
        })),
      );
    }
    return rankPassages(candidates, rankingQuery, limit);
  }
  async getArticleByTitle(title: string): Promise<string | null> {
    await this.initialize();
    for (const corpus of this.corpora) {
      const rows = await corpus.db.getAllAsync<{ body: string }>(
        'SELECT body FROM passages WHERE title=? COLLATE NOCASE ORDER BY id LIMIT 30;',
        title,
      );
      if (rows.length) return rows.map((r) => r.body).join('\n\n');
    }
    return null;
  }
  async corpusInfo(): Promise<CorpusInfo[]> {
    await this.initialize();
    const result: CorpusInfo[] = [];
    for (const corpus of this.corpora) {
      const rows = await corpus.db.getAllAsync<{ key: string; value: string }>(
        'SELECT key,value FROM meta;',
      );
      const meta = Object.fromEntries(rows.map((r) => [r.key, r.value]));
      result.push({
        id: corpus.id,
        label: CORPORA.find((c) => c.id === corpus.id)!.label,
        date: meta.source_date,
        articles: Number(meta.articles_count),
        passages: Number(meta.passages_count),
      });
    }
    return result;
  }
  async saveChat(
    sessionId: string | null,
    query: string,
    answer: string,
    citationsJson: string,
    metrics = '',
    messagesJson = '[]',
  ): Promise<string> {
    await this.initialize();
    const id = sessionId || 'session_' + Date.now();
    await this.historyDb!.runAsync(
      'INSERT INTO chat_history(id,query,answer,citations_json,metrics,messages_json,created_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET query=excluded.query,answer=excluded.answer,citations_json=excluded.citations_json,metrics=excluded.metrics,messages_json=excluded.messages_json,created_at=excluded.created_at;',
      id,
      query,
      answer,
      citationsJson,
      metrics,
      messagesJson,
      Date.now(),
    );
    return id;
  }
  async getChatHistory(limit = 100, search = ''): Promise<SavedChat[]> {
    await this.initialize();
    const term = '%' + search.slice(0, 200).replace(/[\\%_]/g, '\\$&') + '%';
    return this.historyDb!.getAllAsync<SavedChat>(
      "SELECT id,query,answer,citations_json AS citationsJson,metrics,messages_json AS messagesJson,created_at AS createdAt,title FROM chat_history WHERE COALESCE(title,'') LIKE ? ESCAPE '\\' OR query LIKE ? ESCAPE '\\' OR answer LIKE ? ESCAPE '\\' OR COALESCE(messages_json,'') LIKE ? ESCAPE '\\' ORDER BY created_at DESC LIMIT ?;",
      term,
      term,
      term,
      term,
      Math.min(200, Math.max(1, limit)),
    );
  }
  async renameChat(id: string, title: string): Promise<void> {
    await this.initialize();
    if (!title.trim()) throw new Error('Enter a session title.');
    await this.historyDb!.runAsync(
      'UPDATE chat_history SET title=? WHERE id=?;',
      title.trim().slice(0, 100),
      id,
    );
  }
  async deleteChat(id: string): Promise<void> {
    await this.initialize();
    await this.historyDb!.runAsync('DELETE FROM chat_history WHERE id=?;', id);
  }
}
export const knowledgeStore = new KnowledgeStore();
