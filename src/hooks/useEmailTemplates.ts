import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface EmailTemplate {
  id: string;
  organization_id: string;
  slug: string;
  name: string;
  description: string | null;
  subject: string;
  html_body: string;
  design_json: Record<string, unknown> | null; // design do Unlayer para reedição visual
  variables: string[];
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Templates padrão embutidos no frontend — usados quando não há template no banco
// e como base para seed ao criar o primeiro template de cada tipo.
// design_json: estrutura do Unlayer para reedição visual
// html_body: HTML de fallback quando não há design_json (edge functions sem Unlayer)
export const DEFAULT_TEMPLATES: Omit<EmailTemplate, "id" | "organization_id" | "created_at" | "updated_at">[] = [
  {
    slug: "user_invite",
    name: "Convite de Usuário",
    description: "Enviado ao convidar um novo usuário para o dashboard do cliente.",
    subject: "Seu acesso ao {{client_name}} está pronto!",
    variables: ["client_name", "user_name", "user_email", "temp_password", "dashboard_url"],
    is_default: true,
    is_active: true,
    design_json: {
      body: {
        id: "user_invite",
        rows: [
          {
            id: "row_header", cells: [1],
            columns: [{
              id: "col_header",
              contents: [{
                id: "logo_text", type: "text",
                values: {
                  text: "<h2 style=\"color:#7c3aed;margin:0\">Seu acesso ao {{client_name}} está pronto!</h2>",
                  containerPadding: "20px 30px 10px",
                },
              }],
            }],
            values: { backgroundColor: "#ffffff" },
          },
          {
            id: "row_body", cells: [1],
            columns: [{
              id: "col_body",
              contents: [
                {
                  id: "greeting", type: "text",
                  values: {
                    text: "<p>Olá, <strong>{{user_name}}</strong>!</p><p>Você foi convidado para acessar o dashboard de <strong>{{client_name}}</strong>.</p>",
                    containerPadding: "10px 30px",
                  },
                },
                {
                  id: "info_box", type: "text",
                  values: {
                    text: "<table width=\"100%\" style=\"background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px\"><tr><td><p style=\"margin:6px 0\"><strong>URL:</strong> <a href=\"{{dashboard_url}}\" style=\"color:#7c3aed\">{{dashboard_url}}</a></p><p style=\"margin:6px 0\"><strong>E-mail:</strong> {{user_email}}</p><p style=\"margin:12px 0 6px 0\"><strong>Senha temporária:</strong></p><div style=\"background:#ede9fe;border:1px solid #c4b5fd;border-radius:6px;padding:12px;text-align:center\"><span style=\"font-family:monospace;font-size:22px;font-weight:bold;color:#5b21b6;letter-spacing:2px\">{{temp_password}}</span></div></td></tr></table>",
                    containerPadding: "10px 30px",
                  },
                },
                {
                  id: "warning", type: "text",
                  values: {
                    text: "<p style=\"color:#dc2626;font-size:13px;font-weight:500\">⚠️ Por segurança, altere sua senha no primeiro acesso.</p>",
                    containerPadding: "10px 30px",
                  },
                },
              ],
            }],
            values: { backgroundColor: "#ffffff" },
          },
          {
            id: "row_button", cells: [1],
            columns: [{
              id: "col_button",
              contents: [{
                id: "cta_button", type: "button",
                values: {
                  text: "Acessar o Dashboard",
                  href: { name: "web", values: { href: "{{dashboard_url}}", target: "_blank" } },
                  containerPadding: "20px 30px 30px",
                  buttonColors: { color: "#ffffff", backgroundColor: "#7c3aed", hoverColor: "#ffffff", hoverBackgroundColor: "#6d28d9" },
                  size: { autoWidth: false, width: "220px" },
                  textAlign: "center",
                },
              }],
            }],
            values: { backgroundColor: "#ffffff", textAlign: "center" },
          },
        ],
        values: { backgroundColor: "#f4f4f4", fontFamily: { label: "Arial", value: "arial,helvetica,sans-serif" }, contentWidth: "600px" },
      },
    },
    html_body: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px">
  <h2 style="color:#7c3aed">Seu acesso ao {{client_name}} está pronto!</h2>
  <p>Olá, <strong>{{user_name}}</strong>!</p>
  <p>Você foi convidado para acessar o dashboard de <strong>{{client_name}}</strong>.</p>
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin:20px 0">
    <p style="margin:6px 0"><strong>URL:</strong> <a href="{{dashboard_url}}" style="color:#7c3aed">{{dashboard_url}}</a></p>
    <p style="margin:6px 0"><strong>E-mail:</strong> {{user_email}}</p>
    <p style="margin:12px 0 6px 0"><strong>Senha temporária:</strong></p>
    <div style="background:#ede9fe;border:1px solid #c4b5fd;border-radius:6px;padding:12px;text-align:center">
      <span style="font-family:monospace;font-size:22px;font-weight:bold;color:#5b21b6;letter-spacing:2px">{{temp_password}}</span>
    </div>
  </div>
  <p style="color:#dc2626;font-size:13px;font-weight:500">⚠️ Por segurança, altere sua senha no primeiro acesso.</p>
  <div style="margin:24px 0;text-align:center">
    <a href="{{dashboard_url}}" style="background:#7c3aed;color:white;padding:14px 32px;text-decoration:none;border-radius:8px;font-weight:bold;font-size:15px;display:inline-block">Acessar o Dashboard</a>
  </div>
</div>`,
  },
  {
    slug: "password_reset",
    name: "Reset de Senha",
    description: "Enviado ao resetar a senha de um usuário existente.",
    subject: "Nova senha temporária — {{client_name}}",
    variables: ["client_name", "user_email", "temp_password", "dashboard_url"],
    is_default: true,
    is_active: true,
    design_json: {
      body: {
        id: "password_reset",
        rows: [
          {
            id: "row_header", cells: [1],
            columns: [{
              id: "col_header",
              contents: [{
                id: "title", type: "text",
                values: {
                  text: "<h2 style=\"color:#7c3aed;margin:0\">Nova senha temporária</h2>",
                  containerPadding: "20px 30px 10px",
                },
              }],
            }],
            values: { backgroundColor: "#ffffff" },
          },
          {
            id: "row_body", cells: [1],
            columns: [{
              id: "col_body",
              contents: [
                {
                  id: "body_text", type: "text",
                  values: {
                    text: "<p>Olá! Uma nova senha temporária foi gerada para o acesso ao dashboard de <strong>{{client_name}}</strong>.</p>",
                    containerPadding: "10px 30px",
                  },
                },
                {
                  id: "info_box", type: "text",
                  values: {
                    text: "<table width=\"100%\" style=\"background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px\"><tr><td><p style=\"margin:6px 0\"><strong>URL:</strong> <a href=\"{{dashboard_url}}\" style=\"color:#7c3aed\">{{dashboard_url}}</a></p><p style=\"margin:6px 0\"><strong>E-mail:</strong> {{user_email}}</p><p style=\"margin:12px 0 6px 0\"><strong>Senha temporária:</strong></p><div style=\"background:#ede9fe;border:1px solid #c4b5fd;border-radius:6px;padding:12px;text-align:center\"><span style=\"font-family:monospace;font-size:22px;font-weight:bold;color:#5b21b6;letter-spacing:2px\">{{temp_password}}</span></div></td></tr></table>",
                    containerPadding: "10px 30px",
                  },
                },
                {
                  id: "warning", type: "text",
                  values: {
                    text: "<p style=\"color:#dc2626;font-size:13px;font-weight:500\">⚠️ Ao fazer login, você será solicitado a criar uma nova senha permanente.</p>",
                    containerPadding: "10px 30px",
                  },
                },
              ],
            }],
            values: { backgroundColor: "#ffffff" },
          },
          {
            id: "row_button", cells: [1],
            columns: [{
              id: "col_button",
              contents: [{
                id: "cta", type: "button",
                values: {
                  text: "Acessar o Dashboard",
                  href: { name: "web", values: { href: "{{dashboard_url}}", target: "_blank" } },
                  containerPadding: "20px 30px 30px",
                  buttonColors: { color: "#ffffff", backgroundColor: "#7c3aed", hoverColor: "#ffffff", hoverBackgroundColor: "#6d28d9" },
                  size: { autoWidth: false, width: "220px" },
                  textAlign: "center",
                },
              }],
            }],
            values: { backgroundColor: "#ffffff", textAlign: "center" },
          },
        ],
        values: { backgroundColor: "#f4f4f4", fontFamily: { label: "Arial", value: "arial,helvetica,sans-serif" }, contentWidth: "600px" },
      },
    },
    html_body: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px">
  <h2 style="color:#7c3aed">Nova senha temporária</h2>
  <p>Olá! Uma nova senha temporária foi gerada para o acesso ao dashboard de <strong>{{client_name}}</strong>.</p>
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin:20px 0">
    <p style="margin:6px 0"><strong>URL:</strong> <a href="{{dashboard_url}}" style="color:#7c3aed">{{dashboard_url}}</a></p>
    <p style="margin:6px 0"><strong>E-mail:</strong> {{user_email}}</p>
    <p style="margin:12px 0 6px 0"><strong>Senha temporária:</strong></p>
    <div style="background:#ede9fe;border:1px solid #c4b5fd;border-radius:6px;padding:12px;text-align:center">
      <span style="font-family:monospace;font-size:22px;font-weight:bold;color:#5b21b6;letter-spacing:2px">{{temp_password}}</span>
    </div>
  </div>
  <p style="color:#dc2626;font-size:13px;font-weight:500">⚠️ Ao fazer login, você será solicitado a criar uma nova senha permanente.</p>
  <div style="margin:24px 0;text-align:center">
    <a href="{{dashboard_url}}" style="background:#7c3aed;color:white;padding:14px 32px;text-decoration:none;border-radius:8px;font-weight:bold;font-size:15px;display:inline-block">Acessar o Dashboard</a>
  </div>
</div>`,
  },
  {
    slug: "tenant_welcome",
    name: "Boas-vindas ao C8 Control",
    description: "Enviado ao provisionar um novo cliente no C8 Control.",
    subject: "Bem-vindo ao C8 Control — {{client_name}}",
    variables: ["client_name", "admin_email", "temp_password", "plan_name", "max_users", "dashboard_url"],
    is_default: true,
    is_active: true,
    design_json: {
      body: {
        id: "tenant_welcome",
        rows: [
          {
            id: "row_header", cells: [1],
            columns: [{
              id: "col_header",
              contents: [{
                id: "title", type: "text",
                values: {
                  text: "<h2 style=\"color:#7c3aed;margin:0\">Bem-vindo ao C8 Control!</h2>",
                  containerPadding: "20px 30px 10px",
                },
              }],
            }],
            values: { backgroundColor: "#ffffff" },
          },
          {
            id: "row_body", cells: [1],
            columns: [{
              id: "col_body",
              contents: [
                {
                  id: "greeting", type: "text",
                  values: {
                    text: "<p>Olá, <strong>{{client_name}}</strong>!</p><p>Sua conta no <strong>C8 Control</strong> foi criada com sucesso.</p>",
                    containerPadding: "10px 30px",
                  },
                },
                {
                  id: "info_box", type: "text",
                  values: {
                    text: "<table width=\"100%\" style=\"background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px\"><tr><td><p style=\"margin:6px 0\"><strong>URL:</strong> <a href=\"{{dashboard_url}}\" style=\"color:#7c3aed\">{{dashboard_url}}</a></p><p style=\"margin:6px 0\"><strong>E-mail:</strong> {{admin_email}}</p><p style=\"margin:12px 0 6px 0\"><strong>Senha temporária:</strong></p><div style=\"background:#ede9fe;border:1px solid #c4b5fd;border-radius:6px;padding:12px;text-align:center\"><span style=\"font-family:monospace;font-size:22px;font-weight:bold;color:#5b21b6;letter-spacing:2px\">{{temp_password}}</span></div><p style=\"margin:8px 0 0;font-size:12px;color:#64748b\">Plano: {{plan_name}} · {{max_users}} usuário(s)</p></td></tr></table>",
                    containerPadding: "10px 30px",
                  },
                },
                {
                  id: "warning", type: "text",
                  values: {
                    text: "<p style=\"color:#dc2626;font-size:13px;font-weight:500\">⚠️ Ao fazer login, você será solicitado a criar uma senha permanente.</p>",
                    containerPadding: "10px 30px",
                  },
                },
              ],
            }],
            values: { backgroundColor: "#ffffff" },
          },
          {
            id: "row_button", cells: [1],
            columns: [{
              id: "col_button",
              contents: [{
                id: "cta", type: "button",
                values: {
                  text: "Acessar o C8 Control",
                  href: { name: "web", values: { href: "{{dashboard_url}}", target: "_blank" } },
                  containerPadding: "20px 30px 30px",
                  buttonColors: { color: "#ffffff", backgroundColor: "#7c3aed", hoverColor: "#ffffff", hoverBackgroundColor: "#6d28d9" },
                  size: { autoWidth: false, width: "220px" },
                  textAlign: "center",
                },
              }],
            }],
            values: { backgroundColor: "#ffffff", textAlign: "center" },
          },
        ],
        values: { backgroundColor: "#f4f4f4", fontFamily: { label: "Arial", value: "arial,helvetica,sans-serif" }, contentWidth: "600px" },
      },
    },
    html_body: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px">
  <h2 style="color:#7c3aed">Bem-vindo ao C8 Control!</h2>
  <p>Olá, <strong>{{client_name}}</strong>!</p>
  <p>Sua conta no <strong>C8 Control</strong> foi criada com sucesso.</p>
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin:20px 0">
    <p style="margin:6px 0"><strong>URL:</strong> <a href="{{dashboard_url}}" style="color:#7c3aed">{{dashboard_url}}</a></p>
    <p style="margin:6px 0"><strong>E-mail:</strong> {{admin_email}}</p>
    <p style="margin:12px 0 6px 0"><strong>Senha temporária:</strong></p>
    <div style="background:#ede9fe;border:1px solid #c4b5fd;border-radius:6px;padding:12px;text-align:center">
      <span style="font-family:monospace;font-size:22px;font-weight:bold;color:#5b21b6;letter-spacing:2px">{{temp_password}}</span>
    </div>
    <p style="margin:8px 0 0;font-size:12px;color:#64748b">Plano: {{plan_name}} · {{max_users}} usuário(s)</p>
  </div>
  <p style="color:#dc2626;font-size:13px;font-weight:500">⚠️ Ao fazer login, você será solicitado a criar uma senha permanente.</p>
  <div style="margin:24px 0;text-align:center">
    <a href="{{dashboard_url}}" style="background:#7c3aed;color:white;padding:14px 32px;text-decoration:none;border-radius:8px;font-weight:bold;font-size:15px;display:inline-block">Acessar o C8 Control</a>
  </div>
</div>`,
  },
];

export function useEmailTemplates(organizationId: string | undefined) {
  const qc = useQueryClient();

  const query = useQuery<EmailTemplate[]>({
    queryKey: ["email_templates", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("email_templates")
        .select("*")
        .eq("organization_id", organizationId)
        .order("slug")
        .order("is_default", { ascending: false });
      if (error) throw error;
      return (data ?? []) as EmailTemplate[];
    },
    enabled: !!organizationId,
    staleTime: 30_000,
  });

  const save = useMutation({
    mutationFn: async (template: Partial<EmailTemplate> & { slug: string; subject: string; html_body: string; name: string; design_json?: Record<string, unknown> | null }) => {
      if (!organizationId) throw new Error("Organização não identificada.");
      if (template.id) {
        const { error } = await supabase
          .from("email_templates")
          .update({
            subject:     template.subject,
            html_body:   template.html_body,
            design_json: template.design_json ?? null,
            name:        template.name,
            description: template.description,
            is_active:   template.is_active,
          })
          .eq("id", template.id)
          .eq("organization_id", organizationId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("email_templates")
          .insert({
            organization_id: organizationId,
            slug:        template.slug,
            name:        template.name,
            description: template.description ?? null,
            subject:     template.subject,
            html_body:   template.html_body,
            design_json: template.design_json ?? null,
            variables:   template.variables ?? [],
            is_default:  false,
            is_active:   true,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["email_templates", organizationId] }),
  });

  // "Excluir" = remove o template customizado (is_default = false)
  // Templates padrão não podem ser deletados, apenas desativados
  const remove = useMutation({
    mutationFn: async (id: string) => {
      if (!organizationId) throw new Error("Organização não identificada.");
      // Verifica se é padrão — padrão não pode ser deletado
      const tpl = query.data?.find(t => t.id === id);
      if (tpl?.is_default) {
        // Desativa em vez de deletar
        const { error } = await supabase
          .from("email_templates")
          .update({ is_active: false })
          .eq("id", id)
          .eq("organization_id", organizationId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("email_templates")
          .delete()
          .eq("id", id)
          .eq("organization_id", organizationId)
          .eq("is_default", false);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["email_templates", organizationId] }),
  });

  const restore = useMutation({
    mutationFn: async (id: string) => {
      if (!organizationId) throw new Error("Organização não identificada.");
      const { error } = await supabase
        .from("email_templates")
        .update({ is_active: true })
        .eq("id", id)
        .eq("organization_id", organizationId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["email_templates", organizationId] }),
  });

  // Seed: insere os templates padrão para essa organização se não existirem
  const seedDefaults = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error("Organização não identificada.");
      // Usa upsert com ignoreDuplicates para ser idempotente
      const { error } = await supabase.from("email_templates").upsert(
        DEFAULT_TEMPLATES.map(t => ({ ...t, organization_id: organizationId })),
        { onConflict: "organization_id,slug,is_default", ignoreDuplicates: true }
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["email_templates", organizationId] }),
  });

  return { ...query, save, remove, restore, seedDefaults };
}
