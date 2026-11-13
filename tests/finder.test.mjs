import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contactPages, hostOf, isExcluded, isPrivateAddress, parseExclude, pickAbout, pickEmail, scoreCandidate } from '../src/lib/finder.js';

test('exclusions skip chains by name', () => {
  const ex = parseExclude(' Midas, Jiffy Lube ,,Firestone');
  assert.deepEqual(ex, ['midas', 'jiffy lube', 'firestone']);
  assert.equal(isExcluded('Midas Auto Service Experts', ex), true);
  assert.equal(isExcluded("Al Dean's Auto Repair", ex), false);
});

test('score favors reachable, well-run, not saturated businesses', () => {
  const best = scoreCandidate({ website: 'https://a.com', email: 'info@a.com', phone: '1', rating: 4.6, reviews: 80 });
  assert.equal(best.score, 100);
  const bare = scoreCandidate({ operational: false });
  assert.equal(bare.score, 0);
  const huge = scoreCandidate({ website: 'x', rating: 4.8, reviews: 2400 });
  assert.equal(huge.score, 50, 'thousands of reviews: already busy, no review bonus');
  assert.ok(best.reasons.includes('public email found'));
});

test('email picking prefers the business own general inbox and ignores junk', () => {
  const html = `
    <a href="mailto:Owner.Jim@gmail.com">Jim</a>
    <img src="logo@2x.png"> <p>Write us: info&#64;deanauto.com or service [at] deanauto.com</p>
    <script>sentry@sentry.io</script> example@example.com`;
  assert.equal(pickEmail(html, 'https://www.DeanAuto.com/'), 'info@deanauto.com');
  assert.equal(pickEmail('<p>jim@gmail.com</p>', 'https://deanauto.com'), 'jim@gmail.com');
  assert.equal(pickEmail('<p>nothing here</p>', 'https://x.com'), '');
  assert.equal(hostOf('not a url'), '');
});

test('about line comes from the meta description, else the title', () => {
  assert.equal(pickAbout('<meta name="description" content="Family-owned repair shop since 1987 &amp; ASE certified">'), 'Family-owned repair shop since 1987 & ASE certified');
  assert.equal(pickAbout('<meta content="Detailing and ceramic coatings in Raleigh" property="og:description">'), 'Detailing and ceramic coatings in Raleigh');
  assert.equal(pickAbout('<title> Sqeeks Detail | Columbus </title>'), 'Sqeeks Detail | Columbus');
  assert.equal(pickAbout(''), '');
});

test('contact pages to check', () => {
  assert.deepEqual(contactPages('https://shop.com/home'), ['https://shop.com/home', 'https://shop.com/contact', 'https://shop.com/contact-us']);
  assert.deepEqual(contactPages('bad'), []);
});

test('private and internal addresses are never fetched', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '::1', 'fd00::1', '::ffff:127.0.0.1', '0.0.0.0']) {
    assert.equal(isPrivateAddress(ip), true, ip);
  }
  for (const ip of ['8.8.8.8', '172.32.0.1', '2606:4700::1111']) assert.equal(isPrivateAddress(ip), false, ip);
});
