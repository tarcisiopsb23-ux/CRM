/**
 * InstagramLoginHubPage — /meta-review/instagram-login
 *
 * GRUPO 4 — INSTAGRAM LOGIN
 * Hub independente do Facebook Login.
 *
 * Diferença fundamental vs Grupo 3:
 *   Grupo 3 autentica via Facebook → acessa Instagram via Página vinculada.
 *   Grupo 4 autentica DIRETAMENTE no Instagram, sem exigir uma Página Facebook.
 *   O fluxo usa instagram.com/oauth/authorize com scopes instagram_business_*.
 *
 * Referência oficial:
 *   https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login
 */

import { useNavigate, useParams } from "react-router-dom";
import {
  Instagram, ChevronRight, CheckCircle2, Eye,
  MessageSquare, Hash, ArrowLeftRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
    permission: "instagram_business_basic",
    description: "Access Instagram professional account directly via Instagram Login.",
    status: "KEEP",
    path: "instagram-login/basic",
    endpoint: "GET /me?fields=id,username,profile_picture_url",
    icon: Instagram,
  },
  {
    permission: "instagram_business_manage_messages",
    description: "Receive and reply to Instagram DMs via Instagram Login auth.",
    status: "KEEP",
    path: "instagram-login/messages",
    endpoint: "POST /me/messages",
    icon: MessageSquare,
  },
  {
    permission: "instagram_business_manage_comments",
    description: "Read and reply to Instagram comments via Instagram Login auth.",
    status: "KEEP",
    path: "instagram-login/comments",
    endpoint: "GET /{media-id}/comments  POST /{comment-id}/replies",
    icon: Hash,
  },
];

export function InstagramLoginHubPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  return (
    <div className="space-y-6 max-w-4xl mx-auto">

      {/* Breadcrumb */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground"
          onClick={() => navigate(`/${slug}/meta-review`)}>
          ← Meta Review
        </Button>
        <span className="text-muted-foreground/30">/</span>
        <span className="text-xs text-muted-foreground">GRUPO 4 — INSTAGRAM LOGIN</span>
      </div>

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-orange-400 via-pink-500 to-purple-600">
          <Instagram className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Instagram Login</h1>
          <p className="text-sm text-muted-foreground">
            Autenticação direta no Instagram — sem necessidade de conta Facebook
          </p>
        </div>
      </div>

      {/* Diferença vs Grupo 3 */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-secondary/10 p-4 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Grupo 3 — Via Facebook Login
          </p>
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>✦ Autentica com conta Facebook</p>
            <p>✦ Exige Página Facebook vinculada</p>
            <p>✦ Acessa Instagram via Página</p>
            <p>✦ Scopes: <code className="font-mono">instagram_basic</code></p>
          </div>
        </div>
        <div className="rounded-xl border border-pink-500/20 bg-pink-500/5 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="h-3.5 w-3.5 text-pink-400" />
            <p className="text-xs font-semibold text-pink-400 uppercase tracking-wider">
              Grupo 4 — Instagram Login direto
            </p>
          </div>
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>✦ Autentica diretamente no Instagram</p>
            <p>✦ Sem Página Facebook necessária</p>
            <p>✦ Acesso nativo ao perfil Instagram</p>
            <p>✦ Scopes: <code className="font-mono">instagram_business_*</code></p>
          </div>
        </div>
      </div>

      {/* Nota sobre o fluxo OAuth */}
      <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-2">
        <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider">
          Fluxo OAuth — Instagram Login API
        </p>
        <div className="space-y-1 text-xs text-muted-foreground leading-relaxed">
          <p>1. Redirect para <code className="font-mono">https://api.instagram.com/oauth/authorize</code></p>
          <p>2. Usuário autentica com conta Instagram (não Facebook)</p>
          <p>3. Callback retorna código OAuth para C8 Control</p>
          <p>4. Troca do código por token via <code className="font-mono">https://api.instagram.com/oauth/access_token</code></p>
          <p>5. Token de longa duração via <code className="font-mono">https://graph.instagram.com/access_token</code></p>
        </div>
        <p className="text-[11px] text-blue-400/60 italic">
          Referência: developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login
        </p>
      </div>

      {/* Lista de permissões */}
      <div className="rounded-xl border border-border overflow-hidden divide-y divide-border/50">
        {PERMISSIONS.map((p) => (
          <button
            key={p.permission}
            onClick={() => navigate(`/${slug}/meta-review/${p.path}`)}
            className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-secondary/20 group"
          >
            <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <code className="text-sm font-mono font-semibold text-foreground/90">{p.permission}</code>
                <PermissionBadge status={p.status} />
                <span className="inline-flex items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold text-violet-400">
                  <Eye className="h-2.5 w-2.5" />DEMO
                </span>
                <span className="rounded-full border border-pink-500/30 bg-pink-500/10 px-2 py-0.5 text-[10px] font-semibold text-pink-400">
                  IG Login
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{p.description}</p>
              <code className="text-[10px] font-mono text-muted-foreground/50">{p.endpoint}</code>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}
