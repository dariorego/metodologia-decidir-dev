-- ============================================================
-- 0002 — Jornada aberta já justificada não bloqueia novos inícios
-- Um clock_in sem clock_out deixa de contar como "aberto" quando
-- existe justificativa vinculada a ele (related_time_entry_id).
-- ============================================================

create or replace function ponto_fn_check_open_shift() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_open boolean;
  v_required boolean;
begin
  select require_justification_before_new_shift into v_required from ponto_work_policies where id = 1;
  if new.event_type = 'clock_in' and new.origin = 'automatic' and coalesce(v_required, true) then
    select exists (
      select 1 from ponto_time_entries te
      where te.resident_id = new.resident_id
        and te.event_type = 'clock_in'
        and ponto_local_date(te.event_datetime) < ponto_local_date(new.event_datetime)
        and not exists (
          select 1 from ponto_time_entries te2
          where te2.resident_id = te.resident_id
            and te2.event_type = 'clock_out'
            and te2.event_datetime > te.event_datetime
            and ponto_local_date(te2.event_datetime) >= ponto_local_date(te.event_datetime)
        )
        and not exists (
          select 1 from ponto_justifications j
          where j.related_time_entry_id = te.id
        )
    ) into v_open;

    if v_open and new.justification_id is null then
      raise exception 'RESIDENT_HAS_OPEN_SHIFT: justificativa obrigatória antes de novo ponto de entrada';
    end if;
  end if;
  return new;
end $$;
