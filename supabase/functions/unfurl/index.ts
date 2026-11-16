// Link preview for Board: given a URL, return its title and, when the page describes an event
// (schema.org JSON-LD, microdata or Open Graph event tags), the event's name, start, end and location.
// Signed-in users only. Fetches public pages as an ordinary, honestly-labelled client: no cookies, no logins.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const MAX_BYTES = 1_500_000;
const UA = 'BoardLinkPreview/1.0 (personal notes app; fetches a link its user saved)';

/** Only public http(s) hosts: no IP literals, no local or internal names. */
function safeUrl(raw: string): URL | null {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.username || u.password) return null;
  if (u.port && u.port !== '80' && u.port !== '443') return null;
  const h = u.hostname.toLowerCase();
  if (!h.includes('.') || h.endsWith('.')) return null;
  if (/^[\d.]+$/.test(h) || h.includes(':') || h.startsWith('[')) return null;
  if (/(^|\.)(localhost|local|internal|lan|home|corp|intranet|test|invalid|example|onion)$/.test(h)) return null;
  return u;
}

async function fetchHtml(start: URL): Promise<{ html: string; url: string } | null> {
  let url = start;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 9000);
  try {
    for (let hop = 0; hop < 6; hop++) {
      const res = await fetch(url, {
        redirect: 'manual',
        signal: ctl.signal,
        headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'en-US,en;q=0.8' },
      });
      if (res.status >= 300 && res.status < 400) {
        const next = safeUrl(new URL(res.headers.get('location') ?? '', url).href);
        await res.body?.cancel();
        if (!next) return null;
        url = next;
        continue;
      }
      if (!res.ok || !/html|xml/i.test(res.headers.get('content-type') ?? '') || !res.body) {
        await res.body?.cancel();
        return null;
      }
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (size < MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        size += value.length;
      }
      await reader.cancel().catch(() => {});
      const buf = new Uint8Array(size);
      let o = 0;
      for (const c of chunks) { buf.set(c.subarray(0, Math.min(c.length, size - o)), o); o += c.length; if (o >= size) break; }
      return { html: new TextDecoder().decode(buf), url: url.href };
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const decode = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

function metas(html: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = tag.match(/\b(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
    const val = tag.match(/\bcontent\s*=\s*"([^"]*)"/i)?.[1] ?? tag.match(/\bcontent\s*=\s*'([^']*)'/i)?.[1];
    if (key && val && !out.has(key)) out.set(key, decode(val));
  }
  return out;
}

// deno-lint-ignore no-explicit-any
type J = any;
const isEvent = (t: unknown): boolean =>
  Array.isArray(t) ? t.some(isEvent) : typeof t === 'string' && /(^|[/:])\w*(Event|Festival)$/.test(t);

function findEvent(node: J, depth = 0): J | null {
  if (!node || typeof node !== 'object' || depth > 6) return null;
  if (Array.isArray(node)) {
    for (const n of node) { const e = findEvent(n, depth + 1); if (e) return e; }
    return null;
  }
  if (isEvent(node['@type']) && node.startDate) return node;
  for (const k of ['@graph', 'mainEntity', 'mainEntityOfPage', 'subjectOf', 'about', 'event', 'events', 'subEvent']) {
    const e = findEvent(node[k], depth + 1);
    if (e) return e;
  }
  return null;
}

const text = (v: J): string | null =>
  typeof v === 'string' ? decode(v) || null : Array.isArray(v) ? text(v[0]) : v && typeof v === 'object' ? text(v.name ?? v['@value'] ?? v.url) : null;

function place(loc: J): string | null {
  if (!loc) return null;
  if (typeof loc === 'string') return decode(loc) || null;
  if (Array.isArray(loc)) return place(loc[0]);
  if (/VirtualLocation/.test(String(loc['@type']))) return 'Online';
  const a = loc.address;
  const name = text(loc.name) ?? '';
  const parts = typeof a === 'string'
    ? decode(a).split(/\s*,\s*/)
    : a && typeof a === 'object'
      ? [a.streetAddress, a.addressLocality, a.addressRegion, a.postalCode].map((x) => text(x) ?? '')
      : [];
  // Keep only address pieces the place name doesn't already spell out (avoids "Denver, CO 80204, Denver, CO").
  const has = (hay: string, t: string) =>
    new RegExp(`(^|\\W)${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\W|$)`, 'i').test(hay);
  const extra: string[] = [];
  for (const p of parts) {
    const t = p.trim();
    if (!t || has(name, t) || has(extra.join(', '), t)) continue;
    extra.push(t);
  }
  return [name, ...extra].filter(Boolean).join(', ').slice(0, 300) || null;
}

function extract(html: string) {
  const m = metas(html);
  const head = html.slice(0, 400_000);
  let event: { name: string | null; start: string; end: string | null; location: string | null } | null = null;

  for (const s of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const e = findEvent(JSON.parse(s[1].trim()));
      if (e) {
        event = { name: text(e.name), start: String(e.startDate), end: e.endDate ? String(e.endDate) : null, location: place(e.location) };
        break;
      }
    } catch { /* not valid JSON: skip */ }
  }
  if (!event) {
    const start = m.get('startdate') ?? m.get('event:start_time') ?? m.get('og:start_time') ?? m.get('og:event:start_time')
      ?? html.match(/itemprop\s*=\s*["']startDate["'][^>]*\b(?:content|datetime)\s*=\s*["']([^"']+)["']/i)?.[1];
    if (start) {
      event = {
        name: null,
        start,
        end: m.get('enddate') ?? m.get('event:end_time') ?? m.get('og:end_time') ?? null,
        location: m.get('event:location') ?? m.get('og:locality') ?? null,
      };
    }
  }

  const title = m.get('og:title') ?? m.get('twitter:title') ?? decode(head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '');
  return {
    title: (title || null)?.slice(0, 300) ?? null,
    description: (m.get('og:description') ?? m.get('description') ?? m.get('twitter:description') ?? null)?.slice(0, 1000) ?? null,
    image: m.get('og:image') ?? null,
    site: m.get('og:site_name') ?? null,
    event,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  // A real signed-in user, not just the public key.
  const auth = req.headers.get('Authorization') ?? '';
  const who = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/user`, {
    headers: { Authorization: auth, apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '' },
  }).catch(() => null);
  if (!who?.ok) return json({ error: 'Sign in first' }, 401);
  await who.body?.cancel();

  const body = await req.json().catch(() => null);
  const url = safeUrl(typeof body?.url === 'string' ? body.url.slice(0, 2000) : '');
  if (!url) return json({ error: 'Not a public web link' }, 400);

  const page = await fetchHtml(url);
  if (!page) return json({ ok: false, url: url.href, title: null, description: null, image: null, site: null, event: null });
  return json({ ok: true, url: page.url, ...extract(page.html) });
});
