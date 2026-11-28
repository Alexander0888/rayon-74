begin;

do $$
declare
  manager_id uuid := gen_random_uuid();
  admin_id uuid := gen_random_uuid();
  employee_id uuid := gen_random_uuid();
  first_layout jsonb := '{"format":"rayon74-visit-layout","version":1,"sceneRevision":1,
    "fixtures":{"fence-15":{"x":3,"z":4,"yaw":0}},"crates":{},"copies":{}}';
  second_layout jsonb := jsonb_set(first_layout, '{fixtures,fence-15,x}', '5');
  starting_revision bigint;
  saved public.published_visit_layout;
begin
  select revision into strict starting_revision from public.published_visit_layout where id = 1;
  insert into auth.users (id) values (manager_id), (admin_id), (employee_id);
  insert into public.rayon_members (user_id, role)
  values (manager_id, 'manager'), (admin_id, 'admin'), (employee_id, 'employee');

  set local role anon;
  if not exists (select 1 from public.published_visit_layout where id = 1) then
    raise exception 'Anonymous visitors must be able to read the map';
  end if;
  begin
    perform public.publish_visit_layout(starting_revision, first_layout);
    raise exception 'Anonymous guests must not be able to publish';
  exception when insufficient_privilege then null;
  end;
  reset role;

  perform set_config('request.jwt.claim.sub', employee_id::text, true);
  set local role authenticated;
  begin
    perform public.publish_visit_layout(starting_revision, first_layout);
    raise exception 'Employees must not be able to publish';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claim.sub', manager_id::text, true);
  begin
    update public.published_visit_layout set layout = first_layout where id = 1;
    raise exception 'A manager must publish through the revision-checked function';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.publish_visit_layout(starting_revision, '{}'::jsonb);
    raise exception 'A malformed snapshot must be rejected';
  exception when invalid_parameter_value then null;
  end;
  saved := public.publish_visit_layout(starting_revision, first_layout);
  if saved.revision <> starting_revision + 1 or saved.layout <> first_layout then
    raise exception 'The manager publication must update the layout and revision';
  end if;
  saved := public.publish_visit_layout(starting_revision, first_layout);
  if saved.revision <> starting_revision + 1 then
    raise exception 'Retrying the same publication must keep its revision';
  end if;

  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  begin
    perform public.publish_visit_layout(starting_revision, second_layout);
    raise exception 'An older draft must not overwrite a newer publication';
  exception when sqlstate 'PT409' then null;
  end;
  saved := public.publish_visit_layout(starting_revision + 1, second_layout);
  if saved.revision <> starting_revision + 2 then
    raise exception 'An administrator must be able to publish';
  end if;
  reset role;

  set local role anon;
  if not exists (select 1 from public.published_visit_layout where id = 1 and layout = second_layout) then
    raise exception 'A new visit must receive the latest publication';
  end if;
end;
$$;

rollback;
