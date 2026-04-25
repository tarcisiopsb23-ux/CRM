# Plano de Implementação — Módulo de Recrutamento e Seleção

## Visão Geral

Implementação incremental do módulo de recrutamento, construindo da fundação de dados até a interface pública. As tarefas seguem a ordem: banco de dados → tipos e funções puras → hooks → componentes internos → dashboard → página pública → integração Drive → agente virtual.

## Tarefas

- [x] 1. Migration do banco de dados
  - Criar `migrations/026_recruitment_tables.sql` com as tabelas: `job_openings`, `job_form_questions`, `candidates`, `applications`
  - Aplicar RLS em todas as tabelas usando `organization_id` com a função `get_user_organization_id()` existente
  - Criar política permissiva de INSERT em `candidates` e `applications` para acesso anônimo (candidaturas públicas)
  - Criar índices em: `job_openings(organization_id, status)`, `applications(job_opening_id, score_total)`, `candidates(organization_id, email)`, `applications(candidate_id)`
  - _Requisitos: 1.1, 4.8, 9.1_

- [x] 2. Tipos TypeScript e funções puras de scoring
  - Criar `src/types/recruitment.ts` com interfaces: `JobOpening`, `JobFormQuestion`, `Candidate`, `Application`, `ApplicationAnswer`, `RecruitmentConfig`
  - Criar `src/lib/recruitmentScoring.ts` com funções puras: `scoreQuestion(question, answer)`, `calculateTotalScore(questions, answers)`, `calculateMaxScore(questions)`, `calculateScorePercent(score, maxScore)`
  - _Requisitos: 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 4.9_

- [x] 3. Hooks de dados
  - Criar `src/hooks/useJobOpenings.ts` com query de listagem (filtros: status, job_title, department) e mutations create/update
  - Criar `src/hooks/useCandidates.ts` com query de candidatos por vaga (ordenado por score_total desc), mutation de update de status e score_manual
  - Criar `src/hooks/useApplicationForm.ts` com query pública de perguntas por vaga e mutation de submissão de candidatura (sem auth)
  - Criar `src/hooks/useRecruitmentConfig.ts` usando `useIntegration('recruitment')` para ler/salvar configurações
  - _Requisitos: 1.6, 1.7, 6.1, 6.3, 6.5, 6.6, 10.1_

- [x] 4. Componentes internos — Vagas
  - Criar `src/components/recruitment/JobOpeningForm.tsx` — formulário de criar/editar vaga com todos os campos do Requisito 1.1
  - Criar `src/components/recruitment/JobOpeningList.tsx` — tabela de vagas com filtros, total de candidatos por vaga, badges de status
  - Criar `src/components/recruitment/ApplicationFormBuilder.tsx` — interface para adicionar/reordenar/remover perguntas de uma vaga, com preview da pontuação máxima
  - _Requisitos: 1.1, 1.2, 1.3, 1.4, 1.6, 1.7, 2.1, 2.2, 2.3, 2.9, 2.10_

- [x] 5. Componentes internos — Candidatos
  - Criar `src/components/recruitment/ScoreBadge.tsx` — badge com score percentual e cor (verde ≥ 70%, amarelo 40-69%, vermelho < 40%)
  - Criar `src/components/recruitment/CandidateStatusBadge.tsx` — badge colorido por status (azul: novo, amarelo: em_análise, verde: aprovado/contratado, vermelho: reprovado)
  - Criar `src/components/recruitment/CandidateList.tsx` — tabela de candidatos ordenada por score, com filtros de status e faixa de pontuação, link para currículo no Drive
  - Criar `src/components/recruitment/CandidateDetail.tsx` — painel lateral com dados pessoais, respostas detalhadas com score por pergunta, campo de score_manual para respostas texto, campo de notes
  - _Requisitos: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 8.5, 8.6_

- [x] 6. Dashboard interno
  - Criar `src/components/recruitment/RecruitmentDashboard.tsx` com:
    - Cards: vagas abertas, candidaturas (30 dias), em análise, aprovados aguardando contratação
    - Tabela resumo de vagas abertas com candidatos novos em destaque
    - Gráfico de barras de candidaturas por vaga (usando Recharts, já no projeto)
    - Top 5 candidatos por score
  - _Requisitos: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

- [x] 7. Página interna principal e roteamento
  - Criar `src/pages/recruitment/RecruitmentPage.tsx` com tabs: Dashboard, Vagas, e navegação para candidatos por vaga
  - Adicionar rota `/recruitment` ao `src/App.tsx` dentro do `ModuleGuard`
  - Atualizar `src/hooks/usePermissions.ts`: adicionar `{ id: "recruitment", label: "Recrutamento e Seleção" }` ao array `MODULES`, adicionar `"/recruitment": "recruitment"` ao `ROUTE_TO_MODULE`, e bloco `recruitment` ao `baselineFor()`
  - Adicionar link "Recrutamento" ao menu de navegação lateral existente
  - _Requisitos: 7.5, 9.1, 9.2, 9.3, 9.5_

- [x] 8. Checkpoint — Módulo interno funcional
  - Garantir que `/recruitment` renderiza dashboard, listagem de vagas e candidatos. Perguntar ao usuário se há ajustes antes de prosseguir para a parte pública.

- [ ] 9. PublicLayout e roteamento público
  - Criar `src/layouts/PublicLayout.tsx` com header (logo C8), área de conteúdo e rodapé — visual idêntico ao site `agenciac8.com.br` (fundo escuro `#0a0a0a`, texto branco, destaque laranja `#f97316`)
  - Criar `src/router/PublicVagasRouter.tsx` com rotas: `/` → `VagasPage`, `/:jobOpeningId` → `VagaDetailPage`
  - Atualizar `src/App.tsx` para detectar hostname `vagas.*` e renderizar `PublicVagasRouter` em vez do app interno
  - Atualizar `nginx.conf` adicionando server block para `vagas.agenciac8.com.br`
  - _Requisitos: 3.1, 3.6, 3.9_

- [ ] 10. Página pública de listagem de vagas
  - Criar `src/components/recruitment/PublicJobCard.tsx` — card de vaga com título, cargo, área, tipo de trabalho, faixa salarial e botão "Candidatar-se"
  - Criar `src/pages/VagasPage.tsx` com:
    - Seção hero: "Faça parte do time C8" com botão âncora para listagem
    - Listagem de vagas abertas agrupadas por departamento
    - Mensagem "Nenhuma vaga aberta no momento" quando lista vazia
    - Rodapé com logo, contato e copyright
  - _Requisitos: 3.2, 3.3, 3.4, 3.5, 3.7, 3.8_

- [ ] 11. Formulário público de candidatura
  - Criar `src/components/recruitment/ApplicationForm.tsx` com:
    - Seção de dados pessoais (nome, email, telefone, LinkedIn, portfólio, carta de apresentação)
    - Renderização dinâmica das perguntas da vaga por `question_type`
    - Indicador de progresso para formulários com mais de 5 perguntas
    - Upload de currículo (PDF/DOC/DOCX, máx 10MB) com validação de formato e tamanho
    - Validação de campos obrigatórios com erros inline
    - Verificação de duplicata por email + job_opening_id antes de submeter
    - Cálculo de score automático no momento da submissão via `recruitmentScoring.ts`
    - Tela de confirmação após submissão bem-sucedida
  - Criar `src/pages/VagaDetailPage.tsx` com descrição da vaga + `ApplicationForm`
  - _Requisitos: 4.1, 4.2, 4.3, 4.4, 4.7, 4.8, 4.9, 4.10, 4.11_

- [ ] 12. Integração com Google Drive para currículos
  - Na submissão do formulário, após salvar candidato e candidatura no Supabase, enviar o arquivo de currículo ao webhook n8n de Drive (`action: 'documents.upload'`, `folderId` da config de recrutamento)
  - Organizar em subpasta por vaga: criar subpasta `[Título da Vaga]` dentro da pasta raiz de currículos se não existir
  - Atualizar `resume_drive_url` do candidato com o link retornado pelo n8n
  - Tratar falha de upload como não-bloqueante (candidatura salva mesmo sem currículo no Drive)
  - _Requisitos: 4.4, 4.5, 4.6, 8.1, 8.2, 8.3, 8.4_

- [ ] 13. Configurações do módulo em SettingsPage
  - Criar seção "Recrutamento" em Configurações com campos: pasta do Drive (ID + URL), e-mail de notificação, toggle de notificação automática
  - Usar `useRecruitmentConfig` para ler/salvar em `organization_integrations`
  - Exibir aviso quando `drive_folder_id` não estiver configurado
  - _Requisitos: 10.1, 10.2, 10.3, 10.4_

- [ ] 14. Workflow n8n do Agente Virtual
  - Criar `docs/n8n_workflows/n8n_workflow_recruitment_agent.json` com:
    - Webhook de entrada para mensagens do WhatsApp/chat
    - Nó HTTP para buscar perguntas da vaga via Supabase REST API
    - Loop de perguntas com envio sequencial e coleta de respostas
    - Nó de upload de currículo via Google Drive (reutilizar credencial existente)
    - Nó HTTP para submeter candidatura ao Supabase
    - Verificação de duplicata antes de submeter
    - Mensagem de confirmação ao candidato
  - _Requisitos: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

- [ ] 15. Checkpoint final
  - Testar fluxo completo: criar vaga → configurar perguntas → candidatura via formulário público → upload de currículo → visualizar candidato com score no painel interno
  - Verificar que o subdomínio `vagas.agenciac8.com.br` renderiza corretamente sem o layout do app
  - Verificar que permissões do módulo `recruitment` funcionam corretamente
