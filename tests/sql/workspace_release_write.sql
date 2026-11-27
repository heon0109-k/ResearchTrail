-- Draft AC5 regression on a disposable database. Keep the first client's expected
-- receipts in the test harness across independent PostgreSQL backend sessions.
create schema release_fixture;
create unlogged table release_fixture.expected(task uuid,paper uuid,other uuid,artifact uuid,sibling uuid,record uuid,mark jsonb,link jsonb);
grant usage on schema release_fixture to authenticated;
grant select, insert on release_fixture.expected to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-4000-8000-000000000001',false);
begin;
do $$
declare
  t uuid; p jsonb; q jsonb; a uuid; sibling uuid; r jsonb; h jsonb; l jsonb; memo jsonb;
begin
  t := (public.rt_create_task('{"goal_text":"release fixture"}',gen_random_uuid())->>'task_id')::uuid;
  p := public.rt_register_paper(t,'{"document":{"title":"Paper A"}}',gen_random_uuid());
  q := public.rt_register_paper(t,'{"document":{"title":"Paper B"}}',gen_random_uuid());
  a := (public.rt_prepare_paper_pdf(t,(p->>'document_use_id')::uuid,'same.pdf',repeat('a',64),100)->>'artifact_id')::uuid;
  sibling := (public.rt_prepare_paper_pdf(t,(p->>'document_use_id')::uuid,'same.pdf',repeat('b',64),120)->>'artifact_id')::uuid;
  l := public.rt_link_papers(t,jsonb_build_object('from_document_use_id',p->'document_use_id',
    'to_document_use_id',q->'document_use_id','reason_text','follow-up experiment'),gen_random_uuid());
  memo := jsonb_build_object('record',jsonb_build_object('content_text','  synthetic reader memo  '),
    'context',jsonb_build_object('document_contexts',jsonb_build_array(jsonb_build_object(
      'document_ref',jsonb_build_object('document_id',p->'document_id'),'use','{}'::jsonb,
      'artifact_ref',jsonb_build_object('artifact_id',a)))));
  r := public.rt_save_record(t,memo,gen_random_uuid());
  h := jsonb_build_object('id',gen_random_uuid(),'page',2,'rects','[[0.1,0.2,0.3,0.04]]'::jsonb,
    'text','Synthetic passage','record_id',r->'record_id');
  perform public.rt_save_pdf_reader(t,a,jsonb_build_object('highlight',h));
  perform public.rt_save_pdf_reader(t,a,'{"last_page":2}');
  insert into release_fixture.expected values(t,(p->>'document_use_id')::uuid,(q->>'document_use_id')::uuid,a,sibling,(r->>'record_id')::uuid,h,l-'task_id');
end $$;
commit;
