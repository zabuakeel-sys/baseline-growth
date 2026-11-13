import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addMonths, bonusCents, dueDateOf, monthOf, statement } from '../src/lib/billing.js';

test('month arithmetic crosses years', () => {
  assert.equal(monthOf('2026-11-13'), '2026-11-01');
  assert.equal(addMonths('2026-11-01', 1), '2026-12-01');
  assert.equal(addMonths('2026-12-01', 1), '2027-01-01');
  assert.equal(addMonths('2027-01-01', -1), '2026-12-01');
  assert.equal(dueDateOf('2026-12-01'), '2027-01-15');
});

test('bonus is a share of growth over baseline, never negative', () => {
  assert.equal(bonusCents({ bonusPercent: 15, baselineCents: 5_000_000, revenueCents: 5_750_000 }), 112_500);
  assert.equal(bonusCents({ bonusPercent: 15, baselineCents: 5_000_000, revenueCents: 4_000_000 }), 0);
  assert.equal(bonusCents({ bonusPercent: 0, baselineCents: 1, revenueCents: 100 }), 0);
  assert.equal(bonusCents({ bonusPercent: 12.5, baselineCents: 0, revenueCents: 333 }), 42); // 41.625 rounds to 42
});

const client = { monthly_fee_cents: 350_000, bonus_percent: 15, contract_start: '2026-09-10', contract_end: null };
const baseline = { monthly_revenue_cents: 5_000_000, signed_off: true };

test('fees run from the start month to this month; bonus only on confirmed numbers', () => {
  const rows = statement({
    client, baseline, today: '2026-11-20',
    results: [
      { month: '2026-09-01', revenue_cents: 5_750_000, confirmed: true },
      { month: '2026-10-01', revenue_cents: 6_000_000, confirmed: false },
    ],
    payments: [{ month: '2026-09-01', amount_cents: 462_500 }],
  });
  assert.deepEqual(rows.map((r) => r.month), ['2026-09-01', '2026-10-01', '2026-11-01']);
  const [sep, oct, nov] = rows;
  assert.equal(sep.bonusCents, 112_500);
  assert.equal(sep.dueCents, 462_500);
  assert.equal(sep.status, 'paid');
  assert.equal(oct.bonusCents, 0, 'unconfirmed month is not billed a bonus');
  assert.equal(oct.bonusPending, true);
  assert.equal(oct.status, 'late', 'October was due Nov 15 and today is Nov 20');
  assert.equal(nov.status, 'upcoming');
});

test('not late until after the 15th', () => {
  const rows = statement({ client, baseline, results: [], payments: [], today: '2026-10-15' });
  assert.equal(rows[0].status, 'open'); // September, due Oct 15, today is Oct 15
  const later = statement({ client, baseline, results: [], payments: [], today: '2026-10-16' });
  assert.equal(later[0].status, 'late');
});

test('no bonus without a signed baseline', () => {
  const rows = statement({
    client, baseline: { monthly_revenue_cents: 5_000_000, signed_off: false }, today: '2026-10-20',
    results: [{ month: '2026-09-01', revenue_cents: 9_000_000, confirmed: true }], payments: [],
  });
  assert.equal(rows[0].bonusCents, 0);
  assert.equal(rows[0].bonusPending, true);
});

test('fees stop after the contract end month and partial payments leave a balance', () => {
  const rows = statement({
    client: { ...client, contract_end: '2026-10-31' }, baseline, today: '2027-02-01',
    results: [], payments: [{ month: '2026-10-01', amount_cents: 100_000 }],
  });
  assert.deepEqual(rows.map((r) => r.month), ['2026-09-01', '2026-10-01']);
  assert.equal(rows[1].balanceCents, 250_000);
  assert.equal(rows[1].status, 'late');
});

test('no contract start means no bill', () => {
  assert.deepEqual(statement({ client: { ...client, contract_start: null }, baseline, results: [], payments: [], today: '2026-11-01' }), []);
});
