import { getDatabase } from '../database';
import { Message } from '../../types';

export function saveMessage(message: Message): void {
  const db = getDatabase();
  db.execute(
    `INSERT INTO messages (id, conversation_id, direction, content, sent_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?);`,
    [message.id, message.conversationId, message.direction, message.content, message.sentAt, message.expiresAt ?? null]
  );
}

/**
 * Histórico já vem pronto para exibição — "content" é o texto já
 * decifrado, protegido só pela cifragem do banco em repouso (ver
 * comentário em src/types/index.ts sobre por que isso é diferente do
 * design anterior, baseado em ciphertext re-decifrável).
 */
export function listMessagesByConversation(conversationId: string): Message[] {
  const db = getDatabase();
  const result = db.execute('SELECT * FROM messages WHERE conversation_id = ? ORDER BY sent_at ASC;', [
    conversationId,
  ]);

  return (result.rows?._array ?? []).map((row: any) => ({
    id: row.id,
    conversationId: row.conversation_id,
    direction: row.direction,
    content: row.content,
    sentAt: row.sent_at,
    expiresAt: row.expires_at ?? undefined,
  }));
}

export function deleteMessage(id: string): void {
  const db = getDatabase();
  db.execute('DELETE FROM messages WHERE id = ?;', [id]);
}
