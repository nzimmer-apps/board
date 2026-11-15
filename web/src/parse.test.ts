import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseInput, findEventDate } from './parse.ts';

// Thursday 2026-11-12 10:00 local
const NOW = new Date(2026, 10, 12, 10, 0, 0);

test('tags become categories and leave the body', () => {
  const p = parseInput('call John #work #LLC', NOW);
  assert.deepEqual(p.tags.sort(), ['llc', 'work']);
  assert.equal(p.body, 'call John');
});

test('weekday + time becomes an event on that date', () => {
  const p = parseInput('call John fri 3pm #work', NOW);
  const d = new Date(p.due_at!);
  assert.equal(d.getDay(), 5);
  assert.equal(d.getHours(), 15);
  assert.equal(p.all_day, false);
  assert.equal(p.kind, 'event');
});

test('"due" marks a deadline, date without time is all-day', () => {
  const p = parseInput('tax form due Dec 1', NOW);
  assert.equal(p.kind, 'deadline');
  assert.equal(p.all_day, true);
  assert.equal(new Date(p.due_at!).getMonth(), 11);
});

test('"remind me" marks a reminder', () => {
  const p = parseInput('remind me in 2 hours to text mindchuk', NOW);
  assert.equal(p.kind, 'reminder');
});

test('plain note has no date; url is captured', () => {
  const p = parseInput('cool read https://example.com/2026/11/01/post', NOW);
  assert.equal(p.due_at, null);
  assert.equal(p.url, 'https://example.com/2026/11/01/post');
});

test('prefix shortcut', () => {
  const p = parseInput('buy: milk and eggs', NOW);
  assert.deepEqual(p.tags, ['buy']);
  assert.equal(p.body, 'milk and eggs');
});

test('flyer text: date and time become an event', () => {
  const e = findEventDate('SPRING DARTS LEAGUE\nKickoff Saturday Nov 21\nDoors 7:00 PM\nSchwoeglers', NOW);
  assert.ok(e);
  const d = new Date(e.due_at);
  assert.equal(d.getMonth(), 10);
  assert.equal(d.getDate(), 21);
  assert.equal(d.getHours(), 19);
  assert.equal(e.all_day, false);
});

test('flyer text: date without time is all-day at 9am', () => {
  const e = findEventDate('Craft fair\nDecember 5th\nCity Hall', NOW);
  assert.ok(e);
  assert.equal(e.all_day, true);
  assert.equal(new Date(e.due_at).getHours(), 9);
});

test('image text without a day is not an event', () => {
  assert.equal(findEventDate('Total 12.50\nThank you! Open 9am-5pm', NOW), null);
  assert.equal(findEventDate('just some words in a photo', NOW), null);
});

test('image text with a past dated year is not an event', () => {
  assert.equal(findEventDate('Receipt 03/14/2025 Total $4.20', NOW), null);
});

test('noisy screenshot OCR: real date wins over relative words and stray digits', () => {
  const ocr = 'Top events for you\n[ A 7 + pe\namaa Wisconsin Grown<Up! \\* 4 . |\n+ (=) — 2 Hai = \\ or) * 5\nR 7 a= + Two Day Event Ne ad x 2\nJANUARY 23 + 24\nJ The Sylvee « Madi';
  const e = findEventDate(ocr, NOW);
  assert.ok(e);
  const d = new Date(e.due_at);
  assert.equal(d.getFullYear(), 2027);
  assert.equal(d.getMonth(), 0);
  assert.equal(d.getDate(), 23);
  assert.equal(e.all_day, true); // "7 a" is noise, not 7am
});

// ---- repeating ----
test('"every Tuesday 7pm" repeats weekly from the next Tuesday', () => {
  const p = parseInput('darts league every tuesday 7pm #darts', NOW);
  assert.equal(p.repeat, 'weekly');
  const d = new Date(p.due_at!);
  assert.equal(d.getDay(), 2);
  assert.equal(d.getHours(), 19);
  assert.deepEqual(p.tags, ['darts']);
});

test('plural weekday "tuesdays" is weekly', () => {
  const p = parseInput('darts tuesdays 7pm', NOW);
  assert.equal(p.repeat, 'weekly');
  assert.equal(new Date(p.due_at!).getDay(), 2);
});

test('"every other friday" is biweekly', () => {
  const p = parseInput('cleaning every other friday 10am', NOW);
  assert.equal(p.repeat, 'biweekly');
  assert.equal(new Date(p.due_at!).getDay(), 5);
});

test('"2nd friday of the month" works out the next one', () => {
  const p = parseInput('board game night 2nd friday of the month 6pm', NOW); // NOW is Thu Nov 12; Nov 13 is the 2nd Fri
  assert.equal(p.repeat, 'monthly-nth');
  const d = new Date(p.due_at!);
  assert.equal(d.getMonth(), 10);
  assert.equal(d.getDate(), 13);
  assert.equal(d.getHours(), 18);
});

test('"last saturday of every month"', () => {
  const p = parseInput('market last saturday of every month', NOW);
  assert.equal(p.repeat, 'monthly-last');
  assert.equal(new Date(p.due_at!).getDate(), 28);
  assert.equal(p.all_day, true);
});

test('"rent due the 1st every month" is a monthly deadline', () => {
  const p = parseInput('rent due the 1st every month', NOW);
  assert.equal(p.repeat, 'monthly');
  assert.equal(p.kind, 'deadline');
  assert.equal(new Date(p.due_at!).getDate(), 1);
});

test('"until" ends the series and is not the start date', () => {
  const p = parseInput('league every wednesday 7pm until march 31', NOW);
  assert.equal(p.repeat, 'weekly');
  assert.equal(new Date(p.due_at!).getDay(), 3);
  const u = new Date(p.repeat_until!);
  assert.equal(u.getMonth(), 2);
  assert.equal(u.getDate(), 31);
});

test('no repeat words, no repeat; repeat without a date is dropped', () => {
  assert.equal(parseInput('call John fri 3pm', NOW).repeat, null);
  assert.equal(parseInput('weekly ideas list', NOW).repeat, null);
});

test('image text: full weekday names like Saturday count as a written date', () => {
  const e = findEventDate('Open house\nSaturday 10am', NOW);
  assert.ok(e);
  assert.equal(new Date(e.due_at).getDay(), 6);
});
