import sodium from 'react-native-libsodium';
import * as SecureStore from 'expo-secure-store';
import { toBase64, fromBase64 } from './encoding';

/**
 * Identidade criptográfica do dispositivo.
 *
 * BIOMETRIA — UMA VEZ POR SESSÃO:
 *   A biometria NÃO é controlada por `requireAuthentication` do SecureStore
 *   (que dispararia o prompt em toda operação criptográfica — write E read —
 *   resultando em prompts duplos). Em vez disso, o controle de acesso
 *   biométrico fica em src/security/biometricAuth.ts, chamado uma única vez
 *   por sessão (BiometricConsentScreen para novos usuários, App.tsx para
 *   quem volta). Após autenticação, as chaves são carregadas e mantidas em
 *   cache de memória para o resto da sessão.
 *
 *   Proteção em repouso: WHEN_UNLOCKED_THIS_DEVICE_ONLY — a chave do
 *   Keystore que protege o SecureStore só é usável com o aparelho
 *   desbloqueado, e nunca é exportável nem incluída em backups.
 */

export type IdentityKeyPair = {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
};

const PUBLIC_KEY_STORAGE_KEY = 'resenha_local_identity_public_key';
const SECRET_KEY_STORAGE_KEY = 'resenha_local_identity_secret_key';
const DB_KEY_STORAGE_KEY     = 'resenha_local_db_encryption_key';
const BIOMETRIC_READY_KEY    = 'resenha_local_biometric_ready';

const secureOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

// Cache de sessão — populado após autenticação biométrica bem-sucedida.
// Limpo ao fechar o app (memória descartada pelo SO) ou em wipeAllSecrets().
let identityKeyCache: IdentityKeyPair | null = null;

/**
 * Carrega (ou cria) o par de chaves de identidade.
 * NÃO dispara biometria — a autenticação deve ter sido feita antes via
 * biometricAuth.ts. Após a primeira chamada bem-sucedida, retorna o
 * cache sem tocar o SecureStore.
 */
export async function loadOrCreateIdentityKeyPair(): Promise<IdentityKeyPair> {
  if (identityKeyCache) return identityKeyCache;

  await sodium.ready;

  const storedPublic = await SecureStore.getItemAsync(PUBLIC_KEY_STORAGE_KEY, secureOptions);

  if (storedPublic) {
    const storedSecret = await SecureStore.getItemAsync(SECRET_KEY_STORAGE_KEY, secureOptions);
    if (storedSecret) {
      identityKeyCache = {
        publicKey: fromBase64(storedPublic),
        privateKey: fromBase64(storedSecret),
      };
      return identityKeyCache;
    }
    // Estado inconsistente — regera o par.
    await SecureStore.deleteItemAsync(PUBLIC_KEY_STORAGE_KEY);
  }

  // Primeiro uso: gera e persiste. Não precisa de read-back porque
  // já temos os valores em memória do próprio crypto_box_keypair().
  const keyPair = sodium.crypto_box_keypair();
  await SecureStore.setItemAsync(PUBLIC_KEY_STORAGE_KEY, toBase64(keyPair.publicKey), secureOptions);
  await SecureStore.setItemAsync(SECRET_KEY_STORAGE_KEY, toBase64(keyPair.privateKey), secureOptions);

  identityKeyCache = { publicKey: keyPair.publicKey, privateKey: keyPair.privateKey };
  return identityKeyCache;
}

export function clearIdentityKeyCache(): void {
  identityKeyCache = null;
}

export async function loadPublicKeyOnly(): Promise<Uint8Array | null> {
  if (identityKeyCache) return identityKeyCache.publicKey;
  await sodium.ready;
  const stored = await SecureStore.getItemAsync(PUBLIC_KEY_STORAGE_KEY, secureOptions);
  return stored ? fromBase64(stored) : null;
}

export function publicKeyToBase64(publicKey: Uint8Array): string {
  return toBase64(publicKey);
}

export async function isBiometricReady(): Promise<boolean> {
  const val = await SecureStore.getItemAsync(BIOMETRIC_READY_KEY, secureOptions);
  return val === 'true';
}

export async function markBiometricReady(): Promise<void> {
  await SecureStore.setItemAsync(BIOMETRIC_READY_KEY, 'true', secureOptions);
}

export async function loadOrCreateDatabaseKey(): Promise<string> {
  await sodium.ready;
  const existing = await SecureStore.getItemAsync(DB_KEY_STORAGE_KEY, secureOptions);
  if (existing) return existing;
  const key = sodium.to_hex(sodium.randombytes_buf(32));
  await SecureStore.setItemAsync(DB_KEY_STORAGE_KEY, key, secureOptions);
  return key;
}

export async function wipeAllSecrets(): Promise<void> {
  identityKeyCache = null;
  await SecureStore.deleteItemAsync(PUBLIC_KEY_STORAGE_KEY);
  await SecureStore.deleteItemAsync(SECRET_KEY_STORAGE_KEY);
  await SecureStore.deleteItemAsync(DB_KEY_STORAGE_KEY);
  await SecureStore.deleteItemAsync(BIOMETRIC_READY_KEY);
}
