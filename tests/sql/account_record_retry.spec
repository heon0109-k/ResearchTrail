# A lost response can be retried before the original transaction finishes.
setup {
  insert into researchtrail.research_tasks(task_id,owner_id,goal_text) values
    ('f1000000-0000-4000-a000-000000000001','aaaaaaaa-0000-4000-8000-000000000001','동시 저장 실험');
}
teardown {
  delete from researchtrail.research_tasks where task_id='f1000000-0000-4000-a000-000000000001';
}

session "first"
setup { set role authenticated; set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001'; }
step "begin_save" { begin; }
step "save" {
  select public.rt_save_record('f1000000-0000-4000-a000-000000000001',
    jsonb_build_object('record', jsonb_build_object('content_text',' 합성 메모 '),
      'context', jsonb_build_object('questions', jsonb_build_array(jsonb_build_object('question_text','합성 질문?')))),
    'f1000000-0000-4000-a000-000000000002')->>'record_id';
}
step "commit_save" { commit; }
step "cancel_save" { rollback; }

session "retry"
setup { set role authenticated; set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001'; }
step "repeat_save" {
  select public.rt_save_record('f1000000-0000-4000-a000-000000000001',
    jsonb_build_object('record', jsonb_build_object('content_text',' 합성 메모 '),
      'context', jsonb_build_object('questions', jsonb_build_array(jsonb_build_object('question_text','합성 질문?')))),
    'f1000000-0000-4000-a000-000000000002') as reply into temporary table retry_reply;
}
step "verify" {
  do $$
  declare result jsonb := (select reply from retry_reply);
  begin
    assert (select count(*)=1 from researchtrail.research_records where task_id='f1000000-0000-4000-a000-000000000001');
    assert (select count(*)=1 from researchtrail.research_questions where task_id='f1000000-0000-4000-a000-000000000001');
    assert exists(select from researchtrail.research_questions q join researchtrail.research_records r using(record_id)
      where r.content_text=' 합성 메모 ' and r.record_id=(result->>'record_id')::uuid
        and q.question_id=(result->'context_refs'->'question_ids'->>0)::uuid);
  end $$;
  drop table retry_reply;
}
permutation "begin_save" "save" "repeat_save" "commit_save" "verify"
permutation "begin_save" "save" "repeat_save" "cancel_save" "verify"
