-- Normalize the two known pilot locations and seed the complete nine-screen demo.
-- Unknown addresses stay explicitly pending until Admin supplies authoritative data.

do $$
begin
  if exists (select 1 from public.branches where code = 'TBT125')
     and not exists (select 1 from public.branches where code = 'CN01') then
    update public.branches
    set
      code = 'CN01',
      name = 'Chi nhánh chính',
      address = '125 Trần Bình Trọng',
      metadata = metadata || '{"pilot":true,"addressConfirmed":true}'::jsonb
    where code = 'TBT125';
  end if;

  if exists (select 1 from public.branches where code = 'AC683')
     and not exists (select 1 from public.branches where code = 'CN09') then
    update public.branches
    set
      code = 'CN09',
      name = 'Chi nhánh Tân Phú',
      address = '683 Âu Cơ, Tân Phú',
      metadata = metadata || '{"addressConfirmed":true}'::jsonb
    where code = 'AC683';
  end if;
end
$$;

insert into public.branches (code, name, address, metadata)
values
  ('CN01', 'Chi nhánh chính', '125 Trần Bình Trọng', '{"pilot":true,"addressConfirmed":true}'),
  ('CN02', 'Chi nhánh 02', 'Chờ Admin cập nhật địa chỉ', '{"addressConfirmed":false}'),
  ('CN03', 'Chi nhánh 03', 'Chờ Admin cập nhật địa chỉ', '{"addressConfirmed":false}'),
  ('CN04', 'Chi nhánh 04', 'Chờ Admin cập nhật địa chỉ', '{"addressConfirmed":false}'),
  ('CN05', 'Chi nhánh 05', 'Chờ Admin cập nhật địa chỉ', '{"addressConfirmed":false}'),
  ('CN06', 'Chi nhánh 06', 'Chờ Admin cập nhật địa chỉ', '{"addressConfirmed":false}'),
  ('CN07', 'Chi nhánh 07', 'Chờ Admin cập nhật địa chỉ', '{"addressConfirmed":false}'),
  ('CN08', 'Chi nhánh 08', 'Chờ Admin cập nhật địa chỉ', '{"addressConfirmed":false}'),
  ('CN09', 'Chi nhánh Tân Phú', '683 Âu Cơ, Tân Phú', '{"addressConfirmed":true}')
on conflict (code) do update set
  name = excluded.name,
  address = excluded.address,
  metadata = public.branches.metadata || excluded.metadata,
  is_active = true;

update public.screens
set
  screen_code = 'CN01-TV01',
  name = 'TV chính - 125 Trần Bình Trọng'
where screen_code = 'TBT125-TV01'
  and not exists (select 1 from public.screens where screen_code = 'CN01-TV01');

update public.screens
set
  screen_code = 'CN09-TV01',
  name = 'TV chính - 683 Âu Cơ Tân Phú'
where screen_code = 'AC683-TV01'
  and not exists (select 1 from public.screens where screen_code = 'CN09-TV01');

insert into public.screens (
  screen_code,
  name,
  branch_id,
  device_type,
  orientation,
  resolution,
  metadata
)
select
  branch.code || '-TV01',
  case
    when branch.code = 'CN01' then 'TV chính - 125 Trần Bình Trọng'
    when branch.code = 'CN09' then 'TV chính - 683 Âu Cơ Tân Phú'
    else 'TV chính - ' || branch.name
  end,
  branch.id,
  'android_tv',
  'landscape',
  '1920x1080',
  jsonb_build_object('demoSlot', substring(branch.code from 3)::integer)
from public.branches as branch
where branch.code ~ '^CN0[1-9]$'
on conflict (screen_code) do update set
  name = excluded.name,
  branch_id = excluded.branch_id,
  device_type = excluded.device_type,
  orientation = excluded.orientation,
  resolution = excluded.resolution,
  metadata = public.screens.metadata || excluded.metadata,
  is_active = true;

insert into public.screen_state (screen_id)
select id
from public.screens
where screen_code ~ '^CN0[1-9]-TV01$'
on conflict (screen_id) do nothing;
