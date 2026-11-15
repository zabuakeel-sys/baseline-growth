import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestPlay } from '../src/lib/suggestPlay.js';
import { PLAY_KEYS } from '../src/lib/plays.js';

const key = (info) => suggestPlay(info)?.key ?? null;

test('a marketplace gets the claim-listing play', () => {
  assert.equal(key({ name: 'AutoAt', offer: 'A marketplace where drivers find and book a repair shop' }), 'claim_listing');
});

test('an on-site service gets the walkthrough play', () => {
  assert.equal(key({ name: 'LibraPro Facility Services', text: 'Commercial cleaning and janitorial for offices' }), 'free_walkthrough');
});

test('software gets a demo, and a free-trial product gets a trial', () => {
  assert.equal(key({ name: 'BookEasy', offer: 'Scheduling software and a booking platform for salons' }), 'free_demo');
  assert.equal(key({ offer: 'Our POS app is free to try, no credit card needed' }), 'free_trial');
});

test('a professional service gets a consultation', () => {
  assert.equal(key({ name: 'Keystone CPA', text: 'Accounting and bookkeeping for small businesses' }), 'free_consultation');
});

test('suppliers and distributors get sample / wholesale', () => {
  assert.equal(key({ name: 'Rivertown Roasters', text: 'We supply coffee and sample boxes to cafes' }), 'free_sample');
  assert.equal(key({ offer: 'Wholesale distribution with trade pricing for retailers' }), 'wholesale_account');
});

test('software wins over the service word it contains', () => {
  // "cleaning scheduling software" should read as software, not a cleaning service.
  assert.equal(key({ name: 'TidyOps', offer: 'Scheduling software for cleaning companies' }), 'free_demo');
});

test('nothing confident returns null so the owner picks', () => {
  assert.equal(suggestPlay({ name: 'Acme Widgets' }), null);
  assert.equal(suggestPlay({}), null);
});

test('every suggestion is a real play key', () => {
  for (const info of [{ offer: 'marketplace listing' }, { text: 'janitorial cleaning' }, { offer: 'CRM software' }]) {
    const s = suggestPlay(info);
    assert.ok(s && PLAY_KEYS.includes(s.key), `bad key for ${JSON.stringify(info)}`);
    assert.ok(s.reason.length > 5);
  }
});
