-- Kanakku schema
-- Run this once against a fresh Supabase project (SQL editor, or `supabase db push`).
-- Combines the base tables from Claude Engineering Specification.md with the
-- category/split_method/deposit additions called for in
-- kanakku-design/DESIGN_HANDOFF.md ("Backend implications").

create extension if not exists pgcrypto;

-- 1. Baileys WhatsApp session storage (Requirement A).
create table if not exists baileys_auth (
    id text primary key,
    value jsonb not null,
    updated_at timestamptz not null default now()
);

-- 2. Trip-wide settings — a single row (id = 1).
create table if not exists trip_settings (
    id integer primary key default 1,
    trip_name text not null default 'Our Trip',
    trip_dates text,
    banker_upi_id text,
    whatsapp_group_jid text,
    last_bad_cop_sent_at timestamptz,
    constraint trip_settings_singleton check (id = 1)
);

insert into trip_settings (id) values (1)
on conflict (id) do nothing;

-- 3. Trip members.
create table if not exists trip_users (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    phone_number text,
    is_admin boolean not null default false,
    sort_order integer not null default 0,
    created_at timestamptz not null default now()
);

-- 4. Expenses. Whether a payment counts as pool spending vs. a personal
-- front is inferred from paid_by_id's is_admin (banker = pool, anyone else
-- = personal) at read time — see lib/balances.ts — not stored here.
create table if not exists expenses (
    id uuid primary key default gen_random_uuid(),
    description text not null,
    amount numeric(12, 2) not null check (amount > 0),
    category text not null default 'fun' check (category in ('food', 'stay', 'travel', 'fun')),
    split_method text not null default 'equal' check (split_method in ('equal', 'custom', 'select')),
    paid_by_id uuid references trip_users(id) on delete set null,
    occurred_at timestamptz not null default now(),
    created_at timestamptz not null default now()
);

create index if not exists idx_expenses_occurred_at on expenses(occurred_at desc);

-- 5. Expense splits (per-person shares). No settlement state here —
-- settling up is tracked only as an aggregate, via a deposit (see below).
create table if not exists expense_splits (
    id uuid primary key default gen_random_uuid(),
    expense_id uuid not null references expenses(id) on delete cascade,
    user_id uuid not null references trip_users(id) on delete cascade,
    split_amount numeric(12, 2) not null,
    unique (expense_id, user_id)
);

create index if not exists idx_expense_splits_user on expense_splits(user_id);
create index if not exists idx_expense_splits_expense on expense_splits(expense_id);

-- 6. Deposits — money the banker now holds: either a member funding the
-- shared pool directly, or a member paying the banker to settle their own
-- balance. Both are the same kind of record (see lib/balances.ts) — there's
-- no separate "settled" flag or auto-generated credit anymore.
create table if not exists deposits (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references trip_users(id) on delete cascade,
    amount numeric(12, 2) not null check (amount > 0),
    note text,
    deposited_at timestamptz not null default now(),
    created_at timestamptz not null default now()
);

create index if not exists idx_deposits_user on deposits(user_id);

-- 6b. Payouts — the reverse of a deposit: money the banker paid back to a
-- member (e.g. they overpaid into the pool and want the surplus back).
create table if not exists payouts (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references trip_users(id) on delete cascade,
    amount numeric(12, 2) not null check (amount > 0),
    note text,
    paid_at timestamptz not null default now(),
    created_at timestamptz not null default now()
);

create index if not exists idx_payouts_user on payouts(user_id);

-- 7. Atomic write RPC. createExpense/updateExpense in app/actions.ts used to
-- issue their expense + splits writes as separate sequential Supabase
-- calls — if the process crashed or a call failed partway through, an
-- expense could be left with no splits. Wrapping the multi-table write in a
-- single plpgsql function makes it one transaction: either all of it lands
-- or none of it does. Validation (amount > 0, negative shares, etc.) still
-- happens in TypeScript before calling these — they trust their input, same
-- as computeBalances does on the read side. Neither RPC touches deposits at
-- all: "paid" credit for a personally-fronted expense is always computed
-- live from the payer's is_admin, never stored as a synthetic row.
--
-- `create or replace` only replaces a function whose parameter list matches
-- exactly — these drop statements clear out every prior signature this
-- project has ever shipped for these two functions, so a stale overload
-- never lingers and leaves `revoke`/`grant` below ambiguous about which to
-- target (bit us once already — see git history).
drop function if exists create_expense_with_splits(text, numeric, text, text, uuid, jsonb);
drop function if exists create_expense_with_splits(text, numeric, text, text, uuid, boolean, jsonb);
drop function if exists update_expense_with_splits(uuid, text, numeric, text, text, uuid, jsonb);
drop function if exists update_expense_with_splits(uuid, text, numeric, text, text, uuid, boolean, jsonb);

create or replace function create_expense_with_splits(
    p_description text,
    p_amount numeric,
    p_category text,
    p_split_method text,
    p_paid_by_id uuid,
    p_splits jsonb -- [{ "user_id": uuid, "amount": numeric }, ...]
) returns uuid
language plpgsql
as $$
declare
    v_expense_id uuid;
    v_split jsonb;
begin
    insert into expenses (description, amount, category, split_method, paid_by_id)
    values (p_description, p_amount, p_category, p_split_method, p_paid_by_id)
    returning id into v_expense_id;

    for v_split in select * from jsonb_array_elements(p_splits)
    loop
        insert into expense_splits (expense_id, user_id, split_amount)
        values (v_expense_id, (v_split->>'user_id')::uuid, (v_split->>'amount')::numeric);
    end loop;

    return v_expense_id;
end;
$$;

create or replace function update_expense_with_splits(
    p_expense_id uuid,
    p_description text,
    p_amount numeric,
    p_category text,
    p_split_method text,
    p_paid_by_id uuid,
    p_splits jsonb -- [{ "user_id": uuid, "amount": numeric }, ...]
) returns void
language plpgsql
as $$
declare
    v_split jsonb;
    v_user_id uuid;
    v_existing_id uuid;
begin
    update expenses
    set description = p_description,
        amount = p_amount,
        category = p_category,
        split_method = p_split_method,
        paid_by_id = p_paid_by_id
    where id = p_expense_id;

    -- Drop splits for participants no longer on the expense.
    delete from expense_splits
    where expense_id = p_expense_id
      and user_id not in (
        select (elem->>'user_id')::uuid from jsonb_array_elements(p_splits) elem
      );

    -- Reconcile the rest: update-in-place for anyone still a participant,
    -- insert for anyone new.
    for v_split in select * from jsonb_array_elements(p_splits)
    loop
        v_user_id := (v_split->>'user_id')::uuid;
        select id into v_existing_id from expense_splits
        where expense_id = p_expense_id and user_id = v_user_id;

        if v_existing_id is not null then
            update expense_splits
            set split_amount = (v_split->>'amount')::numeric
            where id = v_existing_id;
        else
            insert into expense_splits (expense_id, user_id, split_amount)
            values (p_expense_id, v_user_id, (v_split->>'amount')::numeric);
        end if;
    end loop;
end;
$$;

-- Postgres grants EXECUTE on a new function to PUBLIC by default, which
-- would let the anon key (embedded in client-side JS, so effectively
-- public) call these write RPCs directly via PostgREST — bypassing the
-- admin-cookie check that only exists in app/actions.ts. Only the service
-- role (used exclusively by the trusted Next.js server) should be able to
-- call them, matching every other table here (anon gets read-only via RLS,
-- all writes go through the server).
revoke execute on function create_expense_with_splits from public;
revoke execute on function update_expense_with_splits from public;
grant execute on function create_expense_with_splits to service_role;
grant execute on function update_expense_with_splits to service_role;

-- Row Level Security. All writes go through the server (service role key),
-- which bypasses RLS, so these policies only ever grant the anon key
-- read-only access — needed for the friend link's live Realtime updates.
alter table trip_settings enable row level security;
alter table trip_users enable row level security;
alter table expenses enable row level security;
alter table expense_splits enable row level security;
alter table deposits enable row level security;
alter table payouts enable row level security;
alter table baileys_auth enable row level security;
-- No policy is created on baileys_auth: it stays service-role-only.

drop policy if exists "public read trip_settings" on trip_settings;
create policy "public read trip_settings" on trip_settings for select using (true);

drop policy if exists "public read trip_users" on trip_users;
create policy "public read trip_users" on trip_users for select using (true);

drop policy if exists "public read expenses" on expenses;
create policy "public read expenses" on expenses for select using (true);

drop policy if exists "public read expense_splits" on expense_splits;
create policy "public read expense_splits" on expense_splits for select using (true);

drop policy if exists "public read deposits" on deposits;
create policy "public read deposits" on deposits for select using (true);

drop policy if exists "public read payouts" on payouts;
create policy "public read payouts" on payouts for select using (true);

-- Realtime: let the friend/banker views subscribe to live changes.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'expenses'
  ) then
    alter publication supabase_realtime add table expenses;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'expense_splits'
  ) then
    alter publication supabase_realtime add table expense_splits;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trip_settings'
  ) then
    alter publication supabase_realtime add table trip_settings;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trip_users'
  ) then
    alter publication supabase_realtime add table trip_users;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'deposits'
  ) then
    alter publication supabase_realtime add table deposits;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'payouts'
  ) then
    alter publication supabase_realtime add table payouts;
  end if;
end $$;
