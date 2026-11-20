# 12 — Problemas Pendentes e Itens Dependentes de Configuração Externa

Itens que **permanecem pendentes** após a auditoria (separados claramente entre limitações estruturais P2/P3 e credenciais externas):

## 1. Pendências Arquiteturais / Produto (P2–P3)
| ID | Severidade | Descrição | Impacto | Recomendação |
|---|---|---|---|---|
| **PEND-01** | P2 | Persistência em JSON local (`PersistentStore` / `database/data/ner-db.json`) em vez de PostgreSQL + Prisma (`prisma` ausente do `package.json` e `schema.prisma` sem 12 modelos operacionais). | Impede multi-réplica horizontal e transações SQL concorrentes em grande escala. | Sincronizar os 12 modelos ausentes em `schema.prisma`, instalar `@prisma/client` e implementar repositório Prisma equivalente ao `PersistentStore`. |
| **PEND-02** | P2 | `POST /api/billing/checkout` gera ID local sem invocar API `checkout.sessions.create` da Stripe. | Cliente SaaS não é redirecionado para checkout hospedado real da Stripe. | Integrar `stripe.checkout.sessions.create` usando `STRIPE_SECRET_KEY` em produção. |
| **PEND-03** | P2 | Mídia Paga (`NER Performance`) possui contas Meta/Google Ads seedadas sem cliente OAuth2/Marketing API real. | Métricas de spend/ROAS de campanhas são demonstrativas até integração OAuth oficial. | Implementar fluxo OAuth Meta Marketing API & Google Ads API com tokens criptografados por tenant. |
| **PEND-04** | P2 | Bundle JS único Vite de `804.55 kB` (> `500 kB`) e ausência de tela dedicada de CRUD direto de Clientes no menu lateral (`App.tsx`). | Tempo inicial de carga maior; criação de clientes ocorre via conversão de Lead ou API `/api/clients`. | Adicionar `React.lazy()` para `AiCenterView`/módulos e opcionalmente uma aba `Clientes` em `BusinessViews.tsx`. |
| **PEND-05** | P3 | Aviso de build no `vite.config.ts` (`__dirname` vs `import.meta.dirname` no `configLoader: 'native'`). | Apenas log de build sem erro funcional. | Migrar `vite.config.ts` para `import.meta.dirname` quando conveniente. |

---

## 2. Itens Aguardando Credenciais / Variáveis de Ambiente Externas (Não Inventados)
Estes componentes já possuem adaptadores reais implementados no código, mas dependem de segredos externos para operar em produção:
1. **`NER_AI_ENCRYPTION_KEY`** (64 chars hex): necessária para criptografar novas API keys via UI do `NER AI Center`.
2. **Provedores de IA (8/8)**: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `DEEPSEEK_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `HUGGINGFACE_API_KEY`, `OLLAMA_BASE_URL`, `VLLM_BASE_URL` (via env ou painel criptografado).
3. **Billing Stripe**: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.
4. **Automação n8n**: `N8N_WEBHOOK_URL` (e serviço n8n ativo).
