-- StudyHub: profil awam pelajar
-- Jalankan sekali dalam Supabase SQL Editor pada projek StudyHub.
-- Hanya medan profil yang selamat dipaparkan disimpan di sini.
create table if not exists public.studyhub_public_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 24),
  avatar text not null default '🌟',
  border_color text not null default '#b8a5ff',
  border_style text not null default '',
  background_style text not null default 'linear-gradient(125deg,#43358d,#176c86)',
  bio text not null default '' check (char_length(bio) <= 240),
  updated_at timestamptz not null default now()
);

alter table public.studyhub_public_profiles enable row level security;

drop policy if exists "Public can view approved student profiles" on public.studyhub_public_profiles;
create policy "Public can view approved student profiles"
on public.studyhub_public_profiles
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.studyhub_students s
    where s.user_id = studyhub_public_profiles.user_id
      and s.approved = true
  )
);

drop policy if exists "Students can insert their own public profile" on public.studyhub_public_profiles;
create policy "Students can insert their own public profile"
on public.studyhub_public_profiles
for insert
to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.studyhub_students s
    where s.user_id = studyhub_public_profiles.user_id
      and s.approved = true
  )
);

drop policy if exists "Students can update their own public profile" on public.studyhub_public_profiles;
create policy "Students can update their own public profile"
on public.studyhub_public_profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.studyhub_students s
    where s.user_id = studyhub_public_profiles.user_id
      and s.approved = true
  )
);

grant select on public.studyhub_public_profiles to anon, authenticated;
grant insert, update on public.studyhub_public_profiles to authenticated;

create or replace function public.studyhub_set_public_profile_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists studyhub_public_profile_updated_at on public.studyhub_public_profiles;
create trigger studyhub_public_profile_updated_at
before update on public.studyhub_public_profiles
for each row execute function public.studyhub_set_public_profile_updated_at();
