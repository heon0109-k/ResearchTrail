-- Passages of an uploaded PDF edition and their embedding vectors (docs/spikes/linked_papers_rag.md 3.3).
-- Technical tables, not ontology classes. Names, limits and the vector size are drafts pending team review.
begin;
create schema if not exists extensions;
create extension if not exists vector with schema extensions;

-- One row per PDF edition that has been, or is being, indexed. No row means not indexed.
create table researchtrail.rag_paper_index (
  artifact_id uuid primary key references researchtrail.document_artifacts(artifact_id) on delete cascade,
  owner_id uuid not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null check (status in ('indexing','ready')),
  chunker text not null check (chunker ~ '[^[:space:]]'),
  embedding_model text not null check (embedding_model ~ '[^[:space:]]'),
  chunk_count integer check (chunk_count > 0),
  -- The mean of the edition's passage vectors, for ordering papers by how close they are to a question.
  paper_embedding extensions.vector(1536),
  check ((status='ready') = (finished_at is not null and chunk_count is not null and paper_embedding is not null))
);
create table researchtrail.rag_chunks (
  artifact_id uuid not null references researchtrail.rag_paper_index(artifact_id) on delete cascade,
  owner_id uuid not null,
  page integer not null check (page > 0),
  start_offset integer not null check (start_offset >= 0),
  end_offset integer not null,
  content text not null check (content ~ '[^[:space:]]' and char_length(content) <= 4000),
  embedding extensions.vector(1536) not null,
  primary key (artifact_id,page,start_offset),
  check (end_offset > start_offset)
);

alter table researchtrail.rag_paper_index enable row level security;
alter table researchtrail.rag_chunks enable row level security;
revoke all on researchtrail.rag_paper_index,researchtrail.rag_chunks from public, anon, authenticated;
grant select on researchtrail.rag_paper_index,researchtrail.rag_chunks to authenticated;
create policy own_read on researchtrail.rag_paper_index for select to authenticated using (owner_id=(select auth.uid()));
create policy own_read on researchtrail.rag_chunks for select to authenticated using (owner_id=(select auth.uid()));

-- The caller's uploaded PDF edition in this task. Absent, foreign and PDF-less editions fail the same way.
create function researchtrail.rag_pdf_artifact(task_id uuid, artifact_id uuid)
returns researchtrail.document_artifacts language plpgsql stable security invoker set search_path = '' as $$
declare a researchtrail.document_artifacts;
begin
  select d.* into strict a from researchtrail.document_artifacts d
    where d.owner_id=(select auth.uid()) and d.artifact_id=$2 and d.pdf_sha256 is not null and exists(
      select from researchtrail.task_use_artifacts ua where ua.owner_id=d.owner_id and ua.task_id=$1 and ua.artifact_id=$2);
  return a;
end $$;
create function researchtrail.rag_index_result(i researchtrail.rag_paper_index)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('status',i.status,'chunk_count',i.chunk_count,'chunker',i.chunker,'embedding_model',i.embedding_model)
$$;
-- Index writes for one edition run one at a time.
create function researchtrail.rag_lock(artifact_id uuid)
returns void language sql security invoker set search_path = '' as $$
  select pg_advisory_xact_lock(hashtextextended('rag-index' || $1::text, 0))
$$;

-- Starting an index discards whatever was stored for this edition, including an interrupted upload.
create function public.rt_rag_begin_index(task_id uuid, artifact_id uuid, payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a researchtrail.document_artifacts; saved researchtrail.rag_paper_index;
begin
  a := researchtrail.rag_pdf_artifact($1,$2);
  perform researchtrail.check_fields(payload,array['pdf_sha256','chunker','embedding_model']);
  -- The browser must have read the same bytes the account stored for this edition.
  if payload->>'pdf_sha256' is distinct from a.pdf_sha256 or coalesce(payload->>'chunker','') !~ '[^[:space:]]'
     or coalesce(payload->>'embedding_model','') !~ '[^[:space:]]' then raise invalid_parameter_value; end if;
  perform researchtrail.rag_lock($2);
  delete from researchtrail.rag_paper_index i where i.artifact_id=$2;
  insert into researchtrail.rag_paper_index(artifact_id,owner_id,status,chunker,embedding_model)
    values($2,a.owner_id,'indexing',payload->>'chunker',payload->>'embedding_model') returning * into saved;
  return jsonb_build_object('artifact_id',$2) || researchtrail.rag_index_result(saved);
end $$;

-- A repeated batch stores each passage once: a passage is identified by its page and start position.
create function public.rt_rag_add_chunks(task_id uuid, artifact_id uuid, chunks jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a researchtrail.document_artifacts; c jsonb; stored integer;
begin
  a := researchtrail.rag_pdf_artifact($1,$2);
  if jsonb_typeof(chunks) is distinct from 'array' or jsonb_array_length(chunks) not between 1 and 100 then
    raise invalid_parameter_value; end if;
  perform researchtrail.rag_lock($2);
  perform 1 from researchtrail.rag_paper_index i where i.artifact_id=$2 and i.status='indexing';
  if not found then raise invalid_parameter_value; end if;
  for c in select value from jsonb_array_elements(chunks) loop
    perform researchtrail.check_fields(c,array['page','start','end','text','embedding'],false);
    if jsonb_typeof(c->'page') is distinct from 'number' or jsonb_typeof(c->'start') is distinct from 'number'
       or jsonb_typeof(c->'end') is distinct from 'number' or jsonb_typeof(c->'text') is distinct from 'string'
       or jsonb_typeof(c->'embedding') is distinct from 'array' or jsonb_array_length(c->'embedding') <> 1536
    then raise invalid_parameter_value; end if;
    insert into researchtrail.rag_chunks(artifact_id,owner_id,page,start_offset,end_offset,content,embedding)
      values($2,a.owner_id,(c->>'page')::integer,(c->>'start')::integer,(c->>'end')::integer,c->>'text',
             (c->>'embedding')::extensions.vector(1536))
      on conflict on constraint rag_chunks_pkey do nothing;
  end loop;
  select count(*) into stored from researchtrail.rag_chunks k where k.artifact_id=$2;
  if stored > 5000 then raise invalid_parameter_value; end if;
  return jsonb_build_object('artifact_id',$2,'received',jsonb_array_length(chunks),'stored',stored);
end $$;

-- The index becomes searchable only when every passage the browser produced has arrived.
create function public.rt_rag_finish_index(task_id uuid, artifact_id uuid, chunk_count integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a researchtrail.document_artifacts; saved researchtrail.rag_paper_index; stored integer;
begin
  a := researchtrail.rag_pdf_artifact($1,$2);
  perform researchtrail.rag_lock($2);
  select i.* into saved from researchtrail.rag_paper_index i where i.artifact_id=$2;
  if not found or chunk_count is null then raise invalid_parameter_value; end if;
  if saved.status='indexing' then
    select count(*) into stored from researchtrail.rag_chunks k where k.artifact_id=$2;
    if stored = 0 or stored <> chunk_count then raise invalid_parameter_value; end if;
    update researchtrail.rag_paper_index i set status='ready', finished_at=now(), chunk_count=stored,
      paper_embedding=(select extensions.avg(k.embedding) from researchtrail.rag_chunks k where k.artifact_id=$2)
      where i.artifact_id=$2 returning * into saved;
  elsif saved.chunk_count <> chunk_count then raise invalid_parameter_value;
  end if;
  return jsonb_build_object('artifact_id',$2) || researchtrail.rag_index_result(saved);
end $$;

-- Every uploaded PDF edition of the task, with its index or null when it has none.
create function public.rt_rag_index_status(task_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  perform 1 from researchtrail.research_tasks t where t.owner_id=(select auth.uid()) and t.task_id=$1;
  if not found then raise no_data_found; end if;
  return jsonb_build_object('artifacts',coalesce((select jsonb_agg(jsonb_build_object(
      'document_use_id',u.document_use_id,'artifact_id',a.artifact_id,
      'index',case when i.artifact_id is null then null else researchtrail.rag_index_result(i) end)
      order by a.created_at desc,a.artifact_id)
    from researchtrail.document_uses u
    join researchtrail.document_artifacts a using (owner_id,document_id,document_use_id)
    left join researchtrail.rag_paper_index i on i.artifact_id=a.artifact_id and i.owner_id=a.owner_id
    where u.owner_id=(select auth.uid()) and u.task_id=$1 and a.pdf_sha256 is not null),'[]'::jsonb));
end $$;

revoke all on function researchtrail.rag_pdf_artifact(uuid,uuid), researchtrail.rag_index_result(researchtrail.rag_paper_index),
  researchtrail.rag_lock(uuid), public.rt_rag_begin_index(uuid,uuid,jsonb), public.rt_rag_add_chunks(uuid,uuid,jsonb),
  public.rt_rag_finish_index(uuid,uuid,integer), public.rt_rag_index_status(uuid) from public, anon;
grant execute on function researchtrail.rag_pdf_artifact(uuid,uuid), researchtrail.rag_index_result(researchtrail.rag_paper_index),
  researchtrail.rag_lock(uuid), public.rt_rag_begin_index(uuid,uuid,jsonb), public.rt_rag_add_chunks(uuid,uuid,jsonb),
  public.rt_rag_finish_index(uuid,uuid,integer), public.rt_rag_index_status(uuid) to authenticated;
commit;
