import { getDatabase } from '../database';
import { RatchetState } from '../../crypto/doubleRatchet';
import { toBase64, fromBase64 } from '../../crypto/encoding';

/**
 * Persiste o estado do Double Ratchet de cada conversa — sem isso, toda
 * conversa "esqueceria" a posição do ratchet a cada vez que o app
 * fechasse, forçando um handshake novo (perdendo a continuidade da
 * cadeia, ainda que sem comprometer segurança). As chaves aqui dentro
 * são tão sensíveis quanto o conteúdo das mensagens — protegidas pela
 * mesma cifragem do banco (SQLCipher), nunca em texto puro fora dele.
 */

export function saveRatchetState(conversationId: string, state: RatchetState): void {
  const db = getDatabase();

  db.execute(
    `INSERT INTO ratchet_sessions (
       conversation_id, dh_self_public_key, dh_self_private_key, dh_remote_public_key,
       root_key, send_chain_key, recv_chain_key,
       send_message_number, recv_message_number, previous_chain_length, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(conversation_id) DO UPDATE SET
       dh_self_public_key = excluded.dh_self_public_key,
       dh_self_private_key = excluded.dh_self_private_key,
       dh_remote_public_key = excluded.dh_remote_public_key,
       root_key = excluded.root_key,
       send_chain_key = excluded.send_chain_key,
       recv_chain_key = excluded.recv_chain_key,
       send_message_number = excluded.send_message_number,
       recv_message_number = excluded.recv_message_number,
       previous_chain_length = excluded.previous_chain_length,
       updated_at = excluded.updated_at;`,
    [
      conversationId,
      toBase64(state.dhSelf.publicKey),
      toBase64(state.dhSelf.privateKey),
      state.dhRemote ? toBase64(state.dhRemote) : null,
      toBase64(state.rootKey),
      state.sendChainKey ? toBase64(state.sendChainKey) : null,
      state.recvChainKey ? toBase64(state.recvChainKey) : null,
      state.sendMessageNumber,
      state.recvMessageNumber,
      state.previousChainLength,
      Date.now(),
    ]
  );

  // Estratégia simples para as chaves puladas: substitui o snapshot
  // inteiro a cada salvamento. O volume é pequeno por construção — capado
  // em 100 entradas por conversa pelo próprio motor do ratchet
  // (MAX_SKIPPED_KEYS em doubleRatchet.ts) — então o custo de
  // "apagar tudo e reinserir" é desprezível.
  db.execute('DELETE FROM skipped_message_keys WHERE conversation_id = ?;', [conversationId]);
  for (const [key, messageKey] of state.skippedKeys.entries()) {
    const separatorIndex = key.lastIndexOf(':');
    const dhPublicKeyBase64 = key.slice(0, separatorIndex);
    const messageNumber = Number(key.slice(separatorIndex + 1));

    db.execute(
      `INSERT INTO skipped_message_keys (id, conversation_id, dh_public_key, message_number, message_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?);`,
      [`${conversationId}:${key}`, conversationId, dhPublicKeyBase64, messageNumber, toBase64(messageKey), Date.now()]
    );
  }
}

export function loadRatchetState(conversationId: string): RatchetState | null {
  const db = getDatabase();
  const result = db.execute('SELECT * FROM ratchet_sessions WHERE conversation_id = ?;', [conversationId]);
  const row = result.rows?._array?.[0];
  if (!row) return null;

  const skippedResult = db.execute('SELECT * FROM skipped_message_keys WHERE conversation_id = ?;', [
    conversationId,
  ]);

  const skippedKeys = new Map<string, Uint8Array>();
  for (const skippedRow of skippedResult.rows?._array ?? []) {
    const key = `${skippedRow.dh_public_key}:${skippedRow.message_number}`;
    skippedKeys.set(key, fromBase64(skippedRow.message_key));
  }

  return {
    dhSelf: {
      publicKey: fromBase64(row.dh_self_public_key),
      privateKey: fromBase64(row.dh_self_private_key),
    },
    dhRemote: row.dh_remote_public_key ? fromBase64(row.dh_remote_public_key) : null,
    rootKey: fromBase64(row.root_key),
    sendChainKey: row.send_chain_key ? fromBase64(row.send_chain_key) : null,
    recvChainKey: row.recv_chain_key ? fromBase64(row.recv_chain_key) : null,
    sendMessageNumber: row.send_message_number,
    recvMessageNumber: row.recv_message_number,
    previousChainLength: row.previous_chain_length,
    skippedKeys,
  };
}

export function deleteRatchetState(conversationId: string): void {
  const db = getDatabase();
  db.execute('DELETE FROM skipped_message_keys WHERE conversation_id = ?;', [conversationId]);
  db.execute('DELETE FROM ratchet_sessions WHERE conversation_id = ?;', [conversationId]);
}
