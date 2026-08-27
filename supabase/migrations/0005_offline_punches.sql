-- ============================================================
-- 0005 — Batidas offline (app Android)
--
-- A 0004 passou a impor o horário do servidor para batidas
-- automáticas, o que impede a fraude de fabricar plantões — mas
-- também quebraria o modo offline: uma batida feita às 08:00 no
-- setor sem sinal e sincronizada às 12:00 seria gravada às 12:00.
--
-- Solução: o cliente pode informar o horário APENAS quando declara
-- que a batida ficou na fila offline, e ainda assim dentro de
-- limites estreitos:
--   * não pode ser no futuro;
--   * no máximo 24h atrás (a fraude da 0004 dependia de dias antigos);
--   * continua sujeito à ordem e às regras de sequência do dia.
-- A linha fica marcada (is_offline) e guarda quando foi sincronizada,
-- para a administração distinguir na auditoria.
--
-- Executar no SQL Editor do Supabase (role postgres). Idempotente.
-- ============================================================

alter table ponto_time_entries
  add column if not exists offline_recorded_at timestamptz,
  add column if not exists is_offline boolean not null default false,
  add column if not exists synced_at timestamptz;

comment on column ponto_time_entries.offline_recorded_at is
  'Horário informado pelo app quando a batida ficou na fila offline. Limitado a 24h no passado.';
comment on column ponto_time_entries.is_offline is
  'Verdadeiro quando a batida foi registrada sem conexão e sincronizada depois.';

create or replace function ponto_fn_check_sequence() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_day date;
  v_ins int; v_outs int; v_bstart int; v_bend int;
  v_last timestamptz;
  v_is_user boolean;
begin
  v_is_user := coalesce(auth.role(), 'service_role') = 'authenticated';

  if new.origin = 'automatic' and v_is_user then
    if new.offline_recorded_at is null then
      -- Caminho normal (online): horário do servidor, não do cliente.
      new.event_datetime := now();
      new.is_offline := false;
    else
      -- Caminho offline: aceita o horário do app dentro dos limites.
      if new.offline_recorded_at > now() + interval '2 minutes' then
        raise exception 'PONTO_SEQUENCE:FUTURE_TIME: não é possível registrar ponto no futuro';
      end if;
      if new.offline_recorded_at < now() - interval '24 hours' then
        raise exception 'PONTO_SEQUENCE:STALE_OFFLINE: batida offline com mais de 24h não pode ser sincronizada';
      end if;
      new.event_datetime := new.offline_recorded_at;
      new.is_offline := true;
    end if;
    new.synced_at := now();
  elsif new.event_datetime > now() + interval '5 minutes' then
    raise exception 'PONTO_SEQUENCE:FUTURE_TIME: não é possível registrar ponto no futuro';
  end if;

  v_day := ponto_local_date(new.event_datetime);

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

-- ------------------------------------------------------------
-- Idempotência da fila offline — nada a fazer aqui
--
-- O app gera o UUID da batida ANTES de enviar e reenvia o mesmo id até
-- confirmar. Como id é primary key, o reenvio colide (23505) e o app
-- trata como "já sincronizada" — é isso que impede a duplicata.
--
-- Nenhuma mudança de policy é necessária: RLS decide QUAIS linhas podem
-- ser inseridas, não QUAIS COLUNAS o cliente pode preencher. A policy
-- ponto_time_entries_insert_self da 0001 já permite o insert, e informar
-- o próprio id sempre foi possível. Registrado aqui para quem for ler a
-- migration procurando onde a idempotência é garantida: ela vem da
-- primary key, não de RLS.
-- ------------------------------------------------------------
