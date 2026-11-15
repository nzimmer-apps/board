// Notification timing chips. A dated note must get an explicit choice: one or more times, or "None".
// value: null = not chosen yet, [] = no reminder, [0, 60] = at the time and 1 hr before.
export const OFFSETS: { m: number; label: string }[] = [
  { m: 0, label: 'At time' },
  { m: 15, label: '15 min' },
  { m: 60, label: '1 hr' },
  { m: 1440, label: '1 day' },
  { m: 10080, label: '1 week' },
];

export function offsetLabel(m: number) {
  return OFFSETS.find((o) => o.m === m)?.label ?? `${m} min`;
}

export const chipLabel = (o: { m: number; label: string }) => (o.m === 0 ? o.label : `${o.label} before`);

interface Props {
  value: number[] | null;
  onChange: (v: number[] | null) => void;
}

export default function ReminderPicker({ value, onChange }: Props) {
  const picked = value ?? [];
  const toggle = (m: number) => {
    const next = picked.includes(m) ? picked.filter((x) => x !== m) : [...picked, m].sort((a, b) => a - b);
    onChange(next.length ? next : null); // un-ticking the last time goes back to "not chosen"
  };
  return (
    <span className={value === null ? 'remind required' : 'remind'}>
      <span className="remind-label">{value === null ? 'Remind me — pick one:' : 'Remind me:'}</span>
      {OFFSETS.map((o) => (
        <button key={o.m} type="button" className={picked.includes(o.m) ? 'chip on' : 'chip'} onClick={() => toggle(o.m)}>
          {chipLabel(o)}
        </button>
      ))}
      <button type="button" className={value?.length === 0 ? 'chip on' : 'chip'} onClick={() => onChange(value?.length === 0 ? null : [])}>
        None
      </button>
    </span>
  );
}
