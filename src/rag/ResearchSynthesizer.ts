import { knowledgeStore, SearchResult } from './KnowledgeStore';
import { llamaEngine, GenerationMetrics } from '../inference/LlamaEngine';

export interface ResearchCitation {
  id: number;
  title: string;
  excerpt: string;
}

export interface ResearchResult {
  query: string;
  answer: string;
  citations: ResearchCitation[];
  metrics: GenerationMetrics;
}

export class ResearchSynthesizer {
  async executeResearch(
    query: string,
    onTokenChunk: (token: string) => void,
    onStatusUpdate?: (status: string) => void
  ): Promise<ResearchResult> {
    onStatusUpdate?.('Scanning local offline knowledge store...');
    const searchResults: SearchResult[] = await knowledgeStore.search(query, 3);

    const citations: ResearchCitation[] = searchResults.map((res, index) => ({
      id: index + 1,
      title: res.title,
      excerpt: res.snippet
    }));

    onStatusUpdate?.('Synthesizing research with local model...');

    let contextBlock = '';
    if (citations.length > 0) {
      contextBlock = 'Grounded Offline References:\n' + citations.map(c => 
        `[${c.id}] ${c.title}:\n${c.excerpt}`
      ).join('\n\n') + '\n\n';
    }

    const systemPrompt = `<|im_start|>system
You are NomadLM, an advanced offline scientific and research assistant running natively on mobile hardware without network access.
Your goal is to provide deep, analytical, well-reasoned explanations, comparisons, and syntheses based on the provided reference material and your internal reasoning.
Cite your sources using bracketed numbers like [1] or [2] whenever referencing specific facts from the grounded references. Be concise, structured, and factual.<|im_end|>
<|im_start|>user
${contextBlock}Research Question: ${query}<|im_end|>
<|im_start|>assistant
`;

    let capturedMetrics: GenerationMetrics = {
      timeToFirstTokenMs: 0,
      totalTokens: 0,
      tokensPerSecond: 0,
      durationMs: 0
    };

    const answer = await llamaEngine.generateCompletion(
      systemPrompt,
      onTokenChunk,
      (metrics) => {
        capturedMetrics = metrics;
      }
    );

    return {
      query,
      answer,
      citations,
      metrics: capturedMetrics
    };
  }
}

export const researchSynthesizer = new ResearchSynthesizer();
