import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addressOf, classifyReply, inSendWindow, newPart, remainingToday } from '../src/lib/mailrules.js';

const quoted = '\n\nOn Tue, Nov 17, 2026 at 10:02 AM Zaino <z@x.com> wrote:\n> If you\'d rather not hear from us, reply "no thanks"';

test('bounces and auto-replies are never treated as a person', () => {
  assert.equal(classifyReply({ from: 'Mail Delivery Subsystem <mailer-daemon@googlemail.com>', subject: 'Delivery Status Notification (Failure)' }), 'bounce');
  assert.equal(classifyReply({ from: 'a@b.com', subject: 'Undeliverable: Quick question' }), 'bounce');
  assert.equal(classifyReply({ from: 'a@b.com', subject: 'Re: hi', text: 'Thanks', headers: { 'Auto-Submitted': 'auto-replied' } }), 'auto');
  assert.equal(classifyReply({ from: 'a@b.com', subject: 'Out of Office: Re: Quick question', text: 'Back Monday' }), 'auto');
  assert.equal(classifyReply({ from: 'a@b.com', subject: 'Re: hi', text: 'Sure', headers: { 'Auto-Submitted': 'no' } }), 'reply');
});

test('opt-outs win, and quoted text does not count', () => {
  assert.equal(classifyReply({ text: 'No thanks.' }), 'opt_out');
  assert.equal(classifyReply({ text: 'Please remove me from your list' }), 'opt_out');
  assert.equal(classifyReply({ text: 'STOP' }), 'opt_out');
  assert.equal(classifyReply({ text: 'Unsubscribe' + quoted }), 'opt_out');
  // Our own footer says "no thanks"; a real yes that quotes it must not count as an opt-out.
  assert.equal(classifyReply({ text: 'Yes, call me Thursday at 2.' + quoted }), 'reply');
});

test('a polite no is lost, anything else goes to a person', () => {
  assert.equal(classifyReply({ text: "We're all set with our current cleaner." }), 'not_interested');
  assert.equal(classifyReply({ text: 'Not interested at this point' }), 'not_interested');
  assert.equal(classifyReply({ text: 'How much does it cost?' }), 'reply');
  assert.equal(classifyReply({ text: '' }), 'reply');
});

test('new part strips the quoted thread', () => {
  assert.equal(newPart('Sounds good\n\n-----Original Message-----\nFrom: x'), 'Sounds good');
  assert.equal(newPart('Hi\nFrom: me\n> old'), 'Hi');
  assert.equal(addressOf('Pat Lee <Pat@Plaza.example>'), 'pat@plaza.example');
  assert.equal(addressOf('pat@plaza.example'), 'pat@plaza.example');
});

test('send window: weekdays 9 to 5 Michigan time', () => {
  assert.equal(inSendWindow(new Date('2026-11-17T15:00:00Z')), true); // Tue 10:00 EST
  assert.equal(inSendWindow(new Date('2026-11-17T13:59:00Z')), false); // Tue 8:59 EST
  assert.equal(inSendWindow(new Date('2026-11-17T22:00:00Z')), false); // Tue 17:00 EST
  assert.equal(inSendWindow(new Date('2026-11-21T16:00:00Z')), false); // Saturday
  assert.equal(inSendWindow(new Date('2026-07-14T13:30:00Z')), true); // Tue 9:30 EDT (summer time)
  assert.equal(remainingToday(30, 28), 2);
  assert.equal(remainingToday(30, 40), 0);
});
