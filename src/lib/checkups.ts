import { query } from './db';
import type { Answers } from './checkup';

export type Checkup = {
  id: number; client_id: number; conducted_on: string; conducted_by_name: string | null;
  answers: Answers; notes: Record<string, string>; summary: string; tasks_created_at: string | null;
};

export async function getCheckup(id: number) {
  const { rows } = await query<Checkup & { client_name: string; client_industry: string }>(
    `SELECT k.*, u.name AS conducted_by_name, c.name AS client_name, c.industry AS client_industry
     FROM checkups k JOIN clients c ON c.id = k.client_id LEFT JOIN users u ON u.id = k.conducted_by
     WHERE k.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function listCheckups(clientId: number) {
  const { rows } = await query<Checkup>(
    `SELECT k.*, u.name AS conducted_by_name FROM checkups k LEFT JOIN users u ON u.id = k.conducted_by
     WHERE k.client_id = $1 ORDER BY k.conducted_on DESC, k.id DESC`,
    [clientId],
  );
  return rows;
}
