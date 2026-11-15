import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestPlay } from '../src/lib/suggestPlay.js';
import { applyPlay, getPlay } from '../src/lib/plays.js';
import { fillEmail } from '../src/lib/followup.js';
import { scoreCandidate, fitReasons } from '../src/lib/finder.js';
import { moveSequence } from '../src/lib/moves.js';
import { bestCallTime } from '../src/lib/calltime.js';

// A spread of client types runs the whole setup end to end, so a new business type cannot slip
// through with a broken email, a bad score, or a crash.
const TYPES = [
  { biz: 'AutoAt', info: { name: 'AutoAt', offer: 'A marketplace where drivers find and book a repair shop' } },
  { biz: 'LibraPro Facility Services', info: { text: 'Commercial cleaning and janitorial for offices' } },
  { biz: 'BookEasy', info: { offer: 'Scheduling software and a booking platform for salons' } },
  { biz: 'Keystone CPA', info: { text: 'Accounting and bookkeeping for small businesses' } },
  { biz: 'Rivertown Roasters', info: { text: 'We supply coffee and sample boxes to cafes' } },
  { biz: 'Acme Widgets', info: { name: 'Acme Widgets' } }, // no confident play; owner would pick
];

test('every business type runs the full setup without a broken email or a crash', () => {
  for (const t of TYPES) {
    const s = suggestPlay(t.info);
    const playKey = s ? s.key : 'free_quote'; // a safe default when nothing matches
    assert.ok(getPlay(playKey), `${t.biz}: unknown play ${playKey}`);

    const applied = applyPlay(playKey, { businessName: t.biz });
    assert.ok(applied, `${t.biz}: applyPlay returned null`);

    const email = fillEmail(applied.outreach_body, {
      firstName: 'Sam', name: "Al's Shop", city: 'Troy', clientName: t.biz, claimUrl: 'https://x.example/go', address: '1 Main St, Troy, MI',
    });
    assert.ok(!/\{|\[/.test(email), `${t.biz}: leftover placeholder -> ${email}`);
    assert.ok(email.includes(t.biz), `${t.biz}: email never names the business`);
    assert.ok(email.includes('https://x.example/go'), `${t.biz}: email has no booking link`);

    const { score, reasons } = scoreCandidate({ website: 'https://x.com', email: 'a@x.com', phone: '1', rating: 4.5, reviews: 60 }, playKey);
    assert.ok(score >= 0 && score <= 100, `${t.biz}: score out of range ${score}`);
    assert.ok(Array.isArray(reasons) && reasons.every((r) => typeof r === 'string'));
    assert.ok(fitReasons({ website: 'https://x.com', reviews: 5 }, playKey).every((r) => typeof r === 'string'));

    const seq = moveSequence({ play: playKey, business: t.biz, name: "Al's Shop", address: '1 Main St', contactName: 'Jo Lee' });
    assert.ok(seq.length >= 1 && seq[0].channel === 'linkedin', `${t.biz}: broken move sequence`);

    const ct = bestCallTime({ name: t.biz, need: '', notes: t.info.text || '' });
    assert.ok(ct.when && ct.avoid, `${t.biz}: no call-time window`);
  }
});

test('thin or empty inputs never crash the setup helpers', () => {
  assert.equal(suggestPlay({}), null);
  assert.deepEqual(Object.keys(bestCallTime()), ['when', 'avoid']);
  assert.ok(moveSequence({}).length >= 1);
  assert.deepEqual(fitReasons({}, ''), []);
  const a = applyPlay('free_demo', { businessName: '' });
  assert.ok(a && !a.outreach_body.includes('{business}'), 'empty name should still fill the token');
});
