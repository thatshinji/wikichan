import fs from 'node:fs';
import path from 'node:path';

export interface RepoState {
  lastProcessedCommit: string;
  lastRunTimestamp: string;
  version: string;
}

export function getStateFilePath(cwd: string): string {
  return path.join(cwd, '.wikichan', 'state.json');
}

export function loadState(cwd: string): RepoState | null {
  const filePath = getStateFilePath(cwd);
  if (!fs.existsSync(filePath)) return null;

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as RepoState;
  } catch {
    return null;
  }
}

export function saveState(cwd: string, state: RepoState): void {
  const filePath = getStateFilePath(cwd);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf-8');
}
