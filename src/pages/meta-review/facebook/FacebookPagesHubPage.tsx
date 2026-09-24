/**
 * FacebookPagesHubPage — /meta-review/facebook
 *
 * GRUPO 2 — FACEBOOK PAGES
 * Hub com links para cada sub-página de permissão de Pages.
 */

import { useNavigate, useParams } from "react-router-dom";
import { ChevronRight, Facebook, CheckCircle2, Clock, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PermissionBadge } from "../shared/PermissionBadge";
import type { PermissionStatus } from "../shared/types";
import { cn } from "@/lib/utils";

const PAGES_PERMISSIONS: {
  permission: string;
  description: string;
  status: PermissionStatus;
  path: string;
  endpoint: string;
}[] = [
  {
    permission: "pages_show_list",
    description: "Lists Facebook Pages the authenticated user manages.",
    status: "KEEP",
    path: "pages-show-list",
    endpoint: "GET /me/accounts",
  },
  {
    permission: "pages_read_engagement",
    description: "Reads Page content, followers, and engagement data.",
    status: "KEEP",
    path: "pages-read-engagement",
    endpoint: "GET /{page-id}?fields=…",
  },
  {
    permission: "pages_read_user_content",
    description: "Reads content published by users on the Page.",
    status: "KEEP",
    path: "pages-read-user-content",
    endpoint: "GET /{page-id}/feed",
  },
  {
    permission: "pages_manage_metadata",
    description: "Subscribes Page to webhooks for real-time events.",
    status: "KEEP",
    path: "pages-manage-metadata",
    endpoint: "POST /{page-id}/subscribed_apps",
  },
  {
    permission: "pages_manage_engagement",
    description: "Replies to comments and posts on the Page via API.",
    status: "KEEP",
    path: "pages-manage-engagement",
    endpoint: "POST /{comment-id}/comments",
  },
  {
    permission: "pages_messaging",
    description: "Manages and accesses Page Messenger conversations.",
    status: "IMPLEMENT_LATER",
    path: "pages-messaging",
    endpoint: "POST /me/messages",
  },
];

export function FacebookPagesHubPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost" size="sm"
          className="gap-1.5 text-muted-foreground"
          onClick={() => navigate(`/${slug}/meta-review`)}
        >
          ← Meta Review
        </Button>
        <span className="text-muted-foreground/30">/</span>
        <span className="text-xs text-muted-foreground">GRUPO 2 — FACEBOOK PAGES</span>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1877F2]/20">
          <Facebook className="h-5 w-5 text-[#1877F2]" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Facebook Pages</h1>
          <p className="text-sm text-muted-foreground">
            Demonstrações para as permissões de Páginas do Facebook
          </p>
        </div>
      </div>

      {/* Lista de permissões */}
      <div className="rounded-xl border border-border overflow-hidden divide-y divide-border/50">
        {PAGES_PERMISSIONS.map((p) => (
          <button
            key={p.permission}
            onClick={() => navigate(`/${slug}/meta-review/${p.path}`)}
            className={cn(
              "flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-secondary/20 group",
              p.status === "IMPLEMENT_LATER" && "opacity-60"
            )}
          >
            {/* Status icon */}
            <div className="shrink-0">
              {p.status === "KEEP" ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              ) : (
                <Clock className="h-5 w-5 text-blue-400" />
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <code className="text-sm font-mono font-semibold text-foreground/90">
                  {p.permission}
                </code>
                <PermissionBadge status={p.status} />
                <span className="inline-flex items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold text-violet-400">
                  <Eye className="h-2.5 w-2.5" />
                  DEMO
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{p.description}</p>
              <code className="text-[10px] font-mono text-muted-foreground/50">{p.endpoint}</code>
            </div>

            {/* Arrow */}
            <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}
