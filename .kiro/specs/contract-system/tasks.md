# Implementation Plan: Contract System

## Overview

Implementação do redesign completo do sistema de contratos em TypeScript/React com Supabase. O plano segue a ordem natural de dependências: banco de dados → tipos → lógica pura → hooks → UI (Bloco 1 → Bloco 2 → Bloco 3). Funções puras são implementadas antes dos componentes que as consomem, permitindo validação por property-based tests antes da integração.

## Tasks

---

- [x] 1. Banco de dados — Migrations e RLS
  - [x] 1.1 Criar migration para tabela `service_catalog`
    - Criar arquivo `migrations/NNN_create_service_catalog.sql`
    - Incluir: `id uuid PK`, `organization_id uuid NOT NULL FK → organizations(id) ON DELETE CASCADE`, `name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 150)`, `category text NOT NULL CHECK (char_length(category) BETWEEN 1 AND 100)`, `sub_services jsonb NOT NULL DEFAULT '[]'`, `display_order integer NOT NULL DEFAULT 0`, `created_at timestamptz`, `updated_at timestamptz`, `UNIQUE (organization_id, name)`
    - Habilitar RLS: `ALTER TABLE service_catalog ENABLE ROW LEVEL SECURITY`
    - Criar políticas RLS para SELECT/INSERT/UPDATE/DELETE com `organization_id = get_user_organization_id()`
    - _Requirements: 1.1, 1.2, 10.1, 10.4, 11.1_

  - [x] 1.2 Criar migration para tabela `contract_clauses`
    - Criar arquivo `migrations/NNN_create_contract_clauses.sql`
    - Incluir todos os campos conforme especificação, com `service_id uuid FK → service_catalog(id) ON DELETE SET NULL`
    - Habilitar RLS com mesma política de `organization_id`
    - _Requirements: 2.1, 10.1, 10.4, 11.2, 11.3_

  - [x] 1.3 Criar migration para alterar tabelas existentes
    - Criar arquivo `migrations/NNN_alter_contract_tables.sql`
    - `ALTER TABLE contract_templates ADD COLUMN IF NOT EXISTS structure JSONB DEFAULT NULL`
    - `ALTER TABLE contracts ADD COLUMN IF NOT EXISTS min_duration_months INTEGER NOT NULL DEFAULT 0`
    - Migration deve ser não-destrutiva: sem alterar dados existentes, sem causar erros de execução
    - _Requirements: 4.1, 7.5, 11.4, 11.5_

---

- [x] 2. Tipos TypeScript e schemas de validação
  - [x] 2.1 Criar tipos base em `src/types/contracts.ts`
    - Exportar: `SubService`, `ServiceCatalogItem`, `ContractClause`, `ContractTemplateStructure`, `ContractTemplateV2`, `SelectedService`, `ContractAssemblyResult`, `ContractMetadataExtension`
    - Extender o tipo `ContractTemplate` existente em `src/types/proposals.ts` com `ContractTemplateV2`
    - _Requirements: 1.4, 2.1, 4.1, 5.4, 9.1_

  - [x] 2.2 Criar schemas Zod em `src/lib/contracts/schemas.ts`
    - `subServiceSchema`: valida tipos `number | text | boolean | select`; quando `type === 'select'` exige `options.length >= 1` e `options.length <= 50`
    - `serviceCatalogSchema`: valida nome (1–150 chars), categoria (1–100 chars)
    - `contractClauseSchema`: valida `condition_type` enum; quando `condition_type === 'has_service'` exige `service_id` não nulo
    - `setupSectionSchema`: valida `setup_value > 0`, `setup_installments` entre 1 e 12, `setup_fees` entre 0 e 100
    - `contractFormSchema`: validação cruzada `min_duration_months >= setup_installments` quando `setup_installments > 1`
    - _Requirements: 1.3, 1.4, 1.5, 2.2, 6.2, 6.6, 7.4_

---

- [x] 3. Funções puras — Normalização e cálculo de parcela
  - [x] 3.1 Implementar `normalizeVariableIdentifier` em `src/lib/contracts/normalizeVariable.ts`
    - Recebe string arbitrária; retorna identificador normalizado
    - Regras: lowercase → remover acentos (NFD + regex) → substituir caracteres não-alfanuméricos por `_` → colapsar múltiplos `_` → remover `_` inicial/final → truncar a 50 chars
    - Exportar também `normalizeServiceVariable(name: string): string` que envolve o identificador em `{{escopo_<normalizado>}}`
    - _Requirements: 3.3_

  - [x]* 3.2 Escrever property tests para `normalizeVariableIdentifier` (Property 7)
    - **Property 7: Determinismo de normalização de variável dinâmica**
    - **Validates: Requirements 3.3**
    - `fc.assert(fc.property(fc.string(), name => normalizeVariableIdentifier(name) === normalizeVariableIdentifier(name)), { numRuns: 100 })`
    - Testar também: resultado nunca excede 50 chars, resultado nunca começa/termina com `_`, resultado corresponde ao charset `[a-z0-9_]*`
    - _Arquivo: `src/lib/contracts/__tests__/normalizeVariable.test.ts`_

  - [x] 3.3 Implementar `calcSetupParcel` em `src/lib/contracts/calcSetupParcel.ts`
    - Assinatura: `calcSetupParcel(total: number, parcelas: number, juros: number): number`
    - Fórmula: `round((total * (1 + juros / 100)) / parcelas, 2)`
    - Usar `Math.round(value * 100) / 100` para precisão de 2 casas decimais
    - _Requirements: 6.4_

  - [x]* 3.4 Escrever property tests para `calcSetupParcel` (Property 13)
    - **Property 13: Invariante de cálculo de parcela de setup**
    - **Validates: Requirements 6.4**
    - Gerar `total ∈ (0, 1_000_000]`, `parcelas ∈ [1, 12]`, `juros ∈ [0, 100]` com `fast-check`
    - Verificar: `|calcSetupParcel(t, p, j) - round((t*(1+j/100))/p, 2)| < 0.01`
    - _Arquivo: `src/lib/contracts/__tests__/calcSetupParcel.test.ts`_

---

- [x] 4. Funções puras — `resolveVariables` e `buildScopeString`
  - [x] 4.1 Implementar `buildScopeString` em `src/lib/contracts/buildScopeString.ts`
    - Assinatura: `buildScopeString(services: SelectedService[]): string`
    - Formato por serviço: `"• [Nome]: [campo1]: [valor1], [campo2]: [valor2], ..."`
    - Com zero serviços retorna string vazia
    - _Requirements: 5.5_

  - [x]* 4.2 Escrever property tests para `buildScopeString` (Property 12)
    - **Property 12: Escopo cresce monotonicamente com serviços**
    - **Validates: Requirements 5.5**
    - `fc.assert(fc.property(fc.array(selectedServiceArb), fc.record({...}), (services, extra) => buildScopeString([...services, extra]).length >= buildScopeString(services).length), { numRuns: 100 })`
    - _Arquivo: `src/lib/contracts/__tests__/buildScopeString.test.ts`_

  - [x] 4.3 Implementar `resolveVariables` em `src/lib/contracts/resolveVariables.ts`
    - Assinatura: `resolveVariables(template: string, vars: Record<string, string>): { output: string; unresolved: string[] }`
    - Substituir todos os padrões `{{nome_variavel}}` pelos valores do mapa; variáveis sem valor mapeado → substituir por `""` e adicionar ao array `unresolved`
    - Variáveis fixas mapeadas: `{{cliente}}`, `{{empresa}}`, `{{cnpj}}`, `{{cpf}}`, `{{valor}}`, `{{servicos}}`, `{{vencimento}}`, `{{primeiro_pagamento}}`, `{{data}}`, `{{consultor}}`, `{{escopo}}`, `{{cronograma}}`, `{{prazo_minimo}}`
    - _Requirements: 3.5, 3.6_

  - [x]* 4.4 Escrever property tests para `resolveVariables` (Property 8)
    - **Property 8: Substituição total de variáveis no HTML final**
    - **Validates: Requirements 3.5, 9.4**
    - Gerar template arbitrário com variáveis aleatórias; fornecer todos os valores; verificar que output não contém padrão `\{\{[a-z_]{1,50}\}\}`
    - Caso secundário: variável sem valor no mapa → aparece em `unresolved`, não aparece no output
    - _Arquivo: `src/lib/contracts/__tests__/resolveVariables.test.ts`_

---

- [x] 5. Funções puras — `generatePayments`
  - [x] 5.1 Implementar `generatePayments` em `src/lib/contracts/generatePayments.ts`
    - Assinatura: `generatePayments(params: GeneratePaymentsParams): PaymentDraft[]`
    - Gerar exatamente `duration_months` registros com `due_date` distintos (incremento mensal a partir de `first_payment_due_date`)
    - Índices `1..setup_installments`: `value = setup_parcel_value + recurring_value`, `description = "[Título] • Mensalidade + Setup ([X]/[N])"`
    - Índices `setup_installments+1..duration_months`: `value = recurring_value`, `description = "[Título] • Mensalidade"`
    - Quando sem setup (`setup_installments = 0`): todos os lançamentos com `recurring_value`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [x]* 5.2 Escrever property tests para `generatePayments` (Properties 16, 17, 18)
    - **Property 16: Unicidade de lançamento por mês por contrato**
    - **Property 17: Soma financeira total dos lançamentos**
    - **Property 18: Idempotência de geração de lançamentos**
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.8**
    - Prop 16: `generatePayments(c).length === c.duration_months` e todos `due_date` distintos
    - Prop 17: `|sum(values) - (recurring × D + round(setup_value × (1 + fees/100), 2))| < 0.01`
    - Prop 18: `JSON.stringify(gen(c)) === JSON.stringify(gen(c))`
    - _Arquivo: `src/lib/contracts/__tests__/generatePayments.test.ts`_

  - [x] 5.3 Checkpoint — testes das funções puras
    - Garantir que todos os testes unitários e de propriedade das funções puras estão passando: `normalizeVariable`, `calcSetupParcel`, `buildScopeString`, `resolveVariables`, `generatePayments`
    - Executar `vitest run src/lib/contracts` e confirmar 0 falhas

---

- [x] 6. Funções puras — `assembleContract`, `applyClauseEdits`, `renderContractHtml`
  - [x] 6.1 Implementar `assembleContract` em `src/lib/contracts/assembleContract.ts`
    - Assinatura: `assembleContract(contract: Contract, clauses: ContractClause[], template: ContractTemplateV2, client: Client): ContractAssemblyResult`
    - Filtrar cláusulas cujas condições são satisfeitas pelo contrato (avaliar `condition_type` e `condition_value`)
    - Ordenar por `display_order` crescente
    - Numerar sequencialmente (1ª, 2ª, ...)
    - Converter cada `clause.content` (TipTap JSONContent) para HTML via editor headless
    - Substituir variáveis com `resolveVariables`; registrar não resolvidas em `unresolvedVariables`
    - Injetar cláusulas no template substituindo `{{CLAUSES}}` em `structure.clauses_block`
    - Retornar `{ html, resolvedVariables, unresolvedVariables, clauseCount }`
    - _Requirements: 9.1, 9.2, 9.4, 9.8_

  - [x]* 6.2 Escrever property tests para `assembleContract` (Properties 6, 19)
    - **Property 6: Filtragem correta de cláusulas por condição**
    - **Property 19: Determinismo de montagem do documento**
    - **Validates: Requirements 2.5, 2.6, 2.7, 2.8, 9.2, 9.3**
    - Prop 6: para qualquer contrato e conjunto de cláusulas, toda cláusula incluída satisfaz sua condição e toda excluída não satisfaz
    - Prop 19: `assembleContract(c,cl,t,cl2).html === assembleContract(c,cl,t,cl2).html` (chamadas idênticas produzem mesmo HTML)
    - _Arquivo: `src/lib/contracts/__tests__/assembleContract.test.ts`_

  - [x] 6.3 Implementar `applyClauseEdits` em `src/lib/contracts/applyClauseEdits.ts`
    - Assinatura: `applyClauseEdits(html: string, clauseEdits: Record<string, string>): string`
    - Para cada `[clause_id, editedHtml]` em `clauseEdits`, substituir o conteúdo do elemento identificado por `data-clause-id="<id>"` no HTML montado pelo conteúdo editado
    - Usar parser DOM leve (ex: `DOMParser` no browser ou `@tiptap/html` no contexto de teste)
    - _Requirements: 9.6_

  - [x]* 6.4 Escrever property tests para `applyClauseEdits` (Property 20)
    - **Property 20: Preservação de edições inline no HTML final**
    - **Validates: Requirements 9.6**
    - Para qualquer mapa de edições `clause_edits` e HTML de template válido, o HTML resultante contém exatamente `clause_edits[id]` para cada `id` presente
    - _Arquivo: `src/lib/contracts/__tests__/applyClauseEdits.test.ts`_

  - [x] 6.5 Implementar `renderContractHtml` em `src/lib/contracts/renderContractHtml.ts`
    - Assinatura: `renderContractHtml(assembled: ContractAssemblyResult, clauseEdits: Record<string, string>): string`
    - Aplicar `applyClauseEdits` ao HTML montado
    - Retornar HTML final completo (string)
    - _Requirements: 9.3, 9.7_

---

- [x] 7. Hook `useServiceCatalog`
  - [x] 7.1 Criar `src/hooks/useServiceCatalog.ts`
    - Usar TanStack Query (`useQuery`) para listar serviços da organização agrupados por categoria
    - `useMutation` para `createService`, `updateService`, `deleteService`
    - Antes do DELETE: verificar contratos ativos que referenciam o serviço; bloquear se existirem e retornar lista com nomes/quantidade
    - `reorderServices(newOrder: string[])`: atualizar `display_order` de todos os serviços afetados em batch (upsert)
    - Invalidar query ao confirmar mutação
    - _Requirements: 1.2, 1.6, 1.7, 1.8, 10.2_

  - [x]* 7.2 Escrever testes unitários para `useServiceCatalog`
    - Testar: criação com nome duplicado retorna erro correto, deleção bloqueada quando contratos ativos existem, reordenação persiste novo `display_order`
    - Usar `@testing-library/react` + mock do Supabase client
    - _Requirements: 1.3, 1.6, 1.7_

---

- [x] 8. Hook `useContractClauses`
  - [x] 8.1 Criar `src/hooks/useContractClauses.ts`
    - Listar cláusulas da organização ordenadas por `display_order`
    - Mutações: `createClause`, `updateClause`, `deleteClause`
    - `reorderClauses(newOrder: string[])`: atualizar `display_order` de todas as cláusulas afetadas garantindo sequência `{0, 1, ..., n-1}` sem lacunas — usar transação ou `rpc` batch
    - _Requirements: 2.3, 2.4, 10.2_

  - [x]* 8.2 Escrever property tests para reordenação de cláusulas (Properties 4, 5)
    - **Property 4: Sequência de display_order sem lacunas**
    - **Property 5: Idempotência de reordenação de cláusulas**
    - **Validates: Requirements 2.3, 2.4**
    - Prop 4: após qualquer sequência de criações e reordenações, `display_order` forma `{0,...,n-1}`
    - Prop 5: `reorder(reorder(clauses, P), P)` ≡ `reorder(clauses, P)`
    - _Arquivo: `src/lib/contracts/__tests__/reorderClauses.test.ts`_

---

- [x] 9. Bloco 1 — UI: Catálogo de Serviços
  - [x] 9.1 Criar `src/components/contracts/settings/ServiceCatalogTab.tsx`
    - Lista de serviços agrupados por categoria, com ordenação por `@dnd-kit/sortable`
    - Botão "Novo Serviço" abre `ServiceFormDialog`
    - Inline actions: Editar, Excluir (com confirmação mostrando contratos afetados)
    - _Requirements: 1.7, 1.8_

  - [x] 9.2 Criar `src/components/contracts/settings/ServiceFormDialog.tsx`
    - Campos: nome (input, máx 150), categoria (input, máx 100)
    - Sub-serviços: lista dinâmica com botão "Adicionar sub-serviço"; cada item tem nome + seletor de tipo (`number | text | boolean | select`); quando `select`, exibir campo para opções (mín 1, máx 50)
    - Validação com schema Zod `serviceCatalogSchema`
    - Exibir mensagens de erro inline (campo vazio, duplicata, limite de chars)
    - _Requirements: 1.1, 1.3, 1.4, 1.5_

  - [-]* 9.3 Escrever testes de snapshot e interação para `ServiceFormDialog`
    - Snapshot do estado inicial
    - Interação: selecionar tipo `select` → campo de opções aparece; remover todas as opções → erro inline
    - _Requirements: 1.4, 1.5_

---

- [x] 10. Bloco 1 — UI: Biblioteca de Cláusulas
  - [x] 10.1 Instalar e configurar TipTap v2 com extensões necessárias
    - Instalar: `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-mention`
    - Criar extensão customizada `VariableMention` baseada em `Mention` para renderizar variáveis como chips visuais
    - Configurar `renderHTML` do chip: `<span data-variable="{{nome}}" class="variable-chip">{{nome}}</span>`
    - _Requirements: 3.1, 3.2, 3.4_

  - [x] 10.2 Criar `src/components/contracts/settings/ClauseEditor.tsx`
    - Editor TipTap com toolbar: negrito, itálico, sublinhado, lista ordenada, lista não-ordenada
    - Painel lateral com variáveis fixas (13 itens) + variáveis dinâmicas derivadas dos serviços disponíveis via `normalizeServiceVariable`
    - Drag-and-drop de variável para o editor: inserir chip na posição do cursor ou ao final
    - Persistir conteúdo como `JSONContent` (não HTML)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.7_

  - [x] 10.3 Criar `src/components/contracts/settings/ClauseFormDialog.tsx`
    - Campos: título (obrigatório), `condition_type` (dropdown), `condition_value` (condicional), `is_editable` (checkbox), `service_id` (select condicional quando `condition_type = 'has_service'`)
    - Integrar `ClauseEditor` para o campo `content`
    - Validação: `has_service` sem `service_id` → erro inline "Selecione o serviço vinculado."
    - Botão Salvar desabilitado quando conteúdo do editor vazio
    - _Requirements: 2.1, 2.2_

  - [x] 10.4 Criar `src/components/contracts/settings/ClausesLibraryTab.tsx`
    - Lista de cláusulas ordenável por `@dnd-kit/sortable`
    - Cada item exibe: título, tipo de condição, ícone de editabilidade
    - Drag-and-drop persiste nova ordem via `useContractClauses.reorderClauses`
    - _Requirements: 2.3, 2.4_

  - [x]* 10.5 Escrever testes de interação para `ClauseFormDialog`
    - Testar: `condition_type = 'has_service'` sem `service_id` → erro; salvar com editor vazio → botão desabilitado
    - _Requirements: 2.2_

---

- [x] 11. Bloco 1 — UI: Editor de Templates
  - [x] 11.1 Criar `src/components/contracts/settings/TemplateStructureEditor.tsx`
    - Formulário com 5 campos HTML livres: `header`, `parties_block`, `clauses_block`, `signature_block`, `footer`
    - Botão "Pré-visualizar": chamar `assembleContract` com dados fictícios e exibir HTML em `<iframe>` sandbox sem persistir
    - Validação: `clauses_block` deve conter `{{CLAUSES}}` (aviso inline se ausente)
    - _Requirements: 4.1, 4.7_

  - [x] 11.2 Refatorar `TemplatesTab` existente para suportar `ContractTemplateV2`
    - Adicionar lista de templates com indicador "Padrão"
    - Toggle "Definir como padrão": garantir que ao ativar um template como padrão, o anterior perde a flag (via upsert atômico ou RPC)
    - Bloquear exclusão de template referenciado em contratos com status `ativo` ou `gerado`
    - _Requirements: 4.2, 4.3, 4.4, 4.6, 4.8_

  - [x]* 11.3 Escrever property tests para unicidade do template padrão (Property 10)
    - **Property 10: Unicidade do template padrão**
    - **Validates: Requirements 4.3, 4.4**
    - Simular múltiplas operações de definição de padrão e verificar que `count(is_default = true) <= 1`
    - _Arquivo: `src/lib/contracts/__tests__/templateDefault.test.ts`_

---

- [x] 12. Bloco 1 — Wiring: `ContractSettingsTab` refatorado
  - [x] 12.1 Refatorar `ContractSettingsTab` para estrutura de 3 abas
    - Aba 1: `ServiceCatalogTab`
    - Aba 2: `ClausesLibraryTab`
    - Aba 3: `TemplatesTab` refatorado
    - Integrar hooks `useServiceCatalog` e `useContractClauses` nas abas correspondentes
    - _Requirements: 1.8, 2.4, 4.2_

  - [x] 12.2 Checkpoint — Bloco 1 completo
    - Verificar: criação/edição/exclusão/reordenação de serviços funcionando com RLS
    - Verificar: editor de cláusulas com variáveis e drag-and-drop funcionando
    - Verificar: templates com estrutura persistindo e pré-visualização funcionando
    - Executar `vitest run` e confirmar 0 falhas

---

- [x] 13. Bloco 2 — UI: Seletor de Serviços no Formulário de Contrato
  - [x] 13.1 Criar `src/components/contracts/form/ServicesSelectorSection.tsx`
    - Substituir campo `service_contracted` (texto livre) por componente de seleção múltipla alimentado por `useServiceCatalog`
    - Ao selecionar serviço com sub-serviços: expandir campos tipados abaixo (text → `<input type="text">`, number → `<input type="number">`, boolean → `<Checkbox>`, select → `<Select>`)
    - Ao remover serviço: recolher e descartar valores dos sub-serviços
    - Exibir alerta para serviços inválidos (removidos do catálogo) e bloquear submissão
    - _Requirements: 5.1, 5.2, 5.3, 5.6, 5.7_

  - [-]* 13.2 Escrever testes de interação para `ServicesSelectorSection`
    - Selecionar serviço com sub-serviços → campos expandem; remover serviço → campos somem
    - Serviço inválido → alerta exibido, submissão bloqueada
    - _Requirements: 5.3, 5.7_

---

- [x] 14. Bloco 2 — UI: Seção de Setup
  - [x] 14.1 Criar `src/components/contracts/form/SetupSection.tsx`
    - Toggle "Possui Setup/Taxa de Implantação?" (padrão desativado)
    - Ao ativar: exibir campos obrigatórios (valor total, nº parcelas, data 1º vencimento, forma de pagamento) e campo opcional (juros %)
    - Preview em tempo real do valor da parcela usando `calcSetupParcel`
    - Ao desativar: ocultar campos e limpar todos os valores
    - Validação inline: `min_duration < setup_installments` → aviso imediato
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 7.4_

  - [x]* 14.2 Escrever testes de interação para `SetupSection`
    - Ativar toggle → campos aparecem; desativar → campos somem e valores são limpos (Property 15)
    - Preview de parcela atualiza em tempo real com valores corretos
    - _Requirements: 6.3, 6.4_

---

- [x] 15. Bloco 2 — UI: Campo de Prazo Mínimo e wiring do formulário
  - [x] 15.1 Adicionar `MinDurationField` ao `ContractFormModal`
    - Campo inteiro independente com valor padrão 0, label "Prazo Mínimo de Permanência (meses)"
    - Exibir aviso inline quando `prazo_minimo < setup_installments` (com `setup_installments > 1`)
    - Persistir em `contracts.min_duration_months`
    - _Requirements: 7.1, 7.4, 7.5_

  - [x] 15.2 Integrar `ServicesSelectorSection` e `SetupSection` no `ContractFormModal` existente
    - Substituir `service_contracted` por `ServicesSelectorSection`
    - Adicionar `SetupSection` após os campos financeiros existentes
    - Adicionar `MinDurationField`
    - Validação Zod unificada: `contractFormSchema` (inclui cross-validation `min_duration ≥ setup_installments`)
    - Persistir `metadata.services`, `metadata.setup_*` no save
    - Gerar lançamentos financeiros ao salvar contrato com status `ativo` usando `generatePayments`
    - _Requirements: 5.4, 6.5, 6.6, 7.5, 8.1, 8.7, 8.8_

  - [x] 15.3 Checkpoint — Bloco 2 completo
    - Verificar: seleção de serviços com sub-serviços persistindo em `metadata.services`
    - Verificar: setup calculando parcelas corretamente e persistindo `metadata.setup_*`
    - Verificar: `min_duration_months` salvo em `contracts`
    - Verificar: lançamentos gerados em `payments` com valores e descrições corretos
    - Executar `vitest run` e confirmar 0 falhas

---

- [x] 16. Hook `useContractAssembly`
  - [x] 16.1 Criar `src/hooks/useContractAssembly.ts`
    - Recebe `contractId`; carrega contrato + cliente + cláusulas + template via TanStack Query
    - Expor `assemble(): ContractAssemblyResult` que chama `assembleContract` com os dados carregados
    - Gerenciar estado do Modal de Revisão: `isOpen`, `assembledHtml`, `clauseEdits`
    - `editClause(clauseId: string, html: string)`: atualizar `clauseEdits` local e persistir em `metadata.clause_edits`
    - `confirmGenerate()`: chamar `renderContractHtml`, disparar webhook, registrar `generated_at = now()`
    - Tratar erros: template sem `structure` → retornar erro específico; variáveis não resolvidas → toast.warning
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8_

---

- [x] 17. Bloco 3 — UI: `ReviewModal`
  - [x] 17.1 Criar `src/components/contracts/ReviewModal.tsx`
    - Receber `assembledHtml` e `clauseCount` como props
    - Renderizar HTML em painel de pré-visualização (iframe sandbox ou div com estilos isolados)
    - Para cada cláusula com `is_editable = true`: exibir botão "Editar" ao lado do título
    - Ao clicar "Editar": abrir editor TipTap inline com conteúdo da cláusula; ao salvar, chamar `useContractAssembly.editClause` e atualizar preview
    - Botão "Confirmar e Gerar PDF": chamar `useContractAssembly.confirmGenerate()`
    - _Requirements: 9.3, 9.5, 9.6, 9.7_

  - [x] 17.2 Criar `src/components/contracts/GenerateContractButton.tsx`
    - Botão na aba "Contrato" do `ContractDetailPage` existente
    - Ao clicar: verificar template padrão e `structure`; se inválido, exibir erro sem abrir modal
    - Se válido: chamar `useContractAssembly.assemble()` e abrir `ReviewModal`
    - _Requirements: 4.5, 4.6, 9.1, 9.8_

  - [x]* 17.3 Escrever testes de snapshot para `ReviewModal`
    - Snapshot do modal aberto com cláusulas editáveis e não-editáveis
    - _Requirements: 9.5_

---

- [x] 18. Wiring final e integração
  - [x] 18.1 Conectar `GenerateContractButton` ao `ContractDetailPage`
    - Adicionar botão na tab "Contrato" do `ContractDetailPage` existente
    - Integrar `useContractAssembly` passando `contractId`
    - _Requirements: 9.1_

  - [x] 18.2 Implementar lógica de atualização de lançamentos em contratos editados
    - Quando contrato ativo tem `value` ou `metadata.setup_*` atualizados: cancelar pagamentos `pendente` e recriar com `generatePayments`
    - Preservar intactos pagamentos com `status = 'pago'`
    - Tratar idempotência: se lançamento com mesmo `contract_id` + `due_date` já existe e não está pago, atualizar em vez de duplicar
    - _Requirements: 8.7, 8.8_

  - [x] 18.3 Verificar isolamento RLS end-to-end
    - Confirmar que queries de `service_catalog`, `contract_clauses` e `contract_templates` retornam apenas registros da organização do usuário autenticado
    - _Requirements: 10.1, 10.2, 10.3_

  - [x] 18.4 Checkpoint final — Todos os blocos integrados
    - Fluxo completo: configurar serviço → criar cláusula → configurar template → criar contrato com serviços + setup → gerar lançamentos → montar documento → revisar no modal → gerar PDF via webhook
    - Executar `vitest run` e confirmar 0 falhas em toda a suite

---

## Notes

- Tarefas marcadas com `*` são opcionais e podem ser puladas para um MVP mais rápido, mas são fortemente recomendadas dado o nível de lógica financeira e de montagem de documentos
- Funções puras em `src/lib/contracts/` são o coração testável do sistema; implementá-las antes dos componentes permite detectar bugs cedo
- O design usa TypeScript como linguagem de implementação — todos os exemplos de código nas tarefas seguem TypeScript
- `fast-check` deve ser instalado como devDependency: `npm install -D fast-check`
- Cada property test referencia explicitamente o número da propriedade do design document para rastreabilidade
- O TipTap precisa ser instalado: `npm install @tiptap/react @tiptap/starter-kit @tiptap/extension-mention @tiptap/html`
- RLS é implementado nas migrations (Task 1); os hooks apenas consomem o Supabase client autenticado normalmente

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1", "2.2"] },
    { "id": 2, "tasks": ["3.1", "3.3", "4.1", "4.3", "5.1"] },
    { "id": 3, "tasks": ["3.2", "3.4", "4.2", "4.4", "5.2"] },
    { "id": 4, "tasks": ["5.3", "6.1", "7.1", "8.1"] },
    { "id": 5, "tasks": ["6.2", "6.3", "7.2", "8.2"] },
    { "id": 6, "tasks": ["6.4", "6.5", "9.1", "9.2", "10.1"] },
    { "id": 7, "tasks": ["9.3", "10.2", "10.3", "10.4", "11.1", "11.2"] },
    { "id": 8, "tasks": ["10.5", "11.3", "12.1"] },
    { "id": 9, "tasks": ["12.2", "13.1", "16.1"] },
    { "id": 10, "tasks": ["13.2", "14.1", "15.1"] },
    { "id": 11, "tasks": ["14.2", "15.2"] },
    { "id": 12, "tasks": ["15.3", "17.1", "17.2"] },
    { "id": 13, "tasks": ["17.3", "18.1", "18.2", "18.3"] },
    { "id": 14, "tasks": ["18.4"] }
  ]
}
```
