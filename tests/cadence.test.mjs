import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CADENCE, channelFor, currentStep, isMissed, stepLabel, stepsLeft } from '../src/lib/cadence.js';

const lead = { status: 'new', received_on: '2026-11-16', email: 'a@b.com', phone: '1', address: '1 Main St', cadence_step: 0, touches_sent: 0 };
const local = { visits: true };
const national = { visits: false };

test('the schedule mixes 4 emails, 2 calls and a visit over 14 days', () => {
  assert.deepEqual(CADENCE.map((s) => `${s.day}:${s.channel}`), ['0:email', '1:call', '3:email', '5:visit', '7:email', '10:call', '14:email']);
});

test('steps adapt to what we know about the prospect and the business', () => {
  const visit = CADENCE[3];
  assert.equal(channelFor(visit, lead, local), 'visit');
  assert.equal(channelFor(visit, lead, national), 'call', 'national businesses call instead of visiting');
  assert.equal(channelFor(visit, { ...lead, address: '' }, local), 'call', 'no address: call instead');
  assert.equal(channelFor(visit, { ...lead, address: '', phone: '' }, local), null);
  assert.equal(channelFor(CADENCE[0], { ...lead, email: '' }, local), null);
  assert.equal(channelFor(CADENCE[1], { ...lead, phone: '' }, local), null);
});

test('current step walks forward from the pointer and skips what cannot be done', () => {
  assert.deepEqual(currentStep(lead, local, '2026-11-16'), { index: 0, channel: 'email', due: '2026-11-16', overdueDays: 0 });
  assert.deepEqual(currentStep({ ...lead, cadence_step: 1 }, local, '2026-11-16'), { index: 1, channel: 'call', due: '2026-11-17', overdueDays: 0 });
  // Phone-only prospect starts with the day-1 call
  assert.equal(currentStep({ ...lead, email: '' }, local, '2026-11-16').index, 1);
  // Email-only prospect never gets calls: after email 1 comes email 2 on day 3
  assert.deepEqual(currentStep({ ...lead, phone: '', address: '', cadence_step: 1 }, local, '2026-11-20'), { index: 2, channel: 'email', due: '2026-11-19', overdueDays: 1 });
  assert.equal(currentStep({ ...lead, cadence_step: 7 }, local, '2026-12-30'), null, 'finished');
  assert.equal(currentStep({ ...lead, status: 'talking' }, local, '2026-11-16'), null, 'a conversation stops the schedule');
});

test('a call or visit missed by more than 3 days is skipped; emails are never "missed"', () => {
  const call = currentStep({ ...lead, cadence_step: 1 }, local, '2026-11-20'); // due Nov 17
  assert.equal(isMissed(call, '2026-11-20'), false);
  assert.equal(isMissed(currentStep({ ...lead, cadence_step: 1 }, local, '2026-11-21'), '2026-11-21'), true);
  assert.equal(isMissed(currentStep(lead, local, '2026-12-01'), '2026-12-01'), false);
  assert.equal(isMissed(null, '2026-12-01'), false);
});

test('labels and steps left', () => {
  assert.equal(stepLabel({ index: 1, channel: 'call' }, { touches_sent: 1 }), 'Call: follow up (they have 1 email from us), step 2 of 7');
  assert.match(stepLabel({ index: 3, channel: 'visit' }, { touches_sent: 2 }), /^Visit: drop in/);
  assert.deepEqual(stepsLeft(lead, local), { email: 4, call: 2, visit: 1 });
  assert.deepEqual(stepsLeft(lead, national), { email: 4, call: 3, visit: 0 });
});

test('email number counts only the email steps this prospect gets', async () => {
  const { emailNumber, isScheduleLabel, stepLabel } = await import('../src/lib/cadence.js');
  const lead = { email: 'a@b.co', phone: '555', address: '' };
  assert.equal(emailNumber(0, lead, { visits: false }), 0);
  assert.equal(emailNumber(4, lead, { visits: false }), 2);
  assert.equal(emailNumber(6, { ...lead, email: '' }, { visits: false }), 0);
  assert.ok(isScheduleLabel(stepLabel({ index: 1, channel: 'call' }, { touches_sent: 1 })));
  assert.ok(isScheduleLabel(stepLabel({ index: 3, channel: 'visit' }, { touches_sent: 2 })));
  assert.ok(!isScheduleLabel('Follow up (no answer)'));
});
