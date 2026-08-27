-- ============================================================
-- 0003 — Regras da jornada (sprint 01)
--   * Entrada e Saída: no máximo uma por dia (data local Recife)
--   * Intervalos: N por dia, sempre Início -> Fim; não abre novo
--     intervalo com outro em aberto
--   * Saída só com todos os intervalos encerrados
--   * Batidas automáticas exigem latitude/longitude
-- Erros levantados com prefixo PONTO_SEQUENCE:<codigo> para a UI.
-- Executar no SQL Editor do Supabase (role postgres). Idempotente.
-- ============================================================

create or replace function ponto_fn_check_sequence() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_day date := ponto_local_date(new.event_datetime);
  v_ins int; v_outs int; v_bstart int; v_bend int;
begin
  select
    count(*) filter (where event_type = 'clock_in'),
    count(*) filter (where event_type = 'clock_out'),
    count(*) filter (where event_type = 'break_start'),
    count(*) filter (where event_type = 'break_end')
  into v_ins, v_outs, v_bstart, v_bend
  from ponto_time_entries
  where resident_id = new.resident_id
    and ponto_local_date(event_datetime) = v_day;

  if new.origin = 'automatic' and (new.latitude is null or new.longitude is null) then
    raise exception 'PONTO_SEQUENCE:GEO_REQUIRED: a batida exige geolocalização';
  end if;

  if new.event_type = 'clock_in' then
    if v_ins > 0 then
      raise exception 'PONTO_SEQUENCE:CLOCK_IN_EXISTS: entrada da jornada já registrada hoje';
    end if;

  elsif new.event_type = 'break_start' then
    if v_ins = 0 then
      raise exception 'PONTO_SEQUENCE:NO_CLOCK_IN: registre a entrada da jornada antes do intervalo';
    end if;
    if v_outs > 0 then
      raise exception 'PONTO_SEQUENCE:SHIFT_CLOSED: jornada já encerrada hoje';
    end if;
    if v_bstart > v_bend then
      raise exception 'PONTO_SEQUENCE:BREAK_OPEN: existe um intervalo sem encerramento';
    end if;

  elsif new.event_type = 'break_end' then
    if v_bstart <= v_bend then
      raise exception 'PONTO_SEQUENCE:NO_OPEN_BREAK: não há intervalo em aberto';
    end if;
    if v_outs > 0 then
      raise exception 'PONTO_SEQUENCE:SHIFT_CLOSED: jornada já encerrada hoje';
    end if;

  elsif new.event_type = 'clock_out' then
    if v_ins = 0 then
      raise exception 'PONTO_SEQUENCE:NO_CLOCK_IN: registre a entrada da jornada antes da saída';
    end if;
    if v_outs > 0 then
      raise exception 'PONTO_SEQUENCE:CLOCK_OUT_EXISTS: saída da jornada já registrada hoje';
    end if;
    if v_bstart > v_bend then
      raise exception 'PONTO_SEQUENCE:BREAK_OPEN: encerre o intervalo antes da saída da jornada';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists trg_ponto_check_sequence on ponto_time_entries;
create trigger trg_ponto_check_sequence
  before insert on ponto_time_entries
  for each row execute function ponto_fn_check_sequence();

-- Evita corrida entre duas batidas simultâneas do mesmo residente no mesmo dia
create unique index if not exists uq_ponto_time_entries_one_clock_in_per_day
  on ponto_time_entries (resident_id, ponto_local_date(event_datetime))
  where event_type = 'clock_in';
create unique index if not exists uq_ponto_time_entries_one_clock_out_per_day
  on ponto_time_entries (resident_id, ponto_local_date(event_datetime))
  where event_type = 'clock_out';
