-- ============================================================
-- Ponto Residentes — Schema completo (v1)
-- Projeto Supabase compartilhado: todas as entidades usam o
-- prefixo "ponto_" para não colidir com as demais aplicações.
-- Executar no SQL Editor do Supabase (role postgres).
-- Idempotente: pode ser executado mais de uma vez.
-- ============================================================

-- ---------- ENUMS ----------
do $$ begin create type ponto_user_role as enum ('resident','admin'); exception when duplicate_object then null; end $$;
do $$ begin create type ponto_resident_status as enum ('active','inactive'); exception when duplicate_object then null; end $$;
do $$ begin create type ponto_time_event_type as enum ('clock_in','break_start','break_end','clock_out'); exception when duplicate_object then null; end $$;
do $$ begin create type ponto_entry_origin as enum ('automatic','manual'); exception when duplicate_object then null; end $$;
do $$ begin create type ponto_justification_type as enum ('missed_clock_out','manual_adjustment','late_arrival','other'); exception when duplicate_object then null; end $$;
do $$ begin create type ponto_justification_status as enum ('pending','approved','rejected'); exception when duplicate_object then null; end $$;
do $$ begin create type ponto_notification_channel as enum ('email','push','sms','in_app'); exception when duplicate_object then null; end $$;
do $$ begin create type ponto_notification_status as enum ('queued','sent','failed'); exception when duplicate_object then null; end $$;

-- ---------- HELPER: data local da instituição ----------
create or replace function ponto_local_date(ts timestamptz)
returns date language sql immutable as
$$ select (ts at time zone 'America/Recife')::date $$;

-- ---------- PROFILES (estende auth.users) ----------
create table if not exists ponto_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role ponto_user_role not null default 'resident',
  terms_accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- SETORES ----------
create table if not exists ponto_sectors (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- RESIDENTES ----------
create table if not exists ponto_residents (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references ponto_profiles(id) on delete cascade,
  registration_number text not null unique,
  program text,
  status ponto_resident_status not null default 'active',
  default_sector_id uuid references ponto_sectors(id),
  entry_date date not null,
  exit_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ponto_exit_after_entry check (exit_date is null or exit_date >= entry_date)
);
create index if not exists idx_ponto_residents_status on ponto_residents(status);

-- ---------- POLÍTICAS DE JORNADA (parametrização sem deploy) ----------
create table if not exists ponto_work_policies (
  id int primary key default 1,
  late_tolerance_minutes int not null default 10,
  justification_review_sla_hours int not null default 48,
  require_justification_before_new_shift boolean not null default true,
  data_retention_years int not null default 5,
  updated_at timestamptz not null default now(),
  constraint ponto_single_row check (id = 1)
);
insert into ponto_work_policies (id) values (1) on conflict (id) do nothing;

-- ---------- REGISTROS DE PONTO ----------
-- (FK circular com ponto_justifications: criada por ALTER TABLE mais abaixo)
create table if not exists ponto_time_entries (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references ponto_residents(id) on delete restrict,
  event_type ponto_time_event_type not null,
  event_datetime timestamptz not null default now(),
  sector_id uuid not null references ponto_sectors(id),
  origin ponto_entry_origin not null default 'automatic',
  latitude double precision,
  longitude double precision,
  device_info jsonb,
  justification_id uuid,
  created_by uuid not null references ponto_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_ponto_time_entries_resident_date on ponto_time_entries(resident_id, event_datetime desc);
create index if not exists idx_ponto_time_entries_sector on ponto_time_entries(sector_id);

-- ---------- JUSTIFICATIVAS ----------
create table if not exists ponto_justifications (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references ponto_residents(id) on delete restrict,
  related_time_entry_id uuid references ponto_time_entries(id),
  type ponto_justification_type not null,
  reason text not null,
  requested_time text,          -- ex.: horário real de saída informado pelo residente
  status ponto_justification_status not null default 'pending',
  reviewed_by uuid references ponto_profiles(id),
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now()
);
create index if not exists idx_ponto_justifications_status on ponto_justifications(status);

-- FK circular time_entries -> justifications
do $$ begin
  alter table ponto_time_entries
    add constraint fk_ponto_time_entries_justification
    foreign key (justification_id) references ponto_justifications(id);
exception when duplicate_object then null; end $$;

-- ---------- AUDITORIA ----------
create table if not exists ponto_audit_logs (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id uuid not null,
  action text not null,
  detail jsonb,
  changed_by uuid,
  changed_at timestamptz not null default now()
);
create index if not exists idx_ponto_audit_logs_record on ponto_audit_logs(table_name, record_id);

-- ---------- NOTIFICAÇÕES ----------
create table if not exists ponto_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_role ponto_user_role not null default 'admin',
  recipient_id uuid references ponto_profiles(id),
  type text not null,
  payload jsonb not null default '{}',
  channel ponto_notification_channel not null default 'in_app',
  status ponto_notification_status not null default 'queued',
  read_at timestamptz,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

-- ---------- CONSOLIDAÇÃO DIÁRIA ----------
create table if not exists ponto_daily_summaries (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references ponto_residents(id),
  work_date date not null,
  worked_minutes int not null default 0,
  break_minutes int not null default 0,
  late_minutes int not null default 0,
  has_open_shift boolean not null default false,
  has_pending_justification boolean not null default false,
  computed_at timestamptz not null default now(),
  unique (resident_id, work_date)
);
create index if not exists idx_ponto_daily_summaries_date on ponto_daily_summaries(work_date);

-- ============================================================
-- FUNÇÕES E TRIGGERS
-- ============================================================

-- Papel do usuário logado (security definer para uso em policies)
create or replace function ponto_current_role() returns ponto_user_role
language sql stable security definer set search_path = public as
$$ select role from ponto_profiles where id = auth.uid() $$;

-- Auditoria genérica
create or replace function ponto_fn_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into ponto_audit_logs(table_name, record_id, action, detail, changed_by)
  values (
    tg_table_name,
    coalesce(new.id, old.id),
    lower(tg_op),
    case when tg_op = 'UPDATE' then jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new))
         else to_jsonb(coalesce(new, old)) end,
    auth.uid()
  );
  return coalesce(new, old);
end $$;

drop trigger if exists trg_ponto_audit_time_entries on ponto_time_entries;
create trigger trg_ponto_audit_time_entries
  after insert or update on ponto_time_entries
  for each row execute function ponto_fn_audit();

drop trigger if exists trg_ponto_audit_justifications on ponto_justifications;
create trigger trg_ponto_audit_justifications
  after insert or update on ponto_justifications
  for each row execute function ponto_fn_audit();

drop trigger if exists trg_ponto_audit_residents on ponto_residents;
create trigger trg_ponto_audit_residents
  after insert or update on ponto_residents
  for each row execute function ponto_fn_audit();

-- Regra crítica: bloquear novo clock_in com jornada anterior aberta e sem justificativa
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
    ) into v_open;

    if v_open and new.justification_id is null then
      raise exception 'RESIDENT_HAS_OPEN_SHIFT: justificativa obrigatória antes de novo ponto de entrada';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_ponto_block_new_shift on ponto_time_entries;
create trigger trg_ponto_block_new_shift
  before insert on ponto_time_entries
  for each row execute function ponto_fn_check_open_shift();

-- Notificação automática à administração quando entra justificativa
create or replace function ponto_fn_notify_justification() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into ponto_notifications(recipient_role, type, payload, channel)
  values (
    'admin',
    case when new.type = 'missed_clock_out' then 'missed_clock_out' else 'justification_pending' end,
    jsonb_build_object('justification_id', new.id, 'resident_id', new.resident_id, 'type', new.type),
    'in_app'
  );
  return new;
end $$;

drop trigger if exists trg_ponto_notify_justification on ponto_justifications;
create trigger trg_ponto_notify_justification
  after insert on ponto_justifications
  for each row execute function ponto_fn_notify_justification();

-- ============================================================
-- VIEW: quem está na instituição agora
-- ============================================================
drop view if exists ponto_v_currently_present;
create view ponto_v_currently_present
with (security_invoker = true) as
select
  r.id as resident_id,
  p.full_name,
  r.registration_number,
  r.program,
  s.id as sector_id,
  s.name as sector_name,
  le.event_type,
  le.event_datetime,
  first_in.event_datetime as first_in_datetime
from ponto_residents r
join ponto_profiles p on p.id = r.profile_id
join lateral (
  select te.event_type, te.event_datetime, te.sector_id
  from ponto_time_entries te
  where te.resident_id = r.id
    and ponto_local_date(te.event_datetime) = ponto_local_date(now())
  order by te.event_datetime desc
  limit 1
) le on true
left join lateral (
  select te.event_datetime
  from ponto_time_entries te
  where te.resident_id = r.id
    and te.event_type = 'clock_in'
    and ponto_local_date(te.event_datetime) = ponto_local_date(now())
  order by te.event_datetime asc
  limit 1
) first_in on true
join ponto_sectors s on s.id = le.sector_id
where le.event_type <> 'clock_out'
  and r.status = 'active';

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table ponto_profiles enable row level security;
alter table ponto_sectors enable row level security;
alter table ponto_residents enable row level security;
alter table ponto_work_policies enable row level security;
alter table ponto_time_entries enable row level security;
alter table ponto_justifications enable row level security;
alter table ponto_audit_logs enable row level security;
alter table ponto_notifications enable row level security;
alter table ponto_daily_summaries enable row level security;

-- PROFILES
drop policy if exists ponto_profiles_select on ponto_profiles;
create policy ponto_profiles_select on ponto_profiles for select
  using (id = auth.uid() or ponto_current_role() = 'admin');
drop policy if exists ponto_profiles_insert on ponto_profiles;
create policy ponto_profiles_insert on ponto_profiles for insert
  with check (id = auth.uid() or ponto_current_role() = 'admin');
drop policy if exists ponto_profiles_update on ponto_profiles;
create policy ponto_profiles_update on ponto_profiles for update
  using (id = auth.uid() or ponto_current_role() = 'admin');

-- SECTORS
drop policy if exists ponto_sectors_select on ponto_sectors;
create policy ponto_sectors_select on ponto_sectors for select
  using (auth.role() = 'authenticated');
drop policy if exists ponto_sectors_admin_write on ponto_sectors;
create policy ponto_sectors_admin_write on ponto_sectors for all
  using (ponto_current_role() = 'admin') with check (ponto_current_role() = 'admin');

-- RESIDENTS
drop policy if exists ponto_residents_select on ponto_residents;
create policy ponto_residents_select on ponto_residents for select
  using (ponto_current_role() = 'admin' or profile_id = auth.uid());
drop policy if exists ponto_residents_admin_insert on ponto_residents;
create policy ponto_residents_admin_insert on ponto_residents for insert
  with check (ponto_current_role() = 'admin');
drop policy if exists ponto_residents_admin_update on ponto_residents;
create policy ponto_residents_admin_update on ponto_residents for update
  using (ponto_current_role() = 'admin');

-- WORK POLICIES
drop policy if exists ponto_work_policies_select on ponto_work_policies;
create policy ponto_work_policies_select on ponto_work_policies for select
  using (auth.role() = 'authenticated');
drop policy if exists ponto_work_policies_admin_update on ponto_work_policies;
create policy ponto_work_policies_admin_update on ponto_work_policies for update
  using (ponto_current_role() = 'admin');

-- TIME ENTRIES
drop policy if exists ponto_time_entries_select on ponto_time_entries;
create policy ponto_time_entries_select on ponto_time_entries for select
  using (
    ponto_current_role() = 'admin'
    or resident_id in (select id from ponto_residents where profile_id = auth.uid())
  );
drop policy if exists ponto_time_entries_insert_self on ponto_time_entries;
create policy ponto_time_entries_insert_self on ponto_time_entries for insert
  with check (
    origin = 'automatic'
    and created_by = auth.uid()
    and resident_id in (select id from ponto_residents where profile_id = auth.uid())
  );
drop policy if exists ponto_time_entries_insert_admin on ponto_time_entries;
create policy ponto_time_entries_insert_admin on ponto_time_entries for insert
  with check (ponto_current_role() = 'admin' and origin = 'manual');
drop policy if exists ponto_time_entries_update_admin on ponto_time_entries;
create policy ponto_time_entries_update_admin on ponto_time_entries for update
  using (ponto_current_role() = 'admin');

-- JUSTIFICATIONS
drop policy if exists ponto_justifications_select on ponto_justifications;
create policy ponto_justifications_select on ponto_justifications for select
  using (
    ponto_current_role() = 'admin'
    or resident_id in (select id from ponto_residents where profile_id = auth.uid())
  );
drop policy if exists ponto_justifications_insert on ponto_justifications;
create policy ponto_justifications_insert on ponto_justifications for insert
  with check (
    ponto_current_role() = 'admin'
    or resident_id in (select id from ponto_residents where profile_id = auth.uid())
  );
drop policy if exists ponto_justifications_review_admin on ponto_justifications;
create policy ponto_justifications_review_admin on ponto_justifications for update
  using (ponto_current_role() = 'admin');

-- AUDIT LOGS (append-only; escrita apenas via trigger security definer)
drop policy if exists ponto_audit_logs_select_admin on ponto_audit_logs;
create policy ponto_audit_logs_select_admin on ponto_audit_logs for select
  using (ponto_current_role() = 'admin');

-- NOTIFICATIONS
drop policy if exists ponto_notifications_select_admin on ponto_notifications;
create policy ponto_notifications_select_admin on ponto_notifications for select
  using (ponto_current_role() = 'admin' and (recipient_id is null or recipient_id = auth.uid()));
drop policy if exists ponto_notifications_update_admin on ponto_notifications;
create policy ponto_notifications_update_admin on ponto_notifications for update
  using (ponto_current_role() = 'admin');

-- DAILY SUMMARIES
drop policy if exists ponto_daily_summaries_select on ponto_daily_summaries;
create policy ponto_daily_summaries_select on ponto_daily_summaries for select
  using (
    ponto_current_role() = 'admin'
    or resident_id in (select id from ponto_residents where profile_id = auth.uid())
  );

-- ============================================================
-- REALTIME (painel de presença e fila de aprovações)
-- ============================================================
do $$ begin
  alter publication supabase_realtime add table ponto_time_entries;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table ponto_justifications;
exception when duplicate_object then null; end $$;

-- ============================================================
-- SEED: setores iniciais
-- ============================================================
insert into ponto_sectors (code, name) values
  ('UTI-AD', 'UTI Adulto'),
  ('PS',     'Pronto-Socorro'),
  ('AMB-3',  'Ambulatório 3'),
  ('CC',     'Centro Cirúrgico'),
  ('ENF-B',  'Enfermaria B'),
  ('MAT',    'Maternidade')
on conflict (code) do nothing;
