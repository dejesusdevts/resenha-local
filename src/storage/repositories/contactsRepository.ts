import { getDatabase } from '../database';
import { Contact } from '../../types';

export function upsertContact(contact: Contact): void {
  const db = getDatabase();
  db.execute(
    `INSERT INTO contacts (endpoint_id, username, public_key, last_seen_at, verified)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(endpoint_id) DO UPDATE SET
       username = excluded.username,
       public_key = excluded.public_key,
       last_seen_at = excluded.last_seen_at;`,
    [contact.endpointId, contact.username, contact.publicKey, contact.lastSeenAt, contact.verified ? 1 : 0]
  );
}

export function markContactVerified(endpointId: string): void {
  const db = getDatabase();
  db.execute('UPDATE contacts SET verified = 1 WHERE endpoint_id = ?;', [endpointId]);
}

export function listContacts(): Contact[] {
  const db = getDatabase();
  const result = db.execute('SELECT * FROM contacts ORDER BY last_seen_at DESC;');
  return (result.rows?._array ?? []).map(rowToContact);
}

export function getContact(endpointId: string): Contact | null {
  const db = getDatabase();
  const result = db.execute('SELECT * FROM contacts WHERE endpoint_id = ?;', [endpointId]);
  const row = result.rows?._array?.[0];
  return row ? rowToContact(row) : null;
}

function rowToContact(row: any): Contact {
  return {
    endpointId: row.endpoint_id,
    username: row.username,
    publicKey: row.public_key,
    lastSeenAt: row.last_seen_at,
    verified: Boolean(row.verified),
  };
}
