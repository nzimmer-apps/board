import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseInput } from './parse.ts';

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
