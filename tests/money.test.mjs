import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatCents, parseDollarsToCents, parsePercent, parseWholeNumber } from '../src/lib/money.js';

test('dollars parse to whole cents', () => {
  assert.equal(parseDollarsToCents('3500'), 350000);
  assert.equal(parseDollarsToCents('$3,500.5'), 350050);
  assert.equal(parseDollarsToCents(' 0.07 '), 7);
  assert.equal(parseDollarsToCents(''), null);
  assert.ok(Number.isNaN(parseDollarsToCents('12.345')));
  assert.ok(Number.isNaN(parseDollarsToCents('-5')));
  assert.ok(Number.isNaN(parseDollarsToCents('abc')));
});

test('cents format for people', () => {
  assert.equal(formatCents(350000), '$3,500');
  assert.equal(formatCents(350050), '$3,500.50');
  assert.equal(formatCents(null), 'Not set');
});

test('percent stays within 0 to 100', () => {
  assert.equal(parsePercent('15'), 15);
  assert.equal(parsePercent('15.5%'), 15.5);
  assert.equal(parsePercent(''), null);
  assert.ok(Number.isNaN(parsePercent('101')));
  assert.ok(Number.isNaN(parsePercent('-1')));
});

test('whole numbers reject fractions and negatives', () => {
  assert.equal(parseWholeNumber('1,200'), 1200);
  assert.equal(parseWholeNumber(''), null);
  assert.ok(Number.isNaN(parseWholeNumber('2.5')));
  assert.ok(Number.isNaN(parseWholeNumber('-3')));
});
