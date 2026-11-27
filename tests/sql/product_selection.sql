-- Draft AC5. The active project is an owner-scoped preference, independent of research records.
set role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-4000-8000-000000000001',false);
do $$
declare
  me text:=current_setting('request.jwt.claim.sub'); other_user text:='bbbbbbbb-0000-4000-8000-000000000002';
  a uuid; b uuid; foreign_task uuid; chosen jsonb; key_a uuid:=gen_random_uuid(); key_b uuid:=gen_random_uuid();
begin
  a:=(public.rt_create_task('{"goal_text":"Selection A"}',gen_random_uuid())->>'task_id')::uuid;
  b:=(public.rt_create_task('{"goal_text":"Selection B"}',gen_random_uuid())->>'task_id')::uuid;
  assert (public.rt_workspace_tasks()#>>'{selection,revision}')::bigint=0;
  assert (public.rt_workspace_tasks()#>>'{selection,task_id}') is null;
  chosen:=public.rt_select_workspace_task(b,2,key_b);
  assert chosen->>'task_id'=b::text;
  assert public.rt_select_workspace_task(a,1,key_a)=chosen;
  assert public.rt_select_workspace_task(b,2,key_b)=chosen;
  assert public.rt_workspace_tasks()->'selection'=chosen;

  perform set_config('request.jwt.claim.sub',other_user,true);
  assert (public.rt_workspace_tasks()#>>'{selection,task_id}') is null;
  begin perform public.rt_select_workspace_task(b,3,gen_random_uuid());
    raise exception 'foreign preference accepted'; exception when no_data_found then null; end;
  foreign_task:=(public.rt_create_task('{"goal_text":"Other account"}',gen_random_uuid())->>'task_id')::uuid;
  assert public.rt_select_workspace_task(foreign_task,1,gen_random_uuid())->>'task_id'=foreign_task::text;
  perform set_config('request.jwt.claim.sub',me,true);
  assert public.rt_workspace_tasks()->'selection'=chosen;
  perform public.rt_workspace_change(b,null,'archive_task','{}',gen_random_uuid());
  assert (public.rt_workspace_tasks()#>>'{selection,task_id}') is null;
  assert (public.rt_workspace_tasks()#>>'{selection,revision}')::bigint=2;
  begin perform public.rt_select_workspace_task(b,3,gen_random_uuid());
    raise exception 'archived preference accepted'; exception when no_data_found then null; end;
  assert public.rt_select_workspace_task(a,3,gen_random_uuid())->>'task_id'=a::text;
end $$;
reset role;
