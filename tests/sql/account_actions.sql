-- SPEC §5.4 / AC4, AC5, AC7. All fixtures are rolled back.
begin;
set local role authenticated;
set local request.jwt.claim.sub='aaaaaaaa-0000-4000-8000-000000000001';
do $checks$
declare
  a uuid := auth.uid(); b uuid := 'bbbbbbbb-0000-4000-8000-000000000002';
  main uuid; sibling uuid; foreign_task uuid; other_record uuid;
  memo text := E'  합성 메모.\n표 비교하기  ';
  source jsonb; other jsonb; body jsonb; links jsonb; reply jsonb; item jsonb;
  candidate jsonb := '{"action_text":"표 비교하기"}';
  reviewed jsonb := '{"action_text":"  비교 표 작성  ","progress_text":"진행 중","deadline_text":"다음 모임","blocker_text":null}';
  key uuid := gen_random_uuid(); fresh uuid; col text; invalid jsonb;
begin
  main := (public.rt_create_task('{"goal_text":"합성 주제 A"}',gen_random_uuid())->>'task_id')::uuid;
  sibling := (public.rt_create_task('{"goal_text":"합성 주제 B"}',gen_random_uuid())->>'task_id')::uuid;
  source := public.rt_save_record(main,jsonb_build_object('record',jsonb_build_object('content_text',memo),'context',
    '{"questions":[{"question_text":"조건?"}],"decisions":[{"decision_text":"대조"}],
      "document_contexts":[{"document_ref":{"document":{"title":"합성 문서"}},"use":{},"artifact_ref":{"artifact":{"label_text":"합성 판본"}}}]}'::jsonb),gen_random_uuid());
  other := public.rt_save_record(sibling,'{"record":{"content_text":"다른 기록"},"context":{
    "questions":[{"question_text":"다른 질문?"}],"decisions":[{"decision_text":"다른 판단"}],
    "document_contexts":[{"document_ref":{"document":{"title":"다른 문서"}},"use":{},"artifact_ref":{"artifact":{"label_text":"다른 판본"}}}]}}',gen_random_uuid());
  links := (source->'context_refs') - array['document_use_ids','document_ids','excerpt_ids'] ||
    jsonb_build_object('target_record_ids',jsonb_build_array(source->>'record_id'));
  body := jsonb_build_object('source_record_id',source->>'record_id','confirmed',true,'original_candidate',candidate,'reviewed_action',reviewed,'links',links);
  assert public.rt_resume(main)->'next_actions'='[]';
  reply := public.rt_confirm_action(main,body,key);
  assert reply=public.rt_confirm_action(main,body,key);
  assert reply->'saved_action'=reviewed and reply->>'source_record_id'=source->>'record_id';
  item := public.rt_resume(main)#>'{next_actions,0}';
  assert item->'original_candidate'=candidate and item->'saved_action'=reviewed and item->'links'=links;
  assert public.rt_resume(main)#>>'{records,0,record,content_text}'=memo;
  assert public.rt_resume(sibling)->'next_actions'='[]';
  begin perform public.rt_confirm_action(main,body-'links',key); raise exception 'accepted changed confirmation';
  exception when invalid_parameter_value then null; end;
  foreach invalid in array array[body-'confirmed',body||'{"confirmed":"true"}',body||'{"confirmed":false}',
    body-'reviewed_action',body||'{"reviewed_action":{"action_text":null}}',body||'{"reviewed_action":{"action_text":"　 "}}',
    body||'{"reviewed_action":{"action_text":"작업","deadline_text":4}}',body||'{"reviewed_action":{"action_text":"작업","progress_text":""}}',
    body||'{"reviewed_action":{"action_text":"작업","extra":"x"}}',body||'{"original_candidate":{"extra":"x"}}',
    body||'{"links":{"unknown":[]}}',body||'{"links":{"artifact_ids":{}}}'] loop
    begin perform public.rt_confirm_action(main,invalid,gen_random_uuid()); raise exception 'accepted invalid review';
    exception when invalid_parameter_value then null; end;
  end loop;
  foreach col in array array['question_ids','decision_ids','artifact_ids','target_record_ids'] loop
    invalid := case when col='target_record_ids' then other->'record_id' else other->'context_refs'->col->0 end;
    invalid := jsonb_set(body,array['links',col],(links->col)||jsonb_build_array(invalid));
    begin perform public.rt_confirm_action(main,invalid,gen_random_uuid()); raise exception 'accepted cross-task link: %',col;
    exception when sqlstate 'RT001' then null; end;
  end loop;
  begin perform public.rt_confirm_action(main,jsonb_set(body,'{source_record_id}',other->'record_id'),gen_random_uuid()); raise exception 'accepted cross-task source';
  exception when sqlstate 'RT001' then null; end;
  foreach invalid in array array[to_jsonb(gen_random_uuid()),'"malformed"'::jsonb,'null'::jsonb] loop
    begin perform public.rt_confirm_action(main,jsonb_set(body,'{source_record_id}',invalid),gen_random_uuid());
      raise exception 'accepted unavailable source';
    exception when sqlstate 'RT001' then null; end;
    begin perform public.rt_confirm_action(main,jsonb_set(body,'{links,target_record_ids}',jsonb_build_array(invalid)),gen_random_uuid());
      raise exception 'accepted unavailable target';
    exception when sqlstate 'RT001' then null; end;
  end loop;
  assert (select count(*)=1 from researchtrail.next_actions where task_id=main);
  assert (select count(*)=4 from researchtrail.next_action_links where next_action_id=(reply->>'next_action_id')::uuid);
  fresh := gen_random_uuid();
  body := (body - 'links' - 'original_candidate') || '{"reviewed_action":{"action_text":"수동 작업"}}';
  reply := public.rt_confirm_action(main,body,fresh);
  assert reply=public.rt_confirm_action(main,body,fresh);
  assert exists(select from researchtrail.next_actions where next_action_id=(reply->>'next_action_id')::uuid and original_candidate is null and deadline_text is null);
  assert jsonb_array_length(public.rt_resume(main)->'next_actions')=2;
  perform set_config('request.jwt.claim.sub',b::text,true);
  foreign_task := (public.rt_create_task('{"goal_text":"합성 계정 B"}',gen_random_uuid())->>'task_id')::uuid;
  other_record := (public.rt_save_record(foreign_task,'{"record":{"content_text":"B"}}',gen_random_uuid())->>'record_id')::uuid;
  begin perform public.rt_confirm_action(main,body,fresh); raise exception 'read foreign confirmation';
  exception when no_data_found then null; end;
  begin perform public.rt_confirm_action(foreign_task,body,gen_random_uuid()); raise exception 'used foreign source';
  exception when sqlstate 'RT001' then null; end;
  body := jsonb_set(body,'{source_record_id}',to_jsonb(other_record)) || jsonb_build_object('links',links);
  begin perform public.rt_confirm_action(foreign_task,body,gen_random_uuid()); raise exception 'used foreign links';
  exception when sqlstate 'RT001' then null; end;
  assert public.rt_resume(foreign_task)->'next_actions'='[]';
  assert not has_any_column_privilege(current_user,'researchtrail.next_actions','INSERT,UPDATE');
  assert not has_any_column_privilege(current_user,'researchtrail.next_action_links','INSERT,UPDATE');
end $checks$;
set local role anon;
do $$ begin assert not has_function_privilege(current_user,'public.rt_confirm_action(uuid,jsonb,uuid)','EXECUTE'); end $$;
rollback;
