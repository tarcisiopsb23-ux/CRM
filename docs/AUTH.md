# Supabase Auth & RBAC

Este documento explica como autenticação, permissões e Row Level Security (RLS) funcionam no CRM.

---

## Visão geral

- **Auth**: Supabase Auth com email/senha
- **Perfis**: Tabela `profiles` ligada a `auth.users` com role e `organization_id`
- **Organizações**: Multi-tenant por `organization_id`
- **Equipes**: Tabelas `teams` e `team_members` para acesso por equipe
- **RLS**: Políticas no PostgreSQL garantem isolamento por organização

---

## Fluxo de autenticação

1. **Cadastro** (`/register`): `signUp(email, password, fullName)` → Supabase cria usuário em `auth.users`
2. **Trigger** `handle_new_user`: cria organização e perfil com `role = 'owner'`
3. **Login** (`/login`): `signInWithPassword()` → sessão persistida em `localStorage`
4. **App**: `AuthProvider` escuta `onAuthStateChange` e carrega `profile` via `profiles`

---

## Hierarquia de roles

| Role     | Nível | Acesso leads                     | Acesso org/profiles |
|----------|-------|----------------------------------|----------------------|
| owner    | 5     | CRUD total                       | CRUD (incl. config)  |
| admin    | 4     | CRUD total                       | CRUD (exc. owner)    |
| manager  | 3     | CRUD total                       | Limitado             |
| member   | 2     | CRUD total                       | Limitado             |
| viewer   | 1     | Somente leitura                  | Somente leitura      |

---

## Como as permissões funcionam

### 1. No banco (RLS)

Políticas verificam:

- **`get_user_organization_id()`**: `organization_id` do perfil do usuário
- **`user_has_role(roles[])`**: se o usuário tem algum dos roles informados
- **`auth.uid()`**: ID do usuário autenticado

**Exemplo (leads):**

```sql
-- SELECT: qualquer usuário da org
USING (organization_id = get_user_organization_id())

-- INSERT/UPDATE/DELETE: apenas owner, admin, manager, member (não viewer)
WITH CHECK (user_has_role(ARRAY['owner', 'admin', 'manager', 'member']::user_role[]))
```

### 2. No frontend

| Hook/Componente    | Uso                                       |
|--------------------|-------------------------------------------|
| `useAuth()`        | `user`, `profile`, `signIn`, `signOut`   |
| `useOrganization()`| `organization_id` do perfil               |
| `useProfile(userId)` | Perfil de um usuário específico         |
| `useRequireRole('admin')` | `true` se o usuário tem pelo menos `admin` |
| `<ProtectedRoute requireRole="manager">` | Protege rota por role |

---

## Como proteger rotas

### Rotas autenticadas (qualquer role)

```tsx
<Route
  path="/leads"
  element={
    <ProtectedRoute>
      <LeadsKanbanPage />
    </ProtectedRoute>
  }
/>
```

### Rotas que exigem role

```tsx
<Route
  path="/config"
  element={
    <ProtectedRoute requireRole="admin">
      <ConfigPage />
    </ProtectedRoute>
  }
/>
```

### Redirecionamento após login

`ProtectedRoute` usa `state.from` e redireciona para a URL original após login.

---

## Restringir dados por role

### 1. No backend (RLS)

As políticas definem o que cada role pode fazer (SELECT, INSERT, UPDATE, DELETE). Ver `supabase/migrations/00005_role_based_rls.sql`.

### 2. No frontend (UI condicional)

```tsx
const canEdit = useRequireRole('member');

return (
  <>
    {canEdit && <Button onClick={handleEdit}>Editar</Button>}
  </>
);
```

### 3. Acesso baseado em equipe (opcional)

O schema já possui `teams` e `team_members`. Para filtrar por equipe:

1. Adicionar `team_id` em `leads` (se ainda não existir)
2. Criar função `get_user_team_ids()` retornando IDs das equipes do usuário
3. Política exemplo:

```sql
-- Só vê leads da própria equipe (exceto owner/admin)
CREATE POLICY leads_select_team ON leads FOR SELECT
  USING (
    organization_id = get_user_organization_id()
    AND (
      user_has_role(ARRAY['owner', 'admin']::user_role[])
      OR team_id = ANY(get_user_team_ids())
    )
  );
```

---

## Variáveis de ambiente

```env
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

Use a **anon key**, não a service role. O RLS decide o que o usuário pode acessar.

---

## Rodando as migrações

```bash
supabase db push
# ou
supabase migration up
```

Aplicam, entre outras, as migrações:

- `00004_auth_setup.sql` – trigger de criação de perfil e organização
- `00005_role_based_rls.sql` – restrições por role nos leads
