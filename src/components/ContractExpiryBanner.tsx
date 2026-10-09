import { AlertTriangle } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  contractEnd: string; // ISO date string
}

/**
 * Banner de aviso exibido quando o contrato do tenant vence em ≤ 30 dias.
 * Nunca exibido para o Support_User (role='support').
 */
export function ContractExpiryBanner({ contractEnd }: Props) {
  const formatted = format(parseISO(contractEnd), "dd/MM/yyyy", { locale: ptBR });

  return (
    <div className="flex items-center gap-3 rounded-xl border border-yellow-500/40 bg-yellow-500/10 px-5 py-3 text-yellow-300">
      <AlertTriangle className="h-5 w-5 text-yellow-400 shrink-0" />
      <div>
        <p className="text-sm font-black uppercase tracking-wide text-yellow-400">
          Contrato próximo do vencimento
        </p>
        <p className="text-xs text-yellow-300/80">
          Seu contrato vence em <span className="font-bold">{formatted}</span>.
          Entre em contato com a agência para renovação.
        </p>
      </div>
    </div>
  );
}
