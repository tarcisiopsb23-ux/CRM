# Prompt de Implementação — Módulo Gerencial C8 Control no Maestr.ia

## Contexto do projeto

O **C8 Control** é um CRM SaaS multi-tenant da agência, hospedado em um projeto Supabase separado do Maestr.ia. Cada cliente da agência (tenant) acessa o C8 Control com login próprio, completamente isolado dos demais tenants e do Maestr.ia.

O Maestr.ia é responsável **exclusivamente** por:
- Controle financeiro de contratos dos tenants
- Definição do limite máximo de usuários por tenant
- Bloqueio, suspensão, renovação e cancelamento de acesso ao C8 Control

O C8 Control é responsável por **tudo mais**:
- Autenticação dos usuários de cada tenant (banco próprio)
- Isolamento total de dados entre tenants via RLS
- Configurações individuais de cada tenant (integrações, WhatsApp, APIs, etc.)

A comunicação entre os dois sistemas é **unidirecional**: o Maestr.ia publica configurações, o C8 Control consome via API. O C8 Control nunca escreve no Maestr.ia.

---

## Arquitetura da integração

```
Maestr.ia (Agente IA — owwaulaenabbdalycusx.supabase.co)
  └── Tabela: crm_tenant_config
        ↓ leitura via service role key (nunca exposta ao frontend)
C8 Control (Banco de Testes — xcymhcqbyyuozkzhpxgi.supabase.co)
  └── Edge Function: tenant-status
        └── Tabela cache: tenant_config_cache
              └── RLS: cada tenant vê apenas sua própria config
```

---

## O que precisa ser implementado no Maestr.ia

### 1. Tabela `crm_tenant_config`

Criar no banco do Maestr.ia uma tabela que centraliza o controle de cada tenant do C8 Control:

```sql
CREATE TABLE crm_tenant_config (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL UNIQUE,
  -- tenant_id é o mesmo UUID do clients.id no banco do C8 Control

  -- Controle de acesso
  status           TEXT NOT NULL DEFAULT 'ativo'
                   CHECK (status IN ('ativo', 'bloqueado', 'suspenso', 'cancelado')),
  blocked_reason   TEXT,
  -- Motivo do bloqueio/suspensão (exibido no C8 Control ao usuário)

  -- Limites do plano
  max_users        INTEGER NOT NULL DEFAULT 3,
  plan_name        TEXT NOT NULL DEFAULT 'Starter',
  -- 'Starter' | 'Pro' | 'Enterprise' | nome customizado

  -- Contrato
  contract_start   DATE,
  contract_end     DATE,
  -- NULL = sem data de expiração (contrato recorrente)
  monthly_value    NUMERIC(10,2),

  -- Metadados
  client_name      TEXT,
  -- Nome do cliente (para exibição no módulo gerencial, sem precisar consultar o CRM)
  notes            TEXT,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_crm_tenant_config_tenant_id ON crm_tenant_config (tenant_id);
CREATE INDEX idx_crm_tenant_config_status    ON crm_tenant_config (status);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_crm_tenant_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_crm_tenant_config_updated_at
  BEFORE UPDATE ON crm_tenant_config
  FOR EACH ROW EXECUTE FUNCTION update_crm_tenant_config_updated_at();
```

**RLS:** Esta tabela deve ser acessível apenas por usuários autenticados do Maestr.ia com role de agência (`agency_admin` ou equivalente). Nunca exposta via anon key.

---

### 2. Tabela `crm_payments` (controle financeiro)

```sql
CREATE TABLE crm_payments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES crm_tenant_config(tenant_id),
  description      TEXT NOT NULL,
  amount           NUMERIC(10,2) NOT NULL,
  due_date         DATE NOT NULL,
  paid_at          TIMESTAMPTZ,
  status           TEXT NOT NULL DEFAULT 'pendente'
                   CHECK (status IN ('pendente', 'pago', 'vencido', 'cancelado')),
  payment_method   TEXT,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_crm_payments_tenant_id ON crm_payments (tenant_id);
CREATE INDEX idx_crm_payments_status    ON crm_payments (status);
CREATE INDEX idx_crm_payments_due_date  ON crm_payments (due_date);
```

---

### 3. Edge Function no Maestr.ia: `crm-tenant-api`

Criar uma Edge Function no Maestr.ia que expõe uma API segura para o C8 Control consumir. Esta função é o único ponto de contato entre os dois sistemas.

**Autenticação:** A função valida um `API_KEY` secreto compartilhado entre os dois sistemas (não é JWT de usuário — é uma chave de serviço estática configurada como secret nas Edge Functions de ambos os projetos).

```typescript
// supabase/functions/crm-tenant-api/index.ts (no projeto Maestr.ia)

Deno.serve(async (req) => {
  // Validar API key
  const apiKey = req.headers.get("x-crm-api-key");
  if (apiKey !== Deno.env.get("CRM_API_KEY")) {
    return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401 });
  }

  const url = new URL(req.url);
  const tenantId = url.searchParams.get("tenant_id");

  // GET /crm-tenant-api?tenant_id=xxx — retorna config do tenant
  if (req.method === "GET" && tenantId) {
    const { data } = await supabase
      .from("crm_tenant_config")
      .select("tenant_id, status, max_users, plan_name, blocked_reason, contract_end")
      .eq("tenant_id", tenantId)
      .single();

    return new Response(JSON.stringify(data ?? { status: "ativo", max_users: 3 }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  // GET /crm-tenant-api?action=list — retorna todos os tenants ativos
  if (req.method === "GET" && url.searchParams.get("action") === "list") {
    const { data } = await supabase
      .from("crm_tenant_config")
      .select("tenant_id, status, max_users, plan_name, client_name, contract_end")
      .order("client_name");

    return new Response(JSON.stringify(data ?? []), {
      headers: { "Content-Type": "application/json" }
    });
  }

  return new Response(JSON.stringify({ error: "Rota não encontrada" }), { status: 404 });
});
```

**Secrets necessários no projeto Maestr.ia:**
- `CRM_API_KEY` — chave secreta compartilhada com o C8 Control (gerar um UUID aleatório)

---

### 4. Módulo Gerencial no frontend do Maestr.ia

Criar uma seção `/admin/c8control` acessível apenas para usuários com role de agência. Esta seção deve ter:

#### 4.1 Lista de tenants
- Tabela com todos os tenants cadastrados
- Colunas: Nome, Plano, Status, Usuários (atual/máximo), Vencimento do contrato, Ações
- Filtros por status (ativo, bloqueado, suspenso, cancelado)
- Busca por nome

#### 4.2 Cadastro de novo tenant

Campos obrigatórios:
- Nome do cliente (`tenant_name`)
- E-mail do usuário admin principal (`admin_email`)

Campos opcionais:
- Senha inicial (`admin_password`) — se omitida, o C8 Control envia um magic link para o e-mail
- Nome da empresa (`company`)
- Slug do dashboard (`slug`) — gerado automaticamente a partir do nome se omitido
- Plano, limite de usuários, valor mensal, data de início (salvos em `crm_tenant_config`)

**Ao salvar, o Maestr.ia deve:**

1. Chamar a Edge Function `provision-tenant` do C8 Control:

```typescript
const res = await fetch(`${CRM_URL}/functions/v1/provision-tenant`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-crm-api-key": CRM_API_KEY,
  },
  body: JSON.stringify({
    tenant_name:    formData.tenant_name,
    admin_email:    formData.admin_email,
    admin_password: formData.admin_password ?? undefined,
    company:        formData.company ?? undefined,
    slug:           formData.slug ?? undefined,
  }),
});

const { tenant_id, user_id, email, slug } = await res.json();
// Se res.status === 409: slug ou e-mail já existe — exibir erro ao usuário
// Se res.status !== 201: exibir mensagem de erro retornada
```

2. Com o `tenant_id` retornado, criar o registro em `crm_tenant_config`:

```typescript
await supabase.from("crm_tenant_config").insert({
  tenant_id,
  client_name:    formData.tenant_name,
  plan_name:      formData.plan_name,
  max_users:      formData.max_users,
  monthly_value:  formData.monthly_value,
  contract_start: formData.contract_start,
  status:         "ativo",
});
```

**Secrets necessários no Maestr.ia (Edge Functions):**
```
CRM_URL=https://xcymhcqbyyuozkzhpxgi.supabase.co
CRM_API_KEY=<mesma chave configurada no C8 Control>
```

**O que acontece no C8 Control após o provisionamento:**
- Registro criado em `clients` com `tenant_id = clients.id`
- Usuário criado em `auth.users` com `user_metadata.tenant_id` e `user_metadata.role = 'admin'`
- Registro criado em `tenant_users` com `role = 'admin'`
- Se senha fornecida: usuário pode fazer login imediatamente
- Se senha omitida: magic link enviado para o e-mail do admin (usuário define a senha no primeiro acesso)

#### 4.3 Gestão individual do tenant
- Alterar status (ativo → bloqueado, com motivo obrigatório)
- Alterar plano e limite de usuários
- Renovar contrato (atualizar `contract_end`)
- Cancelar contrato
- Histórico de pagamentos
- Registrar pagamento manual

#### 4.4 Controle financeiro
- Lista de pagamentos pendentes e vencidos
- Alerta visual para contratos próximos do vencimento (30 dias)
- Bloqueio automático sugerido para inadimplentes (com confirmação manual)

#### 4.5 Proteção de rota
```typescript
// Verificar que o usuário tem role de agência antes de renderizar
// Roles com acesso ao módulo gerencial: owner, admin, manager, member
// Role SEM acesso: viewer
const AGENCY_ROLES_WITH_ACCESS = ["owner", "admin", "manager", "member"];
if (!AGENCY_ROLES_WITH_ACCESS.includes(user?.user_metadata?.role)) {
  redirect('/dashboard');
}
```

**Nota sobre acesso ao CRM:**
Os roles `owner`, `admin`, `manager` e `member` do Maestr.ia também têm acesso ao C8 Control como usuários da agência (equivalente ao suporte técnico). Eles veem todos os tenants via TenantSelector, sem vínculo com nenhum tenant específico. O role `viewer` não tem acesso ao C8 Control.

---

## O que precisa ser implementado no C8 Control

### 5. Edge Function: `tenant-status` (no C8 Control)

Esta função é chamada pelo C8 Control para verificar o status do tenant no Maestr.ia. Ela consulta a API do Maestr.ia e atualiza o cache local.

```typescript
// supabase/functions/tenant-status/index.ts (no projeto C8 Control)

Deno.serve(async (req) => {
  // Extrair tenant_id do JWT do caller
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  const payload = decodeJwt(token);
  const tenantId = payload?.tenant_id;

  if (!tenantId) return errorResponse("tenant_id não encontrado", 401);

  // Consultar API do Maestr.ia
  const maestriaUrl = Deno.env.get("MAESTRIA_CRM_API_URL");
  const apiKey = Deno.env.get("CRM_API_KEY");

  const res = await fetch(`${maestriaUrl}?tenant_id=${tenantId}`, {
    headers: { "x-crm-api-key": apiKey }
  });

  const config = await res.json();

  // Atualizar cache no banco do C8 Control
  await supabase.from("tenant_config_cache").upsert({
    tenant_id:     tenantId,
    status:        config.status ?? "ativo",
    max_users:     config.max_users ?? 3,
    plan_name:     config.plan_name ?? "Starter",
    blocked_reason: config.blocked_reason ?? null,
    contract_end:  config.contract_end ?? null,
    synced_at:     new Date().toISOString(),
  }, { onConflict: "tenant_id" });

  return new Response(JSON.stringify(config), {
    headers: { "Content-Type": "application/json" }
  });
});
```

**Secrets necessários no C8 Control:**
- `MAESTRIA_CRM_API_URL` — URL da Edge Function `crm-tenant-api` no Maestr.ia
- `CRM_API_KEY` — mesma chave configurada no Maestr.ia

---

### 6. Tabela `tenant_config_cache` no C8 Control

```sql
-- Migration: tenant_config_cache
-- Cache local das configurações vindas do Maestr.ia
-- Evita chamadas ao Maestr.ia a cada request

CREATE TABLE IF NOT EXISTS tenant_config_cache (
  tenant_id      UUID PRIMARY KEY,
  status         TEXT NOT NULL DEFAULT 'ativo',
  max_users      INTEGER NOT NULL DEFAULT 3,
  plan_name      TEXT NOT NULL DEFAULT 'Starter',
  blocked_reason TEXT,
  contract_end   DATE,
  synced_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: cada tenant vê apenas sua própria config
ALTER TABLE tenant_config_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_config_cache_isolation" ON tenant_config_cache
  FOR SELECT
  USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    OR (auth.jwt() ->> 'role') = 'support'
  );

-- Apenas service role pode inserir/atualizar (via Edge Function)
-- Usuários autenticados só leem
```

---

### 7. Verificação de status no login do C8 Control

Ao fazer login, o C8 Control deve verificar o status do tenant antes de permitir acesso:

```typescript
// Em PublicDashboardLoginPage.tsx ou no hook useAuth
// Após signInWithPassword bem-sucedido:

const { data: config } = await supabaseCrm
  .from("tenant_config_cache")
  .select("status, blocked_reason")
  .eq("tenant_id", tenantId)
  .single();

if (config?.status === "bloqueado") {
  await supabaseAuth.auth.signOut();
  setError(`Acesso bloqueado: ${config.blocked_reason ?? "Entre em contato com a agência."}`);
  return;
}

if (config?.status === "cancelado") {
  await supabaseAuth.auth.signOut();
  setError("Contrato cancelado. Entre em contato com a agência.");
  return;
}
```

---

### 8. Sincronização periódica do cache

Adicionar sincronização automática para manter o cache atualizado sem depender apenas do login:

```typescript
// Hook useTenantStatus — chamar no PublicDashboardPage
// Sincroniza a cada 30 minutos enquanto o usuário está logado

useEffect(() => {
  const sync = async () => {
    await fetch(`${SUPABASE_URL}/functions/v1/tenant-status`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
  };

  sync(); // sincroniza ao montar
  const interval = setInterval(sync, 30 * 60 * 1000); // a cada 30 min
  return () => clearInterval(interval);
}, [tenantId]);
```

---

## Fluxo completo de bloqueio

```
1. Agência no Maestr.ia marca tenant como "bloqueado" com motivo
2. Maestr.ia atualiza crm_tenant_config.status = 'bloqueado'
3. Na próxima sincronização do C8 Control (login ou 30min):
   - Edge Function tenant-status consulta Maestr.ia
   - Atualiza tenant_config_cache.status = 'bloqueado'
4. Usuário do tenant tenta acessar o dashboard:
   - C8 Control lê o cache e exibe mensagem de bloqueio
   - Sessão é encerrada
5. Para desbloquear: agência altera status no Maestr.ia → próxima sync libera
```

---

## Variáveis de ambiente necessárias

### No Maestr.ia (Edge Functions Secrets):
```
CRM_API_KEY=<uuid-aleatorio-secreto>
```

### No C8 Control (Edge Functions Secrets):
```
MAESTRIA_CRM_API_URL=https://owwaulaenabbdalycusx.supabase.co/functions/v1/crm-tenant-api
CRM_API_KEY=<mesmo-uuid-do-maestria>
```

---

## Responsabilidades finais de cada sistema

| Responsabilidade | Maestr.ia | C8 Control |
|---|---|---|
| Autenticação dos usuários do CRM | ❌ | ✅ |
| Isolamento de dados entre tenants | ❌ | ✅ |
| Configurações de integração (GTM, Pixel, WhatsApp) | ❌ | ✅ |
| Tokens OAuth (Google, Meta) | ❌ | ✅ |
| Links de WhatsApp rastreados | ❌ | ✅ |
| KPIs, leads, campanhas, métricas | ❌ | ✅ |
| Controle financeiro e contratos | ✅ | ❌ |
| Limite de usuários por tenant | ✅ (fonte) | ✅ (cache) |
| Status de acesso (bloqueio/suspensão) | ✅ (fonte) | ✅ (cache) |
| Cadastro de novos tenants | ✅ | ❌ |
| Suporte técnico (sessão de suporte) | ❌ | ✅ |
