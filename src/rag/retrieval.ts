export interface Passage {
  id: string;
  articleId: number;
  title: string;
  section: string;
  snippet: string;
  sourceUrl: string;
  sourceDate: string;
  corpus: string;
  score: number;
}

const STOP = new Set(
  'the is at which on and a an in to for of or by with from as that this it are was were be been has have had do does did but what where when who how why can could will would should top best good list tell show give about some any near all please compare explain recommend restaurants restaurant'.split(
    ' ',
  ),
);
export function queryTerms(query: string): string[] {
  return [
    ...new Set(
      (query.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter(
        (t) => t.length > 1 && !STOP.has(t),
      ),
    ),
  ].slice(0, 18);
}
export function ftsQuery(query: string, strict = false): string {
  return queryTerms(query)
    .map((t) => '"' + t.replace(/"/g, '""') + '"*')
    .join(strict ? ' AND ' : ' OR ');
}
export function resolveQuery(
  query: string,
  history: { role: string; content: string }[],
  city = '',
): string {
  let resolved = query.trim();
  if (/\b(here|near me|my city|current city)\b/i.test(resolved)) {
    if (!city.trim())
      throw new Error('Set your city in Settings, or include a city in your question.');
    resolved = resolved
      .replace(/\b(here|near me)\b/gi, 'in ' + city.trim())
      .replace(/\b(my city|current city)\b/gi, city.trim());
  }
  if (/\b(those|these|them|ones|there|it|they|their)\b/i.test(query)) {
    const previous = [...history].reverse().find((m) => m.role === 'user');
    if (previous) resolved += ' ' + previous.content;
  }
  return resolved;
}
export function rankPassages(rows: Passage[], query: string, limit = 6): Passage[] {
  const terms = queryTerms(query);
  const travel = /\b(vegan|vegetarian|travel|restaurant|hotel|sights|visit|airport)\b/i.test(query);
  const seen = new Set<string>();
  return rows
    .map((row) => {
      const text = (row.title + ' ' + row.section + ' ' + row.snippet).toLowerCase();
      const matched = terms.filter((t) => text.includes(t)).length;
      const location = query
        .match(/\b(?:in|near|visit)\s+([\p{L}][\p{L}\s'-]*?)(?:[?.,!]|$)/iu)?.[1]
        ?.trim();
      if (
        travel &&
        location &&
        !queryTerms(location).every((t) => row.title.toLowerCase().includes(t))
      )
        return { ...row, score: -1 };
      const needsVegan = /\bvegan\b/i.test(query);
      if (
        needsVegan &&
        (!/\bvegan\b/i.test(row.snippet) ||
          /\b(?:not|no|non[- ]?)\s+vegan\b|\bvegan(?:\s+\w+){0,3}\s+(?:not|unavailable)\b/i.test(
            row.snippet,
          ))
      )
        return { ...row, score: -1 };
      const titleMatches = terms.filter((t) => row.title.toLowerCase().includes(t)).length;
      const corpusBias = travel ? (row.corpus === 'voyage' ? 2 : 0) : row.corpus === 'wiki' ? 2 : 0;
      return { ...row, score: matched * 3 + titleMatches * 4 + corpusBias };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .filter((row) => {
      const key = row.corpus + ':' + row.articleId + ':' + row.snippet;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}
