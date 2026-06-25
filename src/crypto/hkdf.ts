import sodium from 'react-native-libsodium';

/**
 * HKDF-SHA256 (RFC 5869), via _unstable_crypto_kdf_hkdf_sha256_*.
 *
 * ATENÇÃO — ArrayBuffer vs Uint8Array:
 *   O binding JSI nativo desta versão do react-native-libsodium exige
 *   ArrayBuffer explícito para os parâmetros das funções _unstable_.
 *   Uint8Array e ArrayBuffer são tipos distintos no JSI: Uint8Array tem
 *   byteOffset/byteLength próprios e pode apontar para um segmento de
 *   um buffer maior (caso comum nos outputs do sodium). Por isso usamos
 *   .buffer.slice(offset, offset+length) — que cria uma CÓPIA do trecho
 *   correto como um ArrayBuffer independente — em vez de .buffer direto
 *   (que retornaria o buffer inteiro, potencialmente com dados extras se
 *   o Uint8Array for uma view de um buffer maior).
 */

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

export function hkdfExtract(salt: Uint8Array, inputKeyMaterial: Uint8Array): Uint8Array {
  return (sodium as any)._unstable_crypto_kdf_hkdf_sha256_extract(
    toArrayBuffer(salt),
    toArrayBuffer(inputKeyMaterial)
  );
}

export function hkdfExpand(prk: Uint8Array, info: Uint8Array, length: number): Uint8Array {
  return (sodium as any)._unstable_crypto_kdf_hkdf_sha256_expand(
    toArrayBuffer(prk),
    toArrayBuffer(info),
    length
  );
}

/** Extract + Expand combinados — RFC 5869 seção 2. */
export function hkdf(
  salt: Uint8Array,
  inputKeyMaterial: Uint8Array,
  info: Uint8Array,
  length: number
): Uint8Array {
  const prk = hkdfExtract(salt, inputKeyMaterial);
  return hkdfExpand(prk, info, length);
}
