alter table public.rayon_members
  drop constraint rayon_members_role_check,
  add constraint rayon_members_role_check check (role in ('manager', 'admin', 'employee'));

create table public.published_visit_layout (
  id integer primary key check (id = 1),
  revision bigint not null check (revision >= 0),
  layout jsonb,
  published_at timestamptz,
  check ((revision = 0 and layout is null and published_at is null) or
         (revision > 0 and layout is not null and published_at is not null))
);

insert into public.published_visit_layout (id, revision) values (1, 0);

alter table public.published_visit_layout enable row level security;
revoke all on public.published_visit_layout from public, anon, authenticated;
grant select on public.published_visit_layout to anon, authenticated;
grant all on public.published_visit_layout to service_role;

create policy "Visitors read the published layout"
  on public.published_visit_layout for select to anon, authenticated using (true);

create function public.publish_visit_layout(expected_revision bigint, snapshot jsonb)
returns public.published_visit_layout
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.published_visit_layout;
begin
  if not exists (
    select 1 from public.rayon_members
    where user_id = (select auth.uid()) and role in ('manager', 'admin')
  ) then
    raise insufficient_privilege using message = 'Visit publisher membership is required';
  end if;

  if expected_revision is null or expected_revision < 0 or snapshot is null or
     octet_length(snapshot::text) > 1000000 or
     jsonb_typeof(snapshot) is distinct from 'object' or
     snapshot->>'format' is distinct from 'rayon74-visit-layout' or
     snapshot->'version' is distinct from '1'::jsonb or
     jsonb_typeof(snapshot->'sceneRevision') is distinct from 'number' or
     snapshot->>'sceneRevision' !~ '^[0-9]{1,9}$' or
     jsonb_typeof(snapshot->'fixtures') is distinct from 'object' or
     jsonb_typeof(snapshot->'crates') is distinct from 'object' or
     jsonb_typeof(snapshot->'copies') is distinct from 'object' or
     (snapshot ? 'christmas' and jsonb_typeof(snapshot->'christmas') is distinct from 'array') then
    raise invalid_parameter_value using message = 'Invalid visit layout';
  end if;

  if snapshot - array['format', 'version', 'sceneRevision', 'fixtures', 'crates', 'copies', 'christmas'] <> '{}'::jsonb or
     (select count(*) from jsonb_object_keys(snapshot->'fixtures')) > 1024 or
     (select count(*) from jsonb_object_keys(snapshot->'crates')) > 1024 or
     (select count(*) from jsonb_object_keys(snapshot->'copies')) > 512 or
     coalesce(jsonb_array_length(snapshot->'christmas'), 0) > 4000 then
    raise invalid_parameter_value using message = 'Invalid visit layout';
  end if;

  update public.published_visit_layout
  set layout = snapshot, revision = revision + 1, published_at = clock_timestamp()
  where id = 1 and revision = expected_revision
  returning * into result;
  if found then return result; end if;

  -- Allow retrying the same publication after a lost response.
  select * into result from public.published_visit_layout
  where id = 1 and revision - 1 = expected_revision and layout = snapshot;
  if found then return result; end if;

  raise sqlstate 'PT409' using message = 'The published visit layout has changed';
end;
$$;

revoke execute on function public.publish_visit_layout(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.publish_visit_layout(bigint, jsonb) to authenticated;
