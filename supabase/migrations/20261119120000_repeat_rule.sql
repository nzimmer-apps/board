-- One repeat design for both databases.
--
-- The live Board stored a repeat as one word in a text column (`weekly`, `monthly-nth`, …) plus a
-- `repeat_until` column. Board Dev stores a rule as jsonb: {"freq":"weekly","interval":1,"days":[1,4]},
-- with "nth" (2nd / last weekday of the month) and "until" ("YYYY-MM-DD") inside the rule.
--
-- This turns the word form into the rule form and moves repeat_until into it, then drops repeat_until.
-- Weekdays and dates are read in America/Chicago, the time zone the notes were written in.
-- Safe to run on either database and more than once: on Board Dev `repeat` is already jsonb, so only the
-- (empty) repeat_until column added by 20261116000000_repeat.sql is folded in and dropped.

do $$
begin
  if (select data_type from information_schema.columns
      where table_schema = 'public' and table_name = 'items' and column_name = 'repeat') = 'text' then
    alter table public.items drop constraint if exists items_repeat_check;
    alter table public.items alter column repeat type jsonb using (
      case repeat
        when 'daily'        then '{"freq":"daily","interval":1}'::jsonb
        when 'weekly'       then jsonb_build_object('freq', 'weekly', 'interval', 1, 'days', jsonb_build_array(extract(dow from due_at at time zone 'America/Chicago')::int))
        when 'biweekly'     then jsonb_build_object('freq', 'weekly', 'interval', 2, 'days', jsonb_build_array(extract(dow from due_at at time zone 'America/Chicago')::int))
        when 'monthly'      then '{"freq":"monthly","interval":1}'::jsonb
        when 'monthly-nth'  then jsonb_build_object('freq', 'monthly', 'interval', 1, 'nth', ceil(extract(day from due_at at time zone 'America/Chicago') / 7)::int)
        when 'monthly-last' then '{"freq":"monthly","interval":1,"nth":-1}'::jsonb
        when 'yearly'       then '{"freq":"yearly","interval":1}'::jsonb
        else null
      end
    );
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'items' and column_name = 'repeat_until') then
    update public.items
       set repeat = repeat || jsonb_build_object('until', to_char(repeat_until at time zone 'America/Chicago', 'YYYY-MM-DD'))
     where repeat is not null and repeat_until is not null;
    alter table public.items drop column repeat_until;
  end if;
end $$;
