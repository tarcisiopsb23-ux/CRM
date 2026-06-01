-- Migration 00189: Renomeia o valor 'bloqueada' para 'parada' no enum task_status
-- PostgreSQL não suporta RENAME VALUE diretamente em versões antigas,
-- mas suporta ALTER TYPE ... RENAME VALUE a partir do PostgreSQL 10.

ALTER TYPE public.task_status RENAME VALUE 'bloqueada' TO 'parada';

-- Atualiza registros existentes nas tabelas que usam task_status
-- (o RENAME VALUE já cuida do enum, mas registros TEXT armazenados fora do enum precisam ser atualizados)
UPDATE public.tasks    SET status = 'parada' WHERE status = 'bloqueada';
UPDATE public.projects SET status = 'parada' WHERE status = 'bloqueada';

NOTIFY pgrst, 'reload schema';
