import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCHEDULE_DAYS, daysBetween, isDue, leadStats, messageFor, needsDecision, nextDue, fillEmail, ensureFooter, openingTemplate } from '../src/lib/followup.js';

test('openingTemplate builds an honest, inbox-friendly first email for any business', () => {
  // A marketplace and a cleaning company: same template, each grounded in its own offer.
  for (const c of [
    { clientName: 'AutoAt', offer: 'AutoAt sends drivers to independent repair shops near them', hasLink: true },
    { clientName: 'LibraPro', offer: 'LibraPro keeps Michigan offices clean with one dependable crew', hasLink: false },
  ]) {
    const { subject, body } = openingTemplate(c);
    // Subject names both sides and never carries a spam-trigger word.
    assert.ok(subject.includes(c.clientName) && subject.includes('[Shop Name]'), 'subject names the client and the prospect');
    assert.doesNotMatch(subject, /\bfree\b|\$|%/i, 'no spam words in the subject');
    // Body is grounded in the business's own offer, with a greeting and no invented claims.
    assert.match(body, /^Hi \[First name\],/);
    assert.ok(body.includes(c.offer), 'the body uses the business\'s own offer');
    // Exactly one link placeholder when there is a booking link, and a reply fallback when not.
    assert.equal((body.match(/\{link\}/g) || []).length, c.hasLink ? 1 : 0);
    if (!c.hasLink) assert.match(body, /just reply/);
    // After filling for a real prospect, no square-bracket or curly placeholder is left behind.
    const filled = ensureFooter(
      fillEmail(body, { name: 'Joe\'s Garage', city: 'Troy', clientName: c.clientName, claimUrl: c.hasLink ? 'https://x.co/claim/1' : '', address: '1 Main St, Troy, MI' }),
      { address: '1 Main St, Troy, MI' },
    );
    assert.doesNotMatch(filled, /\[[^\]]*\]|\{[^}]*\}/, 'every placeholder is filled in the sent email');
    if (c.hasLink) assert.ok(filled.includes('https://x.co/claim/1'), 'the booking link is in the email');
    assert.match(filled, /rather not hear from us/, 'the legal opt-out is present');
  }
});

test('outreach schedule: first message, then 3, 7 and 14 days later', () => {
  assert.deepEqual(SCHEDULE_DAYS, [0, 3, 7, 14]);
  assert.equal(nextDue('2026-11-13', 0), '2026-11-13');
  assert.equal(nextDue('2026-11-13', 1), '2026-11-16');
  assert.equal(nextDue('2026-11-13', 3), '2026-11-27');
  assert.equal(nextDue('2026-11-13', 4), null);
  assert.equal(nextDue('2026-12-30', 2), '2027-01-06');
  assert.equal(daysBetween('2026-11-01', '2026-11-15'), 14);
});

test('only unanswered prospects come due; everyone else is left alone', () => {
  const lead = { received_on: '2026-11-10', touches_sent: 1, status: 'following_up' };
  assert.equal(isDue(lead, '2026-11-12'), false); // second touch due Nov 13
  assert.equal(isDue(lead, '2026-11-13'), true);
  for (const status of ['talking', 'introduced', 'won', 'lost', 'opted_out']) {
    assert.equal(isDue({ ...lead, status }, '2026-12-31'), false, status);
  }
  assert.equal(needsDecision({ status: 'following_up', touches_sent: 4 }), true);
  assert.equal(needsDecision({ status: 'opted_out', touches_sent: 4 }), false);
});

test('every message names the client, signs on its behalf and offers an opt-out with the address', () => {
  const ctx = {
    leadName: 'Pat Lee', clientName: 'AutoAt', senderName: 'Zaino',
    offer: 'AutoAt sends drivers to independent repair shops near them, free to join.',
    need: 'Empty bays on weekdays', address: '123 Main St, Detroit, MI 48201',
  };
  const all = SCHEDULE_DAYS.map((_, i) => messageFor(i, ctx));
  assert.equal(new Set(all).size, SCHEDULE_DAYS.length);
  for (const m of all) {
    assert.match(m, /^Hi Pat,/);
    assert.match(m, /AutoAt/);
    assert.match(m, /Zaino\nOn behalf of AutoAt/);
    assert.match(m, /reply "no thanks" and we won't contact you again\.\n123 Main St, Detroit, MI 48201$/);
  }
  assert.match(all[0], /free to join\. I thought it could help with empty bays on weekdays\./);
  assert.match(messageFor(0, { clientName: 'LibraPro' }), /^Hi there,[\s\S]*I work with LibraPro\./);
  for (const business of ['Tower Dental', "Al Dean's Auto Repair", 'Maple Offices', 'A2Z Complete Car Care', 'GREENFIELD LLC'])
    assert.match(messageFor(0, { ...ctx, leadName: business }), /^Hi there,/, business);
  assert.match(messageFor(0, { ...ctx, leadName: "Mary O'Brien" }), /^Hi Mary,/);
  assert.match(messageFor(0, { clientName: 'X', need: 'HVAC work' }), /help with HVAC work\./);
});

test('pipeline numbers', () => {
  const s = leadStats([
    { status: 'won', touches_sent: 2, introduced_on: '2026-11-01' },
    { status: 'introduced', touches_sent: 1, introduced_on: '2026-11-05' },
    { status: 'talking', touches_sent: 1 },
    { status: 'lost', touches_sent: 4, lost_reason: 'No response' },
    { status: 'new', touches_sent: 0 },
  ]);
  assert.deepEqual(s, { total: 5, reached: 4, replied: 3, introduced: 2, customers: 1, customerRate: 25 });
  assert.equal(leadStats([]).customerRate, null);
});

test('fillEmail replaces placeholders and adds a greeting if missing', async () => {
  const { fillEmail } = await import('../src/lib/followup.js');
  assert.equal(fillEmail('Hi {first_name}, claim {business} today.', { name: 'Pat Park', clientName: 'AutoAt' }), 'Hi Pat, claim AutoAt today.');
  assert.equal(fillEmail('We can help.', { name: 'Dana Lee' }), 'Hi Dana,\n\nWe can help.');
  assert.equal(fillEmail('Hello {name}.', { name: 'Sam' }), 'Hello Sam.');
});

test('fillEmail handles bracket placeholders, claim link, and ensureFooter adds the legal line', async () => {
  const { fillEmail, ensureFooter } = await import('../src/lib/followup.js');
  const tmpl = 'Hi [First name],\n\nAutoAt helps [Shop Name] in [City]. Claim here:\n[Claim your free shop account]\n\nThanks,\nZain';
  const filled = fillEmail(tmpl, { name: 'Tower Dental', city: 'Troy', clientName: 'AutoAt', claimUrl: 'https://autoat.app/claim' });
  assert.match(filled, /Hi there,/);                       // no contact name -> generic greeting
  assert.match(filled, /helps Tower Dental in Troy/);
  assert.match(filled, /Claim here:\nhttps:\/\/autoat\.app\/claim/);
  assert.match(filled, /Thanks,\nZain$/);                   // keeps the owner's own sign-off
  const withFooter = ensureFooter(filled, { address: '1 Main St, Troy, MI' });
  assert.match(withFooter, /no thanks/);
  assert.match(withFooter, /1 Main St, Troy, MI$/);
  // does not duplicate when the owner already included them
  const already = ensureFooter('Body\n\nreply "no thanks" to stop.\n1 Main St, Troy, MI', { address: '1 Main St, Troy, MI' });
  assert.equal((already.match(/no thanks/g) || []).length, 1);
  assert.equal((already.match(/1 Main St/g) || []).length, 1);
});

test('fillEmail greets a body but never a subject line', () => {
  const body = fillEmail('Claim your free {company} listing', { clientName: 'AutoAt' });
  assert.match(body, /^Hi there,/); // a body gets a greeting
  const subject = fillEmail('Claim your free {company} listing', { clientName: 'AutoAt' }, false);
  assert.equal(subject, 'Claim your free AutoAt listing'); // a subject does not
  assert.ok(!/^Hi/.test(subject));
});
