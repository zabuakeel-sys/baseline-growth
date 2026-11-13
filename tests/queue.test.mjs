import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextQueue, reasonFor } from '../src/lib/queue.js';

const T = '2026-11-16';
const L = (id, o) => ({ id, status: 'following_up', next_action_on: null, next_action: '', phone: '1', received_on: '2026-11-01', activity: [], ...o });

test('replies first, then due calls (most overdue first), then new prospects', () => {
  const leads = [
    L(1, {}),                                                                 // new, never contacted
    L(2, { next_action_on: T, next_action: 'Call: follow up' }),
    L(3, { next_action_on: '2026-11-12', next_action: 'Visit: drop in' }),
    L(4, { next_action_on: T, next_action: 'They replied: call them now', status: 'talking' }),
    L(5, { next_action_on: '2026-11-20', next_action: 'Call: follow up' }),    // not due yet
    L(6, { phone: '' }),                                                      // no phone: email only
    L(7, { activity: [{}] }),                                                 // already contacted
    L(8, { status: 'won', next_action_on: T }),
  ];
  assert.deepEqual(nextQueue(leads, T).map((l) => l.id), [4, 3, 2, 1]);
  assert.equal(reasonFor(leads[3], T), 'replied');
  assert.equal(reasonFor(leads[2], T), 'visit');
  assert.equal(reasonFor(leads[1], T), 'call');
  assert.equal(reasonFor(leads[0], T), 'new');
});

test('skipped prospects go to the back in the order skipped', () => {
  const leads = [L(1, {}), L(2, { received_on: '2026-11-02' }), L(3, { received_on: '2026-11-03' })];
  assert.deepEqual(nextQueue(leads, T, ['2', '1']).map((l) => l.id), [3, 2, 1]);
});

test('a prospect with a booked meeting is not in the call queue', () => {
  const leads = [L(1, { next_action_on: T, next_action: 'Walkthrough at 14:30', meetings: [{ status: 'scheduled' }] }), L(2, { meetings: [{ status: 'held' }] })];
  assert.deepEqual(nextQueue(leads, T).map((l) => l.id), [2]);
});
