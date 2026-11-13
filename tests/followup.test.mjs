import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCHEDULE_DAYS, daysBetween, isDue, leadStats, messageFor, needsDecision, nextDue } from '../src/lib/followup.js';

test('schedule: same day, then 1, 3, 7 and 14 days after arrival', () => {
  assert.equal(nextDue('2026-11-13', 0), '2026-11-13');
  assert.equal(nextDue('2026-11-13', 1), '2026-11-14');
  assert.equal(nextDue('2026-11-13', 2), '2026-11-16');
  assert.equal(nextDue('2026-11-13', 4), '2026-11-27');
  assert.equal(nextDue('2026-11-13', SCHEDULE_DAYS.length), null);
  assert.equal(nextDue('2026-12-30', 3), '2027-01-06');
});

test('only open, unanswered leads come due', () => {
  const lead = { received_on: '2026-11-10', touches_sent: 1, status: 'following_up' };
  assert.equal(isDue(lead, '2026-11-10'), false); // second touch due Nov 11
  assert.equal(isDue(lead, '2026-11-11'), true);
  assert.equal(isDue(lead, '2026-11-20'), true, 'overdue stays due');
  for (const status of ['talking', 'won', 'lost']) assert.equal(isDue({ ...lead, status }, '2026-11-20'), false, status);
  assert.equal(isDue({ ...lead, touches_sent: 5 }, '2026-12-31'), false);
});

test('a lead that got every touch and never replied needs a decision', () => {
  assert.equal(needsDecision({ status: 'following_up', touches_sent: 5 }), true);
  assert.equal(needsDecision({ status: 'following_up', touches_sent: 4 }), false);
  assert.equal(needsDecision({ status: 'talking', touches_sent: 5 }), false);
});

test('messages use the first name, the client and the need, and change each touch', () => {
  const ctx = { leadName: 'Dana Smith', clientName: 'LibraPro', need: 'nightly office cleaning.', senderName: 'Zaino' };
  const first = messageFor(0, ctx);
  assert.match(first, /^Hi Dana,/);
  assert.match(first, /LibraPro about nightly office cleaning\./);
  assert.match(messageFor(0, { ...ctx, need: 'Nightly cleaning.' }), /about nightly cleaning\./);
  assert.match(messageFor(0, { ...ctx, need: 'HVAC duct cleaning' }), /about HVAC duct cleaning\./);
  assert.match(first, /Zaino\nLibraPro$/);
  const all = SCHEDULE_DAYS.map((_, i) => messageFor(i, ctx));
  assert.equal(new Set(all).size, SCHEDULE_DAYS.length);
  assert.match(messageFor(0, { clientName: 'AutoAt' }), /^Hi there,/);
});

test('stats: win rate over decided leads, average first reply', () => {
  const s = leadStats([
    { status: 'won', won_value_cents: 120_000, received_at: '2026-11-01T10:00:00Z', first_touch_at: '2026-11-01T11:00:00Z' },
    { status: 'lost', received_at: '2026-11-02T10:00:00Z', first_touch_at: '2026-11-02T13:00:00Z' },
    { status: 'following_up', received_at: '2026-11-03T10:00:00Z' },
  ]);
  assert.equal(s.total, 3);
  assert.equal(s.winRate, 50);
  assert.equal(s.wonValueCents, 120_000);
  assert.equal(s.avgReplyHours, 2);
  assert.equal(leadStats([]).winRate, null);
  // Logged two days after it arrived: real reply time unknown, so it is left out.
  const late = leadStats([{ status: 'talking', received_on: '2026-11-01', received_at: '2026-11-03T15:00:00Z', first_touch_at: '2026-11-03T15:01:00Z' }]);
  assert.equal(late.avgReplyHours, null);
  const sameDay = leadStats([{ status: 'talking', received_on: '2026-11-03', received_at: '2026-11-03T15:00:00Z', first_touch_at: '2026-11-03T17:00:00Z' }]);
  assert.equal(sameDay.avgReplyHours, 2);
  assert.equal(daysBetween('2026-11-01', '2026-11-15'), 14);
});
