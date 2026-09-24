/**
 * InstagramFacebookLoginHubPage — /meta-review/instagram-facebook-login
 *
 * GRUPO 3 — INSTAGRAM VIA FACEBOOK LOGIN
 * Hub com as três permissões do grupo e links para cada demo.
 *
 * Contexto técnico:
 *   Este fluxo usa o Facebook Login para autenticar e, a partir da Página
 *   Facebook conectada, acessar a conta profissional do Instagram vinculada.
 *   É diferente do Instagram Login (Grupo 4), que autentica diretamente no Instagram.
 */

import { useNavigate, useParams } from "react-router-dom";
import {
  Instagram, ChevronRight, CheckCircle2, Clock,
  Eye, MessageSquare, Heart, Image,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotReadyBanner } from "../shared/NotReadyBanner";
import { PermissionBadge } from "../shared/PermissionBadge";
import type { PermissionStatus } from "../shared/types";
import { cn } from "@/lib/utils";

const PERMISSIONS: {
  permission: string;
  description: string;
  status: PermissionStatus;
  path: string;
  endpoint: string;
  icon: React.ElementType;
}[] = [
  {
    permission: "instagram_basic",
    description: "Access Instagram professional account linked to a Facebook Page.",
    status: "KEEP",
    path: "instagram-facebook-login/basic",
    endpoint: "GET /{ig-user-id}?fields=id,username,profile_picture_url",
    icon: Instagram,
  },
  {
    permission: "instagram_manage_comments",
    description: "Read and reply to comments on Instagram posts.",
    status: "KEEP",
    path: "instagram-facebook-login/comments",
    endpoint: "GET /{media-id}/comments  POST /{comment-id}/replies",
    icon: MessageSquare,
  },
  {
    permission: "instagram_manage_messages",
    description: "Receive and reply to Instagram Direct Messages via webhook.",
    status: "KEEP",
    path: "instagram-facebook-login/messages",
    endpoint: "POST /me/messages (via Page token)",
    icon: MessageSquare,
  },
  {
    permission: "instagram_content_publish",
    description: "Publish posts, Reels and Stories to Instagram.",
    status: "IMPLEMENT_LATER",
    path: "",
    endpoint: "POST /{ig-user-id}/media  POST /{ig-user-id}/media_publish",
    icon: Image,
  },
  {
    permission: "instagram_manage_insights",
    description: "Access reach, impressions and engagement metrics.",
    status: "IMPLEMENT_LATER",
    path: "",
    endpoint: "GET /{ig-user-id}/insights",
    icon: Heart,
  },
];

export function InstagramFacebookLoginHubPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const ready = PERMISSIONS.filter((p) => p.status === "KEEP");
  const later = PERMISSIONS.filter((p) => p.status !== "KEEP");

  return (
    <div className="space-y-6 max-w-4xl mx-auto">

      {/* Breadcrumb */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground"
          onClick={() => navigate(`/${slug}/meta-review`)}>
          ← Meta Review
        </Button>
        <span className="text-muted-foreground/30">/</span>
        <span className="text-xs text-muted-foreground">GRUPO 3 — INSTAGRAM VIA FACEBOOK LOGIN</span>
      </div>

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-pink-500">
          <Instagram className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Instagram via Facebook Login</h1>
          <p className="text-sm text-muted-foreground">
            Acesso ao Instagram profissional via conta Facebook e Página vinculada
          </p>
        </div>
      </div>

      {/* Nota técnica */}
      <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-2">
        <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider">Como funciona este fluxo</p>
        <div className="space-y-1 text-xs text-muted-foreground leading-relaxed">
          <p>1. Usuário autentica com Facebook Login (permissões: <code className="font-mono">pages_show_list</code> + <code className="font-mono">instagram_basic</code>)</p>
          <p>2. C8 Control lista as Páginas Facebook do usuário</p>
          <p>3. Para cada Página, busca a conta Instagram profissional vinculada</p>
          <p>4. Usuário confirma qual conta conectar ao C8 Control</p>
        </div>
        <p className="text-[11px] text-blue-400/60 italic">
          Diferente do Grupo 4 (Instagram Login), que autentica diretamente no Instagram sem passar pelo Facebook.
        </p>
      </div>

      {/* Permissões com demo */}
      <div className="rounded-xl border border-border overflow-hidden divide-y divide-border/50">
        {ready.map((p) => (
          <button key={p.permission}
            onClick={() => navigate(`/${slug}/meta-review/${p.path}`)}
            className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-secondary/20 group">
            <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <code className="text-sm font-mono font-semibold text-foreground/90">{p.permission}</code>
                <PermissionBadge status={p.status} />
                <span className="inline-flex items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold text-violet-400">
                  <Eye className="h-2.5 w-2.5" />DEMO
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{p.description}</p>
              <code className="text-[10px] font-mono text-muted-foreground/50">{p.endpoint}</code>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors shrink-0" />
          </button>
        ))}
      </div>

      {/* Permissões futuras */}
      <div className="space-y-3">
        {later.map((p) => (
          <NotReadyBanner
            key={p.permission}
            permission={p.permission}
            reason="planned"
            plannedFor={p.permission === "instagram_content_publish"
              ? "Fase 8 — Conteúdo IA / Publicação Automática"
              : "Módulo Analytics futuro"}
          />
        ))}
      </div>
    </div>
  );
}
