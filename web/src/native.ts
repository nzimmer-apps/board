// Native shell integration (Android via Capacitor, Windows via Tauri).
// In a normal browser every function here is a no-op, so the web app is unchanged.
import { Capacitor, registerPlugin } from '@capacitor/core';
import type { Item } from './supabase';

export const isAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
export const isNativeApp = isAndroid || isTauri;

interface ShareIntentPlugin {
  takePending(): Promise<{ text: string | null }>;
  addListener(event: 'shared', cb: (d: { text: string }) => void): Promise<{ remove: () => void }>;
}
const ShareIntent = registerPlugin<ShareIntentPlugin>('ShareIntent');

/** Text shared into the Android app from other apps' share sheet. */
export async function onShared(cb: (text: string) => void): Promise<() => void> {
  if (!isAndroid) return () => {};
  const first = await ShareIntent.takePending().catch(() => ({ text: null }));
  if (first.text) cb(first.text);
  const h = await ShareIntent.addListener('shared', (d) => d.text && cb(d.text));
  return () => h.remove();
}

// ---------- Reminders ----------

const upcoming = (items: Item[], days: number) => {
  const now = Date.now();
  const horizon = now + days * 864e5;
  return items
    .filter((i) => i.due_at && !i.done && !i.archived)
    .map((i) => ({ i, t: new Date(i.due_at!).getTime() }))
    .filter(({ t }) => t > now && t < horizon)
    .sort((a, b) => a.t - b.t);
};

const label = (i: Item) =>
  i.kind === 'deadline' ? 'Due now' : i.kind === 'reminder' ? 'Reminder' : 'Coming up';

// Stable 31-bit int from the uuid, required by Android notification ids.
const notifId = (id: string) => {
  let h = 0;
  for (const c of id) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0;
  return Math.abs(h) % 2147483647 || 1;
};

let lastAndroidSig = '';

/** Android: (re)schedule OS notifications for the next 30 days of dated items. */
async function syncAndroid(items: Item[]) {
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  const next = upcoming(items, 30).slice(0, 60);
  const sig = next.map(({ i, t }) => `${i.id}@${t}:${i.body.length}`).join('|');
  if (sig === lastAndroidSig) return;
  lastAndroidSig = sig;
  let perm = await LocalNotifications.checkPermissions();
  if (perm.display === 'prompt' || perm.display === 'prompt-with-rationale')
    perm = await LocalNotifications.requestPermissions();
  if (perm.display !== 'granted') return;
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications });
  if (!next.length) return;
  await LocalNotifications.schedule({
    notifications: next.map(({ i, t }) => ({
      id: notifId(i.id),
      title: label(i),
      body: i.body.split('\n')[0].slice(0, 120),
      schedule: { at: new Date(t), allowWhileIdle: true },
      extra: { itemId: i.id },
    })),
  });
}

// Windows: no OS scheduler, so check once a minute while the app runs (it lives in the tray).
let tauriItems: Item[] = [];
let tauriTimer: number | undefined;
const fired = new Set<string>();

async function tauriTick() {
  const { isPermissionGranted, requestPermission, sendNotification } = await import('@tauri-apps/plugin-notification');
  let ok = await isPermissionGranted();
  if (!ok) ok = (await requestPermission()) === 'granted';
  if (!ok) return;
  const now = Date.now();
  for (const i of tauriItems) {
    if (!i.due_at || i.done || i.archived || fired.has(i.id)) continue;
    const t = new Date(i.due_at).getTime();
    if (t <= now && t > now - 10 * 60e3) {
      fired.add(i.id);
      sendNotification({ title: label(i), body: i.body.split('\n')[0].slice(0, 120) });
    }
  }
}

export function syncReminders(items: Item[]) {
  if (isAndroid) syncAndroid(items).catch((e) => console.warn('reminders', e));
  if (isTauri) {
    tauriItems = items;
    if (tauriTimer === undefined) {
      tauriTick().catch(() => {});
      tauriTimer = window.setInterval(() => tauriTick().catch(() => {}), 30e3);
    }
  }
}

/** Windows: Ctrl+Alt+B from anywhere shows the window and focuses quick-add. */
export async function registerHotkey(focusCapture: () => void) {
  if (!isTauri) return;
  const { register, isRegistered } = await import('@tauri-apps/plugin-global-shortcut');
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const combo = 'CommandOrControl+Alt+B';
  if (await isRegistered(combo)) return;
  await register(combo, async (e) => {
    if (e.state !== 'Pressed') return;
    const w = getCurrentWindow();
    await w.unminimize();
    await w.show();
    await w.setFocus();
    focusCapture();
  });
}

/** Windows app: open links in the default browser instead of inside the app window. */
if (isTauri) {
  document.addEventListener('click', async (e) => {
    const a = (e.target as HTMLElement | null)?.closest?.('a[href^="http"]') as HTMLAnchorElement | null;
    if (!a) return;
    e.preventDefault();
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    openUrl(a.href).catch(() => {});
  });
}
