'use client';
import { useState } from 'react';
import { quote, type Pricing } from '@/lib/playbook';
import ActionForm from '../ActionForm';

const money = (c: number) => (c / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

/** Instant price range on the spot, from the client's own pricing rules; can be saved to the prospect. */
export default function QuoteTool({ pricing, action }: { pricing: Pricing; action: (fd: FormData) => Promise<{ error?: string } | void> }) {
  const [type, setType] = useState(pricing.types[0]?.name ?? '');
  const [sqft, setSqft] = useState('');
  const [visits, setVisits] = useState('5');
  const q = quote(pricing, { type, sqft: Number(sqft.replace(/,/g, '')), visitsPerWeek: Number(visits) });
  return (
    <ActionForm className="grid quote-tool" action={action}>
      <label>Building type
        <select name="type" value={type} onChange={(e) => setType(e.target.value)}>
          {pricing.types.map((t) => <option key={t.name}>{t.name}</option>)}
        </select>
      </label>
      <label>Square feet<input name="sqft" inputMode="numeric" value={sqft} onChange={(e) => setSqft(e.target.value)} placeholder="20000" /></label>
      <label>Visits per week
        <select name="visits" value={visits} onChange={(e) => setVisits(e.target.value)}>
          {[1, 2, 3, 5, 7].map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </label>
      <div className="full quote-result" aria-live="polite">
        {q ? <><strong>{money(q.lowCents)} to {money(q.highCents)}</strong> a month <span className="muted">(estimate; final price after a walkthrough)</span></> : <span className="muted">Enter the size to see a price range.</span>}
      </div>
      <div className="actions full"><button type="submit" className="secondary" disabled={!q}>Save quote to prospect</button></div>
    </ActionForm>
  );
}
