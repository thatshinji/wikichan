export class WikichanError extends Error {
  exitCode: number;
  constructor(message: string, exitCode: number) {
    super(message);
    this.name = 'WikichanError';
    this.exitCode = exitCode;
  }
}

export class ConfigError extends WikichanError {
  constructor(message: string) {
    super(message, 78);
    this.name = 'ConfigError';
  }
}

export class ServiceError extends WikichanError {
  constructor(message: string) {
    super(message, 69);
    this.name = 'ServiceError';
  }
}

export class OutputError extends WikichanError {
  constructor(message: string) {
    super(message, 73);
    this.name = 'OutputError';
  }
}
