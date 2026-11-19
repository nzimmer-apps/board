// Repeating items. An item's due_at is its first occurrence; the rule says how it repeats.
// Everything here works in local time, so "7 PM every Monday" stays 7 PM across clock changes.

export type Freq = 'daily' | 'weekly' | 'monthly' | 'yearly';
export interface Repeat {
  freq: Freq;
  interval: number; // every N days / weeks / months / years
  days?: number[]; // weekly only: 0 = Sunday … 6 = Saturday
  /** Monthly only: the nth (1-5) or last (-1) of the first date's weekday, e.g. "2nd Friday of the month". */
  nth?: number;
  /** Last day of the series ("YYYY-MM-DD", local), inclusive. None = no end. */
  until?: string;
  /** Dates left out ("YYYY-MM-DD", local): skipped, or moved to a separate one-off note. */
  skip?: string[];
}

const pad2 = (n: number) => String(n).padStart(2, "0");
/** Local calendar day of an occurrence, the key used in Repeat.skip. */
export const dayKey = (d: Date) => d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());

/** The rule with one date skipped (or un-skipped). */
export function withSkip(r: Repeat, d: Date, skip = true): Repeat {
  const k = dayKey(d);
  const rest = (r.skip ?? []).filter((x) => x !== k);
  const next = skip ? [...rest, k].sort() : rest;
  const { skip: _old, ...base } = r;
  return next.length ? { ...base, skip: next } : base;
}

const DAY = 864e5;
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dayDiff = (a: Date, b: Date) => Math.round((dayStart(b).getTime() - dayStart(a).getTime()) / DAY);
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Day of the month of the nth (1-5) or last (-1) given weekday, or null when the month has no such day. */
export function nthWeekday(y: number, m: number, weekday: number, n: number): number | null {
  const last = new Date(y, m + 1, 0).getDate();
  if (n === -1) return last - ((new Date(y, m, last).getDay() - weekday + 7) % 7);
  const day = 1 + ((weekday - new Date(y, m, 1).getDay() + 7) % 7) + (n - 1) * 7;
  return day <= last ? day : null;
}

/** Which of its weekday a date is in its month: 1 for days 1-7, 2 for 8-14, … */
export const nthOf = (d: Date) => Math.ceil(d.getDate() / 7);
/** True when no later day in the month has the same weekday. */
export const isLastOf = (d: Date) => d.getDate() + 7 > new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();

/** Keep a "2nd Friday" / "last Friday" rule true to a (possibly moved) first date. */
export function fitRepeat(r: Repeat | null, start: Date): Repeat | null {
  if (!r?.nth || r.freq !== 'monthly') return r;
  return { ...r, nth: r.nth === -1 && isLastOf(start) ? -1 : nthOf(start) };
}

/** Occurrences with from <= t < to (never before the first one). */
export function occurrences(start: Date, r: Repeat | null | undefined, from: Date, to: Date, max = 400): Date[] {
  if (!r) return start >= from && start < to ? [start] : [];
  const out: Date[] = [];
  const iv = Math.max(1, Math.floor(r.interval || 1));
  const h = start.getHours();
  const mi = start.getMinutes();
  const skip = new Set(r.skip ?? []);
  const push = (d: Date) => {
    if (d >= start && d >= from && d < to && !skip.has(dayKey(d)) && !(r.until && dayKey(d) > r.until)) out.push(d);
  };

  if (r.freq === 'daily' || r.freq === 'weekly') {
    const days = r.freq === 'weekly' ? (r.days?.length ? r.days : [start.getDay()]) : null;
    // Weekly counts whole weeks from the Sunday of the first week, so "every 2 weeks" keeps Mon and Thu together.
    const base = days ? new Date(start.getFullYear(), start.getMonth(), start.getDate() - start.getDay()) : dayStart(start);
    const end = dayDiff(base, to) + 1;
    for (let n = Math.max(0, dayDiff(base, from) - 1); n <= end && out.length < max; n++) {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + n, h, mi);
      if (days ? Math.floor(n / 7) % iv !== 0 || !days.includes(d.getDay()) : n % iv !== 0) continue;
      push(d);
    }
  } else {
    const step = r.freq === 'monthly' ? iv : iv * 12;
    const months = (from.getFullYear() - start.getFullYear()) * 12 + from.getMonth() - start.getMonth();
    for (let k = Math.max(0, Math.floor(months / step) - 1); out.length < max; k++) {
      const m0 = new Date(start.getFullYear(), start.getMonth() + k * step, 1);
      if (m0 >= to) break;
      const last = new Date(m0.getFullYear(), m0.getMonth() + 1, 0).getDate();
      // "2nd Friday": that weekday of each month (a month with no 5th Friday is left out).
      // Otherwise the same date; the 31st in a 30-day month lands on the last day.
      const day = r.freq === 'monthly' && r.nth ? nthWeekday(m0.getFullYear(), m0.getMonth(), start.getDay(), r.nth) : Math.min(start.getDate(), last);
      if (day === null) continue;
      const d = new Date(m0.getFullYear(), m0.getMonth(), day, h, mi);
      if (d >= to) break;
      push(d);
    }
  }
  return out;
}

/** First occurrence at or after `after`. */
export function nextOccurrence(start: Date, r: Repeat | null | undefined, after: Date): Date | null {
  if (!r) return start >= after ? start : null;
  const iv = Math.max(1, Math.floor(r.interval || 1));
  const from = after > start ? after : start;
  // Widen the search by one period per upcoming skipped date, so skips never hide the next real one.
  const ahead = (r.skip ?? []).filter((k) => k >= dayKey(from)).length;
  // A "5th Friday" rule can go a few months without one.
  const months = r.nth === 5 ? 4 : 1;
  const span = { daily: iv + 1, weekly: iv * 7 + 7, monthly: (iv * 31 + 31) * months, yearly: iv * 366 + 366 }[r.freq] * DAY * (1 + ahead);
  return occurrences(start, r, from, new Date(from.getTime() + span), 1)[0] ?? null;
}

/**
 * The date an item should show and notify for: a repeating item rolls forward to its next occurrence
 * once the current one has passed.
 */
export function effectiveDue(it: { due_at: string | null; repeat?: Repeat | null }, now: Date = new Date()): string | null {
  if (!it.due_at || !it.repeat) return it.due_at;
  const start = new Date(it.due_at);
  return (nextOccurrence(start, it.repeat, now) ?? start).toISOString();
}

const ORD = ['', '1st', '2nd', '3rd', '4th', '5th'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Every Mon, Thu", "Every month on the 2nd Fri until Mar 31". `start` (the first date) names an nth rule's weekday. */
export function repeatLabel(r: Repeat | null | undefined, start?: Date | string | null): string {
  if (!r) return '';
  const until = r.until ? ` until ${MON[parseInt(r.until.slice(5, 7), 10) - 1]} ${parseInt(r.until.slice(8), 10)}` : '';
  return baseLabel(r, start ? new Date(start) : null) + until;
}

function baseLabel(r: Repeat, start: Date | null): string {
  const iv = Math.max(1, r.interval || 1);
  const unit = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[r.freq];
  const every = iv === 1 ? `Every ${unit}` : `Every ${iv} ${unit}s`;
  if (r.freq === 'monthly' && r.nth) return `${every} on the ${r.nth === -1 ? 'last' : ORD[r.nth]} ${start ? DOW[start.getDay()] : 'weekday'}`;
  if (r.freq !== 'weekly' || !r.days?.length) return every;
  const days = [...r.days].sort((a, b) => a - b);
  if (days.join() === '1,2,3,4,5' && iv === 1) return 'Every weekday';
  const names = days.map((d) => DOW[d]).join(', ');
  return iv === 1 ? `Every ${names}` : `${every} on ${names}`;
}

const ICS_DAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/** iCalendar RRULE value, for calendar export. `start` (the first date) names an nth rule's weekday. */
export function rrule(r: Repeat, start?: Date | string | null): string {
  const parts = [`FREQ=${r.freq.toUpperCase()}`];
  if (r.interval > 1) parts.push(`INTERVAL=${r.interval}`);
  if (r.freq === 'weekly' && r.days?.length) parts.push(`BYDAY=${[...r.days].sort((a, b) => a - b).map((d) => ICS_DAY[d]).join(',')}`);
  if (r.freq === 'monthly' && r.nth && start) parts.push(`BYDAY=${r.nth}${ICS_DAY[new Date(start).getDay()]}`);
  if (r.until) parts.push(`UNTIL=${r.until.replace(/-/g, '')}T235959`);
  return parts.join(';');
}
