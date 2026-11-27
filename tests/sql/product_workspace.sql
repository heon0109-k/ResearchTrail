-- Draft AC5/AC7 persistence cases for controls shared with the browser UI.
set role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-4000-8000-000000000001',false);
do $$
declare
  t uuid; t2 uuid; doc uuid; p uuid; p2 uuid; a uuid; rec uuid; create_key uuid:=gen_random_uuid();
  r uuid; patch jsonb; result jsonb; item jsonb; mark uuid:=gen_random_uuid();
begin
  t:=(public.rt_create_task('{"goal_text":"Initial"}',create_key)->>'task_id')::uuid;
  t2:=(public.rt_create_task('{"goal_text":"Independent"}',gen_random_uuid())->>'task_id')::uuid;
  perform public.rt_workspace_change(t,null,'rename_task','{"goal_text":"Renamed"}',gen_random_uuid());
  assert public.rt_resume(t)#>>'{task,goal_text}'='Renamed';
  assert public.rt_create_task('{"goal_text":"Initial"}',create_key)->>'task_id'=t::text;
  item:=public.rt_register_paper(t,'{"document":{"title":"Same work"},"use":{"purpose_text":"Initial"}}',gen_random_uuid());
  doc:=(item->>'document_id')::uuid; p:=(item->>'document_use_id')::uuid;
  p2:=(public.rt_register_paper(t2,jsonb_build_object('document_id',doc),gen_random_uuid())->>'document_use_id')::uuid;
  -- Creation and supplemental metadata share a transaction and stable retry identity.
  r:=gen_random_uuid();
  item:=public.rt_register_workspace_paper(t2,'{"document":{"title":"New"}}','{"authors":"A. Example","year":2026}',r);
  assert item#>>'{workspace,version}'='1' and item#>>'{workspace,data,authors}'='A. Example';
  assert public.rt_register_workspace_paper(t2,'{"document":{"title":"New"}}','{"authors":"A. Example","year":2026}',r)=item;
  begin perform public.rt_register_workspace_paper(t2,'{"document":{"title":"New"}}','{"year":2027}',r);
    raise exception 'mismatched registration replay accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.rt_register_workspace_paper(t2,'{"document":{"title":"Rolled back"}}','{"tag":"removed_tag"}',gen_random_uuid());
    raise exception 'dangling tag accepted'; exception when sqlstate 'RT001' then null; end;
  assert jsonb_array_length(public.rt_workspace_papers(t2)->'papers')=2;
  perform public.rt_workspace_change(t2,(item->>'document_use_id')::uuid,'archive_paper','{}',gen_random_uuid());
  begin perform public.rt_register_workspace_paper(t2,'{"document":{"title":"New"}}','{"authors":"A. Example","year":2026}',r);
    raise exception 'archived use restored'; exception when no_data_found then null; end;
  a:=(public.rt_prepare_paper_pdf(t,p,'s.pdf',repeat('1',64),80)->>'artifact_id')::uuid;
  r:=gen_random_uuid();
  rec:=(public.rt_save_record(t,'{"record":{"content_text":"Keep original"}}',r)->>'record_id')::uuid;
  assert (public.rt_workspace_state(t)->'record_requests')->>rec::text=r::text;
  perform public.rt_workspace_change(t,p,'edit_paper','{"title":"Local title","reading_state_text":"읽는 중","date":"2026-11-27","access_locator_text":"https://example.invalid/paper"}',gen_random_uuid());
  item:=public.rt_workspace_papers(t)#>'{papers,0}';
  assert item#>>'{document,title}'='Local title' and item#>>'{use,reading_state_text}'='읽는 중';
  assert item->>'date'='2026-11-27' and item->>'access_locator_text'='https://example.invalid/paper';
  assert public.rt_workspace_papers(t2)#>>'{papers,0,document,title}'='Same work';
  patch:=jsonb_build_object('target','artifact','id',a,'version',0,'patch','{"marks":{"abc":{"color":"gold","page":1}}}'::jsonb);
  r:=gen_random_uuid();
  result:=public.rt_workspace_change(t,null,'patch_state',patch,r);
  assert result->>'version'='1';
  perform public.rt_workspace_change(t,null,'patch_state',patch||'{"version":1,"patch":{"marks":{"abc":{"color":null,"tag":"review"}}}}',gen_random_uuid());
  assert public.rt_workspace_change(t,null,'patch_state',patch,r)=result;
  assert (select c.result='{"versions":[1]}' from researchtrail.workspace_changes c where c.request_id=r);
  begin perform public.rt_workspace_change(t,null,'patch_state','{"target":"project","version":0,"patch":{"tags":[{"id":"example","name":"X","color":"invalid"}]}}',gen_random_uuid());
    raise exception 'invalid tag color accepted'; exception when invalid_parameter_value then null; end;
  item:='{}'::jsonb;
  for n in 1..35 loop item:=jsonb_build_object('child',item); end loop;
  begin perform public.rt_workspace_change(t,null,'patch_state',jsonb_build_object('target','project','version',0,'patch',item),gen_random_uuid());
    raise exception 'invalid nesting accepted'; exception when invalid_parameter_value then null; end;
  assert ((public.rt_workspace_state(t)->'artifacts'->a::text)#>'{data,marks,abc}')='{"page":1,"tag":"review"}';
  begin perform public.rt_workspace_change(t,null,'patch_state',patch,gen_random_uuid()); raise exception 'stale patch accepted';
  exception when sqlstate 'RT409' then null; end;
  begin perform public.rt_workspace_change(t,null,'patch_state',patch||jsonb_build_object('id',p2,'target','paper'),gen_random_uuid()); raise exception 'cross-task patch';
  exception when no_data_found then null; end;
  perform public.rt_save_pdf_reader(t,a,jsonb_build_object('highlight',jsonb_build_object('id',mark,'page',1,
    'text','sample','rects','[[0,0,0.2,0.1]]'::jsonb,'record_id',rec)));
  perform public.rt_save_pdf_reader(t,a,'{"last_page":2}');
  assert (public.rt_workspace_state(t)->'reading_pages')->>a::text='2';
  perform public.rt_save_pdf_reader(t,a,jsonb_build_object('remove_highlight',mark));
  assert public.rt_pdf_reader(t,a)->'highlights'='[]';
  perform public.rt_save_pdf_reader(t,a,jsonb_build_object('remove_highlight',mark));
  begin perform public.rt_save_pdf_reader(t,a,jsonb_build_object('highlight',jsonb_build_object('id',mark,
    'page',1,'text','sample','rects','[[0,0,0.2,0.1]]'::jsonb))); raise exception 'removed mark resurrected';
  exception when sqlstate 'RT001' then null; end;
  perform public.rt_workspace_change(t,null,'patch_state','{"target":"project","version":0,"patch":{"tags":[{"id":"t1","name":"A"}]}}',gen_random_uuid());
  perform public.rt_workspace_change(t,null,'patch_state',jsonb_build_object('target','paper','id',p,'version',0,'patch','{"tag":"t1","year":2026}'::jsonb),gen_random_uuid());
  -- The first change in a batch rolls back if its second member is stale.
  begin perform public.rt_workspace_change(t,null,'patch_state',jsonb_build_object('changes',jsonb_build_array(
    jsonb_build_object('target','paper','id',p,'version',1,'patch','{"year":2027}'::jsonb),
    jsonb_build_object('target','artifact','id',a,'version',0,'patch','{"extra":true}'::jsonb))),gen_random_uuid());
    raise exception 'partial batch accepted'; exception when sqlstate 'RT409' then null; end;
  assert (public.rt_workspace_state(t)->'papers'->p::text)#>>'{data,year}'='2026';
  begin perform public.rt_workspace_change(t,null,'patch_state','{"target":"project","version":1,"patch":{"tags":[]}}',gen_random_uuid());
    raise exception 'dangling tag assignment accepted'; exception when sqlstate 'RT001' then null; end;
  perform public.rt_save_record(t,jsonb_build_object('record','{"content_text":"Edition memo"}'::jsonb,
    'context',jsonb_build_object('document_contexts',jsonb_build_array(jsonb_build_object(
      'document_ref',jsonb_build_object('document_id',doc),'use','{}'::jsonb,
      'artifact_ref',jsonb_build_object('artifact_id',a))))),gen_random_uuid());
  assert jsonb_array_length(public.rt_workspace_papers(t)->'papers')=1;
  result:=public.rt_workspace_change(t,null,'remove_tag','{"tag_id":"t1","archive_papers":true,"version":1}',gen_random_uuid());
  assert result->>'removed'='1' and result#>'{data,tags}'='[]';
  assert public.rt_workspace_papers(t)->'papers'='[]';
  assert not (public.rt_workspace_state(t)->'papers') ? p::text;
  assert not (public.rt_workspace_state(t)->'artifacts') ? a::text;
  begin perform public.rt_prepare_paper_pdf(t,p,'s.pdf',repeat('1',64),80); raise exception 'archived upload accepted';
  exception when no_data_found then null; end;
  assert public.rt_workspace_papers(t2)#>>'{papers,0,document_use_id}'=p2::text;
  assert exists(select from jsonb_array_elements(public.rt_resume(t)->'records') row_data where row_data#>>'{record,content_text}'='Keep original');
  assert exists(select from jsonb_array_elements(public.rt_resume(t)->'records') row_data where row_data#>>'{record,content_text}'='Edition memo');
  begin perform public.rt_pdf_reader(t,a); raise exception 'archived edition reopened via memo reference'; exception when no_data_found then null; end;
  r:=gen_random_uuid();
  perform public.rt_workspace_change(t,null,'archive_task','{}',r);
  perform public.rt_workspace_change(t,null,'archive_task','{}',r);
  assert not exists(select from jsonb_array_elements(public.rt_tasks()->'tasks') x where x->>'task_id'=t::text);
  begin perform public.rt_workspace_papers(t); raise exception 'archived project read'; exception when no_data_found then null; end;
  begin perform public.rt_save_record(t,'{"record":{"content_text":"late"}}',gen_random_uuid()); raise exception 'archived project written';
  exception when no_data_found then null; end;
  begin perform public.rt_save_pdf_reader(t,a,'{"last_page":1}'); raise exception 'late position accepted';
  exception when no_data_found then null; end;
  perform set_config('request.jwt.claim.sub','bbbbbbbb-0000-4000-8000-000000000002',true);
  begin perform public.rt_workspace_state(t2); raise exception 'foreign project read'; exception when no_data_found then null; end;
  begin perform public.rt_workspace_change(t2,p2,'archive_paper','{}',gen_random_uuid()); raise exception 'foreign paper update'; exception when no_data_found then null; end;
end $$;
do $$
declare t uuid; p uuid; r uuid:=gen_random_uuid(); result jsonb;
begin
  t:=(public.rt_create_task('{"goal_text":"Tag removal"}',gen_random_uuid())->>'task_id')::uuid;
  perform public.rt_workspace_change(t,null,'patch_state','{"target":"project","version":0,"patch":{"tags":[{"id":"tag","name":"One"},{"id":"kept","name":"Keep"}]}}',gen_random_uuid());
  p:=(public.rt_register_workspace_paper(t,'{"document":{"title":"Retained paper"}}','{"tag":"tag","year":2026}',gen_random_uuid())->>'document_use_id')::uuid;
  result:=public.rt_workspace_change(t,null,'remove_tag','{"tag_id":"tag","archive_papers":false,"version":1}',r);
  assert result->>'removed'='1' and result#>>'{data,tags,0,id}'='kept';
  assert public.rt_workspace_papers(t)#>>'{papers,0,document_use_id}'=p::text;
  assert (public.rt_workspace_state(t)->'papers'->p::text)='{"version":2,"data":{"year":2026}}';
  perform public.rt_workspace_change(t,null,'patch_state','{"target":"project","version":2,"patch":{"label":"newer"}}',gen_random_uuid());
  assert public.rt_workspace_change(t,null,'remove_tag','{"tag_id":"tag","archive_papers":false,"version":1}',r)=result;
  begin perform public.rt_workspace_change(t,null,'patch_state',jsonb_build_object('target','paper','id',p,
    'version',2,'patch','{"tag":"tag"}'::jsonb),gen_random_uuid());
    raise exception 'deleted tag reassigned'; exception when sqlstate 'RT001' then null; end;
end $$;
reset role;
