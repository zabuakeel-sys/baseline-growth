import Link from 'next/link';
import { requireOwner } from '@/lib/auth';
import { saveOnboarding } from '../onboarding';
import OnboardingForm from '../OnboardingForm';

export default async function NewClientPage() {
  await requireOwner();
  return (
    <>
      <p><Link href="/">Back to clients</Link></p>
      <h1>Add a business</h1>
      <p className="sub">Answer these with the owner. The system builds their searches, script and outreach, and starts finding prospects for your reps.</p>
      <OnboardingForm action={saveOnboarding.bind(null, null)} editing={false} />
    </>
  );
}
