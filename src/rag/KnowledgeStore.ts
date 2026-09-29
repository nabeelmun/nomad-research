import * as SQLite from 'expo-sqlite';

export interface KnowledgeDocument {
  id: string;
  title: string;
  category: string;
  content: string;
}

export interface SearchResult {
  title: string;
  snippet: string;
  score: number;
}

export class KnowledgeStore {
  private db: SQLite.SQLiteDatabase | null = null;

  async initialize(): Promise<void> {
    if (this.db) return;

    this.db = await SQLite.openDatabaseAsync('nomad_knowledge.db');

    // Create knowledge table and FTS5 search index
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS articles (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        content TEXT NOT NULL
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5(
        title,
        content,
        content='articles',
        content_rowid='rowid'
      );
    `);

    // Check if seed data exists
    const countResult = await this.db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM articles;'
    );

    if (!countResult || countResult.count === 0) {
      await this.populateSeedCorpus();
    }
  }

  async search(query: string, limit: number = 3): Promise<SearchResult[]> {
    if (!this.db) await this.initialize();

    // Clean query for FTS5 syntax
    const sanitized = query
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(w => w.length > 2)
      .join(' OR ');

    if (!sanitized) return [];

    try {
      const rows = await this.db!.getAllAsync<any>(
        `
        SELECT 
          title,
          snippet(articles_fts, 1, '<b>', '</b>', '...', 64) as snippet,
          bm25(articles_fts) as score
        FROM articles_fts
        WHERE articles_fts MATCH ?
        ORDER BY bm25(articles_fts)
        LIMIT ?;
        `,
        [sanitized, limit]
      );

      return rows.map((r: any) => ({
        title: r.title,
        snippet: r.snippet.replace(/<\/?b>/g, ''),
        score: Math.abs(r.score)
      }));
    } catch (e) {
      console.warn('FTS search fallback to LIKE:', e);
      return [];
    }
  }

  async getArticleByTitle(title: string): Promise<string | null> {
    if (!this.db) await this.initialize();
    const row = await this.db!.getFirstAsync<{ content: string }>(
      'SELECT content FROM articles WHERE title = ? LIMIT 1;',
      [title]
    );
    return row ? row.content : null;
  }

  private async populateSeedCorpus(): Promise<void> {
    const seedArticles: KnowledgeDocument[] = [
      {
        id: 'zkp-starks-snarks',
        title: 'Zero-Knowledge Proofs: STARKs vs SNARKs',
        category: 'Cryptography',
        content: `Zero-Knowledge Proofs allow a prover to demonstrate to a verifier that a statement is true without revealing information beyond its validity. 
zk-SNARKs (Zero-Knowledge Succinct Non-Interactive Arguments of Knowledge) utilize elliptic curves and pairing-friendly groups. Most classic SNARKs (like Groth16) require a Common Reference String (CRS) generated via a trusted setup ceremony; if compromised, fake proofs can be created. Recent SNARKs (e.g., PLONK, Halo2) offer universal or transparent setups. SNARK proofs are tiny (~200-400 bytes) with near-instant verification. However, they rely on discrete log assumptions and are not post-quantum secure.
zk-STARKs (Zero-Knowledge Scalable Transparent Arguments of Knowledge) eliminate the trusted setup entirely ('Transparent'), relying only on collision-resistant hash functions (e.g. SHA-256, Rescue) and the Fast Reed-Solomon Interactive Oracle Proof of Proximity (FRI) protocol. Because they rely solely on hashes, STARKs are inherently quantum-resistant. The tradeoff is proof size: STARK proofs are typically 10KB to 100KB (orders of magnitude larger than SNARKs), demanding higher verification bandwidth on-chain.`
      },
      {
        id: 'bft-consensus',
        title: 'Byzantine Fault Tolerance and State Machine Replication',
        category: 'Distributed Systems',
        content: `Byzantine Fault Tolerance (BFT) addresses consensus in distributed networks where nodes can fail arbitrarily or act maliciously (Byzantine faults).
The classical BFT bound, established by Lamport, Shostak, and Pease (1982), proves that in an asynchronous or partially synchronous system, consensus is only possible if fewer than one-third of the nodes are Byzantine (n >= 3f + 1). Practical Byzantine Fault Tolerance (PBFT), introduced by Castro and Liskov in 1999, reduced message complexity to O(n^2) for normal operations across three phases: Pre-prepare, Prepare, and Commit. Modern blockchain consensus protocols, such as Tendermint, HotStuff (used in Aptos/Sui), and Ethereum's Gasper (combining Casper FFG and LMD GHOST), adapt classical BFT principles using validator staking, cryptographic signatures, and pipelined view changes.`
      },
      {
        id: 'oil-embargo-1973',
        title: 'The 1973 Oil Embargo and Japanese Industrial Transformation',
        category: 'Economic History',
        content: `The 1973 oil embargo began in October 1973 when the Organization of Arab Petroleum Exporting Countries (OAPEC) proclaimed an oil embargo targeting nations perceived as supporting Israel during the Yom Kippur War.
At the time, Japan was acutely vulnerable, importing over 99% of its petroleum, mostly from the Middle East. The resulting stagflation forced a profound pivot in Japanese industrial policy led by the Ministry of International Trade and Industry (MITI). Japan aggressively pivoted away from energy-intensive heavy manufacturing (steel, petrochemicals) toward knowledge-intensive, high-value-added sectors: microelectronics, semiconductors, consumer electronics, and fuel-efficient automobiles (spearheaded by Toyota's Lean Production System). This transformation catalyzed Japan's 1980s economic dominance.`
      },
      {
        id: 'transformer-attention',
        title: 'Transformer Architecture and Attention Mechanisms',
        category: 'Artificial Intelligence',
        content: `The Transformer architecture, introduced by Vaswani et al. in 'Attention Is All You Need' (2017), replaced recurrent neural networks (RNNs) with multi-head self-attention.
Standard self-attention computes Scaled Dot-Product Attention: Attention(Q, K, V) = softmax(Q K^T / sqrt(d_k)) V.
While standard attention exhibits quadratic O(N^2) computational and memory complexity with respect to sequence length N, modern optimizations have revolutionized on-device execution:
1. FlashAttention: Tiling algorithm that minimizes IO reads/writes between fast SRAM and high-bandwidth HBM/DRAM.
2. Grouped-Query Attention (GQA): Shares key and value heads across multiple query heads, cutting KV-cache memory bandwidth by 4x to 8x, essential for mobile RAM constraints.
3. Rotary Position Embeddings (RoPE): Encodes relative position directly by rotating query and key representations in complex vector space.`
      }
    ];

    for (const doc of seedArticles) {
      await this.db!.runAsync(
        'INSERT OR REPLACE INTO articles (id, title, category, content) VALUES (?, ?, ?, ?);',
        [doc.id, doc.title, doc.category, doc.content]
      );
      await this.db!.runAsync(
        'INSERT INTO articles_fts (title, content) VALUES (?, ?);',
        [doc.title, doc.content]
      );
    }
  }
}

export const knowledgeStore = new KnowledgeStore();
