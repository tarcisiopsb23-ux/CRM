/**
 * OAuth helpers — Google e Meta Ads
 *
 * Os App IDs e Secrets ficam EXCLUSIVAMENTE nos Secrets das Edge Functions
 * (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, META_APP_ID, META_APP_SECRET).
 *
 * O cliente nunca ve nem configura esses valores.
 * As funcoes abaixo apenas iniciam o redirect OAuth para o provedor.
 *
 * Fluxo:
 *   1. Cliente clica "Conectar" → redirect para o provedor (Google/Meta)
 *   2. Provedor redireciona de volta para /oauth/callback?code=...&state=...
 *   3. OAuthCallbackPage chama a Edge Function oauth-exchange
 *   4. Edge Function troca o codigo por tokens usando os secrets do servidor
 *   5. Tokens salvos em oauth_tokens (nunca expostos ao frontend)
 */

// Scopes necessarios para leitura de metricas de campanhas
const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/adwords",
].join(" ");

const META_SCOPES = [
  "ads_read",
  "ads_management",
  "read_insights",
].join(",");

/**
 * Inicia o fluxo OAuth com o Google.
 * O GOOGLE_CLIENT_ID e gerenciado pelo servidor — nao precisa de configuracao do cliente.
 */
export function initiateGoogleOAuth(clientId: string, slug: string) {
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;
  if (!googleClientId) {
    throw new Error(
      "Conexao com Google nao configurada. Contate a agencia para habilitar esta integracao."
    );
  }

  const redirectUri = `${window.location.origin}/oauth/callback`;
  const state = btoa(JSON.stringify({ provider: "google", clientId, slug }));

  const params = new URLSearchParams({
    client_id:     googleClientId,
    redirect_uri:  redirectUri,
    response_type: "code",
    scope:         GOOGLE_SCOPES,
    access_type:   "offline",
    prompt:        "consent",
    state,
  });

  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

/**
 * Inicia o fluxo OAuth com o Meta (Facebook/Instagram).
 * O META_APP_ID e gerenciado pelo servidor — nao precisa de configuracao do cliente.
 */
export function initiateMetaOAuth(clientId: string, slug: string) {
  const metaAppId = import.meta.env.VITE_META_APP_ID as string;
  if (!metaAppId) {
    throw new Error(
      "Conexao com Meta nao configurada. Contate a agencia para habilitar esta integracao."
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

// Helpers de verificacao — usados apenas internamente
export function isGoogleConfigured(): boolean {
  return !!(import.meta.env.VITE_GOOGLE_CLIENT_ID as string);
}

export function isMetaConfigured(): boolean {
  return !!(import.meta.env.VITE_META_APP_ID as string);
}
