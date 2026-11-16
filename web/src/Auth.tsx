import { useState } from 'react';
import { supabase, APP_NAME } from './supabase';

export default function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { error, data } =
      mode === 'in'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (error) setMsg(error.message);
    else if (mode === 'up' && !data.session)
      setMsg('Check your email to confirm the account, then sign in.');
  }

  return (
    <div className="auth">
      <h1 className="brand">{APP_NAME}</h1>
      <p className="muted">Capture anything. Find it later.</p>
      <form onSubmit={submit}>
        <input type="email" placeholder="Email" autoComplete="email" value={email}
          onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" placeholder="Password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
          value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        <button className="primary" disabled={busy}>{mode === 'in' ? 'Sign in' : 'Create account'}</button>
      </form>
      {msg && <p className="note">{msg}</p>}
      <button className="link" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
        {mode === 'in' ? 'First time? Create account' : 'Have an account? Sign in'}
      </button>
    </div>
  );
}
