begin;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('researchtrail-pdfs','researchtrail-pdfs',false,10485760,array['application/pdf'])
on conflict(id) do update set public=false, file_size_limit=excluded.file_size_limit,
                              allowed_mime_types=excluded.allowed_mime_types;

-- A client can read its own objects. Even an unrelated permissive policy cannot
-- allow writes to this bucket: only the byte-validating Edge Function uploads.
create policy rt_pdf_owner_read on storage.objects for select to authenticated using
  (bucket_id='researchtrail-pdfs' and split_part(name,'/',1)=(select auth.uid())::text);
create policy rt_pdf_read_boundary on storage.objects as restrictive for select to public using
  (bucket_id<>'researchtrail-pdfs' or split_part(name,'/',1)=(select auth.uid())::text);
create policy rt_pdf_insert_boundary on storage.objects as restrictive for insert to public
  with check (bucket_id<>'researchtrail-pdfs');
create policy rt_pdf_update_boundary on storage.objects as restrictive for update to public
  using (bucket_id<>'researchtrail-pdfs') with check (bucket_id<>'researchtrail-pdfs');
create policy rt_pdf_delete_boundary on storage.objects as restrictive for delete to public
  using (bucket_id<>'researchtrail-pdfs');

alter table researchtrail.document_artifacts
  add column pdf_sha256 text,
  add column pdf_size_bytes integer,
  add column pdf_object_name text generated always as (
    owner_id::text || '/' || document_use_id::text || '/' || pdf_sha256 || '.pdf'
  ) stored,
  add check ((pdf_sha256 is null) = (pdf_size_bytes is null)),
  add check (pdf_sha256 ~ '^[0-9a-f]{64}$' and pdf_size_bytes between 1 and 10485760),
  add unique(document_use_id,pdf_sha256);

create function researchtrail.pdf_target(a researchtrail.document_artifacts) returns jsonb
language sql immutable set search_path='' as $$
  select jsonb_build_object('artifact_id',a.artifact_id,'object_name',a.pdf_object_name,
                            'sha256',a.pdf_sha256,'size_bytes',a.pdf_size_bytes)
$$;

create function public.rt_prepare_paper_pdf(task_id uuid, document_use_id uuid, file_name text, content_sha256 text, size_bytes integer,
  existing_artifact_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  paper researchtrail.document_uses;
  artifact researchtrail.document_artifacts;
begin
  select u.* into strict paper from researchtrail.document_uses u
    where u.owner_id=auth.uid() and u.task_id=$1 and u.document_use_id=$2;
  if file_name is null or file_name !~* '\.pdf$' or char_length(file_name) not between 5 and 255
     or file_name ~ '[[:cntrl:]/]' or strpos(file_name,chr(92))>0
     or content_sha256 is null or content_sha256 !~ '^[0-9a-f]{64}$'
     or size_bytes is null or size_bytes not between 1 and 10485760 then raise invalid_parameter_value; end if;
  -- Older clients could register only a filename. Bind bytes to that exact ID only when selected.
  if existing_artifact_id is not null then
    select a.* into strict artifact from researchtrail.document_artifacts a
      where a.owner_id=paper.owner_id and a.document_use_id=$2 and a.artifact_id=existing_artifact_id for update;
    if artifact.pdf_sha256 is null then
      if artifact.access_locator_text is not null or coalesce(artifact.label_text,'') !~* '\.pdf$' then raise invalid_parameter_value; end if;
      update researchtrail.document_artifacts a set pdf_sha256=$4, pdf_size_bytes=$5
        where a.artifact_id=existing_artifact_id returning * into artifact;
    elsif artifact.pdf_sha256<>$4 or artifact.pdf_size_bytes<>$5 then raise invalid_parameter_value; end if;
    return researchtrail.pdf_target(artifact);
  end if;
  insert into researchtrail.document_artifacts(owner_id,document_use_id,document_id,label_text,pdf_sha256,pdf_size_bytes)
    values(paper.owner_id,paper.document_use_id,paper.document_id,$3,$4,$5)
    on conflict on constraint document_artifacts_document_use_id_pdf_sha256_key do nothing returning * into artifact;
  if not found then
    select a.* into strict artifact from researchtrail.document_artifacts a
      where a.owner_id=paper.owner_id and a.document_use_id=$2 and a.pdf_sha256=$4;
    if artifact.pdf_size_bytes<>$5 then raise invalid_parameter_value; end if;
  end if;
  return researchtrail.pdf_target(artifact);
exception when unique_violation then raise invalid_parameter_value;
end $$;

create function public.rt_paper_pdf(task_id uuid,artifact_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
  select researchtrail.pdf_target(a) into strict result from researchtrail.document_artifacts a
    where a.owner_id=auth.uid() and a.artifact_id=$2 and a.pdf_sha256 is not null and exists(
      select from researchtrail.task_use_artifacts ua where ua.owner_id=a.owner_id and ua.task_id=$1 and ua.artifact_id=$2);
  return result;
end $$;

-- Publish availability from the committed Storage object. An interrupted transfer
-- stays attached to its paper and never needs another memo or metadata write to finish.
create function researchtrail.with_paper_pdfs(papers jsonb) returns jsonb
language sql stable security invoker set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_set(p,'{artifacts}',(
    select coalesce(jsonb_agg(case when a.pdf_sha256 is not null then item ||
      jsonb_build_object('pdf',jsonb_build_object('available',o.name is not null,'size_bytes',a.pdf_size_bytes,
        'sha256',a.pdf_sha256,'document_use_id',a.document_use_id))
      when a.document_use_id=(p->>'document_use_id')::uuid and a.access_locator_text is null and a.label_text ~* '\.pdf$'
        then item || jsonb_build_object('can_attach_pdf',true) else item end
      order by item_pos),'[]')
    from jsonb_array_elements(p->'artifacts') with ordinality ar(item,item_pos)
    left join researchtrail.document_artifacts a on a.owner_id=(select auth.uid())
      and a.artifact_id=(item->>'artifact_id')::uuid
    left join storage.objects o on o.bucket_id='researchtrail-pdfs' and o.name=a.pdf_object_name
  )) order by paper_pos),'[]') from jsonb_array_elements(papers) with ordinality as papers_list(p,paper_pos)
$$;
alter function public.rt_resume(uuid) rename to resume_before_pdfs;
alter function public.resume_before_pdfs(uuid) set schema researchtrail;
create function public.rt_resume(task_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
  with snapshot as materialized (select researchtrail.resume_before_pdfs($1) as data)
  select jsonb_set(data,'{context,document_contexts}',researchtrail.with_paper_pdfs(data#>'{context,document_contexts}')) from snapshot
$$;
alter function public.rt_papers(uuid) set schema researchtrail;
create function public.rt_papers(task_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('papers',researchtrail.with_paper_pdfs(researchtrail.rt_papers($1)->'papers'))
$$;

revoke all on function public.rt_prepare_paper_pdf(uuid,uuid,text,text,integer,uuid),public.rt_paper_pdf(uuid,uuid),
  researchtrail.pdf_target(researchtrail.document_artifacts),researchtrail.with_paper_pdfs(jsonb),public.rt_resume(uuid),public.rt_papers(uuid)
  from public,anon;
grant execute on function public.rt_prepare_paper_pdf(uuid,uuid,text,text,integer,uuid),public.rt_paper_pdf(uuid,uuid),
  researchtrail.pdf_target(researchtrail.document_artifacts),researchtrail.with_paper_pdfs(jsonb),public.rt_resume(uuid),public.rt_papers(uuid)
  to authenticated;
commit;
