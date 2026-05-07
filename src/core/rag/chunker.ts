import fs from 'node:fs';
import path from 'node:path';
import type { ParsedEntity } from '../parser/index.js';
import { warn } from '../logger.js';

export interface CodeChunk {
  chunkId: string;
  file: string;
  symbolId: string;
  content: string;
  meta: {
    module?: string;
    doc?: string | null;
    imports?: string[];
  };
}

const CONTEXT_LINES = 5;

export function chunkBySymbol(
  entities: ParsedEntity[],
  sourceMap: Map<string, string>,
  cwd: string,
): CodeChunk[] {
  const chunks: CodeChunk[] = [];

  for (const entity of entities) {
    // Skip module entities
    if (entity.kind === 'module') continue;

    const source = sourceMap.get(entity.file);
    if (!source) {
      warn('rag', `Source not found for ${entity.file}`);
      continue;
    }

    const lines = source.split('\n');
    const startLine = Math.max(0, entity.range.startLine - 1 - CONTEXT_LINES);
    const endLine = Math.min(lines.length, entity.range.endLine + CONTEXT_LINES);

    const content = lines.slice(startLine, endLine).join('\n');

    // Find parent module
    const moduleEntity = entities.find(
      e => e.kind === 'module' && e.file === entity.file
    );

    chunks.push({
      chunkId: `${entity.file}:${entity.name}`,
      file: entity.file,
      symbolId: entity.id,
      content,
      meta: {
        module: moduleEntity?.name,
        doc: entity.doc,
        imports: [],
      },
    });
  }

  return chunks;
}

export function buildEmbeddingText(chunk: CodeChunk): string {
  const parts: string[] = [];

  if (chunk.meta.module) {
    parts.push(`Module: ${chunk.meta.module}`);
  }

  if (chunk.meta.doc) {
    parts.push(`Documentation: ${chunk.meta.doc}`);
  }

  parts.push(`File: ${chunk.file}`);
  parts.push(`Symbol: ${chunk.symbolId}`);
  parts.push('');
  parts.push(chunk.content);

  return parts.join('\n');
}
