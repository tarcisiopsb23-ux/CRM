# Contract System Improvements — Requirements

## Overview

Conjunto de melhorias ao sistema de contratos do C8 Control, cobrindo:
1. Blocos de assinatura configuráveis e editáveis como variáveis
2. Suporte a tabelas nos editores de alínea e template
3. Múltiplos representantes legais no cadastro do cliente
4. Cláusulas condicionais por atributos do contrato (não só por serviço)
5. Desacoplamento das cláusulas condicionais da sub-aba Serviços

---

## REQ-1: Blocos de Assinatura Configuráveis

### Contexto
Atualmente o bloco de assinatura é HTML hardcoded no template, usando `display:flex` que impede medição correta pelo algoritmo de paginação (`splitIntoPages`). Isso causa espaço em branco excessivo no final dos contratos.

### Requisitos

**REQ-1.1** — Criar nova entidade `signature_block` no banco A com campos:
- `id`, `organization_id`, `name`, `slug` (único por org)
- `html_content` (TEXT) — HTML editável com suporte a layout de 2 colunas via `display:table`
- `is_active`, `display_order`, `created_at`, `updated_at`

**REQ-1.2** — O editor de blocos de assinatura deve ser o mesmo componente do editor de alíneas (`ClauseEditor`), com as mesmas capacidades (formatação, variáveis, tabelas).

**REQ-1.3** — Suporte a layout de 2 colunas usando `display:table` (não `display:flex`), para compatibilidade com o algoritmo de paginação. O editor deve oferecer um botão "Inserir 2 colunas" que gera o HTML de tabela correto.

**REQ-1.4** — Os blocos de assinatura são inseridos no template via variáveis:
- `{{assinatura_contratada}}` → bloco da CONTRATADA
- `{{assinatura_contratante}}` → bloco do CONTRATANTE (usa variáveis do cliente)
- `{{assinatura_testemunhas}}` → bloco das TESTEMUNHAS
- Cada variável corresponde a um registro de `signature_block` identificado por `slug`

**REQ-1.5** — Na geração do contrato (`ContractGenerator`), os blocos de assinatura são resolvidos **antes** do `renderTemplate`, injetando o HTML diretamente nas variáveis. O `splitIntoPages` processa tudo sem extração prévia.

**REQ-1.6** — A sub-aba de gerenciamento de blocos de assinatura fica em **Configurações → Contratos → Assinaturas** (nova tab).

**REQ-1.7** — Variáveis disponíveis dentro de um bloco de assinatura:
- Todas as variáveis de partes (`contratante_razao_social`, `representante_nome`, `representante_cpf`)
- Variáveis de múltiplos representantes (ver REQ-3): `representante_2_nome`, `representante_2_cpf`, etc.
- `data_assinatura`, `cidade_estado`

---

## REQ-2: Tabelas nos Editores

### Contexto
O TipTap suporta tabelas via extensão `@tiptap/extension-table`. Nenhum dos editores do sistema de contratos tem suporte a tabelas atualmente.

### Requisitos

**REQ-2.1** — Adicionar `@tiptap/extension-table`, `@tiptap/extension-table-row`, `@tiptap/extension-table-header` e `@tiptap/extension-table-cell` nos seguintes editores:
- `src/components/contracts/ClauseEditor.tsx`
- `src/components/contracts/ContractTemplateEditor.tsx`
- `src/components/contracts/ServiceBlockEditor.tsx`

**REQ-2.2** — A toolbar de cada editor deve incluir controles de tabela:
- Inserir tabela (com seletor de linhas/colunas)
- Adicionar linha acima/abaixo
- Adicionar coluna esquerda/direita
- Remover linha / coluna / tabela
- Mesclar células / dividir célula mesclada

**REQ-2.3** — O CSS do `contractCss` no `ContractViewer.tsx` já tem estilos para `table`, `th`, `td` — nenhuma alteração necessária no viewer.

**REQ-2.4** — O editor deve aplicar CSS de tabela no painel de edição para preview fiel (via `editorProps.attributes` ou CSS injetado).

---

## REQ-3: Múltiplos Representantes Legais

### Contexto
Hoje o cliente tem apenas `representante_nome` e `representante_cpf` capturados no wizard de contrato. Empresas com múltiplos sócios ou assinatura conjunta precisam de suporte a vários representantes.

### Requisitos

**REQ-3.1** — Adicionar nova seção "Representantes Legais" no cadastro do cliente (módulo Clientes), com suporte a N representantes. Cada representante tem:
- `nome` (obrigatório)
- `cpf` (obrigatório)
- `cargo` (opcional, ex: "Sócio-Administrador", "Diretor")
- `is_signing_responsible` (boolean) — quem assina o contrato

**REQ-3.2** — Campo `signing_type` no cadastro do cliente:
- `individual` — apenas o responsável pela assinatura assina
- `joint` — todos os representantes assinam em conjunto

**REQ-3.3** — Os dados de representantes ficam em tabela separada `client_representatives` no banco A (não no banco B):
```
id, client_id, organization_id, nome, cpf, cargo, is_signing_responsible,
display_order, created_at, updated_at
```

**REQ-3.4** — No `ContractGenerator` (Step 3 — Variáveis), os campos de representante são preenchidos automaticamente a partir dos representantes cadastrados, com possibilidade de edição:
- `representante_nome` / `representante_cpf` → representante marcado como `is_signing_responsible`
- `representante_2_nome` / `representante_2_cpf` → segundo representante (se houver)
- `representante_3_nome` / `representante_3_cpf` → terceiro (se houver)
- `representante_qualificacao` → texto composto com todos os representantes formatados para o preâmbulo do contrato

**REQ-3.5** — Quando `signing_type = joint`, a variável `{{assinatura_contratante}}` inclui automaticamente todos os representantes no bloco de assinatura.

---

## REQ-4: Cláusulas Condicionais por Atributos do Contrato

### Contexto
Hoje a condicionalidade de alíneas é binária: fixa (sempre entra) ou vinculada a um `service_slug`. Não há como condicionar por atributos do contrato como prazo mínimo, setup, tipo de assinatura, etc.

### Requisitos

**REQ-4.1** — Adicionar coluna `condition_type` (TEXT) e `condition_value` (JSONB) na tabela `contract_clauses`. Tipos de condição suportados:

| `condition_type` | Descrição | `condition_value` exemplo |
|---|---|---|
| `always` | Entra em todo contrato (equivale ao `is_fixed=true` atual) | `null` |
| `service` | Vinculada a serviço(s) | `{"slugs": ["agente_ia"]}` |
| `has_setup` | Contrato tem valor de setup > 0 | `null` |
| `has_min_duration` | Contrato tem prazo mínimo | `{"min_months": 12}` |
| `has_multiple_representatives` | Cliente tem mais de 1 representante | `null` |
| `signing_type` | Tipo de assinatura específico | `{"type": "joint"}` |
| `has_schedule` | Contrato tem cronograma de pagamento | `null` |
| `service_count` | Número de serviços contratados | `{"min": 2}` |

**REQ-4.2** — `is_fixed` e `service_slug` continuam funcionando para retrocompatibilidade. Novos registros usam `condition_type`/`condition_value`. A lógica de avaliação em `assembleAllClauses` suporta ambos.

**REQ-4.3** — Na UI do `ClauseEditor`, o campo de condição é redesenhado:
- Dropdown "Tipo de condição" com as opções acima
- Campo adicional dependendo do tipo selecionado (ex: seletor de serviço para `service`, campo numérico para `has_min_duration`)

**REQ-4.4** — No `ContractGenerator`, `assembleAllClauses` avalia `condition_type` usando os dados do contrato sendo criado (serviços selecionados, cronograma, representantes, etc.).

---

## REQ-5: Desacoplamento das Cláusulas da Sub-aba Serviços

### Contexto
A sub-aba Serviços ainda é necessária para gerenciar metadados e regras financeiras dos serviços. Mas as cláusulas condicionais não devem depender dela para funcionar — `condition_type = 'service'` deve referenciar slugs do catálogo de serviços, não da sub-aba de contratos.

### Requisitos

**REQ-5.1** — A função `assembleAllClauses` no `ContractGenerator` avalia condições usando `condition_type = 'service'` com `condition_value.slugs` comparado aos `selectedSlugs` do wizard. Não usa `serviceBlock.html_content`.

**REQ-5.2** — O campo `html_content` de `contract_service_blocks` é marcado como DEPRECATED na UI (não editável pelo `ServiceBlockEditor`). O `ServiceBlockEditor` exibe apenas nome, slug, descrição e regras financeiras.

**REQ-5.3** — No `ContractGenerator` Step 2 (Serviços), os serviços listados vêm do catálogo de serviços/produtos da organização — não exclusivamente de `contract_service_blocks`. A seleção de serviços alimenta tanto o cronograma financeiro quanto as condições das cláusulas.

---

## Ordem de Implementação Recomendada

1. **REQ-2** (Tabelas) — mais isolado, sem dependências de banco
2. **REQ-3 banco** (migration `client_representatives`) — base para REQ-3 UI e REQ-4
3. **REQ-3 UI** (Representantes no cadastro do cliente)
4. **REQ-1 banco** (migration `signature_blocks`)
5. **REQ-1 UI** (Editor de assinaturas + variáveis no template)
6. **REQ-4 banco** (migration `condition_type` em `contract_clauses`)
7. **REQ-4 UI** (ClauseEditor + assembleAllClauses)
8. **REQ-5** (Desacoplamento ServiceBlockEditor)
