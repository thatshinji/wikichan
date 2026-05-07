import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import type { FileRecord } from '../scanner.js';
import type { IndexStorage } from './storage.js';
import type { ParsedEntity, CodeRelation } from '../parser/index.js';
import { getParser } from '../parser/index.js';
import { info, debug } from '../logger.js';

export interface BuildIndexResult {
  fileCount: number;
  symbolCount: number;
  relationCount: number;
}

function computeHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

const BATCH_SIZE = 200;

export function buildIndex(files: FileRecord[], storage: IndexStorage, cwd: string): BuildIndexResult {
  let fileCount = 0;
  let symbolCount = 0;
  let relationCount = 0;

  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    const batchEntities: { fileId: number; entities: ParsedEntity[]; relations: CodeRelation[] }[] = [];

    for (const file of batch) {
      const absPath = path.join(cwd, file.path);
      let source: string;
      try {
        source = fs.readFileSync(absPath, 'utf-8');
      } catch {
        debug('index', `Cannot read file: ${file.path}`);
        continue;
      }

      const hash = computeHash(source);

      // Skip if file hasn't changed
      const existing = storage.getFileByPath(file.path);
      if (existing && existing.hash === hash) {
        debug('index', `Skipping unchanged file: ${file.path}`);
        continue;
      }

      // Parse the file
      const parser = getParser(file.language);
      const { entities, relations } = parser.parseFile(file, source);

      // Store file and collect symbols/relations for batch insert
      const fileId = storage.upsertFile(file, hash);
      batchEntities.push({ fileId, entities, relations });

      fileCount++;
      symbolCount += entities.length;
      relationCount += relations.length;
    }

    // Batch insert symbols and relations
    for (const { fileId, entities, relations } of batchEntities) {
      storage.upsertSymbols(fileId, entities);
      storage.upsertRelations(relations);
    }

    if (fileCount > 0 && fileCount % 100 === 0) {
      info('index', `Indexed ${fileCount} files...`);
    }
  }

  info('index', `Index built: ${fileCount} files, ${symbolCount} symbols, ${relationCount} relations`);
  return { fileCount, symbolCount, relationCount };
}
