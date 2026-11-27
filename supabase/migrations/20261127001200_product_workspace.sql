-- Persist the existing product controls. Account documents, record contexts and PDF
-- identities remain usable even after an owner removes their cards from the workspace.
begin;
alter table researchtrail.research_tasks
  add column workspace_archived boolean not null default false,
  add column registration_goal_text text;
alter table researchtrail.document_uses
  add column workspace_archived boolean not null default false,
  add column workspace_metadata jsonb not null default '{}';

-- Archived resources disappear from existing owner-scoped read routes too. A
-- research record retains its own context use and original IDs.
create policy active_task on researchtrail.research_tasks as restrictive for select to authenticated using(not workspace_archived);
create policy active_paper on researchtrail.document_uses as restrictive for select to authenticated using(not workspace_archived);
-- A memo in another active task may still explicitly cite this edition. In the
-- task where its owning paper was archived, a memo reference cannot revive it.
create function researchtrail.workspace_artifact_current(task uuid,artifact uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select not exists (select from researchtrail.document_artifacts a
    join researchtrail.document_uses u using(owner_id,document_use_id)
    where a.owner_id=(select auth.uid()) and a.artifact_id=artifact and u.task_id=task and u.workspace_archived)
$$;
revoke all on function researchtrail.workspace_artifact_current(uuid,uuid) from public,anon;
grant execute on function researchtrail.workspace_artifact_current(uuid,uuid) to authenticated;
create or replace view researchtrail.task_use_artifacts with (security_invoker=true) as
  with candidates as (
    select u.owner_id,u.task_id,u.document_use_id,a.artifact_id from researchtrail.document_uses u
      join researchtrail.document_artifacts a using(owner_id,document_id,document_use_id)
    union all
    select c.owner_id,c.task_id,c.document_use_id,c.artifact_id from researchtrail.record_document_contexts c where c.artifact_id is not null
  )
  select distinct c.owner_id,c.task_id,c.document_use_id,c.artifact_id from candidates c
    join researchtrail.research_tasks t using(owner_id,task_id)
    join researchtrail.document_uses u using(owner_id,task_id,document_use_id)
    where not t.workspace_archived and not u.workspace_archived and researchtrail.workspace_artifact_current(c.task_id,c.artifact_id);

-- The definer lock also protects mutations initiated by older clients. Taking the
-- task lock before the per-link lock gives all workspace/graph edits one lock order.
create function researchtrail.lock_workspace_task(task uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from researchtrail.research_tasks t where t.owner_id=auth.uid() and t.task_id=task
    and not t.workspace_archived for key share;
  if not found then raise no_data_found; end if;
end $$;
create function researchtrail.guard_workspace_insert() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  -- Unknown task IDs and forged owners still go through the original RLS and FK checks.
  if new.owner_id=auth.uid() and exists(select from researchtrail.research_tasks t where t.owner_id=new.owner_id and t.task_id=new.task_id) then
    perform researchtrail.lock_workspace_task(new.task_id);
  end if;
  return new;
end $$;
create trigger active_task_before_record before insert on researchtrail.research_records for each row execute function researchtrail.guard_workspace_insert();
create trigger active_task_before_use before insert on researchtrail.document_uses for each row execute function researchtrail.guard_workspace_insert();
create trigger active_task_before_action before insert on researchtrail.next_actions for each row execute function researchtrail.guard_workspace_insert();

alter function public.rt_link_papers(uuid,jsonb,uuid) rename to link_workspace_papers;
alter function public.link_workspace_papers(uuid,jsonb,uuid) set schema researchtrail;
create function public.rt_link_papers(task_id uuid,payload jsonb,request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform researchtrail.lock_workspace_task($1);
  if exists(select from researchtrail.document_uses u where u.owner_id=auth.uid() and u.task_id=$1 and u.workspace_archived
    and u.document_use_id in ((payload->>'from_document_use_id')::uuid,(payload->>'to_document_use_id')::uuid))
    then raise sqlstate 'RT001'; end if;
  return researchtrail.link_workspace_papers($1,$2,$3);
end $$;
alter function public.rt_change_paper_link(uuid,uuid,jsonb,uuid) rename to change_workspace_link;
alter function public.change_workspace_link(uuid,uuid,jsonb,uuid) set schema researchtrail;
create function public.rt_change_paper_link(task_id uuid,link_id uuid,payload jsonb,request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform researchtrail.lock_workspace_task($1);
  return researchtrail.change_workspace_link($1,$2,$3,$4);
end $$;
create function researchtrail.archive_workspace_paper(me uuid,task uuid,paper uuid) returns void
language plpgsql set search_path='' as $$
declare link uuid;
begin
  for link in select l.link_id from researchtrail.document_use_links l where l.owner_id=me and l.task_id=task
    and paper in (l.from_document_use_id,l.to_document_use_id) order by l.link_id loop
    perform researchtrail.change_workspace_link(task,link,'{}',gen_random_uuid());
  end loop;
  update researchtrail.document_uses u set workspace_archived=true where (u.owner_id,u.task_id,u.document_use_id)=(me,task,paper);
end $$;
alter function public.rt_prepare_paper_pdf(uuid,uuid,text,text,integer,uuid) rename to prepare_workspace_pdf;
alter function public.prepare_workspace_pdf(uuid,uuid,text,text,integer,uuid) set schema researchtrail;
create function public.rt_prepare_paper_pdf(task_id uuid,document_use_id uuid,file_name text,content_sha256 text,size_bytes integer,
  existing_artifact_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform researchtrail.lock_workspace_task($1);
  perform 1 from researchtrail.document_uses u where u.owner_id=auth.uid() and u.task_id=$1 and u.document_use_id=$2 and not u.workspace_archived;
  if not found then raise no_data_found; end if;
  return researchtrail.prepare_workspace_pdf($1,$2,$3,$4,$5,$6);
end $$;
create table researchtrail.workspace_state (
  owner_id uuid not null, task_id uuid not null,
  target text not null check (target in ('project','paper','artifact')),
  target_id uuid not null, version bigint not null check (version between 1 and 9007199254740991),
  data jsonb not null check (jsonb_typeof(data)='object'),
  primary key (owner_id,task_id,target,target_id),
  foreign key (owner_id,task_id) references researchtrail.research_tasks(owner_id,task_id) on delete cascade
);
-- Store a small patch once per revision instead of copying every previously saved
-- capture into the receipt for each keystroke. Old versions are reconstructed only
-- on replay after the leaf has already changed again.
create table researchtrail.workspace_patches (
  owner_id uuid not null, task_id uuid not null, target text not null, target_id uuid not null,
  version bigint not null, patch jsonb not null,
  primary key (owner_id,task_id,target,target_id,version),
  foreign key (owner_id,task_id,target,target_id) references researchtrail.workspace_state on delete cascade
);
create table researchtrail.workspace_changes (
  owner_id uuid not null, task_id uuid not null, request_id uuid not null,
  request_hash bytea not null, result jsonb not null,
  primary key (owner_id,task_id,request_id),
  foreign key (owner_id,task_id) references researchtrail.research_tasks(owner_id,task_id) on delete cascade
);
create table researchtrail.removed_highlights (
  owner_id uuid not null, task_id uuid not null, artifact_id uuid not null, id uuid not null,
  primary key (owner_id,task_id,artifact_id,id),
  foreign key (owner_id,task_id) references researchtrail.research_tasks(owner_id,task_id) on delete cascade,
  foreign key (artifact_id) references researchtrail.document_artifacts(artifact_id) on delete cascade
);
alter table researchtrail.workspace_state enable row level security;
alter table researchtrail.workspace_changes enable row level security;
alter table researchtrail.workspace_patches enable row level security;
alter table researchtrail.removed_highlights enable row level security;
revoke all on researchtrail.workspace_state,researchtrail.workspace_changes,researchtrail.workspace_patches,researchtrail.removed_highlights from public,anon,authenticated;
grant select on researchtrail.workspace_state,researchtrail.workspace_changes,researchtrail.workspace_patches,researchtrail.removed_highlights to authenticated;
create policy own_read on researchtrail.workspace_patches for select to authenticated using(owner_id=(select auth.uid()));
create policy own_read on researchtrail.workspace_changes for select to authenticated using(owner_id=(select auth.uid()));
create policy own_read on researchtrail.workspace_state for select to authenticated using(owner_id=(select auth.uid()));
create policy own_read on researchtrail.removed_highlights for select to authenticated using(owner_id=(select auth.uid()));

create or replace function public.rt_tasks() returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('tasks',coalesce(jsonb_agg(researchtrail.task_result(t)
    order by t.created_at desc,t.task_id),'[]')) from researchtrail.research_tasks t
  where t.owner_id=(select auth.uid()) and not t.workspace_archived
$$;
-- Creation receipts still validate the original spelling after a project is renamed.
create or replace function public.rt_create_task(payload jsonb,request_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare t researchtrail.research_tasks; original jsonb;
begin
  perform researchtrail.check_fields(payload,array['goal_text','scope_text','target_output_text','progress_text']);
  if coalesce(payload->>'goal_text','') !~ '[^[:space:]]' or request_id is null then raise invalid_parameter_value; end if;
  insert into researchtrail.research_tasks(request_id,goal_text,scope_text,target_output_text,progress_text)
    values($2,payload->>'goal_text',payload->>'scope_text',payload->>'target_output_text',payload->>'progress_text')
    on conflict on constraint research_tasks_owner_id_request_id_key do nothing returning * into t;
  if not found then
    select * into strict t from researchtrail.research_tasks r where r.owner_id=(select auth.uid()) and r.request_id=$2;
    original:=(researchtrail.task_result(t)->'task')||jsonb_build_object('goal_text',coalesce(t.registration_goal_text,t.goal_text));
    if jsonb_strip_nulls(original)<>jsonb_strip_nulls(payload) then raise invalid_parameter_value; end if;
  end if;
  return researchtrail.task_result(t);
end $$;

alter function public.rt_workspace_papers(uuid) rename to registered_workspace_papers;
alter function public.registered_workspace_papers(uuid) set schema researchtrail;
create function public.rt_workspace_papers(task_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  perform 1 from researchtrail.research_tasks t where t.owner_id=auth.uid() and t.task_id=$1 and not t.workspace_archived;
  if not found then raise no_data_found; end if;
  -- Evaluate the legacy duplicate-reference rule with visibility of archived registrations,
  -- then explicitly restrict both the returned uses and the authority to this task's owner.
  return (select jsonb_build_object('papers',coalesce(jsonb_agg(
    p.item || (u.workspace_metadata - array['title','purpose_text','reading_state_text']) ||
    jsonb_build_object('document',(p.item->'document')||(u.workspace_metadata - array['date','purpose_text','reading_state_text','access_locator_text']),
      'use',(p.item->'use')||(u.workspace_metadata - array['title','date','access_locator_text']))
    order by p.pos),'[]'))
  from jsonb_array_elements(researchtrail.registered_workspace_papers($1)->'papers') with ordinality p(item,pos)
  join researchtrail.document_uses u on u.document_use_id=(p.item->>'document_use_id')::uuid
  where u.owner_id=(select auth.uid()) and u.task_id=$1 and not u.workspace_archived);
end $$;
-- Only an explicit project selection updates this account-wide preference. Changing
-- devices or opening a fallback for an archived task does not manufacture a selection.
create table researchtrail.workspace_selection (
  owner_id uuid primary key, task_id uuid not null, revision bigint not null check (revision between 1 and 9007199254740991),
  request_id uuid not null,
  foreign key (owner_id,task_id) references researchtrail.research_tasks(owner_id,task_id) on delete cascade
);
alter table researchtrail.workspace_selection enable row level security;
revoke all on researchtrail.workspace_selection from public,anon,authenticated;
grant select on researchtrail.workspace_selection to authenticated;
create policy own_read on researchtrail.workspace_selection for select to authenticated using(owner_id=(select auth.uid()));

create function researchtrail.current_workspace_selection() returns jsonb
language sql stable security invoker set search_path='' as $$
  select coalesce((select jsonb_build_object('task_id',t.task_id,'revision',s.revision,'request_id',s.request_id)
    from researchtrail.workspace_selection s left join researchtrail.research_tasks t
      on t.owner_id=s.owner_id and t.task_id=s.task_id and not t.workspace_archived
    where s.owner_id=(select auth.uid())),jsonb_build_object('task_id',null,'revision',0))
$$;

create function public.rt_select_workspace_task(task_id uuid,revision bigint,request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if $2 is null or $2 not between 1 and 9007199254740991 or $3 is null then raise invalid_parameter_value; end if;
  perform researchtrail.lock_workspace_task($1);
  -- Higher revisions win even if requests from one tab arrive out of order.
  -- Independent clients may pick from the same revision; the UUID breaks that tie.
  insert into researchtrail.workspace_selection as s(owner_id,task_id,revision,request_id)
    values(auth.uid(),$1,$2,$3)
    on conflict(owner_id) do update set task_id=excluded.task_id,revision=excluded.revision,request_id=excluded.request_id
    where (s.revision,s.request_id)<(excluded.revision,excluded.request_id);
  return researchtrail.current_workspace_selection();
end $$;
revoke all on function researchtrail.current_workspace_selection(),public.rt_select_workspace_task(uuid,bigint,uuid) from public,anon;
grant execute on function researchtrail.current_workspace_selection(),public.rt_select_workspace_task(uuid,bigint,uuid) to authenticated;

create function public.rt_workspace_tasks() returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('selection',researchtrail.current_workspace_selection(),'tasks',coalesce(jsonb_agg(researchtrail.task_result(t)||
    jsonb_build_object('paper_count',jsonb_array_length(public.rt_workspace_papers(t.task_id)->'papers'))
    order by t.created_at desc,t.task_id),'[]'))
  from researchtrail.research_tasks t where t.owner_id=(select auth.uid()) and not t.workspace_archived
$$;
create or replace function public.rt_paper_links(task_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
  perform 1 from researchtrail.research_tasks t where t.owner_id=(select auth.uid()) and t.task_id=$1;
  if not found then raise no_data_found; end if;
  return jsonb_build_object('links',coalesce((select jsonb_agg(researchtrail.link_result(l) order by l.created_at desc,l.link_id)
    from researchtrail.document_use_links l where l.owner_id=(select auth.uid()) and l.task_id=$1
    and exists(select from researchtrail.document_uses u where not u.workspace_archived and u.document_use_id=l.from_document_use_id)
    and exists(select from researchtrail.document_uses u where not u.workspace_archived and u.document_use_id=l.to_document_use_id)),'[]'::jsonb));
end $$;

create function public.rt_workspace_state(task_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare me uuid:=auth.uid(); result jsonb;
begin
  perform 1 from researchtrail.research_tasks t where t.owner_id=me and t.task_id=$1 and not t.workspace_archived;
  if not found then raise no_data_found; end if;
  with leaves as (
    select s.target,s.target_id,jsonb_build_object('version',s.version,'data',s.data) as leaf
    from researchtrail.workspace_state s where s.owner_id=me and s.task_id=$1 and (
      s.target='project' or
      (s.target='paper' and exists(select from researchtrail.document_uses u where u.owner_id=me and u.task_id=$1 and u.document_use_id=s.target_id and not u.workspace_archived)) or
      (s.target='artifact' and exists(select from researchtrail.task_use_artifacts a where a.owner_id=me and a.task_id=$1 and a.artifact_id=s.target_id))
    )
  )
  select jsonb_build_object('project',coalesce((select leaf from leaves where target='project'),'{"version":0,"data":{}}'),
    'papers',coalesce((select jsonb_object_agg(target_id,leaf) from leaves where target='paper'),'{}'),
    'artifacts',coalesce((select jsonb_object_agg(target_id,leaf) from leaves where target='artifact'),'{}'),
    'reading_pages',coalesce((select jsonb_object_agg(r.artifact_id,r.last_page) from researchtrail.pdf_reading_pages r
      where r.owner_id=me and r.task_id=$1 and exists(select from researchtrail.task_use_artifacts a
        where a.owner_id=me and a.task_id=$1 and a.artifact_id=r.artifact_id)),'{}'),
    'record_requests',coalesce((select jsonb_object_agg(r.record_id,r.request_id) from researchtrail.research_records r
      where r.owner_id=me and r.task_id=$1),'{}')) into result;
  return result;
end $$;

-- Merge only the submitted keys (RFC 7396). Lists are a single value. In a JSON
-- object null deletes one key, so clearing a turn or annotation preserves its peers.
create function researchtrail.workspace_merge(base jsonb,patch jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare merged jsonb; original jsonb:=case when jsonb_typeof(base)='object' then base else '{}' end;
begin
  select coalesce(jsonb_object_agg(k,v),'{}') into merged from (
    select key as k,value as v from jsonb_each(original) where not patch ? key
    union all
    select key,case when jsonb_typeof(value)='object' then researchtrail.workspace_merge(original->key,value) else value end
    from jsonb_each(patch) where value<>'null'
  ) entries;
  return merged;
end $$;
create function researchtrail.workspace_check_json(input jsonb,depth integer default 0) returns void
language plpgsql immutable set search_path='' as $$
declare child jsonb;
begin
  if depth>32 then raise invalid_parameter_value; end if;
  if jsonb_typeof(input)='object' then
    if input ?| array['__proto__','prototype','constructor'] then raise invalid_parameter_value; end if;
    for child in select value from jsonb_each(input) where jsonb_typeof(value) in ('array','object') loop
      perform researchtrail.workspace_check_json(child,depth+1);
    end loop;
  elsif jsonb_typeof(input)='array' then
    for child in select value from jsonb_array_elements(input) where jsonb_typeof(value) in ('array','object') loop
      perform researchtrail.workspace_check_json(child,depth+1);
    end loop;
  end if;
end $$;
create function researchtrail.workspace_check_tags(tags jsonb) returns void
language plpgsql immutable set search_path='' as $$
begin
  if jsonb_typeof(tags) is distinct from 'array' or exists (
    select from jsonb_array_elements(tags) t where jsonb_typeof(t) is distinct from 'object'
      or jsonb_typeof(t->'id') is distinct from 'string' or t->>'id' !~ '^[a-zA-Z0-9_-]+$'
      or jsonb_typeof(t->'name') is distinct from 'string' or not researchtrail.has_record_text(t->>'name')
      or (t ? 'color' and (jsonb_typeof(t->'color') is distinct from 'string' or t->>'color' !~ '^#[a-fA-F0-9]{6}$'))
  ) or exists (select from jsonb_array_elements(tags) t group by t->>'id' having count(*)>1)
    then raise invalid_parameter_value; end if;
end $$;
create function researchtrail.workspace_revision(me uuid,task uuid,kind text,id uuid,at_version bigint) returns jsonb
language plpgsql stable set search_path='' as $$
declare result jsonb; part jsonb;
begin
  select s.data into result from researchtrail.workspace_state s where
    (s.owner_id,s.task_id,s.target,s.target_id,s.version)=(me,task,kind,id,at_version);
  if not found then
    result:='{}';
    for part in select h.patch from researchtrail.workspace_patches h where
      (h.owner_id,h.task_id,h.target,h.target_id)=(me,task,kind,id) and h.version<=at_version order by h.version loop
      result:=researchtrail.workspace_merge(result,part);
    end loop;
  end if;
  return jsonb_build_object('version',at_version,'data',result);
end $$;
create function researchtrail.workspace_patch(me uuid,task uuid,item jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare kind text:=item->>'target'; id uuid; old_version bigint:=0; body jsonb:='{}';
begin
  perform researchtrail.check_fields(item,array['target','id','version','patch'],false);
  if kind not in ('project','paper','artifact') or kind is null or jsonb_typeof(item->'version') is distinct from 'number'
    or (item->>'version') !~ '^(0|[1-9][0-9]*)$' or jsonb_typeof(item->'patch') is distinct from 'object'
    then raise invalid_parameter_value; end if;
  if kind='project' then
    if item ? 'id' and item->>'id' is distinct from task::text then raise invalid_parameter_value; end if;
    id:=task;
  else
    id:=researchtrail.selected_id(item->'id');
    if kind='paper' then
      perform 1 from researchtrail.document_uses u where u.owner_id=me and u.task_id=task and u.document_use_id=id and not u.workspace_archived;
    else
      perform 1 from researchtrail.task_use_artifacts a join researchtrail.document_uses u on u.document_use_id=a.document_use_id
        where a.owner_id=me and a.task_id=task and a.artifact_id=id and not u.workspace_archived;
    end if;
    if not found then raise no_data_found; end if;
  end if;
  select s.version,s.data into old_version,body from researchtrail.workspace_state s
    where s.owner_id=me and s.task_id=task and s.target=kind and s.target_id=id;
  if coalesce(old_version,0)<>(item->>'version')::bigint then raise sqlstate 'RT409'; end if;
  if kind='project' and item#>'{patch,tags}' is not null and item#>'{patch,tags}'<>'null' then
    perform researchtrail.workspace_check_tags(item#>'{patch,tags}');
  end if;
  if kind='paper' and (item->'patch')?'tag' then
    if jsonb_typeof(item#>'{patch,tag}') not in ('string','null') then raise invalid_parameter_value; end if;
    if coalesce(item#>>'{patch,tag}','')<>'' and not exists (
      select from researchtrail.workspace_state s, jsonb_array_elements(s.data->'tags') t
        where s.owner_id=me and s.task_id=task and s.target='project' and t->>'id'=item#>>'{patch,tag}'
    ) then raise sqlstate 'RT001'; end if;
  end if;
  body:=researchtrail.workspace_merge(coalesce(body,'{}'),item->'patch');
  old_version:=coalesce(old_version,0)+1;
  insert into researchtrail.workspace_state values(me,task,kind,id,old_version,body)
    on conflict on constraint workspace_state_pkey do update set version=excluded.version,data=excluded.data;
  insert into researchtrail.workspace_patches values(me,task,kind,id,old_version,item->'patch');
  return jsonb_build_object('version',old_version,'data',body);
end $$;

create function researchtrail.workspace_remove_tag(me uuid,task uuid,payload jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare tag text:=payload->>'tag_id'; tags jsonb; result jsonb; removed integer; paper uuid;
begin
  perform researchtrail.check_fields(payload,array['tag_id','archive_papers','version'],false);
  if not researchtrail.has_record_text(tag) or jsonb_typeof(payload->'tag_id') is distinct from 'string'
    or jsonb_typeof(payload->'archive_papers') is distinct from 'boolean' then raise invalid_parameter_value; end if;
  select s.data->'tags' into tags from researchtrail.workspace_state s where
    s.owner_id=me and s.task_id=task and s.target='project';
  select coalesce(jsonb_agg(value order by pos),'[]') into tags from jsonb_array_elements(coalesce(tags,'[]')) with ordinality as t(value,pos)
    where value->>'id' is distinct from tag;
  result:=researchtrail.workspace_patch(me,task,jsonb_build_object('target','project','version',payload->'version',
    'patch',jsonb_build_object('tags',tags)));
  removed:=0;
  for paper in select s.target_id from researchtrail.workspace_state s
    join researchtrail.document_uses u on u.document_use_id=s.target_id and u.owner_id=s.owner_id and u.task_id=s.task_id
    where s.owner_id=me and s.task_id=task and s.target='paper' and s.data->>'tag'=tag
      and not u.workspace_archived order by s.target_id loop
    if (payload->>'archive_papers')::boolean then perform researchtrail.archive_workspace_paper(me,task,paper); end if;
    removed:=removed+1;
  end loop;
  with changed as (
    update researchtrail.workspace_state s set data=s.data-'tag', version=s.version+1
      where s.owner_id=me and s.task_id=task and s.target='paper' and s.data->>'tag'=tag returning s.target_id,s.version
  )
  insert into researchtrail.workspace_patches select me,task,'paper',target_id,version,'{"tag":null}'::jsonb from changed;
  return result||jsonb_build_object('removed',removed);
end $$;

create function public.rt_workspace_change(task_id uuid,target_id uuid,operation text,payload jsonb,request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  me uuid:=auth.uid(); digest bytea; receipt researchtrail.workspace_changes;
  task researchtrail.research_tasks; paper researchtrail.document_uses; result jsonb;
  saved jsonb; item jsonb; pos bigint; version bigint; kind text; id uuid;
begin
  if me is null then raise no_data_found; end if;
  if $5 is null or jsonb_typeof(payload) is distinct from 'object' then raise invalid_parameter_value; end if;
  if octet_length(payload::text)>10485760 then raise invalid_parameter_value; end if;
  perform researchtrail.workspace_check_json(payload);
  select t.* into strict task from researchtrail.research_tasks t where t.owner_id=me and t.task_id=$1 for update;
  digest:=sha256(convert_to(jsonb_build_array(operation,$2,payload)::text,'UTF8'));
  select c.* into receipt from researchtrail.workspace_changes c where c.owner_id=me and c.task_id=$1 and c.request_id=$5;
  if found then
    if receipt.request_hash<>digest then raise invalid_parameter_value; end if;
    if operation='remove_tag' then
      return receipt.result || researchtrail.workspace_revision(me,$1,'project',$1,(receipt.result->>'version')::bigint);
    elsif operation='patch_state' then
      result:='[]';
      for item,pos in select value,ordinality from jsonb_array_elements(coalesce(payload->'changes',jsonb_build_array(payload))) with ordinality loop
        kind:=item->>'target';
        id:=case when kind='project' then $1 else (item->>'id')::uuid end;
        version:=(receipt.result->'versions'->>((pos-1)::int))::bigint;
        result:=result||jsonb_build_array(researchtrail.workspace_revision(me,$1,kind,id,version));
      end loop;
      return case when payload ? 'changes' then jsonb_build_object('results',result) else result->0 end;
    end if;
    return receipt.result;
  end if;
  if task.workspace_archived then raise no_data_found; end if;
  if operation in ('edit_paper','archive_paper') then
    select u.* into strict paper from researchtrail.document_uses u where u.owner_id=me and u.task_id=$1
      and u.document_use_id=$2 and not u.workspace_archived;
  elsif $2 is not null then raise invalid_parameter_value; end if;
  case operation
    when 'patch_state' then
      if payload ? 'changes' then
        perform researchtrail.check_fields(payload,array['changes'],false);
        if jsonb_typeof(payload->'changes') is distinct from 'array' or jsonb_array_length(payload->'changes')=0
          then raise invalid_parameter_value; end if;
        result:='[]';
        for item in select value from jsonb_array_elements(payload->'changes') loop
          result:=result||jsonb_build_array(researchtrail.workspace_patch(me,$1,item));
        end loop;
        result:=jsonb_build_object('results',result);
      else result:=researchtrail.workspace_patch(me,$1,payload); end if;
      -- An ordinary tag update may rename/recolor tags, but must not leave
      -- dangling assignments. The dedicated removal operation clears them atomically.
      if exists(select from jsonb_array_elements(coalesce(payload->'changes',jsonb_build_array(payload))) w
        where w->>'target'='project' and w->'patch'?'tags') and exists(
        select from researchtrail.workspace_state s join researchtrail.document_uses u
          on (u.owner_id,u.task_id,u.document_use_id)=(s.owner_id,s.task_id,s.target_id)
          where s.owner_id=me and s.task_id=$1 and s.target='paper' and not u.workspace_archived
          and coalesce(s.data->>'tag','')<>'' and not exists(
            select from researchtrail.workspace_state cfg, jsonb_array_elements(cfg.data->'tags') tag
              where cfg.owner_id=me and cfg.task_id=$1 and cfg.target='project' and tag->>'id'=s.data->>'tag')
      ) then raise sqlstate 'RT001'; end if;
    when 'remove_tag' then result:=researchtrail.workspace_remove_tag(me,$1,payload);
    when 'rename_task' then
      perform researchtrail.check_fields(payload,array['goal_text']);
      if not researchtrail.has_record_text(payload->>'goal_text') then raise invalid_parameter_value; end if;
      update researchtrail.research_tasks t set registration_goal_text=coalesce(t.registration_goal_text,t.goal_text),
        goal_text=payload->>'goal_text' where t.owner_id=me and t.task_id=$1 returning t.* into task;
      result:=researchtrail.task_result(task);
    when 'archive_task' then
      if payload<>'{}' then raise invalid_parameter_value; end if;
      update researchtrail.research_tasks t set workspace_archived=true where t.owner_id=me and t.task_id=$1;
      result:=jsonb_build_object('task_id',$1,'archived',true);
    when 'edit_paper' then
      perform researchtrail.check_fields(payload,array['title','date','purpose_text','reading_state_text','access_locator_text']);
      if payload='{}' or (payload?'title' and not researchtrail.has_record_text(payload->>'title'))
        or (payload?'date' and payload->>'date' !~ '^\d{4}-\d{2}-\d{2}$')
        or (payload?'access_locator_text' and payload->>'access_locator_text' !~* '^https?://[^[:space:]]+$')
        then raise invalid_parameter_value; end if;
      perform (payload->>'date')::date;
      -- Per-use overrides keep other tasks and the original record's context intact.
      update researchtrail.document_uses u set workspace_metadata=u.workspace_metadata||payload
        where u.owner_id=me and u.task_id=$1 and u.document_use_id=$2;
      result:=jsonb_build_object('task_id',$1,'document_use_id',$2)||payload;
    when 'archive_paper' then
      if payload<>'{}' then raise invalid_parameter_value; end if;
      perform researchtrail.archive_workspace_paper(me,$1,$2);
      result:=jsonb_build_object('task_id',$1,'document_use_id',$2,'archived',true);
    else raise invalid_parameter_value;
  end case;
  saved:=result;
  if operation='patch_state' then
    select jsonb_build_object('versions',jsonb_agg(v->'version' order by n)) into saved
      from jsonb_array_elements(coalesce(result->'results',jsonb_build_array(result))) with ordinality rows(v,n);
  elsif operation='remove_tag' then saved:=result-'data'; end if;
  insert into researchtrail.workspace_changes values(me,$1,$5,digest,saved);
  return result;
end $$;

-- Keep metadata from an interrupted new-paper form on the registration receipt.
-- Legacy registrations and records continue to use the original signature and RLS.
alter function public.rt_register_paper(uuid,jsonb,uuid) rename to register_workspace_use;
alter function public.register_workspace_use(uuid,jsonb,uuid) set schema researchtrail;
create function researchtrail.guard_registration(task uuid,request uuid,with_metadata boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
  if with_metadata then
    -- A revision will be written by the same transaction. Acquire the strongest
    -- required lock first, avoiding two registrations concurrently upgrading locks.
    perform 1 from researchtrail.research_tasks t where t.owner_id=auth.uid() and t.task_id=task and not t.workspace_archived for update;
    if not found then raise no_data_found; end if;
  else perform researchtrail.lock_workspace_task(task); end if;
  if exists(select from researchtrail.document_uses u where u.owner_id=auth.uid() and u.task_id=task
    and u.workspace_archived and u.request_id=request) then raise no_data_found; end if;
end $$;
create function public.rt_register_paper(task_id uuid,payload jsonb,request_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
  perform researchtrail.guard_registration($1,$3,false);
  return researchtrail.register_workspace_use($1,$2,$3);
end $$;
create function public.rt_register_workspace_paper(task_id uuid,payload jsonb,workspace_data jsonb,request_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare paper jsonb; leaf jsonb;
begin
  perform researchtrail.guard_registration($1,$4,true);
  paper:=researchtrail.register_workspace_use($1,$2,$4);
  leaf:=public.rt_workspace_change($1,null,'patch_state',jsonb_build_object('target','paper',
    'id',paper->'document_use_id','version',0,'patch',workspace_data),$4);
  return paper||jsonb_build_object('workspace',leaf);
end $$;
revoke all on function researchtrail.guard_registration(uuid,uuid,boolean),public.rt_register_paper(uuid,jsonb,uuid),
  public.rt_register_workspace_paper(uuid,jsonb,jsonb,uuid) from public,anon;
grant execute on function researchtrail.guard_registration(uuid,uuid,boolean),public.rt_register_paper(uuid,jsonb,uuid),
  public.rt_register_workspace_paper(uuid,jsonb,jsonb,uuid) to authenticated;

-- Keep a removal receipt even if an interrupted creation arrives afterwards.
-- Historical research records and their original memo references are never deleted.
create or replace function public.rt_pdf_reader(task_id uuid,artifact_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
  perform public.rt_paper_pdf($1,$2);
  return jsonb_build_object('last_page',(select p.last_page from researchtrail.pdf_reading_pages p
    where p.owner_id=auth.uid() and p.task_id=$1 and p.artifact_id=$2),
    'highlights',array(select jsonb_build_object('id',h.id,'page',h.page,'text',h.excerpt_text,'rects',h.rects,'record_id',h.record_id)
      from researchtrail.pdf_highlights h where h.owner_id=auth.uid() and h.task_id=$1 and h.artifact_id=$2
      and not exists(select from researchtrail.removed_highlights r where r.owner_id=h.owner_id and r.task_id=h.task_id
        and r.artifact_id=h.artifact_id and r.id=h.id)
      order by h.created_at desc,h.id));
end $$;
alter function public.rt_save_pdf_reader(uuid,uuid,jsonb) rename to save_pdf_reader_before_removal;
alter function public.save_pdf_reader_before_removal(uuid,uuid,jsonb) set schema researchtrail;
revoke all on function researchtrail.save_pdf_reader_before_removal(uuid,uuid,jsonb) from public,anon,authenticated;
create function public.rt_save_pdf_reader(task_id uuid,artifact_id uuid,payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); mark uuid;
begin
  perform researchtrail.lock_workspace_task($1);
  if payload ?| array['remove_highlight','highlight','link'] then
    perform public.rt_paper_pdf($1,$2);
    if jsonb_typeof(payload) is distinct from 'object' or (select count(*) from jsonb_object_keys(payload))<>1
      then raise invalid_parameter_value; end if;
    mark:=researchtrail.selected_id(coalesce(payload->'remove_highlight',payload#>'{highlight,id}',payload#>'{link,id}'));
    perform pg_advisory_xact_lock(hashtextextended(concat(me,$1,$2,mark),0));
    if payload?'remove_highlight' then
      insert into researchtrail.removed_highlights values(me,$1,$2,mark) on conflict do nothing;
      return public.rt_pdf_reader($1,$2);
    end if;
    if exists(select from researchtrail.removed_highlights r where r.owner_id=me and r.task_id=$1 and r.artifact_id=$2 and r.id=mark)
      then raise sqlstate 'RT001'; end if;
  end if;
  return researchtrail.save_pdf_reader_before_removal($1,$2,payload);
end $$;
revoke all on function researchtrail.lock_workspace_task(uuid),researchtrail.guard_workspace_insert(),researchtrail.archive_workspace_paper(uuid,uuid,uuid),
  researchtrail.link_workspace_papers(uuid,jsonb,uuid),researchtrail.change_workspace_link(uuid,uuid,jsonb,uuid),
  researchtrail.prepare_workspace_pdf(uuid,uuid,text,text,integer,uuid) from public,anon,authenticated;
revoke all on function public.rt_link_papers(uuid,jsonb,uuid),public.rt_change_paper_link(uuid,uuid,jsonb,uuid),
  public.rt_prepare_paper_pdf(uuid,uuid,text,text,integer,uuid) from public,anon;
grant execute on function public.rt_link_papers(uuid,jsonb,uuid),public.rt_change_paper_link(uuid,uuid,jsonb,uuid),
  public.rt_prepare_paper_pdf(uuid,uuid,text,text,integer,uuid) to authenticated;
revoke all on function researchtrail.workspace_check_json(jsonb,integer),researchtrail.workspace_check_tags(jsonb),
  researchtrail.workspace_revision(uuid,uuid,text,uuid,bigint),researchtrail.workspace_merge(jsonb,jsonb),researchtrail.workspace_patch(uuid,uuid,jsonb),
  researchtrail.workspace_remove_tag(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.rt_workspace_state(uuid),public.rt_workspace_change(uuid,uuid,text,jsonb,uuid),
  public.rt_workspace_papers(uuid),public.rt_workspace_tasks(),public.rt_save_pdf_reader(uuid,uuid,jsonb) from public,anon;
grant execute on function public.rt_workspace_state(uuid),public.rt_workspace_change(uuid,uuid,text,jsonb,uuid),
  public.rt_workspace_papers(uuid),public.rt_workspace_tasks(),public.rt_save_pdf_reader(uuid,uuid,jsonb) to authenticated;
commit;
