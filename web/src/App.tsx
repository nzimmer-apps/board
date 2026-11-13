import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, configured, type Item } from './supabase';
import { parseInput } from './parse';
import Auth from './Auth';
import Board from './Board';
import Calendar from './Calendar';

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
      .select('id,body,url,tags,source,due_at,all_day,kind,done,pinned,archived,created_at')
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
    async (raw: string, source = 'app') => {
      const p = parseInput(raw);
      const optimistic: Item = {
        id: `tmp-${Date.now()}`, ...p, source, done: false, pinned: false, archived: false,
        created_at: new Date().toISOString(),
      };
      setItems((xs) => [optimistic, ...xs]);
      const { data, error } = await supabase.from('items').insert({ ...p, source }).select().single();
      if (error) {
        setItems((xs) => xs.filter((x) => x.id !== optimistic.id));
        flash(`Not saved: ${error.message}`);
        return false;
      }
      setItems((xs) => xs.map((x) => (x.id === optimistic.id ? (data as Item) : x)));
      const when = p.due_at ? ` · ${new Date(p.due_at).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', ...(p.all_day ? {} : { hour: 'numeric', minute: '2-digit' }) })}` : '';
      flash(`Saved${p.tags.length ? ` to #${p.tags.join(' #')}` : ''}${when}`);
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
      setItems((xs) => xs.filter((x) => x.id !== id));
      const { error } = await supabase.from('items').delete().eq('id', id);
      if (error) { flash(error.message); load(); }
    },
    [flash, load],
  );

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
        <Board items={items} onAdd={add} onUpdate={update} onRemove={remove} />
      ) : (
        <Calendar items={items} onUpdate={update} onRemove={remove} />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
