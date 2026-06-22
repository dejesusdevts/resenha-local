import sodium from 'react-native-libsodium';
import { rawDiffieHellman } from './dh';
import { hkdf } from './hkdf';
import { compareBytes } from './fingerprint';
import { utf8Encode } from './encoding';
import { IdentityKeyPair } from './keys';
import { DHKeyPair } from './doubleRatchet';

/**
 * Handshake efêmero local, peer-to-peer, sem servidor — adaptado do X3DH
 * (Extended Triple Diffie-Hellman, usado pelo Signal). A diferença do
 * X3DH original é estrutural, não criptográfica: o X3DH foi desenhado
 * para o caso em que Bob está OFFLINE e Alice inicia uma conversa usando
 * um "bundle" de pré-chaves que Bob deixou guardado num servidor de
 * antemão. Aqui não existe servidor nem cenário offline — os dois
 * aparelhos já estão conectados e online um com o outro quando o
 * handshake acontece (é literalmente o motivo de o Nearby Connections
 * ter terminado de conectar os dois). Por isso, em vez de "chave de
 * identidade + chave pré-assinada do servidor", combinamos diretamente a
 * chave de identidade e a chave efêmera de CADA lado, trocadas na hora:
 *
 *   DH1 = DH(identidade de A, efêmera de B)
 *   DH2 = DH(efêmera de A,    identidade de B)
 *   DH3 = DH(efêmera de A,    efêmera de B)
 *   IKM = DH1 || DH2 || DH3
 *   SK  = HKDF-SHA256(sal fixo, IKM, "resenha-local:x3dh-root", 32 bytes)
 *
 * Por que três DH e não um só: cada termo contribui uma garantia
 * diferente —
 *   DH1 e DH2 envolvem uma chave de IDENTIDADE de cada vez, então
 *   autenticam os dois lados um para o outro (só quem tem a chave
 *   privada de identidade correspondente consegue calcular o mesmo SK);
 *   DH3 (efêmera-efêmera) é o termo que garante Perfect Forward Secrecy
 *   já no segredo inicial — mesmo que as duas chaves de identidade
 *   vazem no futuro, sem as chaves efêmeras (descartadas logo depois do
 *   handshake) ninguém recalcula esse SK retroativamente.
 *
 * "A" e "B" não são papéis fixos — são decididos de forma determinística
 * comparando as chaves de identidade (a mesma técnica usada em
 * computeConversationId), então os dois lados concordam sobre quem é
 * quem sem precisar negociar nada. Por comutatividade do X25519
 * (DH(skX,pkY) === DH(skY,pkX)), os dois lados calculam exatamente os
 * mesmos três valores DH1/DH2/DH3, na mesma ordem, usando cada um sua
 * própria chave privada — nenhum segredo privado é transmitido em
 * nenhum momento, só as quatro chaves públicas envolvidas (identidade e
 * efêmera de cada lado).
 *
 * O resultado SK vira a Root Key inicial do Double Ratchet — ver
 * doubleRatchet.ts e docs/crypto-architecture.md.
 */

export function generateEphemeralKeyPair(): DHKeyPair {
  const keyPair = sodium.crypto_box_keypair();
  return { publicKey: keyPair.publicKey, privateKey: keyPair.privateKey };
}

export type X3dhResult = {
  /** Vira a Root Key inicial do Double Ratchet. */
  sharedSecret: Uint8Array;
  /** true = papel "Alice" (iniciador) do Double Ratchet; false = "Bob" (respondedor). */
  isInitiator: boolean;
};

export function computeX3dhSharedSecret(
  selfIdentity: IdentityKeyPair,
  selfEphemeral: DHKeyPair,
  peerIdentityPublicKey: Uint8Array,
  peerEphemeralPublicKey: Uint8Array
): X3dhResult {
  const isInitiator = compareBytes(selfIdentity.publicKey, peerIdentityPublicKey) < 0;

  let dh1: Uint8Array, dh2: Uint8Array, dh3: Uint8Array;

  if (isInitiator) {
    // Eu sou "A": DH1 usa MINHA identidade, DH2 usa MINHA efêmera.
    dh1 = rawDiffieHellman(selfIdentity.privateKey, peerEphemeralPublicKey);
    dh2 = rawDiffieHellman(selfEphemeral.privateKey, peerIdentityPublicKey);
  } else {
    // Eu sou "B": para reconstruir os MESMOS DH1/DH2 que "A" calculou
    // (DH1 = DH(identidade de A, efêmera de B), DH2 = DH(efêmera de A,
    // identidade de B)), uso minha efêmera/identidade emparelhadas com
    // a identidade/efêmera de A — comutatividade do X25519 garante que
    // o valor numérico é idêntico ao que A calculou.
    dh1 = rawDiffieHellman(selfEphemeral.privateKey, peerIdentityPublicKey);
    dh2 = rawDiffieHellman(selfIdentity.privateKey, peerEphemeralPublicKey);
  }

  // DH3 (efêmera-efêmera) é simétrico em ambos os papéis.
  dh3 = rawDiffieHellman(selfEphemeral.privateKey, peerEphemeralPublicKey);

  const ikm = new Uint8Array(dh1.length + dh2.length + dh3.length);
  ikm.set(dh1, 0);
  ikm.set(dh2, dh1.length);
  ikm.set(dh3, dh1.length + dh2.length);

  const fixedSalt = new Uint8Array(32); // o segredo real vem do IKM, não do sal
  const sharedSecret = hkdf(fixedSalt, ikm, utf8Encode('resenha-local:x3dh-root'), 32);

  return { sharedSecret, isInitiator };
}
