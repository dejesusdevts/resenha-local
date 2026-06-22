import sodium from 'react-native-libsodium';
import { utf8Encode } from './encoding';

/**
 * Ordena duas chaves públicas de forma determinística (mesmo resultado
 * em ambos os aparelhos, não importa quem está "perguntando"). Base de
 * todo identificador simétrico derivado de um par de chaves — impressão
 * digital de segurança e ID de conversa, abaixo.
 */
function orderPublicKeys(publicKeyA: Uint8Array, publicKeyB: Uint8Array): [Uint8Array, Uint8Array] {
  return compareBytes(publicKeyA, publicKeyB) <= 0 ? [publicKeyA, publicKeyB] : [publicKeyB, publicKeyA];
}

/**
 * Comparação de bytes determinística — usada em todo o app para
 * desempate consistente entre duas chaves públicas (quem é "A"/"B" no
 * handshake, ordenação para fingerprint, etc), sempre com o mesmo
 * resultado nos dois aparelhos envolvidos.
 */
export function compareBytes(a: Uint8Array, b: Uint8Array): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

/**
 * Gera uma "impressão digital de segurança" legível, derivada das chaves
 * públicas dos dois participantes de uma conversa — na mesma ordem nos
 * dois aparelhos — para que o usuário possa conferir pessoalmente (em
 * voz alta, ou comparando na tela) que não há interceptação no meio
 * (ataque man-in-the-middle). O mesmo princípio dos "números de
 * segurança" do Signal ou dos "códigos de segurança" do WhatsApp.
 */
export function computeSafetyNumber(publicKeyA: Uint8Array, publicKeyB: Uint8Array): string {
  const [first, second] = orderPublicKeys(publicKeyA, publicKeyB);

  const combined = new Uint8Array(first.length + second.length);
  combined.set(first, 0);
  combined.set(second, first.length);

  const hash = sodium.crypto_generichash(32, combined);
  const hex = sodium.to_hex(hash).toUpperCase();

  // Quebra em grupos de 5 caracteres para facilitar leitura e comparação.
  return hex
    .slice(0, 30)
    .match(/.{1,5}/g)!
    .join(' ');
}

/**
 * Fingerprint de uma única identidade (não de um par), usado pelo TOFU
 * (Trust On First Use) para reconhecer e detectar mudanças na chave
 * pública de um contato ao longo do tempo. SHA-256 não está disponível
 * diretamente nesta build do libsodium — usamos crypto_generichash
 * (BLAKE2b) com saída de 32 bytes, que tem as mesmas garantias de
 * resistência a colisão/pré-imagem que importam aqui.
 */
export function computeIdentityFingerprint(publicKey: Uint8Array): string {
  const hash = sodium.crypto_generichash(32, publicKey);
  return sodium.to_hex(hash);
}

/**
 * Versão "legível" do fingerprint acima — mesmo formato em grupos de 5
 * caracteres do computeSafetyNumber, para exibir na UI quando necessário
 * (ex.: tela de detalhes do contato, ou no aviso de mudança de identidade).
 */
export function formatFingerprint(fingerprintHex: string): string {
  return (fingerprintHex.slice(0, 30).match(/.{1,5}/g) ?? []).join(' ').toUpperCase();
}
 *
 * Importante: NÃO usar o endpointId da Nearby Connections como ID de
 * conversa — ele é local a cada aparelho (o ID que A usa para "minha
 * conexão com B" não é necessariamente o mesmo que B usa para "minha
 * conexão com A"), então uma mensagem guardada sob o endpointId do
 * remetente fica salva sob uma chave que o destinatário nunca consulta.
 * A chave pública, por outro lado, é a mesma identidade nos dois lados —
 * então, ordenando as duas chaves de forma determinística antes de
 * derivar o ID (mesmo princípio do computeSafetyNumber acima), os dois
 * aparelhos chegam ao MESMO conversationId de forma independente, sem
 * precisar negociar nada pela rede.
 *
 * Tag de domínio separa esse hash do de computeSafetyNumber, para que
 * as duas strings derivadas do mesmo par de chaves nunca colidam.
 */
export function computeConversationId(publicKeyA: Uint8Array, publicKeyB: Uint8Array): string {
  const [first, second] = orderPublicKeys(publicKeyA, publicKeyB);
  const domainTag = utf8Encode('resenha-local:conversation');

  const combined = new Uint8Array(domainTag.length + first.length + second.length);
  combined.set(domainTag, 0);
  combined.set(first, domainTag.length);
  combined.set(second, domainTag.length + first.length);

  const hash = sodium.crypto_generichash(16, combined);
  return sodium.to_hex(hash);
}
