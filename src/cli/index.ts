#!/usr/bin/env node
import path from 'node:path';
import { Command } from 'commander';
import { initLogger, error as logError } from '../core/logger.js';
import { WikichanError } from '../core/errors.js';
import { runInit } from './commands/init.js';
import { runScan } from './commands/scan.js';
import { runGen } from './commands/gen.js';
import { runUpdate } from './commands/update.js';
import { runDoctor } from './commands/doctor.js';

const program = new Command();

program
  .name('wikichan')
  .description('Auto-generate project documentation from code analysis + LLM')
  .version('0.1.0')
  .option('-v, --verbose', 'Enable verbose logging')
  .option('-q, --quiet', 'Only show warnings and errors')
  .option('--log-json', 'Output logs in JSON format')
  .option('--config <path>', 'Config file path', '.wikichan.yml')
  .option('--cwd <path>', 'Working directory', process.cwd());

// Helper to handle common command setup
function setupCommand(options: { verbose?: boolean; quiet?: boolean; logJson?: boolean; config?: string; cwd?: string }) {
  const veryVerbose = process.argv.includes('-vv');
  initLogger({
    verbose: options.verbose ?? false,
    quiet: options.quiet ?? false,
    json: options.logJson ?? false,
    veryVerbose,
  });
  return {
    cwd: path.resolve(options.cwd ?? process.cwd()),
    configPath: options.config,
  };
}

// init command
program
  .command('init')
  .description('Initialize repository and generate documentation')
  .option('--force', 'Overwrite existing config and docs')
  .option('--output-dir <dir>', 'Output directory for documentation')
  .option('--skip-docs', 'Only create config, skip documentation generation')
  .action(async (options, cmd) => {
    const globalOpts = cmd.parent.opts();
    const { cwd } = setupCommand(globalOpts);
    try {
      await runInit(cwd, {
        force: options.force,
        outputDir: options.outputDir,
        noDocs: options.skipDocs,
      });
    } catch (err) {
      handleError(err);
    }
  });

// scan command
program
  .command('scan')
  .description('Scan repository and build index')
  .option('--full', 'Full rescan, ignore cache')
  .option('--languages <list>', 'Override language list (comma-separated)')
  .option('--dry-run', 'Show what would be scanned without doing it')
  .action(async (options, cmd) => {
    const globalOpts = cmd.parent.opts();
    const { cwd, configPath } = setupCommand(globalOpts);
    try {
      await runScan(cwd, {
        full: options.full,
        languages: options.languages,
        dryRun: options.dryRun,
        config: configPath,
      });
    } catch (err) {
      handleError(err);
    }
  });

// gen command
program
  .command('gen')
  .description('Generate or regenerate documentation')
  .option('--all', 'Regenerate all documentation')
  .option('--module <name>', 'Generate docs for specific module')
  .option('--type <type>', 'Document type: overview|module')
  .option('--output-dir <dir>', 'Override output directory')
  .option('--dry-run', 'Show what would be generated')
  .action(async (options, cmd) => {
    const globalOpts = cmd.parent.opts();
    const { cwd, configPath } = setupCommand(globalOpts);
    try {
      await runGen(cwd, {
        all: options.all,
        module: options.module,
        type: options.type,
        outputDir: options.outputDir,
        dryRun: options.dryRun,
        config: configPath,
      });
    } catch (err) {
      handleError(err);
    }
  });

// update command
program
  .command('update')
  .description('Incremental update based on git changes')
  .option('--from <rev>', 'Start git revision')
  .option('--to <rev>', 'End git revision', 'HEAD')
  .option('--skip-docs', 'Only update index, skip doc generation')
  .option('--dry-run', 'Show what would be updated')
  .action(async (options, cmd) => {
    const globalOpts = cmd.parent.opts();
    const { cwd, configPath } = setupCommand(globalOpts);
    try {
      await runUpdate(cwd, {
        from: options.from,
        to: options.to,
        noDocs: options.skipDocs,
        dryRun: options.dryRun,
        config: configPath,
      });
    } catch (err) {
      handleError(err);
    }
  });

// doctor command
program
  .command('doctor')
  .description('Check configuration and system health')
  .option('--json', 'Output as JSON')
  .option('--fix', 'Attempt to fix issues')
  .action(async (options, cmd) => {
    const globalOpts = cmd.parent.opts();
    const { cwd, configPath } = setupCommand(globalOpts);
    try {
      await runDoctor(cwd, {
        json: options.json,
        fix: options.fix,
        config: configPath,
      });
    } catch (err) {
      handleError(err);
    }
  });

function handleError(err: unknown): never {
  if (err instanceof WikichanError) {
    logError('wikichan', err.message);
    process.exit(err.exitCode);
  }
  const message = err instanceof Error ? err.message : String(err);
  logError('wikichan', `Internal error: ${message}`);
  process.exit(70);
}

program.parse();
