import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { currentUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { exchangeCode, redirectUri } from '@/lib/msoauth';
import { PROVIDERS, clientAccount, explainMailError, verifyAccount } from '@/lib/mail';
import { encrypt } from '@/lib/secret';

/** Microsoft sends the owner back here after they sign in; the mailbox is saved and tested. */
export async function GET(request: Request) {
  const user = await currentUser();
  if (!user || user.role !== 'owner') return NextResponse.redirect(new URL('/login', request.url));
  const url = new URL(request.url);
  const jar = await cookies();
  const [state, rawClient] = (jar.get('ms_oauth')?.value ?? '').split('.');
  const clientId = Number(rawClient);
  const go = (msg: string) => {
    const known = Number.isInteger(clientId) && clientId > 0;
    const path = known ? `/clients/${clientId}/settings?saved=${encodeURIComponent(msg)}#mailbox-h` : `/?saved=${encodeURIComponent(msg)}`;
    const res = NextResponse.redirect(new URL(path, request.url));
    res.cookies.delete({ name: 'ms_oauth', path: '/oauth/microsoft' });
    return res;
  };
  if (!state || state !== url.searchParams.get('state') || !Number.isInteger(clientId)) return go('Microsoft sign-in expired or did not match. Press "Connect with Microsoft" again');
  if (url.searchParams.get('error')) {
    return go(`Microsoft said no: ${(url.searchParams.get('error_description') || url.searchParams.get('error') || '').split(/\r?\n/)[0].slice(0, 300)}`);
  }
  const code = url.searchParams.get('code');
  if (!code) return go('Microsoft did not send a sign-in code. Try again');

  let who: { email: string; name: string; refreshToken: string };
  try {
    who = await exchangeCode(code, redirectUri(request.url));
  } catch (err) {
    return go(explainMailError((err as Error).message).slice(0, 600));
  }
  const ms = PROVIDERS.microsoft;
  const existing = (await query<{ from_name: string; daily_limit: number }>('SELECT from_name, daily_limit FROM client_mailboxes WHERE client_id = $1', [clientId])).rows[0];
  await query(
    `INSERT INTO client_mailboxes (client_id, from_name, email, provider, smtp_host, smtp_port, smtp_secure, imap_host, imap_port, imap_secure,
       username, password_enc, daily_limit, auth, refresh_token_enc)
     VALUES ($1, $2, $3, 'microsoft', $4, $5, $6, $7, $8, $9, $3, '', $10, 'oauth', $11)
     ON CONFLICT (client_id) DO UPDATE SET email = $3, provider = 'microsoft', smtp_host = $4, smtp_port = $5, smtp_secure = $6,
       imap_host = $7, imap_port = $8, imap_secure = $9, username = $3, password_enc = '', auth = 'oauth', refresh_token_enc = $11,
       verified_at = NULL, last_error = ''`,
    [clientId, existing?.from_name || who.name || user.name, who.email, process.env.MICROSOFT_SMTP_HOST || ms.smtp_host, Number(process.env.MICROSOFT_SMTP_PORT || ms.smtp_port),
      process.env.MICROSOFT_SMTP_PORT ? process.env.MICROSOFT_SMTP_PORT === '465' : ms.smtp_secure,
      process.env.MICROSOFT_IMAP_HOST || ms.imap_host, Number(process.env.MICROSOFT_IMAP_PORT || ms.imap_port),
      process.env.MICROSOFT_IMAP_PORT ? process.env.MICROSOFT_IMAP_PORT === '993' : ms.imap_secure,
      existing?.daily_limit ?? 20, encrypt(who.refreshToken)]);
  // Test it right away, so the owner sees whether sending and reading work.
  const account = await clientAccount(clientId);
  try {
    if (!account) throw new Error('Saved, but the connection could not be read back.');
    const note = await verifyAccount(account);
    await query('UPDATE client_mailboxes SET verified_at = now(), last_error = $2 WHERE client_id = $1', [clientId, note]);
    return go(note ? `Connected ${who.email} for sending. ${note}` : `Connected ${who.email}: the system can send and read this mailbox`);
  } catch (err) {
    const msg = (err as Error).message.slice(0, 500);
    await query('UPDATE client_mailboxes SET verified_at = NULL, last_error = $2 WHERE client_id = $1', [clientId, msg]);
    return go(`Signed in as ${who.email}, but it cannot send. See the Mailbox section`);
  }
}
