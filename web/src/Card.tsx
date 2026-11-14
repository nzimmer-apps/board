import { useEffect, useState } from 'react';
import { imageUrl } from './images';
import ReminderPicker, { offsetLabel } from './Reminders';
import type { Item } from './supabase';

export function fmtDue(it: Pick<Item, 'due_at' | 'all_day'>) {
  if (!it.due_at) return '';
  const d = new Date(it.due_at);
  return d.toLocaleString([], {
    weekday: 'short', month: 'short', day: 'numeric',
    ...(it.all_day ? {} : { hour: 'numeric', minute: '2-digit' }),
  });
}

function toLocalInput(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const LINK_RE = /(https?:\/\/[^\s<>"]+)/g;

function Body({ text }: { text: string }) {
  const parts = text.split(LINK_RE);
  return (
    <p className="body">
      {parts.map((p, i) =>
        i % 2 ? <a key={i} href={p} target="_blank" rel="noreferrer">{p}</a> : <span key={i}>{p}</span>,
      )}
    </p>
  );
}

function Picture({ path, onOpen }: { path: string; onOpen: (url: string) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { let live = true; imageUrl(path).then((u) => live && setUrl(u)); return () => { live = false; }; }, [path]);
  if (!url) return <div className="pic loading" />;
  return <img className="pic" src={url} alt="" loading="lazy" onClick={() => onOpen(url)} />;
}

function OcrText({ text }: { text: string | null }) {
  const [open, setOpen] = useState(false);
  if (text === null) return <div className="ocr muted">Reading text…</div>;
  if (!text) return null;
  const short = text.length > 140 && !open;
  return (
    <div className="ocr" onClick={() => setOpen(!open)} title="Text found in the image">
      <span className="ocr-label">TEXT</span> {short ? text.slice(0, 140).replace(/\n/g, ' ') + '…' : text}
    </div>
  );
}

interface Props {
  item: Item;
  onUpdate: (id: string, patch: Partial<Item>) => void;
  onRemove: (id: string) => void;
  onTag?: (t: string) => void;
}

export default function Card({ item, onUpdate, onRemove, onTag }: Props) {
  const [editing, setEditing] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);
  const [body, setBody] = useState(item.body);
  const [due, setDue] = useState(toLocalInput(item.due_at));
  const [tags, setTags] = useState(item.tags.join(' '));
  const [remind, setRemind] = useState<number[]>(item.remind_offsets ?? [0]);
  const overdue = item.due_at && !item.done && new Date(item.due_at) < new Date();
  const created = new Date(item.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  function save() {
    onUpdate(item.id, {
      body: body.trim() || item.body,
      due_at: due ? new Date(due).toISOString() : null,
      all_day: due ? item.all_day && due.endsWith('09:00') : false,
      kind: due ? item.kind ?? 'event' : null,
      tags: tags.split(/[\s,#]+/).map((t) => t.toLowerCase()).filter(Boolean),
      remind_offsets: remind,
    });
    setEditing(false);
  }

  const cls = ['card', item.pinned && 'pinned', item.done && 'done', item.tags.length && 'tagged'].filter(Boolean).join(' ');

  return (
    <article className={cls}>
      <div className="meta">
        <span>{created}{item.source !== 'app' ? ` · ${item.source}` : ''}</span>
        <span className="actions">
          {item.due_at && (
            <button title={item.done ? 'Mark not done' : 'Mark done'} onClick={() => onUpdate(item.id, { done: !item.done })}>
              {item.done ? '↺' : '✓'}
            </button>
          )}
          <button title={item.pinned ? 'Unpin' : 'Pin'} onClick={() => onUpdate(item.id, { pinned: !item.pinned })}>
            {item.pinned ? '★' : '☆'}
          </button>
          <button title="Edit" onClick={() => setEditing((e) => !e)}>✎</button>
          <button title="Archive" onClick={() => onUpdate(item.id, { archived: true })}>⌫</button>
        </span>
      </div>
      {item.tags.length > 0 && (
        <div className="tags">
          {item.tags.map((t) => (
            <button key={t} className="tag" onClick={() => onTag?.(t)}>#{t}</button>
          ))}
        </div>
      )}
      {editing ? (
        <div className="edit">
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} />
          <label>Date <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} /></label>
          {due && <ReminderPicker value={remind} onChange={setRemind} />}
          <label>Tags <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="work llc" /></label>
          <div className="row">
            <button className="primary" onClick={save}>Save</button>
            <button onClick={() => setEditing(false)}>Cancel</button>
            <button className="danger" onClick={() => confirm('Delete permanently?') && onRemove(item.id)}>Delete</button>
          </div>
        </div>
      ) : (
        item.body && <Body text={item.body} />
      )}
      {item.image_path && <Picture path={item.image_path} onOpen={setZoom} />}
      {item.image_path && !editing && <OcrText text={item.ocr_text} />}
      {zoom && <div className="lightbox" onClick={() => setZoom(null)}><img src={zoom} alt="" /></div>}
      {item.due_at && !editing && (
        <div className={overdue ? 'due overdue' : 'due'}>
          {item.kind === 'deadline' ? 'Due ' : item.kind === 'reminder' ? 'Remind ' : ''}
          {fmtDue(item)}
          {(item.remind_offsets ?? []).length > 0
            ? <span className="muted"> · 🔔 {(item.remind_offsets ?? []).map(offsetLabel).join(', ')}</span>
            : <span className="muted"> · 🔕</span>}
        </div>
      )}
    </article>
  );
}
