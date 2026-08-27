# RDD — Documento de Requisitos e Design
## Sistema de Controle de Ponto de Residentes

**Origem:** PDR — Reunião de 27/08/2026 (Requisitos para Sistema de Controle de Ponto de Residentes)
**Stack definida:** TypeScript (frontend + backend) e Supabase (Postgres, Auth, Realtime, Storage, Edge Functions)
**Versão:** 1.0 — Rascunho para validação técnica e de negócio
**Data:** 27/08/2026

---

## 1. Objetivo do documento

Este RDD traduz os requisitos levantados no PDR de 27/08/2026 em um desenho técnico executável, definindo arquitetura, modelo de dados, regras de negócio, contratos de API, segurança e requisitos não funcionais para o Sistema de Controle de Ponto de Residentes.

O PDR deixou diversas decisões em aberto ("Lacunas" e "Itens de ação"). Para que o desenho técnico pudesse avançar, este documento assume premissas explícitas nesses pontos — todas sinalizadas com o marcador **[PREMISSA]** — que devem ser validadas com o cliente antes da implementação. Nada aqui é definitivo até essa validação.

---

## 2. Premissas assumidas para viabilizar o design

| # | Lacuna no PDR | Premissa adotada **[PREMISSA]** | Impacto se mudar |
|---|---|---|---|
| 1 | Dispositivo de registro não definido | Aplicação **web responsiva (PWA)**, mobile-first, instalável em smartphone/tablet; suporte a modo totem (kiosk) como configuração de tela dedicada | Baixo: PWA cobre web, mobile e totem com a mesma base de código |
| 2 | Canal de notificação não definido | **E-mail** como canal inicial (via Supabase + provedor SMTP/Resend), com modelo de dados já preparado para push/SMS futuros | Médio: exige tabela de notificações desacoplada por canal (já prevista) |
| 3 | Geolocalização vs. seleção de setor | **Seleção manual de setor obrigatória** + captura opcional de geolocalização do dispositivo como dado de auditoria (não bloqueante) | Médio: se geofencing bloqueante for exigido, adicionar validação de raio por setor |
| 4 | Regras detalhadas de jornada (horários, tolerâncias) | Jornada simples de 4 eventos (entrada, início intervalo, fim intervalo, saída), sem limites de horário fixos no MVP; tolerância de atraso configurável por parâmetro (default 10 min) | Baixo: parametrizado em tabela `work_policies`, sem alteração de schema |
| 5 | Política de aprovação de ajustes manuais | Qualquer usuário com perfil `admin` pode registrar/aprovar ajustes; SLA de análise de justificativa **[PREMISSA] 48h úteis** | Baixo: campo de SLA é apenas informativo/relatório |
| 6 | Retenção de dados (LGPD) | Retenção de **5 anos** para registros de ponto e justificativas (alinhado à prescrição trabalhista geral no Brasil), com anonimização após esse período | Médio: parametrizável via job de retenção, não estrutural |
| 7 | Integração com sistemas existentes | Nenhuma integração no MVP; arquitetura expõe API REST/RPC via Supabase para integração futura | Baixo |
| 8 | Perfis especiais de "residente" (estagiário, visitante) | Fora do escopo do MVP; modelo de dados permite estender `resident_type` futuramente | Baixo |
| 9 | Registro offline | PWA com fila local (IndexedDB) e sincronização ao reconectar **[PREMISSA — Fase 2]** | Médio: não faz parte do MVP, mas o formato de evento já é idempotente para suportar isso |

---

## 3. Perfis de usuário (recapitulação do PDR)

- **Residente** — registra o próprio ponto, justifica esquecimentos, visualiza seu histórico.
- **Administração** — cadastra/gerencia residentes, insere/altera pontos manualmente, revisa e aprova/reprova justificativas, recebe notificações, acessa relatórios.

Ambos autenticam-se via **Supabase Auth**. O perfil é armazenado em uma tabela `profiles` vinculada a `auth.users`, e toda a autorização por linha é feita com **Row Level Security (RLS)** no Postgres — ou seja, a regra "residente só vê o que é seu" e "admin vê tudo" é garantida no banco, não apenas na aplicação.

---

## 4. Arquitetura da solução

```
┌──────────────────────────────┐        ┌───────────────────────────────────────┐
│   Frontend (TypeScript)      │        │              Supabase                  │
│   Next.js (App Router) + PWA │◄──────►│  Postgres (dados + RLS + triggers)     │
│   - App do Residente         │  REST/ │  Auth (e-mail/senha, magic link)       │
│   - Painel da Administração  │  RPC/  │  Realtime (canal "quem está presente") │
│   - Service Worker (offline) │  WS    │  Storage (anexos de justificativa)     │
└──────────────────────────────┘        │  Edge Functions (Deno/TS):             │
                                          │   - consolidação diária de jornada     │
                                          │   - disparo de notificações            │
                                          │   - geração de relatórios CSV/PDF      │
                                          └───────────────────────────────────────┘
```

**Decisões de arquitetura:**

- **Frontend:** Next.js 14+ com TypeScript, `@supabase/ssr` para sessão, Tailwind para UI simples e responsiva. Uma única aplicação com rotas segregadas por perfil (`/ponto` para residente, `/admin` para administração), controladas por *middleware* que lê o `role` do JWT.
- **Backend:** Supabase é o backend primário (BaaS). Regras de negócio críticas (ex.: bloqueio de novo ponto sem justificativa pendente) ficam em **funções SQL/PLpgSQL + triggers** no próprio banco, garantindo integridade mesmo se outro cliente acessar a API diretamente. Regras de orquestração (notificações, consolidação, exportação) ficam em **Edge Functions TypeScript**.
- **Tempo real:** o painel "quem está na instituição agora" assina o canal Realtime do Supabase na tabela `time_entries`, atualizando a lista sem *polling*.
- **Tipagem ponta a ponta:** os tipos do banco são gerados com `supabase gen types typescript` e compartilhados entre frontend e Edge Functions via um pacote `packages/shared-types`.

### Estrutura de repositório sugerida

```
/apps
  /web                 # Next.js + TypeScript (residente + admin)
/packages
  /shared-types         # Tipos gerados do Supabase + DTOs compartilhados
  /ui                   # Componentes compartilhados (opcional)
/supabase
  /migrations           # SQL versionado (schema, RLS, triggers, seeds)
  /functions
    /consolidate-daily   # Edge Function: fecha jornada do dia anterior
    /dispatch-notifications
    /export-report
  config.toml
```

---

## 5. Modelo de dados (Postgres / Supabase)

### 5.1 Diagrama entidade-relacionamento (resumo)

```
profiles ──1:1── residents ──1:N── time_entries ──N:1── sectors
                     │                  │
                     │                  └──0:1── justifications
                     │
                     └──N:1── sectors (setor padrão do residente)

justifications ──N:1── residents
                └──0:1── time_entries (ponto relacionado, quando aplicável)

audit_logs   (independente, referencia qualquer tabela auditada)
notifications (independente, referencia profiles como destinatário)
work_policies (parâmetros de jornada, tabela de configuração única/versionada)
daily_summaries (consolidação por residente/dia — tabela materializada)
```

### 5.2 DDL — Schema completo

```sql
-- ============================================================
-- ENUMS
-- ============================================================
create type user_role as enum ('resident', 'admin');
create type resident_status as enum ('active', 'inactive');
create type time_event_type as enum ('clock_in', 'break_start', 'break_end', 'clock_out');
create type entry_origin as enum ('automatic', 'manual');
create type justification_type as enum ('missed_clock_out', 'manual_adjustment', 'late_arrival', 'other');
create type justification_status as enum ('pending', 'approved', 'rejected');
create type notification_channel as enum ('email', 'push', 'sms', 'in_app');
create type notification_status as enum ('queued', 'sent', 'failed');

-- ============================================================
-- PROFILES (estende auth.users)
-- ============================================================
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role user_role not null default 'resident',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- SETORES
-- ============================================================
create table sectors (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================================
-- RESIDENTES
-- ============================================================
create table residents (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references profiles(id) on delete cascade,
  registration_number text not null unique,
  status resident_status not null default 'active',
  default_sector_id uuid references sectors(id),
  entry_date date not null,
  exit_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exit_after_entry check (exit_date is null or exit_date >= entry_date)
);
create index idx_residents_status on residents(status);

-- ============================================================
-- POLÍTICAS DE JORNADA (parametrização, sem necessidade de deploy)
-- ============================================================
create table work_policies (
  id int primary key default 1,
  late_tolerance_minutes int not null default 10,
  justification_review_sla_hours int not null default 48,
  require_justification_before_new_shift boolean not null default true,
  data_retention_years int not null default 5,
  updated_at timestamptz not null default now(),
  constraint single_row check (id = 1)
);
insert into work_policies (id) values (1);

-- ============================================================
-- REGISTROS DE PONTO
-- ============================================================
create table time_entries (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references residents(id) on delete restrict,
  event_type time_event_type not null,
  event_datetime timestamptz not null default now(),
  sector_id uuid not null references sectors(id),
  origin entry_origin not null default 'automatic',
  latitude double precision,
  longitude double precision,
  device_info jsonb,
  justification_id uuid references justifications(id),
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_time_entries_resident_date on time_entries(resident_id, event_datetime desc);
create index idx_time_entries_sector on time_entries(sector_id);

-- ============================================================
-- JUSTIFICATIVAS
-- ============================================================
create table justifications (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references residents(id) on delete restrict,
  related_time_entry_id uuid references time_entries(id),
  type justification_type not null,
  reason text not null,
  status justification_status not null default 'pending',
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now()
);
create index idx_justifications_status on justifications(status);

-- (agora que justifications existe, a FK em time_entries acima é resolvida na migration real
--  criando as tabelas em ordem invertida ou com "alter table ... add constraint" — ver nota abaixo)

-- ============================================================
-- AUDITORIA
-- ============================================================
create table audit_logs (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id uuid not null,
  action text not null,               -- insert | update | delete
  field_name text,
  old_value text,
  new_value text,
  reason text,
  changed_by uuid references profiles(id),
  changed_at timestamptz not null default now()
);
create index idx_audit_logs_record on audit_logs(table_name, record_id);

-- ============================================================
-- NOTIFICAÇÕES
-- ============================================================
create table notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_role user_role not null default 'admin',
  recipient_id uuid references profiles(id),  -- null = broadcast para todos admins
  type text not null,                          -- ex: 'missed_clock_out', 'justification_pending'
  payload jsonb not null default '{}',
  channel notification_channel not null default 'email',
  status notification_status not null default 'queued',
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

-- ============================================================
-- CONSOLIDAÇÃO DIÁRIA (resultado do "sistema consola")
-- ============================================================
create table daily_summaries (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references residents(id),
  work_date date not null,
  worked_minutes int not null default 0,
  break_minutes int not null default 0,
  late_minutes int not null default 0,
  has_open_shift boolean not null default false,   -- true = esqueceu de finalizar
  has_pending_justification boolean not null default false,
  computed_at timestamptz not null default now(),
  unique (resident_id, work_date)
);
create index idx_daily_summaries_date on daily_summaries(work_date);
```

> **Nota de migração:** `time_entries.justification_id` referencia `justifications`, que por sua vez referencia `time_entries` — a FK circular deve ser criada com `alter table time_entries add constraint fk_justification ...` em uma migration separada, após ambas as tabelas existirem.

### 5.3 Trigger de auditoria (genérica)

```sql
create or replace function fn_audit_trigger() returns trigger as $$
begin
  if (tg_op = 'UPDATE') then
    insert into audit_logs(table_name, record_id, action, changed_by, changed_at)
    values (tg_table_name, new.id, 'update', auth.uid(), now());
  elsif (tg_op = 'INSERT') then
    insert into audit_logs(table_name, record_id, action, changed_by, changed_at)
    values (tg_table_name, new.id, 'insert', auth.uid(), now());
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_audit_time_entries
  after insert or update on time_entries
  for each row execute function fn_audit_trigger();

create trigger trg_audit_justifications
  after insert or update on justifications
  for each row execute function fn_audit_trigger();
```

Para granularidade de campo (quem alterou qual valor), a versão de produção deve comparar `old.*` vs `new.*` coluna a coluna dentro da função — omitido aqui por brevidade, mas previsto no backlog técnico.

### 5.4 Regra de negócio crítica: bloqueio por jornada não finalizada

```sql
create or replace function fn_check_open_shift_before_clock_in()
returns trigger as $$
declare
  v_open_shift boolean;
begin
  if new.event_type = 'clock_in' then
    select exists (
      select 1 from time_entries te
      where te.resident_id = new.resident_id
        and te.event_datetime::date < new.event_datetime::date
        and te.event_type = 'clock_in'
        and not exists (
          select 1 from time_entries te2
          where te2.resident_id = te.resident_id
            and te2.event_type = 'clock_out'
            and te2.event_datetime > te.event_datetime
            and te2.event_datetime::date = te.event_datetime::date
        )
    ) into v_open_shift;

    if v_open_shift and new.justification_id is null then
      raise exception 'RESIDENT_HAS_OPEN_SHIFT: justificativa obrigatória antes de novo ponto de entrada';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_block_new_shift_without_justification
  before insert on time_entries
  for each row execute function fn_check_open_shift_before_clock_in();
```

A aplicação captura essa exceção (código `RESIDENT_HAS_OPEN_SHIFT`) e redireciona o residente para a tela de justificativa obrigatória antes de permitir o novo registro — atendendo à regra de negócio do PDR ("se o residente esquecer de finalizar um ponto em data anterior, exigir justificativa antes de iniciar nova jornada").

### 5.5 Row Level Security (RLS)

```sql
alter table residents enable row level security;
alter table time_entries enable row level security;
alter table justifications enable row level security;
alter table audit_logs enable row level security;
alter table notifications enable row level security;

-- Helper: papel do usuário logado
create or replace function fn_current_role() returns user_role as $$
  select role from profiles where id = auth.uid();
$$ language sql stable security definer;

-- RESIDENTS: admin vê todos; residente vê só o próprio registro
create policy residents_select on residents for select
  using (fn_current_role() = 'admin' or profile_id = auth.uid());
create policy residents_admin_write on residents for insert with check (fn_current_role() = 'admin');
create policy residents_admin_update on residents for update using (fn_current_role() = 'admin');

-- TIME_ENTRIES: residente insere/lê apenas os seus; admin tudo
create policy time_entries_select on time_entries for select
  using (
    fn_current_role() = 'admin'
    or resident_id in (select id from residents where profile_id = auth.uid())
  );
create policy time_entries_insert_self on time_entries for insert
  with check (
    origin = 'automatic'
    and resident_id in (select id from residents where profile_id = auth.uid())
    and created_by = auth.uid()
  );
create policy time_entries_insert_admin on time_entries for insert
  with check (fn_current_role() = 'admin' and origin = 'manual');
create policy time_entries_update_admin on time_entries for update
  using (fn_current_role() = 'admin');

-- JUSTIFICATIONS: residente cria a sua; admin revisa todas
create policy justifications_select on justifications for select
  using (
    fn_current_role() = 'admin'
    or resident_id in (select id from residents where profile_id = auth.uid())
  );
create policy justifications_insert_self on justifications for insert
  with check (resident_id in (select id from residents where profile_id = auth.uid()));
create policy justifications_review_admin on justifications for update
  using (fn_current_role() = 'admin');

-- AUDIT_LOGS: somente leitura para admin; escrita só via trigger (security definer)
create policy audit_logs_select_admin on audit_logs for select
  using (fn_current_role() = 'admin');

-- NOTIFICATIONS: cada admin vê broadcast + as suas; residentes não acessam
create policy notifications_select_admin on notifications for select
  using (fn_current_role() = 'admin' and (recipient_id is null or recipient_id = auth.uid()));
```

Essas políticas implementam diretamente o requisito de segurança do PDR: *"controle de acesso por perfil"* e *"autorização para edição manual limitada à administração, com justificativa e auditoria"* — reforçadas no nível do banco, não apenas na camada de aplicação.

---

## 6. Tipos TypeScript compartilhados

Gerados via `supabase gen types typescript --project-id <id> > packages/shared-types/database.ts` e complementados com DTOs de aplicação:

```typescript
// packages/shared-types/domain.ts
export type UserRole = 'resident' | 'admin';
export type ResidentStatus = 'active' | 'inactive';
export type TimeEventType = 'clock_in' | 'break_start' | 'break_end' | 'clock_out';
export type EntryOrigin = 'automatic' | 'manual';
export type JustificationType = 'missed_clock_out' | 'manual_adjustment' | 'late_arrival' | 'other';
export type JustificationStatus = 'pending' | 'approved' | 'rejected';

export interface Resident {
  id: string;
  profileId: string;
  registrationNumber: string;
  status: ResidentStatus;
  defaultSectorId: string | null;
  entryDate: string;   // ISO 8601 (date)
  exitDate: string | null;
  fullName: string;    // join com profiles
}

export interface TimeEntry {
  id: string;
  residentId: string;
  eventType: TimeEventType;
  eventDatetime: string; // ISO 8601
  sectorId: string;
  origin: EntryOrigin;
  latitude?: number | null;
  longitude?: number | null;
  justificationId?: string | null;
  createdBy: string;
}

export interface Justification {
  id: string;
  residentId: string;
  relatedTimeEntryId?: string | null;
  type: JustificationType;
  reason: string;
  status: JustificationStatus;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
}

export interface DailySummary {
  residentId: string;
  workDate: string;
  workedMinutes: number;
  breakMinutes: number;
  lateMinutes: number;
  hasOpenShift: boolean;
  hasPendingJustification: boolean;
}
```

### 6.1 Camada de serviço (frontend)

```typescript
// apps/web/services/timeClockService.ts
import { createClient } from '@/lib/supabase/client';
import type { TimeEventType } from '@shared-types/domain';

const OPEN_SHIFT_ERROR = 'RESIDENT_HAS_OPEN_SHIFT';

export class TimeClockService {
  constructor(private supabase = createClient()) {}

  async registerEvent(params: {
    residentId: string;
    eventType: TimeEventType;
    sectorId: string;
    coords?: GeolocationCoordinates;
  }) {
    const { data, error } = await this.supabase.from('time_entries').insert({
      resident_id: params.residentId,
      event_type: params.eventType,
      sector_id: params.sectorId,
      origin: 'automatic',
      latitude: params.coords?.latitude ?? null,
      longitude: params.coords?.longitude ?? null,
      created_by: (await this.supabase.auth.getUser()).data.user?.id,
    });

    if (error?.message.includes(OPEN_SHIFT_ERROR)) {
      throw new OpenShiftError(params.residentId);
    }
    if (error) throw error;
    return data;
  }

  async submitJustification(params: {
    residentId: string;
    type: 'missed_clock_out' | 'manual_adjustment' | 'late_arrival' | 'other';
    reason: string;
    relatedTimeEntryId?: string;
  }) {
    return this.supabase.from('justifications').insert({
      resident_id: params.residentId,
      type: params.type,
      reason: params.reason,
      related_time_entry_id: params.relatedTimeEntryId ?? null,
    });
  }

  /** Painel "quem está na instituição agora" — assinatura Realtime */
  subscribeToPresence(onChange: () => void) {
    return this.supabase
      .channel('presence-time-entries')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'time_entries' }, onChange)
      .subscribe();
  }
}

export class OpenShiftError extends Error {
  constructor(public residentId: string) {
    super('Jornada anterior não finalizada. Justificativa obrigatória.');
  }
}
```

### 6.2 Edge Function — consolidação diária ("sistema consola")

```typescript
// supabase/functions/consolidate-daily/index.ts
// Executada via pg_cron/Scheduled Function, 1x ao dia (madrugada) — atende ao NFR
// "processamento de consolidação diária/near real-time sem impacto no uso"

import { createClient } from 'jsr:@supabase/supabase-js@2';

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data: residents } = await supabase
    .from('residents')
    .select('id')
    .eq('status', 'active');

  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  for (const resident of residents ?? []) {
    const { data: entries } = await supabase
      .from('time_entries')
      .select('event_type, event_datetime')
      .eq('resident_id', resident.id)
      .gte('event_datetime', `${yesterday}T00:00:00`)
      .lt('event_datetime', `${yesterday}T23:59:59`)
      .order('event_datetime');

    const summary = computeSummary(entries ?? []);

    await supabase.from('daily_summaries').upsert({
      resident_id: resident.id,
      work_date: yesterday,
      ...summary,
    });

    if (summary.hasOpenShift) {
      await supabase.from('notifications').insert({
        recipient_role: 'admin',
        type: 'missed_clock_out',
        payload: { residentId: resident.id, date: yesterday },
        channel: 'email',
      });
    }
  }

  return new Response('ok');
});

function computeSummary(entries: { event_type: string; event_datetime: string }[]) {
  // Percorre os eventos em ordem e calcula minutos trabalhados/intervalo,
  // marcando hasOpenShift = true se não houver 'clock_out' correspondente.
  // Implementação completa no backlog técnico (state machine determinística).
  return {
    worked_minutes: 0,
    break_minutes: 0,
    late_minutes: 0,
    has_open_shift: !entries.some((e) => e.event_type === 'clock_out'),
    has_pending_justification: false,
  };
}
```

---

## 7. Fluxos principais

### 7.1 Registro de ponto (residente)

1. Residente abre a tela de registro rápido (PWA).
2. Seleciona o setor (ou usa o setor padrão pré-selecionado) e o tipo de evento sugerido automaticamente (o sistema infere o próximo evento esperado com base no último registro do dia).
3. App captura geolocalização (se permitido pelo navegador) como metadado de auditoria — não bloqueia o registro se negada.
4. Sistema grava o evento. Se o banco retornar `RESIDENT_HAS_OPEN_SHIFT`, o app redireciona para a tela de justificativa obrigatória (7.2) antes de permitir o novo `clock_in`.
5. Feedback imediato de sucesso (< 2s, conforme NFR de desempenho).

### 7.2 Justificativa obrigatória por esquecimento

1. Sistema detecta (via trigger ou verificação prévia no client) que o dia anterior ficou com jornada aberta.
2. Residente preenche motivo em campo de texto obrigatório.
3. Justificativa é criada com `status = pending` e vinculada ao `time_entry` em aberto.
4. Notificação é enfileirada para a administração (`type = 'justification_pending'`).
5. Somente após o envio da justificativa o novo `clock_in` é permitido.

### 7.3 Ajuste manual pela administração

1. Admin acessa o painel, localiza o residente e insere/edita um evento de ponto com `origin = 'manual'`.
2. Sistema exige campo de motivo (reaproveitando a tabela `justifications`, `type = 'manual_adjustment'`).
3. Trigger de auditoria grava o registro em `audit_logs` (quem, quando, o quê).
4. Ajuste fica visível no histórico do residente com marcação clara de origem manual.

### 7.4 "Quem está na instituição agora"

1. Painel administrativo assina o canal Realtime (`subscribeToPresence`).
2. View SQL `v_currently_present` calcula, para cada residente, se o último evento do dia é diferente de `clock_out`:

```sql
create or replace view v_currently_present as
select r.id as resident_id, p.full_name, s.name as sector_name, last_event.event_type, last_event.event_datetime
from residents r
join profiles p on p.id = r.profile_id
join lateral (
  select te.event_type, te.event_datetime, te.sector_id
  from time_entries te
  where te.resident_id = r.id and te.event_datetime::date = current_date
  order by te.event_datetime desc
  limit 1
) last_event on true
join sectors s on s.id = last_event.sector_id
where last_event.event_type <> 'clock_out'
  and r.status = 'active';
```

3. Painel atualiza a lista automaticamente a cada novo evento — sem necessidade de *refresh* manual.

### 7.5 Relatórios exportáveis

- Edge Function `export-report` recebe filtros (período, setor, status) via RPC, consulta `daily_summaries`/`time_entries` e gera CSV nativamente (streaming) ou aciona uma biblioteca de PDF (ex.: `@react-pdf/renderer` do lado servidor) para o formato PDF.
- Relatórios cobertos no MVP: presença atual, histórico de pontos por residente/período, atrasos, ausências, intervalos, justificativas pendentes/aprovadas/reprovadas.

---

## 8. Requisitos não funcionais → decisões técnicas

| Requisito (PDR) | Decisão técnica |
|---|---|
| Registro de ponto < 2s | Escrita direta via client Supabase (Postgres com índice em `resident_id, event_datetime`); sem etapas síncronas bloqueantes (notificação e consolidação são assíncronas) |
| Painel admin < 3s para N registros | Paginação server-side (`range()` do Supabase) + índices dedicados; `N` a confirmar com o cliente para dimensionar cache/paginação |
| Consolidação diária sem impacto no uso | Job assíncrono via Edge Function agendada (fora do horário de pico), não compete com escrita de pontos |
| Disponibilidade em horário de operação | Supabase gerenciado (SLA do provedor) + PWA com *fallback* de fila offline (Fase 2) para tolerância a instabilidade de rede |
| Integridade e trilha de auditoria | Triggers `AFTER INSERT/UPDATE` em `time_entries` e `justifications`; `audit_logs` append-only, sem policy de `update`/`delete` |
| Escalabilidade (mais residentes/setores) | Modelo relacional normalizado, sem limite artificial; Postgres escala verticalmente no plano Supabase e os índices cobrem os filtros mais comuns |
| Configuração de regras sem novo deploy | Tabela `work_policies` (parâmetros de jornada, SLA, retenção) editável via painel admin, sem alteração de código |
| Observabilidade | `audit_logs` cobre alterações de dado; logs de aplicação e Edge Functions ficam disponíveis nos logs nativos do Supabase; recomenda-se integrar um serviço de observabilidade externo (ex.: Sentry) na Fase 2 |

---

## 9. Segurança

- **Autenticação:** Supabase Auth (e-mail/senha no MVP; *magic link* opcional). Sessões JWT de curta duração com *refresh token*.
- **Autorização:** RLS em todas as tabelas sensíveis (seção 5.5) — nenhuma regra de acesso depende exclusivamente do frontend.
- **Prevenção de fraude de ponto:** seleção obrigatória de setor + registro de geolocalização (quando disponível) como evidência auditável; campo `device_info` (user agent, IP via Edge Function) para detectar padrões suspeitos. Autenticação forte (2FA) é um item de **[PREMISSA — Fase 2]**, dado que o PDR cita a necessidade mas não a torna obrigatória no MVP.
- **Criptografia:** em trânsito via TLS (padrão Supabase); em repouso via criptografia nativa do Postgres gerenciado (AES-256, conforme infraestrutura do provedor).
- **Minimização de dados (LGPD):** apenas os campos necessários para o controle de ponto são coletados; geolocalização é opcional e usada apenas como evidência auditável, não para rastreamento contínuo.

---

## 10. Conformidade regulatória (LGPD)

| Princípio | Implementação |
|---|---|
| Finalidade | Documentar no Termo de Uso/Política de Privacidade que os dados de ponto e geolocalização pontual servem exclusivamente ao controle de jornada e auditoria |
| Consentimento | Aceite obrigatório no primeiro acesso do residente, registrado com timestamp em `profiles` (campo a adicionar: `terms_accepted_at`) |
| Retenção | Job periódico (Edge Function agendada) que anonimiza/expurga registros além do prazo definido em `work_policies.data_retention_years` **[PREMISSA: 5 anos]** |
| Direitos do titular | Endpoint/RPC para exportação dos próprios dados do residente (`clock_in/out`, justificativas) em formato legível |
| Minimização | Geolocalização armazenada apenas como par de coordenadas no momento do evento, sem rastreamento contínuo |

---

## 11. Interface do usuário — telas previstas

1. **Tela de registro rápido (residente):** botão único e grande para o próximo evento esperado, seletor de setor, feedback visual imediato (sucesso/erro).
2. **Tela de justificativa obrigatória:** exibida automaticamente quando há jornada em aberto; campo de texto + tipo de justificativa; bloqueia o fluxo até envio.
3. **Histórico do residente:** lista cronológica dos próprios registros e justificativas, com status.
4. **Painel administrativo — presença:** lista em tempo real de "quem está na instituição agora", com filtro por setor.
5. **Painel administrativo — gestão de residentes:** CRUD de cadastro, status ativo/inativo, datas de entrada/saída.
6. **Painel administrativo — ajustes manuais:** formulário de inserção/edição de ponto com campo de motivo obrigatório.
7. **Painel administrativo — justificativas:** fila de pendentes, aprovação/reprovação com nota de revisão.
8. **Relatórios:** filtros por período/setor/status + exportação CSV/PDF.

---

## 12. Fases de entrega sugeridas

**Fase 1 — MVP**
Cadastro de residentes e setores; registro dos 4 eventos de ponto; regra de justificativa obrigatória; notificação por e-mail; painel de presença em tempo real; ajustes manuais com auditoria; relatórios básicos (CSV).

**Fase 2**
Registro offline com sincronização; exportação em PDF; 2FA/validação de dispositivo; canais adicionais de notificação (push); anonimização automática por retenção; perfis especiais de residente (estagiário, visitante), se confirmado como necessário.

**Fase 3**
Integrações com sistemas existentes da instituição (a definir); observabilidade externa (Sentry/Logflare); geofencing bloqueante por setor, se exigido.

---

## 13. Itens que permanecem em aberto (para validação com o cliente)

Estes pontos foram identificados no PDR e **não** foram resolvidos por premissa técnica — exigem decisão de negócio antes da Fase 1 avançar:

1. Confirmar se existem perfis especiais de "residente" (estagiário, visitante) com regras distintas.
2. Validar o canal de notificação preferido pela administração (e-mail foi assumido, mas pode não ser o desejado).
3. Confirmar dispositivos de registro autorizados (o PDR não define; assumimos PWA web/mobile).
4. Validar regras detalhadas de jornada: existe carga horária fixa, limites de intervalo, tolerância de atraso diferente de 10 minutos?
5. Confirmar política de retenção de dados (assumimos 5 anos).
6. Confirmar necessidade de integração com sistemas existentes da instituição.
7. Definir se geofencing (bloqueio por localização) é obrigatório ou apenas informativo.
8. Confirmar volumetria esperada (número de residentes, picos de registro) para dimensionar corretamente paginação e índices do painel administrativo.

---

## 14. Glossário (herdado do PDR)

- **Residente:** pessoa vinculada à instituição que registra ponto (não é um colaborador tradicional).
- **Setor:** área/local da instituição onde o residente inicia o ponto.
- **Consolidação:** processo (Edge Function `consolidate-daily`) que agrega os eventos de entrada/saída/intervalo em um resumo diário por residente.
- **Esquecimento de finalização:** ausência do evento `clock_out` em um dia anterior; aciona a exigência de justificativa e a notificação à administração.
