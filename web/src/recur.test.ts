import { test } from 'node:test';
import assert from 'node:assert/strict';
import { occurrences, nextOccurrence, shownDate, describeRepeat, repeatChoices } from './recur.ts';

const iso = (y: number, m: number, d: number, h = 19, mi = 0) => new Date(y, m, d, h, mi).toISOString();
const days = (ds: Date[]) => ds.map((d) => `${d.getMonth() + 1}/${d.getDate()}`);
const ms = (y: number, m: number, d: number) => new Date(y, m, d).getTime();

test('weekly: every Tuesday at the same time', () => {
  const it = { due_at: iso(2026, 10, 17), repeat: 'weekly' as const };
  const o = occurrences(it, ms(2026, 10, 1), ms(2026, 11, 2));
  assert.deepEqual(days(o), ['11/17', '11/24', '12/1']);
  assert.ok(o.every((d) => d.getDay() === 2 && d.getHours() === 19));
});

test('biweekly skips a week', () => {
  const it = { due_at: iso(2026, 10, 17), repeat: 'biweekly' as const };
  assert.deepEqual(days(occurrences(it, 0, ms(2026, 11, 16))), ['11/17', '12/1', '12/15']);
});

test('monthly on the 31st lands on the last day of short months', () => {
  const it = { due_at: iso(2027, 0, 31), repeat: 'monthly' as const };
  assert.deepEqual(days(occurrences(it, 0, ms(2027, 4, 1))), ['1/31', '2/28', '3/31', '4/30']);
});

test('monthly on the 2nd Friday', () => {
  const it = { due_at: iso(2026, 10, 13), repeat: 'monthly-nth' as const }; // Nov 13 2026 is the 2nd Friday
  assert.deepEqual(days(occurrences(it, 0, ms(2027, 1, 28))), ['11/13', '12/11', '1/8', '2/12']);
});

test('monthly on the last Friday', () => {
  const it = { due_at: iso(2026, 10, 27), repeat: 'monthly-last' as const };
  assert.deepEqual(days(occurrences(it, 0, ms(2027, 1, 28))), ['11/27', '12/25', '1/29', '2/26']);
});

test('repeat_until ends the series on that day', () => {
  const it = { due_at: iso(2026, 10, 17), repeat: 'weekly' as const, repeat_until: iso(2026, 11, 1, 0) };
  assert.deepEqual(days(occurrences(it, 0, Infinity)), ['11/17', '11/24', '12/1']);
  assert.equal(nextOccurrence(it, ms(2026, 11, 2)), null);
});

test('a series that started long ago still finds the next one', () => {
  const it = { due_at: iso(2020, 0, 7), repeat: 'weekly' as const }; // a Tuesday
  const n = nextOccurrence(it, ms(2026, 10, 15))!;
  assert.equal(days([n])[0], '11/17');
  assert.equal(n.getHours(), 19);
});

test('shownDate: next occurrence from today, including later today', () => {
  const it = { due_at: iso(2026, 10, 3), repeat: 'weekly' as const };
  assert.equal(days([shownDate(it, new Date(2026, 10, 17, 12))!])[0], '11/17');
  assert.equal(days([shownDate(it, new Date(2026, 10, 18, 12))!])[0], '11/24');
  assert.equal(days([shownDate({ due_at: iso(2026, 10, 3) }, new Date(2026, 10, 18))!])[0], '11/3');
});

test('labels and choices', () => {
  const tue = new Date(2026, 10, 17);
  assert.equal(describeRepeat('weekly', tue), 'Every Tuesday');
  assert.equal(describeRepeat('monthly-nth', tue), 'Monthly on the 3rd Tuesday');
  assert.equal(describeRepeat('monthly', tue), 'Monthly on the 17th');
  assert.ok(!repeatChoices(tue).includes('monthly-last'));
  assert.ok(repeatChoices(new Date(2026, 10, 24)).includes('monthly-last'));
});
