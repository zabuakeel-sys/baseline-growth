import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { getClient } from '@/lib/clients';
import { saveOnboarding } from '../../onboarding';
import OnboardingForm from '../../OnboardingForm';

export const dynamic = 'force-dynamic';

export default async function SetupPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const found = await getClient(id);
  if (!found) notFound();
  const { client } = found;
  // Businesses added before onboarding existed start from their saved fields.
  const answers = (client.onboarding as Record<string, unknown> | null) ?? {
    name: client.name, website: client.website, contact_name: client.contact_name, contact_email: client.contact_email,
    contact_phone: client.contact_phone, offer: client.offer, mailing_address: client.mailing_address, claim_url: client.claim_url,
  };
  return (
    <>
      <p><Link href={`/clients/${id}`}>Back to {client.name}</Link></p>
      <h1>{client.name}: answers</h1>
      <p className="sub">Change any answer. New customer types or places add new searches; existing ones are kept.</p>
      <OnboardingForm action={saveOnboarding.bind(null, id)} answers={answers} editing />
    </>
  );
}
