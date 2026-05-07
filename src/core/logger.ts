export enum LogLevel {
  TRACE = 0,
  DEBUG = 1,
  INFO = 2,
  WARN = 3,
  ERROR = 4,
}

let currentLevel: LogLevel = LogLevel.INFO;
let jsonMode: boolean = false;

export function initLogger(opts: { verbose: boolean; quiet: boolean; json?: boolean; veryVerbose?: boolean }): void {
  if (opts.quiet) {
    currentLevel = LogLevel.WARN;
  } else if (opts.veryVerbose) {
    currentLevel = LogLevel.TRACE;
  } else if (opts.verbose) {
    currentLevel = LogLevel.DEBUG;
  } else {
    currentLevel = LogLevel.INFO;
  }
  jsonMode = opts.json ?? false;
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

function padLevel(level: LogLevel): string {
  switch (level) {
    case LogLevel.TRACE: return 'TRACE';
    case LogLevel.DEBUG: return 'DEBUG';
    case LogLevel.INFO:  return 'INFO ';
    case LogLevel.WARN:  return 'WARN ';
    case LogLevel.ERROR: return 'ERROR';
  }
}

function levelToString(level: LogLevel): string {
  switch (level) {
    case LogLevel.TRACE: return 'trace';
    case LogLevel.DEBUG: return 'debug';
    case LogLevel.INFO:  return 'info';
    case LogLevel.WARN:  return 'warn';
    case LogLevel.ERROR: return 'error';
  }
}

export function log(level: LogLevel, command: string, message: string): void {
  if (level < currentLevel) return;

  if (jsonMode) {
    const jsonLine = JSON.stringify({
      timestamp: formatTimestamp(),
      level: levelToString(level),
      command,
      message,
    }) + '\n';
    if (level >= LogLevel.WARN) {
      process.stderr.write(jsonLine);
    } else {
      process.stdout.write(jsonLine);
    }
  } else {
    const line = `[${formatTimestamp()}] ${padLevel(level)} ${command}  ${message}\n`;
    if (level >= LogLevel.WARN) {
      process.stderr.write(line);
    } else {
      process.stdout.write(line);
    }
  }
}

export function trace(command: string, message: string): void {
  log(LogLevel.TRACE, command, message);
}

export function debug(command: string, message: string): void {
  log(LogLevel.DEBUG, command, message);
}

export function info(command: string, message: string): void {
  log(LogLevel.INFO, command, message);
}

export function warn(command: string, message: string): void {
  log(LogLevel.WARN, command, message);
}

export function error(command: string, message: string): void {
  log(LogLevel.ERROR, command, message);
}
