import fs from 'node:fs';
import path from 'node:path';
import type { IndexStorage } from '../indexer/storage.js';
import type { WikichanConfig } from '../config.js';
import type { ParsedEntity } from '../parser/index.js';
import { chunkBySymbol, buildEmbeddingText, type CodeChunk } from './chunker.js';
import { createEmbeddingProvider, embedChunk, type EmbeddingProvider } from './embedder.js';
import { createVectorStore, type VectorStore } from './vectorStore.js';
import { info, debug, warn } from '../logger.js';

export async function buildVectorIndex(
  storage: IndexStorage,
  config: WikichanConfig,
  cwd: string,
): Promise<void> {
  if (!config.embedding) {
    info('rag', 'No embedding config found, skipping vector index build');
    return;
  }

  info('rag', 'Building vector index...');

  const allSymbols = storage.getAllSymbols();
  if (allSymbols.length === 0) {
    info('rag', 'No symbols to index');
    return;
  }

  // Build source map for chunking
  const sourceMap = new Map<string, string>();
  const files = new Set(allSymbols.map(s => s.file));
  for (const file of files) {
    const absPath = path.join(cwd, file);
    try {
      sourceMap.set(file, fs.readFileSync(absPath, 'utf-8'));
    } catch {
      debug('rag', `Cannot read file for chunking: ${file}`);
    }
  }

  // Create chunks
  const chunks = chunkBySymbol(allSymbols, sourceMap, cwd);
  info('rag', `Created ${chunks.length} code chunks`);

  // Create embedding provider and vector store
  const embedder = createEmbeddingProvider(config.embedding);
  const vectorDbPath = config.storage.sqlite.file.replace(/[^/\\]+$/, 'vectors.db');
  const vectorStore = await createVectorStore({
    type: config.vector.type as 'pgvector' | 'sqlite',
    sqlite: { file: vectorDbPath },
  });
  await vectorStore.init();

  try {
    // Embed and store each chunk
    let stored = 0;
    for (const chunk of chunks) {
      try {
        const embedding = await embedChunk(chunk, embedder);
        await vectorStore.upsertEmbedding(chunk.chunkId, embedding, {
          file: chunk.file,
          symbolId: chunk.symbolId,
          content: chunk.content,
          ...chunk.meta,
        });
        stored++;
        if (stored % 50 === 0) {
          info('rag', `Embedded ${stored}/${chunks.length} chunks...`);
        }
      } catch (err) {
        warn('rag', `Failed to embed chunk ${chunk.chunkId}: ${err}`);
      }
    }

    info('rag', `Vector index built: ${stored} chunks stored`);
  } finally {
    await vectorStore.close();
  }
}

export async function queryContext(
  query: string,
  config: WikichanConfig,
  topK: number = 5,
): Promise<string> {
  if (!config.embedding) {
    return '';
  }

  const embedder = createEmbeddingProvider(config.embedding);
  const vectorDbPath = config.storage.sqlite.file.replace(/[^/\\]+$/, 'vectors.db');
  const vectorStore = await createVectorStore({
    type: config.vector.type as 'pgvector' | 'sqlite',
    sqlite: { file: vectorDbPath },
  });
  await vectorStore.init();

  try {
    const queryEmbedding = await embedder.embed(query);
    const results = await vectorStore.querySimilar(query, queryEmbedding, topK);

    if (results.length === 0) {
      return '';
    }

    const context = results
      .map(r => `### ${r.symbolId} (${r.file})\n${r.content}`)
      .join('\n\n');

    return `## Relevant Code Context\n\n${context}`;
  } finally {
    await vectorStore.close();
  }
}
