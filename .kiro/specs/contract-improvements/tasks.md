# Contract System Improvements — Tasks

## Status: ✅ IMPLEMENTADO

TypeScript sem erros. Migration 00205 validada sintaticamente.

---

## Task 1: Migration SQL (00205) ✅

**Arquivo:** `supabase/migrations/00205_contract_improvements.sql`

- [x] 1.1 CREATE TABLE `contract_signature_blocks` com RLS e trigger
- [x] 1.2 ALTER TABLE `clients` ADD COLUMN `signing_type TEXT DEFAULT 'individual'`
- [x] 1.3 CREATE TABLE `client_representatives` com RLS e trigger
- [x] 1.4 ALTER TABLE `contract_clauses` ADD COLUMN `condition_type TEXT`, `condition_value JSONB`
- [x] 1.5 Seed dos 3 blocos de assinatura padrão por organização (assinatura_contratada, assinatura_contratante, assinatura_testemunhas)
- [x] 1.6 INSERT INTO schema_migrations versão `contract_improvements_v1`

## Task 2: Hooks ✅

- [x] 2.1 Tipo `SignatureBlock` e hook `useSignatureBlocks()` adicionados em `useContractTemplates.ts`
- [x] 2.2 `src/hooks/useClientRepresentatives.ts` criado com CRUD completo
- [x] 2.3 Tipo `ContractClause` atualizado com `condition_type` e `condition_value`
- [x] 2.4 `saveClause` atualizado para persistir `condition_type` e `condition_value`

## Task 3: Table Extension (TipTap) ✅

- [x] 3.1 `@tiptap/extension-table`, `table-row`, `table-header`, `table-cell` instalados (`--legacy-peer-deps`)
- [x] 3.2 `src/lib/tiptap/tableExtensions.ts` criado com extensões compartilhadas
- [x] 3.3 `src/components/contracts/TableToolbar.tsx` criado com grid picker e botões de linha/coluna/mesclar
- [x] 3.4 Tabelas adicionadas no `ClauseEditor.tsx` (extensões + toolbar)
- [x] 3.5 Tabelas adicionadas no `ContractTemplateEditor.tsx` (extensões + toolbar)
- [x] 3.6 `ServiceBlockEditor.tsx` simplificado (tab de cláusulas removida, aviso adicionado)

## Task 4: Editor de Blocos de Assinatura ✅

- [x] 4.1 `src/components/contracts/SignatureBlockEditor.tsx` criado
  - Editor TipTap com toolbar completa + tabelas
  - Snippets prontos: 1 coluna e 2 colunas (display:table)
  - Variáveis de representantes e assinatura disponíveis
  - Campo slug com preview da variável `{{slug}}`
- [x] 4.2 CSS `sig-block-single`, `sig-block-table`, `sig-col`, `sig-line` adicionados ao `contractCss` no `ContractViewer.tsx`
- [x] 4.3 Tab "Assinaturas" adicionada em `ContractSettingsTab.tsx` (`SignaturesSection`)
- [x] 4.4 Variáveis `assinatura_*` e `representante_2/3_*` adicionadas ao `ContractTemplateEditor.tsx`

## Task 5: Integração no ContractGenerator ✅

- [x] 5.1 `useSignatureBlocks()` e `useClientRepresentatives(clientId)` adicionados ao componente
- [x] 5.2 Representantes legais resolvidos: principal, 2º, 3º, qualificação completa
- [x] 5.3 Blocos de assinatura resolvidos via `resolveSignatureBlock()` e injetados em `baseVars`
- [x] 5.4 `ContractConditionContext` montado com todos os atributos (slugs, setup, prazo, representantes, signingType, schedule)
- [x] 5.5 `assembleAllClauses` atualizado para aceitar `conditionCtx` e usar `evaluateClauseCondition`

## Task 6: Representantes Legais ✅

- [x] 6.1 `src/components/clients/RepresentativesEditor.tsx` criado
  - Lista de representantes com CRUD
  - Toggle "Responsável pela assinatura" (estrela)
  - Select de tipo de assinatura (Individual / Conjunta)
  - Máscara de CPF
- [x] 6.2 `RepresentativesEditor` integrado no `ClientsPage.tsx` dentro do Dialog de edição
  - Aparece apenas quando editando cliente existente (`editing?.id`)
  - `signingType` inicializado ao abrir o modal de edição
  - Alteração do `signing_type` persiste via `update.mutateAsync`

## Task 7: Condições de Cláusulas ✅

- [x] 7.1 `src/lib/contracts/evaluateClauseCondition.ts` criado
  - Suporta: `always`, `service`, `has_setup`, `has_min_duration`, `has_multiple_representatives`, `signing_type`, `has_schedule`, `service_count`
  - Retrocompatibilidade total com `is_fixed` / `service_slug`
- [x] 7.2 `assembleAllClauses` no `ContractGenerator.tsx` atualizado para usar `evaluateClauseCondition`
- [x] 7.3 `ClauseEditor.tsx` redesenhado com dropdown de tipos de condição + parâmetros dinâmicos por tipo

## Task 8: Desacoplamento ServiceBlockEditor ✅

- [x] 8.1 Tab "Cláusulas" (TipTap editor) removida do `ServiceBlockEditor.tsx`
- [x] 8.2 Aviso sobre aba Alíneas adicionado no lugar
- [x] 8.3 `assembleAllClauses` usa `evaluateClauseCondition` — não acessa `serviceBlock.html_content`

---

## Arquivos Criados

| Arquivo | Descrição |
|---|---|
| `supabase/migrations/00205_contract_improvements.sql` | Migration com 3 novas tabelas/colunas + seed |
| `src/hooks/useClientRepresentatives.ts` | Hook CRUD para representantes legais |
| `src/lib/contracts/evaluateClauseCondition.ts` | Função pura de avaliação de condições |
| `src/lib/tiptap/tableExtensions.ts` | Extensões TipTap de tabela compartilhadas |
| `src/components/contracts/TableToolbar.tsx` | Toolbar de tabela reutilizável |
| `src/components/contracts/SignatureBlockEditor.tsx` | Editor de blocos de assinatura |
| `src/components/clients/RepresentativesEditor.tsx` | Editor de representantes legais |
| `.kiro/specs/contract-improvements/requirements.md` | Requisitos detalhados |
| `.kiro/specs/contract-improvements/design.md` | Design técnico |

## Arquivos Modificados

| Arquivo | Mudanças |
|---|---|
| `src/hooks/useContractTemplates.ts` | + `SignatureBlock` type + `useSignatureBlocks()` + campos `condition_type/value` em `ContractClause` + `saveClause` payload atualizado |
| `src/components/contracts/ClauseEditor.tsx` | + tabelas + novo painel de condição com 8 tipos + variáveis de representantes/assinatura |
| `src/components/contracts/ContractTemplateEditor.tsx` | + tabelas + variáveis de assinatura/representantes em `DATA_VARIABLES` |
| `src/components/contracts/ContractGenerator.tsx` | + resolução de representantes + resolução de blocos de assinatura + `ContractConditionContext` + `assembleAllClauses` com `evaluateClauseCondition` |
| `src/components/contracts/ServiceBlockEditor.tsx` | Tab de cláusulas removida, aviso adicionado |
| `src/components/contracts/ContractViewer.tsx` | + CSS `sig-block-*` para blocos de assinatura configuráveis |
| `src/components/settings/ContractSettingsTab.tsx` | + tab "Assinaturas" com `SignaturesSection` |
| `src/pages/ClientsPage.tsx` | + `RepresentativesEditor` no modal de edição de cliente |

## Pendências Pós-Deploy

1. **Executar `00205_contract_improvements.sql`** no banco A (Maestr.ia)
2. **Atualizar o template HTML** dos contratos existentes para usar as novas variáveis `{{assinatura_contratada}}`, `{{assinatura_contratante}}`, `{{assinatura_testemunhas}}` no lugar do bloco `<section class="contract-signatures">` hardcoded
3. **Cadastrar representantes** nos clientes que já possuem contratos gerados (dados retroativos)
4. **Revisar alíneas condicionais** existentes — migrar as que usam `service_slug` para o novo `condition_type = 'service'` se desejado (retrocompatibilidade garante que ambos funcionam)
