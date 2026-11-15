// Native shell integration (Android via Capacitor, Windows via Tauri).
// In a normal browser every function here is a no-op, so the web app is unchanged.
import { Capacitor, registerPlugin } from '@capacitor/core';
import type { Item } from './supabase';

export const isAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
export const isNativeApp = isAndroid || isTauri;

interface Shared { text: string | null; image?: string | null } // image = base64 JPEG, already downscaled natively
interface ShareIntentPlugin {
  takePending(): Promise<Shared>;
  addListener(event: 'shared', cb: (d: Shared) => void): Promise<{ remove: () => void }>;
}
const ShareIntent = registerPlugin<ShareIntentPlugin>('ShareIntent');

const b64ToBlob = (b64: string) => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: 'image/jpeg' });
};

/** Text or images shared into the Android app from other apps' share sheet. */
export async function onShared(
  onText: (text: string) => void,
  onImage: (img: Blob, caption: string) => void,
): Promise<() => void> {
  if (!isAndroid) return () => {};
  const handle = (d: Shared) => {
    if (d.image) onImage(b64ToBlob(d.image), d.text ?? '');
    else if (d.text) onText(d.text);
  };
  handle(await ShareIntent.takePending().catch(() => ({ text: null }) as Shared));
  const h = await ShareIntent.addListener('shared', handle);
  return () => h.remove();
}

// ---------- Reminders ----------

// One entry per (item, chosen offset): fires at due_at minus the offset.
interface Alert { i: Item; t: number; off: number; key: string }
const alerts = (items: Item[], fromMs: number, toMs: number): Alert[] =>
  items
    .filter((i) => i.due_at && !i.done && !i.archived)
    .flatMap((i) =>
      (i.remind_offsets ?? []).map((off) => {
        const t = new Date(i.due_at!).getTime() - off * 60e3;
        return { i, t, off, key: `${i.id}:${off}` };
      }),
    )
    .filter(({ t }) => t > fromMs && t < toMs)
    .sort((a, b) => a.t - b.t);

const label = (i: Item) =>
  i.kind === 'deadline' ? 'Deadline' : i.kind === 'reminder' ? 'Reminder' : 'Event';

const when = (a: Alert) => {
  if (a.off === 0) return a.i.kind === 'deadline' ? 'due now' : 'now';
  const d = new Date(a.i.due_at!);
  const sameDay = new Date(a.t).toDateString() === d.toDateString();
  return 'at ' + d.toLocaleString([], sameDay ? { hour: 'numeric', minute: '2-digit' } : { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const title = (a: Alert) => `${label(a.i)} ${when(a)}`;
const text = (i: Item) => (i.body.split('\n')[0] || i.ocr_text?.split('\n')[0] || 'Image note').slice(0, 120);

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
  const next = alerts(items, Date.now(), Date.now() + 30 * 864e5).slice(0, 60);
  const sig = next.map((a) => `${a.key}@${a.t}:${a.i.body.length}`).join('|');
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
    notifications: next.map((a) => ({
      id: notifId(a.key),
      title: title(a),
      body: text(a.i),
      schedule: { at: new Date(a.t), allowWhileIdle: true },
      extra: { itemId: a.i.id },
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
  for (const a of alerts(tauriItems, now - 10 * 60e3, now + 1)) {
    const k = `${a.key}@${a.t}`;
    if (fired.has(k)) continue;
    fired.add(k);
    sendNotification({ title: title(a), body: text(a.i) });
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
