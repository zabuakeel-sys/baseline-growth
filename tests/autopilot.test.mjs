import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoAddable, dueTarget, pickRep, prospectsToAdd } from '../src/lib/autopilot.js';

test('never-run searches go first, then ones past the refresh window', () => {
  const targets = [
    { id: 1, last_run_at: '2026-11-10T15:00:00Z' },
    { id: 2, last_run_at: null },
    { id: 3, last_run_at: null },
    { id: 4, last_run_at: '2026-10-01T15:00:00Z' },
  ];
  assert.equal(dueTarget(targets, '2026-11-13').id, 2);
  const ran = targets.map((t) => ({ ...t, last_run_at: t.last_run_at ?? '2026-11-12T15:00:00Z' }));
  assert.equal(dueTarget(ran, '2026-11-13').id, 4, 'Oct 1 is more than 30 days ago');
  assert.equal(dueTarget(ran.filter((t) => t.id !== 4), '2026-11-13'), null, 'nothing due');
});

test('daily cap and untouched pile both limit how many are added', () => {
  assert.equal(prospectsToAdd({ dailyCap: 25, addedToday: 0, untouched: 0 }), 25);
  assert.equal(prospectsToAdd({ dailyCap: 25, addedToday: 20, untouched: 0 }), 5);
  assert.equal(prospectsToAdd({ dailyCap: 25, addedToday: 0, untouched: 40 }), 10);
  assert.equal(prospectsToAdd({ dailyCap: 25, addedToday: 30, untouched: 0 }), 0);
});

test('prospects go to the rep with the lightest load', () => {
  assert.equal(pickRep([3, 5, 9], { 3: 10, 5: 4, 9: 4 }), 5);
  assert.equal(pickRep([3, 5], {}), 3);
  assert.equal(pickRep([], {}), null);
});

test('only good, reachable businesses are added automatically, best first', () => {
  const c = [
    { id: 1, score: 90, email: 'a@x', phone: '' },
    { id: 2, score: 59, email: 'b@x', phone: '' },
    { id: 3, score: 75, email: '', phone: '' },
    { id: 4, score: 70, email: '', phone: '1' },
  ];
  assert.deepEqual(autoAddable(c).map((x) => x.id), [1, 4]);
});
