# Documento de Requisitos — Módulo de Recrutamento e Seleção

## Introdução

O Módulo de Recrutamento é uma nova seção do Maestr.IA integrada ao módulo de Gestão de Pessoas, que permite à agência publicar vagas, receber candidaturas (via formulário público ou agente virtual), avaliar candidatos com pontuação automática baseada em perguntas configuráveis por cargo/vaga, e arquivar currículos no Google Drive com vinculação ao cadastro do candidato. O módulo expõe uma página pública em `vagas.agenciac8.com.br` com o visual da marca Agência C8, sem exigir autenticação do candidato.

---

## Glossário

- **Vaga**: Posição aberta para contratação, vinculada a um cargo (`job_title`) e com status (aberta, pausada, encerrada).
- **Cargo**: Título de função definido no `job_title_catalog` existente no sistema.
- **Candidato**: Pessoa que se candidatou a uma vaga, com dados pessoais, currículo e pontuação calculada.
- **Candidatura**: Registro de uma aplicação de um candidato a uma vaga específica, contendo respostas ao formulário e pontuação.
- **Formulário de Vaga**: Conjunto de perguntas configuradas para uma vaga específica, com tipo (texto, múltipla escolha, escala) e peso para pontuação.
- **Pontuação**: Score calculado automaticamente com base nas respostas do candidato ponderadas pelos pesos das perguntas.
- **Página Pública**: Interface em `vagas.agenciac8.com.br` acessível sem autenticação, com visual da marca Agência C8.
- **Agente Virtual**: Fluxo n8n que conduz a candidatura via WhatsApp ou chat, submetendo ao mesmo endpoint do formulário web.
- **Drive_Curriculo**: Pasta no Google Drive onde os currículos dos candidatos são arquivados automaticamente.
- **PublicLayout**: Layout React sem sidebar/auth, com header e rodapé no estilo do site `agenciac8.com.br`.

---

## Requisitos

### Requisito 1: Gestão de Vagas (Interno)

**User Story:** Como gestor de RH, quero criar e gerenciar vagas de emprego vinculadas a cargos existentes, para que eu possa controlar o processo seletivo de cada posição aberta.

#### Critérios de Aceitação

1. THE Recruitment_Module SHALL permitir criar vagas com os campos: `title` (título da vaga), `job_title` (cargo do catálogo), `department` (área/departamento), `description` (descrição completa), `requirements` (requisitos), `location` (presencial/remoto/híbrido), `salary_range` (faixa salarial, opcional), `status` (aberta/pausada/encerrada), `published_at`, `closes_at` (data de encerramento, opcional).
2. WHEN uma vaga for criada com `status = 'aberta'`, THE Recruitment_Module SHALL torná-la visível na página pública `vagas.agenciac8.com.br` imediatamente.
3. WHEN uma vaga tiver `status = 'pausada'` ou `'encerrada'`, THE Recruitment_Module SHALL ocultá-la da listagem pública, mantendo os dados internamente.
4. THE Recruitment_Module SHALL permitir editar todos os campos de uma vaga a qualquer momento, exceto `organization_id`.
5. WHEN uma vaga for encerrada, THE Recruitment_Module SHALL impedir novas candidaturas para ela, exibindo mensagem "Vaga encerrada" na página pública.
6. THE Recruitment_Module SHALL exibir o total de candidatos por vaga na listagem interna.
7. THE Recruitment_Module SHALL permitir filtrar vagas por `status`, `job_title` e `department` na listagem interna.
8. IF o usuário não tiver permissão `can_create` no módulo `recruitment`, THEN THE Recruitment_Module SHALL ocultar o botão de criação de vaga.

---

### Requisito 2: Formulário de Perguntas por Vaga

**User Story:** Como gestor de RH, quero configurar perguntas específicas para cada vaga com pesos de pontuação, para que os candidatos sejam avaliados de forma objetiva e comparável.

#### Critérios de Aceitação

1. THE Recruitment_Module SHALL permitir adicionar perguntas a uma vaga com os campos: `question_text` (enunciado), `question_type` (`text`, `single_choice`, `multiple_choice`, `scale_1_5`, `yes_no`), `options` (array de opções para `single_choice` e `multiple_choice`), `weight` (peso de 1 a 10 para pontuação), `correct_answer` (resposta esperada/ideal para cálculo de score), `is_required` (obrigatória ou não).
2. THE Recruitment_Module SHALL permitir reordenar as perguntas de uma vaga via drag-and-drop ou botões de mover.
3. THE Recruitment_Module SHALL suportar no mínimo 1 e no máximo 30 perguntas por vaga.
4. WHEN `question_type = 'scale_1_5'`, THE Recruitment_Module SHALL calcular a pontuação da resposta como `(resposta / 5) * weight * 10`, onde resposta é um inteiro de 1 a 5.
5. WHEN `question_type = 'yes_no'`, THE Recruitment_Module SHALL calcular a pontuação como `weight * 10` se a resposta corresponder a `correct_answer`, ou `0` caso contrário.
6. WHEN `question_type = 'single_choice'`, THE Recruitment_Module SHALL calcular a pontuação como `weight * 10` se a opção selecionada corresponder a `correct_answer`, ou `0` caso contrário.
7. WHEN `question_type = 'multiple_choice'`, THE Recruitment_Module SHALL calcular a pontuação como `(opções_corretas_marcadas / total_opções_corretas) * weight * 10`.
8. WHEN `question_type = 'text'`, THE Recruitment_Module SHALL atribuir pontuação `0` automaticamente (avaliação manual posterior pelo gestor).
9. THE Recruitment_Module SHALL exibir a pontuação máxima possível da vaga (soma de `weight * 10` de todas as perguntas não-texto) na tela de configuração do formulário.
10. IF uma vaga não tiver nenhuma pergunta configurada, THEN THE Recruitment_Module SHALL exibir aviso ao gestor, mas ainda permitir publicar a vaga.

---

### Requisito 3: Página Pública de Vagas (`vagas.agenciac8.com.br`)

**User Story:** Como candidato, quero acessar uma página com as vagas abertas da agência sem precisar criar conta, para que eu possa me candidatar de forma simples e direta.

#### Critérios de Aceitação

1. THE Public_Page SHALL ser acessível em `vagas.agenciac8.com.br` sem autenticação, usando o `PublicLayout` com visual da marca Agência C8 (fundo escuro, logo branca, paleta de cores do site principal).
2. THE Public_Page SHALL exibir uma seção hero com título "Faça parte do time C8", subtítulo motivacional e botão de âncora para a listagem de vagas.
3. THE Public_Page SHALL listar todas as vagas com `status = 'aberta'` da organização, agrupadas por `department` ou `job_title`.
4. EACH vaga na listagem pública SHALL exibir: título, cargo, área/departamento, tipo de trabalho (presencial/remoto/híbrido), faixa salarial (se configurada), e botão "Candidatar-se".
5. WHEN o candidato clicar em "Candidatar-se", THE Public_Page SHALL navegar para a página de detalhe da vaga com o formulário de candidatura.
6. THE Public_Page SHALL ser responsiva (mobile-first), funcionando corretamente em dispositivos móveis.
7. THE Public_Page SHALL exibir mensagem "Nenhuma vaga aberta no momento" quando não houver vagas com `status = 'aberta'`.
8. THE Public_Page SHALL incluir rodapé com logo, contato e copyright idênticos ao site `agenciac8.com.br`.
9. THE Public_Page SHALL ser detectada pelo hostname `vagas.agenciac8.com.br` no `App.tsx` e renderizar o `PublicVagasRouter` sem o layout do app interno.

---

### Requisito 4: Formulário Público de Candidatura

**User Story:** Como candidato, quero preencher um formulário de candidatura com minhas informações e responder às perguntas da vaga, para que minha candidatura seja registrada e avaliada pela equipe.

#### Critérios de Aceitação

1. THE Application_Form SHALL coletar os dados pessoais do candidato: `full_name` (obrigatório), `email` (obrigatório, validado), `phone` (obrigatório), `linkedin_url` (opcional), `portfolio_url` (opcional), `cover_letter` (carta de apresentação, opcional).
2. THE Application_Form SHALL exibir todas as perguntas configuradas para a vaga, na ordem definida pelo gestor, com os tipos de input correspondentes ao `question_type`.
3. WHEN `is_required = true` para uma pergunta, THE Application_Form SHALL bloquear a submissão se a pergunta não for respondida, exibindo mensagem de erro inline.
4. THE Application_Form SHALL permitir o upload de currículo nos formatos PDF, DOC e DOCX, com tamanho máximo de 10MB.
5. WHEN o candidato submeter o formulário com currículo, THE Application_Form SHALL enviar o arquivo para o n8n via webhook, que fará o upload no Google Drive e retornará o link.
6. WHEN o upload do currículo for concluído com sucesso, THE Application_Form SHALL salvar o `drive_url` do currículo no cadastro do candidato.
7. WHEN o formulário for submetido com sucesso, THE Application_Form SHALL exibir uma tela de confirmação com mensagem de agradecimento e próximos passos.
8. THE Application_Form SHALL impedir dupla submissão: se o mesmo `email` já tiver candidatura ativa para a mesma vaga, exibir mensagem "Você já se candidatou a esta vaga" sem criar duplicata.
9. WHEN o formulário for submetido, THE Application_Form SHALL calcular automaticamente a pontuação do candidato com base nas respostas e nos pesos das perguntas.
10. THE Application_Form SHALL funcionar sem autenticação — o candidato não precisa ter conta no sistema.
11. THE Application_Form SHALL exibir indicador de progresso (ex: "Passo 2 de 3") quando o formulário tiver mais de 5 perguntas.

---

### Requisito 5: Candidatura via Agente Virtual (n8n)

**User Story:** Como candidato, quero me candidatar a uma vaga através do WhatsApp ou chat, respondendo às perguntas guiadas pelo agente virtual, para que eu possa candidatar-me de forma conversacional sem acessar o site.

#### Critérios de Aceitação

1. THE Virtual_Agent SHALL ser implementado como workflow n8n que recebe mensagens via webhook e conduz o candidato pelas perguntas da vaga em sequência.
2. THE Virtual_Agent SHALL buscar as perguntas da vaga via webhook `GET /webhook/recruitment?action=get_form&job_opening_id=X` antes de iniciar a conversa.
3. WHEN o candidato responder todas as perguntas, THE Virtual_Agent SHALL submeter os dados ao mesmo endpoint do formulário web (`POST /webhook/recruitment`) com `source = 'agent'`.
4. THE Virtual_Agent SHALL solicitar o envio do currículo como arquivo no WhatsApp e fazer o upload no Google Drive via webhook de Drive existente.
5. THE Virtual_Agent SHALL confirmar a candidatura ao candidato com mensagem de agradecimento após submissão bem-sucedida.
6. IF o candidato já tiver candidatura ativa para a vaga, THE Virtual_Agent SHALL informar e encerrar o fluxo sem criar duplicata.

---

### Requisito 6: Avaliação e Pontuação de Candidatos (Interno)

**User Story:** Como gestor de RH, quero visualizar os candidatos de uma vaga ordenados por pontuação, com acesso às respostas e currículo, para que eu possa tomar decisões de seleção baseadas em dados.

#### Critérios de Aceitação

1. THE Recruitment_Module SHALL exibir a lista de candidatos de cada vaga ordenada por `score` decrescente por padrão.
2. EACH candidato na listagem SHALL exibir: nome, email, data de candidatura, pontuação (score numérico e percentual do máximo), status da candidatura, e link para o currículo no Drive (quando disponível).
3. THE Recruitment_Module SHALL permitir filtrar candidatos por `status` (novo, em_análise, aprovado, reprovado, contratado) e por faixa de pontuação.
4. WHEN o gestor clicar em um candidato, THE Recruitment_Module SHALL exibir um painel lateral ou modal com: dados pessoais completos, todas as respostas ao formulário com as perguntas correspondentes, pontuação detalhada por pergunta, e link para o currículo.
5. THE Recruitment_Module SHALL permitir ao gestor alterar o `status` da candidatura (novo → em_análise → aprovado/reprovado → contratado).
6. THE Recruitment_Module SHALL permitir ao gestor adicionar uma `score_manual` (nota manual de 0 a 100) e `notes` (observações) a cada candidatura, que são somadas/consideradas na avaliação final.
7. WHEN `question_type = 'text'`, THE Recruitment_Module SHALL exibir a resposta do candidato com um campo para o gestor atribuir pontuação manual (0 a `weight * 10`).
8. THE Recruitment_Module SHALL recalcular o `score_total` sempre que uma pontuação manual for atribuída.
9. THE Recruitment_Module SHALL exibir badge de status colorido para cada candidatura: azul (novo), amarelo (em_análise), verde (aprovado/contratado), vermelho (reprovado).

---

### Requisito 7: Dashboard do Módulo de Recrutamento

**User Story:** Como gestor de RH, quero visualizar um dashboard com indicadores do processo seletivo, para que eu tenha visão geral do funil de recrutamento sem precisar acessar cada vaga individualmente.

#### Critérios de Aceitação

1. THE Recruitment_Dashboard SHALL exibir cards indicativos com: total de vagas abertas, total de candidaturas recebidas (últimos 30 dias), candidatos em análise, candidatos aprovados aguardando contratação.
2. THE Recruitment_Dashboard SHALL exibir uma tabela resumo das vagas abertas com: título, cargo, total de candidatos, candidatos novos (não visualizados), pontuação média dos candidatos, e data de encerramento (se configurada).
3. THE Recruitment_Dashboard SHALL exibir um gráfico de barras com o volume de candidaturas por vaga.
4. THE Recruitment_Dashboard SHALL exibir os 5 candidatos com maior pontuação (top candidatos) em destaque, com nome, vaga e score.
5. THE Recruitment_Dashboard SHALL ser a tela inicial do módulo, acessível pela rota `/recruitment`.
6. THE Recruitment_Dashboard SHALL atualizar os dados automaticamente ao navegar para a aba, sem necessidade de refresh manual.

---

### Requisito 8: Arquivamento de Currículo no Google Drive

**User Story:** Como sistema, quero arquivar automaticamente o currículo de cada candidato no Google Drive e vincular o link ao cadastro, para que os gestores possam acessar os currículos diretamente pelo sistema.

#### Critérios de Aceitação

1. WHEN um candidato submeter o formulário com currículo, THE Recruitment_Module SHALL enviar o arquivo ao workflow n8n de Drive via webhook com `action = 'documents.upload'`, `folderId` da pasta de currículos configurada, e o arquivo binário.
2. WHEN o upload for concluído com sucesso, THE Recruitment_Module SHALL salvar o `drive_url` retornado pelo n8n no campo `resume_drive_url` do candidato na tabela `candidates`.
3. THE Recruitment_Module SHALL organizar os currículos em subpastas por vaga no Google Drive: `Currículos / [Título da Vaga] / [Nome do Candidato].pdf`.
4. IF o upload do currículo falhar, THE Recruitment_Module SHALL registrar o erro mas não bloquear a submissão da candidatura — o candidato é cadastrado sem o link do currículo.
5. THE Recruitment_Module SHALL exibir um ícone de link para o currículo no Drive na listagem de candidatos, quando `resume_drive_url` estiver preenchido.
6. THE Recruitment_Module SHALL permitir ao gestor fazer upload manual de currículo para um candidato existente, atualizando o `resume_drive_url`.

---

### Requisito 9: Controle de Acesso ao Módulo de Recrutamento

**User Story:** Como administrador, quero controlar quais usuários têm acesso ao módulo de recrutamento e quais ações podem executar, para que dados de candidatos sejam protegidos por permissões adequadas.

#### Critérios de Aceitação

1. THE Recruitment_Module SHALL registrar `recruitment` como módulo de permissão independente no RBAC existente.
2. THE Recruitment_Module SHALL aplicar as seguintes permissões padrão por role: `owner` e `admin` têm acesso total; `manager` tem `can_view = true`, `can_create = true`, `can_edit = true`, `can_delete = false`; `member` e `viewer` têm todos os campos `false` por padrão.
3. WHEN um usuário acessar `/recruitment` sem permissão `can_view`, THE Recruitment_Module SHALL exibir a tela de "Acesso negado" padrão do `ModuleGuard`.
4. THE Public_Page em `vagas.agenciac8.com.br` SHALL ser acessível sem autenticação, independentemente das permissões do módulo.
5. THE Recruitment_Module SHALL adicionar `recruitment` à lista de módulos em Configurações → Cargos e Permissões com label "Recrutamento e Seleção".

---

### Requisito 10: Configurações do Módulo de Recrutamento

**User Story:** Como administrador, quero configurar a pasta do Google Drive para currículos e outras opções do módulo, para que o arquivamento automático funcione corretamente.

#### Critérios de Aceitação

1. THE Recruitment_Module SHALL armazenar suas configurações em `organization_integrations` com `integration_type = 'recruitment'`, incluindo: `drive_folder_id` (ID da pasta raiz de currículos no Drive), `drive_folder_url` (URL da pasta), `notification_email` (e-mail para notificação de nova candidatura, opcional), `auto_notify` (booleano — enviar e-mail ao receber candidatura).
2. WHEN `auto_notify = true` e uma nova candidatura for recebida, THE Recruitment_Module SHALL disparar webhook n8n de notificação com os dados do candidato e da vaga.
3. THE Recruitment_Module SHALL exibir a seção de configurações em Configurações → Recrutamento, acessível apenas para `owner` e `admin`.
4. IF `drive_folder_id` não estiver configurado, THE Recruitment_Module SHALL exibir aviso na tela de candidatos orientando o administrador a configurar a pasta do Drive, mas ainda permitir receber candidaturas sem currículo no Drive.
