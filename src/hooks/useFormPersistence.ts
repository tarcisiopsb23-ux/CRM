import { useState, useEffect, useCallback } from 'react';

/**
 * Hook para persistir estado de formulário no sessionStorage.
 *
 * @param key - Chave única para identificar o formulário (ex: "form_lead_new")
 * @param initialValue - Valor inicial caso não haja dado persistido
 * @returns [state, setState, clear]
 *   - state: valor atual
 *   - setState: atualiza o estado e persiste no sessionStorage
 *   - clear: remove a chave do sessionStorage e reseta para initialValue
 */
function useFormPersistence<T>(
  key: string,
  initialValue: T
): [T, (v: T) => void, () => void] {
  const readFromStorage = useCallback((): T => {
    try {
      const raw = sessionStorage.getItem(key);
      if (raw !== null) {
        return JSON.parse(raw) as T;
      }
    } catch {
      // sessionStorage indisponível ou JSON inválido — degradação graciosa
    }
    return initialValue;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const [state, setStateInternal] = useState<T>(readFromStorage);

  const setState = useCallback(
    (v: T) => {
      setStateInternal(v);
      try {
        sessionStorage.setItem(key, JSON.stringify(v));
      } catch {
        // sessionStorage indisponível — continua sem persistência
      }
    },
    [key]
  );

  const clear = useCallback(() => {
    setStateInternal(initialValue);
    try {
      sessionStorage.removeItem(key);
    } catch {
      // sessionStorage indisponível
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Limpar em refresh (beforeunload)
  useEffect(() => {
    const handleBeforeUnload = () => {
      try {
        sessionStorage.removeItem(key);
      } catch {
        // sessionStorage indisponível
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [key]);

  // Limpar ao navegar para trás (popstate)
  useEffect(() => {
    const handlePopState = () => {
      try {
        sessionStorage.removeItem(key);
      } catch {
        // sessionStorage indisponível
      }
      setStateInternal(initialValue);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return [state, setState, clear];
}

export default useFormPersistence;
