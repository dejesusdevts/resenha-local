import sodium from 'react-native-libsodium';
import { utf8Encode, toBase64, fromBase64 } from './encoding';

/**
 * Cifragem ponta a ponta com crypto_box_easy/open_easy (X25519 + XSalsa20-Poly1305).
 *
 * Usa jsOwned() para copiar resultados JSI-nativos para o heap JS antes de
 * qualquer operação que exija arrays JS puros (toBase64, etc.) — padrão
 * estabelecido neste projeto para contornar as limitações do binding
 * react-native-libsodium em Hermes/JSI.
 */

function jsOwned(src: Uint8Array): Uint8Array {
  const dst = new Uint8Array(src.length);
  for (let i = 0; i < src.length; i++) dst[i] = src[i];
  return dst;
}

export function encryptMessage(
  plaintext: string,
  recipientPublicKey: Uint8Array,
  senderPrivateKey: Uint8Array
): string {
  const nonce = jsOwned(sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES));
  const messageBytes = utf8Encode(plaintext);
  const ciphertext = jsOwned(
    sodium.crypto_box_easy(messageBytes, nonce, recipientPublicKey, senderPrivateKey)
  );

  const combined = new Uint8Array(nonce.length + ciphertext.length);
  for (let i = 0; i < nonce.length;      i++) combined[i]               = nonce[i];
  for (let i = 0; i < ciphertext.length; i++) combined[nonce.length + i] = ciphertext[i];
  return toBase64(combined);
}

export function decryptMessage(
  payloadBase64: string,
  senderPublicKey: Uint8Array,
  recipientPrivateKey: Uint8Array
): string {
  const combined   = fromBase64(payloadBase64);
  const nonceLen   = sodium.crypto_box_NONCEBYTES;

  const nonce = new Uint8Array(nonceLen);
  for (let i = 0; i < nonceLen; i++) nonce[i] = combined[i];

  const ciphertext = new Uint8Array(combined.length - nonceLen);
  for (let i = 0; i < ciphertext.length; i++) ciphertext[i] = combined[nonceLen + i];

  const plaintextBytes = jsOwned(
    sodium.crypto_box_open_easy(ciphertext, nonce, senderPublicKey, recipientPrivateKey)
  );
  return sodium.to_string(plaintextBytes);
}
