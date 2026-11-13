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
    const session = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at, email: j.user?.email };
    await chrome.storage.local.set({ session });
    return session;
  },
  signIn: (email, password) => api.auth('password', { email, password }),
  signOut: () => chrome.storage.local.remove('session'),
  async add(raw, source = 'extension') {
    const s = await api.session();
    if (!s) throw new Error('Sign in first (click the Board icon).');
    const p = BoardParse.parseInput(raw);
    const r = await fetch(`${BOARD_CONFIG.url}/rest/v1/items`, {
      method: 'POST',
      headers: {
        apikey: BOARD_CONFIG.key,
        Authorization: `Bearer ${s.access_token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ ...p, source }),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || `Save failed (${r.status})`);
    return p;
  },
};
