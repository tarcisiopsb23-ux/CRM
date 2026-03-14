import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useOrganization } from "@/hooks/useOrganization";
import { getJobTitleOptions } from "@/lib/jobTitles";
import { useJobTitleCatalog } from "@/hooks/useJobTitleCatalog";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "";

interface AddCollaboratorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function AddCollaboratorModal({
  open,
  onOpenChange,
  onSuccess,
}: AddCollaboratorModalProps) {
  const organizationId = useOrganization();
  const catalog = useJobTitleCatalog(organizationId);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const jobTitleOptions = useMemo(() => {
    const catalogTitles = (catalog.data ?? []).map((r) => r.job_title);
    return getJobTitleOptions({ extra: catalogTitles, includeDefaults: false });
  }, [catalog.data]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setError("Informe um e-mail válido");
      return;
    }
    if (!password || password.length < 6) {
      setError("Senha deve ter no mínimo 6 caracteres");
      return;
    }
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Sessão expirada. Faça login novamente.");

      const res = await fetch(`${SUPABASE_URL}/functions/v1/create-user-direct`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: trimmedEmail,
          password,
          full_name: fullName.trim() || trimmedEmail.split("@")[0],
          job_title: jobTitle || undefined,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };

      if (!res.ok) {
        const errMsg = data?.error ?? data?.message;
        throw new Error(errMsg || `Erro ${res.status}: ${res.statusText}`);
      }

      setEmail("");
      setFullName("");
      setPassword("");
      setJobTitle("");
      onOpenChange(false);
      onSuccess?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao cadastrar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar Colaborador</DialogTitle>
          <DialogDescription>
            Cadastre um novo usuário com acesso direto ao CRM. O colaborador poderá fazer login imediatamente.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="email">E-mail *</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colaborador@exemplo.com"
              required
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="fullName">Nome completo</Label>
            <Input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Nome do colaborador"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="password">Senha *</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              required
              minLength={6}
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Informe ao colaborador a senha escolhida para ele acessar.
            </p>
          </div>
          <div>
            <Label>Cargo</Label>
            <Input
              className="mt-1"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="Ex: Analista de Marketing"
              list="job_title_options"
            />
            <datalist id="job_title_options">
              {jobTitleOptions.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>
          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cadastrando...
                </>
              ) : (
                "Cadastrar"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
