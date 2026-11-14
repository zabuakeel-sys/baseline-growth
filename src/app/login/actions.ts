'use server';
import { redirect } from 'next/navigation';
import { startSession, verifyLogin } from '@/lib/auth';

export async function login(_prev: { error?: string; email?: string }, formData: FormData): Promise<{ error?: string; email?: string }> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  const user = await verifyLogin(email, password);
  if (!user) return { error: 'That email and password do not match.', email };
  await startSession(user.id);
  // The owner lands on the Overview console; a salesperson lands on Today, their work queue.
  redirect(user.role === 'owner' ? '/' : '/next');
}
