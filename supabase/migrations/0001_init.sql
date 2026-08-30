-- Iso-Shop Loan Pre-Qualification Tool — Phase 1 schema
-- Run against a fresh Supabase project (SQL Editor, or `supabase db push`).

create extension if not exists "pgcrypto";

create type property_type as enum (
  'primary_residence',
  'residential_rental_investment',
  'commercial',
  'land',
  'industrial'
);

-- Not part of the Section 4 table in the spec. Added because Section 6.1 requires
-- catching specific excluded sub-types (vacant commercial, cemetery, church, etc.),
-- which a bare property_type enum can't express. Flagged for VP awareness — see README.
create type property_subtype_flag as enum (
  'vacant_commercial',
  'vacant_industrial',
  'cemetery',
  'church',
  'quarry_or_mine',
  'funeral_home',
  'medical_facility',
  'assisted_living_facility',
  'gas_station',
  'golf_course',
  'ground_up_construction',
  'dilapidated_or_fire_damaged'
);

create type position_sought as enum (
  'first',
  'second_behind_bank',
  'private_lender_buyout'
);

create type exit_strategy as enum (
  'sale',
  'refinance',
  'business_proceeds',
  'no_plan_yet'
);

create type result_status as enum (
  'disqualified',
  'soft_offer_generated',
  'needs_vp_call'
);

create table shops (
  id uuid primary key default gen_random_uuid(),
  shop_name text not null,
  shop_code text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);

create table submissions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops (id),

  rep_name text not null,
  rep_phone text not null,
  rep_email text not null,

  borrower_name text,
  borrower_phone text,
  borrower_email text,
  property_address text,
  property_city text,
  property_state text check (char_length(property_state) = 2),
  property_zip text,
  property_type property_type,
  property_subtypes property_subtype_flag[] not null default '{}',
  assisted_living_converted_sfr boolean not null default false,

  position_sought position_sought,
  current_value numeric,
  current_debt_owed numeric,
  exit_strategy exit_strategy,
  use_of_funds text,

  sole_owner boolean,
  co_owner_names text,

  result_status result_status,
  disqualification_reason text,
  soft_offer_min numeric,
  soft_offer_max numeric,
  estimated_monthly_min numeric,
  estimated_monthly_max numeric,

  created_at timestamptz not null default now()
);

create index submissions_shop_id_idx on submissions (shop_id);
create index submissions_created_at_idx on submissions (created_at desc);
create index shops_shop_code_idx on shops (shop_code);

-- RLS is enabled with NO policies on purpose: every read/write in this app goes
-- through server actions using the service-role key (shop code is a shared secret,
-- not a Supabase Auth identity, so RLS-by-user-id doesn't apply here). This blocks
-- the anon/public key from touching these tables directly if it ever leaks client-side.
alter table shops enable row level security;
alter table submissions enable row level security;
