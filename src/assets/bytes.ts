const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function fromBase64(value: string): Uint8Array {
  const text = value.replace(/\s/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(text) || text.length % 4)
    throw new Error('Invalid base64 file data.');
  const result = new Uint8Array(
    (text.length / 4) * 3 - (text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0),
  );
  let offset = 0;
  for (let i = 0; i < text.length; i += 4) {
    const n =
      (alphabet.indexOf(text[i]) << 18) |
      (alphabet.indexOf(text[i + 1]) << 12) |
      ((text[i + 2] === '=' ? 0 : alphabet.indexOf(text[i + 2])) << 6) |
      (text[i + 3] === '=' ? 0 : alphabet.indexOf(text[i + 3]));
    if (offset < result.length) result[offset++] = (n >> 16) & 255;
    if (offset < result.length) result[offset++] = (n >> 8) & 255;
    if (offset < result.length) result[offset++] = n & 255;
  }
  return result;
}

export function decodeUTF8(bytes: Uint8Array): string {
  const units: number[] = [];
  const chunks: string[] = [];
  const flush = () => {
    chunks.push(String.fromCharCode(...units));
    units.length = 0;
  };
  for (let i = 0; i < bytes.length; ) {
    const first = bytes[i++];
    let point: number;
    let extra: number;
    let minimum: number;
    if (first < 0x80) {
      point = first;
      extra = 0;
      minimum = 0;
    } else if (first >= 0xc2 && first <= 0xdf) {
      point = first & 31;
      extra = 1;
      minimum = 0x80;
    } else if (first >= 0xe0 && first <= 0xef) {
      point = first & 15;
      extra = 2;
      minimum = 0x800;
    } else if (first >= 0xf0 && first <= 0xf4) {
      point = first & 7;
      extra = 3;
      minimum = 0x10000;
    } else throw new Error('Invalid UTF-8 corpus text.');
    for (let n = 0; n < extra; n++) {
      const next = bytes[i++];
      if (next === undefined || (next & 0xc0) !== 0x80)
        throw new Error('Invalid UTF-8 corpus text.');
      point = (point << 6) | (next & 63);
    }
    if (point < minimum || point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff))
      throw new Error('Invalid UTF-8 corpus text.');
    if (point < 0x10000) units.push(point);
    else {
      point -= 0x10000;
      units.push(0xd800 + (point >> 10), 0xdc00 + (point & 1023));
    }
    if (units.length >= 4096) flush();
  }
  if (units.length) flush();
  return chunks.join('');
}
