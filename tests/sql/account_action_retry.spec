# SPEC §5.4 / AC4. Both clients explicitly confirm the same saved review.
setup {
  insert into researchtrail.research_tasks(task_id,owner_id,goal_text) values
    ('f8000000-0000-4000-a000-000000000001','aaaaaaaa-0000-4000-8000-000000000001','합성 확인 경쟁');
  insert into researchtrail.research_records(record_id,owner_id,task_id,request_id,request_hash,content_text)
    select 'f8000000-0000-4000-a000-000000000002',owner_id,task_id,gen_random_uuid(),sha256('fixture'),'합성 메모'
    from researchtrail.research_tasks where task_id='f8000000-0000-4000-a000-000000000001';
  create function public.fixture_confirm() returns jsonb language sql security invoker as $$
    select public.rt_confirm_action('f8000000-0000-4000-a000-000000000001',
      jsonb_build_object('confirmed',true,'source_record_id','f8000000-0000-4000-a000-000000000002',
        'original_candidate',jsonb_build_object('action_text','비교'),'reviewed_action',jsonb_build_object('action_text','합성 표 대조'),
        'links',jsonb_build_object('target_record_ids',jsonb_build_array('f8000000-0000-4000-a000-000000000002'))),
      'f8000000-0000-4000-a000-000000000003');
  $$;
}
teardown {
  drop function public.fixture_confirm();
  delete from researchtrail.research_tasks where task_id='f8000000-0000-4000-a000-000000000001';
}

session "first"
setup { set role authenticated; set request.jwt.claim.sub='aaaaaaaa-0000-4000-8000-000000000001'; }
step "begin_confirm" { begin; }
step "confirm" { select public.fixture_confirm(); }
step "commit_confirm" { commit; }
step "rollback_confirm" { rollback; }

session "second"
setup { set role authenticated; set request.jwt.claim.sub='aaaaaaaa-0000-4000-8000-000000000001'; }
step "retry" { create temporary table received as select public.fixture_confirm() as receipt; }
step "verify" {
  do $$
  declare actions jsonb := public.rt_resume('f8000000-0000-4000-a000-000000000001')->'next_actions';
  begin
    assert jsonb_array_length(actions)=1;
    assert actions->0->>'next_action_id'=(select receipt->>'next_action_id' from received);
    assert actions->0->'original_candidate'->>'action_text'='비교';
    assert actions->0->'saved_action'->>'action_text'='합성 표 대조';
    assert actions->0->'links'->'target_record_ids'=jsonb_build_array('f8000000-0000-4000-a000-000000000002');
  end $$;
  drop table received;
}
permutation "begin_confirm" "confirm" "retry" "commit_confirm" "verify"
permutation "begin_confirm" "confirm" "retry" "rollback_confirm" "verify"
