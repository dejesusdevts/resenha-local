import { getDatabase } from '../database';
import { Group } from '../../types';

export function saveGroup(group: Group): void {
  const db = getDatabase();
  db.execute(
    `INSERT OR REPLACE INTO groups (id, name, member_endpoint_ids, created_at)
     VALUES (?, ?, ?, ?);`,
    [group.id, group.name, JSON.stringify(group.memberEndpointIds), group.createdAt]
  );
}

export function listGroups(): Group[] {
  const db = getDatabase();
  const result = db.execute('SELECT * FROM groups ORDER BY created_at DESC;');
  return (result.rows?._array ?? []).map((row: any) => ({
    id: row.id,
    name: row.name,
    memberEndpointIds: JSON.parse(row.member_endpoint_ids),
    createdAt: row.created_at,
  }));
}
