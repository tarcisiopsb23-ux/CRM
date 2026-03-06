import { useState } from "react";
import { SettingsSection } from "./SettingsSection";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "";

export function InviteByEmailSection() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email: trimmed }),
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
    <SettingsSection
      title="Convidar por e-mail"
      description="Informe o e-mail da pessoa. Ela receberá um link por e-mail para completar o cadastro em até 24 horas."
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
          {loading ? "Enviando..." : "Enviar convite"}
        </Button>
        {error && (
          <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">
            {error}
          </p>
        )}
        {success && (
          <p className="text-sm text-green-600 bg-green-50 px-3 py-2 rounded">
            {success}
          </p>
        )}
      </div>
    </SettingsSection>
  );
}
