import { useState } from "react";
import { SettingsSection } from "./SettingsSection";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { useOrganization } from "@/hooks/useOrganization";
import { cn } from "@/lib/utils";
import { Copy, Check, Mail } from "lucide-react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "";

export function InviteByEmailSection() {
  const organizationId = useOrganization();
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
      console.log("Chamando Edge Function em:", fnUrl);
      
      const res = await fetch(fnUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
          "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY ?? ""
        },
        body: JSON.stringify({ email: trimmed }),
      }).catch(err => {
        console.error("Erro no fetch da Edge Function:", err);
        throw new Error(`Falha na rede (Failed to fetch). Verifique se a Edge Function 'invite-by-email' foi implantada no Supabase e se o CORS está configurado corretamente.`);
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Erro ao enviar convite");
      }

      setSuccess(data.message ?? "Convite enviado por e-mail!");
      setEmail("");
      if (data.link) {
        setSuccess("Token criado. Link para copiar: " + data.link);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao enviar convite");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <SettingsSection
        title="Convidar por e-mail"
        description="Informe o e-mail da pessoa. Ela receberá um link por e-mail para completar o cadastro."
        icon={<Mail className="h-5 w-5" />}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              E-mail do convidado
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="convidado@exemplo.com"
              className={cn(
                "w-full px-3 py-2 rounded-md border border-gray-300",
                "focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              )}
            />
          </div>
          <Button onClick={handleInvite} disabled={loading || !email.trim()}>
            {loading ? "Enviando..." : "Enviar convite por e-mail"}
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Registrar manualmente (sem e-mail)"
        description="Gere um link para compartilhar via WhatsApp ou outro canal. A pessoa acessa e se cadastra com o código."
      >
        <div className="space-y-4">
          <Button
            variant="outline"
            onClick={handleGenerateLink}
            disabled={codeLoading || !organizationId}
          >
            {codeLoading ? "Gerando..." : "Gerar link de cadastro"}
          </Button>
          {registrationLink && (
            <div className="flex gap-2">
              <input
                readOnly
                value={registrationLink}
                className={cn(
                  "flex-1 px-3 py-2 rounded-md border border-gray-300 bg-gray-50 text-sm"
                )}
              />
              <Button variant="secondary" size="icon" onClick={handleCopyLink}>
                {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          )}
          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>
          )}
          {success && (
            <p className="text-sm text-green-600 bg-green-50 px-3 py-2 rounded">{success}</p>
          )}
        </div>
      </SettingsSection>
    </div>
  );
}
