/**
 * ContentItemForm — formulário de criação/edição de item de conteúdo.
 * Usado em Dialog ou Sheet dentro das páginas de conteúdo.
 */

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Loader2 } from "lucide-react";
import { useClients } from "@/hooks/useClients";
import { useProfiles } from "@/hooks/useProfiles";
import { useOrganization } from "@/hooks/useOrganization";
import { useContentCampaigns } from "@/hooks/useContentCampaigns";
import type { ContentItem, ContentItemInsert } from "@/hooks/useContentItems";

// ── Schema de validação ────────────────────────────────────────────────────────

const schema = z.object({
  client_id:           z.string().min(1, "Selecione o cliente"),
  campaign_id:         z.string().optional(),
  title:               z.string().min(1, "Título obrigatório").max(200),
  content_type:        z.string().optional(),
  platform:            z.string().optional(),
  format:              z.string().optional(),
  copy_text:           z.string().optional(),
  hashtags_raw:        z.string().optional(), // string separada por vírgulas
  description:         z.string().optional(),
  status:              z.string().optional(),
  priority:            z.string().default("media"),
  assigned_to:         z.string().optional(),
  production_deadline: z.string().optional(),
  scheduled_date:      z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

// ── Opções ────────────────────────────────────────────────────────────────────

const CONTENT_TYPES = [
  { value: "post",     label: "Post" },
  { value: "reels",    label: "Reels" },
  { value: "story",    label: "Story" },
  { value: "carousel", label: "Carrossel" },
  { value: "email",    label: "E-mail" },
  { value: "roteiro",  label: "Roteiro" },
  { value: "banner",   label: "Banner" },
  { value: "video",    label: "Vídeo" },
  { value: "outro",    label: "Outro" },
];

const PLATFORMS = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook",  label: "Facebook" },
  { value: "linkedin",  label: "LinkedIn" },
  { value: "tiktok",    label: "TikTok" },
  { value: "youtube",   label: "YouTube" },
  { value: "google",    label: "Google" },
  { value: "email",     label: "E-mail" },
  { value: "outro",     label: "Outro" },
];

const PRIORITIES = [
  { value: "baixa",   label: "Baixa" },
  { value: "media",   label: "Média" },
  { value: "alta",    label: "Alta" },
  { value: "urgente", label: "Urgente" },
];

// ── Componente ────────────────────────────────────────────────────────────────

interface ContentItemFormProps {
  initial?:   Partial<ContentItem>;
  onSubmit:   (values: Omit<ContentItemInsert, "organization_id">) => Promise<void>;
  onCancel:   () => void;
  loading?:   boolean;
}

export function ContentItemForm({
  initial,
  onSubmit,
  onCancel,
  loading = false,
}: ContentItemFormProps) {
  const organizationId = useOrganization();
  const { data: clients = [] }  = useClients(organizationId);
  const { data: profiles = [] } = useProfiles(organizationId);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      client_id:           initial?.client_id           ?? "",
      campaign_id:         initial?.campaign_id         ?? undefined,
      title:               initial?.title               ?? "",
      content_type:        initial?.content_type        ?? undefined,
      platform:            initial?.platform            ?? undefined,
      format:              initial?.format              ?? undefined,
      copy_text:           initial?.copy_text           ?? "",
      hashtags_raw:        (initial?.hashtags ?? []).join(", "),
      description:         initial?.description         ?? "",
      status:              initial?.status              ?? "briefing",
      priority:            initial?.priority            ?? "media",
      assigned_to:         initial?.assigned_to         ?? undefined,
      production_deadline: initial?.production_deadline ?? undefined,
      scheduled_date:      initial?.scheduled_date      ?? undefined,
    },
  });

  const clientId = form.watch("client_id");

  // Carrega campanhas do cliente selecionado
  const { campaigns } = useContentCampaigns(
    clientId ? organizationId : undefined,
    clientId || undefined,
  );

  // Reseta campaign quando muda o cliente
  useEffect(() => {
    form.setValue("campaign_id", undefined);
  }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(values: FormValues) {
    const hashtags = (values.hashtags_raw ?? "")
      .split(",")
      .map(h => h.trim().replace(/^#/, ""))
      .filter(Boolean);

    await onSubmit({
      client_id:            values.client_id,
      campaign_id:          values.campaign_id || null,
      title:                values.title,
      content_type:         (values.content_type as ContentItemInsert["content_type"]) ?? null,
      platform:             (values.platform    as ContentItemInsert["platform"])      ?? null,
      format:               values.format       ?? null,
      copy_text:            values.copy_text    ?? null,
      hashtags,
      description:          values.description  ?? null,
      status:               (values.status as ContentItemInsert["status"]) ?? "briefing",
      priority:             (values.priority as ContentItemInsert["priority"]) ?? "media",
      assigned_to:          values.assigned_to  ?? null,
      assigned_to_type:     "agency",
      reviewer_id:          null,
      production_deadline:  values.production_deadline ?? null,
      scheduled_date:       values.scheduled_date      ?? null,
      scheduled_time:       null,
      published_at:         null,
      publication_url:      null,
      publication_notes:    null,
      approval_status:      "pendente",
      approved_by:          null,
      approved_at:          null,
      approval_notes:       null,
      is_visible_to_client: false,
      metadata:             {},
      created_by:           null,
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">

        {/* Cliente */}
        <FormField
          control={form.control}
          name="client_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Cliente *</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
                </FormControl>
                <SelectContent>
                  {clients.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Campanha */}
        {campaigns.length > 0 && (
          <FormField
            control={form.control}
            name="campaign_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Campanha</FormLabel>
                <Select value={field.value ?? ""} onValueChange={v => field.onChange(v || undefined)}>
                  <FormControl>
                    <SelectTrigger><SelectValue placeholder="Nenhuma (opcional)" /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="">Sem campanha</SelectItem>
                    {campaigns.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {/* Título */}
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Título *</FormLabel>
              <FormControl>
                <Input placeholder="Ex: Post de lançamento do produto X" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Tipo + Plataforma */}
        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="content_type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tipo</FormLabel>
                <Select value={field.value ?? ""} onValueChange={v => field.onChange(v || undefined)}>
                  <FormControl>
                    <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {CONTENT_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="platform"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Plataforma</FormLabel>
                <Select value={field.value ?? ""} onValueChange={v => field.onChange(v || undefined)}>
                  <FormControl>
                    <SelectTrigger><SelectValue placeholder="Plataforma" /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {PLATFORMS.map(p => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />
        </div>

        {/* Prioridade + Responsável */}
        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="priority"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Prioridade</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {PRIORITIES.map(p => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="assigned_to"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Responsável</FormLabel>
                <Select value={field.value ?? ""} onValueChange={v => field.onChange(v || undefined)}>
                  <FormControl>
                    <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="">Nenhum</SelectItem>
                    {profiles.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.full_name ?? p.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />
        </div>

        {/* Prazo produção + Data agendada */}
        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="production_deadline"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Prazo de Produção</FormLabel>
                <FormControl>
                  <Input type="date" {...field} value={field.value ?? ""} />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="scheduled_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Data de Publicação</FormLabel>
                <FormControl>
                  <Input type="date" {...field} value={field.value ?? ""} />
                </FormControl>
              </FormItem>
            )}
          />
        </div>

        {/* Copy / Legenda */}
        <FormField
          control={form.control}
          name="copy_text"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Copy / Legenda</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Texto da publicação..."
                  className="min-h-[100px] resize-none"
                  {...field}
                  value={field.value ?? ""}
                />
              </FormControl>
            </FormItem>
          )}
        />

        {/* Hashtags */}
        <FormField
          control={form.control}
          name="hashtags_raw"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Hashtags</FormLabel>
              <FormControl>
                <Input
                  placeholder="#marketing, #conteudo, #dicas"
                  {...field}
                  value={field.value ?? ""}
                />
              </FormControl>
              <p className="text-xs text-muted-foreground">Separe por vírgulas</p>
            </FormItem>
          )}
        />

        {/* Descrição / Briefing */}
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notas / Briefing Resumido</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Instruções para a equipe de produção..."
                  className="min-h-[80px] resize-none"
                  {...field}
                  value={field.value ?? ""}
                />
              </FormControl>
            </FormItem>
          )}
        />

        {/* Ações */}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
            Cancelar
          </Button>
          <Button type="submit" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {initial?.id ? "Salvar Alterações" : "Criar Item"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
