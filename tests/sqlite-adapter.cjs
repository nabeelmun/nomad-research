const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs/promises');
const path = require('node:path');
const { fileURLToPath, pathToFileURL } = require('node:url');
exports.nativeAdapters = (root) => {
  const local = (uri) => (uri.startsWith('file:') ? fileURLToPath(uri) : uri);
  const filesystem = {
    documentDirectory: pathToFileURL(root + path.sep).href,
    EncodingType: { Base64: 'base64' },
    getInfoAsync: async (uri) => {
      try {
        const s = await fs.stat(local(uri));
        return {
          exists: true,
          isDirectory: s.isDirectory(),
          size: s.size,
          modificationTime: s.mtimeMs,
        };
      } catch {
        return { exists: false };
      }
    },
    makeDirectoryAsync: async (uri) => fs.mkdir(local(uri), { recursive: true }),
    deleteAsync: async (uri) => fs.rm(local(uri), { force: true }),
    moveAsync: async ({ from, to }) => fs.rename(local(from), local(to)),
    copyAsync: async ({ from, to }) => fs.copyFile(local(from), local(to)),
    readAsStringAsync: async (uri, options = {}) => {
      if (options.encoding !== 'base64') return fs.readFile(local(uri), 'utf8');
      const handle = await fs.open(local(uri), 'r');
      try {
        const buffer = Buffer.alloc(options.length);
        const { bytesRead } = await handle.read(buffer, 0, options.length, options.position);
        return buffer.subarray(0, bytesRead).toString('base64');
      } finally {
        await handle.close();
      }
    },
    writeAsStringAsync: async (uri, text) => fs.writeFile(local(uri), text, 'utf8'),
  };
  const sqlite = {
    openDatabaseAsync: async (name, options, directory) => {
      const db = new DatabaseSync(path.join(directory ? local(directory) : root, name));
      return {
        execAsync: async (sql) => db.exec(sql),
        getFirstAsync: async (sql, ...params) => db.prepare(sql).get(...params) || null,
        getAllAsync: async (sql, ...params) => db.prepare(sql).all(...params),
        runAsync: async (sql, ...params) => db.prepare(sql).run(...params),
        prepareAsync: async (sql) => {
          const statement = db.prepare(sql);
          return {
            executeAsync: async (...params) => statement.run(...params),
            finalizeAsync: async () => {},
          };
        },
        withTransactionAsync: async (fn) => {
          db.exec('BEGIN');
          try {
            await fn();
            db.exec('COMMIT');
          } catch (e) {
            db.exec('ROLLBACK');
            throw e;
          }
        },
        closeAsync: async () => db.close(),
      };
    },
  };
  return { filesystem, sqlite };
};
