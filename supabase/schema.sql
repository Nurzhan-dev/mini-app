create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  status text not null default 'new',
  source text not null default 'mini_app',
  lang text not null default 'ru'
    check (lang in ('ru', 'kk')),
  subtotal integer not null
    check (subtotal >= 0),
  delivery integer not null
    check (delivery >= 0),
  total integer not null
    check (total >= 0),
  items jsonb not null
    check (
      jsonb_typeof(items) = 'array'
      and jsonb_array_length(items) > 0
    ),
  phone text not null
    check (char_length(btrim(phone)) > 0),
  address text,
  delivery_method text not null default 'delivery'
    check (delivery_method in ('delivery', 'pickup')),
  notes text,
  constraint orders_delivery_address_required
    check (
      delivery_method = 'pickup'
      or char_length(btrim(coalesce(address, ''))) > 0
    )
);

create index if not exists orders_created_at_idx
  on public.orders (created_at desc);

create index if not exists orders_status_idx
  on public.orders (status);

alter table public.orders enable row level security;

revoke all on table public.orders from anon, authenticated;
grant all on table public.orders to service_role;
