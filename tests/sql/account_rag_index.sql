-- 팀 승인 전 초안. 근거: docs/spikes/linked_papers_rag.md 3.3절·5절·7절 L1·L7, SPEC AC5·NF6.
-- 합성 구절과 고정 벡터로 저장 규칙만 확인한다. 임베딩 품질과 검색 정확도는 미검증이다.
set role authenticated;
do $case$
declare
  a uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  b uuid := 'bbbbbbbb-0000-4000-8000-000000000002';
  t1 uuid; t2 uuid; tb uuid; use1 uuid; use2 uuid; art1 uuid; art2 uuid; nopdf uuid; reg jsonb;
  settings jsonb := jsonb_build_object('pdf_sha256',repeat('1',64),'chunker','pages-1600-320','embedding_model','synthetic-1536');
  vec jsonb := (select jsonb_agg(0.5) from generate_series(1,1536));
  one jsonb; two jsonb; three jsonb; result jsonb; body jsonb; n bigint;
begin
  perform set_config('request.jwt.claim.sub', a::text, false);
  t1 := (public.rt_create_task('{"goal_text":"색인 합성 과업"}', gen_random_uuid())->>'task_id')::uuid;
  t2 := (public.rt_create_task('{"goal_text":"다른 합성 과업"}', gen_random_uuid())->>'task_id')::uuid;
  reg := public.rt_register_paper(t1,'{"document":{"title":"색인 합성 논문 1"},"artifacts":[{"access_locator_text":"https://example.invalid/no-pdf"}]}',gen_random_uuid());
  use1 := (reg->>'document_use_id')::uuid; nopdf := (reg->'artifact_ids'->>0)::uuid;
  use2 := (public.rt_register_paper(t1,'{"document":{"title":"색인 합성 논문 2"}}',gen_random_uuid())->>'document_use_id')::uuid;
  art1 := (public.rt_prepare_paper_pdf(t1,use1,'one.pdf',repeat('1',64),1000)->>'artifact_id')::uuid;
  art2 := (public.rt_prepare_paper_pdf(t1,use2,'two.pdf',repeat('2',64),2000)->>'artifact_id')::uuid;
  one := jsonb_build_object('page',1,'start',0,'end',1600,'text','합성 구절 하나','embedding',vec);
  two := jsonb_build_object('page',1,'start',1280,'end',2880,'text','합성 구절 둘','embedding',vec);
  three := jsonb_build_object('page',2,'start',0,'end',900,'text','합성 구절 셋','embedding',vec);

  -- Only uploaded PDF editions are listed, and an edition with no index reports null, not a state.
  result := public.rt_rag_index_status(t1)->'artifacts';
  assert jsonb_array_length(result) = 2;
  assert (select bool_and(x->'index' = 'null') from jsonb_array_elements(result) x);
  assert not exists(select from jsonb_array_elements(result) x where x->>'artifact_id' = nopdf::text);
  assert public.rt_rag_index_status(t2) = '{"artifacts":[]}';

  -- Passages cannot arrive before an index is started, and starting needs the stored PDF's own fingerprint.
  begin perform public.rt_rag_add_chunks(t1,art1,jsonb_build_array(one)); raise exception 'chunks stored without an index';
  exception when invalid_parameter_value then null; end;
  begin perform public.rt_rag_begin_index(t1,art1,jsonb_set(settings,'{pdf_sha256}',to_jsonb(repeat('9',64)))); raise exception 'wrong fingerprint accepted';
  exception when invalid_parameter_value then null; end;
  begin perform public.rt_rag_begin_index(t1,art1,settings - 'chunker'); raise exception 'settings omitted';
  exception when invalid_parameter_value then null; end;
  begin perform public.rt_rag_begin_index(t1,nopdf,settings); raise exception 'edition without a PDF indexed';
  exception when no_data_found then null; end;
  begin perform public.rt_rag_begin_index(t2,art1,settings); raise exception 'edition indexed through another task';
  exception when no_data_found then null; end;

  result := public.rt_rag_begin_index(t1,art1,settings);
  assert result = jsonb_build_object('artifact_id',art1,'status','indexing','chunk_count',null,
    'chunker','pages-1600-320','embedding_model','synthetic-1536');
  result := public.rt_rag_add_chunks(t1,art1,jsonb_build_array(one,two));
  assert result = jsonb_build_object('artifact_id',art1,'received',2,'stored',2);
  -- A batch sent again stores nothing twice.
  assert public.rt_rag_add_chunks(t1,art1,jsonb_build_array(one,two))->>'stored' = '2';

  -- A malformed batch stores none of its passages.
  foreach body in array array[
    '[]'::jsonb, '{}'::jsonb,
    jsonb_build_array(three, three - 'embedding'),
    jsonb_build_array(three, jsonb_set(three,'{embedding}','[0.5,0.5]')),
    jsonb_build_array(three, jsonb_set(three,'{page}','"2"')),
    jsonb_build_array(three, three || '{"owner_id":"bbbbbbbb-0000-4000-8000-000000000002"}'),
    jsonb_build_array(three, jsonb_set(three,'{text}','"   "')),
    jsonb_build_array(three, jsonb_set(three,'{page}','0')),
    jsonb_build_array(three, jsonb_set(three,'{end}','0'))
  ] loop
    begin perform public.rt_rag_add_chunks(t1,art1,body); raise exception 'invalid batch accepted: %', left(body::text,80);
    exception when invalid_parameter_value or check_violation then null; end;
  end loop;
  select count(*) into n from researchtrail.rag_chunks where artifact_id=art1;
  assert n = 2;

  -- L7: an upload that stopped early is not ready, whatever count the browser claims.
  begin perform public.rt_rag_finish_index(t1,art1,3); raise exception 'incomplete index finished';
  exception when invalid_parameter_value then null; end;
  begin perform public.rt_rag_finish_index(t1,art1,null); raise exception 'finished without a count';
  exception when invalid_parameter_value then null; end;
  assert (select x#>>'{index,status}' from jsonb_array_elements(public.rt_rag_index_status(t1)->'artifacts') x
    where x->>'artifact_id' = art1::text) = 'indexing';
  begin perform public.rt_rag_begin_index(t1,art2,jsonb_set(settings,'{pdf_sha256}',to_jsonb(repeat('2',64))));
    perform public.rt_rag_finish_index(t1,art2,0); raise exception 'empty index finished';
  exception when invalid_parameter_value then null; end;

  perform public.rt_rag_add_chunks(t1,art1,jsonb_build_array(three));
  result := public.rt_rag_finish_index(t1,art1,3);
  assert result = jsonb_build_object('artifact_id',art1,'status','ready','chunk_count',3,
    'chunker','pages-1600-320','embedding_model','synthetic-1536');
  -- Finishing again with the same count changes nothing; a different count is refused.
  assert public.rt_rag_finish_index(t1,art1,3) = result;
  begin perform public.rt_rag_finish_index(t1,art1,2); raise exception 'finished index recounted';
  exception when invalid_parameter_value then null; end;
  -- A finished index takes no more passages.
  begin perform public.rt_rag_add_chunks(t1,art1,jsonb_build_array(one)); raise exception 'finished index changed';
  exception when invalid_parameter_value then null; end;
  assert (select count(*) from researchtrail.rag_paper_index where artifact_id=art1 and paper_embedding is not null) = 1;
  -- The edition whose index was never started stays unindexed, and the list keeps a fixed order.
  result := public.rt_rag_index_status(t1)->'artifacts';
  assert (select x->'index' from jsonb_array_elements(result) x where x->>'artifact_id' = art2::text) = 'null';
  assert (select array_agg((x->>'artifact_id')::uuid order by position) from jsonb_array_elements(result) with ordinality l(x,position))
    = (select array_agg(d.artifact_id order by d.created_at desc,d.artifact_id) from researchtrail.document_artifacts d
       where d.artifact_id in (art1,art2));

  -- L7: starting again replaces the stored passages and the index is not ready until it finishes again.
  perform public.rt_rag_begin_index(t1,art1,jsonb_set(settings,'{chunker}','"pages-800-160"'));
  select count(*) into n from researchtrail.rag_chunks where artifact_id=art1;
  assert n = 0;
  assert (select x#>'{index}' from jsonb_array_elements(public.rt_rag_index_status(t1)->'artifacts') x
    where x->>'artifact_id' = art1::text) = jsonb_build_object('status','indexing','chunk_count',null,
      'chunker','pages-800-160','embedding_model','synthetic-1536');
  perform public.rt_rag_add_chunks(t1,art1,jsonb_build_array(one));
  perform public.rt_rag_finish_index(t1,art1,1);

  -- L1: another account can neither read nor write this index, directly or through its own task.
  perform set_config('request.jwt.claim.sub', b::text, false);
  tb := (public.rt_create_task('{"goal_text":"다른 계정의 색인 과업"}', gen_random_uuid())->>'task_id')::uuid;
  begin perform public.rt_rag_index_status(t1); raise exception 'foreign index status readable';
  exception when no_data_found then null; end;
  begin perform public.rt_rag_begin_index(tb,art1,settings); raise exception 'foreign edition restarted';
  exception when no_data_found then null; end;
  begin perform public.rt_rag_add_chunks(t1,art1,jsonb_build_array(two)); raise exception 'foreign index written';
  exception when no_data_found then null; end;
  begin perform public.rt_rag_finish_index(tb,art1,1); raise exception 'foreign index finished';
  exception when no_data_found then null; end;
  assert public.rt_rag_index_status(tb) = '{"artifacts":[]}';
  select (select count(*) from researchtrail.rag_chunks) + (select count(*) from researchtrail.rag_paper_index) into n;
  assert n = 0;
  foreach body in array array['"rag_paper_index"'::jsonb,'"rag_chunks"'::jsonb] loop
    assert row_security_active(('researchtrail.' || (body #>> '{}'))::regclass);
    assert not has_any_column_privilege(current_user,'researchtrail.' || (body #>> '{}'),'INSERT,UPDATE');
    assert not has_table_privilege(current_user,'researchtrail.' || (body #>> '{}'),'DELETE,TRUNCATE');
  end loop;

  perform set_config('request.jwt.claim.sub', a::text, false);
  select count(*) into n from researchtrail.rag_chunks where artifact_id=art1;
  assert n = 1;
  assert (select x#>>'{index,status}' from jsonb_array_elements(public.rt_rag_index_status(t1)->'artifacts') x
    where x->>'artifact_id' = art1::text) = 'ready';
end
$case$;
reset role;
set role anon;
do $case$
begin
  assert not exists (select from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and left(p.proname,7)='rt_rag_' and has_function_privilege(current_user,p.oid,'EXECUTE'));
end
$case$;
reset role;
