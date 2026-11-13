import type { Client } from '@/lib/clients';
import { sampleFirstEmail } from '@/lib/setup';
import { approveOutreach, pauseOutreach } from './outreach';
import ActionForm from '../ActionForm';

/** Read the first email once; approving it turns on sending for this business. */
export default async function ApprovePanel({ client, back }: { client: Client; back: string }) {
  const email = await sampleFirstEmail(client);
  if (client.outreach_approved_at) {
    return (
      <div className="actions">
        <span className="pill signed">Sending on its own</span>
        <ActionForm action={pauseOutreach.bind(null, client.id, back)}><button type="submit" className="secondary small">Pause and approve each email</button></ActionForm>
      </div>
    );
  }
  return (
    <div>
      <p className="muted" style={{ margin: '0 0 6px' }}>
        {email.real ? `The first email queued (to ${email.lead_name}).` : 'A sample of the first email.'} Every prospect gets this, with their name,
        and with a personal first line when the AI finds something specific. Follow-ups are shorter. Change the wording by editing the offer in the answers.
      </p>
      <div className="lead-next">
        <div className="task-meta">Subject: {email.subject}</div>
        <pre className="message">{email.body}</pre>
      </div>
      <div className="actions" style={{ marginTop: 10 }}>
        <ActionForm action={approveOutreach.bind(null, client.id, back)}><button type="submit">Looks good, start sending</button></ActionForm>
      </div>
    </div>
  );
}
