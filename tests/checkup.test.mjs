import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AREAS, areaScore, buildPlan, fieldName, readAnswers, scoreCheckup } from '../src/lib/checkup.js';

const allAnswers = (value) => Object.fromEntries(AREAS.map((a) => [a.key, a.statements.map(() => value)]));

test('area score spans 0 to 100', () => {
  assert.equal(areaScore([1, 1, 1]), 0);
  assert.equal(areaScore([5, 5, 5]), 100);
  assert.equal(areaScore([3, 3, 3]), 50);
  assert.equal(areaScore([2, 3, 4]), 50);
});

test('every area has three statements and a plan step in its first month', () => {
  for (const a of AREAS) {
    assert.equal(a.statements.length, 3, a.key);
    assert.ok(a.plan.some((s) => s.month === 1), a.key);
  }
});

test('readAnswers flags blanks and out-of-range ratings', () => {
  const form = { [fieldName('found', 0)]: '6', [fieldName('found', 1)]: '' };
  const { missing } = readAnswers((k) => form[k] ?? null);
  assert.equal(missing.length, 15);
  const full = {};
  for (const a of AREAS) a.statements.forEach((_, i) => { full[fieldName(a.key, i)] = '4'; });
  const ok = readAnswers((k) => full[k]);
  assert.equal(ok.missing.length, 0);
  assert.deepEqual(ok.answers.found, [4, 4, 4]);
});

test('one clear problem gets the whole plan', () => {
  const a = allAnswers(4);
  a.convert = [1, 1, 2]; // 8
  const { focus } = scoreCheckup(a);
  assert.deepEqual(focus, ['convert']);
});

test('two close problems share the plan, lowest first', () => {
  const a = allAnswers(5);
  a.repeat = [2, 2, 2]; // 25
  a.found = [2, 3, 2]; // 33
  assert.deepEqual(scoreCheckup(a).focus, ['repeat', 'found']);
});

test('a healthy business gets no forced focus', () => {
  assert.deepEqual(scoreCheckup(allAnswers(4)).focus, []);
});

test('ties follow the customer path order', () => {
  assert.deepEqual(scoreCheckup(allAnswers(2)).focus, ['found', 'convert']);
});

test('plan groups the focus actions by month', () => {
  const plan = buildPlan(['convert']);
  assert.equal(plan.length, 3);
  assert.equal(plan[0].items.length, 2);
  assert.ok(plan.every((m) => m.items.every((i) => i.area === 'Turning inquiries into sales')));
  assert.deepEqual(buildPlan([]).map((m) => m.items.length), [0, 0, 0]);
});
