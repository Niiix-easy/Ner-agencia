# NER AI ADMIN GUIDE — Guia do Administrador (NER AI CENTER)

## 1. Acesso ao Painel

Usuários com permissão `ai.read` / `ai.manage` (Super Admin e Administrador) visualizam a seção **NER AI CENTER** na barra lateral com 8 submenus:

1. **Dashboard de IA**: visão executiva real de provedores conectados/aguardando/erro, requisições, tokens, custo acumulado, latência média e estado dos Circuit Breakers.
2. **Provedores**: cards dos 8 adaptadores com escopo Global ou BYOK (por organização), entrada mascarada de API Key, Base URL, modelo padrão, rate limit, botão **Testar Conexão** e botão **Listar Modelos**.
3. **Modelos**: listagem pesquisável/filtrável por provedor, ativação/desativação, visualização de contexto/custos e cadastro de modelos customizados/locais.
4. **Roteamento**: configuração das 12 finalidades operacionais (primário, fallback, `allowMoreExpensiveFallback`, timeout e retries).
5. **Prompts**: biblioteca de prompts versionados (`v1`, `v2`, ... com histórico preservado) e Playground interativo para testes imediatos.
6. **Consumo e custos**: edição dos limites diários/mensais/usuário, alerta percentual e tabelas de consumo por provedor, modelo, departamento e cliente.
7. **Histórico**: trilha auditável por `requestId` e `traceId`, tokens, custo, latência, uso de fallback e eventuais erros.
8. **Configurações**: diagnóstico de `NER_AI_ENCRYPTION_KEY` e variáveis de ambiente, **Rotação de Chave Mestra** (Super Admin) e **Base de Conhecimento / RAG** isolada por tenant.

## 2. Como Configurar Credenciais (Passo a Passo)

1. Defina `NER_AI_ENCRYPTION_KEY` (mín. 32 bytes / 64 hex) nas variáveis de ambiente do servidor para habilitar criptografia AES-256-GCM via UI (ou configure as variáveis do provedor diretamente em `.env`, como `OPENAI_API_KEY`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `DEEPSEEK_API_KEY`, `OPENROUTER_API_KEY`, `OLLAMA_BASE_URL`, `VLLM_BASE_URL`, `HUGGINGFACE_API_TOKEN`).
2. Acesse **NER AI CENTER → Provedores**.
3. Clique em **Configurar** no provedor desejado, informe a chave/endpoint e salve (chaves já existentes exibem apenas máscara e exigem confirmação explícita para sobrescrever).
4. Clique em **Testar Conexão** — somente após o teste real passar o status mudará de `AGUARDANDO CONFIGURAÇÃO` para `CONECTADO`.
5. Opcionalmente clique em **Listar Modelos** para sincronizar os modelos disponíveis na conta e ajuste as regras em **Roteamento**.
