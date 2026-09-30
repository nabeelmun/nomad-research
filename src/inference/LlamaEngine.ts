import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import { initLlama, LlamaContext } from 'llama.rn';

export interface GenerationMetrics {
  timeToFirstTokenMs: number;
  totalTokens: number;
  tokensPerSecond: number;
  durationMs: number;
}

export interface ModelConfig {
  filename: string;
  path: string;
  contextSize: number;
  threads: number;
  gpuLayers: number;
}

export class LlamaEngine {
  private context: LlamaContext | null = null;
  private currentConfig: ModelConfig | null = null;
  private isGenerating: boolean = false;

  /**
   * Automatically discovers and initializes an available GGUF model.
   * Checks app internal storage, iOS Files directory, and external Download directory.
   */
  async autoInitialize(): Promise<boolean> {
    if (this.context) return true;

    const candidatePaths = [
      `${FileSystem.documentDirectory}models/Llama-3.2-3B-Instruct-Q4_K_M.gguf`,
      `${FileSystem.documentDirectory}models/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf`,
      `${FileSystem.documentDirectory}Llama-3.2-3B-Instruct-Q4_K_M.gguf`,
      `${FileSystem.documentDirectory}Qwen2.5-1.5B-Instruct-Q4_K_M.gguf`,
      'file:///sdcard/Download/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
      'file:///sdcard/Download/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf'
    ];

    for (const p of candidatePaths) {
      try {
        const info = await FileSystem.getInfoAsync(p);
        if (info.exists) {
          console.log(`Found model at: ${p}`);
          return await this.loadModel(p);
        }
      } catch (err) {
        // continue search
      }
    }

    return false;
  }

  /**
   * Initializes or reloads a GGUF model via llama.rn NDK bindings.
   * Defaulted to 4 threads for optimal performance on ARM Cortex-A715/A78 cores.
   */
  async loadModel(
    modelPath: string,
    contextSize: number = 2048,
    threads: number = 4
  ): Promise<boolean> {
    try {
      if (this.context) {
        await this.context.release();
        this.context = null;
      }

      const fileInfo = await FileSystem.getInfoAsync(modelPath);
      if (!fileInfo.exists) {
        throw new Error(`Model file not found at: ${modelPath}`);
      }

      this.context = await initLlama({
        model: modelPath,
        use_mlock: false,
        n_ctx: contextSize,
        n_threads: threads,
        n_gpu_layers: Platform.OS === 'ios' ? 99 : 0 // Metal GPU acceleration on iOS, CPU on Android
      });

      this.currentConfig = {
        filename: modelPath.split('/').pop() || 'model.gguf',
        path: modelPath,
        contextSize,
        threads,
        gpuLayers: 0
      };

      return true;
    } catch (error) {
      console.error('Failed to initialize Llama model:', error);
      throw error;
    }
  }

  /**
   * Generates a streaming research completion with real-time token telemetry.
   */
  async generateCompletion(
    prompt: string,
    onToken: (token: string) => void,
    onMetrics?: (metrics: GenerationMetrics) => void
  ): Promise<string> {
    if (!this.context) {
      throw new Error('Llama model is not loaded. Please load a model first.');
    }

    if (this.isGenerating) {
      throw new Error('Generation already in progress.');
    }

    this.isGenerating = true;
    let fullText = '';
    let tokenCount = 0;
    const startTime = Date.now();
    let firstTokenTime: number | null = null;

    try {
      await this.context.completion(
        {
          prompt,
          n_predict: 1024,
          temperature: 0.3,
          top_p: 0.9,
          stop: ['\nUser:', '<|im_end|>', '<|endoftext|>', '### User:']
        },
        (data) => {
          if (!firstTokenTime) {
            firstTokenTime = Date.now();
          }

          tokenCount++;
          fullText += data.token;
          onToken(data.token);
        }
      );

      const endTime = Date.now();
      const durationMs = endTime - startTime;
      const ttfTokenMs = firstTokenTime ? firstTokenTime - startTime : durationMs;
      const tokPerSec = durationMs > 0 ? (tokenCount / (durationMs / 1000)) : 0;

      if (onMetrics) {
        onMetrics({
          timeToFirstTokenMs: ttfTokenMs,
          totalTokens: tokenCount,
          tokensPerSecond: parseFloat(tokPerSec.toFixed(1)),
          durationMs
        });
      }

      return fullText;
    } finally {
      this.isGenerating = false;
    }
  }

  async stopGeneration(): Promise<void> {
    if (this.context && this.isGenerating) {
      await this.context.stopCompletion();
      this.isGenerating = false;
    }
  }

  isLoaded(): boolean {
    return this.context !== null;
  }

  getConfig(): ModelConfig | null {
    return this.currentConfig;
  }
}

export const llamaEngine = new LlamaEngine();
