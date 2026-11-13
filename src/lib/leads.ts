import { query } from './db';
import type { LeadStatus } from './followup';

export type Lead = {
  id: number; client_id: number; client_name: string; name: string; phone: string; email: string;
  source: string; need: string; received_at: string; received_on: string; status: LeadStatus;
  touches_sent: number; first_touch_at: string | null; last_touch_at: string | null;
  assignee_id: number | null; assignee_name: string | null; won_value_cents: number | null;
  lost_reason: string; closed_on: string | null; notes: string;
};

// Timestamps come back as ISO strings so they pass cleanly to the page and the stats.
const SELECT = `SELECT l.id, l.client_id, c.name AS client_name, l.name, l.phone, l.email, l.source, l.need,
  to_char(l.received_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS received_at, l.received_on, l.status,
  l.touches_sent,
  to_char(l.first_touch_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS first_touch_at,
  to_char(l.last_touch_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_touch_at,
  l.assignee_id, u.name AS assignee_name, l.won_value_cents, l.lost_reason, l.closed_on, l.notes
  FROM leads l JOIN clients c ON c.id = l.client_id LEFT JOIN users u ON u.id = l.assignee_id`;

export async function openLeads() {
  const { rows } = await query<Lead>(`${SELECT} WHERE l.status IN ('new', 'following_up', 'talking') ORDER BY l.received_on, l.id`);
  return rows;
}

export async function clientLeads(clientId: number) {
  const { rows } = await query<Lead>(`${SELECT} WHERE l.client_id = $1 ORDER BY l.received_on DESC, l.id DESC`, [clientId]);
  return rows;
}

export async function getLead(id: number) {
  const { rows } = await query<Lead>(`${SELECT} WHERE l.id = $1`, [id]);
  return rows[0] ?? null;
}

/** Leads that arrived in a month, for the monthly results hint. month = 'YYYY-MM-01'. */
export async function leadsInMonth(clientId: number, month: string) {
  const { rows } = await query<Lead>(
    `${SELECT} WHERE l.client_id = $1 AND l.received_on >= $2::date AND l.received_on < ($2::date + interval '1 month')`,
    [clientId, month],
  );
  return rows;
}
