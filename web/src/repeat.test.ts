import { test } from 'node:test';
import assert from 'node:assert/strict';
import { occurrences, nextOccurrence, effectiveDue, repeatLabel, rrule } from './repeat.ts';

const d = (y: number, m: number, day: number, h = 0, mi = 0) => new Date(y, m - 1, day, h, mi);

test('weekly on several days', () => {
  const start = d(2026, 11, 12, 19); // Thu
  const occ = occurrences(start, { freq: 'weekly', interval: 1, days: [1, 4] }, d(2026, 11, 1), d(2026, 12, 1));
  assert.deepEqual(occ.map((x) => x.getDate()), [12, 16, 19, 23, 26, 30]);
  assert.ok(occ.every((x) => x.getHours() === 19));
});

test('every 2 weeks keeps the pattern', () => {
  const occ = occurrences(d(2026, 11, 10, 9), { freq: 'weekly', interval: 2, days: [2] }, d(2026, 11, 1), d(2026, 12, 31));
  assert.deepEqual(occ.map((x) => `${x.getMonth() + 1}/${x.getDate()}`), ['11/10', '11/24', '12/8', '12/22']);
});

test('daily, monthly (clamped), yearly', () => {
  assert.equal(occurrences(d(2026, 1, 1, 8), { freq: 'daily', interval: 1 }, d(2026, 3, 1), d(2026, 3, 8)).length, 7);
  assert.deepEqual(occurrences(d(2026, 1, 1, 8), { freq: 'daily', interval: 3 }, d(2026, 1, 1), d(2026, 1, 11)).map((x) => x.getDate()), [1, 4, 7, 10]);
  const m = occurrences(d(2026, 1, 31, 10), { freq: 'monthly', interval: 1 }, d(2026, 1, 1), d(2026, 5, 1));
  assert.deepEqual(m.map((x) => x.getDate()), [31, 28, 31, 30]);
  const y = occurrences(d(2024, 2, 29, 10), { freq: 'yearly', interval: 1 }, d(2026, 1, 1), d(2029, 1, 1));
  assert.deepEqual(y.map((x) => `${x.getFullYear()}-${x.getMonth() + 1}-${x.getDate()}`), ['2026-2-28', '2027-2-28', '2028-2-29']);
});

test('time of day survives the clock change', () => {
  const occ = occurrences(d(2026, 10, 26, 19), { freq: 'weekly', interval: 1, days: [1] }, d(2026, 10, 1), d(2026, 11, 20));
  assert.ok(occ.length >= 3 && occ.every((x) => x.getHours() === 19 && x.getDay() === 1));
});

test('nextOccurrence / effectiveDue / one-offs', () => {
  const start = d(2026, 11, 12, 19);
  const r = { freq: 'weekly' as const, interval: 1, days: [1, 4] };
  assert.equal(nextOccurrence(start, r, d(2026, 11, 12, 20))!.getDate(), 16);
  assert.equal(nextOccurrence(start, r, d(2026, 1, 1))!.getDate(), 12);
  assert.equal(nextOccurrence(start, r, d(2031, 6, 1))!.getFullYear(), 2031);
  assert.equal(new Date(effectiveDue({ due_at: start.toISOString(), repeat: r }, d(2026, 11, 20))!).getDate(), 23);
  assert.equal(effectiveDue({ due_at: start.toISOString(), repeat: null }, d(2027, 1, 1)), start.toISOString());
  assert.equal(occurrences(start, null, d(2026, 11, 1), d(2026, 12, 1)).length, 1);
});

test('labels and RRULE', () => {
  assert.equal(repeatLabel({ freq: 'weekly', interval: 1, days: [4, 1] }), 'Every Mon, Thu');
  assert.equal(repeatLabel({ freq: 'weekly', interval: 1, days: [1, 2, 3, 4, 5] }), 'Every weekday');
  assert.equal(repeatLabel({ freq: 'weekly', interval: 2, days: [2] }), 'Every 2 weeks on Tue');
  assert.equal(repeatLabel({ freq: 'monthly', interval: 3 }), 'Every 3 months');
  assert.equal(rrule({ freq: 'weekly', interval: 2, days: [1, 4] }), 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH');
});
