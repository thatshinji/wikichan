import { ServiceError } from '../errors.js';
import type { RepowikiConfig } from '../config.js';

export interface ChatRequest {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ChatResponse {
  content: string;
  usage?: { promptTokens: number; completionTokens: number };
}

export interface LLMClient {
  chat(req: ChatRequest): Promise<ChatResponse>;
}

export interface ProviderOpts {
  apiKey: string;
  apiBase?: string;
  model: string;
  maxTokens: number;
  temperature: number;
}

export async function createLLMClient(config: RepowikiConfig['llm']): Promise<LLMClient> {
  const apiKey = process.env[config.apiKeyEnv];
  if (!apiKey) {
    throw new ServiceError(
      `API key not found. Set the environment variable ${config.apiKeyEnv}`
    );
  }

  const opts: ProviderOpts = {
    apiKey,
    apiBase: config.apiBase,
    model: config.model,
    maxTokens: config.maxTokens,
    temperature: config.temperature,
  };

  switch (config.provider) {
    case 'openai': {
      const { OpenAIProvider } = await import('./providers/openai.js');
      return new OpenAIProvider(opts);
    }
    case 'claude': {
      const { ClaudeProvider } = await import('./providers/claude.js');
      return new ClaudeProvider(opts);
    }
    case 'deepseek': {
      const { DeepSeekProvider } = await import('./providers/deepseek.js');
      return new DeepSeekProvider(opts);
    }
    default:
      throw new ServiceError(`Unknown LLM provider: ${config.provider}`);
  }
}
