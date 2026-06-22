import sodium from 'react-native-libsodium';

/**
 * HKDF-SHA256 (RFC 5869), via as funções nativas confirmadas presentes
 * nesta build do libsodium: `_unstable_crypto_kdf_hkdf_sha256_extract` e
 * `_unstable_crypto_kdf_hkdf_sha256_expand`.
 *
 * RESSALVA: o prefixo "_unstable_" é da própria biblioteca, sinalizando
 * que essa API pode mudar ou desaparecer em versões futuras do binding.
 * Recomendações antes de produção:
 *   1. Fixar a versão exata de `react-native-libsodium` no package.json
 *      (sem `^`/`~`), para não tomar uma atualização que remova/altere
 *      essa API sem aviso.
 *   2. Rodar `await sodium.ready; console.log(Object.keys(sodium))` a
 *      cada atualização da dependência e confirmar que essas quatro
 *      chaves (`..._extract`, `..._expand`, `..._KEYBYTES`,
 *      `..._BYTES_MIN/MAX`) continuam presentes antes de atualizar.
 *   3. Alternativa de reserva, caso essa API suma: `crypto_kdf_derive_from_key`
 *      (BLAKE2b, parte estável e documentada do libsodium, também
 *      confirmada presente nesta build) pode substituir o HKDF-SHA256
 *      como KDF interno — não é literalmente HKDF-SHA256, mas como toda
 *      a derivação aqui é interna ao próprio protocolo (não precisa
 *      interoperar com nenhuma implementação externa de HKDF), a troca é
 *      segura desde que feita de forma consistente nos dois lados.
 */

export function hkdfExtract(salt: Uint8Array, inputKeyMaterial: Uint8Array): Uint8Array {
  return (sodium as any)._unstable_crypto_kdf_hkdf_sha256_extract(salt, inputKeyMaterial);
}

export function hkdfExpand(pseudoRandomKey: Uint8Array, info: Uint8Array, length: number): Uint8Array {
  return (sodium as any)._unstable_crypto_kdf_hkdf_sha256_expand(pseudoRandomKey, info, length);
}

/** Atalho extract+expand — RFC 5869 seção 2, o uso mais comum. */
export function hkdf(
  salt: Uint8Array,
  inputKeyMaterial: Uint8Array,
  info: Uint8Array,
  length: number
): Uint8Array {
  const prk = hkdfExtract(salt, inputKeyMaterial);
  return hkdfExpand(prk, info, length);
}
