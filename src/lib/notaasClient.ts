/**
 * notaasClient.ts
 * Cliente HTTP para a API Notaas (emissão de NFS-e).
 * Todas as chamadas são roteadas via Edge Function `notaas-emit`
 * para evitar exposição da api_key no frontend e problemas de CORS.
 *
 * Autenticação: header x-api-key (enviado server-side pela Edge Function)
 */

import { supabase } from "@/lib/supabase";
import type { NotaasConfig, EmitirNFSePayload, NotaasEmissaoResponse } from "@/types/fiscal";

/**
 * Retorna a URL base da API Notaas conforme o modo configurado.
 * Mantido para compatibilidade com testes unitários.
 */
export function getBaseUrl(sandboxMode: boolean): string {
  return sandboxMode
    ? "https://app.notaas.com.br" // sandbox usa mesma URL, diferenciado pela api_key
    : "https://app.notaas.com.br";
}

/**
 * Emite uma NFS-e via Edge Function `notaas-emit` (server-side).
 * Lança erro com a mensagem retornada pela API em caso de falha.
 */
export async function emitirNFSe(
  config: NotaasConfig,
  payload: EmitirNFSePayload
): Promise<NotaasEmissaoResponse> {
  const apiKey = config.api_key?.trim();
  if (!apiKey) throw new Error("API Key da Notaas não configurada.");

  const body = {
    action:  "emitir",
    api_key: apiKey,
    sandbox: config.sandbox_mode ?? false,
    payload: {
      tomador: {
        cnpj: payload.tomador.cnpj_cpf,
        nome: payload.tomador.nome,
        email: payload.tomador.email,
        endereco: payload.tomador.endereco,
      },
      servico: {
        codigo:    payload.servico.codigo,
        descricao: payload.servico.descricao,
      },
      valores: {
        total:       payload.valores.total,
        aliquotaIss: payload.valores.aliquotaIss,
      },
      competencia: payload.competencia,
    },
  };

  const { data, error } = await supabase.functions.invoke("notaas-emit", { body });

  if (error) throw new Error(error.message ?? "Erro ao chamar Edge Function notaas-emit");

  const res = data as Record<string, unknown>;

  // A Edge Function repassa o status HTTP da Notaas — se vier mensagem de erro, lança
  if (res.error || res.message) {
    const msg = (res.message as string) || (res.error as string) || "Erro na emissão da NFS-e";
    throw new Error(msg);
  }

  return {
    id:         String(res.id ?? ""),
    protocol:   res.protocol  as string | undefined,
    numero:     res.numero    as string | undefined,
    pdf_url:    res.pdf_url   as string | undefined,
    xml_url:    res.xml_url   as string | undefined,
    emitida_em: res.emitida_em as string | undefined,
  };
}

/**
 * Cancela uma NFS-e via Edge Function `notaas-emit` (server-side).
 * Lança erro com a mensagem retornada pela API em caso de falha.
 */
export async function cancelarNFSe(
  config: NotaasConfig,
  notaasId: string,
  motivo: string
): Promise<void> {
  const apiKey = config.api_key?.trim();
  if (!apiKey) throw new Error("API Key da Notaas não configurada.");

  const { data, error } = await supabase.functions.invoke("notaas-emit", {
    body: {
      action:    "cancelar",
      api_key:   apiKey,
      sandbox:   config.sandbox_mode ?? false,
      notaas_id: notaasId,
      motivo,
    },
  });

  if (error) throw new Error(error.message ?? "Erro ao chamar Edge Function notaas-emit");

  const res = data as Record<string, unknown>;
  if (res.error || res.message) {
    const msg = (res.message as string) || (res.error as string) || "Erro no cancelamento da NFS-e";
    throw new Error(msg);
  }
}
