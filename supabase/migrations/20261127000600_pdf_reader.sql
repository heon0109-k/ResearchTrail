begin;

-- The PDF artifact identifies immutable uploaded bytes. The task also matters when a
-- record in a second task explicitly cites that same artifact.
create table researchtrail.pdf_reading_pages (
  owner_id uuid not null, task_id uuid not null, artifact_id uuid not null references researchtrail.document_artifacts on delete cascade,
  last_page integer not null check (last_page > 0),
  primary key (owner_id,task_id,artifact_id),
  foreign key (owner_id,task_id) references researchtrail.research_tasks(owner_id,task_id) on delete cascade
);
create table researchtrail.pdf_highlights (
  owner_id uuid not null, task_id uuid not null, artifact_id uuid not null references researchtrail.document_artifacts on delete cascade,
  id uuid not null, page integer not null check (page>0), rects jsonb not null, excerpt_text text not null, record_id uuid,
  created_at timestamptz not null default now(),
  primary key (owner_id,task_id,artifact_id,id),
  foreign key (owner_id,task_id) references researchtrail.research_tasks(owner_id,task_id) on delete cascade,
  foreign key (owner_id,task_id,record_id) references researchtrail.research_records(owner_id,task_id,record_id) on delete set null (record_id)
);
alter table researchtrail.pdf_reading_pages enable row level security;
alter table researchtrail.pdf_highlights enable row level security;
revoke all on researchtrail.pdf_reading_pages,researchtrail.pdf_highlights from public,anon,authenticated;
grant select on researchtrail.pdf_reading_pages,researchtrail.pdf_highlights to authenticated;
create policy own_page on researchtrail.pdf_reading_pages for select to authenticated using (owner_id=(select auth.uid()));
create policy own_highlights on researchtrail.pdf_highlights for select to authenticated using (owner_id=(select auth.uid()));

create function public.rt_pdf_reader(task_id uuid,artifact_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
  perform public.rt_paper_pdf($1,$2);
  return jsonb_build_object('last_page',(select p.last_page from researchtrail.pdf_reading_pages p
    where p.owner_id=auth.uid() and p.task_id=$1 and p.artifact_id=$2),
    'highlights',array(select jsonb_build_object('id',h.id,'page',h.page,'text',h.excerpt_text,'rects',h.rects,'record_id',h.record_id)
      from researchtrail.pdf_highlights h where h.owner_id=auth.uid() and h.task_id=$1 and h.artifact_id=$2
      order by h.created_at desc,h.id));
end $$;

create function researchtrail.reader_page(value jsonb) returns integer
language plpgsql immutable set search_path='' as $$
begin
  if jsonb_typeof(value) is distinct from 'number' or (value #>> '{}') !~ '^[1-9][0-9]*$' then raise invalid_parameter_value; end if;
  return (value #>> '{}')::integer;
end $$;

create function public.rt_save_pdf_reader(task_id uuid,artifact_id uuid,payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  account uuid:=auth.uid(); item jsonb; mark_id uuid; memo uuid; n integer; rect jsonb;
  existing researchtrail.pdf_highlights;
begin
  perform public.rt_paper_pdf($1,$2);
  if jsonb_typeof(payload) is distinct from 'object' or (select count(*) from jsonb_object_keys(payload))<>1 then
    raise invalid_parameter_value;
  end if;
  if payload ? 'initial_page' then
    n:=researchtrail.reader_page(payload->'initial_page');
    insert into researchtrail.pdf_reading_pages values(account,$1,$2,n) on conflict do nothing;
  elsif payload ? 'last_page' then
    n:=researchtrail.reader_page(payload->'last_page');
    insert into researchtrail.pdf_reading_pages values(account,$1,$2,n)
      on conflict on constraint pdf_reading_pages_pkey do update set last_page=excluded.last_page;
  elsif payload ? 'link' or payload ? 'highlight' then
    item:=coalesce(payload->'link',payload->'highlight');
    mark_id:=researchtrail.selected_id(item->'id');
    if nullif(item->'record_id','null') is not null then
      memo:=researchtrail.selected_id(item->'record_id');
      perform 1 from researchtrail.research_records r where r.owner_id=account and r.task_id=$1 and r.record_id=memo;
      if not found then raise sqlstate 'RT001'; end if;
    end if;
    if payload ? 'link' then
      perform researchtrail.check_fields(item,array['id','record_id'],false);
      if memo is null then raise invalid_parameter_value; end if;
      update researchtrail.pdf_highlights h set record_id=memo
        where h.owner_id=account and h.task_id=$1 and h.artifact_id=$2 and h.id=mark_id and (h.record_id is null or h.record_id=memo);
      if not found then raise sqlstate 'RT001'; end if;
    else
      perform researchtrail.check_fields(item,array['id','page','text','rects','record_id'],false);
      n:=researchtrail.reader_page(item->'page');
      if jsonb_typeof(item->'text') is distinct from 'string' or not researchtrail.has_record_text(item->>'text')
         or jsonb_typeof(item->'rects') is distinct from 'array' or jsonb_array_length(item->'rects')=0 then raise invalid_parameter_value; end if;
      for rect in select value from jsonb_array_elements(item->'rects') loop
        if jsonb_typeof(rect)<>'array' or jsonb_array_length(rect)<>4 or
           exists(select from jsonb_array_elements(rect) v where jsonb_typeof(v)<>'number') then raise invalid_parameter_value; end if;
        if (rect->>0)::numeric<0 or (rect->>1)::numeric<0 or (rect->>2)::numeric<=0 or (rect->>3)::numeric<=0
          or (rect->>0)::numeric+(rect->>2)::numeric>1.000000000000001
          or (rect->>1)::numeric+(rect->>3)::numeric>1.000000000000001 then raise invalid_parameter_value; end if;
      end loop;
      insert into researchtrail.pdf_highlights(owner_id,task_id,artifact_id,id,page,rects,excerpt_text,record_id)
        values(account,$1,$2,mark_id,n,item->'rects',item->>'text',memo)
        on conflict on constraint pdf_highlights_pkey do nothing;
      if not found then
        select h.* into strict existing from researchtrail.pdf_highlights h
          where h.owner_id=account and h.task_id=$1 and h.artifact_id=$2 and h.id=mark_id;
        if existing.page<>n or existing.rects<>item->'rects' or existing.excerpt_text<>item->>'text'
           or (memo is not null and existing.record_id is distinct from memo) then raise invalid_parameter_value; end if;
      end if;
    end if;
  else raise invalid_parameter_value;
  end if;
  return public.rt_pdf_reader($1,$2);
end $$;
revoke all on function researchtrail.reader_page(jsonb),public.rt_pdf_reader(uuid,uuid),public.rt_save_pdf_reader(uuid,uuid,jsonb)
  from public,anon,authenticated;
grant execute on function public.rt_pdf_reader(uuid,uuid),public.rt_save_pdf_reader(uuid,uuid,jsonb) to authenticated;
commit;
