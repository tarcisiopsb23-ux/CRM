import { useEffect, useMemo, useState } from "react";
import { Bell, LogOut, Search, Timer, User, Lock, Camera } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { supabase } from "@/lib/supabase";
import { useRegisterPunch, useTimeClockState, type RepPPunchType } from "@/hooks/useTimeClock";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function AppHeader() {
  const { profile, signOut, refetchProfile } = useAuth();
  const navigate = useNavigate();
  const clockState = useTimeClockState();
  const registerPunch = useRegisterPunch();
  const [exitOpen, setExitOpen] = useState(false);
  const [exitType, setExitType] = useState<RepPPunchType>("saida_final");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lateBreakAck, setLateBreakAck] = useState(false);
  const [lastAlertShown, setLastAlertShown] = useState<string | null>(null);

  // Profile Edit States
  const [profileOpen, setProfileOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || "");
      setDisplayName((profile.metadata?.display_name as string) || "");
    }
  }, [profile, profileOpen]);

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate("/login", { replace: true });
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  const initials = profile?.full_name
    ?.split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() ?? "?";

  const avatarUrl = useMemo(() => {
    if (!profile?.avatar_url) return null;
    // Adiciona um timestamp para evitar cache de imagem antiga se necessário, 
    // mas o problema do 400 é provavelmente permissão no bucket 'avatars'
    return profile.avatar_url;
  }, [profile?.avatar_url]);

  const canShowExit = useMemo(() => {
    if (!profile?.email) return false;
    if (clockState.data?.has_final_exit) return false;
    return true;
  }, [clockState.data?.has_final_exit, profile?.email]);

  const exitOptions = useMemo(() => {
    const allowed = new Set(clockState.data?.next_allowed ?? []);
    const items: Array<{ value: RepPPunchType; label: string; disabled: boolean }> = [
      { value: "saida_intervalo", label: "Saída para intervalo", disabled: !allowed.has("saida_intervalo") },
      { value: "saida_final", label: "Saída final", disabled: !allowed.has("saida_final") },
    ];
    const firstAllowed = items.find((i) => !i.disabled)?.value;
    return { items, firstAllowed };
  }, [clockState.data?.next_allowed]);

  const openExit = () => {
    setError(null);
    setPassword("");
    setLateBreakAck(false);
    setExitType(exitOptions.firstAllowed ?? "saida_final");
    setExitOpen(true);
  };

  useEffect(() => {
    const alerts = clockState.data?.alerts ?? [];
    const next = alerts[0] ?? null;
    if (!next) return;
    if (next === lastAlertShown) return;
    setLastAlertShown(next);
    toast(next);
  }, [clockState.data?.alerts, lastAlertShown]);

  const confirmPassword = async () => {
    if (!profile?.email) throw new Error("Usuário sem e-mail");
    const { error: err } = await supabase.auth.signInWithPassword({ email: profile.email, password });
    if (err) throw err;
  };

  const submitExit = async () => {
    try {
      setError(null);
      if (!password.trim()) {
        setError("Informe sua senha para confirmar.");
        return;
      }
      await confirmPassword();
      await registerPunch.mutateAsync({ type: exitType, ackLateBreak: lateBreakAck });
      setExitOpen(false);
      toast.success("Marcação registrada");
      if (exitType === "saida_final") {
        navigate("/timeclock/locked", { replace: true });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro ao registrar";
      if (msg.toLowerCase().includes("6h30") || msg.toLowerCase().includes("confirma")) {
        setError("Intervalo após 6h30. Confirme novamente para prosseguir.");
        setLateBreakAck(true);
        return;
      }
      setError(msg);
    }
  };

  const handleUpdateProfile = async () => {
    if (!profile) return;
    try {
      setUploading(true);
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName,
          metadata: {
            ...profile.metadata,
            display_name: displayName,
          },
        })
        .eq("id", profile.id);

      if (error) throw error;
      await refetchProfile();
      setProfileOpen(false);
      toast.success("Perfil atualizado com sucesso");
    } catch (err: any) {
      toast.error(err.message || "Erro ao atualizar perfil");
    } finally {
      setUploading(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (newPassword !== confirmNewPassword) {
      toast.error("As senhas não coincidem");
      return;
    }
    try {
      setUploading(true);
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setPasswordOpen(false);
      setNewPassword("");
      setConfirmNewPassword("");
      toast.success("Senha alterada com sucesso");
    } catch (err: any) {
      toast.error(err.message || "Erro ao alterar senha");
    } finally {
      setUploading(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    try {
      setUploading(true);
      const fileExt = file.name.split(".").pop();
      // O bucket 'avatars' DEVE ser público no Supabase para que getPublicUrl funcione.
      const timestamp = new Date().getTime();
      const filePath = `${profile.id}/${timestamp}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", profile.id);

      if (updateError) throw updateError;
      
      await refetchProfile();
      toast.success("Foto atualizada com sucesso");
    } catch (err: any) {
      console.error("Erro no upload:", err);
      if (err.message === "Bucket not found" || err.error === "Bucket not found") {
        toast.error("Configuração pendente: O bucket 'avatars' não foi encontrado no Supabase. Verifique a migração SQL.");
      } else {
        toast.error(err.message || "Erro ao fazer upload da foto");
      }
    } finally {
      setUploading(false);
    }
  };

  const removeAvatar = async () => {
    if (!profile) return;
    try {
      setUploading(true);
      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: null })
        .eq("id", profile.id);
      
      if (error) throw error;
      await refetchProfile();
      toast.success("Foto removida");
    } catch (err: any) {
      toast.error(err.message || "Erro ao remover foto");
    } finally {
      setUploading(false);
    }
  };

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-card px-6">
      <div className="flex items-center gap-3 flex-1 max-w-md">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar leads, clientes, projetos..."
          className="border-0 bg-muted/50 focus-visible:ring-1 focus-visible:ring-primary"
        />
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
          <Bell className="h-5 w-5" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full overflow-hidden">
              <Avatar className="h-9 w-9">
                <AvatarImage src={avatarUrl || ""} alt={profile?.full_name} />
                <AvatarFallback className="gradient-primary text-primary-foreground font-medium text-sm">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-2 py-1.5 text-sm">
              <p className="font-medium">{profile?.full_name ?? "Usuário"}</p>
              <p className="text-xs text-muted-foreground">{profile?.role}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setProfileOpen(true)}>
              <User className="h-4 w-4 mr-2" />
              Meu Perfil
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setPasswordOpen(true)}>
              <Lock className="h-4 w-4 mr-2" />
              Alterar Senha
            </DropdownMenuItem>
            {canShowExit && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    openExit();
                  }}
                >
                  <Timer className="h-4 w-4 mr-2" />
                  Registrar saída do ponto
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                handleSignOut();
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Dialog: Perfil */}
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Perfil</DialogTitle>
            <DialogDescription>
              Altere suas informações de perfil e foto aqui. Clique em salvar quando terminar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex flex-col items-center gap-4">
              <div className="relative group">
                <Avatar className="h-24 w-24">
                  <AvatarImage src={avatarUrl || ""} alt={profile?.full_name} />
                  <AvatarFallback className="text-2xl gradient-primary text-primary-foreground">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <label className="absolute inset-0 flex items-center justify-center bg-black/40 text-white rounded-full opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                  <Camera className="h-6 w-6" />
                  <input type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload} disabled={uploading} />
                </label>
              </div>
              {avatarUrl && (
                <Button variant="ghost" size="sm" onClick={removeAvatar} disabled={uploading} className="text-destructive h-7">
                  Remover foto
                </Button>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="full_name">Nome completo</Label>
              <Input id="full_name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="display_name">Nome de exibição</Label>
              <Input id="display_name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
              <p className="text-[10px] text-muted-foreground">Como seu nome aparece para os outros usuários.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProfileOpen(false)}>Cancelar</Button>
            <Button onClick={handleUpdateProfile} disabled={uploading}>
              {uploading ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Senha */}
      <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar Senha</DialogTitle>
            <DialogDescription>
              Digite sua nova senha abaixo. Use pelo menos 6 caracteres.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new_password">Nova senha</Label>
              <Input id="new_password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm_password">Confirmar nova senha</Label>
              <Input id="confirm_password" type="password" value={confirmNewPassword} onChange={(e) => setConfirmNewPassword(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordOpen(false)}>Cancelar</Button>
            <Button onClick={handleUpdatePassword} disabled={uploading}>
              {uploading ? "Alterando..." : "Alterar Senha"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={exitOpen} onOpenChange={setExitOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar saída do ponto</DialogTitle>
            <DialogDescription>
              Selecione o tipo de saída e informe sua senha para confirmar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Tipo de saída</Label>
              <Select value={exitType} onValueChange={(v) => setExitType(v as RepPPunchType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {exitOptions.items.map((i) => (
                    <SelectItem key={i.value} value={i.value} disabled={i.disabled}>
                      {i.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="exit_password">Senha</Label>
              <Input
                id="exit_password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            {error && (
              <div className="text-sm text-destructive">
                {error}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExitOpen(false)} disabled={registerPunch.isPending}>
              Cancelar
            </Button>
            <Button onClick={submitExit} disabled={registerPunch.isPending}>
              {registerPunch.isPending ? "Registrando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
}
