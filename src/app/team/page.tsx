import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { hashPassword, requireOwner } from '@/lib/auth';
import { query } from '@/lib/db';
import ActionForm from '../ActionForm';
import { setCommission } from '../sales/actions';

export const dynamic = 'force-dynamic';

async function addMember(formData: FormData): Promise<{ error?: string }> {
  'use server';
  await requireOwner();
  const name = String(formData.get('name') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  const errors: string[] = [];
  if (!name) errors.push('Name is required.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.push('Enter a valid email.');
  if (password.length < 10) errors.push('Temporary password must be at least 10 characters.');
  if (!errors.length) {
    const taken = await query('SELECT 1 FROM users WHERE email = $1', [email]);
    if (taken.rowCount) errors.push('Someone already uses that email.');
  }
  if (errors.length) return { error: errors.join(' ') };
  await query("INSERT INTO users (email, name, password_hash, role) VALUES ($1, $2, $3, 'team')", [email, name, await hashPassword(password)]);
  revalidatePath('/team');
  redirect('/team?saved=1');
}

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  await requireOwner();
  const { saved } = await searchParams;
  const { rows } = await query<{ id: number; name: string; email: string; role: string; commission_percent: number }>(
    "SELECT id, name, email, role, commission_percent FROM users ORDER BY role = 'owner' DESC, name",
  );
  return (
    <>
      <h1>Team</h1>
      <p className="sub">Team members can run clients and record baselines. Only owners see deal terms and money.</p>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Commission (% of what we earn on their customers)</th></tr></thead>
          <tbody>{rows.map((u) => (
            <tr key={u.id}>
              <td>{u.name}</td><td>{u.email}</td><td>{u.role}</td>
              <td>
                <ActionForm className="inline-form" action={setCommission.bind(null, u.id)}>
                  <input name="commission_percent" inputMode="decimal" defaultValue={u.commission_percent} aria-label={`Commission for ${u.name}`} style={{ width: 80 }} />
                  <button type="submit" className="secondary small">Save</button>
                </ActionForm>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <section className="card">
        <h2>Add a team member</h2>
        {saved && <p className="notice" role="status">Team member added. Send them the temporary password privately.</p>}
        <ActionForm className="grid" action={addMember}>
          <label>Name<input name="name" required /></label>
          <label>Email<input name="email" type="email" required /></label>
          <label>Temporary password<input name="password" type="text" minLength={10} required autoComplete="off" /></label>
          <div className="actions full"><button type="submit">Add team member</button></div>
        </ActionForm>
      </section>
    </>
  );
}
