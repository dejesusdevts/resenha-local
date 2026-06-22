import sodium from 'react-native-libsodium';
import * as SecureStore from 'expo-secure-store';
import { toBase64, fromBase64 } from './encoding';

/**
 * Identidade criptográfica do dispositivo, protegida com autenticação
 * biométrica quando o aparelho suportar.
 *
 * CICLO DE VIDA DA CHAVE PRIVADA EM MEMÓRIA:
 *   - Retornada apenas dentro do escopo de cada função — quem recebe o
 *     par de chaves é responsável por descartar a referência assim que
 *     terminar o uso (ex.: ao sair do escopo de handleHandshake). Nunca
 *     armazene `IdentityKeyPair` em um store global de longa duração.
 *   - O GC do JavaScript não oferece limpeza determinística de
 *     memória — não dá pra "zerar" um Uint8Array em JS e ter garantia
 *     que o conteúdo sumiu do heap antes do próximo GC. Isso é uma
 *     limitação da plataforma, documentada em docs/threat-model.md
 *     (cenário "malware com privilégios elevados").
 *
 * BIOMETRIA:
 *   - WHEN_UNLOCKED_THIS_DEVICE_ONLY = chave não migrável, não incluída
 *     em backups do Android, exige aparelho desbloqueado para leitura.
 *     Em aparelhos com Android Keystore seguro (hardware-backed), a
 *     chave de proteção do SecureStore nunca sai do TEE (Trusted
 *     Execution Environment), nem mesmo para o processo do app.
 *   - A flag `requireAuthentication: true` ativa a autenticação
 *     biométrica (digital/face) antes de liberar o valor armazenado,
 *     quando suportada pelo aparelho. Em aparelhos sem biometria, o
 *     SecureStore usa PIN/padrão como fallback automaticamente.
 *   - A chave pública é armazenada SEM autenticação biométrica — é
 *     pública por definição e precisa estar disponível para exibição
 *     de fingerprint mesmo com o app em segundo plano.
 *   - A chave PRIVADA usa autenticação biométrica — só é acessível com
 *     o usuário presente, impedindo que um processo em segundo plano
 *     (malware, outro app) a leia silenciosamente.
 */

export type IdentityKeyPair = {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
};

const PUBLIC_KEY_STORAGE_KEY = 'resenha_local_identity_public_key';
const SECRET_KEY_STORAGE_KEY = 'resenha_local_identity_secret_key';
const DB_KEY_STORAGE_KEY = 'resenha_local_db_encryption_key';

const baseOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

/** Usado apenas para a chave privada — pede biometria/PIN ao acessar. */
const privateKeyOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  requireAuthentication: true,
};

export async function loadOrCreateIdentityKeyPair(): Promise<IdentityKeyPair> {
  await sodium.ready;

  const storedPublic = await SecureStore.getItemAsync(PUBLIC_KEY_STORAGE_KEY, baseOptions);

  if (storedPublic) {
    // Chave privada: pode disparar prompt biométrico aqui, por design.
    const storedSecret = await SecureStore.getItemAsync(SECRET_KEY_STORAGE_KEY, privateKeyOptions);
    if (storedSecret) {
      return {
        publicKey: fromBase64(storedPublic),
        privateKey: fromBase64(storedSecret),
      };
    }
    // Chave pública sem privada = estado inconsistente (ex.: restauração
    // parcial de backup). Regera o par inteiro.
    await SecureStore.deleteItemAsync(PUBLIC_KEY_STORAGE_KEY);
  }

  // Primeira execução (ou recuperação de inconsistência): gera novo par.
  const keyPair = sodium.crypto_box_keypair();

  await SecureStore.setItemAsync(PUBLIC_KEY_STORAGE_KEY, toBase64(keyPair.publicKey), baseOptions);
  await SecureStore.setItemAsync(SECRET_KEY_STORAGE_KEY, toBase64(keyPair.privateKey), privateKeyOptions);

  return { publicKey: keyPair.publicKey, privateKey: keyPair.privateKey };
}

/**
 * Retorna só a chave pública, sem pedir biometria — seguro para usar em
 * segundo plano ou na tela de fingerprint onde o usuário não espera prompt.
 */
export async function loadPublicKeyOnly(): Promise<Uint8Array | null> {
  await sodium.ready;
  const stored = await SecureStore.getItemAsync(PUBLIC_KEY_STORAGE_KEY, baseOptions);
  return stored ? fromBase64(stored) : null;
}

export function publicKeyToBase64(publicKey: Uint8Array): string {
  return toBase64(publicKey);
}

/**
 * Chave simétrica para cifrar o banco SQLite local (SQLCipher).
 * SEPARADA intencionalmente das chaves de identidade/conversa:
 *   - Comprometer a chave do banco não expõe chaves de identidade
 *     (que estão no Android Keystore, não no banco), e vice-versa.
 *   - Permite rotação futura da chave do banco (PRAGMA rekey) sem
 *     afetar nenhuma conversa ou identidade já salva.
 * Não usa biometria aqui: a chave do banco precisa ser acessível na
 * inicialização do app (App.tsx, antes de qualquer tela aparecer), e
 * um prompt biométrico nesse momento seria ruim para a UX. A proteção
 * em repouso do banco vem do SQLCipher + do próprio Android Keystore
 * (WHEN_UNLOCKED_THIS_DEVICE_ONLY).
 */
export async function loadOrCreateDatabaseKey(): Promise<string> {
  await sodium.ready;

  const existing = await SecureStore.getItemAsync(DB_KEY_STORAGE_KEY, baseOptions);
  if (existing) return existing;

  const keyBytes = sodium.randombytes_buf(32);
  const key = sodium.to_hex(keyBytes);
  await SecureStore.setItemAsync(DB_KEY_STORAGE_KEY, key, baseOptions);
  return key;
}

/** Apaga toda a identidade local — usado em "Apagar todos os dados". */
export async function wipeAllSecrets(): Promise<void> {
  await SecureStore.deleteItemAsync(PUBLIC_KEY_STORAGE_KEY);
  await SecureStore.deleteItemAsync(SECRET_KEY_STORAGE_KEY);
  await SecureStore.deleteItemAsync(DB_KEY_STORAGE_KEY);
}
