// "2nd Friday of the month", "last Friday" and "until" rules (these came from the live Board's repeating notes).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { occurrences, nextOccurrence, repeatLabel, rrule, fitRepeat } from './repeat.ts';

const d = (y: number, m: number, day: number, h = 19, mi = 0) => new Date(y, m - 1, day, h, mi);
const days = (ds: Date[]) => ds.map((x) => `${x.getMonth() + 1}/${x.getDate()}`);

test('monthly on the 2nd Friday', () => {
  const occ = occurrences(d(2026, 11, 13), { freq: 'monthly', interval: 1, nth: 2 }, d(2026, 11, 1), d(2027, 2, 28));
  assert.deepEqual(days(occ), ['11/13', '12/11', '1/8', '2/12']);
  assert.ok(occ.every((x) => x.getDay() === 5 && x.getHours() === 19));
});

test('monthly on the last Friday', () => {
  const occ = occurrences(d(2026, 11, 27), { freq: 'monthly', interval: 1, nth: -1 }, d(2026, 11, 1), d(2027, 2, 28));
  assert.deepEqual(days(occ), ['11/27', '12/25', '1/29', '2/26']);
});

test('a 5th Friday rule skips months without one', () => {
  const r = { freq: 'monthly' as const, interval: 1, nth: 5 };
  const occ = occurrences(d(2027, 1, 29), r, d(2027, 1, 1), d(2027, 8, 1)); // Jan 29 2027 is a 5th Friday
  assert.deepEqual(days(occ), ['1/29', '4/30', '7/30']);
  assert.equal(days([nextOccurrence(d(2027, 1, 29), r, d(2027, 2, 1))!])[0], '4/30');
});

test('until ends the series on that day', () => {
  const r = { freq: 'weekly' as const, interval: 1, days: [2], until: '2026-12-01' };
  assert.deepEqual(days(occurrences(d(2026, 11, 17), r, d(2026, 11, 1), d(2027, 1, 1))), ['11/17', '11/24', '12/1']);
  assert.equal(nextOccurrence(d(2026, 11, 17), r, d(2026, 12, 2)), null);
});

test('labels and calendar export', () => {
  const fri = d(2026, 11, 13);
  assert.equal(repeatLabel({ freq: 'monthly', interval: 1, nth: 2 }, fri), 'Every month on the 2nd Fri');
  assert.equal(repeatLabel({ freq: 'monthly', interval: 1, nth: -1 }, d(2026, 11, 27)), 'Every month on the last Fri');
  assert.equal(repeatLabel({ freq: 'weekly', interval: 1, days: [3], until: '2027-03-31' }), 'Every Wed until Mar 31');
  assert.equal(rrule({ freq: 'monthly', interval: 1, nth: 2 }, fri), 'FREQ=MONTHLY;BYDAY=2FR');
  assert.equal(rrule({ freq: 'monthly', interval: 1, nth: -1, until: '2027-03-31' }, d(2026, 11, 27)), 'FREQ=MONTHLY;BYDAY=-1FR;UNTIL=20270331T235959');
});

test('moving the date keeps a 2nd / last weekday rule true to it', () => {
  assert.deepEqual(fitRepeat({ freq: 'monthly', interval: 1, nth: 2 }, d(2026, 11, 20)), { freq: 'monthly', interval: 1, nth: 3 });
  assert.deepEqual(fitRepeat({ freq: 'monthly', interval: 1, nth: -1 }, d(2026, 11, 27)), { freq: 'monthly', interval: 1, nth: -1 });
  assert.deepEqual(fitRepeat({ freq: 'monthly', interval: 1, nth: -1 }, d(2026, 11, 13)), { freq: 'monthly', interval: 1, nth: 2 });
  assert.deepEqual(fitRepeat({ freq: 'weekly', interval: 1, days: [1] }, d(2026, 11, 13)), { freq: 'weekly', interval: 1, days: [1] });
});
