import { notFound } from 'next/navigation';
import { query } from '@/lib/db';
import { APP_NAME } from '@/lib/config';
import { submitReferral } from './actions';
import ActionForm from '../../ActionForm';

export const dynamic = 'force-dynamic';

/** Public page a referral partner uses to send us a business. No login. */
export default async function ReferralPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ sent?: string }> }) {
  const { code } = await params;
  if (!/^[a-z0-9-]{4,40}$/i.test(code)) notFound();
  const p = (await query<{ name: string; client_name: string | null; active: boolean }>(
    'SELECT p.name, c.name AS client_name, p.active FROM partners p LEFT JOIN clients c ON c.id = p.client_id WHERE p.code = $1', [code])).rows[0];
  if (!p || !p.active || !p.client_name) notFound();
  const { sent } = await searchParams;
  return (
    <div className="login card" style={{ maxWidth: 520 }}>
      <p className="muted" style={{ margin: 0 }}>{APP_NAME} · referral from {p.name}</p>
      <h1>Know a business that could use {p.client_name}?</h1>
      {sent ? (
        <p className="notice" role="status">Thank you. We will reach out to them shortly. You can send another below.</p>
      ) : (
        <p className="sub">Tell us who they are and we will take it from there. Thank you for the introduction.</p>
      )}
      <ActionForm action={submitReferral.bind(null, code)}>
        <label>Business name<input name="name" required maxLength={200} /></label>
        <label>Person to talk to<input name="contact" maxLength={200} /></label>
        <label>Phone<input name="phone" type="tel" maxLength={40} /></label>
        <label>Email<input name="email" type="email" maxLength={200} /></label>
        <label>Anything we should know<textarea name="note" maxLength={1000} /></label>
        {/* Hidden from people; bots fill it in. */}
        <label className="hp" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
        <button type="submit">Send referral</button>
      </ActionForm>
    </div>
  );
}
