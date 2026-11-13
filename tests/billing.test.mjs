import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addMonths, dueDateOf, inShareWindow, monthOf, monthsBetween, shareCents, statement } from '../src/lib/billing.js';

test('month arithmetic crosses years', () => {
  assert.equal(monthOf('2026-11-13'), '2026-11-01');
  assert.equal(addMonths('2026-12-01', 1), '2027-01-01');
  assert.equal(addMonths('2027-01-01', -1), '2026-12-01');
  assert.equal(monthsBetween('2026-11-01', '2027-02-01'), 3);
  assert.equal(dueDateOf('2026-12-01'), '2027-01-15');
});

test('share window: 36 months from the first month, or forever when open-ended', () => {
  assert.equal(inShareWindow('2026-09-01', '2026-09-01', 36), true);
  assert.equal(inShareWindow('2026-09-01', '2029-08-01', 36), true); // month 36
  assert.equal(inShareWindow('2026-09-01', '2029-09-01', 36), false); // month 37
  assert.equal(inShareWindow('2026-09-01', '2026-08-01', 36), false); // before they were a customer
  assert.equal(inShareWindow('2026-09-01', '2040-01-01', null), true);
  assert.equal(shareCents(123_456, 10), 12_346);
});

// LibraPro-style deal: 10% of what each brought customer pays, for 36 months, no fixed fee.
const libra = { monthly_fee_cents: 0, share_percent: 10, share_months: 36, signup_fee_cents: 0, contract_start: '2026-09-01', contract_end: null };

test('share only on confirmed revenue of customers we brought', () => {
  const rows = statement({
    client: libra, today: '2026-11-20',
    customers: [{ id: 1, customer_since: '2026-09-10' }, { id: 2, customer_since: '2026-10-02' }],
    revenue: [
      { lead_id: 1, month: '2026-09-01', revenue_cents: 400_000, confirmed: true },
      { lead_id: 1, month: '2026-10-01', revenue_cents: 400_000, confirmed: true },
      { lead_id: 2, month: '2026-10-01', revenue_cents: 250_000, confirmed: false },
      { lead_id: 99, month: '2026-10-01', revenue_cents: 1_000_000, confirmed: true }, // not one of ours
    ],
    payments: [{ month: '2026-09-01', amount_cents: 40_000 }],
  });
  const [sep, oct, nov] = rows;
  assert.equal(sep.shareCents, 40_000);
  assert.equal(sep.status, 'paid');
  assert.equal(oct.shareCents, 40_000, 'customer 2 is unconfirmed, outsider ignored');
  assert.equal(oct.waitingCents, 25_000);
  assert.equal(oct.status, 'late', 'October was due Nov 15, today is Nov 20');
  assert.equal(nov.dueCents, 0);
  assert.equal(nov.status, 'paid', 'nothing owed yet is not shown as unpaid');
});

test('revenue before a customer started is not shared', () => {
  const rows = statement({
    client: libra, today: '2026-10-01',
    customers: [{ id: 1, customer_since: '2026-09-20' }],
    revenue: [{ lead_id: 1, month: '2026-08-01', revenue_cents: 500_000, confirmed: true }],
    payments: [],
  });
  assert.equal(rows.reduce((s, r) => s + r.shareCents, 0), 0);
});

// AutoAt-style deal: a fee per shop signed, plus a small monthly retainer.
test('signup fee lands in the month the customer started; monthly fee every month', () => {
  const rows = statement({
    client: { monthly_fee_cents: 50_000, share_percent: 0, share_months: null, signup_fee_cents: 25_000, contract_start: '2026-10-15', contract_end: null },
    customers: [{ id: 1, customer_since: '2026-10-20' }, { id: 2, customer_since: '2026-10-28' }, { id: 3, customer_since: '2026-11-03' }, { id: 4, customer_since: null }],
    revenue: [], payments: [], today: '2026-11-13',
  });
  assert.deepEqual(rows.map((r) => [r.month, r.signups, r.dueCents]), [['2026-10-01', 2, 100_000], ['2026-11-01', 1, 75_000]]);
  assert.equal(rows[0].status, 'open', 'October is due Nov 15; today is Nov 13');
});

test('not late until after the 15th; contract end stops billing', () => {
  const client = { ...libra, monthly_fee_cents: 100_000 };
  assert.equal(statement({ client, customers: [], revenue: [], payments: [], today: '2026-10-15' })[0].status, 'open');
  assert.equal(statement({ client, customers: [], revenue: [], payments: [], today: '2026-10-16' })[0].status, 'late');
  const ended = statement({ client: { ...client, contract_end: '2026-10-31' }, customers: [], revenue: [], payments: [], today: '2027-03-01' });
  assert.deepEqual(ended.map((r) => r.month), ['2026-09-01', '2026-10-01']);
  assert.deepEqual(statement({ client: { ...client, contract_start: null }, customers: [], revenue: [], payments: [], today: '2026-11-01' }), []);
});
