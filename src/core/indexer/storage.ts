import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import type { FileRecord } from '../scanner.js';
import type { ParsedEntity, CodeRelation } from '../parser/index.js';

export interface IndexStorage {
  init(): void;
  close(): void;
  upsertFile(file: FileRecord, hash: string): number;
  getFileByPath(filePath: string): { id: number; hash: string } | null;
  upsertSymbols(fileId: number, entities: ParsedEntity[]): void;
  upsertRelations(relations: CodeRelation[]): void;
  deleteFile(filePath: string): void;
  getAllSymbols(): ParsedEntity[];
  getSymbolsByFile(filePath: string): ParsedEntity[];
  getSymbolsByKind(kind: string): ParsedEntity[];
  getRelationsByFrom(fromId: string): CodeRelation[];
  getRelationsByType(type: string): CodeRelation[];
  clearAll(): void;
}

export function openStorage(dbPath: string): IndexStorage {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const storage: IndexStorage = {
    init() {
      db.exec(`
        CREATE TABLE IF NOT EXISTS files (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          path TEXT NOT NULL UNIQUE,
          language TEXT NOT NULL,
          hash TEXT NOT NULL,
          size INTEGER NOT NULL,
          last_modified INTEGER NOT NULL
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
          id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    },

    close() {
      db.close();
    },

    upsertFile(file: FileRecord, hash: string): number {
      const stmt = db.prepare(`
        INSERT INTO files (path, language, hash, size, last_modified)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(path) DO UPDATE SET
          language = excluded.language,
          hash = excluded.hash,
          size = excluded.size,
          last_modified = excluded.last_modified
      `);
      stmt.run(file.path, file.language, hash, file.size, file.lastModified);
      const row = db.prepare('SELECT id FROM files WHERE path = ?').get(file.path) as
        | { id: number }
        | undefined;
      if (!row) {
        throw new Error(`Failed to upsert file: ${file.path}`);
      }
      return row.id;
    },

    getFileByPath(filePath: string): { id: number; hash: string } | null {
      const row = db.prepare('SELECT id, hash FROM files WHERE path = ?').get(filePath) as
        | { id: number; hash: string }
        | undefined;
      return row ?? null;
    },

    upsertSymbols(fileId: number, entities: ParsedEntity[]): void {
      const deleteStmt = db.prepare('DELETE FROM symbols WHERE file_id = ?');
      const insertStmt = db.prepare(`
        INSERT INTO symbols (id, file_id, kind, name, start_line, end_line, parents, doc)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const upsert = db.transaction(() => {
        deleteStmt.run(fileId);
        for (const entity of entities) {
          insertStmt.run(
            entity.id,
            fileId,
            entity.kind,
            entity.name,
            entity.range.startLine,
            entity.range.endLine,
            JSON.stringify(entity.parents),
            entity.doc,
          );
        }
      });
      upsert();
    },

    upsertRelations(relations: CodeRelation[]): void {
      const stmt = db.prepare(`
        INSERT OR IGNORE INTO relations (from_symbol_id, to_symbol_id, type)
        VALUES (?, ?, ?)
      `);

      const insert = db.transaction(() => {
        for (const rel of relations) {
          stmt.run(rel.from, rel.to, rel.type);
        }
      });
      insert();
    },

    deleteFile(filePath: string): void {
      const file = db.prepare('SELECT id FROM files WHERE path = ?').get(filePath) as
        | { id: number }
        | undefined;
      if (file) {
        // Get symbol IDs before deleting to cascade relations
        const symbolIds = db.prepare('SELECT id FROM symbols WHERE file_id = ?')
          .all(file.id) as Array<{ id: string }>;
        if (symbolIds.length > 0) {
          const placeholders = symbolIds.map(() => '?').join(',');
          db.prepare(`DELETE FROM relations WHERE from_symbol_id IN (${placeholders}) OR to_symbol_id IN (${placeholders})`)
            .run(...symbolIds.map(s => s.id), ...symbolIds.map(s => s.id));
        }
        db.prepare('DELETE FROM symbols WHERE file_id = ?').run(file.id);
        db.prepare('DELETE FROM files WHERE id = ?').run(file.id);
      }
    },

    getAllSymbols(): ParsedEntity[] {
      const rows = db.prepare('SELECT * FROM symbols').all() as Array<{
        id: string;
        kind: string;
        name: string;
        file_id: number;
        start_line: number;
        end_line: number;
        parents: string;
        doc: string | null;
      }>;

      // We need to get file paths for each symbol
      const fileCache = new Map<number, string>();
      const getFilePath = (fileId: number): string => {
        if (!fileCache.has(fileId)) {
          const row = db.prepare('SELECT path FROM files WHERE id = ?').get(fileId) as
            | { path: string }
            | undefined;
          fileCache.set(fileId, row?.path ?? '');
        }
        return fileCache.get(fileId) ?? '';
      };

      return rows.map(row => ({
        id: row.id,
        kind: row.kind as ParsedEntity['kind'],
        name: row.name,
        file: getFilePath(row.file_id),
        range: { startLine: row.start_line, endLine: row.end_line },
        parents: JSON.parse(row.parents || '[]'),
        doc: row.doc,
      }));
    },

    getSymbolsByFile(filePath: string): ParsedEntity[] {
      const file = db.prepare('SELECT id FROM files WHERE path = ?').get(filePath) as
        | { id: number }
        | undefined;
      if (!file) return [];

      const rows = db.prepare('SELECT * FROM symbols WHERE file_id = ?').all(file.id) as Array<{
        id: string;
        kind: string;
        name: string;
        start_line: number;
        end_line: number;
        parents: string;
        doc: string | null;
      }>;

      return rows.map(row => ({
        id: row.id,
        kind: row.kind as ParsedEntity['kind'],
        name: row.name,
        file: filePath,
        range: { startLine: row.start_line, endLine: row.end_line },
        parents: JSON.parse(row.parents || '[]'),
        doc: row.doc,
      }));
    },

    getSymbolsByKind(kind: string): ParsedEntity[] {
      const rows = db.prepare('SELECT s.*, f.path FROM symbols s JOIN files f ON s.file_id = f.id WHERE s.kind = ?').all(kind) as Array<{
        id: string;
        kind: string;
        name: string;
        path: string;
        start_line: number;
        end_line: number;
        parents: string;
        doc: string | null;
      }>;

      return rows.map(row => ({
        id: row.id,
        kind: row.kind as ParsedEntity['kind'],
        name: row.name,
        file: row.path,
        range: { startLine: row.start_line, endLine: row.end_line },
        parents: JSON.parse(row.parents || '[]'),
        doc: row.doc,
      }));
    },

    getRelationsByFrom(fromId: string): CodeRelation[] {
      const rows = db.prepare('SELECT * FROM relations WHERE from_symbol_id = ?').all(fromId) as Array<{
        from_symbol_id: string;
        to_symbol_id: string;
        type: string;
      }>;

      return rows.map(row => ({
        from: row.from_symbol_id,
        to: row.to_symbol_id,
        type: row.type as CodeRelation['type'],
      }));
    },

    getRelationsByType(type: string): CodeRelation[] {
      const rows = db.prepare('SELECT * FROM relations WHERE type = ?').all(type) as Array<{
        from_symbol_id: string;
        to_symbol_id: string;
        type: string;
      }>;

      return rows.map(row => ({
        from: row.from_symbol_id,
        to: row.to_symbol_id,
        type: row.type as CodeRelation['type'],
      }));
    },

    clearAll() {
      const clear = db.transaction(() => {
        db.exec('DELETE FROM relations');
        db.exec('DELETE FROM symbols');
        db.exec('DELETE FROM files');
      });
      clear();
    },
  };

  storage.init();
  return storage;
}
