-- =============================================================================
-- Migration 00222: Nova etapa 'contato_realizado' no kanban de leads
-- Posição no funil: leads_recebidos → qualificados → contato_realizado → reuniao_agendada
--
-- A coluna etapa_kanban é VARCHAR(100) sem CHECK constraint, portanto nenhuma
-- alteração de DDL é necessária — o novo valor já é aceito pelo banco.
--
-- Esta migration:
--   1. Documenta a nova etapa nos comentários
--   2. Atualiza o label no lead_stage_history para exibição (nenhuma linha
--      existente precisa ser alterada — valores históricos continuam válidos)
--   3. Garante que o índice idx_leads_etapa_kanban cubra o novo valor
--      (já existe e cobre todos os valores de VARCHAR)
-- =============================================================================

-- Nenhum DDL necessário: etapa_kanban é VARCHAR(100) sem CHECK constraint.
-- O valor 'contato_realizado' é aceito automaticamente.

-- Comentário de documentação na coluna
COMMENT ON COLUMN public.leads.etapa_kanban IS
  'Etapas válidas: leads_recebidos, qualificados, contato_realizado, reuniao_agendada, emissao_contrato, efetivados, desqualificado, reuniao_sem_sucesso';
