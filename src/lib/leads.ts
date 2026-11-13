import { query } from './db';
import type { LeadStatus } from './followup';

/** A prospect we found for a client. Stored in the leads table. */
export type Lead = {
  id: number; client_id: number; client_name: string; client_offer: string; client_address: string;
  name: string; phone: string; email: string; source: string; need: string;
  received_at: string; received_on: string; status: LeadStatus;
  touches_sent: number; first_touch_at: string | null; last_touch_at: string | null;
  assignee_id: number | null; assignee_name: string | null;
  lost_reason: string; closed_on: string | null; introduced_on: string | null; customer_since: string | null; notes: string;
  outbox_status: string | null; last_reply: string | null; last_reply_kind: string | null; handed_over_at: string | null; client_contact_email: string;
};

const SELECT = `SELECT l.id, l.client_id, c.name AS client_name, c.offer AS client_offer, c.mailing_address AS client_address,
  l.name, l.phone, l.email, l.source, l.need,
  to_char(l.received_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS received_at, l.received_on, l.status,
  l.touches_sent,
  to_char(l.first_touch_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS first_touch_at,
  to_char(l.last_touch_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_touch_at,
  l.assignee_id, u.name AS assignee_name, l.lost_reason, l.closed_on, l.introduced_on, l.customer_since, l.notes,
  (SELECT o.status FROM outbox o WHERE o.lead_id = l.id AND o.touch = l.touches_sent AND o.status IN ('pending', 'approved', 'failed')) AS outbox_status,
  (SELECT r.body FROM replies r WHERE r.lead_id = l.id AND r.kind <> 'auto' ORDER BY r.received_at DESC LIMIT 1) AS last_reply,
  (SELECT r.kind FROM replies r WHERE r.lead_id = l.id AND r.kind <> 'auto' ORDER BY r.received_at DESC LIMIT 1) AS last_reply_kind,
  to_char(l.handed_over_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS handed_over_at, c.contact_email AS client_contact_email
  FROM leads l JOIN clients c ON c.id = l.client_id LEFT JOIN users u ON u.id = l.assignee_id`;

/** Prospects still in play: being reached, talking, or introduced and waiting on the client. */
export async function openLeads() {
  const { rows } = await query<Lead>(
    `${SELECT} WHERE l.status IN ('new', 'following_up', 'talking', 'introduced') ORDER BY l.received_on, l.id`);
  return rows;
}

export async function clientLeads(clientId: number) {
  const { rows } = await query<Lead>(`${SELECT} WHERE l.client_id = $1 ORDER BY l.received_on DESC, l.id DESC`, [clientId]);
  return rows;
}

export type CustomerRevenue = { lead_id: number; month: string; revenue_cents: number; confirmed: boolean; confirmed_by: string };

/** Customers we brought a client, with every month of revenue the client reported for them. */
export async function clientCustomers(clientId: number) {
  const customers = (await query<Lead>(
    `${SELECT} WHERE l.client_id = $1 AND l.status = 'won' ORDER BY l.customer_since, l.id`, [clientId])).rows;
  const revenue = customers.length
    ? (await query<CustomerRevenue>(
        'SELECT lead_id, month, revenue_cents, confirmed, confirmed_by FROM customer_revenue WHERE lead_id = ANY($1) ORDER BY month',
        [customers.map((c) => c.id)])).rows
    : [];
  return { customers, revenue };
}
