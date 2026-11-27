-- Draft AC5/AC7. The second client consumes only public RPCs and the first
-- client's receipts from this harness. Each file runs in a fresh backend.
create schema product_clients;
create unlogged table product_clients.saved(writer integer,task uuid,paper uuid,other uuid,
  edition jsonb,sibling jsonb,link jsonb,memo uuid,highlight jsonb,capture uuid,request_id uuid,edit jsonb,receipt jsonb);
grant usage on schema product_clients to authenticated;
grant select,insert on product_clients.saved to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-4000-8000-000000000001',false);
do $$
declare
  t uuid; p jsonb; q jsonb; a jsonb; b jsonb; l jsonb; memo uuid; h jsonb; removed jsonb;
  capture_id uuid:=gen_random_uuid(); key uuid:=gen_random_uuid(); edit jsonb; receipt jsonb;
begin
  t:=(public.rt_create_task('{"goal_text":"Shared product fixture"}',gen_random_uuid())->>'task_id')::uuid;
  p:=public.rt_register_paper(t,'{"document":{"title":"Synthetic A"}}',gen_random_uuid());
  q:=public.rt_register_paper(t,'{"document":{"title":"Synthetic B"}}',gen_random_uuid());
  l:=public.rt_link_papers(t,jsonb_build_object('from_document_use_id',p->'document_use_id',
    'to_document_use_id',q->'document_use_id','reason_text','Compare source tables'),gen_random_uuid());
  -- SHA/size of the two real synthetic PDFs in fixtures/account-chat-api.cjs.
  a:=public.rt_prepare_paper_pdf(t,(p->>'document_use_id')::uuid,'same.pdf','78ad087ccd3e6a81598188f083198bbb6932d324a37159c472180a8c65238dc7',9587);
  b:=public.rt_prepare_paper_pdf(t,(p->>'document_use_id')::uuid,'same.pdf','2344e1c4e7978a322c5962a44524ecba7e93c40237f9beafb73ea0974c736f34',588);
  memo:=(public.rt_save_record(t,jsonb_build_object('record','{"content_text":"  Synthetic passage memo  "}'::jsonb,
    'context',jsonb_build_object('document_contexts',jsonb_build_array(jsonb_build_object(
    'document_ref',jsonb_build_object('document_id',p->'document_id'),'use','{}'::jsonb,
    'artifact_ref',jsonb_build_object('artifact_id',a->'artifact_id'))))),gen_random_uuid())->>'record_id')::uuid;
  -- Legacy canonical anchor. There is deliberately no matching cards entry.
  h:=jsonb_build_object('id',gen_random_uuid(),'text','Draft passage 2','rects','[[0.1,0.2,0.32,0.05]]'::jsonb,'page',2,'record_id',memo);
  perform public.rt_save_pdf_reader(t,(a->>'artifact_id')::uuid,jsonb_build_object('highlight',h));
  perform public.rt_save_pdf_reader(t,(a->>'artifact_id')::uuid,'{"last_page":2}');
  removed:=h||jsonb_build_object('id',gen_random_uuid());
  perform public.rt_save_pdf_reader(t,(a->>'artifact_id')::uuid,jsonb_build_object('highlight',removed));
  perform public.rt_save_pdf_reader(t,(a->>'artifact_id')::uuid,jsonb_build_object('remove_highlight',removed->'id'));
  perform public.rt_workspace_change(t,null,'patch_state',
    '{"target":"project","version":0,"patch":{"tags":[{"id":"methods","name":"Methods","color":"#0A4599"}],"filterTag":"methods"}}',gen_random_uuid());
  edit:=jsonb_build_object('target','paper','id',p->'document_use_id','version',0,
    'paper_fields','{"title":"Edited synthetic A","date":"2026-11-27","purpose_text":"Read tables"}'::jsonb,
    'patch','{"tag":"methods","authors":"R. Example","year":"2026"}'::jsonb);
  receipt:=public.rt_workspace_change(t,null,'patch_state',edit,key);
  assert receipt->'paper_fields'=edit->'paper_fields' and receipt->'data'=edit->'patch';
  perform public.rt_workspace_change(t,null,'patch_state',jsonb_build_object('target','artifact','id',a->'artifact_id','version',0,
    'patch',jsonb_build_object('cards',jsonb_build_object(capture_id,jsonb_build_object('kind','source','page',2,
      'rects','[[0.2,0.3,0.4,0.1]]'::jsonb,'record_id',memo,'text','Crop A',
      'img','data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jme8AAAAASUVORK5CYII=')))),gen_random_uuid());
  insert into product_clients.saved values(pg_backend_pid(),t,(p->>'document_use_id')::uuid,(q->>'document_use_id')::uuid,
    a,b,l-'task_id',memo,h,capture_id,key,edit,receipt);
end $$;
reset role;
-- Model Storage's committed object catalog, not a Storage HTTP upload.
insert into storage.objects(bucket_id,name,metadata)
  select 'researchtrail-pdfs',edition->>'object_name',jsonb_build_object('size',edition->'size_bytes','mimetype','application/pdf')
    from product_clients.saved
  union all select 'researchtrail-pdfs',sibling->>'object_name',jsonb_build_object('size',sibling->'size_bytes','mimetype','application/pdf')
    from product_clients.saved;
