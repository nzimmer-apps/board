import { useEffect, useState } from 'react';
import { imageUrl } from './images';
import ReminderPicker, { OFFSETS, chipLabel, offsetLabel } from './Reminders';
import type { Item } from './supabase';
import { describeRepeat, nextOccurrence, repeatChoices, shownDate, type Repeat } from './recur';

/** The note's date as text; for a repeating note, its next occurrence from today on. */
export function fmtDue(it: Pick<Item, 'due_at' | 'all_day'> & Partial<Pick<Item, 'repeat' | 'repeat_until'>>) {
  const d = shownDate(it);
  if (!d) return '';
  return d.toLocaleString([], {
    weekday: 'short', month: 'short', day: 'numeric',
    ...(it.all_day ? {} : { hour: 'numeric', minute: '2-digit' }),
  });
}

function toLocalInput(iso: string | Date | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A rule that still fits after the date moves (the last-weekday rule needs a date in the last week). */
function fitRepeat(r: Repeat | null, d: Date): Repeat | null {
  if (!r || repeatChoices(d).includes(r)) return r;
  return 'monthly-nth';
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
  // A repeating note edits its next occurrence; saving it re-anchors the series there, same rule.
  const startDue = toLocalInput(shownDate(item));
  // Open the editor on the note as it is now (it may have changed since this card first rendered).
  function startEdit() {
    setBody(item.body);
    setDue(startDue);
    setTags(item.tags.join(' '));
    setRemind(item.remind_offsets);
    setRepeat(item.repeat);
    setUntil(item.repeat_until ? toLocalInput(item.repeat_until).slice(0, 10) : '');
    setEditing(true);
  }
  const [due, setDue] = useState(startDue);
  const [repeat, setRepeat] = useState<Repeat | null>(item.repeat);
  const [until, setUntil] = useState(item.repeat_until ? toLocalInput(item.repeat_until).slice(0, 10) : '');
  const [tags, setTags] = useState(item.tags.join(' '));
  const [remind, setRemind] = useState<number[] | null>(item.remind_offsets);
  const needsReminder = Boolean(due) && remind === null;
  const shown = shownDate(item);
  const overdue = shown && !item.done && shown < new Date();
  const created = new Date(item.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  function save() {
    onUpdate(item.id, {
      body: body.trim() || item.body,
      due_at: due ? new Date(due).toISOString() : null,
      all_day: due ? item.all_day && due.endsWith('09:00') : false,
      kind: due ? item.kind ?? 'event' : null,
      tags: tags.split(/[\s,#]+/).map((t) => t.toLowerCase()).filter(Boolean),
      remind_offsets: remind,
      repeat: due ? fitRepeat(repeat, new Date(due)) : null,
      repeat_until: due && repeat && until ? new Date(`${until}T00:00`).toISOString() : null,
    });
    setEditing(false);
  }

  const cls = ['card', item.pinned && 'pinned', item.done && 'done', item.tags.length && 'tagged'].filter(Boolean).join(' ');

  return (
    <article className={cls}>
      <div className="meta">
        <span>{created}{item.source !== 'app' ? ` · ${item.source}` : ''}</span>
        <span className="actions">
          {item.due_at && item.repeat && !item.done ? (
            <button title="Done for this time: move to the next date" onClick={() => {
              // Skip past the occurrence on show; a finished series becomes done.
              const next = shown ? nextOccurrence(item, shown.getTime() + 60e3) : null;
              onUpdate(item.id, next ? { due_at: next.toISOString() } : { done: true });
            }}>✓</button>
          ) : item.due_at && (
            <button title={item.done ? 'Mark not done' : 'Mark done'} onClick={() => onUpdate(item.id, { done: !item.done })}>
              {item.done ? '↺' : '✓'}
            </button>
          )}
          <button title={item.pinned ? 'Unpin' : 'Pin'} onClick={() => onUpdate(item.id, { pinned: !item.pinned })}>
            {item.pinned ? '★' : '☆'}
          </button>
          <button title="Edit" onClick={() => (editing ? setEditing(false) : startEdit())}>✎</button>
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
          <label>Date <input type="datetime-local" value={due} onChange={(e) => {
            setDue(e.target.value);
            // A new or moved date is a new schedule: ask again rather than carry the old choice over.
            if (e.target.value !== startDue) setRemind(null);
            else setRemind(item.remind_offsets);
          }} /></label>
          {due && (
            <label>Repeat
              <select value={fitRepeat(repeat, new Date(due)) ?? ''} onChange={(e) => setRepeat((e.target.value || null) as Repeat | null)}>
                <option value="">Doesn't repeat</option>
                {repeatChoices(new Date(due)).map((r) => <option key={r} value={r}>{describeRepeat(r, new Date(due))}</option>)}
              </select>
            </label>
          )}
          {due && repeat && (
            <label>Until (optional) <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} /></label>
          )}
          {due && <ReminderPicker value={remind} onChange={setRemind} />}
          <label>Tags <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="work llc" /></label>
          <div className="row">
            <button className="primary" onClick={save} disabled={needsReminder}
              title={needsReminder ? 'Pick when to be reminded first' : undefined}>Save</button>
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
          {item.repeat && <span className="repeat">🔁 {describeRepeat(item.repeat, new Date(item.due_at))}{item.repeat_until ? ` until ${new Date(item.repeat_until).toLocaleDateString([], { month: 'short', day: 'numeric' })}` : ''} · next </span>}
          {item.kind === 'deadline' ? 'Due ' : item.kind === 'reminder' ? 'Remind ' : ''}
          {fmtDue(item)}
          {item.remind_offsets === null
            ? null
            : item.remind_offsets.length > 0
              ? <span className="muted"> · 🔔 {item.remind_offsets.map(offsetLabel).join(', ')}</span>
              : <span className="muted"> · 🔕</span>}
        </div>
      )}
      {item.due_at && !editing && !item.done && item.remind_offsets === null && (
        // Dated but no reminder chosen (image flyer, share sheet, extension…): one tap sets it.
        <div className="ask-remind">
          <span>🔔 When should I remind you?</span>
          <div className="row">
            {OFFSETS.map((o) => (
              <button key={o.m} className="chip" onClick={() => onUpdate(item.id, { remind_offsets: [o.m] })}>{chipLabel(o)}</button>
            ))}
            <button className="chip" onClick={() => onUpdate(item.id, { remind_offsets: [] })}>None</button>
          </div>
        </div>
      )}
    </article>
  );
}
