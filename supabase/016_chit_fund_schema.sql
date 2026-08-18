-- FinTrack Chit Fund module — schema proposal for review only.
-- DO NOT run in production yet. This migration is intentionally isolated from
-- the existing Daily/Monthly Finance tables and calculations.

create table if not exists public.chit_schemes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  chit_value numeric(14,2) not null check (chit_value > 0),
  duration_months integer not null check (duration_months > 0),
  member_count integer not null check (member_count > 0),
  installment_amount numeric(14,2) not null check (installment_amount > 0),
  commission_percent numeric(7,4) not null check (commission_percent >= 0 and commission_percent <= 7),
  start_date date not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'closed')),
  min_bid_percent numeric(7,4) not null default 70 check (min_bid_percent >= 0 and min_bid_percent <= 100),
  max_bid_percent numeric(7,4) not null default 95 check (max_bid_percent >= 0 and max_bid_percent <= 100),
  late_penalty_amount numeric(14,2) not null default 0 check (late_penalty_amount >= 0),
  security_deposit_amount numeric(14,2) not null default 0 check (security_deposit_amount >= 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chit_schemes_bid_range_valid check (min_bid_percent <= max_bid_percent),
  constraint chit_schemes_installment_consistent check (installment_amount * member_count = chit_value)
);

create index if not exists chit_schemes_org_idx on public.chit_schemes(organization_id, status);

-- Chit members are intentionally independent of FinTrack customers. KYC values
-- are ciphertext placeholders; encryption/decryption must be added through
-- owner-only security-definer RPCs before any production data is stored.
create table if not exists public.chit_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  full_name text not null,
  phone text not null,
  address text,
  aadhaar_ciphertext text,
  pan_ciphertext text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chit_members_org_idx on public.chit_members(organization_id, full_name);

create table if not exists public.chit_enrollments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  scheme_id uuid not null references public.chit_schemes(id) on delete restrict,
  member_id uuid not null references public.chit_members(id) on delete restrict,
  ticket_number integer not null check (ticket_number > 0),
  status text not null default 'active' check (status in ('active', 'withdrawn', 'completed')),
  guarantor_name text not null,
  guarantor_phone text not null,
  guarantor_address text,
  guarantor_confirmation_status text not null default 'pending' check (guarantor_confirmation_status in ('pending', 'confirmed', 'rejected')),
  guarantor_confirmed_at timestamptz,
  security_deposit_amount numeric(14,2) not null default 0 check (security_deposit_amount >= 0),
  enrolled_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  unique(scheme_id, member_id),
  unique(scheme_id, ticket_number)
);

create index if not exists chit_enrollments_scheme_idx on public.chit_enrollments(scheme_id, status);

create table if not exists public.chit_cycles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  scheme_id uuid not null references public.chit_schemes(id) on delete restrict,
  cycle_number integer not null check (cycle_number > 0),
  cycle_date date not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'auction_open', 'auction_closed', 'settled')),
  winning_enrollment_id uuid references public.chit_enrollments(id) on delete restrict,
  winning_bid_amount numeric(14,2),
  discount_amount numeric(14,2),
  commission_amount numeric(14,2),
  distributable_amount numeric(14,2),
  dividend_per_member numeric(14,2),
  tie_break_method text,
  tie_break_result jsonb,
  closed_at timestamptz,
  closed_by uuid references auth.users(id),
  unique(scheme_id, cycle_number)
);

create index if not exists chit_cycles_scheme_date_idx on public.chit_cycles(scheme_id, cycle_date);

create table if not exists public.chit_bids (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  cycle_id uuid not null references public.chit_cycles(id) on delete restrict,
  enrollment_id uuid not null references public.chit_enrollments(id) on delete restrict,
  bid_amount numeric(14,2) not null check (bid_amount > 0),
  bid_percent numeric(7,4) not null check (bid_percent >= 0 and bid_percent <= 100),
  status text not null default 'valid' check (status in ('valid', 'withdrawn', 'winner', 'not_selected')),
  submitted_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  unique(cycle_id, enrollment_id)
);

create index if not exists chit_bids_cycle_idx on public.chit_bids(cycle_id, bid_amount);

create table if not exists public.chit_installments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  cycle_id uuid not null references public.chit_cycles(id) on delete restrict,
  enrollment_id uuid not null references public.chit_enrollments(id) on delete restrict,
  amount_due numeric(14,2) not null check (amount_due >= 0),
  dividend_credit numeric(14,2) not null default 0 check (dividend_credit >= 0),
  late_penalty numeric(14,2) not null default 0 check (late_penalty >= 0),
  net_amount_due numeric(14,2) not null check (net_amount_due >= 0),
  amount_paid numeric(14,2) not null default 0 check (amount_paid >= 0),
  due_date date not null,
  paid_date date,
  payment_mode public.payment_mode,
  payment_reference text,
  status text not null default 'due' check (status in ('due', 'partially_paid', 'paid', 'overdue', 'waived')),
  collected_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(cycle_id, enrollment_id)
);

create index if not exists chit_installments_member_due_idx on public.chit_installments(enrollment_id, due_date, status);

create table if not exists public.chit_payouts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  cycle_id uuid not null references public.chit_cycles(id) on delete restrict,
  enrollment_id uuid not null references public.chit_enrollments(id) on delete restrict,
  gross_payout numeric(14,2) not null check (gross_payout > 0),
  deductions numeric(14,2) not null default 0 check (deductions >= 0),
  net_payout numeric(14,2) not null check (net_payout >= 0),
  guarantor_confirmation_status text not null default 'pending' check (guarantor_confirmation_status in ('pending', 'confirmed', 'rejected')),
  disbursed_at timestamptz,
  payment_mode public.payment_mode,
  payment_reference text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'paid', 'cancelled')),
  created_by uuid not null references auth.users(id),
  unique(cycle_id)
);

create table if not exists public.chit_security_deposits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  scheme_id uuid not null references public.chit_schemes(id) on delete restrict,
  enrollment_id uuid not null references public.chit_enrollments(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  received_date date not null,
  returned_date date,
  status text not null default 'held' check (status in ('held', 'returned', 'forfeited')),
  payment_reference text,
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.chit_audit_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  scheme_id uuid references public.chit_schemes(id) on delete set null,
  cycle_id uuid references public.chit_cycles(id) on delete set null,
  enrollment_id uuid references public.chit_enrollments(id) on delete set null,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists chit_audit_org_created_idx on public.chit_audit_log(organization_id, created_at desc);

create table if not exists public.chit_report_configs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  state_code text not null,
  report_type text not null,
  configuration_json jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  unique(organization_id, state_code, report_type)
);

-- RLS is enabled now; owner/staff policies and security-definer RPCs will be
-- added only after the permission model and workflows are reviewed.
alter table public.chit_schemes enable row level security;
alter table public.chit_members enable row level security;
alter table public.chit_enrollments enable row level security;
alter table public.chit_cycles enable row level security;
alter table public.chit_bids enable row level security;
alter table public.chit_installments enable row level security;
alter table public.chit_payouts enable row level security;
alter table public.chit_security_deposits enable row level security;
alter table public.chit_audit_log enable row level security;
alter table public.chit_report_configs enable row level security;
