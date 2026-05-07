export class RepowikiError extends Error {
  exitCode: number;
  constructor(message: string, exitCode: number) {
    super(message);
    this.name = 'RepowikiError';
    this.exitCode = exitCode;
  }
}

export class ConfigError extends RepowikiError {
  constructor(message: string) {
    super(message, 78);
    this.name = 'ConfigError';
  }
}

export class ServiceError extends RepowikiError {
  constructor(message: string) {
    super(message, 69);
    this.name = 'ServiceError';
  }
}

export class OutputError extends RepowikiError {
  constructor(message: string) {
    super(message, 73);
    this.name = 'OutputError';
  }
}
