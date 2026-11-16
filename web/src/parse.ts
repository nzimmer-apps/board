import * as chrono from 'chrono-node';
import type { Repeat } from './repeat.ts';

export type Kind = 'event' | 'deadline' | 'reminder';

export interface Parsed {
  body: string;
  tags: string[];
  url: string | null;
  due_at: string | null;
  all_day: boolean;
  kind: Kind | null;
  repeat: Repeat | null;
  /** Minutes before due_at to notify, when the text said so ("notify 2 hours and 8 hours before"). */
  remind: number[] | null;
}

const TAG_RE = /(^|\s)#([\p{L}\p{N}_-]{1,40})/gu;
const URL_RE = /\bhttps?:\/\/[^\s<>"]+/i;
// "todo: buy milk" → tag "todo". Only a single leading word followed by a colon.
const PREFIX_RE = /^\s*(todo|buy|idea|work|personal|llc|note|read|watch)\s*:\s*/i;

// Words chrono reads as a date on their own but which usually are not one: "pub quiz night", "morning routine".
const VAGUE_RE = /^(now|today|night|morning|afternoon|evening|noon|midnight)$/i;

// ---------- "notify 2 hours and 8 hours ahead of time" ----------
const UNIT = '(?:minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|wks?|w)';
const DUR = `\\d+(?:\\.\\d+)?\\s*${UNIT}\\b`;
const REMIND_RE = new RegExp(
  '[,;.]?\\s*' +
    '(?:\\b(?:and\\s+)?(?:please\\s+)?(?:(?:give|send|set|add|with)\\s+)?(?:me\\s+)?(?:an?\\s+)?' +
    '(?:notif\\w*|remind\\w*|alerts?|warn\\w*|notice|heads[- ]?up|ping)\\s*(?:me\\s+)?(?:at\\s+)?)?' +
    `((?:${DUR})(?:\\s*(?:,|and|&|or)?\\s*(?:${DUR}))*)` +
    '\\s*(?:before(?:hand)?|ahead(?:\\s+of\\s+time)?|prior|in\\s+advance|early|earlier)\\b[.!]?',
  'i',
);
const DUR_RE = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${UNIT})\\b`, 'gi');
const unitMinutes = (u: string) => {
  const c = u[0].toLowerCase();
  return c === 'm' ? 1 : c === 'h' ? 60 : c === 'd' ? 1440 : 10080;
};

// ---------- "every week … 6 pm sundays, 7 pm monday and thursdays" ----------
const DAY_NAME = '(?:sun(?:days?)?|mon(?:days?)?|tue(?:s(?:days?)?)?|wed(?:s|nesdays?)?|thu(?:r(?:s(?:days?)?)?)?|fri(?:days?)?|sat(?:urdays?)?)';
const DAY_IDX = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const EVERY_RE = new RegExp(`\\b(?:every|each)\\s+(other\\s+|second\\s+|(\\d+)(?:st|nd|rd|th)?\\s+)?(day|weekday|week|month|year|${DAY_NAME})s?\\b`, 'i');
const ADV_RE = /\b(daily|weekly|bi-?weekly|fortnightly|monthly|yearly|annually)\b/i;
const PLURAL_DAY_RE = new RegExp(`\\b(?:sun|mon|tues|wednes|thurs|fri|satur)days\\b`, 'i');
const TOKEN_RE = new RegExp(
  `\\b(?:(\\d{1,2})(?::([0-5]\\d))?\\s*([ap])\\.?m\\b\\.?|(noon|midnight)\\b|([01]?\\d|2[0-3]):([0-5]\\d)\\b|(${DAY_NAME})\\b)`,
  'gi',
);

interface Group { days: number[]; time: { h: number; m: number } | null }

const tidy = (s: string) =>
  s
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/^[\s,;.:&-]+|[\s,;:&-]+$/g, '')
    .replace(/[\s,;]*\b(?:at|on|and|from)$/i, '')
    .replace(/[,;]\s*\.$/, '')
    .replace(/^(?:i\s+have|i've\s+got|i\s+got|we\s+have|there\s+is|there's)\s+/i, '')
    .trim();

/** Turn free text into one item (see parseAll for text that describes several). */
export function parseInput(raw: string, now: Date = new Date()): Parsed {
  return parseAll(raw, now)[0];
}

/**
 * Turn free text into items: #tags → categories, first URL, natural-language date → due_at,
 * "every …" → a repeat rule, "notify X before" → notification times.
 * A weekly schedule with different times on different days gives one item per time.
 */
export function parseAll(raw: string, now: Date = new Date()): Parsed[] {
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
  // Keep the link out of date parsing so "2026/11/01" in a URL doesn't become a deadline.
  const HOLE = '\u0002';
  const restore = (s: string) => (url ? s.replace(HOLE, url) : s);
  let t = url ? text.replace(url, HOLE) : text;

  let remind: number[] | null = null;
  const rm = t.match(REMIND_RE);
  if (rm) {
    const mins = [...rm[1].matchAll(DUR_RE)].map((m) => Math.round(parseFloat(m[1]) * unitMinutes(m[2])));
    remind = [...new Set(mins)].filter((m) => m >= 0 && m <= 525600).sort((a, b) => a - b).slice(0, 8);
    t = (t.slice(0, rm.index) + ' ' + t.slice(rm.index! + rm[0].length)).trim();
  }

  const kindOf = (s: string): Kind =>
    /\bremind(\s+me)?\b/i.test(s) ? 'reminder' : /\b(due|deadline|by|before)\b/i.test(s) ? 'deadline' : 'event';
  const base = { tags: [...tags], url, remind };

  // ---- repeating ----
  const every = t.match(EVERY_RE);
  const adv = t.match(ADV_RE);
  if (every || adv || PLURAL_DAY_RE.test(t)) {
    let freq: Repeat['freq'] = 'weekly';
    let interval = 1;
    let weekdays = false;
    if (every) {
      const unit = every[3].toLowerCase();
      if (unit === 'day') freq = 'daily';
      else if (unit === 'weekday') weekdays = true;
      else if (unit === 'month') freq = 'monthly';
      else if (unit === 'year') freq = 'yearly';
      const named = !['day', 'weekday', 'week', 'month', 'year'].includes(unit);
      if (every[1] && !every[2]) interval = 2;
      else if (every[2] && !named) interval = Math.min(52, Math.max(1, parseInt(every[2], 10)));
      // "every monday": keep the day name for the scan below, drop only "every".
      t = named ? t.replace(/\b(?:every|each)\s+(?:other\s+|second\s+)?/i, ' ') : t.replace(every[0], ' ');
    }
    if (adv) {
      const a = adv[1].toLowerCase();
      if (!every) {
        if (a === 'daily') freq = 'daily';
        else if (a === 'monthly') freq = 'monthly';
        else if (a === 'yearly' || a === 'annually') freq = 'yearly';
        else if (a !== 'weekly') interval = 2;
      }
      t = t.replace(adv[0], ' ');
    }

    // Collect day names and clock times in reading order.
    const toks: { pos: number; day?: number; time?: { h: number; m: number } }[] = [];
    const marked = t.replace(TOKEN_RE, (m0, h12, m12, ap, word, h24, m24, day, pos: number) => {
      if (day) {
        if (freq !== 'weekly') return m0; // "every month on the 1st, sat" – leave day names alone
        toks.push({ pos, day: DAY_IDX.indexOf(day.slice(0, 3).toLowerCase()) });
      } else if (word) toks.push({ pos, time: { h: word.toLowerCase() === 'noon' ? 12 : 0, m: 0 } });
      else if (h12) {
        const h = parseInt(h12, 10);
        if (h < 1 || h > 12) return m0;
        toks.push({ pos, time: { h: (h % 12) + (ap.toLowerCase() === 'p' ? 12 : 0), m: m12 ? parseInt(m12, 10) : 0 } });
      } else toks.push({ pos, time: { h: parseInt(h24, 10), m: parseInt(m24, 10) } });
      return '\u0001';
    });
    let body = marked.replace(/(?:(?:\b(?:at|on|and|from)\b|[@,&;\s])*\u0001)+/gi, ' ');

    const times = toks.filter((k) => k.time);
    const dayToks = toks.filter((k) => k.day !== undefined);
    const groups: Group[] = [];
    if (weekdays) groups.push({ days: [1, 2, 3, 4, 5], time: times[0]?.time ?? null });
    else if (freq !== 'weekly' || !dayToks.length) groups.push({ days: [], time: times[0]?.time ?? null });
    else if (!times.length) groups.push({ days: dayToks.map((d) => d.day!), time: null });
    else {
      // "6 pm sundays, 7 pm monday and thursdays": a day belongs to the time before it.
      // "sundays at 6 pm, mondays and thursdays at 7 pm": a day belongs to the time after it.
      const timeFirst = toks[0].time !== undefined;
      const byTime = new Map<typeof times[number], number[]>();
      for (const d of dayToks) {
        const owner = timeFirst
          ? [...times].reverse().find((x) => x.pos < d.pos)
          : times.find((x) => x.pos > d.pos) ?? times[times.length - 1];
        if (owner) byTime.set(owner, [...(byTime.get(owner) ?? []), d.day!]);
      }
      for (const [k, days] of byTime) groups.push({ days: [...new Set(days)].sort((a, b) => a - b), time: k.time! });
    }

    // Monthly / yearly: a date in the text ("on the 1st", "Dec 25") picks the day.
    let anchor: Date | null = null;
    if (freq === 'monthly' || freq === 'yearly' || (freq === 'weekly' && !dayToks.length && !weekdays)) {
      const dom = freq === 'monthly' ? body.match(/(?:\bon\s+)?(?:\bthe\s+)?\b([12]?\d|3[01])(?:st|nd|rd|th)\b/i) : null;
      if (dom) {
        const n = parseInt(dom[1], 10);
        anchor = new Date(now.getFullYear(), now.getMonth(), n, 23, 59);
        if (anchor < now || anchor.getDate() !== n) anchor = new Date(now.getFullYear(), now.getMonth() + 1, n);
        body = body.replace(dom[0], ' ');
      }
      const hit = dom ? undefined : chrono.parse(body.replace(HOLE, ' '), now, { forwardDate: true }).find((r) => !VAGUE_RE.test(r.text.trim()));
      if (hit) {
        anchor = hit.start.date();
        body = body.replace(new RegExp(`(?:\\bon\\s+)?(?:\\bthe\\s+)?${hit.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'), ' ');
      }
    }
    body = restore(tidy(body)) || raw.trim();
    const kind = kindOf(body);

    return groups.map((g) => {
      const all_day = !g.time;
      const h = g.time?.h ?? 9;
      const mi = g.time?.m ?? 0;
      let first: Date;
      if (anchor) {
        first = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate(), h, mi);
      } else {
        // The next day that fits (today counts if the time is still ahead).
        first = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, mi);
        for (let i = 0; i < 8 && (first <= now || (g.days.length > 0 && !g.days.includes(first.getDay()))); i++)
          first = new Date(first.getFullYear(), first.getMonth(), first.getDate() + 1, h, mi);
      }
      const repeat: Repeat = { freq, interval };
      if (freq === 'weekly') repeat.days = g.days.length ? g.days : [first.getDay()];
      return { ...base, body, due_at: first.toISOString(), all_day, kind, repeat };
    });
  }

  // ---- one-off ----
  const dateText = t.replace(HOLE, ' ');
  const results = chrono.parse(dateText, now, { forwardDate: true });
  let due_at: string | null = null;
  let all_day = false;
  let kind: Kind | null = null;

  const hit = results.find((r) => !VAGUE_RE.test(r.text.trim()));
  if (hit) {
    const start = hit.start;
    all_day = !start.isCertain('hour');
    const d = start.date();
    if (all_day) d.setHours(9, 0, 0, 0); // all-day items sort/remind at 9am local
    due_at = d.toISOString();
    kind = kindOf(t);
  }

  const body = restore(remind ? tidy(t) : t) || raw.trim();
  return [{ ...base, body, due_at, all_day, kind, repeat: null }];
}

/** Rows ready to insert: Parsed without the client-only `remind`, which becomes remind_offsets when given. */
export function parseRows(raw: string, now: Date = new Date()) {
  return parseAll(raw, now).map(({ remind, ...row }) => (remind ? { ...row, remind_offsets: remind } : row));
}

/**
 * Look for an event date in text Board read out of a screenshot, PDF, voice note or web page.
 * Stricter than parseInput: a bare time ("9:41" from a phone's status bar) is not enough,
 * there has to be an actual day.
 */
export function findEventDate(text: string, now: Date = new Date()): { due_at: string; all_day: boolean; text: string } | null {
  const soon = now.getTime() - 864e5;
  const far = now.getTime() + 2 * 365 * 864e5;
  for (const r of chrono.parse(text.slice(0, 6000), now, { forwardDate: true })) {
    const s = r.start;
    if (!(s.isCertain('day') || s.isCertain('weekday')) || VAGUE_RE.test(r.text.trim())) continue;
    if (/^\d{1,2}[./-]\d{1,2}$/.test(r.text.trim())) continue; // "3/4" is more often a fraction or a score
    const d = s.date();
    const all_day = !s.isCertain('hour');
    if (all_day) d.setHours(9, 0, 0, 0);
    if (d.getTime() < soon || d.getTime() > far) continue;
    return { due_at: d.toISOString(), all_day, text: r.text };
  }
  return null;
}
