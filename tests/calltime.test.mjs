import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bestCallTime } from '../src/lib/calltime.js';

test('a restaurant is best called between the rushes', () => {
  const r = bestCallTime({ name: "Tony's Pizza & Grill" });
  assert.match(r.when, /2 to 4/);
  assert.match(r.avoid, /lunch|dinner/i);
});

test('a dental office is best called late morning, not Monday', () => {
  const r = bestCallTime({ name: 'Troy Family Dental', need: 'Busy dental office' });
  assert.match(r.when, /10 to 11:30am/);
  assert.match(r.avoid, /Monday/);
});

test('an auto shop avoids the drop-off rush', () => {
  const r = bestCallTime({ name: 'Dearborn Auto Repair' });
  assert.match(r.avoid, /drop-off|8 to 9am/);
});

test('a trade with crews on site is best caught early or late', () => {
  const r = bestCallTime({ name: 'Green Lawn Landscaping', industry: 'Commercial cleaning' });
  assert.match(r.when, /8 to 9am|4 to 5pm/);
});

test('an office/professional business uses the general B2B window', () => {
  const r = bestCallTime({ name: 'Maple Ridge Law' });
  assert.match(r.when, /Tuesday to Thursday/);
});

test('unknown businesses fall back to a safe default', () => {
  const r = bestCallTime({ name: 'Acme Widgets' });
  assert.match(r.when, /Tuesday to Thursday/);
  assert.match(r.avoid, /Monday mornings/);
  assert.deepEqual(Object.keys(bestCallTime()), ['when', 'avoid']);
});
