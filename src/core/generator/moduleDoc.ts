import fs from 'node:fs';
import path from 'node:path';
import type { IndexStorage } from '../indexer/storage.js';
import type { WikichanConfig } from '../config.js';
import type { LLMClient } from '../llm/client.js';
import type { ModuleDocInput } from './templates.js';
import { buildModuleDocPrompt } from './templates.js';
import { getModules, getModuleByName } from '../indexer/graph.js';
import { info } from '../logger.js';

const MAX_SNIPPET_TOKENS = 8000; // Approximate token limit for code snippets

export async function generateModuleDocs(
  storage: IndexStorage,
  config: WikichanConfig,
  llm: LLMClient,
  cwd: string,
  options?: { moduleName?: string; ragContext?: string },
): Promise<{ moduleName: string; content: string }[]> {
  info('gen', 'Generating module documentation...');

  const modules = options?.moduleName
    ? [getModuleByName(storage, options.moduleName)].filter(Boolean)
    : getModules(storage);

  const results: { moduleName: string; content: string }[] = [];

  for (const mod of modules) {
    if (!mod) continue;

    info('gen', `Generating docs for module: ${mod.name}`);

    // Get relations involving this module's symbols
    const symbolIds = new Set(mod.symbols.map(s => s.id));
    const allImportRelations = storage.getRelationsByType('IMPORTS');
    const moduleRelations = allImportRelations.filter(
      r => symbolIds.has(r.from) || symbolIds.has(r.to)
    );

    // Extract code snippets for important symbols
    const importantSymbols = mod.symbols
      .filter(s => s.kind === 'class' || s.kind === 'function' || s.kind === 'method')
      .slice(0, 20);

    const sourceSnippets: { symbolId: string; code: string }[] = [];
    let totalChars = 0;

    for (const symbol of importantSymbols) {
      const filePath = path.join(cwd, symbol.file);
      try {
        const source = fs.readFileSync(filePath, 'utf-8');
        const lines = source.split('\n');
        const snippet = lines
          .slice(symbol.range.startLine - 1, symbol.range.endLine)
          .join('\n');

        if (totalChars + snippet.length > MAX_SNIPPET_TOKENS * 3) break; // Conservative char-to-token ratio
        sourceSnippets.push({ symbolId: symbol.id, code: snippet });
        totalChars += snippet.length;
      } catch {
        // Skip unreadable files
      }
    }

    const moduleDocInput: ModuleDocInput = {
      name: mod.name,
      symbols: mod.symbols,
      relations: moduleRelations.map(r => ({
        from: r.from,
        to: r.to,
        type: r.type,
      })),
      sourceSnippets,
    };

    const prompt = buildModuleDocPrompt(moduleDocInput);

    // Append RAG context if available
    if (options?.ragContext) {
      prompt.userPrompt = `${options.ragContext}\n\n${prompt.userPrompt}`;
    }

    const response = await llm.chat(prompt);

    results.push({ moduleName: mod.name, content: response.content });

    // Write to output
    const outputPath = path.join(
      cwd,
      config.output.root,
      config.output.structure.modulesDir,
      `${mod.name}.md`
    );
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    fs.writeFileSync(outputPath, response.content, 'utf-8');

    info('gen', `Module doc written to ${outputPath}`);
  }

  return results;
}
