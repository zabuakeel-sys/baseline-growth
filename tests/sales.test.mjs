import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OUTCOMES, applyOutcome, commissions, scoreboard } from '../src/lib/sales.js';
import { inShareWindow, monthOf, shareCents } from '../src/lib/billing.js';

test('each outcome moves the prospect the right way and sets the next step', () => {
  const lead = { status: 'following_up' };
  assert.deepEqual(applyOutcome(lead, 'no_answer', '2026-11-13'), { status: null, lostReason: null, nextActionOn: '2026-11-15' });
  assert.deepEqual(applyOutcome(lead, 'talked', '2026-11-13'), { status: 'talking', lostReason: null, nextActionOn: '2026-11-16' });
  assert.deepEqual(applyOutcome(lead, 'not_interested', '2026-11-13'), { status: 'lost', lostReason: 'Not interested', nextActionOn: null });
  assert.equal(applyOutcome(lead, 'signed', '2026-11-13').status, 'won');
  assert.equal(applyOutcome(lead, 'meeting_booked', '2026-11-13').nextActionOn, null);
  assert.throws(() => applyOutcome(lead, 'teleported', '2026-11-13'));
});

test('customers and opt-outs are never changed; introduced is never moved back', () => {
  assert.equal(applyOutcome({ status: 'won' }, 'not_interested', '2026-11-13').status, null);
  assert.equal(applyOutcome({ status: 'opted_out' }, 'talked', '2026-11-13').status, null);
  assert.equal(applyOutcome({ status: 'introduced' }, 'talked', '2026-11-13').status, null);
  assert.equal(applyOutcome({ status: 'introduced' }, 'signed', '2026-11-13').status, 'won');
  assert.equal(applyOutcome({ status: 'talking' }, 'talked', '2026-11-13').status, null, 'no change when already talking');
});

test('scoreboard counts per rep', () => {
  const rows = scoreboard({
    users: [{ id: 1, name: 'Ana' }, { id: 2, name: 'Ben' }],
    activities: [
      { user_id: 1, channel: 'call', outcome: 'no_answer' },
      { user_id: 1, channel: 'call', outcome: 'talked' },
      { user_id: 1, channel: 'visit', outcome: 'meeting_booked' },
      { user_id: 2, channel: 'call', outcome: 'voicemail' },
    ],
    meetings: [{ booked_by: 1, status: 'held' }, { booked_by: 1, status: 'no_show' }],
    customers: [{ won_by: 1 }],
  });
  assert.deepEqual(rows[0], { userId: 1, name: 'Ana', calls: 2, visits: 1, conversations: 2, meetingsBooked: 2, meetingsHeld: 1, customers: 1 });
  assert.equal(rows[1].conversations, 0);
  assert.ok(Object.keys(OUTCOMES).length >= 8);
});

test('commission: rep percent of confirmed share plus signup fees on their customers only', () => {
  const rows = commissions({
    customers: [
      { id: 10, won_by: 1, customer_since: '2026-09-05', client_id: 100 },
      { id: 11, won_by: 2, customer_since: '2026-10-01', client_id: 200 },
      { id: 12, won_by: null, customer_since: '2026-10-01', client_id: 100 },
    ],
    revenue: [
      { lead_id: 10, month: '2026-09-01', revenue_cents: 400_000, confirmed: true },  // 10% = 40,000
      { lead_id: 10, month: '2026-10-01', revenue_cents: 400_000, confirmed: false }, // not yet
      { lead_id: 12, month: '2026-10-01', revenue_cents: 999_999, confirmed: true },  // nobody's
    ],
    clients: {
      100: { share_percent: 10, share_months: 36, signup_fee_cents: 0 },
      200: { share_percent: 0, share_months: null, signup_fee_cents: 25_000 },
    },
    rates: { 1: 20, 2: 10 },
    inWindow: inShareWindow, shareFor: shareCents, monthOf,
  });
  const by = Object.fromEntries(rows.map((r) => [r.userId, r]));
  assert.deepEqual(by[1], { userId: 1, earnedCents: 40_000, commissionCents: 8_000 });
  assert.deepEqual(by[2], { userId: 2, earnedCents: 25_000, commissionCents: 2_500 });
  assert.equal(rows.length, 2);
});
