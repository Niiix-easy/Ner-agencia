# NER AI SECURITY — Criptografia, RBAC, BYOK e Isolamento Multi-Tenant

## 1. Criptografia AES-256-GCM em Repouso

- Chaves salvas via painel são criptografadas com **AES-256-GCM** (`server/ai/credentials.ts`), IV aleatório de 12 bytes e Authentication Tag de 16 bytes, armazenadas no formato `enc:v1:<ivHex>:<tagHex>:<cipherHex>`.
- A chave mestra é lida exclusivamente da variável de ambiente `NER_AI_ENCRYPTION_KEY`. **Nenhuma chave mestra existe hardcoded no código-fonte.**
- Caso `NER_AI_ENCRYPTION_KEY` não esteja definida, o sistema inicia normalmente (permitindo fallback via variáveis de ambiente dos provedores), mas bloqueia gravação de novas chaves via UI com erro explícito `NER_AI_ENCRYPTION_KEY_MISSING`.

## 2. Proteção contra Vazamentos

- **Zero exposição no Frontend**: o campo `encryptedApiKey` é removido por `sanitizeProviderForClient()` antes de qualquer resposta HTTP; apenas `keyMask` (ex.: `sk-p••••4321`) e `credentialSource` são retornados.
- **Sanitização de erros e logs**: `sanitizeErrorText()` substitui padrões de tokens (`sk-...`, `AIza...`, `hf_...`, `Bearer ...`) por `[REDACTED_SECRET]` antes de gravar logs ou retornar erros.
- **Substituição e revogação seguras**: sobrescrever uma credencial existente exige confirmação explícita (`confirmOverwrite: true`, retornando `409 Conflict` caso ausente); revogação (`DELETE /api/ai/providers/:providerId/credential`) remove o segredo e retorna o provedor para `AGUARDANDO CONFIGURAÇÃO`.
- **Rotação de Chave Mestra**: `POST /api/ai/security/rotate-key` (exclusivo de `Super Admin`) re-criptografa todas as credenciais armazenadas de `oldMasterKey` para `newMasterKey` com registro em `AuditLog`.

## 3. RBAC e Isolamento Multi-Tenant

| Permissão | Papéis com Acesso | Escopo |
| :--- | :--- | :--- |
| `ai.read` | Super Admin, Administrador, Gestor de Tráfego, Comercial, Criativo | Leitura de dashboard, modelos, roteamento e logs da própria organização. |
| `ai.manage` | Super Admin, Administrador | Salvar/revogar credenciais, testar conexão, editar modelos, roteamento, prompts, políticas de custo e base RAG. Credenciais globais restritas a Admin/Super Admin. |
| `ai.use` | Super Admin, Administrador, Gestor de Tráfego, Comercial, Criativo | Execução de `/generate`, `/stream`, `/embeddings` e `/department/execute`. |
| `ai.client_assist` | Cliente | Restrito exclusivamente ao departamento `NER Client Experience` e ao `clientId` do usuário autenticado (chamadas a outros departamentos retornam `403`). |

## 4. Proteção contra Prompt Injection e Vazamento entre Tenants

- `sanitizePromptInput` neutraliza instruções clássicas de sobrescrita de sistema/exfiltração.
- Memória conversacional (`AiMemoryEntry`) e documentos RAG (`AiKnowledgeDoc`) são filtrados obrigatoriamente por `organizationId` (e `clientId` quando aplicável), impedindo que um tenant acesse contexto ou logs de outro.
