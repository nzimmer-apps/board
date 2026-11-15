import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, configured, type Item } from './supabase';
import { parseInput, findEventDate } from './parse';
import Auth from './Auth';
import Board from './Board';
import Calendar from './Calendar';
import { onShared, syncReminders, registerHotkey } from './native';
import { shrink, upload, readText, download, removeImage } from './images';

type View = 'board' | 'calendar';

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [items, setItems] = useState<Item[]>([]);
  const [view, setView] = useState<View>(() => (location.hash === '#calendar' ? 'calendar' : 'board'));
  const [toast, setToast] = useState<string | null>(null);
  const shareHandled = useRef(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const flash = useCallback((m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 2500);
  }, []);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('items')
      .select('id,body,url,tags,source,due_at,all_day,kind,done,pinned,archived,created_at,image_path,ocr_text,remind_offsets')
      .eq('archived', false)
      .order('created_at', { ascending: false })
      .limit(1000);
    if (error) flash(error.message);
    else setItems(data as Item[]);
  }, [flash]);

  // Initial load + live sync from other devices
  useEffect(() => {
    if (!session) return;
    load();
    const ch = supabase
      .channel('items')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, () => load())
      .subscribe();
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => {
      supabase.removeChannel(ch);
      window.removeEventListener('focus', onFocus);
    };
  }, [session, load]);

  const add = useCallback(
    async (raw: string, source = 'app', remind: number[] | null = null) => {
      const parsed = parseInput(raw);
      // A reminder is never assumed: dated notes without a choice save as null and the card asks.
      const p = { ...parsed, remind_offsets: parsed.due_at ? remind : null };
      const optimistic: Item = {
        id: `tmp-${Date.now()}`, ...p, source, done: false, pinned: false, archived: false,
        created_at: new Date().toISOString(), image_path: null, ocr_text: null,
      };
      setItems((xs) => [optimistic, ...xs]);
      const { data, error } = await supabase.from('items').insert({ ...p, source }).select().single();
      if (error) {
        setItems((xs) => xs.filter((x) => x.id !== optimistic.id));
        flash(`Not saved: ${error.message}`);
        return false;
      }
      setItems((xs) => xs.map((x) => (x.id === optimistic.id ? (data as Item) : x)));
      const bell = !p.due_at ? '' : p.remind_offsets === null ? ' · pick a reminder' : p.remind_offsets.length ? ' 🔔' : '';
      const when = p.due_at ? ` · ${new Date(p.due_at).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', ...(p.all_day ? {} : { hour: 'numeric', minute: '2-digit' }) })}` : '';
      flash(`Saved${p.tags.length ? ` to #${p.tags.join(' #')}` : ''}${when}${bell}`);
      return true;
    },
    [flash],
  );

  const update = useCallback(
    async (id: string, patch: Partial<Item>) => {
      setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
      const { error } = await supabase.from('items').update(patch).eq('id', id);
      if (error) { flash(error.message); load(); }
    },
    [flash, load],
  );

  const remove = useCallback(
    async (id: string) => {
      const path = items.find((x) => x.id === id)?.image_path;
      setItems((xs) => xs.filter((x) => x.id !== id));
      const { error } = await supabase.from('items').delete().eq('id', id);
      if (error) { flash(error.message); load(); return; }
      if (path) removeImage(path).catch(() => {});
    },
    [flash, load, items],
  );

  // Images: shrink → upload → item row. OCR runs afterwards in the queue below.
  const localBlobs = useRef(new Map<string, Blob>());
  const addImage = useCallback(
    async (file: Blob, caption = '', source = 'app', remind: number[] | null = null) => {
      flash('Uploading image…');
      try {
        const blob = await shrink(file);
        const path = await upload(blob);
        localBlobs.current.set(path, blob);
        const p = parseInput(caption);
        const { data, error } = await supabase
          .from('items')
          .insert({ ...p, body: caption.trim() ? p.body : '', image_path: path, source, remind_offsets: p.due_at ? remind : null })
          .select()
          .single();
        if (error) throw error;
        setItems((xs) => [data as Item, ...xs]);
        flash('Image saved · reading text…');
        return true;
      } catch (e) {
        flash(`Image not saved: ${(e as Error).message}`);
        return false;
      }
    },
    [flash],
  );

  // OCR queue: any image without text yet gets read on this device, one at a time.
  const ocrBusy = useRef(false);
  const ocrFailed = useRef(new Set<string>());
  useEffect(() => {
    if (!session || ocrBusy.current) return;
    const next = items.find((i) => i.image_path && i.ocr_text === null && !i.id.startsWith('tmp-') && !ocrFailed.current.has(i.id));
    if (!next) return;
    ocrBusy.current = true;
    (async () => {
      try {
        const blob = localBlobs.current.get(next.image_path!) ?? (await download(next.image_path!));
        if (!blob) throw new Error('download failed');
        const text = await readText(blob);
        localBlobs.current.delete(next.image_path!);
        // A flyer, ticket or invite: if the image names a day and the note has no date yet, book it.
        const ev = text && !next.due_at ? findEventDate(text) : null;
        if (ev) {
          const tags = next.tags.includes('event') ? next.tags : [...next.tags, 'event'];
          await update(next.id, { ocr_text: text, ...ev, kind: 'event', tags, remind_offsets: null });
          flash(`Added to calendar · ${new Date(ev.due_at).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', ...(ev.all_day ? {} : { hour: 'numeric', minute: '2-digit' }) })} · pick a reminder`);
        } else {
          await update(next.id, { ocr_text: text });
          if (text) flash(`Read ${text.split(/\s+/).length} words from image`);
        }
      } catch (e) {
        console.warn('ocr', e);
        ocrFailed.current.add(next.id);
      } finally {
        ocrBusy.current = false;
        setItems((xs) => [...xs]); // nudge the queue to look for the next one
      }
    })();
  }, [session, items, update, flash]);

  // Android share sheet → manifest share_target opens ./?share=1&title=…&text=…&url=…
  useEffect(() => {
    if (!session || shareHandled.current) return;
    const q = new URLSearchParams(location.search);
    if (!q.has('share')) return;
    shareHandled.current = true;
    const parts = [q.get('title'), q.get('text'), q.get('url')]
      .map((s) => (s ?? '').trim())
      .filter(Boolean);
    // Many apps put the URL inside "text" too — drop exact duplicates.
    const body = [...new Set(parts)].join('\n');
    history.replaceState(null, '', location.pathname + location.hash);
    if (body) add(body, 'share');
  }, [session, add]);

  // Native apps: share sheet (Android), reminders (both), global hotkey (Windows)
  useEffect(() => {
    if (!session) return;
    let off = () => {};
    onShared((text) => add(text, 'share'), (img, caption) => addImage(img, caption, 'share')).then((f) => (off = f));
    return () => off();
  }, [session, add, addImage]);

  useEffect(() => {
    if (session) syncReminders(items);
  }, [session, items]);

  useEffect(() => {
    registerHotkey(() => {
      setView('board');
      window.dispatchEvent(new Event('board-focus-capture'));
    }).catch((e) => console.warn('hotkey', e));
  }, []);

  useEffect(() => {
    history.replaceState(null, '', `${location.pathname}${location.search}${view === 'calendar' ? '#calendar' : ''}`);
  }, [view]);

  if (!configured)
    return (
      <div className="auth">
        <h1 className="brand">Board</h1>
        <p className="note">Not configured yet: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.</p>
      </div>
    );
  if (session === undefined) return <div className="auth muted">Loading…</div>;
  if (!session) return <Auth />;

  return (
    <div className="app">
      <header className="top">
        <span className="brand">Board</span>
        <nav>
          <button className={view === 'board' ? 'tab on' : 'tab'} onClick={() => setView('board')}>Board</button>
          <button className={view === 'calendar' ? 'tab on' : 'tab'} onClick={() => setView('calendar')}>Calendar</button>
        </nav>
        <button className="link small" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </header>
      {view === 'board' ? (
        <Board items={items} onAdd={add} onAddImage={addImage} onUpdate={update} onRemove={remove} />
      ) : (
        <Calendar items={items} onUpdate={update} onRemove={remove} />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
