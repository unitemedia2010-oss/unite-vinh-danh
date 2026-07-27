-- Publish one immutable release and assign its exact TV targets atomically.
--
-- This RPC is intentionally executable only by the service_role. The
-- publish-release Edge Function authenticates the operator first and passes
-- that already-authenticated user's id as p_actor_id.

create or replace function public.publish_vinhdanh_release(
  p_release_id uuid,
  p_actor_id uuid,
  p_activate_at timestamptz default null,
  p_target_scope text default 'all',
  p_screen_ids uuid[] default null,
  p_branch_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_release public.releases%rowtype;
  v_import_status text;
  v_scope text := lower(coalesce(nullif(btrim(p_target_scope), ''), 'all'));
  v_requested_screen_ids uuid[];
  v_requested_branch_ids uuid[];
  v_active_branch_ids uuid[];
  v_target_branch_ids uuid[];
  v_target_ids uuid[];
  v_activate_at timestamptz;
  v_target_config jsonb;
  v_updated_count integer;
begin
  if p_actor_id is null or not exists (
    select 1
    from public.vinhdanh_profiles as profile
    where profile.id = p_actor_id
      and profile.role in ('super_admin', 'admin', 'publisher')
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'ACTOR_NOT_AUTHORIZED';
  end if;

  select release_row.*
  into v_release
  from public.releases as release_row
  where release_row.id = p_release_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'RELEASE_NOT_FOUND';
  end if;

  if v_release.status <> 'ready' then
    raise exception using
      errcode = 'P0001',
      message = 'RELEASE_NOT_READY',
      detail = format('Current status: %s', v_release.status);
  end if;

  if v_release.import_batch_id is not null then
    select batch.status
    into v_import_status
    from public.import_batches as batch
    where batch.id = v_release.import_batch_id
    for share;

    if not found then
      raise exception using
        errcode = 'P0001',
        message = 'IMPORT_BATCH_NOT_FOUND';
    end if;

    if v_import_status <> 'validated' then
      raise exception using
        errcode = 'P0001',
        message = 'IMPORT_BATCH_NOT_VALIDATED',
        detail = format('Current status: %s', v_import_status);
    end if;
  end if;

  if array_position(coalesce(p_screen_ids, '{}'::uuid[]), null) is not null
    or array_position(coalesce(p_branch_ids, '{}'::uuid[]), null) is not null
  then
    raise exception using
      errcode = 'P0001',
      message = 'TARGET_IDS_CONTAIN_NULL';
  end if;

  select array(
    select distinct requested.id
    from unnest(coalesce(p_screen_ids, '{}'::uuid[])) as requested(id)
    order by requested.id
  )
  into v_requested_screen_ids;

  select array(
    select distinct requested.id
    from unnest(coalesce(p_branch_ids, '{}'::uuid[])) as requested(id)
    order by requested.id
  )
  into v_requested_branch_ids;

  if v_scope = 'all' then
    if cardinality(v_requested_screen_ids) > 0 or cardinality(v_requested_branch_ids) > 0 then
      raise exception using
        errcode = 'P0001',
        message = 'TARGET_SCOPE_MISMATCH';
    end if;

    select coalesce(array_agg(screen.id order by screen.id), '{}'::uuid[])
    into v_target_ids
    from public.screens as screen
    where screen.is_active;

    v_target_config := jsonb_build_object('scope', 'all');
  elsif v_scope = 'screenids' then
    if cardinality(v_requested_screen_ids) = 0 or cardinality(v_requested_branch_ids) > 0 then
      raise exception using
        errcode = 'P0001',
        message = 'TARGET_SCOPE_MISMATCH';
    end if;

    select coalesce(array_agg(screen.id order by screen.id), '{}'::uuid[])
    into v_target_ids
    from public.screens as screen
    where screen.is_active
      and screen.id = any(v_requested_screen_ids);

    -- Never silently publish to only a subset of an explicitly requested list.
    if cardinality(v_target_ids) <> cardinality(v_requested_screen_ids) then
      raise exception using
        errcode = 'P0001',
        message = 'TARGET_SCREEN_NOT_ACTIVE';
    end if;

    v_target_config := jsonb_build_object(
      'scope', 'screenIds',
      'screenIds', to_jsonb(v_target_ids)
    );
  elsif v_scope = 'branchids' then
    if cardinality(v_requested_branch_ids) = 0 or cardinality(v_requested_screen_ids) > 0 then
      raise exception using
        errcode = 'P0001',
        message = 'TARGET_SCOPE_MISMATCH';
    end if;

    select coalesce(array_agg(branch.id order by branch.id), '{}'::uuid[])
    into v_active_branch_ids
    from public.branches as branch
    where branch.is_active
      and branch.id = any(v_requested_branch_ids);

    if cardinality(v_active_branch_ids) <> cardinality(v_requested_branch_ids) then
      raise exception using
        errcode = 'P0001',
        message = 'TARGET_BRANCH_NOT_ACTIVE';
    end if;

    select
      coalesce(array_agg(screen.id order by screen.id), '{}'::uuid[]),
      coalesce(array_agg(distinct screen.branch_id), '{}'::uuid[])
    into v_target_ids, v_target_branch_ids
    from public.screens as screen
    where screen.is_active
      and screen.branch_id = any(v_requested_branch_ids);

    -- An explicit branch list is exact: every selected branch must currently
    -- contain at least one active screen.
    if cardinality(v_target_branch_ids) <> cardinality(v_requested_branch_ids) then
      raise exception using
        errcode = 'P0001',
        message = 'TARGET_BRANCH_WITHOUT_ACTIVE_SCREEN';
    end if;

    v_target_config := jsonb_build_object(
      'scope', 'branchIds',
      'branchIds', to_jsonb(v_requested_branch_ids)
    );
  else
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_TARGET_SCOPE';
  end if;

  if cardinality(v_target_ids) = 0 then
    raise exception using
      errcode = 'P0001',
      message = 'NO_TARGET_SCREENS';
  end if;

  -- Preserve a schedule already chosen while creating the READY release unless
  -- the publish request deliberately overrides it.
  v_activate_at := coalesce(p_activate_at, v_release.activate_at, now() + interval '30 seconds');

  -- Clean up any partial rows left by the former multi-request publisher so
  -- this release has exactly the selected target set.
  update public.screen_state
  set desired_release_id = null
  where desired_release_id = p_release_id
    and not (screen_id = any(v_target_ids));

  delete from public.release_targets
  where release_id = p_release_id
    and not (screen_id = any(v_target_ids));

  insert into public.release_targets (
    release_id,
    screen_id,
    delivery_status,
    last_error,
    ready_at,
    activated_at
  )
  select
    p_release_id,
    target.screen_id,
    'pending',
    null,
    null,
    null
  from unnest(v_target_ids) as target(screen_id)
  on conflict (release_id, screen_id) do update
  set
    delivery_status = excluded.delivery_status,
    last_error = null,
    ready_at = null,
    activated_at = null;

  insert into public.screen_state (screen_id, desired_release_id)
  select target.screen_id, p_release_id
  from unnest(v_target_ids) as target(screen_id)
  on conflict (screen_id) do update
  set desired_release_id = excluded.desired_release_id;

  update public.releases
  set
    status = 'published',
    activate_at = v_activate_at,
    target_config = v_target_config,
    published_at = now(),
    published_by = p_actor_id
  where id = p_release_id
    and status = 'ready';

  get diagnostics v_updated_count = row_count;
  if v_updated_count <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'RELEASE_STATE_CHANGED';
  end if;

  return jsonb_build_object(
    'releaseId', v_release.id,
    'releaseVersion', v_release.release_version,
    'activateAt', v_activate_at,
    'targetScope', v_target_config,
    'targetScreenIds', to_jsonb(v_target_ids),
    'targets', cardinality(v_target_ids)
  );
end;
$$;

revoke all on function public.publish_vinhdanh_release(
  uuid,
  uuid,
  timestamptz,
  text,
  uuid[],
  uuid[]
) from public, anon, authenticated;

grant execute on function public.publish_vinhdanh_release(
  uuid,
  uuid,
  timestamptz,
  text,
  uuid[],
  uuid[]
) to service_role;
