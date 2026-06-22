/**
 * Codificação UTF-8 e base64 escritas à mão, em JS puro, sem depender de
 * `sodium.from_string`/`to_base64`/`from_base64`.
 *
 * Motivo: esta versão do react-native-libsodium não expõe `from_string`
 * (só `to_string`), e a tentativa de fixar a variante de base64 via
 * `sodium.base64_variants.ORIGINAL` não resolveu a incompatibilidade com
 * o base64 produzido pelo Android (`Base64.encodeToString(bytes,
 * Base64.NO_WRAP)`) — o nome dessa constante aparentemente não existe
 * (ou não tem esse valor) neste binding específico. Em vez de continuar
 * adivinhando a API exata da biblioteca, a codificação aqui é totalmente
 * autocontida: o mesmo algoritmo roda nos dois lados (este arquivo no
 * lado JS, e o `Base64` padrão do Android no lado Kotlin), seguindo à
 * risca o RFC 4648 (alfabeto padrão, com padding "="), que é exatamente
 * o que `Base64.encodeToString(bytes, Base64.NO_WRAP)` produz.
 */

export function utf8Encode(text: string): Uint8Array {
  const bytes: number[] = [];

  for (let i = 0; i < text.length; i++) {
    let codePoint = text.codePointAt(i)!;

    if (codePoint > 0xffff) {
      // par substituto UTF-16 (caracteres fora do BMP) — pula a segunda metade
      i++;
    }

    if (codePoint < 0x80) {
      bytes.push(codePoint);
    } else if (codePoint < 0x800) {
      bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint < 0x10000) {
      bytes.push(
        0xe0 | (codePoint >> 12),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f)
      );
    } else {
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f)
      );
    }
  }

  return new Uint8Array(bytes);
}

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const BASE64_LOOKUP: Record<string, number> = (() => {
  const table: Record<string, number> = {};
  for (let i = 0; i < BASE64_CHARS.length; i++) {
    table[BASE64_CHARS[i]] = i;
  }
  return table;
})();

/** Codifica bytes em base64 padrão (RFC 4648, com padding "="). */
export function toBase64(bytes: Uint8Array): string {
  let result = '';
  let i = 0;

  for (; i + 2 < bytes.length; i += 3) {
    const chunk = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    result += BASE64_CHARS[(chunk >> 18) & 0x3f];
    result += BASE64_CHARS[(chunk >> 12) & 0x3f];
    result += BASE64_CHARS[(chunk >> 6) & 0x3f];
    result += BASE64_CHARS[chunk & 0x3f];
  }

  const remaining = bytes.length - i;
  if (remaining === 1) {
    const chunk = bytes[i] << 16;
    result += BASE64_CHARS[(chunk >> 18) & 0x3f];
    result += BASE64_CHARS[(chunk >> 12) & 0x3f];
    result += '==';
  } else if (remaining === 2) {
    const chunk = (bytes[i] << 16) | (bytes[i + 1] << 8);
    result += BASE64_CHARS[(chunk >> 18) & 0x3f];
    result += BASE64_CHARS[(chunk >> 12) & 0x3f];
    result += BASE64_CHARS[(chunk >> 6) & 0x3f];
    result += '=';
  }

  return result;
}

/** Decodifica base64 padrão (RFC 4648) de volta para bytes. Ignora
 *  caracteres fora do alfabeto (espaços, quebras de linha, etc). */
export function fromBase64(base64: string): Uint8Array {
  const bytes: number[] = [];
  let buffer = 0;
  let bitsCollected = 0;

  for (let i = 0; i < base64.length; i++) {
    const char = base64[i];
    if (char === '=') break;

    const value = BASE64_LOOKUP[char];
    if (value === undefined) continue;

    buffer = (buffer << 6) | value;
    bitsCollected += 6;

    if (bitsCollected >= 8) {
      bitsCollected -= 8;
      bytes.push((buffer >> bitsCollected) & 0xff);
    }
  }

  return new Uint8Array(bytes);
}
