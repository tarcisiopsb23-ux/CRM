/**
 * useCepLookup
 *
 * Hook React para consulta automática de endereço por CEP.
 *
 * Uso:
 *   const { lookup, loading, error, result } = useCepLookup();
 *
 *   // Ao sair do campo CEP:
 *   await lookup(cepValue);
 *
 *   // Preencher os campos automaticamente:
 *   if (result) {
 *     setStreet(result.street);
 *     setCity(result.city);
 *     ...
 *   }
 */

import { useState, useCallback } from "react";
import { lookupCep, normalizeCep, isValidCep, type CepResult, type CepLookupError } from "@/lib/cep-service";

interface UseCepLookupReturn {
  /** Resultado da última consulta bem-sucedida */
  result:  CepResult | null;
  /** true enquanto a consulta está em andamento */
  loading: boolean;
  /** Mensagem de erro da última consulta falha, ou null */
  error:   string | null;
  /** Código do erro estruturado */
  errorCode: CepLookupError | null;
  /** Executa a consulta. Resolve com o resultado ou null em caso de erro. */
  lookup:  (cep: string) => Promise<CepResult | null>;
  /** Limpa resultado e erros */
  reset:   () => void;
}

export function useCepLookup(): UseCepLookupReturn {
  const [result,    setResult]    = useState<CepResult | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<CepLookupError | null>(null);

  const lookup = useCallback(async (raw: string): Promise<CepResult | null> => {
    const cep = normalizeCep(raw);

    // Não faz nada se o CEP ainda está incompleto
    if (!isValidCep(cep)) {
      setError("CEP inválido. Informe 8 dígitos.");
      setErrorCode("invalid_cep");
      setResult(null);
      return null;
    }

    setLoading(true);
    setError(null);
    setErrorCode(null);
    setResult(null);

    try {
      const data = await lookupCep(cep);
      setResult(data);
      return data;
    } catch (err: any) {
      setError(err?.message ?? "Erro ao consultar CEP.");
      setErrorCode(err?.code ?? "unavailable");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    setErrorCode(null);
    setLoading(false);
  }, []);

  return { result, loading, error, errorCode, lookup, reset };
}
