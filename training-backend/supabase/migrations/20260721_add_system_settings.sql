create table if not exists public.system_settings (
  id text primary key default 'sys_' || gen_random_uuid()::text,
  key text unique not null,
  value jsonb not null default '{}',
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_system_settings_key on public.system_settings(key);

alter table public.system_settings enable row level security;

drop policy if exists "system_settings_allow_all" on public.system_settings;
create policy "system_settings_allow_all" on public.system_settings
  for all using (true);