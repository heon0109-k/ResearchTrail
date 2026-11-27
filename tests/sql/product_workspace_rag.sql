-- Draft AC5/open-PDF scope. An archived card's retained index must stay out of
-- retrieval and must not be restarted from a stale reader. No provider calls.
set role authenticated;
do $$
declare
  task uuid; paper uuid; artifact uuid; result jsonb;
  vector_input jsonb:=(select jsonb_agg((n=1)::int order by n) from generate_series(1,1536) n);
  settings jsonb:=jsonb_build_object('pdf_sha256',repeat('6',64),'chunker','pages-1600-320','embedding_model','synthetic-1536');
begin
  perform set_config('request.jwt.claim.sub','aaaaaaaa-0000-4000-8000-000000000001',false);
  task:=(public.rt_create_task('{"goal_text":"Scope after archive"}',gen_random_uuid())->>'task_id')::uuid;
  result:=public.rt_register_paper(task,'{"document":{"title":"Indexed paper"}}',gen_random_uuid());
  paper:=(result->>'document_use_id')::uuid;
  artifact:=(public.rt_prepare_paper_pdf(task,paper,'fixture.pdf',repeat('6',64),70)->>'artifact_id')::uuid;
  perform public.rt_rag_begin_index(task,artifact,settings);
  perform public.rt_rag_add_chunks(task,artifact,jsonb_build_array(jsonb_build_object('page',1,'start',0,'end',4,'text','text','embedding',vector_input)));
  perform public.rt_rag_finish_index(task,artifact,1);
  assert public.rt_rag_index_status(task)#>>'{artifacts,0,index,status}'='ready';
  perform public.rt_workspace_change(task,paper,'archive_paper','{}',gen_random_uuid());
  assert public.rt_rag_index_status(task)->'artifacts'='[]';
  assert public.rt_rag_scope(task,vector_input)->'papers'='[]';
  result:=public.rt_rag_search(task,jsonb_build_object('artifact_ids',jsonb_build_array(artifact),'current_artifact_id',artifact,
    'embedding',vector_input,'match_count',3));
  assert result='{"matches":[],"current":[]}';
  begin perform public.rt_rag_begin_index(task,artifact,settings); raise exception 'archived index restarted';
  exception when no_data_found then null; end;
end $$;
reset role;
