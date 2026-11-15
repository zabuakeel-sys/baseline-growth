// Mailboxes: sending over SMTP and reading replies over IMAP.
// Two kinds of mailbox:
//  - each client's own outreach mailbox (the address they gave us), stored per client with the
//    password encrypted (see secret.ts); outreach for that client is sent and read there;
//  - the shared mailbox from environment variables, used for alerts and hand-offs to clients,
//    and for outreach of any client without a mailbox of its own:
//      OUTREACH_FROM, SMTP_HOST, SMTP_PORT (465), SMTP_USER, SMTP_PASS, SMTP_SECURE,
//      IMAP_HOST, IMAP_PORT (993), IMAP_USER, IMAP_PASS, IMAP_SECURE
import { randomUUID } from 'node:crypto';
import nodemailer, { type Transporter } from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { query } from './db';
import { decrypt, encrypt } from './secret';
import { accessToken } from './msoauth';
import { appAccess, checkMailbox, graphFetchUnread, graphSend } from './graph';

export type MailAccount = {
  key: string; // cache key: 'shared' or 'client:<id>'
  clientId: number | null;
  from: string;
  smtp: { host: string; port: number; secure: boolean; user: string; pass: string };
  imap: { host: string; port: number; secure: boolean; user: string; pass: string } | null;
  senderName?: string; // human name for the email signature; defaults to the From display name
  dailyLimit: number | null; // null = the shared outreach limit applies
  oauth?: { refreshToken: string }; // "Connect with Microsoft": sign in with a token, no password
  graph?: { mailbox: string };      // Microsoft Graph with the app's own access: no sign-in at all
};

const env = (k: string) => process.env[k] ?? '';
const secureFlag = (k: string, port: number) => (env(k) ? env(k) === 'true' : port === 465 || port === 993);

/** Settings a provider uses; "other" takes what the owner types. */
export const PROVIDERS = {
  google: { label: 'Google Workspace / Gmail', smtp_host: 'smtp.gmail.com', smtp_port: 465, smtp_secure: true, imap_host: 'imap.gmail.com', imap_port: 993, imap_secure: true },
  microsoft: { label: 'Microsoft 365 / Outlook', smtp_host: 'smtp.office365.com', smtp_port: 587, smtp_secure: false, imap_host: 'outlook.office365.com', imap_port: 993, imap_secure: true },
  other: { label: 'Other', smtp_host: '', smtp_port: 465, smtp_secure: true, imap_host: '', imap_port: 993, imap_secure: true },
} as const;

export function mailStatus() {
  const send = Boolean(env('OUTREACH_FROM') && env('SMTP_HOST') && env('SMTP_USER') && env('SMTP_PASS'));
  const read = Boolean(env('IMAP_HOST') && env('IMAP_USER') && env('IMAP_PASS'));
  return { send, read, from: env('OUTREACH_FROM') };
}

export function sharedAccount(): MailAccount | null {
  const s = mailStatus();
  if (!s.send) return null;
  const smtpPort = Number(env('SMTP_PORT') || 465);
  const imapPort = Number(env('IMAP_PORT') || 993);
  return {
    key: 'shared', clientId: null, from: s.from, senderName: nameOfFrom(s.from), dailyLimit: null,
    smtp: { host: env('SMTP_HOST'), port: smtpPort, secure: secureFlag('SMTP_SECURE', smtpPort), user: env('SMTP_USER'), pass: env('SMTP_PASS') },
    imap: s.read ? { host: env('IMAP_HOST'), port: imapPort, secure: secureFlag('IMAP_SECURE', imapPort), user: env('IMAP_USER'), pass: env('IMAP_PASS') } : null,
  };
}

const addressOfFrom = (from: string) => from.match(/<([^>]+)>/)?.[1] ?? from.trim();
const nameOfFrom = (from: string) => from.replace(/<[^>]*>/, '').replace(/"/g, '').trim();

/** A "From" that shows `name` but keeps the shared mailbox's real address (e.g. "AutoAt <outreach@...>"). */
export function withSenderName(sharedFrom: string, name: string) {
  const clean = name.replace(/["<>]/g, '').trim();
  return clean ? `${clean} <${addressOfFrom(sharedFrom)}>` : sharedFrom;
}

type MailboxRow = {
  client_id: number; from_name: string; email: string; smtp_host: string; smtp_port: number; smtp_secure: boolean;
  imap_host: string; imap_port: number; imap_secure: boolean; username: string; password_enc: string; daily_limit: number;
  auth: 'password' | 'oauth' | 'graph'; refresh_token_enc: string;
};

function fromRow(r: MailboxRow): MailAccount {
  if (r.auth === 'graph') {
    return {
      key: `client:${r.client_id}`, clientId: r.client_id, from: `${r.from_name.replace(/["<>]/g, '')} <${r.email}>`, dailyLimit: r.daily_limit,
      smtp: { host: '', port: 0, secure: true, user: r.email, pass: '' }, imap: null, graph: { mailbox: r.email },
    };
  }
  const oauth = r.auth === 'oauth';
  const pass = oauth ? '' : decrypt(r.password_enc);
  return {
    key: `client:${r.client_id}`, clientId: r.client_id, from: `${r.from_name.replace(/["<>]/g, '')} <${r.email}>`, dailyLimit: r.daily_limit,
    smtp: { host: r.smtp_host, port: r.smtp_port, secure: r.smtp_secure, user: r.username, pass },
    imap: { host: r.imap_host, port: r.imap_port, secure: r.imap_secure, user: r.username, pass },
    ...(oauth ? { oauth: { refreshToken: decrypt(r.refresh_token_enc) } } : {}),
  };
}

/** The access token for an OAuth mailbox (refreshed when needed; a rotated refresh token is saved). */
async function tokenFor(a: MailAccount) {
  if (!a.oauth) return null;
  return accessToken(a.key, a.oauth.refreshToken, async (next) => {
    a.oauth = { refreshToken: next };
    if (a.clientId) await query('UPDATE client_mailboxes SET refresh_token_enc = $2 WHERE client_id = $1', [a.clientId, encrypt(next)]);
  });
}

/**
 * A client's own mailbox, or null when it has none. By default only a mailbox that passed its
 * connection test is returned, so a half-set-up or broken one is ignored and the shared mailbox is
 * used instead. The "Test connection" and "Connect" flows pass requireVerified: false to check a
 * mailbox before it is verified.
 */
export async function clientAccount(clientId: number, requireVerified = false): Promise<MailAccount | null> {
  const r = (await query<MailboxRow>(
    `SELECT * FROM client_mailboxes WHERE client_id = $1 ${requireVerified ? 'AND verified_at IS NOT NULL' : ''}`, [clientId])).rows[0];
  if (!r) return null;
  try { return fromRow(r); } catch { return null; }
}

/** Every client mailbox that is connected and can be read (broken/unverified ones are skipped). */
export async function allClientAccounts(): Promise<MailAccount[]> {
  const rows = (await query<MailboxRow>(
    "SELECT m.* FROM client_mailboxes m JOIN clients c ON c.id = m.client_id WHERE c.status <> 'ended' AND m.verified_at IS NOT NULL")).rows;
  const out: MailAccount[] = [];
  for (const r of rows) { try { out.push(fromRow(r)); } catch { /* unreadable password: shown on the client page */ } }
  return out;
}

/**
 * The mailbox outreach for this client goes out from: its own if it has one, else the shared
 * Baseline Growth mailbox, shown as the business's name (so the recipient sees "AutoAt" or
 * "LibraPro" as the sender, with replies landing in the one shared inbox and sorted back by lead).
 */
export async function outreachAccount(clientId: number) {
  const own = await clientAccount(clientId, true);
  if (own) return own;
  const shared = sharedAccount();
  if (!shared) return null;
  const c = (await query<{ name: string }>('SELECT name FROM clients WHERE id = $1', [clientId])).rows[0];
  return c ? { ...shared, from: withSenderName(shared.from, c.name), senderName: shared.senderName } : shared;
}

const transports = new Map<string, { sig: string; t: Transporter }>();
const tlsOpts = () => (env('MAIL_ALLOW_SELF_SIGNED') === '1' ? { rejectUnauthorized: false } : undefined);
async function transportFor(a: MailAccount) {
  const token = await tokenFor(a);
  const sig = JSON.stringify(a.smtp) + (token ?? '');
  const cached = transports.get(a.key);
  if (cached && cached.sig === sig) return cached.t;
  const t = nodemailer.createTransport({
    host: a.smtp.host, port: a.smtp.port, secure: a.smtp.secure,
    auth: token ? { type: 'OAuth2', user: a.smtp.user, accessToken: token } : { user: a.smtp.user, pass: a.smtp.pass },
    tls: tlsOpts(),
  });
  transports.set(a.key, { sig, t });
  return t;
}

const domainOf = (from: string) => (from.match(/@([^>\s]+)/)?.[1] ?? 'localhost').toLowerCase();

/** Sends an email (plain text, plus HTML when given); returns the Message-ID used, so replies can be matched. */
export async function sendMail(
  m: { to: string; subject: string; text: string; html?: string; inReplyTo?: string | null; cc?: string },
  account: MailAccount | null = sharedAccount(),
) {
  if (!account) throw new Error('No mailbox is connected for sending.');
  if (account.graph) return graphSend(account.graph.mailbox, m);
  const messageId = `<${randomUUID()}@${domainOf(account.from)}>`;
  // A standards-compliant unsubscribe path. Mailbox providers (Gmail, Yahoo) treat its presence as a
  // trust signal and are less likely to spam-file the sender; it points at the real reply-to opt-out.
  const unsubAddr = account.from.match(/<([^>]+)>/)?.[1] ?? account.from.trim();
  await (await transportFor(account)).sendMail({
    from: account.from, to: m.to, cc: m.cc, subject: m.subject, text: m.text, ...(m.html ? { html: m.html } : {}), messageId,
    headers: { 'List-Unsubscribe': `<mailto:${unsubAddr}?subject=unsubscribe>` },
    ...(m.inReplyTo ? { inReplyTo: m.inReplyTo, references: m.inReplyTo } : {}),
  });
  return messageId;
}

export type Incoming = {
  messageId: string; inReplyTo: string; references: string[]; from: string; subject: string;
  text: string; headers: Record<string, string>; date: Date;
};

async function imapClient(a: MailAccount) {
  if (!a.imap) throw new Error('This mailbox has no reading settings.');
  const token = await tokenFor(a);
  return new ImapFlow({
    host: a.imap.host, port: a.imap.port, secure: a.imap.secure,
    auth: token ? { user: a.imap.user, accessToken: token } : { user: a.imap.user, pass: a.imap.pass }, logger: false, tls: tlsOpts(),
  });
}

/** Reads every unread message in the account's inbox and marks it read. */
export async function fetchUnread(account: MailAccount): Promise<Incoming[]> {
  if (account.graph) {
    const { roles } = await appAccess();
    return roles.includes('Mail.Read') || roles.includes('Mail.ReadWrite') ? graphFetchUnread(account.graph.mailbox) : [];
  }
  const client = await imapClient(account);
  await client.connect();
  const out: Incoming[] = [];
  const lock = await client.getMailboxLock('INBOX');
  try {
    const uids = (await client.search({ seen: false }, { uid: true })) || [];
    if (uids.length) {
      for await (const msg of client.fetch(uids, { source: true }, { uid: true })) {
        if (!msg.source) continue;
        const p = await simpleParser(msg.source);
        const headers: Record<string, string> = {};
        for (const [k, v] of p.headers) headers[k] = typeof v === 'string' ? v : JSON.stringify(v);
        const refs = p.references ? (Array.isArray(p.references) ? p.references : [p.references]) : [];
        out.push({
          messageId: p.messageId ?? `<no-id-${account.key}-${msg.uid}@inbox>`,
          inReplyTo: p.inReplyTo ?? '', references: refs, from: p.from?.text ?? '', subject: p.subject ?? '',
          text: (p.text ?? '').slice(0, 20_000), headers, date: p.date ?? new Date(),
        });
      }
      await client.messageFlagsAdd(uids, ['\\Seen'], { uid: true });
    }
  } finally {
    lock.release();
    await client.logout().catch(() => {});
  }
  return out;
}

/** Checks that a mailbox can log in to send and to read. Throws with a readable reason. */
/**
 * Checks a mailbox. Sending must work (throws if it does not, so a broken mailbox is never used).
 * Reading replies is a bonus: if it fails, that is returned as a note rather than failing the whole
 * mailbox, so an address that can send is still connected and used for outreach.
 * Returns '' when both work, or a short note when only sending works.
 */
export async function verifyAccount(account: MailAccount): Promise<string> {
  if (account.graph) {
    const c = await checkMailbox(account.graph.mailbox);
    if (!c.canSend) throw new Error(`The Microsoft app is not allowed to send email (it has: ${c.roles.join(', ') || 'no mail permissions'}).`);
    return c.canRead ? '' : 'Sending works. Replies are not read automatically, so watch the inbox yourself.';
  }
  try {
    await (await transportFor(account)).verify();
  } catch (err) {
    throw new Error(explainMailError(`Sending login failed: ${(err as Error).message}`));
  }
  try {
    const c = await imapClient(account);
    await c.connect();
    await c.logout();
  } catch (err) {
    return explainMailError(`Sending works, but reading replies failed: ${(err as Error).message}`);
  }
  return '';
}

/** Adds what to do for the mailbox errors people actually hit. */
export function explainMailError(msg: string) {
  if (/SmtpClientAuthentication|5\.7\.139/i.test(msg)) {
    return `${msg} Fix: in the Microsoft 365 admin center, open Users, Active users, this person, Mail, "Manage email apps", and tick "Authenticated SMTP".`;
  }
  if (/AADSTS65001|consent/i.test(msg)) return `${msg} Fix: an admin needs to grant consent for the app in the Azure portal (App registrations, API permissions, "Grant admin consent").`;
  if (/AADSTS7000215|AADSTS7000222|client secret/i.test(msg)) return `${msg} Fix: the MICROSOFT_CLIENT_SECRET in Railway is wrong or expired; make a new one in the Azure portal.`;
  if (/AADSTS50011|redirect/i.test(msg)) return `${msg} Fix: add this site's /oauth/microsoft/callback address under Authentication in the Azure portal.`;
  if (/535.*5\.7\.8|BadCredentials/i.test(msg)) return `${msg} For Google, use an app password, not the normal one.`;
  return msg;
}
