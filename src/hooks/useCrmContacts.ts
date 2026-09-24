/**
 * useCrmContacts
 *
 * Hook para gestão de contatos do CRM.
 * Usa a view crm_contacts (aponta para client_crm_contacts no Banco A).
 * Para criar/atualizar com campos completos, chama a RPC upsert_crm_contact.
 * Para busca paginada, chama get_crm_contacts_list.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDynamicClient } from "@/hooks/useDynamicClient";

// ─── Interface completa do contato (migration 094) ────────────────────────────

export interface CrmContact {
  id: string;
  client_id: string;
  // Identificação
  name:           string;
  last_name:      string | null;
  contact_type:   "person" | "company";
  cpf:            string | null;   // apenas dígitos
  cnpj:           string | null;  // apenas dígitos
  birthdate:      string | null;  // ISO date
  company:        string | null;
  job_title:      string | null;
  avatar_url:     string | null;
  // Contatos
  phone:          string | null;
  whatsapp:       string | null;
  phone2:         string | null;
  email:          string | null;
  email2:         string | null;
  // Endereço
  zip_code:       string | null;  // apenas dígitos
  street:         string | null;
  street_number:  string | null;
  complement:     string | null;
  neighborhood:   string | null;
  city:           string | null;
  state:          string | null;
  country:        string | null;
  // Origem
  origin_original: string | null;
  origin_recent:   string | null;
  channel:         string | null;
  campaign:        string | null;
  utm_source:      string | null;
  utm_medium:      string | null;
  utm_campaign:    string | null;
  utm_content:     string | null;
  utm_term:        string | null;
  landing_page:    string | null;
  first_conversion_at: string | null;
  // Gestão
  client_status:    string | null;
  responsible_id:   string | null;
  tags:             string[];
  notes:            string | null;
  source:           string | null;  // legado
  first_contact_at: string | null;
  last_contact_at:  string | null;
  next_contact_at:  string | null;
  converted_at:     string | null;
  archived_at:      string | null;
  // Externos
  whatsapp_id:   string | null;
  instagram_id:  string | null;
  facebook_id:   string | null;
  external_id:   string | null;
  // Metadata legada
  metadata:      Record<string, unknown>;
  created_at:    string;
  updated_at:    string;
}

/** Subset mínimo para criação simples (campos básicos) */
export type CrmContactInput = Pick<CrmContact, "name"> &
  Partial<Omit<CrmContact,
    "id" | "client_id" | "created_at" | "updated_at" |
    "converted_at" | "archived_at" | "metadata"
  >>;

export function useCrmContacts(clientId: string | undefined) {
  const dc = useDynamicClient();
  const qc = useQueryClient();
  const qk = ["crm_contacts", clientId];

  // ── Lista básica (para selects e listas simples) ──────────────────────────
  const query = useQuery<CrmContact[]>({
    queryKey: qk,
    queryFn: async () => {
      if (!dc || !clientId) return [];
      const { data, error } = await dc
        .from("crm_contacts")
        .select("id, name, last_name, phone, whatsapp, email, company, client_status, tags, source, created_at, updated_at")
        .eq("client_id", clientId)
        .is("archived_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CrmContact[];
    },
    enabled: !!dc && !!clientId,
    staleTime: 30_000,
  });

  // ── Busca paginada com filtros (lista completa) ────────────────────────────
  const search = async (params: {
    search?: string;
    status?: string;
    responsible?: string;
    limit?: number;
    offset?: number;
  }) => {
    if (!dc || !clientId) return { rows: [], total: 0 };
    const { data, error } = await dc.rpc("get_crm_contacts_list", {
      p_client_id:   clientId,
      p_search:      params.search      ?? null,
      p_status:      params.status      ?? null,
      p_responsible: params.responsible ?? null,
      p_limit:       params.limit       ?? 50,
      p_offset:      params.offset      ?? 0,
    });
    if (error) throw error;
    return data as { rows: CrmContact[]; total: number };
  };

  // ── Criar contato ─────────────────────────────────────────────────────────
  const create = useMutation({
    mutationFn: async (input: CrmContactInput & { client_id: string }) => {
      if (!dc) throw new Error("Banco não conectado");
      const { data, error } = await dc.rpc("upsert_crm_contact", {
        p_client_id:   input.client_id,
        p_contact_id:  null,
        p_name:        input.name,
        p_last_name:   input.last_name ?? null,
        p_contact_type: input.contact_type ?? "person",
        p_cpf:         input.cpf ?? null,
        p_cnpj:        input.cnpj ?? null,
        p_birthdate:   input.birthdate ?? null,
        p_company:     input.company ?? null,
        p_job_title:   input.job_title ?? null,
        p_phone:       input.phone ?? null,
        p_whatsapp:    input.whatsapp ?? null,
        p_phone2:      input.phone2 ?? null,
        p_email:       input.email ?? null,
        p_email2:      input.email2 ?? null,
        p_zip_code:    input.zip_code ?? null,
        p_street:      input.street ?? null,
        p_street_number: input.street_number ?? null,
        p_complement:  input.complement ?? null,
        p_neighborhood: input.neighborhood ?? null,
        p_city:        input.city ?? null,
        p_state:       input.state ?? null,
        p_country:     input.country ?? "BR",
        p_origin_original: input.origin_original ?? null,
        p_origin_recent:   input.origin_recent ?? input.source ?? null,
        p_channel:     input.channel ?? null,
        p_utm_source:  input.utm_source ?? null,
        p_utm_medium:  input.utm_medium ?? null,
        p_utm_campaign: input.utm_campaign ?? null,
        p_client_status: input.client_status ?? "lead",
        p_responsible_id: input.responsible_id ? input.responsible_id as unknown as `${string}-${string}-${string}-${string}-${string}` : null,
        p_tags:        input.tags ?? [],
        p_notes:       input.notes ?? null,
        p_source:      input.source ?? null,
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? "Erro ao criar contato");
      return data.contact_id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk }),
  });

  // ── Atualizar contato ─────────────────────────────────────────────────────
  const update = useMutation({
    mutationFn: async ({ id, client_id, ...patch }: Partial<CrmContact> & { id: string; client_id: string }) => {
      if (!dc) throw new Error("Banco não conectado");
      const { data, error } = await dc.rpc("upsert_crm_contact", {
        p_client_id:  client_id,
        p_contact_id: id,
        ...(patch.name        !== undefined && { p_name: patch.name }),
        ...(patch.last_name   !== undefined && { p_last_name: patch.last_name }),
        ...(patch.contact_type!== undefined && { p_contact_type: patch.contact_type }),
        ...(patch.cpf         !== undefined && { p_cpf: patch.cpf }),
        ...(patch.cnpj        !== undefined && { p_cnpj: patch.cnpj }),
        ...(patch.birthdate   !== undefined && { p_birthdate: patch.birthdate }),
        ...(patch.company     !== undefined && { p_company: patch.company }),
        ...(patch.job_title   !== undefined && { p_job_title: patch.job_title }),
        ...(patch.phone       !== undefined && { p_phone: patch.phone }),
        ...(patch.whatsapp    !== undefined && { p_whatsapp: patch.whatsapp }),
        ...(patch.phone2      !== undefined && { p_phone2: patch.phone2 }),
        ...(patch.email       !== undefined && { p_email: patch.email }),
        ...(patch.email2      !== undefined && { p_email2: patch.email2 }),
        ...(patch.zip_code    !== undefined && { p_zip_code: patch.zip_code }),
        ...(patch.street      !== undefined && { p_street: patch.street }),
        ...(patch.street_number!==undefined && { p_street_number: patch.street_number }),
        ...(patch.complement  !== undefined && { p_complement: patch.complement }),
        ...(patch.neighborhood!== undefined && { p_neighborhood: patch.neighborhood }),
        ...(patch.city        !== undefined && { p_city: patch.city }),
        ...(patch.state       !== undefined && { p_state: patch.state }),
        ...(patch.country     !== undefined && { p_country: patch.country }),
        ...(patch.origin_recent!==undefined && { p_origin_recent: patch.origin_recent }),
        ...(patch.client_status!==undefined && { p_client_status: patch.client_status }),
        ...(patch.responsible_id!==undefined && { p_responsible_id: patch.responsible_id }),
        ...(patch.tags        !== undefined && { p_tags: patch.tags }),
        ...(patch.notes       !== undefined && { p_notes: patch.notes }),
        ...(patch.next_contact_at!==undefined && { p_next_contact_at: patch.next_contact_at }),
        ...(patch.last_contact_at!==undefined && { p_last_contact_at: patch.last_contact_at }),
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? "Erro ao atualizar contato");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk }),
  });

  // ── Remover (soft delete via archived_at) ─────────────────────────────────
  const remove = useMutation({
    mutationFn: async (id: string) => {
      if (!dc) throw new Error("Banco não conectado");
      // Soft delete: define archived_at em vez de DELETE
      const { error } = await dc
        .from("crm_contacts")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk }),
  });

  // ── Importação em lote ────────────────────────────────────────────────────
  const importBatch = useMutation({
    mutationFn: async (rows: Array<CrmContactInput & { client_id: string }>) => {
      if (!dc) throw new Error("Banco não conectado");
      // Insere direto na view (INSTEAD OF trigger redireciona para client_crm_contacts)
      const payload = rows.map(r => ({
        client_id: r.client_id,
        name:      r.name,
        phone:     r.phone    ?? null,
        whatsapp:  r.whatsapp ?? r.phone ?? null,
        email:     r.email    ?? null,
        source:    r.source   ?? "import",
        origin_recent: r.source ?? "import",
        tags:      r.tags ?? [],
        metadata:  {},
      }));
      const { error } = await dc.from("crm_contacts").insert(payload);
      if (error) throw error;
      return rows.length;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk }),
  });

  // ── Verificar duplicatas ──────────────────────────────────────────────────
  const checkDuplicates = async (params: {
    whatsapp?: string; phone?: string; email?: string;
    cpf?: string; cnpj?: string; excludeId?: string;
  }) => {
    if (!dc || !clientId) return { duplicates: [], has_duplicates: false };
    const { data, error } = await dc.rpc("check_crm_contact_duplicates", {
      p_client_id:  clientId,
      p_whatsapp:   params.whatsapp  ?? null,
      p_phone:      params.phone     ?? null,
      p_email:      params.email     ?? null,
      p_cpf:        params.cpf       ?? null,
      p_cnpj:       params.cnpj      ?? null,
      p_exclude_id: params.excludeId ?? null,
    });
    if (error) throw error;
    return data as { duplicates: Pick<CrmContact, "id" | "name" | "phone" | "whatsapp" | "email">[]; has_duplicates: boolean };
  };

  return { ...query, search, create, update, remove, importBatch, checkDuplicates };
}
