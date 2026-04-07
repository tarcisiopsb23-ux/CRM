## Guia base de revisão de código

Este arquivo serve como **referência padrão** para revisar o código deste CRM, com foco em:

- **Clean Code**
- **Clean Architecture**
- **Cibersegurança**

Use este guia em PRs, commits grandes e revisões periódicas.

---

## 1. Checklist rápido por PR

- **Escopo claro**
  - O PR tem um objetivo único e bem definido?
  - O título e a descrição explicam o “porquê” da mudança?

- **Build e testes**
  - `npm run build` passou?
  - `npm run lint` passou?
  - Testes relevantes (quando existirem) foram executados?

- **Clean Code**
  - Nomes de variáveis, funções, componentes e arquivos são claros e descritivos?
  - Funções e componentes estão pequenos e focados em uma única responsabilidade?
  - Código duplicado foi evitado ou extraído para helpers/hooks reutilizáveis?
  - Não há código comentado morto ou logs de debug esquecidos?

- **Clean Architecture**
  - Lógica de domínio está em **hooks, serviços ou camada de domínio**, não dentro de componentes de UI?
  - A dependência entre camadas é sempre da **camada externa para a interna**, nunca o contrário?
  - A integração com Supabase, APIs externas e browser APIs está concentrada em **hooks/lib/infra**, não espalhada?

- **Segurança**
  - Nenhum segredo (keys privadas, tokens, senhas) foi incluído no código ou em arquivos `.env.example`?
  - Consultas ao Supabase respeitam **RLS** e usam o usuário autenticado (nada de service role no frontend)?
  - Validações de entrada e tratamento de erros foram implementados para dados vindos do usuário ou de integrações?
  - Não há endpoints/Edge Functions expostos sem autenticação/autorização adequada?

---

## 2. Clean Code

### 2.1 Nomenclatura

- **Nomes descritivos**
  - **Funções**: descrevem o que fazem (`loadLeadsForOrganization`, `createLeadFromForm`).
  - **Componentes React**: descrevem o que renderizam (`LeadsKanbanColumn`, `TeamProfilesList`).
  - **Hooks**: começam com `use` e indicam claramente o propósito (`useLeadsKanban`, `useSalesAnalytics`, `usePermissions`).

- **Evitar nomes genéricos**
  - Não usar `data`, `info`, `list` quando for possível algo mais expressivo (`leadList`, `clientFormValues`, `teamMembers`).

### 2.2 Funções e componentes

- **Curto e focado**
  - Funções devem ter **uma responsabilidade principal**.
  - Componentes grandes (muitos estados, muitos efeitos, JSX enorme) devem ser quebrados em subcomponentes/hook.

- **Hooks**
  - `useEffect` deve:
    - Sincronizar estado com fonte externa **ou**
    - Assinar/desinscrever eventos.
  - Evitar lógica complexa dentro de `useEffect` quando pode ser extraída para função pura reutilizável.

### 2.3 Erros, logs e mensagens

- **Tratamento de erros**
  - Toda chamada a Supabase/Edge Function deve tratar erro (`if (error) throw error` ou mensagem amigável).
  - Evitar engolir exceções silenciosamente sem log mínimo.

- **Logs**
  - `console.log`/`console.error` só quando realmente necessários para monitoramento.
  - Remover logs de debug antes de mergear em master.

### 2.4 Estilo e consistência

- **Padrões de projeto**
  - Usar o mesmo padrão de composição de UI (`components/ui`, layout base, `SettingsSection`, etc.).
  - Manter consistência de importações (paths relativos vs alias `@`).

- **Formatação**
  - Confiar no formatter da IDE e nas regras do ESLint.
  - Não misturar estilos diferentes de aspas, indentação, etc.

---

## 3. Clean Architecture (adaptado para React + Supabase)

### 3.1 Camadas sugeridas

- **Camada de domínio (regras de negócio)**
  - Tipos em `src/types` (ex.: `Profile`, `Lead`, `PermissionModule`).
  - Lógica de negócio em hooks e serviços: `src/hooks`, `src/lib`.

- **Camada de aplicação**
  - Orquestração de casos de uso (por exemplo, `useLeadsKanban`, `useSalesAnalytics`, `useSettings`).
  - Coordination de múltiplas chamadas (Supabase, estados locais, cache).

- **Camada de infraestrutura**
  - Integrações externas: `src/lib/supabase.ts`, `supabase/functions/*`, `supabase/migrations`.
  - Configuração de roteamento, tema, Tailwind, Vite, etc.

- **Camada de apresentação**
  - Componentes React (UI), páginas (`src/pages`), layout (`src/components/layout`).
  - Não devem conter regra de negócio complexa (somente apresentação e composição).

### 3.2 Regras de dependência

- **Permitido**
  - UI → hooks de domínio (`useLeadsKanban`, `useFinancial`, `usePermissions`).
  - Hooks de domínio → `lib/supabase`, `lib/supabase-utils`, tipos.
  - Hooks de domínio → outros hooks de domínio (quando fizer sentido).

- **Evitar**
  - UI acessando Supabase diretamente (`supabase.from(...)` dentro de componente).
  - Funções de infra (Supabase, fetch) chamando componentes ou hooks.
  - Edge Functions contendo regra de apresentação (HTML complexa, templates acoplados à UI).

### 3.3 Critérios por arquivo

- **Componentes (`src/components`, `src/pages`)**
  - Conter apenas:
    - Composição de outros componentes.
    - Chamadas a hooks.
    - Lógica leve de view (ex.: mapear lista para JSX, formatar datas, etc.).

- **Hooks (`src/hooks`)**
  - Centralizar:
    - Chamadas a Supabase.
    - Processamento de dados de negócio.
    - Regras de permissão e filtragem.

- **`lib` e integrações**
  - `supabase.ts`: apenas criação do client tipado.
  - `supabase-utils.ts`: helpers genéricos para conversão/serialização.
  - Funções edge: regras bem definidas de entrada/saída, validação e autorização.

---

## 4. Cibersegurança

### 4.1 Segredos e variáveis de ambiente

- **Nunca**:
  - Comitar:
    - Chaves de service role (`SUPABASE_SERVICE_ROLE_KEY`).
    - Chaves privadas de APIs externas.
    - Tokens de acesso de produção.
  - Colocar segredos em:
    - Código fonte (`src/*`).
    - `.env.example` (apenas placeholders).

- **Sempre**
  - Usar variáveis de ambiente privadas em servidores/Edge Functions (nunca no frontend).
  - Documentar apenas o **nome** da variável e um valor de exemplo genérico.

### 4.2 Supabase / banco de dados

- **RLS e permissões**
  - Conferir se todas as tabelas sensíveis têm:
    - `ENABLE ROW LEVEL SECURITY`.
    - Políticas que usam `auth.uid()` / `get_user_organization_id()` / `user_has_role(...)`.
  - Verificar se queries no frontend nunca usam service role key.

- **Consultas**
  - Sempre filtrar por organização/usuário quando a tabela for multi-tenant (`organization_id`, `user_id`).
  - Evitar selects `*` muito amplos para dados sensíveis; selecionar apenas colunas necessárias.

### 4.3 Edge Functions / APIs

- **Autenticação**
  - Exigir `Authorization: Bearer <JWT>` para actions sensíveis (convites, criação de usuários, operações financeiras).
  - Validar o usuário chamador (ex.: perfil `admin`/`owner`, organização correta).

- **Validação de entrada**
  - Validar e normalizar todos os campos vindos do `req.json()`:
    - Tipos (string, number, boolean).
    - Formatos (e-mail, UUID, datas).
    - Tamanho máximo.

- **Erros**
  - Nunca retornar mensagens com detalhes internos de banco, stack trace ou chaves.
  - Usar respostas genéricas para erros internos (`"Erro interno"`) e logar detalhes apenas no servidor.

### 4.4 Frontend

- **Proteção de rotas e módulos**
  - Rotas protegidas sempre passando por `ProtectedRoute` e/ou `ModuleGuard`.
  - Não renderizar dados sensíveis quando `canView` for falso.

- **Entrada do usuário**
  - Escapar/filtrar dados usados em HTML perigoso (ex.: conteúdo vindo de comentários, descrições ricas).
  - Evitar `dangerouslySetInnerHTML` sempre que possível.

---

## 5. Endurecimentos de segurança (implementados/recomendados)

- **CORS nas Edge Functions**
  - `create-user-direct` e `invite-by-email`: quando `APP_URL` está configurado, `Access-Control-Allow-Origin` usa a origem derivada (ex.: `https://app.maestr.com`). Sem `APP_URL`, usa `*` para dev local.

- **Rate limiting (recomendação para infra)**
  - As RPCs `validate_registration_code` e `validate_invitation_token` são públicas (sem auth). Em produção, considere:
    - Rate limiting no Supabase (regras de projeto) ou WAF na frente da API.
    - Monitoramento de tentativas falhas em volume.

---

## 6. Como usar este arquivo em revisões

- **Antes de começar o PR**
  - Verificar se a mudança segue a separação de camadas (UI ↔ hooks ↔ lib/infra).
  - Checar se qualquer nova tabela/migration veio com RLS adequada.

- **Durante a revisão**
  - Passar pelo **Checklist rápido por PR** (seção 1 acima).
  - Validar pelo menos:
    - Nomes, responsabilidades e separação de camadas.
    - Pontos de acesso a dados (Supabase) e uso de permissões.
    - Manuseio de segredos e variáveis de ambiente.

- **Depois do merge**
  - Se a mudança criou um novo padrão (hook, tipo, fluxo de segurança), considerar documentá-lo em `docs/` para futuras revisões.

