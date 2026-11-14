-- StudyHub: benarkan pendaftaran pelajar baharu aktif secara automatik.
-- Jalankan sekali di Supabase Dashboard > SQL Editor.
-- Polisi ini hanya membenarkan pengguna mencipta rekod untuk auth.uid() sendiri.
-- Ia tidak memberi akses untuk mengubah rekod pengguna lain.

alter table public.studyhub_students enable row level security;

drop policy if exists "Students can register themselves as auto approved" on public.studyhub_students;
create policy "Students can register themselves as auto approved"
on public.studyhub_students
for insert
to authenticated
with check (
  auth.uid() = user_id
  and approved = true
);
