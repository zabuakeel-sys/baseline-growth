import type { Client } from '@/lib/clients';
import { starterEmail } from '@/lib/setup';
import { approveOutreach, pauseOutreach, resetOutreachEmail, saveOutreachEmail } from './outreach';
import ActionForm from '../ActionForm';

/**
 * Write and perfect the first email, then (separately) start sending. Nothing goes out until the
 * owner is happy and explicitly turns sending on.
 */
export default async function ApprovePanel({ client, back }: { client: Client; back: string }) {
  const draft = await starterEmail(client);
  const live = Boolean(client.outreach_approved_at);
  const ready = Boolean(client.outreach_subject.trim() && client.outreach_body.trim());

  return (
    <div>
      <p className="muted" style={{ marginTop: 0 }}>
        This is the <strong>first</strong> email every prospect gets (not a follow-up). Edit it until it is exactly right.
        These placeholders fill in for each shop: <code>[First name]</code>, <code>[Shop Name]</code>, <code>[City]</code>,{' '}
        <code>[{client.name}]</code>, and a claim link (write <code>[claim your free account]</code> and it becomes your booking link).
        You can sign off however you like. If you leave out the opt-out line and mailing address, they are added automatically for you
        (US law requires them); if you write <code>[Unsubscribe]</code> or <code>[Business mailing address]</code>, those fill in instead.
        Follow-ups are shorter and go out on their own.
        {draft.source === 'ai' && ' This starting draft was written by AI from your answers and goal; make it yours.'}
      </p>

      <ActionForm action={saveOutreachEmail.bind(null, client.id, back)}>
        <label>Subject<input name="subject" defaultValue={draft.subject} /></label>
        <label>Email<textarea name="body" defaultValue={draft.body} rows={12} style={{ fontFamily: 'inherit' }} /></label>
        <div className="actions">
          <button type="submit">Save email</button>
          {draft.source === 'saved' && (
            <ActionForm action={resetOutreachEmail.bind(null, client.id, back)}>
              <button type="submit" className="secondary small">Start over from an auto-written draft</button>
            </ActionForm>
          )}
        </div>
      </ActionForm>

      <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '16px 0' }} />

      {live ? (
        <div className="actions">
          <span className="pill signed">Sending is on</span>
          <ActionForm action={pauseOutreach.bind(null, client.id, back)}><button type="submit" className="secondary small">Pause sending</button></ActionForm>
        </div>
      ) : (
        <div>
          <p className="muted" style={{ margin: '0 0 8px' }}>
            {ready
              ? 'When this email is exactly how you want it, start sending. It goes to prospects on their schedule, and you can pause any time.'
              : 'Save the email above first. Then you can start sending.'}
          </p>
          <ActionForm action={approveOutreach.bind(null, client.id, back)}>
            <button type="submit" disabled={!ready}>Start sending to prospects</button>
          </ActionForm>
        </div>
      )}
    </div>
  );
}
