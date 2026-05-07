import type Database from 'better-sqlite3';
import type { CodeChunk } from './chunker.js';
import { ConfigError } from '../errors.js';

export interface VectorStore {
  init(): Promise<void>;
  close(): Promise<void>;
  upsertEmbedding(chunkId: string, embedding: number[], meta: Record<string, unknown>): Promise<void>;
  querySimilar(text: string, embedding: number[], topK: number): Promise<CodeChunk[]>;
  deleteByFile(filePath: string): Promise<void>;
}

export interface VectorStoreConfig {
  type: 'pgvector' | 'sqlite';
  pgvector?: {
    url: string;
    table: string;
    vectorDimension?: number; // default 1536
  };
  sqlite?: {
    file: string;
  };
}

export async function createVectorStore(config: VectorStoreConfig): Promise<VectorStore> {
  switch (config.type) {
    case 'pgvector':
      if (!config.pgvector) {
        throw new ConfigError('pgvector configuration is required');
      }
      return new PgVectorStore(config.pgvector.url, config.pgvector.table, config.pgvector.vectorDimension);
    case 'sqlite':
      return new SQLiteVectorStore(config.sqlite?.file ?? '.wikichan/vectors.db');
    default:
      throw new ConfigError(`Unknown vector store type: ${config.type}`);
  }
}

function validateTableName(name: string): void {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid table name: "${name}". Must match /^[a-zA-Z_][a-zA-Z0-9_]*$/`);
  }
}

class PgVectorStore implements VectorStore {
  private url: string;
  private table: string;
  private vectorDimension: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any;

  constructor(url: string, table: string, vectorDimension?: number) {
    validateTableName(table);
    this.url = url;
    this.table = table;
    this.vectorDimension = vectorDimension ?? 1536;
  }

  async init(): Promise<void> {
    const pg = await import('pg');
    this.client = new pg.Client({ connectionString: this.url });
    await this.client.connect();

    // Create table if not exists
    await this.client.query(`
      CREATE TABLE IF NOT EXISTS ${this.table} (
        chunk_id TEXT PRIMARY KEY,
        embedding VECTOR(${this.vectorDimension}),
        meta JSONB
      )
    `);

    // Create index for similarity search
    await this.client.query(`
      CREATE INDEX IF NOT EXISTS idx_${this.table}_embedding
      ON ${this.table} USING ivfflat (embedding vector_cosine_ops)
    `);
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.end();
    }
  }

  async upsertEmbedding(chunkId: string, embedding: number[], meta: Record<string, unknown>): Promise<void> {
    const embeddingStr = `[${embedding.join(',')}]`;
    await this.client.query(
      `INSERT INTO ${this.table} (chunk_id, embedding, meta)
       VALUES ($1, $2::vector, $3::jsonb)
       ON CONFLICT (chunk_id) DO UPDATE SET embedding = $2::vector, meta = $3::jsonb`,
      [chunkId, embeddingStr, JSON.stringify(meta)]
    );
  }

  async querySimilar(text: string, embedding: number[], topK: number): Promise<CodeChunk[]> {
    const embeddingStr = `[${embedding.join(',')}]`;
    const result = await this.client.query(
      `SELECT chunk_id, meta, 1 - (embedding <=> $1::vector) as similarity
       FROM ${this.table}
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      [embeddingStr, topK]
    );

    return result.rows.map((row: { chunk_id: string; meta: Record<string, unknown>; similarity: number }) => ({
      chunkId: row.chunk_id,
      file: (row.meta as { file?: string })?.file ?? '',
      symbolId: (row.meta as { symbolId?: string })?.symbolId ?? '',
      content: (row.meta as { content?: string })?.content ?? '',
      meta: row.meta as CodeChunk['meta'],
    }));
  }

  async deleteByFile(filePath: string): Promise<void> {
    await this.client.query(
      `DELETE FROM ${this.table} WHERE meta->>'file' = $1`,
      [filePath]
    );
  }
}

class SQLiteVectorStore implements VectorStore {
  private dbPath: string;
  private db!: Database.Database;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  async init(): Promise<void> {
    const Database = (await import('better-sqlite3')).default;
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS vectors (
        chunk_id TEXT PRIMARY KEY,
        embedding TEXT NOT NULL,
        meta TEXT NOT NULL
      )
    `);
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
    }
  }

  async upsertEmbedding(chunkId: string, embedding: number[], meta: Record<string, unknown>): Promise<void> {
    const embeddingStr = JSON.stringify(embedding);
    const metaStr = JSON.stringify(meta);
    this.db.prepare(
      `INSERT OR REPLACE INTO vectors (chunk_id, embedding, meta) VALUES (?, ?, ?)`
    ).run(chunkId, embeddingStr, metaStr);
  }

  async querySimilar(text: string, embedding: number[], topK: number): Promise<CodeChunk[]> {
    // SQLite doesn't have native vector similarity, so we load all and compute in memory
    const rows = this.db.prepare('SELECT * FROM vectors').all() as Array<{
      chunk_id: string;
      embedding: string;
      meta: string;
    }>;

    // Compute cosine similarity
    const similarities = rows.map(row => {
      const storedEmbedding = JSON.parse(row.embedding) as number[];
      const similarity = cosineSimilarity(embedding, storedEmbedding);
      return {
        chunk_id: row.chunk_id,
        meta: JSON.parse(row.meta) as Record<string, unknown>,
        similarity,
      };
    });

    // Sort by similarity and take top K
    similarities.sort((a, b) => b.similarity - a.similarity);
    const topResults = similarities.slice(0, topK);

    return topResults.map(row => ({
      chunkId: row.chunk_id,
      file: (row.meta as { file?: string })?.file ?? '',
      symbolId: (row.meta as { symbolId?: string })?.symbolId ?? '',
      content: (row.meta as { content?: string })?.content ?? '',
      meta: row.meta as CodeChunk['meta'],
    }));
  }

  async deleteByFile(filePath: string): Promise<void> {
    const rows = this.db.prepare('SELECT chunk_id, meta FROM vectors').all() as Array<{
      chunk_id: string;
      meta: string;
    }>;

    const toDelete = rows.filter(row => {
      const meta = JSON.parse(row.meta) as Record<string, unknown>;
      return meta.file === filePath;
    });

    const deleteStmt = this.db.prepare('DELETE FROM vectors WHERE chunk_id = ?');
    for (const row of toDelete) {
      deleteStmt.run(row.chunk_id);
    }
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}
