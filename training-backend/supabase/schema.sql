-- =============================================
-- Coach Train App — Supabase Schema
-- Execute this SQL in the Supabase SQL Editor
-- =============================================

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- 1. Users table
create table if not exists public.users (
  id text primary key default 'user_' || gen_random_uuid()::text,
  openid text unique,
  nickname text not null,
  avatar text,
  role text not null default 'coach',
  settings jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- 2. Templates table (private per user + optional public)
create table if not exists public.templates (
  id text primary key default 'tpl_' || gen_random_uuid()::text,
  user_id text not null references public.users(id) on delete cascade,
  name text not null,
  description text,
  drills jsonb not null default '[]',
  is_public boolean not null default false,
  price numeric(10,2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_templates_user_id on public.templates(user_id);
create index if not exists idx_templates_public on public.templates(is_public) where is_public = true;

-- 3. Training plans (calendar entries, shareable)
create table if not exists public.plans (
  id text primary key default 'plan_' || gen_random_uuid()::text,
  user_id text not null references public.users(id) on delete cascade,
  template_id text references public.templates(id) on delete restrict,
  title text not null,
  date text,
  status text not null default 'planned',
  note text,
  drills jsonb default '[]',
  source_plan_id text,
  sharer_name text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_plans_user_id on public.plans(user_id);
create index if not exists idx_plans_date on public.plans(date);

-- 4. Training records (individual execution instances, 1:N with plans)
create table if not exists public.training_records (
  id text primary key default 'record_' || gen_random_uuid()::text,
  user_id text not null references public.users(id) on delete cascade,
  plan_id text references public.plans(id) on delete cascade,
  template_id text not null references public.templates(id) on delete restrict,
  title text not null,
  status text not null default 'planned',
  start_time timestamptz,
  end_time timestamptz,
  duration_seconds integer,
  completed_drills integer,
  total_drills integer,
  note text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_training_records_user_id on public.training_records(user_id);
create index if not exists idx_training_records_plan_id on public.training_records(plan_id);
create index if not exists idx_training_records_start_time on public.training_records(start_time);
create index if not exists idx_training_records_status on public.training_records(status);

-- 5. System settings (global config for admin)
create table if not exists public.system_settings (
  id text primary key default 'sys_' || gen_random_uuid()::text,
  key text unique not null,
  value jsonb not null default '{}',
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_system_settings_key on public.system_settings(key);

-- 6. Purchases / shared templates (future marketplace)
create table if not exists public.purchases (
  id text primary key default 'purchase_' || gen_random_uuid()::text,
  buyer_id text not null references public.users(id) on delete cascade,
  template_id text not null references public.templates(id) on delete cascade,
  price numeric(10,2) not null default 0,
  created_at timestamptz not null default now(),
  unique(buyer_id, template_id)
);

-- 7. Row Level Security — each user only sees their own data
-- Note: We use service_role key which bypasses RLS.
-- Security is enforced at the application layer via WHERE user_id = ?

alter table public.users enable row level security;
alter table public.templates enable row level security;
alter table public.plans enable row level security;
alter table public.training_records enable row level security;
alter table public.system_settings enable row level security;
alter table public.purchases enable row level security;

-- Allow all operations for authenticated requests filtered at app level
drop policy if exists "users_allow_all" on public.users;
create policy "users_allow_all" on public.users
  for all using (true);

drop policy if exists "templates_allow_all" on public.templates;
create policy "templates_allow_all" on public.templates
  for all using (true);

drop policy if exists "plans_allow_all" on public.plans;
create policy "plans_allow_all" on public.plans
  for all using (true);

drop policy if exists "training_records_allow_all" on public.training_records;
create policy "training_records_allow_all" on public.training_records
  for all using (true);

drop policy if exists "system_settings_allow_all" on public.system_settings;
create policy "system_settings_allow_all" on public.system_settings
  for all using (true);

drop policy if exists "purchases_allow_all" on public.purchases;
create policy "purchases_allow_all" on public.purchases
  for all using (true);
