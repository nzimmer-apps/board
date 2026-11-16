// Colour themes. The palette itself lives in styles.css under :root[data-theme="…"].
export const THEMES = [
  { id: 'forest', name: 'Forest', bg: '#0d0f0e', accent: '#4ade80' },
  { id: 'midnight', name: 'Midnight', bg: '#0b1020', accent: '#60a5fa' },
  { id: 'ember', name: 'Ember', bg: '#14100c', accent: '#fb923c' },
  { id: 'grape', name: 'Grape', bg: '#120e1a', accent: '#c084fc' },
  { id: 'rose', name: 'Rose', bg: '#160d12', accent: '#fb7185' },
  { id: 'slate', name: 'Slate', bg: '#111315', accent: '#e5e7eb' },
  { id: 'paper', name: 'Paper', bg: '#f7f7f4', accent: '#15803d' },
  { id: 'sand', name: 'Sand', bg: '#f6f0e4', accent: '#b45309' },
  { id: 'sky', name: 'Sky', bg: '#f1f6fb', accent: '#1d4ed8' },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];
const KEY = 'board-theme';

export function getTheme(): ThemeId {
  let saved: string | null = null;
  try { saved = localStorage.getItem(KEY); } catch { /* private mode */ }
  return (THEMES.find((t) => t.id === saved)?.id ?? 'forest') as ThemeId;
}

export function applyTheme(id: ThemeId) {
  const t = THEMES.find((x) => x.id === id) ?? THEMES[0];
  document.documentElement.dataset.theme = t.id;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.bg);
  try { localStorage.setItem(KEY, t.id); } catch { /* private mode */ }
}

// Colours offered for tags. Mid-tones, so they read on both dark and light themes.
export const TAG_COLORS = ['#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#eab308', '#84cc16', '#64748b'];

// The tags people reach for most in a notes / capture app. Offered as quick picks.
export const COMMON_TAGS = [
  'todo', 'work', 'personal', 'home', 'family', 'health', 'money', 'bills', 'shopping', 'ideas',
  'events', 'appointments', 'travel', 'read', 'watch', 'recipes', 'receipts', 'car', 'gifts', 'projects',
];
