-- Read side of the question feature: what one question may search, and the closest stored passages
-- (docs/spikes/linked_papers_rag.md 3.1, 3.4). Read-only; limits are drafts pending team review.
begin;

-- The read procedures run as the caller and use the vector type and its distance operator.
-- Supabase grants this already; a bare PostgreSQL does not.
grant usage on schema extensions to authenticated;

create function researchtrail.rag_query_vector(value jsonb)
returns extensions.vector language plpgsql immutable set search_path = '' as $$
begin
  if jsonb_typeof(value) is distinct from 'array' or jsonb_array_length(value) <> 1536 then raise invalid_parameter_value; end if;
  return (value::text)::extensions.vector(1536);
end $$;

-- Every paper of the task with its uploaded PDF editions, and the task's links.
-- An edition's similarity to the question is given only when its index is finished. The caller compares it
-- only between editions embedded with the same model.
create function public.rt_rag_scope(task_id uuid, query_embedding jsonb)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare me uuid := auth.uid(); q extensions.vector := researchtrail.rag_query_vector($2);
begin
  perform 1 from researchtrail.research_tasks t where t.owner_id=me and t.task_id=$1;
  if not found then raise no_data_found; end if;
  return jsonb_build_object(
    'papers',coalesce((select jsonb_agg(jsonb_build_object('document_use_id',u.document_use_id,'title',d.title,
        'editions',coalesce((select jsonb_agg(jsonb_build_object('artifact_id',a.artifact_id,'status',i.status,'embedding_model',i.embedding_model,
            'similarity',case when i.status='ready' then 1 - (i.paper_embedding operator(extensions.<=>) q) end)
            order by a.created_at desc,a.artifact_id)
          from researchtrail.document_artifacts a
          left join researchtrail.rag_paper_index i on i.artifact_id=a.artifact_id and i.owner_id=a.owner_id
          where a.owner_id=u.owner_id and a.document_use_id=u.document_use_id and a.pdf_sha256 is not null),'[]'::jsonb))
        order by u.created_at desc,u.document_use_id)
      from researchtrail.document_uses u join researchtrail.documents d using (owner_id,document_id)
      where u.owner_id=me and u.task_id=$1),'[]'::jsonb),
    'links',coalesce((select jsonb_agg(jsonb_build_object('from_document_use_id',l.from_document_use_id,
        'to_document_use_id',l.to_document_use_id) order by l.created_at desc,l.link_id)
      from researchtrail.document_use_links l where l.owner_id=me and l.task_id=$1),'[]'::jsonb));
end $$;

-- The passages closest to the question among the requested editions, and every passage of the open edition
-- so the caller can apply its keyword and page rules there. Only the caller's finished indexes in this task
-- are read; any other requested ID simply matches nothing.
create function public.rt_rag_search(task_id uuid, payload jsonb)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare me uuid := auth.uid(); q extensions.vector; ids uuid[]; open_id uuid; n integer;
begin
  perform 1 from researchtrail.research_tasks t where t.owner_id=me and t.task_id=$1;
  if not found then raise no_data_found; end if;
  perform researchtrail.check_fields(payload,array['artifact_ids','embedding','match_count','current_artifact_id'],false);
  q := researchtrail.rag_query_vector(payload->'embedding');
  if jsonb_typeof(payload->'artifact_ids') is distinct from 'array' or jsonb_array_length(payload->'artifact_ids') not between 1 and 9
     or jsonb_typeof(payload->'match_count') is distinct from 'number' then raise invalid_parameter_value; end if;
  n := (payload->>'match_count')::integer;
  if n not between 1 and 100 then raise invalid_parameter_value; end if;
  select array_agg(researchtrail.selected_id(value)) into ids from jsonb_array_elements(payload->'artifact_ids');
  if coalesce(payload->'current_artifact_id','null') <> 'null' then open_id := researchtrail.selected_id(payload->'current_artifact_id'); end if;
  return (
    with searchable as (
      select a.artifact_id,a.document_use_id
        from researchtrail.document_uses u
        join researchtrail.document_artifacts a using (owner_id,document_id,document_use_id)
        join researchtrail.rag_paper_index i on i.artifact_id=a.artifact_id and i.owner_id=a.owner_id and i.status='ready'
        where u.owner_id=me and u.task_id=$1 and (a.artifact_id = any(ids) or a.artifact_id = open_id)),
    scored as (
      select jsonb_build_object('artifact_id',s.artifact_id,'document_use_id',s.document_use_id,'page',k.page,
               'start',k.start_offset,'end',k.end_offset,'text',k.content,
               'similarity',1 - (k.embedding operator(extensions.<=>) q)) as item,
             s.artifact_id as edition,k.page,k.start_offset,k.embedding operator(extensions.<=>) q as distance
        from searchable s join researchtrail.rag_chunks k on k.artifact_id=s.artifact_id),
    matches as (select * from scored where edition = any(ids) order by distance,edition,page,start_offset limit n),
    opened as (select * from scored where edition = open_id order by page,start_offset limit 400)
    select jsonb_build_object(
      'matches',coalesce((select jsonb_agg(item order by distance,edition,page,start_offset) from matches),'[]'::jsonb),
      'current',coalesce((select jsonb_agg(item order by page,start_offset) from opened),'[]'::jsonb)));
end $$;

revoke all on function researchtrail.rag_query_vector(jsonb), public.rt_rag_scope(uuid,jsonb), public.rt_rag_search(uuid,jsonb)
  from public, anon;
grant execute on function researchtrail.rag_query_vector(jsonb), public.rt_rag_scope(uuid,jsonb), public.rt_rag_search(uuid,jsonb)
  to authenticated;
commit;
