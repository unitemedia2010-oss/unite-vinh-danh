-- Automatically turn one validated Sheet batch into an immutable release.
--
-- Presentation is cloned from the latest company-wide published release so
-- Admin-owned order, timings, backgrounds, logos, videos and announcements are
-- preserved. Only recognition_board payloads are rebuilt from award_results.
-- The function is service-role-only and transactional: any error leaves the
-- previous desired/public release untouched.

create or replace function public.vinhdanh_manifest_board_code(p_item jsonb)
returns text
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select case coalesce(
    p_item->'web_config'->>'boardId',
    p_item->'recognition_board'->>'board_id',
    p_item->'recognition_board'->>'boardCode'
  )
    when 'manager-thong-soai' then 'QLCN_THONG_SOAI'
    when 'manager-dai-tuong' then 'QLCN_DAI_TUONG'
    when 'manager-thu-linh' then 'QLCN_THU_LINH'
    when 'leader-ky-lan' then 'LEADER_KY_LAN'
    when 'leader-phuong-hoang' then 'LEADER_PHUONG_HOANG'
    when 'leader-su-tu' then 'LEADER_SU_TU'
    when 'sale-fulltime' then 'SALE_FULL_TIME'
    when 'sale-parttime' then 'SALE_PART_TIME'
    when 'team-ranking' then 'TEAM_RANKING'
    else null
  end;
$$;

revoke all on function public.vinhdanh_manifest_board_code(jsonb)
  from public, anon, authenticated;

create or replace function public.auto_publish_vinhdanh_import_batch(
  p_batch_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_batch public.import_batches%rowtype;
  v_parent public.releases%rowtype;
  v_release public.releases%rowtype;
  v_release_version text;
  v_period_label text;
  v_playlist jsonb;
  v_manifest jsonb;
  v_target_ids uuid[];
  v_award_count integer;
  v_review_count integer;
  v_activate_at timestamptz := clock_timestamp() + interval '30 seconds';
  v_updated_at text := to_char(
    clock_timestamp() at time zone 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  );
begin
  if p_batch_id is null then
    raise exception using errcode = '22023', message = 'BATCH_ID_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(
    -- Releases are a single company-wide stream. Serialize different batches
    -- too, otherwise two simultaneous sources could choose the same parent and
    -- race while advancing screen_state.
    hashtextextended('vinhdanh:auto-release:all', 0)
  );

  select batch.*
  into v_batch
  from public.import_batches as batch
  where batch.id = p_batch_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'IMPORT_BATCH_NOT_FOUND';
  end if;
  if v_batch.status <> 'validated' then
    raise exception using
      errcode = 'P0001',
      message = 'IMPORT_BATCH_NOT_VALIDATED',
      detail = format('Current status: %s', v_batch.status);
  end if;

  -- Idempotent retries (Apps Script, cron or a recovered Edge isolate) reuse
  -- the exact release already published for this immutable batch.
  select release_row.*
  into v_release
  from public.releases as release_row
  where release_row.import_batch_id = p_batch_id
    and release_row.status = 'published'
    and coalesce(release_row.target_config->>'scope', 'all') = 'all'
  order by release_row.published_at desc nulls last
  limit 1;

  if found then
    select coalesce(array_agg(target.screen_id order by target.screen_id), '{}'::uuid[])
    into v_target_ids
    from public.release_targets as target
    where target.release_id = v_release.id;

    return jsonb_build_object(
      'unchanged', true,
      'releaseId', v_release.id,
      'releaseVersion', v_release.release_version,
      'activateAt', coalesce(v_release.activate_at, v_release.published_at),
      'targetScreenIds', to_jsonb(v_target_ids),
      'targets', cardinality(v_target_ids)
    );
  end if;

  select count(*), count(*) filter (where result.needs_review)
  into v_award_count, v_review_count
  from public.award_results as result
  where result.batch_id = p_batch_id;

  if v_award_count = 0 then
    raise exception using errcode = 'P0001', message = 'NO_SAFE_AWARD_RESULTS';
  end if;
  if v_review_count > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'AWARD_RESULTS_NEED_REVIEW',
      detail = format('%s result(s) are still marked needs_review', v_review_count);
  end if;
  if exists (
    select 1
    from public.award_results as result
    where result.batch_id = p_batch_id
      and (
        nullif(btrim(result.display_name), '') is null
        or result.revenue_vnd is null
        or result.revenue_vnd <= 0
      )
  ) then
    raise exception using errcode = 'P0001', message = 'UNSAFE_AWARD_RESULT';
  end if;

  select release_row.*
  into v_parent
  from public.releases as release_row
  where release_row.status = 'published'
    and coalesce(release_row.target_config->>'scope', 'all') = 'all'
    and release_row.manifest->>'schema' = 'unite-vinhdanh-release'
    and case
      when jsonb_typeof(release_row.manifest->'playlist') = 'array'
        then jsonb_array_length(release_row.manifest->'playlist') > 0
      else false
    end
  order by release_row.published_at desc nulls last, release_row.created_at desc
  limit 1
  for share;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'NO_PUBLISHED_PRESENTATION_TEMPLATE';
  end if;

  v_period_label := case
    when v_batch.period_id ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
      'Tháng ' || (substring(v_batch.period_id from 6 for 2)::integer)::text ||
      '/' || substring(v_batch.period_id from 1 for 4)
    else v_batch.period_id
  end;
  v_release_version := 'AUTO-' || replace(v_batch.period_id, '-', '.') ||
    '-B' || lpad(v_batch.sequence::text, 4, '0') || '-' ||
    left(v_batch.source_hash, 8);

  select coalesce(jsonb_agg(
    case
      when lower(coalesce(item.value->>'kind', item.value->>'type', '')) = 'recognition'
      then item.value || jsonb_build_object(
        'recognition_board',
        coalesce(item.value->'recognition_board', '{}'::jsonb) ||
        jsonb_build_object(
          'period_label', v_period_label,
          'period_id', v_batch.period_id,
          'import_batch_id', v_batch.id,
          'boardCode', public.vinhdanh_manifest_board_code(item.value),
          'category_label', coalesce(
            (
              select board.name
              from public.award_boards as board
              where board.code = public.vinhdanh_manifest_board_code(item.value)
              limit 1
            ),
            item.value->'recognition_board'->>'category_label',
            item.value->>'title',
            'Vinh danh'
          ),
          'entries', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'rank', result.rank,
                'employee_id', coalesce(result.entity_code, 'ROW') || ':' ||
                  coalesce(result.branch_code, '') || ':' || result.rank::text,
                'name', result.display_name,
                'short_name', regexp_replace(
                  btrim(result.display_name),
                  '^.*\s+(\S+\s+\S+)$',
                  '\1'
                ),
                'role', coalesce(result.role_label, ''),
                'team', coalesce(result.team_code, result.role_label, ''),
                'branch', coalesce(result.branch_code, ''),
                'revenue', result.revenue_vnd,
                'display_revenue', coalesce(result.display_revenue, ''),
                'photo_path', coalesce(result.photo_path, '')
              )
              order by result.rank
            )
            from public.award_results as result
            join public.award_boards as board on board.id = result.board_id
            where result.batch_id = p_batch_id
              and board.code = public.vinhdanh_manifest_board_code(item.value)
          ), '[]'::jsonb)
        )
      )
      else item.value
    end
    order by item.ordinality
  ), '[]'::jsonb)
  into v_playlist
  from jsonb_array_elements(v_parent.manifest->'playlist')
    with ordinality as item(value, ordinality);

  if jsonb_array_length(v_playlist) = 0 then
    raise exception using errcode = 'P0001', message = 'EMPTY_PRESENTATION_TEMPLATE';
  end if;

  v_manifest := v_parent.manifest || jsonb_build_object(
    'schema', 'unite-vinhdanh-release',
    'schema_version', 1,
    'version', v_release_version,
    'period_label', v_period_label,
    'period_id', v_batch.period_id,
    'import_batch_id', v_batch.id,
    'web_playlist', coalesce(v_parent.manifest->'web_playlist', '{}'::jsonb) ||
      jsonb_build_object('updatedAt', v_updated_at),
    'playlist', v_playlist
  );

  insert into public.releases (
    release_version,
    period_id,
    import_batch_id,
    playlist_id,
    parent_release_id,
    status,
    activate_at,
    manifest,
    target_config,
    created_by
  ) values (
    v_release_version,
    v_batch.period_id,
    v_batch.id,
    v_parent.playlist_id,
    v_parent.id,
    'ready',
    v_activate_at,
    v_manifest,
    '{"scope":"all","mode":"automatic","dataSource":"validated-sheet"}'::jsonb,
    null
  )
  returning * into v_release;

  select coalesce(array_agg(screen.id order by screen.id), '{}'::uuid[])
  into v_target_ids
  from public.screens as screen
  where screen.is_active;

  if cardinality(v_target_ids) = 0 then
    raise exception using errcode = 'P0001', message = 'NO_TARGET_SCREENS';
  end if;

  insert into public.release_targets (
    release_id,
    screen_id,
    delivery_status,
    last_error,
    ready_at,
    activated_at
  )
  select v_release.id, target.screen_id, 'pending', null, null, null
  from unnest(v_target_ids) as target(screen_id);

  insert into public.screen_state (screen_id, desired_release_id)
  select target.screen_id, v_release.id
  from unnest(v_target_ids) as target(screen_id)
  on conflict (screen_id) do update
  set desired_release_id = excluded.desired_release_id;

  update public.releases
  set
    status = 'published',
    published_at = clock_timestamp(),
    published_by = null
  where id = v_release.id
    and status = 'ready'
  returning * into v_release;

  if not found then
    raise exception using errcode = 'P0001', message = 'RELEASE_STATE_CHANGED';
  end if;

  insert into public.audit_logs (
    actor_id,
    action,
    entity_type,
    entity_id,
    after_data,
    metadata
  ) values (
    null,
    'release.auto_publish',
    'release',
    v_release.id::text,
    jsonb_build_object(
      'releaseVersion', v_release.release_version,
      'periodId', v_batch.period_id,
      'importBatchId', v_batch.id,
      'parentReleaseId', v_parent.id,
      'targetScreenIds', to_jsonb(v_target_ids)
    ),
    jsonb_build_object(
      'automatic', true,
      'targetCount', cardinality(v_target_ids),
      'presentationMode', 'clone-last-published-replace-recognition'
    )
  );

  return jsonb_build_object(
    'unchanged', false,
    'releaseId', v_release.id,
    'releaseVersion', v_release.release_version,
    'activateAt', v_release.activate_at,
    'targetScreenIds', to_jsonb(v_target_ids),
    'targets', cardinality(v_target_ids)
  );
end;
$$;

revoke all on function public.auto_publish_vinhdanh_import_batch(uuid)
  from public, anon, authenticated;
grant execute on function public.auto_publish_vinhdanh_import_batch(uuid)
  to service_role;

comment on function public.auto_publish_vinhdanh_import_batch(uuid) is
  'Atomically clones the last published presentation, injects one validated Sheet batch and publishes it to all active screens.';
