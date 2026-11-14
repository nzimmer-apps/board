import { useEffect, useMemo, useRef, useState } from 'react';
import type { Item } from './supabase';
import Card, { fmtDue } from './Card';
import ReminderPicker from './Reminders';
import { parseInput } from './parse';

interface Props {
  items: Item[];
  onAdd: (raw: string, source?: string, remind?: number[]) => Promise<boolean>;
  onAddImage: (img: Blob, caption: string, source?: string, remind?: number[]) => Promise<boolean>;
  onUpdate: (id: string, patch: Partial<Item>) => void;
  onRemove: (id: string) => void;
}

export default function Board({ items, onAdd, onAddImage, onUpdate, onRemove }: Props) {
  const [draft, setDraft] = useState('');
  const [q, setQ] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [remind, setRemind] = useState<number[]>([0]);
  // Live preview: show the detected date and notification choices while typing.
  const preview = useMemo(() => (draft.trim() ? parseInput(draft) : null), [draft]);

  // Images use the typed text (if any) as their caption, so "#receipts" + a photo is filed under receipts.
  async function addFiles(files: Iterable<File>) {
    const imgs = [...files].filter((f) => f.type.startsWith('image/'));
    if (!imgs.length) return;
    const caption = draft.trim();
    setDraft('');
    for (const f of imgs) await onAddImage(f, caption, 'app', remind);
    setRemind([0]);
  }

  useEffect(() => {
    const f = () => setTimeout(() => inputRef.current?.focus(), 50);
    window.addEventListener('board-focus-capture', f);
    return () => window.removeEventListener('board-focus-capture', f);
  }, []);

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
        const hay = `${i.body} ${i.ocr_text ?? ''} ${i.url ?? ''} ${i.tags.map((t) => '#' + t).join(' ')} ${fmtDue(i)}`.toLowerCase();
        return terms.every((t) => hay.includes(t));
      })
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.created_at.localeCompare(a.created_at));
  }, [items, q, tag]);

  async function submit() {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    const ok = await onAdd(text, 'app', remind);
    if (!ok) setDraft(text);
    else setRemind([0]);
    inputRef.current?.focus();
  }

  return (
    <main>
      <div
        className={dragging ? 'capture dragging' : 'capture'}
        onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true); } }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
      >
        <textarea
          onPaste={(e) => {
            const files = [...e.clipboardData.files];
            if (files.some((f) => f.type.startsWith('image/'))) { e.preventDefault(); addFiles(files); }
          }}
          ref={inputRef}
          value={draft}
          rows={2}
          placeholder="Type anything…  #tag  ·  'call John fri 3pm'  ·  'report due Dec 1'"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
          }}
        />
        <input ref={fileRef} type="file" accept="image/*" multiple hidden
          onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} />
        <button title="Add image (or paste / drop one)" onClick={() => fileRef.current?.click()}>🖼</button>
        <button className="primary" onClick={submit} disabled={!draft.trim()}>Add</button>
      </div>

      {preview?.due_at && (
        <div className="preview">
          <span className="when">
            {preview.kind === 'deadline' ? 'Due ' : preview.kind === 'reminder' ? 'Remind ' : '📅 '}
            {fmtDue(preview)}
          </span>
          {preview.tags.length > 0 && <span className="muted">#{preview.tags.join(' #')}</span>}
          <ReminderPicker value={remind} onChange={setRemind} />
        </div>
      )}

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
                <span className="what">{i.body.split('\n')[0] || 'Image'}</span>
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
