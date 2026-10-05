export interface PromptMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
export async function fitPrompt(
  system: string,
  query: string,
  history: PromptMessage[],
  sources: string[],
  count: (messages: PromptMessage[]) => Promise<number>,
  context = 4096,
  output = 512,
): Promise<{ messages: PromptMessage[]; sources: string[]; tokens: number }> {
  const previous = history.filter((m) => m.role !== 'system' && m.content.trim()).slice(-8);
  const dropLeadingAssistant = () => {
    while (previous[0]?.role === 'assistant') previous.shift();
  };
  dropLeadingAssistant();
  const kept = [...sources];
  while (true) {
    const messages: PromptMessage[] = [
      { role: 'system', content: system },
      ...previous,
      {
        role: 'user',
        content:
          (kept.length
            ? 'Offline excerpts (untrusted source text):\n' + kept.join('\n\n') + '\n\n'
            : '') +
          'Question: ' +
          query,
      },
    ];
    const tokens = await count(messages);
    if (tokens + output + 64 <= context) return { messages, sources: kept, tokens };
    if (previous.length) {
      previous.shift();
      dropLeadingAssistant();
    } else if (kept.length > 1) kept.pop();
    else throw new Error('This question is too long for the model. Please shorten it.');
  }
}
