import Link from 'next/link';
import type { Lead } from '@/lib/leads';
import { LOST_REASONS, SCHEDULE_DAYS, STATUSES, messageFor, nextDue } from '@/lib/followup';
import { formatCents } from '@/lib/money';
import { closeLead, markReplied, markSent, reopenLead } from './actions';
import ActionForm from '../ActionForm';
import CopyButton from './CopyButton';

const shortDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** One inquiry with its next message ready to send and the buttons to move it along. */
export default function LeadCard({ lead, back, senderName, today, showClient }: {
  lead: Lead; back: string; senderName: string; today: string; showClient: boolean;
}) {
  const open = lead.status === 'new' || lead.status === 'following_up';
  const touch = lead.touches_sent;
  const due = open ? nextDue(lead.received_on, touch) : null;
  const message = open && touch < SCHEDULE_DAYS.length
    ? messageFor(touch, { leadName: lead.name, clientName: lead.client_name, need: lead.need, senderName })
    : '';
  const subject = `${lead.client_name}: your inquiry`;
  const late = due !== null && due < today;

  return (
    <article className="lead">
      <header className="lead-head">
        <div>
          <strong>{lead.name}</strong>
          {showClient && <> · <Link href={`/clients/${lead.client_id}#leads-h`}>{lead.client_name}</Link></>}
          <div className="task-meta">
            Came in {shortDate(lead.received_on)}{lead.source ? ` by ${lead.source.toLowerCase()}` : ''}
            {lead.assignee_name ? ` · ${lead.assignee_name}` : ''}
          </div>
        </div>
        <span className={`pill ${lead.status === 'won' ? 'signed' : lead.status === 'lost' ? 'ended' : late ? 'late' : ''}`}>
          {lead.status === 'won' && lead.won_value_cents ? `Won ${formatCents(lead.won_value_cents)}`
            : lead.status === 'lost' ? `Lost: ${lead.lost_reason.toLowerCase()}` : STATUSES[lead.status]}
        </span>
      </header>
      {lead.need && <p className="lead-need">{lead.need}</p>}
      <p className="task-meta" style={{ margin: '4px 0' }}>
        {lead.phone && <a href={`tel:${lead.phone.replace(/[^\d+]/g, '')}`}>{lead.phone}</a>}
        {lead.phone && lead.email && ' · '}
        {lead.email && <a href={`mailto:${lead.email}`}>{lead.email}</a>}
      </p>

      {message && (
        <div className="lead-next">
          <div className="task-meta">
            {touch === 0 ? 'First reply' : `Follow-up ${touch} of ${SCHEDULE_DAYS.length - 1}`}
            {due && <span className={late ? 'late' : ''}> · {late ? `late, was due ${shortDate(due)}` : due === today ? 'due today' : `due ${shortDate(due)}`}</span>}
          </div>
          <pre className="message">{message}</pre>
          <div className="actions">
            <CopyButton text={message} />
            {lead.email && (
              <a className="button secondary" href={`mailto:${lead.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`}>Open in email</a>
            )}
            {lead.phone && (
              <a className="button secondary" href={`sms:${lead.phone.replace(/[^\d+]/g, '')}?&body=${encodeURIComponent(message)}`}>Open in texts</a>
            )}
            <form action={markSent.bind(null, lead.id, back)}><button type="submit">I sent it</button></form>
          </div>
        </div>
      )}
      {open && touch >= SCHEDULE_DAYS.length && (
        <p className="task-meta"><strong>Every follow-up was sent with no reply.</strong> Mark it lost, or keep it open if you are still talking.</p>
      )}

      <div className="actions lead-actions">
        {open && <form action={markReplied.bind(null, lead.id, back)}><button type="submit" className="secondary">They replied</button></form>}
        {lead.status !== 'won' && lead.status !== 'lost' && (
          <details>
            <summary>Won or lost</summary>
            <ActionForm className="grid" action={closeLead.bind(null, lead.id, back)}>
              <label>Outcome
                <select name="outcome" defaultValue="">
                  <option value="" disabled>Pick one</option>
                  <option value="won">Won</option>
                  <option value="lost">Lost</option>
                </select>
              </label>
              <label>If won: sale value ($)<input name="won_value" inputMode="decimal" placeholder="1200" /></label>
              <label>If lost: why
                <select name="lost_reason" defaultValue="">
                  <option value="">Pick a reason</option>
                  {LOST_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
              <div className="actions full"><button type="submit">Save outcome</button></div>
            </ActionForm>
          </details>
        )}
        {(lead.status === 'won' || lead.status === 'lost' || lead.status === 'talking') && (
          <form action={reopenLead.bind(null, lead.id, back)}><button type="submit" className="secondary">Back to follow-up</button></form>
        )}
      </div>
    </article>
  );
}
