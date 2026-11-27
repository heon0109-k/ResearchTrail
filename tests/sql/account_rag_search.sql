-- 팀 승인 전 초안. 근거: docs/spikes/linked_papers_rag.md 3.1·3.4절, 7절 L1·L7, SPEC AC5·NF6, AGENTS 5절의 결정적 정렬.
-- 서로 직교하는 합성 벡터로 순서와 경계만 확인한다. 실제 임베딩의 검색 품질은 미검증이다.
set role authenticated;
do $case$
declare
  a uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  b uuid := 'bbbbbbbb-0000-4000-8000-000000000002';
  t1 uuid; t2 uuid; tb uuid; p1 uuid; p2 uuid; p3 uuid; p4 uuid; art1 uuid; art2 uuid; art3 uuid;
  e1 jsonb := (select jsonb_agg((g=1)::int order by g) from generate_series(1,1536) g);
  e2 jsonb := (select jsonb_agg((g=2)::int order by g) from generate_series(1,1536) g);
  e3 jsonb := (select jsonb_agg((g=3)::int order by g) from generate_series(1,1536) g);
  e12 jsonb := (select jsonb_agg((g<=2)::int order by g) from generate_series(1,1536) g);
  settings jsonb := '{"chunker":"pages-1600-320","embedding_model":"synthetic-1536"}';
  scope jsonb; found jsonb; body jsonb; x jsonb;
begin
  perform set_config('request.jwt.claim.sub', a::text, false);
  t1 := (public.rt_create_task('{"goal_text":"검색 합성 과업"}', gen_random_uuid())->>'task_id')::uuid;
  t2 := (public.rt_create_task('{"goal_text":"다른 합성 과업"}', gen_random_uuid())->>'task_id')::uuid;
  p1 := (public.rt_register_paper(t1,'{"document":{"title":"검색 합성 논문 1"}}',gen_random_uuid())->>'document_use_id')::uuid;
  p2 := (public.rt_register_paper(t1,'{"document":{"title":"검색 합성 논문 2"}}',gen_random_uuid())->>'document_use_id')::uuid;
  p3 := (public.rt_register_paper(t1,'{"document":{"title":"검색 합성 논문 3"}}',gen_random_uuid())->>'document_use_id')::uuid;
  p4 := (public.rt_register_paper(t1,'{"document":{"title":"PDF 없는 합성 논문"}}',gen_random_uuid())->>'document_use_id')::uuid;
  art1 := (public.rt_prepare_paper_pdf(t1,p1,'s1.pdf',repeat('5',64),1000)->>'artifact_id')::uuid;
  art2 := (public.rt_prepare_paper_pdf(t1,p2,'s2.pdf',repeat('6',64),1000)->>'artifact_id')::uuid;
  art3 := (public.rt_prepare_paper_pdf(t1,p3,'s3.pdf',repeat('7',64),1000)->>'artifact_id')::uuid;
  perform public.rt_link_papers(t1,jsonb_build_object('from_document_use_id',p1,'to_document_use_id',p2),gen_random_uuid());
  perform public.rt_link_papers(t1,jsonb_build_object('from_document_use_id',p2,'to_document_use_id',p3),gen_random_uuid());

  perform public.rt_rag_begin_index(t1,art1,settings || jsonb_build_object('pdf_sha256',repeat('5',64)));
  perform public.rt_rag_add_chunks(t1,art1,jsonb_build_array(
    jsonb_build_object('page',1,'start',0,'end',1600,'text','첫째 합성 구절','embedding',e1),
    jsonb_build_object('page',1,'start',1280,'end',2880,'text','둘째 합성 구절','embedding',e2),
    jsonb_build_object('page',2,'start',0,'end',900,'text','셋째 합성 구절','embedding',e3)));
  perform public.rt_rag_finish_index(t1,art1,3);
  perform public.rt_rag_begin_index(t1,art2,settings || jsonb_build_object('pdf_sha256',repeat('6',64)));
  perform public.rt_rag_add_chunks(t1,art2,jsonb_build_array(
    jsonb_build_object('page',4,'start',0,'end',1600,'text','다른 논문의 합성 구절','embedding',e12)));
  perform public.rt_rag_finish_index(t1,art2,1);
  -- The third paper's upload stopped: its passage would be the closest match if it were searched.
  perform public.rt_rag_begin_index(t1,art3,settings || jsonb_build_object('pdf_sha256',repeat('7',64)));
  perform public.rt_rag_add_chunks(t1,art3,jsonb_build_array(
    jsonb_build_object('page',1,'start',0,'end',1600,'text','끊긴 색인의 합성 구절','embedding',e1)));

  -- Scope: every paper of the task is listed, with editions, index state and the task's links.
  scope := public.rt_rag_scope(t1,e1);
  assert jsonb_array_length(scope->'papers') = 4 and jsonb_array_length(scope->'links') = 2;
  assert (select p->'editions' from jsonb_array_elements(scope->'papers') p where p->>'document_use_id' = p4::text) = '[]';
  select p->'editions'->0 into x from jsonb_array_elements(scope->'papers') p where p->>'document_use_id' = p1::text;
  assert x->>'artifact_id' = art1::text and x->>'status' = 'ready' and abs((x->>'similarity')::float8 - 0.5774) < 0.001;
  assert x->>'embedding_model' = 'synthetic-1536';
  select p->'editions'->0 into x from jsonb_array_elements(scope->'papers') p where p->>'document_use_id' = p2::text;
  assert x->>'status' = 'ready' and abs((x->>'similarity')::float8 - 0.7071) < 0.001;
  -- L7: an unfinished index reports its state and no similarity.
  select p->'editions'->0 into x from jsonb_array_elements(scope->'papers') p where p->>'document_use_id' = p3::text;
  assert x->>'status' = 'indexing' and x->'similarity' = 'null';
  assert (select p->>'title' from jsonb_array_elements(scope->'papers') p where p->>'document_use_id' = p1::text) = '검색 합성 논문 1';
  assert public.rt_rag_scope(t2,e1) = '{"papers":[],"links":[]}';

  -- Search: closest first, a fixed order among ties, and never a passage from an unfinished index (L7).
  body := jsonb_build_object('artifact_ids',jsonb_build_array(art1,art2,art3),'embedding',e1,'match_count',3,'current_artifact_id',art1);
  found := public.rt_rag_search(t1,body);
  assert jsonb_array_length(found->'matches') = 3;
  assert found->'matches'->0->>'artifact_id' = art1::text and found->'matches'->0->>'text' = '첫째 합성 구절'
    and abs((found->'matches'->0->>'similarity')::float8 - 1) < 0.001;
  assert found->'matches'->0 = jsonb_build_object('artifact_id',art1,'document_use_id',p1,'page',1,'start',0,'end',1600,
    'text','첫째 합성 구절','similarity',found->'matches'->0->'similarity');
  assert found->'matches'->1->>'artifact_id' = art2::text and (found->'matches'->1->>'page')::int = 4
    and abs((found->'matches'->1->>'similarity')::float8 - 0.7071) < 0.001;
  assert found->'matches'->2->>'text' = '둘째 합성 구절';
  assert not exists(select from jsonb_array_elements(found->'matches' || found->'current') m where m->>'artifact_id' = art3::text);
  -- The open edition's passages come back in reading order whatever their similarity.
  assert (select array_agg(m->>'text' order by position) from jsonb_array_elements(found->'current') with ordinality c(m,position))
    = array['첫째 합성 구절','둘째 합성 구절','셋째 합성 구절'];
  assert public.rt_rag_search(t1,body) = found;
  assert jsonb_array_length(public.rt_rag_search(t1,jsonb_set(body,'{match_count}','1'))->'matches') = 1;
  -- Only requested editions are matched, and the open edition is optional.
  found := public.rt_rag_search(t1,jsonb_build_object('artifact_ids',jsonb_build_array(art2),'embedding',e1,'match_count',5));
  assert jsonb_array_length(found->'matches') = 1 and found->'matches'->0->>'artifact_id' = art2::text and found->'current' = '[]';

  foreach x in array array[
    body - 'embedding', jsonb_set(body,'{embedding}','[1,0]'), jsonb_set(body,'{artifact_ids}','[]'),
    jsonb_set(body,'{match_count}','0'), jsonb_set(body,'{match_count}','101'), body - 'match_count',
    body || '{"owner_id":"bbbbbbbb-0000-4000-8000-000000000002"}'
  ] loop
    begin perform public.rt_rag_search(t1,x); raise exception 'invalid search accepted: %', left((x - 'embedding')::text,80);
    exception when invalid_parameter_value then null; end;
  end loop;
  begin perform public.rt_rag_search(t1,jsonb_set(body,'{artifact_ids}','["not-an-id"]')); raise exception 'malformed edition accepted';
  exception when sqlstate 'RT001' then null; end;
  begin perform public.rt_rag_scope(t1,'[1,0]'); raise exception 'short question vector accepted';
  exception when invalid_parameter_value then null; end;

  -- AC5: the same editions asked through another task of the same account match nothing.
  found := public.rt_rag_search(t2,body);
  assert found = '{"matches":[],"current":[]}';

  -- L1: another account sees neither the scope nor any passage, even when it names the editions.
  perform set_config('request.jwt.claim.sub', b::text, false);
  begin perform public.rt_rag_scope(t1,e1); raise exception 'foreign scope readable';
  exception when no_data_found then null; end;
  begin perform public.rt_rag_search(t1,body); raise exception 'foreign passages searchable';
  exception when no_data_found then null; end;
  tb := (public.rt_create_task('{"goal_text":"다른 계정의 검색 과업"}', gen_random_uuid())->>'task_id')::uuid;
  assert public.rt_rag_search(tb,body) = '{"matches":[],"current":[]}';
  assert public.rt_rag_scope(tb,e1) = '{"papers":[],"links":[]}';
  perform set_config('request.jwt.claim.sub', a::text, false);
end
$case$;
reset role;
