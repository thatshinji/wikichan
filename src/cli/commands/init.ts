import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { getDefaultConfig } from '../../core/config.js';
import { ConfigError } from '../../core/errors.js';
import { info, error as logError } from '../../core/logger.js';
import { scanRepo } from '../../core/scanner.js';
import { openStorageFromConfig } from '../../core/indexer/storageFactory.js';
import { buildIndex } from '../../core/indexer/symbols.js';
import { generateOverview } from '../../core/generator/overview.js';
import { generateModuleDocs } from '../../core/generator/moduleDoc.js';
import { createLLMClient } from '../../core/llm/client.js';
import { saveState, loadState } from '../../core/state.js';
import { getCurrentCommit } from '../../core/incremental/gitDiff.js';

export interface InitOptions {
  force?: boolean;
  outputDir?: string;
  noDocs?: boolean;
}

export async function runInit(cwd: string, options: InitOptions): Promise<void> {
  const configPath = path.join(cwd, '.wikichan.yml');

  // Check if config already exists
  if (fs.existsSync(configPath) && !options.force) {
    throw new ConfigError('Config file already exists. Use --force to overwrite.');
  }

  // Generate default config
  const config = getDefaultConfig();
  if (options.outputDir) {
    config.output.root = options.outputDir;
  }

  // Write config file
  fs.writeFileSync(configPath, yaml.dump(config, { indent: 2 }), 'utf-8');
  info('init', `Config written to ${configPath}`);

  // Create .wikichan directory
  const wikichanDir = path.join(cwd, '.wikichan');
  if (!fs.existsSync(wikichanDir)) {
    fs.mkdirSync(wikichanDir, { recursive: true });
  }

  // Run scan and generate unless --no-docs
  if (!options.noDocs) {
    info('init', 'Scanning repository...');
    const files = await scanRepo(config, cwd);

    info('init', 'Building index...');
    const storage = openStorageFromConfig(config, cwd);

    try {
      const indexResult = buildIndex(files, storage, cwd);
      info('init', `Indexed ${indexResult.fileCount} files, ${indexResult.symbolCount} symbols`);

      info('init', 'Generating documentation...');
      const llm = await createLLMClient(config.llm);

      await generateOverview(storage, config, llm, cwd);
      await generateModuleDocs(storage, config, llm, cwd);
    } finally {
      storage.close();
    }
  }

  // Save state
  try {
    const commit = getCurrentCommit(cwd);
    saveState(cwd, {
      lastProcessedCommit: commit,
      lastRunTimestamp: new Date().toISOString(),
      version: '0.1.0',
    });
    info('init', `State saved (commit: ${commit.slice(0, 8)})`);
  } catch {
    info('init', 'Not a git repository, skipping state save');
  }

  info('init', 'Initialization complete!');
}
