import type { ParsedEntity } from '../parser/index.js';

export interface OverviewInput {
  projectName: string;
  languages: string[];
  topLevelDirs: string[];
  modules: { name: string; symbolCount: number; mainSymbols: string[] }[];
  dependencies: Record<string, string>;
  /** Source files for citation context */
  sourceFiles?: string[];
}

export interface ModuleDocInput {
  name: string;
  symbols: ParsedEntity[];
  relations: { from: string; to: string; type: string }[];
  sourceSnippets: { symbolId: string; code: string; language?: string }[];
  /** Source files for citation context */
  sourceFiles?: string[];
}

const SECTION_NAMES: Record<string, { intro: string; structure: string; components: string; architecture: string; analysis: string; deps: string; performance: string; troubleshooting: string; conclusion: string; appendix: string; toc: string; figureSource: string; sectionSource: string; citeTitle: string }> = {
  zh: {
    intro: '简介', structure: '项目结构', components: '核心组件',
    architecture: '架构总览', analysis: '详细组件分析', deps: '依赖分析',
    performance: '性能考虑', troubleshooting: '故障排查指南',
    conclusion: '结论', appendix: '附录', toc: '目录',
    figureSource: '图表来源', sectionSource: '章节来源',
    citeTitle: '本文引用的文件',
  },
  en: {
    intro: 'Introduction', structure: 'Project Structure', components: 'Core Components',
    architecture: 'Architecture Overview', analysis: 'Detailed Component Analysis', deps: 'Dependency Analysis',
    performance: 'Performance Considerations', troubleshooting: 'Troubleshooting Guide',
    conclusion: 'Conclusion', appendix: 'Appendix', toc: 'Table of Contents',
    figureSource: 'Figure Sources', sectionSource: 'Section Sources',
    citeTitle: 'Referenced Files',
  },
  es: {
    intro: 'Introducción', structure: 'Estructura del Proyecto', components: 'Componentes Principales',
    architecture: 'Vista General de Arquitectura', analysis: 'Análisis Detallado de Componentes', deps: 'Análisis de Dependencias',
    performance: 'Consideraciones de Rendimiento', troubleshooting: 'Guía de Solución de Problemas',
    conclusion: 'Conclusión', appendix: 'Apéndice', toc: 'Tabla de Contenidos',
    figureSource: 'Fuentes de Figuras', sectionSource: 'Fuentes de Secciones',
    citeTitle: 'Archivos Referenciados',
  },
  ja: {
    intro: 'はじめに', structure: 'プロジェクト構造', components: 'コアコンポーネント',
    architecture: 'アーキテクチャ概要', analysis: '詳細コンポーネント分析', deps: '依存関係分析',
    performance: 'パフォーマンス考慮事項', troubleshooting: 'トラブルシューティングガイド',
    conclusion: '結論', appendix: '付録', toc: '目次',
    figureSource: '図表出典', sectionSource: 'セクション出典',
    citeTitle: '参照ファイル',
  },
};

export function getSectionNames(lang: string) {
  return SECTION_NAMES[lang] ?? SECTION_NAMES['en'];
}

export function buildLanguageInstruction(lang: string): string {
  const langNames: Record<string, string> = {
    zh: '中文 (Chinese)', en: 'English', es: 'Español (Spanish)',
    ja: '日本語 (Japanese)', ko: '한국어 (Korean)', fr: 'Français (French)',
    de: 'Deutsch (German)', pt: 'Português (Portuguese)', ru: 'Русский (Russian)',
  };
  return langNames[lang] ?? lang;
}

function buildCommonRequirements(lang: string, sn: ReturnType<typeof getSectionNames>): string {
  const langName = buildLanguageInstruction(lang);
  return `Requirements:
- Write ALL content in ${langName}
- Start the document with a <cite> block listing all referenced source files (title: ${sn.citeTitle})
- Include a table of contents (## ${sn.toc}) with anchor links
- Add Mermaid diagrams after major sections (flowcharts, architecture diagrams, sequence diagrams, etc.)
- After diagrams and sections, cite sources (${sn.figureSource} / ${sn.sectionSource}), format: [filename:lines](file://path#Lstart-Lend)
- Output ONLY Markdown content, no preamble or explanations`;
}

function buildSectionList(sn: ReturnType<typeof getSectionNames>): string {
  return `1. ${sn.intro} — Project purpose, target users, core value
2. ${sn.structure} — Directory organization, module layout, with Mermaid architecture diagram
3. ${sn.components} — Responsibilities of each module/component
4. ${sn.architecture} — Layered design, data flow, module interactions, with Mermaid diagram
5. ${sn.analysis} — Deep analysis of each core component (algorithms, implementation, configuration), with Mermaid flowcharts/sequence diagrams
6. ${sn.deps} — External dependencies and internal module coupling, with Mermaid dependency graph
7. ${sn.performance} — Performance optimization strategies, bottleneck analysis
8. ${sn.troubleshooting} — Common issues and resolution steps
9. ${sn.conclusion} — Summary and outlook
10. ${sn.appendix} — API reference, configuration parameters, usage examples`;
}

export function buildOverviewPrompt(projectInfo: OverviewInput, language = 'zh'): {
  systemPrompt: string;
  userPrompt: string;
} {
  const sn = getSectionNames(language);
  const langName = buildLanguageInstruction(language);

  const systemPrompt = `You are a technical documentation expert. Generate a comprehensive, well-structured Markdown project overview document based on the provided project information.

${buildCommonRequirements(language, sn)}

Document structure (adjust as appropriate for the project):
${buildSectionList(sn)}`;

  const depList = Object.entries(projectInfo.dependencies)
    .map(([name, version]) => `- ${name}: ${version}`)
    .join('\n');

  const moduleList = projectInfo.modules
    .map(m => `- **${m.name}** (${m.symbolCount} symbols): ${m.mainSymbols.slice(0, 5).join(', ')}`)
    .join('\n');

  const sourceFileList = (projectInfo.sourceFiles ?? [])
    .map(f => `- ${f}`)
    .join('\n');

  const userPrompt = `Generate a project overview document in ${langName} for the following project:

**Project Name:** ${projectInfo.projectName}
**Languages:** ${projectInfo.languages.join(', ')}
**Top-level directories:** ${projectInfo.topLevelDirs.join(', ')}

## Modules
${moduleList || '(no modules detected)'}

## Dependencies
${depList || '(no dependencies found)'}

## Source Files
${sourceFileList || '(no source file info)'}

Generate the complete Markdown document in ${langName} following the required structure.`;

  return { systemPrompt, userPrompt };
}

export function buildModuleDocPrompt(moduleInfo: ModuleDocInput, language = 'zh'): {
  systemPrompt: string;
  userPrompt: string;
} {
  const sn = getSectionNames(language);
  const langName = buildLanguageInstruction(language);

  const systemPrompt = `You are a technical documentation expert. Generate a comprehensive, well-structured Markdown module document based on the provided module information (symbols, relations, source code snippets).

${buildCommonRequirements(language, sn)}

- Provide deep analysis for each important symbol (functions, classes, interfaces): signatures, parameters, return values, implementation logic

Document structure (adjust as appropriate for the module):
${buildSectionList(sn)}`;

  const symbolList = moduleInfo.symbols
    .filter(s => s.kind !== 'module')
    .map(s => {
      const doc = s.doc ? ` — ${s.doc.split('\n')[0]}` : '';
      const loc = s.file ? ` [${s.file}:${s.range.startLine}-${s.range.endLine}]` : '';
      return `- **${s.kind}** \`${s.name}\`${doc}${loc}`;
    })
    .join('\n');

  const relationList = moduleInfo.relations
    .map(r => `- ${r.from} --[${r.type}]--> ${r.to}`)
    .join('\n');

  const snippetSection = moduleInfo.sourceSnippets
    .map(s => {
      const symbol = moduleInfo.symbols.find(sym => sym.id === s.symbolId);
      const loc = symbol?.file ? ` (${symbol.file}:${symbol.range.startLine}-${symbol.range.endLine})` : '';
      return `### ${s.symbolId}${loc}\n\`\`\`${s.language ?? 'text'}\n${s.code}\n\`\`\``;
    })
    .join('\n\n');

  const sourceFileList = (moduleInfo.sourceFiles ?? [])
    .map(f => `- ${f}`)
    .join('\n');

  const userPrompt = `Generate documentation in ${langName} for the **${moduleInfo.name}** module.

## Symbols
${symbolList || '(no symbols)'}

## Relations
${relationList || '(no relations)'}

## Source Code Snippets
${snippetSection || '(no snippets)'}

## Related Source Files
${sourceFileList || '(no source file info)'}

Generate the complete Markdown document in ${langName} following the required structure.`;

  return { systemPrompt, userPrompt };
}
