# NER AI PROVIDERS — Adaptadores Oficiais e Variáveis de Ambiente

Todos os 8 provedores implementam a interface comum `AiProviderAdapter` (`server/ai/providers.ts`) e iniciam obrigatoriamente com status **`AGUARDANDO CONFIGURAÇÃO`** até que uma credencial válida passe por teste real de conexão (`POST /api/ai/providers/:providerId/test`).

## 1. Catálogo de Provedores Suportados

| Provedor | ID | Variáveis de Ambiente | Capacidades Principais |
| :--- | :--- | :--- | :--- |
| **OpenAI — GPT** | `openai` | `OPENAI_API_KEY` | Chat, Streaming, Embeddings, Visão, JSON Estruturado, Tool Calling, Listagem (`/v1/models`) |
| **Anthropic — Claude** | `anthropic` | `ANTHROPIC_API_KEY` | Chat, Streaming, Visão, Tool Calling, Listagem (`/v1/models`) |
| **DeepSeek** | `deepseek` | `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL` | Chat, Streaming, JSON Estruturado, Tool Calling, Listagem (`/v1/models`) |
| **Google Gemini** | `gemini` | `GOOGLE_AI_API_KEY` ou `GEMINI_API_KEY` | Chat, Streaming, Embeddings (`gemini-embedding-2`), Visão, JSON Estruturado, Tool Calling via `@google/genai` server-side |
| **OpenRouter** | `openrouter` | `OPENROUTER_API_KEY` | Roteamento multi-provedor OpenAI-compatível, Streaming, JSON Estruturado, Tool Calling, Listagem (`/api/v1/models`) |
| **Ollama (Local)** | `ollama` | `OLLAMA_BASE_URL` (padrão `http://localhost:11434`) | Chat, Streaming, Embeddings (`/api/embed`), Visão, JSON, Listagem (`/api/tags`), sem exigência de API Key |
| **vLLM (Self-Hosted)** | `vllm` | `VLLM_BASE_URL`, `VLLM_API_KEY` (opcional) | Chat, Streaming, Embeddings, JSON, Tool Calling, Listagem (`/v1/models`) |
| **Hugging Face Inference** | `huggingface` | `HUGGINGFACE_API_TOKEN` | Chat, Streaming, Embeddings (`/pipeline/feature-extraction`), JSON Estruturado, Listagem |

## 2. Precedência de Credenciais (`resolveProviderCredentials`)

1. **BYOK da Organização** (`scope: 'organization'` e `organizationId` correspondente, criptografada em repouso).
2. **Credencial Global da Plataforma** (`scope: 'global'`, gerenciada por Super Admin / Administrador).
3. **Variável de Ambiente** (`process.env.*` configurada no servidor).

## 3. Regra de Validação Real

- Salvar uma API Key na interface **não** marca o provedor como `CONECTADO`; o registro permanece em `AGUARDANDO CONFIGURAÇÃO` até que **Testar Conexão** execute uma chamada real de verificação contra o endpoint oficial.
- Em caso de HTTP 401/403, timeout ou endpoint inacessível, o provedor recebe status `ERRO` com a mensagem sanitizada em `lastError`.
