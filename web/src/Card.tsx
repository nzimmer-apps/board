import { useState } from 'react';
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

interface Props {
  item: Item;
  onUpdate: (id: string, patch: Partial<Item>) => void;
  onRemove: (id: string) => void;
  onTag?: (t: string) => void;
}

export default function Card({ item, onUpdate, onRemove, onTag }: Props) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(item.body);
  const [due, setDue] = useState(toLocalInput(item.due_at));
  const [tags, setTags] = useState(item.tags.join(' '));
  const overdue = item.due_at && !item.done && new Date(item.due_at) < new Date();
  const created = new Date(item.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  function save() {
    onUpdate(item.id, {
      body: body.trim() || item.body,
      due_at: due ? new Date(due).toISOString() : null,
      all_day: due ? item.all_day && due.endsWith('09:00') : false,
      kind: due ? item.kind ?? 'event' : null,
      tags: tags.split(/[\s,#]+/).map((t) => t.toLowerCase()).filter(Boolean),
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
          <label>Tags <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="work llc" /></label>
          <div className="row">
            <button className="primary" onClick={save}>Save</button>
            <button onClick={() => setEditing(false)}>Cancel</button>
            <button className="danger" onClick={() => confirm('Delete permanently?') && onRemove(item.id)}>Delete</button>
          </div>
        </div>
      ) : (
        <Body text={item.body} />
      )}
      {item.due_at && !editing && (
        <div className={overdue ? 'due overdue' : 'due'}>
          {item.kind === 'deadline' ? 'Due ' : item.kind === 'reminder' ? 'Remind ' : ''}
          {fmtDue(item)}
        </div>
      )}
    </article>
  );
}
