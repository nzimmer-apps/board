-- Reminders must be chosen, not assumed. NULL now means "not chosen yet": the app asks on the card
-- and schedules nothing until a choice is made. '{}' stays "no reminder", '{0}' "at the time".
-- Existing rows keep their offsets.
alter table public.items alter column remind_offsets drop default;
alter table public.items alter column remind_offsets drop not null;
comment on column public.items.remind_offsets is
  'Minutes before due_at to notify (0 = at the time). {} = no reminder. NULL = not chosen yet.';
