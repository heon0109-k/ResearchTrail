-- Additive upgrade for already deployed workspace instances.
begin;
create view researchtrail.workspace_highlights with (security_invoker=true) as
  select h.owner_id,h.task_id,h.artifact_id,h.id,h.created_at,
    jsonb_build_object('id',h.id,'page',h.page,'text',h.excerpt_text,'rects',h.rects,'record_id',h.record_id) as highlight
  from researchtrail.pdf_highlights h
  where h.owner_id=(select auth.uid())
    and exists(select from researchtrail.task_use_artifacts a
      where (a.owner_id,a.task_id,a.artifact_id)=(h.owner_id,h.task_id,h.artifact_id))
    and not exists(select from researchtrail.removed_highlights r
      where (r.owner_id,r.task_id,r.artifact_id,r.id)=(h.owner_id,h.task_id,h.artifact_id,h.id));
revoke all on researchtrail.workspace_highlights from public,anon,authenticated;
grant select on researchtrail.workspace_highlights to authenticated;

alter function public.rt_workspace_state(uuid) rename to workspace_state_before_highlights;
alter function public.workspace_state_before_highlights(uuid) set schema researchtrail;
create function public.rt_workspace_state(task_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
  select researchtrail.workspace_state_before_highlights($1)||jsonb_build_object('reader_highlights',
    coalesce((select jsonb_object_agg(artifact_id,marks) from (
      select h.artifact_id,jsonb_agg(h.highlight order by h.created_at desc,h.id) as marks
        from researchtrail.workspace_highlights h where h.task_id=$1 group by h.artifact_id
    ) editions),'{}'))
$$;
create or replace function public.rt_pdf_reader(task_id uuid,artifact_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
  perform public.rt_paper_pdf($1,$2);
  return jsonb_build_object('last_page',(select p.last_page from researchtrail.pdf_reading_pages p
    where p.owner_id=auth.uid() and p.task_id=$1 and p.artifact_id=$2),
    'highlights',array(select h.highlight from researchtrail.workspace_highlights h
      where h.task_id=$1 and h.artifact_id=$2 order by h.created_at desc,h.id));
end $$;

-- Edits from old clients still have their own HTTP contract and receipt. Track
-- their revisions so an already-open modern paper form cannot overwrite them.
alter table researchtrail.workspace_patches add column canonical_only boolean not null default false;
-- A 012 tag removal could leave the selected filter pointing at a removed tag.
-- Record that correction as a new revision so old request receipts still replay.
with repaired as (
  update researchtrail.workspace_state s set data=s.data-'filterTag',version=s.version+1
    where s.target='project' and jsonb_typeof(s.data->'filterTag')='string' and s.data->>'filterTag'<>''
      and not exists(select from jsonb_array_elements(case when jsonb_typeof(s.data->'tags')='array'
        then s.data->'tags' else '[]' end) tag where tag->>'id'=s.data->>'filterTag')
    returning s.owner_id,s.task_id,s.target,s.target_id,s.version
)
insert into researchtrail.workspace_patches(owner_id,task_id,target,target_id,version,patch)
  select r.*,'{"filterTag":null}'::jsonb from repaired r;
alter function public.rt_workspace_change(uuid,uuid,text,jsonb,uuid) rename to change_workspace_v12;
alter function public.change_workspace_v12(uuid,uuid,text,jsonb,uuid) set schema researchtrail;
alter function researchtrail.workspace_patch(uuid,uuid,jsonb) rename to patch_workspace_extras;

create function researchtrail.workspace_patch(me uuid,task uuid,item jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare
  result jsonb; leaf jsonb:=item-'paper_fields'; id uuid; now_version bigint; wanted bigint;
  project jsonb; tags jsonb; chosen text;
begin
  if item ? 'paper_fields' then
    if item->>'target' is distinct from 'paper' or jsonb_typeof(item->'paper_fields') is distinct from 'object'
      then raise invalid_parameter_value; end if;
    -- Validate the user's observed version first. The original canonical edit
    -- routine enforces the same field validation, membership and metadata overlay.
    result:=researchtrail.patch_workspace_extras(me,task,leaf);
    perform researchtrail.change_workspace_v12(task,researchtrail.selected_id(item->'id'),
      'edit_paper',item->'paper_fields',gen_random_uuid());
    return result;
  end if;
  if item->>'target'='project' and item->'patch' ?| array['tags','filterTag'] then
    select s.data into project from researchtrail.workspace_state s where
      (s.owner_id,s.task_id,s.target,s.target_id)=(me,task,'project',task);
    tags:=coalesce(item#>'{patch,tags}',project->'tags');
    if item->'patch'?'filterTag' then
      if jsonb_typeof(item#>'{patch,filterTag}') not in ('string','null') then raise invalid_parameter_value; end if;
      chosen:=item#>>'{patch,filterTag}';
    else chosen:=project->>'filterTag'; end if;
    if chosen<>'' and not exists(select from jsonb_array_elements(case when jsonb_typeof(tags)='array' then tags else '[]' end) tag
      where tag->>'id'=chosen) then
      if item->'patch'?'filterTag' then raise sqlstate 'RT001'; end if;
      -- Store the removal alongside the tag list in this exact revision.
      leaf:=jsonb_set(leaf,'{patch,filterTag}','null');
    end if;
  end if;
  if item->>'target'='paper' and jsonb_typeof(item->'version')='number' and item->>'version'~'^(0|[1-9][0-9]*)$' then
    id:=researchtrail.selected_id(item->'id');
    wanted:=(item->>'version')::bigint;
    select s.version into now_version from researchtrail.workspace_state s where
      (s.owner_id,s.task_id,s.target,s.target_id)=(me,task,'paper',id);
    -- Old extras-only clients can still submit their observed revision after a
    -- metadata-only save. Their submitted keys cannot change the canonical fields.
    if now_version>wanted and not exists(select from researchtrail.workspace_patches p where
      (p.owner_id,p.task_id,p.target,p.target_id)=(me,task,'paper',id) and p.version>wanted and not p.canonical_only)
      then leaf:=jsonb_set(leaf,'{version}',to_jsonb(now_version)); end if;
  end if;
  return researchtrail.patch_workspace_extras(me,task,leaf);
end $$;

create function public.rt_workspace_change(task_id uuid,target_id uuid,operation text,payload jsonb,request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  me uuid:=auth.uid(); already_saved boolean; current_version bigint; result jsonb;
begin
  if operation='edit_paper' then
    perform 1 from researchtrail.research_tasks t where t.owner_id=me and t.task_id=$1 for update;
    if not found then raise no_data_found; end if;
    select exists(select from researchtrail.workspace_changes c where c.owner_id=me and c.task_id=$1 and c.request_id=$5)
      into already_saved;
    result:=researchtrail.change_workspace_v12($1,$2,$3,$4,$5);
    if not already_saved then
      select s.version into current_version from researchtrail.workspace_state s where
        (s.owner_id,s.task_id,s.target,s.target_id)=(me,$1,'paper',$2);
      perform researchtrail.patch_workspace_extras(me,$1,jsonb_build_object('target','paper','id',$2,
        'version',coalesce(current_version,0),'patch','{}'::jsonb));
      update researchtrail.workspace_patches p set canonical_only=true where
        (p.owner_id,p.task_id,p.target,p.target_id,p.version)=(me,$1,'paper',$2,coalesce(current_version,0)+1);
    end if;
    return result;
  end if;
  result:=researchtrail.change_workspace_v12($1,$2,$3,$4,$5);
  -- Include precisely the canonical fields that this receipt committed. The
  -- original dispatcher verifies the full request hash before returning a replay.
  if operation='patch_state' and payload ? 'paper_fields' then
    return result||jsonb_build_object('paper_fields',payload->'paper_fields');
  elsif operation='patch_state' and payload ? 'changes' then
    return jsonb_build_object('results',(select jsonb_agg(case when leaf.value?'paper_fields'
      then saved.value||jsonb_build_object('paper_fields',leaf.value->'paper_fields') else saved.value end order by leaf.n)
      from jsonb_array_elements(payload->'changes') with ordinality leaf(value,n)
      join jsonb_array_elements(result->'results') with ordinality saved(value,n) using(n)));
  end if;
  return result;
end $$;

alter function researchtrail.workspace_remove_tag(uuid,uuid,jsonb) rename to remove_workspace_tag_v12;
create function researchtrail.workspace_remove_tag(me uuid,task uuid,payload jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare expected uuid[]; members uuid[];
begin
  if payload ? 'expected_papers' then
    if payload->'archive_papers' is distinct from 'true'::jsonb or jsonb_typeof(payload->'expected_papers') is distinct from 'array'
      then raise invalid_parameter_value; end if;
    select coalesce(array_agg(id order by id),'{}') into expected from
      (select researchtrail.selected_id(value) id from jsonb_array_elements(payload->'expected_papers')) requested;
    if cardinality(expected)<>(select count(distinct id) from unnest(expected) id) then raise invalid_parameter_value; end if;
    select coalesce(array_agg(s.target_id order by s.target_id),'{}') into members
      from researchtrail.workspace_state s join researchtrail.document_uses u
        on (u.owner_id,u.task_id,u.document_use_id)=(s.owner_id,s.task_id,s.target_id)
      where s.owner_id=me and s.task_id=task and s.target='paper' and not u.workspace_archived
        and s.data->>'tag'=payload->>'tag_id';
    if expected<>members then raise sqlstate 'RT409'; end if;
  end if;
  return researchtrail.remove_workspace_tag_v12(me,task,payload-'expected_papers');
end $$;

revoke all on function researchtrail.change_workspace_v12(uuid,uuid,text,jsonb,uuid),
  researchtrail.remove_workspace_tag_v12(uuid,uuid,jsonb),researchtrail.workspace_remove_tag(uuid,uuid,jsonb),
  researchtrail.patch_workspace_extras(uuid,uuid,jsonb),researchtrail.workspace_patch(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.rt_workspace_state(uuid),public.rt_workspace_change(uuid,uuid,text,jsonb,uuid) from public,anon;
grant execute on function public.rt_workspace_state(uuid),public.rt_workspace_change(uuid,uuid,text,jsonb,uuid) to authenticated;
commit;
