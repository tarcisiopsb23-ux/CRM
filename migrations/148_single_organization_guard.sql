-- Migration 148: Garante que só existe uma organização no sistema
-- O Maestria atual é single-tenant (uma agência).
-- Novas organizations só devem ser criadas quando o produto
-- for comercializado para outras agências.

-- Trigger que bloqueia criação de nova organization
CREATE OR REPLACE FUNCTION public.prevent_new_organization()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  -- Permite apenas se não existir nenhuma organization ainda (primeiro setup)
  -- ou se a inserção vier com a flag de bypass (para futura comercialização)
  IF EXISTS (SELECT 1 FROM public.organizations LIMIT 1) THEN
    RAISE EXCEPTION 'Criação de nova organização bloqueada. O sistema opera em modo single-tenant. Para habilitar multi-tenant, remova este trigger.';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_prevent_new_organization ON public.organizations;
CREATE TRIGGER trg_prevent_new_organization
  BEFORE INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.prevent_new_organization();

-- Também bloqueia a função que cria organizations automaticamente no signup
-- (o AuthContext e funções RPC criam organizations ao registrar usuário)
-- Substituir handle_new_user para reutilizar a organization existente

CREATE OR REPLACE FUNCTION public.get_or_create_organization(
  p_name TEXT,
  p_slug TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org_id UUID;
BEGIN
  -- Sempre retorna a organização existente (single-tenant)
  SELECT id INTO v_org_id FROM public.organizations LIMIT 1;

  IF v_org_id IS NULL THEN
    -- Primeira vez (setup inicial) — cria a única organização
    INSERT INTO public.organizations (name, slug)
    VALUES (p_name, COALESCE(p_slug, lower(regexp_replace(p_name, '[^a-z0-9]', '-', 'g'))))
    RETURNING id INTO v_org_id;
  END IF;

  RETURN v_org_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.get_or_create_organization(TEXT, TEXT) TO authenticated, service_role;

INSERT INTO public.schema_migrations (version)
VALUES ('148_single_organization_guard')
ON CONFLICT (version) DO NOTHING;
