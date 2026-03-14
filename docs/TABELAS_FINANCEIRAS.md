# Documentação das Tabelas Financeiras

## Visão Geral

O módulo Financeiro do CRM/ERP Maestr.IA é composto por **6 tabelas principais** que gerenciam receitas, despesas operacionais, folha de pagamento e contas a receber/pagar.

```
Módulo Financeiro:
├── Receitas (Accounts Receivable)
│   ├── contracts      → Contratos com clientes
│   └── payments       → Pagamentos recebidos
├── Despesas Operacionais
│   ├── suppliers      → Fornecedores
│   └── supplier_expenses → Despesas com fornecedores
└── Folha de Pagamento (Payroll)
    ├── payrolls           → Registros individuais de folha
    └── payroll_expenses   → Agregação mensal para Financeiro
```

---

## 1. Tabela: `contracts`

**Descrição:** Armazena contratos firmados com clientes, base para rastreamento de receitas.

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|------------|-----------|
| `id` | UUID | ✅ | Identificador único (PK) |
| `client_id` | UUID | ✅ | Referência ao cliente (FK: clients.id) |
| `organization_id` | UUID | ✅ | Organização/empresa (FK: organizations.id) |
| `responsible_id` | UUID | ❌ | Responsável do contrato (FK: profiles.id) |
| `title` | VARCHAR(255) | ✅ | Título/nome do contrato |
| `description` | TEXT | ❌ | Descrição detalhada |
| `value` | DECIMAL(15,2) | ✅ | Valor total do contrato |
| `status` | VARCHAR(50) | ✅ | Status: `rascunho`, `ativo`, `encerrado`, `cancelado` |
| `start_date` | DATE | ✅ | Data de início do contrato |
| `end_date` | DATE | ❌ | Data de encerramento (atualizado via trigger) |
| `billing_cycle` | VARCHAR(50) | ❌ | Ciclo de cobrança (ex: "mensal", "bimestral") |
| `metadata` | JSONB | ❌ | Dados adicionais em JSON |
| `created_at` | TIMESTAMPTZ | ✅ | Data de criação (auto) |
| `updated_at` | TIMESTAMPTZ | ✅ | Data de atualização (auto, trigger) |

**Índices:**
- `idx_contracts_organization_id` → Filtro por organização
- `idx_contracts_client_id` → Busca por cliente
- `idx_contracts_status` → Filtro por status

**RLS:** Ativado (isolamento por organização)

**Triggers:**
- `update_contract_status` → Atualiza status automaticamente baseado em datas

---

## 2. Tabela: `payments`

**Descrição:** Registra pagamentos recebidos de clientes (contas a receber). Pode estar vinculado a um contrato específico ou ser um pagamento direto.

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|------------|-----------|
| `id` | UUID | ✅ | Identificador único (PK) |
| `organization_id` | UUID | ✅ | Organização/empresa (FK: organizations.id) |
| `contract_id` | UUID | ❌ | Contrato relacionado (FK: contracts.id) |
| `client_id` | UUID | ✅ | Cliente (FK: clients.id) |
| `description` | VARCHAR(500) | ✅ | Descrição do pagamento |
| `value` | DECIMAL(15,2) | ✅ | Valor do pagamento |
| `due_date` | DATE | ✅ | Data de vencimento |
| `paid_at` | TIMESTAMPTZ | ❌ | Data/hora do pagamento efetivo |
| `status` | payment_status | ✅ | Status: `pendente`, `pago`, `atrasado`, `cancelado` |
| `payment_method` | VARCHAR(50) | ❌ | Método: `boleto`, `pix`, `transferencia`, `dinheiro`, `cartao` |
| `metadata` | JSONB | ❌ | Dados adicionais em JSON |
| `created_at` | TIMESTAMPTZ | ✅ | Data de criação (auto) |
| `updated_at` | TIMESTAMPTZ | ✅ | Data de atualização (auto, trigger) |

**Índices:**
- `idx_payments_organization_id` → Filtro por organização
- `idx_payments_client_id` → Busca por cliente
- `idx_payments_contract_id` → Associação com contrato
- `idx_payments_due_date` → Vencimentos e relatórios
- `idx_payments_status` → Filtro de pendências

**RLS:** Ativado (isolamento por organização)

---

## 3. Tabela: `suppliers`

**Descrição:** Cadastro de fornecedores/vendedores.

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|------------|-----------|
| `id` | UUID | ✅ | Identificador único (PK) |
| `organization_id` | UUID | ✅ | Organização/empresa (FK: organizations.id) |
| `name` | VARCHAR(255) | ✅ | Nome do fornecedor |
| `document` | VARCHAR(50) | ❌ | CNPJ ou CPF |
| `email` | VARCHAR(255) | ❌ | Email de contato |
| `phone` | VARCHAR(50) | ❌ | Telefone |
| `address_street` | TEXT | ❌ | Endereço (rua) |
| `address_city` | VARCHAR(100) | ❌ | Cidade |
| `address_state` | VARCHAR(50) | ❌ | Estado (UF) |
| `address_zip` | VARCHAR(20) | ❌ | CEP |
| `metadata` | JSONB | ❌ | Dados adicionais em JSON |
| `created_at` | TIMESTAMPTZ | ✅ | Data de criação (auto) |
| `updated_at` | TIMESTAMPTZ | ✅ | Data de atualização (auto, trigger) |

**Índices:**
- `idx_suppliers_organization_id` → Filtro por organização

**RLS:** Ativado (isolamento por organização)

---

## 4. Tabela: `supplier_expenses`

**Descrição:** Registra despesas (contas a pagar) com fornecedores.

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|------------|-----------|
| `id` | UUID | ✅ | Identificador único (PK) |
| `organization_id` | UUID | ✅ | Organização/empresa (FK: organizations.id) |
| `supplier_id` | UUID | ✅ | Fornecedor (FK: suppliers.id) |
| `description` | VARCHAR(500) | ✅ | Descrição da despesa |
| `value` | DECIMAL(15,2) | ✅ | Valor da despesa |
| `due_date` | DATE | ✅ | Data de vencimento |
| `paid_at` | TIMESTAMPTZ | ❌ | Data/hora do pagamento efetivo |
| `status` | payment_status | ✅ | Status: `pendente`, `pago`, `atrasado`, `cancelado` |
| `metadata` | JSONB | ❌ | Dados adicionais em JSON |
| `created_at` | TIMESTAMPTZ | ✅ | Data de criação (auto) |
| `updated_at` | TIMESTAMPTZ | ✅ | Data de atualização (auto, trigger) |

**Índices:**
- `idx_supplier_expenses_organization_id` → Filtro por organização
- `idx_supplier_expenses_supplier_id` → Associação com fornecedor
- `idx_supplier_expenses_due_date` → Vencimentos e relatórios

**RLS:** Ativado (isolamento por organização)

---

## 5. Tabela: `payrolls`

**Descrição:** Registros individuais de folha de pagamento (um registro por funcionário/mês).

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|------------|-----------|
| `id` | UUID | ✅ | Identificador único (PK) |
| `organization_id` | UUID | ✅ | Organização/empresa (FK: organizations.id) |
| `profile_id` | UUID | ✅ | Funcionário/perfil (FK: profiles.id) |
| `reference_date` | DATE | ✅ | Mês de referência (ex: 2024-03-01) |
| `payment_date` | DATE | ❌ | Data do pagamento efetivo |
| `base_salary` | NUMERIC(10,2) | ✅ | Salário base |
| `commission` | NUMERIC(10,2) | ✅ | Comissões (padrão: 0) |
| `bonus` | NUMERIC(10,2) | ✅ | Bônus (padrão: 0) |
| `overtime` | NUMERIC(10,2) | ✅ | Horas extras (padrão: 0) |
| `discounts` | NUMERIC(10,2) | ✅ | Descontos (INSS, IRRF, etc.) (padrão: 0) |
| `total_value` | NUMERIC(10,2) | ✅ | **GERADO**: `base_salary + commission + bonus + overtime - discounts` |
| `status` | VARCHAR(50) | ✅ | Status: `pending`, `paid` |
| `created_at` | TIMESTAMPTZ | ✅ | Data de criação (auto) |

**Campos Gerados (não inserir diretamente):**
- `total_value` → Coluna computada automaticamente

**Índices:**
- `idx_payrolls_organization_id` → Filtro por organização
- `idx_payrolls_profile_id` → Associação com funcionário
- `idx_payrolls_reference_date` → Busca por período

**RLS:** Ativado (admins/managers gerenciam; membros veem próprio registro)

**Triggers:**
- `trg_sync_payroll_to_expenses` → Sincroniza com tabela `payroll_expenses` (agregação mensal)

---

## 6. Tabela: `payroll_expenses`

**Descrição:** Agregação **mensal** de toda a folha de pagamento. Sincronizada automaticamente da tabela `payrolls` via trigger. Usada no módulo Financeiro como categoria de despesa "Folha de pagamento".

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|------------|-----------|
| `id` | UUID | ✅ | Identificador único (PK) |
| `organization_id` | UUID | ✅ | Organização/empresa (FK: organizations.id) |
| `reference_date` | DATE | ✅ | Primeiro dia do mês de referência (ex: 2024-03-01) |
| `base_salary` | NUMERIC(10,2) | ✅ | Soma de todos os salários base do mês |
| `commission` | NUMERIC(10,2) | ✅ | Soma de todas as comissões do mês |
| `bonus` | NUMERIC(10,2) | ✅ | Soma de todos os bônus do mês |
| `overtime` | NUMERIC(10,2) | ✅ | Soma de todas as horas extras do mês |
| `discounts` | NUMERIC(10,2) | ✅ | Soma de todos os descontos do mês |
| `total_value` | NUMERIC(10,2) | ✅ | **GERADO**: `base_salary + commission + bonus + overtime - discounts` |
| `status` | VARCHAR(50) | ✅ | Status: `pending`, `paid` |
| `paid_at` | TIMESTAMPTZ | ❌ | Data de pagamento dos salários |
| `created_at` | TIMESTAMPTZ | ✅ | Data de criação (auto) |
| `updated_at` | TIMESTAMPTZ | ✅ | Data de atualização (auto, trigger) |

**Campos Gerados (não inserir diretamente):**
- `total_value` → Coluna computada automaticamente

**Índices:**
- `idx_payroll_expenses_organization_id` → Filtro por organização
- `idx_payroll_expenses_reference_date` → Busca por período

**RLS:** Ativado (admins gerenciam; membros/managers veem)

**Triggers:**
- `sync_payroll_to_expenses()` → Função que sincroniza dados automáticos de `payrolls`

**Sincronização Automática:**
Quando um registro é inserido ou atualizado em `payrolls`:
1. Trigger `trg_sync_payroll_to_expenses` dispara
2. Função `sync_payroll_to_expenses()` é executada
3. Ela agrega TODOS os `payrolls` do mês via `SUM()`
4. Se existe `payroll_expenses` para aquele mês → ATUALIZA
5. Se não existe → INSERE novo registro

---

## Relacionamentos Financeiros

```
contracts (cliente que paga)
    ├── payments (receita)
    └── projects (trabalho)

suppliers (precisa pagar)
    └── supplier_expenses (despesa)

payrolls (individual)
    └── payroll_expenses (agregado mensal) → exibido em Financeiro
```

---

## Categorias no Módulo Financeiro

A aba **Financeiro** exibe as seguintes categorias:

| Categoria | Tabela | Descrição |
|-----------|--------|-----------|
| **Receitas** | `payments` | Pagamentos recebidos de clientes |
| **Despesas - Fornecedores** | `supplier_expenses` | Contas a pagar para fornecedores |
| **Folha de Pagamento** | `payroll_expenses` | Total mensal de salários + benefícios - descontos |

---

## Tipos de Dados Customizados (Enums)

### `payment_status`
```
pendente  → Não foi pago
pago      → Já foi pago
atrasado  → Passou a data de vencimento e não foi pago
cancelado → Foi cancelado
```

### `contract_status`
```
rascunho   → Draft, em preparação
ativo      → Vigente
encerrado  → Já passou data de fim (via trigger)
cancelado  → Cancelado manualmente
```

---

## Fluxos Financeiros

### 1. Receita (Payment)
```
Cliente assina contrato (contracts)
    ↓
Sistema cria parcelas/pagamentos (payments)
    ↓
Cliente efetua pagamento → status = 'pago', paid_at agora
    ↓
Dashboard mostra receita do período
```

### 2. Despesa com Fornecedor
```
Fornecedor cadastrado (suppliers)
    ↓
Nova despesa lançada (supplier_expenses)
    ↓
Empresa faz pagamento → status = 'pago', paid_at agora
    ↓
Dashboard mostra despesa do período
```

### 3. Folha de Pagamento
```
Cada funcionário recebe um payroll (payrolls) com componentes
    ↓
Trigger `trg_sync_payroll_to_expenses` dispara
    ↓
Função `sync_payroll_to_expenses()` agrega SUM() todos do mês
    ↓
payroll_expenses atualizado automaticamente (total_value gerado)
    ↓
Dashboard mostra "Folha de pagamento" do período
```

---

## Notas Importantes

### ⚠️ Coluna Gerada: `total_value`

Em ambas as tabelas `payrolls` e `payroll_expenses`, **`total_value` é uma coluna GERADA**:

```sql
total_value NUMERIC(10, 2) GENERATED ALWAYS AS (
  base_salary + commission + bonus + overtime - discounts
) STORED
```

**Nunca forneça um valor para `total_value` em INSERT/UPDATE.** O PostgreSQL a calcula automaticamente.

❌ Errado:
```sql
INSERT INTO payroll_expenses 
  (organization_id, reference_date, base_salary, total_value) 
VALUES (..., 5000);  -- Error!
```

✅ Correto:
```sql
INSERT INTO payroll_expenses 
  (organization_id, reference_date, base_salary, commission, bonus, overtime, discounts) 
VALUES (...);  -- total_value é calculado automaticamente
```

### Sincronização Automática

Não é necessário inserir manualmente em `payroll_expenses`. Ela é sincronizada via:
1. Insert/Update em `payrolls` → Trigger dispara
2. Função SQL agrega dados
3. `payroll_expenses` é criado ou atualizado

---

## Queries Úteis

### Total de Receitas (Pagamentos) por Período
```sql
SELECT 
  DATE_TRUNC('month', due_date)::date as mes,
  SUM(value) as total_receita
FROM payments
WHERE organization_id = '{org_id}'
  AND status = 'pago'
GROUP BY DATE_TRUNC('month', due_date)
ORDER BY mes DESC;
```

### Total de Despesas (Fornecedores) por Período
```sql
SELECT 
  DATE_TRUNC('month', due_date)::date as mes,
  SUM(value) as total_despesas
FROM supplier_expenses
WHERE organization_id = '{org_id}'
  AND status = 'pago'
GROUP BY DATE_TRUNC('month', due_date)
ORDER BY mes DESC;
```

### Folha de Pagamento Mensal
```sql
SELECT 
  reference_date,
  COALESCE(base_salary, 0) as salarios,
  COALESCE(commission, 0) as comissoes,
  COALESCE(bonus, 0) as bonus,
  COALESCE(overtime, 0) as horas_extras,
  COALESCE(discounts, 0) as descontos,
  total_value as total_folha
FROM payroll_expenses
WHERE organization_id = '{org_id}'
ORDER BY reference_date DESC;
```

### Resumo Financeiro Mensal
```sql
SELECT 
  DATE_TRUNC('month', reference_date)::date as mes,
  'Folha de Pagamento' as categoria,
  total_value as valor
FROM payroll_expenses
WHERE organization_id = '{org_id}'

UNION ALL

SELECT 
  DATE_TRUNC('month', due_date)::date as mes,
  'Despesas - Fornecedores' as categoria,
  SUM(value) as valor
FROM supplier_expenses
WHERE organization_id = '{org_id}'
  AND status = 'pago'
GROUP BY DATE_TRUNC('month', due_date)

UNION ALL

SELECT 
  DATE_TRUNC('month', due_date)::date as mes,
  'Receitas' as categoria,
  SUM(value) as valor
FROM payments
WHERE organization_id = '{org_id}'
  AND status = 'pago'
GROUP BY DATE_TRUNC('month', due_date)

ORDER BY mes DESC, categoria;
```

---

## Última Atualização
**Data:** Março 2026  
**Tabelas Versão:** 008-009 (migrations)
