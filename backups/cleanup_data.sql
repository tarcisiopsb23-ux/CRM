-- =============================================================================
-- LIMPEZA DE DADOS — MANTER APENAS COLABORADORES (profiles)
-- Execute no Supabase SQL Editor
-- ATENÇÃO: Operação irreversível. Faça backup antes de executar.
-- =============================================================================

-- ── 1. LOGS DE AUDITORIA ─────────────────────────────────────────────────────
DELETE FROM public.audit_logs;
DELETE FROM public.audit_log_360;

-- ── 2. AVALIAÇÕES 360° ───────────────────────────────────────────────────────
DELETE FROM public.respostas_avaliacao_360;
DELETE FROM public.resultado_final_360;
DELETE FROM public.avaliacoes_360;
DELETE FROM public.ciclos_avaliacao;

-- ── 3. AVALIAÇÕES TÉCNICAS E DE COLABORADORES ────────────────────────────────
DELETE FROM public.avaliacoes_tecnicas;
DELETE FROM public.employee_evaluations;

-- ── 4. CLIENTES E DEPENDENTES ────────────────────────────────────────────────
DELETE FROM public.client_agent_kpis;
DELETE FROM public.client_conversation_kpis;
DELETE FROM public.client_kpi_history;
DELETE FROM public.client_kpis;
DELETE FROM public.client_integrations;
DELETE FROM public.client_api_keys;
DELETE FROM public.campaign_data;
DELETE FROM public.daily_metrics;
DELETE FROM public.client_contacts;
DELETE FROM public.payments;
DELETE FROM public.contracts;
DELETE FROM public.clients;

-- ── 5. LEADS (CRM / KANBAN) ──────────────────────────────────────────────────
DELETE FROM public.lead_stage_history;
DELETE FROM public.leads;
DELETE FROM public.lead_pipelines;

-- ── 6. METAS ─────────────────────────────────────────────────────────────────
DELETE FROM public.goal_progress;
DELETE FROM public.goals;

-- ── 7. PROJETOS E TAREFAS ────────────────────────────────────────────────────
DELETE FROM public.tasks;
DELETE FROM public.project_members;
DELETE FROM public.projects;

-- ── 8. FORNECEDORES ──────────────────────────────────────────────────────────
DELETE FROM public.supplier_expenses;
DELETE FROM public.suppliers;

-- ── 9. FINANCEIRO ────────────────────────────────────────────────────────────
DELETE FROM public.financial_categories;

-- ── 10. CAMPANHAS E RELATÓRIOS ───────────────────────────────────────────────
DELETE FROM public.report_snapshots;
DELETE FROM public.report_templates;

-- ── 11. PONTO ELETRÔNICO ─────────────────────────────────────────────────────
DELETE FROM public.rep_p_punches;
DELETE FROM public.rep_p_inconsistencies;
DELETE FROM public.rep_p_admin_actions;
DELETE FROM public.rep_p_overtime_authorizations;
DELETE FROM public.rep_p_limit_authorizations;
DELETE FROM public.rep_p_reentry_authorizations;
DELETE FROM public.rep_p_special_day_authorizations;

-- ── 12. COMISSÕES ────────────────────────────────────────────────────────────
DELETE FROM public.commission_entry_sales;
DELETE FROM public.commission_entries;

-- ── 13. AUSÊNCIAS E TREINAMENTOS ─────────────────────────────────────────────
DELETE FROM public.employee_absences;
DELETE FROM public.employee_trainings;

-- ── 14. AGENDA / EVENTOS ─────────────────────────────────────────────────────
DELETE FROM public.event_attendees;
DELETE FROM public.events;

-- ── 15. WHATSAPP ─────────────────────────────────────────────────────────────
DELETE FROM public.whatsapp_messages;
DELETE FROM public.whatsapp_conversations;
DELETE FROM public.whatsapp_contacts;

-- ── VERIFICAÇÃO FINAL ────────────────────────────────────────────────────────
SELECT COUNT(*) AS colaboradores_mantidos FROM public.profiles;
