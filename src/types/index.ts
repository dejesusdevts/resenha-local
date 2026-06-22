export type Profile = {
  id: string;
  username: string;
  avatarUri?: string;
  statusMessage?: string;
  /** Chave pública de identidade (X25519), em base64. */
  publicKey: string;
  createdAt: number;
};

export type Contact = {
  endpointId: string;
  username: string;
  publicKey: string;
  lastSeenAt: number;
  /** true depois que o usuário confirmou manualmente a impressão digital. */
  verified: boolean;
};

export type MessageDirection = 'incoming' | 'outgoing';

export type Message = {
  id: string;
  conversationId: string;
  direction: MessageDirection;
  /**
   * Conteúdo da mensagem, já decifrado. Protegido pela cifragem do banco
   * em repouso (SQLCipher), não pelas chaves efêmeras do Double Ratchet —
   * essas são descartadas imediatamente após o uso (forward secrecy), e
   * portanto NÃO PODEM ser usadas para reabrir o histórico depois que o
   * app fecha. Esse é o mesmo modelo usado por apps como o Signal: o
   * ratchet protege a mensagem em trânsito; a cifragem do banco protege
   * o histórico em repouso — são duas camadas independentes. Ver
   * docs/crypto-architecture.md, seção "por que o histórico não usa as
   * chaves do ratchet".
   */
  content: string;
  sentAt: number;
  /** Se definido, a mensagem deve ser apagada automaticamente após esse instante (epoch ms). */
  expiresAt?: number;
};

export type Group = {
  id: string;
  name: string;
  memberEndpointIds: string[];
  createdAt: number;
};

export type NearbyDeviceStatus = 'discovered' | 'connecting' | 'connected' | 'disconnected';

export type NearbyDevice = {
  endpointId: string;
  username: string;
  status: NearbyDeviceStatus;
};
