import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isWarm, warmSource, warmFirst } from '../src/lib/warm.js';

test('a referral or a partner intro is warm; a found prospect is not', () => {
  assert.equal(isWarm({ source: 'Referral' }), true);
  assert.equal(isWarm({ referred_by: 7 }), true);
  assert.equal(isWarm({ partner_id: 3 }), true);
  assert.equal(isWarm({ source: 'Research' }), false);
  assert.equal(isWarm({}), false);
  assert.equal(isWarm(null), false);
});

test('warmSource names the path', () => {
  assert.equal(warmSource({ partner_id: 3, partner_name: 'Metro Property Group' }), 'Partner intro: Metro Property Group');
  assert.equal(warmSource({ referred_by: 7 }), 'Referred by a customer');
  assert.equal(warmSource({ source: 'Referral' }), 'Referred by a customer');
  assert.equal(warmSource({ source: 'Research' }), '');
});

test('warmFirst floats warm prospects up and keeps the rest stable', () => {
  const leads = [
    { id: 1, source: 'Research' },
    { id: 2, source: 'Referral' },
    { id: 3, source: 'Research' },
    { id: 4, partner_id: 9 },
  ];
  assert.deepEqual(warmFirst(leads).map((l) => l.id), [2, 4, 1, 3]);
  // does not mutate the input
  assert.equal(leads[0].id, 1);
});
