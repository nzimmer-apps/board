-- Board v0 schema. Paste into Supabase → SQL Editor → Run (once).
-- Every row belongs to one user; Row Level Security keeps it private.

create table if not exists public.items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 20000),
  url         text,
  tags        text[] not null default '{}',          -- categories, lowercase, no '#'
  source      text not null default 'app'            -- app | share | extension
              check (source in ('app','share','extension','email','sms')),
  due_at      timestamptz,                           -- set when a date was parsed or picked
  all_day     boolean not null default false,
  kind        text check (kind in ('event','deadline','reminder')),
  done        boolean not null default false,
  pinned      boolean not null default false,
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists items_user_created on public.items (user_id, created_at desc);
create index if not exists items_user_due     on public.items (user_id, due_at) where due_at is not null;
create index if not exists items_tags         on public.items using gin (tags);

-- Optional per-category settings (colour, order). Categories also appear automatically from tags.
create table if not exists public.categories (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null,
  color      text,
  sort_order int not null default 0,
  primary key (user_id, name)
);

alter table public.items      enable row level security;
alter table public.categories enable row level security;

drop policy if exists "own items" on public.items;
create policy "own items" on public.items
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own categories" on public.categories;
create policy "own categories" on public.categories
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

drop trigger if exists items_touch on public.items;
create trigger items_touch before update on public.items
  for each row execute function public.touch_updated_at();

-- Live sync between devices
do $$ begin
  alter publication supabase_realtime add table public.items;
exception when duplicate_object then null; end $$;

-- Tiny function the keep-alive GitHub Action calls so the free project never pauses.
create or replace function public.ping() returns text
language sql security definer set search_path = public as $$ select 'pong'::text $$;
grant execute on function public.ping() to anon;
