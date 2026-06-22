import { getDatabase } from '../database';

/**
 * Repositório TOFU (Trust On First Use). A regra de negócio mora em
 * src/crypto/trust.ts — este arquivo só lê e escreve no banco.
 */

export type StoredIdentity = {
  publicKey: string; // base64
  fingerprint: string; // hex
  username: string;
  trustedSince: number;
  lastSeenAt: number;
};

export type IdentityChangeLogEntry = {
  id: string;
  publicKeyOld: string;
  publicKeyNew: string;
  fingerprintOld: string;
  fingerprintNew: string;
  username: string;
  detectedAt: number;
  resolution: 'pending' | 'accepted' | 'rejected';
};

export function getIdentityByUsername(username: string): StoredIdentity | null {
  const db = getDatabase();
  // No TOFU local (sem servidor de diretório), o nome de usuário é o
  // único jeito de "achar" um contato já conhecido antes da primeira
  // chave pública chegar de novo numa nova sessão Nearby. Isso é
  // suficiente para o propósito de TOFU: detectar se ALGUÉM se
  // apresentando com esse nome está usando uma chave diferente da que
  // vimos da última vez.
  const result = db.execute('SELECT * FROM identities WHERE username = ? LIMIT 1;', [username]);
  const row = result.rows?._array?.[0];
  return row ? rowToIdentity(row) : null;
}

export function getIdentityByPublicKey(publicKey: string): StoredIdentity | null {
  const db = getDatabase();
  const result = db.execute('SELECT * FROM identities WHERE public_key = ? LIMIT 1;', [publicKey]);
  const row = result.rows?._array?.[0];
  return row ? rowToIdentity(row) : null;
}

export function trustIdentity(identity: StoredIdentity): void {
  const db = getDatabase();
  db.execute(
    `INSERT INTO identities (public_key, fingerprint, username, trusted_since, last_seen_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(public_key) DO UPDATE SET
       username = excluded.username,
       last_seen_at = excluded.last_seen_at;`,
    [identity.publicKey, identity.fingerprint, identity.username, identity.trustedSince, identity.lastSeenAt]
  );
}

/**
 * Substitui a identidade confiada para esse nome de usuário (usado só
 * depois que o usuário CONFIRMA explicitamente que confia na nova
 * chave). A identidade antiga não é apagada daqui — fica preservada no
 * log de mudanças (ver logIdentityChange).
 */
export function replaceTrustedIdentity(oldPublicKey: string, newIdentity: StoredIdentity): void {
  const db = getDatabase();
  db.execute('DELETE FROM identities WHERE public_key = ?;', [oldPublicKey]);
  trustIdentity(newIdentity);
}

export function logIdentityChange(entry: IdentityChangeLogEntry): void {
  const db = getDatabase();
  db.execute(
    `INSERT INTO identity_change_log
       (id, public_key_old, public_key_new, fingerprint_old, fingerprint_new, username, detected_at, resolution)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      entry.id,
      entry.publicKeyOld,
      entry.publicKeyNew,
      entry.fingerprintOld,
      entry.fingerprintNew,
      entry.username,
      entry.detectedAt,
      entry.resolution,
    ]
  );
}

export function resolveIdentityChange(id: string, resolution: 'accepted' | 'rejected'): void {
  const db = getDatabase();
  db.execute('UPDATE identity_change_log SET resolution = ? WHERE id = ?;', [resolution, id]);
}

export function listIdentityChangeLog(): IdentityChangeLogEntry[] {
  const db = getDatabase();
  const result = db.execute('SELECT * FROM identity_change_log ORDER BY detected_at DESC;');
  return (result.rows?._array ?? []).map(rowToLogEntry);
}

function rowToIdentity(row: any): StoredIdentity {
  return {
    publicKey: row.public_key,
    fingerprint: row.fingerprint,
    username: row.username,
    trustedSince: row.trusted_since,
    lastSeenAt: row.last_seen_at,
  };
}

function rowToLogEntry(row: any): IdentityChangeLogEntry {
  return {
    id: row.id,
    publicKeyOld: row.public_key_old,
    publicKeyNew: row.public_key_new,
    fingerprintOld: row.fingerprint_old,
    fingerprintNew: row.fingerprint_new,
    username: row.username,
    detectedAt: row.detected_at,
    resolution: row.resolution,
  };
}
