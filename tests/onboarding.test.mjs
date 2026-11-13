import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUESTIONS, buildScript, buildTargets, missingAnswers, objectionPairs } from '../src/lib/onboarding.js';
import { detectObjections, scriptAnswer } from '../src/lib/playbook.js';

test('every question has an ask and a reason; keys are unique', () => {
  assert.equal(new Set(QUESTIONS.map((q) => q.key)).size, QUESTIONS.length);
  for (const q of QUESTIONS) assert.ok(q.ask && q.why, q.key);
});

test('targets: every type in every place, bullets and blanks ignored, capped', () => {
  assert.deepEqual(buildTargets('- dental office\nmedical clinic\n', 'Troy, MI\n\n• 48084'), [
    { what: 'dental office', location: 'Troy, MI' }, { what: 'medical clinic', location: 'Troy, MI' },
    { what: 'dental office', location: '48084' }, { what: 'medical clinic', location: '48084' },
  ]);
  assert.equal(buildTargets('a\nb\nc', Array.from({ length: 30 }, (_, i) => `City ${i}`).join('\n')).length, 40);
});

test('script reads their answers and works with the call coach', () => {
  const get = (k) => ({ objection1: 'We already have a cleaner', answer1: 'Most of our customers did too; what would you change about them' }[k]);
  const script = buildScript({
    name: 'Shine Co', offer: 'We clean medical offices across Metro Detroit', why_us: '- Same crew every night\nOne point of contact',
    first_step: 'Free walkthrough', who: 'Dental office', objections: objectionPairs(get),
  });
  assert.match(script, /^Opening: Hi, this is \[your name\], calling on behalf of Shine Co\. We clean medical offices across Metro Detroit\. Do you have 30 seconds\?/);
  assert.match(script, /- Same crew every night\.\n- One point of contact\./);
  assert.match(script, /How does your dental office decide/);
  assert.match(script, /Ask for: a free walkthrough this week\.$/);
  // Their own answer is used for "already have", defaults fill price and send-info.
  assert.equal(scriptAnswer(script, 'incumbent'), 'Most of our customers did too; what would you change about them.');
  assert.match(scriptAnswer(script, 'price'), /free walkthrough is free/);
  assert.match(scriptAnswer(script, 'send_info'), /pencil in a free walkthrough/);
  assert.deepEqual(detectObjections('we already have a cleaner'), ['incumbent']);
});

test('missing required answers are listed', () => {
  const answers = { name: 'Shine Co', offer: 'x' };
  const missing = missingAnswers((k) => answers[k]);
  assert.ok(missing.includes('Who are your best customers? List the types of businesses.'));
  assert.ok(!missing.includes('What is the business called?'));
});
