-- =============================================================================
-- MAESTR.IA - SCRIPT DE LIMPEZA ESPECÍFICA (REPORTS & AUDIT)
-- Data: 2026-03-15
-- Descrição: Este script limpa dados de relatórios, fluxo de caixa, analytics 
-- de vendas e auditoria, preservando a estrutura e o usuário administrador.
-- =============================================================================

DO $$
BEGIN
    -- 1. Limpar Auditoria
    DELETE FROM public.audit_logs;
    RAISE NOTICE 'Tabela audit_logs limpa.';

    -- 2. Limpar Fluxo de Caixa e Financeiro (Pagamentos, Categorias, Folhas)
    -- Nota: Mantemos as tabelas de Clientes e Contratos, mas limpamos os lançamentos.
    DELETE FROM public.payments;
    DELETE FROM public.payroll_expenses;
    DELETE FROM public.payrolls;
    DELETE FROM public.financial_categories;
    RAISE NOTICE 'Tabelas financeiras (payments, payrolls, categories) limpas.';

    -- 3. Limpar Analytics de Vendas e Marketing
    DELETE FROM public.campaign_metrics;
    DELETE FROM public.campaigns;
    DELETE FROM public.ad_accounts;
    RAISE NOTICE 'Tabelas de analytics e campanhas limpas.';

    -- 4. Limpar Histórico de CRM (Relatórios de conversão)
    DELETE FROM public.lead_stage_history;
    RAISE NOTICE 'Histórico de etapas de leads (analytics vendas) limpo.';

    -- 5. Limpar Metas e Relatórios de Progresso
    DELETE FROM public.goal_progress;
    DELETE FROM public.goals;
    RAISE NOTICE 'Metas e progresso de metas limpos.';

    -- 6. Limpar Logs de Chat e Mensagens (Relatórios de Atendimento)
    DELETE FROM public.chat_history;
    DELETE FROM public.whatsapp_messages;
    RAISE NOTICE 'Histórico de chat e mensagens limpo.';

    RAISE NOTICE 'Limpeza de relatórios, financeiro e auditoria concluída com sucesso.';

END $$;
