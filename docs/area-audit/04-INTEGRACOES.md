# 04 — Auditoria de Integrações — NER AGENCY OS

**Classificações Oficiais Aplicadas:**
- **FUNCIONANDO COM CONEXÃO REAL**
- **CONFIGURADA, MAS NÃO TESTADA**
- **SEM CREDENCIAIS**
- **PARCIALMENTE IMPLEMENTADA**
- **NÃO IMPLEMENTADA**
- **COM ERRO**

**Metodologia:** Verificação direta de presença de variáveis de ambiente no runtime (apenas booleanos, sem exposição de valores), inspeção do código-fonte dos adaptadores (`server/ai/providers.ts`, `server/services/billing-stripe.ts`, `server/app.ts`) e execução de sondas não destrutivas.

---

## 1. Matriz Completa das 18 Integrações Auditadas

| # | Integração | Código / Adaptador Real Existe? | Variáveis de Ambiente Presentes? | Classificação Oficial | Evidência Técnica |
|---|---|---|---|---|---|
| 1 | **OpenAI GPT** | Sim (`OpenAiAdapter` em `server/ai/providers.ts`) — chat, stream SSE, embeddings, model list, testConnection | `OPENAI_API_KEY`: `false` | **SEM CREDENCIAIS** | Adaptador HTTP real testado via mock (`ner-ai-gateway.test.ts`); status no runtime: `AGUARDANDO CONFIGURAÇÃO`. |
| 2 | **Anthropic Claude** | Sim (`AnthropicAdapter` em `server/ai/providers.ts`) — Messages API, stream SSE, cache/usage parsing | `ANTHROPIC_API_KEY`: `false` | **SEM CREDENCIAIS** | Adaptador HTTP real testado via mock; status no runtime: `AGUARDANDO CONFIGURAÇÃO`. |
| 3 | **DeepSeek** | Sim (`DeepSeekAdapter` em `server/ai/providers.ts`) — OpenAI-compatible + reasoning tokens | `DEEPSEEK_API_KEY`: `false` | **SEM CREDENCIAIS** | Adaptador HTTP real; status no runtime: `AGUARDANDO CONFIGURAÇÃO`. |
| 4 | **Google Gemini** | Sim (`GeminiAdapter` em `server/ai/providers.ts`) — REST/SDK `generateContent`, `streamGenerateContent`, `embedContent` | `GEMINI_API_KEY`: `false`, `GOOGLE_AI_API_KEY`: `false` | **SEM CREDENCIAIS** | Adaptador real testado via mock; status no runtime: `AGUARDANDO CONFIGURAÇÃO`. |
| 5 | **OpenRouter** | Sim (`OpenRouterAdapter` em `server/ai/providers.ts`) — OpenAI-compatible + headers `HTTP-Referer`/`X-Title` | `OPENROUTER_API_KEY`: `false` | **SEM CREDENCIAIS** | Adaptador HTTP real; status no runtime: `AGUARDANDO CONFIGURAÇÃO`. |
| 6 | **Ollama** | Sim (`OllamaAdapter` em `server/ai/providers.ts`) — `/api/tags`, `/api/chat`, `/api/embeddings` | `OLLAMA_BASE_URL`: `false` | **SEM CREDENCIAIS** (sem endpoint local configurado/ativo) | Default apontando para `http://127.0.0.1:11434`, sem instância Ollama ativa/testada; status `AGUARDANDO CONFIGURAÇÃO`. |
| 7 | **vLLM** | Sim (`VllmAdapter` em `server/ai/providers.ts`) — OpenAI-compatible | `VLLM_BASE_URL`: `false`, `VLLM_API_KEY`: `false` | **SEM CREDENCIAIS** | Adaptador HTTP real; status `AGUARDANDO CONFIGURAÇÃO`. |
| 8 | **Hugging Face** | Sim (`HuggingFaceAdapter` em `server/ai/providers.ts`) — Inference Router | `HUGGINGFACE_API_TOKEN`: `false` | **SEM CREDENCIAIS** | Adaptador HTTP real; status `AGUARDANDO CONFIGURAÇÃO`. |
| 9 | **Meta Ads** | **Não** (apenas checagem booleana de `META_APP_ID`/`META_APP_SECRET` em `/api/health` e `/api/operations/overview`) | `META_APP_ID`: `false`, `META_APP_SECRET`: `false` | **NÃO IMPLEMENTADA** | Zero chamadas à Graph/Marketing API ou OAuth; `acc-1` usa dados seed fixos (`Conectado (Demo)`). |
| 10 | **Google Ads** | **Não** (apenas checagem booleana de `GOOGLE_ADS_CLIENT_ID` em `/api/operations/overview`) | `GOOGLE_ADS_CLIENT_ID`: `false` | **NÃO IMPLEMENTADA** | Zero cliente OAuth/API; `acc-2` usa dados seed fixos (`Pendente de Credenciais`). |
| 11 | **TikTok Ads** | **Não** (nenhuma referência no código-fonte) | N/A | **NÃO IMPLEMENTADA** | Grep em `src/` e `server/` retornou `0` ocorrências para TikTok Ads. |
| 12 | **WhatsApp** | **Não** (apenas campo string `whatsappNumber` em `WebPage`) | N/A | **NÃO IMPLEMENTADA** | Nenhuma integração com WhatsApp Cloud API, Evolution API, Z-API ou webhooks de mensageria. |
| 13 | **n8n** | Sim (`POST /api/workflows/:id/test` em `server/app.ts:1643-1671` executa `fetch(N8N_WEBHOOK_URL, { method: 'POST' })`) | `N8N_WEBHOOK_URL`: `false` | **SEM CREDENCIAIS** | Teste automatizado (`ner-audit-e2e.test.ts`) validou disparo HTTP real contra servidor local mock; sem env retorna `400`. |
| 14 | **CRM (Externo)** | **Não** (a plataforma possui CRM interno nativo no `NER Business`, mas nenhuma integração com HubSpot, Pipedrive, RD Station ou Salesforce) | N/A | **NÃO IMPLEMENTADA** | Grep confirmou `0` adaptadores para CRMs externos. |
| 15 | **Chatwoot** | **Não** (zero referências no repositório) | N/A | **NÃO IMPLEMENTADA** | Grep em `src/` e `server/` retornou `0` ocorrências. |
| 16 | **Serviços de Pagamento (Stripe)** | Parcial (`server/services/billing-stripe.ts`): webhook `HMAC-SHA256` real e idempotente, **mas checkout NÃO chama Stripe HTTP API** | `STRIPE_SECRET_KEY`: `false`, `STRIPE_WEBHOOK_SECRET`: `false` | **PARCIALMENTE IMPLEMENTADA** *(e sem credenciais)* | `createSaaSCheckoutSession` apenas gera string `cs_sandbox_*`/`cs_live_*` localmente sem `fetch` para `api.stripe.com`. |
| 17 | **Armazenamento (S3 / MinIO / Uploads)** | **Não** (apenas container `minio` declarado em `docker-compose.yml`, sem SDK, sem rota de upload e sem uso no runtime) | N/A | **NÃO IMPLEMENTADA** | Nenhum endpoint `multipart/form-data`, nenhum cliente `@aws-sdk/client-s3` ou `minio` no `package.json`. |
| 18 | **Analytics (GA4 / Meta CAPI / BI Externo)** | **Não** (`NER Tracking` só armazena eventos internamente; sem despacho para GA4 Measurement Protocol ou Meta Conversions API) | N/A | **NÃO IMPLEMENTADA** | `server/app.ts:1566-1603` persiste em `trackingEvents` localmente sem nenhum envio externo. |

---

## 2. Integrações de Infraestrutura Declaradas vs Runtime

| Componente | Declarado em | Usado no Runtime (`server.ts`)? | Classificação |
|---|---|---|---|
| **PostgreSQL / Prisma** | `database/schema/schema.prisma`, `docker-compose.yml`, `.env.example` | **Não** (`@prisma/client` ausente no `package.json`; runtime usa `PersistentStore` JSON) | **NÃO IMPLEMENTADA** (no runtime) |
| **Redis / BullMQ** | `docker-compose.yml`, `.env.example` | **Não** (`redis`/`bullmq` ausentes no `package.json`) | **NÃO IMPLEMENTADA** (no runtime) |
| **Chave Mestra AI (`NER_AI_ENCRYPTION_KEY`)** | `.env.example`, `server/ai/security.ts` | Sim (exigida para cifrar credenciais BYOK/Admin em AES-256-GCM) | **SEM CREDENCIAIS** (`encryptionKeyConfigured: false`) |
| **SMTP / Serviço de E-mail** | Ausente | **Não** (`forgot-password` é no-op) | **NÃO IMPLEMENTADA** |

---

## 3. Conclusão da Auditoria de Integrações

- **Funcionando com conexão real neste ambiente:** **0**
- **Código real pronto, bloqueado apenas por falta de credenciais (`SEM CREDENCIAIS`):** **9** (OpenAI, Anthropic, DeepSeek, Gemini, OpenRouter, Ollama, vLLM, Hugging Face, n8n)
- **Parcialmente implementada:** **1** (Stripe — webhook real, checkout local sem API HTTP e sem credenciais)
- **Não implementadas (código ausente ou apenas dados seed/campos de texto):** **8** (Meta Ads, Google Ads, TikTok Ads, WhatsApp, CRM Externo, Chatwoot, Armazenamento/Upload, Analytics/GA4-CAPI)
