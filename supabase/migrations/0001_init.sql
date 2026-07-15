-- ============================================================================
-- MEPL Stock Monitoring — Initial Schema
-- Movement-based inventory with per-location balances kept in sync by trigger.
-- ============================================================================

create extension if not exists pg_trgm;
create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------------
-- profiles (mirror of auth.users)
-- ---------------------------------------------------------------------------
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  role        text not null default 'viewer'
                check (role in ('admin', 'operator', 'viewer')),
  created_at  timestamptz not null default now()
);

create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'viewer');
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Role helper (used by RLS policies)
create or replace function has_role(required_role text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and (
        role = required_role
        or (required_role = 'viewer'   and role in ('operator', 'admin'))
        or (required_role = 'operator' and role = 'admin')
      )
  )
$$;

-- ---------------------------------------------------------------------------
-- products (SKU master) — unique on (mepl_code, part_name, dimensions)
-- ---------------------------------------------------------------------------
create table products (
  id             uuid primary key default gen_random_uuid(),
  mepl_code      text not null,
  part_name      text not null,
  description    text,
  dimensions     text,                            -- e.g. "144 × 250"
  unit           text not null default 'nos',
  reorder_level  numeric(14,3) not null default 0,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint products_sku_unique unique (mepl_code, part_name, dimensions)
);

create unique index products_sku_null_dims_unique
  on products (mepl_code, part_name)
  where dimensions is null;

create index products_code_trgm on products using gin (mepl_code gin_trgm_ops);
create index products_part_trgm on products using gin (part_name gin_trgm_ops);
create index products_desc_trgm on products using gin (description gin_trgm_ops);
create index products_active     on products (is_active) where is_active;

-- ---------------------------------------------------------------------------
-- locations
-- ---------------------------------------------------------------------------
create table locations (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,
  zone         text generated always as (split_part(code, '-', 1)) stored,
  description  text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);
create index locations_zone on locations (zone);

-- ---------------------------------------------------------------------------
-- inventory_balances (cache, maintained by trigger)
-- ---------------------------------------------------------------------------
create table inventory_balances (
  product_id   uuid not null references products(id) on delete restrict,
  location_id  uuid not null references locations(id) on delete restrict,
  quantity     numeric(14,3) not null default 0
                 check (quantity >= 0),
  updated_at   timestamptz not null default now(),
  primary key (product_id, location_id)
);
create index inv_bal_location on inventory_balances (location_id);
create index inv_bal_nonzero  on inventory_balances (product_id) where quantity > 0;

-- ---------------------------------------------------------------------------
-- stock_movements (immutable ledger — source of truth)
-- ---------------------------------------------------------------------------
create table stock_movements (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references products(id) on delete restrict,
  location_id     uuid not null references locations(id) on delete restrict,
  to_location_id  uuid references locations(id) on delete restrict,
  movement_type   text not null
                    check (movement_type in ('IN','OUT','TRANSFER','ADJUSTMENT','OPENING')),
  quantity        numeric(14,3) not null check (quantity > 0),
  reference_no    text,
  notes           text,
  performed_by    uuid references profiles(id),
  performed_at    timestamptz not null default now(),
  batch_id        uuid,
  constraint transfer_has_to_location
    check (
      (movement_type = 'TRANSFER' and to_location_id is not null and to_location_id <> location_id)
      or
      (movement_type <> 'TRANSFER' and to_location_id is null)
    )
);
create index sm_product   on stock_movements (product_id, performed_at desc);
create index sm_location  on stock_movements (location_id, performed_at desc);
create index sm_date      on stock_movements (performed_at desc);
create index sm_type      on stock_movements (movement_type);
create index sm_batch     on stock_movements (batch_id) where batch_id is not null;

create or replace function prevent_movement_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'stock_movements is immutable — post a reversing ADJUSTMENT instead';
end $$;

create trigger sm_no_update before update on stock_movements
  for each row execute function prevent_movement_mutation();
create trigger sm_no_delete before delete on stock_movements
  for each row execute function prevent_movement_mutation();

-- ---------------------------------------------------------------------------
-- Balance sync trigger — UPDATE-first pattern so CHECK sees final value,
-- not the raw delta. SECURITY DEFINER so the trigger can write despite RLS.
-- ---------------------------------------------------------------------------
create or replace function apply_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  delta_from numeric(14,3);
begin
  if new.movement_type in ('IN','OPENING','ADJUSTMENT') then
    delta_from := new.quantity;
  elsif new.movement_type in ('OUT','TRANSFER') then
    delta_from := -new.quantity;
  end if;

  update inventory_balances
    set quantity   = quantity + delta_from,
        updated_at = now()
  where product_id  = new.product_id
    and location_id = new.location_id;

  if not found then
    insert into inventory_balances (product_id, location_id, quantity, updated_at)
      values (new.product_id, new.location_id, delta_from, now());
  end if;

  if new.movement_type = 'TRANSFER' then
    update inventory_balances
      set quantity   = quantity + new.quantity,
          updated_at = now()
    where product_id  = new.product_id
      and location_id = new.to_location_id;

    if not found then
      insert into inventory_balances (product_id, location_id, quantity, updated_at)
        values (new.product_id, new.to_location_id, new.quantity, now());
    end if;
  end if;

  return new;
end $$;

create trigger trg_apply_stock_movement
  after insert on stock_movements
  for each row execute function apply_stock_movement();

-- ---------------------------------------------------------------------------
-- import_batches + import_errors (traceability for Excel imports)
-- ---------------------------------------------------------------------------
create table import_batches (
  id            uuid primary key default gen_random_uuid(),
  source_file   text not null,
  sheet_name    text,
  imported_by   uuid references profiles(id),
  row_count     int not null default 0,
  error_count   int not null default 0,
  status        text not null default 'pending'
                  check (status in ('pending','committed','rolled_back')),
  notes         text,
  created_at    timestamptz not null default now()
);

create table import_errors (
  id           uuid primary key default gen_random_uuid(),
  batch_id     uuid not null references import_batches(id) on delete cascade,
  row_number   int,
  reason       text not null,
  raw_row      jsonb,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- v_inventory — the join used by the inventory table
-- ---------------------------------------------------------------------------
create or replace view v_inventory as
select
  b.product_id,
  b.location_id,
  p.mepl_code,
  p.part_name,
  p.description,
  p.dimensions,
  p.unit,
  p.reorder_level,
  p.is_active as product_active,
  l.code       as location_code,
  l.zone,
  b.quantity,
  b.updated_at,
  case
    when b.quantity <= 0                         then 'out'
    when b.quantity <= p.reorder_level           then 'low'
    else 'ok'
  end as stock_status
from inventory_balances b
join products  p on p.id = b.product_id
join locations l on l.id = b.location_id;

-- ---------------------------------------------------------------------------
-- v_sku_totals — total per SKU across all locations
-- ---------------------------------------------------------------------------
create or replace view v_sku_totals as
select
  p.id                            as product_id,
  p.mepl_code,
  p.part_name,
  p.dimensions,
  coalesce(sum(b.quantity), 0)    as total_quantity,
  count(b.location_id) filter (where b.quantity > 0) as active_locations
from products p
left join inventory_balances b on b.product_id = p.id
group by p.id;

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table profiles           enable row level security;
alter table products           enable row level security;
alter table locations          enable row level security;
alter table inventory_balances enable row level security;
alter table stock_movements    enable row level security;
alter table import_batches     enable row level security;
alter table import_errors      enable row level security;

create policy profiles_select on profiles for select using (auth.uid() is not null);
create policy profiles_update_self on profiles for update using (id = auth.uid());
create policy profiles_admin_all on profiles for all using (has_role('admin')) with check (has_role('admin'));

create policy products_read  on products  for select using (auth.uid() is not null);
create policy products_admin on products  for all using (has_role('admin')) with check (has_role('admin'));

create policy locations_read  on locations for select using (auth.uid() is not null);
create policy locations_admin on locations for all using (has_role('admin')) with check (has_role('admin'));

create policy inv_read on inventory_balances for select using (auth.uid() is not null);

create policy sm_read   on stock_movements for select using (auth.uid() is not null);
create policy sm_insert on stock_movements for insert
  with check (has_role('operator') and performed_by = auth.uid());

create policy ib_admin on import_batches for all using (has_role('admin')) with check (has_role('admin'));
create policy ie_admin on import_errors  for all using (has_role('admin')) with check (has_role('admin'));

-- ---------------------------------------------------------------------------
-- Explicit table grants so RLS policies can evaluate
-- (RLS applies row filtering, but base SELECT/INSERT privilege must also be granted)
-- ---------------------------------------------------------------------------
grant select on products, locations, inventory_balances, stock_movements, profiles to authenticated;
grant select on v_inventory, v_sku_totals to authenticated;
grant insert on stock_movements to authenticated;
