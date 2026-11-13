import Link from 'next/link';
import { requireOwner } from '@/lib/auth';
import { query } from '@/lib/db';
import { coachConfigured } from '@/lib/coach';
import { readWebsite, saveOnboarding } from '../onboarding';
import OnboardingForm from '../OnboardingForm';
import ActionForm from '../../ActionForm';

export const dynamic = 'force-dynamic';

/** Adding a business: read their website first, then ask the owner only what a website cannot say. */
export default async function NewClientPage({ searchParams }: { searchParams: Promise<{ draft?: string; manual?: string }> }) {
  await requireOwner();
  const { draft: draftId, manual } = await searchParams;
  const terms = (await query<{ default_terms: Record<string, string> | null }>('SELECT default_terms FROM outreach_settings WHERE id = 1')).rows[0]?.default_terms ?? {};
  const draft = draftId && /^\d+$/.test(draftId)
    ? (await query<{ website: string; answers: Record<string, unknown>; filled: string[]; used_ai: boolean }>(
        'SELECT website, answers, filled, used_ai FROM onboarding_drafts WHERE id = $1', [Number(draftId)])).rows[0]
    : undefined;

  if (!draft && manual !== '1') {
    return (
      <>
        <p><Link href="/clients">Back to businesses</Link></p>
        <h1>Add a business</h1>
        <p className="sub">Start with their website. The system reads it and fills in what it can; you only ask the owner the rest.</p>
        <section className="card">
          <ActionForm className="inline-form" action={readWebsite}>
            <label style={{ flex: 1 }}>Their website<input name="website" placeholder="shinecleaning.com" autoFocus /></label>
            <button type="submit" style={{ alignSelf: 'flex-end' }}>Read their website</button>
          </ActionForm>
          <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>
            {coachConfigured()
              ? 'Takes about 30 seconds. AI drafts their offer, reasons customers pick them, customer types, areas served and common objections; it also picks up their logo, phone and booking link.'
              : 'AI is not connected (no ANTHROPIC_API_KEY), so only their name, logo, phone and booking link are read; the rest you type.'}
            {' '}<Link href="/clients/new?manual=1">No website? Fill it in by hand</Link>
          </p>
        </section>
      </>
    );
  }
  const answers = { ...terms, ...(draft?.answers ?? {}) };
  return (
    <>
      <p><Link href="/clients/new">Start over</Link></p>
      <h1>Add a business</h1>
      {draft ? (
        <p className="notice" role="status">
          Read {draft.website}: filled {draft.filled.length} answer{draft.filled.length === 1 ? '' : 's'}
          {draft.used_ai ? '' : ' (AI is not connected, so only the facts on the page)'}. Check each one marked &quot;From their website&quot;.
        </p>
      ) : <p className="sub">Answer these with the owner. The system builds their searches, script and outreach, and starts finding prospects for your reps.</p>}
      <OnboardingForm action={saveOnboarding.bind(null, null)} editing={false} answers={answers} filled={draft?.filled} fromSite={Boolean(draft)} />
    </>
  );
}
