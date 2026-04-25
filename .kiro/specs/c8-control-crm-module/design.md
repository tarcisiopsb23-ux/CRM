# Documento de Design Técnico — C8 Control

## Visão Geral

O C8 Control é um produto CRM externo (projeto separado, já pronto) oferecido pela agência como SaaS para seus clientes. **Nessa aplicação**, o escopo é:

1. Página de login pública como **portão de entrada** — autentica o CRM_User e redireciona para o CRM externo
2. Configuração do plano por cliente (aba no módulo de clientes)
3. Gestão de usuários por cliente (convite/remoção)
4. Controle financeiro e de acesso (aba no módulo financeiro)
5. Edge Function de validação de acesso — consumida pelo CRM externo a cada login

---

## Arquitetura

```
CRM_User (browser)
    │
    ▼
/public/dashboard/:slug/crm/login   ← portão de entrada (nessa aplicação)
    │  1. Valida slug + c8_control_enabled + subscription_status
    │  2. Autentica no SaaS_DB
    │  3. Chama crm-validate-access → recebe session_token (TTL 30min)
    │  4. Redireciona para CRM externo com session_token
    ▼
CRM Externo (projeto separado)
    │  1. Recebe session_token
    │  2. Valida session_token via crm-validate-access (a cada login)
    │  3. Armazena last_activity_at — renova token a cada interação
    │  4. Se inativo > 30min → token expirado → redireciona para login
    │  5. Se bloqueado → crm-validate-access retorna 403 → redireciona para login

Agência (browser)
    ├── /clients/:clientId  → aba "C8 Control"  (plano + usuários)
    ├── /settings           → toggle C8 Control  (ativação por cliente)
    └── /financial          → aba "C8 Control"  (financeiro + bloqueio)
```

---

## Mecanismo de Sessão e Revogação

### Tabela `crm_sessions`

Armazena sessões ativas dos CRM_Users com TTL de 30 minutos de inatividade.

```sql
-- supabase/migrations/00122_crm_sessions.sql
CREATE TABLE crm_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL,
  session_token   TEXT NOT NULL UNIQUE,  -- token opaco gerado no login
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 minutes'),
  revoked         BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX idx_crm_sessions_token ON crm_sessions(session_token);
CREATE INDEX idx_crm_sessions_client ON crm_sessions(client_id, revoked);

ALTER TABLE crm_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_sessions_org" ON crm_sessions
  FOR ALL USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());
```

### Fluxo completo de login

```
1. CRM_User acessa /public/dashboard/:slug/crm/login
2. RPC get_crm_client_by_slug(slug) → valida slug, c8_control_enabled, subscription_status
3. Se bloqueado/inativo → nega acesso (sem mostrar formulário)
4. CRM_User submete e-mail + senha
5. supabaseAuth.signInWithPassword() → obtém access_token do SaaS_DB
6. Frontend chama Edge Function crm-validate-access com:
   { action: 'create_session', client_id, user_id, access_token }
7. crm-validate-access:
   a. Verifica subscription_status = 'ativo' (segunda verificação, evita race condition)
   b. Gera session_token = crypto.randomUUID() + timestamp assinado com HMAC-SHA256
   c. Insere em crm_sessions { organization_id, client_id, user_id, session_token, expires_at }
   d. Retorna { session_token, expires_at }
8. Frontend redireciona para: ${VITE_C8_CONTROL_URL}/auth?session_token=${session_token}&slug=${slug}
```

### Fluxo de validação no CRM externo (a cada login)

```
CRM externo → POST /crm-validate-access
Body: { action: 'validate', session_token }
Headers: { Authorization: Bearer <CRM_API_KEY> }

crm-validate-access:
  1. Busca sessão por session_token
  2. Se não encontrada → 404
  3. Se revoked = true → 403 { reason: 'revoked' }
  4. Se expires_at < now() → 401 { reason: 'expired' }
  5. Verifica subscription_status do client_id → se 'bloqueado' → 403 { reason: 'blocked' }
  6. UPDATE crm_sessions SET last_activity_at = now(), expires_at = now() + 30min
  7. Retorna 200 { valid: true, client_id, user_id, modules[] }
```

### Revogação imediata ao bloquear cliente

Quando a agência clica em "Bloquear Acesso" na aba financeira:

```
1. UPDATE crm_client_plans SET subscription_status = 'bloqueado'
2. UPDATE crm_sessions SET revoked = true WHERE client_id = ? AND revoked = false
```

Isso garante que sessões ativas são invalidadas imediatamente — o CRM externo receberá 403 na próxima validação (que ocorre no máximo a cada 30 minutos de inatividade, ou imediatamente se o usuário tentar uma ação).

---

## Modelos de Dados

### Migration 1 — Coluna `c8_control_enabled` em `clients`

```sql
-- supabase/migrations/00117_c8_control_enabled.sql
ALTER TABLE clients ADD COLUMN IF NOT EXISTS c8_control_enabled BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_clients_c8_control ON clients(organization_id, c8_control_enabled);
```

### Migration 2 — Tabela `crm_client_plans`

```sql
-- supabase/migrations/00118_crm_client_plans.sql
CREATE TABLE crm_client_plans (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id           UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  plan_value          NUMERIC(10,2) NOT NULL DEFAULT 0,
  modules             TEXT[] NOT NULL DEFAULT '{}',
  max_users           INTEGER NOT NULL DEFAULT 1,
  due_day             INTEGER NOT NULL DEFAULT 1 CHECK (due_day BETWEEN 1 AND 28),
  subscription_status TEXT NOT NULL DEFAULT 'ativo'
    CHECK (subscription_status IN ('ativo','inadimplente','bloqueado','cancelado')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_crm_client_plans_client ON crm_client_plans(client_id);
CREATE INDEX idx_crm_client_plans_org ON crm_client_plans(organization_id);

ALTER TABLE crm_client_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_client_plans_org" ON crm_client_plans
  FOR ALL
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

CREATE TRIGGER update_crm_client_plans_updated
  BEFORE UPDATE ON crm_client_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### Migration 3 — Tabela `crm_client_users`

```sql
-- supabase/migrations/00119_crm_client_users.sql
CREATE TABLE crm_client_users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL,
  email           TEXT NOT NULL,
  name            TEXT,
  active          BOOLEAN NOT NULL DEFAULT true,
  last_access_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_crm_client_users_client ON crm_client_users(client_id, active);
CREATE INDEX idx_crm_client_users_org ON crm_client_users(organization_id);

ALTER TABLE crm_client_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_client_users_org" ON crm_client_users
  FOR ALL
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());
```

### Migration 4 — RPC pública `get_crm_client_by_slug`

```sql
-- supabase/migrations/00120_crm_slug_rpc.sql
CREATE OR REPLACE FUNCTION get_crm_client_by_slug(p_slug TEXT)
RETURNS TABLE (
  client_id           UUID,
  organization_id     UUID,
  name                TEXT,
  logo_url            TEXT,
  c8_control_enabled  BOOLEAN,
  subscription_status TEXT
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT
    c.id,
    c.organization_id,
    c.name,
    c.metadata->>'logo_url',
    c.c8_control_enabled,
    COALESCE(p.subscription_status, 'cancelado')
  FROM clients c
  LEFT JOIN crm_client_plans p ON p.client_id = c.id
  WHERE LOWER(TRIM(c.dashboard_slug)) = LOWER(TRIM(p_slug))
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION get_crm_client_by_slug TO anon, authenticated;
```

### Migration 5 — Bloqueio automático por inadimplência

```sql
-- supabase/migrations/00121_crm_auto_block.sql
CREATE OR REPLACE FUNCTION auto_block_overdue_crm_clients()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Bloqueia planos com pagamento pendente há mais de 30 dias
  UPDATE crm_client_plans p
  SET subscription_status = 'bloqueado', updated_at = now()
  WHERE p.subscription_status = 'ativo'
    AND EXISTS (
      SELECT 1 FROM payments pay
      WHERE pay.description LIKE 'Mensalidade C8 Control%'
        AND pay.status = 'pendente'
        AND pay.due_date <= (now() - INTERVAL '30 days')::date
        AND pay.client_id = p.client_id
    );

  -- Revoga sessões ativas dos clientes bloqueados
  UPDATE crm_sessions s
  SET revoked = true
  FROM crm_client_plans p
  WHERE s.client_id = p.client_id
    AND p.subscription_status = 'bloqueado'
    AND s.revoked = false;
END;
$$;
```

### Migration 6 — Tabela `crm_sessions`

```sql
-- supabase/migrations/00122_crm_sessions.sql
CREATE TABLE crm_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id        UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL,
  session_token    TEXT NOT NULL UNIQUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at       TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 minutes'),
  revoked          BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX idx_crm_sessions_token ON crm_sessions(session_token);
CREATE INDEX idx_crm_sessions_client ON crm_sessions(client_id, revoked);

ALTER TABLE crm_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_sessions_org" ON crm_sessions
  FOR ALL USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());
```

---

## Módulos Disponíveis

```typescript
// src/lib/crmModules.ts
export const CRM_MODULES = [
  { id: 'leads',      label: 'Leads / Kanban' },
  { id: 'financial',  label: 'Financeiro' },
  { id: 'agenda',     label: 'Agenda' },
  { id: 'projects',   label: 'Projetos' },
  { id: 'reports',    label: 'Relatórios' },
  { id: 'whatsapp',   label: 'WhatsApp' },
  { id: 'campaigns',  label: 'Campanhas' },
] as const;

export type CrmModuleId = typeof CRM_MODULES[number]['id'];
export type SubscriptionStatus = 'ativo' | 'inadimplente' | 'bloqueado' | 'cancelado';
```

---

## Edge Functions

### `crm-validate-access` (nova — consumida pelo CRM externo)

```
Autenticação: Header Authorization: Bearer <CRM_API_KEY>
(CRM_API_KEY = secret compartilhado entre esta aplicação e o CRM externo)

POST /crm-validate-access
Body: { action: 'create_session' | 'validate' | 'revoke', ... }

--- action: 'create_session' ---
Body: { action: 'create_session', client_id, user_id, access_token }
Chamado por: página de login desta aplicação após autenticação bem-sucedida
Fluxo:
  1. Verifica subscription_status = 'ativo' (race condition guard)
  2. Gera session_token único (crypto.randomUUID())
  3. INSERT INTO crm_sessions { organization_id, client_id, user_id, session_token }
  4. Retorna: { session_token, expires_at }

--- action: 'validate' ---
Body: { action: 'validate', session_token }
Chamado por: CRM externo a cada login do usuário
Fluxo:
  1. SELECT sessão por session_token
  2. Se não encontrada → 404
  3. Se revoked = true → 403 { reason: 'revoked' }
  4. Se expires_at < now() → 401 { reason: 'expired' }
  5. Verifica subscription_status do client_id → se 'bloqueado' → 403 { reason: 'blocked' }
  6. UPDATE last_activity_at = now(), expires_at = now() + 30min
  7. Retorna: 200 { valid: true, client_id, user_id, modules: string[] }

--- action: 'revoke' ---
Body: { action: 'revoke', session_token }
Chamado por: CRM externo no logout do usuário
Fluxo:
  1. UPDATE crm_sessions SET revoked = true WHERE session_token = ?
  2. Retorna: 200 { success: true }
```

### `crm-manage-user` (nova — gerencia CRM_Users)

```
POST /crm-manage-user
Body: { action: 'invite' | 'remove', client_id, email, name? }
Auth: JWT do usuário da agência

Fluxo invite:
  1. Verifica limite: COUNT(crm_client_users WHERE client_id AND active) < max_users
  2. supabaseAdmin.auth.admin.inviteUserByEmail(email, { data: { role: 'crm_user' } })
  3. INSERT INTO crm_client_users { organization_id, client_id, user_id, email, name }
  4. Retorna { success: true }

Fluxo remove:
  1. UPDATE crm_client_users SET active = false WHERE user_id AND client_id
  2. UPDATE crm_sessions SET revoked = true WHERE user_id AND client_id
  3. supabaseAdmin.auth.admin.updateUserById(userId, { ban_duration: '87600h' })
  4. Retorna { success: true }
```

---

## Componentes React

### Novos

| Componente | Caminho | Responsabilidade |
|---|---|---|
| `C8ControlLoginPage` | `src/pages/C8ControlLoginPage.tsx` | Portão de entrada — autentica, cria sessão e redireciona |
| `C8ControlTab` | `src/components/clients/C8ControlTab.tsx` | Aba de configuração do plano + usuários |
| `CrmPlanForm` | `src/components/clients/CrmPlanForm.tsx` | Formulário do plano |
| `CrmUsersList` | `src/components/clients/CrmUsersList.tsx` | Lista e gestão de CRM_Users |
| `C8ControlFinancialTab` | `src/components/financial/C8ControlFinancialTab.tsx` | Aba financeira |

### Modificados

| Componente | Modificação |
|---|---|
| `ContractDetailPage.tsx` | Aba "C8 Control" condicional quando `c8_control_enabled = true` |
| `SettingsPage.tsx` | Toggle "C8 Control" na seção de produtos |
| `FinancialPage.tsx` | Aba "C8 Control" — ao bloquear, revoga sessões ativas |
| `App.tsx` | Rota pública `/public/dashboard/:slug/crm/login` |

---

## Novos Hooks

```typescript
// src/hooks/useCrmClientPlan.ts
export function useCrmClientPlan(organizationId: string, clientId: string)
// query + upsertPlan + updateStatus (updateStatus também revoga sessões ativas)

// src/hooks/useCrmClientUsers.ts
export function useCrmClientUsers(clientId: string)
// query + inviteUser + removeUser (removeUser revoga sessões do usuário)

// src/hooks/useCrmFinancial.ts
export function useCrmFinancial(organizationId: string)
// query + generateCharge + blockAccess (revoga sessões) + unblockAccess
```

---

## Variáveis de Ambiente

```
VITE_C8_CONTROL_URL=https://crm.c8.com.br   # URL base do CRM externo
CRM_API_KEY=<secret>                          # Chave compartilhada para crm-validate-access
```

---

## Propriedades de Corretude

| ID | Propriedade |
|---|---|
| P1 | `get_crm_client_by_slug` retorna 0 linhas para slug com `c8_control_enabled = false` |
| P2 | `get_crm_client_by_slug` retorna exatamente 1 linha para slug válido e ativo |
| P3 | Se `subscription_status = 'bloqueado'`, o formulário de login não é exibido |
| P4 | `crm-validate-access` retorna 403 para session_token de cliente bloqueado |
| P5 | `crm-validate-access` retorna 401 para session_token com `expires_at < now()` |
| P6 | Bloquear cliente revoga todas as sessões ativas (`revoked = true`) imediatamente |
| P7 | O número de CRM_Users ativos nunca excede `max_users` após qualquer sequência de convites |
| P8 | Desativar C8 Control define `subscription_status = 'cancelado'` sem deletar histórico |
| P9 | Ativar C8 Control pela primeira vez cria exatamente 1 registro em `crm_client_plans` com valores padrão |
| P10 | `totalExpectedMonthly` = soma dos `plan_value` de clientes com `subscription_status = 'ativo'` |
