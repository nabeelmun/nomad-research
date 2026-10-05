import * as FS from 'expo-file-system/legacy';
import { DownloadTask, File, DownloadPauseState } from 'expo-file-system';
import { Platform } from 'react-native';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import * as SQLite from 'expo-sqlite';
import { AssetSpec, MODELS, CORPORA, validateFingerprint, indexedFilename } from './manifest';
import { fromBase64 } from './bytes';
import { buildIndex, verifyCorpus } from './CorpusIndexer';

export interface SetupProgress {
  message: string;
  fraction: number;
}
export interface Settings {
  modelId: string;
  city: string;
}
export interface IndexedPack {
  id: string;
  filename: string;
  bytes: number;
  sha256: string;
  sourceSha256: string;
  schemaVersion: number;
}
interface VerifiedFile {
  size: number;
  modified: number;
  digest: string;
}
export class AssetManager {
  private downloading: DownloadTask | null = null;
  private pausing: Promise<void> | null = null;
  private downloadStateUri = '';
  private cancelled = false;
  private running = false;
  readonly root = FS.documentDirectory || '';
  readonly dataDir = this.root + 'data/';
  readonly modelsDir = this.root + 'models/';
  private settingsUri = this.root + 'settings.json';
  private verificationUri = this.root + 'verified-assets.json';

  path(spec: AssetSpec): string {
    return (spec.kind === 'model' ? this.modelsDir : this.dataDir) + spec.filename;
  }
  async settings(): Promise<Settings> {
    try {
      const data = JSON.parse(await FS.readAsStringAsync(this.settingsUri));
      return {
        modelId: MODELS.some((m) => m.id === data.modelId) ? data.modelId : MODELS[0].id,
        city: typeof data.city === 'string' ? data.city.slice(0, 100) : '',
      };
    } catch {
      return { modelId: MODELS[0].id, city: '' };
    }
  }
  async saveSettings(settings: Settings): Promise<void> {
    if (!MODELS.some((m) => m.id === settings.modelId)) throw new Error('Unsupported model.');
    await FS.writeAsStringAsync(
      this.settingsUri,
      JSON.stringify({ modelId: settings.modelId, city: settings.city.trim().slice(0, 100) }),
    );
  }
  async ensureDirs(): Promise<void> {
    if (!this.root) throw new Error('Private app storage is unavailable.');
    await FS.makeDirectoryAsync(this.modelsDir, { intermediates: true });
    await FS.makeDirectoryAsync(this.dataDir, { intermediates: true });
    for (const uri of [
      this.root + 'corpus-manifest.json',
      ...MODELS.map((m) => this.path(m)),
      ...CORPORA.flatMap((c) => [this.path(c), this.dataDir + indexedFilename(c)]),
    ]) {
      if (!(await FS.getInfoAsync(uri)).exists && (await FS.getInfoAsync(uri + '.previous')).exists)
        await FS.moveAsync({ from: uri + '.previous', to: uri });
    }
    for (const spec of [...MODELS, ...CORPORA]) {
      const legacy = this.root + spec.filename;
      if (
        !(await FS.getInfoAsync(this.path(spec))).exists &&
        (await FS.getInfoAsync(legacy)).exists
      ) {
        let valid = false;
        try {
          await this.validate(spec, legacy, undefined, true);
          valid = true;
        } catch {
          /* leave unmatched legacy files untouched */
        }
        if (valid) await this.acceptFile(spec, legacy);
      }
    }
  }
  private async commitFile(from: string, to: string): Promise<void> {
    const backup = to + '.previous';
    const previous = await FS.getInfoAsync(to);
    if (previous.exists) {
      await FS.deleteAsync(backup, { idempotent: true });
      await FS.moveAsync({ from: to, to: backup });
    }
    try {
      await FS.moveAsync({ from, to });
    } catch (error) {
      if (previous.exists) await FS.moveAsync({ from: backup, to });
      throw error;
    }
    await FS.deleteAsync(backup, { idempotent: true });
  }
  private async acceptFile(spec: AssetSpec, from: string): Promise<void> {
    await this.commitFile(from, this.path(spec));
    const info = await FS.getInfoAsync(this.path(spec));
    if (!info.exists) throw new Error('Installed file disappeared.');
    const cache = await this.readCache();
    cache[spec.id] = { size: info.size, modified: info.modificationTime, digest: spec.sha256 };
    await FS.writeAsStringAsync(this.verificationUri, JSON.stringify(cache));
  }
  private async readCache(): Promise<Record<string, VerifiedFile>> {
    try {
      const cache = JSON.parse(await FS.readAsStringAsync(this.verificationUri));
      return cache && typeof cache === 'object' && !Array.isArray(cache) ? cache : {};
    } catch {
      return {};
    }
  }
  async validate(
    spec: AssetSpec,
    uri = this.path(spec),
    progress?: (p: SetupProgress) => void,
    force = false,
  ): Promise<void> {
    const info = await FS.getInfoAsync(uri);
    if (!info.exists || info.isDirectory || info.size !== spec.bytes)
      throw new Error(spec.label + ': missing or incomplete file.');
    const cache = await this.readCache(),
      old = cache[spec.id];
    if (
      !force &&
      uri === this.path(spec) &&
      old?.digest === spec.sha256 &&
      old.size === info.size &&
      old.modified === info.modificationTime
    )
      return;
    const head = fromBase64(
      await FS.readAsStringAsync(uri, {
        encoding: FS.EncodingType.Base64,
        position: 0,
        length: 16,
      }),
    );
    const magic = String.fromCharCode(...head);
    if (spec.kind === 'model' ? !magic.startsWith('GGUF') : !magic.startsWith('SQLite format 3\0'))
      throw new Error(spec.label + ': invalid file format.');
    const hash = sha256.create();
    const batch = 1024 * 1024;
    for (let offset = 0; offset < info.size; offset += batch) {
      if (this.cancelled && this.running) throw new Error('Setup paused. Retry to continue.');
      hash.update(
        fromBase64(
          await FS.readAsStringAsync(uri, {
            encoding: FS.EncodingType.Base64,
            position: offset,
            length: Math.min(batch, info.size - offset),
          }),
        ),
      );
      progress?.({
        message: 'Verifying ' + spec.label,
        fraction: Math.min(1, (offset + batch) / info.size),
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const digest = bytesToHex(hash.digest());
    validateFingerprint(spec, info.size, digest);
    if (uri === this.path(spec)) {
      cache[spec.id] = { size: info.size, modified: info.modificationTime, digest };
      await FS.writeAsStringAsync(this.verificationUri, JSON.stringify(cache));
    }
  }
  private async importedPacks(): Promise<IndexedPack[]> {
    try {
      const json = JSON.parse(await FS.readAsStringAsync(this.root + 'corpus-manifest.json'));
      return this.parsePacks(json);
    } catch {
      return [];
    }
  }
  private parsePacks(json: unknown): IndexedPack[] {
    if (!json || typeof json !== 'object' || !Array.isArray((json as { packs?: unknown }).packs))
      throw new Error('Invalid corpus manifest.');
    const packs = (json as { packs: IndexedPack[] }).packs;
    if (!packs.length || packs.length > CORPORA.length) throw new Error('Invalid corpus manifest.');
    const seen = new Set<string>();
    for (const pack of packs) {
      const spec = CORPORA.find((c) => c.id === pack.id);
      if (
        !spec ||
        seen.has(pack.id) ||
        pack.filename !== indexedFilename(spec) ||
        pack.sourceSha256 !== spec.sha256 ||
        pack.schemaVersion !== 2 ||
        !Number.isSafeInteger(pack.bytes) ||
        pack.bytes < 4096 ||
        pack.bytes > 3 * 1073741824 ||
        typeof pack.sha256 !== 'string' ||
        !/^[a-f0-9]{64}$/.test(pack.sha256)
      )
        throw new Error('Unsupported corpus manifest entry.');
      seen.add(pack.id);
    }
    return packs;
  }
  private async checkIndex(spec: AssetSpec, progress?: (p: SetupProgress) => void): Promise<void> {
    const pack = (await this.importedPacks()).find((p) => p.id === spec.id);
    if (pack)
      await this.validate(
        {
          ...spec,
          id: spec.id + '-indexed',
          filename: pack.filename,
          bytes: pack.bytes,
          sha256: pack.sha256,
        },
        this.dataDir + pack.filename,
        progress,
      );
    else await this.validate(spec, undefined, progress);
    const file = indexedFilename(spec);
    if (!(await FS.getInfoAsync(this.dataDir + file)).exists)
      throw new Error(spec.label + ': needs first-time indexing.');
    const db = await SQLite.openDatabaseAsync(file, { useNewConnection: true }, this.dataDir);
    try {
      await verifyCorpus(db, spec);
    } finally {
      await db.closeAsync();
    }
  }
  async checkInstalled(progress?: (p: SetupProgress) => void): Promise<void> {
    await this.ensureDirs();
    const settings = await this.settings(),
      model = MODELS.find((m) => m.id === settings.modelId)!;
    await this.validate(model, undefined, progress);
    for (const spec of CORPORA) await this.checkIndex(spec, progress);
  }
  async cancel(): Promise<void> {
    this.cancelled = true;
    const task = this.downloading;
    if (task?.state === 'active' && !this.pausing) {
      const uri = this.downloadStateUri;
      this.pausing = task
        .pauseAsync()
        .then(() => FS.writeAsStringAsync(uri, JSON.stringify(task.savable())));
    }
    if (this.pausing) await this.pausing;
  }
  private async download(spec: AssetSpec, progress: (p: SetupProgress) => void): Promise<void> {
    try {
      await this.validate(spec, undefined, progress);
      return;
    } catch {
      /* explicit setup repairs invalid assets */
    }
    if (this.cancelled) throw new Error('Setup paused. Retry to continue.');
    const part = this.path(spec) + '.part';
    const stateUri = this.root + 'download-' + spec.id + '.json';
    // A paused verification may leave a complete staged download; verify and reuse it.
    const staged = await FS.getInfoAsync(part);
    if (staged.exists && !staged.isDirectory && staged.size === spec.bytes) {
      let valid = false;
      try {
        await this.validate(spec, part, progress, true);
        valid = true;
      } catch {
        /* retry an invalid stage */
      }
      if (this.cancelled) throw new Error('Setup paused. Retry to continue.');
      if (valid) {
        await this.acceptFile(spec, part);
        await FS.deleteAsync(stateUri, { idempotent: true });
        return;
      }
    }
    let saved: DownloadPauseState | undefined;
    try {
      const snapshot = JSON.parse(await FS.readAsStringAsync(stateUri));
      const info = await FS.getInfoAsync(part);
      if (
        snapshot.url === spec.url &&
        snapshot.fileUri === part &&
        info.exists &&
        !info.isDirectory &&
        info.size > 0 &&
        info.size < spec.bytes
      ) {
        // Expo's Android implementation uses the actual file length as its resume offset.
        // Recover from process death too; the immutable URL + final SHA binds the partial file.
        saved = {
          url: spec.url,
          fileUri: part,
          isDirectory: false,
          resumeData: Platform.OS === 'android' ? String(info.size) : snapshot.resumeData,
        };
        if (!saved.resumeData) saved = undefined;
      }
    } catch {
      /* first download */
    }
    const options = {
      onProgress: (dp: { bytesWritten: number; totalBytes: number }) =>
        progress({
          message:
            'Downloading ' + spec.label + ' - ' + Math.round(dp.bytesWritten / 1048576) + ' MB',
          fraction: Math.max(
            0,
            Math.min(1, dp.bytesWritten / (dp.totalBytes > 0 ? dp.totalBytes : spec.bytes)),
          ),
        }),
    };
    const task = saved
      ? DownloadTask.fromSavable(saved, options)
      : new DownloadTask(spec.url, new File(part), options);
    this.downloading = task;
    this.downloadStateUri = stateUri;
    this.pausing = null;
    await FS.writeAsStringAsync(
      stateUri,
      JSON.stringify(saved || { url: spec.url, fileUri: part, isDirectory: false }),
    );
    try {
      // SDK 57 DownloadTask rejects HTTP failures and restarts safely when Range is ignored.
      const result = saved ? await task.resumeAsync() : await task.downloadAsync();
      if (this.cancelled || !result) throw new Error('Setup paused. Retry to continue.');
      await this.validate(spec, part, progress, true);
      await this.acceptFile(spec, part);
      await FS.deleteAsync(stateUri, { idempotent: true });
    } finally {
      const pendingPause = this.pausing as Promise<void> | null;
      if (pendingPause) await pendingPause.catch(() => {});
      task.release();
      this.downloading = null;
      this.pausing = null;
    }
  }
  async install(
    modelId: string,
    progress: (p: SetupProgress) => void,
    download = true,
  ): Promise<void> {
    if (this.running) throw new Error('Setup is already running.');
    this.running = true;
    this.cancelled = false;
    try {
      await this.ensureDirs();
      const model = MODELS.find((m) => m.id === modelId);
      if (!model) throw new Error('Unsupported model.');
      const needsIndex: AssetSpec[] = [];
      for (const spec of CORPORA) {
        try {
          await this.checkIndex(spec, progress);
        } catch {
          needsIndex.push(spec);
        }
      }
      let needsModel = false;
      try {
        await this.validate(model, undefined, progress);
      } catch {
        needsModel = true;
      }
      const required =
        (needsModel ? model.bytes * 2 : 0) +
        needsIndex.reduce((sum, c) => sum + c.bytes * 5, 0) +
        256 * 1048576;
      if ((await FS.getFreeDiskStorageAsync()) < required)
        throw new Error(
          'Allow at least ' +
            (required / 1073741824).toFixed(1) +
            ' GB free for setup and indexing.',
        );
      for (const spec of [model, ...needsIndex]) {
        if (this.cancelled) throw new Error('Setup paused. Retry to continue.');
        if (download) await this.download(spec, progress);
        else await this.validate(spec, undefined, progress);
      }
      for (const spec of needsIndex) {
        // Rebuilt indexes supersede any imported pack fingerprint.
        const packs = (await this.importedPacks()).filter((p) => p.id !== spec.id);
        if (packs.length)
          await FS.writeAsStringAsync(
            this.root + 'corpus-manifest.json',
            JSON.stringify({ packs }),
          );
        else await FS.deleteAsync(this.root + 'corpus-manifest.json', { idempotent: true });
        await buildIndex(
          spec,
          this.dataDir,
          (message, fraction) => progress({ message, fraction }),
          () => this.cancelled,
        );
      }
      await this.saveSettings({ ...(await this.settings()), modelId });
    } finally {
      this.running = false;
      this.downloading = null;
    }
  }
  async importFile(uri: string, name: string, progress: (p: SetupProgress) => void): Promise<void> {
    if (this.running) throw new Error('Wait for setup to finish before importing.');
    this.running = true;
    this.cancelled = false;
    let part: string | null = null;
    try {
      await this.ensureDirs();
      if (name === 'corpus-manifest.json') {
        part = this.root + name + '.import';
        await FS.copyAsync({ from: uri, to: part });
        const info = await FS.getInfoAsync(part);
        if (!info.exists || info.isDirectory || info.size > 16384)
          throw new Error('Corpus manifest is missing or too large.');
        const packs = this.parsePacks(JSON.parse(await FS.readAsStringAsync(part)));
        await FS.writeAsStringAsync(part, JSON.stringify({ packs }));
        await this.commitFile(part, this.root + name);
        return;
      }
      const raw = [...MODELS, ...CORPORA].find((asset) => asset.filename === name);
      const pack = (await this.importedPacks()).find((p) => p.filename === name);
      const origin = pack ? CORPORA.find((c) => c.id === pack.id)! : undefined;
      const spec =
        raw ||
        (pack && origin
          ? {
              ...origin,
              id: origin.id + '-indexed',
              filename: pack.filename,
              bytes: pack.bytes,
              sha256: pack.sha256,
            }
          : undefined);
      if (!spec)
        throw new Error(
          'Unrecognized file. Import corpus-manifest.json before an indexed pack, or select a listed model / raw corpus.',
        );
      part = this.path(spec) + '.import';
      await FS.copyAsync({ from: uri, to: part });
      await this.validate(spec, part, progress, true);
      if (origin) {
        const db = await SQLite.openDatabaseAsync(
          spec.filename + '.import',
          { useNewConnection: true },
          this.dataDir,
        );
        try {
          await verifyCorpus(db, origin);
        } finally {
          await db.closeAsync();
        }
      }
      await this.acceptFile(spec, part);
    } finally {
      this.running = false;
      if (part) await FS.deleteAsync(part, { idempotent: true });
    }
  }
  async storageBytes(): Promise<number> {
    let total = 0;
    for (const uri of [
      ...MODELS.map((m) => this.path(m)),
      ...CORPORA.flatMap((c) => [this.path(c), this.dataDir + indexedFilename(c)]),
    ]) {
      const info = await FS.getInfoAsync(uri);
      if (info.exists && !info.isDirectory) total += info.size;
    }
    return total;
  }
}
export const assetManager = new AssetManager();
