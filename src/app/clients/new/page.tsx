import Link from 'next/link';
import { requireOwner } from '@/lib/auth';
import { query } from '@/lib/db';
import { coachConfigured } from '@/lib/coach';
import { PLAYS } from '@/lib/plays';
import { applyPlayToDraft, readWebsite, saveOnboarding } from '../onboarding';
import OnboardingForm from '../OnboardingForm';
import ActionForm from '../../ActionForm';

export const dynamic = 'force-dynamic';

/** Adding a business: read their website, pick a strategy, then confirm answers and approve the email. */
export default async function NewClientPage({ searchParams }: { searchParams: Promise<{ draft?: string; manual?: string }> }) {
  await requireOwner();
  const { draft: draftId, manual } = await searchParams;
  const terms = (await query<{ default_terms: Record<string, string> | null }>('SELECT default_terms FROM outreach_settings WHERE id = 1')).rows[0]?.default_terms ?? {};
  const draft = draftId && /^\d+$/.test(draftId)
    ? (await query<{ website: string; answers: Record<string, unknown>; filled: string[]; used_ai: boolean }>(
        'SELECT website, answers, filled, used_ai FROM onboarding_drafts WHERE id = $1', [Number(draftId)])).rows[0]
    : undefined;

  // Step 1: no website read yet and not going by hand -> ask for the website.
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

  // Step 2: website read but no strategy picked yet -> pick a play. It fills the goal, rhythm and email.
  if (draft && !draft.answers?.play) {
    const name = String(draft.answers?.name ?? 'this business');
    return (
      <>
        <p><Link href="/clients/new">Start over</Link></p>
        <h1>Pick a strategy for {name}</h1>
        <p className="sub">
          This sets the goal, the call/email/visit rhythm, and writes the first email, all from their name. You tweak and approve the email on the next step, and you can change any of it later.
        </p>
        <div className="play-grid">
          {PLAYS.map((p) => (
            <ActionForm key={p.key} action={applyPlayToDraft.bind(null, Number(draftId), p.key)}>
              <section className="card play-card">
                <h2 style={{ margin: '0 0 4px', fontSize: 17 }}>{p.name}</h2>
                <p className="muted" style={{ margin: '0 0 8px', fontSize: 13 }}>{p.best_for}</p>
                <p style={{ margin: '0 0 12px', fontSize: 14 }}><strong>Rhythm:</strong> {p.rhythm}</p>
                <button type="submit" className="secondary">Use this strategy</button>
              </section>
            </ActionForm>
          ))}
        </div>
        <p className="muted" style={{ fontSize: 13 }}>
          Not sure? <strong>Claim a free listing</strong> suits marketplaces and apps, <strong>Book a free walkthrough</strong> suits local services that quote on site, and <strong>Request a free quote</strong> suits anything you can price without a visit.
        </p>
      </>
    );
  }

  // Step 3 (and the by-hand path): confirm the answers and approve the email.
  const answers = { ...terms, ...(draft?.answers ?? {}) };
  return (
    <>
      <p><Link href={draft ? '/clients/new' : '/clients'}>{draft ? 'Start over' : 'Back to businesses'}</Link></p>
      <h1>Add a business</h1>
      {draft ? (
        <p className="notice" role="status">
          Read {draft.website}: filled {draft.filled.length} answer{draft.filled.length === 1 ? '' : 's'}
          {draft.used_ai ? '' : ' (AI is not connected, so only the facts on the page)'}. Check each one, then review the first email at the bottom and set it up.
        </p>
      ) : <p className="sub">Answer these with the owner, pick a strategy, and review the first email. The system builds their searches and starts finding prospects for your reps.</p>}
      <OnboardingForm action={saveOnboarding.bind(null, null)} editing={false} answers={answers} filled={draft?.filled} fromSite={Boolean(draft)} />
    </>
  );
}
