import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contactPages, hostOf, isExcluded, isPrivateAddress, parseExclude, pickAbout, pickEmail, scoreCandidate, fitReasons } from '../src/lib/finder.js';

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
  // No play -> base score unchanged (existing behavior).
  assert.equal(scoreCandidate({ website: 'x', rating: 4.8, reviews: 2400 }, '').score, 50);
});

test('play-aware fit lifts the prospects that fit the strategy', () => {
  // For a marketplace (claim a listing), a shop with NO website and few reviews is a prime target.
  const noSite = { phone: '1', reviews: 3, operational: true };
  assert.ok(scoreCandidate(noSite, 'claim_listing').score > scoreCandidate(noSite, '').score, 'listing play should boost a no-website shop');
  // For software, having a website is the positive signal instead.
  const hasSite = { website: 'https://x.com', phone: '1', reviews: 150 };
  assert.ok(scoreCandidate(hasSite, 'free_demo').reasons.some((r) => /open to software/.test(r)));
  // Score never exceeds 100.
  assert.ok(scoreCandidate({ website: 'x', email: 'a@b.com', phone: '1', rating: 4.6, reviews: 80 }, 'free_demo').score <= 100);
});

test('fitReasons explains why a prospect suits the play, and is empty without one', () => {
  assert.deepEqual(fitReasons({ reviews: 2 }, ''), []);
  assert.ok(fitReasons({ reviews: 2 }, 'claim_listing').some((r) => /need more customers/.test(r)));
  assert.ok(fitReasons({ website: 'https://x.com' }, 'free_consultation').some((r) => /established and reachable/.test(r)));
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
