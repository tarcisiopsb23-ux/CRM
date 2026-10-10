# Requirements Document

## Introduction

Esta feature implementa o redesign completo do sistema de contratos do CRM. O sistema atual conta com um formulário básico de contrato no módulo de clientes e uma tabela `contract_templates` com conteúdo livre em texto. O novo sistema é composto por três blocos integrados:

- **Bloco 1 — Configurações de Contratos**: catálogo de serviços, biblioteca de cláusulas e editor de templates
- **Bloco 2 — Formulário de Contrato**: novo formulário no módulo de clientes com serviços, setup e lançamentos financeiros unificados
- **Bloco 3 — Geração de Documentos**: montagem automática, modal de revisão e exportação em PDF

A feature é multi-tenant (cada organização possui seus próprios dados isolados por `organization_id`) e se integra à infraestrutura existente de webhooks/n8n para geração de PDF.

---

## Glossary

- **Sistema**: o CRM sendo desenvolvido em React/TypeScript com Supabase
- **Catálogo_de_Servicos**: repositório de serviços e produtos disponíveis para inclusão em contratos, gerenciado por organização
- **Servico**: item do Catálogo_de_Servicos com nome (≤ 150 chars), categoria (≤ 100 chars) e sub-serviços configuráveis
- **Sub_Servico**: campo configurável vinculado a um Serviço, com nome e tipo definido (`number`, `text`, `boolean` ou `select`)
- **Biblioteca_de_Clausulas**: conjunto de cláusulas ordenadas e configuradas para uso nos contratos de uma organização
- **Clausula**: unidade textual do contrato com título, conteúdo em rich text, condição de exibição e flag de editabilidade
- **Variavel**: marcador de substituição inserido no conteúdo de uma cláusula (ex: `{{cliente}}`, `{{valor}}`)
- **Template**: estrutura base de um documento de contrato que define cabeçalho, bloco de partes, local de injeção de cláusulas e bloco de assinaturas
- **Contrato**: registro que une um cliente a serviços contratados, condições financeiras e o documento gerado
- **Setup**: taxa única de implantação opcionalmente parcelada, distinta da mensalidade recorrente
- **Prazo_Minimo**: número mínimo de meses de permanência do cliente no contrato (`min_duration_months`)
- **Lancamento_Financeiro**: registro de cobrança mensal gerado automaticamente a partir do contrato, com valor unificado (setup + mensalidade quando aplicável)
- **Modal_de_Revisao**: interface de pré-visualização do contrato montado antes da geração final do PDF
- **PDF_Gerado**: documento final do contrato produzido via webhook/n8n
- **Editor_de_Clausulas**: componente de rich text para criação e edição de cláusulas com suporte a variáveis via drag and drop
- **Snapshot**: cópia imutável do conteúdo do contrato gerado, preservada em `metadata.clause_edits` e no registro `generated_at`
- **Gestor**: usuário com papel `owner` ou `admin` na organização
- **Consultor**: usuário com papel `closer` ou similar responsável pela criação de contratos

---

## Requirements

---

### Requisito 1 — Catálogo de Serviços

**User Story:** Como Gestor, quero cadastrar serviços e produtos com sub-serviços configuráveis, para que os consultores possam selecionar serviços tipados ao criar contratos e o escopo seja descrito de forma padronizada nos documentos.

#### Critérios de Aceitação

1. THE Catálogo_de_Servicos SHALL armazenar cada serviço com os campos: nome (texto obrigatório, máximo 150 caracteres, único por organização), categoria (texto obrigatório, máximo 100 caracteres) e lista de sub-serviços (pode ser vazia).

2. WHEN o Gestor submete um novo serviço com nome e categoria preenchidos dentro dos limites, THE Sistema SHALL persistir o serviço na tabela `service_catalog` associado ao `organization_id` do Gestor.

3. IF o Gestor submete um serviço com nome vazio, categoria vazia, nome duplicado dentro da organização, ou nome/categoria excedendo o limite de caracteres, THEN THE Sistema SHALL rejeitar a operação e exibir mensagem de erro específica indicando a causa (campo vazio, duplicata ou limite excedido).

4. THE Sistema SHALL suportar exatamente quatro tipos para sub-serviços: `number` (número), `text` (texto livre), `boolean` (sim/não) e `select` (lista de opções predefinidas com no máximo 50 opções).

5. WHEN o Gestor adiciona um sub-serviço do tipo `select`, THE Sistema SHALL exigir ao menos uma opção na lista de valores possíveis antes de permitir salvar.

6. WHEN o Gestor exclui um serviço que está referenciado em ao menos um contrato com status `ativo`, THE Sistema SHALL bloquear a exclusão e exibir mensagem informando a quantidade e os títulos dos contratos afetados.

7. WHEN o Gestor salva uma nova ordem para os serviços de uma categoria, THE Sistema SHALL persistir a nova ordenação de forma que a listagem subsequente reflita a ordem definida.

8. WHEN o Gestor acessa o Catálogo_de_Servicos, THE Sistema SHALL exibir a lista de serviços agrupada por categoria, em ordem conforme definida pelo Gestor (ou alfabética se nenhuma ordem foi definida).

9. WHEN o Gestor atualiza o nome ou a categoria de um serviço existente, THE Sistema SHALL refletir a atualização na listagem de serviços disponíveis para novos contratos, sem alterar o conteúdo de nenhum Snapshot (documento PDF já gerado) que referencie esse serviço.

#### Propriedades de Corretude

- **Invariante de identificador**: para todo serviço persistido, o `id` gerado pelo Supabase é único globalmente — `∀ s1, s2 ∈ service_catalog: s1.id ≠ s2.id`
- **Invariante de unicidade de nome por organização**: `∀ s1, s2 ∈ service_catalog: (s1.organization_id = s2.organization_id ∧ s1.name = s2.name) → s1.id = s2.id`
- **Invariante de tenant**: para todo serviço retornado por uma query autenticada, `service.organization_id = get_user_organization_id()` — nenhuma query retorna serviços de outra organização
- **Round-trip de sub-serviços (JSONB)**: dado um conjunto arbitrário de sub-serviços com tipos e valores válidos, serializar em JSONB e desserializar deve produzir estrutura equivalente — `desserializar(serializar(sub_servicos)) ≡ sub_servicos`
- **Propriedade metamórfica de filtro**: `|filtrar(servicos, categoria)| ≤ |servicos|` — filtrar por categoria nunca aumenta o conjunto de resultados
- **Propriedade de tipos válidos**: para todo sub-serviço persistido, o campo `type` pertence ao conjunto `{number, text, boolean, select}` — nenhum tipo inválido pode ser salvo

---

### Requisito 2 — Biblioteca de Cláusulas

**User Story:** Como Gestor, quero criar e organizar cláusulas com condições de exibição e variáveis dinâmicas, para que o Sistema componha automaticamente o contrato correto conforme os serviços e condições de cada cliente.

#### Critérios de Aceitação

1. THE Biblioteca_de_Clausulas SHALL armazenar cada cláusula com os campos: título (obrigatório), conteúdo em rich text (obrigatório), ordem de exibição `display_order` (inteiro ≥ 0), tipo de condição (`always`, `has_setup`, `has_min_duration`, `has_service`, `has_setup_installments`), valor da condição (nullable), flag `is_editable` (booleano, padrão `false`) e `service_id` (nullable, referência ao Catálogo_de_Servicos).

2. WHEN o Gestor cria uma cláusula com `condition_type = 'has_service'` e não informa `service_id`, THEN THE Sistema SHALL rejeitar a operação e exibir mensagem de erro indicando que o serviço vinculado é obrigatório para esse tipo de condição.

3. WHEN o Gestor salva uma nova sequência de ordem para as cláusulas, THE Sistema SHALL atualizar o campo `display_order` de todas as cláusulas afetadas de forma que a persistência seja consistente (nenhuma ordem parcialmente aplicada é visível para outros usuários).

4. THE Sistema SHALL garantir que os valores de `display_order` dentro de uma organização formem uma sequência sem lacunas `{0, 1, ..., n-1}` após qualquer operação de criação, exclusão ou reordenação.

5. WHEN uma cláusula tem `service_id` preenchido e o serviço correspondente está incluído no contrato sendo montado, THE Sistema SHALL injetar essa cláusula automaticamente no documento, respeitando a posição de `display_order`.

6. WHEN uma cláusula tem `condition_type = 'has_setup'` e o contrato não possui setup ativado, THE Sistema SHALL omitir essa cláusula do documento gerado.

7. WHEN uma cláusula tem `condition_type = 'has_min_duration'` e o contrato tem `min_duration_months > 0`, THE Sistema SHALL incluir essa cláusula no documento gerado.

8. WHEN uma cláusula tem `condition_type = 'has_setup_installments'` e o setup do contrato tem `setup_installments > 1`, THE Sistema SHALL incluir essa cláusula no documento gerado.

9. THE Sistema SHALL atribuir numeração sequencial automática (Cláusula 1ª, 2ª, ...) às cláusulas no momento da montagem do documento, com base na ordem de `display_order` e nas condições de exibição avaliadas — a numeração não é armazenada na configuração.

10. IF o Gestor exclui uma cláusula que está referenciada em um Snapshot de um contrato já gerado, THEN THE Sistema SHALL preservar o conteúdo do Snapshot existente sem alteração, excluindo apenas a cláusula da Biblioteca_de_Clausulas.

#### Propriedades de Corretude

- **Invariante de ordem sem lacunas**: após qualquer operação de reordenação, os valores de `display_order` das cláusulas de uma organização formam exatamente `{0, 1, 2, ..., n-1}` — sem repetições e sem lacunas
- **Idempotência de reordenação**: aplicar a mesma sequência de `display_order` duas vezes produz o mesmo estado — `reordenar(reordenar(clausulas, ordem), ordem) ≡ reordenar(clausulas, ordem)`
- **Propriedade de filtragem correta**: dado um contrato com conjunto de condições `C`, o conjunto de cláusulas injetadas `I` satisfaz `∀ c ∈ I: avaliar_condicao(c, C) = true` e `∀ c ∉ I: avaliar_condicao(c, C) = false`
- **Invariante de numeração sequencial no documento**: as cláusulas numeradas no documento formam exatamente `{1ª, 2ª, ..., n-ésima}` onde `n = |I|` — sem saltos e sem repetições
- **Propriedade metamórfica de adição de serviço**: incluir um serviço adicional `S` em um contrato nunca reduz o número de cláusulas do documento — `|clausulas(contrato ∪ {S})| ≥ |clausulas(contrato)|`

---

### Requisito 3 — Editor de Cláusulas com Variáveis

**User Story:** Como Gestor, quero editar o conteúdo das cláusulas em rich text com inserção de variáveis via drag and drop, para que os documentos gerados sejam preenchidos automaticamente com os dados do cliente e do contrato, sem exigir conhecimento de HTML.

#### Critérios de Aceitação

1. THE Editor_de_Clausulas SHALL renderizar o conteúdo em rich text sem expor marcação HTML ao usuário, suportando as formatações: negrito, itálico, sublinhado, listas ordenadas e listas não-ordenadas.

2. THE Editor_de_Clausulas SHALL disponibilizar um painel lateral com as seguintes variáveis fixas para inserção por drag and drop: `{{cliente}}`, `{{empresa}}`, `{{cnpj}}`, `{{cpf}}`, `{{valor}}`, `{{servicos}}`, `{{vencimento}}`, `{{primeiro_pagamento}}`, `{{data}}`, `{{consultor}}`, `{{escopo}}`, `{{cronograma}}`, `{{prazo_minimo}}`.

3. WHEN o contexto de edição contém serviços com sub-serviços configurados, THE Editor_de_Clausulas SHALL exibir variáveis dinâmicas adicionais no painel, derivadas do nome do serviço normalizado pela regra: converter para minúsculas, remover acentos, substituir caracteres não alfanuméricos por `_`, colapsar múltiplos `_` consecutivos, remover `_` inicial e final, truncar a 50 caracteres — ex: "Captação de Vídeo" → `{{escopo_captacao_de_video}}`.

4. WHEN o Gestor arrasta uma variável do painel para o corpo do texto, THE Editor_de_Clausulas SHALL inserir o marcador na posição atual do cursor; se não houver cursor ativo, SHALL inserir ao final do conteúdo.

5. WHEN o Sistema substitui variáveis durante a montagem do contrato, THE Sistema SHALL substituir cada marcador `{{nome_variavel}}` pelo valor correspondente do contrato ou do cliente, de forma que nenhum marcador permaneça visível no documento final.

6. IF uma variável referenciada no conteúdo da cláusula não possui valor disponível no contrato ou no cliente no momento da montagem, THEN THE Sistema SHALL substituir o marcador por uma string vazia e registrar o nome da variável não resolvida em `metadata.unresolved_variables` do contrato.

7. THE Editor_de_Clausulas SHALL persistir o conteúdo da cláusula no formato interno do editor (JSON estruturado, não HTML puro) e converter para HTML somente no momento da renderização no Modal_de_Revisao e na geração do PDF_Gerado.

#### Propriedades de Corretude

- **Round-trip de serialização**: dado conteúdo rich text arbitrário (sem variáveis), serializar para JSON interno e desserializar para renderização deve produzir conteúdo visualmente equivalente — `renderizar(desserializar(serializar(conteudo))) ≡ renderizar(conteudo)`
- **Propriedade de substituição total**: após a montagem, o texto visível do documento não contém nenhuma ocorrência do padrão `\{\{[a-z_]{1,50}\}\}`
- **Determinismo de normalização de variável dinâmica**: dado o mesmo nome de serviço, a regra de normalização sempre produz o mesmo identificador de variável — `normalizar(nome) = normalizar(nome)` para qualquer entrada
- **Invariante de variáveis do painel**: toda variável exibida no painel lateral é resolvível para um contrato com todos os campos preenchidos — nenhuma variável do painel produz substituição vazia em um contrato completo

---

### Requisito 4 — Templates de Contrato

**User Story:** Como Gestor, quero gerenciar múltiplos templates de contrato que definem a estrutura do documento, para que diferentes modelos formais possam ser usados sem duplicar as cláusulas configuradas na biblioteca.

#### Critérios de Aceitação

1. WHEN o Gestor salva um template com `structure` definida, THE Sistema SHALL persistir a estrutura em JSONB de forma que uma query subsequente retorne a sequência de blocos (`header`, `clauses_block`, `signature_block`, `footer`) exatamente como foi salva.

2. WHEN o Gestor cria um novo template com nome único por organização (1 a 100 caracteres) e estrutura definida, THE Sistema SHALL persistir o template associado ao `organization_id` do Gestor.

3. THE Sistema SHALL garantir que no máximo um template por organização tenha `is_default = true` a qualquer momento.

4. WHEN o Gestor marca um template `T_novo` como padrão, THE Sistema SHALL, de forma que o resultado final observável seja: `T_novo.is_default = true` e `∀ t ≠ T_novo: t.is_default = false` — nenhum estado intermediário com dois templates padrão é observável por outros usuários.

5. WHEN o Consultor não seleciona um template explicitamente ao criar um contrato, THE Sistema SHALL utilizar o template marcado como padrão da organização.

6. IF não existe nenhum template com `is_default = true` na organização no momento em que o Consultor aciona a geração do PDF, THEN THE Sistema SHALL bloquear a operação e exibir mensagem orientando o Gestor a acessar Configurações → Contratos e definir um template padrão.

7. WHEN o Gestor aciona a pré-visualização de um template, THE Sistema SHALL renderizar o template com cláusulas fictícias e valores de placeholder (ex: "Cliente Exemplo", "R$ 0,00") e exibir o HTML resultante sem disparar nenhuma operação de persistência.

8. WHEN o Gestor aciona a exclusão de um template que está referenciado como `template_id` em ao menos um contrato com `status ∈ {ativo, gerado}`, THE Sistema SHALL bloquear a exclusão e informar a quantidade de contratos afetados.

#### Propriedades de Corretude

- **Invariante de unicidade do padrão**: em qualquer momento, `|{t ∈ contract_templates | t.organization_id = org ∧ t.is_default = true}| ≤ 1`
- **Propriedade de resultado final da troca de padrão**: após a operação de definir novo padrão concluir, exatamente um template tem `is_default = true` e todos os demais têm `is_default = false` — verificável por query imediata após a operação
- **Round-trip de structure JSONB**: dado qualquer objeto `structure` válido, salvar e carregar o template deve retornar estrutura equivalente — `carregar(salvar(structure)) ≡ structure`

---

### Requisito 5 — Formulário de Contrato: Serviços Inclusos

**User Story:** Como Consultor, quero selecionar múltiplos serviços do catálogo ao criar um contrato, com campos configuráveis expandidos por serviço, para que o escopo contratado seja registrado de forma estruturada e detalhada no documento.

#### Critérios de Aceitação

1. THE Sistema SHALL substituir o campo `service_contracted` (texto livre) do formulário atual por um componente de seleção múltipla que lista todos os serviços do Catálogo_de_Servicos da organização.

2. WHEN o Consultor seleciona um serviço que possui sub-serviços configurados, THE Sistema SHALL expandir abaixo da seleção os campos dos sub-serviços com os tipos de input: `text` → campo de texto, `number` → campo numérico, `boolean` → checkbox, `select` → dropdown com as opções configuradas.

3. WHEN o Consultor remove um serviço já selecionado, THE Sistema SHALL recolher os campos dos sub-serviços daquele serviço e descartar os valores preenchidos.

4. THE Sistema SHALL persistir os serviços selecionados e os valores dos sub-serviços no campo `metadata.services` do contrato como array de objetos `{ service_id, service_name, sub_service_values: { [campo]: valor } }`.

5. WHEN o contrato é salvo com ao menos um serviço selecionado, THE Sistema SHALL compor a string de escopo para a variável `{{servicos}}` no formato de lista onde cada serviço ocupa uma linha: "• [Nome do Serviço]: [sub_campo_1]: [valor], [sub_campo_2]: [valor], ...".

6. WHEN o contrato é salvo com zero serviços selecionados, THE Sistema SHALL rejeitar a operação e exibir a mensagem "Selecione ao menos um serviço para o contrato.".

7. WHEN o formulário de um contrato existente é carregado e um dos serviços previamente selecionados não existe mais no Catálogo_de_Servicos, THE Sistema SHALL exibir alerta identificando o serviço removido, marcar aquele item como inválido no formulário e bloquear o salvamento até que o Consultor remova ou substitua o serviço inválido.

#### Propriedades de Corretude

- **Invariante de consistência de escopo**: para todo contrato salvo com `metadata.services` não vazio, a string `{{servicos}}` resolvida contém o `service_name` de cada objeto em `metadata.services`
- **Propriedade metamórfica de adição de serviço**: `len(escopo(S ∪ {s_novo})) ≥ len(escopo(S))` — adicionar um serviço nunca reduz a string de escopo
- **Round-trip de sub-serviços do contrato**: `carregar(salvar(services_array)) ≡ services_array` — salvar e carregar preserva todos os campos e valores

---

### Requisito 6 — Formulário de Contrato: Setup

**User Story:** Como Consultor, quero configurar opcionalmente uma taxa de setup ao criar o contrato, para que os lançamentos financeiros reflitam corretamente a cobrança inicial de implantação somada à mensalidade nos meses de parcelamento.

#### Critérios de Aceitação

1. THE Sistema SHALL exibir um toggle "Possui Setup/Taxa de Implantação?" no formulário de contrato, com valor padrão desativado.

2. WHEN o Consultor ativa o toggle de setup, THE Sistema SHALL exibir os seguintes campos obrigatórios: valor total do setup (numérico, > 0), número de parcelas (inteiro, 1 a 12), data do 1º vencimento do setup (data), forma de pagamento do setup; e o campo opcional: juros/taxas (percentual, 0,00% a 100,00%).

3. WHEN o Consultor desativa o toggle de setup após ter preenchido os campos, THE Sistema SHALL ocultar os campos de setup e limpar todos os valores, de forma que o formulário retorne ao estado equivalente a um contrato sem setup.

4. WHILE o toggle de setup está ativo e os campos `valor_total` e `numero_parcelas` estão preenchidos, THE Sistema SHALL calcular e exibir em tempo real o valor de cada parcela como `round((valor_total * (1 + juros/100)) / numero_parcelas, 2)`.

5. WHEN o Consultor salva o contrato com setup ativado, THE Sistema SHALL persistir no `metadata` do contrato os campos: `setup_value`, `setup_installments`, `setup_parcel_value`, `setup_fees`, `setup_first_due_date`, `setup_payment_method`.

6. WHEN o setup tem `numero_parcelas > 1` e o campo `prazo_minimo` tem valor menor que `numero_parcelas`, THE Sistema SHALL bloquear o salvamento e exibir a mensagem: "O prazo mínimo de permanência não pode ser menor que o número de parcelas do setup ([N] meses).", substituindo [N] pelo valor de `numero_parcelas`.

7. WHEN o setup tem `numero_parcelas = 1`, THE Sistema SHALL aceitar qualquer valor de `prazo_minimo ≥ 1` sem restrição adicional.

#### Propriedades de Corretude

- **Invariante de restrição de prazo mínimo**: para todo contrato persistido com `metadata.setup_installments > 1`, `contracts.min_duration_months ≥ metadata.setup_installments` — esta invariante é verificável a qualquer momento após o salvamento
- **Propriedade de cálculo de parcela**: para quaisquer `valor_total > 0`, `parcelas ∈ [1, 12]`, `juros ∈ [0, 100]`, `setup_parcel_value = round((valor_total * (1 + juros/100)) / parcelas, 2)` — verificável por geração de propriedade com valores aleatórios válidos
- **Propriedade de reversibilidade do toggle**: `formulario_apos_desativar ≡ formulario_sem_setup_inicial` — ativar e depois desativar o toggle produz estado idêntico ao formulário sem setup

---

### Requisito 7 — Formulário de Contrato: Prazo Mínimo

**User Story:** Como Consultor, quero definir um prazo mínimo de permanência independente do setup, para que o documento gerado contenha a cláusula de fidelidade correta e contratos sem parcelamento também possam ter permanência mínima exigida.

#### Critérios de Aceitação

1. THE Sistema SHALL exibir o campo `prazo_minimo` (inteiro, meses, ≥ 0) como campo independente no formulário de contrato, com valor padrão 0 (sem prazo mínimo).

2. WHEN o campo `prazo_minimo` é maior que zero no momento da montagem do documento, THE Sistema SHALL injetar a cláusula com `condition_type = 'has_min_duration'` no documento, substituindo a variável `{{prazo_minimo}}` pelo valor em meses.

3. WHEN o campo `prazo_minimo` é zero no momento da montagem do documento, THE Sistema SHALL omitir qualquer cláusula com `condition_type = 'has_min_duration'` do documento gerado.

4. WHEN o Consultor altera o valor de `prazo_minimo` ou de `setup_installments` e a condição `prazo_minimo < setup_installments` (com `setup_installments > 1`) é satisfeita, THE Sistema SHALL exibir imediatamente um aviso de validação inline; o bloqueio efetivo do salvamento ocorre na tentativa de submeter o formulário.

5. THE Sistema SHALL persistir o valor do campo `prazo_minimo` na coluna `min_duration_months` da tabela `contracts`.

#### Propriedades de Corretude

- **Invariante de compatibilidade com setup**: para todo contrato salvo com `metadata.setup_installments > 1`, `min_duration_months ≥ metadata.setup_installments`
- **Propriedade determinística da cláusula condicional**: para qualquer par `(contrato_A, contrato_B)` com `min_duration_months_A = min_duration_months_B`, a presença da cláusula de prazo mínimo no documento montado é idêntica — a inclusão da cláusula é função pura e determinística de `min_duration_months > 0`

---

### Requisito 8 — Lançamentos Financeiros Unificados

**User Story:** Como Gestor, quero que o Sistema gere automaticamente um único lançamento financeiro por mês por contrato, com valor que reflita setup e mensalidade somados nos meses de parcelamento, para que o controle financeiro seja preciso e rastreável.

#### Critérios de Aceitação

1. WHEN um contrato é salvo com status `ativo`, THE Sistema SHALL gerar os lançamentos financeiros mensais a partir da `first_payment_due_date`, em quantidade igual a `duration_months`.

2. THE Sistema SHALL gerar exatamente um lançamento por mês por contrato — para cada mês do contrato existe exatamente um registro de pagamento associado.

3. WHEN o índice do lançamento (1-based) está no intervalo `[1, setup_installments]`, THE Sistema SHALL calcular o valor do lançamento como `setup_parcel_value + recurring_value`.

4. WHEN o índice do lançamento (1-based) está no intervalo `(setup_installments, duration_months]`, THE Sistema SHALL calcular o valor do lançamento como `recurring_value` apenas.

5. WHEN o contrato não possui setup (`metadata.setup_installments` ausente ou 0), THE Sistema SHALL calcular o valor de todos os `duration_months` lançamentos como `recurring_value`.

6. THE Sistema SHALL preencher a descrição de cada lançamento indicando a composição: `"[Título do Contrato] • Mensalidade + Setup ([X]/[N])"` nos meses com setup, ou `"[Título do Contrato] • Mensalidade"` nos demais, onde X é o número da parcela atual e N o total de parcelas do setup.

7. WHEN o valor recorrente (`contracts.value`) ou os parâmetros de setup são atualizados em um contrato ativo, THE Sistema SHALL cancelar os lançamentos futuros com status `pendente` e recriar novos lançamentos com os valores corretos, preservando inalterados todos os lançamentos com status `pago`.

8. IF ao gerar lançamentos já existe um lançamento com o mesmo `contract_id` e `due_date` que não está com status `pago`, THEN THE Sistema SHALL atualizar o valor e a descrição do lançamento existente em vez de criar um duplicado.

#### Propriedades de Corretude

- **Invariante de unicidade por mês**: `∀ contrato ∈ contratos_ativos, ∀ mes ∈ [1..duration_months]: count(lançamentos(contrato, mes)) = 1`
- **Invariante de soma financeira total**: `sum(valor de todos os lançamentos do contrato) = (recurring_value × duration_months) + round(setup_value × (1 + setup_fees/100), 2)` — verificável por geração de propriedade com valores aleatórios válidos
- **Propriedade metamórfica de fronteira do setup**: para qualquer `setup_installments N ∈ [1, 12]`, os lançamentos de índice `1..N` têm `valor > recurring_value` e os de índice `N+1..duration_months` têm `valor = recurring_value`
- **Idempotência de geração**: executar a geração de lançamentos duas vezes consecutivas para o mesmo contrato sem modificar seus dados produz o mesmo conjunto de lançamentos — `gerar(gerar(contrato)) ≡ gerar(contrato)`
- **Invariante de imutabilidade de pagos**: nenhum lançamento com `status = 'pago'` tem seu `value` ou `due_date` alterado por qualquer operação de atualização de contrato

---

### Requisito 9 — Montagem Automática do Documento

**User Story:** Como Consultor, quero que o Sistema monte automaticamente o contrato completo ao combinar o template selecionado com as cláusulas condicionais ordenadas e me permita revisar e editar cláusulas marcadas como editáveis antes de gerar o PDF.

#### Critérios de Aceitação

1. WHEN o Consultor aciona a geração do contrato, THE Sistema SHALL montar o documento combinando: (a) a estrutura do template selecionado (ou padrão), (b) as cláusulas da Biblioteca_de_Clausulas cujas condições são satisfeitas pelo contrato, na ordem crescente de `display_order`, com numeração sequencial automática (1ª, 2ª, ...).

2. THE Sistema SHALL avaliar as condições de exibição de cada cláusula com base nos dados do contrato no momento em que a geração é acionada.

3. WHEN a montagem é concluída, THE Sistema SHALL exibir o Modal_de_Revisao com o HTML do documento completo antes de qualquer disparo de webhook ou geração de PDF.

4. THE Sistema SHALL substituir todas as variáveis `{{nome_variavel}}` no conteúdo das cláusulas pelos valores correspondentes do contrato e do cliente durante a montagem, antes de exibir o Modal_de_Revisao.

5. WHEN uma cláusula incluída no documento tem `is_editable = true`, THE Sistema SHALL exibir um botão "Editar" visualmente distinguível ao lado do título dessa cláusula no Modal_de_Revisao.

6. WHEN o Consultor aciona a edição de uma cláusula editável no Modal_de_Revisao e salva as alterações, THE Sistema SHALL atualizar o conteúdo exibido no modal com a versão editada e registrar `{ [clause_id]: conteudo_editado }` em `metadata.clause_edits` do contrato, sem alterar o registro original em `contract_clauses`.

7. WHEN o Consultor confirma a geração no Modal_de_Revisao, THE Sistema SHALL disparar o webhook/n8n configurado com o conteúdo HTML final do documento (incluindo edições aplicadas) e registrar `generated_at = now()` no contrato.

8. IF o template associado ao contrato não possui o campo `structure` preenchido no momento em que a geração é acionada, THEN THE Sistema SHALL exibir mensagem de erro "O template selecionado não está configurado. Acesse Configurações → Contratos para configurar a estrutura do template." e não prosseguir com a montagem.

#### Propriedades de Corretude

- **Invariante de snapshot imutável**: após `generated_at` ser registrado, o conteúdo de `metadata.clause_edits` e o HTML enviado ao webhook não são alterados por modificações posteriores na Biblioteca_de_Clausulas ou no Catálogo_de_Servicos
- **Idempotência de pré-visualização**: montar o documento para o mesmo contrato múltiplas vezes sem alterar seus dados produz HTML idêntico — `montar(contrato) = montar(contrato)`
- **Propriedade de completude de substituição**: o HTML final do documento não contém nenhuma ocorrência do padrão `\{\{[a-z_]{1,50}\}\}` no conteúdo textual
- **Propriedade de preservação de edições**: `conteudo_no_html_final(clausula_com_id X) = metadata.clause_edits[X]` quando X está presente em `clause_edits`

---

### Requisito 10 — Isolamento Multi-Tenant

**User Story:** Como Gestor, quero que todos os dados de contratos, serviços e cláusulas da minha organização sejam completamente isolados de outras organizações, para que não haja vazamento de informações entre organizações no CRM.

#### Critérios de Aceitação

1. THE Sistema SHALL aplicar Row Level Security (RLS) nas tabelas `service_catalog` e `contract_clauses` com política `organization_id = get_user_organization_id()` cobrindo as operações SELECT, INSERT, UPDATE e DELETE.

2. WHEN um usuário autenticado realiza qualquer operação de leitura nas tabelas `service_catalog`, `contract_clauses` ou `contract_templates`, THE Sistema SHALL retornar apenas registros cuja `organization_id` corresponde à organização do usuário autenticado.

3. IF um usuário tenta inserir um registro com `organization_id` diferente da sua organização, THEN THE Sistema SHALL rejeitar a operação com erro de violação de política RLS sem executar a inserção.

4. THE Sistema SHALL declarar `organization_id` como coluna `NOT NULL` em todas as novas tabelas criadas por esta feature.

#### Propriedades de Corretude

- **Invariante de isolamento completo**: para qualquer par de organizações distintas `org_A ≠ org_B`, `query(user_org_A, service_catalog) ∩ query(user_org_B, service_catalog) = ∅`
- **Propriedade de completude de visibilidade**: para todo registro `r` inserido com sucesso por um usuário da organização `O`, a query subsequente pelo mesmo usuário retorna `r` — nenhum dado próprio é ocultado pela política RLS

---

### Requisito 11 — Persistência e Integridade Referencial

**User Story:** Como Gestor, quero que o Sistema mantenha integridade referencial entre contratos, serviços e cláusulas, para que não existam referências quebradas que causem erros ou comportamento indefinido na geração de documentos.

#### Critérios de Aceitação

1. THE Sistema SHALL criar a tabela `service_catalog` com a estrutura: `id uuid PK`, `organization_id uuid NOT NULL FK → organizations(id) ON DELETE CASCADE`, `name text NOT NULL`, `category text NOT NULL`, `sub_services jsonb NOT NULL DEFAULT '[]'`, `display_order integer NOT NULL DEFAULT 0`, `created_at timestamptz`, `updated_at timestamptz`.

2. THE Sistema SHALL criar a tabela `contract_clauses` com a estrutura: `id uuid PK`, `organization_id uuid NOT NULL FK → organizations(id) ON DELETE CASCADE`, `title text NOT NULL`, `content jsonb NOT NULL`, `display_order integer NOT NULL DEFAULT 0`, `condition_type text NOT NULL DEFAULT 'always'`, `condition_value text`, `is_editable boolean NOT NULL DEFAULT false`, `service_id uuid FK → service_catalog(id) ON DELETE SET NULL`, `created_at timestamptz`, `updated_at timestamptz`.

3. WHEN um serviço é excluído da tabela `service_catalog`, THE Sistema SHALL automaticamente definir `service_id = NULL` em todos os registros de `contract_clauses` que referenciavam esse serviço, efetivamente convertendo-as em cláusulas com `condition_type = 'always'`.

4. WHEN a migration desta feature é aplicada a um banco com registros existentes em `contract_templates`, THE Sistema SHALL adicionar a coluna `structure jsonb` com valor padrão `NULL` sem alterar nenhum registro existente e sem causar erros de execução da migration.

5. WHEN o Sistema carrega um contrato existente cujo `metadata` não contém os campos `services`, `setup_value`, `setup_installments`, `min_duration_months` ou `clause_edits`, THE Sistema SHALL tratar os valores ausentes como seus defaults (`[]`, `null`, `0`, `{}`) sem lançar exceção em runtime.

#### Propriedades de Corretude

- **Invariante de integridade referencial**: em nenhum momento existe um registro em `contract_clauses` com `service_id` não-nulo apontando para um `service_catalog.id` inexistente
- **Propriedade de migração não-destrutiva**: após aplicar todas as migrations desta feature, `count(contratos existentes antes da migration) = count(contratos após a migration)` e nenhum contrato existente apresenta erro ao ser carregado pelo frontend
