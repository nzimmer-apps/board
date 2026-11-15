// Repeating notes. The note keeps one date (due_at), the first or current occurrence, plus a repeat rule.
// Every later occurrence is worked out from it, so nothing extra is stored per week or month.

export const REPEATS = ['daily', 'weekly', 'biweekly', 'monthly', 'monthly-nth', 'monthly-last', 'yearly'] as const;
export type Repeat = (typeof REPEATS)[number];

export interface Recurring {
  due_at: string | null;
  repeat?: Repeat | null;
  repeat_until?: string | null;
}

const DAY = 864e5;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ORD = ['1st', '2nd', '3rd', '4th', '5th'];
const daysIn = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

/** Which week of its month a date falls in: 1 for days 1-7, 2 for 8-14, and so on. */
export const nthOfMonth = (d: Date) => Math.ceil(d.getDate() / 7);
/** True when no later day in the month shares this date's weekday. */
export const isLastOfMonth = (d: Date) => d.getDate() + 7 > daysIn(d.getFullYear(), d.getMonth());

/** The date on the nth (1-5, or -1 for last) given weekday of a month, or null if that month has none. */
function nthWeekday(y: number, m: number, weekday: number, n: number): number | null {
  if (n === -1) {
    const last = daysIn(y, m);
    return last - ((new Date(y, m, last).getDay() - weekday + 7) % 7);
  }
  const first = 1 + ((weekday - new Date(y, m, 1).getDay() + 7) % 7);
  const day = first + (n - 1) * 7;
  return day <= daysIn(y, m) ? day : null;
}

/** The k-th occurrence after the anchor (k = 0 is the anchor), keeping its local time of day. Null = skipped. */
function step(a: Date, rule: Repeat, k: number): Date | null {
  const h = a.getHours(), mi = a.getMinutes();
  const at = (y: number, m: number, d: number) => new Date(y, m, d, h, mi);
  const y = a.getFullYear(), m = a.getMonth(), d = a.getDate();
  switch (rule) {
    case 'daily': return at(y, m, d + k);
    case 'weekly': return at(y, m, d + 7 * k);
    case 'biweekly': return at(y, m, d + 14 * k);
    case 'monthly': {
      // The 31st falls on the last day of shorter months.
      const t = new Date(y, m + k, 1);
      return at(t.getFullYear(), t.getMonth(), Math.min(d, daysIn(t.getFullYear(), t.getMonth())));
    }
    case 'monthly-nth':
    case 'monthly-last': {
      const t = new Date(y, m + k, 1);
      const n = rule === 'monthly-last' ? -1 : nthOfMonth(a);
      const day = nthWeekday(t.getFullYear(), t.getMonth(), a.getDay(), n);
      return day === null ? null : at(t.getFullYear(), t.getMonth(), day);
    }
    case 'yearly': return at(y + k, m, Math.min(d, daysIn(y + k, m)));
  }
}

/** A rough number of steps to skip so that a long-running rule doesn't start counting from its first date. */
function skipTo(a: Date, rule: Repeat, fromMs: number): number {
  const gap = fromMs - a.getTime();
  if (gap <= 0) return 0;
  const per = { daily: 1, weekly: 7, biweekly: 14, monthly: 28, 'monthly-nth': 28, 'monthly-last': 28, yearly: 365 }[rule];
  return Math.max(0, Math.floor(gap / (per * DAY)) - 2);
}

const untilMs = (it: Recurring) => {
  if (!it.repeat_until) return Infinity;
  const u = new Date(it.repeat_until);
  return new Date(u.getFullYear(), u.getMonth(), u.getDate(), 23, 59, 59).getTime();
};

/** Every occurrence from fromMs up to toMs (inclusive), at most `limit`. A note that doesn't repeat yields its date once. */
export function occurrences(it: Recurring, fromMs: number, toMs: number, limit = 500): Date[] {
  if (!it.due_at) return [];
  const a = new Date(it.due_at);
  if (!it.repeat) return a.getTime() >= fromMs && a.getTime() <= toMs ? [a] : [];
  const end = Math.min(toMs, untilMs(it));
  const out: Date[] = [];
  for (let k = skipTo(a, it.repeat, fromMs); out.length < limit; k++) {
    const t = step(a, it.repeat, k);
    if (!t) continue;
    if (t.getTime() > end) break;
    if (t.getTime() >= fromMs) out.push(t);
  }
  return out;
}

/** The first occurrence at or after fromMs, or null when the series has ended. */
export function nextOccurrence(it: Recurring, fromMs: number): Date | null {
  return occurrences(it, fromMs, Infinity, 1)[0] ?? null;
}

const startOfToday = (now = new Date()) => new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

/**
 * The date to show for a note: its own date, or for a repeating one the next occurrence from today on.
 * A finished series falls back to its last date.
 */
export function shownDate(it: Recurring, now = new Date()): Date | null {
  if (!it.due_at) return null;
  if (!it.repeat) return new Date(it.due_at);
  return nextOccurrence(it, startOfToday(now)) ?? new Date(it.due_at);
}

/** "Every Tuesday", "Monthly on the 2nd Friday", … for a rule anchored on a date. */
export function describeRepeat(rule: Repeat, anchor: Date): string {
  const wd = WEEKDAYS[anchor.getDay()];
  switch (rule) {
    case 'daily': return 'Every day';
    case 'weekly': return `Every ${wd}`;
    case 'biweekly': return `Every other ${wd}`;
    case 'monthly': return `Monthly on the ${ordinal(anchor.getDate())}`;
    case 'monthly-nth': return `Monthly on the ${ORD[nthOfMonth(anchor) - 1]} ${wd}`;
    case 'monthly-last': return `Monthly on the last ${wd}`;
    case 'yearly': return `Every year on ${anchor.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
  }
}

/** The rules that make sense for a date (the last-weekday option only appears in the last week of a month). */
export function repeatChoices(anchor: Date): Repeat[] {
  return REPEATS.filter((r) => r !== 'monthly-last' || isLastOfMonth(anchor));
}

function ordinal(n: number) {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${s}`;
}
