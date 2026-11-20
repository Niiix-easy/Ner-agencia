# 06 — Auditoria de Banco de Dados, Persistência e Schema — NER AGENCY OS

## 1. Diagnóstico Real da Persistência

| Item | Realidade Encontrada | Classificação |
|---|---|---|
| **Banco em Produção Atual** | `PersistentStore` (`server/store.ts`) sobre arquivo JSON local (`database/data/ner-db.json`, ~56.6 KB) com gravação atômica (`writeFileSync` em `.tmp` + `renameSync`). | **FUNCIONANDO** *(adequado para piloto/single-instance; não escala horizontalmente)* |
| **PostgreSQL + Prisma** | `database/schema/schema.prisma` (18.6 KB) e `database/migrations/*.sql` existem no repositório, porém **`@prisma/client` e `prisma` não constam em `package.json`** e nenhum repositório lê ou grava em PostgreSQL em runtime. | **NÃO IMPLEMENTADA NO RUNTIME** |
| **Alinhamento `docker-compose.yml` vs `.env.example`** | Credenciais estavam divergentes (`ner_pass` no `.env.example` vs `ner_admin:ner_secure_password` no `docker-compose.yml`). | **CORRIGIDO** em `.env.example` |

---

## 2. Divergências entre `schema.prisma` e Runtime (`server/types.ts`)
Caso a equipe decida migrar o `PersistentStore` para PostgreSQL usando `database/schema/schema.prisma`, os seguintes modelos presentes em `server/types.ts` ainda **não existem** no `schema.prisma` e precisarão ser modelados antes do `prisma migrate`:
1. `Payable` (`payables`)
2. `Receivable` (`receivables` — separando `amount`, `paidAmount`, `mediaBudget`)
3. `Commission` (`commissions`)
4. `Briefing` (`briefings`)
5. `TimeEntry` (`timeTracking`)
6. `CreativeAsset` (`creatives`)
7. `AdAccount` (`adAccounts`)
8. `TrackingEvent` (`trackingEvents`)
9. `AutomationWorkflow` (`workflows`)
10. `WebPage` (`webPages`)
11. `ClientTicket` (`tickets`)
12. `IncidentRecord` (`incidents`)

---

## 3. Integridade Referencial e Segurança de Escrita (Corrigida)
- **IDs Unificados com Entropia**: Substituídos geradores baseados exclusivamente em `Date.now()` em `server/services/digital-studio.ts`, `server/services/billing-stripe.ts` e `server/app.ts` pelo helper `uid(prefix)` com `crypto.randomBytes(3).toString('hex')`, eliminando risco de chaves duplicadas em requisições simultâneas.
- **Validação Cross-Tenant de Foreign Keys**: Endurecida em `POST /api/opportunities`, `POST /api/users`, `POST /api/approvals`, `POST /api/time-tracking`, `POST /api/tracking/events`, `POST /api/web/pages`, `POST /api/tickets`, `POST /api/ai/knowledge` e `POST /api/ai/department/execute`.
- **Integridade de Dados Reais**: `database/data/ner-db.json` permaneceu intacto (todos os testes operam em diretórios temporários isolados `os.tmpdir()`).
