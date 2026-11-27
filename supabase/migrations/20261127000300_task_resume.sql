begin;

-- Account readers can see finalized actions. Only trusted fixtures or a future
-- confirmation operation can populate this table; there is no client write grant.
create table researchtrail.next_actions (
  next_action_id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  task_id uuid not null,
  source_record_id uuid not null,
  created_at timestamptz not null default now(),
  confirmed boolean not null check (confirmed is true),
  action_text text not null check (researchtrail.has_record_text(action_text)),
  progress_text text, blocker_text text, deadline_text text,
  foreign key (owner_id, task_id, source_record_id)
    references researchtrail.research_records(owner_id, task_id, record_id) on delete cascade
);
create index on researchtrail.next_actions(owner_id, task_id, created_at desc, next_action_id);
alter table researchtrail.next_actions enable row level security;
revoke all on researchtrail.next_actions from public, anon, authenticated;
grant select on researchtrail.next_actions to authenticated;
create policy own_confirmed_read on researchtrail.next_actions for select to authenticated
  using (owner_id=(select auth.uid()) and confirmed is true);

-- A use can have its own registered editions and a record can explicitly cite a
-- pre-existing edition of the same work. UNION removes overlap between the two paths.
create view researchtrail.task_use_artifacts with (security_invoker=true) as
  select u.owner_id,u.task_id,u.document_use_id,a.artifact_id
    from researchtrail.document_uses u join researchtrail.document_artifacts a using (owner_id,document_id,document_use_id)
  union
  select owner_id,task_id,document_use_id,artifact_id from researchtrail.record_document_contexts where artifact_id is not null;
revoke all on researchtrail.task_use_artifacts from public, anon, authenticated;
grant select on researchtrail.task_use_artifacts to authenticated;

create table researchtrail.next_action_links (
  next_action_id uuid not null references researchtrail.next_actions on delete cascade,
  question_id uuid references researchtrail.research_questions on delete cascade,
  decision_id uuid references researchtrail.decisions on delete cascade,
  artifact_id uuid references researchtrail.document_artifacts on delete cascade,
  target_record_id uuid references researchtrail.research_records on delete cascade,
  check (num_nonnulls(question_id,decision_id,artifact_id,target_record_id)=1),
  unique nulls not distinct (next_action_id,question_id,decision_id,artifact_id,target_record_id)
);
alter table researchtrail.next_action_links enable row level security;
revoke all on researchtrail.next_action_links from public, anon, authenticated;
grant select on researchtrail.next_action_links to authenticated;
create policy own_task_link_read on researchtrail.next_action_links for select to authenticated using (
  exists (select from researchtrail.next_actions n where n.next_action_id=next_action_links.next_action_id and
    case
      when question_id is not null then exists (select from researchtrail.research_questions q
        where q.task_id=n.task_id and q.question_id=next_action_links.question_id)
      when decision_id is not null then exists (select from researchtrail.decisions d
        where d.task_id=n.task_id and d.decision_id=next_action_links.decision_id)
      when artifact_id is not null then exists (select from researchtrail.task_use_artifacts a
        where a.task_id=n.task_id and a.artifact_id=next_action_links.artifact_id)
      else exists (select from researchtrail.research_records r
        where r.task_id=n.task_id and r.record_id=next_action_links.target_record_id)
    end)
);

-- STABLE gives every collection the same database snapshot, including the task ownership check.
create function public.rt_resume(task_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  account uuid := auth.uid();
  result jsonb;
begin
  select researchtrail.task_result(t) into strict result from researchtrail.research_tasks t
    where t.owner_id=account and t.task_id=$1;

  return result || (
    with
    records as (
      select r.* from researchtrail.research_records r where r.owner_id=account and r.task_id=$1
    ),
    questions as (
      select q.* from researchtrail.research_questions q where q.owner_id=account and q.task_id=$1
    ),
    decisions as (
      select d.* from researchtrail.decisions d where d.owner_id=account and d.task_id=$1
    ),
    uses as (
      select u.*, d.title, d.material_kind_text, c.record_id
      from researchtrail.document_uses u
      join researchtrail.documents d using (owner_id,document_id)
      left join researchtrail.record_document_contexts c using (owner_id,task_id,document_id,document_use_id)
      where u.owner_id=account and u.task_id=$1
    ),
    artifacts as (
      select ua.document_use_id as use_id, a.*
      from researchtrail.task_use_artifacts ua join researchtrail.document_artifacts a using(owner_id,artifact_id)
      where ua.owner_id=account and ua.task_id=$1
    ),
    linked_artifacts as (
      select distinct artifact_id, created_at from artifacts
    ),
    action_links as (
      select l.* from researchtrail.next_action_links l join researchtrail.next_actions n using(next_action_id)
      where n.owner_id=account and n.task_id=$1
    )
    select jsonb_build_object(
      'records', array(
        select jsonb_build_object(
          'record_id',r.record_id,'created_at',r.created_at,'revises_record_id',r.revises_record_id,
          'record',jsonb_build_object(
            'content_text',r.content_text,'record_kind_text',r.record_kind_text,'authorship_text',r.authorship_text,
            'container_text',r.container_text,'location_text',r.location_text,'review_state_text',r.review_state_text,
            'adoption_state_text',r.adoption_state_text,'audience_text',r.audience_text,
            'ai_input_scope_text',r.ai_input_scope_text,'change_reason_text',r.change_reason_text),
          'context_refs',researchtrail.record_context_refs(r.record_id))
        from records r order by r.created_at desc,r.record_id
      ),
      'context',jsonb_build_object(
        'questions', array(
          select jsonb_build_object('question_id',q.question_id,'record_id',q.record_id,'created_at',q.created_at,
            'question_text',q.question_text,'state_text',q.state_text,'unresolved_reason_text',q.unresolved_reason_text)
          from questions q order by q.created_at desc,q.question_id
        ),
        'decisions', array(
          select jsonb_build_object('decision_id',d.decision_id,'record_id',d.record_id,'created_at',d.created_at,
            'decision_text',d.decision_text,'made_by_text',d.made_by_text,'reason_text',d.reason_text)
          from decisions d order by d.created_at desc,d.decision_id
        ),
        'document_contexts', array(
          select jsonb_build_object(
            'document_use_id',u.document_use_id,'document_id',u.document_id,'record_id',u.record_id,'created_at',u.created_at,'date',u.date,
            'document',jsonb_build_object('title',u.title,'material_kind_text',u.material_kind_text),
            'use',jsonb_build_object('purpose_text',u.purpose_text,'role_text',u.role_text,
              'purpose_recording_text',u.purpose_recording_text,'reading_state_text',u.reading_state_text),
            'artifacts',array(
              select jsonb_build_object(
                'artifact_id',a.artifact_id,'created_at',a.created_at,'label_text',a.label_text,'version_text',a.version_text,
                'part_text',a.part_text,'access_locator_text',a.access_locator_text,'availability_text',a.availability_text,
                'extraction_issue_text',a.extraction_issue_text,
                'excerpts',array(
                  select jsonb_build_object('excerpt_id',e.excerpt_id,'created_at',e.created_at,'locator_text',e.locator_text,
                    'excerpt_text',e.excerpt_text,'context_text',e.context_text)
                  from researchtrail.evidence_excerpts e
                  where e.owner_id=account and e.document_use_id=u.document_use_id and e.artifact_id=a.artifact_id
                  order by e.created_at desc,e.excerpt_id))
              from artifacts a where a.use_id=u.document_use_id order by a.created_at desc,a.artifact_id))
          from uses u order by u.created_at desc,u.document_use_id
        )
      ),
      'next_actions', array(
        select jsonb_build_object(
          'next_action_id',n.next_action_id,'source_record_id',n.source_record_id,'created_at',n.created_at,'confirmed',n.confirmed,
          'saved_action',jsonb_build_object('action_text',n.action_text,'progress_text',n.progress_text,
            'blocker_text',n.blocker_text,'deadline_text',n.deadline_text),
          'links',jsonb_build_object(
            'question_ids',array(select q.question_id from action_links l join questions q using(question_id)
              where l.next_action_id=n.next_action_id order by q.created_at desc,q.question_id),
            'decision_ids',array(select d.decision_id from action_links l join decisions d using(decision_id)
              where l.next_action_id=n.next_action_id order by d.created_at desc,d.decision_id),
            'artifact_ids',array(select a.artifact_id from action_links l join linked_artifacts a using(artifact_id)
              where l.next_action_id=n.next_action_id order by a.created_at desc,a.artifact_id),
            'target_record_ids',array(select r.record_id from action_links l join records r on r.record_id=l.target_record_id
              where l.next_action_id=n.next_action_id order by r.created_at desc,r.record_id)))
        from researchtrail.next_actions n where n.owner_id=account and n.task_id=$1 and n.confirmed is true
        order by n.created_at desc,n.next_action_id
      )
    )
  );
end $$;
revoke all on function public.rt_resume(uuid) from public, anon;
grant execute on function public.rt_resume(uuid) to authenticated;

commit;
