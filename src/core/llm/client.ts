import { ServiceError } from '../errors.js';
import type { WikichanConfig } from '../config.js';
import { warn } from '../logger.js';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

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

function withRetry(client: LLMClient): LLMClient {
  return {
    async chat(req: ChatRequest): Promise<ChatResponse> {
      let lastErr: unknown;
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          return await client.chat(req);
        } catch (err) {
          lastErr = err;
          const isRetryable = err instanceof Error && (
            err.message.includes('429') ||
            err.message.includes('503') ||
            err.message.includes('timeout') ||
            err.message.includes('ECONNRESET')
          );
          if (!isRetryable || attempt === MAX_RETRIES - 1) throw err;
          const delay = BASE_DELAY_MS * Math.pow(2, attempt);
          warn('llm', `LLM call failed (attempt ${attempt + 1}/${MAX_RETRIES}), retrying in ${delay}ms: ${err instanceof Error ? err.message : String(err)}`);
          await new Promise(r => setTimeout(r, delay));
        }
      }
      throw lastErr;
    },
  };
}

export async function createLLMClient(config: WikichanConfig['llm']): Promise<LLMClient> {
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
      return withRetry(new OpenAIProvider(opts));
    }
    case 'claude': {
      const { ClaudeProvider } = await import('./providers/claude.js');
      return withRetry(new ClaudeProvider(opts));
    }
    case 'deepseek': {
      const { DeepSeekProvider } = await import('./providers/deepseek.js');
      return withRetry(new DeepSeekProvider(opts));
    }
    default:
      throw new ServiceError(`Unknown LLM provider: ${config.provider}`);
  }
}
