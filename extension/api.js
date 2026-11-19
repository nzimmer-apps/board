// Minimal Supabase REST client: sign in, refresh, insert. Shared by popup and background.
const api = {
  async session() {
    const { session } = await chrome.storage.local.get('session');
    if (!session) return null;
    if (Date.now() / 1000 < session.expires_at - 60) return session;
    return api.auth('refresh_token', { refresh_token: session.refresh_token }).catch(() => null);
  },
  async auth(grant, body) {
    const r = await fetch(`${BOARD_CONFIG.url}/auth/v1/token?grant_type=${grant}`, {
      method: 'POST',
      headers: { apikey: BOARD_CONFIG.key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error_description || j.msg || j.message || 'Sign-in failed');
    const session = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at, email: j.user?.email, user_id: j.user?.id };
    await chrome.storage.local.set({ session });
    return session;
  },
  signIn: (email, password) => api.auth('password', { email, password }),
  signOut: () => chrome.storage.local.remove('session'),
  /** Insert one row, or several (a weekly schedule with different times is one row per time). */
  async insert(rows) {
    const s = await api.session();
    if (!s) throw new Error('Sign in first (click the Board icon).');
    const r = await fetch(`${BOARD_CONFIG.url}/rest/v1/items`, {
      method: 'POST',
      headers: {
        apikey: BOARD_CONFIG.key,
        Authorization: `Bearer ${s.access_token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(rows),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || `Save failed (${r.status})`);
  },
  async add(raw, source = 'extension') {
    const rows = BoardParse.parseRows(raw).map((p) => ({ ...p, source }));
    // PostgREST wants every row of a bulk insert to have the same keys.
    await api.insert(rows.length > 1 ? rows.map((p) => ({ remind_offsets: null, ...p })) : rows[0]);
    return rows[0];
  },
  /** Image from a web page → shrink to ≤1600px JPEG → private bucket → item. The app reads its text (OCR) later. */
  async addImage(srcUrl, caption = '', source = 'extension') {
    const s = await api.session();
    if (!s) throw new Error('Sign in first (click the Board icon).');
    if (!s.user_id) throw new Error('Please sign out and back in once (extension update).');
    const res = await fetch(srcUrl);
    if (!res.ok) throw new Error(`Could not fetch image (${res.status})`);
    let blob = await res.blob();
    try {
      const bmp = await createImageBitmap(blob);
      const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      const c = new OffscreenCanvas(Math.round(bmp.width * k), Math.round(bmp.height * k));
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(bmp, 0, 0, c.width, c.height);
      blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.82 });
    } catch (_) { /* unsupported format: upload as-is if allowed */ }
    const path = `${s.user_id}/${crypto.randomUUID()}.jpg`;
    const up = await fetch(`${BOARD_CONFIG.url}/storage/v1/object/images/${path}`, {
      method: 'POST',
      headers: { apikey: BOARD_CONFIG.key, Authorization: `Bearer ${s.access_token}`, 'Content-Type': blob.type || 'image/jpeg' },
      body: blob,
    });
    if (!up.ok) throw new Error((await up.json().catch(() => ({}))).message || `Upload failed (${up.status})`);
    const [p] = BoardParse.parseRows(caption);
    const r = await fetch(`${BOARD_CONFIG.url}/rest/v1/items`, {
      method: 'POST',
      headers: { apikey: BOARD_CONFIG.key, Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ ...p, body: caption.trim() ? p.body : '', image_path: path, source }),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || `Save failed (${r.status})`);
  },
};
