/**
 * useMaestriaConfig — configurações globais do Maestr.IA (bot + canais)
 *
 * Carrega e salva:
 *   - Configs de canal via RPCs get_agent_channel_configs / upsert_agent_channel_config (Banco A)
 *   - bot_active via useDynamicClient().from('client_ai_settings') (Banco A com JWT)
 *   - bot_mode e agentConfigId via get_agent_config_for_client / set_bot_mode (Banco A)
 *
 * A lógica de load/save espelha exatamente o ChatbotAgentePage.tsx.
 */

import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useClientAuth } from "@/hooks/useClientAuth";
import { useDynamicClient } from "@/hooks/useDynamicClient";
import { supabase } from "@/lib/supabase";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface ChannelConfig {
  is_enabled: boolean;
  agent_name: string;
  agent_role: string;
  agent_description: string;
  tone: string;
  formality: number;
  use_emojis: boolean;
  response_length: string;
  objective: string;
  instructions: string;
  behavior_use_knowledge: boolean;
  behavior_collect_data: boolean;
  behavior_create_opportunity: boolean;
  behavior_handoff: boolean;
  handoff_keywords: string[];
  handoff_after_mins: number | "";
  respond_outside_hours: boolean;
  outside_hours_message: string;
}

export type ChannelType =
  | "whatsapp"
  | "instagram_dm"
  | "instagram_comment"
  | "facebook_dm"
  | "facebook_comment";

const CHANNELS: ChannelType[] = [
  "whatsapp",
  "instagram_dm",
  "instagram_comment",
  "facebook_dm",
  "facebook_comment",
];

// ── Defaults ──────────────────────────────────────────────────────────────────

const baseDefault: ChannelConfig = {
  is_enabled: true,
  agent_name: "Assistente",
  agent_role: "Atendimento ao cliente",
  agent_description: "",
  tone: "amigavel",
  formality: 3,
  use_emojis: false,
  response_length: "medio",
  objective: "atendimento",
  instructions: "",
  behavior_use_knowledge: true,
  behavior_collect_data: true,
  behavior_create_opportunity: false,
  behavior_handoff: true,
  handoff_keywords: [],
  handoff_after_mins: "",
  respond_outside_hours: false,
  outside_hours_message: "",
};

function makeDefaultConfigs(): Record<ChannelType, ChannelConfig> {
  return {
    whatsapp:          { ...baseDefault },
    instagram_dm:      { ...baseDefault, behavior_collect_data: true, behavior_create_opportunity: false, objective: "qualificacao" },
    instagram_comment: { ...baseDefault, behavior_collect_data: false, behavior_create_opportunity: false, tone: "profissional", response_length: "curto", instructions: "Seja reativo — responda apenas o que foi perguntado. Nunca solicite dados pessoais em comentários públicos. Mantenha respostas curtas e cordiais." },
    facebook_dm:       { ...baseDefault, behavior_collect_data: true, behavior_create_opportunity: false, objective: "qualificacao" },
    facebook_comment:  { ...baseDefault, behavior_collect_data: false, behavior_create_opportunity: false, tone: "profissional", response_length: "curto", instructions: "Seja reativo — responda apenas o que foi perguntado. Nunca solicite dados pessoais em comentários públicos. Mantenha respostas curtas e cordiais." },
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useMaestriaConfig() {
  const { auth } = useClientAuth();
  const dc = useDynamicClient();

  const clientId = auth?.id ?? "";
  const orgId    = auth?.organization_id ?? "";

  const [configs, setConfigs]                     = useState<Record<ChannelType, ChannelConfig>>(makeDefaultConfigs);
  const [botActive, setBotActive]                 = useState(true);
  const [botMode, setBotMode]                     = useState<"padrao" | "flow">("padrao");
  const [botModePerChannel, setBotModePerChannel] = useState<Record<string, "padrao" | "flow">>({});
  const [agentConfigId, setAgentConfigId]         = useState<string | null>(null);
  const [isLoading, setIsLoading]                 = useState(false);
  const [loaded, setLoaded]                       = useState(false);

  // ── Carregar dados ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!clientId || !dc || loaded) return;

    setIsLoading(true);

    async function load() {
      try {
        const [channelRes, botRes, agentCfgRes] = await Promise.all([
          supabase.rpc("get_agent_channel_configs", { p_client_id: clientId }),
          dc!.from("client_ai_settings")
            .select("bot_active")
            .eq("client_id", clientId)
            .limit(1)
            .maybeSingle(),
          supabase.rpc("get_agent_config_for_client", { p_client_id: clientId }),
        ]);

        if (botRes.data) {
          setBotActive(botRes.data.bot_active ?? true);
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const agentCfg = (agentCfgRes.data as any[])?.[0] ?? null;
        if (agentCfg) {
          setAgentConfigId(agentCfg.id);
          setBotMode((agentCfg.bot_mode as "padrao" | "flow") ?? "padrao");
          setBotModePerChannel(
            (agentCfg.bot_mode_per_channel as Record<string, "padrao" | "flow">) ?? {}
          );
        }

        const remote = (channelRes.data ?? {}) as Record<string, Partial<ChannelConfig>>;
        const defaults = makeDefaultConfigs();

        setConfigs(prev => {
          const next = { ...prev };
          for (const ch of CHANNELS) {
            if (remote[ch]) {
              next[ch] = {
                ...defaults[ch],
                ...remote[ch],
                handoff_after_mins:
                  remote[ch].handoff_after_mins != null
                    ? Number(remote[ch].handoff_after_mins)
                    : "",
                handoff_keywords: remote[ch].handoff_keywords ?? [],
              };
            }
          }
          return next;
        });
      } catch {
        // silencia erro — campos ficam com defaults
      } finally {
        setIsLoading(false);
        setLoaded(true);
      }
    }

    load();
  }, [clientId, dc, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── patchChannel ────────────────────────────────────────────────────────────
  function patchChannel(ch: ChannelType, patch: Partial<ChannelConfig>) {
    setConfigs(prev => ({ ...prev, [ch]: { ...prev[ch], ...patch } }));
  }

  // ── save ────────────────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!clientId || !orgId) throw new Error("Usuário não identificado");

      // 1. Salva todos os canais no Banco A em paralelo
      const saves = CHANNELS.map(ch =>
        supabase.rpc("upsert_agent_channel_config", {
          p_client_id:                   clientId,
          p_organization_id:             orgId,
          p_channel_type:                ch,
          p_is_enabled:                  configs[ch].is_enabled,
          p_agent_name:                  configs[ch].agent_name,
          p_agent_role:                  configs[ch].agent_role,
          p_agent_description:           configs[ch].agent_description || null,
          p_tone:                        configs[ch].tone,
          p_formality:                   configs[ch].formality,
          p_use_emojis:                  configs[ch].use_emojis,
          p_response_length:             configs[ch].response_length,
          p_objective:                   configs[ch].objective,
          p_instructions:                configs[ch].instructions || null,
          p_behavior_use_knowledge:      configs[ch].behavior_use_knowledge,
          p_behavior_collect_data:       configs[ch].behavior_collect_data,
          p_behavior_create_opportunity: configs[ch].behavior_create_opportunity,
          p_behavior_handoff:            configs[ch].behavior_handoff,
          p_handoff_keywords:            configs[ch].handoff_keywords,
          p_handoff_after_mins:
            configs[ch].handoff_after_mins === "" ? null : Number(configs[ch].handoff_after_mins),
          p_respond_outside_hours:  configs[ch].respond_outside_hours,
          p_outside_hours_message:  configs[ch].outside_hours_message || null,
        })
      );

      const results = await Promise.all(saves);
      const firstErr = results.find(r => r.error)?.error;
      if (firstErr) throw firstErr;

      // 2. Salva bot_active no Banco A (client_ai_settings) com JWT do cliente
      const { data: existing } = await dc!.from("client_ai_settings")
        .select("id")
        .eq("client_id", clientId)
        .limit(1)
        .maybeSingle();

      if (existing?.id) {
        const { error } = await dc!.from("client_ai_settings")
          .update({ bot_active: botActive })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await dc!.from("client_ai_settings")
          .insert({ client_id: clientId, bot_active: botActive });
        if (error) throw error;
      }

      // 3. Salva bot_mode / bot_mode_per_channel via RPC (SECURITY DEFINER)
      if (agentConfigId) {
        const { error } = await supabase.rpc("set_bot_mode", {
          p_client_id:            clientId,
          p_bot_mode:             botMode,
          p_bot_mode_per_channel: botModePerChannel,
        });
        if (error) throw error;
      }
    },
  });

  return {
    configs,
    botActive,
    setBotActive,
    botMode,
    setBotMode,
    botModePerChannel,
    setBotModePerChannel,
    patchChannel,
    save: saveMutation.mutateAsync,
    isLoading,
    isSaving: saveMutation.isPending,
  };
}
