import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { query } from './db';

const COOKIE = 'bg_session';
const SESSION_DAYS = 30;

export type User = { id: number; email: string; name: string; role: 'owner' | 'team' };

// Only a hash of the token is stored, so a database leak does not hand out live sessions.
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export async function verifyLogin(email: string, password: string): Promise<User | null> {
  const { rows } = await query<User & { password_hash: string }>(
    'SELECT id, email, name, role, password_hash FROM users WHERE email = $1',
    [email.trim().toLowerCase()],
  );
  const row = rows[0];
  // Compare against a dummy hash when the user is unknown so timing does not reveal which emails exist.
  const ok = await bcrypt.compare(password, row?.password_hash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvali');
  if (!row || !ok) return null;
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

export async function startSession(userId: number) {
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await query('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)', [hashToken(token), userId, expires]);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
  jar.delete(COOKIE);
}

export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const { rows } = await query<User>(
    `SELECT u.id, u.email, u.name, u.role FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hashToken(token)],
  );
  return rows[0] ?? null;
}

export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect('/login');
  return user;
}

export async function requireOwner(): Promise<User> {
  const user = await requireUser();
  if (user.role !== 'owner') redirect('/');
  return user;
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}
