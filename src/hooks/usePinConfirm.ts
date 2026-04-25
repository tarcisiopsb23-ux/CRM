/**
 * usePinConfirm
 * Hook reutilizável para exigir PIN de 8 dígitos antes de executar ações destrutivas.
 *
 * Uso:
 *   const { pinProps, requirePin } = usePinConfirm();
 *   // No JSX: <PinAuthDialog {...pinProps} />
 *   // Para exigir PIN: requirePin("Título", "Descrição", async () => { ... ação ... });
 */
import { useState } from "react";

interface PinConfirmState {
  open: boolean;
  title: string;
  description: string;
  action: (() => Promise<void>) | null;
}

export function usePinConfirm() {
  const [state, setState] = useState<PinConfirmState>({
    open: false,
    title: "",
    description: "",
    action: null,
  });

  const requirePin = (
    title: string,
    description: string,
    action: () => Promise<void>
  ) => {
    setState({ open: true, title, description, action });
  };

  const pinProps = {
    open: state.open,
    onOpenChange: (open: boolean) => setState((s) => ({ ...s, open })),
    title: state.title,
    description: state.description,
    onConfirm: async () => {
      if (state.action) await state.action();
    },
  };

  return { pinProps, requirePin };
}
