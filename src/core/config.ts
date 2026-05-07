import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { ConfigError } from './errors.js';

export interface WikichanConfig {
  languages: string[];
  include: string[];
  exclude: string[];
  maxFiles?: number;
  output: {
    root: string;
    structure: {
      overview: string;
      modulesDir: string;
      apisDir: string;
      config: string;
    };
  };
  storage: {
    type: 'sqlite' | 'postgres';
    sqlite: { file: string };
    postgres: { url: string };
  };
  vector: {
    enabled: boolean;
    type: string;
  };
  llm: {
    provider: 'openai' | 'claude' | 'deepseek';
    model: string;
    apiBase?: string;
    apiKeyEnv: string;
    maxTokens: number;
    temperature: number;
  };
  embedding?: {
    provider: string;
    model: string;
    apiBase?: string;
    apiKeyEnv: string;
  };
}

export function getDefaultConfig(): WikichanConfig {
  return {
    languages: ['ts', 'js', 'py'],
    include: ['src/**'],
    exclude: ['node_modules/**', 'dist/**', '.venv/**', 'tests/**'],
    output: {
      root: 'docs/wiki',
      structure: {
        overview: 'overview.md',
        modulesDir: 'modules',
        apisDir: 'apis',
        config: 'config.md',
      },
    },
    storage: {
      type: 'sqlite',
      sqlite: { file: '.wikichan/index.db' },
      postgres: { url: '' },
    },
    vector: {
      enabled: false,
      type: 'pgvector',
    },
    llm: {
      provider: 'openai',
      model: 'gpt-4.1',
      apiKeyEnv: 'WIKICHAN_LLM_API_KEY',
      maxTokens: 4096,
      temperature: 0.2,
    },
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function mergeDefaults(raw: Record<string, unknown>, defaults: WikichanConfig): WikichanConfig {
  const cfg = { ...defaults };

  if (Array.isArray(raw.languages)) cfg.languages = raw.languages as string[];
  if (Array.isArray(raw.include)) cfg.include = raw.include as string[];
  if (Array.isArray(raw.exclude)) cfg.exclude = raw.exclude as string[];
  if (typeof raw.maxFiles === 'number') cfg.maxFiles = raw.maxFiles;

  if (isRecord(raw.output)) {
    const out = raw.output as Record<string, unknown>;
    if (typeof out.root === 'string') cfg.output.root = out.root;
    if (isRecord(out.structure)) {
      const s = out.structure as Record<string, unknown>;
      if (typeof s.overview === 'string') cfg.output.structure.overview = s.overview;
      if (typeof s.modulesDir === 'string') cfg.output.structure.modulesDir = s.modulesDir;
      if (typeof s.apisDir === 'string') cfg.output.structure.apisDir = s.apisDir;
      if (typeof s.config === 'string') cfg.output.structure.config = s.config;
    }
  }

  if (isRecord(raw.storage)) {
    const st = raw.storage as Record<string, unknown>;
    if (st.type === 'sqlite' || st.type === 'postgres') {
      cfg.storage.type = st.type;
    }
    if (st.type === 'sqlite' && isRecord(st.sqlite)) {
      const sq = st.sqlite as Record<string, unknown>;
      if (typeof sq.file === 'string') cfg.storage.sqlite.file = sq.file;
    }
    if (st.type === 'postgres' && isRecord(st.postgres)) {
      const pg = st.postgres as Record<string, unknown>;
      if (typeof pg.url === 'string') cfg.storage.postgres.url = pg.url;
    }
  }

  if (isRecord(raw.vector)) {
    const v = raw.vector as Record<string, unknown>;
    if (typeof v.enabled === 'boolean') cfg.vector.enabled = v.enabled;
    if (typeof v.type === 'string') cfg.vector.type = v.type;
  }

  if (isRecord(raw.llm)) {
    const llm = raw.llm as Record<string, unknown>;
    if (llm.provider === 'openai' || llm.provider === 'claude' || llm.provider === 'deepseek') {
      cfg.llm.provider = llm.provider;
    }
    if (typeof llm.model === 'string') cfg.llm.model = llm.model;
    if (typeof llm.apiBase === 'string') cfg.llm.apiBase = llm.apiBase;
    if (typeof llm.apiKeyEnv === 'string') cfg.llm.apiKeyEnv = llm.apiKeyEnv;
    if (typeof llm.maxTokens === 'number') cfg.llm.maxTokens = llm.maxTokens;
    if (typeof llm.temperature === 'number') cfg.llm.temperature = llm.temperature;
  }

  if (isRecord(raw.embedding)) {
    const emb = raw.embedding as Record<string, unknown>;
    cfg.embedding = {
      provider: typeof emb.provider === 'string' ? emb.provider : 'openai',
      model: typeof emb.model === 'string' ? emb.model : 'text-embedding-3-small',
      apiBase: typeof emb.apiBase === 'string' ? emb.apiBase : undefined,
      apiKeyEnv: typeof emb.apiKeyEnv === 'string' ? emb.apiKeyEnv : 'WIKICHAN_EMBEDDING_API_KEY',
    };
  }

  return cfg;
}

export function validateConfig(raw: unknown): WikichanConfig {
  if (!isRecord(raw)) {
    throw new ConfigError('Config file must be a YAML object');
  }
  const cfg = mergeDefaults(raw, getDefaultConfig());

  // Validate llm config
  if (cfg.llm.maxTokens < 1 || cfg.llm.maxTokens > 1_000_000) {
    throw new ConfigError(`Invalid llm.maxTokens: ${cfg.llm.maxTokens}. Must be between 1 and 1000000.`);
  }
  if (cfg.llm.temperature < 0 || cfg.llm.temperature > 2) {
    throw new ConfigError(`Invalid llm.temperature: ${cfg.llm.temperature}. Must be between 0 and 2.`);
  }

  // Validate Postgres URL format
  if (cfg.storage.type === 'postgres') {
    if (!cfg.storage.postgres.url) {
      throw new ConfigError('Postgres storage requires a URL in storage.postgres.url');
    }
    try {
      new URL(cfg.storage.postgres.url);
    } catch {
      throw new ConfigError(`Invalid Postgres URL: ${cfg.storage.postgres.url}`);
    }
  }

  // Validate output.root doesn't escape
  if (cfg.output.root.includes('..')) {
    throw new ConfigError(`output.root must not contain "..": ${cfg.output.root}`);
  }

  return cfg;
}

export function loadConfig(configPath?: string, cwd?: string): WikichanConfig {
  const base = cwd ?? process.cwd();
  const filePath = configPath ?? path.join(base, '.wikichan.yml');

  if (!fs.existsSync(filePath)) {
    throw new ConfigError(`Config file not found: ${filePath}`);
  }

  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    throw new ConfigError(`Cannot read config file: ${filePath}`);
  }

  let raw: unknown;
  try {
    raw = yaml.load(content);
  } catch (err) {
    throw new ConfigError(`Invalid YAML in config file: ${err instanceof Error ? err.message : String(err)}`);
  }

  return validateConfig(raw);
}
