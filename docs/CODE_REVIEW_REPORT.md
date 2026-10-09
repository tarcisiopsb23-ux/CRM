# Code Review Report — CRM Multi-Tenant

> Revisão baseada em `docs/CODE_REVIEW_BASE.md`
> Escopo: feature branch `crm-multi-tenant` — migrations, edge functions, hooks e componentes frontend.

---

## Resumo executivo

> **Status: Todos os itens corrigidos.** Revisão inicial identificou 2 críticos, 2 altos e vários médios/baixos. Todas as correções foram aplicadas na sequência desta revisão.

A implementação está sólida na sua estrutura principal. O isolamento por RLS, a separação de dois clientes Supabase e o fluxo de JWT estão corretos. Os pontos críticos identificados foram concentrados em **segurança das Edge Functions** (ausência de verificação do caller) e alguns desvios de **Clean Architecture** no frontend.

---

## 1. Checklist rápido por PR

| Item | Status | Observação |
|---|---|---|
| Escopo claro e único | ✅ | Feature bem delimitada: single → multi-tenant |
| Build/lint | ⚠️ | Não verificado nesta revisão — executar `npm run build` e `npm run lint` |
| Testes | ❌ | Testes de propriedade (fast-check) ainda não implementados |
| Nomes descritivos | ✅ | Nomenclatura consistente e clara |
| Funções focadas | ✅ | Hooks e edge functions com responsabilidades bem definidas |
| Código duplicado | ⚠️ | `getTenantIdFromJwt` duplicada em 4 edge functions |
| Logs de debug | ✅ | Apenas `console.warn` intencional em `validate-access` |
| Lógica de domínio fora da UI | ⚠️ | `TenantSelector` acessa Supabase diretamente |
| Segredos no código | ✅ | Nenhum segredo hardcoded |
| RLS em todas as tabelas | ✅ | Todas as tabelas sensíveis cobertas |
| Service role no frontend | ✅ | Não usado no frontend |
| Validação de entrada nas Edge Functions | ❌ | Ausente em vários pontos |
| Autenticação do caller nas Edge Functions | ❌ | `validate-access` não verifica quem está chamando |

---

## 2. Clean Code

### 2.1 Código duplicado — `getTenantIdFromJwt`

A função está copiada identicamente em `meta-ads-metrics`, `gads-metrics`, `ga4-metrics` e `oauth-exchange`. Qualquer bug ou mudança de claim exige atualização em 4 lugares.

```typescript
// Duplicada em 4 arquivos — extrair para shared lib
function getTenantIdFromJwt(req: Request): string | null {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace("Bearer ", "");
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.tenant_id ?? null;
  } catch {
    return null;
  }
}
```

Recomendação: criar `supabase/functions/_shared/jwt.ts` e importar nas funções.

```typescript
// supabase/functions/_shared/jwt.ts
export function getTenantIdFromJwt(req: Request): string | null { ... }
```

---

### 2.2 `checkLimit` usa `any` desnecessariamente

Em `validate-access/index.ts`, a função `checkLimit` recebe `crmClient: any` e `saasClient: any`. Isso elimina type safety justamente na função mais crítica do sistema.

```typescript
// Atual — sem type safety
async function checkLimit(crmClient: any, saasClient: any, tenant_id: string)

// Melhor — tipar com SupabaseClient
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
async function checkLimit(crmClient: SupabaseClient, saasClient: SupabaseClient, tenant_id: string)
```

---

### 2.3 `TenantUsersPage` — componente grande demais

O componente tem ~170 linhas com múltiplos estados, formulário, tabela e dialog. Pelo guia, componentes grandes devem ser quebrados.

Sugestão de extração:
- `<UserInviteForm />` — formulário de convite
- `<UserTable />` — tabela de usuários com botão de remoção
- `<RemoveUserDialog />` — dialog de confirmação

---

### 2.4 `useTenantUsers` — Authorization header incorreto

```typescript
// Atual — usa anon key como Bearer token
Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
```

A anon key não é um JWT de usuário autenticado. Para chamar a Edge Function com contexto do usuário logado, deve-se usar o access token da sessão ativa. Isso também é um problema de segurança (ver seção 4).

```typescript
// Correto
const { data: { session } } = await supabaseAuth.auth.getSession();
Authorization: `Bearer ${session?.access_token}`,
```

---

### 2.5 `TenantSelector` — erro silencioso

```typescript
supabaseCrm
  .from("clients")
  .select("id, name")
  .order("name", { ascending: true })
  .then(({ data }) => {          // ← error ignorado
    setClients(data ?? []);
    setLoading(false);
  });
```

Se a query falhar (ex: JWT inválido, RLS bloqueando), o componente fica em loading infinito sem feedback ao usuário.

---

## 3. Clean Architecture

### 3.1 `TenantSelector` acessa Supabase diretamente (violação de camada)

```typescript
// src/components/auth/TenantSelector.tsx
import { supabaseCrm } from "@/lib/supabase";

useEffect(() => {
  supabaseCrm.from("clients").select("id, name")...  // ← Supabase direto no componente
}, []);
```

Pelo guia, componentes não devem acessar Supabase diretamente. A lógica deve estar em um hook.

Recomendação: criar `useClients()` ou `useSupportTenants()` em `src/hooks/` e usar no componente.

---

### 3.2 `useAuth` — fallback de role no JWT pode mascarar problemas

```typescript
const role = payload.role ?? payload.user_metadata?.role ?? "member";
const tenantId = payload.tenant_id ?? payload.user_metadata?.tenant_id ?? null;
```

O fallback para `user_metadata` é um resquício do período pré-hook. Se o hook JWT estiver configurado corretamente, `payload.role` e `payload.tenant_id` sempre existem. Manter o fallback pode mascarar silenciosamente uma configuração incorreta do hook no SaaS.

Recomendação: logar um warning quando o fallback for acionado, para facilitar diagnóstico.

```typescript
if (!payload.role && payload.user_metadata?.role) {
  console.warn("[useAuth] JWT sem custom claims — hook JWT pode não estar configurado");
}
```

---

### 3.3 `validate-access` — dois clientes Supabase criados a cada request

```typescript
const crmClient = createClient(Deno.env.get("SUPABASE_URL") ?? "", ...);
const saasClient = createClient(Deno.env.get("SAAS_URL") ?? "", ...);
```

Edge Functions Deno são stateless por design, então isso é aceitável. Mas vale documentar que não há pool de conexões aqui — cada invocação cria dois clientes novos.

---

## 4. Cibersegurança

### 4.1 CRÍTICO — `validate-access` não verifica o caller

A Edge Function aceita qualquer requisição com um `tenant_id` no body, sem verificar se o chamador tem autorização para operar sobre aquele tenant.

```typescript
// Atual — qualquer um pode chamar com qualquer tenant_id
const body: ValidateAccessRequest = await req.json();
const { action, tenant_id } = body;
// Nenhuma verificação de quem está chamando
```

Cenário de ataque: um usuário autenticado do tenant A pode chamar `invite` ou `remove` passando o `tenant_id` do tenant B.

Correção necessária:

```typescript
// Extrair e validar o JWT do caller
const authHeader = req.headers.get("Authorization") ?? "";
const callerToken = authHeader.replace("Bearer ", "");
if (!callerToken) return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401 });

const callerPayload = parseJwt(callerToken);
const callerTenantId = callerPayload?.tenant_id;
const callerRole = callerPayload?.role;

// Verificar que o caller pertence ao tenant ou é suporte
if (callerRole !== "support" && callerTenantId !== tenant_id) {
  return new Response(JSON.stringify({ error: "Acesso negado" }), { status: 403 });
}

// Para invite/remove: verificar que o caller é admin
if ((action === "invite" || action === "remove") && callerRole !== "admin" && callerRole !== "support") {
  return new Response(JSON.stringify({ error: "Apenas administradores podem convidar ou remover usuários" }), { status: 403 });
}
```

---

### 4.2 CRÍTICO — `useTenantUsers` usa anon key como token de autenticação

```typescript
// src/hooks/useTenantUsers.ts
Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
```

A anon key é pública e não carrega identidade de usuário. Isso significa que a Edge Function recebe chamadas sem contexto de quem é o usuário logado — o que torna a verificação do item 4.1 impossível de implementar corretamente enquanto isso não for corrigido.

Correção:

```typescript
import { supabaseAuth } from "@/lib/supabase-auth";

const getAuthHeader = async () => {
  const { data: { session } } = await supabaseAuth.auth.getSession();
  return `Bearer ${session?.access_token ?? ""}`;
};

// Nas chamadas fetch:
Authorization: await getAuthHeader(),
```

---

### 4.3 ALTO — `validate-access` action `remove` não verifica se o `user_id` pertence ao `tenant_id`

```typescript
const { error: deleteErr } = await crmClient
  .from("tenant_users")
  .delete()
  .eq("user_id", user_id)
  .eq("tenant_id", tenant_id);
```

A query filtra por `tenant_id`, então o DELETE só afeta registros do tenant correto — isso está OK no banco. Mas a deleção no SaaS Auth logo depois não tem essa proteção:

```typescript
await fetch(`${saasUrl}/auth/v1/admin/users/${user_id}`, { method: "DELETE", ... });
```

Se o `user_id` pertencer a outro tenant (ex: usuário de suporte), ele seria deletado do SaaS Auth mesmo que o DELETE no CRM não tenha afetado nenhuma linha. Adicionar verificação antes de chamar a Admin API:

```typescript
// Verificar que o usuário realmente pertencia ao tenant antes de deletar no SaaS
const { count } = await crmClient
  .from("tenant_users")
  .select("*", { count: "exact", head: true })
  .eq("user_id", user_id)
  .eq("tenant_id", tenant_id);

// Se count === 0 após o delete, o usuário não existia neste tenant
// Não chamar a Admin API do SaaS
```

Melhor ainda: verificar a existência ANTES do delete, guardar o resultado, e só chamar o SaaS se o registro existia.

---

### 4.4 MÉDIO — `getTenantIdFromJwt` não valida a assinatura do JWT

```typescript
const payload = JSON.parse(atob(token.split(".")[1]));
return payload.tenant_id ?? null;
```

O decode sem verificação de assinatura significa que qualquer JWT malformado ou forjado com um `tenant_id` arbitrário seria aceito pelas edge functions de métricas. Como essas funções usam service role key para buscar os tokens OAuth, um atacante poderia forjar um JWT com o `tenant_id` de outro tenant e obter os tokens OAuth desse tenant.

Recomendação: nas edge functions que usam service role key, validar o JWT contra o `SAAS_JWT_SECRET`:

```typescript
import { verify } from "https://deno.land/x/djwt/mod.ts";

const key = await crypto.subtle.importKey(
  "raw",
  new TextEncoder().encode(Deno.env.get("SAAS_JWT_SECRET")),
  { name: "HMAC", hash: "SHA-256" },
  false,
  ["verify"]
);
const payload = await verify(token, key); // lança se inválido
```

---

### 4.5 MÉDIO — CORS com `*` em produção

```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  ...
};
```

Todas as edge functions usam `*`. O guia menciona que `APP_URL` deve ser usado quando disponível para restringir a origem. Em produção com domínio fixo, isso deve ser configurado.

```typescript
const allowedOrigin = Deno.env.get("APP_URL") ?? "*";
const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  ...
};
```

---

### 4.6 BAIXO — `validate-access` expõe `insertErr.message` ao cliente

```typescript
return new Response(JSON.stringify({ error: `Erro ao registrar usuário: ${insertErr.message}` }), ...);
```

Mensagens de erro do banco podem conter detalhes internos (nome de constraint, schema, etc.). Logar o detalhe no servidor e retornar mensagem genérica ao cliente.

```typescript
console.error("[validate-access] insert error:", insertErr.message);
return new Response(JSON.stringify({ error: "Erro ao registrar usuário. Tente novamente." }), ...);
```

---

### 4.7 BAIXO — Validação de formato de entrada ausente

Em `validate-access`, os campos `tenant_id`, `email` e `user_id` chegam do body sem validação de formato:

- `tenant_id` não é validado como UUID
- `email` não é validado como e-mail válido (além do que o SaaS Auth faz)
- `user_id` não é validado como UUID

Adicionar validação mínima:

```typescript
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!UUID_REGEX.test(tenant_id)) {
  return new Response(JSON.stringify({ error: "tenant_id inválido" }), { status: 400 });
}
```

---

## 5. Banco de dados / Migrations

### 5.1 RLS — política `FOR ALL` inclui INSERT sem restrição de tenant

```sql
CREATE POLICY "clients_tenant_isolation" ON clients
  FOR ALL
  USING (...)
  WITH CHECK (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    OR (auth.jwt() ->> 'role') = 'support'
  );
```

A política está correta — `WITH CHECK` garante que INSERTs só podem definir o `tenant_id` do próprio usuário. Mas vale documentar explicitamente que o frontend nunca deve fazer INSERT direto nessas tabelas (deve passar pelas edge functions ou hooks que garantem o `tenant_id` correto).

### 5.2 `custom_access_token_hook` — `tenant_id` como TEXT, não UUID

```sql
v_tenant_id TEXT;
-- ...
v_tenant_id := event->'claims'->'user_metadata'->>'tenant_id';
```

O `tenant_id` é armazenado como `TEXT` no JWT claim (o que é correto para JSON), mas o cast `(auth.jwt() ->> 'tenant_id')::UUID` nas políticas RLS vai falhar silenciosamente se o valor não for um UUID válido — retornando 0 registros em vez de erro. Isso é aceitável como comportamento de segurança (fail-safe), mas deve ser documentado.

### 5.3 `001_plans_and_subscriptions.sql` — `ON CONFLICT DO NOTHING` sem constraint explícita

```sql
INSERT INTO plans (name, max_users, price_brl)
VALUES ('Starter', 3, 0.00), ...
ON CONFLICT DO NOTHING;
```

`ON CONFLICT DO NOTHING` sem especificar a coluna de conflito depende de qualquer constraint existente. Se a tabela não tiver uma constraint `UNIQUE` em `name`, o comportamento pode ser inesperado. Adicionar:

```sql
ALTER TABLE plans ADD CONSTRAINT plans_name_unique UNIQUE (name);
-- ou usar ON CONFLICT (name) DO NOTHING
```

### 5.4 Migration `20260501000005_jwt_config.sql` — arquivo de documentação disfarçado de migration

O arquivo executa apenas um `SELECT` com uma string informativa. Isso vai aparecer no histórico de migrations como executado, mas não faz nada. Considerar mover o conteúdo para `docs/` ou `saas_db/README.md` e remover o arquivo de migrations.

---

## 6. Pontos positivos

- Isolamento por RLS está correto e cobre todas as tabelas relevantes
- Backfill idempotente bem implementado com `WHERE tenant_id IS NULL`
- Rollback no `invite` (deleta do SaaS se o INSERT no CRM falhar) é um bom padrão
- Separação clara entre `supabaseAuth` e `supabaseCrm` no frontend
- Hook `useAuth` bem estruturado com extração limpa do JWT
- Sessão de suporte com bypass de RLS implementada corretamente
- `custom_access_token_hook` com `GRANT`/`REVOKE` explícitos — boa prática de segurança
- Migrations opcionais com `IF EXISTS` para tabelas que podem não existir

---

## 7. Priorização das correções

| Prioridade | Item | Arquivo | Status |
|---|---|---|---|
| 🔴 Crítico | Verificar caller em `validate-access` | `supabase/functions/validate-access/index.ts` | ✅ Corrigido |
| 🔴 Crítico | Usar access token do usuário em vez de anon key | `src/hooks/useTenantUsers.ts` | ✅ Corrigido |
| 🟠 Alto | Validar JWT com assinatura nas edge functions de métricas | `meta-ads-metrics`, `gads-metrics`, `ga4-metrics` | ✅ Corrigido |
| 🟠 Alto | Verificar existência do user_id no tenant antes de deletar no SaaS | `supabase/functions/validate-access/index.ts` | ✅ Corrigido |
| 🟡 Médio | Extrair `getTenantIdFromJwt` para `_shared/jwt.ts` | 4 edge functions | ✅ Corrigido |
| 🟡 Médio | Mover lógica de query de `TenantSelector` para hook | `src/components/auth/TenantSelector.tsx` | ✅ Corrigido (`useSupportTenants`) |
| 🟡 Médio | Restringir CORS com `APP_URL` em produção | Todas as edge functions | ✅ Corrigido |
| 🟡 Médio | Adicionar validação de UUID/email no body de `validate-access` | `supabase/functions/validate-access/index.ts` | ✅ Corrigido |
| 🟢 Baixo | Tipar `checkLimit` com `SupabaseClient` | `supabase/functions/validate-access/index.ts` | ✅ Corrigido |
| 🟢 Baixo | Tratar erro silencioso em `TenantSelector` | `src/components/auth/TenantSelector.tsx` | ✅ Corrigido |
| 🟢 Baixo | Adicionar `UNIQUE (name)` em `plans` | `saas_db/migrations/001_plans_and_subscriptions.sql` | ✅ Corrigido |
| 🟢 Baixo | Mover conteúdo de `20260501000005_jwt_config.sql` para docs | `supabase/migrations/` | ✅ Corrigido (`docs/jwt-config-setup.md`) |
