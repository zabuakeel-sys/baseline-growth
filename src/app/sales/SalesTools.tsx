import type { Lead } from '@/lib/leads';
import { CHANNELS, OUTCOMES } from '@/lib/sales';
import { bookMeeting, logActivity, setMeetingStatus, setNextAction } from './actions';
import ActionForm from '../ActionForm';

const shortDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Detroit' });
const MEETING_LABEL: Record<string, string> = { scheduled: 'Scheduled', held: 'Held', no_show: 'No-show', cancelled: 'Cancelled' };

/** What a rep needs on each open prospect: the script, the next step, logging, meetings, history. */
export default function SalesTools({ lead, back, today }: { lead: Lead; back: string; today: string }) {
  const late = lead.next_action_on && lead.next_action_on < today;
  return (
    <div className="sales-tools">
      {lead.next_action_on && (
        <p className={`next-step${late ? ' late' : ''}`}>
          Next: {lead.next_action || 'Follow up'} · {lead.next_action_on === today ? 'today' : late ? `overdue since ${shortDate(lead.next_action_on)}` : shortDate(lead.next_action_on)}
        </p>
      )}
      {lead.meetings.length > 0 && (
        <ul className="meetings">
          {lead.meetings.map((m) => (
            <li key={m.id}>
              <strong>{m.kind}</strong> · {when(m.starts_at)}{m.location ? ` · ${m.location}` : ''}
              <span className={`pill ${m.status === 'held' ? 'signed' : m.status === 'no_show' ? 'late' : ''}`} style={{ marginLeft: 6 }}>{MEETING_LABEL[m.status]}</span>
              {m.status === 'scheduled' && (
                <span className="actions inline-actions">
                  <form action={setMeetingStatus.bind(null, m.id, 'held', back)}><button type="submit" className="secondary small">Held</button></form>
                  <form action={setMeetingStatus.bind(null, m.id, 'no_show', back)}><button type="submit" className="secondary small">No-show</button></form>
                  <form action={setMeetingStatus.bind(null, m.id, 'cancelled', back)}><button type="submit" className="secondary small">Cancelled</button></form>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {lead.client_script && (
        <details>
          <summary>Script for {lead.client_name}</summary>
          <pre className="message">{lead.client_script}</pre>
        </details>
      )}
      <details>
        <summary><strong>Log a call or visit</strong></summary>
        <ActionForm className="log-form" action={logActivity.bind(null, lead.id, back)}>
          <div className="segmented-radio" role="radiogroup" aria-label="How">
            {Object.entries(CHANNELS).map(([key, label], i) => (
              <label key={key} className="choice"><input type="radio" name="channel" value={key} defaultChecked={i === 0} /><span>{label}</span></label>
            ))}
          </div>
          <div className="outcome-grid" role="radiogroup" aria-label="What happened">
            {Object.entries(OUTCOMES).map(([key, o]) => (
              <label key={key} className="choice"><input type="radio" name="outcome" value={key} required /><span>{o.label}</span></label>
            ))}
          </div>
          <label>Notes<input name="notes" placeholder="Who you spoke to, what they said" /></label>
          <div className="grid">
            <label>Next step (optional)<input name="next_action" placeholder="Call back after 3pm" /></label>
            <label>On<input name="next_action_on" type="date" min={today} /></label>
          </div>
          <div className="actions"><button type="submit">Save</button></div>
        </ActionForm>
      </details>
      <details>
        <summary>Book a meeting</summary>
        <ActionForm className="grid" action={bookMeeting.bind(null, lead.id, back)}>
          <label>What
            <select name="kind" defaultValue="Walkthrough">
              <option>Walkthrough</option><option>Call</option><option>Visit</option><option>Demo</option><option>Sign-up</option>
            </select>
          </label>
          <label>Day<input name="date" type="date" min={today} required /></label>
          <label>Time (Michigan)<input name="time" type="time" required /></label>
          <label>Where<input name="location" placeholder="Their office, phone, video" /></label>
          <div className="actions full"><button type="submit">Book</button></div>
        </ActionForm>
      </details>
      <details>
        <summary>Set next step</summary>
        <ActionForm className="grid" action={setNextAction.bind(null, lead.id, back)}>
          <label>What<input name="next_action" defaultValue={lead.next_action} /></label>
          <label>On (empty clears it)<input name="next_action_on" type="date" defaultValue={lead.next_action_on ?? ''} /></label>
          <div className="actions full"><button type="submit">Save next step</button></div>
        </ActionForm>
      </details>
      {lead.activity.length > 0 && (
        <ul className="history">
          {lead.activity.map((a, i) => (
            <li key={i}>
              {when(a.at)} · {CHANNELS[a.channel as keyof typeof CHANNELS]}: {OUTCOMES[a.outcome as keyof typeof OUTCOMES]?.label}
              {a.by && <span className="muted"> · {a.by}</span>}
              {a.notes && <div className="muted">{a.notes}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
