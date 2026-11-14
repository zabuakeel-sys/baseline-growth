'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { query } from '@/lib/db';
import { requireOwner } from '@/lib/auth';
import { PROVIDERS, clientAccount, verifyAccount } from '@/lib/mail';
import { encrypt, secretConfigured } from '@/lib/secret';
import { parseWholeNumber } from '@/lib/money';

type Result = { error?: string };
const back = (id: number, msg: string): never => {
  revalidatePath(`/clients/${id}`);
  revalidatePath('/outbox');
  redirect(`/clients/${id}?saved=${encodeURIComponent(msg)}#mailbox-h`);
};
const EMAIL = /^[^@\s<>"]+@[^@\s<>"]+\.[^@\s<>"]+$/;
const HOST = /^[a-z0-9][a-z0-9.-]*$/i;

/** Saves a business's outreach mailbox. The password is encrypted before it is stored. */
export async function saveMailbox(clientId: number, formData: FormData): Promise<Result> {
  await requireOwner();
  if (!secretConfigured()) return { error: 'APP_SECRET is not set on the server, so the password cannot be stored safely. Add it in Railway first.' };
  const get = (k: string) => String(formData.get(k) ?? '').trim();
  const provider = get('provider') as keyof typeof PROVIDERS;
  if (!(provider in PROVIDERS)) return { error: 'Pick the email provider.' };
  const email = get('box_email').toLowerCase();
  if (!EMAIL.test(email)) return { error: 'The email address does not look right.' };
  const fromName = get('from_name').replace(/["<>]/g, '');
  if (!fromName) return { error: 'Add the name emails are signed with.' };
  const limit = parseWholeNumber(get('daily_limit'));
  if (!limit || Number.isNaN(limit) || limit > 200) return { error: 'Emails per day must be 1 to 200.' };
  const preset = PROVIDERS[provider];
  const smtpHost = provider === 'other' ? get('smtp_host') : preset.smtp_host;
  const imapHost = provider === 'other' ? get('imap_host') : preset.imap_host;
  const smtpPort = provider === 'other' ? parseWholeNumber(get('smtp_port')) ?? 465 : preset.smtp_port;
  const imapPort = provider === 'other' ? parseWholeNumber(get('imap_port')) ?? 993 : preset.imap_port;
  if (!HOST.test(smtpHost) || !HOST.test(imapHost)) return { error: 'Add the sending (SMTP) and reading (IMAP) server names.' };
  if (Number.isNaN(smtpPort) || Number.isNaN(imapPort) || !smtpPort || !imapPort || smtpPort > 65535 || imapPort > 65535) return { error: 'Ports must be numbers.' };
  const smtpSecure = provider === 'other' ? smtpPort === 465 : preset.smtp_secure;
  const imapSecure = provider === 'other' ? imapPort === 993 : preset.imap_secure;
  const password = String(formData.get('password') ?? '');
  const existing = (await query<{ password_enc: string }>('SELECT password_enc FROM client_mailboxes WHERE client_id = $1', [clientId])).rows[0];
  if (!password && !existing) return { error: 'Add the app password.' };
  // Google shows app passwords in groups ("abcd efgh ijkl mnop"); the spaces are not part of it.
  const isGoogle = provider === 'google' || /gmail\.com$|google\.com$/i.test(smtpHost);
  const passwordEnc = password ? encrypt(isGoogle ? password.replace(/\s+/g, '') : password) : existing.password_enc;
  await query(
    `INSERT INTO client_mailboxes (client_id, from_name, email, provider, smtp_host, smtp_port, smtp_secure, imap_host, imap_port, imap_secure, username, password_enc, daily_limit)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $3, $11, $12)
     ON CONFLICT (client_id) DO UPDATE SET from_name = $2, email = $3, provider = $4, smtp_host = $5, smtp_port = $6, smtp_secure = $7,
       imap_host = $8, imap_port = $9, imap_secure = $10, username = $3, password_enc = $11, daily_limit = $12, verified_at = NULL, last_error = ''`,
    [clientId, fromName, email, provider, smtpHost, smtpPort, smtpSecure, imapHost, imapPort, imapSecure, passwordEnc, limit]);
  return back(clientId, 'Mailbox saved. Press "Test connection" to check it');
}

/** Logs in to send and to read, and records the result. */
export async function testMailbox(clientId: number): Promise<Result> {
  await requireOwner();
  const account = await clientAccount(clientId);
  if (!account) return { error: 'No mailbox saved yet, or its password cannot be read (was APP_SECRET changed?). Save it again.' };
  try {
    await verifyAccount(account);
  } catch (err) {
    await query('UPDATE client_mailboxes SET verified_at = NULL, last_error = $2 WHERE client_id = $1', [clientId, (err as Error).message.slice(0, 500)]);
    return { error: `${(err as Error).message}. For Google and Microsoft, use an app password, not the normal one.` };
  }
  await query("UPDATE client_mailboxes SET verified_at = now(), last_error = '' WHERE client_id = $1", [clientId]);
  return back(clientId, 'Connected: the system can send and read this mailbox');
}

export async function removeMailbox(clientId: number): Promise<Result> {
  await requireOwner();
  await query('DELETE FROM client_mailboxes WHERE client_id = $1', [clientId]);
  return back(clientId, 'Mailbox removed');
}
