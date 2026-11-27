# Two uploads of the same content can reserve an artifact before either Storage write has completed.
setup {
  set request.jwt.claim.sub='aaaaaaaa-0000-4000-8000-000000000001';
  create table public.pdf_retry_paper as
    with task as (select public.rt_create_task(jsonb_build_object('goal_text','합성 PDF'),gen_random_uuid()) as reply)
    select public.rt_register_paper((reply->>'task_id')::uuid,jsonb_build_object('document',jsonb_build_object('title','합성 논문')),
      gen_random_uuid()) as paper from task;
  grant select on public.pdf_retry_paper to authenticated;
  create function public.fixture_reserve() returns jsonb language sql security invoker as $$
    select public.rt_prepare_paper_pdf((paper->>'task_id')::uuid,(paper->>'document_use_id')::uuid,
      'fixture.pdf',repeat('b',64),300) from public.pdf_retry_paper
  $$;
}
teardown {
  drop function public.fixture_reserve();
  delete from researchtrail.research_tasks where task_id=(select (paper->>'task_id')::uuid from public.pdf_retry_paper);
  delete from researchtrail.documents where document_id=(select (paper->>'document_id')::uuid from public.pdf_retry_paper);
  drop table public.pdf_retry_paper;
}

session "first"
setup { set role authenticated; set request.jwt.claim.sub='aaaaaaaa-0000-4000-8000-000000000001'; }
step "begin_upload" { begin; }
step "reserve" { select public.fixture_reserve(); }
step "commit_upload" { commit; }
step "cancel_upload" { rollback; }

session "retry"
setup { set role authenticated; set request.jwt.claim.sub='aaaaaaaa-0000-4000-8000-000000000001'; }
step "repeat_upload" { create temporary table received as select public.fixture_reserve() as reply; }
step "verify" {
  do $$
  declare receipt jsonb:=(select reply from received);
  begin
    assert (select count(*)=1 from researchtrail.document_artifacts where
      document_use_id=(select (paper->>'document_use_id')::uuid from public.pdf_retry_paper));
    assert exists(select from researchtrail.document_artifacts where artifact_id=(receipt->>'artifact_id')::uuid
      and pdf_object_name=receipt->>'object_name');
  end $$;
  drop table received;
}
permutation "begin_upload" "reserve" "repeat_upload" "commit_upload" "verify"
permutation "begin_upload" "reserve" "repeat_upload" "cancel_upload" "verify"
