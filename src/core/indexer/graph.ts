import type { IndexStorage } from './storage.js';
import type { ParsedEntity } from '../parser/index.js';
import { extractModuleNameOrRoot } from '../utils.js';

export interface ModuleInfo {
  name: string;
  files: string[];
  symbols: ParsedEntity[];
  dependencies: string[];
  dependents: string[];
}

export function getModules(storage: IndexStorage): ModuleInfo[] {
  const allSymbols = storage.getAllSymbols();
  const importRelations = storage.getRelationsByType('IMPORTS');

  // Group symbols by module (top-level directory under src/)
  const moduleMap = new Map<string, {
    files: Set<string>;
    symbols: ParsedEntity[];
  }>();

  for (const symbol of allSymbols) {
    if (symbol.kind === 'module') {
      // Determine module name from file path
      const moduleName = extractModuleNameOrRoot(symbol.file);
      if (!moduleMap.has(moduleName)) {
        moduleMap.set(moduleName, { files: new Set(), symbols: [] });
      }
      const mod = moduleMap.get(moduleName)!;
      mod.files.add(symbol.file);
      mod.symbols.push(symbol);
    }
  }

  // Also add non-module symbols to their respective modules
  for (const symbol of allSymbols) {
    if (symbol.kind !== 'module') {
      const moduleName = extractModuleNameOrRoot(symbol.file);
      if (!moduleMap.has(moduleName)) {
        moduleMap.set(moduleName, { files: new Set(), symbols: [] });
      }
      const mod = moduleMap.get(moduleName)!;
      mod.files.add(symbol.file);
      mod.symbols.push(symbol);
    }
  }

  // Build dependency graph
  const depGraph = new Map<string, Set<string>>();
  const reverseDepGraph = new Map<string, Set<string>>();

  for (const rel of importRelations) {
    const fromPath = rel.from.replace(/:[A-Za-z_]\w*$/, '');
    const toPath = rel.to.replace(/:[A-Za-z_]\w*$/, '');
    const fromModule = extractModuleNameOrRoot(fromPath);
    const toModule = extractModuleNameOrRoot(toPath);

    if (fromModule === toModule) continue; // Skip self-imports

    if (!depGraph.has(fromModule)) depGraph.set(fromModule, new Set());
    depGraph.get(fromModule)!.add(toModule);

    if (!reverseDepGraph.has(toModule)) reverseDepGraph.set(toModule, new Set());
    reverseDepGraph.get(toModule)!.add(fromModule);
  }

  // Build result
  const modules: ModuleInfo[] = [];
  for (const [name, data] of moduleMap) {
    modules.push({
      name,
      files: Array.from(data.files),
      symbols: data.symbols,
      dependencies: Array.from(depGraph.get(name) ?? []),
      dependents: Array.from(reverseDepGraph.get(name) ?? []),
    });
  }

  return modules;
}

export function getModuleByName(storage: IndexStorage, name: string): ModuleInfo | null {
  const modules = getModules(storage);
  return modules.find(m => m.name === name) ?? null;
}

export function getDependencyGraph(storage: IndexStorage): Map<string, string[]> {
  const importRelations = storage.getRelationsByType('IMPORTS');
  const graph = new Map<string, Set<string>>();

  for (const rel of importRelations) {
    const fromPath = rel.from.replace(/:[A-Za-z_]\w*$/, '');
    const toPath = rel.to.replace(/:[A-Za-z_]\w*$/, '');
    const fromModule = extractModuleNameOrRoot(fromPath);
    const toModule = extractModuleNameOrRoot(toPath);

    if (fromModule === toModule) continue;

    if (!graph.has(fromModule)) graph.set(fromModule, new Set());
    graph.get(fromModule)!.add(toModule);
  }

  // Convert Sets to arrays
  const result = new Map<string, string[]>();
  for (const [key, value] of graph) {
    result.set(key, Array.from(value));
  }
  return result;
}
