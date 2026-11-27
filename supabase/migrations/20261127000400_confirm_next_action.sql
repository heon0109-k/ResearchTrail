begin;

-- Older confirmed actions have no captured candidate or confirmation receipt.
alter table researchtrail.next_actions
  add column original_candidate jsonb,
  add column request_id uuid,
  add column request_hash bytea,
  add constraint next_action_confirmation_key unique (owner_id, task_id, request_id);

-- Only this operation may write actions and links. The caller has no direct table writes.
create function public.rt_confirm_action(task_id uuid, payload jsonb, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  account uuid := auth.uid();
  source_id uuid;
  reviewed jsonb := payload->'reviewed_action';
  candidate jsonb := nullif(payload->'original_candidate','null');
  links jsonb := coalesce(nullif(payload->'links','null'),'{}');
  fields text[] := array['action_text','progress_text','blocker_text','deadline_text'];
  action_object jsonb;
  link_type text; selected uuid; accessible boolean;
  digest bytea := sha256(convert_to(payload::text,'UTF8'));
  saved researchtrail.next_actions;
begin
  perform 1 from researchtrail.research_tasks t where t.owner_id=account and t.task_id=$1;
  if not found then raise no_data_found; end if;

  perform researchtrail.check_fields(payload,array['source_record_id','confirmed','reviewed_action','original_candidate','links'],false);
  if request_id is null or payload->'confirmed' is distinct from 'true'::jsonb
     or not researchtrail.has_record_text(reviewed->>'action_text') then raise invalid_parameter_value; end if;
  foreach action_object in array array[reviewed,candidate] loop
    if action_object is null then continue; end if;
    perform researchtrail.check_fields(action_object,fields);
    if not action_object ? 'action_text' or exists
        (select from jsonb_each_text(action_object) entry where entry.value='')
       or (action_object->'action_text'='null' and action_object <> '{"action_text":null}')
    then raise invalid_parameter_value; end if;
  end loop;
  source_id := researchtrail.selected_id(payload->'source_record_id');
  perform 1 from researchtrail.research_records r where r.owner_id=account and r.task_id=$1 and r.record_id=source_id;
  if not found then raise sqlstate 'RT001'; end if;
  perform researchtrail.check_fields(links,array['question_ids','decision_ids','artifact_ids','target_record_ids'],false);

  insert into researchtrail.next_actions(owner_id,task_id,source_record_id,confirmed,action_text,progress_text,blocker_text,deadline_text,
                                         original_candidate,request_id,request_hash)
    values(account,$1,source_id,true,reviewed->>'action_text',reviewed->>'progress_text',reviewed->>'blocker_text',
           reviewed->>'deadline_text',candidate,$3,digest)
    on conflict on constraint next_action_confirmation_key do nothing returning * into saved;
  if not found then
    select n.* into strict saved from researchtrail.next_actions n where n.owner_id=account and n.task_id=$1 and n.request_id=$3;
    if saved.request_hash <> digest then raise invalid_parameter_value; end if;
  else
    for link_type in select jsonb_object_keys(links) loop
      if jsonb_typeof(links->link_type) <> 'array' then raise invalid_parameter_value; end if;
      for selected in select distinct researchtrail.selected_id(value) from jsonb_array_elements(links->link_type) loop
        accessible := case link_type
          when 'question_ids' then exists(select from researchtrail.research_questions q where q.owner_id=account and q.task_id=$1 and q.question_id=selected)
          when 'decision_ids' then exists(select from researchtrail.decisions d where d.owner_id=account and d.task_id=$1 and d.decision_id=selected)
          when 'artifact_ids' then exists(select from researchtrail.task_use_artifacts a where a.owner_id=account and a.task_id=$1 and a.artifact_id=selected)
          when 'target_record_ids' then exists(select from researchtrail.research_records r where r.owner_id=account and r.task_id=$1 and r.record_id=selected)
        end;
        if not accessible then raise sqlstate 'RT001'; end if;
        insert into researchtrail.next_action_links(next_action_id,question_id,decision_id,artifact_id,target_record_id)
          values(saved.next_action_id,case when link_type='question_ids' then selected end,
            case when link_type='decision_ids' then selected end,case when link_type='artifact_ids' then selected end,
            case when link_type='target_record_ids' then selected end);
      end loop;
    end loop;
  end if;
  return jsonb_build_object('next_action_id',saved.next_action_id,'source_record_id',saved.source_record_id,
    'saved_action',jsonb_build_object('action_text',saved.action_text,'progress_text',saved.progress_text,
      'blocker_text',saved.blocker_text,'deadline_text',saved.deadline_text));
end $$;
revoke all on function public.rt_confirm_action(uuid,jsonb,uuid) from public, anon;
grant execute on function public.rt_confirm_action(uuid,jsonb,uuid) to authenticated;

-- Enrich the existing ordered snapshot without reconstructing its context or changing old entries.
alter function public.rt_resume(uuid) set schema researchtrail;
create function public.rt_resume(task_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with snapshot as materialized (select researchtrail.rt_resume($1) as data)
  select jsonb_set(data,'{next_actions}',coalesce((
    select jsonb_agg(case when n.request_id is null then item
                          else item || jsonb_build_object('original_candidate', n.original_candidate) end order by position)
    from jsonb_array_elements(data->'next_actions') with ordinality as actions(item,position)
    join researchtrail.next_actions n on n.next_action_id=(item->>'next_action_id')::uuid
      and n.owner_id=(select auth.uid()) and n.task_id=$1
  ),'[]')) from snapshot
$$;
revoke all on function public.rt_resume(uuid) from public, anon;
grant execute on function public.rt_resume(uuid) to authenticated;
commit;
