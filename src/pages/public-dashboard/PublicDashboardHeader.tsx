import { useState, useEffect, useRef } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Calendar, Lock, LogOut, User, Loader2, Bell, BellDot } from "lucide-react";
import { format, subDays, startOfMonth, endOfMonth, subMonths, parseISO } from "date-fns";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { useClientAuth } from "@/hooks/useClientAuth";
import { useNotificationAlerts } from "@/hooks/useNotificationAlerts";

// ─── PeriodDropdown ────────────────────────────────────────────────────────────

function PeriodDropdown() {
  const [searchParams, setSearchParams] = useSearchParams();

  const from = searchParams.get("from") ?? format(startOfMonth(new Date()), "yyyy-MM-dd");
  const to = searchParams.get("to") ?? format(endOfMonth(new Date()), "yyyy-MM-dd");

  const presets = [
    {
      label: "Hoje",
      from: format(new Date(), "yyyy-MM-dd"),
      to: format(new Date(), "yyyy-MM-dd"),
    },
    {
      label: "Últimos 7 dias",
      from: format(subDays(new Date(), 7), "yyyy-MM-dd"),
      to: format(new Date(), "yyyy-MM-dd"),
    },
    {
      label: "Últimos 15 dias",
      from: format(subDays(new Date(), 15), "yyyy-MM-dd"),
      to: format(new Date(), "yyyy-MM-dd"),
    },
    {
      label: "Últimos 30 dias",
      from: format(subDays(new Date(), 30), "yyyy-MM-dd"),
      to: format(new Date(), "yyyy-MM-dd"),
    },
    {
      label: "Últimos 60 dias",
      from: format(subDays(new Date(), 60), "yyyy-MM-dd"),
      to: format(new Date(), "yyyy-MM-dd"),
    },
    {
      label: "Últimos 90 dias",
      from: format(subDays(new Date(), 90), "yyyy-MM-dd"),
      to: format(new Date(), "yyyy-MM-dd"),
    },
    {
      label: "Mês atual",
      from: format(startOfMonth(new Date()), "yyyy-MM-dd"),
      to: format(endOfMonth(new Date()), "yyyy-MM-dd"),
    },
    {
      label: "Mês anterior",
      from: format(startOfMonth(subMonths(new Date(), 1)), "yyyy-MM-dd"),
      to: format(endOfMonth(subMonths(new Date(), 1)), "yyyy-MM-dd"),
    },
  ];

  const activePreset = presets.find((p) => p.from === from && p.to === to);
  const buttonLabel = activePreset?.label ?? "Personalizado";

  const handlePreset = (preset: { from: string; to: string }) => {
    setSearchParams({ from: preset.from, to: preset.to });
  };

  const handleCustomFrom = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchParams({ from: e.target.value, to });
  };

  const handleCustomTo = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchParams({ from, to: e.target.value });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2 h-9 text-sm border-border bg-secondary/40 hover:bg-secondary text-foreground">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="hidden sm:inline">{buttonLabel}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56 shadow-elevated" align="end">
        <DropdownMenuLabel className="text-xs uppercase font-bold tracking-widest text-muted-foreground">
          Período
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {presets.map((preset) => (
          <DropdownMenuItem
            key={preset.label}
            className={`cursor-pointer ${activePreset?.label === preset.label ? "text-primary font-semibold" : ""}`}
            onClick={() => handlePreset(preset)}
          >
            {preset.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <div className="px-2 py-2 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Personalizado</p>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">De</Label>
            <Input type="date" value={from} onChange={handleCustomFrom} className="h-7 text-xs bg-background border-border [color-scheme:dark]" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Até</Label>
            <Input type="date" value={to} onChange={handleCustomTo} className="h-7 text-xs bg-background border-border [color-scheme:dark]" />
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── ChangePasswordDialog ──────────────────────────────────────────────────────

interface ChangePasswordDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  slug: string;
}

function ChangePasswordDialog({ open, onOpenChange, slug }: ChangePasswordDialogProps) {
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const trimmed = newPassword.trim();
    if (!trimmed) {
      toast.error("A nova senha não pode estar vazia.");
      return;
    }

    setSaving(true);
    try {
      // Busca o cliente pelo slug para obter id e metadata existente
      const { data: client, error: fetchError } = await supabase
        .from("clients")
        .select("id, metadata")
        .eq("dashboard_slug", slug)
        .single();

      if (fetchError || !client) {
        toast.error("Não foi possível encontrar o cliente.");
        return;
      }

      const existingMetadata = (client.metadata as Record<string, unknown>) ?? {};

      const { error: updateError } = await supabase
        .from("clients")
        .update({
          metadata: {
            ...existingMetadata,
            dashboard_password: trimmed,
          },
        })
        .eq("id", client.id);

      if (updateError) {
        toast.error("Erro ao salvar a senha: " + updateError.message);
        return;
      }

      toast.success("Senha alterada com sucesso!");
      setNewPassword("");
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) setNewPassword("");
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="border-border bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Alterar Senha</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Digite a nova senha de acesso ao dashboard.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid gap-2">
            <Label htmlFor="new-password">Nova Senha</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Digite a nova senha..."
              className="bg-background border-border"
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !newPassword.trim()}
            className="bg-gradient-ember text-primary-foreground"
          >
            {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Salvando...</> : "Salvar Nova Senha"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── ProfileDialog ─────────────────────────────────────────────────────────────

interface ProfileDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

function ProfileDialog({ open, onOpenChange }: ProfileDialogProps) {
  const { auth } = useClientAuth();
  const userId  = auth?.user?.id ?? null;
  const clientId = auth?.id ?? null;

  const [displayName, setDisplayName] = useState(
    auth?.user?.full_name ?? auth?.name ?? ""
  );
  const [avatarUrl, setAvatarUrl] = useState<string | null>(() => {
    if (auth?.user?.avatar_url) return auth.user.avatar_url;
    if (userId) return localStorage.getItem(`user_avatar_url_${userId}`);
    return null;
  });
  const [soundEnabled, setSoundEnabledState] = useState<boolean>(() => {
    const stored = localStorage.getItem("notification_sound_enabled");
    return stored === null ? true : stored === "true";
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync when auth changes
  useEffect(() => {
    if (open) {
      setDisplayName(auth?.user?.full_name ?? auth?.name ?? "");
      const url = auth?.user?.avatar_url ?? (userId ? localStorage.getItem(`user_avatar_url_${userId}`) : null);
      setAvatarUrl(url);
      const stored = localStorage.getItem("notification_sound_enabled");
      setSoundEnabledState(stored === null ? true : stored === "true");
    }
  }, [open, auth?.user?.full_name, auth?.name, auth?.user?.avatar_url, userId]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId || !clientId) return;

    setUploading(true);
    try {
      const path = `client-avatars/${clientId}/${userId}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = urlData?.publicUrl ?? null;

      if (publicUrl) {
        setAvatarUrl(publicUrl);
        localStorage.setItem(`user_avatar_url_${userId}`, publicUrl);
      } else {
        // Fallback: blob URL stored in localStorage key
        const blob = URL.createObjectURL(file);
        setAvatarUrl(blob);
        localStorage.setItem(`user_avatar_url_${userId}`, blob);
      }

      toast.success("Foto atualizada!");
    } catch (err) {
      // Fallback: use blob URL
      const blob = URL.createObjectURL(file);
      setAvatarUrl(blob);
      if (userId) localStorage.setItem(`user_avatar_url_${userId}`, blob);
      console.warn("[ProfileDialog] avatar upload error:", err);
    } finally {
      setUploading(false);
      // Reset input so same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSave = async () => {
    if (!userId) return;
    setSaving(true);
    try {
      const trimmedName = displayName.trim();

      // Try client_users first, then crm_users, then localStorage fallback
      let saved = false;
      if (trimmedName) {
        const { error: e1 } = await supabase
          .from("client_users")
          .update({ full_name: trimmedName })
          .eq("id", userId);

        if (!e1) {
          saved = true;
        } else {
          const { error: e2 } = await supabase
            .from("crm_users")
            .update({ full_name: trimmedName })
            .eq("id", userId);
          if (!e2) saved = true;
        }
      }

      if (!saved && trimmedName) {
        localStorage.setItem(`user_display_name_${userId}`, trimmedName);
      }

      // Persist sound preference
      localStorage.setItem("notification_sound_enabled", String(soundEnabled));

      toast.success("Perfil salvo!");
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const initials = (displayName || auth?.name || "?")
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Editar Perfil</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Ajuste seu nome de exibição, foto e preferências.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Avatar */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative h-16 w-16">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Avatar"
                  className="h-16 w-16 rounded-full object-cover border border-border"
                />
              ) : (
                <div className="h-16 w-16 rounded-full bg-primary/20 flex items-center justify-center text-xl font-semibold text-primary border border-border">
                  {initials}
                </div>
              )}
              {uploading && (
                <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-white" />
                </div>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? "Enviando…" : "Alterar foto"}
            </Button>
          </div>

          {/* Nome de exibição */}
          <div className="grid gap-2">
            <Label htmlFor="profile-display-name">Nome de exibição</Label>
            <Input
              id="profile-display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Seu nome..."
              className="bg-background border-border"
            />
          </div>

          {/* Alerta sonoro */}
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium">Alerta sonoro</p>
              <p className="text-xs text-muted-foreground">Tocar som ao receber novas mensagens</p>
            </div>
            <Switch
              checked={soundEnabled}
              onCheckedChange={setSoundEnabledState}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-gradient-ember text-primary-foreground"
          >
            {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Salvando...</> : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── PublicDashboardHeader ─────────────────────────────────────────────────────

export function PublicDashboardHeader() {
  const { auth, slug, logout } = useClientAuth();
  const location = useLocation();
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [showProfileDialog, setShowProfileDialog] = useState(false);

  // ── Agent resolution + assigned conversation IDs (for message alerts) ──────
  const [myAgentId, setMyAgentId] = useState<string | null>(null);
  const [agentConvIds, setAgentConvIds] = useState<string[]>([]);

  useEffect(() => {
    if (!auth?.id || !auth?.organization_id || !auth?.user?.id) return;

    // Register / resolve agent record
    supabase.rpc("ensure_client_agent", {
      p_client_id:       auth.id,
      p_organization_id: auth.organization_id,
      p_crm_user_id:     auth.user.id,
      p_display_name:    auth.user.full_name ?? auth.user.email ?? "Agente",
      p_avatar_url:      (auth?.user as unknown as { avatar_url?: string })?.avatar_url ?? null,
    }).then(({ data, error }) => {
      if (error) {
        console.warn("[PublicDashboardHeader] ensure_client_agent:", error);
        return;
      }
      if (data) {
        const aid =
          data && typeof data === "object"
            ? (data as { agent_id?: string }).agent_id
            : (data as string);
        setMyAgentId(aid ?? null);
      }
    });
  }, [auth?.id, auth?.organization_id, auth?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!myAgentId || !auth?.id) return;

    const clientId = auth.id;

    const fetchConvIds = () =>
      supabase
        .from("client_channel_conversations")
        .select("id")
        .eq("assigned_agent_id", myAgentId)
        .eq("status", "human_active")
        .eq("client_id", clientId)
        .then(({ data }) => {
          setAgentConvIds((data ?? []).map((r: { id: string }) => r.id));
        });

    // Initial fetch
    fetchConvIds();

    // Stay current: subscribe to any INSERT/UPDATE/DELETE on this agent's conversations
    // so the notification subscription window is refreshed when assignments change.
    const channel = supabase
      .channel(`agent-conv-watch-${clientId}-${myAgentId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "client_channel_conversations",
          filter: `assigned_agent_id=eq.${myAgentId}`,
        },
        () => {
          fetchConvIds();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [myAgentId, auth?.id]);

  // ── Notification alerts ─────────────────────────────────────────────────────
  const {
    alerts,
    unreadAlerts,
    clearAlerts,
    soundEnabled,
    setSoundEnabled,
  } = useNotificationAlerts({
    conversationIds: agentConvIds,
    clientId: auth?.id ?? null,
  });

  // ── Avatar preview (from localStorage or auth) ──────────────────────────────
  const userId = auth?.user?.id ?? null;
  const avatarPreview =
    auth?.user?.avatar_url ??
    (userId ? localStorage.getItem(`user_avatar_url_${userId}`) : null);

  const initials =
    (auth?.user?.full_name ?? auth?.name ?? "?")
      .split(" ")
      .slice(0, 2)
      .map((w: string) => w[0])
      .join("")
      .toUpperCase();

  // PeriodDropdown só aparece nas 3 rotas de Resultados
  const resultadosRoutes = [
    `/${slug}`,
    `/${slug}/performance`,
    `/${slug}/atendimento`,
  ];
  const showPeriodDropdown = resultadosRoutes.includes(location.pathname);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/70 px-4 backdrop-blur-xl md:px-6">
      <SidebarTrigger className="text-muted-foreground hover:text-foreground" />

      <div className="ml-auto flex items-center gap-2 md:gap-3">
        {showPeriodDropdown && <PeriodDropdown />}

        {/* ── Alerta de mensagens (conversas atribuídas) ── */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              className="relative flex h-9 w-9 items-center justify-center rounded-full border border-border bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
              title="Alertas de mensagens"
              aria-label="Alertas de mensagens"
            >
              <Bell className="h-4 w-4" />
              {unreadAlerts > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
                  {unreadAlerts > 99 ? "99+" : unreadAlerts}
                </span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="end">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="text-sm font-semibold">Mensagens</span>
              {alerts.length > 0 && (
                <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground" onClick={clearAlerts}>
                  Limpar
                </Button>
              )}
            </div>

            {alerts.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                Nenhuma nova mensagem
              </div>
            ) : (
              <ScrollArea className="max-h-72">
                <div className="divide-y divide-border/50">
                  {alerts.slice(0, 10).map((alert) => {
                    let timeLabel = "";
                    try {
                      timeLabel = format(parseISO(alert.timestamp), "HH:mm");
                    } catch { /* ignore */ }

                    return (
                      <div key={alert.id} className="px-4 py-2.5">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className="text-xs font-semibold text-foreground truncate">
                            {alert.contactName}
                          </span>
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {timeLabel}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground truncate overflow-hidden whitespace-nowrap">
                          {alert.preview}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}

            {/* Sound toggle inside popover footer */}
            <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-secondary/20">
              <span className="text-[11px] text-muted-foreground">Alerta sonoro</span>
              <Switch
                checked={soundEnabled}
                onCheckedChange={setSoundEnabled}
                className="scale-75"
              />
            </div>
          </PopoverContent>
        </Popover>

        {/* ── Alertas gerais da aplicação (preparado para uso futuro) ── */}
        <button
          className="relative flex h-9 w-9 items-center justify-center rounded-full border border-border bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          title="Alertas da aplicação"
          aria-label="Alertas da aplicação"
        >
          <BellDot className="h-4 w-4" />
        </button>

        {/* ── Menu de perfil ── */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-secondary/40 text-sm font-semibold text-foreground hover:bg-secondary transition-colors overflow-hidden">
              {avatarPreview ? (
                <img
                  src={avatarPreview}
                  alt="Avatar"
                  className="h-full w-full object-cover rounded-full"
                />
              ) : (
                initials
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56 shadow-elevated" align="end">
            <DropdownMenuLabel className="text-xs uppercase tracking-widest text-muted-foreground">
              Minha Conta
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 cursor-default py-3">
              <User className="h-4 w-4 text-primary shrink-0" />
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-semibold truncate">{auth?.user?.full_name ?? auth?.name}</span>
                <span className="text-[10px] text-muted-foreground truncate">{auth?.company}</span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 cursor-pointer py-3" onClick={() => setShowProfileDialog(true)}>
              <User className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm font-medium">Editar Perfil</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 cursor-pointer py-3" onClick={() => setShowPasswordDialog(true)}>
              <Lock className="h-4 w-4 text-warning shrink-0" />
              <span className="text-sm font-medium">Alterar Senha</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 cursor-pointer py-3 text-destructive focus:text-destructive" onClick={logout}>
              <LogOut className="h-4 w-4 shrink-0" />
              <span className="text-sm font-medium">Encerrar Sessão</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ChangePasswordDialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog} slug={slug} />
      <ProfileDialog open={showProfileDialog} onOpenChange={setShowProfileDialog} />
    </header>
  );
}
