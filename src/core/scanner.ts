import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';
import { info, warn } from './logger.js';
import type { WikichanConfig } from './config.js';

export interface FileRecord {
  path: string;
  language: string;
  size: number;
  lastModified: number;
}

const EXT_TO_LANG: Record<string, string> = {
  '.ts': 'ts',
  '.tsx': 'ts',
  '.js': 'js',
  '.jsx': 'js',
  '.mjs': 'js',
  '.cjs': 'js',
  '.py': 'py',
};

function getLanguage(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase();
  return EXT_TO_LANG[ext] ?? null;
}

export async function scanRepo(config: WikichanConfig, cwd: string): Promise<FileRecord[]> {
  const allowedLangs = new Set(config.languages);
  const allFiles: FileRecord[] = [];

  for (const pattern of config.include) {
    const matches = await glob(pattern, {
      cwd,
      ignore: config.exclude,
      nodir: true,
      absolute: false,
    });

    for (const relPath of matches) {
      const lang = getLanguage(relPath);
      if (!lang || !allowedLangs.has(lang)) continue;

      const absPath = path.join(cwd, relPath);
      try {
        const stat = fs.statSync(absPath);
        allFiles.push({
          path: relPath,
          language: lang,
          size: stat.size,
          lastModified: stat.mtimeMs,
        });
      } catch {
        warn('scan', `Cannot stat file: ${relPath}`);
      }
    }
  }

  if (allFiles.length > 10000) {
    warn('scan', `Large number of files (${allFiles.length}). Consider narrowing include patterns.`);
  }

  if (config.maxFiles && allFiles.length > config.maxFiles) {
    // Sort by last modified (newest first) so truncation keeps the most recently changed files
    allFiles.sort((a, b) => b.lastModified - a.lastModified);
    warn('scan', `File limit reached (${config.maxFiles}), ${allFiles.length - config.maxFiles} files excluded`);
    allFiles.length = config.maxFiles;
  }

  info('scan', `Scanned ${allFiles.length} files`);
  return allFiles;
}
