-- Performance follow-up from the Supabase advisors.

-- Indexes for foreign keys used by RLS filters, joins and cascades.
create index if not exists catalogue_rates_org_idx on public.catalogue_rates (organisation_id);
create index if not exists costing_rules_org_idx on public.costing_rules (organisation_id);
create index if not exists document_analyses_org_idx on public.document_analyses (organisation_id);
create index if not exists documents_org_idx on public.documents (organisation_id);
create index if not exists estimate_queries_org_idx on public.estimate_queries (organisation_id);
create index if not exists estimate_queries_line_idx on public.estimate_queries (line_item_id);
create index if not exists estimate_queries_measurement_idx on public.estimate_queries (measurement_id);
create index if not exists estimate_versions_org_idx on public.estimate_versions (organisation_id);
create index if not exists line_items_org_idx on public.line_items (organisation_id);
create index if not exists line_items_measurement_idx on public.line_items (measurement_id);
create index if not exists line_items_catalogue_item_idx on public.line_items (catalogue_item_id);
create index if not exists line_items_catalogue_rate_idx on public.line_items (catalogue_rate_id);
create index if not exists measurement_reviews_org_idx on public.measurement_reviews (organisation_id);
create index if not exists measurements_org_idx on public.measurements (organisation_id);
create index if not exists measurements_document_idx on public.measurements (document_id);
create index if not exists quotations_version_idx on public.quotations (estimate_version_id);
create index if not exists reconciliations_org_idx on public.reconciliations (organisation_id);

-- "FOR ALL" admin policies also applied to SELECT, duplicating the member read policy.
-- Replace each with separate insert/update/delete policies.
do $$
declare
  t record;
begin
  for t in select * from (values
    ('catalogue_items', 'admins write catalogue'),
    ('company_settings', 'admins write settings'),
    ('costing_rules', 'admins write rules')
  ) as x(tbl, pol) loop
    execute format('drop policy %I on public.%I', t.pol, t.tbl);
    execute format('create policy "admins insert %1$s" on public.%1$I for insert to authenticated with check (organisation_id = (select private.current_org_id()) and (select private.is_admin()))', t.tbl);
    execute format('create policy "admins update %1$s" on public.%1$I for update to authenticated using (organisation_id = (select private.current_org_id()) and (select private.is_admin())) with check (organisation_id = (select private.current_org_id()))', t.tbl);
    execute format('create policy "admins delete %1$s" on public.%1$I for delete to authenticated using (organisation_id = (select private.current_org_id()) and (select private.is_admin()))', t.tbl);
  end loop;
end $$;
