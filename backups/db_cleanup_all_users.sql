-- =============================================================================
-- MAESTR.IA - SCRIPT DE LIMPEZA TOTAL (PRESERVA TODOS OS USUÁRIOS)
-- Descrição: Remove todos os dados de negócio, mantendo profiles, organizations
--            e os vínculos entre eles intactos.
-- ATENÇÃO: Operação irreversível. Faça backup antes de executar.
-- =============================================================================

DO $
BEGIN

    -- -------------------------------------------------------------------------
    -- 1. Auditoria e Logs
    -- -------------------------------------------------------------------------
    DELETE FROM public.audit_logs;
    DELETE FROM public.chat_history;

    -- -------------------------------------------------------------------------
    -- 2. Marketing e Campanhas
    -- -------------------------------------------------------------------------
    DELETE FROM public.campaign_metrics;
    DELETE FROM public.campaigns;
    DELETE FROM public.ad_accounts;

    -- -------------------------------------------------------------------------
    -- 3. CRM - Leads e Clientes
    -- -------------------------------------------------------------------------
    DELETE FROM public.lead_stage_history;
    DELETE FROM public.leads;
    DELETE FROM public.client_contacts;
    DELETE FROM public.clients;
    DELETE FROM public.lead_pipelines;

    -- -------------------------------------------------------------------------
    -- 4. Financeiro e Contratos
    -- -------------------------------------------------------------------------
    DELETE FROM public.payments;
    DELETE FROM public.contracts;
    DELETE FROM public.financial_categories;
    DELETE FROM public.payroll_expenses;
    DELETE FROM public.payrolls;

    -- -------------------------------------------------------------------------
    -- 5. Projetos e Tarefas
    -- -------------------------------------------------------------------------
    DELETE FROM public.project_members;
    DELETE FROM public.tasks;
    DELETE FROM public.projects;
    DELETE FROM public.timeclock_entries;

    -- -------------------------------------------------------------------------
    -- 6. Metas e Eventos
    -- -------------------------------------------------------------------------
    DELETE FROM public.goal_progress;
    DELETE FROM public.goals;
    DELETE FROM public.event_attendees;
    DELETE FROM public.events;

    -- -------------------------------------------------------------------------
    -- 7. WhatsApp e Integrações
    -- -------------------------------------------------------------------------
    DELETE FROM public.whatsapp_messages;
    DELETE FROM public.whatsapp_conversations;
    DELETE FROM public.whatsapp_contacts;
    DELETE FROM public.organization_integrations;

    -- -------------------------------------------------------------------------
    -- 8. Equipe e Permissões
    -- -------------------------------------------------------------------------
    DELETE FROM public.team_members;
    DELETE FROM public.teams;
    DELETE FROM public.permissions;
    DELETE FROM public.job_title_permission_scopes;
    DELETE FROM public.job_title_permissions;
    DELETE FROM public.job_title_role_mappings;
    DELETE FROM public.job_title_catalog;

    -- -------------------------------------------------------------------------
    -- 9. Miscelâneas
    -- -------------------------------------------------------------------------
    DELETE FROM public.documents;
    DELETE FROM public.db_c8_rag;
    DELETE FROM public.dados_cliente;
    DELETE FROM public.invitation_tokens;

    RAISE NOTICE 'Limpeza concluída. Todos os usuários (profiles) e organizações foram preservados.';

END $;

-- =============================================================================
-- NOTAS:
-- - As tabelas `profiles` e `organizations` são preservadas integralmente.
-- - Tabelas que não existirem no seu banco serão ignoradas com erro; remova
--   as linhas correspondentes se necessário.
-- - Usuários no Supabase Auth (auth.users) não são afetados por este script.
-- =============================================================================
