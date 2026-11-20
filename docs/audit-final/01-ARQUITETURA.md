# 01 — Auditoria de Arquitetura e Infraestrutura — NER AGENCY OS

## 1. Visão Geral da Arquitetura em Execução

| Camada | Implementação Real no Código | Estado |
|---|---|---|
| **Runtime HTTP / SPA** | Express + Vite Middleware em `server.ts` (dev) e Express static (`dist/`) em produção | **FUNCIONANDO** (após correção de `npm start` para `tsx server.ts`) |
| **API Backend** | `server/app.ts` (2.096 linhas) + `server/ai/router.ts` (927 linhas) | **FUNCIONANDO** |
| **Camada de Serviços** | `server/services/digital-studio.ts` (303 linhas), `server/services/billing-stripe.ts` (278 linhas), `server/ai/gateway.ts` (1.853 linhas), `server/ai/cost-usage.ts` (1.332 linhas) | **FUNCIONANDO** |
| **Persistência Runtime** | `server/store.ts` (`PersistentStore` — escrita atômica em `database/data/ner-db.json` via arquivo temporário + `renameSync`) | **FUNCIONANDO** (para instância única; **não utiliza PostgreSQL** em runtime) |
| **Frontend SPA** | React + Tailwind (`src/App.tsx` + `src/components/{CoreViews,BusinessViews,OperationsViews,AiCenterViews,LoginScreen}.tsx`) | **FUNCIONANDO** |
| **Autenticação e RBAC** | Sessão token SHA-256 + cookie `HttpOnly` + header Bearer + rate limit de login (`server/middleware/auth.ts`) | **FUNCIONANDO** |
| **Infra Docker Compose** | `docker-compose.yml` define `postgres`, `redis`, `n8n`, `minio` | **NÃO CONECTADA AO RUNTIME ATUAL** (`PersistentStore` não usa esses containers) |

---

## 2. Achado Crítico de Arquitetura Corrigido (P0)
- **Bug identificado**: `package.json` definia `"start": "node server.ts"`. Ao executar `node -e "import('./server.ts')"`, o Node.js v22 em modo *strip-types* falhou imediatamente com:
  `SyntaxError: The requested module './ai/types.ts' does not provide an export named 'AiGatewayState'` (re-exportação de interfaces sem `type` ou imports TS estritos incompatíveis com strip-types puro).
- **Correção aplicada**: Alterado `"start"` em `package.json` para `"tsx server.ts"` (dependência `tsx` já instalada). Validado com boot real em `PORT=3099`.

---

## 3. Separação de Módulos e Acoplamento
- Não há duplicação estrutural de módulos: todos os departamentos operam sob um único `PersistentStore`, um único roteador de IA (`/api/ai/*` com `AiGatewayService`), e um único conjunto de entidades multi-tenant (`organizationId` + `clientId`).
- Todos os widgets de IA departamentais no frontend chamam exclusivamente `/api/ai/department/execute` via `DepartmentAiWidget`, respeitando a regra de gateway único.
- **Ponto de atenção (P2)**: `server/app.ts` concentra ~2.100 linhas em um único arquivo de registro de rotas e `src/components/AiCenterViews.tsx` concentra ~4.337 linhas. Funcionalmente íntegros, mas recomendável modularizar por domínio na próxima janela de manutenção.
