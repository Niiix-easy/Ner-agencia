# 04 — Auditoria do NER AI Gateway — NER AGENCY OS

## 1. Arquitetura Centralizada e Provedores
O `AiGatewayService` (`server/ai/gateway.ts`) centraliza todas as operações de IA através de 8 adaptadores reais em `server/ai/providers.ts`:

| Provedor | Tipo de Adaptador no Código | Capabilities Suportadas | Estado Atual no Ambiente |
|---|---|---|---|
| **OpenAI** | REST oficial `/v1/chat/completions`, `/v1/embeddings`, `/v1/models` | Chat, Texto, Streaming SSE, Visão, Documentos, JSON, Tools, Embeddings | **AGUARDANDO CONFIGURAÇÃO** |
| **Anthropic** | REST oficial `/v1/messages` + `/v1/models` | Chat, Texto, Streaming SSE, Visão, Documentos, Tools | **AGUARDANDO CONFIGURAÇÃO** |
| **DeepSeek** | REST compatível OpenAI (`api.deepseek.com`) | Chat, Texto, Streaming SSE, JSON, Tools | **AGUARDANDO CONFIGURAÇÃO** |
| **Google Gemini** | REST oficial `generativelanguage.googleapis.com/v1beta` | Chat, Texto, Streaming SSE, Visão, Documentos, JSON, Tools, Embeddings | **AGUARDANDO CONFIGURAÇÃO** |
| **OpenRouter** | REST oficial `openrouter.ai/api/v1` | Chat, Texto, Streaming SSE, Visão, JSON, Tools | **AGUARDANDO CONFIGURAÇÃO** |
| **Ollama** | Endpoint HTTP self-hosted (`/api/chat`, `/api/tags`, `/api/embed`) | Chat, Texto, Streaming, Visão, JSON, Embeddings | **AGUARDANDO CONFIGURAÇÃO** |
| **vLLM** | Endpoint OpenAI-compatible (`/v1/chat/completions`, `/v1/models`) | Chat, Texto, Streaming SSE, JSON, Tools | **AGUARDANDO CONFIGURAÇÃO** |
| **Hugging Face** | Inference Providers Router (`router.huggingface.co/v1`) | Chat, Texto, Streaming SSE, Feature Extraction | **AGUARDANDO CONFIGURAÇÃO** |

---

## 2. Segurança de Credenciais e Isolamento Multi-Tenant
- **Criptografia**: AES-256-GCM via `server/ai/credentials.ts` com chave derivada por `NER_AI_ENCRYPTION_KEY`. Segredos nunca retornam em respostas REST (apenas `keyMask`, ex.: `sk-••••1234`) e `store.audit` aplica redação automática de tokens/chaves.
- **Rotação de Chave**: `POST /api/ai/security/rotate-key` re-criptografa credenciais armazenadas para nova chave mestra validada.
- **Correções Aplicadas na Auditoria (`server/ai/router.ts` & `server/ai/gateway.ts`)**:
  1. `POST /api/ai/department/execute` passou a exigir `ai.use` ou `ai.client_assist`, usar `resolveScopedOrg`, validar existência de `clientId`/`projectId` dentro do tenant e **retornar `403`** caso usuário `Cliente` informe `clientId` diferente do seu próprio.
  2. `POST /api/ai/knowledge` passou a validar que `clientId` e `projectId` pertencem ao tenant autorizado.
  3. `DELETE /api/ai/memory/:conversationId` passou a aceitar `clientId` no escopo de usuário `Cliente`, impedindo remoção de memória de outro cliente.
  4. `POST /api/ai/embeddings` passou a respeitar `resolveScopedOrg(req, req.body?.organizationId)`.
  5. `saveMemoryEntry()` agora invoca `pruneExpiredMemories()` respeitando `retentionDays` de cada registro.
  6. Frontend (`AiCenterViews.tsx`): corrigido `handleTest` para exibir `res.message || res.error` (antes exibia genérico quando o backend retornava `message`), e removido `window.confirm` da revogação de chave (substituído por confirmação inline).
