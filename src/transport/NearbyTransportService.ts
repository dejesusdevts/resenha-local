import sodium from 'react-native-libsodium';
import * as NearbyTransport from 'nearby-transport';
import { useDevicesStore } from '../state/devicesStore';
import { useChatStore } from '../state/chatStore';
import { useTypingStore } from '../state/typingStore';
import { useProfileStore } from '../state/profileStore';
import { useSecurityStore } from '../state/securityStore';
import { loadOrCreateIdentityKeyPair, publicKeyToBase64, IdentityKeyPair } from '../crypto/keys';
import { computeConversationId } from '../crypto/fingerprint';
import { generateEphemeralKeyPair, computeX3dhSharedSecret } from '../crypto/handshake';
import { rawDiffieHellman } from '../crypto/dh';
import { hkdf, hkdfExpand } from '../crypto/hkdf';
import {
  DHKeyPair,
  RatchetState,
  RatchetMessage,
  initRatchetAsInitiator,
  initRatchetAsResponder,
  ratchetEncrypt,
  ratchetDecrypt,
  createSodiumRatchetPrimitives,
} from '../crypto/doubleRatchet';
import {
  evaluateTrust,
  acceptIdentityChange as acceptIdentityChangeInStorage,
  rejectIdentityChange as rejectIdentityChangeInStorage,
} from '../crypto/trust';
import { utf8Encode, toBase64, fromBase64 } from '../crypto/encoding';
import * as contactsRepository from '../storage/repositories/contactsRepository';
import * as messagesRepository from '../storage/repositories/messagesRepository';
import * as ratchetRepository from '../storage/repositories/ratchetRepository';
import { Message } from '../types';

/**
 * Camada de orquestração entre o módulo nativo (transporte bruto) e o
 * resto do app. Pipeline completo de uma conversa nova:
 *
 *   1. Conexão Nearby estabelecida -> os dois lados trocam um envelope
 *      "handshake" (identidade + efêmera + nome de usuário).
 *   2. TOFU (crypto/trust.ts) decide se a identidade recebida é
 *      confiável. Se a chave mudou para um nome já conhecido, a sessão
 *      fica BLOQUEADA (useSecurityStore) até confirmação do usuário —
 *      ver acceptIdentityChange/rejectIdentityChange abaixo.
 *   3. Se confiável: calcula (ou carrega do disco, se já existir) o
 *      estado do Double Ratchet para essa conversa — handshake.ts faz o
 *      X3DH só na primeira vez; reconexões seguintes reaproveitam a
 *      sessão salva (ratchetRepository), sem refazer o handshake.
 *   4. Mensagens e indicador de "digitando" trafegam como um único tipo
 *      de envelope ("ratchet"), cifrado pelo Double Ratchet — ver
 *      RatchetPayload abaixo.
 *
 * Protocolo de fio:
 *   { type: 'handshake', identityPublicKey, ephemeralPublicKey, username }
 *   { type: 'ratchet', conversationId, dhPublicKey, previousChainLength, messageNumber, ciphertext }
 *
 * conversationId nunca é o endpointId da Nearby Connections (que é local
 * a cada aparelho) — é sempre derivado das duas chaves de IDENTIDADE via
 * computeConversationId, calculado de forma independente nos dois lados.
 */

type WireEnvelope =
  | { type: 'handshake'; identityPublicKey: string; ephemeralPublicKey: string; username: string }
  | {
      type: 'ratchet';
      conversationId: string;
      dhPublicKey: string;
      previousChainLength: number;
      messageNumber: number;
      ciphertext: string;
    };

type RatchetPayload = { kind: 'message'; text: string } | { kind: 'typing'; isTyping: boolean };

const TYPING_INDICATOR_TIMEOUT_MS = 6000;

class NearbyTransportServiceImpl {
  private identity: IdentityKeyPair | null = null;
  private readonly primitives = createSodiumRatchetPrimitives(
    sodium,
    hkdfExpand,
    hkdf,
    rawDiffieHellman,
    toBase64,
    utf8Encode
  );

  private peerIdentityKeysByEndpoint = new Map<string, Uint8Array>();
  private ephemeralKeyPairsByEndpoint = new Map<string, DHKeyPair>();
  private ratchetStatesByConversation = new Map<string, RatchetState>();
  private conversationIdByEndpoint = new Map<string, string>();
  private typingTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
  private subscriptions: { remove: () => void }[] = [];
  private started = false;

  async start(): Promise<void> {
    if (this.started) return;
    const profile = useProfileStore.getState().profile;
    if (!profile) throw new Error('Perfil ainda não criado — complete o onboarding primeiro.');

    await sodium.ready;
    this.identity = await loadOrCreateIdentityKeyPair();

    this.subscriptions = [
      NearbyTransport.addEndpointFoundListener(({ endpointId, endpointName }) => {
        useDevicesStore
          .getState()
          .upsertDevice({ endpointId, username: endpointName, status: 'discovered' });
        NearbyTransport.default.requestConnection(endpointId, profile.username).catch(() => {});
      }),

      NearbyTransport.addEndpointLostListener(({ endpointId }) => {
        useDevicesStore.getState().removeDevice(endpointId);
      }),

      NearbyTransport.addConnectionInitiatedListener(({ endpointId }) => {
        // Aceitamos automaticamente no nível de transporte; a confiança
        // real é decidida pelo TOFU no handshake (handleHandshake abaixo).
        NearbyTransport.default.acceptConnection(endpointId).catch(() => {});
      }),

      NearbyTransport.addConnectionResultListener(async ({ endpointId, status }) => {
        if (status !== 'connected') return;

        const current = useDevicesStore.getState().devices[endpointId];
        useDevicesStore.getState().upsertDevice({
          endpointId,
          username: current?.username ?? 'Desconhecido',
          status: 'connected',
        });

        await this.sendHandshake(endpointId).catch((error) => {
          console.warn('Falha ao enviar handshake:', error);
        });
      }),

      NearbyTransport.addDisconnectedListener(({ endpointId }) => {
        const conversationId = this.conversationIdByEndpoint.get(endpointId);
        if (conversationId) this.clearTypingIndicator(conversationId);

        this.peerIdentityKeysByEndpoint.delete(endpointId);
        this.ephemeralKeyPairsByEndpoint.delete(endpointId);
        this.conversationIdByEndpoint.delete(endpointId);
        useSecurityStore.getState().clearPendingChange(endpointId);

        const current = useDevicesStore.getState().devices[endpointId];
        useDevicesStore.getState().upsertDevice({
          endpointId,
          username: current?.username ?? 'Desconhecido',
          status: 'disconnected',
        });
      }),

      NearbyTransport.addPayloadReceivedListener(({ endpointId, payloadBase64 }) => {
        this.handlePayload(endpointId, payloadBase64).catch((error) => {
          console.warn('Falha ao processar payload recebido:', error);
        });
      }),
    ];

    await NearbyTransport.default.startAdvertising(profile.username);
    await NearbyTransport.default.startDiscovery();
    this.started = true;
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    await NearbyTransport.default.stopAll();
    this.subscriptions.forEach((subscription) => subscription.remove());
    this.subscriptions = [];

    this.peerIdentityKeysByEndpoint.clear();
    this.ephemeralKeyPairsByEndpoint.clear();
    this.ratchetStatesByConversation.clear(); // só cache em memória — o estado salvo no disco continua lá
    this.conversationIdByEndpoint.clear();
    this.typingTimeouts.forEach((timeout) => clearTimeout(timeout));
    this.typingTimeouts.clear();

    useDevicesStore.getState().reset();
    useTypingStore.getState().reset();
    useSecurityStore.getState().reset();
    this.started = false;
  }

  /** ID de conversa estável, ou null se o handshake ainda não terminou
   *  (ou está bloqueado por uma mudança de identidade pendente). */
  getConversationId(endpointId: string): string | null {
    return this.conversationIdByEndpoint.get(endpointId) ?? null;
  }

  isBlockedByIdentityChange(endpointId: string): boolean {
    return useSecurityStore.getState().pendingChangesByEndpoint[endpointId] !== undefined;
  }

  async sendMessage(endpointId: string, plaintext: string): Promise<void> {
    await this.sendRatchetPayload(endpointId, { kind: 'message', text: plaintext });
  }

  /** Best-effort de propósito — ver comentário em sendRatchetPayload. */
  async sendTypingIndicator(endpointId: string, isTyping: boolean): Promise<void> {
    try {
      await this.sendRatchetPayload(endpointId, { kind: 'typing', isTyping });
    } catch {
      // indicador de presença, não mensagem — não vale a pena logar falha a cada tecla
    }
  }

  /**
   * Chamado quando o usuário CONFIRMA explicitamente que confia na nova
   * identidade de um contato (ex.: reinstalou o app, trocou de
   * aparelho). Reinicialização segura da sessão: como o conversationId é
   * derivado das chaves de identidade, a nova identidade automaticamente
   * gera um conversationId novo — a sessão antiga nunca se mistura com a
   * nova. Por higiene de chaves, o estado de ratchet antigo (associado à
   * identidade anterior) é apagado do disco.
   */
  async acceptIdentityChange(endpointId: string): Promise<void> {
    const pending = useSecurityStore.getState().pendingChangesByEndpoint[endpointId];
    if (!pending || !this.identity) return;

    const newIdentityPublicKey = fromBase64(pending.pendingIdentityPublicKey);
    acceptIdentityChangeInStorage(pending.logId, pending.username, newIdentityPublicKey);

    const oldContact = contactsRepository.getContact(endpointId);
    if (oldContact) {
      const oldConversationId = computeConversationId(this.identity.publicKey, fromBase64(oldContact.publicKey));
      ratchetRepository.deleteRatchetState(oldConversationId);
      this.ratchetStatesByConversation.delete(oldConversationId);
    }

    this.peerIdentityKeysByEndpoint.set(endpointId, newIdentityPublicKey);
    contactsRepository.upsertContact({
      endpointId,
      username: pending.username,
      publicKey: pending.pendingIdentityPublicKey,
      lastSeenAt: Date.now(),
      verified: false,
    });

    this.bootstrapOrLoadRatchet(endpointId, newIdentityPublicKey, fromBase64(pending.pendingEphemeralPublicKey));
    useSecurityStore.getState().clearPendingChange(endpointId);
  }

  /** A identidade antiga continua sendo a única confiada; a conexão com
   *  a identidade rejeitada é encerrada, por higiene de segurança. */
  rejectIdentityChange(endpointId: string): void {
    const pending = useSecurityStore.getState().pendingChangesByEndpoint[endpointId];
    if (pending) rejectIdentityChangeInStorage(pending.logId);
    useSecurityStore.getState().clearPendingChange(endpointId);
    NearbyTransport.default.disconnect(endpointId).catch(() => {});
  }

  // --- Handshake -----------------------------------------------------

  private getOrCreateEphemeralKeyPair(endpointId: string): DHKeyPair {
    let keyPair = this.ephemeralKeyPairsByEndpoint.get(endpointId);
    if (!keyPair) {
      keyPair = generateEphemeralKeyPair();
      this.ephemeralKeyPairsByEndpoint.set(endpointId, keyPair);
    }
    return keyPair;
  }

  private async sendHandshake(endpointId: string): Promise<void> {
    const profile = useProfileStore.getState().profile;
    if (!profile || !this.identity) return;

    const ephemeral = this.getOrCreateEphemeralKeyPair(endpointId);

    await this.sendEnvelope(endpointId, {
      type: 'handshake',
      identityPublicKey: publicKeyToBase64(this.identity.publicKey),
      ephemeralPublicKey: toBase64(ephemeral.publicKey),
      username: profile.username,
    });
  }

  private async handleHandshake(
    endpointId: string,
    envelope: Extract<WireEnvelope, { type: 'handshake' }>
  ): Promise<void> {
    if (!this.identity) return;

    const peerIdentityPublicKey = fromBase64(envelope.identityPublicKey);
    const peerEphemeralPublicKey = fromBase64(envelope.ephemeralPublicKey);

    const trustDecision = evaluateTrust(envelope.username, peerIdentityPublicKey);

    if (trustDecision.outcome === 'identity_changed') {
      useSecurityStore.getState().setPendingChange(endpointId, {
        endpointId,
        username: envelope.username,
        oldFingerprint: trustDecision.oldFingerprint,
        newFingerprint: trustDecision.newFingerprint,
        logId: trustDecision.logId,
        pendingIdentityPublicKey: envelope.identityPublicKey,
        pendingEphemeralPublicKey: envelope.ephemeralPublicKey,
      });
      return; // BLOQUEADO até o usuário confirmar ou rejeitar
    }

    this.peerIdentityKeysByEndpoint.set(endpointId, peerIdentityPublicKey);

    contactsRepository.upsertContact({
      endpointId,
      username: envelope.username,
      publicKey: envelope.identityPublicKey,
      lastSeenAt: Date.now(),
      verified: false,
    });

    this.bootstrapOrLoadRatchet(endpointId, peerIdentityPublicKey, peerEphemeralPublicKey);
  }

  /** Faz o X3DH + inicializa o ratchet só na primeira vez (quando não
   *  existe sessão salva para essa conversa); reconexões seguintes
   *  carregam o estado já salvo e continuam de onde pararam. */
  private bootstrapOrLoadRatchet(
    endpointId: string,
    peerIdentityPublicKey: Uint8Array,
    peerEphemeralPublicKey: Uint8Array
  ): void {
    if (!this.identity) return;

    const conversationId = computeConversationId(this.identity.publicKey, peerIdentityPublicKey);
    this.conversationIdByEndpoint.set(endpointId, conversationId);

    let state = this.ratchetStatesByConversation.get(conversationId);
    if (!state) state = ratchetRepository.loadRatchetState(conversationId) ?? undefined;

    if (!state) {
      const ourEphemeral = this.getOrCreateEphemeralKeyPair(endpointId);
      const { sharedSecret, isInitiator } = computeX3dhSharedSecret(
        this.identity,
        ourEphemeral,
        peerIdentityPublicKey,
        peerEphemeralPublicKey
      );

      state = isInitiator
        ? initRatchetAsInitiator(sharedSecret, ourEphemeral, peerEphemeralPublicKey, this.primitives)
        : initRatchetAsResponder(sharedSecret, ourEphemeral);

      ratchetRepository.saveRatchetState(conversationId, state);
    }

    this.ratchetStatesByConversation.set(conversationId, state);
  }

  // --- Mensagens e indicador de digitando, via Double Ratchet ----------

  private async sendRatchetPayload(endpointId: string, payload: RatchetPayload): Promise<void> {
    if (this.isBlockedByIdentityChange(endpointId)) {
      throw new Error('Esse contato mudou de identidade. Confirme a nova identidade antes de continuar a conversa.');
    }

    const conversationId = this.conversationIdByEndpoint.get(endpointId);
    const state = conversationId ? this.ratchetStatesByConversation.get(conversationId) : undefined;
    if (!conversationId || !state) {
      throw new Error('A troca de chaves com esse contato ainda não terminou. Tente novamente em instantes.');
    }

    const plaintextBytes = utf8Encode(JSON.stringify(payload));
    const { header, ciphertext } = ratchetEncrypt(state, plaintextBytes, this.primitives);
    ratchetRepository.saveRatchetState(conversationId, state);

    await this.sendEnvelope(endpointId, {
      type: 'ratchet',
      conversationId,
      dhPublicKey: toBase64(header.dhPublicKey),
      previousChainLength: header.previousChainLength,
      messageNumber: header.messageNumber,
      ciphertext: toBase64(ciphertext),
    });

    if (payload.kind === 'message') {
      const message: Message = {
        id: randomId(),
        conversationId,
        direction: 'outgoing',
        content: payload.text,
        sentAt: Date.now(),
      };
      useChatStore.getState().addMessage(message);
      messagesRepository.saveMessage(message);
    }
  }

  private handleRatchetEnvelope(envelope: Extract<WireEnvelope, { type: 'ratchet' }>): void {
    const state = this.ratchetStatesByConversation.get(envelope.conversationId);
    if (!state) return;

    const ratchetMsg: RatchetMessage = {
      header: {
        dhPublicKey: fromBase64(envelope.dhPublicKey),
        previousChainLength: envelope.previousChainLength,
        messageNumber: envelope.messageNumber,
      },
      ciphertext: fromBase64(envelope.ciphertext),
    };

    let plaintextBytes: Uint8Array;
    try {
      plaintextBytes = ratchetDecrypt(state, ratchetMsg, this.primitives);
    } catch (error) {
      console.warn('Mensagem rejeitada pelo Double Ratchet:', error);
      return;
    }

    ratchetRepository.saveRatchetState(envelope.conversationId, state);

    const payload: RatchetPayload = JSON.parse(sodium.to_string(plaintextBytes));

    if (payload.kind === 'typing') {
      this.handleIncomingTyping(envelope.conversationId, payload.isTyping);
      return;
    }

    this.clearTypingIndicator(envelope.conversationId);

    const incomingMessage: Message = {
      id: randomId(),
      conversationId: envelope.conversationId,
      direction: 'incoming',
      content: payload.text,
      sentAt: Date.now(),
    };
    useChatStore.getState().addMessage(incomingMessage);
    messagesRepository.saveMessage(incomingMessage);
  }

  // --- Indicador de "digitando" ----------------------------------------

  private clearTypingIndicator(conversationId: string): void {
    const existingTimeout = this.typingTimeouts.get(conversationId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      this.typingTimeouts.delete(conversationId);
    }
    useTypingStore.getState().setTyping(conversationId, false);
  }

  private handleIncomingTyping(conversationId: string, isTyping: boolean): void {
    const existingTimeout = this.typingTimeouts.get(conversationId);
    if (existingTimeout) clearTimeout(existingTimeout);

    useTypingStore.getState().setTyping(conversationId, isTyping);

    if (isTyping) {
      const timeout = setTimeout(() => {
        useTypingStore.getState().setTyping(conversationId, false);
        this.typingTimeouts.delete(conversationId);
      }, TYPING_INDICATOR_TIMEOUT_MS);
      this.typingTimeouts.set(conversationId, timeout);
    } else {
      this.typingTimeouts.delete(conversationId);
    }
  }

  // --- Transporte bruto --------------------------------------------------

  private async sendEnvelope(endpointId: string, envelope: WireEnvelope): Promise<void> {
    const bytes = utf8Encode(JSON.stringify(envelope));
    const base64 = toBase64(bytes);
    await NearbyTransport.default.sendPayload(endpointId, base64);
  }

  private async handlePayload(endpointId: string, payloadBase64: string): Promise<void> {
    const bytes = fromBase64(payloadBase64);
    const envelope: WireEnvelope = JSON.parse(sodium.to_string(bytes));

    if (envelope.type === 'handshake') {
      await this.handleHandshake(endpointId, envelope);
      return;
    }

    if (envelope.type === 'ratchet') {
      this.handleRatchetEnvelope(envelope);
    }
  }
}

function randomId(): string {
  return sodium.to_hex(sodium.randombytes_buf(16));
}

export const NearbyTransportService = new NearbyTransportServiceImpl();
