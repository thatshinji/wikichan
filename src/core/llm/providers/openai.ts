import OpenAI from 'openai';
import type { LLMClient, ChatRequest, ChatResponse } from '../client.js';
import type { ProviderOpts } from '../client.js';

export class OpenAIProvider implements LLMClient {
  private client: OpenAI;
  private model: string;
  private maxTokens: number;
  private temperature: number;

  constructor(opts: ProviderOpts) {
    this.client = new OpenAI({
      apiKey: opts.apiKey,
      baseURL: opts.apiBase ?? 'https://api.openai.com/v1',
    });
    this.model = opts.model;
    this.maxTokens = opts.maxTokens;
    this.temperature = opts.temperature;
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: req.maxTokens ?? this.maxTokens,
      temperature: req.temperature ?? this.temperature,
      messages: [
        { role: 'system', content: req.systemPrompt },
        { role: 'user', content: req.userPrompt },
      ],
    });

    const choice = response.choices[0];
    if (!choice?.message?.content) {
      throw new Error('Empty response from OpenAI');
    }

    return {
      content: choice.message.content,
      usage: response.usage
        ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
          }
        : undefined,
    };
  }
}
