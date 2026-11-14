// Image attachments: shrink on device, upload to the private "images" bucket, read text with OCR.
import { supabase } from './supabase';

const MAX_SIDE = 1600;
const QUALITY = 0.82;

/** Downscale to ≤1600px and re-encode as JPEG (a 5 MB phone photo becomes ~300 KB). */
export async function shrink(input: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(input).catch(() => null);
  if (!bmp) return input; // unknown format: upload as-is
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff'; // transparent PNGs get a white background, which also helps OCR
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return await new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('Could not encode image'))), 'image/jpeg', QUALITY),
  );
}

export async function upload(blob: Blob): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('Not signed in');
  const path = `${data.user.id}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from('images').upload(path, blob, {
    contentType: 'image/jpeg',
    cacheControl: '31536000',
  });
  if (error) throw error;
  return path;
}

export async function removeImage(path: string) {
  await supabase.storage.from('images').remove([path]);
}

// Signed URLs are valid for a day; cache them so cards don't re-request on every render.
const urlCache = new Map<string, { url: string; exp: number }>();
export async function imageUrl(path: string): Promise<string | null> {
  const hit = urlCache.get(path);
  if (hit && hit.exp > Date.now()) return hit.url;
  const { data, error } = await supabase.storage.from('images').createSignedUrl(path, 86400);
  if (error || !data) return null;
  urlCache.set(path, { url: data.signedUrl, exp: Date.now() + 23 * 3600e3 });
  return data.signedUrl;
}

export async function download(path: string): Promise<Blob | null> {
  const { data } = await supabase.storage.from('images').download(path);
  return data ?? null;
}

// ---------- OCR (Tesseract, runs on this device; first use downloads ~10 MB of English data, then cached) ----------

type TWorker = Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>>;
let workerP: Promise<TWorker> | null = null;

function worker() {
  workerP ??= import('tesseract.js').then(({ createWorker }) => createWorker('eng'));
  return workerP;
}

/** Text found in the image, tidied; '' when there is none worth keeping. */
export async function readText(img: Blob): Promise<string> {
  const w = await worker();
  const { data } = await w.recognize(img);
  const lines = data.text
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 1 && /[\p{L}\p{N}]{2,}/u.test(l));
  // Low-confidence noise from photos without text: drop it.
  if (data.confidence < 45 && lines.join(' ').length < 40) return '';
  return lines.join('\n').slice(0, 20000);
}
