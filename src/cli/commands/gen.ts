import { loadConfig } from '../../core/config.js';
import { openStorageFromConfig } from '../../core/indexer/storageFactory.js';
import { createLLMClient } from '../../core/llm/client.js';
import { generateOverview } from '../../core/generator/overview.js';
import { generateModuleDocs } from '../../core/generator/moduleDoc.js';
import { generateApiDocs } from '../../core/generator/apiDoc.js';
import { generateConfigDocs } from '../../core/generator/configDoc.js';
import { getModules } from '../../core/indexer/graph.js';
import { queryContext } from '../../core/rag/pipeline.js';
import { info } from '../../core/logger.js';

export interface GenOptions {
  all?: boolean;
  module?: string;
  type?: string;
  outputDir?: string;
  dryRun?: boolean;
  config?: string;
}

export async function runGen(cwd: string, options: GenOptions): Promise<void> {
  const config = loadConfig(options.config, cwd);

  if (options.outputDir) {
    config.output.root = options.outputDir;
  }

  const storage = openStorageFromConfig(config, cwd);

  try {
    if (options.dryRun) {
      const modules = getModules(storage);
      info('gen', `Would generate:`);
      if (!options.type || options.type === 'overview') {
        info('gen', `  - overview: ${config.output.root}/${config.output.structure.overview}`);
      }
      if (!options.type || options.type === 'module') {
        const targetModules = options.module
          ? modules.filter(m => m.name === options.module)
          : modules;
        for (const mod of targetModules) {
          info('gen', `  - module: ${config.output.root}/${config.output.structure.modulesDir}/${mod.name}.md`);
        }
      }
      if (!options.type || options.type === 'api') {
        info('gen', `  - api: ${config.output.root}/${config.output.structure.apisDir}/api.md`);
      }
      if (!options.type || options.type === 'config') {
        info('gen', `  - config: ${config.output.root}/${config.output.structure.config}`);
      }
      return;
    }

    const llm = await createLLMClient(config.llm);

    // Query RAG context if enabled
    let ragContext = '';
    if (config.vector.enabled) {
      info('gen', 'Querying vector store for relevant context...');
      ragContext = await queryContext('project architecture and key modules', config);
    }

    // Generate overview
    if (!options.type || options.type === 'overview') {
      await generateOverview(storage, config, llm, cwd, ragContext);
    }

    // Generate module docs
    if (!options.type || options.type === 'module') {
      await generateModuleDocs(storage, config, llm, cwd, {
        moduleName: options.module,
        ragContext,
      });
    }

    // Generate API docs
    if (!options.type || options.type === 'api') {
      await generateApiDocs(storage, config, llm, cwd);
    }

    // Generate config docs
    if (!options.type || options.type === 'config') {
      await generateConfigDocs(storage, config, llm, cwd);
    }

    info('gen', 'Generation complete!');
  } finally {
    storage.close();
  }
}
