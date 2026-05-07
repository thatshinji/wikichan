import { execSync } from 'node:child_process';

export interface FileChange {
  status: 'A' | 'M' | 'D';
  path: string;
}

function isValidGitRef(ref: string): boolean {
  // Must not be empty, must not start/end with dot, no consecutive dots, no path traversal
  if (!ref || ref.startsWith('.') || ref.endsWith('.') || ref.includes('..')) return false;
  return /^[a-zA-Z0-9_\-./^~]+$/.test(ref);
}

export function getChanges(fromRev: string, toRev: string, cwd: string): FileChange[] {
  if (!isValidGitRef(fromRev) || !isValidGitRef(toRev)) {
    throw new Error(`Invalid git ref: "${fromRev}" or "${toRev}"`);
  }

  try {
    const output = execSync(`git diff --name-status ${fromRev}..${toRev}`, {
      cwd,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    }).trim();

    if (!output) return [];

    return output.split('\n').map(line => {
      const [status, ...pathParts] = line.split('\t');
      const statusChar = status.charAt(0);
      // Map R (rename) and C (copy) to M (modified)
      const mappedStatus = statusChar === 'R' || statusChar === 'C' ? 'M' : statusChar;
      return {
        status: mappedStatus as 'A' | 'M' | 'D',
        path: pathParts.join('\t'),
      };
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`git diff failed: ${message}`);
  }
}

export function getCurrentCommit(cwd: string): string {
  try {
    return execSync('git rev-parse HEAD', {
      cwd,
      encoding: 'utf-8',
    }).trim();
  } catch {
    throw new Error('Not a git repository or git is not installed');
  }
}
