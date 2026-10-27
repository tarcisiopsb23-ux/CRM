-- =============================================================================
-- Migration 127: Content Operations — Vinculação de clientes e fornecedores
-- Banco A — Idempotente
--
-- 1. content_clients — registra quais clientes estão vinculados ao módulo de
--    gestão de conteúdo. Sem este vínculo, o cliente não aparece no módulo.
--
-- 2. content_items.supplier_id — permite atribuir um fornecedor externo
--    (da tabela suppliers) a um item de conteúdo, seguindo o mesmo padrão
--    de tasks.supplier_id já existente no projeto.
--
-- Dependências: migrations 118 (content_items), clients, profiles, suppliers
-- =============================================================================

-- ─── 1. content_clients ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.content_clients (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id       UUID        NOT NULL REFERENCES public.clients(id)       ON DELETE CASCADE,

  -- Responsável interno pelo conteúdo deste cliente (perfil da agência)
  responsible_id  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Quem vinculou e quando
  linked_by       UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  linked_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Estado do vínculo
  active          BOOLEAN     NOT NULL DEFAULT true,
  notes           TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Um cliente só pode ser vinculado uma vez por organização
  UNIQUE (organization_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_content_clients_org_id
  ON public.content_clients(organization_id);
CREATE INDEX IF NOT EXISTS idx_content_clients_client_id
  ON public.content_clients(client_id);
CREATE INDEX IF NOT EXISTS idx_content_clients_responsible
  ON public.content_clients(responsible_id)
  WHERE responsible_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_content_clients_active
  ON public.content_clients(organization_id, active);

ALTER TABLE public.content_clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "content_clients_agency_access" ON public.content_clients;
CREATE POLICY "content_clients_agency_access"
  ON public.content_clients FOR ALL TO authenticated
  USING (organization_id = public.get_user_organization_id())
  WITH CHECK (organization_id = public.get_user_organization_id());

CREATE OR REPLACE TRIGGER trg_content_clients_updated_at
  BEFORE UPDATE ON public.content_clients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.content_clients IS
  'Clientes da agência vinculados ao módulo de Gestão de Conteúdo.
   Um cliente precisa ser explicitamente vinculado aqui para aparecer
   no módulo e ter campanhas, briefings e itens associados.
   responsible_id: colaborador interno responsável pelo conteúdo deste cliente.';

-- ─── 2. content_items.supplier_id ─────────────────────────────────────────────
-- Permite atribuir um fornecedor externo (designers, videomakers, etc.)
-- a um item de conteúdo. Segue o padrão de tasks.supplier_id.
-- Quando supplier_id está preenchido, assigned_to_type deve ser 'agency'
-- (o fornecedor é gerenciado pela agência, não tem acesso autônomo via portal).

ALTER TABLE public.content_items
  ADD COLUMN IF NOT EXISTS supplier_id UUID
  REFERENCES public.suppliers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_content_items_supplier_id
  ON public.content_items(supplier_id)
  WHERE supplier_id IS NOT NULL;

COMMENT ON COLUMN public.content_items.supplier_id IS
  'Fornecedor externo responsável pela execução deste item (designer, videomaker, etc.).
   Referencia public.suppliers — o mesmo padrão de tasks.supplier_id.
   Pode ser fornecedor da agência ou do cliente.
   Quando preenchido, assigned_to_type deve ser ''agency''.';

-- ─── 3. RPC: get_content_clients ──────────────────────────────────────────────
-- Retorna clientes vinculados ao módulo com dados do vínculo + dados do cliente.

CREATE OR REPLACE FUNCTION public.get_content_clients(
  p_organization_id UUID,
  p_active_only     BOOLEAN DEFAULT true
)
RETURNS TABLE (
  content_client_id UUID,
  client_id         UUID,
  client_name       TEXT,
  client_company    TEXT,
  client_slug       TEXT,
  favicon_url       TEXT,
  responsible_id    UUID,
  responsible_name  TEXT,
  linked_at         TIMESTAMPTZ,
  active            BOOLEAN,
  notes             TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cc.id                        AS content_client_id,
    cc.client_id,
    c.name                       AS client_name,
    c.company                    AS client_company,
    c.dashboard_slug             AS client_slug,
    c.favicon_url,
    cc.responsible_id,
    p.full_name                  AS responsible_name,
    cc.linked_at,
    cc.active,
    cc.notes
  FROM public.content_clients cc
  JOIN public.clients c ON c.id = cc.client_id
  LEFT JOIN public.profiles p ON p.id = cc.responsible_id
  WHERE cc.organization_id = p_organization_id
    AND (NOT p_active_only OR cc.active = true)
  ORDER BY c.name ASC;
END;
$$;

-- ─── Versão ───────────────────────────────────────────────────────────────────
INSERT INTO public.schema_migrations (version)
VALUES ('127_content_clients_and_supplier')
ON CONFLICT (version) DO NOTHING;
