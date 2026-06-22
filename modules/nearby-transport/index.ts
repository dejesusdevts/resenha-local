import { requireNativeModule, EventEmitter, Subscription } from 'expo-modules-core';

/**
 * Interface TypeScript do módulo nativo Nearby Transport.
 *
 * Esse módulo é só um "cano" de transporte: ele descobre dispositivos
 * próximos, abre conexões e transmite bytes brutos (em base64). Ele NÃO
 * sabe nada sobre criptografia, perfis ou mensagens — isso é responsabilidade
 * da camada em src/transport/NearbyTransportService.ts, que usa este módulo
 * como base e aplica a cifragem de ponta a ponta por cima.
 */

export type NearbyEndpoint = {
  endpointId: string;
  endpointName: string;
};

export type ConnectionInitiatedEvent = {
  endpointId: string;
  endpointName: string;
  /** Código curto exibido pela própria Nearby Connections API para
   *  confirmação adicional (opcional, complementar à verificação de
   *  impressão digital feita na camada de criptografia). */
  authenticationDigits: string;
};

export type ConnectionResultEvent = {
  endpointId: string;
  status: 'connected' | 'rejected' | 'error';
};

export type EndpointLostEvent = { endpointId: string };
export type DisconnectedEvent = { endpointId: string };

export type PayloadReceivedEvent = {
  endpointId: string;
  /** Bytes recebidos, já codificados em base64. */
  payloadBase64: string;
};

interface NearbyTransportNativeModule {
  startAdvertising(userName: string): Promise<void>;
  stopAdvertising(): Promise<void>;
  startDiscovery(): Promise<void>;
  stopDiscovery(): Promise<void>;
  requestConnection(endpointId: string, userName: string): Promise<void>;
  acceptConnection(endpointId: string): Promise<void>;
  rejectConnection(endpointId: string): Promise<void>;
  sendPayload(endpointId: string, payloadBase64: string): Promise<void>;
  disconnect(endpointId: string): Promise<void>;
  stopAll(): Promise<void>;
}

const NativeModule = requireNativeModule<NearbyTransportNativeModule>('NearbyTransport');
const emitter = new EventEmitter(NativeModule as any);

export function addEndpointFoundListener(
  listener: (event: NearbyEndpoint) => void
): Subscription {
  return emitter.addListener('onEndpointFound', listener);
}

export function addEndpointLostListener(
  listener: (event: EndpointLostEvent) => void
): Subscription {
  return emitter.addListener('onEndpointLost', listener);
}

export function addConnectionInitiatedListener(
  listener: (event: ConnectionInitiatedEvent) => void
): Subscription {
  return emitter.addListener('onConnectionInitiated', listener);
}

export function addConnectionResultListener(
  listener: (event: ConnectionResultEvent) => void
): Subscription {
  return emitter.addListener('onConnectionResult', listener);
}

export function addDisconnectedListener(
  listener: (event: DisconnectedEvent) => void
): Subscription {
  return emitter.addListener('onDisconnected', listener);
}

export function addPayloadReceivedListener(
  listener: (event: PayloadReceivedEvent) => void
): Subscription {
  return emitter.addListener('onPayloadReceived', listener);
}

export default NativeModule;
