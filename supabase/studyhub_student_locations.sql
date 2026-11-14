-- StudyHub: lokasi pelajar dengan persetujuan nyata dan akses admin sahaja.
-- Jalankan sekali di Supabase SQL Editor sebelum mengaktifkan ciri ini.

create table if not exists public.studyhub_student_locations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Pelajar',
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_m integer,
  consented boolean not null default true check (consented = true),
  consented_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.studyhub_student_locations enable row level security;
revoke all on table public.studyhub_student_locations from anon;
grant select, insert, update, delete on table public.studyhub_student_locations to authenticated;

drop policy if exists "student reads own shared location" on public.studyhub_student_locations;
create policy "student reads own shared location"
  on public.studyhub_student_locations for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "student inserts own consented location" on public.studyhub_student_locations;
create policy "student inserts own consented location"
  on public.studyhub_student_locations for insert to authenticated
  with check (auth.uid() = user_id and consented = true);

drop policy if exists "student updates own consented location" on public.studyhub_student_locations;
create policy "student updates own consented location"
  on public.studyhub_student_locations for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and consented = true);

drop policy if exists "student deletes own shared location" on public.studyhub_student_locations;
create policy "student deletes own shared location"
  on public.studyhub_student_locations for delete to authenticated
  using (auth.uid() = user_id);

drop policy if exists "StudyHub admin reads shared student locations" on public.studyhub_student_locations;
create policy "StudyHub admin reads shared student locations"
  on public.studyhub_student_locations for select to authenticated
  using ((auth.jwt() ->> 'email') = 'amsyar291008@gmail.com');
