// Archived notes: look through them, put them back, or delete them for good.
import { useMemo, useState } from 'react';
import type { Item, TagColors } from './supabase';
import Card, { fmtDue } from './Card';

interface Props {
  items: Item[] | null; // null while loading
  colors: TagColors;
  onUpdate: (id: string, patch: Partial<Item>) => void;
  onRemove: (id: string) => void;
}

export default function Archive({ items, colors, onUpdate, onRemove }: Props) {
  const [q, setQ] = useState('');
  const [only, setOnly] = useState<'all' | 'events'>('all');

  const shown = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    return (items ?? [])
      .filter((i) => only === 'all' || i.due_at)
      .filter((i) => {
        if (!terms.length) return true;
        const hay = `${i.body} ${i.ocr_text ?? ''} ${i.url ?? ''} ${i.location ?? ''} ${i.tags.map((t) => '#' + t).join(' ')} ${fmtDue(i)}`.toLowerCase();
        return terms.every((t) => hay.includes(t));
      })
      // Events by date (latest first), everything else by when it was written.
      .sort((a, b) => (b.due_at ?? b.created_at).localeCompare(a.due_at ?? a.created_at));
  }, [items, q, only]);

  if (items === null) return <main><p className="empty muted">Loading archive…</p></main>;
  const events = items.filter((i) => i.due_at).length;

  return (
    <main>
      <div className="filters" style={{ marginTop: 16 }}>
        <input className="search" type="search" placeholder="Search the archive…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="chips">
          <button className={only === 'all' ? 'chip on' : 'chip'} onClick={() => setOnly('all')}>All {items.length}</button>
          <button className={only === 'events' ? 'chip on' : 'chip'} onClick={() => setOnly('events')}>Events &amp; dates {events}</button>
          {shown.length > 0 && (
            <button className="chip danger" style={{ marginLeft: 'auto' }}
              onClick={() => confirm(`Delete ${shown.length === items.length ? 'all' : 'these'} ${shown.length} archived notes permanently? This cannot be undone.`) && shown.forEach((i) => onRemove(i.id))}>
              Delete {shown.length === items.length ? 'all' : 'shown'}
            </button>
          )}
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="empty muted">{items.length ? 'Nothing matches.' : 'The archive is empty. Archived notes and past events land here.'}</p>
      ) : (
        <div className="grid">
          {shown.map((i) => <Card key={i.id} item={i} colors={colors} archived onUpdate={onUpdate} onRemove={onRemove} />)}
        </div>
      )}
    </main>
  );
}
