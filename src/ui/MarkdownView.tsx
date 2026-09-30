import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';

interface MarkdownViewProps {
  content: string;
  onCitationPress?: (citationId: number) => void;
}

export const MarkdownView: React.FC<MarkdownViewProps> = React.memo(({ content, onCitationPress }) => {
  if (!content) return null;

  const lines = content.split('\n');
  const renderedElements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Handle code blocks ```
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        renderedElements.push(
          <View key={`code-${i}`} style={styles.codeBlock}>
            <Text style={styles.codeText}>{codeBlockLines.join('\n')}</Text>
          </View>
        );
        codeBlockLines = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    const trimmed = line.trim();

    // Ignore standalone display math delimiter lines (\[, \], $$, \(, \))
    if (/^(\\\[|\\\]|\$\$|\\\(|\\\)|\[|\])$/.test(trimmed)) {
      continue;
    }

    // Empty line -> spacing
    if (!trimmed) {
      renderedElements.push(<View key={`spacer-${i}`} style={styles.lineSpacer} />);
      continue;
    }

    // Horizontal Divider Rule (---, ***, ___)
    if (/^(\-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      renderedElements.push(<View key={`hr-${i}`} style={styles.horizontalRule} />);
      continue;
    }

    // Headings (H1 to H5)
    if (trimmed.startsWith('##### ')) {
      renderedElements.push(
        <Text key={`h5-${i}`} style={styles.h5}>
          {renderInlineFormatting(trimmed.substring(6), onCitationPress)}
        </Text>
      );
      continue;
    }

    if (trimmed.startsWith('#### ')) {
      renderedElements.push(
        <Text key={`h4-${i}`} style={styles.h4}>
          {renderInlineFormatting(trimmed.substring(5), onCitationPress)}
        </Text>
      );
      continue;
    }

    if (trimmed.startsWith('### ')) {
      renderedElements.push(
        <Text key={`h3-${i}`} style={styles.h3}>
          {renderInlineFormatting(trimmed.substring(4), onCitationPress)}
        </Text>
      );
      continue;
    }

    if (trimmed.startsWith('## ')) {
      renderedElements.push(
        <Text key={`h2-${i}`} style={styles.h2}>
          {renderInlineFormatting(trimmed.substring(3), onCitationPress)}
        </Text>
      );
      continue;
    }

    if (trimmed.startsWith('# ')) {
      renderedElements.push(
        <Text key={`h1-${i}`} style={styles.h1}>
          {renderInlineFormatting(trimmed.substring(2), onCitationPress)}
        </Text>
      );
      continue;
    }

    // Blockquotes >
    if (trimmed.startsWith('> ')) {
      renderedElements.push(
        <View key={`quote-${i}`} style={styles.blockquote}>
          <Text style={styles.blockquoteText}>
            {renderInlineFormatting(trimmed.substring(2), onCitationPress)}
          </Text>
        </View>
      );
      continue;
    }

    // Bullet lists - or *
    if (/^[\*\-]\s+/.test(trimmed)) {
      const itemText = trimmed.replace(/^[\*\-]\s+/, '');
      renderedElements.push(
        <View key={`bullet-${i}`} style={styles.listRow}>
          <Text style={styles.bulletSymbol}>•</Text>
          <Text style={styles.listText}>
            {renderInlineFormatting(itemText, onCitationPress)}
          </Text>
        </View>
      );
      continue;
    }

    // Numbered lists: supports standard "1." as well as model-escaped "1\." or "1)"
    const numMatch = trimmed.match(/^(\d+)(?:\.|\\[.|\)])\s+(.*)$/);
    if (numMatch) {
      renderedElements.push(
        <View key={`num-${i}`} style={styles.listRow}>
          <Text style={styles.numSymbol}>{numMatch[1]}.</Text>
          <Text style={styles.listText}>
            {renderInlineFormatting(numMatch[2], onCitationPress)}
          </Text>
        </View>
      );
      continue;
    }

    // Normal paragraph
    renderedElements.push(
      <Text key={`p-${i}`} style={styles.paragraph}>
        {renderInlineFormatting(trimmed, onCitationPress)}
      </Text>
    );
  }

  // Handle trailing unclosed code block (e.g. while actively streaming)
  if (inCodeBlock && codeBlockLines.length > 0) {
    renderedElements.push(
      <View key="code-unclosed" style={styles.codeBlock}>
        <Text style={styles.codeText}>{codeBlockLines.join('\n')}</Text>
      </View>
    );
  }

  return <View style={styles.container}>{renderedElements}</View>;
});

/**
 * Parses inline tokens: **bold**, *italic*, `code`, and [1] citations.
 * Also cleans up unneeded backslash escaping (like \. or \-).
 */
function renderInlineFormatting(
  text: string,
  onCitationPress?: (citationId: number) => void
): React.ReactNode[] {
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[\d+\])/g;
  const parts = text.split(regex);

  return parts.map((part, index) => {
    if (!part) return null;

    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      const cleanInner = cleanEscapes(part.substring(2, part.length - 2));
      return (
        <Text key={`b-${index}`} style={styles.bold}>
          {cleanInner}
        </Text>
      );
    }

    if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
      const cleanInner = cleanEscapes(part.substring(1, part.length - 1));
      return (
        <Text key={`i-${index}`} style={styles.italic}>
          {cleanInner}
        </Text>
      );
    }

    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <Text key={`c-${index}`} style={styles.inlineCode}>
          {part.substring(1, part.length - 1)}
        </Text>
      );
    }

    const citationMatch = part.match(/^\[(\d+)\]$/);
    if (citationMatch) {
      const citNum = parseInt(citationMatch[1], 10);
      return (
        <Text
          key={`cit-${index}`}
          style={styles.citationBadge}
          onPress={() => onCitationPress?.(citNum)}
        >
          {part}
        </Text>
      );
    }

    return <Text key={`t-${index}`}>{cleanEscapes(part)}</Text>;
  });
}

export function cleanLatexMath(str: string): string {
  let cleaned = str;
  // Strip outer delimiters \[ ... \] or \( ... \)
  cleaned = cleaned.replace(/^\\\[\s*/, '').replace(/\s*\\\]$/, '');
  cleaned = cleaned.replace(/^\\\(\s*/, '').replace(/\s*\\\)$/, '');
  // Strip any inline \( or \) or $$ delimiters, as well as stray \[ and \]
  cleaned = cleaned.replace(/\\([()])/g, '').replace(/\$\$/g, '').replace(/\\\[/g, '').replace(/\\\]/g, '');

  // Strip standalone brackets around math formulas e.g. "[ \text{...} ]"
  if (cleaned.startsWith('[') && cleaned.endsWith(']') && /\\(text|frac|approx|times|cdot|boxed)/.test(cleaned)) {
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
  cleaned = cleaned.replace(/=\s*\$(\d+)\$/g, '= $1');
  cleaned = cleaned.replace(/=\s*\$(\d+)/g, '= $1');

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

function cleanEscapes(str: string): string {
  const withoutLatex = cleanLatexMath(str);
  // Strip model backslash escapes: \. \* \_ \# \[ \] \( \) \-
  return withoutLatex.replace(/\\([.\*\_#\[\]\(\)\-\`])/g, '$1');
}

const styles = StyleSheet.create({
  container: {
    width: '100%'
  },
  paragraph: {
    color: '#E0E0E0',
    fontSize: 15,
    lineHeight: 23,
    marginBottom: 4,
    letterSpacing: 0.2
  },
  h1: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '800',
    marginTop: 10,
    marginBottom: 6,
    letterSpacing: 0.3
  },
  h2: {
    color: '#4ADE80',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 4,
    letterSpacing: 0.2
  },
  h3: {
    color: '#F3F4F6',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 6,
    marginBottom: 3
  },
  h4: {
    color: '#E4E4E7',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 3,
    letterSpacing: 0.1
  },
  h5: {
    color: '#D4D4D8',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 6,
    marginBottom: 2
  },
  horizontalRule: {
    height: 1,
    backgroundColor: '#27272A',
    marginVertical: 12,
    width: '100%'
  },
  bold: {
    fontWeight: '700',
    color: '#FFFFFF'
  },
  italic: {
    fontStyle: 'italic',
    color: '#CBD5E1'
  },
  inlineCode: {
    fontFamily: 'monospace',
    backgroundColor: '#1E293B',
    color: '#38BDF8',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    fontSize: 13
  },
  codeBlock: {
    backgroundColor: '#141414',
    borderColor: '#262626',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginVertical: 8
  },
  codeText: {
    color: '#38BDF8',
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: 18
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 2,
    paddingLeft: 4
  },
  bulletSymbol: {
    color: '#4ADE80',
    fontSize: 15,
    marginRight: 8,
    lineHeight: 22
  },
  numSymbol: {
    color: '#4ADE80',
    fontSize: 14,
    fontWeight: '700',
    marginRight: 6,
    lineHeight: 22
  },
  listText: {
    flex: 1,
    color: '#E0E0E0',
    fontSize: 15,
    lineHeight: 22
  },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: '#4ADE80',
    paddingLeft: 10,
    marginVertical: 6
  },
  blockquoteText: {
    color: '#94A3B8',
    fontStyle: 'italic',
    fontSize: 14,
    lineHeight: 20
  },
  citationBadge: {
    color: '#4ADE80',
    fontWeight: '800',
    backgroundColor: '#1E3A24',
    paddingHorizontal: 4,
    borderRadius: 4,
    fontSize: 13
  },
  lineSpacer: {
    height: 6
  }
});
