import Decimal from 'decimal.js';

const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export interface CalculationResult {
  expression: string;
  result: string;
  unit?: string;
  currency?: string;
  inputs?: string[];
  note?: string;
}
export function evaluateExpression(expression: string): CalculationResult {
  if (!expression.trim() || expression.length > 2048)
    throw new Error('Enter an expression of at most 2048 characters.');
  const normalized = expression.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
  const tokens = normalized.match(/\d+(?:\.\d+)?|\.\d+|[()+*/-]/g) || [];
  if (tokens.join('') !== normalized.replace(/\s/g, '') || tokens.length > 256) {
    throw new Error('Unsupported expression. Use numbers, +, -, ×, ÷, and parentheses.');
  }
  let position = 0,
    depth = 0;
  const atom = (): Decimal => {
    if (++depth > 32) throw new Error('Expression is nested too deeply.');
    let value: Decimal;
    const token = tokens[position++];
    if (token === '+' || token === '-') {
      value = atom();
      if (token === '-') value = value.negated();
    } else if (token === '(') {
      value = sum();
      if (tokens[position++] !== ')') throw new Error('Unbalanced expression parentheses.');
    } else {
      if (!token || !/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(token) || token.length > 100) {
        throw new Error('Invalid expression operand.');
      }
      value = new D(token);
    }
    depth--;
    return value;
  };
  const product = (): Decimal => {
    let value = atom();
    while (tokens[position] === '*' || tokens[position] === '/') {
      const operator = tokens[position++],
        operand = atom();
      if (operator === '/' && operand.isZero()) throw new Error('Cannot divide by zero.');
      value = operator === '*' ? value.times(operand) : value.dividedBy(operand);
    }
    return value;
  };
  const sum = (): Decimal => {
    let value = product();
    while (tokens[position] === '+' || tokens[position] === '-') {
      const operator = tokens[position++],
        operand = product();
      value = operator === '+' ? value.plus(operand) : value.minus(operand);
    }
    return value;
  };
  const result = sum();
  if (position !== tokens.length || !result.isFinite()) throw new Error('Invalid expression.');
  return {
    expression: expression.trim(),
    result: result.toString(),
    inputs: tokens.filter((t) => /\d/.test(t)),
    note: 'Decimal arithmetic: up to 40 significant digits. Longer results are rounded.',
  };
}

const UNITS: Record<string, [string, string]> = {
  m: ['length', '1'],
  meter: ['length', '1'],
  meters: ['length', '1'],
  metre: ['length', '1'],
  metres: ['length', '1'],
  km: ['length', '1000'],
  kilometer: ['length', '1000'],
  kilometers: ['length', '1000'],
  cm: ['length', '0.01'],
  mm: ['length', '0.001'],
  mile: ['length', '1609.344'],
  miles: ['length', '1609.344'],
  ft: ['length', '0.3048'],
  feet: ['length', '0.3048'],
  inch: ['length', '0.0254'],
  inches: ['length', '0.0254'],
  kg: ['mass', '1000'],
  g: ['mass', '1'],
  gram: ['mass', '1'],
  grams: ['mass', '1'],
  lb: ['mass', '453.59237'],
  lbs: ['mass', '453.59237'],
  oz: ['mass', '28.349523125'],
  l: ['volume', '1'],
  liter: ['volume', '1'],
  liters: ['volume', '1'],
  litre: ['volume', '1'],
  litres: ['volume', '1'],
  ml: ['volume', '0.001'],
  s: ['time', '1'],
  seconds: ['time', '1'],
  min: ['time', '60'],
  minutes: ['time', '60'],
  h: ['time', '3600'],
  hours: ['time', '3600'],
  days: ['time', '86400'],
};
const CURRENCY =
  /₹|€|£|\$|¥|₩|\b(?:INR|USD|EUR|GBP|JPY|CAD|AUD|AED|rupees?|dollars?|euros?|pounds?|yen|dirhams?)\b/gi;
const MONEY_CODE: Record<string, string> = {
  '₹': 'INR',
  rupee: 'INR',
  rupees: 'INR',
  '€': 'EUR',
  euro: 'EUR',
  euros: 'EUR',
  '£': 'GBP',
  pound: 'GBP',
  pounds: 'GBP',
  $: 'USD',
  dollar: 'USD',
  dollars: 'USD',
  '¥': 'JPY',
  yen: 'JPY',
  '₩': 'KRW',
  dirham: 'AED',
  dirhams: 'AED',
};
function currencyFor(query: string): string | undefined {
  const found = query.match(CURRENCY) || [];
  const currencies = new Set(found.map((s) => MONEY_CODE[s.toLowerCase()] || s.toUpperCase()));
  if (currencies.size > 1)
    throw new Error(
      'Mixed currencies need an exchange rate. Offline currency exchange is not supported.',
    );
  return found[0];
}
function normalizeNumbers(query: string): string {
  return query.replace(/\b\d{1,3}(?:,\d{2,3})+(?:\.\d+)?\b/g, (n) => n.replace(/,/g, ''));
}
export function looksLikeCalculation(query: string): boolean {
  return (
    /\d/.test(query) &&
    (/[+×÷*/=]/.test(query) ||
      /\b(calculate|compute|evaluate|convert|discount|percent|percentage|add|subtract|multiply|divide|sum|ratio|split|spent|bought|remaining|balance|left|remains)\b|%/i.test(
        query,
      ))
  );
}
export function calculateQuery(query: string): CalculationResult | null {
  const q = normalizeNumbers(query.trim());
  const pure = q
    .replace(/^(?:calculate|compute|what is|what's|evaluate)\s+/i, '')
    .replace(/[?=]+\s*$/, '')
    .trim();
  if (/^[\d.\s()+×÷*/−-]+$/.test(pure) && /\d/.test(pure)) return evaluateExpression(pure);

  const withoutCurrency = pure.replace(CURRENCY, '').trim();
  if (/^[\d.\s()+*/\u00d7\u00f7\u2212-]+$/.test(withoutCurrency) && /\d/.test(withoutCurrency)) {
    return { ...evaluateExpression(withoutCurrency), currency: currencyFor(pure) };
  }

  const conversion = q.match(
    /^(?:convert\s+)?(-?\d+(?:\.\d+)?)\s*°?([a-z]+)\s+(?:to|in)\s+°?([a-z]+)[?.]?$/i,
  );
  if (conversion) {
    const [, amount, fromRaw, toRaw] = conversion,
      from = fromRaw.toLowerCase(),
      to = toRaw.toLowerCase();
    const temps: Record<string, string> = {
      c: 'c',
      celsius: 'c',
      f: 'f',
      fahrenheit: 'f',
      k: 'k',
      kelvin: 'k',
    };
    let value = new D(amount);
    if (temps[from] && temps[to]) {
      if (temps[from] === 'f') value = value.minus(32).times(5).dividedBy(9);
      if (temps[from] === 'k') value = value.minus('273.15');
      if (value.lt('-273.15')) throw new Error('Temperature is below absolute zero.');
      if (temps[to] === 'f') value = value.times(9).dividedBy(5).plus(32);
      if (temps[to] === 'k') value = value.plus('273.15');
    } else {
      const a = UNITS[from],
        b = UNITS[to];
      if (!a || !b || a[0] !== b[0])
        throw new Error('Unsupported or incompatible units. Specify a supported unit explicitly.');
      value = value.times(a[1]).dividedBy(b[1]);
    }
    return {
      expression: amount + ' ' + fromRaw + ' → ' + toRaw,
      result: value.toString(),
      unit: toRaw,
      inputs: [amount],
    };
  }

  const percentage = q.match(
    /^(?:what is\s+|calculate\s+)?(\d+(?:\.\d+)?)\s*(?:%|percent)\s+(of|discount on|off)\s+(.+?)[?!.]?$/i,
  );
  if (percentage) {
    const [, rate, operation, baseText] = percentage,
      currency = currencyFor(baseText);
    const numbers = baseText.match(/-?\d+(?:\.\d+)?/g) || [];
    if (numbers.length !== 1) throw new Error('Specify one base amount for this percentage.');
    const base = numbers[0];
    const expression =
      operation.toLowerCase() === 'of'
        ? base + ' * ' + rate + ' / 100'
        : base + ' * (1 - ' + rate + ' / 100)';
    return { ...evaluateExpression(expression), currency };
  }

  if (/\b(left|remaining|remains|balance)\b/i.test(q) && /\b(spent|spend|bought|paid)\b/i.test(q)) {
    const currency = currencyFor(q);
    const start = q.match(
      /\b(?:have|had|start(?:ed)? with|starting (?:with|balance)|budget(?: of)?)\s*[:=]?\s*(?:₹|€|£|\$|¥|₩|[A-Z]{3}\s*)?\s*(\d+(?:\.\d+)?)/i,
    );
    if (!start || start.index === undefined)
      throw new Error('Specify your starting balance and each expense.');
    const prefixNumbers = q.slice(0, start.index).match(/\d+/g);
    const rest = q.slice(start.index + start[0].length);
    const expenses = rest.match(/\d+(?:\.\d+)?/g) || [];
    if (
      /%|\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b|\b(?:bought|buy|purchased)\s+\d+(?:\.\d+)?\s+[a-z]/i.test(
        rest,
      ) ||
      prefixNumbers ||
      expenses.length === 0 ||
      expenses.length > 20 ||
      /\b(?:items?|shirts?|pants|tickets?)\b\s*(?:×|x)\s*\d/i.test(rest) ||
      /\b(?:\d+\s+(?:shirts?|pants|items?|tickets?)|refund|received|earned|income|cashback|rebate|reimbursed|credit|coupon|discount|percent|percentage|each|per|interest|tax)\b/i.test(
        rest,
      )
    ) {
      throw new Error(
        'This balance question needs clearer amounts. Enter an expression, for example 1000 - (450 + 300).',
      );
    }
    return { ...evaluateExpression(start[1] + ' - (' + expenses.join(' + ') + ')'), currency };
  }
  return null;
}

export function formatCalculation(result: CalculationResult): string {
  const { currency, unit } = result;
  const amount = !currency
    ? result.result
    : /^[A-Z]{3}$/.test(currency)
      ? currency + ' ' + result.result
      : /^[A-Za-z]/.test(currency)
        ? result.result + ' ' + currency
        : currency + result.result;
  return amount + (unit ? ' ' + unit : '');
}
