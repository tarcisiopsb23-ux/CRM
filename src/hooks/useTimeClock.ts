import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/hooks/useOrganization";

export type RepPPunchType = "entrada" | "saida_intervalo" | "retorno_intervalo" | "saida_final";
export type RepPOrigin = "web" | "mobile";

export interface RepPTodayState {
  today_date: string;
  now_local: string;
  exempt: boolean;
  has_entry: boolean;
  has_final_exit: boolean;
  last_punch_type: RepPPunchType | null;
  last_punch_at: string | null;
  entry_at: string | null;
  break_out_at: string | null;
  // Flags calculadas no banco (sem risco de fuso)
  can_entry: boolean;
  can_break: boolean;
  can_return: boolean;
  can_final: boolean;
  // Horários formatados (fuso SP)
  entry_allowed_at: string | null;   // entrada liberada após 12h da última saída
  last_final_display: string | null; // horário da última saída final anterior
  break_allowed_at: string | null;   // mín saida_intervalo: entrada + 4h
  break_max_at: string | null;       // máx saida_intervalo: entrada + 6h30
  return_allowed_at: string | null;  // mín retorno_intervalo: saída + 1h
  return_max_at: string | null;      // máx retorno_intervalo: saída + 2h
  final_allowed_at: string | null;   // saida_final: entrada + 8h48 (exibição)
  entry_time_display: string | null;
  break_time_display: string | null;
  alerts: string[];
  next_allowed: RepPPunchType[];
  // Dia especial (sábado/domingo/feriado)
  special_day: "sabado" | "domingo" | "feriado" | null;
  has_special_day_auth: boolean;
}

export interface RepPPunchRow {
  id: string;
  organization_id: string;
  user_id: string;
  occurred_at: string;
  punch_type: RepPPunchType;
  ip: string | null;
  device: string | null;
  user_agent: string | null;
  origin: RepPOrigin;
  geo: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  prev_hash: string | null;
  integrity_hash: string;
  created_at: string;
  created_by: string | null;
  status: "ativo" | "anulado" | "corrigido";
  alterado_em: string | null;
  justificativa: string | null;
  alterado_por: string | null;
  tipo_alteracao: string | null;
  valores_anteriores: Record<string, unknown> | null;
  valores_novos: Record<string, unknown> | null;
}

export interface RepPAdminActionRow {
  id: string;
  organization_id: string;
  punch_id: string | null;
  action_type: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  justification: string;
  action_at: string;
  action_by: string | null;
  prev_hash: string | null;
  integrity_hash: string;
}

type RpcResponse = { data: unknown; error: unknown };
type RpcClient = { rpc: (fn: string, args?: Record<string, unknown>) => Promise<RpcResponse> };

async function rpc(fn: string, args?: Record<string, unknown>) {
  const client = supabase as unknown as RpcClient;
  return await client.rpc(fn, args);
}

function buildDeviceString() {
  if (typeof navigator === "undefined") return "web";
  const ua = navigator.userAgent ?? "";
  const platform = (navigator as unknown as { platform?: string }).platform ?? "";
  return `${platform} | ${ua}`.slice(0, 512);
}

async function tryGetGeoJson(timeoutMs = 2500): Promise<Record<string, unknown> | null> {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) return null;
  return await new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) resolve(null);
    }, timeoutMs);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        done = true;
        clearTimeout(timer);
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        });
      },
      () => {
        done = true;
        clearTimeout(timer);
        resolve(null);
      },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: timeoutMs }
    );
  });
}

export function useTimeClockState() {
  const orgId = useOrganization();
  const { profile } = useAuth();

  return useQuery({
    queryKey: ["rep_p", "today_state", orgId, profile?.id],
    queryFn: async () => {
      const { data, error } = await rpc("rep_p_get_today_state");
      if (error) throw error;
      return data as unknown as RepPTodayState;
    },
    enabled: !!orgId && !!profile?.id,
    staleTime: 0,          // sempre busca dados frescos após invalidação
    refetchInterval: 30_000,
  });
}

export function useRegisterPunch() {
  const qc = useQueryClient();
  const orgId = useOrganization();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (input: { type: RepPPunchType; origin?: RepPOrigin; ackLateBreak?: boolean }) => {
      if (!orgId || !profile?.id) throw new Error("Sem organização ou usuário");
      const geo = await tryGetGeoJson();
      const { data, error } = await rpc("rep_p_register_punch", {
        p_type: input.type,
        p_device: buildDeviceString(),
        p_origin: input.origin ?? "web",
        p_geo: geo,
        p_ack_late_break: input.ackLateBreak ?? false,
      });
      if (error) {
        // Supabase RPC errors are plain objects, not Error instances.
        // Normalise to a proper Error so callers can rely on .message.
        const raw = error as { message?: string; details?: string; hint?: string; code?: string };
        const msg = raw.message ?? raw.details ?? raw.hint ?? "Erro ao registrar ponto";
        throw new Error(msg);
      }
      return data as unknown as { id: string; type: string; occurred_at: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rep_p"] });
      qc.invalidateQueries({ queryKey: ["rep_p_punches"] });
    },
  });
}

export function useRepPPunches(filters: {
  organizationId?: string;
  userId?: string;
  fromIso?: string;
  toIso?: string;
  status?: "ativo" | "anulado" | "corrigido" | "all";
  type?: RepPPunchType | "all";
}) {
  const { organizationId, userId, fromIso, toIso, status, type } = filters;

  const key = useMemo(
    () => ["rep_p_punches", organizationId, userId ?? "all", fromIso ?? "", toIso ?? "", status ?? "all", type ?? "all"],
    [organizationId, userId, fromIso, toIso, status, type]
  );

  return useQuery({
    queryKey: key,
    queryFn: async () => {
      let q = supabase.from("rep_p_punches_with_status" as never).select("*");
      if (organizationId) q = q.eq("organization_id", organizationId);
      if (userId) q = q.eq("user_id", userId);
      if (fromIso) q = q.gte("occurred_at", fromIso);
      if (toIso) q = q.lte("occurred_at", toIso);
      if (status && status !== "all") q = q.eq("status", status);
      if (type && type !== "all") q = q.eq("punch_type", type);
      const { data, error } = await q.order("occurred_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as RepPPunchRow[];
    },
    enabled: !!organizationId,
  });
}

export function useRepPAdminActions(punchId: string | null) {
  const orgId = useOrganization();
  return useQuery({
    queryKey: ["rep_p", "admin_actions", orgId, punchId],
    queryFn: async () => {
      if (!punchId) return [];
      const { data, error } = await supabase
        .from("rep_p_admin_actions" as never)
        .select("*")
        .eq("punch_id", punchId)
        .order("action_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as RepPAdminActionRow[];
    },
    enabled: !!orgId && !!punchId,
  });
}

export function useRepPAdminCreatePunch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      userId: string;
      occurredAtIso: string;
      type: RepPPunchType;
      justification: string;
      origin?: RepPOrigin;
    }) => {
      const geo = await tryGetGeoJson();
      const { data, error } = await rpc("rep_p_admin_create_punch", {
        p_user_id: input.userId,
        p_occurred_at: input.occurredAtIso,
        p_type: input.type,
        p_justification: input.justification,
        p_device: buildDeviceString(),
        p_origin: input.origin ?? "web",
        p_geo: geo,
      });
      if (error) throw error;
      return data as unknown as { id: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rep_p_punches"] });
      qc.invalidateQueries({ queryKey: ["rep_p"] });
    },
  });
}

export function useRepPAdminVoidPunch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { punchId: string; justification: string }) => {
      const { error } = await rpc("rep_p_admin_void_punch", {
        p_punch_id: input.punchId,
        p_justification: input.justification,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rep_p_punches"] });
      qc.invalidateQueries({ queryKey: ["rep_p"] });
    },
  });
}

export function useRepPAdminCorrectPunch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { punchId: string; newOccurredAtIso: string; newType: RepPPunchType; justification: string }) => {
      const geo = await tryGetGeoJson();
      const { data, error } = await rpc("rep_p_admin_correct_punch", {
        p_punch_id: input.punchId,
        p_new_occurred_at: input.newOccurredAtIso,
        p_new_type: input.newType,
        p_justification: input.justification,
        p_device: buildDeviceString(),
        p_origin: "web",
        p_geo: geo,
      });
      if (error) throw error;
      return data as unknown as { new_punch_id: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rep_p_punches"] });
      qc.invalidateQueries({ queryKey: ["rep_p"] });
    },
  });
}

export function useRepPRequestOvertime() {
  const qc = useQueryClient();
  const orgId = useOrganization();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (input: { workDate: string; minutes: number; justification: string }) => {
      if (!orgId || !profile?.id) throw new Error("Sem organização ou usuário autenticado");
      
      const { data, error } = await rpc("rep_p_request_overtime", {
        p_work_date: input.workDate,
        p_minutes: input.minutes,
        p_justification: input.justification
      });
        
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rep_p"] });
    },
  });
}

export function useRepPAdminAuthorizeReentry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { userId: string; forDate: string; justification: string }) => {
      const { data, error } = await rpc("rep_p_admin_authorize_reentry", {
        p_user_id: input.userId,
        p_for_date: input.forDate,
        p_justification: input.justification,
      });
      if (error) throw error;
      return data as unknown as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rep_p"] });
      qc.invalidateQueries({ queryKey: ["rep_p_punches"] });
    },
  });
}

export function useRepPAdminAuthorizeLimit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      userId: string;
      forDate: string;
      authType: "late_break" | "late_return" | "overtime";
      justification: string;
      authorizedMinutes?: number; // obrigatório para overtime
    }) => {
      const { data, error } = await rpc("rep_p_admin_authorize_limit", {
        p_user_id:            input.userId,
        p_for_date:           input.forDate,
        p_auth_type:          input.authType,
        p_justification:      input.justification,
        p_authorized_minutes: input.authorizedMinutes ?? null,
      });
      if (error) throw error;
      return data as unknown as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rep_p"] });
    },
  });
}
