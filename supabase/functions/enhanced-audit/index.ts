/**
 * Enhanced Audit Edge Function
 * 
 * Registra auditoria enriquecida com IP, user-agent e contexto adicional
 * Chamada via webhook ou RPC para ações sensíveis
 */

// @ts-nocheck - Ignorar verificação de tipos para compatibilidade Deno
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface AuditRequest {
  action: string;
  table_name: string;
  record_id?: string;
  details?: Record<string, any>;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  category?: 'auth' | 'data' | 'permission' | 'integration' | 'security';
}

interface ClientInfo {
  ip: string;
  userAgent: string;
  timestamp: string;
  sessionId?: string;
}

function extractClientInfo(req: Request): ClientInfo {
  const ip = req.headers.get("x-forwarded-for") || 
              req.headers.get("x-real-ip") || 
              "unknown";
  
  const userAgent = req.headers.get("user-agent") || "unknown";
  const timestamp = new Date().toISOString();

  return {
    ip: ip.split(',')[0].trim(), // Pega o primeiro IP em caso de múltiplos
    userAgent,
    timestamp,
    sessionId: req.headers.get("x-session-id") || undefined,
  };
}

function sanitizeData(data: any): any {
  if (!data || typeof data !== 'object') return data;
  
  const sensitiveKeys = [
    'password', 'token', 'secret', 'key', 'auth', 'session', 'cookie',
    'authorization', 'apikey', 'api_key', 'supabase_key', 'service_role_key'
  ];
  
  const sanitized = Array.isArray(data) ? [...data] : { ...data };
  
  const sanitizeValue = (value: any, key: string): any => {
    if (typeof value === 'string' && 
        sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
      return '[REDACTED]';
    }
    if (typeof value === 'object' && value !== null) {
      return sanitizeData(value);
    }
    return value;
  };
  
  if (Array.isArray(sanitized)) {
    return sanitized.map(item => sanitizeValue(item, ''));
  }
  
  for (const key in sanitized) {
    sanitized[key] = sanitizeValue(sanitized[key], key);
  }
  
  return sanitized;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // Verificar autenticação
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      globalThis.Deno?.env.get("SUPABASE_URL") || "",
      globalThis.Deno?.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
      { auth: { persistSession: false } }
    );

    // Validar token JWT
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extrair informações do request
    const clientInfo = extractClientInfo(req);
    const auditData: AuditRequest = await req.json();

    // Validar dados obrigatórios
    if (!auditData.action || !auditData.table_name) {
      return new Response(
        JSON.stringify({ error: "action and table_name are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Sanitizar dados sensíveis
    const sanitizedDetails = auditData.details ? sanitizeData(auditData.details) : undefined;

    // Inserir registro de auditoria enriquecida
    const { error: insertError } = await supabase
      .from("enhanced_audit_logs")
      .insert({
        // Campos básicos da auditoria
        table_name: auditData.table_name,
        record_id: auditData.record_id || null,
        action: auditData.action,
        changed_by: user.id,
        organization_id: user.user_metadata?.organization_id || null,
        changes: sanitizedDetails ? JSON.stringify(sanitizedDetails) : null,
        
        // Campos enriquecidos
        client_ip: clientInfo.ip,
        user_agent: clientInfo.userAgent,
        session_id: clientInfo.sessionId,
        request_timestamp: clientInfo.timestamp,
        
        // Metadados adicionais
        severity: auditData.severity || 'medium',
        category: auditData.category || 'data',
        created_at: new Date().toISOString(),
      });

    if (insertError) {
      console.error("Enhanced audit insert error:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to insert audit log" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        audit_id: "logged",
        timestamp: clientInfo.timestamp 
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );

  } catch (error) {
    console.error("Enhanced audit function error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
