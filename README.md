# MEPL Stock Monitoring

Movement-based inventory system for MEPL's location-wise stock. Replaces
`stock_monitoring_board.xlsx`. Built on Next.js 15 + Supabase + Tailwind.

## Setup

### 1. Install

```bash
pnpm install
cp .env.example .env.local
```

Fill in `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` from Supabase Project Settings → API.

### 2. Database

Push the migration to Supabase:

```bash
# Option A: Supabase CLI (recommended)
supabase link --project-ref YOUR_REF
supabase db push

# Option B: paste supabase/migrations/0001_init.sql into the SQL editor
```

### 3. Create your admin user

Sign up via `/login` (you'll need to enable email/password auth in Supabase),
then in the SQL editor run:

```sql
update profiles set role = 'admin' where id = (select id from auth.users where email = 'you@example.com');
```

### 4. Import the Excel data

Dry run first — it prints the reconciliation report without writing anything:

```bash
pnpm import:dry /path/to/stock_monitoring_board.xlsx
```

Review the delta table. When you're satisfied:

```bash
pnpm import:commit /path/to/stock_monitoring_board.xlsx
```

The import:
- Skips rows with null codes or date-serial part names → `import_errors`.
- Rejects multi-location cells (e.g. `"PL-04 | PL-05"`) → `import_errors`. Enter these manually via the UI after import.
- Sums duplicate `(code, part, location)` rows.
- Posts one `OPENING` movement per unique `(SKU, location)`.
- Prints a per-SKU reconciliation of `sum(Sheet 1)` vs `Sheet 2 Total Nos`.
  Mismatches are surfaced, not silently reconciled — physically verify and post
  `ADJUSTMENT` movements from the UI.

### 5. Run

```bash
pnpm dev            # http://localhost:3000
```

## Deploy (Vercel)

1. Push to GitHub, import into Vercel.
2. Set all four env vars (Project → Settings → Environment Variables).
3. Supabase → Authentication → URL Configuration: add your Vercel preview and production URLs to Redirect URLs.

## Architecture

```
Movement (immutable ledger)  ─── trigger ───▶  inventory_balances (cache)
                                                          │
                                                          ▼
                                                   v_inventory (view)
                                                          │
                                                          ▼
                                                    inventory UI
```

- `stock_movements` is the source of truth. It is append-only — `UPDATE`/`DELETE` are blocked by a trigger. Corrections happen via `ADJUSTMENT`.
- `inventory_balances` is a per `(product, location)` cache maintained by `apply_stock_movement()`. Never written to directly by the app.
- `CHECK (quantity >= 0)` on the cache enforces "stock can't go negative" at the database level. Server actions do a friendly pre-check for UX, but the DB is the final gate.
- SKU identity: `UNIQUE (mepl_code, part_name, dimensions)`, with a partial unique index handling rows where dimensions is NULL.

## Roles

| Role | Read | Post movements | Manage products/locations/users |
|---|---|---|---|
| `viewer` | ✓ | | |
| `operator` | ✓ | ✓ | |
| `admin` | ✓ | ✓ | ✓ |

## Directory layout

```
app/
  (auth)/login/         — public login
  (app)/                — authed shell (sidebar + gate)
    page.tsx            — dashboard
    inventory/          — main table + row actions
    products/[id]/      — per-SKU detail + history
    movements/          — global ledger  (TODO)
    locations/          — location CRUD  (TODO)
    reports/            — reports        (TODO)
    admin/              — import UI + user mgmt (TODO)
components/
  common/               — shared UI bits
  inventory/            — table + Add/Remove/Transfer dialogs
lib/
  supabase/             — server/client/middleware
  schemas/              — Zod (shared server + client)
  actions/              — server actions (movements)
  types.ts              — DB row types
supabase/
  migrations/0001_init.sql
scripts/
  import-excel.ts       — Excel import CLI with reconciliation
```

## What's shipped in this pass (MVP core)

- ✅ Schema, trigger, RLS, indexes, views
- ✅ Auth (email/password), middleware gate, role helper
- ✅ Excel import CLI with reconciliation report
- ✅ Dashboard (KPIs, low stock, recent movements)
- ✅ Inventory table (search, zone filter, low-stock/hide-zero toggles)
- ✅ Add / Remove / Transfer stock, with pre-check for overselling
- ✅ Product detail page (per-location balances + full history)

## Still to build (in priority order)

1. `/movements` global ledger with filters + CSV export
2. `/locations` admin CRUD
3. `/admin/users` role management page
4. `/reports` — low stock, stock by zone, movement summary
5. `/admin/import` in-app import (currently CLI-only)
6. Command palette (Ctrl+K) with instant SKU jump
7. Table virtualization once row count exceeds ~2000 (TanStack Virtual)
8. Barcode/QR labels + scan-to-pick (v2)
