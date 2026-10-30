-- XLive AI Estimator: initial schema
-- Multi-tenant from day one: every private row carries organisation_id and is protected by RLS.
-- Money and quantities use numeric (never float). Approved versions and issued quotations are immutable.

-- gen_random_uuid() and sha256() are built into Postgres 13+; no extensions required.

-- ---------------------------------------------------------------------------
-- Enumerations

create type public.member_role as enum ('admin', 'estimator', 'viewer');
create type public.estimate_status as enum ('draft', 'in_review', 'approved', 'quoted', 'archived');
create type public.project_type as enum (
  'exhibition_booth', 'custom_display_stand', 'led_stage_or_runway', 'retail_display',
  'brand_activation', 'custom_installation', 'other_event_production'
);
create type public.unit as enum ('each', 'lm', 'm2', 'm3', 'sheet', 'kg', 'day', 'hour', 'lump_sum', 'unit_tbc');
create type public.measurement_basis as enum ('explicit_label', 'derived', 'grid_scale', 'visual_estimate', 'unresolved');
create type public.confidence as enum ('high', 'medium', 'low');
create type public.review_status as enum ('unreviewed', 'approved', 'rejected');
create type public.measurement_origin as enum ('ai', 'manual', 'reference_analysis');
create type public.cost_type as enum ('material', 'labour', 'equipment_rental', 'subcontract', 'transport', 'other', 'unclassified');
create type public.supply_basis as enum ('produce', 'rent', 'reuse', 'client_supplied');
create type public.calculation_method as enum ('quantity_x_rate', 'lump_sum');
create type public.rate_verification as enum ('verified', 'provisional');
create type public.allowance_mode as enum ('not_set', 'none', 'percent', 'fixed');
create type public.pricing_mode as enum ('markup', 'margin', 'fixed_price');
create type public.query_status as enum ('open', 'resolved');

-- ---------------------------------------------------------------------------
-- Tenancy

create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  organisation_id uuid not null references public.organisations (id) on delete restrict,
  full_name text not null default '',
  role public.member_role not null default 'estimator',
  created_at timestamptz not null default now()
);
create index profiles_org_idx on public.profiles (organisation_id);

-- Helper functions live in a schema that is not exposed through the Data API.
create schema if not exists private;

create or replace function private.current_org_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select organisation_id from public.profiles where id = auth.uid()
$$;

create or replace function private.can_write() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select role in ('admin', 'estimator') from public.profiles where id = auth.uid()), false)
$$;

create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
$$;

-- RLS policies call these helpers as the signed-in user.
grant usage on schema private to authenticated;

-- Hash of the server key that the app server presents when recording approvals and quotations.
-- Only the hash is stored; the key itself lives in the server environment (never in the browser).
create table private.server_keys (
  name text primary key,
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
revoke all on private.server_keys from public;

create or replace function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function private.forbid_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception '% rows are immutable', tg_table_name;
end $$;

-- ---------------------------------------------------------------------------
-- Company settings (quotation header, terms)

create table public.company_settings (
  organisation_id uuid primary key references public.organisations (id) on delete cascade,
  company_name text not null,
  legal_name text not null default '',
  address_lines text[] not null default '{}',
  phone text not null default '',
  email text not null default '',
  website text not null default '',
  commercial_registration text not null default '',
  vat_number text not null default '',
  default_currency char(3) not null default 'SAR' check (default_currency ~ '^[A-Z]{3}$'),
  quotation_prefix text not null default 'XLQ',
  quotation_validity_days integer not null default 30 check (quotation_validity_days between 1 and 365),
  terms text[] not null default '{}',
  exclusions text[] not null default '{}',
  updated_at timestamptz not null default now()
);
create trigger company_settings_touch before update on public.company_settings for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Projects, documents, AI analysis runs

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  client_name text not null default '',
  project_type public.project_type not null default 'exhibition_booth',
  venue text not null default '',
  event_dates text not null default '',
  currency char(3) not null default 'SAR' check (currency ~ '^[A-Z]{3}$'),
  notes text not null default '',
  estimator_name text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_org_idx on public.projects (organisation_id, updated_at desc);
create trigger projects_touch before update on public.projects for each row execute function private.touch_updated_at();

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null check (mime_type = 'application/pdf'),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 20 * 1024 * 1024),
  sha256 char(64) not null,
  page_count integer check (page_count > 0),
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id, sha256)
);
create index documents_project_idx on public.documents (project_id);

create table public.document_analyses (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  document_id uuid not null references public.documents (id) on delete cascade,
  provider text not null,
  model text,
  status text not null check (status in ('running', 'awaiting_review', 'failed')),
  error text,
  summary text,
  project_type_suggestion public.project_type,
  measurement_count integer not null default 0 check (measurement_count >= 0),
  -- Validated (Zod) structured output, kept for audit; measurements are copied into their own table.
  validated_output jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null
);
create index document_analyses_doc_idx on public.document_analyses (document_id, started_at desc);

-- ---------------------------------------------------------------------------
-- Estimates (working drafts)

create table public.estimates (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  status public.estimate_status not null default 'draft',
  currency char(3) not null default 'SAR' check (currency ~ '^[A-Z]{3}$'),
  pricing_mode public.pricing_mode not null default 'markup',
  -- Drafts may hold values the costing engine rejects (it reports INVALID_PRICING); approval re-validates.
  markup_rate numeric(10, 6) not null default 0 check (markup_rate >= 0),
  margin_rate numeric(10, 6) not null default 0 check (margin_rate >= 0),
  fixed_price numeric(18, 2) check (fixed_price >= 0),
  fixed_price_reason text not null default '',
  overhead_mode public.allowance_mode not null default 'not_set',
  overhead_value numeric(18, 6) check (overhead_value >= 0),
  overhead_note text not null default '',
  contingency_mode public.allowance_mode not null default 'not_set',
  contingency_value numeric(18, 6) check (contingency_value >= 0),
  contingency_note text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index estimates_project_idx on public.estimates (project_id);
create index estimates_org_status_idx on public.estimates (organisation_id, status);
create trigger estimates_touch before update on public.estimates for each row execute function private.touch_updated_at();

create table public.measurements (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  estimate_id uuid not null references public.estimates (id) on delete cascade,
  document_id uuid references public.documents (id) on delete set null,
  sort_order integer not null default 0,
  component_name text not null check (length(trim(component_name)) > 0),
  category text not null default '',
  length_m numeric(12, 4) check (length_m >= 0),
  width_m numeric(12, 4) check (width_m >= 0),
  height_m numeric(12, 4) check (height_m >= 0),
  depth_m numeric(12, 4) check (depth_m >= 0),
  derivation_dims text[] check (derivation_dims <@ array['length', 'width', 'height', 'depth']),
  derivation_multiplier numeric(12, 4) check (derivation_multiplier >= 0),
  quantity numeric(18, 4) check (quantity >= 0),
  unit public.unit not null,
  source_page integer check (source_page > 0),
  source_labels text[] not null default '{}',
  basis public.measurement_basis not null,
  confidence public.confidence not null,
  review_status public.review_status not null default 'unreviewed',
  origin public.measurement_origin not null,
  notes text not null default '',
  assumptions text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- An approved measurement must have a value.
  check (review_status <> 'approved' or quantity is not null)
);
create index measurements_estimate_idx on public.measurements (estimate_id);
create trigger measurements_touch before update on public.measurements for each row execute function private.touch_updated_at();

create table public.measurement_reviews (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  measurement_id uuid not null references public.measurements (id) on delete cascade,
  action text not null check (action in ('created', 'approved', 'rejected', 'edited', 'reopened')),
  reason text not null default '',
  changes jsonb,
  actor uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index measurement_reviews_m_idx on public.measurement_reviews (measurement_id, created_at);

-- ---------------------------------------------------------------------------
-- Price catalogue (rates are append-only versions)

create table public.catalogue_items (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  category text not null default '',
  unit public.unit not null,
  cost_type public.cost_type not null default 'material',
  supplier text not null default '',
  notes text not null default '',
  active boolean not null default true,
  thickness_mm numeric(10, 2) check (thickness_mm >= 0),
  sheet_length_mm numeric(10, 2) check (sheet_length_mm >= 0),
  sheet_width_mm numeric(10, 2) check (sheet_width_mm >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index catalogue_items_org_idx on public.catalogue_items (organisation_id, active);
create trigger catalogue_items_touch before update on public.catalogue_items for each row execute function private.touch_updated_at();

create table public.catalogue_rates (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  catalogue_item_id uuid not null references public.catalogue_items (id) on delete restrict,
  rate numeric(18, 4) not null check (rate >= 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  verification public.rate_verification not null,
  source text not null check (length(trim(source)) > 0),
  effective_from date not null,
  recorded_by uuid references public.profiles (id) on delete set null,
  recorded_at timestamptz not null default now()
);
create index catalogue_rates_item_idx on public.catalogue_rates (catalogue_item_id, effective_from desc, recorded_at desc);
create trigger catalogue_rates_immutable before update or delete on public.catalogue_rates for each row execute function private.forbid_change();

create table public.costing_rules (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  name text not null,
  formula text not null,
  dims text[] not null default '{}',
  output_unit public.unit not null,
  status text not null check (status in ('active', 'needs_confirmation', 'not_implemented')),
  description text not null default '',
  assumptions text[] not null default '{}',
  updated_at timestamptz not null default now()
);
create trigger costing_rules_touch before update on public.costing_rules for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Cost lines, queries, reconciliations

create table public.line_items (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  estimate_id uuid not null references public.estimates (id) on delete cascade,
  sort_order integer not null default 0,
  name text not null check (length(trim(name)) > 0),
  category text not null default '',
  description text not null default '',
  customer_description text,
  cost_type public.cost_type not null default 'unclassified',
  supply_basis public.supply_basis not null default 'produce',
  method public.calculation_method not null,
  quantity numeric(18, 4) check (quantity >= 0),
  quantity_unit public.unit not null,
  -- Unit rate for quantity_x_rate; the fixed amount for lump_sum. Null means "price not configured".
  rate numeric(18, 4) check (rate >= 0),
  rate_unit public.unit not null,
  quantity_source text not null check (quantity_source in ('measurement', 'manual', 'reference')),
  measurement_id uuid references public.measurements (id) on delete set null,
  quantity_source_note text not null default '',
  rate_source text not null check (rate_source in ('catalogue', 'manual', 'reference', 'none')),
  catalogue_item_id uuid references public.catalogue_items (id) on delete set null,
  catalogue_rate_id uuid references public.catalogue_rates (id) on delete set null,
  rate_verification public.rate_verification,
  rate_source_note text not null default '',
  included boolean not null default true,
  notes text not null default '',
  updated_at timestamptz not null default now(),
  check (method <> 'lump_sum' or (quantity_unit = 'lump_sum' and rate_unit = 'lump_sum'))
);
create index line_items_estimate_idx on public.line_items (estimate_id, sort_order);
create trigger line_items_touch before update on public.line_items for each row execute function private.touch_updated_at();

create table public.estimate_queries (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  estimate_id uuid not null references public.estimates (id) on delete cascade,
  line_item_id uuid references public.line_items (id) on delete cascade,
  measurement_id uuid references public.measurements (id) on delete cascade,
  text text not null check (length(trim(text)) > 0),
  status public.query_status not null default 'open',
  resolution text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  check (status = 'open' or (resolution is not null and length(trim(resolution)) > 0))
);
create index estimate_queries_estimate_idx on public.estimate_queries (estimate_id, status);

create table public.reconciliations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  estimate_id uuid not null references public.estimates (id) on delete cascade,
  sort_order integer not null default 0,
  label text not null,
  reported_total numeric(18, 2) not null check (reported_total >= 0),
  source text not null default '',
  explanation text
);
create index reconciliations_estimate_idx on public.reconciliations (estimate_id);

-- ---------------------------------------------------------------------------
-- Immutable approved versions and issued quotations

create table public.estimate_versions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  estimate_id uuid not null references public.estimates (id) on delete restrict,
  version_no integer not null check (version_no > 0),
  -- Complete snapshot (project, lines with copied rates, measurements used, pricing, calculation).
  -- An approved version is a document that must never change, so it is stored whole.
  snapshot jsonb not null,
  engine_version text not null,
  currency char(3) not null,
  direct_cost numeric(18, 2) not null,
  cost_base numeric(18, 2) not null,
  selling_price_ex_vat numeric(18, 2) not null,
  approved_by uuid references public.profiles (id) on delete set null,
  approved_by_name text not null,
  approval_note text not null default '',
  acknowledged_warnings text[] not null default '{}',
  approved_at timestamptz not null default now(),
  unique (estimate_id, version_no)
);
create trigger estimate_versions_immutable before update or delete on public.estimate_versions for each row execute function private.forbid_change();

create table public.quotations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  estimate_version_id uuid not null references public.estimate_versions (id) on delete restrict,
  quote_number text not null,
  issue_date date not null,
  valid_until date not null check (valid_until >= issue_date),
  total_ex_vat numeric(18, 2) not null,
  currency char(3) not null,
  vat_treatment text not null default 'excluded' check (vat_treatment = 'excluded'),
  format text not null default 'summary',
  settings_snapshot jsonb not null,
  pdf_storage_path text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organisation_id, quote_number)
);
create trigger quotations_immutable before update or delete on public.quotations for each row execute function private.forbid_change();

create table public.audit_events (
  id bigint generated always as identity primary key,
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  actor uuid references public.profiles (id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  details jsonb,
  created_at timestamptz not null default now()
);
create index audit_events_org_idx on public.audit_events (organisation_id, created_at desc);
create trigger audit_events_immutable before update or delete on public.audit_events for each row execute function private.forbid_change();

-- ---------------------------------------------------------------------------
-- Row Level Security

alter table public.organisations enable row level security;
alter table public.profiles enable row level security;
alter table public.company_settings enable row level security;
alter table public.projects enable row level security;
alter table public.documents enable row level security;
alter table public.document_analyses enable row level security;
alter table public.estimates enable row level security;
alter table public.measurements enable row level security;
alter table public.measurement_reviews enable row level security;
alter table public.catalogue_items enable row level security;
alter table public.catalogue_rates enable row level security;
alter table public.costing_rules enable row level security;
alter table public.line_items enable row level security;
alter table public.estimate_queries enable row level security;
alter table public.reconciliations enable row level security;
alter table public.estimate_versions enable row level security;
alter table public.quotations enable row level security;
alter table public.audit_events enable row level security;

create policy "members read their organisation" on public.organisations
  for select to authenticated using (id = (select private.current_org_id()));

create policy "members read profiles in their organisation" on public.profiles
  for select to authenticated using (organisation_id = (select private.current_org_id()));
create policy "admins manage profiles" on public.profiles
  for update to authenticated using (organisation_id = (select private.current_org_id()) and (select private.is_admin()))
  with check (organisation_id = (select private.current_org_id()));

create policy "members read settings" on public.company_settings
  for select to authenticated using (organisation_id = (select private.current_org_id()));
create policy "admins write settings" on public.company_settings
  for all to authenticated using (organisation_id = (select private.current_org_id()) and (select private.is_admin()))
  with check (organisation_id = (select private.current_org_id()) and (select private.is_admin()));

-- Working data: members read; admins and estimators write, always within their own organisation.
do $$
declare t text;
begin
  foreach t in array array['projects', 'documents', 'document_analyses', 'estimates', 'measurements', 'measurement_reviews', 'line_items', 'estimate_queries', 'reconciliations']
  loop
    execute format('create policy "members read %1$s" on public.%1$I for select to authenticated using (organisation_id = (select private.current_org_id()))', t);
    execute format('create policy "writers insert %1$s" on public.%1$I for insert to authenticated with check (organisation_id = (select private.current_org_id()) and (select private.can_write()))', t);
    execute format('create policy "writers update %1$s" on public.%1$I for update to authenticated using (organisation_id = (select private.current_org_id()) and (select private.can_write())) with check (organisation_id = (select private.current_org_id()))', t);
    execute format('create policy "writers delete %1$s" on public.%1$I for delete to authenticated using (organisation_id = (select private.current_org_id()) and (select private.can_write()))', t);
  end loop;
end $$;

-- Catalogue and rules: members read; only admins change prices and rules.
create policy "members read catalogue" on public.catalogue_items for select to authenticated using (organisation_id = (select private.current_org_id()));
create policy "admins write catalogue" on public.catalogue_items for all to authenticated
  using (organisation_id = (select private.current_org_id()) and (select private.is_admin()))
  with check (organisation_id = (select private.current_org_id()) and (select private.is_admin()));
create policy "members read rates" on public.catalogue_rates for select to authenticated using (organisation_id = (select private.current_org_id()));
create policy "admins add rates" on public.catalogue_rates for insert to authenticated
  with check (organisation_id = (select private.current_org_id()) and (select private.is_admin()));
create policy "members read rules" on public.costing_rules for select to authenticated using (organisation_id = (select private.current_org_id()));
create policy "admins write rules" on public.costing_rules for all to authenticated
  using (organisation_id = (select private.current_org_id()) and (select private.is_admin()))
  with check (organisation_id = (select private.current_org_id()) and (select private.is_admin()));

-- Versions and quotations: readable by members; inserted only through the server-key-checked functions
-- (see app_functions) after the server re-runs the costing engine, so a browser can never submit its own
-- approved total. No insert/update/delete policies exist for signed-in users.
create policy "members read versions" on public.estimate_versions for select to authenticated using (organisation_id = (select private.current_org_id()));
create policy "members read quotations" on public.quotations for select to authenticated using (organisation_id = (select private.current_org_id()));
create policy "members read audit" on public.audit_events for select to authenticated using (organisation_id = (select private.current_org_id()));

-- ---------------------------------------------------------------------------
-- Storage: private buckets; object paths start with the organisation id.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('project-documents', 'project-documents', false, 20971520, array['application/pdf']),
  ('quotations', 'quotations', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

create policy "members read own org documents" on storage.objects for select to authenticated
  using (bucket_id in ('project-documents', 'quotations') and (storage.foldername(name))[1] = (select private.current_org_id())::text);
create policy "writers upload own org documents" on storage.objects for insert to authenticated
  with check (bucket_id = 'project-documents' and (storage.foldername(name))[1] = (select private.current_org_id())::text and (select private.can_write()));
create policy "writers delete own org documents" on storage.objects for delete to authenticated
  using (bucket_id = 'project-documents' and (storage.foldername(name))[1] = (select private.current_org_id())::text and (select private.can_write()));
