export const CORPUS_VERSION = 2;
export const CORPUS_SCHEMA = [
  'PRAGMA journal_mode=DELETE;',
  'CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);',
  'CREATE TABLE passages (id INTEGER PRIMARY KEY, article_id INTEGER NOT NULL, title TEXT NOT NULL, section TEXT NOT NULL, body TEXT NOT NULL, source_url TEXT NOT NULL);',
  "CREATE VIRTUAL TABLE passages_fts USING fts5(title, section, body, content='passages', content_rowid='id', tokenize='unicode61 remove_diacritics 2');",
  'CREATE INDEX passages_article ON passages(article_id);',
  'CREATE TABLE redirects (title TEXT PRIMARY KEY COLLATE NOCASE, article_id INTEGER NOT NULL);',
  'PRAGMA user_version=2;',
].join('\n');
