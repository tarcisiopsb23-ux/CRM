/**
 * Helper compartilhado: busca e renderiza template de e-mail
 *
 * Fluxo:
 * 1. Busca template customizado ativo (is_default=false) para o slug
 * 2. Fallback: busca template padrão (is_default=true)
 * 3. Fallback final: retorna null (Edge Function usa HTML inline)
 *
 * Substitui variáveis {{var}} pelos valores fornecidos.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface TemplateVars {
  [key: string]: string | number | null | undefined;
}

function renderTemplate(html: string, subject: string, vars: TemplateVars) {
  let renderedHtml     = html;
  let renderedSubject  = subject;
  for (const [key, value] of Object.entries(vars)) {
    const re = new RegExp(`\\{\\{${key}\\}\\}`, "g");
    const val = value != null ? String(value) : "";
    renderedHtml    = renderedHtml.replace(re, val);
    renderedSubject = renderedSubject.replace(re, val);
  }
  return { html: renderedHtml, subject: renderedSubject };
}

export async function getEmailTemplate(
  maestriaAdmin: ReturnType<typeof createClient>,
  organizationId: string,
  slug: string,
  vars: TemplateVars
): Promise<{ html: string; subject: string } | null> {
  // Busca template customizado ativo
  const { data: custom } = await maestriaAdmin
    .from("email_templates")
    .select("html_body, subject")
    .eq("organization_id", organizationId)
    .eq("slug", slug)
    .eq("is_default", false)
    .eq("is_active", true)
    .maybeSingle();

  if (custom?.html_body) {
    return renderTemplate(custom.html_body, custom.subject, vars);
  }

  // Fallback: template padrão
  const { data: def } = await maestriaAdmin
    .from("email_templates")
    .select("html_body, subject")
    .eq("organization_id", organizationId)
    .eq("slug", slug)
    .eq("is_default", true)
    .eq("is_active", true)
    .maybeSingle();

  if (def?.html_body) {
    return renderTemplate(def.html_body, def.subject, vars);
  }

  return null; // sem template — Edge Function usa HTML inline
}
