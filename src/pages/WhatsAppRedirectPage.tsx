import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";

/**
 * Landing page intermediária para atribuição de campanhas.
 *
 * Fluxo:
 *   Anúncio (Google/Facebook)
 *     → /wa?to=5511999999&utm_source=google&utm_campaign=nome&cid=CLIENT_ID
 *     → captura UTMs, dispara pixel, salva ad_click_session
 *     → redireciona para wa.me em ~300ms (imperceptível ao usuário)
 *
 * Parâmetros esperados na URL:
 *   to          — número do WhatsApp destino (obrigatório)
 *   cid         — client_id do parceiro (obrigatório para salvar no banco)
 *   utm_source  — google | facebook | etc
 *   utm_medium  — cpc | paid | etc
 *   utm_campaign — nome da campanha
 *   utm_content  — variação do anúncio
 *   utm_term     — palavra-chave
 *   msg         — mensagem pré-preenchida (opcional)
 */
export function WhatsAppRedirectPage() {
  const [params] = useSearchParams();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;

    const to          = params.get("to") ?? "";
    const clientId    = params.get("cid") ?? "";
    const utmSource   = params.get("utm_source") ?? null;
    const utmMedium   = params.get("utm_medium") ?? null;
    const utmCampaign = params.get("utm_campaign") ?? null;
    const utmContent  = params.get("utm_content") ?? null;
    const utmTerm     = params.get("utm_term") ?? null;
    const msg         = params.get("msg") ?? "";

    // Monta URL do WhatsApp
    const waUrl = msg
      ? `https://wa.me/${to}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/${to}`;

    // 1. Dispara pixel do Meta (Lead) se fbq estiver disponível
    try {
      window.fbq?.("track", "Lead", {
        content_name: utmCampaign ?? "whatsapp-click",
        content_category: utmSource ?? "whatsapp",
      });
    } catch { /* silencioso */ }

    // 2. Dispara evento GTM
    try {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({
        event: "whatsapp_click",
        utm_source: utmSource,
        utm_campaign: utmCampaign,
      });
    } catch { /* silencioso */ }

    // 3. Salva clique no banco (fire-and-forget, não bloqueia o redirect)
    if (clientId && to) {
      supabase.from("ad_click_sessions").insert({
        client_id:       clientId,
        utm_source:      utmSource,
        utm_medium:      utmMedium,
        utm_campaign:    utmCampaign,
        utm_content:     utmContent,
        utm_term:        utmTerm,
        whatsapp_number: to,
      }).then(); // não aguarda — redirect já acontece abaixo
    }

    // 4. Redireciona imediatamente
    window.location.href = waUrl;
  }, [params]);

  // Tela em branco com fallback visual mínimo
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#0a0a0a" }}>
      <p style={{ color: "#ffffff40", fontSize: 13, fontFamily: "monospace" }}>Redirecionando...</p>
    </div>
  );
}
