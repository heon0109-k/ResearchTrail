-- Browser clients reach only public RPCs through PostgREST. The base schema is private to the Data API.
begin;
create schema researchtrail;
revoke all on schema researchtrail from public, anon, authenticated;
grant usage on schema researchtrail to authenticated;

create table researchtrail.research_tasks (
  task_id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  request_id uuid not null default gen_random_uuid(),
  goal_text text not null check (goal_text ~ '[^[:space:]]'),
  scope_text text, target_output_text text, progress_text text,
  unique (owner_id, task_id), unique (owner_id, request_id)
);
create table researchtrail.documents (
  document_id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  title text, material_kind_text text,
  unique (owner_id, document_id)
);
create table researchtrail.document_uses (
  document_use_id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  task_id uuid not null, document_id uuid not null,
  request_id uuid not null default gen_random_uuid(), request_hash bytea,
  date date,
  purpose_text text, role_text text, purpose_recording_text text, reading_state_text text,
  foreign key (owner_id,task_id) references researchtrail.research_tasks(owner_id,task_id) on delete cascade,
  foreign key (owner_id,document_id) references researchtrail.documents(owner_id,document_id) on delete cascade,
  unique (owner_id,task_id,request_id), unique (owner_id,document_use_id,document_id)
);
create table researchtrail.document_artifacts (
  artifact_id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  document_use_id uuid not null, document_id uuid not null,
  label_text text, version_text text, part_text text, access_locator_text text,
  availability_text text, extraction_issue_text text,
  foreign key (owner_id,document_use_id,document_id)
    references researchtrail.document_uses(owner_id,document_use_id,document_id) on delete cascade
);

do $policies$
declare rel text;
begin
  foreach rel in array array['research_tasks','documents','document_uses','document_artifacts'] loop
    execute format('alter table researchtrail.%I enable row level security', rel);
    execute format('revoke all on researchtrail.%I from public, anon, authenticated', rel);
    execute format('grant select on researchtrail.%I to authenticated', rel);
    execute format('create policy own_read on researchtrail.%I for select to authenticated using (owner_id = (select auth.uid()))', rel);
    execute format('create policy own_insert on researchtrail.%I for insert to authenticated with check (owner_id = (select auth.uid()))', rel);
  end loop;
end
$policies$;
-- The caller can supply neither a row ID nor an owner. Composite FKs cover writes even outside an RPC.
grant insert (request_id,goal_text,scope_text,target_output_text,progress_text) on researchtrail.research_tasks to authenticated;
grant insert (title,material_kind_text) on researchtrail.documents to authenticated;
grant insert (task_id,document_id,request_id,request_hash,date,purpose_text,role_text,purpose_recording_text,reading_state_text)
  on researchtrail.document_uses to authenticated;
grant insert (document_use_id,document_id,label_text,version_text,part_text,access_locator_text,availability_text,extraction_issue_text)
  on researchtrail.document_artifacts to authenticated;

create function researchtrail.check_fields(obj jsonb, allowed text[], strings_only boolean default true)
returns void language plpgsql immutable security invoker set search_path = '' as $$
begin
  if jsonb_typeof(obj) is distinct from 'object' or (obj - allowed) <> '{}' then
    raise invalid_parameter_value;
  end if;
  if strings_only and exists(select from jsonb_each(obj) where jsonb_typeof(value) not in ('string','null')) then
    raise invalid_parameter_value;
  end if;
end $$;

create function researchtrail.task_result(t researchtrail.research_tasks)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('task_id',t.task_id,'task',jsonb_build_object('goal_text',t.goal_text,
    'scope_text',t.scope_text,'target_output_text',t.target_output_text,'progress_text',t.progress_text))
$$;
create function public.rt_tasks()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('tasks',coalesce(jsonb_agg(researchtrail.task_result(t)
    order by t.created_at desc,t.task_id),'[]')) from researchtrail.research_tasks t where t.owner_id=(select auth.uid())
$$;
create function public.rt_create_task(payload jsonb, request_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare t researchtrail.research_tasks;
begin
  perform researchtrail.check_fields(payload,array['goal_text','scope_text','target_output_text','progress_text']);
  if coalesce(payload->>'goal_text','') !~ '[^[:space:]]' or request_id is null then raise invalid_parameter_value; end if;
  insert into researchtrail.research_tasks(request_id,goal_text,scope_text,target_output_text,progress_text)
    values ($2,payload->>'goal_text',payload->>'scope_text',payload->>'target_output_text',payload->>'progress_text')
    on conflict on constraint research_tasks_owner_id_request_id_key do nothing returning * into t;
  if not found then
    select * into strict t from researchtrail.research_tasks r where r.owner_id=(select auth.uid()) and r.request_id=$2;
    if jsonb_strip_nulls(researchtrail.task_result(t)->'task') <> jsonb_strip_nulls(payload) then raise invalid_parameter_value; end if;
  end if;
  return researchtrail.task_result(t);
end $$;

create function public.rt_documents()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('documents',coalesce(jsonb_agg(jsonb_build_object('document_id',d.document_id,
    'title',d.title,'material_kind_text',d.material_kind_text) order by d.created_at desc,d.document_id),'[]'))
    from researchtrail.documents d where d.owner_id=(select auth.uid())
$$;
create function public.rt_papers(task_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  perform 1 from researchtrail.research_tasks t where t.owner_id=(select auth.uid()) and t.task_id=$1;
  if not found then raise no_data_found; end if;
  return jsonb_build_object('papers',coalesce((select jsonb_agg(jsonb_build_object(
    'document_use_id',u.document_use_id,'document_id',d.document_id,'date',u.date,
    'document',jsonb_build_object('title',d.title,'material_kind_text',d.material_kind_text),
    'use',jsonb_build_object('purpose_text',u.purpose_text,'role_text',u.role_text,
      'purpose_recording_text',u.purpose_recording_text,'reading_state_text',u.reading_state_text),
    'artifacts',coalesce((select jsonb_agg(jsonb_build_object('artifact_id',a.artifact_id,
      'label_text',a.label_text,'version_text',a.version_text,'part_text',a.part_text,'access_locator_text',a.access_locator_text,
      'availability_text',a.availability_text,'extraction_issue_text',a.extraction_issue_text) order by a.created_at desc,a.artifact_id)
      from researchtrail.document_artifacts a where a.owner_id=u.owner_id and a.document_use_id=u.document_use_id),'[]'::jsonb))
    order by u.created_at desc,u.document_use_id)
    from researchtrail.document_uses u join researchtrail.documents d using(owner_id,document_id)
    where u.owner_id=(select auth.uid()) and u.task_id=$1),'[]'::jsonb));
end $$;

create function public.rt_register_paper(task_id uuid, payload jsonb, request_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  doc_id uuid; use_id uuid; old_hash bytea; a jsonb;
  doc jsonb := payload->'document';
  u jsonb := coalesce(nullif(payload->'use','null'), '{}');
  artifacts jsonb := coalesce(nullif(payload->'artifacts','null'), '[]');
begin
  perform 1 from researchtrail.research_tasks t where t.owner_id=(select auth.uid()) and t.task_id=$1;
  if not found then raise no_data_found; end if;
  perform researchtrail.check_fields(payload,array['document','document_id','use','artifacts','date'],false);
  if request_id is null or (payload ? 'document') = (payload ? 'document_id') then raise invalid_parameter_value; end if;
  perform researchtrail.check_fields(u,array['purpose_text','role_text','purpose_recording_text','reading_state_text']);
  if jsonb_typeof(artifacts) <> 'array' then raise invalid_parameter_value; end if;

  -- Serialize retries of this registration; the whole document/use/artifact set commits together.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || $1::text || $3::text, 0));
  select r.document_use_id,r.document_id,r.request_hash into use_id,doc_id,old_hash
    from researchtrail.document_uses r where r.owner_id=(select auth.uid()) and r.task_id=$1 and r.request_id=$3;
  if found then
    if old_hash is distinct from sha256(convert_to(payload::text,'UTF8')) then raise invalid_parameter_value; end if;
  else
    if payload ? 'document_id' then
      select d.document_id into strict doc_id from researchtrail.documents d
        where d.owner_id=(select auth.uid()) and d.document_id=(payload->>'document_id')::uuid;
    else
      perform researchtrail.check_fields(doc,array['title','material_kind_text']);
      if concat(doc->>'title',doc->>'material_kind_text') !~ '[^[:space:]]' then raise invalid_parameter_value; end if;
      insert into researchtrail.documents(title,material_kind_text) values(doc->>'title',doc->>'material_kind_text') returning document_id into doc_id;
    end if;
    insert into researchtrail.document_uses(task_id,document_id,request_id,request_hash,date,purpose_text,role_text,purpose_recording_text,reading_state_text)
      values($1,doc_id,$3,sha256(convert_to(payload::text,'UTF8')),(payload->>'date')::date,u->>'purpose_text',u->>'role_text',u->>'purpose_recording_text',u->>'reading_state_text')
      returning document_use_id into use_id;
    for a in select value from jsonb_array_elements(artifacts) loop
      perform researchtrail.check_fields(a,array['label_text','version_text','part_text','access_locator_text','availability_text','extraction_issue_text']);
      if not exists(select from jsonb_each_text(a) where value ~ '[^[:space:]]') then raise invalid_parameter_value; end if;
      insert into researchtrail.document_artifacts(document_use_id,document_id,label_text,version_text,part_text,access_locator_text,availability_text,extraction_issue_text)
        values(use_id,doc_id,a->>'label_text',a->>'version_text',a->>'part_text',a->>'access_locator_text',a->>'availability_text',a->>'extraction_issue_text');
    end loop;
  end if;
  return jsonb_build_object('task_id',$1,'document_id',doc_id,'document_use_id',use_id,'artifact_ids',
    coalesce((select jsonb_agg(ar.artifact_id order by ar.created_at desc,ar.artifact_id)
      from researchtrail.document_artifacts ar where ar.owner_id=(select auth.uid()) and ar.document_use_id=use_id),'[]'::jsonb));
end $$;

revoke all on all functions in schema researchtrail from public, anon;
grant execute on all functions in schema researchtrail to authenticated;
revoke all on function public.rt_tasks(), public.rt_create_task(jsonb,uuid), public.rt_documents(),
  public.rt_papers(uuid), public.rt_register_paper(uuid,jsonb,uuid) from public, anon;
grant execute on function public.rt_tasks(), public.rt_create_task(jsonb,uuid), public.rt_documents(),
  public.rt_papers(uuid), public.rt_register_paper(uuid,jsonb,uuid) to authenticated;
commit;
