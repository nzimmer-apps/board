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
