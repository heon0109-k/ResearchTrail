-- Synthetic ownership cases for SPEC 5.1/5.2 and the task boundary in AC5.
set role authenticated;
do $case$
declare
  a uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  b uuid := 'bbbbbbbb-0000-4000-8000-000000000002';
  t1 uuid; t2 uuid; tb uuid; doc uuid; use1 uuid;
  req uuid := gen_random_uuid(); paper_req uuid := gen_random_uuid();
  task_data jsonb := '{"goal_text":"합성 목표","scope_text":"합성 범위"}';
  paper jsonb := '{"document":{"title":"합성 논문"},"use":{"purpose_text":"표 비교","reading_state_text":"읽는 중"},"artifacts":[{"label_text":"synthetic.pdf"},{"access_locator_text":"https://example.invalid/paper"}],"date":"2026-11-01"}';
  rows jsonb; rel text;
begin
  perform set_config('request.jwt.claim.sub', a::text, false);
  assert public.rt_tasks() = '{"tasks":[]}';
  t1 := (public.rt_create_task(task_data, req)->>'task_id')::uuid;
  assert (public.rt_create_task(task_data, req)->>'task_id')::uuid = t1;
  begin perform public.rt_create_task('{"goal_text":"different"}', req); raise exception 'retry changed task';
  exception when invalid_parameter_value then null; end;
  t2 := (public.rt_create_task('{"goal_text":"두 번째 목표"}', gen_random_uuid())->>'task_id')::uuid;
  assert jsonb_array_length(public.rt_tasks()->'tasks') = 2;
  assert public.rt_papers(t2) = '{"papers":[]}';
  use1 := (public.rt_register_paper(t1,paper,paper_req)->>'document_use_id')::uuid;
  assert (public.rt_register_paper(t1,paper,paper_req)->>'document_use_id')::uuid = use1;
  assert jsonb_array_length(public.rt_register_paper(t1,paper,paper_req)->'artifact_ids') = 2;
  rows := public.rt_papers(t1)->'papers';
  assert jsonb_array_length(rows) = 1;
  assert rows->0->'document'->>'title' = '합성 논문';
  assert rows->0->'use'->>'purpose_text' = '표 비교';
  assert rows->0->'use'->>'reading_state_text' = '읽는 중';
  assert jsonb_array_length(rows->0->'artifacts') = 2;
  doc := (rows->0->>'document_id')::uuid;
  perform public.rt_register_paper(t2,jsonb_build_object('document_id',doc,'use',jsonb_build_object('purpose_text','재현용')),gen_random_uuid());
  assert (public.rt_papers(t2)->'papers'->0->>'document_id')::uuid = doc;
  assert public.rt_papers(t2)->'papers'->0->'artifacts' = '[]';
  assert public.rt_papers(t2)->'papers'->0->'use'->>'reading_state_text' is null;
  begin
    perform public.rt_register_paper(t1,jsonb_set(paper,'{artifacts}', '[{"label_text":"valid"},{"version_text":42}]'),gen_random_uuid());
    raise exception 'invalid artifact accepted';
  exception when invalid_parameter_value then null; end;
  assert jsonb_array_length(public.rt_documents()->'documents') = 1;
  assert jsonb_array_length(public.rt_papers(t1)->'papers') = 1;

  perform set_config('request.jwt.claim.sub', b::text, false);
  assert public.rt_tasks() = '{"tasks":[]}';
  assert public.rt_documents() = '{"documents":[]}';
  tb := (public.rt_create_task(task_data, req)->>'task_id')::uuid;
  assert tb <> t1;
  begin perform public.rt_papers(t1); raise exception 'foreign task readable';
  exception when no_data_found then null; end;
  begin perform public.rt_papers(gen_random_uuid()); raise exception 'absent task readable';
  exception when no_data_found then null; end;
  begin perform public.rt_register_paper(t1,paper,paper_req); raise exception 'foreign task writable';
  exception when no_data_found then null; end;
  begin perform public.rt_register_paper(tb,jsonb_build_object('document_id',doc),gen_random_uuid()); raise exception 'foreign document usable';
  exception when no_data_found then null; end;
  assert public.rt_papers(tb) = '{"papers":[]}';
  perform public.rt_register_paper(tb,paper,paper_req);
  assert jsonb_array_length(public.rt_documents()->'documents') = 1;
  assert (public.rt_papers(tb)->'papers'->0->>'document_id')::uuid <> doc;
  begin
    insert into researchtrail.research_tasks(owner_id,goal_text) values(a,'foreign');
    raise exception 'owner field writable';
  exception when insufficient_privilege then null; end;
  begin
    update researchtrail.research_tasks set goal_text='foreign' where task_id=t1;
    raise exception 'direct update granted';
  exception when insufficient_privilege then null; end;
  begin
    delete from researchtrail.document_uses where document_use_id=use1;
    raise exception 'direct delete granted';
  exception when insufficient_privilege then null; end;
  foreach rel in array array['research_tasks','documents','document_uses','document_artifacts'] loop
    assert row_security_active(('researchtrail.' || rel)::regclass);
    execute format('select count(*) from researchtrail.%I where owner_id = $1', rel) into strict rows using a;
    assert rows = '0'::jsonb;
    assert not has_column_privilege(current_user,'researchtrail.'||rel,'owner_id','INSERT');
    assert not has_any_column_privilege(current_user,'researchtrail.'||rel,'UPDATE');
    assert not has_table_privilege(current_user,'researchtrail.'||rel,'DELETE,TRUNCATE');
  end loop;
  begin
    insert into researchtrail.document_uses(task_id,document_id) values(t1,doc);
    raise exception 'foreign parents writable';
  exception when foreign_key_violation or insufficient_privilege then null; end;
  begin
    insert into researchtrail.document_uses(task_id,document_id) values(tb,doc);
    raise exception 'foreign document linked to own task';
  exception when foreign_key_violation or insufficient_privilege then null; end;
  begin
    insert into researchtrail.document_artifacts(document_use_id,document_id,label_text) values(use1,doc,'foreign');
    raise exception 'foreign artifact writable';
  exception when foreign_key_violation or insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub', a::text, false);
  assert jsonb_array_length(public.rt_tasks()->'tasks') = 2;
  assert jsonb_array_length(public.rt_papers(t1)->'papers') = 1;
end
$case$;
reset role;
set role anon;
do $case$
begin
  assert not has_schema_privilege(current_user,'researchtrail','usage');
  assert not exists (select from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and left(p.proname,3)='rt_' and has_function_privilege(current_user,p.oid,'EXECUTE'));
end
$case$;
