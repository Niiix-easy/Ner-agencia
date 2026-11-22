# NER AI CENTER — Documentação da Migração PostgreSQL + Prisma ORM

## 1. Visão Geral da Arquitetura de Banco de Dados

O **NER AI CENTER / NER AGENCY OS** utiliza **PostgreSQL 16+** com **Prisma ORM 6.19+** (`prisma/schema.prisma`) e driver `pg` com connection pooling centralizado (`server/db/prisma.ts`).

### Pilares Arquiteturais
- **59 modelos Prisma** cobrindo todos os 12 domínios funcionais (Organização/RBAC, Clientes/CRM, Financeiro, Projetos, Comercial, SaaS/Billing, NER AI Center, Operações, Criativos/Web, Automações, Integrações/Auditoria, Estratégia/QA/Lançamento/Entrega).
- **Multi-Tenant Defense-in-Depth**:
  1. Isolamento na camada de repositórios (`server/repositories/*`) com `resolveTenantOrganizationId`, `resolveScopedClientId` e `assertNoOrganizationTampering`.
  2. Transações com contexto local por transação (`withTenantTransaction` executando `SET LOCAL app.current_organization_id`, `app.current_client_id`, `app.is_super_admin`), impedindo vazamento de contexto entre conexões do pool.
  3. **PostgreSQL Row Level Security (RLS)** e **triggers anti-referência cross-tenant** na migration versionada `prisma/migrations/20261121000100_multitenant_rls_and_integrity/migration.sql`.
- **Fallback Seguro**: Enquanto `DATABASE_URL` não estiver provisionada em um ambiente, o sistema opera de forma íntegra sobre o `PersistentStore` atômico local (`database/data/ner-db.json`) sem quebrar funcionalidades.

---

## 2. Inventário das Entidades e Modelos Ausentes Corrigidos

Os **15 modelos que estavam ausentes** no schema original de auditoria agora estão integralmente modelados em `prisma/schema.prisma` e versionados nas migrations:

1. `Payable` (`payables`) — Contas a pagar da agência (isolado do perfil `Cliente`).
2. `Receivable` (`receivables`) — Contas a receber com `amount`, `paidAmount`, `mediaBudget` e política RLS restritiva por `clientId`.
3. `Commission` (`commissions`) — Comissões vinculadas a contratos e liberadas transacionalmente no pagamento.
4. `Briefing` (`briefings`) — Briefings de projetos e clientes.
5. `TimeEntry` (`timeTracking`) — Apontamento de horas por projeto/tarefa/usuário.
6. `CreativeAsset` (`creatives`) — Ativos criativos com direitos de uso e versionamento.
7. `AdAccount` (`adAccounts`) — Contas de anúncios Meta/Google/TikTok por cliente.
8. `TrackingEvent` (`trackingEvents`) — Eventos server-side/browser com chave única `(organizationId, eventId)` para deduplicação.
9. `Workflow` (`workflows`) — Automações internas e ponte n8n.
10. `WebPage` (`webPages`) — Landing Pages, Sites e E-commerces com slug único e `archivedAt`.
11. `Ticket` (`tickets`) — Chamados do Portal do Cliente com histórico de respostas.
12. `Incident` (`incidents`) — Gestão operacional de incidentes e histórico.
13. `PasswordResetToken` (`passwordResetTokens`) — Tokens de recuperação com hash SHA-256, expiração e uso único.
14. `StoredAsset` (`storedAssets`) — Metadados de arquivos enviados (S3/GCS/MinIO/local) com SHA-256.
15. `AdIntegrationCredential` (`adIntegrationCredentials`) — Cofre criptografado AES-256-GCM (`NER_AI_ENCRYPTION_KEY`) para Meta Ads, Google Ads e TikTok Ads.

Além destes, foram modelados os módulos operacionais completos: `StrategyPlan`, `QaCheckItem`, `LaunchChecklistItem`, `DeliveryHandoff`, `Invitation`, `Notification`, `WorkflowExecution`, `SystemEvent`, `Invoice`, `Payment`, e todos os 14 modelos do **NER AI Center** (`AiProviderConfig`, `AiModel`, `AiRoutingRule`, `AiPromptTemplate`, `AiGlobalCostPolicy`, `AiCostPolicy`, `AiKnowledgeDoc`, `AiMemory`, `AiActionCatalog`, `AiExchangeRate`, `AiLimitException`, `AiAccountingAlert`, `AiUsageAggregation`, `AiUsageLog`).

---

## 3. Variáveis de Ambiente e Compatibilidade de Infraestrutura

Consulte `.env.example` (nunca versione credenciais reais):

```env
DATABASE_URL="postgresql://ner_admin:CHANGE_ME@localhost:5432/ner_agency_os?schema=public"
DIRECT_URL=""
DATABASE_SSL="false"
DATABASE_SSL_REJECT_UNAUTHORIZED="true"
PG_POOL_MAX="10"
PG_IDLE_TIMEOUT_MS="30000"
PG_CONNECT_TIMEOUT_MS="10000"
NER_FORCE_JSON_STORE="false"
```

### Compatibilidade por Provedor PostgreSQL
- **Google Cloud SQL (PostgreSQL):**
  - Via Cloud SQL Auth Proxy (TCP local `127.0.0.1:5432` ou Unix socket `?host=/cloudsql/PROJECT:REGION:INSTANCE`).
  - Em ambientes gerenciados com certificado SSL, habilitar `DATABASE_SSL="true"`.
- **PostgreSQL Gerenciado (RDS, Neon, Supabase, Render, Railway):**
  - Configurar `DATABASE_URL` com `?sslmode=require` e `DATABASE_SSL="true"`.
  - Se houver PgBouncer/Transaction Pooler, informar `DIRECT_URL` sem pooler para `prisma migrate deploy`.
- **Lovable Cloud (quando suportar PostgreSQL dedicado):**
  - Conectar exclusivamente via `DATABASE_URL` server-side no backend Node.js (nunca expor credenciais no frontend), respeitando SSL e pool máximo configurável via `PG_POOL_MAX`.
- **PostgreSQL Self-Hosted / Docker:**
  - Utilizar `docker compose up -d postgres` com `docker-compose.yml` incluso no repositório.

---

## 4. Instalação e Comandos do Projeto

```bash
# 1. Instalar dependências
npm install

# 2. Gerar Prisma Client
npm run prisma:generate

# 3. Desenvolvimento (criar/aplicar migrations interativas)
npm run prisma:migrate:dev

# 4. Produção / Staging (aplicar migrations versionadas de forma segura e não-destrutiva)
npm run prisma:migrate:deploy

# 5. Validar integridade do schema, migrations, banco e JSON original
npm run db:validate

# 6. Migrar dados do JSON para PostgreSQL (cria backup SHA-256 automático, idempotente e retomável)
npm run db:migrate-json

# 7. Backup e Restauração
npm run db:backup
npm run db:restore -- database/backups/<arquivo-backup.json|dump>

# 8. Inspecionar dados (somente desenvolvimento)
npm run prisma:studio
```

---

## 5. Estratégia de Migrations e Rollback

### Migrations Versionadas (`prisma/migrations/`)
1. `20261121000000_init_full_schema/migration.sql` — Criação completa das 49 tabelas, PKs, FKs, constraints `UNIQUE` e índices compostos por `organizationId`.
2. `20261121000100_multitenant_rls_and_integrity/migration.sql` — Funções de contexto transacional (`ner_current_org_id`, `ner_current_client_id`, `ner_is_super_admin`), `CHECK` constraints financeiras, triggers anti-referência cross-tenant e políticas PostgreSQL RLS.

### Regras Obrigatórias em Produção
- **Nunca** executar `prisma db push` ou `prisma migrate reset` em produção.
- Sempre executar `npm run db:backup` antes de `npm run prisma:migrate:deploy`.
- **Rollback de Emergência:**
  - Para desabilitar RLS temporariamente em manutenção: `ALTER TABLE "<Tabela>" DISABLE ROW LEVEL SECURITY;`.
  - Para restaurar estado completo: `npm run db:restore -- database/backups/ner-postgres-<timestamp>.dump` (PostgreSQL) ou `database/backups/ner-db-backup-<timestamp>.json` (JSON com validação SHA-256).

---

## 6. Procedimento de Migração JSON -> PostgreSQL

O script `scripts/migrate-json-to-postgres.ts`:
1. Nunca apaga `database/data/ner-db.json`.
2. Gera backup com manifesto SHA-256 em `database/backups/`.
3. Valida integridade referencial, duplicidade de IDs, datas ISO e valores financeiros.
4. Importa em ordem topológica de chaves estrangeiras, em lotes (`--batch-size`, padrão 50), usando `upsert` idempotente (pode ser reexecutado sem duplicar registros) e checkpoint retomável (`--resume`).
5. Emite relatório completo JSON contendo registros encontrados, importados, atualizados, duplicados ignorados, rejeitados, relacionamentos inválidos e checksums financeiros.

---

## 7. Checklist de Deploy em Produção

1. Provisionar instância PostgreSQL 16+ com backup automático habilitado.
2. Configurar `DATABASE_URL`, `DATABASE_SSL`, `NER_AI_ENCRYPTION_KEY`, `STORAGE_SIGNING_SECRET`, `APP_URL` e `ALLOWED_ORIGINS` no cofre de segredos do ambiente.
3. Executar `npm run prisma:generate`.
4. Executar `npm run prisma:migrate:deploy`.
5. Executar `npm run db:migrate-json` (se houver dados legados em `database/data/ner-db.json`).
6. Executar `npm run db:validate` e confirmar `connected: true` e `referentialIssuesCount: 0`.
7. Validar `GET /api/health` confirmando `persistence.mode === "postgres"` e `persistence.connected === true`.
