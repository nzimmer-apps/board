import { createClient } from '@supabase/supabase-js';

// Both values are public by design (the anon key only works within Row Level Security).
// Set them in config.json at build time via the Pages workflow, or in web/.env.local for dev.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const configured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase = createClient(
  SUPABASE_URL || 'https://placeholder.supabase.co',
  SUPABASE_ANON_KEY || 'placeholder',
  { auth: { persistSession: true, autoRefreshToken: true } },
);

export interface Item {
  id: string;
  body: string;
  url: string | null;
  tags: string[];
  source: string;
  due_at: string | null;
  all_day: boolean;
  kind: 'event' | 'deadline' | 'reminder' | null;
  done: boolean;
  pinned: boolean;
  archived: boolean;
  created_at: string;
}
