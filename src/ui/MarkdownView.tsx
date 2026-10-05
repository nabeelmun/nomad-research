import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { colors } from './theme';
function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <View style={styles.code}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Copy code"
        style={styles.copy}
        onPress={() =>
          void Clipboard.setStringAsync(code)
            .then(() => setCopied(true))
            .catch(() => setCopied(false))
        }
      >
        <Text style={styles.link}>{copied ? 'Copied' : 'Copy code'}</Text>
      </Pressable>
      <ScrollView horizontal>
        <Text selectable style={styles.mono}>
          {code}
        </Text>
      </ScrollView>
    </View>
  );
}
function inline(text: string, onCitationPress?: (id: number) => void): React.ReactNode[] {
  const pattern = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`|\[\d+\])/g;
  return text.split(pattern).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <Text key={i} style={{ fontWeight: '700' }}>
        {part.slice(2, -2)}
      </Text>
    ) : part.startsWith('*') && part.endsWith('*') ? (
      <Text key={i} style={{ fontStyle: 'italic' }}>
        {part.slice(1, -1)}
      </Text>
    ) : part.startsWith('`') && part.endsWith('`') ? (
      <Text key={i} style={styles.mono}>
        {part.slice(1, -1)}
      </Text>
    ) : /^\[\d+\]$/.test(part) && onCitationPress ? (
      <Text
        key={i}
        accessibilityRole="button"
        accessibilityLabel={'Open source ' + part}
        style={styles.link}
        onPress={() => onCitationPress(Number(part.slice(1, -1)))}
      >
        {part}
      </Text>
    ) : (
      part
    ),
  );
}
const cells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
export const MarkdownView = React.memo(
  ({ content, onCitationPress }: { content: string; onCitationPress?: (id: number) => void }) => {
    const lines = content.split('\n');
    const nodes: React.ReactNode[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i],
        trimmed = line.trim();
      if (trimmed.startsWith('```')) {
        const code: string[] = [];
        const start = i;
        while (++i < lines.length && !lines[i].trim().startsWith('```')) code.push(lines[i]);
        nodes.push(<CodeBlock key={'code' + start} code={code.join('\n')} />);
        continue;
      }
      if (
        line.includes('|') &&
        i + 1 < lines.length &&
        cells(lines[i + 1]).every((c) => /^:?-{3,}:?$/.test(c))
      ) {
        const rows = [cells(line)];
        const start = i;
        i++;
        while (i + 1 < lines.length && lines[i + 1].includes('|') && lines[i + 1].trim())
          rows.push(cells(lines[++i]));
        nodes.push(
          <ScrollView horizontal key={'table' + start}>
            <View accessibilityLabel="Table" style={styles.table}>
              {rows.map((row, r) => (
                <View key={r} style={{ flexDirection: 'row' }}>
                  {row.map((cell, c) => (
                    <Text
                      selectable
                      key={c}
                      style={[
                        styles.cell,
                        r === 0 && { fontWeight: '700', backgroundColor: colors.raised },
                      ]}
                    >
                      {inline(cell, onCitationPress)}
                    </Text>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>,
        );
        continue;
      }
      if (!trimmed) {
        nodes.push(<View key={i} style={{ height: 8 }} />);
        continue;
      }
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
        nodes.push(<View key={i} style={styles.rule} />);
        continue;
      }
      const quote = trimmed.match(/^>\s?(.*)$/);
      if (quote) {
        nodes.push(
          <View
            key={i}
            style={{ borderLeftWidth: 3, borderLeftColor: colors.green, paddingLeft: 12 }}
          >
            <Text selectable style={styles.text}>
              {inline(quote[1], onCitationPress)}
            </Text>
          </View>,
        );
        continue;
      }
      const heading = trimmed.match(/^#{1,6}\s+(.+)$/);
      const list = trimmed.match(/^(\d+[.)]|[-*])\s+(.+)$/);
      nodes.push(
        <Text
          selectable
          key={i}
          style={[styles.text, heading && styles.heading, list && { paddingLeft: 8 }]}
        >
          {inline(
            heading
              ? heading[1]
              : list
                ? (list[1] === '-' || list[1] === '*' ? '•' : list[1]) + ' ' + list[2]
                : line,
            onCitationPress,
          )}
        </Text>,
      );
    }
    return <View style={{ gap: 4 }}>{nodes}</View>;
  },
);
const styles = StyleSheet.create({
  text: { color: colors.text, fontSize: 16, lineHeight: 25 },
  heading: { color: colors.text, fontSize: 20, lineHeight: 28, fontWeight: '700', marginTop: 10 },
  link: { color: colors.green, fontSize: 16 },
  mono: { color: colors.text, fontFamily: 'monospace', fontSize: 15, lineHeight: 23 },
  code: { backgroundColor: colors.bg, borderRadius: 8, padding: 12 },
  copy: { minHeight: 48, justifyContent: 'center', alignSelf: 'flex-end' },
  table: { borderColor: colors.border, borderWidth: 1, marginVertical: 8 },
  cell: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 24,
    width: 180,
    padding: 10,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  rule: { height: 1, backgroundColor: colors.border, marginVertical: 8 },
});

export function cleanLatexMath(str: string): string {
  let cleaned = str;
  // Strip outer delimiters \[ ... \] or \( ... \)
  cleaned = cleaned.replace(/^\\\[\s*/, '').replace(/\s*\\\]$/, '');
  cleaned = cleaned.replace(/^\\\(\s*/, '').replace(/\s*\\\)$/, '');
  // Strip any inline \( or \) or $$ delimiters, as well as stray \[ and \]
  cleaned = cleaned
    .replace(/\\([()])/g, '')
    .replace(/\$\$/g, '')
    .replace(/\\\[/g, '')
    .replace(/\\\]/g, '');

  // Strip standalone brackets around math formulas e.g. "[ \text{...} ]"
  if (
    cleaned.startsWith('[') &&
    cleaned.endsWith(']') &&
    /\\(text|frac|approx|times|cdot|boxed)/.test(cleaned)
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  // 1. Repeatedly unpack \text{...}, \mathrm{...}, \mathbf{...}, \textbf{...}, \mathit{...}
  while (/\\(text|mathrm|mathbf|textbf|mathit)\{([^{}]+)\}/.test(cleaned)) {
    cleaned = cleaned.replace(/\\(text|mathrm|mathbf|textbf|mathit)\{([^{}]+)\}/g, '$2');
  }

  // 2. Repeatedly unpack \boxed{...}
  while (/\\boxed\{([^{}]+)\}/.test(cleaned)) {
    cleaned = cleaned.replace(/\\boxed\{([^{}]+)\}/g, '$1');
  }

  // 3. Repeatedly convert \frac{a}{b} -> (a / b)
  while (/\\frac\{([^{}]+)\}\{([^{}]+)\}/.test(cleaned)) {
    cleaned = cleaned.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1 / $2)');
  }

  // 4. Strip LaTeX spacing commands: \! \, \; \: \quad \qquad (e.g. ₹1,\! 000 -> ₹1, 000)
  cleaned = cleaned.replace(/\\(!|,|;|:|quad|qquad)/g, '');

  // 5. Clean escaped dollar signs and currency collisions (e.g. ₹$750$ -> ₹750)
  cleaned = cleaned.replace(/\\\$/g, '$');
  cleaned = cleaned.replace(/₹\s*\$+/g, '₹').replace(/\$+\s*₹/g, '₹');
  cleaned = cleaned.replace(/\${2,}/g, '$');
  cleaned = cleaned.replace(/(₹\s*\d+)\$/g, '$1');
  // A dollar prefix is also a currency marker. Never remove it from a number.

  return cleaned
    .replace(/\\approx/g, '≈')
    .replace(/\\times/g, '×')
    .replace(/\\cdot/g, '·')
    .replace(/\\leq?/g, '≤')
    .replace(/\\geq?/g, '≥')
    .replace(/\\neq?/g, '≠')
    .replace(/\\pm/g, '±')
    .replace(/\\sqrt\{([^{}]+)\}/g, '√($1)')
    .replace(/\\circ/g, '°');
}
