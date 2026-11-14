import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { authorizeUrl, microsoftConfigured, redirectUri } from '@/lib/msoauth';
import { secretConfigured } from '@/lib/secret';

/** Sends the owner to Microsoft to sign in to a business's mailbox. */
export async function GET(request: Request) {
  const user = await currentUser();
  const url = new URL(request.url);
  const clientId = Number(url.searchParams.get('client'));
  if (!user || user.role !== 'owner') return NextResponse.redirect(new URL('/login', request.url));
  if (!Number.isInteger(clientId) || clientId <= 0) return NextResponse.redirect(new URL('/clients', request.url));
  const back = (msg: string) => NextResponse.redirect(new URL(`/clients/${clientId}/settings?saved=${encodeURIComponent(msg)}#mailbox-h`, request.url));
  if (!microsoftConfigured()) return back('Microsoft sign-in is not set up yet: MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET are missing in Railway');
  if (!secretConfigured()) return back('APP_SECRET is not set, so the connection cannot be stored safely');
  const state = randomBytes(24).toString('base64url');
  const res = NextResponse.redirect(authorizeUrl(state, redirectUri(request.url), url.searchParams.get('hint') ?? ''));
  // The state ties Microsoft's answer to this browser and this business (protects against forged callbacks).
  res.cookies.set('ms_oauth', `${state}.${clientId}`, { httpOnly: true, secure: url.protocol === 'https:', sameSite: 'lax', maxAge: 600, path: '/oauth/microsoft' });
  return res;
}
