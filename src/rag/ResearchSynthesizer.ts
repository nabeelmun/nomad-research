import { knowledgeStore, SearchResult } from './KnowledgeStore';
import { llamaEngine, GenerationMetrics } from '../inference/LlamaEngine';

export interface ResearchCitation {
  id: number;
  title: string;
  excerpt: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: ResearchCitation[];
  metrics?: GenerationMetrics;
  createdAt: number;
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
    history: ChatMessage[] = [],
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
Your goal is to provide deep, analytical, well-reasoned explanations, comparisons, and syntheses based on the provided reference material, past conversation context, and your internal reasoning.
Cite your sources using bracketed numbers like [1] or [2] whenever referencing specific facts from the grounded references.

IMPORTANT SPECIFICITY, SAFETY & REASONING RULES:
1. When answering practical, procedural, automotive, culinary, or technical queries:
   - State critical safety hazards and warnings FIRST before any actions.
   - Provide exact step-by-step instructions in strict chronological numbered order.
   - Include precise quantitative numbers and specifications (e.g. voltages, wire gauges, temperatures, timings, exact grams/ratios) rather than vague summaries.
2. When answering scientific, travel, or historical queries:
   - Provide exact dates, names, bounds, places, and chain multi-hop facts clearly.
3. ADVERSARIAL TRAPS & IMPOSSIBLE PREMISES:
   - If a question contains a false, anachronistic, or impossible premise (e.g. asking what historical figures like Albert Einstein said about inventions made after their death like the 1995 internet): explicitly identify and refute the false premise immediately rather than inventing quotes or statements.
   - If a question asks to summarize future or unverified events (e.g. a future 2027 Mars landing press conference): state directly that the event has not occurred and refuse to fabricate fictional press conferences or events.
   - If asked for Michelin 3-star restaurants or major awards in small villages or towns that do not possess them: explicitly state that no such restaurant exists there. Never fabricate awards or places.
4. MATHEMATICAL & UNIT CONVERSION PRECISION:
   - For distance, speed, time, percentage, and compound interest calculations: show the exact formula and step-by-step arithmetic (e.g. Time = 380 km / 95 km/h = 4.0 hours; 15% tip on ₹2,450 = ₹367.50; compound interest A = P(1+r)^t = 10,000 * (1.08)^3 = ₹12,597.12).
   - For unit conversions: show the exact conversion factor and sanity-check the result (e.g. 175 cm / 2.54 = 68.9 in = 5'9"; 72 kg * 2.20462 = 158.7 lbs).
5. CITATION INTEGRITY:
   - Cite bracketed numbers like [1] or [2] ONLY when referencing specific facts from the Grounded Offline References above. If Grounded Offline References is empty, answer directly using factual reasoning and DO NOT invent bracketed citation numbers.
Be concise, structured, and factual.<|im_end|>
`;

    // Multi-turn context: roll last 4 messages (2 exchanges) to maintain conversational memory within mobile context limit
    let historyBlock = '';
    const recentHistory = history.filter(m => m.content && m.content.trim().length > 0).slice(-4);
    for (const msg of recentHistory) {
      historyBlock += `<|im_start|>${msg.role}\n${msg.content}<|im_end|>\n`;
    }

    const currentTurn = `<|im_start|>user
${contextBlock}Research Question: ${query}<|im_end|>
<|im_start|>assistant
`;

    const fullPrompt = `${systemPrompt}${historyBlock}${currentTurn}`;

    let capturedMetrics: GenerationMetrics = {
      timeToFirstTokenMs: 0,
      totalTokens: 0,
      tokensPerSecond: 0,
      durationMs: 0
    };

    const answer = await llamaEngine.generateCompletion(
      fullPrompt,
      onTokenChunk,
      (metrics) => {
        capturedMetrics = metrics;
      }
    );

    // Strictly verify citations: only keep sources that were actually referenced in the synthesized answer
    const verifiedCitations = citations.filter(c => 
      answer.includes(`[${c.id}]`)
    );

    return {
      query,
      answer,
      citations: verifiedCitations,
      metrics: capturedMetrics
    };
  }
}

export const researchSynthesizer = new ResearchSynthesizer();
