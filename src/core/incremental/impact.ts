import type { FileChange } from './gitDiff.js';
import type { IndexStorage } from '../indexer/storage.js';
import type { ParsedEntity, CodeRelation } from '../parser/index.js';
import { extractModuleName } from '../utils.js';

export interface ImpactResult {
  affectedModules: string[];
  affectedFiles: string[];
  deletedFiles: string[];
  affectedSymbols: string[];
  transitiveAffectedSymbols: string[];
}

export function analyzeImpact(changes: FileChange[], storage: IndexStorage): ImpactResult {
  const affectedModules = new Set<string>();
  const affectedFiles: string[] = [];
  const deletedFiles: string[] = [];
  const affectedSymbols = new Set<string>();

  // First pass: identify directly affected files and modules
  for (const change of changes) {
    if (change.status === 'D') {
      deletedFiles.push(change.path);
    } else {
      affectedFiles.push(change.path);
    }

    // Determine module from file path
    const moduleName = extractModuleName(change.path);
    if (moduleName) {
      affectedModules.add(moduleName);
    }

    // Find symbols in affected files
    const fileSymbols = storage.getSymbolsByFile(change.path);
    for (const symbol of fileSymbols) {
      affectedSymbols.add(symbol.id);
    }
  }

  // Second pass: find transitively affected symbols
  const transitiveAffectedSymbols = findTransitiveDependencies(
    Array.from(affectedSymbols),
    storage
  );

  // Find modules for transitively affected symbols
  for (const symbolId of transitiveAffectedSymbols) {
    const symbol = storage.getSymbolsByFile(symbolId.split(':')[0])[0];
    if (symbol) {
      const moduleName = extractModuleName(symbol.file);
      if (moduleName) {
        affectedModules.add(moduleName);
      }
    }
  }

  return {
    affectedModules: Array.from(affectedModules),
    affectedFiles,
    deletedFiles,
    affectedSymbols: Array.from(affectedSymbols),
    transitiveAffectedSymbols: transitiveAffectedSymbols.filter(
      id => !affectedSymbols.has(id)
    ),
  };
}

function findTransitiveDependencies(
  symbolIds: string[],
  storage: IndexStorage,
  maxDepth: number = 3
): string[] {
  const visited = new Set<string>();
  const result: string[] = [];
  const queue: Array<{ id: string; depth: number }> = symbolIds.map(id => ({ id, depth: 0 }));

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;

    if (visited.has(id) || depth > maxDepth) continue;
    visited.add(id);
    result.push(id);

    // Find symbols that depend on this symbol
    const dependents = findDependents(id, storage);
    for (const dependent of dependents) {
      if (!visited.has(dependent)) {
        queue.push({ id: dependent, depth: depth + 1 });
      }
    }
  }

  return result;
}

function findDependents(symbolId: string, storage: IndexStorage): string[] {
  const dependents: string[] = [];

  // Find all relations that reference this symbol
  const allRelations = storage.getRelationsByType('IMPORTS');
  for (const rel of allRelations) {
    if (rel.to === symbolId) {
      dependents.push(rel.from);
    }
  }

  // Also check CALLS relations
  const callRelations = storage.getRelationsByType('CALLS');
  for (const rel of callRelations) {
    if (rel.to === symbolId) {
      dependents.push(rel.from);
    }
  }

  // Check USES relations
  const useRelations = storage.getRelationsByType('USES');
  for (const rel of useRelations) {
    if (rel.to === symbolId) {
      dependents.push(rel.from);
    }
  }

  return dependents;
}

export function getAffectedDocuments(
  impact: ImpactResult,
  storage: IndexStorage,
): string[] {
  const documents = new Set<string>();

  // Map affected modules to their documentation files
  for (const moduleName of impact.affectedModules) {
    documents.add(`modules/${moduleName}.md`);
  }

  // If any module is affected, overview might need updating
  if (impact.affectedModules.length > 0) {
    documents.add('overview.md');
  }

  // Check if API docs need updating
  const hasAPIChanges = impact.affectedSymbols.some(id => {
    const symbol = storage.getSymbolsByFile(id.split(':')[0])[0];
    return symbol && (
      symbol.name.toLowerCase().includes('controller') ||
      symbol.name.toLowerCase().includes('router') ||
      symbol.name.toLowerCase().includes('api')
    );
  });

  if (hasAPIChanges) {
    documents.add('apis/api.md');
  }

  return Array.from(documents);
}
