# Especificação: Consolidação Public Dashboard + C8 Control

## Visão Geral

Este documento descreve o projeto de consolidação do Public Dashboard com as funcionalidades do C8 Control. O objetivo é trazer toda a operação do cliente para dentro do Public Dashboard existente, eliminando a necessidade de um aplicativo externo separado, mantendo a arquitetura de dois bancos de dados e preservando integralmente o visual e os módulos já existentes.

---

## Contexto e Motivação

### Situação Atual

- **Public Dashboard**: aplicação existente em `/public/dashboard/:slug/*`, com autenticação baseada em senha única por cliente, tema escuro forçado, sidebar e módulos de IA (Agenda, Promoções, Sugestões, Avisos, Eventos).
- **C8 Control**: aplicação externa rodando em VPS separada, com CRM completo (contatos, funil, produtos), WhatsApp via Baileys/Evolution API, gerenciamento de usuários, configurações de IA.
- **CRM (Banco A)**: plataforma da agência que gerencia clientes, planos, cobranças, tokens OAuth de Meta Ads e Google Ads, dados de campanha.

### Problema

Os clientes precisam alternar entre dois sistemas distintos. O C8 Control exige manutenção de infraestrutura separada. Não há integração direta entre os dados operacionais do cliente e o dashboard de performance da agência.

### Solução

Integrar as funcionalidades do C8 Control diretamente no Public Dashboard, usando o padrão `useDynamicClient` para separar os dados operacionais do cliente (Banco B — Supabase próprio do cliente) dos dados de controle da agência (Banco A — Supabase da agência).

---

## Arquitetura de Bancos de Dados

### Banco A — Supabase da Agência (imutável neste projeto)

Contém dados sob responsabilidade da agência. Nenhuma tabela existente será removida ou alterada estruturalmente.

| Tabela | Responsabilidade |
|--------|-----------------|
| `organizations` | Organizações/agências |
| `clients` | Clientes cadastrados |
| `contracts` | Contratos e planos |
| `payments` | Pagamentos e cobranças |
| `campaign_data` | Dados de campanhas de Meta/Google |
| `campaign_demographics` | Dados demográficos de audiência *(nova)* |
| `meta_ad_accounts` | Contas de Meta Ads com tokens OAuth *(nova)* |
| `google_ad_accounts` | Contas de Google Ads com tokens OAuth *(nova)* |
| `crm_client_plans` | Planos e configurações de módulos por cliente |

### Banco B — Supabase do Cliente (via `useDynamicClient`)

Dados operacionais de propriedade do cliente. Cada cliente tem seu próprio Supabase isolado.

| Tabela | Responsabilidade |
|--------|-----------------|
| `crm_contacts` | Contatos do CRM |
| `crm_deals` | Negociações/oportunidades |
| `crm_products` | Produtos e serviços |
| `crm_pipeline_stages` | Etapas do funil de vendas |
| `crm_users` | Usuários com acesso ao dashboard |
| `crm_whatsapp_sessions` | Metadados de sessões WhatsApp |
| `ai_settings` | Configurações do agente de IA |
| `ai_events` | Eventos registrados pelo agente |
| `ai_reminders` | Lembretes rápidos |
| `schema_migrations` | Controle de versão de migrações |

### Regra Fundamental de Tokens OAuth

Os tokens de Meta Ads e Google Ads **sempre** ficam armazenados no Banco A, nas tabelas `meta_ad_accounts` e `google_ad_accounts`, com o campo `owned_by` indicando `'agency'` ou `'client'`. O cliente **nunca** visualiza o token — apenas o status de conexão.

---

## O Que NÃO Deve Ser Alterado

Os itens abaixo estão fora do escopo de modificação e devem permanecer intactos:

- **Visual do Public Dashboard**: tema escuro forçado, sidebar, header, estilos de cards
- **Módulos de IA existentes**: `AgendaPage`, `PromocoesPage`, `SugestoesPage`, `AvisosPage`, `EventosPage`
- **Hooks existentes**: `useDynamicClient`, `usePartnershipImpact`, `useClientKPIs`, `useClientConversationKpis`
- **Módulo C8 Control no CRM** (planos, pagamentos, bloqueio, suporte) — apenas expandir, não substituir
- **Leitura de dados de campanha via RPC do Banco A**
- **Estrutura de rotas existentes** do Public Dashboard

---

## Requisitos Funcionais por Fase

---

## Fase 1 — Fundação (Bloqueante)

> Esta fase deve ser concluída antes de qualquer outra. Todos os módulos das fases seguintes dependem da autenticação multi-usuário e do schema do Banco B.

### RF-1.1 — Autenticação Multi-Usuário

**Descrição**: Substituir a autenticação por senha única por autenticação real via Supabase Auth do Banco B (email + senha por usuário).

**Requisitos detalhados**:

- A página de login (`PublicDashboardLoginPage.tsx`) deve exibir campos de email e senha no lugar da senha única atual.
- A autenticação deve ocorrer via `supabase.auth.signInWithPassword()` do Banco B do cliente.
- O JWT retornado pelo Supabase deve ser armazenado no `ClientAuthContext` como token de sessão.
- O JWT **não deve** conter senhas ou chaves de API. Deve conter: `role`, `client_id`, `user_id`.
- Nenhuma senha ou chave de API deve ser armazenada no `localStorage`.
- O logout deve chamar `supabase.auth.signOut()` e limpar o contexto.
- A sessão deve ser persistida via `supabase.auth.onAuthStateChange` para sobreviver a reloads.

**Papéis (roles)**:

| Role | Permissões |
|------|-----------|
| `owner` | Acesso total, incluindo configurações, usuários e faturamento |
| `admin` | Acesso total exceto faturamento |
| `manager` | CRM, WhatsApp, Dashboard — sem gerenciar usuários |
| `member` | CRM e WhatsApp — sem configurações |
| `viewer` | Apenas leitura em todos os módulos |

**Critérios de Aceite**:
- [ ] Login com email/senha válidos redireciona para o dashboard
- [ ] Login com credenciais inválidas exibe mensagem de erro clara
- [ ] JWT armazenado no contexto não expõe senha ou chave de API
- [ ] Logout limpa sessão e redireciona para a tela de login
- [ ] Usuário com role `viewer` não consegue acessar rotas de configuração
- [ ] Sessão persiste após reload da página
- [ ] Tentativas de login com rate limiting bloqueiam após 5 falhas consecutivas

---

### RF-1.2 — Migrações do Schema do Banco B

**Descrição**: Criar as migrações SQL que definem o schema no Banco B de cada cliente.

**Tabelas a criar**:

```sql
-- crm_contacts
CREATE TABLE crm_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  source TEXT,
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT now()
);

-- crm_deals
CREATE TABLE crm_deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL,
  contact_id UUID REFERENCES crm_contacts(id),
  product_id UUID REFERENCES crm_products(id),
  stage_id UUID REFERENCES crm_pipeline_stages(id),
  value NUMERIC(12,2),
  status TEXT DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- crm_products
CREATE TABLE crm_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(12,2),
  unit TEXT DEFAULT 'unidade',
  active BOOLEAN DEFAULT true
);

-- crm_pipeline_stages
CREATE TABLE crm_pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL,
  name TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  color TEXT DEFAULT '#6366f1'
);

-- crm_whatsapp_sessions
CREATE TABLE crm_whatsapp_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL,
  phone_number TEXT,
  session_status TEXT DEFAULT 'disconnected',
  connected_at TIMESTAMPTZ
);

-- ai_reminders
CREATE TABLE ai_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL,
  text TEXT NOT NULL,
  due_date TIMESTAMPTZ,
  completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- schema_migrations
CREATE TABLE schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ DEFAULT now()
);
```

**RLS obrigatório em todas as tabelas**:
- Todas as tabelas do Banco B devem ter Row Level Security habilitado.
- As políticas devem isolar dados por `client_id` validado via JWT claim.
- Nenhuma query deve retornar dados de outro cliente.

**Critérios de Aceite**:
- [ ] Todas as tabelas listadas existem no schema do Banco B após execução da migração
- [ ] RLS está habilitado em todas as tabelas
- [ ] Políticas de RLS impedem acesso cruzado entre clientes
- [ ] Tabela `schema_migrations` registra a versão aplicada
- [ ] Migração é idempotente (pode ser executada múltiplas vezes sem erro)
- [ ] Foreign keys entre tabelas estão corretamente definidas

---

### RF-1.3 — Upgrade do `useDynamicClient` para Auth JWT

**Descrição**: Atualizar o hook `useDynamicClient` para usar o JWT da sessão do Banco B em vez da anon key pura, garantindo que as políticas de RLS sejam corretamente aplicadas.

**Requisitos detalhados**:

- O hook deve aceitar o token JWT do `ClientAuthContext` e passá-lo como `Authorization: Bearer <token>` nas requisições ao Banco B.
- Quando o usuário não estiver autenticado, o hook deve usar apenas a anon key (acesso público limitado por RLS).
- O hook deve re-inicializar o cliente Supabase quando o token mudar.
- A anon key do Banco B deve vir apenas de variáveis de ambiente, nunca hardcoded.

**Critérios de Aceite**:
- [ ] Requisições ao Banco B incluem o JWT no header de autorização quando o usuário está logado
- [ ] Dados respeitam as políticas de RLS com o JWT presente
- [ ] Troca de sessão (logout/login) re-inicializa o cliente corretamente
- [ ] Nenhuma chave de API aparece no código-fonte ou no localStorage

---

## Fase 2 — Novos Módulos

### RF-2.1 — Módulo CRM

**Descrição**: Criar as páginas de CRM acessíveis em `/public/dashboard/:slug/crm/*`.

#### RF-2.1.1 — Lista de Clientes (`/crm/clientes`)

**Requisitos detalhados**:

- Exibir tabela/lista de contatos de `crm_contacts` via Banco B.
- Campo de busca por nome, telefone ou email (busca em tempo real com debounce de 300ms).
- Filtros: por fonte (`source`), por tags, por data de criação.
- Botão "Importar" que abre modal para upload de CSV com mapeamento de colunas.
- Botão "Novo Contato" que abre formulário inline ou modal.
- Ao clicar em um contato, abre painel lateral com detalhes e negociações associadas.
- Paginação ou scroll infinito (mínimo 50 registros por página).
- Usuários com role `viewer` não podem criar, editar ou excluir contatos.

**Critérios de Aceite**:
- [ ] Lista exibe contatos do Banco B corretamente
- [ ] Busca filtra resultados em tempo real
- [ ] Importação via CSV cria contatos na tabela `crm_contacts`
- [ ] Criação de novo contato persiste no Banco B
- [ ] Edição de contato reflete imediatamente na lista
- [ ] Exclusão exige confirmação
- [ ] Role `viewer` não vê botões de ação
- [ ] Contatos de outros clientes nunca aparecem (RLS validado)

---

#### RF-2.1.2 — Pipeline Kanban (`/crm/pipeline`)

**Requisitos detalhados**:

- Exibir colunas baseadas em `crm_pipeline_stages` ordenadas pelo campo `order`.
- Cards de negociações (`crm_deals`) exibidos em cada coluna conforme `stage_id`.
- Drag-and-drop de cards entre colunas atualiza `stage_id` no Banco B.
- Cada card exibe: nome do contato, nome do produto, valor.
- Botão "Nova Negociação" abre modal com seleção de contato, produto e estágio inicial.
- Totalizador de valor por coluna exibido no cabeçalho de cada coluna.
- Possibilidade de criar/editar/reordenar etapas do funil (apenas roles `admin` e `owner`).

**Critérios de Aceite**:
- [ ] Colunas refletem `crm_pipeline_stages` do Banco B
- [ ] Drag-and-drop persiste a mudança de estágio
- [ ] Valor total por coluna está correto
- [ ] Nova negociação associa contato, produto e estágio
- [ ] Criação/edição de etapas restritas a `admin`/`owner`
- [ ] Pipeline vazio exibe estado de tela vazia orientando o usuário

---

#### RF-2.1.3 — Catálogo de Produtos (`/crm/produtos`)

**Requisitos detalhados**:

- Listar produtos de `crm_products` do Banco B.
- Exibir: nome, descrição resumida, preço, unidade, status (ativo/inativo).
- Botão "Novo Produto" abre formulário com validação.
- Toggle de ativo/inativo por produto.
- Busca por nome.
- Apenas roles `admin` e `owner` podem criar/editar/excluir produtos.

**Critérios de Aceite**:
- [ ] Lista exibe produtos do Banco B
- [ ] Criação de produto persiste com todos os campos
- [ ] Toggle ativo/inativo reflete em tempo real
- [ ] Role `member`/`viewer` vê somente leitura
- [ ] Preço exibido em formato monetário brasileiro (R$)

---

### RF-2.2 — Módulo WhatsApp (`/whatsapp`)

**Descrição**: Integrar a conexão WhatsApp via Evolution API / Baileys ao Public Dashboard.

**Requisitos detalhados**:

- Exibir status atual da conexão: `connected`, `disconnected`, `connecting`, `qr_pending`.
- Se desconectado: botão "Conectar" que solicita QR Code ao backend da Evolution API.
- QR Code exibido em modal com contador regressivo de validade (tipicamente 20 segundos).
- Após conexão bem-sucedida, armazenar metadados em `crm_whatsapp_sessions` no Banco B (número, status, `connected_at`). O token de sessão real **permanece no VPS**.
- Listagem de conversas ativas (lidas do Banco B ou via webhook).
- Importação de contatos do WhatsApp para `crm_contacts`.
- Se o cliente tem Agente de IA:
  - Exibir toggle "Bot ativo/inativo" que atualiza `ai_settings.bot_active` no Banco B e dispara webhook para o Chatwoot.
  - Exibir contagem de conversas ativas com e sem bot.
  - Toggle de handoff (transferência humana) por conversa.

**Critérios de Aceite**:
- [ ] Status de conexão exibido corretamente
- [ ] QR Code gerado e exibido com tempo de expiração
- [ ] Após scan do QR, status muda para `connected`
- [ ] Metadados de sessão salvos em `crm_whatsapp_sessions`
- [ ] Token de sessão WhatsApp não é exposto no frontend
- [ ] Importação de contatos cria registros em `crm_contacts`
- [ ] Toggle do bot atualiza `ai_settings.bot_active` e dispara webhook
- [ ] Módulo não aparece para clientes sem WhatsApp habilitado no plano

---

### RF-2.3 — Melhorias no Dashboard Geral

**Descrição**: Adicionar novos cards e funcionalidades condicionais ao `DashboardGeralPage`.

#### RF-2.3.1 — Card de Lembretes Rápidos

- Card com lista de lembretes de `ai_reminders` do Banco B.
- Permite criar lembretes com texto e data/hora opcionais.
- Toggle para marcar como concluído.
- Lembretes vencidos destacados em vermelho.
- Máximo de 5 itens visíveis; link "ver todos" expande.

**Critérios de Aceite**:
- [ ] Lembretes exibidos em ordem por `due_date`
- [ ] Criação de lembrete persiste no Banco B
- [ ] Marcar como concluído atualiza `completed = true`
- [ ] Lembretes vencidos têm destaque visual

#### RF-2.3.2 — Toggle Bot na Sidebar

- Ícone/toggle na sidebar que exibe estado atual do bot (`ai_settings.bot_active`).
- Ao clicar, alterna o estado e dispara webhook ao Chatwoot com o novo status.
- Feedback visual imediato (loading state durante a chamada).
- Visível apenas para clientes com módulo de IA ativo.

**Critérios de Aceite**:
- [ ] Toggle reflete estado real de `ai_settings.bot_active`
- [ ] Mudança persiste no Banco B
- [ ] Webhook Chatwoot é disparado com payload correto
- [ ] Estado de loading exibido durante a atualização
- [ ] Oculto para clientes sem IA

#### RF-2.3.3 — Cards Condicionais de CRM

- Card de contatos recentes: exibido apenas se `crm_contacts` tiver registros.
- Card de receita estimada: soma de `value` de `crm_deals` com `status = 'won'` × preço do produto associado. Exibido apenas se houver negociações ganhas.
- Ambos os cards seguem o padrão visual existente do dashboard.

**Critérios de Aceite**:
- [ ] Card de contatos oculto quando tabela vazia
- [ ] Card de receita exibe valor correto calculado
- [ ] Cards ocultados quando módulo CRM não está habilitado no plano

---

## Fase 3 — Enriquecimento

### RF-3.1 — Aba "Audiência" na Página de Performance

**Descrição**: Adicionar nova aba "Audiência" na `PerformancePage` com visualizações demográficas baseadas em `campaign_demographics` do Banco A.

**Visualizações obrigatórias**:

| Visualização | Tipo | Fonte |
|-------------|------|-------|
| Eficiência por hora × dia da semana | Heatmap | `campaign_demographics` |
| Distribuição por faixa etária | Gráfico de barras | `campaign_demographics` |
| Distribuição por gênero | Donut/pizza | `campaign_demographics` |
| Top cidades/estados | Tabela ranqueada | `campaign_demographics` |
| Breakdown por plataforma | Barras empilhadas | `campaign_demographics` |
| Breakdown por dispositivo | Donut/pizza | `campaign_demographics` |

**Requisitos detalhados**:

- A aba "Audiência" aparece somente se `demographics_enabled = true` no plano do cliente (Banco A).
- Dados lidos via RPC ou query direta ao Banco A, nunca ao Banco B.
- Filtros de período (últimos 7, 14, 30 dias) sincronizados com o filtro global da página.
- Tooltip detalhado em cada visualização.
- Estado de loading com skeleton enquanto dados são carregados.
- Estado vazio orientando o usuário quando não há dados demográficos.

**Critérios de Aceite**:
- [ ] Todas as 6 visualizações renderizam corretamente com dados reais
- [ ] Aba oculta quando `demographics_enabled = false`
- [ ] Filtro de período funcional em todas as visualizações
- [ ] Dados vêm exclusivamente do Banco A
- [ ] Tooltips informativos em todos os gráficos
- [ ] Skeleton loading exibido durante fetch

---

### RF-3.2 — Conexão OAuth Meta Ads e Google Ads

**Descrição**: Permitir que clientes conectem suas contas de anúncios diretamente pelo dashboard, com o fluxo OAuth gerenciado pela agência.

**Arquitetura do fluxo OAuth**:

1. Cliente clica em "Conectar Meta Ads" ou "Conectar Google Ads" nas configurações.
2. Frontend redireciona para URL da Edge Function no domínio da agência.
3. Edge Function inicia o fluxo OAuth com o provedor.
4. Após autorização, Edge Function armazena o token em `meta_ad_accounts` ou `google_ad_accounts` no Banco A, com `client_id` e `owned_by = 'client'`.
5. Frontend exibe apenas o status de conexão (conectado/desconectado).
6. O n8n lê o token de `meta_ad_accounts` por `client_id` para executar sincronizações.

**Requisitos detalhados**:

- Botões "Conectar Meta Ads" e "Conectar Google Ads" visíveis em `ConfiguracoesPage`.
- Ao conectar, exibir modal de confirmação explicando o que será acessado.
- Após conexão bem-sucedida, exibir nome da conta conectada e data da conexão.
- Botão "Desconectar" que remove o token do Banco A (apenas `owner` e `admin`).
- O token **nunca** é enviado ao frontend, apenas o status e metadados básicos.
- Edge Function deve validar o `client_id` antes de armazenar o token.

**Critérios de Aceite**:
- [ ] Fluxo OAuth completo funciona para Meta Ads
- [ ] Fluxo OAuth completo funciona para Google Ads
- [ ] Token armazenado apenas no Banco A
- [ ] Frontend recebe apenas status e nome da conta
- [ ] Desconexão remove o token do Banco A
- [ ] Botões ocultados para roles sem permissão

---

### RF-3.3 — C8 Control como Centralizador de Features

**Descrição**: Expandir o módulo C8 Control no CRM da agência para controlar quais módulos cada cliente pode acessar no Public Dashboard.

**Campo `modules_config` em `crm_client_plans`**:

```json
{
  "crm_enabled": true,
  "whatsapp_enabled": true,
  "demographics_enabled": false,
  "ia_enabled": true,
  "max_contacts": 5000,
  "max_users": 10,
  "asaas_enabled": false,
  "pixel_config": {
    "meta_pixel_id": "",
    "google_tag_id": ""
  }
}
```

**Requisitos detalhados**:

- Interface no `C8TenantDetail.tsx` para editar cada campo do `modules_config`.
- Toggles visuais para cada módulo boolean.
- Campos numéricos para limites (`max_contacts`, `max_users`).
- Campos de texto para IDs de pixel/tag.
- Ao salvar, atualizar `crm_client_plans` no Banco A.
- O Public Dashboard lê `modules_config` na inicialização e oculta módulos desabilitados.

**Critérios de Aceite**:
- [ ] Interface de edição de `modules_config` funcional no C8 Control
- [ ] Toggles refletem estado real do banco
- [ ] Módulos desabilitados ficam ocultos no Public Dashboard do cliente
- [ ] Limites numéricos são respeitados (ex: não criar mais usuários que `max_users`)
- [ ] Pixel IDs salvos em `modules_config` são injetados nas páginas corretas

---

## Fase 4 — Expansão de Configurações

### RF-4.1 — Página de Usuários e Permissões

**Rota**: `/public/dashboard/:slug/configuracoes/usuarios`

**Requisitos detalhados**:

- Listar usuários de `crm_users` do Banco B com: nome, email, role, data de criação, último acesso.
- Botão "Convidar Usuário" (abre modal com campo de email e seleção de role).
- Convite enviado via `supabase.auth.admin.inviteUserByEmail()` no Banco B.
- Alteração de role por usuário existente.
- Remoção de usuário (com confirmação).
- Limitar total de usuários ao `crm_client_plans.max_users` do Banco A; ao atingir o limite, botão de convite fica desabilitado com tooltip explicativo.
- Apenas roles `owner` e `admin` têm acesso a esta página.

**Critérios de Aceite**:
- [ ] Lista de usuários carrega corretamente do Banco B
- [ ] Convite por email funciona e cria usuário no Banco B
- [ ] Alteração de role persiste
- [ ] Remoção de usuário exige confirmação
- [ ] Limite de usuários é respeitado
- [ ] Acesso restrito a `owner`/`admin`
- [ ] Role `manager` ou inferior vê a rota como "Acesso Negado"

---

### RF-4.2 — Página de Configurações de Pagamento

**Rota**: `/public/dashboard/:slug/configuracoes/pagamentos`

**Requisitos detalhados**:

- Exibir métodos de pagamento aceitos pelo cliente (boleto, PIX, cartão de crédito).
- Toggles para habilitar/desabilitar cada método.
- Se `asaas_enabled = true` no `modules_config`:
  - Campo para inserir chave de API do Asaas (armazenada de forma segura no Banco B, nunca exposta).
  - Status de conexão com o Asaas.
  - Link para criação de cobranças rápidas.
- Configurações salvas em `ai_settings` ou tabela dedicada no Banco B.
- Apenas `owner` pode acessar esta página.

**Critérios de Aceite**:
- [ ] Toggles de métodos de pagamento funcionam
- [ ] Seção Asaas visível apenas quando habilitada no plano
- [ ] Chave Asaas não é retornada ao frontend após salva
- [ ] Acesso restrito ao role `owner`

---

### RF-4.3 — Página de Configurações de Integrações

**Rota**: `/public/dashboard/:slug/configuracoes/integracoes`

**Requisitos detalhados**:

- Campo: Meta Pixel ID (salvo em `ai_settings.meta_pixel_id` no Banco B).
- Campo: Google Tag ID (salvo em `ai_settings.google_tag_id` no Banco B).
- Seção UTM Builder: gerador de links UTM com campos source, medium, campaign, content, term. Botão de copiar o link gerado.
- Seção OAuth: botões "Conectar Meta Ads" e "Conectar Google Ads" (integração com RF-3.2).
- Ao salvar Pixel ID / Tag ID, o código de tracking deve ser injetado dinamicamente nas páginas do dashboard.
- Apenas `owner` e `admin` podem editar integrações.

**Critérios de Aceite**:
- [ ] Meta Pixel ID salvo e injetado no `<head>` das páginas
- [ ] Google Tag ID salvo e injetado corretamente
- [ ] UTM Builder gera URL com parâmetros corretos
- [ ] Botão de cópia do UTM funciona
- [ ] Conexões OAuth integradas corretamente
- [ ] Valores sensíveis não retornados ao frontend após salvos

---

## Requisitos Não-Funcionais

### RNF-1 — Segurança

- Nenhuma chave de API exposta no frontend (nem em código-fonte, nem em `localStorage`, nem em `sessionStorage`).
- A anon key do Banco B deve estar apenas em variáveis de ambiente (`VITE_SUPABASE_B_ANON_KEY` ou equivalente).
- Validação JWT em toda requisição ao Banco B via RLS do Supabase.
- Todas as tabelas do Banco B com RLS habilitado e políticas por `client_id`.
- Dados sensíveis (tokens OAuth, chaves Asaas) armazenados apenas no banco, nunca retornados ao cliente.
- Rate limiting em endpoints de autenticação via Edge Function (máximo 5 tentativas em 15 minutos por IP).
- Tema escuro sempre forçado (sem opção de tema claro que possa expor dados inadvertidamente).

### RNF-2 — Performance

- Todas as páginas devem renderizar o estado inicial em menos de 2 segundos em conexão 4G.
- Queries ao Banco B devem usar índices em `client_id` para garantir performance.
- Implementar paginação ou scroll infinito em listas com potencial de crescimento (contatos, negociações).
- Skeleton loading em todos os componentes que fazem fetch de dados.

### RNF-3 — Consistência Visual

- Todos os novos componentes devem seguir o design system existente do Public Dashboard.
- Tema escuro forçado em todas as novas páginas.
- Usar os mesmos componentes de card, badge, tabela e modal já existentes.
- Ícones do mesmo conjunto já utilizado no projeto (Lucide React ou equivalente).
- Nenhuma dependência CSS nova que possa conflitar com o tema existente.

### RNF-4 — Isolamento de Dados

- Nenhuma query pode retornar dados de um `client_id` diferente do autenticado.
- Validação de `client_id` deve ocorrer via RLS no banco, não apenas no frontend.
- Logs de auditoria para operações sensíveis (criação/remoção de usuários, desconexão OAuth).

### RNF-5 — Disponibilidade

- O módulo de IA existente não pode ser afetado por falhas nos novos módulos.
- Novos módulos devem falhar de forma isolada (error boundary por módulo/rota).
- Se o Banco B estiver indisponível, o dashboard deve exibir estado de erro sem travar toda a aplicação.

---

## Rotas a Adicionar em `App.tsx`

```
/public/dashboard/:slug/crm                    → CrmPage (redirect para /crm/clientes)
/public/dashboard/:slug/crm/clientes           → CrmPage (lista de contatos)
/public/dashboard/:slug/crm/pipeline           → CrmPipelinePage
/public/dashboard/:slug/crm/produtos           → CrmProdutosPage
/public/dashboard/:slug/whatsapp               → WhatsAppPage
/public/dashboard/:slug/configuracoes/usuarios → ConfigUsuariosPage
/public/dashboard/:slug/configuracoes/pagamentos → ConfigPagamentosPage
/public/dashboard/:slug/configuracoes/integracoes → ConfigIntegracoesPage
```

Todas as novas rotas devem:
- Estar dentro do `PublicDashboardLayout` existente.
- Ter guards de role adequados (verificação no layout).
- Redirecionar para `/login` se não autenticado.

---

## Arquivos a Criar

### Páginas

| Arquivo | Descrição |
|---------|-----------|
| `src/pages/public-dashboard/CrmPage.tsx` | Lista de contatos CRM |
| `src/pages/public-dashboard/CrmPipelinePage.tsx` | Pipeline kanban |
| `src/pages/public-dashboard/CrmProdutosPage.tsx` | Catálogo de produtos |
| `src/pages/public-dashboard/WhatsAppPage.tsx` | Gerenciamento de sessão WhatsApp |
| `src/pages/public-dashboard/ConfigUsuariosPage.tsx` | Gestão de usuários e permissões |
| `src/pages/public-dashboard/ConfigPagamentosPage.tsx` | Configurações de pagamento |
| `src/pages/public-dashboard/ConfigIntegracoesPage.tsx` | Configurações de integrações |

### Hooks

| Arquivo | Descrição |
|---------|-----------|
| `src/hooks/useDynamicAuth.ts` | Hook de autenticação para o Banco B |
| `src/hooks/useCrmContacts.ts` | CRUD de contatos do CRM |
| `src/hooks/useCrmDeals.ts` | CRUD de negociações |
| `src/hooks/useCrmProducts.ts` | CRUD de produtos |
| `src/hooks/useCrmPipeline.ts` | Gerenciamento de estágios e kanban |
| `src/hooks/useWhatsAppSession.ts` | Status e controle de sessão WhatsApp |
| `src/hooks/useAiReminders.ts` | CRUD de lembretes rápidos |
| `src/hooks/useCampaignDemographics.ts` | Leitura de dados demográficos do Banco A |
| `src/hooks/useAdAccounts.ts` | Status de contas de anúncios (Meta/Google) |

### Migrações

| Arquivo | Banco | Descrição |
|---------|-------|-----------|
| `migrations/034_meta_google_ad_accounts.sql` | Banco A | Tabelas de contas de anúncios com OAuth |
| `migrations/034_bank_b_crm_schema.sql` | Banco B | Schema completo do CRM no cliente |
| `migrations/035_campaign_demographics.sql` | Banco A | Tabela de dados demográficos de campanha |

---

## Arquivos a Modificar

| Arquivo | Modificação |
|---------|------------|
| `src/pages/PublicDashboardLoginPage.tsx` | Substituir senha única por email + senha multi-usuário |
| `src/contexts/ClientAuthContext.tsx` | Armazenar sessão JWT do Banco B |
| `src/hooks/useDynamicClient.ts` | Usar JWT do contexto de auth |
| `src/pages/public-dashboard/PublicDashboardSidebar.tsx` | Novos itens de menu + toggle do bot |
| `src/pages/public-dashboard/PublicDashboardLayout.tsx` | Guards de role por rota |
| `src/pages/public-dashboard/DashboardGeralPage.tsx` | Cards condicionais + lembretes |
| `src/pages/public-dashboard/PerformancePage.tsx` | Aba "Audiência" com visualizações demográficas |
| `src/pages/public-dashboard/ConfiguracoesPage.tsx` | Campos de integração (Meta Pixel, Google Tag) |
| `src/components/c8control/C8TenantDetail.tsx` | Interface de `modules_config` |
| `src/App.tsx` | Registro das novas rotas |

---

## Breakdown de Tarefas

### Fase 1 — Fundação

- [ ] **T-1.1** Atualizar `PublicDashboardLoginPage.tsx` com formulário email + senha
- [ ] **T-1.2** Atualizar `ClientAuthContext.tsx` para armazenar JWT do Banco B
- [ ] **T-1.3** Criar `useDynamicAuth.ts` com lógica de login, logout e persistência de sessão
- [ ] **T-1.4** Atualizar `useDynamicClient.ts` para incluir JWT no header de autorização
- [ ] **T-1.5** Criar `migrations/034_bank_b_crm_schema.sql` com todas as tabelas e RLS
- [ ] **T-1.6** Criar script de seed para estágios padrão do pipeline no Banco B
- [ ] **T-1.7** Atualizar `PublicDashboardLayout.tsx` com guards de role por rota
- [ ] **T-1.8** Implementar rate limiting na Edge Function de autenticação

### Fase 2 — Novos Módulos

- [ ] **T-2.1** Criar `useCrmContacts.ts` com operações CRUD e busca
- [ ] **T-2.2** Criar `CrmPage.tsx` com lista, busca, filtros e importação CSV
- [ ] **T-2.3** Criar `useCrmDeals.ts` com CRUD e cálculo de valor
- [ ] **T-2.4** Criar `useCrmPipeline.ts` com gerenciamento de estágios
- [ ] **T-2.5** Criar `CrmPipelinePage.tsx` com kanban drag-and-drop
- [ ] **T-2.6** Criar `useCrmProducts.ts` com CRUD
- [ ] **T-2.7** Criar `CrmProdutosPage.tsx` com lista e formulário
- [ ] **T-2.8** Criar `useWhatsAppSession.ts` para status e controle de sessão
- [ ] **T-2.9** Criar `WhatsAppPage.tsx` com QR code, status e toggle do bot
- [ ] **T-2.10** Criar `useAiReminders.ts` com CRUD de lembretes
- [ ] **T-2.11** Atualizar `DashboardGeralPage.tsx` com card de lembretes e cards condicionais
- [ ] **T-2.12** Atualizar `PublicDashboardSidebar.tsx` com novos itens de menu e toggle do bot
- [ ] **T-2.13** Registrar novas rotas de CRM e WhatsApp em `App.tsx`

### Fase 3 — Enriquecimento

- [ ] **T-3.1** Criar `migrations/035_campaign_demographics.sql` no Banco A
- [ ] **T-3.2** Criar `useCampaignDemographics.ts` para leitura dos dados demográficos
- [ ] **T-3.3** Atualizar `PerformancePage.tsx` com aba "Audiência" e 6 visualizações
- [ ] **T-3.4** Criar `migrations/034_meta_google_ad_accounts.sql` no Banco A
- [ ] **T-3.5** Criar Edge Function para fluxo OAuth Meta Ads
- [ ] **T-3.6** Criar Edge Function para fluxo OAuth Google Ads
- [ ] **T-3.7** Criar `useAdAccounts.ts` para status de conexão
- [ ] **T-3.8** Atualizar `C8TenantDetail.tsx` com interface de `modules_config`
- [ ] **T-3.9** Implementar leitura de `modules_config` na inicialização do dashboard

### Fase 4 — Configurações

- [ ] **T-4.1** Criar `ConfigUsuariosPage.tsx` com lista, convite e gestão de roles
- [ ] **T-4.2** Criar `ConfigPagamentosPage.tsx` com métodos e integração Asaas
- [ ] **T-4.3** Criar `ConfigIntegracoesPage.tsx` com pixels, UTM Builder e OAuth
- [ ] **T-4.4** Atualizar `ConfiguracoesPage.tsx` existente com campos de integração
- [ ] **T-4.5** Registrar novas rotas de configurações em `App.tsx`
- [ ] **T-4.6** Implementar injeção dinâmica de Meta Pixel e Google Tag com base em `ai_settings`

---

## Dependências entre Fases

```
Fase 1 (T-1.x) ──► Fase 2 (T-2.x) ──► Fase 3 (T-3.x)
                                    └──► Fase 4 (T-4.x)
```

- Nenhuma tarefa da Fase 2, 3 ou 4 pode iniciar antes que T-1.1 a T-1.5 estejam concluídas.
- T-3.3 (aba Audiência) pode ser desenvolvida em paralelo com a Fase 2, pois usa apenas o Banco A.
- T-3.8 e T-3.9 (modules_config) podem ser desenvolvidos em paralelo com a Fase 2.
- Fase 4 pode ser desenvolvida em paralelo com Fase 3 após a conclusão da Fase 1.

---

## Glossário

| Termo | Definição |
|-------|-----------|
| **Banco A** | Supabase da agência. Contém dados de controle, contratos, tokens OAuth e dados de campanha. |
| **Banco B** | Supabase do cliente. Contém dados operacionais do CRM, WhatsApp e configurações do agente. |
| **useDynamicClient** | Hook que instancia o cliente Supabase do Banco B com base nas credenciais do cliente autenticado. |
| **modules_config** | Campo JSONB em `crm_client_plans` que controla quais módulos estão habilitados para cada cliente. |
| **RLS** | Row Level Security — mecanismo do Supabase para isolamento de dados por políticas no banco. |
| **owned_by** | Campo nas tabelas de contas de anúncios que indica se o token pertence à agência (`'agency'`) ou ao cliente (`'client'`). |
| **slug** | Identificador único amigável do cliente usado nas URLs do Public Dashboard. |
| **handoff** | Transferência de uma conversa do bot de IA para atendimento humano. |
