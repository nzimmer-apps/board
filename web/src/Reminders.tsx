// Notification timing chips: pick any combination when adding or editing a dated note,
// or add a custom lead time ("8 hours before"). A dated note must get an explicit choice:
// value null = not chosen yet, [] = no reminder ("None"), [0, 60] = at the time and 1 hr before.
import { useState } from 'react';

export const OFFSETS: { m: number; label: string }[] = [
  { m: 0, label: 'At time' },
  { m: 15, label: '15 min' },
  { m: 60, label: '1 hr' },
  { m: 120, label: '2 hr' },
  { m: 1440, label: '1 day' },
  { m: 10080, label: '1 week' },
];
export const MAX_REMINDERS = 8;

export function offsetLabel(m: number) {
  if (m === 0) return 'At time';
  const unit = (n: number, s: string) => `${n} ${s}${n === 1 || s === 'hr' || s === 'min' ? '' : 's'}`;
  if (m % 10080 === 0) return unit(m / 10080, 'week');
  if (m % 1440 === 0) return unit(m / 1440, 'day');
  if (m % 60 === 0) return unit(m / 60, 'hr');
  if (m < 60) return unit(m, 'min');
  return `${Math.floor(m / 60)} hr ${m % 60} min`;
}

export const chipLabel = (m: number) => (m === 0 ? 'At time' : `${offsetLabel(m)} before`);

export default function ReminderPicker({ value: chosen, onChange }: { value: number[] | null; onChange: (v: number[] | null) => void }) {
  const value = chosen ?? [];
  const [adding, setAdding] = useState(false);
  const [n, setN] = useState('8');
  const [unit, setUnit] = useState(60);
  // Un-ticking the last time goes back to "not chosen"; "None" is its own choice.
  const set = (v: number[]) => onChange(v.length ? [...new Set(v)].sort((a, b) => a - b).slice(0, MAX_REMINDERS) : null);
  const toggle = (m: number) => set(value.includes(m) ? value.filter((x) => x !== m) : [...value, m]);
  // Presets, plus whatever custom times are already on this note.
  const shown = [...OFFSETS.map((o) => o.m), ...value.filter((m) => !OFFSETS.some((o) => o.m === m))].sort((a, b) => a - b);
  const addCustom = () => {
    const m = Math.round(parseFloat(n) * unit);
    if (Number.isFinite(m) && m >= 0 && m <= 525600) set([...value, m]);
    setAdding(false);
  };
  return (
    <span className={chosen === null ? 'remind required' : 'remind'}>
      <span className="remind-label">{chosen === null ? 'Remind me — pick one:' : 'Remind me:'}</span>
      {shown.map((m) => (
        <button key={m} type="button" className={value.includes(m) ? 'chip on' : 'chip'} onClick={() => toggle(m)}>
          {chipLabel(m)}
        </button>
      ))}
      {adding ? (
        <span className="custom">
          <input type="number" min="0" step="any" value={n} autoFocus aria-label="How long before"
            onChange={(e) => setN(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }} />
          <select value={unit} onChange={(e) => setUnit(Number(e.target.value))} aria-label="Unit">
            <option value={1}>min</option>
            <option value={60}>hours</option>
            <option value={1440}>days</option>
            <option value={10080}>weeks</option>
          </select>
          <button type="button" className="chip on" onClick={addCustom}>Add</button>
        </span>
      ) : (
        value.length < MAX_REMINDERS && (
          <button type="button" className="chip" title="Add another warning time" onClick={() => setAdding(true)}>+ Custom</button>
        )
      )}
      <button type="button" className={chosen?.length === 0 ? 'chip on' : 'chip'} onClick={() => onChange(chosen?.length === 0 ? null : [])}>
        None
      </button>
    </span>
  );
}
