import { open, type DB } from '@op-engineering/op-sqlite';

/**
 * Banco de dados local, cifrado em repouso. Usamos @op-engineering/op-sqlite
 * compilado com suporte a SQLCipher: o arquivo .db inteiro fica ilegível
 * sem a chave de criptografia (ver loadOrCreateDatabaseKey em crypto/keys.ts
 * — é uma chave separada das chaves de identidade/conversa, de propósito;
 * ver docs/crypto-architecture.md, seção "separação de chaves").
 *
 * Não existe nenhuma sincronização remota aqui — esse é o único lugar onde
 * o histórico de conversas, identidades confiadas e estado dos ratchets
 * é guardado, e ele nunca sai deste arquivo.
 *
 * MIGRAÇÕES: o esquema evolui por versões numeradas, rastreadas via
 * `PRAGMA user_version` (nativo do SQLite). Cada `runMigrationVN` só faz
 * mudanças aditivas (CREATE TABLE IF NOT EXISTS / ALTER TABLE ADD COLUMN)
 * e roda exatamente uma vez por instalação — um usuário atualizando de
 * uma versão antiga do app passa por todas as migrações pendentes em
 * sequência, sem perder nenhum dado já salvo; uma instalação nova passa
 * por todas elas também, terminando no mesmo esquema final. Ver
 * docs/migration-plan.md para o plano detalhado desta migração específica
 * (v1 -> v2, que introduz TOFU e Double Ratchet).
 */

const SCHEMA_VERSION = 2;

let db: DB | null = null;

export function getDatabase(): DB {
  if (!db) {
    throw new Error('Banco de dados ainda não inicializado — chame initDatabase() primeiro.');
  }
  return db;
}

export async function initDatabase(encryptionKey: string): Promise<void> {
  db = open({
    name: 'resenha-local.db',
    encryptionKey,
  });

  const versionResult = db.execute('PRAGMA user_version;');
  const currentVersion = Number((versionResult.rows?._array?.[0] as any)?.user_version ?? 0);

  if (currentVersion < 1) runMigrationV1();
  if (currentVersion < 2) runMigrationV2();

  db.execute(`PRAGMA user_version = ${SCHEMA_VERSION};`);
}

/** v1 — esquema original: perfil local, contatos vistos, mensagens, grupos. */
function runMigrationV1(): void {
  const database = getDatabase();

  database.execute(`
    CREATE TABLE IF NOT EXISTS profile (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      avatar_uri TEXT,
      status_message TEXT,
      public_key TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  database.execute(`
    CREATE TABLE IF NOT EXISTS contacts (
      endpoint_id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      public_key TEXT NOT NULL,
      last_seen_at INTEGER NOT NULL,
      verified INTEGER NOT NULL DEFAULT 0
    );
  `);

  database.execute(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      direction TEXT NOT NULL,
      ciphertext TEXT NOT NULL,
      sent_at INTEGER NOT NULL,
      expires_at INTEGER
    );
  `);

  database.execute(`
    CREATE INDEX IF NOT EXISTS idx_messages_conversation
    ON messages (conversation_id, sent_at);
  `);

  database.execute(`
    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      member_endpoint_ids TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);
}

/** v2 — TOFU (identidades confiadas + log de mudanças) e Double Ratchet. */
function runMigrationV2(): void {
  const database = getDatabase();

  // Registro TOFU: chaveado pela CHAVE PÚBLICA de identidade do contato
  // (estável entre sessões), não pelo endpoint_id da Nearby Connections
  // (que muda a cada reconexão — ver nota em NearbyTransportService.ts).
  database.execute(`
    CREATE TABLE IF NOT EXISTS identities (
      public_key TEXT PRIMARY KEY,
      fingerprint TEXT NOT NULL,
      username TEXT NOT NULL,
      trusted_since INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL
    );
  `);

  // Auditoria: toda vez que a chave pública de um contato já conhecido
  // muda, fica um registro permanente aqui, mesmo depois de o usuário
  // decidir confiar (ou não) na nova identidade.
  database.execute(`
    CREATE TABLE IF NOT EXISTS identity_change_log (
      id TEXT PRIMARY KEY,
      public_key_old TEXT NOT NULL,
      public_key_new TEXT NOT NULL,
      fingerprint_old TEXT NOT NULL,
      fingerprint_new TEXT NOT NULL,
      username TEXT NOT NULL,
      detected_at INTEGER NOT NULL,
      resolution TEXT NOT NULL DEFAULT 'pending'
    );
  `);

  // Estado persistente do Double Ratchet por conversa — precisa
  // sobreviver ao app sendo fechado, senão toda conversa "esqueceria"
  // onde parou a cada reabertura do app.
  database.execute(`
    CREATE TABLE IF NOT EXISTS ratchet_sessions (
      conversation_id TEXT PRIMARY KEY,
      dh_self_public_key TEXT NOT NULL,
      dh_self_private_key TEXT NOT NULL,
      dh_remote_public_key TEXT,
      root_key TEXT NOT NULL,
      send_chain_key TEXT,
      recv_chain_key TEXT,
      send_message_number INTEGER NOT NULL DEFAULT 0,
      recv_message_number INTEGER NOT NULL DEFAULT 0,
      previous_chain_length INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );
  `);

  database.execute(`
    CREATE TABLE IF NOT EXISTS skipped_message_keys (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      dh_public_key TEXT NOT NULL,
      message_number INTEGER NOT NULL,
      message_key TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  database.execute(`
    CREATE INDEX IF NOT EXISTS idx_skipped_keys_lookup
    ON skipped_message_keys (conversation_id, dh_public_key, message_number);
  `);

  // A partir daqui, "messages.content" guarda o texto já decifrado
  // (protegido só pela cifragem do banco em repouso), não mais um
  // ciphertext re-decifrável — ver comentário em src/types/index.ts.
  // RENAME COLUMN preserva todo o histórico já salvo, sem perda de dados.
  const columns = database.execute('PRAGMA table_info(messages);').rows?._array ?? [];
  const hasOldColumn = columns.some((col: any) => col.name === 'ciphertext');
  if (hasOldColumn) {
    database.execute('ALTER TABLE messages RENAME COLUMN ciphertext TO content;');
  }
}

/** Apaga todas as tabelas — usado em "Apagar todos os dados locais". */
export function wipeDatabase(): void {
  const database = getDatabase();
  database.execute('DELETE FROM skipped_message_keys;');
  database.execute('DELETE FROM ratchet_sessions;');
  database.execute('DELETE FROM identity_change_log;');
  database.execute('DELETE FROM identities;');
  database.execute('DELETE FROM messages;');
  database.execute('DELETE FROM contacts;');
  database.execute('DELETE FROM groups;');
  database.execute('DELETE FROM profile;');
}

/** Remove mensagens efêmeras já expiradas. Chamar periodicamente (ex.: ao abrir o app). */
export function purgeExpiredMessages(): void {
  const database = getDatabase();
  database.execute('DELETE FROM messages WHERE expires_at IS NOT NULL AND expires_at < ?;', [
    Date.now(),
  ]);
}
