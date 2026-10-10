-- Enhanced Audit Logs
-- Adiciona campos enriquecidos para auditoria com contexto adicional

-- Tabela extendida para auditoria enriquecida
CREATE TABLE IF NOT EXISTS public.enhanced_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Campos básicos (herdados da audit_logs original)
  table_name TEXT NOT NULL,
  record_id UUID,
  action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'ACCESS_DENIED', 'PERMISSION_CHANGE')),
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  changes JSONB,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Campos enriquecidos
  client_ip INET,
  user_agent TEXT,
  session_id TEXT,
  fingerprint TEXT,
  request_timestamp TIMESTAMPTZ DEFAULT NOW(),
  
  -- Metadados adicionais
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  category TEXT NOT NULL DEFAULT 'data' CHECK (category IN ('auth', 'data', 'permission', 'integration', 'security', 'financial')),
  source TEXT DEFAULT 'enhanced_audit_function', -- Fonte do log
  additional_context JSONB, -- Contexto adicional flexível
  
  -- Índices para performance
  CONSTRAINT enhanced_audit_logs_changed_by_check CHECK (
    (action IN ('LOGIN', 'LOGOUT', 'ACCESS_DENIED')) OR (changed_by IS NOT NULL)
  )
);

-- Índices otimizados
CREATE INDEX IF NOT EXISTS idx_enhanced_audit_logs_table ON enhanced_audit_logs(table_name);
CREATE INDEX IF NOT EXISTS idx_enhanced_audit_logs_record ON enhanced_audit_logs(record_id);
CREATE INDEX IF NOT EXISTS idx_enhanced_audit_logs_changed_at ON enhanced_audit_logs(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_enhanced_audit_logs_org ON enhanced_audit_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_enhanced_audit_logs_changed_by ON enhanced_audit_logs(changed_by);
CREATE INDEX IF NOT EXISTS idx_enhanced_audit_logs_severity ON enhanced_audit_logs(severity);
CREATE INDEX IF NOT EXISTS idx_enhanced_audit_logs_category ON enhanced_audit_logs(category);
CREATE INDEX IF NOT EXISTS idx_enhanced_audit_logs_client_ip ON enhanced_audit_logs(client_ip);
CREATE INDEX IF NOT EXISTS idx_enhanced_audit_logs_session_id ON enhanced_audit_logs(session_id) WHERE session_id IS NOT NULL;

-- RLS para controle de acesso
ALTER TABLE enhanced_audit_logs ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso
DROP POLICY IF EXISTS enhanced_audit_logs_select ON enhanced_audit_logs;
CREATE POLICY enhanced_audit_logs_select ON enhanced_audit_logs
FOR SELECT
USING (
  organization_id = get_user_organization_id()
  AND (
    -- Owner/admin podem ver tudo
    user_has_role(ARRAY['owner', 'admin']::user_role[])
    OR
    -- Manager podem ver apenas logs da própria equipe
    (
      user_has_role(ARRAY['manager']::user_role[])
      AND changed_by IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM team_members tm_me
        JOIN team_members tm_actor
          ON tm_actor.team_id = tm_me.team_id
        WHERE tm_me.profile_id = auth.uid()
          AND tm_actor.profile_id = enhanced_audit_logs.changed_by
      )
    )
    OR
    -- Usuário pode ver seus próprios logs
    (
      changed_by = auth.uid()
    )
  )
);

-- Inserção apenas via função (edge function)
-- Não há policy para INSERT - apenas SECURITY DEFINER pode inserir

-- View para consulta simplificada
CREATE OR REPLACE VIEW enhanced_audit_logs_view AS
SELECT
  eal.id,
  eal.table_name,
  eal.record_id,
  eal.action,
  eal.changed_by,
  p.full_name AS changed_by_name,
  eal.changed_at,
  eal.changes,
  eal.organization_id,
  
  -- Campos enriquecidos
  eal.client_ip,
  eal.user_agent,
  eal.session_id,
  eal.fingerprint,
  eal.request_timestamp,
  eal.severity,
  eal.category,
  eal.source,
  eal.additional_context,
  
  -- Campos derivados para análise
  CASE 
    WHEN eal.client_ip IS NOT NULL THEN 'Sim'
    ELSE 'Não'
  END AS has_ip_tracking,
  
  CASE 
    WHEN eal.fingerprint IS NOT NULL THEN 'Sim'
    ELSE 'Não'
  END AS has_fingerprint,
  
  -- Classificação de risco baseada na severidade e categoria
  CASE 
    WHEN eal.severity = 'critical' THEN 'Crítico'
    WHEN eal.severity = 'high' AND eal.category IN ('security', 'auth', 'financial') THEN 'Alto'
    WHEN eal.severity = 'high' THEN 'Médio-Alto'
    WHEN eal.severity = 'medium' THEN 'Médio'
    ELSE 'Baixo'
  END AS risk_level

FROM enhanced_audit_logs eal
LEFT JOIN profiles p ON p.id = eal.changed_by
WHERE eal.organization_id = get_user_organization_id()
  AND (
    user_has_role(ARRAY['owner', 'admin']::user_role[])
    OR (
      user_has_role(ARRAY['manager']::user_role[])
      AND eal.changed_by IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM team_members tm_me
        JOIN team_members tm_actor
          ON tm_actor.team_id = tm_me.team_id
        WHERE tm_me.profile_id = auth.uid()
          AND tm_actor.profile_id = eal.changed_by
      )
    )
    OR
    eal.changed_by = auth.uid()
  );

-- Função para registrar auditoria enriquecida (chamada pela edge function)
CREATE OR REPLACE FUNCTION public.log_enhanced_audit(
  p_table_name TEXT,
  p_record_id UUID DEFAULT NULL,
  p_action TEXT,
  p_changed_by UUID DEFAULT NULL,
  p_changes JSONB DEFAULT NULL,
  p_organization_id UUID DEFAULT NULL,
  p_client_ip INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_session_id TEXT DEFAULT NULL,
  p_fingerprint TEXT DEFAULT NULL,
  p_severity TEXT DEFAULT 'medium',
  p_category TEXT DEFAULT 'data',
  p_additional_context JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_audit_id UUID;
BEGIN
  -- Determinar organization_id
  v_org_id := COALESCE(
    p_organization_id,
    get_user_organization_id(),
    (SELECT organization_id FROM profiles WHERE id = p_changed_by LIMIT 1)
  );
  
  -- Inserir registro
  INSERT INTO enhanced_audit_logs (
    table_name,
    record_id,
    action,
    changed_by,
    changes,
    organization_id,
    client_ip,
    user_agent,
    session_id,
    fingerprint,
    severity,
    category,
    additional_context
  ) VALUES (
    p_table_name,
    p_record_id,
    p_action,
    p_changed_by,
    p_changes,
    v_org_id,
    p_client_ip,
    p_user_agent,
    p_session_id,
    p_fingerprint,
    p_severity,
    p_category,
    p_additional_context
  ) RETURNING id INTO v_audit_id;
  
  RETURN v_audit_id;
END;
$$;

-- Grant para a edge function
GRANT EXECUTE ON FUNCTION public.log_enhanced_audit TO service_role;

-- Trigger para eventos críticos (login, logout, access denied)
CREATE OR REPLACE FUNCTION public.log_auth_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Login bem-sucedido
  IF TG_OP = 'INSERT' AND TG_TABLE_NAME = 'auth_sessions' THEN
    PERFORM public.log_enhanced_audit(
      p_table_name := 'auth_sessions',
      p_record_id := NEW.id,
      p_action := 'LOGIN',
      p_changed_by := NEW.user_id,
      p_changes := JSONB_BUILD_OBJECT('session_created', true),
      p_severity := 'medium',
      p_category := 'auth'
    );
    RETURN NEW;
  END IF;
  
  -- Logout
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'auth_sessions' AND NEW.revoked = true THEN
    PERFORM public.log_enhanced_audit(
      p_table_name := 'auth_sessions',
      p_record_id := NEW.id,
      p_action := 'LOGOUT',
      p_changed_by := NEW.user_id,
      p_changes := JSONB_BUILD_OBJECT('session_revoked', true),
      p_severity := 'low',
      p_category := 'auth'
    );
    RETURN NEW;
  END IF;
  
  -- Tentativas de acesso negado (será registrado pela edge function)
  RETURN NULL;
END;
$$;

-- Comentado - trigger será ativado quando necessário
-- CREATE TRIGGER enhanced_audit_auth_sessions
--   AFTER INSERT OR UPDATE ON auth_sessions
--   FOR EACH ROW EXECUTE FUNCTION public.log_auth_events();

COMMENT ON TABLE enhanced_audit_logs IS 'Tabela de auditoria enriquecida com IP, user-agent e contexto adicional';
COMMENT ON VIEW enhanced_audit_logs_view IS 'View simplificada para consulta de auditoria enriquecida com regras de acesso';
COMMENT ON FUNCTION public.log_enhanced_audit IS 'Função para registrar auditoria enriquecida (chamada pela edge function)';
