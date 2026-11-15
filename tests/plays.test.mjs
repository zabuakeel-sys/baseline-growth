import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLAYS, PLAY_KEYS, getPlay, applyPlay } from '../src/lib/plays.js';
import { fillEmail } from '../src/lib/followup.js';

test('every play has the fields a business needs and a send-ready email', () => {
  for (const p of PLAYS) {
    for (const k of ['key', 'name', 'best_for', 'rhythm', 'goal', 'offer', 'first_step', 'claim_label', 'subject', 'body']) {
      assert.ok(String(p[k] ?? '').trim(), `${p.key} missing ${k}`);
    }
    assert.equal(typeof p.visits, 'boolean');
    // The email must carry a claim/booking link placeholder for the booking URL to drop in.
    assert.match(p.body, /\[[^\]]*\b(claim|book|get|request|start|see)\b[^\]]*\]/i, `${p.key} email has no booking link placeholder`);
  }
});

test('every play fills to a clean, send-ready email (no leftover placeholders)', () => {
  for (const p of PLAYS) {
    const r = applyPlay(p.key, { businessName: 'Acme Co' });
    const sent = fillEmail(r.outreach_body, { firstName: 'Sam', name: "Al's Shop", city: 'Troy', clientName: 'Acme Co', claimUrl: 'https://acme.example/go', address: '1 Main St, Troy, MI' });
    assert.ok(!/\{|\[/.test(sent), `${p.key} left a placeholder: ${sent}`);
    assert.ok(sent.includes('https://acme.example/go'), `${p.key} dropped the booking link`);
    assert.ok(!sent.includes('{business}') && sent.includes('Acme Co'), `${p.key} business name not filled`);
  }
});

test('applyPlay bakes the business name into the strategy and email', () => {
  const r = applyPlay('claim_listing', { businessName: 'AutoAt' });
  assert.equal(r.play, 'claim_listing');
  assert.equal(r.visits, false);
  assert.match(r.goal, /AutoAt/);
  assert.match(r.outreach_subject, /Claim your free AutoAt listing/);
  assert.match(r.outreach_body, /AutoAt/);
  assert.ok(!r.outreach_body.includes('{business}'), 'business token should be filled');
  // Per-prospect placeholders stay for send time.
  assert.match(r.outreach_body, /\{first_name\}|\{name\}/);
});

test('applyPlay walkthrough turns on visits', () => {
  const r = applyPlay('free_walkthrough', { businessName: 'LibraPro' });
  assert.equal(r.visits, true);
  assert.match(r.outreach_subject, /LibraPro|walkthrough/i);
});

test('a filled play email renders cleanly for one prospect', () => {
  const r = applyPlay('claim_listing', { businessName: 'AutoAt' });
  const sent = fillEmail(r.outreach_body, { name: "Al's Auto Repair", city: 'Detroit', clientName: 'AutoAt', claimUrl: 'https://autoat.org/claim' });
  assert.ok(!/\{|\[/.test(sent), `unfilled placeholder left: ${sent}`);
  assert.match(sent, /Al's Auto Repair/);
  assert.match(sent, /https:\/\/autoat\.org\/claim/);
  assert.match(sent, /^Hi there,/); // business name, so no first name
});

test('getPlay and PLAY_KEYS agree, unknown key is null', () => {
  assert.deepEqual(PLAY_KEYS, PLAYS.map((p) => p.key));
  assert.equal(getPlay('nope'), null);
  assert.equal(applyPlay('nope', { businessName: 'X' }), null);
});
