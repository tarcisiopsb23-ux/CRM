-- Migration 131: Habilitar Supabase Realtime nas tabelas de inbox omnichannel
-- Necessário para notificações em tempo real de novas mensagens no C8 Control

ALTER TABLE public.client_channel_messages REPLICA IDENTITY FULL;
ALTER TABLE public.client_channel_conversations REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.client_channel_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.client_channel_conversations;

INSERT INTO public.schema_migrations (version)
VALUES ('131_realtime_inbox')
ON CONFLICT (version) DO NOTHING;
