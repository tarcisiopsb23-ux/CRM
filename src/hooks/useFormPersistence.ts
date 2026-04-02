import { useState, useCallback } from 'react';

/**
 * Hook para persistir estado de formulário no localStorage.
 *
 * Usa localStorage para que os dados sobrevivam a trocas de aba,
 * minimização de janela e alternância entre programas.
 *
 * @param key - Chave única para identificar o formulário (ex: "form_lead_new")
 * @param initialValue - Valor inicial caso não haja dado persistido
 * @returns [state, setState, clear]
 *   - state: valor atual
 *   - setState: atualiza o estado e persiste no localStorage (aceita valor ou função updater)
 *   - clear: remove a chave do localStorage e reseta para initialValue
 */
function useFormPersistence<T>(
  key: string,
  initialValue: T
): [T, (v: T | ((prev: T) => T)) => void, () => void] {
  const readFromStorage = (): T => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) {
        return JSON.parse(raw) as T;
      }
    } catch {
      // localStorage indisponível ou JSON inválido — degradação graciosa
    }
    return initialValue;
  };

  const [state, setStateInternal] = useState<T>(readFromStorage);

  const setState = useCallback(
    (v: T | ((prev: T) => T)) => {
      setStateInternal((prev) => {
        const next = typeof v === 'function' ? (v as (prev: T) => T)(prev) : v;
        try {
          localStorage.setItem(key, JSON.stringify(next));
        } catch {
          // localStorage indisponível — continua sem persistência
        }
        return next;
      });
    },
    [key]
  );

  const clear = useCallback(() => {
    setStateInternal(initialValue);
    try {
      localStorage.removeItem(key);
    } catch {
      // localStorage indisponível
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return [state, setState, clear];
}

export default useFormPersistence;
