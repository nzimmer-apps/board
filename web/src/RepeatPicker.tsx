// "Repeats: weekly, every 1 week, on Mon Thu" – edits an item's repeat rule.
import type { Repeat, Freq } from './repeat';

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DOW_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const UNITS: Record<Freq, string> = { daily: 'day(s)', weekly: 'week(s)', monthly: 'month(s)', yearly: 'year(s)' };

interface Props {
  value: Repeat | null;
  onChange: (r: Repeat | null) => void;
  /** Weekday of the item's date, used as the default day for a new weekly rule. */
  day: number;
}

export default function RepeatPicker({ value, onChange, day }: Props) {
  const setFreq = (f: string) => {
    if (!f) return onChange(null);
    const freq = f as Freq;
    onChange({ freq, interval: value?.interval ?? 1, ...(freq === 'weekly' ? { days: value?.days?.length ? value.days : [day] } : {}) });
  };
  const toggleDay = (d: number) => {
    if (!value) return;
    const cur = value.days ?? [];
    const days = cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort((a, b) => a - b);
    if (days.length) onChange({ ...value, days });
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
    </span>
  );
}
