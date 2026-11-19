-- Board: repeating items, locations, voice/PDF attachments, tag management.

-- Repeat rule, e.g. {"freq":"weekly","interval":1,"days":[1,4]} (days: 0 = Sunday). null = one-off.
-- due_at is the first occurrence; later ones are worked out in the app.
alter table public.items add column if not exists repeat jsonb;

-- Where an event is (from an event link, or typed in).
alter table public.items add column if not exists location text;

-- Non-image attachments live in the private "files" bucket. Extracted text goes in ocr_text.
alter table public.items add column if not exists file_path text;   -- "<user id>/<file>.<ext>"
alter table public.items add column if not exists file_type text;   -- audio | pdf
alter table public.items add column if not exists file_name text;   -- original name, for display
alter table public.items drop constraint if exists items_file_type_check;
alter table public.items add constraint items_file_type_check check (file_type in ('audio', 'pdf'));

-- A note with an attachment may have no caption.
alter table public.items drop constraint if exists items_body_check;
alter table public.items add constraint items_body_check
  check (char_length(body) <= 20000 and (char_length(body) > 0 or image_path is not null or file_path is not null));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('files', 'files', false, 26214400,
  array['application/pdf','audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav','audio/x-wav','audio/aac','audio/x-m4a'])
on conflict (id) do nothing;

drop policy if exists "own files read"   on storage.objects;
drop policy if exists "own files write"  on storage.objects;
drop policy if exists "own files delete" on storage.objects;

create policy "own files read" on storage.objects for select to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own files write" on storage.objects for insert to authenticated
  with check (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own files delete" on storage.objects for delete to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);

-- Tag management. Both run as the caller, so Row Level Security still limits them to your own notes.
-- rename_tag also merges: renaming "wrk" to an existing "work" leaves one "work" tag per note.
create or replace function public.rename_tag(p_old text, p_new text) returns int
language plpgsql security invoker set search_path = public as $$
declare n int;
begin
  p_old := lower(trim(p_old));
  p_new := lower(trim(both ' #' from p_new));
  if p_new = '' or p_new !~ '^[[:alnum:]_-]{1,40}$' then raise exception 'Tag names use letters, numbers, - and _ only'; end if;
  if p_old = p_new then return 0; end if;
  update public.items
     set tags = (select array_agg(t order by ord)
                   from (select t, min(ord) ord
                           from unnest(array_replace(tags, p_old, p_new)) with ordinality x(t, ord)
                          group by t) d)
   where user_id = auth.uid() and tags @> array[p_old];
  get diagnostics n = row_count;
  insert into public.categories (user_id, name, color, sort_order)
    select user_id, p_new, color, sort_order from public.categories where user_id = auth.uid() and name = p_old
    on conflict (user_id, name) do nothing;
  delete from public.categories where user_id = auth.uid() and name = p_old;
  return n;
end $$;

create or replace function public.delete_tag(p_name text) returns int
language plpgsql security invoker set search_path = public as $$
declare n int;
begin
  p_name := lower(trim(p_name));
  update public.items set tags = array_remove(tags, p_name)
   where user_id = auth.uid() and tags @> array[p_name];
  get diagnostics n = row_count;
  delete from public.categories where user_id = auth.uid() and name = p_name;
  return n;
end $$;

revoke execute on function public.rename_tag(text, text) from public, anon;
revoke execute on function public.delete_tag(text) from public, anon;
grant execute on function public.rename_tag(text, text) to authenticated;
grant execute on function public.delete_tag(text) to authenticated;

-- Live sync of tag colours between devices
do $$ begin
  alter publication supabase_realtime add table public.categories;
exception when duplicate_object then null; end $$;
