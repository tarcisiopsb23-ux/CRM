import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { initiateGoogleOAuth, initiateMetaOAuth, isGoogleConfigured, isMetaConfigured } from "@/lib/oauth";
import { useOAuthTokens } from "@/hooks/useOAuthTokens";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2, XCircle, ExternalLink } from "lucide-react";

interface Props {
  clientId: string;
}

function ConnectButton({ onClick, disabled, children }: {
  onClick: () => void; disabled?: boolean; children: React.ReactNode;
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-sm font-bold transition-colors disabled:opacity-50 disabled:pointer-events-none">
      {children}
    </button>
  );
}

function DisconnectButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-red-900/30 hover:bg-red-900/50 text-red-400 text-xs font-bold transition-colors disabled:opacity-50">
      <XCircle className="h-3 w-3" /> Desconectar
    </button>
  );
}

export function OAuthIntegrations({ clientId }: Props) {
  const { googleToken, metaToken, updateConfig, disconnect } = useOAuthTokens(clientId);
  const [ga4Id, setGa4Id] = useState(googleToken?.ga4_property_id ?? "");
  const [gadsId, setGadsId] = useState(googleToken?.gads_customer_id ?? "");
  const [metaAccountId, setMetaAccountId] = useState(metaToken?.meta_ad_account_id ?? "");
  const [savingGoogle, setSavingGoogle] = useState(false);
  const [savingMeta, setSavingMeta] = useState(false);

  const googleConnected = !!googleToken;
  const metaConnected = !!metaToken;

  const handleSaveGoogleConfig = async () => {
    setSavingGoogle(true);
    try {
      await updateConfig.mutateAsync({
        provider: "google",
        ga4_property_id: ga4Id.trim() || undefined,
        gads_customer_id: gadsId.trim() || undefined,
      });
      toast.success("Configuração do Google salva!");
    } catch {
      toast.error("Erro ao salvar configuração do Google.");
    } finally {
      setSavingGoogle(false);
    }
  };

  const handleSaveMetaConfig = async () => {
    setSavingMeta(true);
    try {
      await updateConfig.mutateAsync({
        provider: "meta",
        meta_ad_account_id: metaAccountId.trim() || undefined,
      });
      toast.success("Configuração do Meta salva!");
    } catch {
      toast.error("Erro ao salvar configuração do Meta.");
    } finally {
      setSavingMeta(false);
    }
  };

  const handleDisconnect = async (provider: "google" | "meta") => {
    try {
      await disconnect.mutateAsync(provider);
      toast.success(`${provider === "google" ? "Google" : "Meta"} desconectado.`);
    } catch {
      toast.error("Erro ao desconectar.");
    }
  };

  return (
    <div className="space-y-4">
      {/* Google */}
      <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <div>
              <p className="text-slate-200 font-bold text-sm">Google Analytics 4 + Google Ads</p>
              <p className="text-slate-500 text-xs">Sessões, conversões, gastos e campanhas do Google</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {googleConnected
              ? <span className="flex items-center gap-1 text-xs font-bold text-emerald-400"><CheckCircle2 className="h-3 w-3" /> Conectado</span>
              : <span className="text-xs text-slate-500">Não conectado</span>
            }
          </div>
        </div>

        {!isGoogleConfigured() && (
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-400">
            Configure <code className="font-mono">VITE_GOOGLE_CLIENT_ID</code> no .env para habilitar a conexão com Google.
          </div>
        )}

        {!googleConnected ? (
          <ConnectButton onClick={() => initiateGoogleOAuth(clientId)} disabled={!isGoogleConfigured()}>
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/></svg>
            Conectar com Google
          </ConnectButton>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-slate-400 text-xs">GA4 Property ID</Label>
                <Input value={ga4Id} onChange={e => setGa4Id(e.target.value)}
                  placeholder="properties/123456789"
                  className="bg-slate-900/50 border-slate-700 text-white h-9 font-mono text-xs" />
                <p className="text-[10px] text-slate-600">Encontre em GA4 → Admin → Property Settings</p>
              </div>
              <div className="space-y-1">
                <Label className="text-slate-400 text-xs">Google Ads Customer ID</Label>
                <Input value={gadsId} onChange={e => setGadsId(e.target.value)}
                  placeholder="123-456-7890"
                  className="bg-slate-900/50 border-slate-700 text-white h-9 font-mono text-xs" />
                <p className="text-[10px] text-slate-600">Encontre no Google Ads → canto superior direito</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleSaveGoogleConfig} disabled={savingGoogle}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors disabled:opacity-50">
                {savingGoogle ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                Salvar configuração
              </button>
              <DisconnectButton onClick={() => handleDisconnect("google")} />
            </div>
          </div>
        )}
      </div>

      {/* Meta */}
      <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="#1877F2">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
            <div>
              <p className="text-slate-200 font-bold text-sm">Meta Ads (Facebook/Instagram)</p>
              <p className="text-slate-500 text-xs">Gastos, impressões, leads e ROAS das campanhas Meta</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {metaConnected
              ? <span className="flex items-center gap-1 text-xs font-bold text-emerald-400"><CheckCircle2 className="h-3 w-3" /> Conectado</span>
              : <span className="text-xs text-slate-500">Não conectado</span>
            }
          </div>
        </div>

        {!isMetaConfigured() && (
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-400">
            Configure <code className="font-mono">VITE_META_APP_ID</code> no .env para habilitar a conexão com Meta.
          </div>
        )}

        {!metaConnected ? (
          <ConnectButton onClick={() => initiateMetaOAuth(clientId)} disabled={!isMetaConfigured()}>
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
            Conectar com Meta
          </ConnectButton>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-slate-400 text-xs">Meta Ad Account ID</Label>
              <Input value={metaAccountId} onChange={e => setMetaAccountId(e.target.value)}
                placeholder="act_123456789"
                className="bg-slate-900/50 border-slate-700 text-white h-9 font-mono text-xs" />
              <p className="text-[10px] text-slate-600">
                Encontre no Meta Ads Manager → canto superior esquerdo (formato: act_XXXXXXXXX)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleSaveMetaConfig} disabled={savingMeta}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors disabled:opacity-50">
                {savingMeta ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                Salvar configuração
              </button>
              <DisconnectButton onClick={() => handleDisconnect("meta")} />
            </div>
          </div>
        )}
      </div>

      {/* Info sobre Edge Functions */}
      <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-3 text-xs text-slate-500 space-y-1">
        <p className="font-bold text-slate-400">Como funciona:</p>
        <p>• Os tokens OAuth são armazenados com segurança no banco de dados</p>
        <p>• As chamadas às APIs do Google e Meta são feitas pelo servidor (Supabase Edge Functions)</p>
        <p>• Os dados aparecem automaticamente no dashboard de performance após a conexão</p>
        <p className="flex items-center gap-1 mt-2">
          <ExternalLink className="h-3 w-3" />
          <a href="https://supabase.com/docs/guides/functions" target="_blank" rel="noopener noreferrer"
            className="text-violet-400 hover:underline">
            Documentação das Edge Functions
          </a>
        </p>
      </div>
    </div>
  );
}
