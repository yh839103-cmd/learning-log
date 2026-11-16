-- 我的學習紀錄：建表 + RLS 門禁（可重複執行）
create table if not exists public.learning_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  note text check (char_length(note) <= 2000),
  created_at timestamptz not null default now()
);

-- 開門禁
alter table public.learning_logs enable row level security;

-- 清除舊規則
drop policy if exists "logs_select_own" on public.learning_logs;
drop policy if exists "logs_insert_own" on public.learning_logs;
drop policy if exists "logs_update_own" on public.learning_logs;
drop policy if exists "logs_delete_own" on public.learning_logs;

-- 四條規則：只有本人能看、寫、改、刪自己的紀錄
create policy "logs_select_own" on public.learning_logs
  for select to authenticated using (auth.uid() = user_id);
create policy "logs_insert_own" on public.learning_logs
  for insert to authenticated with check (auth.uid() = user_id);
create policy "logs_update_own" on public.learning_logs
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "logs_delete_own" on public.learning_logs
  for delete to authenticated using (auth.uid() = user_id);

-- 授權給登入使用者（未登入的 anon 什麼都拿不到）
revoke all on public.learning_logs from anon;
grant select, insert, update, delete on public.learning_logs to authenticated;
