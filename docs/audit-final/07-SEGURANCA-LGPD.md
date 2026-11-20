# 07 — Auditoria de Segurança, Multi-Tenant e LGPD — NER AGENCY OS

## 1. Controles de Segurança Verificados e Endurecidos

| Controle | Implementação | Status |
|---|---|---|
| **Autenticação de Sessão** | Tokens randômicos armazenados por hash SHA-256, cookie `HttpOnly` + Bearer, revogação real em `/api/auth/logout`, rate limit em `/api/auth/login`. | **FUNCIONANDO** |
| **Hashing de Senhas** | `crypto.scryptSync` com salt único e comparação `timingSafeEqual`. `passwordHash` nunca exposto pela API. Criação de usuário exige `password.length >= 6`. | **FUNCIONANDO** |
| **RBAC Granular** | 8 perfis com matriz de permissões checada em `requirePermission(...)` no backend; cliente bloqueado de módulos internos e de outros clientes. | **FUNCIONANDO** |
| **Isolamento Multi-Tenant** | `resolveScopedOrg()` e `canAccessResourceOrg()` garantem segregação por `organizationId` e `clientId`. Foreign Keys secundárias (oportunidades, aprovações, time-tracking, web pages, tickets, conhecimento/execução IA) validadas dentro da organização ativa. | **FUNCIONANDO** |
| **Cabeçalhos HTTP de Segurança** | Middleware global adicionado em `server/app.ts`: `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`. | **FUNCIONANDO** |
| **Segredos e Criptografia IA** | AES-256-GCM em `server/ai/credentials.ts`, mascaramento em `store.audit` e rotação de chave mestra. | **FUNCIONANDO** |
| **Webhook Stripe Fail-Closed** | Em `NODE_ENV=production`, `getWebhookSecret()` não cai em fallback local; se `STRIPE_WEBHOOK_SECRET` não estiver definida, `/api/webhooks/stripe` responde `503` e `/api/billing/sandbox-webhook` responde `403`. | **FUNCIONANDO** |

---

## 2. Conformidade LGPD (Art. 18 e Retenção)
Implementado end-to-end (backend + UI + testes automatizados):
1. **Portabilidade e Acesso (`GET /api/lgpd/clients/:id/export`)**:
   - Disponível para o próprio titular (`Cliente` autenticado no mesmo `clientId`) ou equipe autorizada (`clients.read` no mesmo tenant).
   - Exporta JSON estruturado contendo cadastro do cliente, contratos, recebíveis, projetos, briefings, chamados, páginas web e contagem de logs IA, gerando evento de auditoria `LGPD_DATA_EXPORTED`.
2. **Eliminação / Anonimização (`POST /api/lgpd/clients/:id/anonymize`)**:
   - Restrito a `Super Admin` e `Administrador` (`clients.update`).
   - Anonimiza PII de `Client`, `Lead`s correspondentes e `clientName` em `Receivable` (preservando IDs e valores fiscais para obrigação legal), desativa usuários `Cliente` vinculados, revoga todas as sessões ativas desses usuários e remove memórias de IA do cliente, auditando `LGPD_CLIENT_ANONYMIZED`.
3. **Retenção de Memória Conversacional IA (`pruneExpiredMemories`)**:
   - Executada automaticamente em `saveMemoryEntry()` removendo memórias que ultrapassaram `retentionDays`.
4. **Painel UI**: Integrado em `NER Core • Trilha de Auditoria & Governança LGPD` (`src/components/CoreViews.tsx`) com download JSON e confirmação em duas etapas (sem `window.confirm`).
