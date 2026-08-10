-- RPC: set_screen_visual_mode(screen_id, visual_mode)
-- Chỉ Admin/Super Admin, merge vào metadata.presentation, audit log, không tạo bảng mới.
create or replace function public.set_screen_visual_mode(
  p_screen_id uuid,
  p_visual_mode text
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_visual_mode text;
  v_old_metadata jsonb;
  v_old_presentation jsonb;
  v_new_metadata jsonb;
begin
  if v_actor_id is null or not exists (
    select 1
    from public.vinhdanh_profiles
    where id = v_actor_id
      and role in ('super_admin', 'admin')
  ) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  v_visual_mode := lower(btrim(coalesce(p_visual_mode, '')));
  if v_visual_mode not in ('lite', 'standard', 'ultra') then
    raise exception using errcode = '22023', message = 'INVALID_VISUAL_MODE';
  end if;

  if p_screen_id is null then
    raise exception using errcode = '22023', message = 'INVALID_SCREEN_ID';
  end if;

  -- Khóa bản ghi để hai Admin không ghi đè metadata của nhau.
  select metadata
  into v_old_metadata
  from public.screens
  where id = p_screen_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'SCREEN_NOT_FOUND';
  end if;

  v_old_metadata := coalesce(v_old_metadata, '{}'::jsonb);
  if jsonb_typeof(v_old_metadata) <> 'object' then
    raise exception using errcode = '22023', message = 'INVALID_SCREEN_METADATA';
  end if;

  if v_old_metadata ? 'presentation' then
    if jsonb_typeof(v_old_metadata -> 'presentation') <> 'object' then
      raise exception using errcode = '22023', message = 'INVALID_SCREEN_PRESENTATION';
    end if;
    v_old_presentation := v_old_metadata -> 'presentation';
  else
    v_old_presentation := '{}'::jsonb;
  end if;

  -- Chỉ thay visualMode, giữ nguyên mọi metadata và presentation key khác.
  v_new_metadata := jsonb_set(
    v_old_metadata,
    '{presentation}',
    v_old_presentation || jsonb_build_object('visualMode', v_visual_mode),
    true
  );

  update public.screens
  set metadata = v_new_metadata
  where id = p_screen_id;

  insert into public.audit_logs (
    actor_id,
    action,
    entity_type,
    entity_id,
    before_data,
    after_data,
    metadata
  )
  values (
    v_actor_id,
    'screen.set_visual_mode',
    'screen',
    p_screen_id::text,
    jsonb_build_object('presentation', v_old_metadata -> 'presentation'),
    jsonb_build_object('presentation', v_new_metadata -> 'presentation'),
    jsonb_build_object('visualMode', v_visual_mode)
  );
end;
$$;

revoke execute on function public.set_screen_visual_mode(uuid, text) from public, anon, authenticated;
grant execute on function public.set_screen_visual_mode(uuid, text) to authenticated;
