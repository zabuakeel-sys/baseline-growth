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
        This is the first email every prospect gets. Edit it until it is exactly right. Write <code>{'{first_name}'}</code> where
        their name should go, and it is filled in for each shop. The signature and the legal opt-out line are added automatically, so
        you do not need them here. Follow-ups are shorter and go out on their own schedule.
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
