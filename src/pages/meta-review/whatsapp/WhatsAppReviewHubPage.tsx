/**
 * WhatsAppReviewHubPage — /meta-review/whatsapp
 *
 * GRUPO 5 — WHATSAPP
 * Hub para as duas permissões do grupo com links para cada demo.
 *
 * whatsapp_business_management → Embedded Signup, WABA, phone numbers
 * whatsapp_business_messaging  → send/receive messages via Cloud API
 */

import { useNavigate, useParams } from "react-router-dom";
import {
  MessageCircle, ChevronRight, CheckCircle2, Eye,
  Settings, Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PermissionBadge } from "../shared/PermissionBadge";
import type { PermissionStatus } from "../shared/types";

const PERMISSIONS: {
  permission: string;
  description: string;
  status: PermissionStatus;
  path: string;
  endpoint: string;
  icon: React.ElementType;
  advancedAccess: boolean;
}[] = [
  {
    permission: "whatsapp_business_management",
    description: "Onboard via Embedded Signup, manage WABA, phone numbers, templates and webhooks.",
    status: "KEEP",
    path: "whatsapp/management",
    endpoint: "GET /{waba-id}/phone_numbers  POST /{phone-id}/register",
    icon: Settings,
    advancedAccess: true,
  },
  {
    permission: "whatsapp_business_messaging",
    description: "Send and receive WhatsApp messages via the Cloud API.",
    status: "KEEP",
    path: "whatsapp/messaging",
    endpoint: "POST /{phone-number-id}/messages",
    icon: Send,
    advancedAccess: true,
  },
];

export function WhatsAppReviewHubPage() {
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
        <span className="text-xs text-muted-foreground">GRUPO 5 — WHATSAPP</span>
      </div>

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#25D366]/20">
          <MessageCircle className="h-5 w-5 text-[#25D366]" />
        </div>
        <div>
          <h1 className="text-xl font-bold">WhatsApp Business Platform</h1>
          <p className="text-sm text-muted-foreground">
            Embedded Signup, WABA management e Cloud API messaging
          </p>
        </div>
      </div>

      {/* Nota sobre Advanced Access */}
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-2">
        <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
          Advanced Access obrigatório
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Ambas as permissões do Grupo 5 requerem <strong>Advanced Access</strong> via App Review.
          Em Standard Access, o app só consegue acessar dados de usuários com role no próprio app.
          Inicie o processo de App Review o quanto antes — pode levar de 2 a 8 semanas.
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          <strong>Configuração necessária:</strong> no Meta App Dashboard, adicione o produto
          WhatsApp e crie uma configuração de Embedded Signup com variação
          "Cadastro incorporado do WhatsApp".
        </p>
      </div>

      {/* Arquitetura do fluxo */}
      <div className="rounded-xl border border-border bg-secondary/10 p-4 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Fluxo Embedded Signup no C8 Control
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 text-xs text-center">
          {[
            { step: "C8 Control", sub: "Conectar WhatsApp" },
            { step: "Meta Embedded Signup", sub: "Empresa + WABA + Número" },
            { step: "Callback", sub: "code + WABA_ID" },
            { step: "whatsapp_business_management", sub: "Registrar + Webhooks" },
            { step: "Integration Active", sub: "whatsapp_business_messaging" },
          ].map(({ step, sub }, i) => (
            <div key={step} className="relative">
              <div className="rounded-lg border border-border bg-card/50 p-2.5">
                <p className="font-semibold text-foreground/80 text-[11px]">{step}</p>
                <p className="text-muted-foreground/60 text-[10px] mt-0.5">{sub}</p>
              </div>
              {i < 4 && (
                <div className="hidden sm:flex absolute -right-3 top-1/2 -translate-y-1/2 text-muted-foreground/30 text-lg z-10">
                  →
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Lista de permissões */}
      <div className="rounded-xl border border-border overflow-hidden divide-y divide-border/50">
        {PERMISSIONS.map((p) => (
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
                {p.advancedAccess && (
                  <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
                    Advanced Access
                  </span>
                )}
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
