begin;

-- A record saves its own DocumentUse to retain its original context. In the
-- workspace a plain reference to an already registered paper is not a new card.
-- Preserve the existing account catalog and its ordering for older clients.
create function public.rt_workspace_papers(task_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('papers', coalesce(jsonb_agg(p.item order by p.pos), '[]'::jsonb))
  from jsonb_array_elements(public.rt_papers($1)->'papers') with ordinality as p(item,pos)
  where not exists (
    select from researchtrail.record_document_contexts c
    where c.owner_id=(select auth.uid()) and c.task_id=$1 and c.document_use_id=(p.item->>'document_use_id')::uuid
      and jsonb_strip_nulls(p.item->'use')='{}'::jsonb and p.item->>'date' is null and p.item->'artifacts'='[]'::jsonb
      and not exists (select from researchtrail.evidence_excerpts e where e.document_use_id=c.document_use_id)
      and not exists (select from researchtrail.document_use_links l where l.task_id=$1 and
        c.document_use_id in (l.from_document_use_id,l.to_document_use_id))
      and exists (
        select from researchtrail.document_uses registered
        where registered.owner_id=c.owner_id and registered.task_id=$1 and registered.document_id=c.document_id
          and not exists (select from researchtrail.record_document_contexts r where r.document_use_id=registered.document_use_id)
          and (c.artifact_id is null or exists (select from researchtrail.document_artifacts a
            where a.artifact_id=c.artifact_id and a.document_use_id=registered.document_use_id))
      )
  )
$$;
revoke all on function public.rt_workspace_papers(uuid) from public, anon;
grant execute on function public.rt_workspace_papers(uuid) to authenticated;
commit;
