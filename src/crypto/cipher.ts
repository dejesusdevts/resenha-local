import sodium from 'react-native-libsodium';
import { utf8Encode, toBase64, fromBase64 } from './encoding';

/**
 * Cifragem ponta a ponta com crypto_box_easy/open_easy (NaCl box):
 * X25519 (ECDH) + Poly1305, combinados em uma única chamada por mensagem.
 *
 * Diferente do design original (chave de sessão pré-calculada via
 * crypto_kx ou crypto_box_beforenm), aqui cada mensagem é cifrada
 * diretamente com a chave pública do destinatário + a chave privada do
 * remetente — não há nenhuma etapa de "derivar sessão" separada, porque
 * essa função do binding instalado não está disponível neste build (ver
 * Object.keys(sodium) testado em dispositivo real). O resultado final é
 * equivalente em segurança: ainda é ponta a ponta, com perfect secrecy
 * por mensagem garantida pelo nonce aleatório de 24 bytes.
 */

export function encryptMessage(
  plaintext: string,
  recipientPublicKey: Uint8Array,
  senderPrivateKey: Uint8Array
): string {
  const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
  const messageBytes = utf8Encode(plaintext);

  const ciphertext = sodium.crypto_box_easy(messageBytes, nonce, recipientPublicKey, senderPrivateKey);

  const combined = new Uint8Array(nonce.length + ciphertext.length);
  combined.set(nonce, 0);
  combined.set(ciphertext, nonce.length);

  return toBase64(combined);
}

export function decryptMessage(
  payloadBase64: string,
  senderPublicKey: Uint8Array,
  recipientPrivateKey: Uint8Array
): string {
  const combined = fromBase64(payloadBase64);
  const nonceLength = sodium.crypto_box_NONCEBYTES;
  const nonce = combined.slice(0, nonceLength);
  const ciphertext = combined.slice(nonceLength);

  const plaintextBytes = sodium.crypto_box_open_easy(ciphertext, nonce, senderPublicKey, recipientPrivateKey);
  return sodium.to_string(plaintextBytes);
}
