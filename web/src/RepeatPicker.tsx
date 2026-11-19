// "Repeats: weekly, every 1 week, on Mon Thu, until Mar 31" – edits an item's repeat rule.
import { dayKey, isLastOf, nthOf, type Repeat, type Freq } from './repeat';

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DOW_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ORD = ['', '1st', '2nd', '3rd', '4th', '5th'];
const UNITS: Record<Freq, string> = { daily: 'day(s)', weekly: 'week(s)', monthly: 'month(s)', yearly: 'year(s)' };

interface Props {
  value: Repeat | null;
  onChange: (r: Repeat | null) => void;
  /** The item's date: the default day for a new weekly rule, and the weekday of a "2nd Friday" rule. */
  date: Date;
}

export default function RepeatPicker({ value, onChange, date }: Props) {
  const day = date.getDay();
  const setFreq = (f: string) => {
    if (!f) return onChange(null);
    const freq = f as Freq;
    const keep = value?.until ? { until: value.until } : {};
    onChange({ freq, interval: value?.interval ?? 1, ...(freq === 'weekly' ? { days: value?.days?.length ? value.days : [day] } : {}), ...keep });
  };
  const toggleDay = (d: number) => {
    if (!value) return;
    const cur = value.days ?? [];
    const days = cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort((a, b) => a - b);
    if (days.length) onChange({ ...value, days });
  };
  const setMonthly = (v: string) => {
    if (!value) return;
    const { nth: _n, ...rest } = value;
    onChange(v === 'date' ? rest : { ...rest, nth: v === 'last' ? -1 : nthOf(date) });
  };
  const setUntil = (v: string) => {
    if (!value) return;
    const { until: _u, ...rest } = value;
    onChange(v ? { ...rest, until: v } : rest);
  };
  return (
    <span className="repeat-pick">
      <select value={value?.freq ?? ''} onChange={(e) => setFreq(e.target.value)} aria-label="Repeats">
        <option value="">Doesn't repeat</option>
        <option value="daily">Daily</option>
        <option value="weekly">Weekly</option>
        <option value="monthly">Monthly</option>
        <option value="yearly">Yearly</option>
      </select>
      {value && (
        <>
          <span className="muted">every</span>
          <input type="number" min={1} max={52} value={value.interval} aria-label="Interval"
            onChange={(e) => onChange({ ...value, interval: Math.min(52, Math.max(1, parseInt(e.target.value, 10) || 1)) })} />
          <span className="muted">{UNITS[value.freq]}</span>
        </>
      )}
      {value?.freq === 'weekly' && (
        <span className="dows">
          {DOW.map((l, d) => (
            <button key={d} type="button" title={DOW_FULL[d]} aria-pressed={value.days?.includes(d) ?? false}
              className={value.days?.includes(d) ? 'chip on' : 'chip'} onClick={() => toggleDay(d)}>{l}</button>
          ))}
        </span>
      )}
      {value?.freq === 'monthly' && (
        <select value={!value.nth ? 'date' : value.nth === -1 && isLastOf(date) ? 'last' : 'nth'} onChange={(e) => setMonthly(e.target.value)} aria-label="Which day of the month">
          <option value="date">on the {date.getDate()}{suffix(date.getDate())}</option>
          <option value="nth">on the {ORD[nthOf(date)]} {DOW_SHORT[day]}</option>
          {isLastOf(date) && <option value="last">on the last {DOW_SHORT[day]}</option>}
        </select>
      )}
      {value && (
        <label className="until">
          <span className="muted">until</span>
          <input type="date" value={value.until ?? ''} min={dayKey(date)} aria-label="Until (optional)" onChange={(e) => setUntil(e.target.value)} />
        </label>
      )}
    </span>
  );
}

function suffix(n: number) {
  if (n % 100 >= 11 && n % 100 <= 13) return 'th';
  return ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
}
