import { loadConfig } from '../../core/config.js';
import { scanRepo } from '../../core/scanner.js';
import { openStorageFromConfig } from '../../core/indexer/storageFactory.js';
import { buildIndex } from '../../core/indexer/symbols.js';
import { buildVectorIndex } from '../../core/rag/pipeline.js';
import { info } from '../../core/logger.js';

export interface ScanOptions {
  full?: boolean;
  languages?: string;
  dryRun?: boolean;
  config?: string;
}

export async function runScan(cwd: string, options: ScanOptions): Promise<void> {
  const config = loadConfig(options.config, cwd);

  // Override languages if specified
  if (options.languages) {
    config.languages = options.languages.split(',').map(s => s.trim());
  }

  info('scan', 'Scanning repository...');
  const files = await scanRepo(config, cwd);

  if (options.dryRun) {
    const langCounts = new Map<string, number>();
    for (const file of files) {
      langCounts.set(file.language, (langCounts.get(file.language) ?? 0) + 1);
    }
    const stats = Array.from(langCounts.entries())
      .map(([lang, count]) => `${lang}: ${count}`)
      .join(', ');
    info('scan', `Would scan ${files.length} files (${stats})`);
    return;
  }

  const storage = openStorageFromConfig(config, cwd);

  try {
    if (options.full) {
      info('scan', 'Clearing existing index...');
      storage.clearAll();
    }

    const result = buildIndex(files, storage, cwd);
    info('scan', `Scan complete: ${result.fileCount} files, ${result.symbolCount} symbols, ${result.relationCount} relations`);

    // Build vector index if RAG is enabled
    if (config.vector.enabled) {
      await buildVectorIndex(storage, config, cwd);
    }
  } finally {
    storage.close();
  }
}
