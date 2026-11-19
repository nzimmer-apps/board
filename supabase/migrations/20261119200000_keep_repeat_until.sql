-- Put back an empty `repeat_until` column, unused by the current app.
--
-- 20261119120000_repeat_rule.sql moved "until" into the jsonb repeat rule and dropped repeat_until.
-- Board apps already installed on phones and PCs (v0.2.11 and older) still name repeat_until when they
-- load and save notes, so without the column they could not do either until the new version is installed.
-- Nothing reads or writes it any more; drop it in a later migration once the old app versions are gone.
alter table public.items add column if not exists repeat_until timestamptz;
comment on column public.items.repeat_until is
  'Unused: kept so app versions up to v0.2.11 keep working. "Until" now lives in repeat->>''until''. Drop later.';
