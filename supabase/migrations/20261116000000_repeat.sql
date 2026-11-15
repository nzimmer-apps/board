-- Repeating notes (weekly leagues, monthly meetups…). due_at stays the first/current occurrence;
-- the app works out later ones from the rule. repeat_until (optional) is the last day of the series.
alter table public.items add column if not exists repeat text
  check (repeat in ('daily', 'weekly', 'biweekly', 'monthly', 'monthly-nth', 'monthly-last', 'yearly'));
alter table public.items add column if not exists repeat_until timestamptz;
