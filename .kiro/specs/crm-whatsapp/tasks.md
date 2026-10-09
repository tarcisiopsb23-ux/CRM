# Implementation Plan: crm-whatsapp

## Overview

Projeto Node.js standalone com Express + SQLite + whatsapp-web.js no backend e HTML/CSS/JS vanilla no frontend. Implementação incremental: setup → banco → keywords → WhatsApp → API → frontend → testes.

## Tasks

- [x] 1. Setup do projeto standalone
  - Criar diretório `crm-whatsapp/` com subdiretórios `backend/routes/`, `frontend/` e `database/`
  - Criar `crm-whatsapp/package.json` com scripts `start` e `test`, dependências `express`, `whatsapp-web.js`, `better-sqlite3` e devDependencies `fast-check`, `vitest`
  - Criar `crm-whatsapp/vitest.config.js` apontando para arquivos de teste em `backend/tests/`
  - _Requirements: 8.1_

- [x] 2. Implementar camada de dados (`backend/db.js`)
  - [x] 2.1 Criar `backend/db.js` com `initDb()` que abre/cria `database/crm.db` e executa o `CREATE TABLE IF NOT EXISTS contatos` com todos os campos do schema (id, nome, telefone, origem, ultima_mensagem, data_ultima_interacao, status CHECK, observacao, valor_potencial, tem_keyword)
    - Incluir `process.exit(1)` em caso de erro fatal na inicialização
    - _Requirements: 8.1, 8.2, 8.3, 8.4_
  - [x] 2.2 Implementar `upsertContato(contato)` usando INSERT OR REPLACE ou INSERT ... ON CONFLICT(telefone) DO UPDATE para garantir unicidade; usar telefone como fallback de nome quando ausente
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 8.4_
  - [x] 2.3 Implementar `getContatos(status?)` com ORDER BY data_ultima_interacao DESC e WHERE status = ? quando filtro fornecido
    - _Requirements: 5.1, 5.3, 7.1, 7.2_
  - [x] 2.4 Implementar `updateContato(id, fields)` que atualiza apenas os campos fornecidos (status e/ou observacao) e retorna o contato atualizado ou null se não encontrado
    - _Requirements: 4.3, 4.6, 7.3_
  - [x] 2.5 Escrever testes de propriedade para `db.js`
    - **Property 2: Novo contato sempre inicia com status "pendente"**
    - **Validates: Requirements 2.2, 2.5, 8.4**
    - **Property 3: Unicidade de contato por telefone**
    - **Validates: Requirements 2.3, 2.4, 8.2**
    - **Property 5: Keyword não altera status já classificado**
    - **Validates: Requirements 3.4**
    - **Property 6: Atualização de status é persistida corretamente**
    - **Validates: Requirements 4.3**
    - **Property 7: Round-trip de observação**
    - **Validates: Requirements 4.6**
    - **Property 8: Ordenação da listagem por data decrescente**
    - **Validates: Requirements 5.1**

- [x] 3. Implementar detecção de palavras-chave (`backend/keywords.js`)
  - [x] 3.1 Criar `backend/keywords.js` com array `KEYWORDS` e função `hasBusinessKeyword(message)` usando `toLowerCase()` para comparação case-insensitive
    - _Requirements: 3.1, 3.2_
  - [x] 3.2 Escrever teste de propriedade para `keywords.js`
    - **Property 4: Detecção de keywords é case-insensitive**
    - **Validates: Requirements 3.1, 3.2**

- [x] 4. Checkpoint — Garantir que os testes de db.js e keywords.js passam
  - Garantir que todos os testes passam, perguntar ao usuário se houver dúvidas.

- [x] 5. Implementar integração WhatsApp (`backend/whatsapp.js`)
  - [x] 5.1 Criar `backend/whatsapp.js` com `initWhatsApp(db)` que instancia `Client` com `LocalAuth`, registra handlers `on('qr')`, `on('ready')` e `on('disconnected')`
    - `on('qr')`: exibir QR no terminal via `qrcode-terminal` ou `console.log`
    - `on('ready')`: logar evento com timestamp
    - `on('disconnected')`: logar e chamar `client.initialize()` para reconectar
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
  - [x] 5.2 Implementar `handleMessage(msg, db)` que ignora `msg.fromMe === true` e `msg.from.endsWith('@g.us')`, extrai nome/telefone/conteúdo/timestamp, chama `upsertContato` e `hasBusinessKeyword`
    - Usar `msg._data.notifyName` ou telefone como fallback de nome
    - _Requirements: 2.1, 2.6, 3.1, 9.1, 9.2, 9.3_
  - [x] 5.3 Escrever testes de propriedade para `whatsapp.js` handler (usando mock de db)
    - **Property 1: Extração completa de dados da mensagem**
    - **Validates: Requirements 2.1**
    - **Property 14: Mensagens ignoradas não geram upsert**
    - **Validates: Requirements 9.1, 9.2, 9.3**

- [x] 6. Implementar rotas REST (`backend/routes/contatos.js`)
  - [x] 6.1 Criar `backend/routes/contatos.js` com router Express; implementar `GET /api/contatos` chamando `getContatos(req.query.status)` e respondendo JSON
    - _Requirements: 7.1, 7.2_
  - [x] 6.2 Implementar `PATCH /api/contatos/:id` com validação de status (400 se inválido), busca do contato (404 se não encontrado) e chamada a `updateContato`
    - _Requirements: 4.3, 7.3, 7.5, 7.6, 7.7_
  - [x] 6.3 Implementar `GET /api/status` que retorna `{ status: waStatus }` onde `waStatus` é gerenciado pelo módulo `whatsapp.js`
    - _Requirements: 7.4_
  - [x] 6.4 Escrever testes de propriedade para `routes/contatos.js` (usando supertest ou fetch com servidor de teste)
    - **Property 9: Filtragem por status na API**
    - **Validates: Requirements 5.3, 7.2**
    - **Property 12: Validação de status inválido retorna HTTP 400**
    - **Validates: Requirements 7.5, 7.7**
    - **Property 13: ID inexistente retorna HTTP 404**
    - **Validates: Requirements 7.6, 7.7**

- [x] 7. Implementar entry point (`backend/index.js`)
  - Criar `backend/index.js` que chama `initDb()`, `initWhatsApp(db)`, monta o router de contatos em `/api`, serve `frontend/` como estático via `express.static` e escuta na porta 3001
  - _Requirements: 1.1, 7.1, 7.3, 7.4_

- [x] 8. Checkpoint — Garantir que o backend sobe sem erros e a API responde
  - Garantir que todos os testes passam, perguntar ao usuário se houver dúvidas.

- [x] 9. Implementar frontend (`frontend/index.html` + `frontend/style.css`)
  - [x] 9.1 Criar `frontend/index.html` com estrutura: header com indicador de status WhatsApp, seção de dashboard (4 métricas + taxa de conversão), barra de filtros (Todos / Pendentes / Negócios / Não Negócios), área de listagem de cards e `<script src="app.js">`
    - _Requirements: 5.2, 6.1, 6.2, 6.3, 6.4, 6.5_
  - [x] 9.2 Criar `frontend/style.css` com estilos para: cards de contato, botões de classificação, indicador de keyword (destaque visual), filtros ativos, indicador de status de conexão e mensagem de lista vazia
    - _Requirements: 3.3, 5.4, 5.5_

- [x] 10. Implementar lógica da SPA (`frontend/app.js`)
  - [x] 10.1 Criar `frontend/app.js` com estado global (`contatos`, `filtroAtivo`, `statusWA`) e função `loadContatos()` que faz `GET /api/contatos` e chama `renderContatos()` e `renderDashboard()`
    - _Requirements: 5.1, 6.6_
  - [x] 10.2 Implementar `renderContatos()` que filtra `contatos` por `filtroAtivo` e gera HTML dos cards com nome, telefone, última mensagem, data, status, indicador de keyword e botões de ação; exibir mensagem informativa quando lista vazia
    - _Requirements: 3.3, 5.3, 5.4, 5.5_
  - [x] 10.3 Implementar `renderDashboard()` calculando total, pendentes, negócios, não-negócios e taxa de conversão (`negocios / (negocios + nao_negocios) * 100`, 1 casa decimal, 0 quando denominador zero)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
  - [x] 10.4 Implementar `setFiltro(status)`, `classificar(id, status)` (PATCH + atualização de estado local) e `salvarObservacao(id, obs)` (PATCH + atualização local); exibir erro visível ao usuário em caso de falha
    - _Requirements: 4.1, 4.2, 4.4, 4.5, 4.7, 5.2, 5.3_
  - [x] 10.5 Implementar `pollStatus()` com `setInterval` de 5s fazendo `GET /api/status` e atualizando o indicador de conexão no header
    - _Requirements: 7.4_
  - [x] 10.6 Escrever testes de propriedade para funções puras do frontend (`renderContatos`, `renderDashboard`)
    - **Property 10: Renderização completa do card de contato**
    - **Validates: Requirements 5.4**
    - **Property 11: Consistência das métricas do dashboard**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**

- [x] 11. Escrever testes unitários complementares (`backend/tests/unit.test.js`)
  - Testar inicialização do banco (schema criado corretamente) — Req 8.1, 8.3
  - Testar fallback de nome para telefone quando nome ausente — Req 2.6
  - Testar que lista vazia retorna array vazio de `getContatos` — Req 5.5
  - Testar que erro de banco não encerra o processo (mock de erro) — Req 8.5
  - _Requirements: 2.6, 5.5, 8.1, 8.3, 8.5_

- [x] 12. Checkpoint final — Garantir que todos os testes passam
  - Garantir que todos os testes passam, perguntar ao usuário se houver dúvidas.

## Notes

- Tasks marcadas com `*` são opcionais e podem ser puladas para um MVP mais rápido
- Cada task referencia os requisitos específicos para rastreabilidade
- O projeto roda na porta 3001, separado do projeto React/Supabase existente
- Testes de propriedade usam `fast-check` com mínimo de 100 iterações cada
- O banco SQLite é criado automaticamente em `database/crm.db` na primeira execução
