-- Migration 027: Adicionar colunas de Conteúdo IA na tabela clients
-- Requisitos: 14.1, 14.3

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS client_supabase_url TEXT,
  ADD COLUMN IF NOT EXISTS client_supabase_anon_key TEXT,
  ADD COLUMN IF NOT EXISTS show_ia_content BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.clients.client_supabase_url IS 'URL do projeto Supabase próprio do cliente, usado pelo módulo Conteúdo IA do Dashboard Público';
COMMENT ON COLUMN public.clients.client_supabase_anon_key IS 'Chave anon do projeto Supabase próprio do cliente, usada pelo módulo Conteúdo IA do Dashboard Público';
COMMENT ON COLUMN public.clients.show_ia_content IS 'Flag que habilita o módulo Conteúdo IA no Dashboard Público do cliente (padrão: false)';
