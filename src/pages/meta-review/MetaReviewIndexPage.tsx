/**
 * MetaReviewIndexPage — /meta-review
 *
 * Central de Meta App Review: painel Permission Audit com todos os grupos 1-11.
 * Mostra status real de cada permissão, link para a demo e recomendação.
 */

import { useNavigate, useParams } from "react-router-dom";
import {
  Shield, ExternalLink, ChevronRight, CheckCircle2,
  AlertTriangle, Clock, XCircle, Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PermissionBadge } from "./shared/PermissionBadge";
import type { PermissionEntry, PermissionStatus } from "./shared/types";
import { cn } from "@/lib/utils";

// ── Catálogo completo de permissões ──────────────────────────────────────────

const PERMISSIONS: PermissionEntry[] = [
  // GRUPO 1 — Facebook Authentication
  {
    permission: "public_profile",
    group: "GRUPO 1 — FACEBOOK AUTHENTICATION",
    groupNumber: 1,
    description: "Acesso ao perfil público do usuário Meta autenticado.",
    status: "KEEP",
    apiEndpoint: "GET /me?fields=id,name,picture",
    demoPath: "facebook-login",
    requiresAppReview: false,
  },
  {
    permission: "email",
    group: "GRUPO 1 — FACEBOOK AUTHENTICATION",
    groupNumber: 1,
    description: "Acesso ao e-mail do usuário Meta autenticado.",
    status: "KEEP",
    apiEndpoint: "GET /me?fields=email",
    demoPath: "facebook-login",
    requiresAppReview: false,
  },
  // GRUPO 2 — Facebook Pages
  {
    permission: "pages_show_list",
    group: "GRUPO 2 — FACEBOOK PAGES",
    groupNumber: 2,
    description: "Lista as Páginas do Facebook que o usuário gerencia.",
    status: "KEEP",
    apiEndpoint: "GET /me/accounts",
    demoPath: "pages-show-list",
    requiresAppReview: true,
  },
  {
    permission: "pages_read_engagement",
    group: "GRUPO 2 — FACEBOOK PAGES",
    groupNumber: 2,
    description: "Lê conteúdo e engagement publicados pela Página.",
    status: "KEEP",
    apiEndpoint: "GET /{page-id}?fields=name,fan_count,followers_count,posts",
    demoPath: "pages-read-engagement",
    requiresAppReview: true,
  },
  {
    permission: "pages_read_user_content",
    group: "GRUPO 2 — FACEBOOK PAGES",
    groupNumber: 2,
    description: "Lê conteúdo publicado por usuários na Página.",
    status: "KEEP",
    apiEndpoint: "GET /{page-id}/feed",
    demoPath: "pages-read-user-content",
    requiresAppReview: true,
  },
  {
    permission: "pages_manage_metadata",
    group: "GRUPO 2 — FACEBOOK PAGES",
    groupNumber: 2,
    description: "Inscreve e recebe webhooks de atividade na Página.",
    status: "KEEP",
    apiEndpoint: "POST /{page-id}/subscribed_apps",
    demoPath: "pages-manage-metadata",
    requiresAppReview: true,
  },
  {
    permission: "pages_manage_engagement",
    group: "GRUPO 2 — FACEBOOK PAGES",
    groupNumber: 2,
    description: "Responde comentários e publicações na Página via API.",
    status: "KEEP",
    apiEndpoint: "POST /{comment-id}/comments",
    demoPath: "pages-manage-engagement",
    requiresAppReview: true,
  },
  {
    permission: "pages_messaging",
    group: "GRUPO 2 — FACEBOOK PAGES",
    groupNumber: 2,
    description: "Gerencia e acessa conversas da Página no Messenger.",
    status: "IMPLEMENT_LATER",
    apiEndpoint: "POST /me/messages",
    demoPath: "pages-messaging",
    requiresAppReview: true,
    notes: "Inbox Messenger será implementado na Fase 3 (Conversas).",
  },
  // GRUPO 3 — Instagram via Facebook Login
  {
    permission: "instagram_basic",
    group: "GRUPO 3 — INSTAGRAM VIA FACEBOOK LOGIN",
    groupNumber: 3,
    description: "Acesso básico à conta profissional do Instagram via Página do Facebook.",
    status: "KEEP",
    apiEndpoint: "GET /{ig-user-id}?fields=id,username,profile_picture_url",
    demoPath: "instagram-facebook-login",
    requiresAppReview: false,
  },
  {
    permission: "instagram_manage_comments",
    group: "GRUPO 3 — INSTAGRAM VIA FACEBOOK LOGIN",
    groupNumber: 3,
    description: "Lê e responde comentários em publicações do Instagram.",
    status: "KEEP",
    apiEndpoint: "GET /{media-id}/comments  POST /{comment-id}/replies",
    demoPath: "instagram-facebook-login",
    requiresAppReview: true,
  },
  {
    permission: "instagram_manage_messages",
    group: "GRUPO 3 — INSTAGRAM VIA FACEBOOK LOGIN",
    groupNumber: 3,
    description: "Recebe e responde mensagens diretas (DMs) do Instagram.",
    status: "KEEP",
    apiEndpoint: "POST /me/messages",
    demoPath: "instagram-facebook-login",
    requiresAppReview: true,
  },
  {
    permission: "instagram_content_publish",
    group: "GRUPO 3 — INSTAGRAM VIA FACEBOOK LOGIN",
    groupNumber: 3,
    description: "Publica posts, Reels e Stories no Instagram.",
    status: "IMPLEMENT_LATER",
    apiEndpoint: "POST /{ig-user-id}/media  POST /{ig-user-id}/media_publish",
    requiresAppReview: true,
    notes: "Publicação de conteúdo prevista para Fase 8 (Templates/Conteúdo IA).",
  },
  {
    permission: "instagram_manage_insights",
    group: "GRUPO 3 — INSTAGRAM VIA FACEBOOK LOGIN",
    groupNumber: 3,
    description: "Acessa métricas de alcance, impressões e engajamento do Instagram.",
    status: "IMPLEMENT_LATER",
    apiEndpoint: "GET /{ig-user-id}/insights",
    requiresAppReview: true,
    notes: "Analytics de Instagram previsto para módulo de Performance futuro.",
  },
  // GRUPO 4 — Instagram Login
  {
    permission: "instagram_business_basic",
    group: "GRUPO 4 — INSTAGRAM LOGIN",
    groupNumber: 4,
    description: "Acesso básico via Instagram Login (independente do Facebook).",
    status: "KEEP",
    apiEndpoint: "GET /me?fields=id,username",
    demoPath: "instagram-login",
    requiresAppReview: false,
  },
  {
    permission: "instagram_business_manage_messages",
    group: "GRUPO 4 — INSTAGRAM LOGIN",
    groupNumber: 4,
    description: "Gerencia mensagens diretas via Instagram Login.",
    status: "KEEP",
    apiEndpoint: "POST /me/messages",
    demoPath: "instagram-login",
    requiresAppReview: true,
  },
  {
    permission: "instagram_business_manage_comments",
    group: "GRUPO 4 — INSTAGRAM LOGIN",
    groupNumber: 4,
    description: "Gerencia comentários via Instagram Login.",
    status: "KEEP",
    apiEndpoint: "POST /{comment-id}/replies",
    demoPath: "instagram-login",
    requiresAppReview: true,
  },
  // GRUPO 5 — WhatsApp
  {
    permission: "whatsapp_business_management",
    group: "GRUPO 5 — WHATSAPP",
    groupNumber: 5,
    description: "Gerencia WABA, templates, números e webhooks do WhatsApp Business.",
    status: "KEEP",
    apiEndpoint: "GET /{waba-id}/phone_numbers",
    demoPath: "whatsapp",
    requiresAppReview: true,
  },
  {
    permission: "whatsapp_business_messaging",
    group: "GRUPO 5 — WHATSAPP",
    groupNumber: 5,
    description: "Envia e recebe mensagens WhatsApp em nome do número registrado.",
    status: "KEEP",
    apiEndpoint: "POST /{phone-number-id}/messages",
    demoPath: "whatsapp",
    requiresAppReview: true,
  },
  // GRUPO 6 — Human Agent
  {
    permission: "Human Agent",
    group: "GRUPO 6 — HUMAN AGENT",
    groupNumber: 6,
    description: "Feature que permite handoff IA → humano no atendimento.",
    status: "KEEP",
    demoPath: "human-agent",
    requiresAppReview: true,
    notes: "Estrutura de handoff implementada no módulo Mensagens.",
  },
  // GRUPO 7 — Lead Ads
  {
    permission: "leads_retrieval",
    group: "GRUPO 7 — LEAD ADS",
    groupNumber: 7,
    description: "Recupera leads capturados por formulários de anúncio Meta.",
    status: "IMPLEMENT_LATER",
    apiEndpoint: "GET /{form-id}/leads",
    requiresAppReview: true,
    notes: "Integração com Meta Lead Ads prevista para versão futura do módulo de CRM.",
  },
  // GRUPO 8 — Analytics / Ads
  {
    permission: "ads_read",
    group: "GRUPO 8 — ANALYTICS / ADS",
    groupNumber: 8,
    description: "Lê campanhas e métricas de contas de anúncio Meta.",
    status: "KEEP",
    apiEndpoint: "GET /act_{ad-account-id}/campaigns",
    requiresAppReview: false,
    notes: "Já funcional no módulo de Integrações (meta-ads-metrics Edge Function).",
  },
  {
    permission: "read_insights",
    group: "GRUPO 8 — ANALYTICS / ADS",
    groupNumber: 8,
    description: "Lê dados de insights de Páginas e contas de anúncio.",
    status: "KEEP",
    apiEndpoint: "GET /{ad-account-id}/insights",
    requiresAppReview: false,
  },
  {
    permission: "ads_management",
    group: "GRUPO 8 — ANALYTICS / ADS",
    groupNumber: 8,
    description: "Cria e gerencia campanhas programaticamente.",
    status: "IMPLEMENT_LATER",
    apiEndpoint: "POST /act_{ad-account-id}/campaigns",
    requiresAppReview: true,
    notes: "Gerenciamento de campanhas previsto para módulo avançado de Ads.",
  },
  {
    permission: "pages_manage_ads",
    group: "GRUPO 8 — ANALYTICS / ADS",
    groupNumber: 8,
    description: "Gerencia anúncios associados à Página.",
    status: "KEEP",
    apiEndpoint: "GET /{page-id}/ads",
    requiresAppReview: true,
  },
  // GRUPO 9 — Commerce
  {
    permission: "catalog_management",
    group: "GRUPO 9 — COMMERCE",
    groupNumber: 9,
    description: "Gerencia catálogos de produtos Meta.",
    status: "NOT_READY",
    requiresAppReview: true,
    notes: "Módulo de Commerce não planejado para o C8 Control.",
  },
  {
    permission: "instagram_shopping_tag_products",
    group: "GRUPO 9 — COMMERCE",
    groupNumber: 9,
    description: "Marca produtos em publicações do Instagram Shopping.",
    status: "NOT_READY",
    requiresAppReview: true,
    notes: "Módulo de Commerce não planejado para o C8 Control.",
  },
  // GRUPO 10 — Branded Content
  {
    permission: "instagram_branded_content_brand",
    group: "GRUPO 10 — BRANDED CONTENT",
    groupNumber: 10,
    description: "Gerencia conteúdo de marca patrocinado no Instagram.",
    status: "NOT_READY",
    requiresAppReview: true,
    notes: "Fora do escopo do C8 Control.",
  },
  {
    permission: "instagram_branded_content_ads_brand",
    group: "GRUPO 10 — BRANDED CONTENT",
    groupNumber: 10,
    description: "Gerencia anúncios de conteúdo de marca no Instagram.",
    status: "NOT_READY",
    requiresAppReview: true,
    notes: "Fora do escopo do C8 Control.",
  },
  // GRUPO 11 — Outras
  {
    permission: "pages_utility_messaging",
    group: "GRUPO 11 — OUTRAS PERMISSÕES",
    groupNumber: 11,
    description: "Acessa templates de mensagens utilitárias da Página.",
    status: "REQUIRES_REVIEW",
    requiresAppReview: true,
    notes: "Avaliar necessidade real antes de incluir no App Review.",
  },
  {
    permission: "paid_marketing_messages",
    group: "GRUPO 11 — OUTRAS PERMISSÕES",
    groupNumber: 11,
    description: "Cria e gerencia campanhas de mensagens pagas no Messenger.",
    status: "REMOVE",
    requiresAppReview: true,
    notes: "Fora do escopo do C8 Control.",
  },
  {
    permission: "manage_app_solution",
    group: "GRUPO 11 — OUTRAS PERMISSÕES",
    groupNumber: 11,
    description: "Gerencia soluções de app para parceiros Meta.",
    status: "REQUIRES_REVIEW",
    requiresAppReview: true,
    notes: "Avaliar se necessário para Embedded Signup avançado.",
  },
  {
    permission: "whatsapp_business_manage_events",
    group: "GRUPO 11 — OUTRAS PERMISSÕES",
    groupNumber: 11,
    description: "Registra eventos (compra, lead) em contas WhatsApp Business.",
    status: "IMPLEMENT_LATER",
    requiresAppReview: true,
    notes: "Relevante para rastreamento de conversões via WhatsApp.",
  },
  {
    permission: "business_management",
    group: "GRUPO 11 — OUTRAS PERMISSÕES",
    groupNumber: 11,
    description: "Acessa o portfólio empresarial do usuário Meta.",
    status: "KEEP",
    apiEndpoint: "GET /me/businesses",
    requiresAppReview: false,
  },
  {
    permission: "Business Asset User Profile Access",
    group: "GRUPO 11 — OUTRAS PERMISSÕES",
    groupNumber: 11,
    description: "Feature que permite acesso a perfis de usuários de ativos de negócio.",
    status: "REQUIRES_REVIEW",
    requiresAppReview: true,
    notes: "Avaliar necessidade real para o Embedded Signup.",
  },
  {
    permission: "Instagram Public Content Access",
    group: "GRUPO 11 — OUTRAS PERMISSÕES",
    groupNumber: 11,
    description: "Acessa conteúdo público de qualquer perfil do Instagram.",
    status: "REMOVE",
    requiresAppReview: true,
    notes: "O C8 Control acessa apenas contas autorizadas. Não é necessário.",
  },
  {
    permission: "Meta oEmbed Read",
    group: "GRUPO 11 — OUTRAS PERMISSÕES",
    groupNumber: 11,
    description: "Incorpora conteúdo público do Facebook/Instagram via oEmbed.",
    status: "REMOVE",
    requiresAppReview: false,
    notes: "Não há uso de oEmbed no C8 Control.",
  },
];

// ── Agrupamento ───────────────────────────────────────────────────────────────

const GROUPS = Array.from(
  new Map(PERMISSIONS.map((p) => [p.groupNumber, { number: p.groupNumber, name: p.group }]))
).map(([, v]) => v);

// ── Estatísticas ──────────────────────────────────────────────────────────────

function useStats() {
  const counts: Record<PermissionStatus, number> = {
    KEEP: 0, IMPLEMENT_LATER: 0, NOT_READY: 0, REMOVE: 0, REQUIRES_REVIEW: 0,
  };
  PERMISSIONS.forEach((p) => counts[p.status]++);
  return counts;
}

// ── Ícone de status ───────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: PermissionStatus }) {
  switch (status) {
    case "KEEP":            return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />;
    case "IMPLEMENT_LATER": return <Clock className="h-3.5 w-3.5 text-blue-400" />;
    case "NOT_READY":       return <XCircle className="h-3.5 w-3.5 text-slate-500" />;
    case "REMOVE":          return <XCircle className="h-3.5 w-3.5 text-red-400" />;
    case "REQUIRES_REVIEW": return <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />;
  }
}

// ── Página principal ──────────────────────────────────────────────────────────

export function MetaReviewIndexPage() {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const stats = useStats();

  const groupedPermissions = GROUPS.map((group) => ({
    ...group,
    permissions: PERMISSIONS.filter((p) => p.groupNumber === group.number),
  }));

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600">
            <Shield className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Meta App Review</h1>
            <p className="text-sm text-muted-foreground">
              Central de preparação e auditoria de permissões para o App Review da Meta.
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 border-border text-xs"
          onClick={() => window.open("https://developers.facebook.com/docs/app-review/", "_blank", "noopener")}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Meta Docs
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {(
          [
            { key: "KEEP",            label: "Keep",            color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
            { key: "IMPLEMENT_LATER", label: "Implement Later", color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
            { key: "REQUIRES_REVIEW", label: "Review",          color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
            { key: "NOT_READY",       label: "Not Ready",       color: "text-slate-400 bg-slate-500/10 border-slate-500/20" },
            { key: "REMOVE",          label: "Remove",          color: "text-red-400 bg-red-500/10 border-red-500/20" },
          ] as { key: PermissionStatus; label: string; color: string }[]
        ).map(({ key, label, color }) => (
          <div key={key} className={`rounded-xl border p-3 ${color}`}>
            <p className="text-2xl font-bold tabular-nums">{stats[key]}</p>
            <p className="text-xs font-semibold uppercase tracking-wider opacity-70">{label}</p>
          </div>
        ))}
      </div>

      {/* Tabela por grupo */}
      <div className="space-y-8">
        {groupedPermissions.map(({ number, name, permissions }) => (
          <section key={number} className="space-y-3">
            {/* Cabeçalho do grupo */}
            <div className="flex items-center gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-secondary text-xs font-bold text-muted-foreground">
                {number}
              </div>
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                {name.replace(/^GRUPO \d+ — /, "")}
              </h2>
              <div className="flex-1 h-px bg-border/50" />
            </div>

            {/* Tabela */}
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/20">
                    <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Permission</th>
                    <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hidden md:table-cell">API Endpoint</th>
                    <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hidden lg:table-cell">App Review</th>
                    <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Demo</th>
                    <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Recommendation</th>
                    <th className="px-4 py-2 w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {permissions.map((p) => (
                    <tr
                      key={p.permission}
                      className={cn(
                        "group transition-colors",
                        p.demoPath
                          ? "hover:bg-secondary/20 cursor-pointer"
                          : "opacity-70"
                      )}
                      onClick={() => {
                        if (p.demoPath) navigate(`/${slug}/meta-review/${p.demoPath}`);
                      }}
                    >
                      {/* Permission */}
                      <td className="px-4 py-3">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <StatusIcon status={p.status} />
                            <code className="text-xs font-mono text-foreground/90">{p.permission}</code>
                          </div>
                          <p className="text-[11px] text-muted-foreground line-clamp-1 pl-5">{p.description}</p>
                          {p.notes && (
                            <p className="text-[10px] text-muted-foreground/50 italic pl-5 line-clamp-1">{p.notes}</p>
                          )}
                        </div>
                      </td>

                      {/* Endpoint */}
                      <td className="px-4 py-3 hidden md:table-cell">
                        {p.apiEndpoint ? (
                          <code className="text-[10px] font-mono text-muted-foreground/70 line-clamp-2">
                            {p.apiEndpoint}
                          </code>
                        ) : (
                          <span className="text-[10px] text-muted-foreground/30">—</span>
                        )}
                      </td>

                      {/* App Review */}
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className={cn(
                          "inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold",
                          p.requiresAppReview
                            ? "bg-amber-500/10 text-amber-400"
                            : "bg-emerald-500/10 text-emerald-400"
                        )}>
                          {p.requiresAppReview ? "Required" : "Standard"}
                        </span>
                      </td>

                      {/* Demo */}
                      <td className="px-4 py-3">
                        {p.demoPath ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold text-violet-400">
                            <Eye className="h-2.5 w-2.5" />
                            DEMO
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground/30">—</span>
                        )}
                      </td>

                      {/* Badge de status */}
                      <td className="px-4 py-3">
                        <PermissionBadge status={p.status} />
                      </td>

                      {/* Chevron */}
                      <td className="px-2 py-3">
                        {p.demoPath && (
                          <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>

      {/* Nota de política */}
      <div className="rounded-xl border border-border bg-secondary/10 p-4">
        <p className="text-xs text-muted-foreground/60 leading-relaxed">
          <strong className="text-muted-foreground">Política de App Review:</strong>{" "}
          Nenhuma demonstração falsa ou simulada é criada para permissions sem uso real.
          KEEP = existe e pode ser demonstrado com chamadas reais.
          IMPLEMENT LATER = planejado, não implementado.
          NOT READY = sem uso real, sem plano.
          REMOVE = não necessário para o C8 Control.
        </p>
      </div>
    </div>
  );
}
