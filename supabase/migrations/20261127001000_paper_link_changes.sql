begin;

-- Keep receipts after a link is removed. A delayed retry must not edit a replacement
-- link or recreate an earlier link between the same two document uses.
create table researchtrail.paper_link_changes (
  owner_id uuid not null, task_id uuid not null, request_id uuid not null,
  link_id uuid not null, request_hash bytea not null, removed_create_id uuid,
  primary key (owner_id,task_id,request_id),
  unique (owner_id,task_id,removed_create_id),
  foreign key (owner_id,task_id) references researchtrail.research_tasks(owner_id,task_id) on delete cascade
);
alter table researchtrail.paper_link_changes enable row level security;
revoke all on researchtrail.paper_link_changes from public, anon, authenticated;
grant select on researchtrail.paper_link_changes to authenticated;
create policy own_read on researchtrail.paper_link_changes for select to authenticated using (owner_id=(select auth.uid()));

create function researchtrail.check_removed_link_request() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists(select from researchtrail.paper_link_changes c where c.owner_id=new.owner_id
    and c.task_id=new.task_id and c.removed_create_id=new.request_id) then raise sqlstate 'RT001'; end if;
  return new;
end $$;
create trigger check_removed_link_request before insert on researchtrail.document_use_links
  for each row execute function researchtrail.check_removed_link_request();
revoke all on function researchtrail.check_removed_link_request() from public, anon, authenticated;

-- The Edge route supplies {} for deletion and {"reason_text": ...} for an edit.
create function public.rt_change_paper_link(task_id uuid, link_id uuid, payload jsonb, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  account uuid := auth.uid();
  digest bytea := sha256(convert_to(payload::text,'UTF8'));
  receipt researchtrail.paper_link_changes;
  removed uuid;
begin
  perform 1 from researchtrail.research_tasks t where t.owner_id=account and t.task_id=$1;
  if not found then raise no_data_found; end if;
  if $3 is null or $4 is null or jsonb_typeof($3)<>'object'
    or ($3 - 'reason_text')<>'{}'::jsonb
    or ($3 ? 'reason_text' and jsonb_typeof($3->'reason_text') not in ('string','null'))
    then raise invalid_parameter_value; end if;
  perform pg_advisory_xact_lock(hashtextextended(account::text || $1::text || 'paper-links',0));
  select c.* into receipt from researchtrail.paper_link_changes c
    where c.owner_id=account and c.task_id=$1 and c.request_id=$4;
  if found then
    if receipt.link_id<>$2 or receipt.request_hash<>digest then raise invalid_parameter_value; end if;
  else
    if $3 ? 'reason_text' then
      update researchtrail.document_use_links l set reason_text=case when ($3->>'reason_text') ~ '[^[:space:]]' then $3->>'reason_text' end
        where l.owner_id=account and l.task_id=$1 and l.link_id=$2;
    else
      delete from researchtrail.document_use_links l where l.owner_id=account and l.task_id=$1 and l.link_id=$2
        returning l.request_id into removed;
    end if;
    if not found then raise no_data_found; end if;
    insert into researchtrail.paper_link_changes(owner_id,task_id,request_id,link_id,request_hash,removed_create_id)
      values(account,$1,$4,$2,digest,removed);
  end if;
  return jsonb_build_object('task_id',$1,'link_id',$2);
end $$;
revoke all on function public.rt_change_paper_link(uuid,uuid,jsonb,uuid) from public,anon;
grant execute on function public.rt_change_paper_link(uuid,uuid,jsonb,uuid) to authenticated;
commit;
