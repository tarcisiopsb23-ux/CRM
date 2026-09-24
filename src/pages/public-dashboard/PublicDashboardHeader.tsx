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
import { Calendar, Lock, LogOut, User, Loader2, Eye, EyeOff, CheckCircle2, XCircle } from "lucide-react";
import { format, subDays, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { toast } from "sonner";
import { useClientAuth } from "@/hooks/useClientAuth";
import { cn } from "@/lib/utils";

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

// ─── PasswordInput (módulo) ───────────────────────────────────────────────────
// Definido fora de qualquer componente para que o React não recrie o elemento
// DOM a cada re-render do pai — evita perda de foco ao digitar.

interface PwdInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggleShow: () => void;
  placeholder: string;
}

function PasswordInputField({ id, label, value, onChange, show, onToggleShow, placeholder }: PwdInputProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm text-foreground">{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="bg-background border-border pr-10"
          autoComplete="off"
        />
        <button
          type="button"
          onClick={onToggleShow}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          tabIndex={-1}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

// ─── ChangePasswordDialog ──────────────────────────────────────────────────────

interface ChangePasswordDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

function ChangePasswordDialog({ open, onOpenChange }: ChangePasswordDialogProps) {
  const { auth } = useClientAuth();

  const [currentPassword,  setCurrentPassword]  = useState("");
  const [newPassword,      setNewPassword]      = useState("");
  const [confirmPassword,  setConfirmPassword]  = useState("");
  const [showCurrent,      setShowCurrent]      = useState(false);
  const [showNew,          setShowNew]          = useState(false);
  const [showConfirm,      setShowConfirm]      = useState(false);
  const [saving,           setSaving]           = useState(false);
  const [error,            setError]            = useState<string | null>(null);

  // Regras de senha forte (mesmo padrão exigido pelo Supabase auth)
  const rules = [
    { label: "Mínimo 8 caracteres",    ok: newPassword.length >= 8 },
    { label: "Letra maiúscula (A-Z)",   ok: /[A-Z]/.test(newPassword) },
    { label: "Letra minúscula (a-z)",   ok: /[a-z]/.test(newPassword) },
    { label: "Número (0-9)",            ok: /[0-9]/.test(newPassword) },
    { label: "Caractere especial (!@#…)", ok: /[!@#$%^&*()\-_+=[\]{};':"\\|<>?,./`~]/.test(newPassword) },
  ];
  const allRulesOk  = rules.every(r => r.ok);
  const passwordsMatch = newPassword === confirmPassword && confirmPassword.length > 0;

  const reset = () => {
    setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    setShowCurrent(false);  setShowNew(false);  setShowConfirm(false);
    setError(null);
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const handleSave = async () => {
    setError(null);

    if (!currentPassword.trim()) { setError("Informe a senha atual."); return; }
    if (!allRulesOk)              { setError("A nova senha não atende todos os requisitos."); return; }
    if (!passwordsMatch)          { setError("A confirmação não coincide com a nova senha."); return; }
    if (currentPassword === newPassword) { setError("A nova senha deve ser diferente da senha atual."); return; }

    const session = auth?.session;
    if (!session?.access_token) {
      setError("Sessão expirada. Faça login novamente.");
      return;
    }

    setSaving(true);
    try {
      const SUPA_URL = import.meta.env.VITE_SUPABASE_URL as string;
      const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

      // 1. Verifica a senha atual tentando re-autenticar
      //    Usa o mesmo fluxo da Edge Function client-dashboard-auth (sem expor login_key)
      const verifyResp = await fetch(`${SUPA_URL}/functions/v1/change-my-password`, {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "apikey":         ANON_KEY,
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          current_password: currentPassword,
          password:         newPassword,
        }),
      });

      const result = await verifyResp.json() as { success?: boolean; error?: string };

      if (!verifyResp.ok) {
        setError(result.error ?? "Erro ao alterar senha. Tente novamente.");
        return;
      }

      toast.success("Senha alterada com sucesso!");
      handleOpenChange(false);

    } catch {
      setError("Erro de conexão. Verifique sua internet e tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="border-border bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Lock className="h-4 w-4 text-primary" />
            Alterar Senha
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Informe sua senha atual e defina a nova senha de acesso.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Senha atual */}
          <PasswordInputField
            id="current-password"
            label="Senha Atual"
            value={currentPassword}
            onChange={setCurrentPassword}
            show={showCurrent}
            onToggleShow={() => setShowCurrent(v => !v)}
            placeholder="Digite sua senha atual"
          />

          <div className="border-t border-border/40" />

          {/* Nova senha */}
          <PasswordInputField
            id="new-password"
            label="Nova Senha"
            value={newPassword}
            onChange={v => { setNewPassword(v); setError(null); }}
            show={showNew}
            onToggleShow={() => setShowNew(v => !v)}
            placeholder="Mínimo 8 caracteres"
          />

          {/* Requisitos de senha */}
          {newPassword.length > 0 && (
            <div className="rounded-lg bg-muted/20 border border-border/40 p-3 space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                Requisitos da senha
              </p>
              {rules.map(r => (
                <div key={r.label} className="flex items-center gap-2">
                  {r.ok
                    ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                    : <XCircle     className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                  }
                  <span className={cn("text-xs", r.ok ? "text-emerald-400" : "text-muted-foreground/60")}>
                    {r.label}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Confirmação da nova senha */}
          <PasswordInputField
            id="confirm-password"
            label="Confirmar Nova Senha"
            value={confirmPassword}
            onChange={v => { setConfirmPassword(v); setError(null); }}
            show={showConfirm}
            onToggleShow={() => setShowConfirm(v => !v)}
            placeholder="Digite a nova senha novamente"
          />

          {/* Indicador match */}
          {confirmPassword.length > 0 && (
            <div className={cn(
              "flex items-center gap-2 text-xs",
              passwordsMatch ? "text-emerald-400" : "text-red-400"
            )}>
              {passwordsMatch
                ? <><CheckCircle2 className="h-3.5 w-3.5" /> As senhas coincidem</>
                : <><XCircle      className="h-3.5 w-3.5" /> As senhas não coincidem</>
              }
            </div>
          )}

          {/* Erro */}
          {error && (
            <p className="text-sm text-red-400 font-medium">{error}</p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !currentPassword.trim() || !allRulesOk || !passwordsMatch}
            className="bg-gradient-ember text-primary-foreground"
          >
            {saving
              ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Salvando...</>
              : "Salvar Nova Senha"
            }
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

      <ChangePasswordDialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog} />
    </header>
  );
}
