-- SPEC §5.5, AC5/AC6. Fixtures live only in the disposable database.
begin;
create function pg_temp.fixture_id(n integer) returns uuid language sql immutable as $$
  select ('66000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid
$$;
create temporary table resume_fixture (rich jsonb, paper jsonb, shared_artifact uuid, hidden_artifact uuid);
grant select on resume_fixture to authenticated;
do $seed$
declare
  a uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  b uuid := 'bbbbbbbb-0000-4000-8000-000000000002';
  main uuid := pg_temp.fixture_id(1); sibling uuid := pg_temp.fixture_id(2);
  paper jsonb; other_paper jsonb; rich jsonb; art uuid; hidden uuid; doc uuid; ctx jsonb;
begin
  insert into researchtrail.research_tasks(task_id,owner_id,goal_text,progress_text) values
    (main,a,'합성 범위','읽는 중'),(sibling,a,'다른 과업',null),
    (pg_temp.fixture_id(3),a,'빈 과업',null),(pg_temp.fixture_id(4),b,'다른 계정',null);
  insert into researchtrail.research_records(record_id,owner_id,task_id,request_id,request_hash,created_at,content_text,revises_record_id)
    values
      (pg_temp.fixture_id(10),a,main,gen_random_uuid(),sha256('fixture'),'2025-01-01',E'  합성 원문\r\n',null),
      (pg_temp.fixture_id(11),a,main,gen_random_uuid(),sha256('fixture'),'2025-01-01','정정',pg_temp.fixture_id(10)),
      (pg_temp.fixture_id(12),a,main,gen_random_uuid(),sha256('fixture'),'2025-01-02','다음에 할 일처럼 보이는 미확정 메모',null),
      (pg_temp.fixture_id(20),a,sibling,gen_random_uuid(),sha256('fixture'),now(),'다른 과업 전용',null),
      (pg_temp.fixture_id(40),b,pg_temp.fixture_id(4),gen_random_uuid(),sha256('fixture'),now(),'다른 계정 전용',null);
  perform set_config('request.jwt.claim.sub',a::text,true);
  -- Register a paper without a memo, and explicitly reuse only one edition from another task.
  paper := public.rt_register_paper(main,'{"document":{"material_kind_text":"자료"},"artifacts":[{"label_text":"local.pdf"},{"label_text":"v2.pdf"}]}',gen_random_uuid());
  other_paper := public.rt_register_paper(sibling,'{"document":{"title":"공통 문헌"},"use":{"purpose_text":"다른 과업 전용"},
    "artifacts":[{"access_locator_text":"https://offline.example.invalid/paper.pdf","version_text":"v1","availability_text":"열지 못함"},
                 {"label_text":"다른 과업 전용"}]}',gen_random_uuid());
  doc := (other_paper->>'document_id')::uuid;
  select artifact_id into strict art from researchtrail.document_artifacts where document_id=doc and version_text='v1';
  select artifact_id into strict hidden from researchtrail.document_artifacts where document_id=doc and label_text='다른 과업 전용';
  ctx := jsonb_build_object('document_ref',jsonb_build_object('document_id',doc),'artifact_ref',jsonb_build_object('artifact_id',art),
    'use',jsonb_build_object('purpose_text','조건 비교','reading_state_text','한 절만 읽음'),'excerpt',jsonb_build_object('locator_text','표 2'));
  rich := public.rt_save_record(main,jsonb_build_object('record',jsonb_build_object('content_text','합성 판단 기록','authorship_text','합성 작성자',
      'review_state_text','일부 대조','adoption_state_text','보류'),
    'context',jsonb_build_object('questions','[{"question_text":"조건은?"},{"question_text":"단위는?","state_text":"확인 중"}]'::jsonb,
      'decisions','[{"decision_text":"표 단위를 유지"}]'::jsonb,'document_contexts',jsonb_build_array(ctx))),gen_random_uuid());
  perform public.rt_save_record(sibling,jsonb_build_object('record',jsonb_build_object('content_text','다른 과업 전용'),
    'context',jsonb_build_object('questions','[{"question_text":"다른 과업 전용"}]'::jsonb,'decisions','[{"decision_text":"다른 과업 전용"}]'::jsonb,
      'document_contexts',jsonb_build_array(jsonb_set(ctx,'{excerpt}','{"excerpt_text":"다른 과업 전용"}')))), gen_random_uuid());
  insert into resume_fixture values(rich,paper,art,hidden);
  insert into researchtrail.next_actions(next_action_id,owner_id,task_id,source_record_id,created_at,confirmed,action_text,deadline_text)
    values (pg_temp.fixture_id(51),a,main,(rich->>'record_id')::uuid,'2025-01-03',true,'표 단위 비교','다음 모임 전');
  insert into researchtrail.next_action_links(next_action_id,question_id,decision_id,artifact_id,target_record_id) values
    (pg_temp.fixture_id(51),(rich#>>'{context_refs,question_ids,0}')::uuid,null,null,null),
    (pg_temp.fixture_id(51),null,(rich#>>'{context_refs,decision_ids,0}')::uuid,null,null),
    (pg_temp.fixture_id(51),null,null,art,null),
    (pg_temp.fixture_id(51),null,null,null,pg_temp.fixture_id(11)),
    (pg_temp.fixture_id(51),null,null,null,pg_temp.fixture_id(12)),
    (pg_temp.fixture_id(51),null,null,null,pg_temp.fixture_id(10));
  insert into researchtrail.next_actions(next_action_id,owner_id,task_id,source_record_id,created_at,confirmed,action_text)
    values (pg_temp.fixture_id(50),a,main,pg_temp.fixture_id(10),'2025-01-03',true,'확인한 작업'),
           (pg_temp.fixture_id(52),a,main,pg_temp.fixture_id(12),'2025-01-04',true,'최근 저장한 작업'),
           (pg_temp.fixture_id(53),a,sibling,pg_temp.fixture_id(20),now(),true,'다른 과업 전용'),
           (pg_temp.fixture_id(54),b,pg_temp.fixture_id(4),pg_temp.fixture_id(40),now(),true,'다른 계정 전용');
  begin
    insert into researchtrail.next_actions(owner_id,task_id,source_record_id,action_text) values(a,main,pg_temp.fixture_id(12),'확인 생략');
    raise exception 'explicit confirmation was optional';
  exception when not_null_violation or check_violation then null; end;
  begin
    insert into researchtrail.next_actions(owner_id,task_id,source_record_id,confirmed,action_text) values(a,main,pg_temp.fixture_id(12),false,'미확정');
    raise exception 'unconfirmed candidate stored as a confirmed next action';
  exception when check_violation then null; end;
  begin
    insert into researchtrail.next_actions(owner_id,task_id,source_record_id,confirmed,action_text) values(a,main,pg_temp.fixture_id(20),true,'다른 과업 원문');
    raise exception 'cross-task action source accepted';
  exception when foreign_key_violation then null; end;
  -- Deliberately inconsistent privileged fixtures must be invisible even to direct client reads.
  insert into researchtrail.next_action_links(next_action_id,question_id,decision_id,artifact_id,target_record_id) values
    (pg_temp.fixture_id(51),(select question_id from researchtrail.research_questions where task_id=sibling),null,null,null),
    (pg_temp.fixture_id(51),null,(select decision_id from researchtrail.decisions where task_id=sibling),null,null),
    (pg_temp.fixture_id(51),null,null,hidden,null),
    (pg_temp.fixture_id(51),null,null,null,pg_temp.fixture_id(20)),
    (pg_temp.fixture_id(51),null,null,null,pg_temp.fixture_id(40));
end $seed$;
commit;

begin read only;
set local role authenticated;
set local request.jwt.claim.sub='aaaaaaaa-0000-4000-8000-000000000001';
do $read$
declare
  main uuid := pg_temp.fixture_id(1);
  result jsonb := public.rt_resume(main);
  ctx jsonb := result->'context'; recs jsonb := result->'records'; actions jsonb := result->'next_actions';
  f record; notes jsonb; paper jsonb; act jsonb; empty_task jsonb; missing uuid;
begin
  select * into strict f from resume_fixture;
  assert result = public.rt_resume(main);
  assert (result->>'task_id')::uuid=main and result->'task'='{"goal_text":"합성 범위","scope_text":null,"target_output_text":null,"progress_text":"읽는 중"}';
  assert jsonb_array_length(recs)=4;
  assert recs->0->>'record_id'=f.rich->>'record_id' and recs->0->'context_refs'=f.rich->'context_refs';
  assert recs#>>'{0,record,review_state_text}'='일부 대조' and recs#>>'{0,record,adoption_state_text}'='보류';
  assert recs#>>'{0,record,authorship_text}'='합성 작성자';
  assert (recs->1->>'record_id')::uuid=pg_temp.fixture_id(12);
  assert (recs->2->>'record_id')::uuid=pg_temp.fixture_id(10) and recs#>>'{2,record,content_text}'=E'  합성 원문\r\n';
  assert recs#>'{2,record,authorship_text}'='null' and recs#>'{2,record,review_state_text}'='null';
  assert (recs->3->>'record_id')::uuid=pg_temp.fixture_id(11) and (recs->3->>'revises_record_id')::uuid=pg_temp.fixture_id(10);
  assert jsonb_array_length(ctx->'questions')=2 and jsonb_array_length(ctx->'decisions')=1;
  assert ctx#>>'{questions,0,question_id}'=f.rich#>>'{context_refs,question_ids,0}';
  assert ctx#>>'{questions,1,question_id}'=f.rich#>>'{context_refs,question_ids,1}';
  assert ctx#>>'{decisions,0,record_id}'=f.rich->>'record_id' and ctx#>>'{decisions,0,decision_text}'='표 단위를 유지';
  assert ctx#>'{decisions,0,made_by_text}'='null';
  assert jsonb_array_length(ctx->'document_contexts')=2;
  assert (ctx#>>'{document_contexts,0,document_use_id}')::uuid < (ctx#>>'{document_contexts,1,document_use_id}')::uuid;
  select value into strict notes from jsonb_array_elements(ctx->'document_contexts') where value->>'record_id'=f.rich->>'record_id';
  assert notes#>>'{use,purpose_text}'='조건 비교' and notes#>>'{use,reading_state_text}'='한 절만 읽음';
  assert jsonb_array_length(notes->'artifacts')=1 and (notes#>>'{artifacts,0,artifact_id}')::uuid=f.shared_artifact;
  assert notes#>>'{artifacts,0,access_locator_text}'='https://offline.example.invalid/paper.pdf';
  assert notes#>>'{artifacts,0,availability_text}'='열지 못함' and notes#>>'{artifacts,0,version_text}'='v1';
  assert jsonb_array_length(notes#>'{artifacts,0,excerpts}')=1 and notes#>>'{artifacts,0,excerpts,0,locator_text}'='표 2';
  assert notes#>'{artifacts,0,excerpts,0,excerpt_text}'='null';
  select value into strict paper from jsonb_array_elements(ctx->'document_contexts') where value->>'document_use_id'=f.paper->>'document_use_id';
  assert paper->'record_id'='null' and paper#>'{document,title}'='null' and paper#>'{use,purpose_text}'='null';
  assert jsonb_array_length(paper->'artifacts')=2 and paper#>'{artifacts,0,excerpts}'='[]';
  assert paper#>>'{artifacts,0,artifact_id}'=f.paper#>>'{artifact_ids,0}';
  assert jsonb_array_length(actions)=3;
  assert (actions->0->>'next_action_id')::uuid=pg_temp.fixture_id(52) and (actions->1->>'next_action_id')::uuid=pg_temp.fixture_id(50);
  assert actions->1->'links'='{"question_ids":[],"decision_ids":[],"artifact_ids":[],"target_record_ids":[]}';
  act := actions->2;
  assert (act->>'next_action_id')::uuid=pg_temp.fixture_id(51) and act->>'source_record_id'=f.rich->>'record_id';
  assert act->'saved_action'='{"action_text":"표 단위 비교","deadline_text":"다음 모임 전","progress_text":null,"blocker_text":null}';
  assert act->'links'=jsonb_build_object('question_ids',jsonb_build_array(f.rich#>>'{context_refs,question_ids,0}'),
    'decision_ids',f.rich#>'{context_refs,decision_ids}','artifact_ids',jsonb_build_array(f.shared_artifact),
    'target_record_ids',jsonb_build_array(pg_temp.fixture_id(12),pg_temp.fixture_id(10),pg_temp.fixture_id(11)));
  assert result::text not like '%다른 과업 전용%' and result::text not like '%다른 계정 전용%' and result::text not like '%'||f.hidden_artifact::text||'%';
  assert not (result::text ~ '"(owner_id|request_hash|request_id)"');
  assert (select count(*)=6 from researchtrail.next_action_links where next_action_id=pg_temp.fixture_id(51));
  assert public.rt_resume(pg_temp.fixture_id(2))::text not like '%합성 판단 기록%';
  empty_task := public.rt_resume(pg_temp.fixture_id(3));
  assert empty_task = jsonb_build_object('task_id',pg_temp.fixture_id(3),'task',jsonb_build_object('goal_text','빈 과업','scope_text',null,
    'target_output_text',null,'progress_text',null),'records','[]'::jsonb,'context','{"questions":[],"decisions":[],"document_contexts":[]}'::jsonb,'next_actions','[]'::jsonb);
  foreach missing in array array[pg_temp.fixture_id(4),pg_temp.fixture_id(999)] loop
    begin perform public.rt_resume(missing); raise exception 'inaccessible task disclosed'; exception when no_data_found then null; end;
  end loop;
  perform set_config('request.jwt.claim.sub','bbbbbbbb-0000-4000-8000-000000000002',true);
  assert public.rt_resume(pg_temp.fixture_id(4))#>>'{next_actions,0,saved_action,action_text}'='다른 계정 전용';
  begin perform public.rt_resume(main); raise exception 'previous account disclosed'; exception when no_data_found then null; end;
  assert row_security_active('researchtrail.next_actions'::regclass);
  assert not exists(select from researchtrail.next_actions where task_id=main);
  assert not exists(select from researchtrail.next_action_links where next_action_id=pg_temp.fixture_id(51));
  assert not has_any_column_privilege(current_user,'researchtrail.next_action_links','INSERT,UPDATE');
  assert not has_table_privilege(current_user,'researchtrail.next_action_links','DELETE,TRUNCATE');
  assert not has_any_column_privilege(current_user,'researchtrail.next_actions','INSERT,UPDATE');
  assert not has_table_privilege(current_user,'researchtrail.next_actions','DELETE,TRUNCATE');
end $read$;
set local role anon;
do $anonymous$
begin
  assert not has_function_privilege(current_user,'public.rt_resume(uuid)','EXECUTE');
end $anonymous$;
commit;
