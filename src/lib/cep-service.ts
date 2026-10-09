/**
 * cep-service
 *
 * Serviço desacoplado de consulta de CEP brasileiro.
 * Usa a API pública ViaCEP (https://viacep.com.br).
 *
 * Não contém lógica de UI — apenas a chamada HTTP e tratamento de erros.
 * Use o hook useCepLookup para integração com React.
 */

export interface CepResult {
  zip_code:     string;   // CEP normalizado (apenas dígitos)
  street:       string;   // logradouro
  complement:   string;   // complemento
  neighborhood: string;   // bairro
  city:         string;   // cidade
  state:        string;   // UF (2 chars)
  ibge:         string;   // código IBGE (para referência)
}

export type CepLookupError =
  | "invalid_cep"     // CEP com formato inválido
  | "not_found"       // CEP não encontrado
  | "timeout"         // timeout na requisição
  | "unavailable"     // API indisponível
  | "incomplete";     // resposta sem logradouro/cidade

const VIACEP_URL = "https://viacep.com.br/ws";
const TIMEOUT_MS = 5_000;

/**
 * Normaliza um CEP removendo qualquer caractere que não seja dígito.
 */
export function normalizeCep(raw: string): string {
  return raw.replace(/\D/g, "");
}

/**
 * Valida se o CEP tem exatamente 8 dígitos.
 */
export function isValidCep(cep: string): boolean {
  return /^\d{8}$/.test(normalizeCep(cep));
}

/**
 * Formata um CEP para exibição: "01310-100"
 */
export function formatCep(cep: string): string {
  const digits = normalizeCep(cep);
  if (digits.length !== 8) return cep;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

/**
 * Consulta o endereço de um CEP brasileiro.
 *
 * @returns CepResult em caso de sucesso
 * @throws { code: CepLookupError; message: string } em caso de erro
 */
export async function lookupCep(raw: string): Promise<CepResult> {
  const cep = normalizeCep(raw);

  if (!isValidCep(cep)) {
    throw { code: "invalid_cep" as CepLookupError, message: "CEP inválido. Informe 8 dígitos." };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${VIACEP_URL}/${cep}/json/`, {
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      throw { code: "unavailable" as CepLookupError, message: "Serviço de CEP indisponível." };
    }

    const json = await res.json();

    // ViaCEP retorna { erro: true } quando o CEP não existe
    if (json.erro === true || json.erro === "true") {
      throw { code: "not_found" as CepLookupError, message: "CEP não encontrado." };
    }

    // Resposta mínima: cidade e estado obrigatórios
    if (!json.localidade || !json.uf) {
      throw { code: "incomplete" as CepLookupError, message: "Resposta incompleta do serviço de CEP." };
    }

    return {
      zip_code:     cep,
      street:       json.logradouro   ?? "",
      complement:   json.complemento  ?? "",
      neighborhood: json.bairro       ?? "",
      city:         json.localidade   ?? "",
      state:        json.uf           ?? "",
      ibge:         json.ibge         ?? "",
    };

  } catch (err: any) {
    clearTimeout(timer);

    // Re-lança erros já estruturados
    if (err?.code) throw err;

    // AbortController abort = timeout
    if (err?.name === "AbortError") {
      throw { code: "timeout" as CepLookupError, message: "Tempo esgotado ao consultar CEP." };
    }

    // Erro de rede (sem conexão, CORS, etc.)
    throw { code: "unavailable" as CepLookupError, message: "Não foi possível consultar o CEP. Verifique sua conexão." };
  }
}
