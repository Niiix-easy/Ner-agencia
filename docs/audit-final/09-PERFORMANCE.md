# 09 — Auditoria de Performance e Escalabilidade — NER AGENCY OS

## 1. Medições Reais Coletadas

| Métrica | Valor Medido | Avaliação |
|---|---|---|
| **Tempo de Build Frontend (`vite build`)** | `744 ms` (1.666 módulos) | Bom |
| **Tamanho Bundle JS (`dist/assets/index-*.js`)** | `804.55 kB` (`193.16 kB` gzip) | **Alerta P2** — Vite alerta chunk > `500 kB`; `AiCenterViews.tsx` (4.337 linhas) e todas as telas carregam no bundle inicial sem `React.lazy()`. |
| **Tamanho Bundle CSS** | `43.20 kB` (`7.44 kB` gzip) | Ótimo |
| **Execução da Suíte Completa (25 testes E2E HTTP)** | `7.02 s` | Excelente |
| **Limite em Memória de Logs/Memórias** | `usageLogs` limitado a 2.500 registros; `memories` limitado a 500 + poda por `retentionDays` | Evita crescimento ilimitado do arquivo JSON. |

---

## 2. Gargalos Arquiteturais para Escala (P2)
1. **Concorrência de Escrita em Disco (`PersistentStore`)**: `save()` serializa todo `ner-db.json` de forma síncrona (`JSON.stringify` + `writeFileSync` + `renameSync`). Adequado até dezenas de usuários simultâneos em 1 nó; acima disso exige migração para PostgreSQL + Redis.
2. **Carregamento em Bloco no Login (`App.tsx` `loadScopedData`)**: Dispara ~28 chamadas `fetch` em paralelo sempre que usuário faz login ou troca de organização. Funciona com baixa latência em localhost, mas em produção seria ideal carregar sob demanda por aba (`activeTab`).
3. **Code Splitting Pendente**: Aplicar `React.lazy` + `Suspense` em `AiCenterView` e módulos pesados reduzirá o bundle inicial em mais de 50%.
