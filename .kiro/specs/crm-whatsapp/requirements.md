# Requirements Document

## Introduction

Mini CRM focado em captura e classificação de contatos via WhatsApp Web. O sistema monitora mensagens recebidas, extrai automaticamente os dados dos remetentes e permite que o usuário classifique cada contato como Negócio, Não é Negócio ou Pendente. O objetivo é servir como filtro rápido de intenção de compra, com interface simples e ações em no máximo 3 cliques.

## Glossary

- **Sistema**: A aplicação CRM como um todo (backend + frontend)
- **Backend**: Servidor Node.js responsável pela integração com WhatsApp e persistência de dados
- **Frontend**: Interface web para visualização e classificação de contatos
- **Contato**: Registro de um remetente do WhatsApp com nome, telefone, última mensagem e status de classificação
- **Status**: Classificação manual de um contato — "pendente", "negocio" ou "nao_negocio"
- **Sessão**: Autenticação persistida do WhatsApp Web via LocalAuth
- **Captura**: Processo de extração e armazenamento de dados de um remetente ao receber uma mensagem
- **Palavra-chave de negócio**: Termos que indicam intenção de compra: "preço", "valor", "orçamento", "quanto custa"
- **Dashboard**: Painel com métricas agregadas dos contatos
- **QR Code**: Código de autenticação exibido para vincular a conta do WhatsApp ao sistema

---

## Requirements

### Requirement 1: Autenticação via QR Code

**User Story:** Como usuário, quero autenticar minha conta do WhatsApp via QR Code, para que o sistema possa monitorar minhas mensagens sem precisar de login manual a cada reinicialização.

#### Acceptance Criteria

1. WHEN o Backend é iniciado, THE Backend SHALL exibir um QR Code no terminal para autenticação do WhatsApp Web
2. WHEN o usuário escaneia o QR Code com o WhatsApp, THE Backend SHALL estabelecer a conexão e persistir a sessão localmente via LocalAuth
3. WHILE a sessão está ativa, THE Backend SHALL manter a conexão sem exigir novo QR Code
4. IF a sessão expirar ou for invalidada, THEN THE Backend SHALL gerar um novo QR Code automaticamente
5. WHEN a conexão é estabelecida com sucesso, THE Backend SHALL registrar o evento no console com timestamp

---

### Requirement 2: Captura Automática de Contatos

**User Story:** Como usuário, quero que o sistema capture automaticamente os dados de quem me envia mensagens no WhatsApp, para que eu não precise cadastrar contatos manualmente.

#### Acceptance Criteria

1. WHEN uma mensagem é recebida no WhatsApp, THE Backend SHALL extrair o nome, telefone, conteúdo da mensagem e data/hora do evento
2. WHEN um contato ainda não existe no banco de dados, THE Backend SHALL criar um novo registro com status "pendente"
3. WHEN uma mensagem é recebida de um contato já existente, THE Backend SHALL atualizar os campos `ultima_mensagem` e `data_ultima_interacao` sem criar duplicata
4. THE Backend SHALL garantir unicidade de contatos pelo campo `telefone`
5. THE Backend SHALL definir o campo `origem` como "whatsapp" para todos os contatos capturados automaticamente
6. IF o nome do contato não estiver disponível no evento, THEN THE Backend SHALL usar o número de telefone como valor do campo `nome`

---

### Requirement 3: Detecção de Palavras-chave de Negócio

**User Story:** Como usuário, quero que o sistema destaque visualmente contatos que enviaram mensagens com intenção de compra, para que eu possa priorizar minha atenção.

#### Acceptance Criteria

1. WHEN uma mensagem recebida contém ao menos uma das palavras-chave ("preço", "valor", "orçamento", "quanto custa"), THE Backend SHALL marcar o contato com um indicador de potencial negócio
2. THE Backend SHALL realizar a verificação de palavras-chave de forma case-insensitive
3. WHEN o Frontend exibe um contato marcado com indicador de potencial negócio, THE Frontend SHALL aplicar destaque visual diferenciado na listagem
4. WHEN o contato já possui status "negocio" ou "nao_negocio", THE Backend SHALL preservar o status existente mesmo que a mensagem contenha palavras-chave

---

### Requirement 4: Classificação Manual de Contatos

**User Story:** Como usuário, quero classificar cada contato como Negócio, Não é Negócio ou Pendente, para que eu possa organizar meus leads de forma rápida.

#### Acceptance Criteria

1. WHEN o usuário clica no botão "Negócio" de um contato, THE Frontend SHALL enviar uma requisição ao Backend para atualizar o status do contato para "negocio"
2. WHEN o usuário clica no botão "Não é" de um contato, THE Frontend SHALL enviar uma requisição ao Backend para atualizar o status do contato para "nao_negocio"
3. WHEN o Backend recebe uma requisição de atualização de status válida, THE Backend SHALL persistir o novo status no banco de dados e retornar confirmação
4. WHEN a classificação é confirmada pelo Backend, THE Frontend SHALL atualizar o estado visual do contato sem recarregar a página
5. THE Frontend SHALL permitir que o usuário adicione ou edite uma observação textual em um contato em no máximo 3 interações
6. WHEN o usuário salva uma observação, THE Backend SHALL persistir o texto no campo `observacao` do contato correspondente
7. IF o Backend retornar erro na atualização, THEN THE Frontend SHALL exibir uma mensagem de erro visível ao usuário

---

### Requirement 5: Listagem e Filtros de Contatos

**User Story:** Como usuário, quero visualizar todos os contatos com filtros por status, para que eu possa focar nos leads mais relevantes.

#### Acceptance Criteria

1. WHEN o Frontend é carregado, THE Frontend SHALL buscar e exibir todos os contatos ordenados por `data_ultima_interacao` decrescente
2. THE Frontend SHALL disponibilizar filtros para as categorias: Todos, Pendentes, Negócios e Não Negócios
3. WHEN o usuário seleciona um filtro, THE Frontend SHALL exibir apenas os contatos correspondentes ao status selecionado sem recarregar a página
4. THE Frontend SHALL exibir para cada contato: nome, telefone, última mensagem, data da última interação, status atual e indicador de palavra-chave quando aplicável
5. WHEN não há contatos para o filtro selecionado, THE Frontend SHALL exibir uma mensagem informativa ao usuário

---

### Requirement 6: Dashboard de Métricas

**User Story:** Como usuário, quero visualizar um resumo das métricas dos meus contatos, para que eu possa acompanhar minha taxa de conversão de forma rápida.

#### Acceptance Criteria

1. THE Frontend SHALL exibir o total de contatos cadastrados
2. THE Frontend SHALL exibir a quantidade de contatos com status "negocio"
3. THE Frontend SHALL exibir a quantidade de contatos com status "nao_negocio"
4. THE Frontend SHALL exibir a quantidade de contatos com status "pendente"
5. THE Frontend SHALL calcular e exibir a taxa de conversão como a razão entre contatos com status "negocio" e o total de contatos classificados (negocio + nao_negocio), expressa em percentual com uma casa decimal
6. WHEN novos contatos são capturados ou classificados, THE Frontend SHALL atualizar as métricas do Dashboard sem recarregar a página

---

### Requirement 7: API REST do Backend

**User Story:** Como desenvolvedor, quero uma API REST clara e consistente, para que o Frontend possa consumir os dados dos contatos de forma previsível.

#### Acceptance Criteria

1. THE Backend SHALL expor o endpoint `GET /api/contatos` retornando a lista completa de contatos em formato JSON
2. THE Backend SHALL expor o endpoint `GET /api/contatos?status={status}` retornando contatos filtrados pelo status informado
3. THE Backend SHALL expor o endpoint `PATCH /api/contatos/:id` aceitando os campos `status` e `observacao` para atualização parcial
4. THE Backend SHALL expor o endpoint `GET /api/status` retornando o estado atual da conexão com o WhatsApp (conectado, aguardando QR, desconectado)
5. IF uma requisição for feita com `status` inválido (diferente de "pendente", "negocio", "nao_negocio"), THEN THE Backend SHALL retornar HTTP 400 com mensagem descritiva
6. IF um contato com o `id` informado não existir, THEN THE Backend SHALL retornar HTTP 404 com mensagem descritiva
7. THE Backend SHALL responder todas as requisições com o header `Content-Type: application/json`

---

### Requirement 8: Persistência de Dados com SQLite

**User Story:** Como usuário, quero que os dados dos contatos sejam persistidos localmente, para que eu não perca informações ao reiniciar o sistema.

#### Acceptance Criteria

1. THE Backend SHALL criar automaticamente o banco de dados SQLite e a tabela `contatos` na primeira execução, caso não existam
2. THE Backend SHALL garantir que o campo `telefone` seja único na tabela `contatos`
3. THE Backend SHALL armazenar os campos: `id` (PK autoincrement), `nome`, `telefone`, `origem`, `ultima_mensagem`, `data_ultima_interacao`, `status`, `observacao`, `valor_potencial`
4. THE Backend SHALL definir o valor padrão do campo `status` como "pendente" para novos registros
5. IF ocorrer erro de escrita no banco de dados, THEN THE Backend SHALL registrar o erro no console sem encerrar o processo

---

### Requirement 9: Restrições de Operação

**User Story:** Como usuário, quero garantir que o sistema opere apenas em modo leitura no WhatsApp, para que minha conta não envie mensagens indesejadas.

#### Acceptance Criteria

1. THE Backend SHALL processar apenas eventos de mensagens recebidas (`on('message')`) e nunca enviar mensagens pelo WhatsApp
2. THE Backend SHALL ignorar mensagens enviadas pelo próprio usuário autenticado
3. THE Backend SHALL ignorar mensagens de grupos do WhatsApp, processando apenas mensagens diretas (chats individuais)
