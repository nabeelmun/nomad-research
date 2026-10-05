import { initLlama, LlamaContext } from 'llama.rn';
import { assetManager } from '../assets/AssetManager';
import { MODELS } from '../assets/manifest';
import { PromptMessage, fitPrompt } from './PromptBudget';
export interface GenerationMetrics {
  timeToFirstTokenMs: number | null;
  totalTokens: number;
  tokensPerSecond: number;
  durationMs: number;
  promptTokens?: number;
  retrievalMs?: number;
  truncated?: boolean;
}
export class LlamaEngine {
  private context: LlamaContext | null = null;
  private initializing: Promise<boolean> | null = null;
  private generating = false;
  private modelId = '';
  autoInitialize(): Promise<boolean> {
    if (this.context) return Promise.resolve(true);
    if (!this.initializing)
      this.initializing = this.open().catch((error) => {
        this.initializing = null;
        throw error;
      });
    return this.initializing;
  }
  private async open(): Promise<boolean> {
    const settings = await assetManager.settings();
    const model = MODELS.find((m) => m.id === settings.modelId)!;
    await assetManager.validate(model);
    this.context = await initLlama({
      model: assetManager.path(model),
      use_mmap: true,
      use_mlock: false,
      n_ctx: 4096,
      n_threads: 4,
      n_gpu_layers: 0,
    });
    this.modelId = model.id;
    return true;
  }
  async generate(
    system: string,
    query: string,
    history: PromptMessage[],
    sources: string[],
    onToken: (text: string) => void,
    maxTokens: number,
    signal: AbortSignal,
  ): Promise<{ answer: string; metrics: GenerationMetrics; sourceCount: number }> {
    if (!this.context) throw new Error('The model is not ready. Retry loading it in Settings.');
    if (this.generating) throw new Error('Wait for the current answer to finish.');
    this.generating = true;
    const context = this.context;
    const start = Date.now();
    let first: number | null = null;
    let streamed = '';
    const check = () => {
      if (signal.aborted) throw new Error('Answer stopped.');
    };
    try {
      check();
      const fitted = await fitPrompt(
        system,
        query,
        history,
        sources,
        async (messages) => {
          check();
          const formatted = await context.getFormattedChat(messages, null, {
            jinja: true,
            enable_thinking: false,
          });
          return (await context.tokenize(formatted.prompt)).tokens.length;
        },
        4096,
        maxTokens,
      );
      check();
      const result = await context.completion(
        {
          messages: fitted.messages,
          jinja: true,
          enable_thinking: false,
          n_predict: maxTokens,
          temperature: MODELS.find((m) => m.id === this.modelId)?.temperature ?? 0.2,
          top_p: 0.9,
          penalty_repeat: 1.1,
        },
        (chunk) => {
          if (signal.aborted) return;
          if (first === null) first = Date.now();
          streamed += chunk.token;
          onToken(chunk.token);
        },
      );
      return {
        answer: result.content || result.text || streamed,
        sourceCount: fitted.sources.length,
        metrics: {
          timeToFirstTokenMs: first === null ? null : first - start,
          totalTokens: result.tokens_predicted,
          tokensPerSecond: result.timings?.predicted_per_second || 0,
          durationMs: Date.now() - start,
          promptTokens: result.tokens_evaluated,
          truncated: result.truncated || result.context_full || !!result.stopped_limit,
        },
      };
    } finally {
      this.generating = false;
    }
  }
  async stopGeneration(): Promise<void> {
    if (this.context && this.generating) await this.context.stopCompletion();
  }
  async release(): Promise<void> {
    if (this.generating) throw new Error('Stop the current answer before changing assets.');
    if (this.initializing) await this.initializing.catch(() => {});
    if (this.context) await this.context.release();
    this.context = null;
    this.initializing = null;
  }
  isLoaded(): boolean {
    return this.context !== null;
  }
}
export const llamaEngine = new LlamaEngine();
