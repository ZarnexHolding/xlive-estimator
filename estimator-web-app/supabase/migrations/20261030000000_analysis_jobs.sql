-- Background AI analysis jobs.
--
-- Drawing analysis takes minutes, longer than a synchronous request may run on free hosting.
-- The app server creates a job for the signed-in editor; a background worker (a Netlify
-- Background Function, or the app process itself in development and self-hosting) runs it and
-- records the validated result. The browser polls the job and imports the measurements for review.
--
-- Jobs are written only through the functions below, which require the server key; members of
-- the organisation can read their own jobs. A job is deleted with its document.

create table public.analysis_jobs (
  id uuid primary key,
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  document_id uuid not null references public.documents (id) on delete cascade,
  document_sha256 char(64) not null,
  model text not null,
  -- Fingerprint of the extraction prompt: a stored result is reused only for the same prompt.
  prompt_id text not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed')),
  -- { result, model, warnings }, validated by the worker before it is stored.
  output jsonb,
  error_code text,
  error_message text,
  retryable boolean not null default false,
  input_tokens integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  -- True when an earlier result for the same file, model and prompt was reused (no AI call).
  reused boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  check (status <> 'succeeded' or output is not null)
);
create index analysis_jobs_org_idx on public.analysis_jobs (organisation_id);
create index analysis_jobs_document_idx on public.analysis_jobs (document_id);
create index analysis_jobs_created_by_idx on public.analysis_jobs (created_by);
create index analysis_jobs_reuse_idx on public.analysis_jobs (organisation_id, document_sha256, model, prompt_id, finished_at desc)
  where status = 'succeeded';

alter table public.analysis_jobs enable row level security;
create policy "members read analysis jobs" on public.analysis_jobs
  for select to authenticated using (organisation_id = (select private.current_org_id()));

-- Called by the app server as the signed-in editor. Returns 'queued', or 'succeeded' when an
-- earlier result was reused (unless p_force).
create or replace function public.create_analysis_job(
  p_server_key text, p_job_id uuid, p_estimate_id uuid, p_document_id uuid, p_model text, p_prompt_id text, p_force boolean
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := private.current_org_id();
  v_sha char(64);
  v_prior public.analysis_jobs;
  v_status text;
begin
  if not private.verify_server_key(p_server_key) then raise exception 'Not permitted' using errcode = '42501'; end if;
  if v_org is null or not private.can_write() then raise exception 'Not permitted' using errcode = '42501'; end if;
  select sha256 into v_sha from public.documents where id = p_document_id and project_id = p_estimate_id and organisation_id = v_org;
  if v_sha is null then raise exception 'Document not found' using errcode = 'P0002'; end if;

  if not p_force then
    select * into v_prior from public.analysis_jobs
    where organisation_id = v_org and document_sha256 = v_sha and model = p_model and prompt_id = p_prompt_id and status = 'succeeded'
    order by finished_at desc limit 1;
  end if;
  v_status := case when v_prior.id is null then 'queued' else 'succeeded' end;

  insert into public.analysis_jobs (id, organisation_id, document_id, document_sha256, model, prompt_id, status, output, reused, created_by, started_at, finished_at)
  values (p_job_id, v_org, p_document_id, v_sha, p_model, p_prompt_id, v_status, v_prior.output, v_prior.id is not null, auth.uid(),
          case when v_prior.id is not null then now() end, case when v_prior.id is not null then now() end);

  insert into public.audit_events (organisation_id, actor, entity_type, entity_id, action, details)
  values (v_org, auth.uid(), 'analysis_job', p_job_id, case when v_prior.id is null then 'requested' else 'reused' end,
          jsonb_build_object('documentId', p_document_id, 'model', p_model, 'promptId', p_prompt_id));
  return v_status;
end $$;

-- Called by the background worker (no user session). Marks a queued job running and returns what
-- the worker needs, or null when the job is not queued (already claimed, finished or unknown),
-- so a retried invocation never runs the same analysis twice.
create or replace function public.claim_analysis_job(p_server_key text, p_job_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_job public.analysis_jobs;
  v_doc public.documents;
begin
  if not private.verify_server_key(p_server_key) then raise exception 'Not permitted' using errcode = '42501'; end if;
  update public.analysis_jobs set status = 'running', started_at = now()
  where id = p_job_id and status = 'queued'
  returning * into v_job;
  if v_job.id is null then return null; end if;
  select * into v_doc from public.documents where id = v_job.document_id;
  return jsonb_build_object('id', v_job.id, 'fileName', v_doc.file_name, 'pageCount', v_doc.page_count, 'sizeBytes', v_doc.size_bytes, 'sha256', v_job.document_sha256);
end $$;

-- Called by the worker, or by the app server when dispatch fails. Only an unfinished job changes.
create or replace function public.finish_analysis_job(
  p_server_key text, p_job_id uuid, p_output jsonb, p_error_code text, p_error_message text, p_retryable boolean,
  p_input_tokens integer, p_output_tokens integer
) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not private.verify_server_key(p_server_key) then raise exception 'Not permitted' using errcode = '42501'; end if;
  update public.analysis_jobs set
    status = case when p_output is not null then 'succeeded' else 'failed' end,
    output = p_output,
    error_code = case when p_output is null then left(coalesce(p_error_code, 'upstream'), 40) end,
    error_message = case when p_output is null then left(coalesce(p_error_message, 'The analysis failed.'), 500) end,
    retryable = p_output is null and coalesce(p_retryable, false),
    input_tokens = p_input_tokens,
    output_tokens = p_output_tokens,
    finished_at = now()
  where id = p_job_id and status in ('queued', 'running');
  return found;
end $$;

revoke execute on function public.create_analysis_job(text, uuid, uuid, uuid, text, text, boolean) from public, anon;
grant execute on function public.create_analysis_job(text, uuid, uuid, uuid, text, text, boolean) to authenticated;
-- The worker has no user session; these two are protected by the server key instead.
revoke execute on function public.claim_analysis_job(text, uuid) from public;
revoke execute on function public.finish_analysis_job(text, uuid, jsonb, text, text, boolean, integer, integer) from public;
grant execute on function public.claim_analysis_job(text, uuid) to anon, authenticated;
grant execute on function public.finish_analysis_job(text, uuid, jsonb, text, text, boolean, integer, integer) to anon, authenticated;
