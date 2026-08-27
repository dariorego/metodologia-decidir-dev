# Ponto Residentes — aplicação web

Next.js 16 (App Router, TypeScript, Tailwind 4) + Supabase (Postgres, Auth, Realtime, RLS).
Implementa o RDD (`../../RDD.md`) e os wireframes de `../../Wireframe das telas/`.

## Telas

| Perfil | Rota | O que faz |
|---|---|---|
| — | `/login` | E-mail/senha via Supabase Auth; redireciona pelo papel do perfil |
| Residente | `/ponto` | Registro rápido: relógio, seletor de setor, botão do próximo evento (início → intervalo → retorno → saída), jornada de hoje |
| Residente | `/justificar` | Justificativa obrigatória quando há jornada anterior sem saída; ao enviar, abre a jornada de hoje |
| Residente | `/registros` | Histórico por dia, horas do mês, plantões, pendências, exportação CSV |
| Administração | `/admin/agora` | Quem está na instituição (Realtime), filtros por setor, busca, exportação |
| Administração | `/admin/aprovacoes` | Fila de justificativas e ajustes — aprovar/reprovar com nota de revisão |
| Administração | `/admin/ajuste` | Inserir/corrigir ponto manual com motivo, jornada do dia e trilha de auditoria |
| Administração | `/admin/residentes` | Cadastro (cria usuário no Auth + perfil + residente), edição, status, datas |
| Administração | `/admin/relatorios` | Consolidação por período, horas por dia, por setor, CSV e impressão/PDF |

## Regras que ficam no banco (não só na interface)

- **Bloqueio de novo início de jornada** com jornada anterior aberta e sem justificativa
  (`trg_ponto_block_new_shift` → erro `RESIDENT_HAS_OPEN_SHIFT`, que a UI captura e redireciona para `/justificar`).
- **Notificação automática** à administração a cada justificativa (`trg_ponto_notify_justification`).
- **Auditoria** de inserções/alterações em pontos, justificativas e residentes (`ponto_audit_logs`, append-only).
- **RLS**: residente só vê e insere o que é seu (`origin = 'automatic'`); admin vê tudo e só insere `origin = 'manual'`.
- **View** `ponto_v_currently_present` responde "quem está na instituição agora".

Todas as tabelas usam o prefixo `ponto_` porque o projeto Supabase é compartilhado com outras aplicações.

## Rodando localmente

```bash
cp .env.example .env.local   # preencher URL e anon key
npm install
npm run dev                  # http://localhost:3000
```

### 1. Aplicar o schema

Abra o SQL Editor do projeto Supabase e execute `../../supabase/migrations/0001_ponto_schema.sql`
(é idempotente — pode rodar mais de uma vez).

### 2. Criar usuários de demonstração

```bash
SUPABASE_URL=https://<ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service_role> \
npm run seed:demo
```

Cria 1 admin e 5 residentes (senha `Ponto@2026`) com registros de exemplo — incluindo uma
jornada sem saída para a residente Ana, que dispara o fluxo de justificativa obrigatória.

| Perfil | E-mail |
|---|---|
| Administração | admin.demo@pontoresidentes.app |
| Residente | ana.demo@pontoresidentes.app |

## Publicação (Docker + Traefik)

Veja `../../.deploy.md`.

## Fora do MVP (Fase 2 do RDD)

Consolidação diária por Edge Function, e-mail/push, fila offline (PWA), 2FA, anonimização por retenção,
geofencing bloqueante. A tabela `ponto_daily_summaries` e a `ponto_notifications` (canal) já estão preparadas.
