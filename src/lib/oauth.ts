/**
 * OAuth helpers for Google and Meta integrations.
 *
 * Os client_id/app_id são configurados por tenant no metadata da tabela clients.
 * Não dependem mais de variáveis de ambiente — cada cliente configura o seu.
 *
 * Flow:
 *   1. Client clicks "Conectar Google/Meta" → redirected to provider OAuth page
 *   2. Provider redirects back to /oauth/callback?provider=google&code=...
 *   3. OAuthCallbackPage exchanges code for tokens via Supabase Edge Function
 *   4. Tokens stored in oauth_tokens table
 *   5. Dashboard reads data using stored tokens
 */

// Fallback para variáveis de ambiente (compatibilidade retroativa)
const ENV_GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";
const ENV_META_APP_ID      = import.meta.env.VITE_META_APP_ID      ?? "";

const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/adwords",
].join(" ");

const META_SCOPES = [
  "ads_read",
  "ads_management",
  "read_insights",
].join(",");

export function initiateGoogleOAuth(clientId: string, googleClientId?: string) {
  const resolvedClientId = googleClientId || ENV_GOOGLE_CLIENT_ID;
  if (!resolvedClientId) {
    throw new Error("Google Client ID não configurado. Adicione-o nas configurações de integrações.");
  }
  const redirectUri = `${window.location.origin}/oauth/callback`;
  const state = btoa(JSON.stringify({ provider: "google", clientId }));

  const params = new URLSearchParams({
    client_id:     resolvedClientId,
    redirect_uri:  redirectUri,
    response_type: "code",
    scope:         GOOGLE_SCOPES,
    access_type:   "offline",
    prompt:        "consent",
    state,
  });

  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export function initiateMetaOAuth(clientId: string, metaAppId?: string) {
  const resolvedAppId = metaAppId || ENV_META_APP_ID;
  if (!resolvedAppId) {
    throw new Error("Meta App ID não configurado. Adicione-o nas configurações de integrações.");
  }
  const redirectUri = `${window.location.origin}/oauth/callback`;
  const state = btoa(JSON.stringify({ provider: "meta", clientId }));

  const params = new URLSearchParams({
    client_id:     resolvedAppId,
    redirect_uri:  redirectUri,
    scope:         META_SCOPES,
    response_type: "code",
    state,
  });

  window.location.href = `https://www.facebook.com/v19.0/dialog/oauth?${params}`;
}

export function isGoogleConfigured(googleClientId?: string) {
  return !!(googleClientId || ENV_GOOGLE_CLIENT_ID);
}

export function isMetaConfigured(metaAppId?: string) {
  return !!(metaAppId || ENV_META_APP_ID);
}
