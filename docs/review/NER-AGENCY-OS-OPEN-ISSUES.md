# NER AGENCY OS — Pendências Reais e Restrições Externas (Open Issues)

Este documento lista exclusivamente pendências reais que dependem de infraestrutura externa, credenciais de terceiros ou evoluções futuras fora do runtime atual do container.

---

## 1. Dependências de Infraestrutura & Banco de Dados

- **Execução Runtime sobre PostgreSQL + Prisma Client**:
  - O schema consolidado está pronto em `database/schema/schema.prisma` e o `docker-compose.yml` define os serviços `postgres` e `redis`.
  - No ambiente atual do sandbox, não há instância PostgreSQL/Redis em execução; por isso, o servidor opera com persistência atômica em disco via `server/store.ts` (`database/data/ner-db.json`).
  - **Ação para produção**: Provisionar PostgreSQL, configurar `DATABASE_URL` no ambiente, rodar `npx prisma migrate deploy` e substituir as leituras/escritas de `PersistentStore` por adaptador Prisma Client para escalar horizontalmente com múltiplas réplicas.
- **Redis & Filas BullMQ**:
  - `REDIS_URL` não está ativo no runtime atual; gatilhos de workflow internos executam de forma síncrona no processo Express. Para jobs assíncronos de longa duração e retentativas com backoff, conectar worker BullMQ ao Redis em produção.

---

## 2. Credenciais Externas Pendentes (Sem Simulação Oculta)

As integrações abaixo estão estruturadas com seus adaptadores/interfaces e sinalizadas honestamente na interface de **NER Operations & Performance** como pendentes até a inserção das variáveis de ambiente:

1. **Stripe Live Keys (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`)**:
   - A verificação HMAC-SHA256 e a idempotência no endpoint `POST /api/webhooks/stripe` estão 100% operacionais e testadas.
   - Para cobrança real em cartões/boletos de clientes finais ou assinantes SaaS, inserir as chaves reais da conta Stripe e cadastrar a URL pública `/api/webhooks/stripe` no painel da Stripe.
2. **Meta Ads / Google Ads / TikTok Ads OAuth (`META_APP_ID`, `META_APP_SECRET`, `GOOGLE_ADS_CLIENT_ID`)**:
   - As contas exibidas no módulo Performance estão rotuladas como `Conectado (Demo)` ou `Pendente de Credenciais`. A sincronização automática via APIs externas requer configuração dos aplicativos OAuth oficiais de cada plataforma.
3. **Orquestrador Externo n8n (`N8N_WEBHOOK_URL`)**:
   - O workflow externo `n8n` permanece bloqueado com status `Pendente de Configuração n8n` até que `N8N_WEBHOOK_URL` seja definida.
4. **Gemini AI (`GEMINI_API_KEY`)**:
   - O endpoint `POST /api/ai/generate` exige autenticação e a chave no servidor (`503` se ausente no ambiente).

---

## 3. Melhorias Recomendadas (P3 — Backlog Futuro)

- Adicionar testes E2E de navegador (ex.: Playwright) complementando a suíte atual de testes de API HTTP (`tests/ner-os.test.ts`).
- Implementar upload real de arquivos binários (S3 / Cloud Storage) para criativos em vídeo/imagem no módulo `NER Creative`, substituindo metadados textuais.
- Configurar `NER_DEV_BOOTSTRAP_PASSWORD` obrigatório ou remover usuários demo do seed antes do deploy em produção.
