'use server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { query } from '@/lib/db';
import { mailStatus, sendMail } from '@/lib/mail';
import { today } from '@/lib/work';

// Public form, no login: partners send us referrals here. Guards: a hidden field bots fill in,
// a per-address rate limit, length caps, and the do-not-contact list.
const recent = new Map<string, number[]>();
function tooMany(ip: string) {
  const now = Date.now();
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  hits.push(now);
  recent.set(ip, hits);
  return hits.length > 10;
}

export async function submitReferral(code: string, formData: FormData): Promise<{ error?: string }> {
  if (String(formData.get('website') ?? '')) redirect(`/r/${code}?sent=1`); // bot: pretend it worked
  const ip = ((await headers()).get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
  if (tooMany(ip)) return { error: 'Too many referrals from here in the last hour. Please try again later.' };
  const partner = (await query<{ id: number; client_id: number | null; name: string; assignee_id: number | null; active: boolean }>(
    'SELECT id, client_id, name, assignee_id, active FROM partners WHERE code = $1', [code])).rows[0];
  if (!partner || !partner.active || !partner.client_id) return { error: 'This referral link is no longer active.' };
  const cut = (k: string, n: number) => String(formData.get(k) ?? '').trim().slice(0, n);
  const name = cut('name', 200);
  const contact = cut('contact', 200);
  const phone = cut('phone', 40);
  const email = cut('email', 200).toLowerCase();
  const note = cut('note', 1000);
  if (!name) return { error: 'Add the business name.' };
  if (!phone && !email) return { error: 'Add a phone number or an email.' };
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: 'That email does not look right.' };
  const blocked = await query(
    `SELECT 1 FROM leads WHERE status = 'opted_out' AND ((email <> '' AND email = $1) OR (phone <> '' AND regexp_replace(phone, '\\D', '', 'g') = regexp_replace($2, '\\D', '', 'g')))`,
    [email, phone]);
  if (!blocked.rowCount) {
    await query(
      `INSERT INTO leads (client_id, name, phone, email, source, need, notes, received_on, assignee_id, partner_id, next_action_on, next_action)
       VALUES ($1, $2, $3, $4, 'Referral', '', $5, $6, $7, $8, $6, $9)`,
      [partner.client_id, name, phone, email, [contact && `Contact: ${contact}`, note, `Referred by ${partner.name}`].filter(Boolean).join('\n'),
        today(), partner.assignee_id, partner.id, `Referral from ${partner.name}: call today`]);
    if (mailStatus().send) {
      const to = partner.assignee_id
        ? (await query<{ email: string }>('SELECT email FROM users WHERE id = $1', [partner.assignee_id])).rows.map((r) => r.email)
        : (await query<{ email: string }>("SELECT email FROM users WHERE role = 'owner'")).rows.map((r) => r.email);
      if (to.length) {
        await sendMail({ to: to.join(', '), subject: `New referral from ${partner.name}: ${name}`,
          text: `${partner.name} referred ${name}.\n${contact ? `Contact: ${contact}\n` : ''}${phone ? `Phone: ${phone}\n` : ''}${email ? `Email: ${email}\n` : ''}${note ? `\n${note}\n` : ''}\nCall them today. Referrals go cold fast.` })
          .catch((err) => console.error('referral alert failed:', err));
      }
    }
  }
  // The same thank-you either way, so the form never reveals who is on the do-not-contact list.
  redirect(`/r/${code}?sent=1`);
}
