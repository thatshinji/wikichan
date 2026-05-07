import path from 'node:path';
import type { RepowikiConfig } from '../config.js';
import type { IndexStorage } from './storage.js';
import { openStorage } from './storage.js';
import { info } from '../logger.js';

export function openStorageFromConfig(config: RepowikiConfig, cwd: string): IndexStorage {
  if (config.storage.type === 'postgres') {
    // AsyncIndexStorage exists in postgresStorage.ts but all consumers use sync IndexStorage.
    // For now, throw a descriptive error pointing users to the async interface.
    throw new Error(
      'Postgres storage requires async pipeline (AsyncIndexStorage). ' +
      'Use storage.type: sqlite for the current sync pipeline, or use the async API directly from postgresStorage.ts.'
    );
  }

  const dbPath = path.join(cwd, config.storage.sqlite.file);
  info('storage', `Opening SQLite database: ${dbPath}`);
  return openStorage(dbPath);
}
