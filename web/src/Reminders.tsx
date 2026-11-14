// Notification timing chips: pick any combination when adding or editing a dated note.
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

export default function ReminderPicker({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  const toggle = (m: number) =>
    onChange(value.includes(m) ? value.filter((x) => x !== m) : [...value, m].sort((a, b) => a - b));
  return (
    <span className="remind">
      <span className="muted">Notify:</span>
      {OFFSETS.map((o) => (
        <button key={o.m} type="button" className={value.includes(o.m) ? 'chip on' : 'chip'} onClick={() => toggle(o.m)}>
          {o.m === 0 ? o.label : `${o.label} before`}
        </button>
      ))}
      {value.length === 0 && <span className="muted small">off</span>}
    </span>
  );
}
