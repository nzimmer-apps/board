-- Board: image support + OCR text. Paste into Supabase → SQL Editor → Run (once).

alter table public.items add column if not exists image_path text;   -- "<user id>/<file>.jpg" in the images bucket
alter table public.items add column if not exists ocr_text   text;   -- null = not read yet, '' = no text found

-- An image-only item may have no caption.
alter table public.items drop constraint if exists items_body_check;
alter table public.items add constraint items_body_check
  check (char_length(body) <= 20000 and (char_length(body) > 0 or image_path is not null));

-- Private bucket; each user can only touch files under their own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('images', 'images', false, 10485760, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do nothing;

drop policy if exists "own images read"   on storage.objects;
drop policy if exists "own images write"  on storage.objects;
drop policy if exists "own images delete" on storage.objects;

create policy "own images read" on storage.objects for select to authenticated
  using (bucket_id = 'images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own images write" on storage.objects for insert to authenticated
  with check (bucket_id = 'images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own images delete" on storage.objects for delete to authenticated
  using (bucket_id = 'images' and (storage.foldername(name))[1] = auth.uid()::text);

-- Notifications chosen when the note is added: minutes before due_at (0 = at the time). Empty = no notification.
alter table public.items add column if not exists remind_offsets int[] not null default '{0}';
