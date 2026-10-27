/**
 * bot-router
 *
 * Edge Function que recebe eventos do n8n e decide se executa um fluxo
 * visual configurado no C8 Control (mode='flow') ou devolve o controle ao
 * fluxo humanizado do n8n (mode='n8n').
 *
 * Rota: POST /functions/v1/bot-router
 *       GET  /functions/v1/bot-router  (health check)
 *
 * Variáveis de ambiente:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { resolveAndExecute } from './router.ts';
import type { RouterRequest } from './types.ts';

// ── CORS headers ──────────────────────────────────────────────────────────────
const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, authorization',
};

// ── Helper de resposta JSON ───────────────────────────────────────────────────
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ── Handler principal ─────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  // Preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 204, headers: corsHeaders });
  }

  // Health check
  if (req.method === 'GET') {
    return json({ status: 'ok' });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  // Verifica Content-Type
  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return json({ error: 'Content-Type deve ser application/json' }, 400);
  }

  // Parse do body
  let body: RouterRequest;
  try {
    body = await req.json() as RouterRequest;
  } catch {
    return json({ error: 'JSON inválido' }, 400);
  }

  // Cria cliente Supabase com service_role (acesso total sem RLS)
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase    = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Executa o router — nunca lança exceção para não derrubar o webhook do n8n
  try {
    const result = await resolveAndExecute(body, supabase);
    return json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[bot-router] unhandled error:', msg);
    // Retorna mode:'n8n' para que o n8n assuma o fluxo humanizado como fallback
    return json({ mode: 'n8n', error: msg }, 200);
  }
});
