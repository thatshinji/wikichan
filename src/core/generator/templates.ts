import type { ParsedEntity } from '../parser/index.js';

export interface OverviewInput {
  projectName: string;
  languages: string[];
  topLevelDirs: string[];
  modules: { name: string; symbolCount: number; mainSymbols: string[] }[];
  dependencies: Record<string, string>;
}

export interface ModuleDocInput {
  name: string;
  symbols: ParsedEntity[];
  relations: { from: string; to: string; type: string }[];
  sourceSnippets: { symbolId: string; code: string; language?: string }[];
}

export function buildOverviewPrompt(projectInfo: OverviewInput): {
  systemPrompt: string;
  userPrompt: string;
} {
  const systemPrompt = `You are a technical documentation writer. Generate a clear, well-structured Markdown document for a software project overview.
Output ONLY the Markdown content, no preamble or explanations.`;

  const depList = Object.entries(projectInfo.dependencies)
    .map(([name, version]) => `- ${name}: ${version}`)
    .join('\n');

  const moduleList = projectInfo.modules
    .map(m => `- **${m.name}** (${m.symbolCount} symbols): ${m.mainSymbols.slice(0, 5).join(', ')}`)
    .join('\n');

  const userPrompt = `Generate a project overview document for the following project:

**Project Name:** ${projectInfo.projectName}
**Languages:** ${projectInfo.languages.join(', ')}
**Top-level directories:** ${projectInfo.topLevelDirs.join(', ')}

## Modules
${moduleList || '(no modules detected)'}

## Dependencies
${depList || '(no dependencies found)'}

Please generate a Markdown document with:
1. Project description (infer from structure and dependencies)
2. Architecture overview
3. Module breakdown with brief descriptions
4. Key technologies and external dependencies`;

  return { systemPrompt, userPrompt };
}

export function buildModuleDocPrompt(moduleInfo: ModuleDocInput): {
  systemPrompt: string;
  userPrompt: string;
} {
  const systemPrompt = `You are a technical documentation writer. Generate clear, well-structured Markdown documentation for a software module.
Output ONLY the Markdown content, no preamble or explanations.`;

  const symbolList = moduleInfo.symbols
    .filter(s => s.kind !== 'module')
    .map(s => {
      const doc = s.doc ? ` — ${s.doc.split('\n')[0]}` : '';
      return `- **${s.kind}** \`${s.name}\`${doc}`;
    })
    .join('\n');

  const relationList = moduleInfo.relations
    .map(r => `- ${r.from} --[${r.type}]--> ${r.to}`)
    .join('\n');

  const snippetSection = moduleInfo.sourceSnippets
    .map(s => `### ${s.symbolId}\n\`\`\`${s.language ?? 'text'}\n${s.code}\n\`\`\``)
    .join('\n\n');

  const userPrompt = `Generate documentation for the **${moduleInfo.name}** module.

## Symbols
${symbolList || '(no symbols)'}

## Relations
${relationList || '(no relations)'}

## Source Code Snippets
${snippetSection || '(no snippets)'}

Please generate a Markdown document with:
1. Module responsibility and purpose
2. Public interfaces (exported symbols)
3. Internal key classes/functions
4. Dependencies and dependents
5. Example usage patterns (if inferable)`;

  return { systemPrompt, userPrompt };
}
