import { toBase64 } from './encoding';
import { computeIdentityFingerprint } from './fingerprint';
import * as identitiesRepository from '../storage/repositories/identitiesRepository';

/**
 * TOFU (Trust On First Use) — Objetivo 1.
 *
 *  - Nunca visto antes (nem por nome de usuário) -> confia automaticamente,
 *    sem QR code, sem comparação manual, sem nenhuma ação do usuário —
 *    por design, para preservar a simplicidade do app.
 *  - Já confiávamos nessa MESMA chave -> segue normal, só atualiza
 *    "visto pela última vez".
 *  - Já confiávamos numa chave DIFERENTE para esse nome de usuário -> a
 *    identidade mudou. NUNCA substitui automaticamente — fica registrado
 *    no log de auditoria e a camada de transporte deve bloquear o envio
 *    de mensagens até o usuário confirmar explicitamente (ver
 *    NearbyTransportService.ts e docs/threat-model.md, cenário "troca
 *    silenciosa de identidade").
 */

export type TrustDecision =
  | { outcome: 'trusted_new'; fingerprint: string }
  | { outcome: 'trusted_known'; fingerprint: string }
  | { outcome: 'identity_changed'; oldFingerprint: string; newFingerprint: string; logId: string };

export function evaluateTrust(username: string, publicKey: Uint8Array): TrustDecision {
  const publicKeyBase64 = toBase64(publicKey);
  const fingerprint = computeIdentityFingerprint(publicKey);
  const known = identitiesRepository.getIdentityByUsername(username);

  if (!known) {
    identitiesRepository.trustIdentity({
      publicKey: publicKeyBase64,
      fingerprint,
      username,
      trustedSince: Date.now(),
      lastSeenAt: Date.now(),
    });
    return { outcome: 'trusted_new', fingerprint };
  }

  if (known.publicKey === publicKeyBase64) {
    identitiesRepository.trustIdentity({ ...known, lastSeenAt: Date.now() });
    return { outcome: 'trusted_known', fingerprint };
  }

  const logId = `idchange-${Date.now()}-${username}`;
  identitiesRepository.logIdentityChange({
    id: logId,
    publicKeyOld: known.publicKey,
    publicKeyNew: publicKeyBase64,
    fingerprintOld: known.fingerprint,
    fingerprintNew: fingerprint,
    username,
    detectedAt: Date.now(),
    resolution: 'pending',
  });

  return { outcome: 'identity_changed', oldFingerprint: known.fingerprint, newFingerprint: fingerprint, logId };
}

/** Chamado só depois que o usuário confirma explicitamente a nova identidade. */
export function acceptIdentityChange(logId: string, username: string, newPublicKey: Uint8Array): void {
  const known = identitiesRepository.getIdentityByUsername(username);
  const newPublicKeyBase64 = toBase64(newPublicKey);
  const newFingerprint = computeIdentityFingerprint(newPublicKey);

  if (known) {
    identitiesRepository.replaceTrustedIdentity(known.publicKey, {
      publicKey: newPublicKeyBase64,
      fingerprint: newFingerprint,
      username,
      trustedSince: Date.now(),
      lastSeenAt: Date.now(),
    });
  }

  identitiesRepository.resolveIdentityChange(logId, 'accepted');
}

/** Identidade antiga continua sendo a única confiada; mensagens da nova
 *  chave continuam bloqueadas até uma nova decisão. */
export function rejectIdentityChange(logId: string): void {
  identitiesRepository.resolveIdentityChange(logId, 'rejected');
}
