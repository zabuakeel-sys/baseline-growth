// Sending and reading a Microsoft 365 mailbox through Microsoft Graph with the app's own access
// ("application permissions", the same access Kacity uses): no one signs in and no mailbox
// password is needed. Uses MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET / MICROSOFT_TENANT_ID.
// Needs the app to have Mail.Send (to send) and Mail.Read or Mail.ReadWrite (to read replies),
// granted by an admin once; Microsoft lists what was granted in the token's "roles".
// MICROSOFT_GRAPH_URL / MICROSOFT_LOGIN_URL exist only so tests can point at stand-ins.
import { randomUUID } from 'node:crypto';
import type { Incoming } from './mail';

const env = (k: string) => process.env[k] ?? '';
const login = () => `${(env('MICROSOFT_LOGIN_URL') || 'https://login.microsoftonline.com').replace(/\/$/, '')}/${env('MICROSOFT_TENANT_ID')}/oauth2/v2.0/token`;
const graph = () => `${(env('MICROSOFT_GRAPH_URL') || 'https://graph.microsoft.com').replace(/\/$/, '')}/v1.0`;
export const graphConfigured = () => Boolean(env('MICROSOFT_CLIENT_ID') && env('MICROSOFT_CLIENT_SECRET') && env('MICROSOFT_TENANT_ID'));

let cached: { token: string; roles: string[]; until: number } | null = null;

/** The app's own access token, and the permissions (roles) Microsoft granted it. */
export async function appAccess(fresh = false) {
  if (!fresh && cached && cached.until > Date.now() + 60_000) return cached;
  const res = await fetch(login(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env('MICROSOFT_CLIENT_ID'), client_secret: env('MICROSOFT_CLIENT_SECRET'),
      grant_type: 'client_credentials', scope: 'https://graph.microsoft.com/.default',
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const j = await res.json().catch(() => ({})) as { access_token?: string; expires_in?: number; error_description?: string; error?: string };
  if (!res.ok || !j.access_token) throw new Error(`Microsoft refused the app: ${(j.error_description || j.error || `HTTP ${res.status}`).split(/\r?\n/)[0]}`);
  let roles: string[] = [];
  try { roles = JSON.parse(Buffer.from(j.access_token.split('.')[1], 'base64url').toString('utf8')).roles ?? []; } catch { /* no roles */ }
  cached = { token: j.access_token, roles, until: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return cached;
}

async function call(path: string, init: RequestInit & { json?: unknown } = {}) {
  const { token } = await appAccess();
  const res = await fetch(`${graph()}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'outlook.body-content-type="text"', ...(init.headers ?? {}) },
    body: init.json === undefined ? init.body : JSON.stringify(init.json),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({})) as { error?: { code?: string; message?: string } };
    throw new Error(`Microsoft Graph ${res.status}: ${j.error?.code ?? ''} ${j.error?.message ?? ''}`.trim());
  }
  return res.status === 202 || res.status === 204 ? null : res.json();
}

const box = (mailbox: string) => `/users/${encodeURIComponent(mailbox)}`;
const recipients = (list: string) => list.split(',').map((s) => s.trim()).filter(Boolean).map((a) => {
  const m = a.match(/<([^>]+)>/);
  return { emailAddress: { address: (m ? m[1] : a).trim() } };
});

/** What this app may do with this mailbox: checked against Microsoft, not guessed. */
export async function checkMailbox(mailbox: string) {
  const { roles } = await appAccess(true); // an admin may have just changed the permissions
  const canSend = roles.includes('Mail.Send');
  const canWrite = roles.includes('Mail.ReadWrite');
  const canRead = canWrite || roles.includes('Mail.Read');
  // Make sure the mailbox exists and the app may open it (an admin can limit apps to some mailboxes).
  if (canRead) await call(`${box(mailbox)}/mailFolders/inbox?$select=id`);
  return { roles, canSend, canRead, canWrite };
}

/** Sends as the mailbox. Keeps replies in the same thread when the original can be found. Returns the Message-ID. */
export async function graphSend(mailbox: string, m: { to: string; subject: string; text: string; html?: string; inReplyTo?: string | null; cc?: string }) {
  const { roles } = await appAccess();
  const body = { contentType: m.html ? 'HTML' : 'Text', content: m.html ?? m.text };
  const message = { subject: m.subject, body, toRecipients: recipients(m.to), ...(m.cc ? { ccRecipients: recipients(m.cc) } : {}) };
  if (roles.includes('Mail.ReadWrite')) {
    // Draft then send: lets us learn the Message-ID (to match replies) and reply in-thread.
    let draft: { id: string } | null = null;
    if (m.inReplyTo) {
      const found = await call(`${box(mailbox)}/messages?$filter=${encodeURIComponent(`internetMessageId eq '${m.inReplyTo.replace(/'/g, "''")}'`)}&$select=id&$top=1`) as { value: { id: string }[] };
      if (found.value[0]) {
        draft = await call(`${box(mailbox)}/messages/${found.value[0].id}/createReply`, { method: 'POST', json: {} }) as { id: string };
        await call(`${box(mailbox)}/messages/${draft.id}`, { method: 'PATCH', json: message });
      }
    }
    draft ??= await call(`${box(mailbox)}/messages`, { method: 'POST', json: message }) as { id: string };
    const sent = await call(`${box(mailbox)}/messages/${draft.id}?$select=internetMessageId`) as { internetMessageId: string };
    await call(`${box(mailbox)}/messages/${draft.id}/send`, { method: 'POST' });
    return sent.internetMessageId;
  }
  // Send-only access: Microsoft picks the Message-ID; replies are matched by the sender's address.
  await call(`${box(mailbox)}/sendMail`, { method: 'POST', json: { message, saveToSentItems: true } });
  return `<graph-${randomUUID()}@${mailbox.split('@')[1] ?? 'mailbox'}>`;
}

type GraphMessage = {
  id: string; internetMessageId?: string; subject?: string; receivedDateTime?: string; isRead?: boolean;
  from?: { emailAddress?: { address?: string; name?: string } }; body?: { content?: string };
  internetMessageHeaders?: { name: string; value: string }[];
};

/** Unread inbox mail (the last 3 days), marked read afterwards when allowed. */
export async function graphFetchUnread(mailbox: string): Promise<Incoming[]> {
  const { roles } = await appAccess();
  const since = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const list = await call(`${box(mailbox)}/mailFolders/inbox/messages?$filter=${encodeURIComponent(`isRead eq false and receivedDateTime ge ${since}`)}&$top=50`
    + '&$select=id,internetMessageId,subject,receivedDateTime,from,body,internetMessageHeaders') as { value: GraphMessage[] };
  const out: Incoming[] = [];
  for (const g of list.value) {
    const headers: Record<string, string> = {};
    for (const h of g.internetMessageHeaders ?? []) headers[h.name.toLowerCase()] = h.value;
    const from = g.from?.emailAddress;
    out.push({
      messageId: g.internetMessageId ?? `<graph-${g.id}@inbox>`,
      inReplyTo: headers['in-reply-to'] ?? '',
      references: (headers.references ?? '').split(/\s+/).filter(Boolean),
      from: from?.name ? `${from.name} <${from.address}>` : from?.address ?? '',
      subject: g.subject ?? '',
      text: (g.body?.content ?? '').slice(0, 20_000),
      headers,
      date: g.receivedDateTime ? new Date(g.receivedDateTime) : new Date(),
    });
    if (roles.includes('Mail.ReadWrite')) await call(`${box(mailbox)}/messages/${g.id}`, { method: 'PATCH', json: { isRead: true } }).catch(() => {});
  }
  return out;
}
