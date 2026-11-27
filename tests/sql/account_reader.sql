-- Same owner, two tasks sharing an edition, plus a separate edition with the same filename.
begin;
set local role authenticated;
set local request.jwt.claim.sub='aaaaaaaa-0000-4000-8000-000000000001';
do $test$
declare
  t uuid; sibling uuid; paper jsonb; u uuid; a uuid; other uuid; memo uuid; unrelated uuid;
  mark jsonb; state jsonb; id uuid:=gen_random_uuid(); second uuid:=gen_random_uuid(); bad jsonb;
begin
  t:=(public.rt_create_task('{"goal_text":"합성 읽기"}',gen_random_uuid())->>'task_id')::uuid;
  sibling:=(public.rt_create_task('{"goal_text":"별도 과업"}',gen_random_uuid())->>'task_id')::uuid;
  paper:=public.rt_register_paper(t,'{"document":{"title":"합성 논문"}}',gen_random_uuid());
  u:=(paper->>'document_use_id')::uuid;
  a:=(public.rt_prepare_paper_pdf(t,u,'판본.pdf',repeat('a',64),500)->>'artifact_id')::uuid;
  other:=(public.rt_prepare_paper_pdf(t,u,'판본.pdf',repeat('b',64),500)->>'artifact_id')::uuid;
  memo:=(public.rt_save_record(t,'{"record":{"content_text":"  합성 메모  "}}',gen_random_uuid())->>'record_id')::uuid;
  unrelated:=(public.rt_save_record(sibling,jsonb_build_object('record',jsonb_build_object('content_text','다른 과업'),
    'context',jsonb_build_object('document_contexts',jsonb_build_array(jsonb_build_object(
      'document_ref',jsonb_build_object('document_id',paper->>'document_id'),'use','{}'::jsonb,'artifact_ref',jsonb_build_object('artifact_id',a))))),gen_random_uuid())->>'record_id')::uuid;
  assert public.rt_pdf_reader(t,a)='{"last_page":null,"highlights":[]}';
  mark:=jsonb_build_object('id',id,'page',2,'rects','[[0.1,0.25,0.6,0.04],[0.12,0.31,0.2,0.03]]'::jsonb,'text','Synthetic passage','record_id',memo);
  perform public.rt_save_pdf_reader(t,a,jsonb_build_object('highlight',mark));
  perform public.rt_save_pdf_reader(t,a,jsonb_build_object('highlight',mark));
  perform public.rt_save_pdf_reader(t,a,'{"last_page":3}');
  -- A slowly opening fresh client cannot reset another client's later navigation.
  perform public.rt_save_pdf_reader(t,a,'{"initial_page":1}');
  state:=public.rt_pdf_reader(t,a);
  assert state=jsonb_build_object('last_page',3,'highlights',jsonb_build_array(mark));
  -- No object is present in Storage, so these locators must be recoverable without bytes.
  assert public.rt_pdf_reader(t,other)='{"last_page":null,"highlights":[]}';
  assert public.rt_pdf_reader(sibling,a)='{"last_page":null,"highlights":[]}';
  begin perform public.rt_save_pdf_reader(t,a,jsonb_build_object('highlight',mark||jsonb_build_object('id',second,'record_id',unrelated)));
    raise exception 'foreign memo'; exception when sqlstate 'RT001' then null; end;
  foreach bad in array array['{"last_page":0}'::jsonb,'{"last_page":1.5}'::jsonb,
    jsonb_build_object('highlight',mark||'{"rects":[[0,0.5,0.2,0.7]]}'::jsonb),
    jsonb_build_object('highlight',mark||'{"rects":[]}'::jsonb),
    jsonb_build_object('highlight',mark||'{"page":4}'::jsonb)] loop
    begin perform public.rt_save_pdf_reader(t,a,bad); raise exception 'invalid payload accepted';
      exception when invalid_parameter_value then null; end;
  end loop;
  assert public.rt_pdf_reader(t,a)=state;
  perform public.rt_save_pdf_reader(t,a,jsonb_build_object('highlight',(mark-'record_id')||jsonb_build_object('id',second)));
  perform public.rt_save_pdf_reader(t,a,jsonb_build_object('link',jsonb_build_object('id',second,'record_id',memo)));
  perform public.rt_save_pdf_reader(t,a,jsonb_build_object('link',jsonb_build_object('id',second,'record_id',memo)));
  assert (select count(*)=2 from jsonb_array_elements(public.rt_pdf_reader(t,a)->'highlights') h where h->>'record_id'=memo::text);
  assert public.rt_resume(t)#>>'{records,0,record,content_text}'='  합성 메모  ';
  assert jsonb_array_length(public.rt_resume(t)->'records')=1;
  assert public.rt_resume(t)->'next_actions'='[]';
  assert not has_table_privilege('authenticated','researchtrail.pdf_highlights','INSERT');
  assert not has_table_privilege('authenticated','researchtrail.pdf_reading_pages','UPDATE');
  perform set_config('request.jwt.claim.sub','bbbbbbbb-0000-4000-8000-000000000002',true);
  assert not exists(select from researchtrail.pdf_highlights);
  assert not exists(select from researchtrail.pdf_reading_pages);
  assert not has_function_privilege('anon','public.rt_pdf_reader(uuid,uuid)','EXECUTE');
  assert not has_function_privilege('anon','public.rt_save_pdf_reader(uuid,uuid,jsonb)','EXECUTE');
  begin perform public.rt_pdf_reader(t,a); raise exception 'foreign read'; exception when no_data_found then null; end;
  begin perform public.rt_save_pdf_reader(t,a,'{"last_page":7}'); raise exception 'foreign write'; exception when no_data_found then null; end;
end $test$;
rollback;
