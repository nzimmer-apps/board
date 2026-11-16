import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseInput, parseAll, parseRows, findEventDate } from './parse.ts';

// Thursday 2026-11-12 10:00 local
const NOW = new Date(2026, 10, 12, 10, 0, 0);

test('dart league: one weekly item per time, with custom notification times', () => {
  const all = parseAll('every week I have dart league at 6 pm sundays, 7 pm monday and thursdays, please give notification 2 hours and 8 hours ahead of time.', NOW);
  assert.equal(all.length, 2);
  assert.equal(all[0].body, 'dart league');
  assert.deepEqual(all[0].repeat, { freq: 'weekly', interval: 1, days: [0] });
  assert.deepEqual(all[1].repeat, { freq: 'weekly', interval: 1, days: [1, 4] });
  const a = new Date(all[0].due_at!);
  const b = new Date(all[1].due_at!);
  assert.equal(a.getDay(), 0);
  assert.equal(a.getHours(), 18);
  // NOW is Thursday 10:00, so the first Mon/Thu 7 PM is tonight
  assert.equal(b.getDay(), 4);
  assert.equal(b.getHours(), 19);
  assert.equal(b.getDate(), 12);
  assert.deepEqual(all[0].remind, [120, 480]);
  assert.equal(all[0].kind, 'event');
  assert.equal(all[0].all_day, false);
});

test('days before times', () => {
  const all = parseAll('gym sundays at 6pm, mondays and thursdays at 7:30 pm #health', NOW);
  assert.equal(all.length, 2);
  assert.equal(all[0].body, 'gym');
  assert.deepEqual(all[0].repeat?.days, [0]);
  assert.deepEqual(all[1].repeat?.days, [1, 4]);
  assert.equal(new Date(all[1].due_at!).getMinutes(), 30);
  assert.deepEqual(all[0].tags, ['health']);
});

test('every monday / every other / daily / weekday / monthly', () => {
  let p = parseInput('team sync every monday 9am', NOW);
  assert.deepEqual(p.repeat, { freq: 'weekly', interval: 1, days: [1] });
  assert.equal(p.body, 'team sync');
  assert.equal(new Date(p.due_at!).getDate(), 16);

  p = parseInput('put bins out every other tuesday', NOW);
  assert.deepEqual(p.repeat, { freq: 'weekly', interval: 2, days: [2] });
  assert.equal(p.all_day, true);
  assert.equal(p.body, 'put bins out');

  p = parseInput('take vitamins daily 8am', NOW);
  assert.deepEqual(p.repeat, { freq: 'daily', interval: 1 });
  assert.equal(new Date(p.due_at!).getDate(), 13); // 8am already passed today

  p = parseInput('standup every weekday 9:15am', NOW);
  assert.deepEqual(p.repeat, { freq: 'weekly', interval: 1, days: [1, 2, 3, 4, 5] });
  assert.equal(new Date(p.due_at!).getDay(), 5);

  p = parseInput('pay rent every month on the 1st', NOW);
  assert.equal(p.repeat?.freq, 'monthly');
  assert.equal(new Date(p.due_at!).getDate(), 1);
  assert.equal(new Date(p.due_at!).getMonth(), 11);
  assert.equal(p.body, 'pay rent');

  p = parseInput('review budget every 3 months', NOW);
  assert.deepEqual(p.repeat, { freq: 'monthly', interval: 3 });
  assert.equal(p.body, 'review budget');
});

test('notification times on a one-off, and "remind me in 2 hours" is still a date', () => {
  const p = parseInput('dentist fri 3pm, remind me 1 day and 30 min before', NOW);
  assert.deepEqual(p.remind, [30, 1440]);
  assert.equal(p.body, 'dentist fri 3pm');
  assert.equal(new Date(p.due_at!).getHours(), 15);
  assert.equal(p.repeat, null);
  const q = parseInput('remind me in 2 hours to text mindchuk', NOW);
  assert.equal(q.remind, null);
  assert.equal(new Date(q.due_at!).getHours(), 12);
});

test('parseRows maps remind to remind_offsets only when given', () => {
  const [r] = parseRows('call mum sat 2pm notify 2h before', NOW) as Record<string, unknown>[];
  assert.deepEqual(r.remind_offsets, [120]);
  assert.equal('remind' in r, false);
  const [s] = parseRows('plain note', NOW) as Record<string, unknown>[];
  assert.equal('remind_offsets' in s, false);
  assert.equal(s.repeat, null);
});

test('plain notes with ordinary words are not repeats', () => {
  for (const s of ['sat down with Mon about the sun deck', 'the week went well', 'call John fri 3pm', 'everyday carry list']) {
    assert.equal(parseInput(s, NOW).repeat, null, s);
  }
});

test('a link survives a repeating note', () => {
  const p = parseInput('yoga every wed 6pm https://example.com/class/2026/11/01', NOW);
  assert.equal(p.url, 'https://example.com/class/2026/11/01');
  assert.equal(p.body, 'yoga https://example.com/class/2026/11/01');
  assert.deepEqual(p.repeat?.days, [3]);
});

test('findEventDate needs a real day', () => {
  assert.equal(findEventDate('9:41 87%\nSettings', NOW), null);
  const e = findEventDate('9:41\nWinter Market\nSaturday, December 5 at 7:00 PM\nTown Hall', NOW)!;
  assert.equal(new Date(e.due_at).getMonth(), 11);
  assert.equal(new Date(e.due_at).getDate(), 5);
  assert.equal(new Date(e.due_at).getHours(), 19);
  assert.equal(e.all_day, false);
});

test('time-of-day words alone are not dates', () => {
  assert.equal(parseInput('Pub quiz night https://www.facebook.com/events/1234567890123456/', NOW).due_at, null);
  assert.equal(parseInput('morning routine ideas', NOW).due_at, null);
  assert.notEqual(parseInput('dinner tonight 7pm', NOW).due_at, null);
  assert.notEqual(parseInput('call mum tomorrow morning', NOW).due_at, null);
});
