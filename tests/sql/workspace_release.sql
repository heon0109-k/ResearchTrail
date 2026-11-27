-- Draft AC5 regression. Open a second backend as the owner and compare every stored receipt.
set role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-4000-8000-000000000001',false);
do $$
declare
  f release_fixture.expected; snapshot jsonb; catalog jsonb; doc uuid; context_use uuid;
  entry jsonb; receipt jsonb;
begin
  select * into strict f from release_fixture.expected;
  snapshot := public.rt_resume(f.task);
  assert jsonb_array_length(snapshot->'records')=1 and snapshot#>>'{records,0,record_id}'=f.record::text;
  assert snapshot#>>'{records,0,record,content_text}'='  synthetic reader memo  ';
  assert snapshot#>'{records,0,context_refs,artifact_ids}'=jsonb_build_array(f.artifact);
  assert public.rt_paper_links(f.task)->'links'=jsonb_build_array(f.link);
  assert public.rt_pdf_reader(f.task,f.artifact)=jsonb_build_object('last_page',2,'highlights',jsonb_build_array(f.mark));
  assert public.rt_pdf_reader(f.task,f.sibling)='{"last_page":null,"highlights":[]}';
  catalog := public.rt_workspace_papers(f.task)->'papers';
  assert jsonb_array_length(catalog)=2, 'a reader memo must not add a third timeline paper';
  assert exists(select from jsonb_array_elements(catalog) p where p->>'document_use_id'=f.paper::text
    and jsonb_array_length(p->'artifacts')=2);
  assert jsonb_array_length(public.rt_papers(f.task)->'papers')=3, 'the legacy catalog retains all document uses';
  -- A separate explicit registration of the same work still gets its own card.
  doc := (snapshot#>>'{records,0,context_refs,document_ids,0}')::uuid;
  perform public.rt_register_paper(f.task,jsonb_build_object('document_id',doc),gen_random_uuid());
  assert jsonb_array_length(public.rt_workspace_papers(f.task)->'papers')=3;
  -- Links created by a legacy caller to a memo context keep their target visible.
  context_use := (snapshot#>>'{records,0,context_refs,document_use_ids,0}')::uuid;
  perform public.rt_link_papers(f.task,jsonb_build_object('from_document_use_id',f.other,'to_document_use_id',context_use),gen_random_uuid());
  assert jsonb_array_length(public.rt_workspace_papers(f.task)->'papers')=4;
  -- Legacy memo contexts can themselves be papers, carry a use reason or own an excerpt.
  for entry in select value from jsonb_array_elements(jsonb_build_array(
    '{"document_ref":{"document":{"title":"Only registered in a memo"}},"use":{}}'::jsonb,
    jsonb_build_object('document_ref',jsonb_build_object('document_id',doc),'use','{"purpose_text":"Compare methods"}'::jsonb),
    jsonb_build_object('document_ref',jsonb_build_object('document_id',doc),'use','{}'::jsonb,
      'artifact_ref',jsonb_build_object('artifact_id',f.artifact),'excerpt','{"locator_text":"p. 2"}'::jsonb)))
  loop
    receipt := public.rt_save_record(f.task,jsonb_build_object('record','{"content_text":"Legacy context"}'::jsonb,
      'context',jsonb_build_object('document_contexts',jsonb_build_array(entry))),gen_random_uuid());
    assert exists(select from jsonb_array_elements(public.rt_workspace_papers(f.task)->'papers') p
      where p->>'document_use_id'=receipt#>>'{context_refs,document_use_ids,0}');
  end loop;
  assert not has_function_privilege('anon','public.rt_workspace_papers(uuid)','execute');
  perform set_config('request.jwt.claim.sub','bbbbbbbb-0000-4000-8000-000000000002',true);
  begin perform public.rt_workspace_papers(f.task); raise exception 'foreign project readable';
  exception when no_data_found then null; end;
end $$;
reset role;
drop table release_fixture.expected;
drop schema release_fixture;
