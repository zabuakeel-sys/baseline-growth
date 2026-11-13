// Encrypts mailbox passwords before they reach the database. The key comes from APP_SECRET, a
// long random value kept only in the server's environment, so a copy of the database alone does
// not reveal any password.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export const secretConfigured = () => (process.env.APP_SECRET ?? '').length >= 32;

const key = () => {
  if (!secretConfigured()) throw new Error('APP_SECRET is not set (32+ characters), so passwords cannot be stored safely.');
  return createHash('sha256').update(process.env.APP_SECRET as string).digest();
};

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':');
}

export function decrypt(sealed: string): string {
  const [v, iv, tag, data] = sealed.split(':');
  if (v !== 'v1' || !iv || !tag || !data) throw new Error('Unreadable stored password.');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}
