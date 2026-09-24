/**
 * useInvoices.ts
 * Hook principal para o módulo Fiscal NFS-e.
 * Gerencia listagem, emissão, cancelamento e pagamentos pendentes de nota.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { emitirNFSe, cancelarNFSe } from "@/lib/notaasClient";
import { deriveCompetencia, resolveCodigoServico } from "@/lib/fiscalValidators";
import type { Invoice, InvoiceFilters, InvoiceEmitFormData, NotaasConfig } from "@/types/fiscal";
import type { Client, Payment } from "@/types/crm";

// ── Utilitário de filtragem local ────────────────────────────────────────────

/**
 * Filtra uma lista de Invoices por critérios opcionais.
 * Função pura — sem efeitos colaterais.
 */
export function filterInvoices(invoices: Invoice[], filters: InvoiceFilters): Invoice[] {
  return invoices.filter((inv) => {
    if (filters.status && inv.status !== filters.status) return false;
    if (filters.competencia && inv.competencia !== filters.competencia) return false;
    if (filters.client_id && inv.client_id !== filters.client_id) return false;
    if (filters.contract_id && inv.contract_id !== filters.contract_id) return false;
    if (filters.payment_id && inv.payment_id !== filters.payment_id) return false;
    return true;
  });
}

// ── Hook: pagamentos pagos sem nota fiscal ────────────────────────────────────

/**
 * Retorna pagamentos com status='pago' que ainda não possuem um Invoice ativo
 * (status diferente de 'rejeitada' e 'cancelada') vinculado.
 * Inclui dados do cliente para exibição na lista de pendentes.
 */
export function usePendingPayments(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["payments_pending_invoice", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];

      // Busca todos os pagamentos pagos com dados do cliente
      const { data: payments, error: paymentsError } = await supabase
        .from("payments")
        .select("*, clients(id, name, company, document)")
        .eq("organization_id", organizationId)
        .eq("status", "pago")
        .order("paid_at", { ascending: false });

      if (paymentsError) throw paymentsError;
      if (!payments?.length) return [];

      // Busca invoices ativos (não rejeitados/cancelados) para esses pagamentos
      const paymentIds = payments.map((p) => p.id);
      const { data: activeInvoices } = await supabase
        .from("invoices")
        .select("payment_id, status")
        .eq("organization_id", organizationId)
        .in("payment_id", paymentIds)
        .not("status", "in", '("rejeitada","cancelada")');

      const coveredPaymentIds = new Set(
        (activeInvoices ?? []).map((inv) => inv.payment_id).filter(Boolean)
      );

      // Retorna apenas os pagamentos sem invoice ativo
      return payments.filter((p) => !coveredPaymentIds.has(p.id)) as (Payment & {
        clients?: { id: string; name: string; company: string | null; document: string | null } | null;
      })[];
    },
    enabled: !!organizationId,
  });
}

// ── Hook principal ───────────────────────────────────────────────────────────

export function useInvoices(
  organizationId: string | undefined,
  filters?: InvoiceFilters
) {
  const qc = useQueryClient();

  // ── Query: listagem paginada com filtros ──────────────────────────────────
  const query = useQuery({
    queryKey: ["invoices", organizationId, filters],
    queryFn: async () => {
      if (!organizationId) return [];
      let q = supabase
        .from("invoices")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });

      if (filters?.status)           q = q.eq("status", filters.status);
      if (filters?.competencia)      q = q.eq("competencia", filters.competencia);
      if (filters?.client_id)        q = q.eq("client_id", filters.client_id);
      if (filters?.contract_id)      q = q.eq("contract_id", filters.contract_id);
      if (filters?.payment_id)       q = q.eq("payment_id", filters.payment_id);
      if (filters?.due_date_from)    q = q.gte("due_date", filters.due_date_from);
      if (filters?.due_date_to)      q = q.lte("due_date", filters.due_date_to);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Invoice[];
    },
    enabled: !!organizationId,
  });

  // ── Mutation: emissão de NFS-e ────────────────────────────────────────────
  const emit = useMutation({
    mutationFn: async ({
      formData,
      client,
      notaasConfig,
    }: {
      formData: InvoiceEmitFormData;
      client: Client;
      notaasConfig: NotaasConfig;
    }) => {
      if (!organizationId) throw new Error("Sem organização");

      // 1. Verificar duplicata: bloqueia se já existe invoice ativo para o mesmo payment_id
      if (formData.payment_id) {
        const { data: existing } = await supabase
          .from("invoices")
          .select("id, status")
          .eq("organization_id", organizationId)
          .eq("payment_id", formData.payment_id)
          .not("status", "in", '("rejeitada","cancelada")')
          .maybeSingle();

        if (existing) {
          throw new Error(
            `Já existe uma nota fiscal ativa (${existing.status}) para este pagamento.`
          );
        }
      }

      // 2. Snapshot do tomador no momento da emissão
      const tomadorEndereco: Record<string, unknown> = {
        logradouro:  client.address_street,
        numero:      client.address_number,
        complemento: client.address_complement,
        bairro:      client.address_neighborhood,
        cidade:      client.address_city,
        uf:          client.address_state,
        cep:         client.address_zip,
      };

      // 3. Cria registro com status 'processando' — já aparece como "Enviada" na UI
      // O n8n confirma ou rejeita a partir daqui
      const { data: invoice, error: insertError } = await supabase
        .from("invoices")
        .insert({
          organization_id:   organizationId,
          client_id:         formData.client_id,
          contract_id:       formData.contract_id || null,
          payment_id:        formData.payment_id  || null,
          type:              "nfse",
          status:            "processando",
          valor_servico:     formData.valor_servico,
          aliquota_iss:      formData.aliquota_iss,
          codigo_servico:    formData.codigo_servico,
          descricao_servico: formData.descricao_servico,
          competencia:       formData.competencia,
          tomador_nome:      client.company || client.name,
          tomador_cnpj_cpf:  client.document,
          tomador_email:     client.email,
          tomador_endereco:  tomadorEndereco,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // 4. Dispara o n8n — o workflow é responsável por todas as transições de status
      const n8nUrl = notaasConfig.n8n_webhook_url?.trim();

      if (n8nUrl) {
        try {
          await fetch(n8nUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              // Identificação
              invoice_id:         invoice.id,
              organization_id:    organizationId,
              // Campos do invoice para o workflow não precisar buscar novamente
              status:             invoice.status,
              notaas_id:          invoice.notaas_id          ?? null,
              notaas_protocol:    invoice.notaas_protocol     ?? null,
              numero:             invoice.numero              ?? null,
              pdf_url:            invoice.pdf_url             ?? null,
              xml_url:            invoice.xml_url             ?? null,
              emitida_em:         invoice.emitida_em          ?? null,
              erro_mensagem:      invoice.erro_mensagem       ?? null,
              // Dados para emissão
              payment_id:         formData.payment_id         || null,
              client_id:          formData.client_id,
              contract_id:        formData.contract_id        || null,
              valor:              formData.valor_servico,
              paid_at:            formData.competencia + "-01",
              service_contracted: formData.codigo_servico,
              competencia:        formData.competencia,
              aliquota_iss:       formData.aliquota_iss,
              codigo_servico:     formData.codigo_servico,
              descricao_servico:  formData.descricao_servico,
            }),
            signal: AbortSignal.timeout(30_000),
          });
        } catch (n8nErr) {
          // n8n indisponível — invoice fica em 'pendente', usuário pode tentar sync depois
          console.warn("[useInvoices] Falha ao acionar n8n (best-effort):", n8nErr);
        }

        // Retorna o invoice como está no banco — o n8n atualizará o status de forma assíncrona
        return invoice as Invoice;
      }

      // 5. Fallback: Notaas diretamente (sem n8n configurado)
      // Neste caso o frontend gerencia as transições, pois não há workflow externo
      try {
        // Marca como processando antes de chamar a API
        await supabase
          .from("invoices")
          .update({ status: "processando", erro_mensagem: null })
          .eq("id", invoice.id);

        const result = await emitirNFSe(notaasConfig, {
          tomador: {
            cnpj_cpf: client.document ?? "",
            nome:     client.company || client.name,
            email:    client.email ?? undefined,
            endereco: tomadorEndereco,
          },
          servico: {
            codigo:    formData.codigo_servico,
            descricao: formData.descricao_servico,
          },
          valores: {
            total:       formData.valor_servico,
            aliquotaIss: formData.aliquota_iss,
          },
          competencia: formData.competencia,
        });

        await supabase
          .from("invoices")
          .update({
            status:          "emitida",
            notaas_id:       result.id,
            notaas_protocol: result.protocol ?? null,
            numero:          result.numero ?? null,
            pdf_url:         result.pdf_url ?? null,
            xml_url:         result.xml_url ?? null,
            emitida_em:      result.emitida_em ?? new Date().toISOString(),
            erro_mensagem:   null,
          })
          .eq("id", invoice.id);

        // Lê o estado final do banco — fonte de verdade
        const { data: final } = await supabase
          .from("invoices")
          .select("*")
          .eq("id", invoice.id)
          .single();

        return (final ?? invoice) as Invoice;
      } catch (apiError) {
        await supabase
          .from("invoices")
          .update({
            status:        "rejeitada",
            erro_mensagem: apiError instanceof Error ? apiError.message : "Erro desconhecido",
          })
          .eq("id", invoice.id);

        // Lê o estado final do banco antes de propagar o erro
        await qc.invalidateQueries({ queryKey: ["invoices", organizationId], exact: false });
        throw apiError;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices", organizationId], exact: false });
      qc.invalidateQueries({ queryKey: ["payments_pending_invoice", organizationId] });
    },
    onError: () => {
      qc.invalidateQueries({ queryKey: ["invoices", organizationId], exact: false });
      qc.invalidateQueries({ queryKey: ["payments_pending_invoice", organizationId] });
    },
  });

  // ── Mutation: enviar nota pendente (pendente → processando + dispara n8n) ──
  const sendInvoice = useMutation({
    mutationFn: async ({
      invoice,
      notaasConfig,
    }: {
      invoice: Invoice;
      notaasConfig: NotaasConfig;
    }) => {
      if (invoice.status !== "pendente") {
        throw new Error("Apenas notas com status pendente podem ser enviadas.");
      }

      // Muda para processando imediatamente
      const { error } = await supabase
        .from("invoices")
        .update({ status: "processando", erro_mensagem: null })
        .eq("id", invoice.id)
        .eq("organization_id", organizationId ?? "");
      if (error) throw error;

      // Dispara n8n
      const n8nUrl = notaasConfig.n8n_webhook_url?.trim();
      if (n8nUrl) {
        try {
          await fetch(n8nUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              invoice_id:         invoice.id,
              organization_id:    organizationId,
              status:             "processando",
              notaas_id:          invoice.notaas_id          ?? null,
              notaas_protocol:    invoice.notaas_protocol     ?? null,
              numero:             invoice.numero              ?? null,
              pdf_url:            invoice.pdf_url             ?? null,
              xml_url:            invoice.xml_url             ?? null,
              emitida_em:         invoice.emitida_em          ?? null,
              erro_mensagem:      null,
              payment_id:         invoice.payment_id          ?? null,
              client_id:          invoice.client_id,
              contract_id:        invoice.contract_id         ?? null,
              valor:              invoice.valor_servico,
              paid_at:            invoice.competencia ? invoice.competencia + "-01" : new Date().toISOString(),
              service_contracted: invoice.codigo_servico      ?? null,
              competencia:        invoice.competencia         ?? null,
              aliquota_iss:       invoice.aliquota_iss        ?? null,
              codigo_servico:     invoice.codigo_servico      ?? null,
              descricao_servico:  invoice.descricao_servico   ?? null,
            }),
            signal: AbortSignal.timeout(30_000),
          });
        } catch (n8nErr) {
          console.warn("[useInvoices] sendInvoice: falha ao acionar n8n:", n8nErr);
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices", organizationId], exact: false });
    },
  });

  // ── Mutation: excluir invoice pendente ────────────────────────────────────
  const deleteInvoice = useMutation({
    mutationFn: async (invoiceId: string) => {
      const { data: current } = await supabase
        .from("invoices")
        .select("status")
        .eq("id", invoiceId)
        .eq("organization_id", organizationId ?? "")
        .single();

      if (current && current.status !== "pendente" && current.status !== "rejeitada" && current.status !== "cancelada") {
        throw new Error("Apenas notas pendentes, rejeitadas ou canceladas podem ser excluídas.");
      }

      const { error } = await supabase
        .from("invoices")
        .delete()
        .eq("id", invoiceId)
        .eq("organization_id", organizationId ?? "");
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices", organizationId], exact: false });
      qc.invalidateQueries({ queryKey: ["payments_pending_invoice", organizationId] });
    },
  });
  const resetToPending = useMutation({
    mutationFn: async (invoiceId: string) => {
      // Busca o invoice para saber o payment_id antes de mudar o status
      const { data: current } = await supabase
        .from("invoices")
        .select("id, payment_id, status")
        .eq("id", invoiceId)
        .eq("organization_id", organizationId ?? "")
        .single();

      // Se tem payment_id, verifica se já existe outro invoice ativo para ele
      if (current?.payment_id) {
        const { data: conflict } = await supabase
          .from("invoices")
          .select("id, status")
          .eq("organization_id", organizationId ?? "")
          .eq("payment_id", current.payment_id)
          .neq("id", invoiceId)
          .not("status", "in", '("rejeitada","cancelada")')
          .maybeSingle();

        if (conflict) {
          throw new Error(
            `Já existe uma nota fiscal ativa (${conflict.status}) para este pagamento. Cancele-a antes de reativar esta.`
          );
        }
      }

      const { error } = await supabase
        .from("invoices")
        .update({
          status:          "pendente",
          erro_mensagem:   null,
          notaas_id:       null,
          notaas_protocol: null,
        })
        .eq("id", invoiceId)
        .eq("organization_id", organizationId ?? "");
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices", organizationId], exact: false });
      qc.invalidateQueries({ queryKey: ["payments_pending_invoice", organizationId] });
    },
  });

  // ── Mutation: sincronizar/verificar status via n8n (processando) ─────────
  // Lógica: se a nota já foi cadastrada na Notaas, retorna o link e marca autorizada.
  // Se não foi, tenta emitir. Tudo feito pelo workflow n8n.
  const syncStatus = useMutation({
    mutationFn: async ({
      invoice,
      notaasConfig,
    }: {
      invoice: Invoice;
      notaasConfig: NotaasConfig;
    }) => {
      const n8nUrl = notaasConfig.n8n_webhook_url?.trim();
      if (!n8nUrl) throw new Error("URL do webhook n8n não configurada.");

      const res = await fetch(n8nUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Identificação e ação
          invoice_id:         invoice.id,
          organization_id:    organizationId,
          _action:            "check_or_emit",
          // Estado atual do invoice — o workflow usa para decidir o que fazer
          status:             invoice.status,
          notaas_id:          invoice.notaas_id          ?? null,
          notaas_protocol:    invoice.notaas_protocol     ?? null,
          numero:             invoice.numero              ?? null,
          pdf_url:            invoice.pdf_url             ?? null,
          xml_url:            invoice.xml_url             ?? null,
          emitida_em:         invoice.emitida_em          ?? null,
          erro_mensagem:      invoice.erro_mensagem       ?? null,
          // Dados para emissão caso precise reemitir
          payment_id:         invoice.payment_id          ?? null,
          client_id:          invoice.client_id,
          contract_id:        invoice.contract_id         ?? null,
          valor:              invoice.valor_servico,
          paid_at:            invoice.competencia ? invoice.competencia + "-01" : new Date().toISOString(),
          service_contracted: invoice.codigo_servico      ?? null,
          competencia:        invoice.competencia         ?? null,
          aliquota_iss:       invoice.aliquota_iss        ?? null,
          codigo_servico:     invoice.codigo_servico      ?? null,
          descricao_servico:  invoice.descricao_servico   ?? null,
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`n8n respondeu ${res.status}: ${text.slice(0, 200)}`);
      }

      qc.invalidateQueries({ queryKey: ["invoices", organizationId], exact: false });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices", organizationId], exact: false });
    },
  });

  // ── Mutation: cancelar invoice em processamento ───────────────────────────
  const cancelProcessando = useMutation({
    mutationFn: async ({
      invoice,
      motivo,
      notaasConfig,
    }: {
      invoice: Invoice;
      motivo: string;
      notaasConfig: NotaasConfig;
    }) => {
      // 1. Marca como cancelamento_pendente imediatamente (não remove da lista)
      const { error: updateErr } = await supabase
        .from("invoices")
        .update({
          status: "cancelamento_pendente",
          motivo_cancelamento: motivo,
          metadata: {
            ...(invoice.metadata ?? {}),
            cancel_requested_at: new Date().toISOString(),
            cancel_error: null,
          },
        })
        .eq("id", invoice.id)
        .eq("organization_id", organizationId ?? "");
      if (updateErr) throw updateErr;

      const cancelWebhookUrl = notaasConfig.cancel_webhook_url?.trim() || notaasConfig.n8n_webhook_url?.trim();

      if (invoice.notaas_id && cancelWebhookUrl) {
        try {
          const res = await fetch(cancelWebhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              _action:         "cancelar",
              invoice_id:      invoice.id,
              organization_id: organizationId,
              notaas_id:       invoice.notaas_id,
              numero:          invoice.numero ?? null,
              motivo,
            }),
            signal: AbortSignal.timeout(30_000),
          });
          if (!res.ok) {
            const text = await res.text().catch(() => "");
            const errMsg = `Webhook ${res.status}: ${text.slice(0, 300)}`;
            await supabase.from("invoices").update({
              status: "cancelamento_erro",
              erro_mensagem: errMsg,
            }).eq("id", invoice.id);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await supabase.from("invoices").update({
            status: "cancelamento_erro",
            erro_mensagem: msg,
          }).eq("id", invoice.id);
        }
      } else if (invoice.notaas_id) {
        try {
          await cancelarNFSe(notaasConfig, invoice.notaas_id, motivo);
          // Sucesso direto via Edge Function — marca como cancelada
          await supabase.from("invoices").update({
            status: "cancelada",
            cancelada_em: new Date().toISOString(),
            erro_mensagem: null,
          }).eq("id", invoice.id);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await supabase.from("invoices").update({
            status: "cancelamento_erro",
            erro_mensagem: msg,
          }).eq("id", invoice.id);
        }
      }
      // Sem notaas_id: nota nunca chegou à Notaas, cancela direto
      else {
        await supabase.from("invoices").update({
          status: "cancelada",
          cancelada_em: new Date().toISOString(),
        }).eq("id", invoice.id);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices", organizationId], exact: false });
      qc.invalidateQueries({ queryKey: ["payments_pending_invoice", organizationId] });
    },
  });

  const cancel = useMutation({
    mutationFn: async ({
      invoice,
      motivo,
      notaasConfig,
    }: {
      invoice: Invoice;
      motivo: string;
      notaasConfig: NotaasConfig;
    }) => {
      if (!invoice.notaas_id) throw new Error("Invoice sem ID Notaas para cancelamento.");

      // 1. Marca como cancelamento_pendente imediatamente
      const { error: updateErr } = await supabase
        .from("invoices")
        .update({
          status: "cancelamento_pendente",
          motivo_cancelamento: motivo,
          metadata: {
            ...(invoice.metadata ?? {}),
            cancel_requested_at: new Date().toISOString(),
            cancel_error: null,
          },
        })
        .eq("id", invoice.id)
        .eq("organization_id", organizationId ?? "");
      if (updateErr) throw updateErr;

      const cancelWebhookUrl = notaasConfig.cancel_webhook_url?.trim() || notaasConfig.n8n_webhook_url?.trim();

      if (cancelWebhookUrl) {
        try {
          const res = await fetch(cancelWebhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              _action:         "cancelar",
              invoice_id:      invoice.id,
              organization_id: organizationId,
              notaas_id:       invoice.notaas_id,
              numero:          invoice.numero ?? null,
              motivo,
            }),
            signal: AbortSignal.timeout(30_000),
          });
          if (!res.ok) {
            const text = await res.text().catch(() => "");
            const errMsg = `Webhook ${res.status}: ${text.slice(0, 300)}`;
            await supabase.from("invoices").update({
              status: "cancelamento_erro",
              erro_mensagem: errMsg,
            }).eq("id", invoice.id);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await supabase.from("invoices").update({
            status: "cancelamento_erro",
            erro_mensagem: msg,
          }).eq("id", invoice.id);
        }
      } else {
        // Fallback: Edge Function diretamente
        try {
          await cancelarNFSe(notaasConfig, invoice.notaas_id, motivo);
          await supabase.from("invoices").update({
            status: "cancelada",
            cancelada_em: new Date().toISOString(),
            erro_mensagem: null,
          }).eq("id", invoice.id);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await supabase.from("invoices").update({
            status: "cancelamento_erro",
            erro_mensagem: msg,
          }).eq("id", invoice.id);
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices", organizationId], exact: false });
    },
  });

  // ── Função: emissão automática (best-effort, fire-and-forget) ─────────────
  /**
   * Emite NFS-e automaticamente ao confirmar pagamento.
   * - Verifica duplicata antes de criar novo Invoice
   * - Usa defaults das settings quando não há contrato vinculado
   * - Falhas não propagam exceção (não revertem confirmação do pagamento)
   */
  const autoEmit = async ({
    paymentId,
    paidAt,
    client,
    contractType,
    notaasConfig,
    contractId,
    paymentValue,
  }: {
    paymentId: string;
    paidAt: string;
    client: Client;
    contractType?: string | null;
    notaasConfig: NotaasConfig;
    contractId?: string | null;
    paymentValue: number;
  }): Promise<void> => {
    if (!organizationId) return;
    if (!notaasConfig.api_key) return;

    try {
      // Verifica se já existe Invoice ativo para este pagamento
      const { data: existing } = await supabase
        .from("invoices")
        .select("id, status")
        .eq("organization_id", organizationId)
        .eq("payment_id", paymentId)
        .not("status", "in", '("rejeitada","cancelada")')
        .maybeSingle();

      if (existing) {
        console.warn(`[useInvoices] autoEmit: Invoice ativo já existe para payment_id=${paymentId}, ignorando.`);
        return;
      }

      const codigoServico = resolveCodigoServico(contractType, notaasConfig);
      const descricaoServico = notaasConfig.descricao_servico_padrao ?? "Prestação de serviços";
      const competencia = deriveCompetencia(paidAt);

      await emit.mutateAsync({
        formData: {
          client_id:         client.id,
          contract_id:       contractId ?? undefined,
          payment_id:        paymentId,
          valor_servico:     paymentValue,
          codigo_servico:    codigoServico,
          descricao_servico: descricaoServico,
          competencia,
          aliquota_iss:      notaasConfig.aliquota_iss_padrao ?? 5,
        },
        client,
        notaasConfig,
      });
    } catch (err) {
      // best-effort: log mas não propaga
      console.warn("[useInvoices] autoEmit falhou (best-effort):", err);
    }
  };

  return { ...query, emit, cancel, resetToPending, syncStatus, cancelProcessando, sendInvoice, deleteInvoice, autoEmit };
}
