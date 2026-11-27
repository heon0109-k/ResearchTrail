-- 팀 승인 전 초안. 근거: SPEC AC5(과업 경계), NF6(접근할 수 없는 자원을 연결하지 않음), 5.1절 오류 규약,
-- 브라우저 앱의 연결 규칙(web/js/helpers.js linkError). 통과해도 화면 연결이나 제품 수용 완료를 뜻하지 않는다.
set role authenticated;
do $case$
declare
  a uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  b uuid := 'bbbbbbbb-0000-4000-8000-000000000002';
  t1 uuid; t2 uuid; tb uuid; p1 uuid; p2 uuid; p3 uuid; p4 uuid; q1 uuid; pb uuid;
  req uuid := gen_random_uuid();
  first_body jsonb; saved jsonb; link1 uuid; rows jsonb; body jsonb; ids uuid[]; n bigint;
begin
  perform set_config('request.jwt.claim.sub', a::text, false);
  t1 := (public.rt_create_task('{"goal_text":"연결 합성 과업"}', gen_random_uuid())->>'task_id')::uuid;
  t2 := (public.rt_create_task('{"goal_text":"다른 합성 과업"}', gen_random_uuid())->>'task_id')::uuid;
  p1 := (public.rt_register_paper(t1,'{"document":{"title":"합성 논문 1"}}',gen_random_uuid())->>'document_use_id')::uuid;
  p2 := (public.rt_register_paper(t1,'{"document":{"title":"합성 논문 2"}}',gen_random_uuid())->>'document_use_id')::uuid;
  p3 := (public.rt_register_paper(t1,'{"document":{"title":"합성 논문 3"}}',gen_random_uuid())->>'document_use_id')::uuid;
  p4 := (public.rt_register_paper(t1,'{"document":{"title":"합성 논문 4"}}',gen_random_uuid())->>'document_use_id')::uuid;
  q1 := (public.rt_register_paper(t2,'{"document":{"title":"다른 과업 논문"}}',gen_random_uuid())->>'document_use_id')::uuid;

  -- A task with no registered link returns an empty list, not an error.
  assert public.rt_paper_links(t1) = '{"links":[]}';

  -- Saving a link returns what was stored, and the same request saved twice is one link.
  first_body := jsonb_build_object('from_document_use_id',p1,'to_document_use_id',p2,'reason_text','같은 평가 지표를 쓴다');
  saved := public.rt_link_papers(t1,first_body,req);
  link1 := (saved->>'link_id')::uuid;
  assert saved = jsonb_build_object('task_id',t1,'link_id',link1,'from_document_use_id',p1,'to_document_use_id',p2,
    'reason_text','같은 평가 지표를 쓴다');
  assert public.rt_link_papers(t1,first_body,req) = saved;
  assert jsonb_array_length(public.rt_paper_links(t1)->'links') = 1;
  begin
    perform public.rt_link_papers(t1,jsonb_set(first_body,'{reason_text}','"다른 이유"'),req);
    raise exception 'retry changed link';
  exception when invalid_parameter_value then null; end;
  assert public.rt_paper_links(t1)->'links'->0->>'reason_text' = '같은 평가 지표를 쓴다';

  -- A reason is optional. An omitted or blank reason is stored as not recorded.
  perform public.rt_link_papers(t1,jsonb_build_object('from_document_use_id',p2,'to_document_use_id',p3),gen_random_uuid());
  saved := public.rt_link_papers(t1,jsonb_build_object('from_document_use_id',p4,'to_document_use_id',p1,'reason_text','   '),gen_random_uuid());
  assert saved->'reason_text' = 'null';
  -- A second path in the same direction is not a loop.
  perform public.rt_link_papers(t1,jsonb_build_object('from_document_use_id',p1,'to_document_use_id',p3,'reason_text',null),gen_random_uuid());
  rows := public.rt_paper_links(t1)->'links';
  assert jsonb_array_length(rows) = 4;
  assert (select count(*) from jsonb_array_elements(rows) r where r->'reason_text' = 'null') = 3;

  -- Same paper, an existing pair in either direction, a loop, another task's paper, an absent or malformed ID.
  foreach body in array array[
    jsonb_build_object('from_document_use_id',p1,'to_document_use_id',p1),
    jsonb_build_object('from_document_use_id',p1,'to_document_use_id',p2),
    jsonb_build_object('from_document_use_id',p2,'to_document_use_id',p1),
    jsonb_build_object('from_document_use_id',p3,'to_document_use_id',p4),
    jsonb_build_object('from_document_use_id',p1,'to_document_use_id',q1),
    jsonb_build_object('from_document_use_id',q1,'to_document_use_id',p4),
    jsonb_build_object('from_document_use_id',p2,'to_document_use_id',gen_random_uuid()),
    jsonb_build_object('from_document_use_id',p2,'to_document_use_id','not-an-id'),
    jsonb_build_object('from_document_use_id',42,'to_document_use_id',p4)
  ] loop
    begin perform public.rt_link_papers(t1,body,gen_random_uuid()); raise exception 'invalid link accepted: %', body;
    exception when sqlstate 'RT001' then null; end;
  end loop;
  -- A missing end, an unknown field or a non-text reason is invalid input.
  foreach body in array array[
    jsonb_build_object('from_document_use_id',p2),
    jsonb_build_object('from_document_use_id',p2,'to_document_use_id',p4,'owner_id',b),
    jsonb_build_object('from_document_use_id',p2,'to_document_use_id',p4,'reason_text',42)
  ] loop
    begin perform public.rt_link_papers(t1,body,gen_random_uuid()); raise exception 'invalid input accepted: %', body;
    exception when invalid_parameter_value then null; end;
  end loop;
  begin
    perform public.rt_link_papers(t1,jsonb_build_object('from_document_use_id',p2,'to_document_use_id',p4),null);
    raise exception 'link saved without a request ID';
  exception when invalid_parameter_value then null; end;
  -- No rejected request left a link behind, and the other task has none.
  assert jsonb_array_length(public.rt_paper_links(t1)->'links') = 4;
  assert public.rt_paper_links(t2) = '{"links":[]}';

  -- The list has a fixed order: saved time descending, then link ID ascending.
  select array_agg((r->>'link_id')::uuid order by position) into ids
    from jsonb_array_elements(public.rt_paper_links(t1)->'links') with ordinality as l(r,position);
  assert ids = (select array_agg(l.link_id order by l.created_at desc,l.link_id)
    from researchtrail.document_use_links l where l.task_id=t1);
  assert public.rt_paper_links(t1) = public.rt_paper_links(t1);

  perform set_config('request.jwt.claim.sub', b::text, false);
  begin perform public.rt_paper_links(t1); raise exception 'foreign links readable';
  exception when no_data_found then null; end;
  begin perform public.rt_paper_links(gen_random_uuid()); raise exception 'absent task readable';
  exception when no_data_found then null; end;
  begin
    perform public.rt_link_papers(t1,jsonb_build_object('from_document_use_id',p2,'to_document_use_id',p4),gen_random_uuid());
    raise exception 'foreign task linkable';
  exception when no_data_found then null; end;
  tb := (public.rt_create_task('{"goal_text":"다른 계정의 합성 과업"}', gen_random_uuid())->>'task_id')::uuid;
  pb := (public.rt_register_paper(tb,'{"document":{"title":"다른 계정 논문"}}',gen_random_uuid())->>'document_use_id')::uuid;
  begin
    perform public.rt_link_papers(tb,jsonb_build_object('from_document_use_id',pb,'to_document_use_id',p1),gen_random_uuid());
    raise exception 'foreign paper linked to own task';
  exception when sqlstate 'RT001' then null; end;
  -- Another account's request ID does not collide with, or reveal, the first account's link.
  begin perform public.rt_link_papers(tb,first_body,req); raise exception 'foreign papers linked through a reused request';
  exception when sqlstate 'RT001' then null; end;
  assert public.rt_paper_links(tb) = '{"links":[]}';
  select count(*) into n from researchtrail.document_use_links;
  assert n = 0;
  assert row_security_active('researchtrail.document_use_links'::regclass);
  assert not has_any_column_privilege(current_user,'researchtrail.document_use_links','INSERT,UPDATE');
  assert not has_table_privilege(current_user,'researchtrail.document_use_links','DELETE,TRUNCATE');
  begin
    insert into researchtrail.document_use_links(task_id,from_document_use_id,to_document_use_id,request_id,request_hash)
      values(tb,pb,pb,gen_random_uuid(),'\x00');
    raise exception 'direct link insert granted';
  exception when insufficient_privilege then null; end;

  perform set_config('request.jwt.claim.sub', a::text, false);
  assert jsonb_array_length(public.rt_paper_links(t1)->'links') = 4;
end
$case$;
reset role;
set role anon;
do $case$
begin
  assert not has_function_privilege(current_user,'public.rt_paper_links(uuid)','EXECUTE');
  assert not has_function_privilege(current_user,'public.rt_link_papers(uuid,jsonb,uuid)','EXECUTE');
end
$case$;
reset role;
