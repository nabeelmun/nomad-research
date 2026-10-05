export interface AssetSpec {
  id: string;
  kind: 'model' | 'corpus';
  filename: string;
  url: string;
  bytes: number;
  sha256: string;
  label: string;
  license: string;
  sourceDate?: string;
  schemaVersion?: number;
  experimental?: boolean;
  temperature?: number;
}

// Hashes are publisher SHA-256 digests, not estimates. Research never fetches this manifest.
export const MODELS: AssetSpec[] = [
  {
    id: 'qwen25',
    kind: 'model',
    label: 'Qwen 2.5 · 1.5B',
    filename: 'Qwen2.5-1.5B-Instruct-Q4_K_M.gguf',
    url: 'https://huggingface.co/bartowski/Qwen2.5-1.5B-Instruct-GGUF/resolve/9eadc66189c7641e1ddd226b8267a9119b2ce2d4/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf',
    bytes: 986048768,
    sha256: '1adf0b11065d8ad2e8123ea110d1ec956dab4ab038eab665614adba04b6c3370',
    license: 'Apache-2.0',
    temperature: 0.2,
  },
  {
    id: 'lfm25',
    kind: 'model',
    label: 'Liquid LFM 2.5 · 1.2B',
    filename: 'LFM2.5-1.2B-Instruct-Q4_K_M.gguf',
    url: 'https://huggingface.co/LiquidAI/LFM2.5-1.2B-Instruct-GGUF/resolve/8ed288026e23958ad9dfa92d53ed773a8eee7125/LFM2.5-1.2B-Instruct-Q4_K_M.gguf',
    bytes: 730895168,
    sha256: 'b1b3de114215d9507409a662a501a631095a479a419584e8a2ded6304b19b4f5',
    license: 'Liquid AI LFM Open License v1.0',
    experimental: true,
    temperature: 0.1,
  },
  {
    id: 'qwen35',
    kind: 'model',
    label: 'Qwen 3.5 · 2B',
    filename: 'Qwen3.5-2B-Q4_K_M.gguf',
    url: 'https://huggingface.co/unsloth/Qwen3.5-2B-GGUF/resolve/f6d5376be1edb4d416d56da11e5397a961aca8ae/Qwen3.5-2B-Q4_K_M.gguf',
    bytes: 1280835840,
    sha256: 'aaf42c8b7c3cab2bf3d69c355048d4a0ee9973d48f16c731c0520ee914699223',
    license: 'Apache-2.0',
    experimental: true,
    temperature: 0.2,
  },
];

export const CORPORA: AssetSpec[] = [
  {
    id: 'voyage',
    kind: 'corpus',
    label: 'Wikivoyage travel guides',
    filename: 'voyage.db',
    url: 'https://github.com/nabeelmun/nomad-research/releases/download/v1.1.0/voyage.db',
    bytes: 328810496,
    sha256: 'f59a2708b3c9bc3b96e2a9ded7fa082765e7ad1b62f3d302d50d0f75be7f7983',
    license: 'CC BY-SA 4.0',
    sourceDate: 'September 2026',
    schemaVersion: 1,
  },
  {
    id: 'wiki',
    kind: 'corpus',
    label: 'Wikipedia compact selection',
    filename: 'wiki_core.db',
    url: 'https://github.com/nabeelmun/nomad-research/releases/download/v1.1.0/wiki_core.db',
    bytes: 223997952,
    sha256: '97dc1b11ebe8eaabcb5092115c24a5161f10f3700dd26707c41a4b0d4d247238',
    license: 'CC BY-SA 4.0',
    sourceDate: 'August 2025 text',
    schemaVersion: 1,
  },
];

export function validateFingerprint(spec: AssetSpec, size: number, digest: string): void {
  if (size !== spec.bytes) throw new Error(spec.label + ': incomplete file or wrong version.');
  if (digest.toLowerCase() !== spec.sha256) throw new Error(spec.label + ': checksum mismatch.');
}

export function indexedFilename(spec: AssetSpec): string {
  return spec.filename.replace('.db', '.search.db');
}
