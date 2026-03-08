# Maestr.IA - CRM

CRM/ERP para agências. Multi-tenant com Supabase, React e TypeScript.

## Stack

- **Frontend:** Vite, React 18, TypeScript, Tailwind CSS, Radix UI, TanStack Query
- **Backend:** Supabase (PostgreSQL, Auth, Realtime)
- **UI:** shadcn/ui, Lucide Icons

## Pré-requisitos

- Node.js 18+
- npm ou pnpm
- Projeto Supabase ([supabase.com](https://supabase.com))

## Setup

### 1. Clone e instale

```sh
git clone <URL_DO_REPOSITORIO>
cd CRM
npm install
```

### 2. Variáveis de ambiente

Copie o exemplo e preencha com os dados do seu projeto Supabase:

```sh
cp .env.example .env
```

Edite `.env`:

```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anonima
```

### 3. Migrations (Supabase)

Para ambiente **local** (Docker):

```sh
npx supabase start
npx supabase db reset
```

Para Supabase **remoto**:

```sh
npx supabase link --project-ref SEU_PROJECT_ID
npx supabase db push
```

Migrations são executadas na ordem numérica (00001 a 00017).

### 4. Edge Functions (cadastro direto de colaborador)

Para a opção **"Cadastrar diretamente"** na aba Equipe funcionar:

```sh
npx supabase functions deploy create-user-direct
```

O `SUPABASE_SERVICE_ROLE_KEY` é configurado automaticamente no projeto Supabase.

### 5. Rodar o projeto

```sh
npm run dev
```

Acesse: http://localhost:5173

## Scripts

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run preview` | Preview do build |
| `npm run lint` | ESLint |
| `npm run test` | Testes com Vitest |

## Módulos

| Módulo | Status |
|--------|--------|
| Dashboard | ✅ |
| Leads / Kanban | ✅ |
| Clientes | ✅ |
| Fornecedores | ✅ |
| Financeiro | ✅ |
| Projetos | ✅ |
| Metas | ✅ |
| Equipe | 🔄 Em andamento |
| Agenda | 🔄 Em andamento |
| Configurações | ✅ |

## Documentação

- [Modelo de dados](supabase/DATABASE_MODEL.md)
- [Auth e email](docs/AUTH_EMAIL_SETUP.md)
- [Plano de regularização](docs/PLANEJAMENTO_REGULARIZACAO.md)

## Regenerar tipos Supabase

Após alterar o schema:

```sh
npx supabase gen types typescript --local > src/types/supabase.ts
```

Para Supabase remoto, use `--project-id` ou `--linked`.
