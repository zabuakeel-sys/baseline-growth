import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  brief, detectObjections, funnel, goalProgress, lossReasons, openingQuestion, parsePricingLines, quote, routeLink, scriptAnswer, streak,
} from '../src/lib/playbook.js';

test('quote: rate x size x visits, minimum, range, rounded to $10', () => {
  const rules = { types: [{ name: 'Office', ratePer1000Cents: 4500 }], minimumCents: 40000, rangePercent: 10 };
  // 20,000 sq ft, 5 visits a week: 45 * 20 * 5 * 4.333 = $19,500 a month
  assert.deepEqual(quote(rules, { type: 'Office', sqft: 20000, visitsPerWeek: 5 }), { lowCents: 1755000, highCents: 2145000, midCents: 1950000 });
  // Tiny building falls back to the $400 minimum
  assert.equal(quote(rules, { type: 'Office', sqft: 500, visitsPerWeek: 1 }).midCents, 40000);
  assert.equal(quote(rules, { type: 'Warehouse', sqft: 1000, visitsPerWeek: 1 }), null);
  assert.equal(quote(null, { type: 'Office', sqft: 1000, visitsPerWeek: 1 }), null);
});

test('pricing lines parse and report what they cannot read', () => {
  const { types, errors } = parsePricingLines('Office: 45\nMedical = $60.50\n\nnonsense');
  assert.deepEqual(types, [{ name: 'Office', ratePer1000Cents: 4500 }, { name: 'Medical', ratePer1000Cents: 6050 }]);
  assert.equal(errors.length, 1);
});

test('brief is built only from known data', () => {
  const b = brief({
    notes: 'Family-owned repair shop since 1987\nhttps://dean.example', rating: 4.7, reviews: 22, touches_sent: 2, activity: [],
    status: 'following_up', client_name: 'AutoAt', need: 'Empty bays on weekdays',
  });
  assert.deepEqual(b, [
    'Who: Family-owned repair shop since 1987',
    'Signals: 4.7 stars from 22 reviews: well liked but not widely known.',
    'History: 2 emails sent, no reply yet.',
    'Ask: Is empty bays on weekdays something you are dealing with right now?',
  ]);
  const replied = brief({ notes: '', last_reply: 'Yes call me\n\nOn Tue wrote:\n> x', last_reply_kind: 'reply', status: 'talking', activity: [] });
  assert.equal(replied[0], 'They wrote: "Yes call me"');
  assert.match(openingQuestion({ status: 'introduced', client_name: 'LibraPro' }), /Did LibraPro reach you/);
});

test('route link keeps order, caps at 10 stops, and is empty without addresses', () => {
  const link = routeLink(['1 A St, Troy, MI', '', '2 B St, Troy, MI', '3 C St, Troy, MI']);
  const u = new URL(link);
  assert.equal(u.origin + u.pathname, 'https://www.google.com/maps/dir/');
  assert.equal(u.searchParams.get('destination'), '3 C St, Troy, MI');
  assert.equal(u.searchParams.get('waypoints'), '1 A St, Troy, MI|2 B St, Troy, MI');
  assert.equal(new URL(routeLink(Array.from({ length: 15 }, (_, i) => `${i} St`))).searchParams.get('destination'), '9 St');
  assert.equal(routeLink([]), null);
});

test('goals and streaks', () => {
  assert.deepEqual(goalProgress({ calls: 20, visits: 12, meetings: 0 }, { calls: 40, visits: 10, meetings: 2 }), { calls: 50, visits: 100, meetings: 0 });
  assert.equal(goalProgress({ calls: 5 }, { calls: 0 }).calls, null);
  const goals = { calls: 40, visits: 0, meetings: 0 };
  // Fri 13 Nov 2026 in progress (10 calls), Thu and Wed met, Tue missed
  const days = { '2026-11-13': { calls: 10 }, '2026-11-12': { calls: 41 }, '2026-11-11': { calls: 40 }, '2026-11-10': { calls: 3 } };
  assert.equal(streak(days, goals, '2026-11-13'), 2);
  // Monday counts back over the weekend
  assert.equal(streak({ '2026-11-16': { calls: 40 }, '2026-11-13': { calls: 40 } }, goals, '2026-11-16'), 2);
  assert.equal(streak(days, { calls: 0, visits: 0, meetings: 0 }, '2026-11-13'), 0);
});

test('loss reasons and funnel', () => {
  assert.deepEqual(lossReasons([{ lost_reason: 'Price' }, { lost_reason: 'Price' }, { lost_reason: 'Timing' }, {}]), [
    { reason: 'Price', count: 2, percent: 50 }, { reason: 'No reason given', count: 1, percent: 25 }, { reason: 'Timing', count: 1, percent: 25 },
  ]);
  const f = funnel({
    leads: [{ id: 1, status: 'won', touches_sent: 1 }, { id: 2, status: 'lost', touches_sent: 4 }, { id: 3, status: 'new', touches_sent: 0 }, { id: 4, status: 'following_up', touches_sent: 0 }],
    activities: [{ lead_id: 4, outcome: 'no_answer' }, { lead_id: 2, outcome: 'not_interested' }],
    meetings: [{ lead_id: 1, status: 'held' }, { lead_id: 1, status: 'no_show' }],
  });
  assert.deepEqual(f, { prospects: 4, reached: 3, conversations: 2, meetingsHeld: 1, customers: 1 });
});

test('objections are detected and answered from the script', () => {
  assert.deepEqual(detectObjections("Honestly it sounds expensive and we already have a cleaner"), ['price', 'incumbent']);
  assert.deepEqual(detectObjections('Can you just send me some info?'), ['send_info']);
  assert.deepEqual(detectObjections('Tell me more about how it works'), []);
  const script = 'Opening: Hi\nIf they say "we already have someone": Most of our customers did too; what would you change about them?\nIf price comes up:\nWe quote after a free walkthrough, so you only compare real numbers.';
  assert.equal(scriptAnswer(script, 'incumbent'), 'Most of our customers did too; what would you change about them?');
  assert.equal(scriptAnswer(script, 'price'), 'We quote after a free walkthrough, so you only compare real numbers.');
  assert.equal(scriptAnswer(script, 'timing'), '');
});
