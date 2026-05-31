# Supabase theme settings sync

This project saves **theme settings only** (story presets + last session theme fields) to Supabase. API settings remain browser-local.

## 1) Create table + RLS policies

Run this SQL in the Supabase SQL editor:

```sql
create table if not exists public.theme_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  theme_last jsonb,
  theme_presets jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.theme_settings enable row level security;

drop policy if exists theme_settings_select_own on public.theme_settings;
create policy theme_settings_select_own
on public.theme_settings
for select
using (auth.uid() = user_id);

drop policy if exists theme_settings_insert_own on public.theme_settings;
create policy theme_settings_insert_own
on public.theme_settings
for insert
with check (auth.uid() = user_id);

drop policy if exists theme_settings_update_own on public.theme_settings;
create policy theme_settings_update_own
on public.theme_settings
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
```

## 2) Enable anonymous auth (recommended)

This code attempts `signInAnonymously()` so each browser gets a per-user `auth.uid()` without a sign-up UI.

If anonymous sign-in is disabled in your Supabase project, the app will silently fall back to localStorage-only.

## 3) Supabase project config in code

The Supabase URL + publishable key are currently set in:

- `js/supabase/client.js:6`

If you rotate keys or move projects, update that file.

