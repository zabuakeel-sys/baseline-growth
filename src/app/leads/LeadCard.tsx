import Link from 'next/link';
import type { Lead } from '@/lib/leads';
import { LOST_REASONS, SCHEDULE_DAYS, STATUSES, messageFor, nextDue } from '@/lib/followup';
import { markCustomer, markIntroduced, markLost, markOptedOut, markReplied, markSent, reopenLead } from './actions';
import ActionForm from '../ActionForm';
import CopyButton from './CopyButton';
import { handOverLead } from '../outbox/actions';
import { bestCallTime } from '@/lib/calltime';
import SalesTools from '../sales/SalesTools';

const shortDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** One prospect: the next message ready to send, and the buttons that move them along the pipeline. */
export default function LeadCard({ lead, back, senderName, today, showClient }: {
  lead: Lead; back: string; senderName: string; today: string; showClient: boolean;
}) {
  const reaching = lead.status === 'new' || lead.status === 'following_up';
  const closed = lead.status === 'won' || lead.status === 'lost' || lead.status === 'opted_out';
  const touch = lead.touches_sent;
  const due = reaching ? nextDue(lead.received_on, touch) : null;
  // Only prospects with an email get an email draft; phone-only ones are worked by calls and visits.
  const message = reaching && lead.email && touch < SCHEDULE_DAYS.length
    ? messageFor(touch, {
        leadName: lead.name, clientName: lead.client_name, offer: lead.client_offer,
        need: lead.need, senderName, address: lead.client_address,
      })
    : '';
  const subject = touch === 0 ? `Quick question from ${lead.client_name}` : `Re: Quick question from ${lead.client_name}`;
  const late = due !== null && due < today;
  const pillClass = lead.status === 'won' ? 'signed' : lead.status === 'introduced' ? 'active'
    : lead.status === 'lost' || lead.status === 'opted_out' ? 'ended' : late ? 'late' : '';

  return (
    <article className="lead">
      <header className="lead-head">
        <div>
          <strong>{lead.name}</strong>
          {showClient && <> · <Link href={`/clients/${lead.client_id}#leads-h`}>{lead.client_name}</Link></>}
          <div className="task-meta">
            Added {shortDate(lead.received_on)}{lead.source ? ` · ${lead.source}` : ''}
            {lead.assignee_name ? ` · ${lead.assignee_name}` : ''}
            {lead.introduced_on && ` · introduced ${shortDate(lead.introduced_on)}`}
            {lead.customer_since && ` · customer since ${shortDate(lead.customer_since)}`}
          </div>
        </div>
        <span className={`pill ${pillClass}`}>
          {lead.status === 'lost' ? `Lost: ${lead.lost_reason.toLowerCase()}` : STATUSES[lead.status]}
        </span>
      </header>
      {lead.need && <p className="lead-need">{lead.need}</p>}
      {lead.contact_name && (
        <p className="task-meta" style={{ margin: '4px 0' }}>Ask for <strong>{lead.contact_name}</strong>{lead.contact_title ? `, ${lead.contact_title}` : ''}</p>
      )}
      {lead.status !== 'opted_out' && (
        <p className="task-meta" style={{ margin: '4px 0' }}>
          {lead.phone && <a href={`tel:${lead.phone.replace(/[^\d+]/g, '')}`}>{lead.phone}</a>}
          {lead.phone && lead.email && ' · '}
          {lead.email && <a href={`mailto:${lead.email}`}>{lead.email}</a>}
        </p>
      )}
      {lead.phone && !closed && (
        <p className="task-meta" style={{ margin: '4px 0' }}>Best time to call: {bestCallTime({ name: lead.name, need: lead.need, notes: lead.notes }).when}</p>
      )}

      {lead.last_reply && lead.last_reply_kind !== 'bounce' && (
        <blockquote className="reply-text">
          <span className="task-meta">They wrote:</span>
          {lead.last_reply.split(/\n\s*On .+wrote:|\n>/)[0].trim().slice(0, 800)}
        </blockquote>
      )}
      {message && (lead.outbox_status === 'pending' || lead.outbox_status === 'approved') && (
        <p className="task-meta" style={{ margin: '8px 0' }}>
          {touch === 0 ? 'First email' : `Follow-up ${touch}`} is with <Link href="/outbox">automatic emailing</Link>
          {lead.outbox_status === 'pending' ? ', waiting for approval.' : ', approved; it goes out automatically.'}
        </p>
      )}
      {message && lead.outbox_status !== 'pending' && lead.outbox_status !== 'approved' && (
        <div className="lead-next">
          <div className="task-meta">
            {touch === 0 ? 'First message' : `Follow-up ${touch} of ${SCHEDULE_DAYS.length - 1}`}
            {due && <span className={late ? 'late' : ''}> · {late ? `late, was due ${shortDate(due)}` : due === today ? 'due today' : `due ${shortDate(due)}`}</span>}
          </div>
          {!lead.client_address && lead.email && (
            <p className="task-meta" style={{ margin: '6px 0 0' }}>
              Add a mailing address on the client page before emailing. Commercial email must include one.
            </p>
          )}
          <pre className="message">{message}</pre>
          <div className="actions">
            <CopyButton text={message} />
            {lead.email && (
              <a className="button secondary" href={`mailto:${lead.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`}>Open in email</a>
            )}
            <form action={markSent.bind(null, lead.id, back)}><button type="submit">I sent it</button></form>
          </div>
        </div>
      )}
      {reaching && touch >= SCHEDULE_DAYS.length && (
        <p className="task-meta"><strong>Every message was sent with no reply.</strong> Mark it lost, or keep going by phone.</p>
      )}

      {!closed && <SalesTools lead={lead} back={back} today={today} />}
      {!closed && (
        <div className="actions lead-actions">
          {reaching && <form action={markReplied.bind(null, lead.id, back)}><button type="submit" className="secondary">They replied</button></form>}
          {(lead.status === 'talking' || lead.status === 'following_up') && !lead.handed_over_at && (
            lead.client_contact_email
              ? <ActionForm action={handOverLead.bind(null, lead.id, back)}><button type="submit">Email to {lead.client_name}</button></ActionForm>
              : <span className="task-meta">Add a contact email for {lead.client_name} to hand prospects over by email.</span>
          )}
          {lead.status !== 'introduced' && (
            <details>
              <summary>Introduced to client</summary>
              <ActionForm className="grid" action={markIntroduced.bind(null, lead.id, back)}>
                <label>Introduced on<input name="introduced_on" type="date" defaultValue={today} max={today} /></label>
                <div className="actions full"><button type="submit">Save introduction</button></div>
              </ActionForm>
            </details>
          )}
          <details>
            <summary>Became a customer</summary>
            <ActionForm className="grid" action={markCustomer.bind(null, lead.id, back)}>
              <label>Customer since<input name="customer_since" type="date" defaultValue={today} max={today} required /></label>
              <div className="actions full"><button type="submit">Record customer</button></div>
            </ActionForm>
          </details>
          <details>
            <summary>Lost</summary>
            <ActionForm className="grid" action={markLost.bind(null, lead.id, back)}>
              <label>Why
                <select name="lost_reason" defaultValue="">
                  <option value="">Pick a reason</option>
                  {LOST_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
              <div className="actions full"><button type="submit">Mark lost</button></div>
            </ActionForm>
          </details>
          <form action={markOptedOut.bind(null, lead.id, back)}><button type="submit" className="secondary">Asked not to be contacted</button></form>
        </div>
      )}
      {(lead.status === 'lost' || lead.status === 'talking' || lead.status === 'introduced') && (
        <div className="actions lead-actions">
          <form action={reopenLead.bind(null, lead.id, back)}><button type="submit" className="secondary">Back to outreach</button></form>
        </div>
      )}
    </article>
  );
}
