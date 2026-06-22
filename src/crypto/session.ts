import sodium from 'react-native-libsodium';
import { IdentityKeyPair } from './keys';

export type SessionKeys = {
  /** Chave usada para decifrar mensagens recebidas desse contato. */
  rx: Uint8Array;
  /** Chave usada para cifrar mensagens enviadas a esse contato. */
  tx: Uint8Array;
};

/**
 * Deriva a chave de sessão de uma conversa 1:1 a partir das chaves de
 * identidade dos dois participantes, usando crypto_box_beforenm — a
 * função de pré-cálculo de segredo compartilhado do par crypto_box
 * (ECDH em X25519 seguido de HSalsa20), presente em praticamente todo
 * binding de libsodium.
 *
 * Diferente do par crypto_kx_client/server_session_keys (que gera duas
 * chaves distintas, uma para cada sentido), crypto_box_beforenm produz
 * uma única chave simétrica compartilhada pelos dois lados. Isso é
 * seguro para o nosso caso porque cada mensagem usa um nonce aleatório
 * de 24 bytes (XChaCha20), tornando a chance de reuso de nonce
 * desprezível — é o mesmo modelo usado pelo crypto_box "puro" do NaCl
 * para conversas entre duas partes.
 *
 * Não há nenhum segredo adicional trafegando pela rede: os dois lados
 * chegam à mesma chave de forma determinística, só com a chave pública
 * já trocada no handshake.
 */
export function deriveSessionKeys(self: IdentityKeyPair, peerPublicKey: Uint8Array): SessionKeys {
  const sharedKey = sodium.crypto_box_beforenm(peerPublicKey, self.privateKey);
  return { rx: sharedKey, tx: sharedKey };
}
