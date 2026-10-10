-- Limpa registros antigos de senhas de suporte (e-mails no formato antigo)
-- Os novos registros serão gerados com o formato <código>@agenciac8.com.br
TRUNCATE TABLE public.c8_support_passwords;
