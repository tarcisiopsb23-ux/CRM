/**
 * Shared JWT utilities for Edge Functions.
 * Centralizes token parsing and validation to avoid duplication.
 */

export interface JwtPayload {
  sub?: string;
  tenant_id?: string | null;
  role?: string;
  exp?: number;
  iat?: number;
  [key: string]: unknown;
}

/**
 * Decodes a JWT payload WITHOUT verifying the signature.
 * Use only when the JWT has already been validated by Supabase RLS
 * or when you will call verifyJwt() separately.
 */
export function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    return JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

/**
 * Extracts tenant_id from the Authorization header JWT.
 * Returns null if the header is missing, malformed, or has no tenant_id.
 */
export function getTenantIdFromRequest(req: Request): string | null {
  const token = extractBearerToken(req);
  if (!token) return null;
  const payload = decodeJwtPayload(token);
  return payload?.tenant_id ?? null;
}

/**
 * Extracts the full JWT payload from the Authorization header.
 */
export function getPayloadFromRequest(req: Request): JwtPayload | null {
  const token = extractBearerToken(req);
  if (!token) return null;
  return decodeJwtPayload(token);
}

/**
 * Extracts the raw Bearer token from the Authorization header.
 */
export function extractBearerToken(req: Request): string | null {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return token || null;
}

/**
 * Verifies a JWT signature using HMAC-SHA256.
 * Throws if the token is invalid or expired.
 */
export async function verifyJwt(token: string, secret: string): Promise<JwtPayload> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("JWT malformado");

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const sig = Uint8Array.from(
    atob(parts[2].replace(/-/g, "+").replace(/_/g, "/")),
    (c) => c.charCodeAt(0)
  );

  const valid = await crypto.subtle.verify("HMAC", key, sig, data);
  if (!valid) throw new Error("Assinatura JWT inválida");

  const payload = decodeJwtPayload(token);
  if (!payload) throw new Error("Payload JWT inválido");

  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("JWT expirado");
  }

  return payload;
}

/** Simple UUID v4 format validation */
export function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** Simple email format validation */
export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
