# NER AGENCY OS

> **Marketing. Intelligence. Growth.**

Sistema Operacional Proprietário da **NER Agency** para gestão empresarial completa, CRM, produção audiovisual, tráfego pago multicanal, automações com n8n, landing pages, atribuição de conversões e inteligência de negócios.

---

## 🚀 Arquitetura Tecnológica

- **Frontend**: React 19, TypeScript, Tailwind CSS, Lucide Icons.
- **Backend**: Node.js, Express, REST APIs, Webhooks.
- **Banco de Dados**: PostgreSQL com Prisma ORM.
- **Processamento & Filas**: Redis & BullMQ.
- **Automação**: n8n Workflow Orchestrator.
- **Armazenamento**: MinIO / S3.
- **Audiovisual**: Remotion / FFmpeg.

---

## 🏢 Unidades de Negócio Integradas

1. **NER Core**: Identidade, Usuários, Permissões RBAC, Logs de Auditoria e Isolamento de Clientes.
2. **NER Business**: CRM comercial, Pipeline de Vendas, Propostas, Contratos, Faturas e Gestão Financeira.
3. **NER Strategy**: Pesquisa de mercado, Personas, Posicionamento e Briefings.
4. **NER Creative**: Fábrica de criativos, Roteiros, Versões (9:16, 1:1, 16:9), UGC e Aprovação de materiais.
5. **NER Performance**: Conectores Meta Ads, Google Ads e TikTok Ads, Orçamentos e Alertas inteligentes.
6. **NER Web**: Construtor de Landing Pages, E-commerce, UTM Builder e Pixels.
7. **NER Automation**: Orquestração n8n, Webhooks e Workers de notificação.
8. **NER Intelligence**: Dashboard Executivo, CAC, CPA, ROAS, ROI, LTV e Atribuição.
9. **Portal do Cliente**: Área exclusiva para clientes acompanharem campanhas, aprovarem criativos e visualizarem faturas.

---

## 🛠️ Instalação e Execução (Docker & pnpm)

1. Clone o repositório:
   ```bash
   git clone https://github.com/ner-agency/ner-agency-os.git
   cd ner-agency-os
   ```

2. Copie o arquivo de ambiente:
   ```bash
   cp .env.example .env
   ```

3. Inicie os serviços de infraestrutura (PostgreSQL, Redis, MinIO, n8n):
   ```bash
   docker compose up -d
   ```

4. Instale as dependências e inicie o desenvolvimento:
   ```bash
   pnpm install
   pnpm dev
   ```

---

## 📋 Roadmap de Implementação (Fases 01 a 12)

- [x] **Fase 01**: Fundação, Monorepo & Infraestrutura (Docker, PostgreSQL, Redis)
- [x] **Fase 02**: NER Core (Auth, RBAC, Auditoria)
- [x] **Fase 03**: NER Business (CRM, Leads, Financeiro)
- [x] **Fase 04**: Gestão de Projetos & Briefings
- [x] **Fase 05**: NER Creative (Fábrica de Criativos & Mídia)
- [x] **Fase 06**: NER Performance (Meta, Google, TikTok Ads)
- [x] **Fase 07**: Tracking & Atribuição CAPI
- [x] **Fase 08**: NER Automation (n8n & Webhooks)
- [x] **Fase 09**: NER Intelligence & BI (ROAS, CAC, CPA)
- [x] **Fase 10**: Portal do Cliente
- [x] **Fase 11**: Segurança, LGPD & Auditoria
- [x] **Fase 12**: Lançamento & Documentação de Deploy

---
© 2026 NER Agency. Todos os direitos reservados.
