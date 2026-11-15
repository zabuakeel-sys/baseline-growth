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
