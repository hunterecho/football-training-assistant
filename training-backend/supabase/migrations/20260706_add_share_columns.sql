alter table if exists public.plans
  add column if not exists source_plan_id text;

alter table if exists public.plans
  add column if not exists sharer_name text;
