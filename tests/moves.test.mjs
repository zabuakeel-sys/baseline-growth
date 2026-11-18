import { test } from 'node:test';
import assert from 'node:assert/strict';
import { channelMoves } from '../src/lib/moves.js';

test('always offers LinkedIn, with a personalized note and a search link', () => {
  const m = channelMoves({ business: 'AutoAt', name: "Al's Auto", contactName: 'Jane Klein' });
  const li = m.find((x) => x.channel === 'linkedin');
  assert.ok(li);
  assert.match(li.message, /Hi Jane,/);
  assert.match(li.message, /AutoAt/);
  assert.match(li.link, /linkedin\.com\/search/);
  assert.match(li.link, /Jane%20Klein/); // name is url-encoded into the search
});

test('mail only appears with an address and carries it to copy', () => {
  assert.ok(!channelMoves({ business: 'X' }).some((x) => x.channel === 'mail'));
  const m = channelMoves({ business: 'X', name: 'Y', address: '1 Main St, Troy, MI', offer: 'A free walkthrough' });
  const mail = m.find((x) => x.channel === 'mail');
  assert.equal(mail.copy, '1 Main St, Troy, MI');
  assert.match(mail.message, /free walkthrough/);
});

test('SMS only appears with a phone, is dialable, and carries the legal caution', () => {
  assert.ok(!channelMoves({ business: 'X' }).some((x) => x.channel === 'sms'));
  const sms = channelMoves({ business: 'X', phone: '(248) 555-0142' }).find((x) => x.channel === 'sms');
  assert.equal(sms.sms, '2485550142');
  assert.match(sms.caution, /TCPA/);
});

test('a gift move is always offered and a contact name is used when present', () => {
  const g = channelMoves({ contactName: 'Mo Boss' }).find((x) => x.channel === 'gift');
  assert.match(g.message, /Mo Boss/);
  const g2 = channelMoves({}).find((x) => x.channel === 'gift');
  assert.match(g2.message, /owner or manager/);
});

import { moveSequence } from '../src/lib/moves.js';

test('moveSequence is an ordered, gapped sequence: LinkedIn, then mail (if address), then gift', () => {
  const withAddr = moveSequence({ business: 'X', name: 'Y', address: '1 Main St', contactName: 'Jo' });
  assert.deepEqual(withAddr.map((m) => m.channel), ['linkedin', 'mail', 'gift']);
  assert.ok(withAddr.every((m) => typeof m.days === 'number'));
  assert.ok(withAddr[1].days > withAddr[0].days); // later moves wait longer
  // No address -> mail drops out, LinkedIn then gift.
  assert.deepEqual(moveSequence({ business: 'X' }).map((m) => m.channel), ['linkedin', 'gift']);
  // Cold SMS is never an auto-sequence step.
  assert.ok(!moveSequence({ business: 'X', phone: '2485550000' }).some((m) => m.channel === 'sms'));
});

import { isClaimFlow, claimCall } from '../src/lib/moves.js';

test('a sign-up or claim business gets the claim call, a meeting business does not', () => {
  assert.equal(isClaimFlow({ play: 'claim_listing' }), true);
  assert.equal(isClaimFlow({ play: 'free_walkthrough', firstStep: 'claim' }), false, 'a picked strategy wins');
  assert.equal(isClaimFlow({ firstStep: 'claim your free listing' }), true);
  assert.equal(isClaimFlow({ goal: 'Get every shop to sign up on AutoAt' }), true);
  assert.equal(isClaimFlow({ firstStep: 'free walkthrough' }), false);
});

test('the claim text carries the tagged link and the names', () => {
  const k = claimCall({ business: 'AutoAt', name: 'Joe Auto', contactName: 'Joe Smith', repName: 'Zain Akeel', link: 'https://autoat.org/claim?ref=bg-7' });
  assert.match(k.sms, /^Hi Joe, it's Zain with AutoAt/);
  assert.match(k.sms, /claim Joe Auto on AutoAt: https:\/\/autoat\.org\/claim\?ref=bg-7$/);
  assert.match(k.opener, /Joe Auto already has a page on AutoAt/);
  assert.match(claimCall({ name: 'X' }).sms, /Add the sign-up link in Settings/);
});
