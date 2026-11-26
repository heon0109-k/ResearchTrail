begin;

-- Validation only. Store the original text, including its surrounding whitespace.
create function researchtrail.has_record_text(value text) returns boolean
language sql immutable parallel safe set search_path = '' as $$
  select coalesce(btrim(value, E' \t\n\r\f' || chr(11) ||
    U&'\0085\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'), '') <> ''
$$;

create table researchtrail.research_records (
  record_id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  task_id uuid not null,
  created_at timestamptz not null default now(),
  request_id uuid not null, request_hash bytea not null,
  content_text text not null check (researchtrail.has_record_text(content_text)),
  record_kind_text text, authorship_text text, container_text text, location_text text,
  review_state_text text, adoption_state_text text, audience_text text, ai_input_scope_text text, change_reason_text text,
  revises_record_id uuid,
  unique (owner_id, task_id, record_id),
  constraint record_save_key unique (owner_id, task_id, request_id),
  foreign key (owner_id, task_id) references researchtrail.research_tasks(owner_id, task_id) on delete cascade,
  foreign key (owner_id, task_id, revises_record_id) references researchtrail.research_records(owner_id, task_id, record_id)
);

create table researchtrail.research_questions (
  question_id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  task_id uuid not null, record_id uuid not null,
  created_at timestamptz not null default now(),
  question_text text not null check (researchtrail.has_record_text(question_text)),
  state_text text, unresolved_reason_text text,
  foreign key (owner_id, task_id, record_id) references researchtrail.research_records(owner_id, task_id, record_id) on delete cascade
);
create table researchtrail.decisions (
  decision_id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  task_id uuid not null, record_id uuid not null,
  created_at timestamptz not null default now(),
  decision_text text not null check (researchtrail.has_record_text(decision_text)),
  made_by_text text, reason_text text,
  foreign key (owner_id, task_id, record_id) references researchtrail.research_records(owner_id, task_id, record_id) on delete cascade
);

-- The record and use must share a task. A selected edition must represent that use's document.
alter table researchtrail.document_uses add unique (owner_id, task_id, document_id, document_use_id);
alter table researchtrail.document_artifacts add unique (owner_id, document_id, artifact_id);
create table researchtrail.record_document_contexts (
  document_use_id uuid primary key,
  owner_id uuid not null default auth.uid(),
  task_id uuid not null, record_id uuid not null, document_id uuid not null, artifact_id uuid,
  unique (owner_id, document_use_id, artifact_id),
  foreign key (owner_id, task_id, record_id) references researchtrail.research_records(owner_id, task_id, record_id) on delete cascade,
  foreign key (owner_id, task_id, document_id, document_use_id)
    references researchtrail.document_uses(owner_id, task_id, document_id, document_use_id) on delete cascade,
  foreign key (owner_id, document_id, artifact_id) references researchtrail.document_artifacts(owner_id, document_id, artifact_id)
);
create table researchtrail.evidence_excerpts (
  excerpt_id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  document_use_id uuid not null, artifact_id uuid not null,
  created_at timestamptz not null default now(),
  locator_text text, excerpt_text text, context_text text,
  check (researchtrail.has_record_text(concat(locator_text, excerpt_text, context_text))),
  foreign key (owner_id, document_use_id, artifact_id)
    references researchtrail.record_document_contexts(owner_id, document_use_id, artifact_id) on delete cascade
);
create index on researchtrail.research_questions(record_id);
create index on researchtrail.decisions(record_id);
create index on researchtrail.record_document_contexts(record_id);
create index on researchtrail.evidence_excerpts(document_use_id);

do $policies$
declare rel text;
begin
  foreach rel in array array['research_records','research_questions','decisions','record_document_contexts','evidence_excerpts'] loop
    execute format('alter table researchtrail.%I enable row level security', rel);
    execute format('revoke all on researchtrail.%I from public, anon, authenticated', rel);
    execute format('grant select on researchtrail.%I to authenticated', rel);
    execute format('create policy own_read on researchtrail.%I for select to authenticated using (owner_id=(select auth.uid()))', rel);
    execute format('create policy own_insert on researchtrail.%I for insert to authenticated with check (owner_id=(select auth.uid()))', rel);
  end loop;
end $policies$;
grant insert (task_id, request_id, request_hash, content_text, record_kind_text, authorship_text, container_text,
  location_text, review_state_text, adoption_state_text, audience_text, ai_input_scope_text, change_reason_text, revises_record_id)
  on researchtrail.research_records to authenticated;
grant insert (task_id, record_id, question_text, state_text, unresolved_reason_text) on researchtrail.research_questions to authenticated;
grant insert (task_id, record_id, decision_text, made_by_text, reason_text) on researchtrail.decisions to authenticated;
grant insert (task_id, record_id, document_id, document_use_id, artifact_id) on researchtrail.record_document_contexts to authenticated;
grant insert (document_use_id, artifact_id, locator_text, excerpt_text, context_text) on researchtrail.evidence_excerpts to authenticated;

-- Report malformed, absent and inaccessible selected IDs with the same public error.
create function researchtrail.selected_id(value jsonb) returns uuid language plpgsql immutable set search_path = '' as $$
begin
  if jsonb_typeof(value) is distinct from 'string' then raise sqlstate 'RT001'; end if;
  return (value #>> '{}')::uuid;
exception when invalid_text_representation then raise sqlstate 'RT001';
end $$;

create function researchtrail.save_record_document(selected_task uuid, saved_record uuid, entry jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  doc_ref jsonb := entry->'document_ref';
  art_ref jsonb := nullif(entry->'artifact_ref','null');
  excerpt jsonb := nullif(entry->'excerpt','null');
  paper jsonb; registered jsonb;
  selected_doc uuid; selected_artifact uuid; saved_use uuid;
begin
  perform researchtrail.check_fields(entry,array['document_ref','use','artifact_ref','excerpt'],false);
  perform researchtrail.check_fields(doc_ref,array['document','document_id'],false);
  if (doc_ref ? 'document') = (doc_ref ? 'document_id') then raise sqlstate 'RT001'; end if;
  if doc_ref ? 'document_id' then selected_doc := researchtrail.selected_id(doc_ref->'document_id'); end if;
  paper := doc_ref || jsonb_build_object('use',entry->'use');

  if art_ref is not null then
    perform researchtrail.check_fields(art_ref,array['artifact','artifact_id'],false);
    if (art_ref ? 'artifact') = (art_ref ? 'artifact_id') then raise sqlstate 'RT001'; end if;
    if art_ref ? 'artifact_id' then
      selected_artifact := researchtrail.selected_id(art_ref->'artifact_id');
      perform 1 from researchtrail.document_artifacts a
        where a.owner_id=(select auth.uid()) and a.document_id=selected_doc and a.artifact_id=selected_artifact;
      if not found then raise sqlstate 'RT001'; end if;
    else
      paper := paper || jsonb_build_object('artifacts',jsonb_build_array(art_ref->'artifact'));
    end if;
  elsif excerpt is not null then
    raise sqlstate 'RT001';
  end if;

  -- Reuse paper registration's validation and ID allocation inside this transaction.
  registered := public.rt_register_paper(selected_task, paper, gen_random_uuid());
  selected_doc := (registered->>'document_id')::uuid;
  saved_use := (registered->>'document_use_id')::uuid;
  selected_artifact := coalesce(selected_artifact,(registered->'artifact_ids'->>0)::uuid);
  insert into researchtrail.record_document_contexts(task_id, record_id, document_id, document_use_id, artifact_id)
    values (selected_task, saved_record, selected_doc, saved_use, selected_artifact);
  if excerpt is not null then
    perform researchtrail.check_fields(excerpt,array['locator_text','excerpt_text','context_text']);
    insert into researchtrail.evidence_excerpts(document_use_id,artifact_id,locator_text,excerpt_text,context_text)
      values (saved_use,selected_artifact,excerpt->>'locator_text',excerpt->>'excerpt_text',excerpt->>'context_text');
  end if;
exception when no_data_found then raise sqlstate 'RT001';
end $$;

create function researchtrail.record_context_refs(saved_record uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with docs as (select document_use_id, document_id, artifact_id from researchtrail.record_document_contexts where record_id=saved_record)
  select jsonb_build_object(
    'question_ids', array(select question_id from researchtrail.research_questions where record_id=saved_record order by created_at desc,question_id),
    'decision_ids', array(select decision_id from researchtrail.decisions where record_id=saved_record order by created_at desc,decision_id),
    'document_ids', array(select d.document_id from researchtrail.documents d where d.document_id in (select document_id from docs)
                          order by d.created_at desc,d.document_id),
    'document_use_ids', array(select u.document_use_id from docs join researchtrail.document_uses u using(document_use_id)
                              order by u.created_at desc,u.document_use_id),
    'artifact_ids', array(select a.artifact_id from researchtrail.document_artifacts a where a.artifact_id in (select artifact_id from docs)
                          order by a.created_at desc,a.artifact_id),
    'excerpt_ids', array(select e.excerpt_id from docs join researchtrail.evidence_excerpts e using(document_use_id) order by e.created_at desc,e.excerpt_id))
$$;

create function public.rt_save_record(task_id uuid, payload jsonb, request_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  r jsonb := payload->'record';
  ctx jsonb := coalesce(nullif(payload->'context','null'),'{}');
  digest bytea := sha256(convert_to(payload::text,'UTF8'));
  previous_hash bytea; saved_id uuid; revises uuid; field text; item jsonb;
begin
  perform 1 from researchtrail.research_tasks t where t.owner_id=(select auth.uid()) and t.task_id=$1;
  if not found then raise no_data_found; end if;
  perform researchtrail.check_fields(payload,array['record','context','revises_record_id'],false);
  perform researchtrail.check_fields(r,array['content_text','record_kind_text','authorship_text','container_text',
    'location_text','review_state_text','adoption_state_text','audience_text','ai_input_scope_text','change_reason_text']);
  if request_id is null or not researchtrail.has_record_text(r->>'content_text') then raise invalid_parameter_value; end if;
  perform researchtrail.check_fields(ctx,array['questions','decisions','document_contexts'],false);
  foreach field in array array['questions','decisions','document_contexts'] loop
    if jsonb_typeof(ctx->field) not in ('array','null') then raise invalid_parameter_value; end if;
  end loop;
  if nullif(payload->'revises_record_id','null') is not null then
    revises := researchtrail.selected_id(payload->'revises_record_id');
    perform 1 from researchtrail.research_records prev where prev.owner_id=(select auth.uid()) and prev.task_id=$1 and prev.record_id=revises;
    if not found then raise sqlstate 'RT001'; end if;
  end if;

  -- A simultaneous retry waits on this unique key until the entire first transaction commits or rolls back.
  insert into researchtrail.research_records(task_id,request_id,request_hash,content_text,record_kind_text,authorship_text,
    container_text,location_text,review_state_text,adoption_state_text,audience_text,ai_input_scope_text,change_reason_text,revises_record_id)
    values ($1,$3,digest,r->>'content_text',r->>'record_kind_text',r->>'authorship_text',r->>'container_text',r->>'location_text',
      r->>'review_state_text',r->>'adoption_state_text',r->>'audience_text',r->>'ai_input_scope_text',r->>'change_reason_text',revises)
    on conflict on constraint record_save_key do nothing returning record_id into saved_id;
  if not found then
    select prev.record_id,prev.request_hash into strict saved_id,previous_hash from researchtrail.research_records prev
      where prev.owner_id=(select auth.uid()) and prev.task_id=$1 and prev.request_id=$3;
    if previous_hash <> digest then raise invalid_parameter_value; end if;
  else
    for item in select value from jsonb_array_elements(nullif(ctx->'questions','null')) loop
      perform researchtrail.check_fields(item,array['question_text','state_text','unresolved_reason_text']);
      if not researchtrail.has_record_text(item->>'question_text') then raise invalid_parameter_value; end if;
      insert into researchtrail.research_questions(task_id,record_id,question_text,state_text,unresolved_reason_text)
        values ($1,saved_id,item->>'question_text',item->>'state_text',item->>'unresolved_reason_text');
    end loop;
    for item in select value from jsonb_array_elements(nullif(ctx->'decisions','null')) loop
      perform researchtrail.check_fields(item,array['decision_text','made_by_text','reason_text']);
      if not researchtrail.has_record_text(item->>'decision_text') then raise invalid_parameter_value; end if;
      insert into researchtrail.decisions(task_id,record_id,decision_text,made_by_text,reason_text)
        values ($1,saved_id,item->>'decision_text',item->>'made_by_text',item->>'reason_text');
    end loop;
    for item in select value from jsonb_array_elements(nullif(ctx->'document_contexts','null')) loop
      perform researchtrail.save_record_document($1,saved_id,item);
    end loop;
  end if;
  return jsonb_build_object('record_id',saved_id,'context_refs',researchtrail.record_context_refs(saved_id));
end $$;

revoke all on function researchtrail.has_record_text(text), researchtrail.selected_id(jsonb),
  researchtrail.save_record_document(uuid,uuid,jsonb), researchtrail.record_context_refs(uuid),
  public.rt_save_record(uuid,jsonb,uuid) from public, anon;
grant execute on function researchtrail.has_record_text(text), researchtrail.selected_id(jsonb),
  researchtrail.save_record_document(uuid,uuid,jsonb), researchtrail.record_context_refs(uuid),
  public.rt_save_record(uuid,jsonb,uuid) to authenticated;
commit;
