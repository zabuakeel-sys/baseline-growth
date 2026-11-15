import { test } from 'node:test';
import assert from 'node:assert/strict';
import { haversine, orderByNearest } from '../src/lib/route.js';

test('haversine is ~0 for the same point and grows with distance', () => {
  const a = { lat: 42.5, lng: -83.1 };
  assert.ok(haversine(a, a) < 0.001);
  const near = haversine(a, { lat: 42.6, lng: -83.1 });
  const far = haversine(a, { lat: 43.5, lng: -83.1 });
  assert.ok(far > near && near > 0);
});

test('orderByNearest walks the closest stop each time from the origin', () => {
  const origin = { lat: 42.5, lng: -83.5 };
  // Three stops at increasing distance east; given out of order, they should come back near->far.
  const stops = [
    { id: 'far', lat: 42.5, lng: -82.5 },
    { id: 'near', lat: 42.5, lng: -83.4 },
    { id: 'mid', lat: 42.5, lng: -83.0 },
  ];
  assert.deepEqual(orderByNearest(origin, stops).map((s) => s.id), ['near', 'mid', 'far']);
});

test('stops without coordinates keep their order at the end', () => {
  const origin = { lat: 42.5, lng: -83.5 };
  const stops = [
    { id: 'a', lat: 42.5, lng: -83.0 },
    { id: 'no1' },
    { id: 'b', lat: 42.5, lng: -83.4 },
    { id: 'no2', lat: null, lng: null },
  ];
  const out = orderByNearest(origin, stops).map((s) => s.id);
  assert.deepEqual(out, ['b', 'a', 'no1', 'no2']);
});

test('no origin starts from the first located stop and still orders the rest', () => {
  const stops = [
    { id: 'a', lat: 42.5, lng: -83.0 },
    { id: 'b', lat: 42.5, lng: -83.1 },
    { id: 'c', lat: 42.5, lng: -82.0 },
  ];
  const out = orderByNearest(null, stops).map((s) => s.id);
  assert.equal(out[0], 'a');
  assert.deepEqual(out, ['a', 'b', 'c']);
});
