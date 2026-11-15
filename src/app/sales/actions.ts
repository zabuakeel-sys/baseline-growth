'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { query } from '@/lib/db';
import { requireOwner, requireUser } from '@/lib/auth';
import { CHANNELS, OUTCOMES, applyOutcome } from '@/lib/sales';
import { parsePercent, parseWholeNumber } from '@/lib/money';
import { today } from '@/lib/work';
import { currentStep } from '@/lib/cadence';
import { routeLink } from '@/lib/playbook';
import { orderByNearest } from '@/lib/route';
import { ensureCoords } from '@/lib/geocode';

type Result = { error?: string };

/**
 * Builds a Google Maps driving route through the given visits, ordered shortest-first from where the
 * rep is now. Geocodes any visit that has no coordinates yet (and caches them). Returns the URL.
 */
export async function planVisitRoute(leadIds: number[], originLat: number | null, originLng: number | null): Promise<string> {
  const user = await requireUser();
  const ids = (leadIds || []).filter((n) => Number.isInteger(n) && n > 0).slice(0, 10);
  if (!ids.length) return '';
  const scope = user.role === 'owner' ? '' : 'AND (l.assignee_id = $2 OR l.assignee_id IS NULL)';
  const rows = (await query<{ id: number; lat: number | null; lng: number | null; address: string }>(
    `SELECT l.id, l.lat, l.lng, l.address FROM leads l WHERE l.id = ANY($1) AND l.address <> '' ${scope}`,
    user.role === 'owner' ? [ids] : [ids, user.id])).rows;
  if (!rows.length) return '';
  await ensureCoords(rows);
  const origin = Number.isFinite(originLat) && Number.isFinite(originLng) ? { lat: originLat as number, lng: originLng as number } : null;
  const addresses = orderByNearest(origin, rows).map((r) => r.address).filter(Boolean);
  return routeLink(addresses, origin ? `${origin.lat},${origin.lng}` : '') ?? '';
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const safe = (back: string) => (back.startsWith('/') && !back.startsWith('//') ? back : '/next');
const withSaved = (back: string, msg: string) => {
  const [path, hash] = safe(back).split('#');
  return `${path}${path.includes('?') ? '&' : '?'}saved=${encodeURIComponent(msg)}${hash ? `#${hash}` : ''}`;
};
const refresh = (clientId?: number) => {
  for (const p of ['/next', '/leads', '/scoreboard', '/money']) revalidatePath(p);
  if (clientId) revalidatePath(`/clients/${clientId}`);
};

/** Logs a call, visit, email or LinkedIn touch with its outcome, and moves the prospect along. */
export async function logActivity(leadId: number, back: string, formData: FormData): Promise<Result> {
  const user = await requireUser();
  const channel = String(formData.get('channel') ?? '');
  const outcome = String(formData.get('outcome') ?? '');
  const notes = String(formData.get('notes') ?? '').trim();
  const nextOn = String(formData.get('next_action_on') ?? '').trim();
  const nextAction = String(formData.get('next_action') ?? '').trim();
  if (!(channel in CHANNELS)) return { error: 'Pick how you reached them.' };
  if (!(outcome in OUTCOMES)) return { error: 'Pick what happened.' };
  if (nextOn && !DATE.test(nextOn)) return { error: 'Next step date must be a date.' };
  const lead = (await query<{ client_id: number; status: string; received_on: string; email: string; phone: string; address: string; cadence_step: number; visits: boolean }>(
    `SELECT l.client_id, l.status, l.received_on, l.email, l.phone, l.address, l.cadence_step, c.visits
     FROM leads l JOIN clients c ON c.id = l.client_id WHERE l.id = $1`, [leadId])).rows[0];
  if (!lead) return { error: 'That prospect no longer exists.' };
  if (lead.status === 'opted_out') return { error: 'This prospect asked not to be contacted.' };

  const now = today();
  const change = applyOutcome(lead, outcome, now);
  // A call or visit done now counts as the schedule's call or visit step (even if done early).
  const step = currentStep(lead, lead, now);
  if (step && step.channel !== 'email' && (channel === 'call' || channel === 'visit')) {
    await query('UPDATE leads SET cadence_step = GREATEST(cadence_step, $2) WHERE id = $1', [leadId, step.index + 1]);
  }
  await query('INSERT INTO activities (lead_id, user_id, channel, outcome, notes) VALUES ($1, $2, $3, $4, $5)',
    [leadId, user.id, channel, outcome, notes]);
  if (change.status === 'won') {
    await query(
      `UPDATE leads SET status = 'won', customer_since = $2, closed_on = $2, won_by = $3, introduced_on = COALESCE(introduced_on, $2),
         lost_reason = '', next_action_on = NULL, next_action = '' WHERE id = $1`, [leadId, now, user.id]);
  } else if (change.status === 'lost') {
    await query("UPDATE leads SET status = 'lost', lost_reason = $2, closed_on = $3, next_action_on = NULL, next_action = '' WHERE id = $1",
      [leadId, change.lostReason, now]);
  } else if (change.status) {
    await query('UPDATE leads SET status = $2 WHERE id = $1', [leadId, change.status]);
  }
  if (change.status !== 'won' && change.status !== 'lost') {
    // The rep's own next step wins over the default for the outcome.
    const on = nextOn || change.nextActionOn;
    await query('UPDATE leads SET next_action_on = $2, next_action = $3 WHERE id = $1',
      [leadId, on, on ? nextAction || `Follow up (${OUTCOMES[outcome as keyof typeof OUTCOMES].label.toLowerCase()})` : '']);
  }
  // Any human contact stops queued automatic emails, so the prospect is not emailed over the top of a conversation.
  if (OUTCOMES[outcome as keyof typeof OUTCOMES].conversation) {
    await query("UPDATE outbox SET status = 'cancelled' WHERE lead_id = $1 AND status IN ('pending', 'approved')", [leadId]);
  }
  refresh(lead.client_id);
  redirect(withSaved(back, `${CHANNELS[channel as keyof typeof CHANNELS]} logged: ${OUTCOMES[outcome as keyof typeof OUTCOMES].label}`));
}

export async function bookMeeting(leadId: number, back: string, formData: FormData): Promise<Result> {
  const user = await requireUser();
  const date = String(formData.get('date') ?? '').trim();
  const time = String(formData.get('time') ?? '').trim();
  const kind = String(formData.get('kind') ?? '').trim() || 'Meeting';
  const location = String(formData.get('location') ?? '').trim();
  if (!DATE.test(date) || !/^\d{2}:\d{2}$/.test(time)) return { error: 'Pick the day and time of the meeting.' };
  if (date < today()) return { error: 'The meeting date is in the past.' };
  const lead = (await query<{ client_id: number }>('SELECT client_id FROM leads WHERE id = $1', [leadId])).rows[0];
  if (!lead) return { error: 'That prospect no longer exists.' };
  // The time is entered in Michigan time.
  await query(
    `INSERT INTO meetings (lead_id, booked_by, starts_at, kind, location) VALUES ($1, $2, ($3 || ' ' || $4)::timestamp AT TIME ZONE 'America/Detroit', $5, $6)`,
    [leadId, user.id, date, time, kind.slice(0, 60), location.slice(0, 200)]);
  await query(
    `UPDATE leads SET status = CASE WHEN status IN ('new', 'following_up') THEN 'talking' ELSE status END,
       next_action_on = $2, next_action = $3 WHERE id = $1 AND status NOT IN ('won', 'lost', 'opted_out')`,
    [leadId, date, `${kind} at ${time}`]);
  await query("UPDATE outbox SET status = 'cancelled' WHERE lead_id = $1 AND status IN ('pending', 'approved')", [leadId]);
  refresh(lead.client_id);
  redirect(withSaved(back, `${kind} booked`));
}

export async function setMeetingStatus(meetingId: number, status: string, back: string) {
  await requireUser();
  if (!['held', 'no_show', 'cancelled', 'scheduled'].includes(status)) return;
  const { rows } = await query<{ client_id: number }>(
    'UPDATE meetings m SET status = $2 FROM leads l WHERE m.id = $1 AND l.id = m.lead_id RETURNING l.client_id, l.id AS lead_id', [meetingId, status]);
  // The next step after a meeting is obvious, so set it: it puts the prospect back in Next up.
  const next = status === 'held' ? 'After the meeting: hand them to the business, or sign them up'
    : status === 'no_show' ? 'Missed the meeting: call to rebook' : '';
  if (next && rows[0]) {
    await query("UPDATE leads SET next_action_on = $2, next_action = $3 WHERE id = $1 AND status NOT IN ('won', 'lost', 'opted_out')",
      [(rows[0] as unknown as { lead_id: number }).lead_id, today(), next]);
  }
  refresh(rows[0]?.client_id);
  redirect(withSaved(back, 'Meeting updated'));
}

export async function setNextAction(leadId: number, back: string, formData: FormData): Promise<Result> {
  await requireUser();
  const on = String(formData.get('next_action_on') ?? '').trim();
  const what = String(formData.get('next_action') ?? '').trim();
  if (on && !DATE.test(on)) return { error: 'Pick a date.' };
  const { rows } = await query<{ client_id: number }>(
    'UPDATE leads SET next_action_on = $2, next_action = $3 WHERE id = $1 RETURNING client_id', [leadId, on || null, on ? what || 'Follow up' : '']);
  refresh(rows[0]?.client_id);
  redirect(withSaved(back, on ? 'Next step set' : 'Next step cleared'));
}

export async function assignLead(leadId: number, back: string, formData: FormData): Promise<Result> {
  await requireUser();
  const to = parseWholeNumber(formData.get('assignee_id'));
  if (Number.isNaN(to)) return { error: 'Pick a rep.' };
  const { rows } = await query<{ client_id: number }>('UPDATE leads SET assignee_id = $2 WHERE id = $1 RETURNING client_id', [leadId, to]);
  refresh(rows[0]?.client_id);
  redirect(withSaved(back, 'Reassigned'));
}

export async function saveScript(clientId: number, formData: FormData): Promise<Result> {
  await requireUser();
  const script = String(formData.get('call_script') ?? '').trim();
  await query('UPDATE clients SET call_script = $2 WHERE id = $1', [clientId, script.slice(0, 8000)]);
  refresh(clientId);
  redirect(withSaved(`/clients/${clientId}/settings#script-h`, 'Script saved'));
}

export async function setCommission(userId: number, formData: FormData): Promise<Result> {
  await requireOwner();
  const pct = parsePercent(formData.get('commission_percent'));
  if (pct === null || Number.isNaN(pct)) return { error: 'Commission must be a percent from 0 to 100.' };
  await query('UPDATE users SET commission_percent = $2 WHERE id = $1', [userId, pct]);
  revalidatePath('/team');
  revalidatePath('/scoreboard');
  redirect('/team?saved=1');
}

/** From Next up: records the call or visit that booked the meeting, then books it. */
export async function bookFromQueue(leadId: number, back: string, channel: string, formData: FormData): Promise<Result> {
  const user = await requireUser();
  const date = String(formData.get('date') ?? '').trim();
  const time = String(formData.get('time') ?? '').trim();
  if (!DATE.test(date) || !/^\d{2}:\d{2}$/.test(time)) return { error: 'Pick the day and time of the meeting.' };
  if (date < today()) return { error: 'The meeting date is in the past.' };
  const lead = (await query<{ status: string }>('SELECT status FROM leads WHERE id = $1', [leadId])).rows[0];
  if (!lead) return { error: 'That prospect no longer exists.' };
  if (lead.status === 'opted_out') return { error: 'This prospect asked not to be contacted.' };
  await query('INSERT INTO activities (lead_id, user_id, channel, outcome, notes) VALUES ($1, $2, $3, $4, $5)',
    [leadId, user.id, channel === 'visit' ? 'visit' : 'call', 'meeting_booked', '']);
  return bookMeeting(leadId, back, formData);
}
