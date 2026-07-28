-- Serialize Sheet imports per source/period so concurrent Apps Script, cron and
-- Admin requests cannot create duplicate sequence numbers or duplicate
-- snapshots. The RPC is service-role-only and does not validate business data;
-- sync-sheet still owns parsing, warnings and review status.

create or replace function public.start_vinhdanh_import_batch(
  p_source_id uuid,
  p_period_id text,
  p_source_hash text,
  p_imported_by uuid,
  p_metadata jsonb default '{}'::jsonb,
  p_allow_duplicate boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_latest public.import_batches%rowtype;
  v_batch public.import_batches%rowtype;
  v_sequence integer;
begin
  if p_source_id is null or nullif(btrim(p_period_id), '') is null or
     nullif(btrim(p_source_hash), '') is null then
    raise exception 'INVALID_IMPORT_IDENTITY' using errcode = '22023';
  end if;

  -- Transaction-scoped lock: callers for different sources/periods can still
  -- run in parallel, while retries for the same source/period are serialized.
  perform pg_advisory_xact_lock(
    hashtextextended(p_source_id::text || ':' || btrim(p_period_id), 0)
  );

  select * into v_latest
  from public.import_batches
  where source_id = p_source_id
    and period_id = btrim(p_period_id)
  order by sequence desc
  limit 1;

  -- A terminated Edge isolate must not leave the source permanently locked by
  -- an orphaned `importing` row. A later retry may recover after 15 minutes.
  if v_latest.id is not null and v_latest.status = 'importing' and
     v_latest.imported_at < now() - interval '15 minutes' then
    update public.import_batches
    set status = 'failed',
        warnings = coalesce(warnings, '[]'::jsonb) || jsonb_build_array(
          jsonb_build_object('message', 'STALE_IMPORT_RECOVERED_BY_RETRY')
        )
    where id = v_latest.id;
    v_latest.status := 'failed';
  end if;

  if not coalesce(p_allow_duplicate, false) and
     v_latest.id is not null and
     v_latest.source_hash = btrim(p_source_hash) and
     v_latest.status in (
       'importing', 'imported', 'needs_review', 'validated', 'archived'
     ) then
    return jsonb_build_object(
      'unchanged', true,
      'batch', jsonb_build_object(
        'id', v_latest.id,
        'period_id', v_latest.period_id,
        'sequence', v_latest.sequence,
        'status', v_latest.status,
        'source_hash', v_latest.source_hash
      )
    );
  end if;

  select coalesce(max(sequence), 0) + 1 into v_sequence
  from public.import_batches
  where source_id = p_source_id
    and period_id = btrim(p_period_id);

  insert into public.import_batches (
    source_id,
    period_id,
    sequence,
    status,
    source_hash,
    imported_by,
    metadata
  ) values (
    p_source_id,
    btrim(p_period_id),
    v_sequence,
    'importing',
    btrim(p_source_hash),
    p_imported_by,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning * into v_batch;

  return jsonb_build_object(
    'unchanged', false,
    'batch', jsonb_build_object(
      'id', v_batch.id,
      'period_id', v_batch.period_id,
      'sequence', v_batch.sequence,
      'status', v_batch.status,
      'source_hash', v_batch.source_hash
    )
  );
end;
$$;

revoke all on function public.start_vinhdanh_import_batch(
  uuid, text, text, uuid, jsonb, boolean
) from public, anon, authenticated;
grant execute on function public.start_vinhdanh_import_batch(
  uuid, text, text, uuid, jsonb, boolean
) to service_role;
