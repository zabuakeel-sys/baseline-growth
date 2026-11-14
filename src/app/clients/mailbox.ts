'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { query } from '@/lib/db';
import { requireOwner } from '@/lib/auth';
import { PROVIDERS, clientAccount, verifyAccount } from '@/lib/mail';
import { encrypt, secretConfigured } from '@/lib/secret';
import { checkMailbox, graphConfigured } from '@/lib/graph';
import { parseWholeNumber } from '@/lib/money';

type Result = { error?: string; field?: string };
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
  const existing = (await query<{ password_enc: string; auth: string }>('SELECT password_enc, auth FROM client_mailboxes WHERE client_id = $1', [clientId])).rows[0];
  if (!password && (!existing || (existing.auth === 'oauth' && provider !== 'microsoft'))) return { error: 'Add the app password.', field: 'password' };
  // Google shows app passwords in groups ("abcd efgh ijkl mnop"); the spaces are not part of it.
  const isGoogle = provider === 'google' || /gmail\.com$|google\.com$/i.test(smtpHost);
  const passwordEnc = password ? encrypt(isGoogle ? password.replace(/\s+/g, '') : password) : existing.password_enc;
  await query(
    `INSERT INTO client_mailboxes (client_id, from_name, email, provider, smtp_host, smtp_port, smtp_secure, imap_host, imap_port, imap_secure, username, password_enc, daily_limit)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $3, $11, $12)
     ON CONFLICT (client_id) DO UPDATE SET from_name = $2, email = $3, provider = $4, smtp_host = $5, smtp_port = $6, smtp_secure = $7,
       imap_host = $8, imap_port = $9, imap_secure = $10, username = $3, password_enc = $11, daily_limit = $12, verified_at = NULL, last_error = '',
       auth = CASE WHEN $13 THEN 'password' ELSE client_mailboxes.auth END,
       refresh_token_enc = CASE WHEN $13 THEN '' ELSE client_mailboxes.refresh_token_enc END`,
    [clientId, fromName, email, provider, smtpHost, smtpPort, smtpSecure, imapHost, imapPort, imapSecure, passwordEnc, limit, Boolean(password)]);
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
    return { error: (err as Error).message };
  }
  await query("UPDATE client_mailboxes SET verified_at = now(), last_error = '' WHERE client_id = $1", [clientId]);
  return back(clientId, 'Connected: the system can send and read this mailbox');
}

export async function removeMailbox(clientId: number): Promise<Result> {
  await requireOwner();
  await query('DELETE FROM client_mailboxes WHERE client_id = $1', [clientId]);
  return back(clientId, 'Mailbox removed');
}

/**
 * Connects a Microsoft 365 mailbox through the Microsoft app's own access (as Kacity does):
 * no sign-in and no password. Checks with Microsoft what the app is allowed to do first.
 */
export async function connectMicrosoftApp(clientId: number, formData: FormData): Promise<Result> {
  await requireOwner();
  if (!graphConfigured()) return { error: 'MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET and MICROSOFT_TENANT_ID must all be set in Railway.' };
  const email = String(formData.get('ms_email') ?? '').trim().toLowerCase();
  if (!EMAIL.test(email)) return { error: 'Type the mailbox address, like zain@libraprofs.com.', field: 'ms_email' };
  const fromName = String(formData.get('ms_from_name') ?? '').trim().replace(/["<>]/g, '');
  if (!fromName) return { error: 'Add the name emails are signed with.', field: 'ms_from_name' };
  let c;
  try {
    c = await checkMailbox(email);
  } catch (err) {
    const msg = (err as Error).message;
    const hint = /ErrorAccessDenied|Access is denied|403/.test(msg)
      ? ' The app is not allowed to open this mailbox (an admin may have limited it to other mailboxes).'
      : /ResourceNotFound|MailboxNotEnabled|404/.test(msg) ? ' No mailbox with that address in this Microsoft 365 organization.' : '';
    return { error: `${msg}.${hint}`, field: 'ms_email' };
  }
  if (!c.canSend) {
    return { error: `The Microsoft app Kacity uses is not allowed to send email. Permissions it has: ${c.roles.join(', ') || 'none for mail'}. It needs Mail.Send (application), which only a Microsoft 365 admin can grant.` };
  }
  const existing = (await query<{ daily_limit: number }>('SELECT daily_limit FROM client_mailboxes WHERE client_id = $1', [clientId])).rows[0];
  const note = c.canRead ? '' : 'Sending works. Replies are not read automatically (the app lacks Mail.Read), so watch this inbox yourself.';
  await query(
    `INSERT INTO client_mailboxes (client_id, from_name, email, provider, smtp_host, smtp_port, smtp_secure, imap_host, imap_port, imap_secure,
       username, password_enc, daily_limit, auth, refresh_token_enc, verified_at, last_error)
     VALUES ($1, $2, $3, 'microsoft', 'graph.microsoft.com', 443, true, 'graph.microsoft.com', 443, true, $3, '', $4, 'graph', '', now(), $5)
     ON CONFLICT (client_id) DO UPDATE SET from_name = $2, email = $3, provider = 'microsoft', smtp_host = 'graph.microsoft.com', smtp_port = 443,
       imap_host = 'graph.microsoft.com', imap_port = 443, username = $3, password_enc = '', auth = 'graph', refresh_token_enc = '',
       verified_at = now(), last_error = $5`,
    [clientId, fromName, email, existing?.daily_limit ?? 20, note]);
  return back(clientId, `Connected ${email} through the Microsoft app${c.canRead ? ': sending and reading replies work' : ': sending works'}`);
}
