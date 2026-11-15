import * as chrono from 'chrono-node';

export type Kind = 'event' | 'deadline' | 'reminder';

export interface Parsed {
  body: string;
  tags: string[];
  url: string | null;
  due_at: string | null;
  all_day: boolean;
  kind: Kind | null;
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
  const dateText = url ? text.replace(url, ' ') : text;
  const results = chrono.parse(dateText, now, { forwardDate: true });
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

  return { body: text || raw.trim(), tags: [...tags], url, due_at, all_day, kind };
}

const MONTH_RE = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\b/i;
const WEEKDAY_RE = /\b(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(day)?\b/i;
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
