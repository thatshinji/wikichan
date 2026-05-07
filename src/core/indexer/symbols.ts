import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import type { FileRecord } from '../scanner.js';
import type { IndexStorage } from './storage.js';
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

export function buildIndex(files: FileRecord[], storage: IndexStorage, cwd: string): BuildIndexResult {
  let fileCount = 0;
  let symbolCount = 0;
  let relationCount = 0;

  for (const file of files) {
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

    // Store in index
    const fileId = storage.upsertFile(file, hash);
    storage.upsertSymbols(fileId, entities);
    storage.upsertRelations(relations);

    fileCount++;
    symbolCount += entities.length;
    relationCount += relations.length;

    if (fileCount % 100 === 0) {
      info('index', `Indexed ${fileCount} files...`);
    }
  }

  info('index', `Index built: ${fileCount} files, ${symbolCount} symbols, ${relationCount} relations`);
  return { fileCount, symbolCount, relationCount };
}
