# Contract System Improvements — Design

## Arquitetura Geral

### Banco de Dados (Banco A — Maestr.ia)

```
organizations
├── contract_templates          (existente)
├── contract_clause_categories  (existente, global)
├── contract_clauses            (existente + novas colunas)
│   └── + condition_type TEXT
│   └── + condition_value JSONB
├── contract_service_blocks     (existente — só regras financeiras)
├── contracts_v2                (existente)
│   └── + signing_type TEXT
├── contract_signature_blocks   (NOVO)
│   ├── id, organization_id, name, slug
│   ├── html_content TEXT
│   ├── display_order, is_active
│   └── created_at, updated_at
└── client_representatives      (NOVO)
    ├── id, client_id, organization_id
    ├── nome, cpf, cargo
    ├── is_signing_responsible BOOLEAN
    ├── display_order
    └── created_at, updated_at

clients                         (existente + nova coluna)
└── + signing_type TEXT DEFAULT 'individual'
    CHECK (signing_type IN ('individual', 'joint'))
```

---

## Design Detalhado por Feature

### Feature 1: Blocos de Assinatura

#### Fluxo de dados
```
Configurações → Contratos → Assinaturas
    ↓ edita
contract_signature_blocks (banco)
    ↓ lido por
useSignatureBlocks() hook
    ↓ resolvido em
ContractGenerator.handleSave()
    → baseVars['assinatura_contratada'] = sigBlock.html_content (com vars substituídas)
    → baseVars['assinatura_contratante'] = sigBlock.html_content (com vars substituídas)
    → baseVars['assinatura_testemunhas'] = sigBlock.html_content (com vars substituídas)
    ↓ passa para
assembleAllClauses() → renderTemplate()
    ↓ resultado
ContractViewer (sem extração prévia de sigHtml)
```

#### HTML gerado pelos blocos (display:table)
```html
<!-- assinatura_contratada -->
<div class="sig-block-single">
  <p class="sig-line">_______________________________________________</p>
  <p><strong>CONTRATADA: AGÊNCIA C8 LTDA</strong></p>
</div>

<!-- assinatura_contratante (1 representante) -->
<div class="sig-block-single">
  <p class="sig-line">_______________________________________________</p>
  <p><strong>CONTRATANTE: {{contratante_razao_social}}</strong></p>
  <p>{{representante_nome}}</p>
</div>

<!-- assinatura_contratante (2 representantes — joint) -->
<div class="sig-block-table">
  <div class="sig-col">
    <p class="sig-line">_______________</p>
    <p><strong>{{representante_nome}}</strong></p>
  </div>
  <div class="sig-col">
    <p class="sig-line">_______________</p>
    <p><strong>{{representante_2_nome}}</strong></p>
  </div>
</div>
```

#### CSS adicional no contractCss
```css
.sig-block-single { margin-top: 36pt; }
.sig-block-table  { display: table; width: 100%; table-layout: fixed; margin-top: 36pt; }
.sig-col          { display: table-cell; text-align: center; padding: 0 16pt; }
.sig-line         { border-bottom: 1px solid #000; margin-bottom: 4pt; }
```

#### Botão "2 colunas" no editor
Insere snippet HTML fixo que o usuário pode editar:
```html
<div class="sig-block-table">
  <div class="sig-col"><p class="sig-line">&nbsp;</p><p>Nome / Empresa</p></div>
  <div class="sig-col"><p class="sig-line">&nbsp;</p><p>Nome / Empresa</p></div>
</div>
```

---

### Feature 2: Tabelas no TipTap

#### Dependências a instalar
```
@tiptap/extension-table
@tiptap/extension-table-row
@tiptap/extension-table-header
@tiptap/extension-table-cell
```

#### Extensões no editor
```ts
Table.configure({ resizable: false }), // resizable cria dependência de prosemirror-tables
TableRow,
TableHeader,
TableCell,
```

#### Toolbar — grupo de tabela
```
[Inserir Tabela ▾] | [+Linha▲] [+Linha▼] | [+Col◄] [+Col►] | [×Linha] [×Col] [×Tabela]
```

Inserir Tabela abre um mini-popover com grid 1-6 × 1-6 para seleção de dimensões, ou campo numérico direto.

---

### Feature 3: Representantes Legais

#### Componente RepresentativesEditor
Localização: `src/components/clients/RepresentativesEditor.tsx`

```
ClientFormDialog / ClientDetailPage
  └── Tab "Representantes" (nova)
      └── RepresentativesEditor
          ├── Lista de representantes (drag to reorder)
          ├── Botão "Adicionar representante"
          ├── Para cada representante:
          │   ├── Nome (Input)
          │   ├── CPF (Input com máscara)
          │   ├── Cargo (Input opcional)
          │   └── Toggle "Responsável pela assinatura"
          └── Select "Tipo de assinatura": Individual | Conjunta
```

#### Hook useClientRepresentatives
```ts
// src/hooks/useClientRepresentatives.ts
interface ClientRepresentative {
  id: string;
  client_id: string;
  organization_id: string;
  nome: string;
  cpf: string;
  cargo: string | null;
  is_signing_responsible: boolean;
  display_order: number;
}

function useClientRepresentatives(clientId: string)
// → { representatives, saveRepresentative, removeRepresentative, reorderRepresentative }
```

#### Integração no ContractGenerator (Step 3)
- Carrega representantes do cliente via `useClientRepresentatives(clientId)`
- Preenche automaticamente `representante_nome`, `representante_cpf` com o `is_signing_responsible`
- Expõe `representante_2_nome`, `representante_2_cpf`, `representante_3_nome`, etc. para os demais
- Campo `representante_qualificacao` = texto formatado com todos os representantes (para o preâmbulo)

---

### Feature 4: Cláusulas Condicionais por Atributo

#### Lógica de avaliação em assembleAllClauses
```ts
function evaluateClauseCondition(
  clause: ContractClause,
  context: ContractConditionContext,
): boolean {
  // Retrocompatibilidade
  if (clause.condition_type == null) {
    return clause.service_slug == null || context.selectedSlugs.includes(clause.service_slug);
  }

  switch (clause.condition_type) {
    case 'always':
      return true;
    case 'service':
      return (clause.condition_value?.slugs ?? []).some(s => context.selectedSlugs.includes(s));
    case 'has_setup':
      return context.totalSetup > 0;
    case 'has_min_duration':
      return context.prazoMeses >= (clause.condition_value?.min_months ?? 1);
    case 'has_multiple_representatives':
      return context.representativeCount > 1;
    case 'signing_type':
      return context.signingType === clause.condition_value?.type;
    case 'has_schedule':
      return context.scheduleLines.length > 0;
    case 'service_count':
      return context.selectedSlugs.length >= (clause.condition_value?.min ?? 1);
    default:
      return true;
  }
}

interface ContractConditionContext {
  selectedSlugs: string[];
  totalSetup: number;
  totalMonthly: number;
  prazoMeses: number;
  representativeCount: number;
  signingType: 'individual' | 'joint';
  scheduleLines: ContractPaymentLine[];
}
```

#### UI no ClauseEditor — novo painel de condição
```
Condição de inclusão:
  [Dropdown: Sempre incluir ▾]
  
  Se "Serviço específico":
    [MultiSelect de serviços]
  
  Se "Prazo mínimo":
    [Input número] meses
  
  Se "Tipo de assinatura":
    [Select: Individual | Conjunta]
  
  Se "Qtd. serviços mínima":
    [Input número] serviços
```

---

### Feature 5: Desacoplamento ServiceBlockEditor

#### Mudanças no ServiceBlockEditor
- Remover tab "Cláusulas" (editor TipTap de `html_content`)
- Manter apenas: Nome, Slug, Descrição, Regras Financeiras (setup, mensalidade, carência, pagamento único)
- Exibir aviso: "O conteúdo das cláusulas é gerenciado na aba Alíneas, vinculando pelo slug do serviço."

#### Mudanças no ContractGenerator Step 2
- Serviços listados vêm de `useServiceBlocks()` (já é o caso)
- Nenhuma referência a `serviceBlock.html_content` na montagem do contrato
- `assembleAllClauses` usa apenas `condition_type = 'service'` com `condition_value.slugs`

---

## Migrações SQL

### Migration: contract_signature_blocks + client_representatives + condition_type

Arquivo: `supabase/migrations/00205_contract_improvements.sql`

Estrutura:
1. CREATE TABLE `contract_signature_blocks` (IF NOT EXISTS)
2. RLS + trigger updated_at
3. ALTER TABLE `clients` ADD COLUMN `signing_type`
4. CREATE TABLE `client_representatives` (IF NOT EXISTS)
5. RLS + trigger updated_at
6. ALTER TABLE `contract_clauses` ADD COLUMN `condition_type`, `condition_value`
7. Seed padrão de `contract_signature_blocks` por organização
8. INSERT INTO `schema_migrations` com versão

### Seed dos blocos de assinatura padrão
```sql
-- Bloco CONTRATADA
INSERT INTO public.contract_signature_blocks (organization_id, name, slug, html_content, display_order)
SELECT id, 'Assinatura — Contratada', 'assinatura_contratada',
  '<div class="sig-block-single">
    <p class="sig-line">_______________________________________________</p>
    <p><strong>CONTRATADA:</strong></p>
    <p><strong>AGÊNCIA C8 LTDA</strong></p>
  </div>', 1
FROM public.organizations
ON CONFLICT DO NOTHING;

-- Bloco CONTRATANTE (individual)
INSERT INTO public.contract_signature_blocks (organization_id, name, slug, html_content, display_order)
SELECT id, 'Assinatura — Contratante', 'assinatura_contratante',
  '<div class="sig-block-single">
    <p class="sig-line">_______________________________________________</p>
    <p><strong>CONTRATANTE: {{contratante_razao_social}}</strong></p>
    <p>{{representante_nome}} — CPF: {{representante_cpf}}</p>
  </div>', 2
FROM public.organizations
ON CONFLICT DO NOTHING;

-- Bloco TESTEMUNHAS
INSERT INTO public.contract_signature_blocks (organization_id, name, slug, html_content, display_order)
SELECT id, 'Assinatura — Testemunhas', 'assinatura_testemunhas',
  '<div class="sig-block-table">
    <div class="sig-col">
      <p class="sig-line">____________________________________</p>
      <p>Nome:</p>
    </div>
    <div class="sig-col">
      <p class="sig-line">____________________________________</p>
      <p>Nome:</p>
    </div>
  </div>', 3
FROM public.organizations
ON CONFLICT DO NOTHING;
```

---

## Impacto em Arquivos Existentes

| Arquivo | Tipo de mudança |
|---|---|
| `supabase/migrations/00205_contract_improvements.sql` | NOVO |
| `src/hooks/useContractTemplates.ts` | + `useSignatureBlocks()` |
| `src/hooks/useClientRepresentatives.ts` | NOVO |
| `src/components/contracts/ClauseEditor.tsx` | + Table extension + painel condição |
| `src/components/contracts/ContractTemplateEditor.tsx` | + Table extension |
| `src/components/contracts/ServiceBlockEditor.tsx` | - tab cláusulas |
| `src/components/settings/ContractSettingsTab.tsx` | + tab Assinaturas |
| `src/components/contracts/SignatureBlockEditor.tsx` | NOVO |
| `src/components/clients/RepresentativesEditor.tsx` | NOVO |
| `src/components/contracts/ContractGenerator.tsx` | + resolução sig blocks + representantes |
| `src/components/contracts/ContractViewer.tsx` | + CSS sig-block-* + simplificar extração sigHtml |
| `migrations/bank_b_full_schema.sql` | SEM alteração (banco B não tem contratos) |
