// "Connect with Microsoft": OAuth for Microsoft 365 mailboxes, which no longer accept passwords
// from outside apps. Uses the app registration in MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET /
// MICROSOFT_TENANT_ID. Sending (SMTP) and reading (IMAP) then sign in with a short-lived access
// token, refreshed from the stored (encrypted) refresh token.
// MICROSOFT_LOGIN_URL exists only so tests can point at a stand-in.

export const MS_SCOPES = [
  'openid', 'email', 'offline_access',
  'https://outlook.office.com/SMTP.Send',
  'https://outlook.office.com/IMAP.AccessAsUser.All',
].join(' ');

const env = (k: string) => process.env[k] ?? '';
export const microsoftConfigured = () => Boolean(env('MICROSOFT_CLIENT_ID') && env('MICROSOFT_CLIENT_SECRET'));
const base = () => `${(env('MICROSOFT_LOGIN_URL') || 'https://login.microsoftonline.com').replace(/\/$/, '')}/${env('MICROSOFT_TENANT_ID') || 'organizations'}/oauth2/v2.0`;

/** The address Microsoft sends people back to. Must match the one added in the Azure portal. */
export function redirectUri(requestUrl: string) {
  const domain = env('RAILWAY_PUBLIC_DOMAIN');
  const origin = domain ? `https://${domain}` : new URL(requestUrl).origin;
  return `${origin}/oauth/microsoft/callback`;
}

export function authorizeUrl(state: string, redirect: string, loginHint = '') {
  const p = new URLSearchParams({
    client_id: env('MICROSOFT_CLIENT_ID'), response_type: 'code', redirect_uri: redirect, response_mode: 'query',
    scope: MS_SCOPES, state, prompt: 'select_account',
  });
  if (loginHint) p.set('login_hint', loginHint);
  return `${base()}/authorize?${p}`;
}

type TokenResponse = { access_token: string; refresh_token?: string; expires_in: number; id_token?: string; error?: string; error_description?: string };

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`${base()}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env('MICROSOFT_CLIENT_ID'), client_secret: env('MICROSOFT_CLIENT_SECRET'), ...body }),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !json.access_token) {
    // Microsoft's description starts with a code like AADSTS65001; the first line is the useful part.
    throw new Error(`Microsoft sign-in failed: ${(json.error_description || json.error || `HTTP ${res.status}`).split(/\r?\n/)[0]}`);
  }
  return json;
}

/** Exchanges the code from the sign-in page for tokens, and reads who signed in. */
export async function exchangeCode(code: string, redirect: string) {
  const t = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirect, scope: MS_SCOPES });
  if (!t.refresh_token) throw new Error('Microsoft did not return a refresh token (offline_access permission missing).');
  // The ID token came straight from Microsoft over TLS, so reading its claims without re-verifying is safe here.
  let email = '';
  let name = '';
  try {
    const claims = JSON.parse(Buffer.from(String(t.id_token).split('.')[1], 'base64url').toString('utf8'));
    email = String(claims.email || claims.preferred_username || claims.upn || '').toLowerCase();
    name = String(claims.name || '');
  } catch { /* handled below */ }
  if (!email.includes('@')) throw new Error('Could not read which mailbox signed in.');
  return { email, name, refreshToken: t.refresh_token };
}

const cache = new Map<string, { token: string; until: number }>();

/**
 * A current access token for a connected mailbox. Microsoft may hand back a new refresh token;
 * `onNewRefresh` stores it so the connection keeps working.
 */
export async function accessToken(key: string, refreshToken: string, onNewRefresh: (t: string) => Promise<void>) {
  const hit = cache.get(key);
  if (hit && hit.until > Date.now() + 60_000) return hit.token;
  const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken, scope: MS_SCOPES });
  cache.set(key, { token: t.access_token, until: Date.now() + t.expires_in * 1000 });
  if (t.refresh_token && t.refresh_token !== refreshToken) await onNewRefresh(t.refresh_token);
  return t.access_token;
}
