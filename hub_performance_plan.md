# 🚀 Plano de Execução: Evolução do Módulo de Clientes (Hub de Performance)

Este plano descreve a implementação das novas funcionalidades para transformar o módulo de clientes em um Centro de Gestão de Performance, mantendo a integridade do sistema atual.

---

## 🛠️ Fase 1: Infraestrutura de Dados (Supabase)
*Objetivo: Criar a base de dados necessária com segurança e isolamento por organização.*

1.  **Criação das Tabelas**:
    *   `client_integrations`: Armazenar credenciais de Meta/Google Ads/ (com `organization_id` e `client_id`).
    *   `client_kpis`: Métricas manuais por cliente.
    *   `campaign_data`: Dados brutos de campanhas importados via n8n.
    *   `daily_metrics`: Métricas consolidadas diárias (Performance Gold Standard).
2.  **Segurança (RLS)**:
    *   Aplicar políticas de `Row Level Security` para garantir que cada organização acesse apenas seus dados.
    *   Criar chaves de acesso públicas/privadas para a visualização externa do dashboard.

---

## 🏗️ Fase 2: Camada de Integração (Hooks & API)
*Objetivo: Criar a ponte entre o Frontend e as novas tabelas.*

1.  **Hooks Customizados**:
    *   `useClientIntegrations`: CRUD de conexões Meta/Google.
    *   `useClientKPIs`: Gestão de métricas manuais.
    *   `useClientReports`: Fetch de dados das tabelas `campaign_data` e `daily_metrics`.
2.  **Criptografia**:
    *   Implementar (via Supabase Edge Functions ou no n8n) a criptografia dos `access_tokens` sensíveis.

---

## 🎨 Fase 3: Interface do Usuário (Hub do Cliente)
*Objetivo: Adicionar as novas abas dentro do detalhe do cliente no CRM.*

1.  **Modificações em `ClientsPage.tsx`**:
    *   Adicionar as abas: **Integrações**, **KPIs** e **Relatórios**.
2.  **Componentes das Abas**:
    *   `ClientIntegrationsTab`: Interface para conectar IDs de conta e tokens.
    *   `ClientKPIsTab`: Formulário para inserção de dados manuais (Faturamento, Ticket Médio).
    *   `ClientReportsTab`: Dashboards com gráficos (Recharts) consumindo `daily_metrics`.

---

## 🔄 Fase 4: Automação de Dados (n8n)
*Objetivo: Popular as tabelas de performance automaticamente.*

1.  **Workflow de Coleta**:
    *   Leitura periódica de `client_integrations`.
    *   Chamadas às APIs de Marketing (Facebook Graph API / Google Ads API).
    *   Escrita em `campaign_data`.
2.  **Workflow de Processamento**:
    *   Consolidação diária de gastos e resultados em `daily_metrics`.

---

## 🌍 Fase 5: Dashboard Externo (Multi-domínio)
*Objetivo: Permitir que o cliente final visualize seus resultados em um domínio separado.*

1.  **Estratégia de Acesso**:
    *   Gerar um `token_slug` único por cliente.
    *   Criar uma aplicação *lightweight* (ou rota específica) que aceite esse token para exibir apenas o dashboard de um cliente específico.
    *   Configuração de CNAME ou Proxy para o novo domínio.

---

## 🔐 Fase 6: Segurança e Validação
*Objetivo: Garantir que tudo esteja funcionando sem erros e de forma segura.*

1.  **Auditoria**:
    *   Garantir que as ações nas novas tabelas sejam registradas no log de auditoria.
2.  **Testes de Carga**:
    *   Validar a performance da query consolidada em `daily_metrics` com grandes volumes de dados.

---

### 📝 Notas Importantes:
*   **Zero Downtime**: Nenhuma alteração será feita na tabela `clients` existente, apenas extensões.
*   **Escalabilidade**: O uso de `daily_metrics` evita lentidão no dashboard geral.
*   **Isolamento**: O dashboard do cliente será 100% isolado do sistema de gestão interna.
