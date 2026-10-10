-- =============================================================================
-- RESET COMPLETO DE LEADS
-- Zera todos os leads e dados relacionados para reinício com novo formato.
-- Clientes existentes NÃO são deletados (lead_id vira NULL via SET NULL).
-- =============================================================================

-- 1. Mensagens WhatsApp (dependem de conversations)
DELETE FROM public.whatsapp_messages;

-- 2. Conversas WhatsApp (dependem de contacts)
DELETE FROM public.whatsapp_conversations;

-- 3. Contatos WhatsApp (lead_id vira NULL automaticamente via SET NULL)
DELETE FROM public.whatsapp_contacts;

-- 4. Histórico de etapas (CASCADE — seria deletado junto com leads, mas explícito por segurança)
DELETE FROM public.lead_stage_history;

-- 5. Leads (clientes com lead_id ficam com lead_id = NULL via SET NULL)
DELETE FROM public.leads;
