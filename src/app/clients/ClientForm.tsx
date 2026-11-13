import type { Client } from '@/lib/clients';
import ActionForm from '../ActionForm';
import { STATUSES } from '@/lib/clients';

const dollars = (cents: number | null | undefined) => (cents ? String(cents / 100) : '');

export default function ClientForm({
  action, client, showTerms, submitLabel,
}: {
  action: (formData: FormData) => Promise<{ error?: string }>;
  client?: Client;
  showTerms: boolean;
  submitLabel: string;
}) {
  return (
    <ActionForm className="grid" action={action}>
      <label>Business name<input name="name" defaultValue={client?.name} required /></label>
      <label>Industry<input name="industry" defaultValue={client?.industry} placeholder="Commercial cleaning" /></label>
      <label>Website<input name="website" defaultValue={client?.website} placeholder="https://" /></label>
      <label>Status
        <select name="status" defaultValue={client?.status ?? 'prospect'}>
          {STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
        </select>
      </label>
      <label>Contact name<input name="contact_name" defaultValue={client?.contact_name} /></label>
      <label>Contact email<input name="contact_email" type="email" defaultValue={client?.contact_email} /></label>
      <label>Contact phone<input name="contact_phone" type="tel" defaultValue={client?.contact_phone} /></label>
      {showTerms && (
        <>
          <label>Revenue share (% of what each customer we bring pays)<input name="share_percent" inputMode="decimal" defaultValue={client?.share_percent || ''} placeholder="10" /></label>
          <label>For how many months (empty = as long as they stay)<input name="share_months" inputMode="numeric" defaultValue={client?.share_months ?? ''} placeholder="36" /></label>
          <label>Fee per new customer ($)<input name="signup_fee" inputMode="decimal" defaultValue={dollars(client?.signup_fee_cents)} placeholder="0" /></label>
          <label>Monthly fee ($, optional)<input name="monthly_fee" inputMode="decimal" defaultValue={dollars(client?.monthly_fee_cents)} placeholder="0" /></label>
          <label>Contract start<input name="contract_start" type="date" defaultValue={client?.contract_start ?? ''} /></label>
          <label>Contract end (leave empty if ongoing)<input name="contract_end" type="date" defaultValue={client?.contract_end ?? ''} /></label>
          <label>Minimum months<input name="minimum_months" inputMode="numeric" defaultValue={client?.minimum_months ?? 6} /></label>
        </>
      )}
      <label className="full">What they offer, in one sentence (goes into outreach messages)
        <input name="offer" defaultValue={client?.offer} placeholder="AutoAt sends drivers to independent repair shops near them, free to join." />
      </label>
      <label className="full">Mailing address for outreach emails (required by law in commercial email)
        <input name="mailing_address" defaultValue={client?.mailing_address} placeholder="Street, city, state, ZIP" />
      </label>
      <label className="full">Notes<textarea name="notes" defaultValue={client?.notes} /></label>
      <div className="actions full"><button type="submit">{submitLabel}</button></div>
    </ActionForm>
  );
}
