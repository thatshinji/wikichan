import fs from 'node:fs';
import path from 'node:path';
import type { IndexStorage } from '../indexer/storage.js';
import type { WikichanConfig } from '../config.js';
import type { LLMClient } from '../llm/client.js';
import type { OverviewInput } from './templates.js';
import { buildOverviewPrompt } from './templates.js';
import { getModules } from '../indexer/graph.js';
import { info, warn } from '../logger.js';

export async function generateOverview(
  storage: IndexStorage,
  config: WikichanConfig,
  llm: LLMClient,
  cwd: string,
  ragContext?: string,
): Promise<string> {
  info('gen', 'Generating project overview...');

  // Gather project info
  const modules = getModules(storage);
  let projectName = path.basename(cwd);

  // Try to read package.json for project name and dependencies
  let dependencies: Record<string, string> = {};
  const pkgPath = path.join(cwd, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (typeof pkg.name === 'string') {
        projectName = pkg.name;
      }
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      // Filter to ensure values are strings
      dependencies = Object.fromEntries(
        Object.entries(allDeps).filter(([_, v]) => typeof v === 'string')
      ) as Record<string, string>;
    } catch (err) {
      warn('gen', `Failed to parse package.json: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Try to read requirements.txt for Python dependencies
  const reqPath = path.join(cwd, 'requirements.txt');
  if (fs.existsSync(reqPath)) {
    try {
      const lines = fs.readFileSync(reqPath, 'utf-8').split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('-')) continue;
        const match = trimmed.match(/^([a-zA-Z0-9_.-]+)\s*(?:[>=<~!]+\s*(.+))?$/);
        if (match) {
          dependencies[match[1]] = match[2]?.trim() ?? '*';
        }
      }
    } catch (err) {
      warn('gen', `Failed to parse requirements.txt: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Try to read pyproject.toml for Python dependencies
  const pyprojPath = path.join(cwd, 'pyproject.toml');
  if (fs.existsSync(pyprojPath)) {
    try {
      const content = fs.readFileSync(pyprojPath, 'utf-8');
      const depsMatch = content.match(/\[project\][\s\S]*?dependencies\s*=\s*\[([\s\S]*?)\]/);
      if (depsMatch) {
        const depLines = depsMatch[1].split('\n');
        for (const line of depLines) {
          const match = line.match(/"([a-zA-Z0-9_.-]+)\s*(?:[>=<~!]+\s*(.+))?"/);
          if (match) {
            dependencies[match[1]] = match[2]?.trim().replace(/"$/, '') ?? '*';
          }
        }
      }
    } catch (err) {
      warn('gen', `Failed to parse pyproject.toml: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Get top-level directories
  const topLevelDirs = [...new Set(modules.map(m => m.name))];

  const projectInfo: OverviewInput = {
    projectName,
    languages: config.languages,
    topLevelDirs,
    modules: modules.map(m => ({
      name: m.name,
      symbolCount: m.symbols.length,
      mainSymbols: m.symbols
        .filter(s => s.kind !== 'module')
        .slice(0, 10)
        .map(s => s.name),
    })),
    dependencies,
  };

  const prompt = buildOverviewPrompt(projectInfo);

  // Append RAG context if available
  if (ragContext) {
    prompt.userPrompt = `${ragContext}\n\n${prompt.userPrompt}`;
  }

  const response = await llm.chat(prompt);

  // Write to output
  const outputPath = path.resolve(cwd, config.output.root, config.output.structure.overview);
  if (!outputPath.startsWith(path.resolve(cwd))) {
    throw new Error(`Output path escapes project directory: ${outputPath}`);
  }
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  fs.writeFileSync(outputPath, response.content, 'utf-8');

  info('gen', `Overview written to ${outputPath}`);
  return response.content;
}
