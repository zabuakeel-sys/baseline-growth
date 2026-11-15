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
  next_action_on: string | null; next_action: string; client_script: string; address: string;
  rating: number | null; reviews: number | null; partner_id: number | null; partner_name: string | null; referred_by: number | null;
  referral_asked: boolean; quote_cents: number | null; client_claim_url: string; client_pricing: import('./playbook').Pricing | null;
  website: string; contact_name: string; contact_title: string; contact_source: string; client_play: string;
  activity: { channel: string; outcome: string; notes: string; at: string; by: string | null }[];
  meetings: { id: number; starts_at: string; kind: string; location: string; status: string }[];
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
  to_char(l.handed_over_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS handed_over_at, c.contact_email AS client_contact_email,
  l.next_action_on, l.next_action, c.call_script AS client_script, l.address,
  l.rating, l.reviews, l.partner_id, (SELECT p.name FROM partners p WHERE p.id = l.partner_id) AS partner_name, l.referred_by,
  l.referral_asked, l.quote_cents, c.claim_url AS client_claim_url, c.pricing AS client_pricing,
  l.website, l.contact_name, l.contact_title, l.contact_source, c.play AS client_play,
  COALESCE((SELECT json_agg(x) FROM (SELECT a.channel, a.outcome, a.notes, to_char(a.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS at, au.name AS by
            FROM activities a LEFT JOIN users au ON au.id = a.user_id WHERE a.lead_id = l.id ORDER BY a.created_at DESC LIMIT 4) x), '[]') AS activity,
  COALESCE((SELECT json_agg(y ORDER BY y.starts_at) FROM (SELECT m.id, to_char(m.starts_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS starts_at, m.kind, m.location, m.status
            FROM meetings m WHERE m.lead_id = l.id ORDER BY m.starts_at DESC LIMIT 3) y), '[]') AS meetings
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

/** The city in a US address like "1 Main St, Auburn Hills, MI 48326, USA" -> "Auburn Hills". */
export function cityOf(address: string) {
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length && /^(usa|united states)$/i.test(parts[parts.length - 1])) parts.pop();
  return parts.length >= 2 ? parts[parts.length - 2] : '';
}

/** The rep's day: everything open assigned to them (or to anyone, for "all"). */
export async function leadsForDay(assigneeId: number | null) {
  const { rows } = await query<Lead>(
    `${SELECT} WHERE l.status IN ('new', 'following_up', 'talking', 'introduced')
       ${assigneeId ? 'AND l.assignee_id = $1' : ''} ORDER BY l.next_action_on NULLS LAST, l.received_on, l.id`,
    assigneeId ? [assigneeId] : []);
  return rows;
}

/** Customers a rep won recently who have not been asked for referrals yet. */
export async function referralAsksDue(userId: number | null) {
  const { rows } = await query<Lead>(
    `${SELECT} WHERE l.status = 'won' AND NOT l.referral_asked AND l.customer_since >= (now() AT TIME ZONE 'America/Detroit')::date - 30
       ${userId ? 'AND (l.won_by = $1 OR l.assignee_id = $1)' : ''} ORDER BY l.customer_since DESC`,
    userId ? [userId] : []);
  return rows;
}

export async function getLead(id: number) {
  const { rows } = await query<Lead>(`${SELECT} WHERE l.id = $1`, [id]);
  return rows[0] ?? null;
}

/** The client link a prospect is sent to, tagged so the client can see the signup came from us. */
export function claimLink(base: string, leadId: number) {
  if (!base) return '';
  try {
    const u = new URL(base);
    u.searchParams.set('ref', `bg-${leadId}`);
    return u.toString();
  } catch {
    return '';
  }
}
