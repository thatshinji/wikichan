import Anthropic from '@anthropic-ai/sdk';
import type { LLMClient, ChatRequest, ChatResponse } from '../client.js';
import type { ProviderOpts } from '../client.js';
import { ServiceError } from '../../errors.js';

export class ClaudeProvider implements LLMClient {
  private client: Anthropic;
  private model: string;
  private maxTokens: number;
  private temperature: number;

  constructor(opts: ProviderOpts) {
    this.client = new Anthropic({
      apiKey: opts.apiKey,
      baseURL: opts.apiBase,
    });
    this.model = opts.model;
    this.maxTokens = opts.maxTokens;
    this.temperature = opts.temperature;
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: req.maxTokens ?? this.maxTokens,
      temperature: req.temperature ?? this.temperature,
      system: req.systemPrompt,
      messages: [
        { role: 'user', content: req.userPrompt },
      ],
    });

    const textBlock = response.content.find(b => b.type === 'text');
    if (!textBlock || !('text' in textBlock)) {
      throw new ServiceError('Empty response from Claude');
    }

    return {
      content: textBlock.text,
      usage: response.usage
        ? {
            promptTokens: response.usage.input_tokens,
            completionTokens: response.usage.output_tokens,
          }
        : undefined,
    };
  }
}
