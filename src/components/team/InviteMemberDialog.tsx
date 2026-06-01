import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { useOrganization } from "@/hooks/useOrganization";
import { cn } from "@/lib/utils";
import { Copy, Check, Mail, Link as LinkIcon } from "lucide-react";
import { logger } from "@/lib/logger";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "";

interface InviteMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMode?: "email" | "link";
}

export function InviteMemberDialog({ open, onOpenChange, initialMode = "email" }: InviteMemberDialogProps) {
  const organizationId = useOrganization();
  const [mode, setMode] = useState<"email" | "link">(initialMode);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [codeLoading, setCodeLoading] = useState(false);
  const [registrationLink, setRegistrationLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleGenerateLink() {
    if (!organizationId) {
      setError("Nenhuma organização encontrada.");
      return;
    }
    setError(null);
    setSuccess(null);
    setRegistrationLink(null);
    setCodeLoading(true);
    try {
      const { data, error: err } = await supabase.rpc("generate_registration_code", {
        org_id: organizationId,
        validity_hours: 72,
      });
      if (err) throw err;
      const code = data as string;
      const link = `${window.location.origin}/complete-registration?code=${encodeURIComponent(code)}`;
      setRegistrationLink(link);
      setSuccess("Link gerado! Compartilhe com a pessoa para ela se cadastrar (válido por 72h).");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao gerar link");
    } finally {
      setCodeLoading(false);
    }
  }

  async function handleCopyLink() {
    if (!registrationLink) return;
    await navigator.clipboard.writeText(registrationLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleInvite() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes("@")) {
      setError("Informe um e-mail válido");
      return;
    }
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      if (!token) throw new Error("Sessão expirada. Faça login novamente.");

      const fnUrl = `${SUPABASE_URL}/functions/v1/invite-by-email`;
      
      const res = await fetch(fnUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
          "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY ?? ""
        },
        body: JSON.stringify({ email: trimmed }),
      });

      let data;
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        data = await res.json();
      } else {
        const text = await res.text();
        throw new Error(text || `Erro do servidor (${res.status})`);
      }

      if (data.success === false) {
        // Se falhou no e-mail mas criou o token, avisamos o usuário e mostramos o link
        setSuccess(data.message);
        // Log seguro sem expor link completo em produção
        logger.warn("Link de convite manual gerado", { hasLink: !!data.link }, 'TEAM');
        if (data.link) {
          setError(`Você pode copiar este link manualmente para o convidado: ${data.link}`);
        }
        return;
      }

      setSuccess(data.message ?? "Convite enviado por e-mail!");
      setEmail("");
      
      setTimeout(() => {
        onOpenChange(false);
        setSuccess(null);
      }, 2000);

    } catch (e) {
      logger.error("Erro ao enviar convite", { 
        error: e instanceof Error ? e.message : "Erro desconhecido",
        type: e instanceof Error ? e.constructor.name : 'Unknown'
      }, 'TEAM');
      const msg = e instanceof Error ? e.message : "Erro ao enviar convite";
      
      if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
        setError("Erro de rede. Verifique se extensões de navegador (como Blur ou AdBlock) estão bloqueando a requisição.");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Convidar Colaborador</DialogTitle>
          <DialogDescription>
            Escolha como deseja convidar o novo membro para sua equipe.
          </DialogDescription>
        </DialogHeader>

        <div className="flex p-1 bg-muted rounded-lg mb-4">
          <button
            onClick={() => { setMode("email"); setError(null); setSuccess(null); }}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-1.5 text-sm font-medium rounded-md transition-all",
              mode === "email" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Mail className="h-4 w-4" />
            E-mail
          </button>
          <button
            onClick={() => { setMode("link"); setError(null); setSuccess(null); }}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-1.5 text-sm font-medium rounded-md transition-all",
              mode === "link" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <LinkIcon className="h-4 w-4" />
            Link Manual
          </button>
        </div>

        <div className="space-y-4 py-2">
          {mode === "email" ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  E-mail do convidado
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="convidado@exemplo.com"
                  className={cn(
                    "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  )}
                />
              </div>
              <Button 
                onClick={handleInvite} 
                className="w-full"
                disabled={loading || !email.trim()}
              >
                {loading ? "Enviando..." : "Enviar convite por e-mail"}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Gere um link para compartilhar via WhatsApp ou outro canal. Válido por 72h.
              </p>
              {!registrationLink ? (
                <Button
                  variant="outline"
                  onClick={handleGenerateLink}
                  className="w-full"
                  disabled={codeLoading || !organizationId}
                >
                  {codeLoading ? "Gerando..." : "Gerar link de cadastro"}
                </Button>
              ) : (
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={registrationLink}
                    className={cn(
                      "flex-1 h-10 px-3 py-2 rounded-md border border-input bg-muted text-sm"
                    )}
                  />
                  <Button variant="secondary" size="icon" onClick={handleCopyLink}>
                    {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
              {error}
            </div>
          )}
          {success && (
            <div className="p-3 text-sm text-green-600 bg-green-50 rounded-md">
              {success}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
