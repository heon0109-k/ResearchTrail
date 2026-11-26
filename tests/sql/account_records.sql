-- SPEC §5.2: each call below runs as an authenticated client on synthetic data.
set role authenticated;
create function pg_temp.row_counts() returns jsonb language plpgsql as $$
declare t record; n bigint; counts jsonb := '{}';
begin
  for t in select tablename from pg_tables where schemaname='researchtrail' loop
    execute format('select count(*) from researchtrail.%I', t.tablename) into n;
    counts := counts || jsonb_build_object(t.tablename,n);
  end loop;
  return counts;
end $$;
do $test$
declare
  a uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  b uuid := 'bbbbbbbb-0000-4000-8000-000000000002';
  task uuid; other_task uuid; foreign_task uuid; key uuid := gen_random_uuid(); rich_key uuid := gen_random_uuid();
  original text := E' \t다음에 표를  비교하자\r\n' || U&'e\0301' || repeat('가',5000) || E'\n ';
  bare jsonb := jsonb_build_object('record',jsonb_build_object('content_text',original));
  first_save jsonb; second_save jsonb; corrected jsonb; registered jsonb; rich jsonb; saved jsonb; refs jsonb;
  existing_doc uuid; existing_art uuid; doc_context jsonb; bad jsonb; counts jsonb; rich_record uuid;
  unavailable_revision uuid; original_id uuid; rel text; failed_key uuid := gen_random_uuid();
begin
  perform set_config('request.jwt.claim.sub',a::text,false);
  task := (public.rt_create_task('{"goal_text":"기록 실험"}',gen_random_uuid())->>'task_id')::uuid;
  other_task := (public.rt_create_task('{"goal_text":"별도 과업"}',gen_random_uuid())->>'task_id')::uuid;
  counts := pg_temp.row_counts();
  first_save := public.rt_save_record(task,bare,key);
  original_id := (first_save->>'record_id')::uuid;
  assert first_save->'context_refs' = '{"question_ids":[],"decision_ids":[],"document_ids":[],"document_use_ids":[],"artifact_ids":[],"excerpt_ids":[]}';
  assert (select convert_to(content_text,'UTF8') = convert_to(original,'UTF8') and authorship_text is null and revises_record_id is null
          from researchtrail.research_records where record_id=original_id);
  assert public.rt_save_record(task,bare,key) = first_save;
  assert pg_temp.row_counts() = counts || jsonb_build_object('research_records',(counts->>'research_records')::int+1);
  second_save := public.rt_save_record(task,bare,gen_random_uuid());
  assert second_save->>'record_id' <> first_save->>'record_id';
  begin perform public.rt_save_record(task,'{"record":{"content_text":"다른 입력"}}',key); raise exception 'changed replay accepted';
  exception when invalid_parameter_value then null; end;
  corrected := public.rt_save_record(task,jsonb_build_object('record',jsonb_build_object('content_text',' 정정 ','change_reason_text','단위 확인'),
    'revises_record_id',original_id),gen_random_uuid());
  assert (select revises_record_id=original_id and content_text=' 정정 ' and change_reason_text='단위 확인'
    from researchtrail.research_records where record_id=(corrected->>'record_id')::uuid);
  assert (select content_text=original from researchtrail.research_records where record_id=original_id);
  begin perform public.rt_save_record(other_task,bare||jsonb_build_object('revises_record_id',original_id),gen_random_uuid()); raise exception 'cross-task revision';
  exception when sqlstate 'RT001' then null; end;

  registered := public.rt_register_paper(task,'{"document":{"title":"합성 자료"},"artifacts":[{"version_text":"v1"}]}',gen_random_uuid());
  existing_doc := (registered->>'document_id')::uuid;
  existing_art := (registered->'artifact_ids'->>0)::uuid;
  doc_context := jsonb_build_object('document_ref',jsonb_build_object('document_id',existing_doc),'use',jsonb_build_object('role_text','비교'),
    'artifact_ref',jsonb_build_object('artifact_id',existing_art),'excerpt',jsonb_build_object('locator_text','표 1'));
  rich := jsonb_build_object('record',jsonb_build_object('content_text','다음에 비교하자','record_kind_text','합성 예시','authorship_text','수기',
    'container_text','노트','location_text','여백','review_state_text','일부만 봄','adoption_state_text','미정','audience_text','나','ai_input_scope_text',null),
    'context',jsonb_build_object('questions',jsonb_build_array(jsonb_build_object('question_text',' 차이는? ','unresolved_reason_text','합성 이유')),
    'decisions',jsonb_build_array(jsonb_build_object('decision_text','동일 단위 사용')),
    'document_contexts',jsonb_build_array(doc_context,
      '{"document_ref":{"document":{"title":"합성 자료"}},"use":{"purpose_text":"확인"},"artifact_ref":{"artifact":{"label_text":"synthetic.pdf"}},"excerpt":{"excerpt_text":" 합성 구절 "}}'::jsonb)));
  saved := public.rt_save_record(task,rich,rich_key);
  refs := saved->'context_refs';
  rich_record := (saved->>'record_id')::uuid;
  assert jsonb_array_length(refs->'document_ids')=2 and (refs->'document_ids') ? existing_doc::text;
  assert jsonb_array_length(refs->'document_use_ids')=2 and jsonb_array_length(refs->'artifact_ids')=2 and (refs->'artifact_ids') ? existing_art::text;
  assert jsonb_array_length(refs->'excerpt_ids')=2 and jsonb_array_length(refs->'question_ids')=1 and jsonb_array_length(refs->'decision_ids')=1;
  assert (select jsonb_strip_nulls(to_jsonb(r)) @> jsonb_strip_nulls(rich->'record') from researchtrail.research_records r where record_id=rich_record);
  assert (select record_id=rich_record and task_id=task and question_text=' 차이는? ' and state_text is null and unresolved_reason_text='합성 이유'
          from researchtrail.research_questions where question_id=(refs->'question_ids'->>0)::uuid);
  assert (select record_id=rich_record and task_id=task and decision_text='동일 단위 사용' and made_by_text is null and reason_text is null
          from researchtrail.decisions where decision_id=(refs->'decision_ids'->>0)::uuid);
  assert exists(select from researchtrail.evidence_excerpts where artifact_id=existing_art and locator_text='표 1' and excerpt_text is null
          and (refs->'excerpt_ids') ? excerpt_id::text);
  assert exists(select from researchtrail.evidence_excerpts where artifact_id<>existing_art and excerpt_text=' 합성 구절 '
          and (refs->'excerpt_ids') ? excerpt_id::text);
  assert exists(select from researchtrail.record_document_contexts c join researchtrail.document_uses u using(document_use_id)
          where c.record_id=rich_record and c.document_id=existing_doc and c.artifact_id=existing_art and u.role_text='비교' and u.task_id=task);
  counts := pg_temp.row_counts();
  assert public.rt_save_record(task,rich,rich_key) = saved;
  assert pg_temp.row_counts() = counts;
  -- Several valid inserts precede the last invalid reference. All tables must roll back.
  for bad in select value from jsonb_array_elements(jsonb_build_array(
    doc_context - 'artifact_ref',
    jsonb_set(doc_context,'{artifact_ref}',jsonb_build_object('artifact_id',gen_random_uuid())),
    jsonb_set(doc_context,'{document_ref}','{"document":{"title":"다른 문헌"}}'),
    jsonb_set(doc_context,'{document_ref}',jsonb_build_object('document_id',existing_doc,'document',jsonb_build_object('title','동시 지정'))),
    jsonb_set(doc_context,'{document_ref,document_id}','"not-an-id"'),
    jsonb_set(doc_context,'{artifact_ref}',jsonb_build_object('artifact_id',existing_art,'artifact',jsonb_build_object('label_text','동시 지정')))
  )) loop
    begin
      perform public.rt_save_record(task,jsonb_set(rich,'{context,document_contexts}',(rich#>'{context,document_contexts}') || jsonb_build_array(bad)),failed_key);
      raise exception 'invalid selection accepted';
    exception when sqlstate 'RT001' then null; end;
    assert pg_temp.row_counts() = counts;
  end loop;
  for bad in select value from jsonb_array_elements(jsonb_build_array('{}'::jsonb,'{"record":{"content_text":123}}'::jsonb,
    jsonb_build_object('record',jsonb_build_object('content_text',E' \n\t' || U&'\3000\00A0')),
    bare||'{"context":{"questions":[{"question_text":"  "}]}}', bare||'{"context":{"decisions":[{"made_by_text":"누군가"}]}}',
    bare||'{"context":{"questions":{}}}', bare||'{"next_action":{"action_text":"작업"}}',
    bare||'{"context":{"document_contexts":[{"document_ref":{"document":{"title":"자료"}},"use":{"unexpected":1}}]}}'
  )) loop
    begin perform public.rt_save_record(task,bad,gen_random_uuid()); raise exception 'invalid input accepted';
    exception when invalid_parameter_value then null; end;
    assert pg_temp.row_counts() = counts;
  end loop;
  corrected := public.rt_save_record(task,bare||jsonb_build_object('revises_record_id',rich_record,'context',null),failed_key);
  assert corrected->'context_refs' = first_save->'context_refs';
  assert public.rt_save_record(task,rich,rich_key) = saved;
  perform set_config('request.jwt.claim.sub',b::text,false);
  foreign_task := (public.rt_create_task('{"goal_text":"다른 계정"}',gen_random_uuid())->>'task_id')::uuid;
  counts := pg_temp.row_counts();
  begin perform public.rt_save_record(task,bare,key); raise exception 'foreign task accepted';
  exception when no_data_found then null; end;
  foreach unavailable_revision in array array[original_id,gen_random_uuid()] loop
    begin perform public.rt_save_record(foreign_task,bare||jsonb_build_object('revises_record_id',unavailable_revision),key); raise exception 'unavailable revision accepted';
    exception when sqlstate 'RT001' then null; end;
  end loop;
  begin perform public.rt_save_record(foreign_task,rich,key); raise exception 'foreign document accepted';
  exception when sqlstate 'RT001' then null; end;
  begin
    insert into researchtrail.research_records(task_id,request_id,request_hash,content_text,revises_record_id)
      values(foreign_task,key,sha256('synthetic'),'합성',original_id);
    raise exception 'foreign revision accepted by direct write';
  exception when foreign_key_violation then null; end;
  begin
    insert into researchtrail.research_questions(task_id,record_id,question_text) values(foreign_task,original_id,'합성?');
    raise exception 'foreign record accepted by direct question write';
  exception when foreign_key_violation then null; end;
  assert pg_temp.row_counts() = counts;
  assert not exists (select from researchtrail.research_records where record_id=original_id);
  foreach rel in array array['research_records','research_questions','decisions','record_document_contexts','evidence_excerpts'] loop
    assert row_security_active(('researchtrail.'||rel)::regclass);
    assert not has_column_privilege(current_user,'researchtrail.'||rel,'owner_id','INSERT');
    assert not has_any_column_privilege(current_user,'researchtrail.'||rel,'UPDATE');
    assert not has_table_privilege(current_user,'researchtrail.'||rel,'DELETE,TRUNCATE');
  end loop;
end $test$;
