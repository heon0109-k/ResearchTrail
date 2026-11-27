-- Step 9. Storage's object metadata relation and database roles are supplied by the test runner.
begin;
set local role authenticated;
set local request.jwt.claim.sub='aaaaaaaa-0000-4000-8000-000000000001';
do $test$
declare
  task uuid; sibling uuid; use_id uuid; doi uuid; doc jsonb; prepared jsonb; name text; a uuid; legacy uuid;
begin
  task := (public.rt_create_task('{"goal_text":"PDF 합성 과업"}',gen_random_uuid())->>'task_id')::uuid;
  sibling := (public.rt_create_task('{"goal_text":"다른 과업"}',gen_random_uuid())->>'task_id')::uuid;
  doc := public.rt_register_paper(task,'{"document":{"title":"합성 논문"},"artifacts":[{"access_locator_text":"https://doi.org/10.0000/example"}]}',gen_random_uuid());
  use_id := (doc->>'document_use_id')::uuid; doi := (doc->'artifact_ids'->>0)::uuid;
  assert public.rt_resume(task)#>>'{context,document_contexts,0,artifacts,0,access_locator_text}'='https://doi.org/10.0000/example';
  perform public.rt_save_record(task,'{"record":{"content_text":"  원문 합성 메모  "}}',gen_random_uuid());
  prepared := public.rt_prepare_paper_pdf(task,use_id,'합성.pdf',repeat('a',64),10485760);
  assert public.rt_prepare_paper_pdf(task,use_id,'합성.pdf',repeat('a',64),10485760)=prepared;
  name := prepared->>'object_name'; a := (prepared->>'artifact_id')::uuid;
  assert doi<>a and name=auth.uid()::text||'/'||use_id::text||'/'||repeat('a',64)||'.pdf';
  assert public.rt_paper_pdf(task,a)=prepared;
  begin perform public.rt_paper_pdf(sibling,a); raise exception 'wrong task'; exception when no_data_found then null; end;
  begin perform public.rt_prepare_paper_pdf(sibling,use_id,'합성.pdf',repeat('a',64),20); raise exception 'wrong use'; exception when no_data_found then null; end;
  begin perform public.rt_prepare_paper_pdf(task,use_id,'html.txt',repeat('a',64),20); raise exception 'wrong extension'; exception when invalid_parameter_value then null; end;
  begin perform public.rt_prepare_paper_pdf(task,use_id,'big.pdf',repeat('b',64),10485761); raise exception 'too large'; exception when invalid_parameter_value then null; end;
  assert not (select (x#>>'{pdf,available}')::boolean from jsonb_array_elements(public.rt_papers(task)#>'{papers,0,artifacts}') x where x->>'artifact_id'=a::text);
  doc := public.rt_register_paper(task,'{"document":{"title":"이전 등록"},"artifacts":[{"label_text":"legacy.pdf"}]}',gen_random_uuid());
  legacy := (doc->'artifact_ids'->>0)::uuid;
  assert exists(select from jsonb_array_elements(public.rt_papers(task)->'papers') p, jsonb_array_elements(p->'artifacts') x
    where x->>'artifact_id'=legacy::text and x->>'can_attach_pdf'='true');
  begin perform public.rt_prepare_paper_pdf(task,use_id,'legacy.pdf',repeat('c',64),30,legacy);
    raise exception 'attached to a different use'; exception when no_data_found then null; end;
  assert public.rt_prepare_paper_pdf(task,(doc->>'document_use_id')::uuid,'renamed.pdf',repeat('c',64),30,legacy)->>'artifact_id'=legacy::text;
  assert (select label_text='legacy.pdf' from researchtrail.document_artifacts where artifact_id=legacy);
  begin perform public.rt_prepare_paper_pdf(task,(doc->>'document_use_id')::uuid,'legacy.pdf',repeat('d',64),30,legacy);
    raise exception 'replaced an existing edition'; exception when invalid_parameter_value then null; end;
  begin insert into storage.objects(bucket_id,name) values('researchtrail-pdfs',name); raise exception 'client uploaded unchecked bytes'; exception when insufficient_privilege then null; end;
  perform set_config('rt_test.name',name,true);
  perform set_config('rt_test.task',task::text,true);
  perform set_config('rt_test.artifact',a::text,true);
  perform set_config('rt_test.use',use_id::text,true);
end $test$;
reset role;
insert into storage.objects(bucket_id,name,metadata) values('researchtrail-pdfs',current_setting('rt_test.name'),'{"size":10485760,"mimetype":"application/pdf"}');
set local role authenticated;
do $read$
declare task uuid:=current_setting('rt_test.task')::uuid; a uuid:=current_setting('rt_test.artifact')::uuid; snapshot jsonb:=public.rt_resume(task);
begin
  assert (select count(*)=1 from storage.objects where bucket_id='researchtrail-pdfs');
  assert exists(select from jsonb_array_elements(snapshot#>'{context,document_contexts}') p, jsonb_array_elements(p->'artifacts') x
    where x->>'artifact_id'=a::text and x#>'{pdf,available}'='true');
  assert jsonb_array_length(snapshot->'records')=1 and snapshot#>>'{records,0,record,content_text}'='  원문 합성 메모  ';
  assert snapshot->'next_actions'='[]';
  update storage.objects set name='changed.pdf' where bucket_id='researchtrail-pdfs';
  assert not found, 'client may not replace a validated object';
  delete from storage.objects where bucket_id='researchtrail-pdfs';
  assert not found, 'client may not delete a validated object';
  perform set_config('request.jwt.claim.sub','bbbbbbbb-0000-4000-8000-000000000002',true);
  assert not exists(select from storage.objects where bucket_id='researchtrail-pdfs');
  begin perform public.rt_paper_pdf(task,a); raise exception 'foreign artifact readable'; exception when no_data_found then null; end;
  begin perform public.rt_prepare_paper_pdf(task,current_setting('rt_test.use')::uuid,'합성.pdf',repeat('a',64),20); raise exception 'foreign attachment'; exception when no_data_found then null; end;
end $read$;
set local role anon;
set local request.jwt.claim.sub='';
do $$ begin
  assert not exists(select from storage.objects where bucket_id='researchtrail-pdfs');
  begin insert into storage.objects(bucket_id,name) values('researchtrail-pdfs','unchecked.pdf');
    raise exception 'anonymous upload'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin assert exists(select from storage.buckets where id='researchtrail-pdfs' and not public and file_size_limit=10485760 and allowed_mime_types=array['application/pdf']); end $$;
rollback;
