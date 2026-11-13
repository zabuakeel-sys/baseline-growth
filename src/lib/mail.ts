// The outreach mailbox: sending over SMTP and reading replies over IMAP.
// Configured entirely by environment variables, so no password is ever stored in the database:
//   OUTREACH_FROM   e.g. "Zaino <zaino@getbaselinegrowth.com>"  (a separate outreach domain)
//   SMTP_HOST, SMTP_PORT (465), SMTP_USER, SMTP_PASS, SMTP_SECURE ("true" for port 465)
//   IMAP_HOST, IMAP_PORT (993), IMAP_USER, IMAP_PASS, IMAP_SECURE ("true" for port 993)
import { randomUUID } from 'node:crypto';
import nodemailer, { type Transporter } from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

const env = (k: string) => process.env[k] ?? '';
const secure = (k: string, port: number) => (env(k) ? env(k) === 'true' : port === 465 || port === 993);

export function mailStatus() {
  const send = Boolean(env('OUTREACH_FROM') && env('SMTP_HOST') && env('SMTP_USER') && env('SMTP_PASS'));
  const read = Boolean(env('IMAP_HOST') && env('IMAP_USER') && env('IMAP_PASS'));
  return { send, read, from: env('OUTREACH_FROM') };
}

let transport: Transporter | null = null;
function smtp() {
  if (!transport) {
    const port = Number(env('SMTP_PORT') || 465);
    transport = nodemailer.createTransport({
      host: env('SMTP_HOST'), port, secure: secure('SMTP_SECURE', port),
      auth: { user: env('SMTP_USER'), pass: env('SMTP_PASS') },
      // Plain local test servers have no certificate; real ones always do.
      tls: env('MAIL_ALLOW_SELF_SIGNED') === '1' ? { rejectUnauthorized: false } : undefined,
    });
  }
  return transport;
}

const fromDomain = () => (env('OUTREACH_FROM').match(/@([^>\s]+)/)?.[1] ?? 'localhost').toLowerCase();

/** Sends a plain-text email; returns the Message-ID we gave it, so replies can be matched. */
export async function sendMail(m: { to: string; subject: string; text: string; inReplyTo?: string | null; cc?: string }) {
  const messageId = `<${randomUUID()}@${fromDomain()}>`;
  await smtp().sendMail({
    from: env('OUTREACH_FROM'), to: m.to, cc: m.cc, subject: m.subject, text: m.text, messageId,
    ...(m.inReplyTo ? { inReplyTo: m.inReplyTo, references: m.inReplyTo } : {}),
  });
  return messageId;
}

export type Incoming = {
  messageId: string; inReplyTo: string; references: string[]; from: string; subject: string;
  text: string; headers: Record<string, string>; date: Date;
};

/** Reads every unread message in the inbox and marks it read. */
export async function fetchUnread(): Promise<Incoming[]> {
  const port = Number(env('IMAP_PORT') || 993);
  const client = new ImapFlow({
    host: env('IMAP_HOST'), port, secure: secure('IMAP_SECURE', port),
    auth: { user: env('IMAP_USER'), pass: env('IMAP_PASS') },
    logger: false,
    tls: env('MAIL_ALLOW_SELF_SIGNED') === '1' ? { rejectUnauthorized: false } : undefined,
  });
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
          messageId: p.messageId ?? `<no-id-${msg.uid}@inbox>`,
          inReplyTo: p.inReplyTo ?? '',
          references: refs,
          from: p.from?.text ?? '',
          subject: p.subject ?? '',
          text: (p.text ?? '').slice(0, 20_000),
          headers,
          date: p.date ?? new Date(),
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
