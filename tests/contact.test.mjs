import { test } from 'node:test';
import assert from 'node:assert/strict';
import { domainOf, isUsableEmail, looksGeneric, titleRank, parseHunter, bestApolloPerson, mergeContacts } from '../src/lib/contact.js';

test('domainOf strips scheme, www, path, and reads an email domain', () => {
  assert.equal(domainOf('https://www.Troy-Dental.com/contact?x=1'), 'troy-dental.com');
  assert.equal(domainOf('jane@mapleridgelaw.com'), 'mapleridgelaw.com');
  assert.equal(domainOf('not a url'), '');
  assert.equal(domainOf(''), '');
});

test('isUsableEmail rejects Apollo locked placeholders and junk', () => {
  assert.equal(isUsableEmail('jane@shop.com'), true);
  assert.equal(isUsableEmail('email_not_unlocked@domain.com'), false);
  assert.equal(isUsableEmail('x@not_unlocked.com'), false);
  assert.equal(isUsableEmail('nope'), false);
  assert.equal(isUsableEmail(''), false);
});

test('looksGeneric spots role inboxes', () => {
  assert.equal(looksGeneric('info@shop.com'), true);
  assert.equal(looksGeneric('office@shop.com'), true);
  assert.equal(looksGeneric('jane@shop.com'), false);
});

test('titleRank ranks an owner above a manager above nothing', () => {
  assert.ok(titleRank('Owner') > titleRank('Office Manager'));
  assert.ok(titleRank('Office Manager') > titleRank('Receptionist'));
  assert.equal(titleRank(''), 0);
  assert.ok(titleRank('Founder & CEO') >= 90);
});

test('parseHunter picks the most senior personal email', () => {
  const c = parseHunter({ data: { emails: [
    { value: 'info@shop.com', type: 'generic', confidence: 90, position: '' },
    { value: 'jane@shop.com', type: 'personal', confidence: 88, first_name: 'Jane', last_name: 'Doe', position: 'Owner' },
    { value: 'bob@shop.com', type: 'personal', confidence: 95, first_name: 'Bob', last_name: 'Roe', position: 'Technician' },
  ] } });
  assert.equal(c.email, 'jane@shop.com');
  assert.equal(c.name, 'Jane Doe');
  assert.equal(c.title, 'Owner');
  assert.equal(c.source, 'hunter');
  assert.equal(parseHunter({ data: { emails: [] } }), null);
  assert.equal(parseHunter({}), null);
});

test('bestApolloPerson prefers the senior person and keeps the name when email is locked', () => {
  const c = bestApolloPerson([
    { name: 'Al Tech', title: 'Technician', email: 'al@shop.com' },
    { name: 'Mo Boss', title: 'Owner', email: 'email_not_unlocked@domain.com' },
  ]);
  assert.equal(c.name, 'Mo Boss');
  assert.equal(c.title, 'Owner');
  assert.equal(c.email, ''); // locked -> dropped, but we still know who to ask for
  assert.equal(bestApolloPerson([]), null);
});

test('mergeContacts takes the senior name and the best own-domain personal email', () => {
  const merged = mergeContacts([
    { email: 'info@shop.com', name: '', title: '', source: 'website' },
    { email: '', name: 'Mo Boss', title: 'Owner', source: 'apollo' },
    { email: 'mo@shop.com', name: 'Mo Boss', title: 'Owner', source: 'hunter' },
  ], 'shop.com');
  assert.equal(merged.contactName, 'Mo Boss');
  assert.equal(merged.contactTitle, 'Owner');
  assert.equal(merged.email, 'mo@shop.com'); // personal own-domain beats info@
  assert.ok(merged.source.includes('apollo') || merged.source.includes('hunter'));
});

test('mergeContacts falls back to a role inbox when no person email exists', () => {
  const merged = mergeContacts([{ email: 'office@shop.com', name: '', title: '', source: 'website' }], 'shop.com');
  assert.equal(merged.email, 'office@shop.com');
  assert.equal(merged.contactName, '');
  assert.equal(mergeContacts([], 'shop.com'), null);
  assert.equal(mergeContacts([{ email: 'bad', name: '', title: '' }], 'shop.com'), null);
});
