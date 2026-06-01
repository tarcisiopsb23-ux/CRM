-- ============================================================
-- Migration: Tabelas do Módulo Conteúdo IA
-- Execute no Supabase do cliente (Client_Supabase)
-- ============================================================

-- 1. Agenda Musical
CREATE TABLE IF NOT EXISTS public.ai_schedule (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    artist      TEXT        NOT NULL,
    date        DATE        NOT NULL,
    time        TIME        NOT NULL,
    description TEXT,
    status      TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Promoções
CREATE TABLE IF NOT EXISTS public.ai_promotions (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    title       TEXT        NOT NULL,
    description TEXT,
    validity    TEXT,
    type        TEXT,
    status      TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Sugestões da Semana
CREATE TABLE IF NOT EXISTS public.ai_suggestions (
    id          UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT           NOT NULL,
    description TEXT,
    price       NUMERIC(10, 2),
    image_url   TEXT,
    status      TEXT           NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at  TIMESTAMPTZ    NOT NULL DEFAULT now()
);

-- 4. Eventos Especiais
CREATE TABLE IF NOT EXISTS public.ai_events (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    title       TEXT        NOT NULL,
    description TEXT,
    date        DATE        NOT NULL,
    time        TIME,
    location    TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Avisos
CREATE TABLE IF NOT EXISTS public.ai_notices (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    message     TEXT        NOT NULL,
    priority    TEXT        NOT NULL CHECK (priority IN ('alta', 'média', 'baixa')),
    validity    TEXT,
    status      TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Configurações do Agente IA
CREATE TABLE IF NOT EXISTS public.ai_settings (
    id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    establishment_name TEXT,
    phone              TEXT,
    instagram          TEXT,
    address            TEXT,
    opening_hours      TEXT,
    welcome_message    TEXT,
    auto_reply_24h     BOOLEAN     NOT NULL DEFAULT true,
    forward_to_human   BOOLEAN     NOT NULL DEFAULT true,
    sidebar_logo_url   TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Row Level Security — acesso público via anon key
-- ============================================================

ALTER TABLE public.ai_schedule    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_promotions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_notices     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_settings    ENABLE ROW LEVEL SECURITY;

-- Políticas: leitura e escrita pública via anon
DO $$ DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['ai_schedule','ai_promotions','ai_suggestions','ai_events','ai_notices','ai_settings']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "public_read"  ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "public_write" ON public.%I', t);
    EXECUTE format('CREATE POLICY "public_read"  ON public.%I FOR SELECT USING (true)', t);
    EXECUTE format('CREATE POLICY "public_write" ON public.%I FOR ALL    USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;
