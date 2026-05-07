import type { FileRecord } from '../scanner.js';
import type { ParsedEntity, CodeRelation } from '../parser/index.js';

export interface AsyncIndexStorage {
  init(): Promise<void>;
  close(): Promise<void>;
  upsertFile(file: FileRecord, hash: string): Promise<number>;
  getFileByPath(filePath: string): Promise<{ id: number; hash: string } | null>;
  upsertSymbols(fileId: number, entities: ParsedEntity[]): Promise<void>;
  upsertRelations(relations: CodeRelation[]): Promise<void>;
  deleteFile(filePath: string): Promise<void>;
  getAllSymbols(): Promise<ParsedEntity[]>;
  getSymbolsByFile(filePath: string): Promise<ParsedEntity[]>;
  getSymbolsByKind(kind: string): Promise<ParsedEntity[]>;
  getRelationsByFrom(fromId: string): Promise<CodeRelation[]>;
  getRelationsByType(type: string): Promise<CodeRelation[]>;
  clearAll(): Promise<void>;
}

export interface PostgresStorageConfig {
  url: string;
  vectorDimension?: number; // default 1536
}

export async function openPostgresStorage(config: PostgresStorageConfig): Promise<AsyncIndexStorage> {
  const pg = await import('pg');
  const client = new pg.Client({ connectionString: config.url });
  await client.connect();

  // Create tables
  await client.query(`
    CREATE TABLE IF NOT EXISTS files (
      id SERIAL PRIMARY KEY,
      path TEXT NOT NULL UNIQUE,
      language TEXT NOT NULL,
      hash TEXT NOT NULL,
      size INTEGER NOT NULL,
      last_modified BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS symbols (
      id TEXT PRIMARY KEY,
      file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      start_line INTEGER NOT NULL,
      end_line INTEGER NOT NULL,
      parents TEXT,
      doc TEXT
    );

    CREATE TABLE IF NOT EXISTS relations (
      id SERIAL PRIMARY KEY,
      from_symbol_id TEXT NOT NULL,
      to_symbol_id TEXT NOT NULL,
      type TEXT NOT NULL,
      UNIQUE(from_symbol_id, to_symbol_id, type)
    );

    CREATE INDEX IF NOT EXISTS idx_symbols_file ON symbols(file_id);
    CREATE INDEX IF NOT EXISTS idx_symbols_kind ON symbols(kind);
    CREATE INDEX IF NOT EXISTS idx_relations_from ON relations(from_symbol_id);
    CREATE INDEX IF NOT EXISTS idx_relations_to ON relations(to_symbol_id);
  `);

  const storage: AsyncIndexStorage = {
    async init() {
      // Tables already created above
    },

    async close() {
      await client.end();
    },

    async upsertFile(file: FileRecord, hash: string): Promise<number> {
      const result = await client.query(
        `INSERT INTO files (path, language, hash, size, last_modified)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT(path) DO UPDATE SET
           language = EXCLUDED.language,
           hash = EXCLUDED.hash,
           size = EXCLUDED.size,
           last_modified = EXCLUDED.last_modified
         RETURNING id`,
        [file.path, file.language, hash, file.size, file.lastModified]
      );
      return result.rows[0].id;
    },

    async getFileByPath(filePath: string): Promise<{ id: number; hash: string } | null> {
      const result = await client.query(
        'SELECT id, hash FROM files WHERE path = $1',
        [filePath]
      );
      return result.rows[0] ?? null;
    },

    async upsertSymbols(fileId: number, entities: ParsedEntity[]): Promise<void> {
      await client.query('BEGIN');
      try {
        await client.query('DELETE FROM symbols WHERE file_id = $1', [fileId]);
        for (const entity of entities) {
          await client.query(
            `INSERT INTO symbols (id, file_id, kind, name, start_line, end_line, parents, doc)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              entity.id,
              fileId,
              entity.kind,
              entity.name,
              entity.range.startLine,
              entity.range.endLine,
              JSON.stringify(entity.parents),
              entity.doc,
            ]
          );
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    },

    async upsertRelations(relations: CodeRelation[]): Promise<void> {
      await client.query('BEGIN');
      try {
        for (const rel of relations) {
          await client.query(
            `INSERT INTO relations (from_symbol_id, to_symbol_id, type)
             VALUES ($1, $2, $3)
             ON CONFLICT DO NOTHING`,
            [rel.from, rel.to, rel.type]
          );
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    },

    async deleteFile(filePath: string): Promise<void> {
      await client.query('BEGIN');
      try {
        const fileResult = await client.query(
          'SELECT id FROM files WHERE path = $1',
          [filePath]
        );
        if (fileResult.rows[0]) {
          const fileId = fileResult.rows[0].id;
          // Get symbol IDs before deleting
          const symbolResult = await client.query(
            'SELECT id FROM symbols WHERE file_id = $1',
            [fileId]
          );
          const symbolIds = symbolResult.rows.map((r: { id: string }) => r.id);

          if (symbolIds.length > 0) {
            await client.query(
              `DELETE FROM relations WHERE from_symbol_id = ANY($1) OR to_symbol_id = ANY($1)`,
              [symbolIds]
            );
          }

          await client.query('DELETE FROM symbols WHERE file_id = $1', [fileId]);
          await client.query('DELETE FROM files WHERE id = $1', [fileId]);
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    },

    async getAllSymbols(): Promise<ParsedEntity[]> {
      const result = await client.query(
        `SELECT s.*, f.path FROM symbols s JOIN files f ON s.file_id = f.id`
      );
      return result.rows.map((row: { id: string; kind: string; name: string; path: string; start_line: number; end_line: number; parents: string; doc: string | null }) => ({
        id: row.id,
        kind: row.kind as ParsedEntity['kind'],
        name: row.name,
        file: row.path,
        range: { startLine: row.start_line, endLine: row.end_line },
        parents: JSON.parse(row.parents || '[]'),
        doc: row.doc,
      }));
    },

    async getSymbolsByFile(filePath: string): Promise<ParsedEntity[]> {
      const result = await client.query(
        `SELECT s.* FROM symbols s JOIN files f ON s.file_id = f.id WHERE f.path = $1`,
        [filePath]
      );
      return result.rows.map((row: { id: string; kind: string; name: string; start_line: number; end_line: number; parents: string; doc: string | null }) => ({
        id: row.id,
        kind: row.kind as ParsedEntity['kind'],
        name: row.name,
        file: filePath,
        range: { startLine: row.start_line, endLine: row.end_line },
        parents: JSON.parse(row.parents || '[]'),
        doc: row.doc,
      }));
    },

    async getSymbolsByKind(kind: string): Promise<ParsedEntity[]> {
      const result = await client.query(
        `SELECT s.*, f.path FROM symbols s JOIN files f ON s.file_id = f.id WHERE s.kind = $1`,
        [kind]
      );
      return result.rows.map((row: { id: string; kind: string; name: string; path: string; start_line: number; end_line: number; parents: string; doc: string | null }) => ({
        id: row.id,
        kind: row.kind as ParsedEntity['kind'],
        name: row.name,
        file: row.path,
        range: { startLine: row.start_line, endLine: row.end_line },
        parents: JSON.parse(row.parents || '[]'),
        doc: row.doc,
      }));
    },

    async getRelationsByFrom(fromId: string): Promise<CodeRelation[]> {
      const result = await client.query(
        'SELECT * FROM relations WHERE from_symbol_id = $1',
        [fromId]
      );
      return result.rows.map((row: { from_symbol_id: string; to_symbol_id: string; type: string }) => ({
        from: row.from_symbol_id,
        to: row.to_symbol_id,
        type: row.type as CodeRelation['type'],
      }));
    },

    async getRelationsByType(type: string): Promise<CodeRelation[]> {
      const result = await client.query(
        'SELECT * FROM relations WHERE type = $1',
        [type]
      );
      return result.rows.map((row: { from_symbol_id: string; to_symbol_id: string; type: string }) => ({
        from: row.from_symbol_id,
        to: row.to_symbol_id,
        type: row.type as CodeRelation['type'],
      }));
    },

    async clearAll(): Promise<void> {
      await client.query('BEGIN');
      try {
        await client.query('DELETE FROM relations');
        await client.query('DELETE FROM symbols');
        await client.query('DELETE FROM files');
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    },
  };

  return storage;
}
