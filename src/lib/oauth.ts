/**
 * oauth.ts — helpers OAuth Meta para o CRM
 *
 * Inicia o fluxo OAuth do Meta para conexão de canais.
 * O META_APP_ID é gerenciado pelo servidor — nunca exposto ao cliente final.
 */

const META_SCOPES = [
  "pages_show_list",
  "pages_messaging",
  "instagram_manage_messages",
  "instagram_basic",
  "ads_read",
  "ads_management",
  "read_insights",
  "business_management",
  "whatsapp_business_management",
  "whatsapp_business_messaging",
].join(",");

/** Inicia o fluxo OAuth Meta. Redireciona para o Facebook dialog. */
export function initiateMetaOAuth(clientId: string, slug: string) {
  const metaAppId = import.meta.env.VITE_META_APP_ID as string | undefined;
  if (!metaAppId) {
    throw new Error(
      "Conexão com Meta não configurada. Contate o administrador."
    );
  }

  const redirectUri = `${window.location.origin}/oauth/callback`;
  const state = btoa(JSON.stringify({ provider: "meta", clientId, slug }));

  const params = new URLSearchParams({
    client_id:     metaAppId,
    redirect_uri:  redirectUri,
    scope:         META_SCOPES,
    response_type: "code",
    state,
  });

  window.location.href = `https://www.facebook.com/v19.0/dialog/oauth?${params}`;
}
