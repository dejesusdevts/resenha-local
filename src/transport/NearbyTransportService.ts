import sodium from 'react-native-libsodium';
import * as NearbyTransport from 'nearby-transport';
import { useDevicesStore }   from '../state/devicesStore';
import { useChatStore }      from '../state/chatStore';
import { useTypingStore }    from '../state/typingStore';
import { useProfileStore }   from '../state/profileStore';
import { useSecurityStore }  from '../state/securityStore';
import { loadOrCreateIdentityKeyPair, publicKeyToBase64, IdentityKeyPair } from '../crypto/keys';
import { encryptMessage, decryptMessage }   from '../crypto/cipher';
import { computeConversationId } from '../crypto/fingerprint';
import { evaluateTrust, acceptIdentityChange as acceptInStorage, rejectIdentityChange as rejectInStorage } from '../crypto/trust';
import { toBase64, fromBase64, utf8Encode } from '../crypto/encoding';
import * as contactsRepository  from '../storage/repositories/contactsRepository';
import * as messagesRepository  from '../storage/repositories/messagesRepository';
import { Message } from '../types';

/**
 * Camada de transporte — versão estável baseada em crypto_box_easy.
 *
 * Protocolo de fio:
 *   { type: 'handshake', publicKey: string, username: string }
 *   { type: 'message',   conversationId: string, ciphertext: string }
 *   { type: 'typing',    conversationId: string, ciphertext: string }
 *        └─ ciphertext de { isTyping: boolean }
 *
 * A criptografia usa crypto_box_easy (X25519 + XSalsa20-Poly1305), que
 * funciona de forma confiável neste binding react-native-libsodium/Hermes.
 * Funções que retornam Uint8Arrays JSI-nativos (randombytes_buf,
 * crypto_box_easy, etc.) são copiadas para o heap JS via jsOwned() em
 * cipher.ts antes de qualquer processamento adicional.
 *
 * O HKDF (_unstable_crypto_kdf_hkdf_sha256_*) e o Double Ratchet foram
 * removidos deste transport porque ambos dependem de primitivas que
 * rejeitam Uint8Arrays JS com "Value is undefined, expected an Object"
 * no JSI deste binding — incompatibilidade fundamental, não contornável
 * por conversão de tipos do lado JS.
 */

type WireEnvelope =
  | { type: 'handshake'; publicKey: string; username: string }
  | { type: 'message';   conversationId: string; ciphertext: string }
  | { type: 'typing';    conversationId: string; ciphertext: string };

const TYPING_TIMEOUT_MS = 6000;

class NearbyTransportServiceImpl {
  private identity: IdentityKeyPair | null = null;
  private peerPublicKeysByEndpoint = new Map<string, Uint8Array>();
  private conversationIdByEndpoint = new Map<string, string>();
  private typingTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
  private subscriptions: { remove: () => void }[] = [];
  private started = false;

  async start(): Promise<void> {
    if (this.started) return;
    const profile = useProfileStore.getState().profile;
    if (!profile) throw new Error('Perfil ainda não criado.');

    await sodium.ready;
    this.identity = await loadOrCreateIdentityKeyPair();

    this.subscriptions = [
      NearbyTransport.addEndpointFoundListener(({ endpointId, endpointName }) => {
        useDevicesStore.getState().upsertDevice({
          endpointId, username: endpointName, status: 'discovered',
        });
        // Conexão manual — o usuário toca no dispositivo na RadarScreen.
      }),

      NearbyTransport.addEndpointLostListener(({ endpointId }) => {
        useDevicesStore.getState().removeDevice(endpointId);
      }),

      NearbyTransport.addConnectionInitiatedListener(({ endpointId }) => {
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

        await this.sendHandshake(endpointId).catch((e) => {
          console.warn('Falha ao enviar handshake:', e);
        });
      }),

      NearbyTransport.addDisconnectedListener(({ endpointId }) => {
        const convId = this.conversationIdByEndpoint.get(endpointId);
        if (convId) this.clearTyping(convId);

        this.peerPublicKeysByEndpoint.delete(endpointId);
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
        this.handlePayload(endpointId, payloadBase64).catch((e) => {
          console.warn('Falha ao processar payload recebido:', e);
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
    this.subscriptions.forEach((s) => s.remove());
    this.subscriptions = [];
    this.peerPublicKeysByEndpoint.clear();
    this.conversationIdByEndpoint.clear();
    this.typingTimeouts.forEach(clearTimeout);
    this.typingTimeouts.clear();
    useDevicesStore.getState().reset();
    useTypingStore.getState().reset();
    useSecurityStore.getState().reset();
    this.started = false;
  }

  async connectToEndpoint(endpointId: string): Promise<void> {
    if (!this.started) return;
    const profile = useProfileStore.getState().profile;
    if (!profile) return;

    const current = useDevicesStore.getState().devices[endpointId];
    if (!current || current.status === 'connected' || current.status === 'connecting') return;

    useDevicesStore.getState().upsertDevice({ ...current, status: 'connecting' });

    try {
      await NearbyTransport.default.requestConnection(endpointId, profile.username);
    } catch {
      useDevicesStore.getState().upsertDevice({ ...current, status: 'discovered' });
    }
  }

  getConversationId(endpointId: string): string | null {
    return this.conversationIdByEndpoint.get(endpointId) ?? null;
  }

  isBlockedByIdentityChange(endpointId: string): boolean {
    return useSecurityStore.getState().pendingChangesByEndpoint[endpointId] !== undefined;
  }

  async sendMessage(endpointId: string, plaintext: string): Promise<void> {
    if (this.isBlockedByIdentityChange(endpointId)) {
      throw new Error('Contato bloqueado por mudança de identidade. Confirme antes de continuar.');
    }

    const { peerPublicKey, conversationId } = this.requireSession(endpointId);
    const ciphertext = encryptMessage(plaintext, peerPublicKey, this.identity!.privateKey);

    await this.sendEnvelope(endpointId, { type: 'message', conversationId, ciphertext });

    const msg: Message = {
      id: randomId(),
      conversationId,
      direction: 'outgoing',
      content: plaintext,
      sentAt: Date.now(),
    };
    useChatStore.getState().addMessage(msg);
    messagesRepository.saveMessage(msg);
  }

  async sendTypingIndicator(endpointId: string, isTyping: boolean): Promise<void> {
    try {
      if (this.isBlockedByIdentityChange(endpointId)) return;
      const { peerPublicKey, conversationId } = this.requireSession(endpointId);
      const ciphertext = encryptMessage(
        JSON.stringify({ isTyping }),
        peerPublicKey,
        this.identity!.privateKey
      );
      await this.sendEnvelope(endpointId, { type: 'typing', conversationId, ciphertext });
    } catch {
      // Best-effort — indicador de presença, não crítico
    }
  }

  async acceptIdentityChange(endpointId: string): Promise<void> {
    const pending = useSecurityStore.getState().pendingChangesByEndpoint[endpointId];
    if (!pending || !this.identity) return;

    const newPK = fromBase64(pending.pendingIdentityPublicKey);
    acceptInStorage(pending.logId, pending.username, newPK);

    const conversationId = computeConversationId(this.identity.publicKey, newPK);
    this.peerPublicKeysByEndpoint.set(endpointId, newPK);
    this.conversationIdByEndpoint.set(endpointId, conversationId);

    contactsRepository.upsertContact({
      endpointId,
      username: pending.username,
      publicKey: pending.pendingIdentityPublicKey,
      lastSeenAt: Date.now(),
      verified: false,
    });

    useSecurityStore.getState().clearPendingChange(endpointId);
  }

  rejectIdentityChange(endpointId: string): void {
    const pending = useSecurityStore.getState().pendingChangesByEndpoint[endpointId];
    if (pending) rejectInStorage(pending.logId);
    useSecurityStore.getState().clearPendingChange(endpointId);
    NearbyTransport.default.disconnect(endpointId).catch(() => {});
  }

  // --- Handshake -------------------------------------------------------

  private async sendHandshake(endpointId: string): Promise<void> {
    const profile = useProfileStore.getState().profile;
    if (!profile || !this.identity) return;
    await this.sendEnvelope(endpointId, {
      type: 'handshake',
      publicKey: publicKeyToBase64(this.identity.publicKey),
      username: profile.username,
    });
  }

  private async handleHandshake(
    endpointId: string,
    envelope: Extract<WireEnvelope, { type: 'handshake' }>
  ): Promise<void> {
    if (!this.identity) return;

    const peerPK = fromBase64(envelope.publicKey);
    const trust  = evaluateTrust(envelope.username, peerPK);

    if (trust.outcome === 'identity_changed') {
      useSecurityStore.getState().setPendingChange(endpointId, {
        endpointId,
        username:                   envelope.username,
        oldFingerprint:             trust.oldFingerprint,
        newFingerprint:             trust.newFingerprint,
        logId:                      trust.logId,
        pendingIdentityPublicKey:   envelope.publicKey,
        pendingEphemeralPublicKey:  '',   // não usado no protocolo simples
      });
      return; // bloqueado até confirmação
    }

    this.peerPublicKeysByEndpoint.set(endpointId, peerPK);
    const conversationId = computeConversationId(this.identity.publicKey, peerPK);
    this.conversationIdByEndpoint.set(endpointId, conversationId);

    contactsRepository.upsertContact({
      endpointId,
      username:    envelope.username,
      publicKey:   envelope.publicKey,
      lastSeenAt:  Date.now(),
      verified:    false,
    });
  }

  // --- Mensagens -------------------------------------------------------

  private handleMessage(
    endpointId: string,
    envelope: Extract<WireEnvelope, { type: 'message' }>
  ): void {
    if (!this.identity) return;
    const peerPK = this.peerPublicKeysByEndpoint.get(endpointId);
    if (!peerPK) return;

    const conversationId = this.conversationIdByEndpoint.get(endpointId);
    if (!conversationId) return;

    const plaintext = decryptMessage(envelope.ciphertext, peerPK, this.identity.privateKey);

    this.clearTyping(conversationId);

    const msg: Message = {
      id:             randomId(),
      conversationId,
      direction:      'incoming',
      content:        plaintext,
      sentAt:         Date.now(),
    };
    useChatStore.getState().addMessage(msg);
    messagesRepository.saveMessage(msg);
  }

  private handleTyping(
    endpointId: string,
    envelope: Extract<WireEnvelope, { type: 'typing' }>
  ): void {
    if (!this.identity) return;
    const peerPK = this.peerPublicKeysByEndpoint.get(endpointId);
    if (!peerPK) return;

    const conversationId = this.conversationIdByEndpoint.get(endpointId);
    if (!conversationId) return;

    const { isTyping } = JSON.parse(
      decryptMessage(envelope.ciphertext, peerPK, this.identity.privateKey)
    ) as { isTyping: boolean };

    const existing = this.typingTimeouts.get(conversationId);
    if (existing) clearTimeout(existing);

    useTypingStore.getState().setTyping(conversationId, isTyping);

    if (isTyping) {
      const t = setTimeout(() => {
        useTypingStore.getState().setTyping(conversationId, false);
        this.typingTimeouts.delete(conversationId);
      }, TYPING_TIMEOUT_MS);
      this.typingTimeouts.set(conversationId, t);
    } else {
      this.typingTimeouts.delete(conversationId);
    }
  }

  // --- Transporte bruto ------------------------------------------------

  private async sendEnvelope(endpointId: string, envelope: WireEnvelope): Promise<void> {
    const bytes  = utf8Encode(JSON.stringify(envelope));
    const base64 = toBase64(bytes);
    await NearbyTransport.default.sendPayload(endpointId, base64);
  }

  private async handlePayload(endpointId: string, payloadBase64: string): Promise<void> {
    const bytes    = fromBase64(payloadBase64);
    const envelope = JSON.parse(sodium.to_string(bytes)) as WireEnvelope;

    if (envelope.type === 'handshake') { await this.handleHandshake(endpointId, envelope); return; }
    if (envelope.type === 'message')   { this.handleMessage(endpointId, envelope);          return; }
    if (envelope.type === 'typing')    { this.handleTyping(endpointId, envelope);            return; }
  }

  // --- Utilitários -----------------------------------------------------

  private requireSession(endpointId: string) {
    const peerPublicKey  = this.peerPublicKeysByEndpoint.get(endpointId);
    const conversationId = this.conversationIdByEndpoint.get(endpointId);
    if (!peerPublicKey || !conversationId || !this.identity) {
      throw new Error('Handshake ainda não concluído. Tente novamente em instantes.');
    }
    return { peerPublicKey, conversationId };
  }

  private clearTyping(conversationId: string): void {
    const t = this.typingTimeouts.get(conversationId);
    if (t) { clearTimeout(t); this.typingTimeouts.delete(conversationId); }
    useTypingStore.getState().setTyping(conversationId, false);
  }
}

function randomId(): string {
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = sodium.randombytes_buf(1)[0];
  return toBase64(bytes).replace(/[+/=]/g, (c) => ({ '+': 'a', '/': 'b', '=': '' }[c] ?? c));
}

export const NearbyTransportService = new NearbyTransportServiceImpl();
