create table if not exists public.stock_sheets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.stock_recommendations (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references public.stock_sheets(id) on delete cascade,
  symbol text not null,
  target_price numeric not null,
  recommendation_price numeric not null,
  recommendation_date date not null,
  analyst text not null default '未指定',
  rating text not null default '觀察',
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(sheet_id, symbol)
);

alter table public.stock_sheets enable row level security;
alter table public.stock_recommendations enable row level security;

drop policy if exists "public read stock sheets" on public.stock_sheets;
drop policy if exists "public insert stock sheets" on public.stock_sheets;
drop policy if exists "public update stock sheets" on public.stock_sheets;
drop policy if exists "public delete stock sheets" on public.stock_sheets;

drop policy if exists "public read stock recommendations" on public.stock_recommendations;
drop policy if exists "public insert stock recommendations" on public.stock_recommendations;
drop policy if exists "public update stock recommendations" on public.stock_recommendations;
drop policy if exists "public delete stock recommendations" on public.stock_recommendations;

create policy "public read stock sheets" on public.stock_sheets for select using (true);
create policy "public insert stock sheets" on public.stock_sheets for insert with check (true);
create policy "public update stock sheets" on public.stock_sheets for update using (true) with check (true);
create policy "public delete stock sheets" on public.stock_sheets for delete using (true);

create policy "public read stock recommendations" on public.stock_recommendations for select using (true);
create policy "public insert stock recommendations" on public.stock_recommendations for insert with check (true);
create policy "public update stock recommendations" on public.stock_recommendations for update using (true) with check (true);
create policy "public delete stock recommendations" on public.stock_recommendations for delete using (true);

insert into public.stock_sheets (id, name)
values
  ('00000000-0000-0000-0000-000000000001', '觀察清單'),
  ('00000000-0000-0000-0000-000000000002', '飆股候選')
on conflict (id) do nothing;

insert into public.stock_recommendations
  (sheet_id, symbol, target_price, recommendation_price, recommendation_date, analyst, rating, note)
values
  ('00000000-0000-0000-0000-000000000001', '2330', 2400, 2185, current_date, '系統', '買進', ''),
  ('00000000-0000-0000-0000-000000000001', '2454', 3500, 3230, current_date, '系統', '觀察', ''),
  ('00000000-0000-0000-0000-000000000001', '2317', 280, 240, current_date, '系統', '觀察', ''),
  ('00000000-0000-0000-0000-000000000002', '2327', 600, 520, current_date, 'Kevin', '買進', ''),
  ('00000000-0000-0000-0000-000000000002', '3163', 1000, 952, current_date, 'Kevin', '觀察', '')
on conflict (sheet_id, symbol) do nothing;
