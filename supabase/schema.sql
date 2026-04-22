create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_watchlist (
  user_id uuid not null references auth.users(id) on delete cascade,
  content_id text not null,
  provider text not null,
  title text not null,
  poster text not null default '',
  source_link text not null default '',
  added_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, content_id)
);

create table if not exists public.user_history (
  user_id uuid not null references auth.users(id) on delete cascade,
  content_id text not null,
  provider text not null,
  title text not null,
  poster text not null default '',
  source_link text not null default '',
  watched_at timestamptz not null default now(),
  season_key text,
  episode_link text,
  episode_title text,
  updated_at timestamptz not null default now(),
  primary key (user_id, content_id)
);

create table if not exists public.user_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  content_id text not null,
  provider text not null,
  title text not null,
  poster text not null default '',
  source_link text not null default '',
  season_key text,
  episode_link text,
  episode_title text,
  position integer not null default 0,
  duration integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, content_id)
);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_watchlist_updated_at on public.user_watchlist;
create trigger trg_watchlist_updated_at
before update on public.user_watchlist
for each row execute function public.set_updated_at();

drop trigger if exists trg_history_updated_at on public.user_history;
create trigger trg_history_updated_at
before update on public.user_history
for each row execute function public.set_updated_at();

drop trigger if exists trg_progress_updated_at on public.user_progress;
create trigger trg_progress_updated_at
before update on public.user_progress
for each row execute function public.set_updated_at();

drop trigger if exists trg_settings_updated_at on public.user_settings;
create trigger trg_settings_updated_at
before update on public.user_settings
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.user_watchlist enable row level security;
alter table public.user_history enable row level security;
alter table public.user_progress enable row level security;
alter table public.user_settings enable row level security;

drop policy if exists "profiles_owner_all" on public.profiles;
create policy "profiles_owner_all" on public.profiles
for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "watchlist_owner_all" on public.user_watchlist;
create policy "watchlist_owner_all" on public.user_watchlist
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "history_owner_all" on public.user_history;
create policy "history_owner_all" on public.user_history
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "progress_owner_all" on public.user_progress;
create policy "progress_owner_all" on public.user_progress
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "settings_owner_all" on public.user_settings;
create policy "settings_owner_all" on public.user_settings
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
