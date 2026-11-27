-- A link the account's owner drew between two papers of one task, with the reason they gave.
-- The table and field names are a draft: docs/ontology.yaml has no user-drawn link between papers yet.
begin;

-- Lets a link name its task and both papers in one foreign key, so a link cannot cross tasks or accounts.
alter table researchtrail.document_uses
  add constraint document_uses_task_use_key unique (owner_id, task_id, document_use_id);

create table researchtrail.document_use_links (
  link_id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  task_id uuid not null,
  from_document_use_id uuid not null,
  to_document_use_id uuid not null,
  reason_text text check (reason_text ~ '[^[:space:]]'),
  request_id uuid not null, request_hash bytea not null,
  check (from_document_use_id <> to_document_use_id),
  foreign key (owner_id,task_id,from_document_use_id)
    references researchtrail.document_uses(owner_id,task_id,document_use_id) on delete cascade,
  foreign key (owner_id,task_id,to_document_use_id)
    references researchtrail.document_uses(owner_id,task_id,document_use_id) on delete cascade,
  constraint document_use_link_request_key unique (owner_id,task_id,request_id)
);
-- Two papers have at most one link, whichever way it points.
create unique index document_use_link_pair_key on researchtrail.document_use_links
  (owner_id, task_id, least(from_document_use_id,to_document_use_id), greatest(from_document_use_id,to_document_use_id));

alter table researchtrail.document_use_links enable row level security;
revoke all on researchtrail.document_use_links from public, anon, authenticated;
grant select on researchtrail.document_use_links to authenticated;
create policy own_read on researchtrail.document_use_links for select to authenticated using (owner_id=(select auth.uid()));

create function researchtrail.link_result(l researchtrail.document_use_links)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('link_id',l.link_id,'from_document_use_id',l.from_document_use_id,
    'to_document_use_id',l.to_document_use_id,'reason_text',l.reason_text)
$$;

create function public.rt_paper_links(task_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  perform 1 from researchtrail.research_tasks t where t.owner_id=(select auth.uid()) and t.task_id=$1;
  if not found then raise no_data_found; end if;
  return jsonb_build_object('links',coalesce((select jsonb_agg(researchtrail.link_result(l) order by l.created_at desc,l.link_id)
    from researchtrail.document_use_links l where l.owner_id=(select auth.uid()) and l.task_id=$1),'[]'::jsonb));
end $$;

-- Only this operation writes links. The loop rule cannot be a table constraint, so the caller has no direct insert.
create function public.rt_link_papers(task_id uuid, payload jsonb, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  account uuid := auth.uid();
  from_id uuid; to_id uuid;
  reason text := payload->>'reason_text';
  digest bytea := sha256(convert_to(payload::text,'UTF8'));
  saved researchtrail.document_use_links;
begin
  perform 1 from researchtrail.research_tasks t where t.owner_id=account and t.task_id=$1;
  if not found then raise no_data_found; end if;
  perform researchtrail.check_fields(payload,array['from_document_use_id','to_document_use_id','reason_text'],false);
  if request_id is null or not payload ?& array['from_document_use_id','to_document_use_id']
     or jsonb_typeof(payload->'reason_text') not in ('string','null') then raise invalid_parameter_value; end if;
  from_id := researchtrail.selected_id(payload->'from_document_use_id');
  to_id := researchtrail.selected_id(payload->'to_document_use_id');

  -- One link at a time per task: a retry sees the first attempt, and two requests cannot close a loop together.
  perform pg_advisory_xact_lock(hashtextextended(account::text || $1::text || 'paper-links', 0));
  select l.* into saved from researchtrail.document_use_links l where l.owner_id=account and l.task_id=$1 and l.request_id=$3;
  if found then
    if saved.request_hash <> digest then raise invalid_parameter_value; end if;
  else
    if from_id = to_id
       or (select count(*) from researchtrail.document_uses u
             where u.owner_id=account and u.task_id=$1 and u.document_use_id in (from_id,to_id)) <> 2
       or exists(select from researchtrail.document_use_links l where l.owner_id=account and l.task_id=$1
             and (l.from_document_use_id,l.to_document_use_id) in ((from_id,to_id),(to_id,from_id)))
       -- Following existing links onward from the new end must not lead back to the new start.
       or exists(with recursive onward(id) as (
             select to_id
             union
             select l.to_document_use_id from onward o join researchtrail.document_use_links l
               on l.owner_id=account and l.task_id=$1 and l.from_document_use_id=o.id)
           select from onward where id=from_id)
    then raise sqlstate 'RT001'; end if;
    insert into researchtrail.document_use_links(owner_id,task_id,from_document_use_id,to_document_use_id,reason_text,request_id,request_hash)
      values(account,$1,from_id,to_id,case when reason ~ '[^[:space:]]' then reason end,$3,digest)
      returning * into saved;
  end if;
  return jsonb_build_object('task_id',$1) || researchtrail.link_result(saved);
end $$;

revoke all on function researchtrail.link_result(researchtrail.document_use_links),
  public.rt_paper_links(uuid), public.rt_link_papers(uuid,jsonb,uuid) from public, anon;
grant execute on function researchtrail.link_result(researchtrail.document_use_links),
  public.rt_paper_links(uuid), public.rt_link_papers(uuid,jsonb,uuid) to authenticated;
commit;
