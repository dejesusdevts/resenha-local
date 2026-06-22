import { getDatabase } from '../database';
import { Profile } from '../../types';

export function saveProfile(profile: Profile): void {
  const db = getDatabase();
  db.execute(
    `INSERT OR REPLACE INTO profile (id, username, avatar_uri, status_message, public_key, created_at)
     VALUES (?, ?, ?, ?, ?, ?);`,
    [
      profile.id,
      profile.username,
      profile.avatarUri ?? null,
      profile.statusMessage ?? null,
      profile.publicKey,
      profile.createdAt,
    ]
  );
}

export function getProfile(): Profile | null {
  const db = getDatabase();
  const result = db.execute('SELECT * FROM profile LIMIT 1;');
  const row = result.rows?._array?.[0];
  if (!row) return null;

  return {
    id: row.id,
    username: row.username,
    avatarUri: row.avatar_uri ?? undefined,
    statusMessage: row.status_message ?? undefined,
    publicKey: row.public_key,
    createdAt: row.created_at,
  };
}
