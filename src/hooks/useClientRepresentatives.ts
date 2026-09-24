import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useOrganization } from "@/hooks/useOrganization";

export type RepresentativeQualificacao =
  | "socio_administrador"
  | "socio"
  | "procurador"
  | "representante_legal";

export const QUALIFICACAO_LABELS: Record<RepresentativeQualificacao, string> = {
  socio_administrador: "Sócio-Administrador",
  socio:               "Sócio",
  procurador:          "Procurador(a)",
  representante_legal: "Representante Legal",
};

export type TipoRepresentacao = "legal" | "procurador";
export type ProcuracaoTipo    = "publica" | "particular";

export interface ClientRepresentative {
  id: string;
  client_id: string;
  organization_id: string;
  nome: string;
  cpf: string;
  cargo: string | null;
  telefone: string | null;
  email: string | null;
  qualificacao: RepresentativeQualificacao | null;
  /** Tem poder legal de assinatura (configurado no cadastro do cliente) */
  is_legal_representative: boolean;
  /** É o responsável designado para assinar este contrato específico */
  is_signing_responsible: boolean;
  display_order: number;
  // ── Campos de procuração (migration 00208) ─────────────────────────────
  tipo_representacao: TipoRepresentacao;
  procuracao_tipo: ProcuracaoTipo | null;
  procuracao_data: string | null;          // ISO date "YYYY-MM-DD"
  procuracao_validade: string | null;      // ISO date — controle interno
  procuracao_indeterminada: boolean;
  procuracao_notas: string | null;
  representa_ids: string[] | null;         // IDs de outros representantes
  // ── Qualificação pessoal (migration 00083) ─────────────────────────────────
  estado_civil: string | null;
  nacionalidade: string | null;
  created_at: string;
  updated_at: string;
}

/** Coluna calculada retornada pela view client_representatives_vw */
export interface ClientRepresentativeWithFlag extends ClientRepresentative {
  procuracao_vencida: boolean;
}

export function useClientRepresentatives(clientId: string | undefined) {
  const organizationId = useOrganization();
  const qc = useQueryClient();

  const queryKey = ["client_representatives", organizationId, clientId];

  // Usa a view para obter procuracao_vencida calculada pelo banco
  const query = useQuery<ClientRepresentativeWithFlag[]>({
    queryKey,
    queryFn: async () => {
      if (!organizationId || !clientId) return [];
      const { data, error } = await supabase
        .from("client_representatives_vw")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("client_id", clientId)
        .order("display_order");
      if (error) throw error;
      // Log temporário para diagnóstico de campos novos
      if (data && data.length > 0) {
        console.debug("[Representatives] primeiro rep:", JSON.stringify(data[0]));
      }
      return (data ?? []) as ClientRepresentativeWithFlag[];
    },
    enabled: !!organizationId && !!clientId,
    staleTime: 30_000,
  });

  const saveRepresentative = useMutation({
    mutationFn: async (
      rep: Partial<ClientRepresentative> & { nome: string; cpf: string }
    ) => {
      if (!organizationId || !clientId) throw new Error("Dados insuficientes.");
      const payload = {
        nome:                     rep.nome,
        cpf:                      rep.cpf,
        cargo:                    rep.cargo ?? null,
        telefone:                 rep.telefone ?? null,
        email:                    rep.email ?? null,
        qualificacao:             rep.qualificacao ?? null,
        is_legal_representative:  rep.is_legal_representative ?? false,
        is_signing_responsible:   rep.is_signing_responsible ?? false,
        display_order:            rep.display_order ?? 0,
        // Campos de procuração
        tipo_representacao:       rep.tipo_representacao ?? "legal",
        procuracao_tipo:          rep.procuracao_tipo ?? null,
        procuracao_data:          rep.procuracao_data ?? null,
        procuracao_validade:      rep.procuracao_validade ?? null,
        procuracao_indeterminada: rep.procuracao_indeterminada ?? false,
        procuracao_notas:         rep.procuracao_notas ?? null,
        representa_ids:           rep.representa_ids ?? null,
        estado_civil:             rep.estado_civil ?? null,
        nacionalidade:            rep.nacionalidade ?? null,
      };
      if (rep.id) {
        const { error } = await supabase
          .from("client_representatives")
          .update(payload)
          .eq("id", rep.id)
          .eq("organization_id", organizationId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("client_representatives")
          .insert({ ...payload, client_id: clientId, organization_id: organizationId });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const removeRepresentative = useMutation({
    mutationFn: async (id: string) => {
      if (!organizationId) throw new Error("Organização não identificada.");
      const { error } = await supabase
        .from("client_representatives")
        .delete()
        .eq("id", id)
        .eq("organization_id", organizationId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  /** Define um único responsável pela assinatura (is_signing_responsible) */
  const setSigningResponsible = useMutation({
    mutationFn: async (repId: string) => {
      if (!organizationId || !clientId) throw new Error("Dados insuficientes.");
      await supabase
        .from("client_representatives")
        .update({ is_signing_responsible: false })
        .eq("client_id", clientId)
        .eq("organization_id", organizationId);
      const { error } = await supabase
        .from("client_representatives")
        .update({ is_signing_responsible: true })
        .eq("id", repId)
        .eq("organization_id", organizationId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  /** Define múltiplos responsáveis pela assinatura (para assinatura conjunta) */
  const setSigningResponsibles = useMutation({
    mutationFn: async (repIds: string[]) => {
      if (!organizationId || !clientId) throw new Error("Dados insuficientes.");
      await supabase
        .from("client_representatives")
        .update({ is_signing_responsible: false })
        .eq("client_id", clientId)
        .eq("organization_id", organizationId);
      if (repIds.length > 0) {
        const { error } = await supabase
          .from("client_representatives")
          .update({ is_signing_responsible: true })
          .in("id", repIds)
          .eq("organization_id", organizationId);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const legalRepresentatives  = (query.data ?? []).filter(r => r.is_legal_representative);
  const signingRepresentatives = (query.data ?? []).filter(r => r.is_signing_responsible);
  const procuradores           = (query.data ?? []).filter(r => r.tipo_representacao === "procurador");
  const hasProcuradorVencido   = procuradores.some(r => r.procuracao_vencida);

  return {
    ...query,
    legalRepresentatives,
    signingRepresentatives,
    procuradores,
    hasProcuradorVencido,
    saveRepresentative,
    removeRepresentative,
    setSigningResponsible,
    setSigningResponsibles,
  };
}
