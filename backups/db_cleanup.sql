-- =============================================================================
-- MAESTR.IA - SCRIPT DE LIMPEZA TOTAL (DATABASE WIPE)
-- Data: 2026-03-15
-- Descrição: Este script remove todos os dados de todas as tabelas de negócio,
-- preservando apenas o usuário tarcisiopsb23@gmail.com e sua organização.
-- =============================================================================

DO $$
DECLARE
    target_email TEXT := 'tarcisiopsb23@gmail.com';
    keep_org_id UUID;
    keep_user_id UUID;
BEGIN
    -- 1. Identificar o usuário e organização que devem ser mantidos
    SELECT organization_id, id INTO keep_org_id, keep_user_id 
    FROM public.profiles 
    WHERE email = target_email;

    IF keep_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuário % não encontrado no banco de dados.', target_email;
    END IF;

    -- 2. Limpar tabelas de Auditoria e Logs
    DELETE FROM public.audit_logs;
    DELETE FROM public.chat_history;

    -- 3. Limpar tabelas de Marketing e Campanhas
    DELETE FROM public.campaign_metrics;
    DELETE FROM public.campaigns;
    DELETE FROM public.ad_accounts;

    -- 4. Limpar tabelas de CRM (Leads e Clientes)
    DELETE FROM public.lead_stage_history;
    DELETE FROM public.leads;
    DELETE FROM public.client_contacts;
    DELETE FROM public.clients;
    DELETE FROM public.lead_pipelines;

    -- 5. Limpar tabelas de Financeiro e Contratos
    DELETE FROM public.payments;
    DELETE FROM public.contracts;
    DELETE FROM public.financial_categories;
    DELETE FROM public.payroll_expenses;
    DELETE FROM public.payrolls;

    -- 6. Limpar tabelas de Projetos e Tarefas
    DELETE FROM public.project_members;
    DELETE FROM public.projects;
    DELETE FROM public.timeclock_entries;

    -- 7. Limpar tabelas de Metas e Eventos
    DELETE FROM public.goal_progress;
    DELETE FROM public.goals;
    DELETE FROM public.event_attendees;
    DELETE FROM public.events;

    -- 8. Limpar tabelas de WhatsApp e Integrações
    DELETE FROM public.whatsapp_messages;
    DELETE FROM public.whatsapp_conversations;
    DELETE FROM public.whatsapp_contacts;
    DELETE FROM public.organization_integrations;

    -- 9. Limpar tabelas de Equipe e Permissões
    DELETE FROM public.team_members;
    DELETE FROM public.teams;
    DELETE FROM public.permissions;
    DELETE FROM public.job_title_permission_scopes;
    DELETE FROM public.job_title_permissions;
    DELETE FROM public.job_title_role_mappings;
    DELETE FROM public.job_title_catalog;

    -- 10. Limpar tabelas Miscelâneas
    DELETE FROM public.documents;
    DELETE FROM public.db_c8_rag;
    DELETE FROM public.dados_cliente;
    DELETE FROM public.invitation_tokens;

    -- 11. Limpar outros usuários (Perfis)
    DELETE FROM public.profiles WHERE id != keep_user_id;

    -- 12. Limpar outras organizações
    DELETE FROM public.organizations WHERE id != keep_org_id;

    RAISE NOTICE 'Limpeza concluída. Preservado usuário: % e organização ID: %', target_email, keep_org_id;

END $$;

-- NOTA IMPORTANTE:
-- Este script limpa os dados nas tabelas do esquema PUBLIC.
-- Usuários cadastrados no Supabase Auth (auth.users) que foram removidos do public.profiles
-- continuarão existindo no Auth e devem ser removidos manualmente via Dashboard do Supabase
-- se você desejar uma limpeza completa do sistema de autenticação.
