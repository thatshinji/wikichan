import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../../core/config.js';
import { openStorage } from '../../core/indexer/storage.js';
import { createLLMClient } from '../../core/llm/client.js';
import { info, warn, error as logError } from '../../core/logger.js';

// Note: doctor uses openStorage directly for health checks, not via factory,
// since it needs to check database existence regardless of storage type.

export interface DoctorOptions {
  json?: boolean;
  fix?: boolean;
  config?: string;
}

interface CheckResult {
  name: string;
  status: 'ok' | 'error' | 'warning';
  message: string;
}

export async function runDoctor(cwd: string, options: DoctorOptions): Promise<void> {
  const checks: CheckResult[] = [];

  // Check config
  try {
    const config = loadConfig(options.config, cwd);
    checks.push({ name: 'config', status: 'ok', message: 'Config file is valid' });

    // Check .wikichan directory
    const wikichanDir = path.join(cwd, '.wikichan');
    if (fs.existsSync(wikichanDir)) {
      checks.push({ name: 'directory', status: 'ok', message: '.wikichan directory exists' });
    } else {
      checks.push({ name: 'directory', status: 'warning', message: '.wikichan directory missing' });
      if (options.fix) {
        fs.mkdirSync(wikichanDir, { recursive: true });
        checks.push({ name: 'directory-fix', status: 'ok', message: 'Created .wikichan directory' });
      }
    }

    // Check SQLite database
    const dbPath = path.join(cwd, config.storage.sqlite.file);
    if (fs.existsSync(dbPath)) {
      let storage;
      try {
        storage = openStorage(dbPath);
        const symbols = storage.getAllSymbols();
        checks.push({
          name: 'database',
          status: 'ok',
          message: `Database exists with ${symbols.length} symbols`,
        });
      } catch (err) {
        checks.push({
          name: 'database',
          status: 'error',
          message: `Database error: ${err}`,
        });
        if (options.fix) {
          fs.unlinkSync(dbPath);
          checks.push({
            name: 'database-fix',
            status: 'ok',
            message: 'Removed corrupted database',
          });
        }
      } finally {
        storage?.close();
      }
    } else {
      checks.push({
        name: 'database',
        status: 'warning',
        message: 'Database not found (run `wikichan scan` first)',
      });
    }

    // Check LLM connectivity
    try {
      const apiKey = process.env[config.llm.apiKeyEnv];
      if (apiKey) {
        const llm = await createLLMClient(config.llm);
        // Simple connectivity test
        await llm.chat({
          systemPrompt: 'Reply with exactly: OK',
          userPrompt: 'Test',
          maxTokens: 80,
        });
        checks.push({ name: 'llm', status: 'ok', message: 'LLM connection successful' });
      } else {
        checks.push({
          name: 'llm',
          status: 'warning',
          message: `API key not set (${config.llm.apiKeyEnv})`,
        });
      }
    } catch (err) {
      checks.push({ name: 'llm', status: 'error', message: `LLM error: ${err}` });
    }

    // Check git
    try {
      execSync('git rev-parse HEAD', { cwd, stdio: 'ignore' });
      checks.push({ name: 'git', status: 'ok', message: 'Git repository detected' });
    } catch {
      checks.push({ name: 'git', status: 'warning', message: 'Not a git repository' });
    }
  } catch (err) {
    checks.push({ name: 'config', status: 'error', message: `Config error: ${err}` });
  }

  // Output results
  if (options.json) {
    console.log(JSON.stringify(checks, null, 2));
  } else {
    for (const check of checks) {
      const prefix = check.status === 'ok' ? '✓' : check.status === 'warning' ? '⚠' : '✗';
      const logFn = check.status === 'ok' ? info : check.status === 'warning' ? warn : logError;
      logFn('doctor', `${prefix} ${check.name}: ${check.message}`);
    }
  }

  // Exit code based on results
  const hasErrors = checks.some(c => c.status === 'error');
  const hasConfigIssue = checks.some(c => c.name === 'config' && c.status === 'error');
  const hasLLMIssue = checks.some(c => c.name === 'llm' && c.status === 'error');

  if (hasConfigIssue) {
    process.exitCode = 78;
  } else if (hasLLMIssue) {
    process.exitCode = 69;
  } else if (hasErrors) {
    process.exitCode = 70;
  }
}
