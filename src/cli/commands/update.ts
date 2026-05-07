import { loadConfig } from '../../core/config.js';
import { scanRepo } from '../../core/scanner.js';
import { openStorageFromConfig } from '../../core/indexer/storageFactory.js';
import { buildIndex } from '../../core/indexer/symbols.js';
import { createLLMClient } from '../../core/llm/client.js';
import { generateModuleDocs } from '../../core/generator/moduleDoc.js';
import { loadState, saveState } from '../../core/state.js';
import { getChanges, getCurrentCommit } from '../../core/incremental/gitDiff.js';
import { analyzeImpact } from '../../core/incremental/impact.js';
import { info, warn } from '../../core/logger.js';

export interface UpdateOptions {
  from?: string;
  to?: string;
  noDocs?: boolean;
  dryRun?: boolean;
  config?: string;
}

export async function runUpdate(cwd: string, options: UpdateOptions): Promise<void> {
  const config = loadConfig(options.config, cwd);

  // Get the from revision
  let fromRev = options.from;
  if (!fromRev) {
    const state = loadState(cwd);
    if (!state) {
      throw new Error('No previous state found. Run `repowiki init` first.');
    }
    fromRev = state.lastProcessedCommit;
  }

  const toRev = options.to ?? 'HEAD';
  info('update', `Computing changes from ${fromRev.slice(0, 8)} to ${toRev}...`);

  const changes = getChanges(fromRev, toRev, cwd);
  if (changes.length === 0) {
    info('update', 'No changes detected.');
    return;
  }

  info('update', `Found ${changes.length} changed files`);

  const storage = openStorageFromConfig(config, cwd);

  try {
    const impact = analyzeImpact(changes, storage);

    if (options.dryRun) {
      info('update', `Would update:`);
      info('update', `  - ${impact.deletedFiles.length} deleted files`);
      info('update', `  - ${impact.affectedFiles.length} modified/added files`);
      info('update', `  - ${impact.affectedModules.length} affected modules: ${impact.affectedModules.join(', ')}`);
      return;
    }

    // Remove deleted files from index
    for (const deletedFile of impact.deletedFiles) {
      storage.deleteFile(deletedFile);
      info('update', `Removed ${deletedFile} from index`);
    }

    // Rescan affected files
    info('update', 'Rescanning affected files...');
    const files = await scanRepo(config, cwd);
    const affectedFiles = files.filter(f => impact.affectedFiles.includes(f.path));

    if (affectedFiles.length > 0) {
      buildIndex(affectedFiles, storage, cwd);
    }

    // Regenerate docs for affected modules
    if (!options.noDocs && impact.affectedModules.length > 0) {
      info('update', 'Regenerating affected module docs...');
      const llm = await createLLMClient(config.llm);
      for (const moduleName of impact.affectedModules) {
        await generateModuleDocs(storage, config, llm, cwd, { moduleName });
      }
    }

    // Save new state
    try {
      const commit = getCurrentCommit(cwd);
      saveState(cwd, {
        lastProcessedCommit: commit,
        lastRunTimestamp: new Date().toISOString(),
        version: '0.1.0',
      });
      info('update', `State saved (commit: ${commit.slice(0, 8)})`);
    } catch {
      warn('update', 'Could not save state (not a git repository?)');
    }

    info('update', 'Update complete!');
  } finally {
    storage.close();
  }
}
