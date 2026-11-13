import { useMemo, useRef, useState } from 'react';
import type { Item } from './supabase';
import Card, { fmtDue } from './Card';

interface Props {
  items: Item[];
  onAdd: (raw: string) => Promise<boolean>;
  onUpdate: (id: string, patch: Partial<Item>) => void;
  onRemove: (id: string) => void;
}

export default function Board({ items, onAdd, onUpdate, onRemove }: Props) {
  const [draft, setDraft] = useState('');
  const [q, setQ] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const tagCounts = useMemo(() => {
    const m = new Map<string, number>();
    items.forEach((i) => i.tags.forEach((t) => m.set(t, (m.get(t) ?? 0) + 1)));
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [items]);

  const upcoming = useMemo(() => {
    const horizon = Date.now() + 7 * 864e5;
    return items
      .filter((i) => i.due_at && !i.done && new Date(i.due_at).getTime() < horizon)
      .sort((a, b) => a.due_at!.localeCompare(b.due_at!))
      .slice(0, 8);
  }, [items]);

  const shown = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    return items
      .filter((i) => !tag || i.tags.includes(tag))
      .filter((i) => {
        if (!terms.length) return true;
        const hay = `${i.body} ${i.url ?? ''} ${i.tags.map((t) => '#' + t).join(' ')} ${fmtDue(i)}`.toLowerCase();
        return terms.every((t) => hay.includes(t));
      })
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.created_at.localeCompare(a.created_at));
  }, [items, q, tag]);

  async function submit() {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    const ok = await onAdd(text);
    if (!ok) setDraft(text);
    inputRef.current?.focus();
  }

  return (
    <main>
      <div className="capture">
        <textarea
          ref={inputRef}
          value={draft}
          rows={2}
          placeholder="Type anything…  #tag  ·  'call John fri 3pm'  ·  'report due Dec 1'"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
          }}
        />
        <button className="primary" onClick={submit} disabled={!draft.trim()}>Add</button>
      </div>

      <div className="filters">
        <input className="search" type="search" placeholder="Search text, #tags or dates…" value={q}
          onChange={(e) => setQ(e.target.value)} />
        <div className="chips">
          <button className={!tag ? 'chip on' : 'chip'} onClick={() => setTag(null)}>All {items.length}</button>
          {tagCounts.map(([t, n]) => (
            <button key={t} className={tag === t ? 'chip on' : 'chip'} onClick={() => setTag(tag === t ? null : t)}>
              #{t} <span className="muted">{n}</span>
            </button>
          ))}
        </div>
      </div>

      {upcoming.length > 0 && !q && !tag && (
        <section className="upcoming">
          <h2>Next 7 days</h2>
          <ul>
            {upcoming.map((i) => (
              <li key={i.id} className={new Date(i.due_at!) < new Date() ? 'overdue' : ''}>
                <button className="tick" title="Mark done" onClick={() => onUpdate(i.id, { done: true })}>○</button>
                <span className="when">{fmtDue(i)}</span>
                <span className="what">{i.body.split('\n')[0]}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {shown.length === 0 ? (
        <p className="empty muted">{items.length ? 'Nothing matches.' : 'Your board is empty. Add your first thought above, or share something to Board from any app.'}</p>
      ) : (
        <div className="grid">
          {shown.map((i) => (
            <Card key={i.id} item={i} onUpdate={onUpdate} onRemove={onRemove} onTag={setTag} />
          ))}
        </div>
      )}
    </main>
  );
}
