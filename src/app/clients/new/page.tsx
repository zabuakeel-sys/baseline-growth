import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { createClient } from '../actions';
import ClientForm from '../ClientForm';

export default async function NewClientPage() {
  const user = await requireUser();
  return (
    <>
      <p><Link href="/">Back to clients</Link></p>
      <h1>Add a client</h1>
      <p className="sub">Add the business now; record its baseline on the next screen.</p>
      <div className="card">
        <ClientForm action={createClient} showTerms={user.role === 'owner'} submitLabel="Add client" />
      </div>
    </>
  );
}
