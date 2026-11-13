import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCHEDULE_DAYS, daysBetween, isDue, leadStats, messageFor, needsDecision, nextDue } from '../src/lib/followup.js';

test('outreach schedule: first message, then 3, 7 and 14 days later', () => {
  assert.deepEqual(SCHEDULE_DAYS, [0, 3, 7, 14]);
  assert.equal(nextDue('2026-11-13', 0), '2026-11-13');
  assert.equal(nextDue('2026-11-13', 1), '2026-11-16');
  assert.equal(nextDue('2026-11-13', 3), '2026-11-27');
  assert.equal(nextDue('2026-11-13', 4), null);
  assert.equal(nextDue('2026-12-30', 2), '2027-01-06');
  assert.equal(daysBetween('2026-11-01', '2026-11-15'), 14);
});

test('only unanswered prospects come due; everyone else is left alone', () => {
  const lead = { received_on: '2026-11-10', touches_sent: 1, status: 'following_up' };
  assert.equal(isDue(lead, '2026-11-12'), false); // second touch due Nov 13
  assert.equal(isDue(lead, '2026-11-13'), true);
  for (const status of ['talking', 'introduced', 'won', 'lost', 'opted_out']) {
    assert.equal(isDue({ ...lead, status }, '2026-12-31'), false, status);
  }
  assert.equal(needsDecision({ status: 'following_up', touches_sent: 4 }), true);
  assert.equal(needsDecision({ status: 'opted_out', touches_sent: 4 }), false);
});

test('every message names the client, signs on its behalf and offers an opt-out with the address', () => {
  const ctx = {
    leadName: 'Pat Lee', clientName: 'AutoAt', senderName: 'Zaino',
    offer: 'AutoAt sends drivers to independent repair shops near them, free to join.',
    need: 'Empty bays on weekdays', address: '123 Main St, Detroit, MI 48201',
  };
  const all = SCHEDULE_DAYS.map((_, i) => messageFor(i, ctx));
  assert.equal(new Set(all).size, SCHEDULE_DAYS.length);
  for (const m of all) {
    assert.match(m, /^Hi Pat,/);
    assert.match(m, /AutoAt/);
    assert.match(m, /Zaino\nOn behalf of AutoAt/);
    assert.match(m, /reply "no thanks" and we won't contact you again\.\n123 Main St, Detroit, MI 48201$/);
  }
  assert.match(all[0], /free to join\. I thought it could help with empty bays on weekdays\./);
  assert.match(messageFor(0, { clientName: 'LibraPro' }), /^Hi there,[\s\S]*I work with LibraPro\./);
  for (const business of ['Tower Dental', "Al Dean's Auto Repair", 'Maple Offices', 'A2Z Complete Car Care', 'GREENFIELD LLC'])
    assert.match(messageFor(0, { ...ctx, leadName: business }), /^Hi there,/, business);
  assert.match(messageFor(0, { ...ctx, leadName: "Mary O'Brien" }), /^Hi Mary,/);
  assert.match(messageFor(0, { clientName: 'X', need: 'HVAC work' }), /help with HVAC work\./);
});

test('pipeline numbers', () => {
  const s = leadStats([
    { status: 'won', touches_sent: 2, introduced_on: '2026-11-01' },
    { status: 'introduced', touches_sent: 1, introduced_on: '2026-11-05' },
    { status: 'talking', touches_sent: 1 },
    { status: 'lost', touches_sent: 4, lost_reason: 'No response' },
    { status: 'new', touches_sent: 0 },
  ]);
  assert.deepEqual(s, { total: 5, reached: 4, replied: 3, introduced: 2, customers: 1, customerRate: 25 });
  assert.equal(leadStats([]).customerRate, null);
});
