-- XLive AI Estimator: application functions
-- The browser talks to the database through these functions using the domain's JSON shape.
-- load/save run as the caller (security invoker), so Row Level Security still applies.
-- Approvals and quotations are recorded only by the app server (key-checked), after it
-- has recalculated the totals with the costing engine.

-- ---------------------------------------------------------------------------
-- Small helpers

create or replace function private.num(n numeric) returns text
language sql immutable set search_path = '' as $$
  select case when n is null then null else trim_scale(n)::text end
$$;

create or replace function private.try_uuid(t text) returns uuid
language plpgsql immutable set search_path = '' as $$
begin
  return t::uuid;
exception when others then
  return null;
end $$;

create or replace function private.text_array(j jsonb) returns text[]
language sql immutable set search_path = '' as $$
  select coalesce(array(select jsonb_array_elements_text(case when jsonb_typeof(j) = 'array' then j else '[]'::jsonb end)), '{}')
$$;

create or replace function private.verify_server_key(p_key text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.server_keys
    where name = 'app_server' and key_hash = encode(sha256(convert_to(coalesce(p_key, ''), 'UTF8')), 'hex')
  )
$$;

create or replace function private.query_json(q public.estimate_queries) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', q.id, 'text', q.text, 'status', q.status, 'resolution', q.resolution,
    'createdAt', q.created_at, 'resolvedAt', q.resolved_at
  )
$$;

-- ---------------------------------------------------------------------------
-- Session context and onboarding

create or replace function public.get_app_context() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'userId', u.id,
    'email', u.email,
    'fullName', p.full_name,
    'role', p.role,
    'organisationId', p.organisation_id,
    'organisationName', o.name,
    -- Lets the onboarding page offer "create organisation" only to the very first user.
    'organisationsExist', exists (select 1 from public.organisations)
  )
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.organisations o on o.id = p.organisation_id
  where u.id = auth.uid()
$$;

-- Bootstrap: the first signed-in user creates the company and becomes its admin.
-- Later users are added by an admin (add_member), so a stray sign-up gets no access.
create or replace function public.create_organisation(p_name text, p_full_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'You already belong to an organisation' using errcode = '23505';
  end if;
  if exists (select 1 from public.organisations) then
    raise exception 'An organisation already exists. Ask its administrator to add you.' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Organisation name is required'; end if;

  insert into public.organisations (name) values (trim(p_name)) returning id into v_org;
  insert into public.profiles (id, organisation_id, full_name, role) values (auth.uid(), v_org, trim(coalesce(p_full_name, '')), 'admin');
  insert into public.company_settings (organisation_id, company_name) values (v_org, trim(p_name));
  insert into public.audit_events (organisation_id, actor, entity_type, entity_id, action) values (v_org, auth.uid(), 'organisation', v_org, 'created');
  return v_org;
end $$;

create or replace function public.add_member(p_email text, p_role public.member_role, p_full_name text default '') returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := private.current_org_id(); v_user uuid;
begin
  if not private.is_admin() then raise exception 'Only administrators can add members' using errcode = '42501'; end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then raise exception 'No account with that email. Ask the person to sign up first.' using errcode = 'P0002'; end if;
  if exists (select 1 from public.profiles where id = v_user) then
    raise exception 'That account already belongs to an organisation' using errcode = '23505';
  end if;
  insert into public.profiles (id, organisation_id, full_name, role) values (v_user, v_org, coalesce(p_full_name, ''), p_role);
  insert into public.audit_events (organisation_id, actor, entity_type, entity_id, action, details)
  values (v_org, auth.uid(), 'profile', v_user, 'member_added', jsonb_build_object('role', p_role));
  return v_user;
end $$;

create or replace function public.list_members() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('userId', p.id, 'email', u.email, 'fullName', p.full_name, 'role', p.role) order by u.email), '[]'::jsonb)
  from public.profiles p join auth.users u on u.id = p.id
  where p.organisation_id = private.current_org_id()
$$;

-- ---------------------------------------------------------------------------
-- Load: database rows → domain JSON (numbers as exact decimal strings)

create or replace function private.measurement_json(m public.measurements) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', m.id,
    'componentName', m.component_name,
    'category', m.category,
    'dimensions', jsonb_build_object('length', private.num(m.length_m), 'width', private.num(m.width_m), 'height', private.num(m.height_m), 'depth', private.num(m.depth_m)),
    'derivation', case when m.derivation_dims is null then null else jsonb_build_object('dims', to_jsonb(m.derivation_dims), 'multiplier', coalesce(private.num(m.derivation_multiplier), '1')) end,
    'quantity', private.num(m.quantity),
    'unit', m.unit,
    'sourceDocumentId', m.document_id,
    'sourcePage', m.source_page,
    'sourceLabels', to_jsonb(m.source_labels),
    'basis', m.basis,
    'confidence', m.confidence,
    'reviewStatus', m.review_status,
    'origin', m.origin,
    'notes', m.notes,
    'assumptions', to_jsonb(m.assumptions),
    'queries', coalesce((select jsonb_agg(private.query_json(q) order by q.created_at) from public.estimate_queries q where q.measurement_id = m.id), '[]'::jsonb),
    'reviewHistory', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('at', r.created_at, 'action', r.action, 'reason', r.reason, 'changes', r.changes)) order by r.created_at)
      from public.measurement_reviews r where r.measurement_id = m.id
    ), '[]'::jsonb)
  )
$$;

create or replace function private.line_json(l public.line_items) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', l.id, 'name', l.name, 'category', l.category, 'description', l.description,
    'customerDescription', l.customer_description, 'costType', l.cost_type, 'supplyBasis', l.supply_basis,
    'method', l.method, 'quantity', private.num(l.quantity), 'quantityUnit', l.quantity_unit,
    'rate', private.num(l.rate), 'rateUnit', l.rate_unit,
    'quantitySource', jsonb_build_object('kind', l.quantity_source, 'measurementId', l.measurement_id, 'note', l.quantity_source_note),
    'rateSource', jsonb_build_object('kind', l.rate_source, 'catalogueItemId', l.catalogue_item_id, 'catalogueRateId', l.catalogue_rate_id, 'verification', l.rate_verification, 'note', l.rate_source_note),
    'included', l.included, 'notes', l.notes,
    'queries', coalesce((select jsonb_agg(private.query_json(q) order by q.created_at) from public.estimate_queries q where q.line_item_id = l.id), '[]'::jsonb)
  )
$$;

create or replace function private.estimate_json(e public.estimates) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', e.id,
    'project', jsonb_build_object('projectName', p.name, 'clientName', p.client_name, 'projectType', p.project_type, 'venue', p.venue, 'eventDates', p.event_dates, 'estimator', p.estimator_name, 'notes', p.notes),
    'status', e.status,
    'documents', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'fileName', d.file_name, 'sha256', d.sha256, 'sizeBytes', d.size_bytes, 'pageCount', d.page_count, 'uploadedAt', d.created_at, 'storage', 'supabase') order by d.created_at)
      from public.documents d where d.project_id = p.id
    ), '[]'::jsonb),
    'analysisRuns', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'documentId', a.document_id, 'provider', a.provider, 'model', a.model, 'status', a.status, 'startedAt', a.started_at,
        'completedAt', a.completed_at, 'error', a.error, 'summary', a.summary, 'projectTypeSuggestion', a.project_type_suggestion, 'measurementCount', a.measurement_count) order by a.started_at)
      from public.document_analyses a join public.documents d on d.id = a.document_id where d.project_id = p.id
    ), '[]'::jsonb),
    'costing', jsonb_build_object(
      'currency', e.currency,
      'measurements', coalesce((select jsonb_agg(private.measurement_json(m) order by m.sort_order, m.created_at) from public.measurements m where m.estimate_id = e.id), '[]'::jsonb),
      'lineItems', coalesce((select jsonb_agg(private.line_json(l) order by l.sort_order) from public.line_items l where l.estimate_id = e.id), '[]'::jsonb),
      'pricing', jsonb_build_object('mode', e.pricing_mode, 'markupRate', private.num(e.markup_rate), 'marginRate', private.num(e.margin_rate), 'fixedPrice', private.num(e.fixed_price), 'fixedPriceReason', e.fixed_price_reason),
      'overhead', jsonb_build_object('mode', e.overhead_mode, 'value', private.num(e.overhead_value), 'note', e.overhead_note),
      'contingency', jsonb_build_object('mode', e.contingency_mode, 'value', private.num(e.contingency_value), 'note', e.contingency_note),
      'reconciliations', coalesce((
        select jsonb_agg(jsonb_build_object('id', r.id, 'label', r.label, 'reportedTotal', private.num(r.reported_total), 'source', r.source, 'explanation', r.explanation) order by r.sort_order)
        from public.reconciliations r where r.estimate_id = e.id
      ), '[]'::jsonb),
      'queries', coalesce((
        select jsonb_agg(private.query_json(q) order by q.created_at) from public.estimate_queries q
        where q.estimate_id = e.id and q.line_item_id is null and q.measurement_id is null
      ), '[]'::jsonb)
    ),
    'versions', coalesce((select jsonb_agg(v.snapshot order by v.version_no) from public.estimate_versions v where v.estimate_id = e.id), '[]'::jsonb),
    'quotations', coalesce((
      select jsonb_agg(jsonb_build_object('id', qt.id, 'number', qt.quote_number, 'versionId', v.id, 'versionNo', v.version_no, 'issueDate', qt.issue_date,
        'validUntil', qt.valid_until, 'totalExVat', private.num(qt.total_ex_vat), 'currency', qt.currency, 'vatTreatment', qt.vat_treatment,
        'format', qt.format, 'settingsSnapshot', qt.settings_snapshot, 'createdAt', qt.created_at) order by qt.created_at)
      from public.quotations qt join public.estimate_versions v on v.id = qt.estimate_version_id where v.estimate_id = e.id
    ), '[]'::jsonb),
    'sample', null,
    'createdAt', e.created_at,
    'updatedAt', e.updated_at
  )
  from public.projects p where p.id = e.project_id
$$;

create or replace function public.load_estimates(p_id uuid default null) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(private.estimate_json(e) order by e.updated_at desc), '[]'::jsonb)
  from public.estimates e
  where p_id is null or e.id = p_id
$$;

create or replace function public.load_catalogue() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'name', c.name, 'category', c.category, 'unit', c.unit, 'costType', c.cost_type,
    'supplier', c.supplier, 'notes', c.notes, 'active', c.active,
    'specs', jsonb_build_object('thicknessMm', private.num(c.thickness_mm), 'sheetLengthMm', private.num(c.sheet_length_mm), 'sheetWidthMm', private.num(c.sheet_width_mm)),
    'rates', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'rate', private.num(r.rate), 'currency', r.currency, 'verification', r.verification,
        'source', r.source, 'effectiveFrom', r.effective_from, 'recordedAt', r.recorded_at) order by r.recorded_at)
      from public.catalogue_rates r where r.catalogue_item_id = c.id
    ), '[]'::jsonb),
    'updatedAt', c.updated_at
  ) order by c.category, c.name), '[]'::jsonb)
  from public.catalogue_items c
$$;

-- ---------------------------------------------------------------------------
-- Save: domain JSON → rows, atomically. Rows missing from the payload are removed.
-- Approved versions and quotations are never written here.

create or replace function public.save_estimate(payload jsonb) returns timestamptz
language plpgsql security invoker set search_path = '' as $$
declare
  v_org uuid := private.current_org_id();
  v_id uuid := (payload->>'id')::uuid;
  p jsonb := payload->'project';
  c jsonb := payload->'costing';
  v_status public.estimate_status := (payload->>'status')::public.estimate_status;
  m jsonb; l jsonb; q jsonb; r jsonb; d jsonb; a jsonb; ev jsonb;
  v_mid uuid; v_lid uuid;
  i integer;
  v_query_ids uuid[] := '{}';
  v_updated timestamptz;
begin
  if v_org is null then raise exception 'You are not a member of an organisation' using errcode = '42501'; end if;
  if not private.can_write() then raise exception 'Your role is read-only' using errcode = '42501'; end if;
  if exists (select 1 from public.estimates where id = v_id and organisation_id <> v_org) then
    raise exception 'Estimate belongs to another organisation' using errcode = '42501';
  end if;
  -- "Approved"/"quoted" are set by the server when it records a version, not by a client save.
  if v_status in ('approved', 'quoted') and not exists (select 1 from public.estimate_versions where estimate_id = v_id) then
    v_status := 'draft';
  end if;

  insert into public.projects as t (id, organisation_id, name, client_name, project_type, venue, event_dates, currency, notes, estimator_name, created_by)
  values (v_id, v_org, p->>'projectName', coalesce(p->>'clientName', ''), (p->>'projectType')::public.project_type, coalesce(p->>'venue', ''),
          coalesce(p->>'eventDates', ''), c->>'currency', coalesce(p->>'notes', ''), coalesce(p->>'estimator', ''), auth.uid())
  on conflict (id) do update set name = excluded.name, client_name = excluded.client_name, project_type = excluded.project_type, venue = excluded.venue,
    event_dates = excluded.event_dates, currency = excluded.currency, notes = excluded.notes, estimator_name = excluded.estimator_name;

  insert into public.estimates as t (id, organisation_id, project_id, status, currency, pricing_mode, markup_rate, margin_rate, fixed_price, fixed_price_reason,
    overhead_mode, overhead_value, overhead_note, contingency_mode, contingency_value, contingency_note, created_by)
  values (v_id, v_org, v_id, v_status, c->>'currency', (c->'pricing'->>'mode')::public.pricing_mode, (c->'pricing'->>'markupRate')::numeric,
    (c->'pricing'->>'marginRate')::numeric, (c->'pricing'->>'fixedPrice')::numeric, coalesce(c->'pricing'->>'fixedPriceReason', ''),
    (c->'overhead'->>'mode')::public.allowance_mode, (c->'overhead'->>'value')::numeric, coalesce(c->'overhead'->>'note', ''),
    (c->'contingency'->>'mode')::public.allowance_mode, (c->'contingency'->>'value')::numeric, coalesce(c->'contingency'->>'note', ''), auth.uid())
  on conflict (id) do update set status = excluded.status, currency = excluded.currency, pricing_mode = excluded.pricing_mode,
    markup_rate = excluded.markup_rate, margin_rate = excluded.margin_rate, fixed_price = excluded.fixed_price, fixed_price_reason = excluded.fixed_price_reason,
    overhead_mode = excluded.overhead_mode, overhead_value = excluded.overhead_value, overhead_note = excluded.overhead_note,
    contingency_mode = excluded.contingency_mode, contingency_value = excluded.contingency_value, contingency_note = excluded.contingency_note;

  -- Documents (files are uploaded to Storage by the browser at {org}/{estimate}/{document}.pdf)
  for d in select value from jsonb_array_elements(coalesce(payload->'documents', '[]')) loop
    insert into public.documents as t (id, organisation_id, project_id, storage_path, file_name, mime_type, size_bytes, sha256, page_count, uploaded_by, created_at)
    values ((d->>'id')::uuid, v_org, v_id, v_org::text || '/' || v_id::text || '/' || (d->>'id') || '.pdf', d->>'fileName', 'application/pdf',
            (d->>'sizeBytes')::bigint, d->>'sha256', (d->>'pageCount')::integer, auth.uid(), coalesce((d->>'uploadedAt')::timestamptz, now()))
    on conflict (id) do update set file_name = excluded.file_name, page_count = excluded.page_count
    where t.project_id = excluded.project_id;
  end loop;
  delete from public.documents where project_id = v_id
    and id <> all (array(select (x->>'id')::uuid from jsonb_array_elements(coalesce(payload->'documents', '[]')) x));

  for a in select value from jsonb_array_elements(coalesce(payload->'analysisRuns', '[]')) loop
    continue when not exists (select 1 from public.documents where id = private.try_uuid(a->>'documentId') and project_id = v_id);
    insert into public.document_analyses as t (id, organisation_id, document_id, provider, model, status, error, summary, project_type_suggestion, measurement_count, started_at, completed_at, created_by)
    values ((a->>'id')::uuid, v_org, (a->>'documentId')::uuid, a->>'provider', a->>'model', a->>'status', a->>'error', a->>'summary',
            (a->>'projectTypeSuggestion')::public.project_type, coalesce((a->>'measurementCount')::integer, 0), (a->>'startedAt')::timestamptz,
            (a->>'completedAt')::timestamptz, auth.uid())
    on conflict (id) do update set status = excluded.status, model = excluded.model, error = excluded.error, summary = excluded.summary,
      project_type_suggestion = excluded.project_type_suggestion, measurement_count = excluded.measurement_count, completed_at = excluded.completed_at;
  end loop;

  -- Measurements, their review history and queries
  i := 0;
  for m in select value from jsonb_array_elements(coalesce(c->'measurements', '[]')) loop
    v_mid := (m->>'id')::uuid;
    insert into public.measurements as t (id, organisation_id, estimate_id, document_id, sort_order, component_name, category, length_m, width_m, height_m, depth_m,
      derivation_dims, derivation_multiplier, quantity, unit, source_page, source_labels, basis, confidence, review_status, origin, notes, assumptions)
    values (v_mid, v_org, v_id,
      (select id from public.documents where id = private.try_uuid(m->>'sourceDocumentId') and project_id = v_id),
      i, m->>'componentName', coalesce(m->>'category', ''),
      (m->'dimensions'->>'length')::numeric, (m->'dimensions'->>'width')::numeric, (m->'dimensions'->>'height')::numeric, (m->'dimensions'->>'depth')::numeric,
      case when jsonb_typeof(m->'derivation') = 'object' then private.text_array(m->'derivation'->'dims') end,
      case when jsonb_typeof(m->'derivation') = 'object' then (m->'derivation'->>'multiplier')::numeric end,
      (m->>'quantity')::numeric, (m->>'unit')::public.unit, (m->>'sourcePage')::integer, private.text_array(m->'sourceLabels'),
      (m->>'basis')::public.measurement_basis, (m->>'confidence')::public.confidence, (m->>'reviewStatus')::public.review_status,
      (m->>'origin')::public.measurement_origin, coalesce(m->>'notes', ''), private.text_array(m->'assumptions'))
    on conflict (id) do update set document_id = excluded.document_id, sort_order = excluded.sort_order, component_name = excluded.component_name,
      category = excluded.category, length_m = excluded.length_m, width_m = excluded.width_m, height_m = excluded.height_m, depth_m = excluded.depth_m,
      derivation_dims = excluded.derivation_dims, derivation_multiplier = excluded.derivation_multiplier, quantity = excluded.quantity, unit = excluded.unit,
      source_page = excluded.source_page, source_labels = excluded.source_labels, basis = excluded.basis, confidence = excluded.confidence,
      review_status = excluded.review_status, origin = excluded.origin, notes = excluded.notes, assumptions = excluded.assumptions
    where t.estimate_id = excluded.estimate_id;
    i := i + 1;

    -- Review events are append-only; a deterministic id makes re-saving the same history a no-op.
    for ev in select value from jsonb_array_elements(coalesce(m->'reviewHistory', '[]')) loop
      insert into public.measurement_reviews (id, organisation_id, measurement_id, action, reason, changes, actor, created_at)
      values (md5(v_mid::text || (ev->>'at') || (ev->>'action') || coalesce(ev->>'reason', ''))::uuid, v_org, v_mid, ev->>'action',
              coalesce(ev->>'reason', ''), ev->'changes', auth.uid(), (ev->>'at')::timestamptz)
      on conflict (id) do nothing;
    end loop;

    for q in select value from jsonb_array_elements(coalesce(m->'queries', '[]')) loop
      insert into public.estimate_queries as t (id, organisation_id, estimate_id, measurement_id, text, status, resolution, created_by, created_at, resolved_at)
      values ((q->>'id')::uuid, v_org, v_id, v_mid, q->>'text', (q->>'status')::public.query_status, q->>'resolution', auth.uid(),
              coalesce((q->>'createdAt')::timestamptz, now()), (q->>'resolvedAt')::timestamptz)
      on conflict (id) do update set text = excluded.text, status = excluded.status, resolution = excluded.resolution, resolved_at = excluded.resolved_at,
        resolved_by = case when excluded.status = 'resolved' and t.status = 'open' then auth.uid() else t.resolved_by end;
      v_query_ids := v_query_ids || (q->>'id')::uuid;
    end loop;
  end loop;

  -- Cost lines and their queries
  i := 0;
  for l in select value from jsonb_array_elements(coalesce(c->'lineItems', '[]')) loop
    v_lid := (l->>'id')::uuid;
    insert into public.line_items as t (id, organisation_id, estimate_id, sort_order, name, category, description, customer_description, cost_type, supply_basis,
      method, quantity, quantity_unit, rate, rate_unit, quantity_source, measurement_id, quantity_source_note, rate_source, catalogue_item_id, catalogue_rate_id,
      rate_verification, rate_source_note, included, notes)
    values (v_lid, v_org, v_id, i, l->>'name', coalesce(l->>'category', ''), coalesce(l->>'description', ''), l->>'customerDescription',
      (l->>'costType')::public.cost_type, (l->>'supplyBasis')::public.supply_basis, (l->>'method')::public.calculation_method,
      (l->>'quantity')::numeric, (l->>'quantityUnit')::public.unit, (l->>'rate')::numeric, (l->>'rateUnit')::public.unit,
      l->'quantitySource'->>'kind',
      (select id from public.measurements where id = private.try_uuid(l->'quantitySource'->>'measurementId') and estimate_id = v_id),
      coalesce(l->'quantitySource'->>'note', ''), l->'rateSource'->>'kind',
      (select id from public.catalogue_items where id = private.try_uuid(l->'rateSource'->>'catalogueItemId')),
      (select id from public.catalogue_rates where id = private.try_uuid(l->'rateSource'->>'catalogueRateId')),
      (l->'rateSource'->>'verification')::public.rate_verification, coalesce(l->'rateSource'->>'note', ''),
      coalesce((l->>'included')::boolean, true), coalesce(l->>'notes', ''))
    on conflict (id) do update set sort_order = excluded.sort_order, name = excluded.name, category = excluded.category, description = excluded.description,
      customer_description = excluded.customer_description, cost_type = excluded.cost_type, supply_basis = excluded.supply_basis, method = excluded.method,
      quantity = excluded.quantity, quantity_unit = excluded.quantity_unit, rate = excluded.rate, rate_unit = excluded.rate_unit,
      quantity_source = excluded.quantity_source, measurement_id = excluded.measurement_id, quantity_source_note = excluded.quantity_source_note,
      rate_source = excluded.rate_source, catalogue_item_id = excluded.catalogue_item_id, catalogue_rate_id = excluded.catalogue_rate_id,
      rate_verification = excluded.rate_verification, rate_source_note = excluded.rate_source_note, included = excluded.included, notes = excluded.notes
    where t.estimate_id = excluded.estimate_id;
    i := i + 1;

    for q in select value from jsonb_array_elements(coalesce(l->'queries', '[]')) loop
      insert into public.estimate_queries as t (id, organisation_id, estimate_id, line_item_id, text, status, resolution, created_by, created_at, resolved_at)
      values ((q->>'id')::uuid, v_org, v_id, v_lid, q->>'text', (q->>'status')::public.query_status, q->>'resolution', auth.uid(),
              coalesce((q->>'createdAt')::timestamptz, now()), (q->>'resolvedAt')::timestamptz)
      on conflict (id) do update set text = excluded.text, status = excluded.status, resolution = excluded.resolution, resolved_at = excluded.resolved_at,
        resolved_by = case when excluded.status = 'resolved' and t.status = 'open' then auth.uid() else t.resolved_by end;
      v_query_ids := v_query_ids || (q->>'id')::uuid;
    end loop;
  end loop;

  -- Estimate-level queries
  for q in select value from jsonb_array_elements(coalesce(c->'queries', '[]')) loop
    insert into public.estimate_queries as t (id, organisation_id, estimate_id, text, status, resolution, created_by, created_at, resolved_at)
    values ((q->>'id')::uuid, v_org, v_id, q->>'text', (q->>'status')::public.query_status, q->>'resolution', auth.uid(),
            coalesce((q->>'createdAt')::timestamptz, now()), (q->>'resolvedAt')::timestamptz)
    on conflict (id) do update set text = excluded.text, status = excluded.status, resolution = excluded.resolution, resolved_at = excluded.resolved_at,
      resolved_by = case when excluded.status = 'resolved' and t.status = 'open' then auth.uid() else t.resolved_by end;
    v_query_ids := v_query_ids || (q->>'id')::uuid;
  end loop;

  -- Reconciliations
  i := 0;
  for r in select value from jsonb_array_elements(coalesce(c->'reconciliations', '[]')) loop
    insert into public.reconciliations as t (id, organisation_id, estimate_id, sort_order, label, reported_total, source, explanation)
    values ((r->>'id')::uuid, v_org, v_id, i, r->>'label', (r->>'reportedTotal')::numeric, coalesce(r->>'source', ''), r->>'explanation')
    on conflict (id) do update set sort_order = excluded.sort_order, label = excluded.label, reported_total = excluded.reported_total,
      source = excluded.source, explanation = excluded.explanation
    where t.estimate_id = excluded.estimate_id;
    i := i + 1;
  end loop;

  -- Remove rows that are no longer in the estimate (queries first, then lines, then measurements)
  delete from public.estimate_queries where estimate_id = v_id and id <> all (v_query_ids);
  delete from public.line_items where estimate_id = v_id
    and id <> all (array(select (x->>'id')::uuid from jsonb_array_elements(coalesce(c->'lineItems', '[]')) x));
  delete from public.measurements where estimate_id = v_id
    and id <> all (array(select (x->>'id')::uuid from jsonb_array_elements(coalesce(c->'measurements', '[]')) x));
  delete from public.reconciliations where estimate_id = v_id
    and id <> all (array(select (x->>'id')::uuid from jsonb_array_elements(coalesce(c->'reconciliations', '[]')) x));

  update public.estimates set updated_at = now() where id = v_id returning updated_at into v_updated;
  return v_updated;
end $$;

-- ---------------------------------------------------------------------------
-- Server-only writes (approved versions, quotations). The caller must present the server key.

create or replace function public.record_approved_version(p_server_key text, p_estimate_id uuid, p_version jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := private.current_org_id();
  v_next integer;
  v_id uuid := (p_version->>'id')::uuid;
begin
  if not private.verify_server_key(p_server_key) then raise exception 'Not permitted' using errcode = '42501'; end if;
  if v_org is null or not private.can_write() then raise exception 'Not permitted' using errcode = '42501'; end if;
  if not exists (select 1 from public.estimates where id = p_estimate_id and organisation_id = v_org) then
    raise exception 'Estimate not found' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtext('approve:' || p_estimate_id::text));
  select coalesce(max(version_no), 0) + 1 into v_next from public.estimate_versions where estimate_id = p_estimate_id;
  if (p_version->>'versionNo')::integer <> v_next then
    raise exception 'Another approval was recorded first (expected v%). Reload and try again.', v_next using errcode = '40001';
  end if;

  insert into public.estimate_versions (id, organisation_id, estimate_id, version_no, snapshot, engine_version, currency, direct_cost, cost_base,
    selling_price_ex_vat, approved_by, approved_by_name, approval_note, acknowledged_warnings, approved_at)
  values (v_id, v_org, p_estimate_id, v_next, p_version, p_version->'calculation'->>'engineVersion', p_version->'costing'->>'currency',
    (p_version->'calculation'->>'directCost')::numeric, (p_version->'calculation'->>'costBase')::numeric,
    (p_version->'calculation'->>'sellingPriceExVat')::numeric, auth.uid(), p_version->>'approvedBy', coalesce(p_version->>'approvalNote', ''),
    private.text_array(p_version->'acknowledgedWarnings'), (p_version->>'approvedAt')::timestamptz);

  update public.estimates set status = 'approved' where id = p_estimate_id;
  insert into public.audit_events (organisation_id, actor, entity_type, entity_id, action, details)
  values (v_org, auth.uid(), 'estimate_version', v_id, 'approved',
          jsonb_build_object('estimateId', p_estimate_id, 'versionNo', v_next, 'sellingPriceExVat', p_version->'calculation'->>'sellingPriceExVat'));
  return v_id;
end $$;

create or replace function public.record_quotation(
  p_server_key text, p_version_id uuid, p_issue_date date, p_valid_until date, p_total_ex_vat numeric, p_settings jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := private.current_org_id();
  v_version public.estimate_versions;
  v_prefix text := coalesce(nullif(trim(p_settings->>'quotationPrefix'), ''), 'Q');
  v_stem text;
  v_seq integer;
  v_number text;
  v_id uuid := gen_random_uuid();
begin
  if not private.verify_server_key(p_server_key) then raise exception 'Not permitted' using errcode = '42501'; end if;
  if v_org is null or not private.can_write() then raise exception 'Not permitted' using errcode = '42501'; end if;
  select * into v_version from public.estimate_versions where id = p_version_id and organisation_id = v_org;
  if v_version.id is null then raise exception 'Approved version not found' using errcode = 'P0002'; end if;
  -- Defence in depth: the quoted total must be the approved version's pre-VAT price.
  if p_total_ex_vat <> v_version.selling_price_ex_vat then
    raise exception 'Quotation total does not match approved version v%', v_version.version_no using errcode = '22000';
  end if;

  perform pg_advisory_xact_lock(hashtext('quote:' || v_org::text));
  v_stem := v_prefix || '-' || extract(year from p_issue_date)::text || '-';
  select coalesce(max(nullif(substring(quote_number from length(v_stem) + 1), '')::integer), 0) + 1 into v_seq
  from public.quotations where organisation_id = v_org and quote_number like v_stem || '%' and substring(quote_number from length(v_stem) + 1) ~ '^\d+$';
  v_number := v_stem || lpad(v_seq::text, 4, '0');

  insert into public.quotations (id, organisation_id, estimate_version_id, quote_number, issue_date, valid_until, total_ex_vat, currency, settings_snapshot, created_by)
  values (v_id, v_org, p_version_id, v_number, p_issue_date, p_valid_until, p_total_ex_vat, v_version.currency, p_settings, auth.uid());

  update public.estimates set status = 'quoted' where id = v_version.estimate_id and status = 'approved';
  insert into public.audit_events (organisation_id, actor, entity_type, entity_id, action, details)
  values (v_org, auth.uid(), 'quotation', v_id, 'issued', jsonb_build_object('number', v_number, 'versionId', p_version_id, 'totalExVat', p_total_ex_vat));
  return jsonb_build_object('id', v_id, 'number', v_number, 'createdAt', now());
end $$;

-- ---------------------------------------------------------------------------
-- Execution rights: signed-in users only (never anonymous).

do $$
declare f text;
begin
  foreach f in array array[
    'public.get_app_context()', 'public.create_organisation(text, text)', 'public.add_member(text, public.member_role, text)',
    'public.list_members()', 'public.load_estimates(uuid)', 'public.load_catalogue()', 'public.save_estimate(jsonb)',
    'public.record_approved_version(text, uuid, jsonb)', 'public.record_quotation(text, uuid, date, date, numeric, jsonb)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

revoke execute on function private.verify_server_key(text) from public, anon, authenticated;
