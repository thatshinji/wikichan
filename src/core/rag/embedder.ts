import type { CodeChunk } from './chunker.js';
import { buildEmbeddingText } from './chunker.js';

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
}

export function createEmbeddingProvider(
  config: { provider: string; model: string; apiBase?: string; apiKeyEnv: string }
): EmbeddingProvider {
  const apiKey = process.env[config.apiKeyEnv];
  if (!apiKey) {
    throw new Error(`Embedding API key not found. Set the environment variable ${config.apiKeyEnv}`);
  }

  switch (config.provider) {
    case 'openai':
      return new OpenAIEmbeddingProvider(apiKey, config.model, config.apiBase);
    default:
      throw new Error(`Unknown embedding provider: ${config.provider}`);
  }
}

class OpenAIEmbeddingProvider implements EmbeddingProvider {
  private apiKey: string;
  private model: string;
  private apiBase: string;

  constructor(apiKey: string, model: string, apiBase?: string) {
    this.apiKey = apiKey;
    this.model = model;
    this.apiBase = apiBase ?? 'https://api.openai.com/v1';
  }

  async embed(text: string): Promise<number[]> {
    const response = await fetch(`${this.apiBase}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`Embedding API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { data: Array<{ embedding: number[] }> };
    return data.data[0].embedding;
  }
}

export async function embedChunk(
  chunk: CodeChunk,
  provider: EmbeddingProvider,
): Promise<number[]> {
  const text = buildEmbeddingText(chunk);
  return provider.embed(text);
}
