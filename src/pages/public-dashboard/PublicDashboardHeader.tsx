import { useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar, Lock, LogOut, User, Loader2 } from "lucide-react";
import { format, subDays, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { useClientAuth } from "@/hooks/useClientAuth";

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

// ─── PublicDashboardHeader ─────────────────────────────────────────────────────

export function PublicDashboardHeader() {
  const { auth, slug, logout } = useClientAuth();
  const location = useLocation();
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);

  // PeriodDropdown só aparece nas 3 rotas de Resultados
  const resultadosRoutes = [
    `/public/dashboard/${slug}`,
    `/public/dashboard/${slug}/performance`,
    `/public/dashboard/${slug}/atendimento`,
  ];
  const showPeriodDropdown = resultadosRoutes.includes(location.pathname);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/70 px-4 backdrop-blur-xl md:px-6">
      <SidebarTrigger className="text-muted-foreground hover:text-foreground" />

      <div className="ml-auto flex items-center gap-2 md:gap-3">
        {showPeriodDropdown && <PeriodDropdown />}

        {/* Menu de perfil */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-secondary/40 text-sm font-semibold text-foreground hover:bg-secondary transition-colors">
              {auth?.name?.charAt(0)?.toUpperCase() ?? "?"}
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
                <span className="text-sm font-semibold truncate">{auth?.name}</span>
                <span className="text-[10px] text-muted-foreground truncate">{auth?.company}</span>
              </div>
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
    </header>
  );
}
