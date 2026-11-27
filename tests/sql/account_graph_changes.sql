-- Prompt 3, AC5/NF6. Synthetic tasks, receipts and isolation.
set role authenticated;
do $test$
declare
  a uuid; b uuid; p uuid; q uuid; id uuid;
  create_key uuid := gen_random_uuid(); edit_key uuid := gen_random_uuid(); delete_key uuid := gen_random_uuid();
  body jsonb; edit jsonb := '{"reason_text":"수정한 비교 이유"}';
begin
  perform set_config('request.jwt.claim.sub','aaaaaaaa-0000-4000-8000-000000000001',false);
  a := (public.rt_create_task('{"goal_text":"그래프"}',gen_random_uuid())->>'task_id')::uuid;
  b := (public.rt_create_task('{"goal_text":"별도 과업"}',gen_random_uuid())->>'task_id')::uuid;
  p := (public.rt_register_paper(a,'{"document":{"title":"동명"}}',gen_random_uuid())->>'document_use_id')::uuid;
  q := (public.rt_register_paper(a,'{"document":{"title":"동명"}}',gen_random_uuid())->>'document_use_id')::uuid;
  body := jsonb_build_object('from_document_use_id',p,'to_document_use_id',q,'reason_text','합성 이유');
  id := (public.rt_link_papers(a,body,create_key)->>'link_id')::uuid;
  assert public.rt_change_paper_link(a,id,edit,edit_key)->>'link_id'=id::text;
  assert public.rt_paper_links(a)#>>'{links,0,reason_text}'=edit->>'reason_text';
  perform public.rt_change_paper_link(a,id,'{"reason_text":"후속 이유"}',gen_random_uuid());
  perform public.rt_change_paper_link(a,id,edit,edit_key);
  assert public.rt_paper_links(a)#>>'{links,0,reason_text}'='후속 이유';
  begin perform public.rt_change_paper_link(a,id,'{}',edit_key); raise exception 'changed retry';
  exception when invalid_parameter_value then null; end;
  begin perform public.rt_change_paper_link(b,id,'{}',gen_random_uuid()); raise exception 'wrong task';
  exception when no_data_found then null; end;
  perform set_config('request.jwt.claim.sub','bbbbbbbb-0000-4000-8000-000000000002',false);
  begin perform public.rt_change_paper_link(a,id,'{}',delete_key); raise exception 'wrong owner';
  exception when no_data_found then null; end;
  perform set_config('request.jwt.claim.sub','aaaaaaaa-0000-4000-8000-000000000001',false);
  perform public.rt_change_paper_link(a,id,'{}',delete_key);
  perform public.rt_change_paper_link(a,id,'{}',delete_key);
  assert public.rt_paper_links(a)='{"links":[]}';
  begin perform public.rt_link_papers(a,body,create_key); raise exception 'resurrected deleted link';
  exception when sqlstate 'RT001' then null; end;
  perform public.rt_link_papers(a,body,gen_random_uuid());
  perform public.rt_change_paper_link(a,id,'{}',delete_key);
  assert jsonb_array_length(public.rt_paper_links(a)->'links')=1;
end
$test$;
reset role;
