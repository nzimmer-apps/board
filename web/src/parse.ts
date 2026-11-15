import * as chrono from 'chrono-node';
import type { Repeat } from './recur';

export type Kind = 'event' | 'deadline' | 'reminder';

export interface Parsed {
  body: string;
  tags: string[];
  url: string | null;
  due_at: string | null;
  all_day: boolean;
  kind: Kind | null;
  repeat: Repeat | null;
  repeat_until: string | null;
}

const WD = '(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tues|tue|wed|thurs|thur|thu|fri|sat)';
const WD_INDEX: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const NTH_RE = new RegExp(`\\b(first|1st|second|2nd|third|3rd|fourth|4th|last)\\s+${WD}\\b`, 'i');
const NTH: Record<string, number> = { first: 1, '1st': 1, second: 2, '2nd': 2, third: 3, '3rd': 3, fourth: 4, '4th': 4, last: -1 };
const MONTHLY_RE = /\b(every|each)\s+month\b|\bmonthly\b|\bonce\s+a\s+month\b|\bof\s+(the|each|every)\s+month\b/i;
const PLURAL_WD_RE = /\b(sun|mon|tues|wednes|thurs|fri|satur)days\b/gi;

/** The repeat rule written in the text, if any. Order matters: "every other Tuesday" is not weekly. */
function findRepeat(text: string): Repeat | null {
  if (/\b(every\s*day|each\s+day|daily)\b/i.test(text)) return 'daily';
  if (/\b(every\s+other|every\s+(2|two)\s+weeks|bi-?weekly|fortnightly)\b/i.test(text)) return 'biweekly';
  const nth = text.match(NTH_RE);
  if (nth && (MONTHLY_RE.test(text) || /\bevery\b/i.test(text))) return nth[1].toLowerCase() === 'last' ? 'monthly-last' : 'monthly-nth';
  if (MONTHLY_RE.test(text)) return 'monthly';
  if (/\b(every|each)\s+year\b|\b(yearly|annually)\b/i.test(text)) return 'yearly';
  if (new RegExp(`\\b(every|each)\\s+(week|${WD})\\b|\\bweekly\\b`, 'i').test(text)) return 'weekly';
  if (PLURAL_WD_RE.test(text)) { PLURAL_WD_RE.lastIndex = 0; return 'weekly'; }
  return null;
}

/** Next date on or after now that is the nth (or last) given weekday of its month. */
function nextNthWeekday(now: Date, weekday: number, n: number, h: number, mi: number): Date {
  for (let k = 0; k < 14; k++) {
    const y = now.getFullYear(), m = now.getMonth() + k;
    const last = new Date(y, m + 1, 0).getDate();
    let day: number;
    if (n === -1) day = last - ((new Date(y, m, last).getDay() - weekday + 7) % 7);
    else day = 1 + ((weekday - new Date(y, m, 1).getDay() + 7) % 7) + (n - 1) * 7;
    if (day > last) continue;
    const d = new Date(y, m, day, h, mi);
    if (d.getTime() >= now.getTime() - 60e3) return d;
  }
  return now;
}

const TAG_RE = /(^|\s)#([\p{L}\p{N}_-]{1,40})/gu;
const URL_RE = /\bhttps?:\/\/[^\s<>"]+/i;
// "todo: buy milk" → tag "todo". Only a single leading word followed by a colon.
const PREFIX_RE = /^\s*(todo|buy|idea|work|personal|llc|note|read|watch)\s*:\s*/i;

/** Turn free text into an item: #tags → categories, first URL, natural-language date → due_at. */
export function parseInput(raw: string, now: Date = new Date()): Parsed {
  let text = raw.replace(/\r\n/g, '\n').trim();
  const tags = new Set<string>();

  const prefix = text.match(PREFIX_RE);
  if (prefix) {
    tags.add(prefix[1].toLowerCase());
    text = text.slice(prefix[0].length);
  }

  text = text.replace(TAG_RE, (_m, lead: string, tag: string) => {
    tags.add(tag.toLowerCase());
    return lead;
  });
  text = text.replace(/[ \t]{2,}/g, ' ').trim();

  const url = text.match(URL_RE)?.[0] ?? null;

  // Dates: ignore anything inside the URL so "2026/11/01" in a link doesn't become a deadline.
  // "until <date>" ends a repeating series; it is read separately so it isn't taken as the start.
  let dateText = url ? text.replace(url, ' ') : text;
  let repeat = findRepeat(dateText);
  let repeat_until: string | null = null;
  const until = dateText.match(/\buntil\s+(.+)$/i);
  if (repeat && until) {
    const u = chrono.parseDate(until[1], now, { forwardDate: true });
    if (u) repeat_until = u.toISOString();
    dateText = dateText.slice(0, until.index);
  }
  // chrono reads "Tuesday" but not "Tuesdays".
  const results = chrono.parse(dateText.replace(PLURAL_WD_RE, (_m, d: string) => `${d}day`), now, { forwardDate: true });
  let due_at: string | null = null;
  let all_day = false;
  let kind: Kind | null = null;

  const hit = results.find((r) => !/^(now|today)$/i.test(r.text.trim()));
  if (hit) {
    const start = hit.start;
    all_day = !start.isCertain('hour');
    const d = start.date();
    if (all_day) d.setHours(9, 0, 0, 0); // all-day items sort/remind at 9am local
    due_at = d.toISOString();
    if (/\bremind(\s+me)?\b/i.test(text)) kind = 'reminder';
    else if (/\b(due|deadline|by|before)\b/i.test(text)) kind = 'deadline';
    else kind = 'event';
  }

  // "2nd Friday of the month": chrono can't place that, so work out the first date here.
  const nth = repeat === 'monthly-nth' || repeat === 'monthly-last' ? dateText.match(NTH_RE) : null;
  if (nth) {
    const time = results.find((r) => r.start.isCertain('hour'))?.start;
    all_day = !time;
    const d = nextNthWeekday(now, WD_INDEX[nth[2].toLowerCase().slice(0, 3)], NTH[nth[1].toLowerCase()],
      time?.get('hour') ?? 9, time ? time.get('minute') ?? 0 : 0);
    due_at = d.toISOString();
    kind ??= /\b(due|deadline)\b/i.test(text) ? 'deadline' : /\bremind(\s+me)?\b/i.test(text) ? 'reminder' : 'event';
  }

  // "rent due the 1st every month": a day of the month on its own, which chrono needs a month for.
  const dom = repeat === 'monthly' && !due_at ? dateText.match(/\b(?:on\s+)?the\s+(\d{1,2})(st|nd|rd|th)\b/i) : null;
  if (dom && +dom[1] >= 1 && +dom[1] <= 31) {
    const time = results.find((r) => r.start.isCertain('hour'))?.start;
    all_day = !time;
    const at = (k: number) => {
      const y = now.getFullYear(), m = now.getMonth() + k;
      return new Date(y, m, Math.min(+dom[1], new Date(y, m + 1, 0).getDate()), time?.get('hour') ?? 9, time ? time.get('minute') ?? 0 : 0);
    };
    const d = at(0).getTime() >= now.getTime() ? at(0) : at(1);
    due_at = d.toISOString();
    kind = /\b(due|deadline|by)\b/i.test(text) ? 'deadline' : /\bremind(\s+me)?\b/i.test(text) ? 'reminder' : 'event';
  }

  // A repeat needs a first date to count from.
  if (!due_at) { repeat = null; repeat_until = null; }

  return { body: text || raw.trim(), tags: [...tags], url, due_at, all_day, kind, repeat, repeat_until };
}

const MONTH_RE = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\b/i;
const WEEKDAY_RE = /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tues|tue|wed|thurs|thur|thu|fri|sat)\b/i;
const NUMERIC_DATE_RE = /\b\d{1,2}[/.-]\d{1,2}([/.-]\d{2,4})?\b/;
const CLOCK_RE = /\d(:\d{2}|\s?[ap]\.?m\b)/i;

/**
 * Date of an event in text read from an image (a flyer, ticket or invite), or null.
 * OCR text is noisy, so this is stricter than parseInput:
 * - each line is read on its own, so stray digits on one line don't merge with a date on the next;
 * - the date must be written out (a month name, a weekday or 11/21), not relative ("two day", "in 3 days");
 * - a time must look like a clock time (7:00, 7pm), and one on its own line is joined to the date;
 * - the date must fall between yesterday and about a year ahead.
 */
export function findEventDate(text: string, now: Date = new Date()): { due_at: string; all_day: boolean } | null {
  const lines = text.split(/\n+/);
  const found = lines.flatMap((l) => chrono.parse(l, now, { forwardDate: true }));
  const clock = found.find((r) => r.start.isCertain('hour') && CLOCK_RE.test(r.text))?.start;
  const min = now.getTime() - 864e5;
  const max = now.getTime() + 400 * 864e5;
  for (const r of found) {
    const s = r.start;
    if (!s.isCertain('day') && !s.isCertain('weekday')) continue;
    if (!MONTH_RE.test(r.text) && !WEEKDAY_RE.test(r.text) && !NUMERIC_DATE_RE.test(r.text)) continue;
    const d = s.date();
    const time = s.isCertain('hour') && CLOCK_RE.test(r.text) ? s : clock;
    if (time) d.setHours(time.get('hour') ?? 9, time.get('minute') ?? 0, 0, 0);
    else d.setHours(9, 0, 0, 0);
    if (d.getTime() < min || d.getTime() > max) continue;
    return { due_at: d.toISOString(), all_day: !time };
  }
  return null;
}
