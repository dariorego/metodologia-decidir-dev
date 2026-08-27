-- ============================================================
-- 0004 — Endurecimento das batidas (revisão de segurança)
--
-- Corrige três falhas encontradas na revisão da migration 0003:
--
-- 1. event_datetime forjado (crítico): a 0003 validava apenas a
--    COMPOSIÇÃO do dia (contagem por tipo), nunca o VALOR do
--    event_datetime enviado pelo cliente. Com o próprio token, um
--    residente podia postar direto no PostgREST um clock_in às 06:00
--    e um clock_out às 23:59 de um dia passado e fabricar um plantão
--    inteiro, indistinguível de uma batida real nos relatórios.
--    Agora, para origin='automatic', o horário é imposto pelo servidor.
--
-- 2. Ordem dos eventos: as regras comparavam apenas contagens, então
--    um break_end podia ter timestamp ANTERIOR ao seu break_start,
--    inflando workedMinutes(). Agora o horário tem de ser crescente.
--
-- 3. Coordenadas fora de faixa: latitude/longitude aceitavam qualquer
--    float. Agora são validadas.
--
-- Executar no SQL Editor do Supabase (role postgres). Idempotente.
-- ============================================================

create or replace function ponto_fn_check_sequence() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_day date;
  v_ins int; v_outs int; v_bstart int; v_bend int;
  v_last timestamptz;
begin
  -- (1) Batida automática de um usuário autenticado: o horário é do
  -- SERVIDOR, nunca do cliente. Admin (origin='manual') segue podendo
  -- informar data/hora, pois esse caminho já exige justificativa e fica
  -- na trilha de auditoria. service_role/postgres (seed e manutenção)
  -- não são afetados — quem tem essas chaves já tem acesso total.
  if new.origin = 'automatic'
     and coalesce(auth.role(), 'service_role') = 'authenticated' then
    new.event_datetime := now();
  elsif new.event_datetime > now() + interval '5 minutes' then
    raise exception 'PONTO_SEQUENCE:FUTURE_TIME: não é possível registrar ponto no futuro';
  end if;

  v_day := ponto_local_date(new.event_datetime);

  -- (3) Geolocalização: presente e dentro da faixa válida.
  if new.origin = 'automatic' and (new.latitude is null or new.longitude is null) then
    raise exception 'PONTO_SEQUENCE:GEO_REQUIRED: a batida exige geolocalização';
  end if;
  if new.latitude is not null and (new.latitude < -90 or new.latitude > 90) then
    raise exception 'PONTO_SEQUENCE:GEO_INVALID: latitude fora da faixa válida';
  end if;
  if new.longitude is not null and (new.longitude < -180 or new.longitude > 180) then
    raise exception 'PONTO_SEQUENCE:GEO_INVALID: longitude fora da faixa válida';
  end if;

  select
    count(*) filter (where event_type = 'clock_in'),
    count(*) filter (where event_type = 'clock_out'),
    count(*) filter (where event_type = 'break_start'),
    count(*) filter (where event_type = 'break_end'),
    max(event_datetime)
  into v_ins, v_outs, v_bstart, v_bend, v_last
  from ponto_time_entries
  where resident_id = new.resident_id
    and ponto_local_date(event_datetime) = v_day;

  -- (2) O horário da nova batida não pode ser anterior à última do dia.
  if v_last is not null and new.event_datetime < v_last then
    raise exception 'PONTO_SEQUENCE:OUT_OF_ORDER: o horário é anterior à última batida do dia';
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

-- Defesa em profundidade: nem admin pode gravar coordenada fora de faixa.
do $$ begin
  alter table ponto_time_entries
    add constraint ponto_time_entries_coords_range
    check (
      (latitude is null or (latitude >= -90 and latitude <= 90)) and
      (longitude is null or (longitude >= -180 and longitude <= 180))
    );
exception when duplicate_object then null; end $$;
