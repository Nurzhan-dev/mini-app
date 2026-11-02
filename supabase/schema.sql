create extension if not exists pgcrypto;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null default 'new' check (status in ('new', 'confirmed', 'preparing', 'ready', 'cancelled')),
  source text not null default 'mini_app',
  lang text not null default 'ru' check (lang in ('ru', 'kk')),
  subtotal integer not null default 0,
  delivery integer not null default 0,
  total integer not null default 0,
  items jsonb not null default '[]'::jsonb,
  customer_name text,
  phone text,
  notes text
);

create index if not exists idx_orders_created_at on public.orders (created_at desc);
create index if not exists idx_orders_status on public.orders (status);

alter table public.orders enable row level security;

create policy if not exists "Allow insert orders for public access"
on public.orders
for insert
with check (true);

create policy if not exists "Allow read own orders only"
on public.orders
for select
using (false);

create trigger if not exists set_public_orders_updated_at
before update on public.orders
for each row
execute function public.set_updated_at();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
