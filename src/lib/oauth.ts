/**
 * OAuth helpers for Google and Meta integrations.
 *
 * Flow:
 *   1. Client clicks "Conectar Google/Meta" → redirected to provider OAuth page
 *   2. Provider redirects back to /oauth/callback?provider=google&code=...
 *   3. OAuthCallbackPage exchanges code for tokens via Supabase Edge Function (or direct API)
 *   4. Tokens stored in oauth_tokens table
 *   5. Dashboard reads data using stored tokens
 *
 * NOTE: Token exchange MUST happen server-side to protect client_secret.
 * This file handles the client-side redirect initiation only.
 */

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";
const META_APP_ID = import.meta.env.VITE_META_APP_ID ?? "";

// Scopes needed for GA4 + Google Ads read access
const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/adwords",
].join(" ");

// Scopes needed for Meta Ads Insights read access
const META_SCOPES = [
  "ads_read",
  "ads_management",
  "read_insights",
].join(",");

export function initiateGoogleOAuth(clientId: string) {
  const redirectUri = `${window.location.origin}/oauth/callback`;
  const state = btoa(JSON.stringify({ provider: "google", clientId }));

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
  });

  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export function initiateMetaOAuth(clientId: string) {
  const redirectUri = `${window.location.origin}/oauth/callback`;
  const state = btoa(JSON.stringify({ provider: "meta", clientId }));

  const params = new URLSearchParams({
    client_id: META_APP_ID,
    redirect_uri: redirectUri,
    scope: META_SCOPES,
    response_type: "code",
    state,
  });

  window.location.href = `https://www.facebook.com/v19.0/dialog/oauth?${params}`;
}

export function isGoogleConfigured() {
  return !!GOOGLE_CLIENT_ID;
}

export function isMetaConfigured() {
  return !!META_APP_ID;
}
