-- 129_knowledge_base_client_rpcs.sql
-- RPCs SECURITY DEFINER para as tabelas de conhecimento do Banco A

-- ─── FAQ ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_knowledge_faqs_for_client(p_client_id UUID)
RETURNS SETOF public.client_knowledge_faqs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY SELECT * FROM public.client_knowledge_faqs WHERE client_id = p_client_id ORDER BY priority DESC, created_at DESC;
END; $$;
GRANT EXECUTE ON FUNCTION public.get_knowledge_faqs_for_client(UUID) TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.insert_knowledge_faq(p_client_id UUID, p_organization_id UUID, p_question TEXT, p_answer TEXT, p_keywords TEXT[], p_category TEXT, p_priority INTEGER, p_active BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.client_knowledge_faqs(client_id,organization_id,question,answer,keywords,category,priority,active)
  VALUES(p_client_id,p_organization_id,p_question,p_answer,COALESCE(p_keywords,'{}'),p_category,p_priority,p_active);
END; $$;
GRANT EXECUTE ON FUNCTION public.insert_knowledge_faq(UUID,UUID,TEXT,TEXT,TEXT[],TEXT,INTEGER,BOOLEAN) TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.update_knowledge_faq(p_id UUID, p_question TEXT, p_answer TEXT, p_keywords TEXT[], p_category TEXT, p_priority INTEGER, p_active BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.client_knowledge_faqs SET question=p_question,answer=p_answer,keywords=COALESCE(p_keywords,'{}'),category=p_category,priority=p_priority,active=p_active,updated_at=now() WHERE id=p_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.update_knowledge_faq(UUID,TEXT,TEXT,TEXT[],TEXT,INTEGER,BOOLEAN) TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.delete_knowledge_faq(p_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN DELETE FROM public.client_knowledge_faqs WHERE id=p_id; END; $$;
GRANT EXECUTE ON FUNCTION public.delete_knowledge_faq(UUID) TO authenticated, anon, service_role;

-- ─── POLÍTICAS ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_knowledge_policies_for_client(p_client_id UUID)
RETURNS SETOF public.client_knowledge_policies
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY SELECT * FROM public.client_knowledge_policies WHERE client_id = p_client_id ORDER BY created_at DESC;
END; $$;
GRANT EXECUTE ON FUNCTION public.get_knowledge_policies_for_client(UUID) TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.insert_knowledge_policy(p_client_id UUID, p_organization_id UUID, p_title TEXT, p_content TEXT, p_policy_type TEXT, p_active BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.client_knowledge_policies(client_id,organization_id,title,content,policy_type,active)
  VALUES(p_client_id,p_organization_id,p_title,p_content,p_policy_type,p_active);
END; $$;
GRANT EXECUTE ON FUNCTION public.insert_knowledge_policy(UUID,UUID,TEXT,TEXT,TEXT,BOOLEAN) TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.update_knowledge_policy(p_id UUID, p_title TEXT, p_content TEXT, p_policy_type TEXT, p_active BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.client_knowledge_policies SET title=p_title,content=p_content,policy_type=p_policy_type,active=p_active,updated_at=now() WHERE id=p_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.update_knowledge_policy(UUID,TEXT,TEXT,TEXT,BOOLEAN) TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.delete_knowledge_policy(p_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN DELETE FROM public.client_knowledge_policies WHERE id=p_id; END; $$;
GRANT EXECUTE ON FUNCTION public.delete_knowledge_policy(UUID) TO authenticated, anon, service_role;

-- ─── SERVIÇOS ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_knowledge_services_for_client(p_client_id UUID)
RETURNS SETOF public.client_knowledge_services
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY SELECT * FROM public.client_knowledge_services WHERE client_id = p_client_id ORDER BY created_at DESC;
END; $$;
GRANT EXECUTE ON FUNCTION public.get_knowledge_services_for_client(UUID) TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.insert_knowledge_service(p_client_id UUID, p_organization_id UUID, p_name TEXT, p_description TEXT, p_price_info TEXT, p_duration_info TEXT, p_category TEXT, p_keywords TEXT[], p_active BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.client_knowledge_services(client_id,organization_id,name,description,price_info,duration_info,category,keywords,active)
  VALUES(p_client_id,p_organization_id,p_name,p_description,p_price_info,p_duration_info,p_category,COALESCE(p_keywords,'{}'),p_active);
END; $$;
GRANT EXECUTE ON FUNCTION public.insert_knowledge_service(UUID,UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT[],BOOLEAN) TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.update_knowledge_service(p_id UUID, p_name TEXT, p_description TEXT, p_price_info TEXT, p_duration_info TEXT, p_category TEXT, p_keywords TEXT[], p_active BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.client_knowledge_services SET name=p_name,description=p_description,price_info=p_price_info,duration_info=p_duration_info,category=p_category,keywords=COALESCE(p_keywords,'{}'),active=p_active,updated_at=now() WHERE id=p_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.update_knowledge_service(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT[],BOOLEAN) TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.delete_knowledge_service(p_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN DELETE FROM public.client_knowledge_services WHERE id=p_id; END; $$;
GRANT EXECUTE ON FUNCTION public.delete_knowledge_service(UUID) TO authenticated, anon, service_role;

-- ─── Registro de versão ───────────────────────────────────────────────────────
INSERT INTO public.schema_migrations (version) VALUES ('129_knowledge_base_client_rpcs') ON CONFLICT (version) DO NOTHING;
